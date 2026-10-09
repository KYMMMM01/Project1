import { describe, expect, it } from 'vitest';
import type { EnemyId } from '@/game/api';
import { AWAKEN_MIN_TIER, LASER_DURATION, SYNERGY_MIN_RANK, SYNERGY_TIER_AT, TICK } from '@/game/data/balance';
import { SYNERGY, SYNERGY_SPECIAL, synergyTier, tierForDistinct } from '@/game/data/classes';
import { unitSpec } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { applyStatus, damageEnemy } from '@/game/sim/enemies';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record } from './simHelpers';

/** A frozen enemy standing at a chosen spot (it never walks, so the spot stays). */
function at(sim: Sim, id: EnemyId, x: number, y: number, hp = 1e9, travelled = 100): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  e.x = x;
  e.y = y;
  return e;
}

function field(level = 1): Sim {
  const sim = newSim({}, level);
  quietWave(sim);
  return sim;
}

/** The warriors' four counting kinds, in the top-left corner of the board. */
function warriors(sim: Sim): void {
  put(sim, 0, 'w_sword');
  put(sim, 1, 'w_viking');
  put(sim, 5, 'w_samurai');
  put(sim, 6, 'w_tiger');
}

describe('what counts toward a synergy (rules v1.4)', () => {
  it('starts counting at the second rank, so the third step takes all four of the other ranks', () => {
    expect(SYNERGY_MIN_RANK).toBe(1);
    expect(SYNERGY_TIER_AT).toEqual([2, 3, 4]);
    expect(AWAKEN_MIN_TIER).toBe(1);
    expect([0, 1, 2, 3, 4].map(tierForDistinct)).toEqual([0, 0, 1, 2, 3]);
    const sim = newSim();
    for (const [i, id] of (['m_snow', 'm_snow', 'm_fire', 'm_storm', 'm_frost'] as const).entries()) put(sim, i, id);
    // A kitten, a rare, an epic and a legendary: three kinds count, and the guardian is still missing.
    expect(sim.classDistinct('mage')).toBe(3);
    expect(sim.synergyTier('mage')).toBe(2);
    put(sim, 5, 'm_cosmo');
    expect(sim.classDistinct('mage')).toBe(4);
    expect(sim.synergyTier('mage')).toBe(3);
  });

  it('lets a legendary awaken from step 1 (two kinds) on, and the guardian then completes the fourth kind', () => {
    const sim = newSim();
    put(sim, 1, 'r_gunner');
    put(sim, 2, 'r_sling');
    sim.purr = 12;
    // The kitten does not count: a legendary and a kitten are one kind.
    expect(sim.synergyTier('ranger')).toBe(0);
    expect(sim.canAwaken(1)).toBe('synergy_too_low');
    put(sim, 0, 'r_archer');
    expect(sim.synergyTier('ranger')).toBe(1);
    expect(sim.canAwaken(1)).toBeNull();
    expect(sim.awaken(1)).toBeNull();
    // The guardian took the legendary's place: a rare and a guardian are two kinds; an epic and a second legendary make four.
    expect(sim.classDistinct('ranger')).toBe(2);
    put(sim, 4, 'r_ninja');
    expect(sim.synergyTier('ranger')).toBe(2);
    put(sim, 5, 'r_gunner');
    expect(sim.classDistinct('ranger')).toBe(4);
    expect(sim.synergyTier('ranger')).toBe(3);
  });
});

