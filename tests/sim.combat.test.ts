import { describe, expect, it } from 'vitest';
import type { EnemyId } from '@/game/api';
import { FIELD_H, cellCenterX, cellCenterY } from '@/game/geometry';
import { CC_IMMUNE_AFTER, LASER_DURATION, TICK } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { unitSpec } from '@/game/data/units';
import { applyStatus, damageEnemy } from '@/game/sim/enemies';
import { gainRelic } from '@/game/sim/flow';
import { pickHazardCells, scheduleHazard, weakenUnit } from '@/game/sim/hazards';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, record } from './simHelpers';

/** A frozen enemy standing at a chosen spot. */
function at(sim: Sim, id: EnemyId, x: number, y: number, hp = 1e9, travelled = 100): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true; // never walks, so the chosen position stays
  e.x = x;
  e.y = y;
  return e;
}

function field(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  quietWave(sim);
  return sim;
}

/** A target dummy with modest health so float rounding stays far below the test tolerance. */
const dummy = (sim: Sim, id: EnemyId): SimEnemy => foe(sim, id, 0, 1e5);

const raw = (sim: Sim, e: SimEnemy, amount: number, type: 'physical' | 'magic' = 'physical'): number => {
  const before = e.hp + e.shield;
  damageEnemy(sim, e, amount, type, null, false, null);
  return before - (e.hp + e.shield);
};

