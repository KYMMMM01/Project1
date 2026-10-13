/**
 * The running body and the two skills that share it, step 1 simulation side: the tiger general's charge "The Tiger Has Arrived!" and the
 * starlight archer's "Starlight Lap" (docs/design_skills_v2.md 3.3, 3.6, 4.4, appendix; spec section 22.8). The sweep (the seam of the loop,
 * a body that moves 17 or 33 px a tick), each rule of the design, the events the view reads, and the edge cases around a run: enemies that
 * spawn, die, split or are pushed meanwhile, two runs at once, the tile that keeps attacking, a pause, a wave or a stage that ends, a
 * restored battle, 2x and 3x speed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DamageType, EnemyId, SpCastEvent, SpChargeData, SpLapData, StrikePoint } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { SP_RANK5_GAP, SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import {
  PATH_BOTTOM, PATH_LEFT, PATH_LENGTH, PATH_RADIUS, PATH_RIGHT, PATH_TOP, cellCenterX, cellCenterY, pathPoint, wrapPath,
} from '@/game/geometry';
import { shoveEnemy } from '@/game/sim/enemies';
import { lose, startWave } from '@/game/sim/flow';
import { createBattle } from '@/game/sim/create';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { LAND_REACH, charge, chooseStretch, chosen } from '@/game/sim/sp/charge';
import { lap, nearestPathPos } from '@/game/sim/sp/lap';
import { launchRun } from '@/game/sim/sp/run';
import { skillBefore } from '@/game/sim/sp/target';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, clearEnemies, foe, newSim, put, quietWave, slay } from './simHelpers';
import { fingerprintRun } from './spHelpers';

const CH = SP_ROWS.charge;
const LP = SP_ROWS.lap;
const L = PATH_LENGTH;
/** px a body moves in one tick. */
const TIGER_STEP = CH.speed * TICK;
const ARROW_STEP = LP.speed * TICK;
/** The centre cell reaches no road (range 240 against 285 px to the nearest edge): a tiger there stomps and never attacks. */
const MIDDLE = 12;

afterEach(() => {
  vi.restoreAllMocks();
});

// ───────────────────────────── helpers ─────────────────────────────

/** A battle in its first wave with the scripted spawns cancelled and the wave made endless: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  quietWave(sim);
  sim.waveDuration = 1e6;
  return sim;
}

/** An enemy held in place (the flag only: it can still be pushed), `travelled` px along the road. */
function pinned(sim: Sim, travelled: number, id: EnemyId = 'cucumber', hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** A tiger with a full gauge. The attack is switched off (the gauge is far below 1) unless `attacks`: a test of the run alone. */
function fullTiger(sim: Sim, cell = MIDDLE, attacks = false): SimUnit {
  const u = put(sim, cell, 'w_tiger');
  u.sp = 1;
  if (!attacks) u.charge = -1e9;
  return u;
}

function fullArcher(sim: Sim, cell = MIDDLE, attacks = false): SimUnit {
  const u = put(sim, cell, 'r_star');
  u.sp = 1;
  if (!attacks) u.charge = -1e9;
  return u;
}

interface Watch {
  casts: Array<{ time: number; event: SpCastEvent }>;
  touches: Array<{ time: number; runId: number; skill: string; uid: number; head: number; x: number; y: number }>;
  /** The `hit` that follows each `spRunHit`: the run's own damage. */
  stomps: Array<{ time: number; runId: number; uid: number; amount: number; crit: boolean; killed: boolean; type: DamageType; unitId: string | null }>;
  bursts: Array<{ time: number; runId: number; x: number; y: number; radius: number; points: StrikePoint[] }>;
  ends: Array<{ time: number; runId: number; skill: string; hits: number }>;
  /** Every `hit` event of the battle. */
  hits: Array<{ time: number; uid: number; amount: number; unitId: string | null; killed: boolean; crit: boolean }>;
  /** Event types and uids in the order they came: 'cast', 'touch:uid', 'hit:uid', 'burst', 'end'. */
  order: string[];
}

function watch(sim: Sim): Watch {
  const w: Watch = { casts: [], touches: [], stomps: [], bursts: [], ends: [], hits: [], order: [] };
  let pending: { runId: number; uid: number } | null = null;
  sim.events.on('spCast', (event) => {
    w.casts.push({ time: sim.time, event });
    w.order.push('cast');
  });
  sim.events.on('spRunHit', (p) => {
    w.touches.push({ time: sim.time, runId: p.runId, skill: p.skill, uid: p.enemy.uid, head: p.head, x: p.x, y: p.y });
    pending = { runId: p.runId, uid: p.enemy.uid };
    w.order.push(`touch:${p.enemy.uid}`);
  });
  sim.events.on('hit', (p) => {
    w.hits.push({ time: sim.time, uid: p.enemy.uid, amount: p.amount, unitId: p.unitId, killed: p.killed, crit: p.crit });
    w.order.push(`hit:${p.enemy.uid}`);
    if (pending && pending.uid === p.enemy.uid) {
      w.stomps.push({ time: sim.time, runId: pending.runId, uid: p.enemy.uid, amount: p.amount, crit: p.crit, killed: p.killed, type: p.type, unitId: p.unitId });
      pending = null;
    }
  });
  sim.events.on('spRunBurst', (p) => {
    w.bursts.push({ time: sim.time, runId: p.runId, x: p.x, y: p.y, radius: p.radius, points: p.points });
    w.order.push('burst');
  });
  sim.events.on('spRunEnd', (p) => {
    w.ends.push({ time: sim.time, runId: p.runId, skill: p.skill, hits: p.hits });
    w.order.push('end');
  });
  return w;
}

/** The tick in which a pinned enemy at `u` px ahead of the start (in the direction of the run) is first inside the swept interval. */
function touchTick(u: number, radius: number, step: number): number {
  return Math.max(1, Math.ceil((u - radius) / step - 1e-9));
}

/** The payload of the n-th cast of a run skill. */
function castData(w: Watch, n = 0): SpChargeData & SpLapData {
  return w.casts[n]!.event.data as SpChargeData & SpLapData;
}

/** A small deterministic generator for scattered fields (the tests must not depend on `Math.random`). */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// ───────────────────────────── the cats and the data ─────────────────────────────

describe('the tiger and the star archer carry their skills', () => {
  it('puts a rank 5 skill on each cat, registers the handlers and starts the gauge at 50%', () => {
    expect(unitDef('w_tiger').spSkill).toEqual({ id: 'charge', rank: 5, cooldown: 34, nameKey: 'sp.charge.name' });
    expect(unitDef('r_star').spSkill).toEqual({ id: 'lap', rank: 5, cooldown: 34, nameKey: 'sp.lap.name' });
    expect(SP_HANDLERS.charge).toBe(charge);
    expect(SP_HANDLERS.lap).toBe(lap);
    expect(CH).toMatchObject({ built: true, dist: 1100, speed: 1000, leap: 0.3, power: 1.2, ignoreDefence: true, weights: [1, 2, 3], minWeight: 3 });
    expect(LP).toMatchObject({ built: true, speed: 2000, extra: 100, power: 0.8, pool: 12.8, burst: { pct: 0.25, radius: 90 }, minEnemies: 4 });
    const sim = arena();
    const tiger = put(sim, MIDDLE, 'w_tiger');
    const archer = put(sim, 6, 'r_star');
    expect(tiger.sp).toBe(0.5);
    expect(archer.sp).toBe(0.5);
    advance(sim, 16.9);
    expect(tiger.sp).toBeLessThan(1);
    advance(sim, 0.3);
    expect(tiger.sp).toBe(1);
    expect(archer.sp).toBe(1);
  });

  it('fills the gauges with nothing to do and waits full: a tiger casts when a stretch worth the run appears, the archer at the fourth enemy', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim);
    const archer = fullArcher(sim, 6);
    advance(sim, 1);
    expect(w.casts).toHaveLength(0);
    expect(tiger.sp).toBe(1);
    pinned(sim, 100);
    pinned(sim, 200);
    pinned(sim, 900);
    advance(sim, 1);
    // Three ordinary enemies: the archer needs four, the tiger a stretch of weight 3 (they are within 1,100 px of the front at 900).
    expect(w.casts.map((c) => c.event.skill)).toEqual(['charge']);
    pinned(sim, 1500);
    advance(sim, 0.3);
    expect(w.casts.map((c) => c.event.skill)).toEqual(['charge', 'lap']);
    expect(tiger.sp).toBeLessThan(1);
    expect(archer.sp).toBeLessThan(1);
  });

  it('does nothing when the battle was started without skills', () => {
    const sim = arena({ sp: false });
    const w = watch(sim);
    fullTiger(sim);
    fullArcher(sim, 6);
    for (const p of [100, 200, 300, 400, 500]) pinned(sim, p);
    advance(sim, 3);
    expect(w.casts).toHaveLength(0);
    expect(sim.runners).toHaveLength(0);
  });
});

