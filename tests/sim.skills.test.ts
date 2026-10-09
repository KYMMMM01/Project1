import { describe, expect, it } from 'vitest';
import type { EnemyId, UnitId } from '@/game/api';
import {
  BOSS_HP, CC_IMMUNE_AFTER, DODGE_CAP, ELITE_HP, LASER_DURATION, PULL_BOSS_FACTOR, PULL_ELITE_FACTOR, PULL_IMMUNE_AFTER, TICK, specialHp,
} from '@/game/data/balance';
import { UNIT_GRID, unitClass, unitRarity } from '@/game/data/roster';
import { auraScale, unitSpec } from '@/game/data/units';
import { CELL_COUNT, auraCells, cellCenterX, cellCenterY } from '@/game/geometry';
import { UNITS_BY_RARITY } from '@/meta/units';
import { pullEnemy } from '@/game/sim/enemies';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimZone } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record, slay } from './simHelpers';

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

describe('the samurai (v1.4: a lighter skill and a lighter hit)', () => {
  it('hits for 130 (it was 140), cuts 100 px of path around the target (130) and bleeds for 18% of its damage a second (25%)', () => {
    const s = unitSpec('w_samurai');
    expect(s.base.damage).toBe(130);
    expect(s.attack).toMatchObject({ shape: 'line', reach: 100, effect: { kind: 'bleed', amount: 0.18, duration: 3 } });
    expect(s.skillArgs).toMatchObject({ a: 100, b: 3, c: 18 });
  });
});

describe('the starlight archer (v1.4: a faster, lighter arrow)', () => {
  it('fires every 0.5 s for 220, pierces one more enemy and bursts what it kills in 90 px for a quarter of the hit', () => {
    const s = unitSpec('r_star');
    expect(s.base.damage).toBe(220);
    expect(s.base.interval).toBe(0.5);
    expect(s.attack).toMatchObject({ shape: 'pierce', targets: 1, blastRadius: 90, blastPct: 0.25 });
    expect(s.skillArgs).toMatchObject({ a: 1, b: 90, c: 25 });
  });
});

describe('the storm cat\'s shock (v1.4)', () => {
  const storm = (sim: Sim, ids: EnemyId[]): SimEnemy[] => {
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    return ids.map((id, i) => at(sim, id, x + 60 + i * 60, y, 1e9, 900 - i * 10));
  };

  it('stuns every enemy the bolt reaches for 0.4 s, an elite for half of it, and never a boss', () => {
    const sim = field();
    put(sim, 7, 'm_storm');
    const attack = unitSpec('m_storm').attack;
    expect(attack.shape === 'chain' && attack.stun).toBe(0.4);
    const [a, b, elite, boss] = storm(sim, ['cucumber', 'cucumber', 'firecracker', 'boss_cloud']) as [SimEnemy, SimEnemy, SimEnemy, SimEnemy];
    const stuns = record(sim, 'status');
    advance(sim, 0.6);
    for (const e of [a, b]) expect(e.stunned, e.id).toBe(true);
    expect(stuns.filter((s) => s.kind === 'stun').map((s) => s.duration).sort()).toEqual([0.2, 0.4, 0.4]);
    expect(elite.stunned).toBe(true);
    expect(boss.stunned).toBe(false);
  });

  it('cannot hold an enemy: after a shock it ignores stuns for the whole window, so the enemy is stopped for about a tenth of the time at most', () => {
    const sim = field();
    put(sim, 7, 'm_storm');
    const [e] = storm(sim, ['cucumber']) as [SimEnemy];
    let stopped = 0;
    for (let i = 0; i < 60 * 20; i++) {
      sim.step(TICK);
      if (e.stunned) stopped++;
    }
    const share = (stopped * TICK) / 20;
    expect(stopped).toBeGreaterThan(0);
    expect(share).toBeLessThan(0.4 / (0.4 + CC_IMMUNE_AFTER) + 0.02);
  });

  it('does not stun an enemy the bolt kills', () => {
    const sim = field();
    put(sim, 7, 'm_storm');
    const [a, b] = storm(sim, ['cucumber', 'cucumber']) as [SimEnemy, SimEnemy];
    a.hp = 0.5;
    advance(sim, 0.6);
    expect(a.dead).toBe(true);
    expect(b.stunned).toBe(true);
  });
});