describe('damage formula', () => {
  it('applies armour to physical damage and ward to magic damage', () => {
    const sim = field();
    expect(raw(sim, dummy(sim, 'roomba'), 100)).toBeCloseTo(65, 9);
    expect(raw(sim, dummy(sim, 'roomba'), 100, 'magic')).toBeCloseTo(100, 9);
    expect(raw(sim, dummy(sim, 'tangerine'), 100, 'magic')).toBeCloseTo(65, 9);
    // The tangerine's own armour is the 8% of an ordinary enemy (its ward of 35% is the thing it is known for).
    expect(raw(sim, dummy(sim, 'tangerine'), 100)).toBeCloseTo(100 * (1 - 0.08), 9);
  });

  it('lets armour break, warrior ignore and the scratcher cut the armour', () => {
    const sim = field();
    const broken = dummy(sim, 'roomba');
    applyStatus(sim, broken, 'armor_break', 0.5, 5, null);
    expect(raw(sim, broken, 100)).toBeCloseTo(100 * (1 - 0.35 * 0.5), 9);
    const warrior = put(sim, 0, 'w_paw');
    warrior.armorIgnore = 0.4;
    const e = dummy(sim, 'roomba');
    damageEnemy(sim, e, 100, 'physical', warrior, false, null);
    expect(1e5 - e.hp).toBeCloseTo(100 * (1 - 0.35 * 0.6), 9);
    gainRelic(sim, 'scratcher');
    // The scratcher cuts every armour and ward by 40% (v1.7: it was 20%).
    expect(raw(sim, dummy(sim, 'roomba'), 100)).toBeCloseTo(100 * (1 - 0.35 * 0.6), 9);
    expect(raw(sim, dummy(sim, 'tangerine'), 100, 'magic')).toBeCloseTo(100 * (1 - 0.35 * 0.6), 9);
  });

  it('lets armour break, armour ignore and the scratcher cut the ward in the same proportion as the armour (v1.5)', () => {
    const sim = field();
    const warded = (): SimEnemy => dummy(sim, 'tangerine');
    const lost = (e: SimEnemy): number => 1e5 - e.hp;
    // An armour break on the enemy.
    const broken = warded();
    applyStatus(sim, broken, 'armor_break', 0.5, 5, null);
    expect(raw(sim, broken, 100, 'magic')).toBeCloseTo(100 * (1 - 0.35 * 0.5), 9);
    // The armour ignore of the cat that hits, for magic and physical alike.
    const cat = put(sim, 0, 'm_snow');
    cat.armorIgnore = 0.4;
    const e = warded();
    damageEnemy(sim, e, 100, 'magic', cat, false, null);
    expect(lost(e)).toBeCloseTo(100 * (1 - 0.35 * 0.6), 9);
    const roomba = dummy(sim, 'roomba');
    damageEnemy(sim, roomba, 100, 'physical', cat, false, null);
    expect(lost(roomba)).toBeCloseTo(100 * (1 - 0.35 * 0.6), 9);
    // All three at once, and a damage-over-time tick of the same cat.
    const both = warded();
    applyStatus(sim, both, 'armor_break', 0.5, 5, null);
    damageEnemy(sim, both, 100, 'magic', cat, false, null);
    expect(lost(both)).toBeCloseTo(100 * (1 - 0.35 * 0.5 * 0.6), 9);
    gainRelic(sim, 'scratcher');
    cat.armorIgnore = 0.4; // a relic recomputes the stats and puts the ignore of the synergy (none) back
    const toy = warded();
    applyStatus(sim, toy, 'armor_break', 0.5, 5, null);
    damageEnemy(sim, toy, 100, 'magic', cat, false, null);
    expect(lost(toy)).toBeCloseTo(100 * (1 - 0.35 * 0.6 * 0.5 * 0.6), 9);
    const burn = warded();
    applyStatus(sim, burn, 'burn', 100, 3, cat);
    applyStatus(sim, burn, 'armor_break', 0.5, 5, null);
    advance(sim, 0.52);
    expect(lost(burn)).toBeCloseTo(100 * 0.5 * (1 - 0.35 * 0.6 * 0.5 * 0.6), 6);
  });

  it('breaks no armour on an enemy without any (a ward of 0 stays 0 whatever the break and the ignore)', () => {
    const sim = field();
    const cat = put(sim, 0, 'w_paw');
    cat.armorIgnore = 0.9;
    // The firecracker is the one enemy with no defence at all (every ordinary enemy has 5 to 10% armour since the 2026-10-10 batch).
    const bare = dummy(sim, 'firecracker');
    applyStatus(sim, bare, 'armor_break', 0.9, 5, null);
    damageEnemy(sim, bare, 100, 'magic', cat, false, null);
    damageEnemy(sim, bare, 100, 'physical', cat, false, null);
    expect(1e5 - bare.hp).toBeCloseTo(200, 9);
    // A cucumber has a ward of 0 (the magic hit stays whole) and 8% armour, which the break and the ignore cut like any other.
    const e = dummy(sim, 'cucumber');
    applyStatus(sim, e, 'armor_break', 0.9, 5, null);
    damageEnemy(sim, e, 100, 'magic', cat, false, null);
    damageEnemy(sim, e, 100, 'physical', cat, false, null);
    expect(1e5 - e.hp).toBeCloseTo(100 + 100 * (1 - 0.08 * (1 - 0.9) * (1 - 0.9)), 9);
  });

  it('multiplies vulnerability, laser focus and the heating pad, capped at 2x', () => {
    const sim = field();
    gainRelic(sim, 'heating_pad');
    const e = dummy(sim, 'cucumber');
    applyStatus(sim, e, 'vulnerable', 0.25, 5, null);
    // The cucumber's 8% armour comes off first; the multipliers (and their cap of 2x) apply to what is left.
    const armoured = 100 * (1 - 0.08);
    expect(raw(sim, e, 100)).toBeCloseTo(armoured * 1.25, 9);
    e.focused = true;
    expect(raw(sim, e, 100)).toBeCloseTo(armoured * 1.25 * 1.15, 9);
    applyStatus(sim, e, 'slow', 0.2, 5, null);
    expect(raw(sim, e, 100)).toBeCloseTo(armoured * 1.25 * 1.15 * 1.15, 9);
    applyStatus(sim, e, 'vulnerable', 0.6, 5, null);
    expect(raw(sim, e, 100)).toBeCloseTo(armoured * 2, 9);
  });

  it('soaks damage with a shield first and announces the break once', () => {
    const sim = field();
    const hits = record(sim, 'hit');
    const breaks = record(sim, 'shieldBreak');
    const cone = foe(sim, 'cone', 0, 100);
    expect(cone.maxShield).toBeCloseTo(100 * enemySpec('cone').shield!, 9);
    damageEnemy(sim, cone, 30, 'magic', null, false, null);
    expect(cone.hp).toBe(100);
    expect(cone.shield).toBeCloseTo(10, 9);
    damageEnemy(sim, cone, 30, 'magic', null, false, null);
    expect(cone.shield).toBe(0);
    expect(cone.hp).toBeCloseTo(80, 9);
    expect(hits.map((h) => h.absorbed)).toEqual([30, 10]);
    expect(breaks).toHaveLength(1);
  });

  it('kills at zero health, pays the bounty with the collar bonus and counts the kill', () => {
    const sim = field();
    gainRelic(sim, 'bell_collar');
    const deaths = record(sim, 'enemyDie');
    const fish = sim.fish;
    const e = foe(sim, 'roomba', 0, 10);
    expect(damageEnemy(sim, e, 1000, 'magic', null, false, null)).toBe(true);
    expect(sim.enemies).not.toContain(e);
    expect(sim.fish - fish).toBe(6);
    expect(deaths[0]!.fish).toBe(6);
    expect(sim.getStats().kills).toBe(1);
    const small = foe(sim, 'dust', 0, 10);
    damageEnemy(sim, small, 1000, 'magic', null, false, null);
    damageEnemy(sim, foe(sim, 'dust', 0, 10), 1000, 'magic', null, false, null);
    damageEnemy(sim, foe(sim, 'dust', 0, 10), 1000, 'magic', null, false, null);
    // 1.2 fish per dust: whole fish are paid as the fractions add up.
    expect(sim.fish - fish).toBe(6 + 3);
  });

  it('rolls crits at the moment of impact from the combat stream', () => {
    const sim = field();
    const u = put(sim, 7, 'r_sling');
    u.stats.crit = 1;
    u.stats.critMult = 3;
    at(sim, 'cucumber', 400, 256, 1e9, 500);
    const hits = record(sim, 'hit');
    advance(sim, 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.crit)).toBe(true);
    expect(hits[0]!.amount).toBeCloseTo(u.stats.damage * 3 * (1 - 0.08), 6);
  });
});