// ───────────────────────────── the nearest point of the road ─────────────────────────────

describe('nearestPathPos', () => {
  /** Distance to the closest point of the road found by walking all of it in small steps. */
  function brute(x: number, y: number): { dist: number; pos: number } {
    let best = Infinity;
    let at = 0;
    const p = { x: 0, y: 0, angle: 0 };
    for (let s = 0; s < L; s += 0.05) {
      pathPoint(s, p);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best) {
        best = d;
        at = s;
      }
    }
    return { dist: best, pos: at };
  }

  it('finds the nearest point of the road for the centre of every tile', () => {
    const p = { x: 0, y: 0, angle: 0 };
    for (let cell = 0; cell < 25; cell++) {
      const x = cellCenterX(cell);
      const y = cellCenterY(cell);
      const pos = nearestPathPos(x, y);
      expect(pos, `cell ${cell}`).toBeGreaterThanOrEqual(0);
      expect(pos, `cell ${cell}`).toBeLessThan(L);
      pathPoint(pos, p);
      expect(Math.hypot(p.x - x, p.y - y), `cell ${cell}`).toBeLessThanOrEqual(brute(x, y).dist + 1e-6);
    }
  });

  it('is exact on the sides and on the corners, also for points outside the board', () => {
    const p = { x: 0, y: 0, angle: 0 };
    const spots: Array<[number, number]> = [
      [360, 100], [600, 330], [360, 560], [100, 330], [60, 60], [660, 60], [660, 600], [60, 600], [30, 330], [700, 640], [360, 5], [5, 5],
      [90, 90], [200, 600], [650, 200],
    ];
    for (const [x, y] of spots) {
      const pos = nearestPathPos(x, y);
      pathPoint(pos, p);
      expect(Math.hypot(p.x - x, p.y - y), `(${x}, ${y})`).toBeLessThanOrEqual(brute(x, y).dist + 1e-6);
    }
  });

  it('puts the archer of a tile on the near side of the road, and a tie goes to the top, right, bottom, left in that order', () => {
    // Cell 0 is the top-left tile: the top edge is nearer than the left one.
    expect(nearestPathPos(cellCenterX(0), cellCenterY(0))).toBeCloseTo(cellCenterX(0) - (PATH_LEFT + PATH_RADIUS), 9);
    // Cell 4 (top row, right end): the top edge, 93 px away, against the right edge at 93 as well? The right tile is 99 px from the right edge.
    expect(nearestPathPos(cellCenterX(4), cellCenterY(4))).toBeCloseTo(cellCenterX(4) - (PATH_LEFT + PATH_RADIUS), 9);
    // The middle tile is as far from the top as from the bottom edge: the top wins.
    const centre = nearestPathPos(cellCenterX(MIDDLE), cellCenterY(MIDDLE));
    expect(centre).toBeCloseTo(cellCenterX(MIDDLE) - (PATH_LEFT + PATH_RADIUS), 9);
    // The middle of the left column is nearer to the left edge than anything: cell 10.
    const p = { x: 0, y: 0, angle: 0 };
    pathPoint(nearestPathPos(cellCenterX(10), cellCenterY(10)), p);
    expect(p.x).toBeCloseTo(PATH_LEFT, 9);
    expect(p.y).toBeCloseTo(cellCenterY(10), 9);
    // The bottom row: cell 22 is nearest to the bottom edge.
    pathPoint(nearestPathPos(cellCenterX(22), cellCenterY(22)), p);
    expect(p.y).toBeCloseTo(PATH_BOTTOM, 9);
    pathPoint(nearestPathPos(cellCenterX(14), cellCenterY(14)), p);
    expect(p.x).toBeCloseTo(PATH_RIGHT, 9);
    expect(PATH_TOP).toBe(45);
  });
});

// ───────────────────────────── the sweep ─────────────────────────────

