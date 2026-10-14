/**
 * The samurai's skill, Already Cut (docs/design_skills_v2.md 3.2, 4.4, 4.5, the data appendix; spec section 22.8.4): a white afterimage marks
 * up to ten enemies of a 450 px stretch of road with thin lines and 1.2 s later every line opens at once and cuts 1.4 D; a line whose enemy
 * died meanwhile moves to a near enemy that carries no line. The frame it stands on is tested in `sim.spSkills.test.ts`.
 *
 * The geometry used throughout: the samurai stands on cell 0 (centre 144, 138; range 230), so the top edge of the road is inside its reach
 * from `travelled` 0 to about 275, and an enemy at `travelled` t on that edge is at x = 81 + t, y = 45.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, EnemyId, SpCastEvent, SpCutData } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { PATH_LENGTH, cellCenterX, cellCenterY, wrapPath } from '@/game/geometry';
import { killEnemy, spawnEnemy } from '@/game/sim/enemies';
import { lose, startWave } from '@/game/sim/flow';
import { createBattle } from '@/game/sim/create';
import { cut } from '@/game/sim/sp/cut';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave } from './simHelpers';
import { fingerprintRun } from './spHelpers';

const ROW = SP_ROWS.cut;

afterEach(() => {
  vi.restoreAllMocks();
});

// ───────────────────────────── helpers ─────────────────────────────

/** A battle in its first wave with the scripted spawns cancelled and the wave made endless: a test controls the field. */
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

/** A samurai with a full gauge and its own attack switched off (so that only the skill touches the field). */
function samurai(sim: Sim, cell = 0): SimUnit {
  const u = put(sim, cell, 'w_samurai', 0);
  u.sp = 1;
  u.charge = -1e9;
  return u;
}

/** Casts through the handler the way the gauge pass does (asserting that the skill said it was ready). */
function cast(sim: Sim, u: SimUnit): void {
  expect(cut.ready(sim, u)).toBe(true);
  expect(cut.cast(sim, u)).toBe(true);
  u.sp = 0;
}

interface Tape {
  casts: Array<{ time: number; event: SpCastEvent }>;
  opens: Array<{ time: number; event: BattleEvents['cutOpen'] }>;
  hits: Array<{ time: number; uid: number; amount: number; unitId: string | null; crit: boolean; killed: boolean }>;
  /** 'cast', 'open', 'hit:uid' in the order they came. */
  order: string[];
}

function tape(sim: Sim): Tape {
  const t: Tape = { casts: [], opens: [], hits: [], order: [] };
  sim.events.on('spCast', (event) => {
    t.casts.push({ time: sim.time, event });
    t.order.push('cast');
  });
  sim.events.on('cutOpen', (event) => {
    t.opens.push({ time: sim.time, event });
    t.order.push('open');
  });
  sim.events.on('hit', (p) => {
    t.hits.push({ time: sim.time, uid: p.enemy.uid, amount: p.amount, unitId: p.unitId, crit: p.crit, killed: p.killed });
    t.order.push(`hit:${p.enemy.uid}`);
  });
  return t;
}

function data(t: Tape, i = 0): SpCutData {
  const e = t.casts[i]!.event;
  if (e.skill !== 'cut') throw new Error('not a cut cast');
  return e.data;
}