describe('the steps of every class', () => {
  it('weakens steps 1 and 2 against v1.3 and keeps the tricksters exactly as they were', () => {
    const before = {
      warrior: [{ damage: 0.15 }, { damage: 0.36, armorIgnore: 0.2 }],
      ranger: [{ crit: 0.07 }, { crit: 0.15, critMult: 0.3 }],
      mage: [{ damage: 0.15 }, { damage: 0.36, statusMult: 0.25 }],
    } as const;
    for (const [id, steps] of Object.entries(before)) {
      steps.forEach((old, i) => {
        const now = SYNERGY[id as keyof typeof before][i] as unknown as Record<string, number>;
        for (const [key, value] of Object.entries(old)) expect(now[key], `${id} step ${i + 1} ${key}`).toBeLessThan(value);
      });
    }
    expect(SYNERGY.trickster.map((s) => [s.speed, s.rewardMult])).toEqual([[0.05, 0], [0.1, 0.12], [0.17, 0.3]]);
  });

  it('gives the rangers\' third step damage for rangers, +20 points of crit chance and +10% crit damage for every cat', () => {
    const third = synergyTier('ranger', 3);
    expect(third).toMatchObject({ damage: 0.3, crit: 0.2, critMult: 0.1 });
    const sim = field();
    const paw = put(sim, 10, 'w_paw');
    const mage = put(sim, 11, 'm_snow');
    put(sim, 0, 'r_archer');
    put(sim, 1, 'r_ninja');
    put(sim, 2, 'r_gunner');
    put(sim, 3, 'r_star');
    expect(sim.synergyTier('ranger')).toBe(3);
    const archer = sim.units[0]!;
    expect(archer.stats.damage).toBeCloseTo(unitSpec('r_archer').base.damage * 1.3, 9);
    for (const u of [archer, paw, mage]) {
      expect(u.stats.crit, u.id).toBeCloseTo(unitSpec(u.id).base.crit + 0.2, 9);
      expect(u.stats.critMult, u.id).toBeCloseTo(unitSpec(u.id).base.critMult + 0.1, 9);
    }
    // The damage bonus stays with the rangers.
    expect(paw.stats.damage).toBeCloseTo(unitSpec('w_paw').base.damage, 9);
    expect(mage.stats.damage).toBeCloseTo(unitSpec('m_snow').base.damage, 9);
  });

  it('lets the warriors\' armour ignore reach every cat (a ranger hurts a roomba more) and keeps the damage with the warriors', () => {
    const sim = field();
    const sling = put(sim, 12, 'r_sling');
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_viking');
    put(sim, 2, 'w_samurai');
    expect(sim.synergyTier('warrior')).toBe(2);
    expect(sling.armorIgnore).toBeCloseTo(0.15, 9);
    expect(sling.stats.damage).toBeCloseTo(unitSpec('r_sling').base.damage, 9);
    const roomba = foe(sim, 'roomba', 0, 1e5);
    damageEnemy(sim, roomba, 100, 'physical', sling, false, null);
    expect(1e5 - roomba.hp).toBeCloseTo(100 * (1 - 0.35 * 0.85), 9);
  });

  it('keeps the class damage bonus of the warriors and the mages with their own class', () => {
    const sim = field();
    const sling = put(sim, 12, 'r_sling');
    const snow = put(sim, 13, 'm_snow');
    warriors(sim);
    expect(sim.synergyTier('warrior')).toBe(3);
    expect(sim.units[0]!.stats.damage).toBeCloseTo(unitSpec('w_sword').base.damage * 1.65, 9);
    expect(sling.stats.damage).toBeCloseTo(unitSpec('r_sling').base.damage, 9);
    expect(snow.stats.damage).toBeCloseTo(unitSpec('m_snow').base.damage, 9);
    expect(sling.armorIgnore).toBeCloseTo(0.3, 9);
  });
});

describe('the war cry of the warriors (step 3)', () => {
  it('roars every 7 seconds while an enemy stands in a warrior\'s range: stun, armour break, an event per roaring warrior', () => {
    const sim = field();
    warriors(sim);
    expect(sim.special[0]).toBe(1);
    const cry = SYNERGY_SPECIAL.warrior;
    const roars = record(sim, 'special');
    const e = at(sim, 'cucumber', cellCenterX(6) + 120, cellCenterY(6));
    sim.step(TICK);
    const first = roars.filter((r) => r.kind === 'cry');
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first.every((r) => r.classId === 'warrior' && r.points.some((p) => p.uid === e.uid))).toBe(true);
    expect(e.stunned).toBe(true);
    expect(e.stunUntil - sim.time).toBeCloseTo(cry.stun, 1);
    expect(e.armorBroken).toBe(true);
    expect(e.breakAmount).toBeGreaterThanOrEqual(cry.breakAmount);
    const count = roars.length;
    advance(sim, cry.every - 0.5);
    expect(roars).toHaveLength(count);
    advance(sim, 0.7);
    expect(roars.length).toBeGreaterThan(count);
  });

  it('waits ready when nobody is in range, goes off at once when somebody is, and halves the stun on elites and spares bosses', () => {
    const sim = field();
    warriors(sim);
    const roars = record(sim, 'special');
    advance(sim, 10);
    expect(roars).toHaveLength(0);
    const elite = at(sim, 'firecracker', cellCenterX(6) + 100, cellCenterY(6));
    const boss = at(sim, 'boss_cloud', cellCenterX(6) + 100, cellCenterY(6) + 20);
    sim.step(TICK);
    expect(roars.length).toBeGreaterThan(0);
    expect(elite.stunUntil - sim.time).toBeCloseTo(SYNERGY_SPECIAL.warrior.stun / 2, 1);
    expect(boss.stunned).toBe(false);
    expect(boss.armorBroken).toBe(true);
  });

  it('is off below the third step: three kinds make no roar', () => {
    const sim = field();
    put(sim, 0, 'w_sword');
    put(sim, 1, 'w_viking');
    put(sim, 5, 'w_samurai');
    expect(sim.special[0]).toBe(0);
    const roars = record(sim, 'special');
    at(sim, 'cucumber', cellCenterX(5) + 100, cellCenterY(5));
    advance(sim, 10);
    expect(roars).toHaveLength(0);
  });
});

