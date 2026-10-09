/**
 * Armour of the ordinary enemies and slow resistance (2026-10-10 batch, rules §9 and §11): every enemy's numbers as a table, the
 * slow rule `min(amount x (1 + toy boost), cap) x (1 - resist)` through applyStatus and through the cats that call it, and what the
 * resistance must leave alone (freeze, stun, the black hole, the global walk slow of the nap blanket, every other status).
 */
import { describe, expect, it } from 'vitest';
import { ENEMY_IDS, type BattleApi, type EnemyId } from '@/game/api';
import { SLOW_CAP, SLOW_CAP_BOSS } from '@/game/data/balance';
import { ENEMY_SPECS } from '@/game/data/enemies';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { applyStatus, damageEnemy, pullEnemy } from '@/game/sim/enemies';
import { gainRelic } from '@/game/sim/flow';
import type { Sim } from '@/game/sim/sim';
import { ST_SLOW, type SimEnemy, type SimZone } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record } from './simHelpers';

/** The share of physical damage each enemy ignores. */
const ARMOUR: Record<EnemyId, number> = {
  cucumber: 0.08, dust: 0.05, drop: 0.05, roomba: 0.35, tangerine: 0.08, balloon: 0.08, balloon_small: 0.05, clock: 0.1, pill: 0.1, cone: 0.08, dryer: 0.1,
  spray: 0.2, firecracker: 0, boss_cucumber: 0.15,
  boss_vacuum: 0.35, boss_blender: 0.3, boss_bath: 0.3, boss_cloud: 0.1, boss_needle: 0.2,
};

/** The share of magic damage each enemy ignores (not touched by this batch). */
const WARD: Record<EnemyId, number> = {
  cucumber: 0, dust: 0, drop: 0, roomba: 0, tangerine: 0.35, balloon: 0, balloon_small: 0, clock: 0, pill: 0, cone: 0, dryer: 0,
  spray: 0.2, firecracker: 0, boss_cucumber: 0,
  boss_vacuum: 0.1, boss_blender: 0.1, boss_bath: 0.15, boss_cloud: 0.35, boss_needle: 0.25,
};

/** The enemies that shrug off part of a slow; every other enemy has none. */
const SLOW_RESIST: Partial<Record<EnemyId, number>> = { drop: 0.3, clock: 0.3, roomba: 0.2 };

const NORMAL: EnemyId[] = ['cucumber', 'dust', 'drop', 'roomba', 'tangerine', 'balloon', 'balloon_small', 'clock', 'pill', 'cone', 'dryer'];
const SPECIAL: EnemyId[] = ENEMY_IDS.filter((id) => !NORMAL.includes(id));

function field(): Sim {
  const sim = newSim();
  quietWave(sim);
  return sim;
}

/** A frozen (so: standing still) enemy at a chosen spot. */
function at(sim: Sim, id: EnemyId, x: number, y: number, hp = 1e9, travelled = 100): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  e.x = x;
  e.y = y;
  return e;
}

/** Health lost by one hit of `amount`, a target dummy with modest health so float rounding stays far below the test tolerance. */
function lost(sim: Sim, id: EnemyId, amount: number, type: 'physical' | 'magic'): number {
  const e = foe(sim, id, 0, 1e5);
  const before = e.hp + e.shield;
  damageEnemy(sim, e, amount, type, null, false, null);
  return before - (e.hp + e.shield);
}