/** What one cut takes from an enemy of kind `id` when the samurai's hit is `d`: 1.4 D through the enemy's armour. */
function cutOn(id: EnemyId, d: number): number {
  return ROW.power * d * (1 - enemySpec(id).armor);
}

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Already Cut, the data', () => {
  it("has the design appendix's cells and is built: the samurai carries the skill and its handler is registered", () => {
    expect(ROW).toMatchObject({
      id: 'cut', unit: 'w_samurai', rank: 4, cooldown: 20, half: 225, max: 10, fuse: 1.2, power: 1.4, reaim: 150, minEnemies: 2, built: true,
    });
    expect(unitDef('w_samurai').spSkill).toEqual({ id: 'cut', rank: 4, cooldown: 20, nameKey: 'sp.cut.name' });
    expect(SP_HANDLERS.cut).toBe(cut);
  });

  it("fills the samurai's gauge in its own cooldown (20 s, the owner's value), from the 50% a cat starts at in half of it", () => {
    const sim = arena();
    const u = put(sim, 0, 'w_samurai');
    expect(u.sp).toBe(0.5);
    advance(sim, ROW.cooldown / 2 - 0.2);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── ready ─────────────────────────────

describe('when the samurai is ready', () => {
  it('needs an enemy in its reach, and two in the stretch (or an elite or a boss in reach)', () => {
    const sim = arena();
    const u = samurai(sim);
    expect(cut.ready(sim, u)).toBe(false);
    expect(cut.cast(sim, u)).toBe(false);
    pinned(sim, 200);
    expect(cut.ready(sim, u)).toBe(false);
    pinned(sim, 150);
    expect(cut.ready(sim, u)).toBe(true);
  });

  it('wants the anchor inside the reach: two enemies far from the samurai are not enough', () => {
    const sim = arena();
    const u = samurai(sim);
    pinned(sim, 1200);
    pinned(sim, 1220);
    expect(cut.ready(sim, u)).toBe(false);
  });

  it("counts the whole stretch, in reach or not: the second enemy may stand outside the samurai's range", () => {
    const sim = arena();
    const u = samurai(sim);
    const anchor = pinned(sim, 270);
    const far = pinned(sim, 470);
    expect(cut.ready(sim, u)).toBe(true);
    const t = tape(sim);
    cast(sim, u);
    expect(data(t).anchorUid).toBe(anchor.uid);
    expect(data(t).marks.map((m) => m.uid)).toEqual([anchor.uid, far.uid]);
  });

  it('is ready for a lone elite or boss in reach, and not for a lone plain enemy or a lone elite out of reach', () => {
    for (const id of ['firecracker', 'boss_vacuum'] as EnemyId[]) {
      const sim = arena();
      const u = samurai(sim);
      pinned(sim, 800, id);
      expect(cut.ready(sim, u), `${id} out of reach`).toBe(false);
      pinned(sim, 150, id);
      expect(cut.ready(sim, u), `${id} in reach`).toBe(true);
      const t = tape(sim);
      cast(sim, u);
      expect(data(t).marks).toHaveLength(1);
    }
    const sim = arena();
    const u = samurai(sim);
    pinned(sim, 150, 'cucumber');
    expect(cut.ready(sim, u)).toBe(false);
  });

  it('does not change anything when it only looks', () => {
    const sim = arena();
    const u = samurai(sim);
    pinned(sim, 150);
    pinned(sim, 160);
    const before = JSON.stringify([sim.later.length, u.sp, sim.enemies.map((e) => [e.uid, e.hp])]);
    for (let i = 0; i < 5; i++) cut.ready(sim, u);
    expect(JSON.stringify([sim.later.length, u.sp, sim.enemies.map((e) => [e.uid, e.hp])])).toBe(before);
  });
});

// ───────────────────────────── the anchor and the marks ─────────────────────────────

describe('the anchor and the marks', () => {
  it('anchors on the first enemy in skill order: the laser first, then an elite or boss, then the farthest along, then the lower uid', () => {
    {
      const sim = arena();
      const u = samurai(sim);
      pinned(sim, 100);
      const far = pinned(sim, 230);
      const mid = pinned(sim, 180);
      const t = tape(sim);
      cast(sim, u);
      expect(data(t).anchorUid).toBe(far.uid);
      expect(data(t).marks.map((m) => m.uid)).toEqual([far.uid, mid.uid, sim.enemies.find((e) => e.travelled === 100)!.uid]);
    }
    {
      const sim = arena();
      const u = samurai(sim);
      pinned(sim, 230);
      const elite = pinned(sim, 120, 'firecracker');
      const t = tape(sim);
      cast(sim, u);
      expect(data(t).anchorUid).toBe(elite.uid);
    }
    {
      const sim = arena();
      const u = samurai(sim);
      pinned(sim, 230);
      const dot = pinned(sim, 110);
      pinned(sim, 120, 'firecracker');
      dot.focused = true;
      const t = tape(sim);
      cast(sim, u);
      expect(data(t).anchorUid).toBe(dot.uid);
    }
    {
      const sim = arena();
      const u = samurai(sim);
      const a = pinned(sim, 150);
      const b = pinned(sim, 150);
      const t = tape(sim);
      cast(sim, u);
      expect(data(t).anchorUid).toBe(Math.min(a.uid, b.uid));
      expect(data(t).marks.map((m) => m.uid)).toEqual([a.uid, b.uid]);
    }
  });

  it('marks at most ten, the closest to the anchor along the road first, the anchor first of all', () => {
    const sim = arena();
    const u = samurai(sim);
    const line = [];
    for (let i = 0; i < 12; i++) line.push(pinned(sim, 100 + 10 * i));
    const t = tape(sim);
    cast(sim, u);
    // The anchor is the farthest along (travelled 210), then 200, 190 ... 120: ten marks; 110 and 100 are left out.
    expect(data(t).marks.map((m) => m.uid)).toEqual(line.slice(2).reverse().map((e) => e.uid));
    expect(data(t).anchorUid).toBe(line[11]!.uid);
    expect(data(t).marks).toHaveLength(ROW.max);
  });

  it('takes enemies at a gap of 225 px and not at 226, and counts the gap round the seam of the road', () => {
    const sim = arena();
    const u = samurai(sim);
    const anchor = pinned(sim, 250);
    const edge = pinned(sim, 25);
    const out = pinned(sim, 24);
    const t = tape(sim);
    cast(sim, u);
    const ids = data(t).marks.map((m) => m.uid);
    expect(ids).toContain(edge.uid);
    expect(ids).not.toContain(out.uid);
    expect(ids[0]).toBe(anchor.uid);

    // Round the seam: an anchor at 30 (the laser's choice: the enemy at PATH_LENGTH - 100 is farther along) and an enemy at
    // PATH_LENGTH - 100 are 130 px apart along the road; one at PATH_LENGTH - 260 is 290 px away.
    const sim2 = arena();
    const u2 = samurai(sim2);
    const a2 = pinned(sim2, 30);
    a2.focused = true;
    const seam = pinned(sim2, PATH_LENGTH - 100);
    const beyond = pinned(sim2, PATH_LENGTH - 260);
    const t2 = tape(sim2);
    cast(sim2, u2);
    expect(data(t2).anchorUid).toBe(a2.uid);
    expect(data(t2).marks.map((m) => m.uid)).toEqual([a2.uid, seam.uid]);
    expect(data(t2).marks.map((m) => m.uid)).not.toContain(beyond.uid);
  });

  it('breaks a tie in the gap by skill order', () => {
    const sim = arena();
    const u = samurai(sim);
    const anchor = pinned(sim, 200);
    // 40 px behind and 40 px ahead are as far from the anchor... the anchor is the farthest along, so use two behind at the same place.
    const a = pinned(sim, 160);
    const b = pinned(sim, 160);
    const t = tape(sim);
    cast(sim, u);
    expect(data(t).marks.map((m) => m.uid)).toEqual([anchor.uid, Math.min(a.uid, b.uid), Math.max(a.uid, b.uid)]);
  });

  it('breaks a tie in the gap by skill order, not by the order the enemies stand in the list', () => {
    const sim = arena();
    const u = samurai(sim);
    // The elite is the anchor; one plain enemy 30 px behind it and one 30 px ahead are equally far. The one farther along comes first in skill
    // order, though it was spawned second.
    const behind = pinned(sim, 170);
    const ahead = pinned(sim, 230);
    const elite = pinned(sim, 200, 'firecracker');
    const t = tape(sim);
    cast(sim, u);
    expect(data(t).marks.map((m) => m.uid)).toEqual([elite.uid, ahead.uid, behind.uid]);
  });

  it("describes the afterimage's road: the anchor's coordinate and the two ends, wrapped into the loop", () => {
    const sim = arena();
    const u = samurai(sim);
    const a = pinned(sim, 130);
    pinned(sim, 100);
    const t = tape(sim);
    cast(sim, u);
    const d = data(t);
    expect(d).toMatchObject({ anchorUid: a.uid, anchorPath: 130, at: sim.time, fuse: 1.2 });
    expect(d.fromPath).toBeCloseTo(wrapPath(130 - 225), 9);
    expect(d.fromPath).toBeCloseTo(PATH_LENGTH - 95, 6);
    expect(d.toPath).toBeCloseTo(355, 9);
    expect(d.marks[0]).toEqual({ uid: a.uid, x: a.x, y: a.y });
    expect(t.casts[0]!.event.x).toBe(cellCenterX(0));
    expect(t.casts[0]!.event.y).toBe(cellCenterY(0));
  });

  it("wraps an anchor that has gone round the loop: travelled keeps counting past the length of the road", () => {
    const sim = arena();
    const u = samurai(sim);
    // travelled = PATH_LENGTH + 130 is the same place as 130.
    const a = pinned(sim, PATH_LENGTH + 130);
    pinned(sim, PATH_LENGTH + 100);
    const t = tape(sim);
    cast(sim, u);
    expect(data(t).anchorUid).toBe(a.uid);
    expect(data(t).anchorPath).toBeCloseTo(130, 6);
  });
});

// ───────────────────────────── the fuse and the cut ─────────────────────────────

describe('the fuse and the cut', () => {
  it('does nothing for 1.2 s and then cuts every marked enemy once for 1.4 D, no crit, credited to the samurai', () => {
    const sim = arena();
    const u = samurai(sim);
    const d = u.stats.damage;
    const field = [150, 170, 190, 210].map((p) => pinned(sim, p));
    const hp = field.map((e) => e.hp);
    const t = tape(sim);
    cast(sim, u);
    // The numbers are fixed at the cast: a later change of the samurai's hit does not change the cut.
    u.stats.damage = d * 3;
    advance(sim, 1.15);
    expect(t.hits).toHaveLength(0);
    expect(t.opens).toHaveLength(0);
    expect(field.map((e) => e.hp)).toEqual(hp);
    advance(sim, 0.1);
    expect(t.opens).toHaveLength(1);
    expect(t.hits).toHaveLength(4);
    for (const h of t.hits) {
      expect(h.amount).toBeCloseTo(cutOn('dust', d), 6);
      expect(h.crit).toBe(false);
      expect(h.unitId).toBe('w_samurai');
    }
    expect(new Set(t.hits.map((h) => h.uid))).toEqual(new Set(field.map((e) => e.uid)));
    for (const e of field) expect(e.hp).toBeCloseTo(1e9 - cutOn('dust', d), 0);
    expect(u.damageDealt).toBeCloseTo(4 * cutOn('dust', d), 4);
    // The lines open 72 ticks after the cast, all in the same tick.
    expect(new Set(t.hits.map((h) => h.time)).size).toBe(1);
    expect(Math.round((t.hits[0]!.time - t.casts[0]!.time) / TICK)).toBe(72);
    expect(t.opens[0]!.time).toBe(t.hits[0]!.time);
    // Nothing else happens later: no second cut, no bleed.
    advance(sim, 2);
    expect(t.hits).toHaveLength(4);
    expect(field.every((e) => !e.bleeding)).toBe(true);
  });

  it('sends the event first, then the cuts in the order of the marks, one entry per mark', () => {
    const sim = arena();
    const u = samurai(sim);
    const a = pinned(sim, 200);
    const b = pinned(sim, 170);
    const c = pinned(sim, 150);
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 1.3);
    expect(t.order).toEqual(['cast', 'open', `hit:${a.uid}`, `hit:${b.uid}`, `hit:${c.uid}`]);
    const open = t.opens[0]!.event;
    expect(open.at).toBeCloseTo(t.casts[0]!.time, 9);
    expect(open.unit.id).toBe('w_samurai');
    expect(open.lines).toEqual([a, b, c].map((e) => ({ uid: e.uid, kind: 'cut', to: e.uid, x: e.x, y: e.y, toX: e.x, toY: e.y })));
  });

  it('goes through armour, the elite and boss damage allowance, and a ward (it is ordinary damage)', () => {
    const sim = arena();
    const u = samurai(sim);
    const d = u.stats.damage;
    const roomba = pinned(sim, 160, 'roomba');
    const tangerine = pinned(sim, 170, 'tangerine');
    // An elite with a damage allowance of 10 takes 10, whatever the cut is worth.
    const elite = spawnEnemy(sim, 'firecracker', 180, 1e9, true, 1e9);
    elite.frozen = true;
    elite.capTokens = 10;
    elite.capRate = 0;
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 1.3);
    const by = (e: SimEnemy): number => t.hits.find((h) => h.uid === e.uid)!.amount;
    expect(by(roomba)).toBeCloseTo(cutOn('roomba', d), 6);
    // The samurai's blow is physical: a ward does not touch it, the armour of a tangerine does.
    expect(by(tangerine)).toBeCloseTo(cutOn('tangerine', d), 6);
    expect(by(elite)).toBeCloseTo(10, 9);
  });
});