describe('the sweep of the running body', () => {
  it('meets each enemy in the tick its radius reaches the head, front of the stretch first, and ends the run 1.4 s after the cast', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim);
    const spots = [1000, 900, 700, 400, 200];
    const foes = spots.map((p) => pinned(sim, p));
    sim.step(TICK);
    const t0 = sim.time;
    expect(w.casts).toHaveLength(1);
    expect(tiger.sp).toBe(0);
    expect(w.casts[0]!.event.skill).toBe('charge');
    advance(sim, 1.5);
    expect(w.touches.map((t) => t.uid)).toEqual(foes.map((e) => e.uid));
    // u, the distance behind the front, is 0, 100, 300, 600, 800; the leap is 18 ticks.
    const us = [0, 100, 300, 600, 800];
    w.touches.forEach((t, i) => {
      const k = touchTick(us[i]!, 18, TIGER_STEP);
      expect(Math.round((t.time - t0) / TICK), `enemy ${i}`).toBe(18 + k);
      expect(t.head).toBeCloseTo(Math.min(CH.dist, k * TIGER_STEP), 9);
    });
    expect(w.ends).toHaveLength(1);
    expect(Math.round((w.ends[0]!.time - t0) / TICK)).toBe(84);
    expect(w.ends[0]!.hits).toBe(5);
    expect(sim.runners).toHaveLength(0);
  });

  it('touches nothing during the leap and reaches exactly 1,100 px (plus the enemy\'s own radius) behind the front', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    // Three at the front (a stretch of weight 3 that starts at 2000), then one just inside the run's reach and one just outside it.
    [2000, 1990, 1980].forEach((p) => pinned(sim, p));
    const inside = pinned(sim, 2000 - (1100 + 18) + 3);
    const outside = pinned(sim, 2000 - (1100 + 18) - 3);
    sim.step(TICK);
    const t0 = sim.time;
    expect(castData(w).startPath).toBeCloseTo(2000, 9);
    advance(sim, 0.3);
    expect(w.touches).toHaveLength(0);
    expect(sim.time - t0).toBeCloseTo(0.3, 6);
    advance(sim, 1.3);
    const uids = w.touches.map((t) => t.uid);
    expect(uids).toContain(inside.uid);
    expect(uids).not.toContain(outside.uid);
    expect(uids).toHaveLength(4);
  });

  it('covers the landing zone in front of the start with the first tick only (the tiger\'s leap lead)', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = put(sim, MIDDLE, 'w_tiger');
    const near = pinned(sim, 1000 + 80, 'cucumber');
    const far = pinned(sim, 1000 + 82, 'cucumber');
    const past = pinned(sim, 1000 + 120, 'cucumber');
    launchRun(sim, { skill: 'charge', src: tiger, dir: -1, start: 1000, dist: 300, speed: 1000, delay: 0.3, lead: 63, amount: 1 });
    advance(sim, 0.31 + 0.5);
    // u is -80, -82 and -120: the first tick covers 63 + the cucumber's 18 = 81 px in front of the start.
    expect(w.touches.map((t) => t.uid)).toEqual([near.uid]);
    expect(w.touches[0]!.head).toBeCloseTo(TIGER_STEP, 9);
    void far;
    void past;
  });

  it('lets no enemy through a body that moves farther than the gap between them (17 and 33 px a tick)', () => {
    // Forty small enemies 11 px apart: the gap is smaller than a tick's step, and each one is only 12 px wide.
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const row = Array.from({ length: 40 }, (_, i) => pinned(sim, 300 + 11.3 * i, 'dust'));
    advance(sim, 2);
    expect(w.touches.map((t) => t.uid).sort((a, b) => a - b)).toEqual(row.map((e) => e.uid).sort((a, b) => a - b));
    expect(new Set(w.touches.map((t) => t.uid)).size).toBe(40);

    const fast = arena();
    const wf = watch(fast);
    fullArcher(fast);
    const line = Array.from({ length: 45 }, (_, i) => pinned(fast, 20 + 51.7 * i, 'dust'));
    advance(fast, 1.3);
    expect(new Set(wf.touches.map((t) => t.uid))).toEqual(new Set(line.map((e) => e.uid)));
    expect(wf.touches).toHaveLength(45);
  });

  it('works across the seam of the loop: a stretch that wraps past the end of the road coordinate', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    // The front is at 300; the stretch reaches back 800 px past the seam to L - 500.
    const a = pinned(sim, 300);
    const b = pinned(sim, 20);
    const c = pinned(sim, L - 40);
    const d = pinned(sim, L - 500);
    const out = pinned(sim, L - 850);
    advance(sim, 1.6);
    expect(castData(w).startPath).toBeCloseTo(300, 9);
    expect(w.touches.map((t) => t.uid)).toEqual([a.uid, b.uid, c.uid, d.uid]);
    expect(w.touches.map((t) => t.uid)).not.toContain(out.uid);
    // And the same for a run that starts a hair before the seam and goes against the flow, or with it, through it.
    const raw = arena();
    const wr = watch(raw);
    const runner = put(raw, MIDDLE, 'w_tiger');
    const edge = [L - 5, 4, 60, L - 90, 130].map((p) => pinned(raw, p));
    launchRun(raw, { skill: 'lap', src: runner, dir: 1, start: L - 10, dist: 400, speed: 2000, amount: 1 });
    advance(raw, 0.3);
    // With the flow from L - 10: u is 5 for L - 5, 14 for 4, 70 for 60, 130 for 120... L - 90 is 80 behind the start: never reached.
    expect(wr.touches.map((t) => t.uid)).toEqual([edge[0]!.uid, edge[1]!.uid, edge[2]!.uid, edge[4]!.uid]);
  });

  it('touches each enemy once, also where the lap\'s run covers the start twice', () => {
    const sim = arena();
    const w = watch(sim);
    fullArcher(sim);
    // The archer in the middle starts at 279. An enemy 50 px ahead of the start is inside the run twice (at 50 and at L + 50).
    const foes = [pinned(sim, 279 + 50), pinned(sim, 279 + 10), pinned(sim, 279 - 3), pinned(sim, 279 - 60), pinned(sim, 279 + 1500)];
    advance(sim, 1.4);
    expect(w.touches).toHaveLength(5);
    expect(new Set(w.touches.map((t) => t.uid))).toEqual(new Set(foes.map((e) => e.uid)));
    // The one 60 px behind the start is the last the arrow meets, near the end of its 2,438 px.
    expect(w.touches[w.touches.length - 1]!.uid).toBe(foes[3]!.uid);
    expect(w.touches[w.touches.length - 1]!.head).toBeGreaterThan(L - 60 - 18 - 1);
  });

  it('touches exactly the enemies of the stretch among scattered ones, for any seed (tiger), and every enemy (lap)', () => {
    for (const seed of [1, 2, 3]) {
      const rnd = lcg(seed * 7919);
      const sim = arena();
      const w = watch(sim);
      fullTiger(sim);
      const ids: EnemyId[] = ['cucumber', 'dust', 'drop', 'roomba', 'tangerine', 'balloon_small'];
      const field = Array.from({ length: 55 }, () => pinned(sim, rnd() * L, ids[Math.floor(rnd() * ids.length)]));
      sim.step(TICK);
      const start = castData(w).startPath;
      advance(sim, 1.6);
      const expected = new Set<number>();
      for (const e of field) {
        const u = wrapPath(start - e.travelled);
        const m = e.spec.radius;
        const lo = -LAND_REACH - m;
        const hi = CH.dist + m;
        const v = u > L / 2 ? u - L : u;
        if (Math.abs(v - lo) < 1e-6 || Math.abs(v - hi) < 1e-6) continue;
        if (v >= lo && v <= hi) expected.add(e.uid);
      }
      const touched = w.touches.map((t) => t.uid);
      expect(new Set(touched).size, `seed ${seed}`).toBe(touched.length);
      for (const uid of expected) expect(touched, `seed ${seed}`).toContain(uid);
      expect(touched.length, `seed ${seed}`).toBeLessThanOrEqual(expected.size + 2);
      expect(expected.size).toBeGreaterThan(10);

      const arrow = arena();
      const wa = watch(arrow);
      fullArcher(arrow);
      const crowd = Array.from({ length: 55 }, () => pinned(arrow, rnd() * L, ids[Math.floor(rnd() * ids.length)]));
      advance(arrow, 1.4);
      expect(wa.touches, `seed ${seed}`).toHaveLength(55);
      expect(new Set(wa.touches.map((t) => t.uid))).toEqual(new Set(crowd.map((e) => e.uid)));
    }
  });

  it('lands on the front enemies although they walked on during the leap, also the quick ones', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    // Three walking enemies: the cucumber and the drop at the front have moved 21 and 37 px on when the tiger lands.
    const lead = foe(sim, 'cucumber', 900);
    const quick = foe(sim, 'drop', 902);
    const rest = foe(sim, 'cucumber', 600);
    advance(sim, 1.6);
    expect(w.touches.map((t) => t.uid).sort((a, b) => a - b)).toEqual([lead.uid, quick.uid, rest.uid].sort((a, b) => a - b));
    expect(LAND_REACH).toBe(63);
  });

  it('leaves alone an enemy that is not in the stretch', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const pack = [900, 800, 700].map((p) => pinned(sim, p));
    // 1,120 px ahead of the front of the pack: in no stretch that is worth the run, and 1,218 px from the front along the run.
    const ahead = pinned(sim, 2020);
    advance(sim, 1.6);
    expect(w.touches.map((t) => t.uid)).toEqual(pack.map((e) => e.uid));
    expect(w.touches.map((t) => t.uid)).not.toContain(ahead.uid);
  });
});

// ───────────────────────────── the tiger ─────────────────────────────