describe('the blizzard\'s freeze (v1.4)', () => {
  it('freezes more often (12% a tick, it was 8%) and cannot freeze an enemy again for the window after it thaws', () => {
    const attack = unitSpec('m_frost').attack;
    expect(attack.shape === 'frost' && attack.freezeChance).toBe(0.12);
    expect(attack.shape === 'frost' && attack.freezeTime).toBe(0.8);
    expect(CC_IMMUNE_AFTER).toBe(4);
    expect(unitSpec('m_frost').skillArgs).toMatchObject({ d: 12, e: CC_IMMUNE_AFTER });
  });
});

describe('the black hole (v1.4)', () => {
  const zone = (uid: number, timeLeft: number): SimZone => ({ uid, timeLeft } as SimZone);

  it('pulls 90 px a second again (v1.4 cut it to 55, the owner took it back)', () => {
    const attack = unitSpec('m_cosmo').attack;
    expect(attack.shape === 'void' && attack.pull).toBe(90);
  });

  it('drags the enemy it caught until the hole ends, and no other hole drags it until 2 seconds after that', () => {
    const sim = field();
    const e = foe(sim, 'cucumber', 500);
    e.speed = 0;
    const first = zone(1, 1.2);
    expect(pullEnemy(sim, e, 5.5, first)).toBe(5.5);
    first.timeLeft = 0.6;
    expect(pullEnemy(sim, e, 5.5, first)).toBe(5.5);
    const second = zone(2, 1.2);
    expect(pullEnemy(sim, e, 5.5, second)).toBe(0);
    sim.time += 1.2 + PULL_IMMUNE_AFTER - 0.01;
    expect(pullEnemy(sim, e, 5.5, second)).toBe(0);
    sim.time += 0.7;
    expect(pullEnemy(sim, e, 5.5, second)).toBe(5.5);
    expect(e.travelled).toBeCloseTo(500 - 3 * 5.5, 9);
  });

  it('pulls elites by a third and bosses by a fifth, and never below the start', () => {
    const sim = field();
    const elite = foe(sim, 'firecracker', 500);
    const boss = foe(sim, 'boss_cloud', 500);
    const near = foe(sim, 'cucumber', 2);
    for (const e of [elite, boss, near]) e.speed = 0;
    expect(PULL_ELITE_FACTOR).toBeLessThan(0.5);
    expect(PULL_BOSS_FACTOR).toBeLessThan(PULL_ELITE_FACTOR);
    expect(pullEnemy(sim, elite, 10, zone(1, 1))).toBeCloseTo(10 * PULL_ELITE_FACTOR, 9);
    expect(pullEnemy(sim, boss, 10, zone(1, 1))).toBeCloseTo(10 * PULL_BOSS_FACTOR, 9);
    expect(pullEnemy(sim, near, 10, zone(1, 1))).toBe(2);
    expect(near.travelled).toBe(0);
  });

  it('drags an enemy once per cast with the real cat: about 66 px, then nothing for the next hole, then again', () => {
    const sim = field();
    put(sim, 7, 'm_cosmo');
    const e = foe(sim, 'cucumber', 300);
    e.speed = 0;
    const pulls = record(sim, 'pull');
    const zones = record(sim, 'zoneStart');
    const sums: number[] = [];
    let last = 0;
    for (let s = 0; s < 13; s++) {
      advance(sim, 1);
      const total = pulls.reduce((a, p) => a + p.distance, 0);
      sums.push(total - last);
      last = total;
    }
    expect(zones.length).toBeGreaterThanOrEqual(4);
    const total = sums.reduce((a, v) => a + v, 0);
    // The cosmic cat casts every 2.6 s and a hole drags for 1.2 s at 90 px/s; with the 2 s window a hole drags the enemy it caught and the next one only if it came more than 2 s after the first ended.
    expect(total).toBeGreaterThan(90 * 1.0);
    expect(total).toBeLessThan(90 * 1.2 * zones.length + 10);
    expect(pulls.every((p) => p.distance > 0)).toBe(true);
  });
});