// ───────────────────────────── the line of an enemy that died ─────────────────────────────

describe('a line whose enemy died before it opened', () => {
  /** Three marked enemies at 250 / 230 / 210 (A, B, C); the cast has happened. */
  function marked(): { sim: Sim; u: SimUnit; t: Tape; a: SimEnemy; b: SimEnemy; c: SimEnemy } {
    const sim = arena();
    const u = samurai(sim);
    const a = pinned(sim, 250);
    const b = pinned(sim, 230);
    const c = pinned(sim, 210);
    const t = tape(sim);
    cast(sim, u);
    return { sim, u, t, a, b, c };
  }

  it('moves to the nearest living enemy without a line, skipping nearer ones that carry a line', () => {
    const { sim, u, t, b, c } = marked();
    // 20 px from B is C, which carries a line; 30 px from B is a newcomer, which does not.
    const newcomer = pinned(sim, 200);
    killEnemy(sim, b, null);
    advance(sim, 1.3);
    const open = t.opens[0]!.event;
    expect(open.lines.map((l) => l.kind)).toEqual(['cut', 'moved', 'cut']);
    expect(open.lines[1]).toEqual({ uid: b.uid, kind: 'moved', to: newcomer.uid, x: b.x, y: b.y, toX: newcomer.x, toY: newcomer.y });
    const hit = (e: SimEnemy): number => t.hits.filter((h) => h.uid === e.uid).length;
    expect(hit(newcomer)).toBe(1);
    expect(hit(c)).toBe(1);
    expect(hit(b)).toBe(0);
    expect(t.hits).toHaveLength(3);
    expect(t.hits.find((h) => h.uid === newcomer.uid)!.amount).toBeCloseTo(cutOn('dust', 1.4 / ROW.power * (u.stats.damage)), 6);
  });

  it("reaches 150 px from the dead enemy's last place, counting the new enemy's body, and not a pixel further", () => {
    for (const [gap, expected] of [[150 + 12, 'moved'], [150 + 12 + 3, 'lost']] as const) {
      const { sim, t, b } = marked();
      const near = pinned(sim, 230 + gap);
      killEnemy(sim, b, null);
      advance(sim, 1.3);
      const line = t.opens[0]!.event.lines[1]!;
      expect(line.kind, `gap ${gap}`).toBe(expected);
      expect(line.to).toBe(expected === 'moved' ? near.uid : 0);
    }
  });

  it('is lost when there is no enemy to take it: no cut, the line goes out', () => {
    const { sim, t, b } = marked();
    killEnemy(sim, b, null);
    advance(sim, 1.3);
    expect(t.opens[0]!.event.lines[1]).toEqual({ uid: b.uid, kind: 'lost', to: 0, x: b.x, y: b.y, toX: b.x, toY: b.y });
    expect(t.hits).toHaveLength(2);
  });

  it('gives one newcomer to the first of two lines and loses the second: an enemy is not cut twice at the same moment', () => {
    const { sim, t, a, b } = marked();
    const newcomer = pinned(sim, 240);
    killEnemy(sim, a, null);
    killEnemy(sim, b, null);
    advance(sim, 1.3);
    const lines = t.opens[0]!.event.lines;
    expect(lines.map((l) => l.kind)).toEqual(['moved', 'lost', 'cut']);
    expect(lines[0]!.to).toBe(newcomer.uid);
    expect(t.hits.filter((h) => h.uid === newcomer.uid)).toHaveLength(1);
  });

  it('can move to a newcomer that appeared after the cast, and to the children a splitting enemy left', () => {
    const sim = arena();
    const u = samurai(sim);
    const a = pinned(sim, 250);
    const balloon = pinned(sim, 220, 'balloon');
    pinned(sim, 240);
    const t = tape(sim);
    cast(sim, u);
    const before = new Set(sim.enemies.map((e) => e.uid));
    killEnemy(sim, balloon, null);
    const children = sim.enemies.filter((e) => !before.has(e.uid));
    expect(children.length).toBe(2);
    advance(sim, 1.3);
    const line = t.opens[0]!.event.lines.find((l) => l.uid === balloon.uid)!;
    expect(line.kind).toBe('moved');
    expect(children.map((e) => e.uid)).toContain(line.to);
    expect(a.dead).toBe(false);
  });

  it('is judged when the lines open, not when the enemy dies: a newcomer that arrives later can still take it', () => {
    const { sim, t, b } = marked();
    killEnemy(sim, b, null);
    advance(sim, 0.6);
    const late = pinned(sim, 235);
    advance(sim, 0.8);
    expect(t.opens[0]!.event.lines[1]!.to).toBe(late.uid);
  });
});

