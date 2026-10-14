/**
 * The cosmo cat's skill, Meteor Drop (docs/design_skills_v2.md 3.9, 4.4, 4.5, the data appendix; spec section 22.8.8): a red circle grows for a
 * second where the enemies WILL be, then the meteor lands (inner ring 90 px 1.2 D, outer ring 200 px 0.5 D a quarter second later) and a crater
 * of 100 px burns for four seconds. No pull, no stun, no slow. The frame it stands on is tested in `sim.spSkills.test.ts`.
 *
 * The geometry used throughout: the cosmo cat stands in the middle of the board (cell 12; its skill reaches the whole field) and enemies stand on
 * the top edge of the road, where an enemy at `travelled` t is at x = 81 + t, y = 45.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, EnemyId, SpCastEvent, SpMeteorData } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { SP_RANK5_GAP, SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import { applyStatus, hasteEnemy, shoveEnemy, transmuteSpecial } from '@/game/sim/enemies';
import { lose, startWave } from '@/game/sim/flow';
import { createBattle } from '@/game/sim/create';
import { meteor, travelledAfter } from '@/game/sim/sp/meteor';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave } from './simHelpers';
import { fingerprintRun } from './spHelpers';

const ROW = SP_ROWS.meteor;
const MIDDLE = 12;

afterEach(() => {
  vi.restoreAllMocks();
});

// ───────────────────────────── helpers ─────────────────────────────

function arena(over: Parameters<typeof newSim>[0] = {}): Sim {
  const sim = newSim(over);
  quietWave(sim);
  sim.waveDuration = 1e6;
  return sim;
}

/** An enemy held in place, `travelled` px along the road. */
function pinned(sim: Sim, travelled: number, id: EnemyId = 'dust', hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** A cosmo cat with a full gauge and its own attack switched off (so that only the skill touches the field). */
function cosmo(sim: Sim, cell = MIDDLE): SimUnit {
  const u = put(sim, cell, 'm_cosmo', 0);
  u.sp = 1;
  u.charge = -1e9;
  return u;
}

/** Casts through the handler the way the gauge pass does (asserting that the skill said it was ready). */
function cast(sim: Sim, u: SimUnit): void {
  expect(meteor.ready(sim, u)).toBe(true);
  expect(meteor.cast(sim, u)).toBe(true);
  u.sp = 0;
}

/** Puts the laser's dot at (x, y) for the length of one cast and switches it off again (its `focused` flags and its 15% stay out of the numbers). */
function castOnDot(sim: Sim, u: SimUnit, x: number, y: number): void {
  sim.laser.active = true;
  sim.laser.x = x;
  sim.laser.y = y;
  sim.laser.timeLeft = 100;
  cast(sim, u);
  sim.laser.active = false;
}

interface Tape {
  casts: Array<{ time: number; event: SpCastEvent }>;
  lands: Array<{ time: number; event: BattleEvents['meteorLand'] }>;
  ends: Array<{ time: number; event: BattleEvents['craterEnd'] }>;
  hits: Array<{ time: number; uid: number; amount: number; unitId: string | null; crit: boolean; dot: string | null; killed: boolean }>;
  order: string[];
}

function tape(sim: Sim): Tape {
  const t: Tape = { casts: [], lands: [], ends: [], hits: [], order: [] };
  sim.events.on('spCast', (event) => {
    t.casts.push({ time: sim.time, event });
    t.order.push('cast');
  });
  sim.events.on('meteorLand', (event) => {
    t.lands.push({ time: sim.time, event });
    t.order.push(`land:${event.ring}`);
  });
  sim.events.on('craterEnd', (event) => {
    t.ends.push({ time: sim.time, event });
    t.order.push('craterEnd');
  });
  sim.events.on('hit', (p) => {
    t.hits.push({ time: sim.time, uid: p.enemy.uid, amount: p.amount, unitId: p.unitId, crit: p.crit, dot: p.dot, killed: p.killed });
    t.order.push(`hit:${p.enemy.uid}${p.dot ? ':' + p.dot : ''}`);
  });
  return t;
}

function data(t: Tape, i = 0): SpMeteorData {
  const e = t.casts[i]!.event;
  if (e.skill !== 'meteor') throw new Error('not a meteor cast');
  return e.data;
}

/** The x of an enemy standing on the top edge at `travelled` t. */
const X = (t: number): number => 81 + t;
const Y = 45;

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Meteor Drop, the data', () => {
  it("has the design appendix's cells and is built: the cosmo cat carries the skill and its handler is registered", () => {
    expect(ROW).toMatchObject({
      id: 'meteor', unit: 'm_cosmo', rank: 5, cooldown: 34, warn: 1.0, inner: { radius: 90, power: 1.2 }, outer: { radius: 200, power: 0.5, delay: 0.25 },
      crater: { radius: 100, life: 4, burn: 0.3, every: 0.5 }, cluster: 150, weights: [1, 2, 3], minWeight: 3, built: true,
    });
    expect(unitDef('m_cosmo').spSkill).toEqual({ id: 'meteor', rank: 5, cooldown: 34, nameKey: 'sp.meteor.name' });
    expect(SP_HANDLERS.meteor).toBe(meteor);
  });

  it("fills the cosmo cat's gauge in 34 s, from the 50% a cat starts at in 17 s", () => {
    const sim = arena();
    const u = put(sim, MIDDLE, 'm_cosmo');
    expect(u.sp).toBe(0.5);
    advance(sim, 16.8);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── where the enemies will be ─────────────────────────────

describe('the prediction of where an enemy stands a second from now', () => {
  /** Predicts, lets the second pass with the enemy walking, and compares. */
  function check(prepare: (sim: Sim, e: SimEnemy) => void, id: EnemyId = 'cucumber', travelled = 300): void {
    const sim = arena();
    const e = foe(sim, id, travelled, 1e9);
    prepare(sim, e);
    const predicted = travelledAfter(sim, e, 60);
    advance(sim, 1);
    expect(e.travelled).toBeCloseTo(predicted, 6);
  }

  it('walks at its own speed: a cucumber 70 px, a drop 125 px, a roomba 48 px a second', () => {
    check(() => undefined, 'cucumber');
    check(() => undefined, 'drop');
    check(() => undefined, 'roomba');
    const sim = arena();
    const e = foe(sim, 'cucumber', 300, 1e9);
    expect(travelledAfter(sim, e, 60)).toBeCloseTo(370, 9);
  });

  it('follows its slow, its haste, the nap blanket and the whirl', () => {
    check((sim, e) => applyStatus(sim, e, 'slow', 0.25, 30, null));
    check((sim, e) => hasteEnemy(sim, e, 0.3, 30));
    check((sim) => {
      sim.fx.enemySlow = 0.2;
    });
    check((sim) => {
      sim.whirlUntil = sim.time + 0.5;
      sim.whirlSpeed = 0.4;
    });
  });

  it('stands still while it is stunned or frozen and walks on when that ends inside the second', () => {
    check((sim, e) => applyStatus(sim, e, 'stun', 1, 0.5, null));
    check((sim, e) => applyStatus(sim, e, 'freeze', 1, 1.6, null));
    const sim = arena();
    const e = foe(sim, 'cucumber', 300, 1e9);
    applyStatus(sim, e, 'freeze', 1, 5, null);
    expect(travelledAfter(sim, e, 60)).toBe(300);
  });

  it('is carried back while a shove slides it, and walks on after', () => {
    check((sim, e) => {
      expect(shoveEnemy(sim, e, 160, 0.35, 3)).toBe(160);
    });
    check((sim, e) => {
      e.travelled = 100;
      expect(shoveEnemy(sim, e, 160, 0.35, 3)).toBe(100);
    }, 'cucumber', 100);
  });

  it('speeds up as an enrageable boss loses health', () => {
    check((_sim, e) => {
      e.hp = e.maxHp * 0.4;
    }, 'boss_cucumber');
  });

  it("walks the alchemist's fish at its quarter speed until the fish wears off, also when that happens inside the second", () => {
    // A boss for 4 s, an elite for 2.5 s, a fish that wears off after 0.4 s (so 0.4 s at a quarter and 0.6 s at full speed).
    check((sim, e) => {
      expect(transmuteSpecial(sim, e, 4, 8)).toBe(true);
    }, 'boss_cucumber');
    check((sim, e) => {
      expect(transmuteSpecial(sim, e, 2.5, 5)).toBe(true);
    }, 'spray');
    check((sim, e) => {
      expect(transmuteSpecial(sim, e, 0.4, 5)).toBe(true);
    }, 'boss_cucumber');
    // It really is a quarter of the plain walk, and the fish that ends mid-second walks the rest of it at full speed.
    const sim = arena();
    const plain = foe(sim, 'boss_cucumber', 300, 1e9);
    const fishy = foe(sim, 'boss_cucumber', 300, 1e9);
    expect(transmuteSpecial(sim, fishy, 4, 8)).toBe(true);
    const walk = travelledAfter(sim, plain, 60) - 300;
    expect(walk).toBeGreaterThan(0);
    expect(travelledAfter(sim, fishy, 60) - 300).toBeCloseTo(walk * SP_ROWS.fish.fishSpeed, 9);
    const brief = foe(sim, 'boss_cucumber', 300, 1e9);
    expect(transmuteSpecial(sim, brief, 0.4, 8)).toBe(true);
    // (0.4 s at a quarter, 0.6 s at full speed; one tick of float noise at the edge is under a pixel.)
    expect(Math.abs(travelledAfter(sim, brief, 60) - 300 - walk * (0.4 * SP_ROWS.fish.fishSpeed + 0.6))).toBeLessThan(1);
    // Looking changes nothing about the fish.
    expect(fishy.fish).toBe(true);
    expect(fishy.fishUntil).toBeCloseTo(sim.time + 4, 9);
  });

  it('changes nothing when it only looks', () => {
    const sim = arena();
    const e = foe(sim, 'cucumber', 300, 1e9);
    const before = JSON.stringify([e.travelled, e.x, e.y, e.shoveLeft, sim.later.length]);
    travelledAfter(sim, e, 60);
    expect(JSON.stringify([e.travelled, e.x, e.y, e.shoveLeft, sim.later.length])).toBe(before);
  });
});

// ───────────────────────────── ready and the aim ─────────────────────────────

describe('when the meteor is ready and where it falls', () => {
  it('weighs a plain enemy 1, an elite 2 and a boss 3 within 150 px, and wants 3', () => {
    const cases: Array<[string, EnemyId[], boolean]> = [
      ['nothing', [], false],
      ['one plain', ['dust'], false],
      ['two plain', ['dust', 'dust'], false],
      ['three plain', ['dust', 'dust', 'dust'], true],
      ['a lone elite', ['firecracker'], false],
      ['an elite and a plain one', ['firecracker', 'dust'], true],
      ['a lone boss', ['boss_vacuum'], true],
    ];
    for (const [name, ids, ready] of cases) {
      const sim = arena();
      const u = cosmo(sim);
      ids.forEach((id, i) => pinned(sim, 300 + 10 * i, id));
      expect(meteor.ready(sim, u), name).toBe(ready);
    }
  });

  it('counts only enemies within 150 px of each other, by the distance between their centres', () => {
    // Exactly 150 px apart counts (centre distance <= 150): the middle one has both of the others.
    const sim = arena();
    const u = cosmo(sim);
    [300, 450, 600].forEach((p) => pinned(sim, p));
    expect(meteor.ready(sim, u)).toBe(true);
    // 150.5 px apart does not: nobody has more than one neighbour, so the weight is 2.
    const sim2 = arena();
    const u2 = cosmo(sim2);
    [300, 450.5, 600.9].forEach((p) => pinned(sim2, p));
    expect(meteor.ready(sim2, u2)).toBe(false);
    // A fourth in between makes the middle one heavy again.
    pinned(sim2, 375);
    expect(meteor.ready(sim2, u2)).toBe(true);
  });

  it('reaches the whole field: the cat in the corner and the cat in the middle both see a crowd on the far side', () => {
    for (const cell of [0, 4, 12, 20, 24]) {
      const sim = arena();
      const u = cosmo(sim, cell);
      [900, 905, 910].forEach((p) => pinned(sim, p));
      expect(meteor.ready(sim, u), `cell ${cell}`).toBe(true);
    }
  });

  it('falls on the place of the enemy whose neighbourhood is heaviest, where the enemies will stand (not where they stand now)', () => {
    const sim = arena();
    const u = cosmo(sim);
    const group = [100, 110, 120, 130].map((p) => foe(sim, 'cucumber', p, 1e9));
    const lone = foe(sim, 'cucumber', 600, 1e9);
    const t = tape(sim);
    cast(sim, u);
    const d = data(t);
    // All four weigh the same (4) and the tie goes to the first in skill order, the farthest along: it will be 70 px on, at 200.
    const first = pathPoint(200);
    expect(d.impactX).toBeCloseTo(first.x, 6);
    expect(d.impactY).toBeCloseTo(first.y, 6);
    expect(d.onLaser).toBe(false);
    advance(sim, 1);
    // A second later the front enemy really is where the circle grew.
    expect(group[3]!.x).toBeCloseTo(d.impactX, 4);
    expect(group[3]!.y).toBeCloseTo(d.impactY, 4);
    expect(lone.dead).toBe(false);
  });

  it('prefers the heavier of two crowds, and a boss counts for three plain enemies', () => {
    const sim = arena();
    const u = cosmo(sim);
    [100, 110, 120].forEach((p) => pinned(sim, p));
    const boss = pinned(sim, 800, 'boss_vacuum');
    pinned(sim, 810);
    pinned(sim, 820);
    const t = tape(sim);
    cast(sim, u);
    // 100/110/120 weigh 3; 800/810/820 weigh 5.
    expect(data(t).impactX).toBeGreaterThan(boss.x - 150);
    expect(data(t).impactX).toBeLessThan(boss.x + 150);
  });

  it('lets a slowed crowd and a fast crowd weigh where they will be: the slow ones stay together, the fast ones leave', () => {
    const sim = arena();
    const u = cosmo(sim);
    // Three drops (125 px/s) and three roombas (48 px/s) start a long way apart; a second on the drops are 77 px farther away from the roombas.
    const drops = [400, 405, 410].map((p) => foe(sim, 'drop', p, 1e9));
    const roombas = [300, 305, 310].map((p) => foe(sim, 'roomba', p, 1e9));
    const t = tape(sim);
    cast(sim, u);
    // Each group weighs 3 by itself; the drops are 90 px ahead of the roombas now and 167 px a second on: so two groups, a tie, and
    // the one first in skill order (the farthest along: a drop) wins.
    const front = pathPoint(drops[2]!.travelled + 125);
    expect(data(t).impactX).toBeCloseTo(front.x, 6);
    expect(roombas.every((e) => !e.dead)).toBe(true);
  });

  it('falls on the laser dot as it is at the cast when the laser is on, and what counts is the weight round the dot', () => {
    const sim = arena();
    const u = cosmo(sim);
    // A crowd over there, a lone boss at the dot: the dot wins because the player put it there.
    [600, 610, 620, 630].forEach((p) => pinned(sim, p));
    const boss = pinned(sim, 200, 'boss_vacuum');
    const t = tape(sim);
    castOnDot(sim, u, X(215), Y);
    expect(data(t)).toMatchObject({ impactX: X(215), impactY: Y, onLaser: true });
    expect(boss.dead).toBe(false);

    // A dot on an empty stretch: the crowd elsewhere does not matter, the cat waits for something under the dot.
    const sim2 = arena();
    const u2 = cosmo(sim2);
    [600, 610, 620, 630].forEach((p) => pinned(sim2, p));
    sim2.laser.active = true;
    sim2.laser.x = X(200);
    sim2.laser.y = Y;
    sim2.laser.timeLeft = 100;
    expect(meteor.ready(sim2, u2)).toBe(false);
    sim2.laser.x = X(615);
    expect(meteor.ready(sim2, u2)).toBe(true);
  });

  it('does not change anything when it only looks', () => {
    const sim = arena();
    const u = cosmo(sim);
    [300, 310, 320].forEach((p) => pinned(sim, p));
    const before = JSON.stringify([sim.later.length, u.sp, sim.enemies.map((e) => [e.uid, e.hp, e.travelled])]);
    for (let i = 0; i < 5; i++) meteor.ready(sim, u);
    expect(JSON.stringify([sim.later.length, u.sp, sim.enemies.map((e) => [e.uid, e.hp, e.travelled])])).toBe(before);
  });

  it('counts, with the laser on, the weight within 150 px of the dot by the distance between centres: a boss 149 px away is enough, one 151 px away is not', () => {
    // Bosses that stand still (speed 0), so that the prediction is the place they are at; a boss weighs 3 and 3 is what the cat wants.
    const at = (sim: Sim, dx: number): SimEnemy => {
      const e = foe(sim, 'boss_vacuum', 200 + dx, 1e9);
      e.speed = 0;
      return e;
    };
    const dot = (sim: Sim): void => {
      sim.laser.active = true;
      sim.laser.x = X(200);
      sim.laser.y = Y;
      sim.laser.timeLeft = 100;
    };
    for (const [dx, ready] of [[149, true], [151, false], [170, false], [-149, true], [-151, false]] as const) {
      const sim = arena();
      const u = cosmo(sim);
      at(sim, dx);
      dot(sim);
      expect(meteor.ready(sim, u), `a boss ${dx} px from the dot`).toBe(ready);
    }
  });

  it("falls where an alchemist's fish boss will really stand a second from now: it walks at a quarter speed, so the aim is not 3/4 of a second's walk too far", () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = foe(sim, 'boss_vacuum', 300, 1e9);
    expect(transmuteSpecial(sim, boss, 4, 8)).toBe(true);
    const t = tape(sim);
    cast(sim, u);
    advance(sim, ROW.warn);
    expect(t.lands).toHaveLength(1);
    const walked = boss.travelled - 300;
    expect(walked).toBeGreaterThan(0);
    // The meteor lands on the boss itself: the aim and the place it has reached a second later are the same point.
    expect(Math.hypot(t.lands[0]!.event.x - boss.x, t.lands[0]!.event.y - boss.y)).toBeLessThan(0.5);
    // (Aimed with the plain walk it would have been about three times `walked` too far ahead.)
    expect(walked).toBeLessThan(30);
  });

  it('does not cast when there is nothing worth it', () => {
    const sim = arena();
    const u = cosmo(sim);
    expect(meteor.cast(sim, u)).toBe(false);
    pinned(sim, 300);
    expect(meteor.cast(sim, u)).toBe(false);
    expect(sim.later).toHaveLength(0);
  });
});

// ───────────────────────────── the cast ─────────────────────────────

describe('the cast', () => {
  it('announces itself once with the geometry of the scene, the cat\'s tile as its anchor, and `first` only the first time', () => {
    const sim = arena();
    const u = cosmo(sim);
    [300, 310, 320].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    u.spCheckAt = 0;
    sim.step(TICK);
    expect(t.casts).toHaveLength(1);
    expect(t.casts[0]!.event.first).toBe(true);
    expect(t.casts[0]!.event.x).toBe(cellCenterX(MIDDLE));
    expect(t.casts[0]!.event.y).toBe(cellCenterY(MIDDLE));
    expect(data(t)).toMatchObject({
      at: sim.time, warn: 1, innerRadius: 90, outerRadius: 200, outerDelay: 0.25, craterRadius: 100, craterLife: 4, onLaser: false,
    });
    expect(u.sp).toBe(0);
    // A rank 5 skill leaves a gap of 1.2 s for the next rank 5 cast.
    expect(sim.spRank5Until).toBeCloseTo(sim.time + SP_RANK5_GAP, 9);
  });

  it("grows the three radii with the cat's area bonuses (the toys that widen areas, the level 7 perk) and tells the view", () => {
    const sim = arena();
    const u = cosmo(sim);
    sim.fx.areaScale = 0.2;
    [300, 310, 320].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    const k = 1 + 0.2 + u.perk.radius;
    expect(data(t)).toMatchObject({ innerRadius: 90 * k, outerRadius: 200 * k, craterRadius: 100 * k });
    advance(sim, 1.01);
    expect(t.lands[0]!.event.radius).toBeCloseTo(90 * k, 9);
  });

  it('waits full, looking every 0.2 s, until a crowd stands somewhere, then casts', () => {
    const sim = arena();
    const u = cosmo(sim);
    pinned(sim, 300);
    const t = tape(sim);
    u.spCheckAt = 0;
    advance(sim, 1);
    expect(t.casts).toHaveLength(0);
    expect(u.sp).toBe(1);
    pinned(sim, 310);
    pinned(sim, 320);
    advance(sim, 0.3);
    expect(t.casts).toHaveLength(1);
  });
});

// ───────────────────────────── the landing ─────────────────────────────

describe('the landing', () => {
  /**
   * A boss at the dot (t = 300) and plain enemies round it, the meteor cast on the dot: inner ring 102 px (90 + a dust's 12), outer ring 212, crater 112.
   * `near` 60 px ahead and `edge` 100 px behind stand in the inner ring, `mid` 120 ahead and `far` 205 behind in the outer ring only, `out` 215 ahead outside.
   */
  function scene(): { sim: Sim; u: SimUnit; t: Tape; boss: SimEnemy; near: SimEnemy; edge: SimEnemy; mid: SimEnemy; far: SimEnemy; out: SimEnemy; d: number } {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const near = pinned(sim, 360);
    const edge = pinned(sim, 200);
    const mid = pinned(sim, 420);
    const far = pinned(sim, 95);
    const out = pinned(sim, 515);
    const t = tape(sim);
    const d = u.stats.damage;
    castOnDot(sim, u, boss.x, boss.y);
    return { sim, u, t, boss, near, edge, mid, far, out, d };
  }

  const dmg = (id: EnemyId, power: number, d: number): number => power * d * (1 - enemySpec(id).ward);

  it('does nothing for a second, then the inner ring lands (event first, then the hits), then the outer ring 0.25 s later', () => {
    const { sim, t, boss, near, edge, mid, far, out, d } = scene();
    advance(sim, 0.98);
    expect(t.lands).toHaveLength(0);
    expect(t.hits).toHaveLength(0);
    advance(sim, 0.05);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner']);
    const innerHits = t.hits.filter((h) => !h.dot);
    expect(new Set(innerHits.map((h) => h.uid))).toEqual(new Set([boss, near, edge].map((e) => e.uid)));
    const landTime = t.lands[0]!.time;
    expect(Math.round((landTime - t.casts[0]!.time) / TICK)).toBe(60);
    for (const h of innerHits) {
      const e = [boss, near, edge].find((x) => x.uid === h.uid)!;
      expect(h.amount, e.id).toBeCloseTo(dmg(e.id, 1.2, d), 6);
      expect(h.crit).toBe(false);
      expect(h.unitId).toBe('m_cosmo');
      expect(h.time).toBe(landTime);
    }
    advance(sim, 0.3);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner', 'outer']);
    expect(Math.round((t.lands[1]!.time - landTime) / TICK)).toBe(15);
    const outerHits = t.hits.filter((h) => !h.dot && h.time === t.lands[1]!.time);
    expect(new Set(outerHits.map((h) => h.uid))).toEqual(new Set([boss, near, edge, mid, far].map((e) => e.uid)));
    for (const h of outerHits) {
      const e = [boss, near, edge, mid, far].find((x) => x.uid === h.uid)!;
      expect(h.amount, e.id).toBeCloseTo(dmg(e.id, 0.5, d), 6);
    }
    // The one outside both rings is never hit, by a ring or by the burn.
    advance(sim, 6);
    expect(t.hits.some((h) => h.uid === out.uid)).toBe(false);
    expect(out.burning).toBe(false);
  });

  it('puts each ring\'s event before its own hits and lists the enemies the ring touches, where they stand', () => {
    const { sim, t, boss, near, edge, mid, far } = scene();
    advance(sim, 1.4);
    const order = t.order;
    const i = order.indexOf('land:inner');
    const j = order.indexOf('land:outer');
    expect(order[i - 1]).toBe('cast');
    expect(order.slice(i + 1, i + 4).every((x) => x.startsWith('hit:'))).toBe(true);
    expect(order.slice(i + 1, j).some((x) => x.endsWith(':burn'))).toBe(false);
    const inner = t.lands[0]!.event;
    expect(inner).toMatchObject({ ring: 'inner', x: boss.x, y: boss.y, radius: 90 });
    expect(inner.points.map((p) => p.uid).sort()).toEqual([boss, near, edge].map((e) => e.uid).sort());
    for (const p of inner.points) {
      const e = [boss, near, edge].find((x) => x.uid === p.uid)!;
      expect([p.x, p.y]).toEqual([e.x, e.y]);
    }
    expect(t.lands[1]!.event.points.map((p) => p.uid).sort()).toEqual([boss, near, edge, mid, far].map((e) => e.uid).sort());
    expect(t.lands[1]!.event.radius).toBe(200);
  });

  it('hits the middle of both rings twice and a ring only by where its circle touches the body when it lands', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    // A dust 102 px away is touched by the 90 px ring (90 + its radius 12) and one at 103 is not.
    const inside = pinned(sim, 402);
    const outside = pinned(sim, 203 - 6);
    outside.travelled = 197;
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 1.05);
    const innerUids = new Set(t.hits.map((h) => h.uid));
    expect(innerUids.has(boss.uid)).toBe(true);
    expect(innerUids.has(inside.uid)).toBe(true);
    expect(innerUids.has(outside.uid)).toBe(false);
    advance(sim, 0.3);
    expect(t.hits.filter((h) => h.uid === boss.uid && !h.dot)).toHaveLength(2);
  });

  it("uses where the enemies are when the ring lands, not where the aim thought: a walker that left is missed, one that arrived is hit", () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const walker = foe(sim, 'cucumber', 300, 1e9);
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    // The walker walks 70 px a second: at the landing it is 70 px from the dot, inside the 90 + 18 ring.
    advance(sim, 1.05);
    expect(t.hits.some((h) => h.uid === walker.uid && !h.dot)).toBe(true);
    // Stop it dead before the landing in another cast: it walks away from the dot 70 px and is hit as well; stood 120 px off it is missed.
    const sim2 = arena();
    const u2 = cosmo(sim2);
    const boss2 = pinned(sim2, 300, 'boss_vacuum');
    const gone = foe(sim2, 'drop', 300, 1e9);
    const t2 = tape(sim2);
    castOnDot(sim2, u2, boss2.x, boss2.y);
    advance(sim2, 1.05);
    // A drop walks 125 px a second: 125 > 90 + 14, it has left the inner ring by the landing.
    expect(t2.hits.some((h) => h.uid === gone.uid && !h.dot)).toBe(false);
  });

  it('never pulls, stuns or slows (nor shoves) anything, whoever is under it', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const walkers = [250, 280, 320, 350].map((p) => foe(sim, 'cucumber', p, 1e9));
    const frozen = pinned(sim, 310);
    const travelled = [boss, frozen].map((e) => e.travelled);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 6);
    expect([boss, frozen].map((e) => e.travelled)).toEqual(travelled);
    for (const e of [...walkers, boss, frozen]) {
      expect(e.stunned && e !== boss && e !== frozen).toBe(false);
      expect(e.slow).toBe(0);
      expect(e.pullUid).toBe(0);
      expect(e.shoveLeft).toBe(0);
    }
    // The walkers walked on at their own speed all the way: 6 s x 70 px/s.
    for (const [i, e] of walkers.entries()) expect(e.travelled).toBeCloseTo([250, 280, 320, 350][i]! + 70 * 6.0, 0);
  });

  it('does not hit the same enemy with a ring after it died, nor burn it', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const weak = pinned(sim, 340, 'dust', 1);
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 1.5);
    expect(weak.dead).toBe(true);
    expect(t.hits.filter((h) => h.uid === weak.uid)).toHaveLength(1);
    expect(t.hits.find((h) => h.uid === weak.uid)!.killed).toBe(true);
  });

  it('goes through armour and ward, the vulnerability cap and the elite and boss damage allowance (ordinary damage)', () => {
    const sim = arena();
    const u = cosmo(sim);
    const d = u.stats.damage;
    const warded = pinned(sim, 330, 'tangerine');
    const plain = pinned(sim, 300, 'boss_vacuum');
    // An elite with an allowance of 10 takes 10 from the inner ring and nothing more from the outer.
    const elite = foe(sim, 'firecracker', 340, 1e9);
    elite.frozen = true;
    elite.target = true;
    elite.capTokens = 10;
    elite.capRate = 0;
    const t = tape(sim);
    castOnDot(sim, u, plain.x, plain.y);
    advance(sim, 1.4);
    const hit = (e: SimEnemy, n: number): number => t.hits.filter((h) => h.uid === e.uid && !h.dot)[n]!.amount;
    expect(hit(warded, 0)).toBeCloseTo(1.2 * d * (1 - 0.35), 6);
    expect(hit(warded, 1)).toBeCloseTo(0.5 * d * (1 - 0.35), 6);
    expect(hit(elite, 0)).toBeCloseTo(10, 9);
    expect(hit(elite, 1)).toBeCloseTo(0, 9);
  });

  it('takes its numbers from the cast: D changed later changes nothing', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const near = pinned(sim, 340);
    const d = u.stats.damage;
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    u.stats.damage = d * 5;
    advance(sim, 1.05);
    expect(t.hits.find((h) => h.uid === near.uid)!.amount).toBeCloseTo(1.2 * d * (1 - enemySpec('dust').ward), 6);
  });
});