describe('the armour table (2026-10-10)', () => {
  it('gives every ordinary enemy 5 to 10% armour, keeps the roomba at 35% and leaves the elites and bosses as they were', () => {
    for (const id of ENEMY_IDS) expect(ENEMY_SPECS[id].armor, `${id} armour`).toBe(ARMOUR[id]);
    for (const id of ['dust', 'drop', 'balloon_small'] as const) expect(ENEMY_SPECS[id].armor, id).toBe(0.05);
    for (const id of ['cucumber', 'balloon', 'tangerine', 'cone'] as const) expect(ENEMY_SPECS[id].armor, id).toBe(0.08);
    for (const id of ['clock', 'pill', 'dryer'] as const) expect(ENEMY_SPECS[id].armor, id).toBe(0.1);
    expect(ENEMY_SPECS.roomba.armor).toBe(0.35);
    expect(SPECIAL.map((id) => [id, ENEMY_SPECS[id].armor])).toEqual([
      ['spray', 0.2], ['firecracker', 0], ['boss_cucumber', 0.15],
      ['boss_vacuum', 0.35], ['boss_blender', 0.3], ['boss_bath', 0.3], ['boss_cloud', 0.1], ['boss_needle', 0.2],
    ]);
  });

  it('leaves every ward as it was', () => {
    for (const id of ENEMY_IDS) expect(ENEMY_SPECS[id].ward, `${id} ward`).toBe(WARD[id]);
  });

  it('adds and removes no trait: only the roomba is armoured, only the tangerine is warded, the cucumber has none', () => {
    expect(ENEMY_IDS.filter((id) => ENEMY_SPECS[id].traits.includes('armored'))).toEqual(['roomba']);
    expect(ENEMY_IDS.filter((id) => ENEMY_SPECS[id].traits.includes('warded'))).toEqual(['tangerine']);
    expect(ENEMY_SPECS.cucumber.traits).toEqual([]);
    expect(ENEMY_SPECS.balloon_small.traits).toEqual([]);
  });

  it('cuts a physical hit by exactly the armour and a magic hit by exactly the ward', () => {
    const sim = field();
    for (const id of ENEMY_IDS) {
      expect(lost(sim, id, 100, 'physical'), `${id} physical`).toBeCloseTo(100 * (1 - ARMOUR[id]), 9);
      expect(lost(sim, id, 100, 'magic'), `${id} magic`).toBeCloseTo(100 * (1 - WARD[id]), 9);
    }
    // The numbers the owner asked for, spelled out: a cucumber now takes 92 of a 100 physical hit and still the whole of a magic one.
    expect(lost(sim, 'cucumber', 100, 'physical')).toBeCloseTo(100 * (1 - 0.08), 9);
    expect(lost(sim, 'cucumber', 100, 'magic')).toBeCloseTo(100, 9);
    expect(lost(sim, 'dust', 100, 'physical')).toBeCloseTo(100 * (1 - 0.05), 9);
    expect(lost(sim, 'dryer', 100, 'physical')).toBeCloseTo(100 * (1 - 0.1), 9);
  });

  it('is still cut further by armour break, armour ignore and the scratcher like any armour', () => {
    const sim = field();
    const cat = put(sim, 0, 'w_paw');
    cat.armorIgnore = 0.5;
    const e = foe(sim, 'cucumber', 0, 1e5);
    applyStatus(sim, e, 'armor_break', 0.5, 5, null);
    damageEnemy(sim, e, 100, 'physical', cat, false, null);
    expect(1e5 - e.hp).toBeCloseTo(100 * (1 - 0.08 * (1 - 0.5) * (1 - 0.5)), 9);
    const bare = foe(sim, 'cucumber', 0, 1e5);
    gainRelic(sim, 'scratcher');
    damageEnemy(sim, bare, 100, 'physical', null, false, null);
    expect(1e5 - bare.hp).toBeCloseTo(100 * (1 - 0.08 * 0.8), 9);
  });
});

describe('the slow resistance table (2026-10-10)', () => {
  it('is 30% on the drop and the clock, 20% on the roomba and nothing on every other enemy', () => {
    for (const id of ENEMY_IDS) expect(ENEMY_SPECS[id].slowResist, `${id} slow resist`).toBe(SLOW_RESIST[id] ?? 0);
    expect(ENEMY_IDS.filter((id) => ENEMY_SPECS[id].slowResist > 0)).toEqual(['drop', 'roomba', 'clock']);
  });

  it('stays a share between 0 and 1', () => {
    for (const id of ENEMY_IDS) {
      expect(ENEMY_SPECS[id].slowResist, id).toBeGreaterThanOrEqual(0);
      expect(ENEMY_SPECS[id].slowResist, id).toBeLessThan(1);
    }
  });
});