// ───────────────────────────── more than one samurai ─────────────────────────────

describe('several samurai', () => {
  it('each cast marks and cuts on its own: an enemy marked twice is cut twice', () => {
    const sim = arena();
    const a = samurai(sim, 0);
    const b = samurai(sim, 1);
    const field = [150, 180, 210].map((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, a);
    cast(sim, b);
    expect(t.casts).toHaveLength(2);
    advance(sim, 1.3);
    expect(t.opens).toHaveLength(2);
    for (const e of field) expect(t.hits.filter((h) => h.uid === e.uid)).toHaveLength(2);
  });

  it("a moved line does not land on an enemy that carries another cast's line", () => {
    const sim = arena();
    const a = samurai(sim, 0);
    const b = samurai(sim, 1);
    const x = pinned(sim, 240);
    const y = pinned(sim, 230);
    cast(sim, a);
    // The second samurai marks a newcomer as well; the first one's dead enemy must not take that one.
    const newcomer = pinned(sim, 220);
    const t = tape(sim);
    cast(sim, b);
    killEnemy(sim, x, null);
    advance(sim, 1.3);
    // a's line on x is lost: y carries a's own line and the newcomer carries b's.
    const first = t.opens[0]!.event;
    expect(first.lines.map((l) => l.kind)).toEqual(['lost', 'cut']);
    expect(first.lines[1]!.uid).toBe(y.uid);
    expect(t.hits.filter((h) => h.uid === newcomer.uid)).toHaveLength(1);
  });
});

describe('two casts that open in the same tick', () => {
  it("a line that moves does not land on an enemy the other cast has just cut", () => {
    const sim = arena();
    const a = samurai(sim, 0);
    // Cell 4 is the top right corner: it reaches the far end of the top edge, cell 0 the near end.
    const b = samurai(sim, 4);
    const n = pinned(sim, 240);
    const anchorA = pinned(sim, 250);
    const h = pinned(sim, 300);
    const anchorB = pinned(sim, 480);
    const t = tape(sim);
    cast(sim, a);
    cast(sim, b);
    const marks = (i: number): number[] => data(t, i).marks.map((m) => m.uid);
    // A anchors on 250 and marks 240, 250, 300; B anchors on 480 and marks 300, 480 (250 and 240 are 230 and 240 px from it).
    expect(marks(0)).toEqual([anchorA.uid, n.uid, h.uid]);
    expect(marks(1)).toEqual([anchorB.uid, h.uid]);
    killEnemy(sim, h, null);
    advance(sim, 1.3);
    expect(t.opens).toHaveLength(2);
    // A's line on the dead enemy is lost (240 and 250 carry A's own lines); B's finds 240 and 250 free of lines but cut a moment ago.
    expect(t.opens[0]!.event.lines.map((l) => l.kind)).toEqual(['cut', 'cut', 'lost']);
    expect(t.opens[1]!.event.lines.map((l) => l.kind)).toEqual(['cut', 'lost']);
    for (const e of [n, anchorA, anchorB]) expect(t.hits.filter((x) => x.uid === e.uid), String(e.travelled)).toHaveLength(1);
  });
});

describe('casts at different moments', () => {
  it('an enemy cut by an earlier cast is fair game for the line of a later one', () => {
    const sim = arena();
    const u = samurai(sim);
    const x = pinned(sim, 60);
    const filler = pinned(sim, 70);
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 1.3);
    expect(t.hits.filter((h) => h.uid === x.uid)).toHaveLength(1);
    killEnemy(sim, filler, null);
    // A second cast on ten enemies at 160 ... 250: the stretch also holds x (190 px from the anchor) but only ten are marked, so x carries no line.
    const group = [160, 170, 180, 190, 200, 210, 220, 230, 240, 250].map((p) => pinned(sim, p));
    cast(sim, u);
    expect(data(t, 1).marks.map((m) => m.uid)).toEqual(group.slice().reverse().map((e) => e.uid));
    killEnemy(sim, group[0]!, null);
    advance(sim, 1.3);
    expect(t.opens).toHaveLength(2);
    // The line of the dead one at 160 moves to x, 100 px away, though a moment ago x was cut by another cast.
    const line = t.opens[1]!.event.lines.find((l) => l.uid === group[0]!.uid)!;
    expect(line).toMatchObject({ kind: 'moved', to: x.uid });
    expect(t.hits.filter((h) => h.uid === x.uid)).toHaveLength(2);
  });
});