describe('The Tiger Has Arrived!', () => {
  it('stomps with 1.2 x D through armour and ward, with no crit, as the tiger\'s own damage', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim);
    const ids: EnemyId[] = ['cucumber', 'roomba', 'tangerine'];
    ids.forEach((id, i) => pinned(sim, 700 - 50 * i, id));
    const random = vi.spyOn(Math, 'random');
    const crit = vi.spyOn(sim.rng.combat, 'next');
    advance(sim, 1.6);
    expect(w.stomps).toHaveLength(3);
    const d = tiger.stats.damage;
    for (const st of w.stomps) {
      expect(st.amount).toBeCloseTo(1.2 * d, 6);
      expect(st.crit).toBe(false);
      expect(st.type).toBe('physical');
      expect(st.unitId).toBe('w_tiger');
    }
    expect(CH.ignoreDefence).toBe(true);
    expect(random).not.toHaveBeenCalled();
    expect(crit).not.toHaveBeenCalled();
    expect(tiger.damageDealt).toBeCloseTo(3.6 * d, 6);
    expect(sim.damageByUnit[tiger.unitIndex]).toBeCloseTo(3.6 * d, 6);
  });

  it('is clipped by the elite and boss damage allowance like any other damage', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const boss = pinned(sim, 700, 'boss_vacuum');
    boss.target = true;
    boss.capTokens = 10;
    boss.capRate = 0;
    pinned(sim, 800);
    advance(sim, 1.6);
    const st = w.stomps.find((s) => s.uid === boss.uid)!;
    expect(st.amount).toBe(10);
    expect(boss.hp).toBeCloseTo(boss.maxHp - 10, 6);
  });

  it('is ready when the best stretch weighs 3: an ordinary enemy 1, an elite 2, a boss 3', () => {
    const sim = arena();
    const tiger = put(sim, MIDDLE, 'w_tiger');
    expect(charge.ready(sim, tiger)).toBe(false);
    pinned(sim, 100);
    pinned(sim, 150);
    expect(charge.ready(sim, tiger)).toBe(false);
    pinned(sim, 200);
    expect(charge.ready(sim, tiger)).toBe(true);
    expect(chosen.weight).toBe(3);
    clearEnemies(sim);
    pinned(sim, 100, 'spray');
    expect(charge.ready(sim, tiger)).toBe(false);
    pinned(sim, 300);
    expect(charge.ready(sim, tiger)).toBe(true);
    expect(chosen.weight).toBe(3);
    clearEnemies(sim);
    pinned(sim, 100, 'boss_vacuum');
    expect(charge.ready(sim, tiger)).toBe(true);
    clearEnemies(sim);
    // Three cucumbers spread round the loop so that no 1,100 px holds two of them.
    pinned(sim, 0);
    pinned(sim, L / 3);
    pinned(sim, (2 * L) / 3);
    expect(charge.ready(sim, tiger)).toBe(false);
    // Bring the third to within the stretch of the second.
    clearEnemies(sim);
    pinned(sim, 0);
    pinned(sim, 500);
    pinned(sim, 1000);
    expect(charge.ready(sim, tiger)).toBe(true);
  });

  it('chooses the heaviest stretch (an elite counts 2, a boss 3), also one that wraps past the seam, and lands at its front', () => {
    const sim = arena();
    put(sim, MIDDLE, 'w_tiger');
    // One cluster: its weight is the sum, its front the enemy farthest along the road.
    const a = [100, 150, 200, 300].map((p) => pinned(sim, p));
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect([chosen.weight, chosen.front]).toEqual([4, a[3]]);
    clearEnemies(sim);
    [100, 150, 200].forEach((p) => pinned(sim, p));
    const elite = pinned(sim, 300, 'spray');
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect([chosen.weight, chosen.front]).toEqual([5, elite]);
    clearEnemies(sim);
    pinned(sim, 100);
    const boss = pinned(sim, 200, 'boss_vacuum');
    pinned(sim, 150, 'firecracker');
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect([chosen.weight, chosen.front]).toEqual([6, boss]);
    // A stretch across the seam of the road coordinate: the front is the enemy that has gone farthest from the seam's far side.
    clearEnemies(sim);
    const seam = [L - 150, L - 60, 30, 90].map((p) => pinned(sim, p));
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect([chosen.weight, chosen.front]).toEqual([4, seam[3]]);
    // Nothing worth the run: two cucumbers, or an elite alone.
    clearEnemies(sim);
    pinned(sim, 100);
    pinned(sim, 150);
    expect(chooseStretch(sim.enemies)).toBe(false);
    expect(chosen.front).toBeNull();
  });

  it('agrees with a plain reference over scattered fields, with elites, bosses and the laser dot', () => {
    const wt = (e: SimEnemy): number => (e.isBoss ? 3 : e.isElite ? 2 : 1);
    const reference = (list: SimEnemy[]): { front: SimEnemy; weight: number } | null => {
      let best: { front: SimEnemy; weight: number } | null = null;
      let bestFocus = false;
      for (const f of [...list].sort((x, y) => (skillBefore(x, y) ? -1 : 1))) {
        let sum = 0;
        let focus = false;
        for (const e of list) {
          const gap = (((f.travelled - e.travelled) % L) + L) % L;
          if (gap <= 1100) {
            sum += wt(e);
            focus = focus || e.focused;
          }
        }
        if (sum < 3) continue;
        if (!best || (focus && !bestFocus) || (focus === bestFocus && sum > best.weight)) {
          best = { front: f, weight: sum };
          bestFocus = focus;
        }
      }
      return best;
    };
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = lcg(seed * 31337);
      const sim = arena();
      const count = 2 + Math.floor(rnd() * 22);
      const ids: EnemyId[] = ['cucumber', 'cucumber', 'cucumber', 'dust', 'spray', 'boss_vacuum'];
      const list = Array.from({ length: count }, () => pinned(sim, rnd() * 3 * L, ids[Math.floor(rnd() * ids.length)]));
      if (seed % 3 === 0) list[Math.floor(rnd() * count)]!.focused = true;
      const want = reference(list);
      expect(chooseStretch(sim.enemies), `seed ${seed}`).toBe(want !== null);
      if (want) {
        expect(chosen.front, `seed ${seed}`).toBe(want.front);
        expect(chosen.weight, `seed ${seed}`).toBe(want.weight);
      }
    }
  });

  it('breaks a tie by skill order, and prefers a stretch with an enemy inside the laser\'s dot', () => {
    const sim = arena();
    put(sim, MIDDLE, 'w_tiger');
    // Two packs of three, 1,200 px apart: the front enemy that is first in skill order (the one that has gone farthest) wins.
    const a = [100, 120, 140].map((p) => pinned(sim, p));
    const b = [1300, 1320, 1340].map((p) => pinned(sim, p));
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect(chosen.front).toBe(b[2]);
    expect(skillBefore(b[2]!, a[2]!)).toBe(true);
    // The laser's dot on the lighter pack: the pack with the focused enemy is chosen, when it is worth the run.
    a[1]!.focused = true;
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect(chosen.front).toBe(a[2]);
    // A focused enemy alone is not worth the run: the heavy stretch still wins.
    clearEnemies(sim);
    const lone = pinned(sim, 1800);
    lone.focused = true;
    [100, 120, 140].forEach((p) => pinned(sim, p));
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect(chosen.front!.travelled).toBe(140);
  });

  it('runs the stretch under the laser\'s dot when the player has put it on one worth the run', () => {
    const sim = arena();
    const w = watch(sim);
    // Nine cucumbers at the start of the road, and a smaller pack of four farther on, whose front is at 1400.
    [40, 80, 120, 160, 200, 240, 300, 350, 400].forEach((p) => pinned(sim, p));
    const pack = [1250, 1300, 1350, 1400].map((p) => pinned(sim, p));
    const tiger = put(sim, MIDDLE, 'w_tiger');
    tiger.charge = -1e9;
    tiger.sp = 1;
    expect(chooseStretch(sim.enemies)).toBe(true);
    expect(chosen.front!.travelled).toBe(400);
    // The dot on the second pack (the laser is the player's own control): its stretch is the one the tiger runs.
    expect(sim.setLaser(pack[1]!.x, pack[1]!.y)).toBeNull();
    advance(sim, 0.1);
    expect(pack[1]!.focused).toBe(true);
    expect(w.casts).toHaveLength(1);
    expect(castData(w).startPath).toBeCloseTo(1400, 9);
  });

  it('announces the run to the view: where it starts, which way, how far, how fast and when', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim);
    [800, 700, 650].forEach((p) => pinned(sim, p));
    sim.step(TICK);
    const t0 = sim.time;
    const ev = w.casts[0]!.event;
    expect(ev.skill).toBe('charge');
    expect(ev.unit).toBe(tiger);
    expect(ev.first).toBe(true);
    expect(ev.x).toBe(cellCenterX(MIDDLE));
    expect(ev.y).toBe(cellCenterY(MIDDLE));
    const d = ev.data as import('@/game/api').SpChargeData;
    expect(d).toMatchObject({ runId: 1, dir: -1, delay: 0.3, leap: 0.3, dist: 1100, speed: 1000 });
    expect(d.at).toBeCloseTo(t0, 9);
    expect(d.duration).toBeCloseTo(1.1, 9);
    expect(d.startPath).toBeCloseTo(800, 9);
    const p = pathPoint(800);
    expect(d.landX).toBeCloseTo(p.x, 9);
    expect(d.landY).toBeCloseTo(p.y, 9);
    // The view's formula for the body at any time agrees with the head the simulation reports at each touch.
    advance(sim, 1.6);
    for (const t of w.touches) {
      const head = Math.min(d.dist, d.speed * Math.max(0, t.time - d.at - d.delay));
      expect(t.head).toBeCloseTo(head, 6);
    }
    expect(w.ends[0]!.runId).toBe(1);
    // A second cast counts up and is no longer the first.
    tiger.sp = 1;
    advance(sim, 0.1);
    expect(w.casts).toHaveLength(2);
    expect((w.casts[1]!.event.data as { runId: number }).runId).toBe(2);
    expect(w.casts[1]!.event.first).toBe(false);
  });

  it('puts the cast before every touch and every hit of its run, and a touch before its hit', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const foes = [700, 650, 600].map((p) => pinned(sim, p));
    advance(sim, 1.6);
    const ord = w.order;
    expect(ord[0]).toBe('cast');
    for (const e of foes) expect(ord.indexOf(`touch:${e.uid}`)).toBe(ord.indexOf(`hit:${e.uid}`) - 1);
    expect(ord[ord.length - 1]).toBe('end');
  });

  it('keeps attacking from its tile while the body runs (the simulation has no away state)', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim, 1, true);
    const attacks: number[] = [];
    sim.events.on('attack', (a) => {
      if (a.unit === tiger) attacks.push(sim.time);
    });
    // Cell 1 (top row) reaches the top edge; the pack stands there, far enough from the front that the run is long.
    [330, 300, 270, 240, 210, 180, 150].forEach((p) => pinned(sim, p));
    sim.step(TICK);
    const t0 = sim.time;
    advance(sim, 1.5);
    expect(w.casts).toHaveLength(1);
    expect(w.ends).toHaveLength(1);
    const during = attacks.filter((t) => t > t0 && t <= w.ends[0]!.time);
    expect(during.length).toBeGreaterThanOrEqual(1);
    expect(tiger.removed).toBe(false);
  });

  it('goes on when the tiger is sold or merged away, and the damage still counts for it', () => {
    const sim = arena();
    const w = watch(sim);
    sim.fish = 0;
    const tiger = fullTiger(sim);
    [800, 700, 600, 500].forEach((p) => pinned(sim, p));
    advance(sim, 0.5);
    expect(sim.sell(MIDDLE)).toBeNull();
    expect(tiger.removed).toBe(true);
    advance(sim, 1.2);
    expect(w.stomps).toHaveLength(4);
    expect(w.ends).toHaveLength(1);
    expect(sim.damageByUnit[tiger.unitIndex]).toBeGreaterThan(0);
  });
});