describe('statuses', () => {
  it('keeps only the strongest slow, the longer duration, and caps it at 50% (25% for elites and bosses)', () => {
    const sim = field();
    const e = foe(sim, 'cucumber');
    applyStatus(sim, e, 'slow', 0.3, 1, null);
    applyStatus(sim, e, 'slow', 0.2, 5, null);
    expect(e.slow).toBeCloseTo(0.3, 9);
    expect(e.slowUntil).toBeCloseTo(sim.time + 5, 9);
    applyStatus(sim, e, 'slow', 0.9, 1, null);
    expect(e.slow).toBe(0.5);
    const boss = foe(sim, 'boss_vacuum');
    applyStatus(sim, boss, 'slow', 0.4, 1, null);
    expect(boss.slow).toBe(0.25);
    const spray = foe(sim, 'spray');
    applyStatus(sim, spray, 'slow', 0.4, 1, null);
    expect(spray.slow).toBe(0.25);
  });

  it('makes slows 30 percent stronger with the heating pad but keeps the cap', () => {
    const sim = field();
    gainRelic(sim, 'heating_pad');
    const e = foe(sim, 'cucumber');
    applyStatus(sim, e, 'slow', 0.3, 1, null);
    expect(e.slow).toBeCloseTo(0.39, 9);
    applyStatus(sim, e, 'slow', 0.45, 1, null);
    expect(e.slow).toBe(0.5);
  });

  it('stops walkers while stunned, halves it on elites, ignores bosses, and grants a window of immunity (4 seconds) to stun and freeze alike', () => {
    const sim = field();
    const e = foe(sim, 'cucumber');
    const before = e.travelled;
    applyStatus(sim, e, 'stun', 1, 1, null);
    expect(e.stunned).toBe(true);
    advance(sim, 0.5);
    expect(e.travelled).toBe(before);
    advance(sim, 0.6);
    expect(e.stunned).toBe(false);
    expect(e.travelled).toBeGreaterThan(before);
    applyStatus(sim, e, 'stun', 1, 1, null);
    applyStatus(sim, e, 'freeze', 1, 1, null);
    expect(e.stunned || e.frozen).toBe(false);
    advance(sim, CC_IMMUNE_AFTER - 1);
    applyStatus(sim, e, 'freeze', 1, 1, null);
    expect(e.frozen).toBe(false);
    advance(sim, 1.1);
    applyStatus(sim, e, 'freeze', 1, 1, null);
    expect(e.frozen).toBe(true);
    const elite = foe(sim, 'spray');
    applyStatus(sim, elite, 'stun', 1, 2, null);
    expect(elite.stunUntil).toBeCloseTo(sim.time + 1, 9);
    const boss = foe(sim, 'boss_cloud');
    applyStatus(sim, boss, 'stun', 1, 2, null);
    applyStatus(sim, boss, 'freeze', 1, 2, null);
    expect(boss.stunned || boss.frozen).toBe(false);
  });

  it('ticks burn, poison and bleed every half second, keeping the stronger damage per second', () => {
    const sim = field();
    const e = foe(sim, 'cucumber');
    const hits = record(sim, 'hit');
    applyStatus(sim, e, 'burn', 10, 2, null);
    applyStatus(sim, e, 'burn', 4, 2, null);
    expect(e.burnDps).toBe(10);
    applyStatus(sim, e, 'poison', 20, 2, null);
    applyStatus(sim, e, 'bleed', 8, 2, null);
    advance(sim, 1.01);
    const ticks = hits.filter((h) => h.dot);
    expect(ticks.filter((h) => h.dot === 'burn')).toHaveLength(2);
    expect(ticks.find((h) => h.dot === 'burn')!.amount).toBeCloseTo(5, 9);
    expect(ticks.find((h) => h.dot === 'poison')!.amount).toBeCloseTo(10, 9);
    expect(ticks.find((h) => h.dot === 'bleed')!.type).toBe('physical');
    expect(ticks.find((h) => h.dot === 'burn')!.type).toBe('magic');
    expect(ticks.every((h) => h.unitId === null)).toBe(true);
    advance(sim, 2);
    expect(e.burning || e.poisoned || e.bleeding).toBe(false);
  });

  it('lengthens the magic statuses of every cat with the mage synergy, and never the other statuses', () => {
    const sim = field();
    put(sim, 0, 'm_fire');
    put(sim, 1, 'm_storm');
    put(sim, 2, 'm_frost');
    expect(sim.synergyTier('mage')).toBe(2);
    const mage = sim.units[0]!;
    const paw = put(sim, 5, 'w_paw');
    for (const src of [mage, paw]) {
      const e = foe(sim, 'cucumber');
      applyStatus(sim, e, 'slow', 0.2, 2, src);
      expect(e.slowUntil - sim.time, src.id).toBeCloseTo(2 * 1.2, 9);
      const f = foe(sim, 'cucumber');
      applyStatus(sim, f, 'armor_break', 0.2, 2, src);
      expect(f.breakUntil - sim.time, src.id).toBeCloseTo(2, 9);
    }
  });

  it('makes pills\' neighbours immune to slows and heals them, and clocks speed their neighbours up', () => {
    const sim = field();
    const pill = at(sim, 'pill', 200, 44);
    const near = at(sim, 'cucumber', 230, 44, 1000);
    near.hp = 500;
    const far = at(sim, 'cucumber', 600, 600, 1000);
    far.hp = 500;
    advance(sim, 1);
    applyStatus(sim, near, 'slow', 0.3, 5, null);
    applyStatus(sim, far, 'slow', 0.3, 5, null);
    expect(near.slow).toBe(0);
    expect(far.slow).toBe(0.3);
    expect(near.hp).toBeGreaterThan(500);
    expect(far.hp).toBe(500);
    expect(pill.hp).toBe(1e9);
    const clock = at(sim, 'clock', 200, 44);
    const walker = foe(sim, 'cucumber', 100);
    walker.x = 230;
    walker.y = 44;
    advance(sim, 0.3);
    expect(walker.hasted).toBe(true);
    expect(walker.hasteAmount).toBeCloseTo(0.3, 9);
    expect(clock.hasted).toBe(false);
  });
});