// ───────────────────────────── the cat meanwhile ─────────────────────────────

describe('what happens to the samurai during the fuse', () => {
  it('cuts all the same when the samurai is sold, and credits it', () => {
    const sim = arena();
    const u = samurai(sim);
    const d = u.stats.damage;
    [150, 170, 190].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.5);
    expect(sim.sell(0)).toBeNull();
    expect(u.removed).toBe(true);
    advance(sim, 0.8);
    expect(t.opens).toHaveLength(1);
    expect(t.opens[0]!.event.unit).toBe(u);
    expect(t.hits).toHaveLength(3);
    expect(u.damageDealt).toBeCloseTo(3 * cutOn('dust', d), 4);
  });

  it('cuts all the same when the samurai is awakened into the warriors\' mythic (a samurai is a legendary: it is never merged away)', () => {
    const sim = arena();
    const u = samurai(sim, 0);
    [150, 170, 190].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.4);
    sim.purr = 100;
    sim.tier[u.classIndex] = 3;
    expect(sim.awaken(0)).toBeNull();
    expect(u.removed).toBe(true);
    expect(sim.units[0]!.id).not.toBe('w_samurai');
    advance(sim, 0.9);
    expect(t.opens).toHaveLength(1);
    expect(t.hits.filter((h) => h.unitId === 'w_samurai')).toHaveLength(3);
  });

  it('cuts all the same when the samurai is moved to another tile, or molted', () => {
    const sim = arena();
    const u = samurai(sim, 0);
    [150, 170, 190].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.3);
    expect(sim.drop(0, 5)).toBeNull();
    expect(sim.units[5]).toBe(u);
    sim.purr = 100;
    expect(sim.molt(5, 'ranger')).toBeNull();
    expect(u.removed).toBe(true);
    advance(sim, 1);
    expect(t.opens).toHaveLength(1);
    expect(t.hits).toHaveLength(3);
  });
});