describe('the bell kitten and the bard reach the 8 cells around them', () => {
  it('has the aura cells of a cell as the 8 around it, fewer at the edge and the corner, and two rings on request', () => {
    expect(auraCells(12).sort((a, b) => a - b)).toEqual([6, 7, 8, 11, 13, 16, 17, 18]);
    expect(auraCells(0).sort((a, b) => a - b)).toEqual([1, 5, 6]);
    expect(auraCells(2).sort((a, b) => a - b)).toEqual([1, 3, 6, 7, 8]);
    expect(auraCells(12, [], 2)).toHaveLength(CELL_COUNT - 1);
    for (let c = 0; c < CELL_COUNT; c++) expect(auraCells(c)).not.toContain(c);
    expect(unitSpec('t_bell').aura.reach).toBe(1);
    expect(unitSpec('t_bard').aura.reach).toBe(1);
  });

  it('gives the bard\'s 15% to the diagonals too, and only to the 8 cats around it', () => {
    const sim = field();
    put(sim, 12, 't_bard');
    const around = auraCells(12).map((c) => put(sim, c, 'w_paw'));
    const outside = [0, 4, 20, 24].map((c) => put(sim, c, 'w_paw'));
    for (const u of around) expect(u.buffDamage, `cell ${u.cell}`).toBeCloseTo(0.15, 9);
    for (const u of outside) expect(u.buffDamage, `cell ${u.cell}`).toBe(0);
    expect(unitSpec('t_bard').aura.neighbourDamage).toBe(0.15);
  });

  it('gives the bell\'s speed to the diagonals, and its dodge to those cats and to itself', () => {
    const sim = field();
    put(sim, 12, 't_bell');
    const diagonal = put(sim, 6, 'w_paw');
    const far = put(sim, 0, 'w_paw');
    expect(diagonal.buffAttackSpeed).toBeCloseTo(0.08, 9);
    expect(diagonal.dodge).toBeCloseTo(0.4, 9);
    expect(sim.units[12]!.dodge).toBeCloseTo(0.4, 9);
    expect(sim.units[12]!.buffAttackSpeed).toBe(0);
    expect(far.dodge).toBe(0);
    expect(far.shielded).toBe(false);
  });

  it('scales the dodge with the bell\'s level, counts only the strongest bell and never passes the cap', () => {
    const low = field(1);
    const high = field(7);
    put(low, 12, 't_bell');
    put(high, 12, 't_bell');
    const spec = unitSpec('t_bell');
    expect(low.units[12]!.dodge).toBeCloseTo(0.4, 9);
    expect(high.units[12]!.dodge).toBeCloseTo(0.4 * auraScale(spec, 7), 9);
    expect(high.units[12]!.dodge).toBeCloseTo(0.6, 9);
    put(high, 13, 't_bell');
    expect(high.units[12]!.dodge).toBeCloseTo(0.6, 9);
    expect(DODGE_CAP).toBeGreaterThan(0.6);
    expect((spec.aura.dodge ?? 0) * auraScale(spec, 10)).toBeLessThanOrEqual(DODGE_CAP);
  });
});

describe('the chef and the bell kitten swapped places in the trickster line', () => {
  it('makes the chef the kitten (rank 1) and the bell kitten the second rank, with the line\'s numbers staying where the ranks are', () => {
    expect(UNIT_GRID.trickster).toEqual(['t_chef', 't_bell', 't_bard', 't_alch', 't_lucky']);
    expect(unitRarity('t_chef')).toBe('common');
    expect(unitRarity('t_bell')).toBe('rare');
    expect(unitClass('t_chef')).toBe('trickster');
    const rows = UNIT_GRID.trickster.map((id) => unitSpec(id).base);
    expect(rows.map((r) => r.damage)).toEqual([8, 20, 42, 90, 200]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.damage).toBeGreaterThan(rows[i - 1]!.damage);
      expect(rows[i]!.range).toBeGreaterThanOrEqual(rows[i - 1]!.range);
    }
    expect(unitSpec('t_chef').aura.chef).toEqual({ cap: 12 });
    expect(unitSpec('t_bell').aura.dodge).toBe(0.4);
  });

  it('moves the card rarity with the rank: bell cards are rare cards now, chef cards common', () => {
    expect(UNITS_BY_RARITY.common).toContain('t_chef');
    expect(UNITS_BY_RARITY.rare).toContain('t_bell');
    expect(UNITS_BY_RARITY.common).not.toContain('t_bell');
    expect(UNITS_BY_RARITY.rare).not.toContain('t_chef');
  });

  it('merges two chefs into the bell kitten and two bell kittens into the bard', () => {
    const sim = newSim();
    put(sim, 0, 't_chef');
    put(sim, 1, 't_chef');
    expect(sim.drop(0, 1)).toBeNull();
    expect(sim.units[1]!.id).toBe('t_bell');
    put(sim, 0, 't_bell');
    expect(sim.drop(0, 1)).toBeNull();
    expect(sim.units[1]!.id).toBe('t_bard');
  });
});