describe('who a cat attacks', () => {
  it('goes for the enemy that has travelled furthest', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const young = at(sim, 'cucumber', 400, 100, 1e9, 100);
    const old = at(sim, 'cucumber', 300, 100, 1e9, 900);
    const attacks = record(sim, 'attack');
    advance(sim, 1.5);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === old.uid)).toBe(true);
    expect(young.hp).toBe(1e9);
  });

  it('lets the gunslinger pick the sturdiest enemy', () => {
    const sim = field();
    put(sim, 7, 'r_gunner');
    at(sim, 'cucumber', 400, 100, 1000, 900);
    const tough = at(sim, 'cucumber', 300, 100, 5000, 100);
    const attacks = record(sim, 'attack');
    advance(sim, 2.5);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === tough.uid)).toBe(true);
  });

  it('keeps the gauge full while nothing is in range and fires on the tick a target appears', () => {
    const sim = field();
    const u = put(sim, 0, 'w_paw');
    advance(sim, 3);
    expect(u.charge).toBe(1);
    const attacks = record(sim, 'attack');
    at(sim, 'cucumber', 150, 60);
    sim.step(TICK);
    expect(attacks).toHaveLength(1);
    expect(u.charge).toBeLessThan(1);
  });

  it('only reaches enemies within range plus their body', () => {
    const sim = field();
    put(sim, 0, 'w_paw');
    const range = sim.units[0]!.stats.range;
    const radius = enemySpec('cucumber').radius;
    const x = cellCenterX(0);
    const y = cellCenterY(0);
    at(sim, 'cucumber', x + range + radius + 3, y);
    const attacks = record(sim, 'attack');
    advance(sim, 2);
    expect(attacks).toHaveLength(0);
    at(sim, 'cucumber', x + range + radius - 3, y);
    advance(sim, 1);
    expect(attacks.length).toBeGreaterThan(0);
  });

  it('breaks ties by the smaller uid', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const a = at(sim, 'cucumber', 300, 100, 1e9, 500);
    at(sim, 'cucumber', 320, 100, 1e9, 500);
    const attacks = record(sim, 'attack');
    advance(sim, 1.5);
    expect(attacks[0]!.targetUid).toBe(a.uid);
  });
});