// ───────────────────────────── the pass, the clock and the battle ─────────────────────────────

describe('through the gauge pass and the rest of the battle', () => {
  it('is cast by the real gauge pass, announces itself once with `first`, and the second cast is not the first', () => {
    const sim = arena();
    const u = samurai(sim);
    pinned(sim, 150);
    pinned(sim, 170);
    const t = tape(sim);
    u.spCheckAt = 0;
    sim.step(TICK);
    expect(t.casts).toHaveLength(1);
    expect(t.casts[0]!.event.first).toBe(true);
    expect(u.sp).toBe(0);
    advance(sim, 1.3);
    u.sp = 1;
    u.spCheckAt = 0;
    sim.step(TICK);
    expect(t.casts).toHaveLength(2);
    expect(t.casts[1]!.event.first).toBe(false);
  });

  it('waits full, looking every 0.2 s, while nothing is worth a cut, and casts the moment two enemies are in the stretch', () => {
    const sim = arena();
    const u = samurai(sim);
    pinned(sim, 150);
    const t = tape(sim);
    u.spCheckAt = 0;
    advance(sim, 1);
    expect(t.casts).toHaveLength(0);
    expect(u.sp).toBe(1);
    pinned(sim, 160);
    advance(sim, 0.3);
    expect(t.casts).toHaveLength(1);
  });

  it('stands still with a choice popup and goes on after it', () => {
    const sim = arena();
    const u = samurai(sim);
    [150, 170].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.5);
    const time = sim.time;
    sim.phase = 'choice';
    sim.step(5);
    expect(sim.time).toBe(time);
    expect(t.opens).toHaveLength(0);
    sim.phase = 'wave';
    advance(sim, 0.6);
    expect(t.opens).toHaveLength(0);
    advance(sim, 0.2);
    expect(t.opens).toHaveLength(1);
  });

  it('waits through the pause between waves: nothing runs in prep, the cut opens in the first tick after it', () => {
    const sim = arena();
    const u = samurai(sim);
    [150, 170].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    sim.phase = 'prep';
    sim.prepTime = 100;
    advance(sim, 2);
    expect(t.opens).toHaveLength(0);
    sim.phase = 'wave';
    sim.step(TICK);
    expect(t.opens).toHaveLength(1);
    expect(t.hits).toHaveLength(2);
  });

  it('goes on when the wave ends or the next one starts meanwhile', () => {
    const sim = arena();
    const u = samurai(sim);
    const field = [150, 170, 190].map((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.4);
    sim.wave = 5;
    startWave(sim, 6);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    sim.spawnIdx = 0;
    advance(sim, 0.9);
    expect(t.opens).toHaveLength(1);
    expect(new Set(t.hits.map((h) => h.uid))).toEqual(new Set(field.map((e) => e.uid)));
  });

  it('freezes with a defeat and goes on after a revive', () => {
    const sim = arena();
    const u = samurai(sim);
    [150, 170].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, u);
    advance(sim, 0.5);
    lose(sim, 'boss_timeout');
    expect(sim.phase).toBe('lost');
    advance(sim, 3);
    expect(t.opens).toHaveLength(0);
    expect(sim.revive()).toBeNull();
    expect(sim.phase).toBe('wave');
    advance(sim, 1);
    expect(t.opens).toHaveLength(1);
  });

  it('is not saved: a restored battle starts with an empty list and no cut', () => {
    const sim = arena();
    const u = samurai(sim);
    [150, 170].forEach((p) => pinned(sim, p));
    cast(sim, u);
    sim.spawnIds.length = 0;
    expect(sim.callNextWave()).toBeNull();
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const restored = createBattle(sim.init, snap!) as Sim;
    expect(restored.later).toHaveLength(0);
    const t = tape(restored);
    advance(restored, 3);
    expect(t.opens).toHaveLength(0);
  });

  it('gives the same result at 1x, 2x and 3x speed: only simulation time counts', () => {
    const play = (chunk: number): string => {
      const sim = arena();
      const u = samurai(sim);
      const t = tape(sim);
      for (let i = 0; i < 14; i++) {
        const e = pinned(sim, 100 + 14 * i, i % 4 === 0 ? 'balloon' : 'dust', i % 5 === 0 ? 1 : 1e9);
        if (i % 3 === 0) e.frozen = false;
      }
      u.spCheckAt = 0;
      const ticks = 4 * 60;
      for (let n = 0; n < ticks / chunk; n++) sim.step(chunk * TICK);
      return JSON.stringify([t.order, t.opens.map((o) => [Math.round(o.time * 1e6), o.event.lines.map((l) => [l.uid, l.kind, l.to])]), t.hits.map((h) => [h.uid, Math.round(h.amount * 1e6)])]);
    };
    const one = play(1);
    expect(one).toContain('open');
    expect(play(2)).toBe(one);
    expect(play(3)).toBe(one);
  });

  it('is deterministic: the same battle twice gives the same events, whether anybody listens or not, and no Math.random is used', () => {
    const random = vi.spyOn(Math, 'random');
    const play = (listen: boolean): { state: string; order: string } => {
      const sim = arena();
      samurai(sim);
      samurai(sim, 1);
      const t = listen ? tape(sim) : null;
      for (let i = 0; i < 18; i++) foe(sim, i % 3 === 0 ? 'drop' : 'cucumber', 90 + 13 * i, i % 4 === 0 ? 400 : 1e9);
      advance(sim, 6);
      return {
        state: JSON.stringify([sim.enemies.map((e) => [e.uid, e.hp, e.travelled]), sim.kills, sim.rng.states()]),
        order: t ? JSON.stringify(t.order) : '',
      };
    };
    const a = play(true);
    expect(play(true)).toEqual(a);
    expect(a.order).toContain('open');
    expect(play(false).state).toBe(a.state);
    expect(random).not.toHaveBeenCalled();
  });
});