// ───────────────────────────── the lap ─────────────────────────────

describe('Starlight Lap', () => {
  it('is ready with four enemies on the field, or an elite or a boss alone', () => {
    const sim = arena();
    const archer = put(sim, MIDDLE, 'r_star');
    expect(lap.ready(sim, archer)).toBe(false);
    [100, 900, 1500].forEach((p) => pinned(sim, p));
    expect(lap.ready(sim, archer)).toBe(false);
    pinned(sim, 2000);
    expect(lap.ready(sim, archer)).toBe(true);
    clearEnemies(sim);
    pinned(sim, 300, 'firecracker');
    expect(lap.ready(sim, archer)).toBe(true);
    clearEnemies(sim);
    pinned(sim, 300, 'boss_vacuum');
    expect(lap.ready(sim, archer)).toBe(true);
    clearEnemies(sim);
    expect(lap.ready(sim, archer)).toBe(false);
  });

  it('runs one lap and 100 px at 2,000 px/s from the point of the road nearest the archer, with the flow', () => {
    const sim = arena();
    const w = watch(sim);
    fullArcher(sim, 0);
    [100, 600, 1200, 1800].forEach((p) => pinned(sim, p));
    sim.step(TICK);
    const t0 = sim.time;
    const ev = w.casts[0]!.event;
    expect(ev.skill).toBe('lap');
    expect(ev.x).toBe(cellCenterX(0));
    const d = ev.data as import('@/game/api').SpLapData;
    expect(d).toMatchObject({ runId: 1, dir: 1, delay: 0, speed: 2000 });
    expect(d.dist).toBeCloseTo(L + 100, 9);
    expect(d.duration).toBeCloseTo((L + 100) / 2000, 9);
    expect(d.duration).toBeCloseTo(1.219, 3);
    expect(d.startPath).toBeCloseTo(cellCenterX(0) - (PATH_LEFT + PATH_RADIUS), 9);
    expect(d.startX).toBeCloseTo(cellCenterX(0), 9);
    expect(d.startY).toBeCloseTo(PATH_TOP, 9);
    expect(d.at).toBeCloseTo(t0, 9);
    advance(sim, 1.4);
    expect(w.touches).toHaveLength(4);
    // The start is at 63; enemies met in the order of their distance ahead of it (37, 537, 1137, 1737 px), each in its tick.
    expect(w.touches.map((t) => t.head)).toEqual([...w.touches.map((t) => t.head)].sort((a, b) => a - b));
    [37, 537, 1137, 1737].forEach((u, i) => {
      expect(Math.round((w.touches[i]!.time - t0) / TICK), `enemy ${i}`).toBe(touchTick(u, 18, ARROW_STEP));
    });
    expect(Math.round((w.ends[0]!.time - t0) / TICK)).toBe(74);
    for (const t of w.touches) {
      const head = Math.min(d.dist, d.speed * Math.max(0, t.time - d.at - d.delay));
      expect(t.head).toBeCloseTo(head, 6);
    }
  });

  it('gives each enemy a star of 0.8 D when 16 or fewer are on the field, and shares 12.8 D out above that', () => {
    const armor = 0.08;
    for (const n of [6, 16, 24, 40]) {
      const sim = arena();
      const w = watch(sim);
      const archer = fullArcher(sim);
      const d = archer.stats.damage;
      for (let i = 0; i < n; i++) pinned(sim, 20 + (i * (L - 80)) / n);
      advance(sim, 1.4);
      expect(w.stomps, `n=${n}`).toHaveLength(n);
      const share = Math.min(0.8, 12.8 / n);
      let sum = 0;
      for (const st of w.stomps) {
        expect(st.amount, `n=${n}`).toBeCloseTo(share * d * (1 - armor), 6);
        expect(st.crit).toBe(false);
        expect(st.unitId).toBe('r_star');
        sum += st.amount / (1 - armor);
      }
      expect(sum, `n=${n}`).toBeLessThanOrEqual(12.8 * d + 1e-6);
    }
  });

  it('counts elites and bosses like the rest, and the damage allowance clips them', () => {
    const sim = arena();
    const w = watch(sim);
    const archer = fullArcher(sim);
    const boss = pinned(sim, 700, 'boss_vacuum');
    boss.target = true;
    boss.capTokens = 7;
    boss.capRate = 0;
    const elite = pinned(sim, 900, 'spray');
    [100, 200, 300].forEach((p) => pinned(sim, p));
    advance(sim, 1.4);
    expect(w.stomps).toHaveLength(5);
    expect(w.stomps.find((s) => s.uid === boss.uid)!.amount).toBe(7);
    const d = archer.stats.damage;
    expect(w.stomps.find((s) => s.uid === elite.uid)!.amount).toBeCloseTo(0.8 * d * (1 - 0.2), 6);
  });

  it('spends no more than the pool on enemies that appear after the cast, and the late ones may find it empty', () => {
    const sim = arena();
    const w = watch(sim);
    const archer = fullArcher(sim);
    // The archer starts at 279; sixteen enemies a little ahead of it, all met before the late one.
    for (let i = 0; i < 16; i++) pinned(sim, 279 + 10 + i * 100);
    sim.step(TICK);
    expect(w.casts).toHaveLength(1);
    // Sixteen at the cast: 0.8 D each, the pool is spent exactly. A seventeenth that appears in front of the arrow gets nothing.
    advance(sim, 0.2);
    const late = pinned(sim, 279 + 1900);
    advance(sim, 1.3);
    expect(w.stomps).toHaveLength(16);
    expect(w.touches.map((t) => t.uid)).not.toContain(late.uid);
    expect(late.hp).toBe(late.maxHp);
    const total = w.stomps.reduce((a, st) => a + st.amount / 0.92, 0);
    expect(total).toBeCloseTo(12.8 * archer.stats.damage, 6);
  });

  it('keeps the pool for the enemies that were on the field at the cast: late ones never take a share an original is still owed', () => {
    // Twenty at the cast: each star is 12.8 / 20 = 0.64 D and the pool is spent exactly. Twelve more appear just in front of the arrow and
    // would be met before the last originals; they must find the pool reserved (the review: 25% of the casts over 16 enemies in endless
    // mode left an original un-starred while later spawns took its share).
    const sim = arena();
    const w = watch(sim);
    const archer = fullArcher(sim);
    const originals: SimEnemy[] = [];
    for (let i = 0; i < 20; i++) originals.push(pinned(sim, 20 + (i * (L - 80)) / 20));
    sim.step(TICK);
    expect(w.casts).toHaveLength(1);
    advance(sim, 0.2);
    const late: SimEnemy[] = [];
    for (let i = 0; i < 12; i++) late.push(pinned(sim, 279 + 600 + i * 30));
    advance(sim, 1.3);
    const touched = w.touches.map((t) => t.uid);
    for (const e of originals) expect(touched.filter((u) => u === e.uid), `original ${e.uid}`).toHaveLength(1);
    for (const e of late) expect(touched, `late ${e.uid}`).not.toContain(e.uid);
    expect(w.stomps).toHaveLength(20);
    const total = w.stomps.reduce((a, st) => a + st.amount / 0.92, 0);
    expect(total).toBeCloseTo(12.8 * archer.stats.damage, 6);
    expect(w.ends[0]!.hits).toBe(20);
  });

  it('lets late enemies take what is spare: with eight on the field there are sixteen shares, eight of them for the late ones', () => {
    const sim = arena();
    const w = watch(sim);
    const archer = fullArcher(sim);
    const originals: SimEnemy[] = [];
    for (let i = 0; i < 8; i++) originals.push(pinned(sim, 20 + (i * (L - 80)) / 8));
    sim.step(TICK);
    advance(sim, 0.2);
    const late: SimEnemy[] = [];
    for (let i = 0; i < 12; i++) late.push(pinned(sim, 279 + 600 + i * 30));
    advance(sim, 1.3);
    const touched = new Set(w.touches.map((t) => t.uid));
    for (const e of originals) expect(touched.has(e.uid), `original ${e.uid}`).toBe(true);
    // The late ones are met first (they stand close together in front of the arrow): the first eight take the spare, the rest find none.
    expect(late.filter((e) => touched.has(e.uid)).map((e) => e.uid)).toEqual(late.slice(0, 8).map((e) => e.uid));
    expect(w.stomps).toHaveLength(16);
    const total = w.stomps.reduce((a, st) => a + st.amount / 0.92, 0);
    expect(total).toBeCloseTo(12.8 * archer.stats.damage, 6);
  });

  it('releases the reserve of an original that dies before the arrow comes by: its share goes to a late enemy', () => {
    const sim = arena();
    const w = watch(sim);
    fullArcher(sim);
    const originals: SimEnemy[] = [];
    for (let i = 0; i < 16; i++) originals.push(pinned(sim, 20 + (i * (L - 80)) / 16));
    sim.step(TICK);
    advance(sim, 0.2);
    // Sixteen at the cast: the pool is exactly theirs. One of the farthest dies on its own; a late enemy then takes the one share it frees.
    const doomed = originals[15]!;
    slay(sim, doomed);
    const late = [pinned(sim, 279 + 600), pinned(sim, 279 + 630)];
    advance(sim, 1.3);
    const touched = new Set(w.touches.map((t) => t.uid));
    expect(touched.has(late[0]!.uid)).toBe(true);
    expect(touched.has(late[1]!.uid)).toBe(false);
    for (const e of originals.slice(0, 15)) expect(touched.has(e.uid), `original ${e.uid}`).toBe(true);
  });

  it('bursts where an enemy it fells falls: 25% D in 90 px, once, never setting off another burst', () => {
    const sim = arena();
    const w = watch(sim);
    const archer = fullArcher(sim);
    const d = archer.stats.damage;
    // The archer starts at 279. The fallen one is at 600 (1 hp); beside it on the straight right edge: A at 640 and B at 660 (1 hp: the
    // burst fells it), C at 760 (within 90 px of B, but 160 from the fallen one), and two that are far away.
    const fallen = pinned(sim, 600, 'cucumber', 1);
    const near = pinned(sim, 640);
    const weak = pinned(sim, 660, 'cucumber', 1);
    const second = pinned(sim, 760);
    const far = pinned(sim, 1300);
    pinned(sim, 1500);
    advance(sim, 1.4);
    // One burst only: B fell to it and did not burst in turn.
    expect(w.bursts).toHaveLength(1);
    const first = w.bursts[0]!;
    expect(first.radius).toBe(90);
    const caught = first.points.map((p) => p.uid);
    expect(caught).toContain(near.uid);
    expect(caught).toContain(weak.uid);
    expect(caught).not.toContain(second.uid);
    expect(caught).not.toContain(far.uid);
    expect(caught).not.toContain(fallen.uid);
    expect(first.x).toBeCloseTo(fallen.x, 9);
    expect(first.y).toBeCloseTo(fallen.y, 9);
    // The neighbour took the burst (0.25 D, armour 8%) and later the star; the one that fell to the burst never met the arrow.
    const burstHit = w.hits.find((h) => h.uid === near.uid)!;
    expect(burstHit.amount).toBeCloseTo(0.25 * d * 0.92, 6);
    expect(burstHit.unitId).toBe('r_star');
    expect(w.hits.find((h) => h.uid === weak.uid)!.killed).toBe(true);
    expect(w.touches.map((t) => t.uid)).not.toContain(weak.uid);
    // Out of reach of the burst: the first hit on the second neighbour is the arrow's star (6 enemies on the field at the cast: 0.8 D).
    expect(w.hits.find((h) => h.uid === second.uid)!.amount).toBeCloseTo(0.8 * d * 0.92, 6);
    expect(fallen.dead).toBe(true);
  });

  it('grows the burst with the archer\'s area bonus (the level-10 perk), like the passive\'s own burst', () => {
    const sim = arena({}, 10);
    const w = watch(sim);
    const archer = fullArcher(sim);
    expect(archer.perk.radius).toBeCloseTo(0.25, 9);
    // On the straight right edge of the road: 120 px away is inside 90 x 1.25 + 18 and outside 90 + 18.
    const fallen = pinned(sim, 700, 'cucumber', 1);
    const wide = pinned(sim, 820);
    const out = pinned(sim, 840);
    pinned(sim, 1500);
    advance(sim, 1.4);
    expect(fallen.dead).toBe(true);
    expect(w.bursts).toHaveLength(1);
    expect(w.bursts[0]!.radius).toBeCloseTo(112.5, 9);
    expect(w.bursts[0]!.points.map((p) => p.uid)).toContain(wide.uid);
    expect(w.bursts[0]!.points.map((p) => p.uid)).not.toContain(out.uid);
  });

  it('puts the burst after the kill and before the victims\' numbers', () => {
    const sim = arena();
    const w = watch(sim);
    fullArcher(sim);
    const a = pinned(sim, 600, 'cucumber', 1);
    const b = pinned(sim, 650);
    pinned(sim, 1000);
    pinned(sim, 1500);
    advance(sim, 1.4);
    const ord = w.order;
    const i = ord.indexOf(`touch:${a.uid}`);
    expect(ord[i + 1]).toBe(`hit:${a.uid}`);
    expect(ord[i + 2]).toBe('burst');
    expect(ord[i + 3]).toBe(`hit:${b.uid}`);
    expect(w.hits.find((h) => h.uid === a.uid)!.killed).toBe(true);
  });

  it('lets a felled enemy\'s children be touched as the ordinary enemies they are', () => {
    const sim = arena();
    const w = watch(sim);
    fullArcher(sim);
    pinned(sim, 700, 'balloon', 1);
    pinned(sim, 1200);
    pinned(sim, 1500);
    pinned(sim, 1800);
    advance(sim, 1.4);
    // The balloon (1 hp) falls to the star and splits in two; the children appear at its spot and are met later in the same run, or not at all if the arrow has gone by. Each enemy is touched once.
    const uids = w.touches.map((t) => t.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(w.ends[0]!.hits).toBe(uids.length);
  });
});

// ───────────────────────────── around a run ─────────────────────────────

describe('enemies that spawn, die, split or are pushed while the body runs', () => {
  it('touches an enemy that appears in front of the head, and not one that appears where the head has been', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    [900, 850, 800].forEach((p) => pinned(sim, p));
    sim.step(TICK);
    advance(sim, 0.3 + 0.5);
    // After 0.5 s of running the head is about 500 px behind the front, at road 400.
    const before = pinned(sim, 700);
    const after = pinned(sim, 300);
    advance(sim, 1);
    expect(w.touches.map((t) => t.uid)).not.toContain(before.uid);
    expect(w.touches.map((t) => t.uid)).toContain(after.uid);
  });

  it('skips an enemy that dies before the body reaches it, and goes on', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const lead = pinned(sim, 900);
    const doomed = pinned(sim, 500);
    const rest = pinned(sim, 200);
    sim.step(TICK);
    advance(sim, 0.4);
    slay(sim, doomed);
    advance(sim, 1.2);
    expect(doomed.dead).toBe(true);
    expect(w.touches.map((t) => t.uid)).toEqual([lead.uid, rest.uid]);
    expect(w.ends[0]!.hits).toBe(2);
  });

  it('stomps the children of a balloon it fells: each child at most once', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    pinned(sim, 900);
    pinned(sim, 880);
    const balloon = pinned(sim, 500, 'balloon', 1);
    const born: number[] = [];
    sim.events.on('enemySpawn', (p) => {
      if (p.enemy.id === 'balloon_small') born.push(p.enemy.uid);
    });
    advance(sim, 1.6);
    expect(balloon.dead).toBe(true);
    const uids = w.touches.map((t) => t.uid);
    expect(new Set(uids).size).toBe(uids.length);
    // The parent and its two children (they appear 7 px either side of it and the head is still coming): five stomps in all.
    expect(born).toHaveLength(2);
    for (const uid of born) expect(uids).toContain(uid);
    expect(uids).toHaveLength(5);
  });

  it('touches a pushed enemy once, wherever the shove takes it', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    pinned(sim, 900);
    const pushed = pinned(sim, 600);
    const away = pinned(sim, 300);
    sim.step(TICK);
    advance(sim, 0.35);
    // The head is a few tens of px behind the front; shove one enemy toward it and one with the flow... shoves go backwards: both come closer.
    expect(shoveEnemy(sim, pushed, 160, 0.35, 3)).toBeGreaterThan(0);
    expect(shoveEnemy(sim, away, 100, 0.35, 3)).toBeGreaterThan(0);
    advance(sim, 1.4);
    const uids = w.touches.map((t) => t.uid);
    expect(uids.filter((u) => u === pushed.uid)).toHaveLength(1);
    expect(uids.filter((u) => u === away.uid)).toHaveLength(1);
  });

  it('touches an enemy that a shove carries back through the head', () => {
    // A body creeping at 17 px a tick and an enemy sliding toward it at 7.6 px a tick: they cross once.
    const sim = arena();
    const w = watch(sim);
    const tiger = put(sim, MIDDLE, 'w_tiger');
    const e = pinned(sim, 700);
    launchRun(sim, { skill: 'charge', src: tiger, dir: -1, start: 900, dist: 600, speed: 300, amount: 1 });
    advance(sim, 0.2);
    shoveEnemy(sim, e, 160, 0.35, 3);
    advance(sim, 3);
    expect(w.touches.filter((t) => t.uid === e.uid)).toHaveLength(1);
  });
});

