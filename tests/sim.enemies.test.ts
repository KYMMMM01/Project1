import { describe, expect, it } from 'vitest';
import { ENEMY_IDS } from '@/game/api';
import { BOSS_SPECS, enemySpec } from '@/game/data/enemies';
import { applyStatus, damageEnemy, hasteEnemy } from '@/game/sim/enemies';
import { startWave } from '@/game/sim/flow';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record } from './simHelpers';

/** Enters a boss or elite wave with the scripted escort cancelled. */
function bossWave(wave: number, over: Parameters<typeof newSim>[0] = {}): Sim {
  const sim = newSim(over);
  quietWave(sim);
  startWave(sim, wave);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  advance(sim, 1.05);
  return sim;
}

describe('walking', () => {
  it('moves every enemy at its own speed', () => {
    for (const id of ENEMY_IDS) {
      const sim = newSim();
      quietWave(sim);
      const e = foe(sim, id, 0);
      advance(sim, 1);
      expect(e.travelled, id).toBeCloseTo(enemySpec(id).speed, 3);
    }
  });

  it('follows the loop: positions come from the path and the angle turns at corners', () => {
    const sim = newSim();
    quietWave(sim);
    const e = foe(sim, 'cucumber', 0);
    expect(e.x).toBeCloseTo(81, 6);
    expect(e.y).toBe(44);
    expect(e.angle).toBe(0);
    e.travelled = 558 + 40;
    advance(sim, 1 / 60);
    expect(e.angle).toBeGreaterThan(0.3);
    expect(e.x).toBeGreaterThan(600);
  });

  it('lets an enemy keep circling: travelled grows past one lap and the position wraps', () => {
    const sim = newSim();
    quietWave(sim);
    const e = foe(sim, 'cucumber', 2260);
    advance(sim, 1);
    expect(e.travelled).toBeGreaterThan(2270);
    expect(e.x).toBeLessThan(200);
    expect(e.y).toBeLessThan(120);
  });
});