describe('attack shapes', () => {
  it('swings the sword at the target and its nearest neighbours only, as many as its data says', () => {
    const sim = field();
    put(sim, 0, 'w_sword');
    const attack = unitSpec('w_sword').attack;
    if (attack.shape !== 'cleave') throw new Error('the sword cleaves');
    const x = cellCenterX(0);
    const y = cellCenterY(0);
    const target = at(sim, 'cucumber', x + 100, y, 1e9, 900);
    for (let i = 1; i <= attack.targets + 2; i++) at(sim, 'cucumber', x + 100 + i * 12, y, 1e9, 100 + i);
    const hits = record(sim, 'hit');
    advance(sim, 0.6);
    expect(hits).toHaveLength(attack.targets);
    expect(hits.map((h) => h.enemy.uid)).toContain(target.uid);
  });

  it('cuts everything along the path around a samurai target and makes it bleed', () => {
    const sim = field();
    put(sim, 0, 'w_samurai');
    const x = cellCenterX(0);
    const y = cellCenterY(0);
    const target = at(sim, 'cucumber', x + 100, y, 1e9, 1000);
    const behind = at(sim, 'cucumber', x + 110, y, 1e9, 920);
    const far = at(sim, 'cucumber', x + 120, y, 1e9, 800);
    const hits = record(sim, 'hit');
    advance(sim, 0.8);
    const struck = new Set(hits.map((h) => h.enemy.uid));
    expect(struck.has(target.uid) && struck.has(behind.uid)).toBe(true);
    expect(struck.has(far.uid)).toBe(false);
    expect(target.bleeding).toBe(true);
  });

  it('stuns and breaks the armour of everything in range on every 4th tiger attack', () => {
    const sim = field();
    put(sim, 7, 'w_tiger');
    const e = at(sim, 'cucumber', cellCenterX(7) + 150, cellCenterY(7), 1e9, 500);
    const decoy = at(sim, 'roomba', cellCenterX(7) - 150, cellCenterY(7), 1e9, 100);
    let attacks = 0;
    sim.events.on('attack', () => {
      attacks++;
    });
    for (let i = 0; i < 60 * 8 && attacks < 4; i++) {
      sim.step(TICK);
      if (attacks < 4) expect(e.stunned).toBe(false);
    }
    expect(attacks).toBe(4);
    expect(e.stunned).toBe(true);
    expect(decoy.stunned).toBe(true);
    expect(decoy.armorBroken).toBe(true);
    expect(decoy.breakAmount).toBe(0.5);
  });

  it('throws one star at each of three different enemies', () => {
    const sim = field();
    put(sim, 7, 'r_ninja');
    for (let i = 0; i < 5; i++) at(sim, 'cucumber', 380 + i * 5, 90, 1e9, 100 + i);
    const attacks = record(sim, 'attack');
    advance(sim, 0.7);
    const first = attacks.slice(0, 3);
    expect(first).toHaveLength(3);
    expect(new Set(first.map((a) => a.targetUid)).size).toBe(3);
    expect(first.every((a) => a.projectile !== null)).toBe(true);
  });

  it('pierces the target and the one behind it, and explodes what it kills for a quarter of the hit', () => {
    const sim = field();
    put(sim, 7, 'r_star');
    const y = cellCenterY(7);
    const x = cellCenterX(7);
    const target = at(sim, 'cucumber', x + 100, y, 1, 900);
    const second = at(sim, 'cucumber', x + 160, y + 10, 1e9, 800);
    const third = at(sim, 'cucumber', x + 230, y - 10, 1e9, 700);
    const hits = record(sim, 'hit');
    advance(sim, 0.5);
    const ids = hits.filter((h) => h.unitId === 'r_star').map((h) => h.enemy.uid);
    expect(ids).toContain(target.uid);
    expect(ids).toContain(second.uid);
    expect(ids).not.toContain(third.uid);
    // Every enemy here is a cucumber: its 8% armour comes off each hit the star deals.
    const spec = sim.units[7]!.stats.damage * (1 - 0.08);
    expect(hits.find((h) => h.enemy.uid === second.uid && !h.crit && Math.abs(h.amount - spec * 0.25) < 1e-6)).toBeDefined();
    expect(hits.find((h) => h.enemy.uid === second.uid && !h.crit && Math.abs(h.amount - spec * 0.5) < 1e-6)).toBeUndefined();
  });

  it('chains lightning across up to four enemies, weaker at every jump', () => {
    const sim = field();
    put(sim, 7, 'm_storm');
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    for (let i = 0; i < 5; i++) at(sim, 'cucumber', x + 60 + i * 90, y, 1e9, 900 - i * 10);
    const hits = record(sim, 'hit');
    advance(sim, 0.6);
    expect(hits).toHaveLength(4);
    const base = hits[0]!.amount;
    expect(hits.map((h) => h.amount / base)).toEqual([1, 0.8, 0.8 * 0.8, 0.8 * 0.8 * 0.8].map((v) => expect.closeTo(v, 9)));
  });

  it('splashes a snowball and slows everything it touches', () => {
    const sim = field();
    put(sim, 7, 'm_snow');
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    const a = at(sim, 'cucumber', x + 200, y, 1e9, 900);
    const b = at(sim, 'cucumber', x + 220, y + 20, 1e9, 800);
    const c = at(sim, 'cucumber', x + 200, y + 300 - 150, 1e9, 700);
    advance(sim, 1.5);
    expect(a.slow).toBeCloseTo(0.2, 9);
    expect(b.slow).toBeCloseTo(0.2, 9);
    expect(c.slow).toBe(0);
  });

  it('lights a burning area with the fire cat, ticking from the damage per second of the unit', () => {
    const sim = field();
    const u = put(sim, 7, 'm_fire');
    const e = at(sim, 'cucumber', cellCenterX(7) + 200, cellCenterY(7), 1e9, 900);
    advance(sim, 1.8);
    expect(e.burning).toBe(true);
    expect(e.burnDps).toBeCloseTo(0.3 * (u.stats.damage / u.stats.interval), 9);
  });

  it('casts a blizzard that slows, damages and sometimes freezes for its whole duration', () => {
    const sim = field();
    put(sim, 7, 'm_frost');
    const e = at(sim, 'cucumber', cellCenterX(7) + 200, cellCenterY(7), 1e9, 900);
    const starts = record(sim, 'zoneStart');
    const ends = record(sim, 'zoneEnd');
    const hits = record(sim, 'hit');
    advance(sim, 1.5);
    expect(starts.length).toBeGreaterThan(0);
    expect(e.slow).toBeCloseTo(0.4, 9);
    expect(hits.length).toBeGreaterThan(0);
    expect(sim.zones.length).toBeGreaterThan(0);
    advance(sim, 4.5);
    expect(ends.length).toBeGreaterThan(0);
  });

  it('drags enemies back with the black hole and then blows it up', () => {
    const sim = field();
    put(sim, 7, 'm_cosmo');
    const e = foe(sim, 'cucumber', 300);
    const walk = enemySpec('cucumber').speed;
    const t0 = sim.time;
    const pulls = record(sim, 'pull');
    const hits = record(sim, 'hit');
    const strikes = record(sim, 'strike');
    advance(sim, 2);
    expect(pulls.length).toBeGreaterThan(0);
    expect(e.travelled).toBeLessThan(300 + walk * (sim.time - t0) - 30);
    advance(sim, 1);
    expect(strikes.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.amount === sim.units[7]!.stats.damage)).toBe(true);
  });

  it('brews a cloud that makes enemies take more damage and poisons them', () => {
    const sim = field();
    put(sim, 7, 't_alch');
    const e = at(sim, 'cucumber', cellCenterX(7) + 200, cellCenterY(7), 1e9, 900);
    advance(sim, 2.2);
    expect(e.vulnerable).toBe(true);
    expect(e.vulnAmount).toBeCloseTo(0.25, 9);
    expect(e.poisoned).toBe(true);
  });

  it('rains coins on every enemy every 12 seconds from the lucky cat', () => {
    const sim = field();
    put(sim, 7, 't_lucky');
    const near = at(sim, 'cucumber', cellCenterX(7) + 200, cellCenterY(7), 1e9, 200);
    const far = at(sim, 'cucumber', 700, 600, 1e9, 100);
    const strikes = record(sim, 'strike');
    advance(sim, 11.9);
    expect(strikes.filter((st) => st.unitId === 't_lucky')).toHaveLength(0);
    expect(far.hp).toBe(1e9);
    advance(sim, 0.3);
    const rain = strikes.filter((st) => st.unitId === 't_lucky');
    expect(rain).toHaveLength(1);
    expect(rain[0]!.points.map((p) => p.uid).sort()).toEqual([near.uid, far.uid].sort());
    expect(far.hp).toBeLessThan(1e9);
    expect(far.slow).toBeCloseTo(0.3, 9);
  });
});