describe('the laser pointer goes for elites and bosses first (v1.4)', () => {
  const setup = (target: EnemyId): { sim: Sim; normal: SimEnemy; special: SimEnemy } => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const y = cellCenterY(7);
    const normal = at(sim, 'cucumber', cellCenterX(7) + 160, y, 1e9, 900);
    const special = at(sim, target, cellCenterX(7) + 160, y - 90, 1e9, 100);
    sim.setLaser(normal.x + 5, normal.y);
    return { sim, normal, special };
  };

  it.each<EnemyId>(['firecracker', 'boss_cloud'])('aims at a %s inside the dot\'s area although a plain enemy is closer to the dot', (id) => {
    const { sim, special } = setup(id);
    const attacks = record(sim, 'attack');
    advance(sim, 1.3);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === special.uid)).toBe(true);
  });

  it('still aims at the plain enemy nearest the dot when no elite or boss stands in the dot\'s area', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const y = cellCenterY(7);
    const normal = at(sim, 'cucumber', cellCenterX(7) + 160, y, 1e9, 100);
    at(sim, 'firecracker', cellCenterX(7) - 180, y, 1e9, 900);
    sim.setLaser(normal.x, normal.y);
    const attacks = record(sim, 'attack');
    advance(sim, 1.3);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === normal.uid)).toBe(true);
  });

  it('prefers the elite nearest the dot among several, and stops when the laser is off', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const y = cellCenterY(7);
    const far = at(sim, 'firecracker', cellCenterX(7) + 200, y - 60, 1e9, 500);
    const near = at(sim, 'firecracker', cellCenterX(7) + 150, y, 1e9, 100);
    sim.setLaser(near.x, near.y);
    const attacks = record(sim, 'attack');
    advance(sim, 1.3);
    expect(attacks.every((a) => a.targetUid === near.uid)).toBe(true);
    advance(sim, 6.5);
    expect(sim.laser.active).toBe(false);
    attacks.length = 0;
    advance(sim, 1.5);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === far.uid)).toBe(true);
  });
});