describe('the sure shot of the rangers (step 3)', () => {
  it('makes every 5th shot of a ranger a crit, whatever the dice say, and no other shot', () => {
    const sim = field();
    put(sim, 0, 'r_archer');
    put(sim, 1, 'r_ninja');
    put(sim, 2, 'r_gunner');
    put(sim, 3, 'r_star');
    expect(sim.synergyTier('ranger')).toBe(3);
    expect(sim.units[0]!.sureCritEvery).toBe(SYNERGY_SPECIAL.ranger.every);
    // Dice that never crit: only the sure shots can.
    sim.rng.combat.next = () => 0.999;
    at(sim, 'cucumber', cellCenterX(0) + 150, cellCenterY(0), 1e9, 200);
    const hits = record(sim, 'hit');
    advance(sim, 9);
    const archer = hits.filter((h) => h.unitId === 'r_archer');
    expect(archer.length).toBeGreaterThanOrEqual(10);
    archer.slice(0, 10).forEach((h, i) => expect(h.crit, `shot ${i + 1}`).toBe((i + 1) % 5 === 0));
  });

  it('does not touch the other classes, and is off below the third step', () => {
    const sim = field();
    const paw = put(sim, 10, 'w_paw');
    put(sim, 0, 'r_archer');
    put(sim, 1, 'r_ninja');
    put(sim, 2, 'r_gunner');
    expect(sim.units[0]!.sureCritEvery).toBe(0);
    put(sim, 3, 'r_star');
    expect(sim.units[0]!.sureCritEvery).toBe(5);
    expect(paw.sureCritEvery).toBe(0);
  });
});

describe('the arcane burst of the mages (step 3)', () => {
  const mages = (sim: Sim): void => {
    put(sim, 0, 'm_fire');
    put(sim, 1, 'm_storm');
    put(sim, 5, 'm_frost');
    put(sim, 6, 'm_cosmo');
  };
  const far = (sim: Sim, id: EnemyId, dx: number, hp: number): SimEnemy => at(sim, id, 640 + dx, 630, hp);

  it('bursts an enemy that falls with a magic status: the others around it take a share of its maximum health, once', () => {
    const sim = field();
    mages(sim);
    expect(sim.synergyTier('mage')).toBe(3);
    const burst = SYNERGY_SPECIAL.mage;
    const dying = far(sim, 'cucumber', 0, 100);
    applyStatus(sim, dying, 'slow', 0.2, 5, null);
    const near = far(sim, 'cucumber', 40, 1e6);
    const second = far(sim, 'cucumber', 40 + 40, 6);
    applyStatus(sim, second, 'poison', 1, 5, null);
    const outside = far(sim, 'cucumber', -200, 1e6);
    const events = record(sim, 'special');
    damageEnemy(sim, dying, 1e6, 'magic', null, false, null);
    expect(near.hp).toBe(1e6);
    sim.step(TICK);
    expect(near.hp).toBeCloseTo(1e6 - 100 * burst.pct, 6);
    expect(outside.hp).toBe(1e6);
    expect(events.filter((e) => e.kind === 'shatter')).toHaveLength(1);
    expect(events[0]!.points.map((p) => p.uid).sort()).toEqual([near.uid, second.uid].sort());
    // The one the burst fell on had a status too, but a burst does not set off another one.
    expect(second.dead).toBe(true);
    expect(near.hp).toBeCloseTo(1e6 - 100 * burst.pct, 6);
  });

  it('leaves alone an enemy without a status, elites and bosses, and a team below the third step', () => {
    const sim = field();
    mages(sim);
    const events = record(sim, 'special');
    const plain = far(sim, 'cucumber', 0, 100);
    const next = far(sim, 'cucumber', 30, 1e6);
    damageEnemy(sim, plain, 1e6, 'magic', null, false, null);
    const elite = far(sim, 'firecracker', 0, 100);
    applyStatus(sim, elite, 'slow', 0.2, 5, null);
    damageEnemy(sim, elite, 1e6, 'magic', null, false, null);
    sim.step(TICK);
    expect(events).toHaveLength(0);
    expect(next.hp).toBe(1e6);

    const low = field();
    put(low, 0, 'm_fire');
    put(low, 1, 'm_storm');
    put(low, 5, 'm_frost');
    expect(low.special[2]).toBe(0);
    const a = far(low, 'cucumber', 0, 100);
    applyStatus(low, a, 'slow', 0.2, 5, null);
    const b = far(low, 'cucumber', 30, 1e6);
    damageEnemy(low, a, 1e6, 'magic', null, false, null);
    low.step(TICK);
    expect(b.hp).toBe(1e6);
  });
});