describe('neighbour auras', () => {
  it('speeds up neighbours with a bell, and two bells do not add up', () => {
    const sim = field();
    const paw = put(sim, 18, 'w_paw');
    const base = paw.stats.interval;
    put(sim, 17, 't_bell');
    expect(paw.stats.interval).toBeCloseTo(base / 1.08, 9);
    expect(paw.buffAttackSpeed).toBeCloseTo(0.08, 9);
    put(sim, 19, 't_bell');
    expect(paw.stats.interval).toBeCloseTo(base / 1.08, 9);
    const stranger = put(sim, 0, 'w_paw');
    expect(stranger.buffAttackSpeed).toBe(0);
  });

  it('strengthens the cats around a bard by 15%, and two bards do not add up', () => {
    const sim = field();
    const paw = put(sim, 16, 'w_paw');
    const base = paw.stats.damage;
    put(sim, 15, 't_bard');
    expect(paw.stats.damage).toBeCloseTo(base * 1.15, 9);
    put(sim, 17, 't_bard');
    expect(paw.stats.damage).toBeCloseTo(base * 1.15, 9);
    expect(paw.buffDamage).toBeCloseTo(0.15, 9);
  });

  it('gives every cat +20% attack speed with a lucky cat, without stacking', () => {
    const sim = field();
    const paw = put(sim, 0, 'w_paw');
    const base = paw.stats.interval;
    put(sim, 3, 't_lucky');
    expect(paw.stats.interval).toBeCloseTo(base / 1.2, 9);
    put(sim, 4, 't_lucky');
    expect(paw.stats.interval).toBeCloseTo(base / 1.2, 9);
  });

  it('pays one fish per chef in range per kill, at most 12 per wave across the board', () => {
    const sim = field();
    put(sim, 7, 't_chef');
    put(sim, 8, 't_chef');
    const fish = sim.fish;
    const x = cellCenterX(7);
    const y = cellCenterY(7);
    for (let i = 0; i < 4; i++) {
      const e = at(sim, 'dust', x + 100, y, 1, 100);
      damageEnemy(sim, e, 100, 'magic', null, false, null);
    }
    const dust = enemySpec('dust').bounty;
    expect(sim.fish - fish).toBe(4 * 2 + 4 * dust);
    for (let i = 0; i < 10; i++) damageEnemy(sim, at(sim, 'cucumber', x + 100, y, 1, 100), 100, 'magic', null, false, null);
    expect(sim.chefFish).toBe(12);
    const far = at(sim, 'cucumber', 700, 600, 1, 100);
    const before = sim.fish;
    damageEnemy(sim, far, 100, 'magic', null, false, null);
    expect(sim.fish - before).toBe(enemySpec('cucumber').bounty);
  });
});