describe('with the skills off, and in every mode', () => {
  it('a battle started with sp false never casts it and the gauge stays 0', () => {
    const sim = arena({ sp: false });
    const u = put(sim, 0, 'w_samurai', 0);
    [150, 170].forEach((p) => pinned(sim, p));
    const t = tape(sim);
    advance(sim, 40);
    expect(t.casts).toHaveLength(0);
    expect(u.sp).toBe(0);
  });

  const MODES: Array<{ name: string; over: Parameters<typeof initOf>[0] }> = [
    { name: 'chapter', over: { seed: 91001, mode: 'chapter', chapter: 2 } },
    { name: 'daily with its rules', over: { seed: 91002, mode: 'daily', chapter: 2, modifiers: ['swarm', 'rush'] } },
    { name: 'endless', over: { seed: 91003, mode: 'endless', chapter: 3 } },
    { name: 'gold dungeon', over: { seed: 91004, mode: 'gold', chapter: 1 } },
    { name: 'tutorial', over: { seed: 91005, mode: 'tutorial', chapter: 1 } },
  ];

  for (const m of MODES) {
    it(`casts and cuts in the ${m.name} mode, and a whole bot run with a samurai on the board is the same twice`, () => {
      const run = (): { print: string; casts: number; opens: number } => {
        let casts = 0;
        let opens = 0;
        const print = fingerprintRun(initOf(m.over, 3), 'synergy', {
          maxSeconds: 150,
          setup(s) {
            put(s, 12, 'w_samurai');
            s.events.on('spCast', (e) => {
              if (e.skill === 'cut') casts++;
            });
            s.events.on('cutOpen', () => {
              opens++;
            });
          },
        });
        return { print: `${print.hash}/${print.end}/${print.events}`, casts, opens };
      };
      const a = run();
      const b = run();
      expect(a).toEqual(b);
      // Every cast but the one a run may end on has opened (the run ends with a win, a loss or the time limit).
      expect(a.casts - a.opens).toBeLessThanOrEqual(1);
      expect(a.opens).toBeLessThanOrEqual(a.casts);
      if (m.name === 'chapter' || m.name === 'endless' || m.name === 'daily with its rules') expect(a.casts).toBeGreaterThan(0);
    });
  }
});