// ───────────────────────────── the crater ─────────────────────────────

describe('the crater', () => {
  function burning(): { sim: Sim; u: SimUnit; t: Tape; boss: SimEnemy; inside: SimEnemy; edge: SimEnemy; outside: SimEnemy; land: number } {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    // Crater 100 px + a dust's 12: 110 px is in, 114 px is out.
    const inside = pinned(sim, 300 + 60);
    const edge = pinned(sim, 300 - 110);
    const outside = pinned(sim, 300 + 114);
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    return { sim, u, t, boss, inside, edge, outside, land: sim.time + ROW.warn };
  }

  it('burns the enemies it touches with the fire cat\'s burn, 0.3 x D / the cat\'s attack interval a second', () => {
    const { sim, u, t, boss, inside, edge, outside } = burning();
    const expected = (ROW.crater.burn * u.stats.damage) / u.stats.interval;
    advance(sim, 1.05);
    expect(inside.burning).toBe(true);
    expect(inside.burnDps).toBeCloseTo(expected, 9);
    expect(boss.burning).toBe(true);
    expect(edge.burning).toBe(true);
    expect(outside.burning).toBe(false);
    advance(sim, 4);
    // Burn damage comes as `hit`s with dot 'burn', credited to the cosmo cat, never a crit, in whole ticks of dps x 0.5 s.
    const burns = t.hits.filter((h) => h.uid === inside.uid && h.dot === 'burn');
    expect(burns.length).toBeGreaterThanOrEqual(8);
    expect(burns.length).toBeLessThanOrEqual(10);
    for (const h of burns) expect(h.amount).toBeCloseTo(expected * 0.5, 9);
    // The rings hit it (it is inside 212 px) but the crater's burn never did.
    expect(t.hits.some((h) => h.uid === outside.uid && h.dot !== null)).toBe(false);
    expect(t.hits.some((h) => h.uid === outside.uid && h.dot === null)).toBe(true);
  });

  it('refreshes the burn every 0.5 s from the landing for 4 s (eight times), and then lets go within a second', () => {
    const { sim, t, boss } = burning();
    advance(sim, 1);
    const landing = t.lands[0]!.time;
    // The first refresh is in the landing tick, with a hold a little longer than the gap between refreshes.
    expect(boss.burnUntil - landing).toBeCloseTo(0.75, 6);
    const times: number[] = [];
    let last = boss.burnUntil;
    for (let i = 0; i < 6 * 60; i++) {
      sim.step(TICK);
      if (boss.burnUntil !== last) {
        times.push(sim.time - landing);
        last = boss.burnUntil;
      }
    }
    // Pulses at 0.5, 1.0 ... 3.5 s after the landing (seven more besides the landing's own), then none.
    expect(times).toHaveLength(7);
    times.forEach((x, i) => expect(x).toBeCloseTo(0.5 * (i + 1), 1));
    expect(boss.burning).toBe(false);
    expect(last - landing).toBeCloseTo(3.5 + 0.75, 6);
  });

  it('sends `craterEnd` four seconds after the landing and the scorch is gone for the next meteor', () => {
    const { sim, t } = burning();
    advance(sim, 1 + 3.9);
    expect(t.ends).toHaveLength(0);
    advance(sim, 0.2);
    expect(t.ends).toHaveLength(1);
    expect(Math.round((t.ends[0]!.time - t.lands[0]!.time) / TICK)).toBe(240);
    expect(t.ends[0]!.event).toMatchObject({ x: t.lands[0]!.event.x, y: t.lands[0]!.event.y, radius: 100 });
    expect(sim.later).toHaveLength(0);
  });

  it('burns an enemy that walks into the crater later, at the next refresh, and stops refreshing it once it has walked out', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    // A cucumber (70 px/s) that starts at 16: 214 px from the dot when the meteor lands, inside the crater's 118 (100 + its 18) at 170, about
    // 2.2 s after the cast, so the refresh 2.5 s after the cast is the first to burn it. It is out the other side (past 430) 4 s later.
    const walker = foe(sim, 'cucumber', 16, 1e9);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 2.4);
    expect(walker.travelled).toBeGreaterThan(170);
    expect(walker.burning).toBe(false);
    advance(sim, 0.2);
    expect(walker.burning).toBe(true);
    advance(sim, 4);
    // It left the crater (118 px past the dot is travelled 418) long ago and the crater is over: the burn is gone.
    expect(walker.travelled).toBeGreaterThan(418);
    expect(walker.burning).toBe(false);
  });

  it('keeps the crater where it fell: an enemy that stands in it keeps burning, a crowd that comes later burns too', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 2);
    const newcomer = pinned(sim, 320);
    expect(newcomer.burning).toBe(false);
    advance(sim, 0.6);
    expect(newcomer.burning).toBe(true);
    expect(t.ends).toHaveLength(0);
  });

  it('counts as a magic status: an enemy that falls while burning bursts under the mages\' third synergy step', () => {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const victim = pinned(sim, 330, 'dust', 1e9);
    castOnDot(sim, u, boss.x, boss.y);
    advance(sim, 1.05);
    expect(victim.burning).toBe(true);
    expect((victim.mask & 8) !== 0).toBe(true);
  });

  it("credits the crater's burn to the cosmo cat: what the burn hits take is added to its damage dealt", () => {
    const { sim, u } = burning();
    // The rings are over 1.25 s after the cast; from here on only the crater hurts anybody.
    advance(sim, 2.5);
    const before = u.damageDealt;
    let burned = 0;
    sim.events.on('hit', (p) => {
      if (p.dot === 'burn') burned += p.amount;
    });
    advance(sim, 1.5);
    expect(burned).toBeGreaterThan(0);
    expect(u.damageDealt - before).toBeCloseTo(burned, 6);
  });

  it("does not cut another cat's longer burn down to its own short refresh, nor take the credit, while that burn lasts", () => {
    const sim = arena();
    const u = cosmo(sim);
    const fire = put(sim, 0, 'm_fire', 0);
    fire.charge = -1e9;
    const boss = pinned(sim, 300, 'boss_vacuum');
    // A fire cat's burn far stronger than the crater's, for three seconds.
    applyStatus(sim, boss, 'burn', 1000, 3, fire);
    const end = boss.burnUntil;
    expect(end).toBeGreaterThan(sim.time + 2.9);
    expect(boss.burnSrc).toBe(fire);
    castOnDot(sim, u, boss.x, boss.y);
    // The pulses at 1.0 (the landing), 1.5 and 2.0 s all end sooner than the fire cat's burn: it keeps its end, its source and its strength.
    advance(sim, 2.05);
    expect(boss.burnUntil).toBe(end);
    expect(boss.burnSrc).toBe(fire);
    expect(boss.burnDps).toBe(1000);
    // Once a pulse would end later than the fire cat's burn the crater takes the burn over (the enemy goes on burning, now as the crater's).
    advance(sim, 1.5);
    expect(boss.burning).toBe(true);
    expect(boss.burnUntil).toBeGreaterThan(end);
    expect(boss.burnSrc).toBe(u);
    expect(boss.burnDps).toBe(1000);
  });

  it('is the burn of the cosmo cat on an enemy nobody else burns: its source', () => {
    const { sim, u, boss } = burning();
    advance(sim, 1.05);
    expect(boss.burning).toBe(true);
    expect(boss.burnSrc).toBe(u);
  });
});