describe('hazards', () => {
  const dodging = (sim: Sim, roll: number): void => {
    sim.rng.combat.next = () => roll;
  };

  it('warns 0.8 seconds ahead, then stops the cat on that cell until the hazard ends', () => {
    const sim = field();
    const u = put(sim, 7, 'r_sling');
    const warns = record(sim, 'hazardWarn');
    const starts = record(sim, 'hazard');
    const ends = record(sim, 'hazardEnd');
    scheduleHazard(sim, 'wet', [7], 2);
    expect(warns).toEqual([{ cells: [7], kind: 'wet', delay: 0.8 }]);
    advance(sim, 0.7);
    expect(starts).toHaveLength(0);
    advance(sim, 0.2);
    expect(starts).toEqual([{ cells: [7], kind: 'wet', duration: 2 }]);
    expect(sim.hazards).toHaveLength(1);
    advance(sim, 0.1);
    expect(u.blocked).toBe(true);
    at(sim, 'cucumber', 400, 100, 1e9, 500);
    const attacks = record(sim, 'attack');
    advance(sim, 1.5);
    expect(attacks).toHaveLength(0);
    advance(sim, 0.5);
    expect(ends).toEqual([{ cells: [7], kind: 'wet' }]);
    expect(sim.hazards).toHaveLength(0);
    advance(sim, 1);
    expect(u.blocked).toBe(false);
    expect(attacks.length).toBeGreaterThan(0);
  });

  it('sticks to the cell: moving away frees the cat after 0.3 seconds and the newcomer is stuck', () => {
    const sim = field();
    const u = put(sim, 7, 'r_sling');
    scheduleHazard(sim, 'zap', [7], 5);
    advance(sim, 1);
    expect(u.blocked).toBe(true);
    expect(sim.drop(7, 8)).toBeNull();
    sim.step(TICK);
    expect(u.blocked).toBe(true);
    advance(sim, 0.35);
    expect(u.blocked).toBe(false);
    const newcomer = put(sim, 7, 'r_archer');
    sim.step(TICK);
    expect(newcomer.blocked).toBe(true);
  });

  it('lets the bell kitten and the cats around it dodge a wet or zap cell by chance, and shows each dodge', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    put(sim, 8, 't_bell');
    put(sim, 18, 'w_paw');
    expect(sim.units[7]!.shielded).toBe(true);
    expect(sim.units[7]!.dodge).toBeCloseTo(0.4, 9);
    expect(sim.units[8]!.dodge).toBeCloseTo(0.4, 9);
    expect(sim.units[18]!.dodge).toBe(0);
    // Cells next to a bell are targets like any other now.
    const seen = new Set<number>();
    for (let i = 0; i < 300; i++) for (const c of pickHazardCells(sim, 1)) seen.add(c);
    expect([...seen].sort((a, b) => a - b)).toEqual([7, 8, 18]);

    const dodges = record(sim, 'dodge');
    const starts = record(sim, 'hazard');
    dodging(sim, 0.39);
    scheduleHazard(sim, 'wet', [7, 8, 18], 3);
    advance(sim, 1.2);
    expect(dodges.map((d) => [d.unit.cell, d.hazard])).toEqual([[7, 'wet'], [8, 'wet']]);
    expect(starts).toEqual([{ cells: [18], kind: 'wet', duration: 3 }]);
    expect(sim.units[7]!.blocked).toBe(false);
    expect(sim.units[8]!.blocked).toBe(false);
    expect(sim.units[18]!.blocked).toBe(true);
    expect(sim.hazards.map((h) => h.cell)).toEqual([18]);
    advance(sim, 3);
    expect(sim.hazards).toHaveLength(0);

    dodges.length = 0;
    dodging(sim, 0.41);
    scheduleHazard(sim, 'zap', [7, 8], 3);
    advance(sim, 1.2);
    expect(dodges).toHaveLength(0);
    expect(sim.units[7]!.blocked).toBe(true);
    expect(sim.units[8]!.blocked).toBe(true);
  });

  it('weakens a cat to half attack speed for the duration, and the effect follows it', () => {
    const sim = field();
    const u = put(sim, 7, 'r_sling');
    const base = u.stats.interval;
    const events = record(sim, 'weaken');
    weakenUnit(sim, u, 3, null);
    sim.statsDirty = true;
    sim.step(TICK);
    expect(u.stats.interval).toBeCloseTo(base * 2, 9);
    expect(events).toHaveLength(1);
    sim.drop(7, 12);
    sim.step(TICK);
    expect(u.stats.interval).toBeGreaterThan(base * 1.5);
    advance(sim, 3.1);
    expect(u.weakened).toBe(0);
    expect(u.stats.interval).toBeLessThan(base * 1.1);
  });
});