describe('the slow rule: min(amount x (1 + boost), cap) x (1 - resist)', () => {
  it('lands a 40% slow on a drop as 28%', () => {
    const sim = field();
    const e = foe(sim, 'drop');
    applyStatus(sim, e, 'slow', 0.4, 3, null);
    expect(e.slow).toBeCloseTo(0.4 * (1 - 0.3), 12);
    expect(e.slow).toBeCloseTo(0.28, 12);
    expect(e.mask & ST_SLOW).toBe(ST_SLOW);
  });

  it('caps a 60% slow on a clock at 50% first and then takes 30% of that off: 35%', () => {
    const sim = field();
    const e = foe(sim, 'clock');
    applyStatus(sim, e, 'slow', 0.6, 3, null);
    expect(e.slow).toBeCloseTo(SLOW_CAP * (1 - 0.3), 12);
    expect(e.slow).toBeCloseTo(0.35, 12);
  });

  it('lands slows on a roomba with 20% off: 40% as 32%, a capped one as 40%', () => {
    const sim = field();
    const a = foe(sim, 'roomba');
    applyStatus(sim, a, 'slow', 0.4, 3, null);
    expect(a.slow).toBeCloseTo(0.4 * (1 - 0.2), 12);
    const b = foe(sim, 'roomba');
    applyStatus(sim, b, 'slow', 0.9, 3, null);
    expect(b.slow).toBeCloseTo(SLOW_CAP * (1 - 0.2), 12);
    expect(b.slow).toBeCloseTo(0.4, 12);
  });

  it('leaves an enemy without resistance exactly as before (the cap is 50%)', () => {
    const sim = field();
    for (const id of NORMAL.filter((x) => !SLOW_RESIST[x])) {
      const e = foe(sim, id);
      applyStatus(sim, e, 'slow', 0.4, 3, null);
      expect(e.slow, id).toBe(0.4);
      applyStatus(sim, e, 'slow', 0.9, 3, null);
      expect(e.slow, id).toBe(SLOW_CAP);
    }
  });

  it('keeps the elite and boss cap of 25% and gives them no resistance of their own', () => {
    const sim = field();
    for (const id of SPECIAL) {
      expect(ENEMY_SPECS[id].slowResist, id).toBe(0);
      const e = foe(sim, id);
      applyStatus(sim, e, 'slow', 0.4, 3, null);
      expect(e.slow, id).toBe(SLOW_CAP_BOSS);
    }
  });

  it('keeps the stronger slow by the amount that lands, and the longer duration', () => {
    const sim = field();
    const e = foe(sim, 'drop');
    applyStatus(sim, e, 'slow', 0.3, 1, null);
    expect(e.slow).toBeCloseTo(0.3 * (1 - 0.3), 12);
    applyStatus(sim, e, 'slow', 0.2, 5, null);
    expect(e.slow).toBeCloseTo(0.3 * (1 - 0.3), 12);
    expect(e.slowUntil).toBeCloseTo(sim.time + 5, 9);
    applyStatus(sim, e, 'slow', 0.45, 1, null);
    expect(e.slow).toBeCloseTo(0.45 * (1 - 0.3), 12);
    expect(e.slowUntil).toBeCloseTo(sim.time + 5, 9);
    // Two slows that both reach the cap land as the same 35%: the second does not replace or stack on the first.
    applyStatus(sim, e, 'slow', 0.9, 1, null);
    const capped = e.slow;
    expect(capped).toBeCloseTo(SLOW_CAP * (1 - 0.3), 12);
    applyStatus(sim, e, 'slow', 0.8, 1, null);
    expect(e.slow).toBe(capped);
  });

  it('does not shorten the duration', () => {
    const sim = field();
    const resisted = foe(sim, 'drop');
    const plain = foe(sim, 'cucumber');
    applyStatus(sim, resisted, 'slow', 0.4, 5, null);
    applyStatus(sim, plain, 'slow', 0.4, 5, null);
    expect(resisted.slowUntil).toBe(plain.slowUntil);
    expect(resisted.slowUntil).toBeCloseTo(sim.time + 5, 9);
  });

  it('puts the toy boost before the cap and the resistance after it', () => {
    const sim = field();
    gainRelic(sim, 'heating_pad');
    const drop = foe(sim, 'drop');
    applyStatus(sim, drop, 'slow', 0.4, 3, null);
    // 0.4 x 1.3 = 0.52 is cut to the cap 0.5, then 30% comes off.
    expect(drop.slow).toBeCloseTo(SLOW_CAP * (1 - 0.3), 12);
    const clock = foe(sim, 'clock');
    applyStatus(sim, clock, 'slow', 0.2, 3, null);
    expect(clock.slow).toBeCloseTo(0.2 * 1.3 * (1 - 0.3), 12);
    const roomba = foe(sim, 'roomba');
    applyStatus(sim, roomba, 'slow', 0.2, 3, null);
    expect(roomba.slow).toBeCloseTo(0.2 * 1.3 * (1 - 0.2), 12);
    const spray = foe(sim, 'spray');
    applyStatus(sim, spray, 'slow', 0.4, 3, null);
    expect(spray.slow).toBe(SLOW_CAP_BOSS);
  });

  it('lets a resistance of 1 shut a slow out altogether: no status, no sticker', () => {
    const sim = field();
    const statuses = record(sim, 'status');
    const e = foe(sim, 'drop');
    e.spec = { ...e.spec, slowResist: 1 };
    applyStatus(sim, e, 'slow', 0.4, 3, null);
    expect(e.slow).toBe(0);
    expect(e.mask & ST_SLOW).toBe(0);
    expect(statuses).toHaveLength(0);
  });

  it('slows the walk by the slow that landed', () => {
    const sim = field();
    const slowed = foe(sim, 'drop');
    const free = foe(sim, 'drop');
    applyStatus(sim, slowed, 'slow', 0.4, 5, null);
    advance(sim, 1);
    expect(slowed.travelled / free.travelled).toBeCloseTo(1 - 0.4 * (1 - 0.3), 9);
    expect(slowed.travelled).toBeCloseTo(125 * (1 - 0.28), 6);
  });

  it('still counts as slowed for the heating pad (+15% damage) as long as the slow is above zero', () => {
    const sim = field();
    gainRelic(sim, 'heating_pad');
    const e = foe(sim, 'drop', 0, 1e5);
    damageEnemy(sim, e, 100, 'physical', null, false, null);
    expect(1e5 - e.hp).toBeCloseTo(100 * (1 - 0.05), 9);
    applyStatus(sim, e, 'slow', 0.05, 3, null);
    expect(e.slow).toBeGreaterThan(0);
    const before = e.hp;
    damageEnemy(sim, e, 100, 'physical', null, false, null);
    expect(before - e.hp).toBeCloseTo(100 * (1 - 0.05) * 1.15, 9);
  });

  it('still counts as slowed in the balance report\'s slowed-time statistic, which samples the public enemy list for `slow > 0` (sim/runner.ts)', () => {
    const sim = field();
    const view: BattleApi = sim;
    const drop = foe(sim, 'drop');
    const free = foe(sim, 'drop');
    const sample = (): number => view.enemies.filter((e) => e.slow > 0).length;
    expect(sample()).toBe(0);
    // The weakest slow a cat lands (the snowball's 20%, resisted by 30%) and the strongest one a drop can take (the 50% cap, resisted by 30%).
    applyStatus(sim, drop, 'slow', 0.2, 3, null);
    expect(view.enemies.filter((e) => e.slow > 0)).toEqual([drop]);
    expect(drop.slow).toBeCloseTo(0.14, 12);
    expect(free.slow).toBe(0);
    applyStatus(sim, free, 'slow', 0.9, 3, null);
    expect(sample()).toBe(2);
    expect(free.slow).toBeCloseTo(SLOW_CAP * (1 - 0.3), 12);
    // It stays counted for as long as the status lasts, and stops with it.
    advance(sim, 2);
    expect(sample()).toBe(2);
    advance(sim, 2);
    expect(sample()).toBe(0);
  });
});