describe('the laser locks onto an elite or a boss and follows it (v1.5)', () => {
  /** A boss that really walks (40 px/s along the top edge), and the laser's dot put 70 px beside it. */
  const lockedOnBoss = (): { sim: Sim; boss: SimEnemy } => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const boss = foe(sim, 'boss_cloud', 500, 1e9);
    expect(sim.setLaser(boss.x + 60, boss.y + 35)).toBeNull();
    return { sim, boss };
  };

  it('moves the dot onto the nearest elite or boss inside its area and keeps it there while the enemy walks', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const boss = foe(sim, 'boss_cloud', 500, 1e9);
    const far = foe(sim, 'firecracker', 400, 1e9);
    const locks = record(sim, 'laserLock');
    expect(sim.setLaser(boss.x + 60, boss.y + 35)).toBeNull();
    expect(sim.laser.lockUid).toBe(boss.uid);
    expect([sim.laser.x, sim.laser.y]).toEqual([boss.x, boss.y]);
    expect(locks).toHaveLength(1);
    expect(locks[0]!.enemy?.uid).toBe(boss.uid);
    const start = { x: boss.x, y: boss.y };
    advance(sim, 3);
    expect(Math.hypot(boss.x - start.x, boss.y - start.y)).toBeGreaterThan(100);
    expect(Math.hypot(sim.laser.x - boss.x, sim.laser.y - boss.y)).toBeLessThan(2);
    expect(sim.laser.lockUid).toBe(boss.uid);
    expect(locks).toHaveLength(1);
    expect(far.dead).toBe(false);
  });

  it('does not lock onto a plain enemy, nor onto an elite or a boss outside the dot\'s area, and then stays where it was put', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    at(sim, 'cucumber', 300, 300);
    const boss = at(sim, 'boss_cloud', 500, 300);
    const locks = record(sim, 'laserLock');
    expect(sim.setLaser(300, 300)).toBeNull();
    expect(sim.laser.lockUid).toBe(0);
    expect([sim.laser.x, sim.laser.y]).toEqual([300, 300]);
    expect(locks).toHaveLength(0);
    // 200 px from the boss is outside the 130 px area, 120 px is inside.
    expect(sim.setLaser(300, 300)).toBeNull();
    expect(sim.laser.lockUid).toBe(0);
    expect(sim.setLaser(boss.x - 120, boss.y)).toBeNull();
    expect(sim.laser.lockUid).toBe(boss.uid);
  });

  it('lets go when the dot is moved away, takes hold again when it is put near, and prefers the elite nearest to the dot', () => {
    const { sim, boss } = lockedOnBoss();
    const locks = record(sim, 'laserLock');
    expect(sim.setLaser(boss.x, boss.y + 300)).toBeNull();
    expect(sim.laser.lockUid).toBe(0);
    expect([sim.laser.x, sim.laser.y]).toEqual([boss.x, boss.y + 300]);
    expect(locks.map((l) => l.enemy?.uid ?? 0)).toEqual([0]);
    expect(sim.setLaser(boss.x + 20, boss.y + 100)).toBeNull();
    expect(sim.laser.lockUid).toBe(boss.uid);
    const closer = at(sim, 'firecracker', boss.x - 30, boss.y + 40, 1e9, 50);
    expect(sim.setLaser(closer.x, closer.y - 5)).toBeNull();
    expect(sim.laser.lockUid).toBe(closer.uid);
    advance(sim, 0.5);
    expect([sim.laser.x, sim.laser.y]).toEqual([closer.x, closer.y]);
  });

  it('lets go when the locked enemy dies, leaves the dot where it fell and keeps the laser on until its time is up', () => {
    const { sim, boss } = lockedOnBoss();
    const locks = record(sim, 'laserLock');
    advance(sim, 1);
    slay(sim, boss);
    const fell = { x: boss.x, y: boss.y };
    advance(sim, 0.1);
    expect(sim.laser.lockUid).toBe(0);
    expect(locks.at(-1)!.enemy).toBeNull();
    expect(sim.laser.active).toBe(true);
    expect(Math.hypot(sim.laser.x - fell.x, sim.laser.y - fell.y)).toBeLessThan(1);
    advance(sim, 1);
    expect([sim.laser.x, sim.laser.y]).toEqual([sim.laser.x, sim.laser.y]);
    expect(Math.hypot(sim.laser.x - fell.x, sim.laser.y - fell.y)).toBeLessThan(1);
    advance(sim, LASER_DURATION);
    expect(sim.laser.active).toBe(false);
  });

  it('is gone when the laser ends', () => {
    const { sim } = lockedOnBoss();
    const ends = record(sim, 'laserEnd');
    advance(sim, LASER_DURATION + 0.2);
    expect(sim.laser.active).toBe(false);
    expect(sim.laser.lockUid).toBe(0);
    expect(sim.laserLock).toBeNull();
    expect(ends).toHaveLength(1);
  });

  it('sends every cat that can reach the locked boss at it first, and leaves the cats that cannot to their own targets', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    put(sim, 0, 'w_paw');
    // The boss is out of the paw's reach but not the sling's; an older plain enemy stands near both of them.
    const boss = at(sim, 'boss_cloud', cellCenterX(7) + 200, cellCenterY(7), 1e9, 100);
    const plain = at(sim, 'cucumber', cellCenterX(0) + 150, cellCenterY(0), 1e9, 900);
    expect(Math.hypot(boss.x - cellCenterX(0), boss.y - cellCenterY(0))).toBeGreaterThan(unitSpec('w_paw').base.range + 38);
    expect(sim.setLaser(boss.x + 10, boss.y + 10)).toBeNull();
    const attacks = record(sim, 'attack');
    advance(sim, 1.5);
    const sling = attacks.filter((a) => a.unit.id === 'r_sling');
    const paw = attacks.filter((a) => a.unit.id === 'w_paw');
    expect(sling.length).toBeGreaterThan(0);
    expect(paw.length).toBeGreaterThan(0);
    expect(sling.every((a) => a.targetUid === boss.uid)).toBe(true);
    expect(paw.every((a) => a.targetUid === plain.uid)).toBe(true);
  });

  it('keeps every cat in reach on the boss for the whole duration, although it has long walked out of the dot\'s first area', () => {
    const { sim, boss } = lockedOnBoss();
    // An older plain enemy stands in reach the whole time; without the lock the sling would shoot at it.
    const plain = at(sim, 'cucumber', cellCenterX(7) + 100, cellCenterY(7), 1e9, 5000);
    const attacks = record(sim, 'attack');
    advance(sim, 5);
    attacks.length = 0;
    advance(sim, 1.2);
    expect(Math.hypot(boss.x - 581, boss.y - 45)).toBeGreaterThan(130);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === boss.uid)).toBe(true);
    expect(plain.dead).toBe(false);
  });
});