describe('laser pointer', () => {
  it('makes a cat aim at the candidate closest to the dot and marks enemies within 130 as vulnerable', () => {
    const sim = field();
    put(sim, 7, 'r_sling');
    const old = at(sim, 'cucumber', 300, 100, 1e9, 900);
    const young = at(sim, 'cucumber', 450, 100, 1e9, 100);
    const lasers = record(sim, 'laser');
    expect(sim.setLaser(455, 110)).toBeNull();
    expect(lasers).toHaveLength(1);
    expect(sim.laser.active).toBe(true);
    const attacks = record(sim, 'attack');
    const hits = record(sim, 'hit');
    advance(sim, 1.3);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.targetUid === young.uid)).toBe(true);
    expect(young.focused).toBe(true);
    expect(old.focused).toBe(false);
    const dmg = sim.units[7]!.stats.damage;
    expect(hits.find((h) => !h.crit)!.amount).toBeCloseTo(dmg * (1 - 0.08) * 1.15, 6);
  });

  it('moves the dot when called again, lasts 6.5 seconds and then needs 15 seconds', () => {
    const sim = field();
    const ends = record(sim, 'laserEnd');
    expect(sim.setLaser(100, 100)).toBeNull();
    expect(sim.laser.duration).toBe(LASER_DURATION);
    expect(LASER_DURATION).toBe(6.5);
    advance(sim, 1);
    expect(sim.setLaser(200, 220)).toBeNull();
    expect(sim.laser.x).toBe(200);
    expect(sim.laser.y).toBe(220);
    advance(sim, LASER_DURATION - 1.1);
    expect(sim.laser.active).toBe(true);
    advance(sim, 0.2);
    expect(sim.laser.active).toBe(false);
    expect(ends).toHaveLength(1);
    expect(sim.laser.cooldown).toBeGreaterThan(14.5);
    expect(sim.laser.cooldown).toBeLessThanOrEqual(15);
    expect(sim.setLaser(1, 1)).toBe('on_cooldown');
    advance(sim, 14.8);
    expect(sim.setLaser(1, 1)).toBe('on_cooldown');
    advance(sim, 0.4);
    expect(sim.setLaser(1, 1)).toBeNull();
  });

  it('shortens the cooldown with training and the daily rule, and clamps the dot to the field', () => {
    const trained = newSim({ loadout: { unitLevels: {}, training: { laser_cd: 5 }, relicPool: [] } });
    expect(trained.laser.cooldownTotal).toBeCloseTo(13.5, 9);
    const daily = newSim({ mode: 'daily', modifiers: ['long_laser'] });
    expect(daily.laser.cooldownTotal).toBe(6);
    daily.setLaser(-50, 99999);
    expect(daily.laser.x).toBe(0);
    expect(daily.laser.y).toBe(FIELD_H);
  });
});