describe('two runs at once', () => {
  it('lets the tiger and the archer run together, each touching what it passes with its own damage', () => {
    const sim = arena();
    const w = watch(sim);
    const tiger = fullTiger(sim, 11);
    const archer = fullArcher(sim, 13);
    const field = [900, 800, 700, 600, 500].map((p) => pinned(sim, p));
    advance(sim, 3);
    expect(w.casts.map((c) => c.event.skill)).toEqual(['charge', 'lap']);
    // The archer waits the 1.2 s gap and runs while the tiger is still on the road (1.4 s long).
    expect(w.casts[1]!.time - w.casts[0]!.time).toBeGreaterThanOrEqual(SP_RANK5_GAP - 1e-9);
    expect(w.casts[1]!.time - w.casts[0]!.time).toBeLessThan(SP_RANK5_GAP + 2 * TICK);
    const tigerEnd = w.ends.find((e) => e.skill === 'charge')!;
    expect(w.casts[1]!.time).toBeLessThan(tigerEnd.time);
    const byRun = new Map<number, number[]>();
    for (const t of w.touches) byRun.set(t.runId, [...(byRun.get(t.runId) ?? []), t.uid]);
    expect([...byRun.keys()].sort()).toEqual([1, 2]);
    for (const uids of byRun.values()) expect(new Set(uids)).toEqual(new Set(field.map((e) => e.uid)));
    expect(w.ends).toHaveLength(2);
    expect(tiger.damageDealt).toBeGreaterThan(0);
    expect(archer.damageDealt).toBeGreaterThan(0);
  });

  it('lets two tigers stomp the same stretch twice, one run after the other', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim, 11);
    fullTiger(sim, 13);
    const field = [900, 800, 700].map((p) => pinned(sim, p));
    advance(sim, 3);
    expect(w.casts).toHaveLength(2);
    for (const e of field) expect(w.touches.filter((t) => t.uid === e.uid)).toHaveLength(2);
    expect(w.touches.map((t) => t.runId).sort()).toEqual([1, 1, 1, 2, 2, 2]);
  });
});