describe('every cat that slows lands its slow through the resistance', () => {
  it('snowball splash (20%): a drop is slowed 14%, a cucumber 20%', () => {
    const sim = field();
    put(sim, 7, 'm_snow');
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    const drop = at(sim, 'drop', x + 200, y, 1e9, 900);
    const cucumber = at(sim, 'cucumber', x + 220, y + 20, 1e9, 800);
    advance(sim, 1.5);
    expect(drop.slow).toBeCloseTo(0.2 * (1 - 0.3), 9);
    expect(cucumber.slow).toBeCloseTo(0.2, 9);
  });

  it('the ice queen\'s blizzard (40%): a drop is slowed 28%, a roomba 32%', () => {
    const sim = field();
    put(sim, 7, 'm_frost');
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    const drop = at(sim, 'drop', x + 200, y, 1e9, 900);
    const roomba = at(sim, 'roomba', x + 210, y + 10, 1e9, 800);
    advance(sim, 1.5);
    expect(drop.slow).toBeCloseTo(0.4 * (1 - 0.3), 9);
    expect(roomba.slow).toBeCloseTo(0.4 * (1 - 0.2), 9);
  });

  it('the lucky cat\'s coin rain (30%): a clock is slowed 21%, a cucumber 30%', () => {
    const sim = field();
    put(sim, 7, 't_lucky');
    const clock = at(sim, 'clock', 700, 600, 1e9, 100);
    const cucumber = at(sim, 'cucumber', 650, 560, 1e9, 200);
    advance(sim, 12.2);
    expect(clock.slow).toBeCloseTo(0.3 * (1 - 0.3), 9);
    expect(cucumber.slow).toBeCloseTo(0.3, 9);
  });
});