describe('armour-breaking attacks go for elites and bosses first (v1.5)', () => {
  /** A cat in the corner cell with an older plain roomba and a younger boss both inside its reach. */
  const pair = (id: UnitId, special: EnemyId = 'boss_vacuum'): { attacks: ReturnType<typeof record<'attack'>>; plain: SimEnemy; boss: SimEnemy } => {
    const sim = field();
    put(sim, 0, id);
    const plain = at(sim, 'roomba', cellCenterX(0) + 120, cellCenterY(0), 1e9, 900);
    const boss = at(sim, special, cellCenterX(0), cellCenterY(0) + 130, 1e9, 100);
    const attacks = record(sim, 'attack');
    advance(sim, 1.6);
    return { attacks, plain, boss };
  };

  it.each<UnitId>(['w_viking', 'w_tiger'])('has the %s aim at a boss in reach before an older plain enemy', (id) => {
    const { attacks, boss } = pair(id);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === boss.uid)).toBe(true);
  });

  it.each<UnitId>(['w_paw', 'w_sword', 'w_samurai', 'r_archer', 'm_fire'])('leaves the %s with the oldest enemy as before', (id) => {
    const { attacks, plain } = pair(id);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === plain.uid)).toBe(true);
  });

  it('counts an elite like a boss, and falls back to the oldest enemy when neither is in reach', () => {
    const { attacks, boss } = pair('w_viking', 'firecracker');
    expect(attacks.every((a) => a.targetUid === boss.uid)).toBe(true);
    const sim = field();
    put(sim, 0, 'w_viking');
    const plain = at(sim, 'roomba', cellCenterX(0) + 120, cellCenterY(0), 1e9, 900);
    at(sim, 'roomba', cellCenterX(0), cellCenterY(0) + 130, 1e9, 100);
    at(sim, 'boss_vacuum', cellCenterX(0) + 600, cellCenterY(0), 1e9, 50);
    const far = record(sim, 'attack');
    advance(sim, 1.6);
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((a) => a.targetUid === plain.uid)).toBe(true);
  });

  it('picks the oldest of several bosses and elites in reach', () => {
    const sim = field();
    put(sim, 0, 'w_tiger');
    const young = at(sim, 'firecracker', cellCenterX(0) + 100, cellCenterY(0), 1e9, 100);
    const old = at(sim, 'boss_cloud', cellCenterX(0), cellCenterY(0) + 120, 1e9, 400);
    const attacks = record(sim, 'attack');
    advance(sim, 1.4);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === old.uid)).toBe(true);
    expect(young.dead).toBe(false);
  });

  it('yields to the laser: a plain enemy under the dot comes first, and an elite under the dot first of all', () => {
    const sim = field();
    put(sim, 0, 'w_viking');
    const plain = at(sim, 'roomba', cellCenterX(0) + 120, cellCenterY(0), 1e9, 100);
    at(sim, 'boss_vacuum', cellCenterX(0), cellCenterY(0) + 130, 1e9, 900);
    // The dot is on the plain one and the boss is out of its area: the laser's choice wins.
    expect(sim.setLaser(plain.x, plain.y - 10)).toBeNull();
    expect(sim.laser.lockUid).toBe(0);
    const attacks = record(sim, 'attack');
    advance(sim, 1.4);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === plain.uid)).toBe(true);
  });
});

describe('the bosses (v1.4)', () => {
  it('have 10% less health (1431 / 3658 / 12965), the elites the same as before, and the endless ones grow from the new table', () => {
    expect([...BOSS_HP]).toEqual([1431, 3658, 12965]);
    [1590, 4064, 14405].forEach((old, i) => expect((BOSS_HP[i] as number) / old).toBeCloseTo(0.9, 3));
    expect([...ELITE_HP]).toEqual([1055, 3848, 10080]);
    expect(specialHp('boss', 0)).toBe(1431);
    expect(specialHp('boss', 3)).toBeCloseTo(12965 * 1.14 ** 8, 6);
  });
});