// ───────────────────────────── the cat meanwhile, the clock and the battle ─────────────────────────────

describe('what happens to the cat during the flight', () => {
  function flying(): { sim: Sim; u: SimUnit; t: Tape; boss: SimEnemy; near: SimEnemy } {
    const sim = arena();
    const u = cosmo(sim);
    const boss = pinned(sim, 300, 'boss_vacuum');
    const near = pinned(sim, 340);
    const t = tape(sim);
    castOnDot(sim, u, boss.x, boss.y);
    return { sim, u, t, boss, near };
  }

  it('lands all the same when the cat is sold, and credits it', () => {
    const { sim, u, t, near } = flying();
    advance(sim, 0.5);
    expect(sim.sell(MIDDLE)).toBeNull();
    expect(u.removed).toBe(true);
    advance(sim, 5);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner', 'outer']);
    expect(t.hits.filter((h) => h.uid === near.uid && !h.dot)).toHaveLength(2);
    expect(t.hits.filter((h) => h.uid === near.uid && h.dot === 'burn').length).toBeGreaterThan(5);
    expect(t.ends).toHaveLength(1);
    expect(u.damageDealt).toBeGreaterThan(0);
  });

  it('lands all the same when the cat is moved to another tile meanwhile (a mythic cannot molt or awaken)', () => {
    const { sim, u, t } = flying();
    advance(sim, 0.3);
    expect(sim.drop(MIDDLE, 13)).toBeNull();
    expect(sim.units[13]).toBe(u);
    advance(sim, 5.7);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner', 'outer']);
    expect(t.ends).toHaveLength(1);
  });

  it('works with two cosmo cats casting in the same tick: two meteors, each its own, in the order of the casts', () => {
    const sim = arena();
    const a = cosmo(sim, 12);
    // The second cat is not full: only the explicit casts below cast.
    const b = put(sim, 13, 'm_cosmo', 0);
    b.charge = -1e9;
    const boss = pinned(sim, 300, 'boss_vacuum');
    pinned(sim, 340);
    const t = tape(sim);
    cast(sim, a);
    advance(sim, 0.01);
    cast(sim, b);
    advance(sim, 6);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner', 'inner', 'outer', 'outer']);
    expect(t.lands.map((l) => l.event.unit)).toEqual([a, b, a, b]);
    expect(t.ends).toHaveLength(2);
    expect(boss.dead).toBe(false);
  });

  it('names every meteor: the cast, both rings and the end of the crater carry its `meteorId`, so two meteors on one spot are told apart', () => {
    const sim = arena();
    const a = cosmo(sim, 12);
    const b = put(sim, 13, 'm_cosmo', 0);
    b.charge = -1e9;
    const boss = pinned(sim, 300, 'boss_vacuum');
    pinned(sim, 340);
    const t = tape(sim);
    // The laser puts both meteors on the same dot, the case the place alone cannot tell apart.
    castOnDot(sim, a, boss.x, boss.y);
    advance(sim, 0.01);
    castOnDot(sim, b, boss.x, boss.y);
    advance(sim, 6);
    expect(t.casts).toHaveLength(2);
    expect([data(t, 0).meteorId, data(t, 1).meteorId]).toEqual([1, 2]);
    expect([data(t, 0).impactX, data(t, 0).impactY]).toEqual([data(t, 1).impactX, data(t, 1).impactY]);
    expect(t.lands.map((l) => [l.event.ring, l.event.meteorId])).toEqual([['inner', 1], ['inner', 2], ['outer', 1], ['outer', 2]]);
    expect(t.ends.map((e) => e.event.meteorId)).toEqual([1, 2]);
    // A third, later meteor goes on counting; the number is the battle's, not the cat's.
    castOnDot(sim, a, boss.x, boss.y);
    expect(data(t, 2).meteorId).toBe(3);
  });
});