describe('a run and the rest of the battle', () => {
  it('goes on through the end of a wave', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    const field = [900, 800, 700, 600, 500, 400].map((p) => pinned(sim, p));
    sim.step(TICK);
    advance(sim, 0.8);
    expect(w.ends).toHaveLength(0);
    expect(sim.callNextWave()).toBeNull();
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    expect(sim.wave).toBe(2);
    advance(sim, 1);
    expect(w.ends).toHaveLength(1);
    expect(new Set(w.touches.map((t) => t.uid))).toEqual(new Set(field.map((e) => e.uid)));
  });

  it('freezes with a defeat and goes on after a revive: the lost battle touches nothing, the revived one finishes the run', () => {
    const sim = arena();
    const w = watch(sim);
    fullTiger(sim);
    // Three enemies at the front of the stretch, two a long way behind it (met about 0.5 and 0.7 s after the landing).
    const field = [900, 850, 800, 400, 200].map((p) => pinned(sim, p));
    sim.step(TICK);
    advance(sim, 0.7);
    expect(w.touches.map((t) => t.uid)).toEqual(field.slice(0, 3).map((e) => e.uid));
    lose(sim, 'boss_timeout');
    expect(sim.phase).toBe('lost');
    const head = sim.runners[0]!.head;
    advance(sim, 3);
    // Nothing moved, nothing was touched, and no end was announced for a run that did not end.
    expect(sim.runners).toHaveLength(1);
    expect(sim.runners[0]!.head).toBe(head);
    expect(w.touches).toHaveLength(3);
    expect(w.ends).toHaveLength(0);
    expect(sim.revive()).toBeNull();
    expect(sim.phase).toBe('wave');
    advance(sim, 1);
    expect(w.touches.map((t) => t.uid)).toEqual(field.map((e) => e.uid));
    expect(w.ends).toHaveLength(1);
    expect(w.ends[0]!.hits).toBe(5);
    expect(sim.runners).toHaveLength(0);
  });

  it('pauses with a choice popup and goes on after it, also when the stage that ended opened it', () => {
    const sim = arena();
    const w = watch(sim);
    sim.wave = 3;
    startWave(sim, 4);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    advance(sim, 1.1);
    expect(sim.boss).not.toBeNull();
    const field = [1500, 1400, 1300, 1000, 700, 480].map((p) => pinned(sim, p));
    const tiger = fullTiger(sim);
    slay(sim);
    expect(sim.stage).toBe('clearing');
    for (let i = 0; i < 400 && sim.phase !== 'choice'; i++) sim.step(TICK);
    expect(sim.phase).toBe('choice');
    expect(sim.runners).toHaveLength(1);
    const left = w.touches.length;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(field.length);
    const snapshot = JSON.stringify([sim.time, sim.runners[0]!.age, sim.runners[0]!.head, w.order.length]);
    sim.step(5);
    expect(JSON.stringify([sim.time, sim.runners[0]!.age, sim.runners[0]!.head, w.order.length])).toBe(snapshot);
    expect(sim.pickRelic(0)).toBeNull();
    advance(sim, 1);
    expect(sim.runners).toHaveLength(0);
    expect(w.ends).toHaveLength(1);
    expect(new Set(w.touches.map((t) => t.uid))).toEqual(new Set(field.map((e) => e.uid)));
    expect(tiger.sp).toBeLessThan(1);
  });

  it('is not saved: a restored battle starts with no run and no cast', () => {
    const sim = arena();
    fullTiger(sim);
    [900, 800, 700, 600].forEach((p) => pinned(sim, p));
    sim.step(TICK);
    advance(sim, 0.5);
    expect(sim.runners).toHaveLength(1);
    sim.spawnIds.length = 0;
    expect(sim.callNextWave()).toBeNull();
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const restored = createBattle(sim.init, snap!) as Sim;
    expect(restored).not.toBeNull();
    expect(restored.runners).toHaveLength(0);
    expect(restored.later).toHaveLength(0);
    const w = watch(restored);
    advance(restored, 4);
    expect(w.casts).toHaveLength(0);
    expect(w.touches).toHaveLength(0);
  });

  it('gives the same result at 1x, 2x and 3x speed: only simulation time counts', () => {
    const play = (chunk: number): string => {
      const sim = arena();
      const w = watch(sim);
      fullTiger(sim);
      fullArcher(sim, 13);
      const rnd = lcg(99);
      for (let i = 0; i < 30; i++) pinned(sim, rnd() * L, i % 7 === 0 ? 'balloon' : 'cucumber', i % 5 === 0 ? 1 : 1e9);
      const ticks = 3 * 60;
      for (let n = 0; n < ticks / chunk; n++) sim.step(chunk * TICK);
      return JSON.stringify([w.order, w.touches.map((t) => [t.runId, t.uid, Math.round(t.time * 1e6), Math.round(t.head * 1e6)]), w.hits.map((h) => [h.uid, Math.round(h.amount * 1e6)])]);
    };
    const one = play(1);
    expect(one.length).toBeGreaterThan(200);
    expect(play(2)).toBe(one);
    expect(play(3)).toBe(one);
  });

  it('is deterministic: the same battle twice gives the same events, and no Math.random is used', () => {
    const random = vi.spyOn(Math, 'random');
    const play = (): string => {
      const sim = arena();
      const w = watch(sim);
      fullTiger(sim);
      fullArcher(sim, 13);
      const rnd = lcg(5);
      for (let i = 0; i < 40; i++) foe(sim, i % 3 === 0 ? 'drop' : 'cucumber', rnd() * L, 1e9);
      advance(sim, 4);
      return JSON.stringify([w.order, w.touches.map((t) => [t.runId, t.uid, t.time]), w.hits.map((h) => [h.uid, h.amount])]);
    };
    const a = play();
    expect(play()).toBe(a);
    expect(a).toContain('touch');
    expect(random).not.toHaveBeenCalled();
  });

  it('plays a whole bot run twice with the same result when a tiger and an archer are on the board', () => {
    const init = { ...newSim().init, seed: 4242 };
    const counts: number[] = [];
    const once = (): string => {
      let touches = 0;
      const print = fingerprintRun(init, 'synergy', {
        maxSeconds: 150,
        setup(s) {
          put(s, 12, 'w_tiger');
          put(s, 13, 'r_star');
          s.events.on('spRunHit', () => {
            touches++;
          });
        },
      });
      counts.push(touches);
      return `${print.hash}/${print.end}/${print.events}`;
    };
    expect(once()).toBe(once());
    expect(counts[0]).toBe(counts[1]);
    expect(counts[0]).toBeGreaterThan(0);
  });
});

describe('the field in the simulation is untouched by the types', () => {
  it('exposes the enemy flags the tiger reads', () => {
    const sim = arena();
    const boss = foe(sim, 'boss_vacuum', 100);
    const elite = foe(sim, 'spray', 100);
    const plain = foe(sim, 'cucumber', 100);
    expect([boss.isBoss, elite.isElite, plain.isBoss || plain.isElite]).toEqual([true, true, false]);
  });
});