describe('enemy traits', () => {
  it('swarm and fast: dust is cheap and numerous, droplets run', () => {
    expect(enemySpec('dust').hpMult).toBeLessThan(0.5);
    expect(enemySpec('drop').speed).toBeGreaterThanOrEqual(120);
  });

  it('split: a balloon leaves two small balloons at its place with half a cucumber of health each', () => {
    const sim = newSim();
    quietWave(sim);
    const balloon = foe(sim, 'balloon', 500, 100);
    const spawns = record(sim, 'enemySpawn');
    damageEnemy(sim, balloon, 1e6, 'magic', null, false, null);
    expect(spawns.map((s) => s.enemy.id)).toEqual(['balloon_small', 'balloon_small']);
    for (const s of spawns) {
      expect(Math.abs(s.enemy.travelled - 500)).toBeLessThan(20);
      expect(s.enemy.maxHp).toBeCloseTo(50, 9);
    }
    expect(sim.enemyCount).toBe(2);
    const child = spawns[0]!.enemy as SimEnemy;
    damageEnemy(sim, child, 1e6, 'magic', null, false, null);
    expect(spawns).toHaveLength(2);
  });

  it('haste aura: a clock speeds the others up by 30% but not itself', () => {
    const sim = newSim();
    quietWave(sim);
    const clock = foe(sim, 'clock', 300);
    const near = foe(sim, 'cucumber', 280);
    const far = foe(sim, 'cucumber', 900);
    advance(sim, 1);
    expect(near.travelled - 280).toBeGreaterThan(70 * 1.2);
    expect(near.travelled - 280).toBeLessThan(70 * 1.31);
    expect(far.travelled - 900).toBeCloseTo(70, 0);
    expect(clock.travelled - 300).toBeCloseTo(66, 0);
  });

  it('heal aura: a pill heals neighbours 2% of their health per second and blocks slows', () => {
    const sim = newSim();
    quietWave(sim);
    foe(sim, 'pill', 300);
    const near = foe(sim, 'cucumber', 280, 1000);
    near.hp = 500;
    advance(sim, 2);
    expect(near.hp).toBeGreaterThan(530);
    expect(near.hp).toBeLessThan(560);
    applyStatus(sim, near, 'slow', 0.3, 3, null);
    expect(near.slow).toBe(0);
  });

  it('shield: a cone soaks 40% of its health before taking damage', () => {
    const sim = newSim();
    quietWave(sim);
    const cone = foe(sim, 'cone', 100, 100);
    expect(cone.shield).toBeCloseTo(40, 9);
    damageEnemy(sim, cone, 39, 'physical', null, false, null);
    expect(cone.hp).toBe(100);
  });

  it('weaken: a dryer halves the attack speed of the cat with the highest damage that is not weakened yet, every 5 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    const gunner = put(sim, 7, 'r_gunner');
    const frost = put(sim, 8, 'm_frost');
    const paw = put(sim, 6, 'w_paw');
    foe(sim, 'dryer', 0, 1e9).frozen = true;
    foe(sim, 'dryer', 0, 1e9).frozen = true;
    const weakened = record(sim, 'weaken');
    advance(sim, 4.9);
    expect(weakened).toHaveLength(0);
    advance(sim, 0.2);
    expect(weakened.map((w) => w.unit.id).sort()).toEqual(['m_frost', 'r_gunner']);
    expect(weakened[0]!.duration).toBe(3);
    expect(weakened[0]!.by?.id).toBe('dryer');
    expect(gunner.weakened).toBeGreaterThan(2.7);
    expect(frost.weakened).toBeGreaterThan(2.7);
    expect(paw.weakened).toBe(0);
    advance(sim, 3.2);
    expect(gunner.weakened).toBe(0);
  });

  it('spray (elite): every 6 seconds a cat\'s cell is soaked for 3 seconds, announced first', () => {
    const sim = newSim();
    quietWave(sim);
    put(sim, 7, 'r_sling');
    put(sim, 12, 'r_sling');
    foe(sim, 'spray', 0, 1e9).frozen = true;
    const warns = record(sim, 'hazardWarn');
    const hazards = record(sim, 'hazard');
    advance(sim, 5.9);
    expect(warns).toHaveLength(0);
    advance(sim, 0.2);
    expect(warns).toHaveLength(1);
    expect(warns[0]).toMatchObject({ kind: 'wet', delay: 0.8 });
    expect(warns[0]!.cells).toHaveLength(1);
    expect([7, 12]).toContain(warns[0]!.cells[0]);
    advance(sim, 0.8);
    expect(hazards).toHaveLength(1);
    expect(hazards[0]!.duration).toBe(3);
    advance(sim, 6);
    expect(warns).toHaveLength(2);
  });

  it('firecracker: its bang speeds up enemies within 150 px by 50% for 2 seconds', () => {
    const sim = newSim();
    quietWave(sim);
    const cracker = foe(sim, 'firecracker', 300, 10);
    const near = foe(sim, 'cucumber', 290);
    const far = foe(sim, 'cucumber', 900);
    damageEnemy(sim, cracker, 100, 'magic', null, false, null);
    expect(near.hasted).toBe(true);
    expect(near.hasteAmount).toBe(0.5);
    expect(far.hasted).toBe(false);
    advance(sim, 2.1);
    expect(near.hasted).toBe(false);
  });

  it('uses the strongest speed bonus rather than adding them up, never beyond +60%', () => {
    const sim = newSim();
    quietWave(sim);
    const e = foe(sim, 'cucumber', 0);
    hasteEnemy(sim, e, 0.5, 5);
    sim.whirlUntil = sim.time + 5;
    sim.whirlSpeed = 0.4;
    advance(sim, 1);
    expect(e.travelled).toBeCloseTo(70 * 1.5, 0);
    hasteEnemy(sim, e, 0.9, 5);
    const t = e.travelled;
    advance(sim, 1);
    expect(e.travelled - t).toBeCloseTo(70 * 1.6, 0);
  });
});