describe('what slow resistance leaves alone', () => {
  const zone = (uid: number, timeLeft: number): SimZone => ({ uid, timeLeft } as SimZone);

  it('stun and freeze last as long on the resisting enemies as on a cucumber', () => {
    const sim = field();
    for (const id of ['drop', 'clock', 'roomba', 'cucumber'] as const) {
      const e = foe(sim, id);
      applyStatus(sim, e, 'stun', 0, 2, null);
      applyStatus(sim, e, 'freeze', 0, 2, null);
      expect(e.stunned && e.frozen, id).toBe(true);
      expect(e.stunUntil - sim.time, id).toBeCloseTo(2, 9);
      expect(e.freezeUntil - sim.time, id).toBeCloseTo(2, 9);
    }
  });

  it('armour break and vulnerability land whole, and the laser still adds its 15%', () => {
    const sim = field();
    const e = foe(sim, 'drop', 0, 1e5);
    applyStatus(sim, e, 'armor_break', 0.5, 5, null);
    applyStatus(sim, e, 'vulnerable', 0.25, 5, null);
    expect(e.breakAmount).toBe(0.5);
    expect(e.vulnAmount).toBe(0.25);
    e.focused = true;
    damageEnemy(sim, e, 100, 'physical', null, false, null);
    expect(1e5 - e.hp).toBeCloseTo(100 * (1 - 0.05 * 0.5) * 1.25 * 1.15, 9);
  });

  it('the black hole pulls a drop as far as a cucumber', () => {
    const sim = field();
    const drop = foe(sim, 'drop', 500);
    const cucumber = foe(sim, 'cucumber', 500);
    drop.speed = 0;
    cucumber.speed = 0;
    expect(pullEnemy(sim, drop, 10, zone(1, 1))).toBe(10);
    expect(pullEnemy(sim, cucumber, 10, zone(1, 1))).toBe(10);
    expect(drop.travelled).toBe(cucumber.travelled);
  });

  it('the nap blanket still slows every enemy\'s walk by 10%, a resisting one included', () => {
    const blanket = newSim();
    const plain = newSim();
    quietWave(blanket);
    quietWave(plain);
    gainRelic(blanket, 'nap_blanket');
    const a = foe(blanket, 'drop', 0);
    const b = foe(plain, 'drop', 0);
    advance(blanket, 1);
    advance(plain, 1);
    expect(a.travelled / b.travelled).toBeCloseTo(0.9, 6);
  });

  it('the pill\'s aura and the needle boss\'s vaccination still make an enemy immune to slows', () => {
    const sim = field();
    const e = foe(sim, 'drop');
    e.slowImmuneUntil = sim.time + 5;
    applyStatus(sim, e, 'slow', 0.4, 3, null);
    expect(e.slow).toBe(0);
    const f = foe(sim, 'drop');
    sim.vaccinateUntil = sim.time + 5;
    applyStatus(sim, f, 'slow', 0.4, 3, null);
    expect(f.slow).toBe(0);
  });
});