describe('Already Cut, what the review pinned down', () => {
  it('wraps the end of the stretch as well as its start when the anchor stands near the end of the loop', () => {
    const sim = arena();
    const u = samurai(sim);
    const a = pinned(sim, PATH_LENGTH - 100);
    pinned(sim, PATH_LENGTH - 130);
    const t = tape(sim);
    cast(sim, u);
    const d = data(t);
    expect(d.anchorUid).toBe(a.uid);
    expect(d.anchorPath).toBeCloseTo(PATH_LENGTH - 100, 6);
    expect(d.fromPath).toBeCloseTo(PATH_LENGTH - 325, 6);
    // 225 px past the anchor is past the seam of the loop: back at the start of the road.
    expect(d.toPath).toBeCloseTo(125, 6);
    expect(d.toPath).toBeGreaterThanOrEqual(0);
    expect(d.toPath).toBeLessThan(PATH_LENGTH);
  });

  it('names every cast: `cutId` counts up from 1, and the `cutOpen` of a cast carries its own, also when two samurai cast in the same tick', () => {
    const sim = arena();
    const a = samurai(sim, 0);
    const b = samurai(sim, 1);
    const field = [150, 180, 210].map((p) => pinned(sim, p));
    const t = tape(sim);
    cast(sim, a);
    cast(sim, b);
    expect(t.casts).toHaveLength(2);
    // The same tick, the same `at`: only the id tells the two casts apart.
    expect(data(t, 0).at).toBe(data(t, 1).at);
    expect([data(t, 0).cutId, data(t, 1).cutId]).toEqual([1, 2]);
    // One mark of the first cast dies: its line moves (to nobody: both casts mark all three). The lines of each `cutOpen` are the marks of ITS cast.
    killEnemy(sim, field[0]!, null);
    advance(sim, 1.3);
    expect(t.opens.map((o) => o.event.cutId)).toEqual([1, 2]);
    expect(t.opens.map((o) => o.event.at)).toEqual([data(t, 0).at, data(t, 1).at]);
    for (const [i, o] of t.opens.entries()) expect(o.event.lines.map((l) => l.uid), `cast ${i + 1}`).toEqual(data(t, i).marks.map((m) => m.uid));
    // A third cast, much later, goes on counting (the number is the battle's, not the cat's).
    cast(sim, a);
    expect(data(t, 2).cutId).toBe(3);
    advance(sim, 1.3);
    expect(t.opens[2]!.event.cutId).toBe(3);
  });
});