describe('through the gauge pass and the rest of the battle', () => {
  function flying(): { sim: Sim; u: SimUnit; t: Tape } {
    const sim = arena();
    const u = cosmo(sim);
    [300, 310, 320].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    return { sim, u, t };
  }

  it('stands still with a choice popup and goes on after it', () => {
    const { sim, t } = flying();
    advance(sim, 0.5);
    const time = sim.time;
    sim.phase = 'choice';
    sim.step(5);
    expect(sim.time).toBe(time);
    expect(t.lands).toHaveLength(0);
    sim.phase = 'wave';
    advance(sim, 0.4);
    expect(t.lands).toHaveLength(0);
    advance(sim, 0.2);
    expect(t.lands).toHaveLength(1);
  });

  it('waits through the pause between waves: nothing runs in prep, the meteor lands (on schedule, all of it) in the first tick after it', () => {
    const { sim, t } = flying();
    sim.phase = 'prep';
    sim.prepTime = 100;
    advance(sim, 7);
    expect(t.lands).toHaveLength(0);
    sim.phase = 'wave';
    sim.step(TICK);
    expect(t.lands.map((l) => l.event.ring)).toEqual(['inner', 'outer']);
    expect(t.ends).toHaveLength(1);
  });

  it('goes on when the wave ends or the next one starts meanwhile', () => {
    const { sim, t } = flying();
    advance(sim, 0.4);
    sim.wave = 5;
    startWave(sim, 6);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    advance(sim, 5.5);
    expect(t.lands).toHaveLength(2);
    expect(t.ends).toHaveLength(1);
  });

  it('freezes with a defeat and goes on after a revive', () => {
    const { sim, t } = flying();
    advance(sim, 0.5);
    lose(sim, 'boss_timeout');
    advance(sim, 4);
    expect(t.lands).toHaveLength(0);
    expect(sim.revive()).toBeNull();
    advance(sim, 1);
    expect(t.lands.length).toBeGreaterThan(0);
  });

  it('is not saved: a restored battle starts with an empty list and no meteor', () => {
    const { sim } = flying();
    sim.spawnIds.length = 0;
    expect(sim.callNextWave()).toBeNull();
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const restored = createBattle(sim.init, snap!) as Sim;
    expect(restored.later).toHaveLength(0);
    const t = tape(restored);
    advance(restored, 8);
    expect(t.lands).toHaveLength(0);
  });

  it('gives the same result at 1x, 2x and 3x speed: only simulation time counts', () => {
    const play = (chunk: number): string => {
      const sim = arena();
      const u = cosmo(sim);
      const t = tape(sim);
      for (let i = 0; i < 16; i++) {
        const e = foe(sim, i % 5 === 0 ? 'balloon' : 'cucumber', 100 + 12 * i, i % 4 === 0 ? 1 : 1e9);
        if (i % 3 === 0) e.frozen = true;
      }
      u.spCheckAt = 0;
      const ticks = 8 * 60;
      for (let n = 0; n < ticks / chunk; n++) sim.step(chunk * TICK);
      return JSON.stringify([t.order, t.lands.map((l) => [Math.round(l.time * 1e6), l.event.points.map((p) => p.uid)]), t.hits.map((h) => [h.uid, Math.round(h.amount * 1e6), h.dot])]);
    };
    const one = play(1);
    expect(one).toContain('land:outer');
    expect(play(2)).toBe(one);
    expect(play(3)).toBe(one);
  });

  it('is deterministic: the same battle twice gives the same events, whether anybody listens or not, and no Math.random is used', () => {
    const random = vi.spyOn(Math, 'random');
    const play = (listen: boolean): { state: string; order: string } => {
      const sim = arena();
      cosmo(sim, 12);
      cosmo(sim, 13);
      const t = listen ? tape(sim) : null;
      for (let i = 0; i < 18; i++) foe(sim, i % 3 === 0 ? 'drop' : 'cucumber', 90 + 13 * i, i % 4 === 0 ? 400 : 1e9);
      advance(sim, 9);
      return {
        state: JSON.stringify([sim.enemies.map((e) => [e.uid, e.hp, e.travelled, e.burning]), sim.kills, sim.rng.states()]),
        order: t ? JSON.stringify(t.order) : '',
      };
    };
    const a = play(true);
    expect(play(true)).toEqual(a);
    expect(a.order).toContain('land:inner');
    expect(play(false).state).toBe(a.state);
    expect(random).not.toHaveBeenCalled();
  });
});