describe('the play time of the tricksters (step 3)', () => {
  it('makes every cat attack 40% faster while the laser pointer is on, and only then', () => {
    const sim = field();
    put(sim, 0, 't_bell');
    put(sim, 1, 't_bard');
    put(sim, 5, 't_alch');
    put(sim, 6, 't_lucky');
    expect(sim.synergyTier('trickster')).toBe(3);
    const paw = put(sim, 24, 'w_paw');
    const base = unitSpec('w_paw').base.interval;
    const idle = paw.stats.interval;
    const speed = base / idle - 1;
    expect(sim.setLaser(300, 300)).toBeNull();
    sim.step(TICK);
    expect(paw.stats.interval).toBeCloseTo(base / (1 + speed + SYNERGY_SPECIAL.trickster.speed), 9);
    advance(sim, LASER_DURATION + 0.1);
    expect(sim.laser.active).toBe(false);
    expect(paw.stats.interval).toBeCloseTo(idle, 9);
  });

  it('does not give the bonus to a team of three kinds', () => {
    const sim = field();
    put(sim, 0, 't_bell');
    put(sim, 1, 't_bard');
    put(sim, 5, 't_alch');
    const paw = put(sim, 24, 'w_paw');
    const idle = paw.stats.interval;
    expect(sim.synergyTier('trickster')).toBe(2);
    sim.setLaser(300, 300);
    sim.step(TICK);
    expect(paw.stats.interval).toBeCloseTo(idle, 9);
  });
});

describe('the scripted tutorial teaches the synergy', () => {
  it('leaves a rare ranger and the merged sword on the board, so an epic of either class makes two kinds', () => {
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]) {
      const sim = newSim({ mode: 'tutorial', seed });
      for (let i = 0; i < 3; i++) sim.summon();
      const cells = sim.units.map((u, c) => (u ? c : -1)).filter((c) => c >= 0);
      const paws = cells.filter((c) => sim.units[c]!.id === 'w_paw');
      expect(paws).toHaveLength(2);
      expect(sim.drop(paws[0] as number, paws[1] as number)).toBeNull();
      expect(sim.units.filter(Boolean).map((u) => u!.id).sort()).toEqual(['r_archer', 'w_sword']);
      advance(sim, 3.1 + 12 * 2 + 0.3);
      expect(sim.phase, `seed ${seed}`).toBe('choice');
      const options = sim.pending!.kind === 'summon' ? sim.pending!.options : [];
      const useful = options.findIndex((id) => unitSpec(id).classId === 'warrior' || unitSpec(id).classId === 'ranger');
      expect(useful, `seed ${seed}: no warrior or ranger epic among ${options.join(', ')}`).toBeGreaterThanOrEqual(0);
      expect(sim.pickSummon(useful)).toBeNull();
      const classId = unitSpec(options[useful]!).classId;
      expect(sim.synergyTier(classId), `seed ${seed}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('a spent snapshot', () => {
  it('is refused cleanly when the rules changed: the run starts afresh and nothing throws', async () => {
    const { SIM_VERSION, parseSnapshot } = await import('@/game/sim/snapshot');
    const { createBattle } = await import('@/game/sim/create');
    const { initOf } = await import('./simHelpers');
    expect(SIM_VERSION).toBe(3);
    const init = initOf({ seed: 77 });
    const sim = createBattle(init);
    sim.summon();
    advance(sim as Sim, 3.2);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    expect(snap!.simVersion).toBe(3);
    expect(createBattle(init, snap!)).not.toBeNull();
    const old = { ...snap!, simVersion: 2 };
    expect(parseSnapshot(old)).toBeNull();
    expect(createBattle(init, old)).toBeNull();
    // A wave-start save of the 5 x 4 board holds 20 cats and is refused by its size as well.
    const data = JSON.parse(snap!.data) as { units: unknown[] };
    data.units = data.units.slice(0, 20);
    expect(parseSnapshot({ ...snap!, data: JSON.stringify(data) })).toBeNull();
    const fresh = createBattle(init, old) ?? createBattle(init);
    expect(fresh.phase).toBe('prep');
  });
});