describe('boss abilities', () => {
  it('enrage (king cucumber): faster with every health point lost, announced at half health', () => {
    const sim = bossWave(4);
    const boss = sim.boss!;
    expect(boss.id).toBe('boss_cucumber');
    const enrages = record(sim, 'enrage');
    const start = boss.travelled;
    advance(sim, 1);
    const base = boss.travelled - start;
    expect(base).toBeCloseTo(enemySpec('boss_cucumber').speed, 1);
    boss.maxHp = 1000;
    boss.hp = 400;
    damageEnemy(sim, boss, 1, 'magic', null, false, null);
    expect(enrages).toHaveLength(1);
    expect(boss.enraged).toBe(true);
    const t = boss.travelled;
    advance(sim, 1);
    expect(boss.travelled - t).toBeGreaterThan(base * (1 + BOSS_SPECS.enrage.maxBonus * 0.59));
    damageEnemy(sim, boss, 1, 'magic', null, false, null);
    expect(enrages).toHaveLength(1);
  });

  it('inhale (vacuum): every 12 seconds all cats are weakened for 3 and the boss takes half damage', () => {
    const sim = bossWave(8);
    const boss = sim.boss!;
    boss.hp = boss.maxHp = 1e9;
    const u = put(sim, 7, 'r_sling');
    const abilities = record(sim, 'bossAbility');
    const weakened = record(sim, 'weaken');
    advance(sim, 7.1);
    expect(abilities).toHaveLength(0);
    advance(sim, 1.3);
    expect(abilities).toEqual([{ enemy: boss, ability: 'inhale', duration: 3 }]);
    expect(weakened).toHaveLength(1);
    expect(u.weakened).toBeGreaterThan(1.5);
    expect(u.weakened).toBeLessThanOrEqual(3);
    const before = boss.hp;
    damageEnemy(sim, boss, 100, 'magic', null, false, null);
    expect(before - boss.hp).toBeCloseTo(50, 6);
    advance(sim, 3.2);
    const later = boss.hp;
    damageEnemy(sim, boss, 100, 'magic', null, false, null);
    expect(later - boss.hp).toBeCloseTo(100, 6);
    advance(sim, 12.5);
    expect(abilities.length).toBeGreaterThanOrEqual(2);
  });

  it('shortens every cooldown by 30% once enraged', () => {
    const sim = bossWave(8);
    const boss = sim.boss!;
    boss.maxHp = 1e9;
    boss.hp = 2e8;
    damageEnemy(sim, boss, 1, 'magic', null, false, null);
    expect(boss.enraged).toBe(true);
    const times: number[] = [];
    sim.events.on('bossAbility', () => times.push(sim.time));
    advance(sim, 40);
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect(times[2]! - times[1]!).toBeCloseTo(12 * 0.7, 1);
  });

  it('whirl (blender): every 10 seconds all enemies get 40% faster for 4 seconds', () => {
    const sim = bossWave(8, { chapter: 2 });
    expect(sim.boss!.id).toBe('boss_blender');
    sim.boss!.hp = sim.boss!.maxHp = 1e9;
    const e = foe(sim, 'cucumber', 200);
    const abilities = record(sim, 'bossAbility');
    advance(sim, 5.9);
    expect(abilities).toHaveLength(0);
    advance(sim, 0.3);
    expect(abilities).toEqual([{ enemy: sim.boss, ability: 'whirl', duration: 4 }]);
    const t = e.travelled;
    advance(sim, 1);
    expect(e.travelled - t).toBeCloseTo(70 * 1.4, 0);
    advance(sim, 4);
    const t2 = e.travelled;
    advance(sim, 1);
    expect(e.travelled - t2).toBeCloseTo(70, 0);
  });

  it('splash (bath): drops spawn three at a time, and two cells are soaked every 10 seconds', () => {
    const sim = bossWave(8, { chapter: 3 });
    expect(sim.boss!.id).toBe('boss_bath');
    sim.boss!.hp = sim.boss!.maxHp = 1e9;
    put(sim, 7, 'r_sling');
    put(sim, 12, 'r_sling');
    put(sim, 11, 'r_sling');
    const spawns = record(sim, 'enemySpawn');
    const warns = record(sim, 'hazardWarn');
    advance(sim, 2.9);
    expect(spawns).toHaveLength(0);
    advance(sim, 0.3);
    expect(spawns.map((s) => s.enemy.id)).toEqual(['drop', 'drop', 'drop']);
    advance(sim, 3);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.kind).toBe('wet');
    expect(warns[0]!.cells).toHaveLength(2);
    advance(sim, 5);
    expect(spawns.length).toBeGreaterThanOrEqual(6);
  });

  it('lightning (cloud): a 2x2 block of cells is zapped for 2.5 seconds, with a warning', () => {
    const sim = bossWave(8, { chapter: 4 });
    expect(sim.boss!.id).toBe('boss_cloud');
    sim.boss!.hp = sim.boss!.maxHp = 1e9;
    for (const c of [7, 8, 12, 13]) put(sim, c, 'r_sling');
    const warns = record(sim, 'hazardWarn');
    const zaps = record(sim, 'hazard');
    advance(sim, 5.3);
    expect(warns).toHaveLength(0);
    advance(sim, 0.3);
    expect(warns).toHaveLength(1);
    expect(warns[0]!.kind).toBe('zap');
    const cells = warns[0]!.cells;
    expect(cells.length).toBeGreaterThanOrEqual(1);
    expect(cells.length).toBeLessThanOrEqual(4);
    const cols = new Set(cells.map((c) => c % 5));
    const rows = new Set(cells.map((c) => Math.floor(c / 5)));
    expect(cols.size).toBeLessThanOrEqual(2);
    expect(rows.size).toBeLessThanOrEqual(2);
    advance(sim, 0.9);
    expect(zaps).toHaveLength(1);
    expect(zaps[0]!.duration).toBe(2.5);
    advance(sim, 0.1);
    const stood = cells.find((c) => sim.units[c]);
    expect(sim.units[stood!]!.blocked).toBe(true);
  });

  it('vaccinate (needle): slows are ignored for 5 seconds and the boss heals 1% per second', () => {
    const sim = bossWave(8, { chapter: 5 });
    const boss = sim.boss!;
    expect(boss.id).toBe('boss_needle');
    boss.maxHp = 1000;
    boss.hp = 600;
    const walker = foe(sim, 'cucumber', 300);
    applyStatus(sim, walker, 'slow', 0.3, 20, null);
    expect(walker.slow).toBe(0.3);
    const abilities = record(sim, 'bossAbility');
    advance(sim, 7);
    expect(abilities).toHaveLength(1);
    expect(walker.slow).toBe(0);
    const hp = boss.hp;
    applyStatus(sim, walker, 'slow', 0.3, 5, null);
    expect(walker.slow).toBe(0);
    advance(sim, 2);
    expect(boss.hp - hp).toBeCloseTo(1000 * 0.01 * 2, 0);
    advance(sim, 3.5);
    applyStatus(sim, walker, 'slow', 0.3, 5, null);
    expect(walker.slow).toBe(0.3);
  });

  it('gives each chapter its own boss in the boss waves', () => {
    const bosses = ['boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle'];
    bosses.forEach((id, i) => {
      const sim = bossWave(16, { chapter: i + 1 });
      expect(sim.boss!.id).toBe(id);
    });
  });

  it('makes elites half-stunnable and bosses immune, as the rules say', () => {
    const elite = bossWave(4);
    applyStatus(elite, elite.boss!, 'stun', 1, 2, null);
    expect(elite.boss!.stunUntil - elite.time).toBeCloseTo(1, 9);
    const boss = bossWave(8);
    applyStatus(boss, boss.boss!, 'stun', 1, 2, null);
    applyStatus(boss, boss.boss!, 'freeze', 1, 2, null);
    expect(boss.boss!.stunned || boss.boss!.frozen).toBe(false);
  });
});