describe('with the skills off, and in every mode', () => {
  it('a battle started with sp false never casts it and the gauge stays 0', () => {
    const sim = arena({ sp: false });
    const u = put(sim, MIDDLE, 'm_cosmo', 0);
    [300, 310, 320].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    advance(sim, 40);
    expect(t.casts).toHaveLength(0);
    expect(u.sp).toBe(0);
  });

  const MODES: Array<{ name: string; over: Parameters<typeof initOf>[0] }> = [
    { name: 'chapter', over: { seed: 92001, mode: 'chapter', chapter: 2 } },
    { name: 'daily with its rules', over: { seed: 92002, mode: 'daily', chapter: 2, modifiers: ['swarm', 'rush'] } },
    { name: 'endless', over: { seed: 92003, mode: 'endless', chapter: 3 } },
    { name: 'gold dungeon', over: { seed: 92004, mode: 'gold', chapter: 1 } },
    { name: 'tutorial', over: { seed: 92005, mode: 'tutorial', chapter: 1 } },
  ];

  for (const m of MODES) {
    it(`casts and lands in the ${m.name} mode, and a whole bot run with a cosmo cat on the board is the same twice`, () => {
      const run = (): { print: string; casts: number; lands: number; ends: number } => {
        let casts = 0;
        let lands = 0;
        let ends = 0;
        const print = fingerprintRun(initOf(m.over, 3), 'synergy', {
          maxSeconds: 200,
          setup(s) {
            put(s, 12, 'm_cosmo');
            s.events.on('spCast', (e) => {
              if (e.skill === 'meteor') casts++;
            });
            s.events.on('meteorLand', (e) => {
              if (e.ring === 'inner') lands++;
            });
            s.events.on('craterEnd', () => {
              ends++;
            });
          },
        });
        return { print: `${print.hash}/${print.end}/${print.events}`, casts, lands, ends };
      };
      const a = run();
      const b = run();
      expect(a).toEqual(b);
      // A cast whose landing the run ended before is the one exception.
      expect(a.casts - a.lands).toBeLessThanOrEqual(1);
      expect(a.lands).toBeLessThanOrEqual(a.casts);
      expect(a.ends).toBeLessThanOrEqual(a.lands);
      if (m.name === 'chapter' || m.name === 'endless' || m.name === 'daily with its rules') expect(a.casts).toBeGreaterThan(0);
    });
  }
});
