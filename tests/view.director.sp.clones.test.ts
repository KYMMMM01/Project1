/**
 * The ninja's scene, "Surprise Clones" (docs/design_skills_v2.md 3.4), on the view side: the pictures' numbers (`director/sp/cloneMath.ts`) and the
 * scene (`director/sp/clones.ts`): a leaf and a puff, two pale clones that hop onto their seats (the nearest empty tiles, or stacked on the
 * ninja when the board is full), a step fainter for every throw, a puff and one leaf at the end, a hop aside for a cat that takes the tile.
 * Like the other scenes' tests it is fed a fake battle (a clock, a board, a stage that counts what it is asked for) and the simulation's own
 * events (`spCast`, `cloneThrow`, `cloneStep`, `cloneEnd`); nothing here reaches into the simulation. The simulation's side is `sim.spClones.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined },
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/view/field/art', () => ({ fieldArt: () => ({ shadow: Texture.WHITE }) }));
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const clones = await import('@/view/director/sp/clones');
  return { SCENES: { clones: clones.makeClones } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, CloneState, SpCastEvent, UnitState } from '@/game/api';
import { SP_ROWS } from '@/game';
import { CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import { resetCloneArt } from '@/view/director/sp/cloneArt';
import {
  ALPHA_FLOOR, FADE, FADE_STEP, HEAD_LEAF, HOP, LAND, LEAF_FALL, OUT, STACK_ALPHA_BOOST, STACK_LEAN, STACK_SPREAD, STEP, WOBBLE,
  cloneAlpha, headLeaf, hopAt, hopHeight, isLite, landSquash, leafFall, stackFeet, stackOffset, stackSide, wobbleRot,
  type CloneLook,
} from '@/view/director/sp/cloneMath';
import { makeClones } from '@/view/director/sp/clones';
import type { SpEnv } from '@/view/director/sp/types';
import { clearGhostStarts, ghostStartsPending, takeGhostStart } from '@/view/field/ghosts';
import { FEET_DY } from '@/view/field/unitView';
import type { Bus, Stage } from '@/view/director/stage';

const LOOK: CloneLook = SP_ROWS.clones;

// ───────────────────────────── the numbers ─────────────────────────────

describe('how faint a clone is', () => {
  it('steps down 55, 47, 39, 31 % for a standing clone with every throw it makes (the row\'s own start and a step of 8 points)', () => {
    expect(LOOK.stackOffset.standingAlpha).toBe(0.55);
    expect(FADE_STEP).toBeCloseTo(0.08, 9);
    const a = [4, 3, 2, 1].map((left) => cloneAlpha(left, 4, false, LOOK));
    expect(a[0]).toBeCloseTo(0.55, 9);
    expect(a[1]).toBeCloseTo(0.47, 9);
    expect(a[2]).toBeCloseTo(0.39, 9);
    expect(a[3]).toBeCloseTo(0.31, 9);
  });

  it('starts a stacked clone at the row\'s lower opacity and never lets any clone go below the floor before its last throw', () => {
    expect(cloneAlpha(4, 4, true, LOOK)).toBeCloseTo(LOOK.stackOffset.alpha, 9);
    for (let left = 4; left >= 1; left--) expect(cloneAlpha(left, 4, true, LOOK)).toBeGreaterThanOrEqual(ALPHA_FLOOR - 1e-9);
    // However many throws a (hand-made) row has, the floor holds.
    expect(cloneAlpha(1, 40, true, LOOK)).toBe(ALPHA_FLOOR);
    expect(cloneAlpha(1, 40, false, LOOK)).toBe(ALPHA_FLOOR);
  });

  it('is monotone: a clone never gets stronger as it throws, and a stacked one is never stronger than a standing one at the same point', () => {
    for (let left = 4; left > 1; left--) expect(cloneAlpha(left - 1, 4, false, LOOK)).toBeLessThan(cloneAlpha(left, 4, false, LOOK));
    for (let left = 4; left >= 1; left--) expect(cloneAlpha(left, 4, true, LOOK)).toBeLessThanOrEqual(cloneAlpha(left, 4, false, LOOK));
  });

  it('takes more throws left than the clone was given, or fewer than none, as the ends of the range', () => {
    expect(cloneAlpha(9, 4, false, LOOK)).toBe(cloneAlpha(4, 4, false, LOOK));
    expect(cloneAlpha(-3, 4, false, LOOK)).toBe(cloneAlpha(0, 4, false, LOOK));
  });
});

describe('where a stacked clone stands', () => {
  it('takes the side of its own number, left for the first and right for the second, and the other side when its ninja\'s other clone has it', () => {
    expect(stackSide(0, [])).toBe(-1);
    expect(stackSide(1, [])).toBe(1);
    expect(stackSide(0, [-1])).toBe(1);
    expect(stackSide(1, [1])).toBe(-1);
    expect(stackSide(0, [1])).toBe(-1);
    expect(stackSide(1, [-1])).toBe(1);
  });

  it('is the row\'s offset spread wider by the picture, to each side, up by the row\'s rise', () => {
    const o = stackOffset(-1, LOOK);
    expect(o.dx).toBeCloseTo(-LOOK.stackOffset.x * STACK_SPREAD, 9);
    expect(o.dy).toBe(LOOK.stackOffset.y);
    expect(stackOffset(1, LOOK).dx).toBeCloseTo(-o.dx, 9);
    const out = { x: 0, y: 0 };
    stackFeet(300, 400, 1, LOOK, out);
    expect(out).toEqual({ x: 300 + LOOK.stackOffset.x * STACK_SPREAD, y: 400 + LOOK.stackOffset.y });
  });

  it('keeps the whole body clear of the next cat: the offset plus half a body (and its lean) stops short of where the neighbour\'s own body starts', () => {
    // A body is about 55 design px wide at its widest (the cat's silhouette, not the picture's blank corners) and it leans out by its height times the lean;
    // a neighbour's body starts about 30 design px short of the middle of its own cell (cats do not fill their cell).
    const half = (55 * LOOK.stackOffset.scale) / 2 + 82 * LOOK.stackOffset.scale * Math.sin(STACK_LEAN) * 0.5;
    expect(Math.abs(stackOffset(1, LOOK).dx) + half).toBeLessThanOrEqual(CELL_W - 30 - 6);
    // And it is out beside the ninja (not hidden behind it): further than a quarter of the ninja's width.
    expect(Math.abs(stackOffset(1, LOOK).dx)).toBeGreaterThan(20);
  });

  it('draws the first ten clones as full bodies and the rest as an outline only (the row\'s figure cap)', () => {
    expect(LOOK.figureCap).toBe(10);
    expect(isLite(0, LOOK)).toBe(false);
    expect(isLite(9, LOOK)).toBe(false);
    expect(isLite(10, LOOK)).toBe(true);
    expect(isLite(30, LOOK)).toBe(true);
    expect(isLite(3, { ...LOOK, figureCap: 2 })).toBe(true);
  });
});

describe('the motions', () => {
  it('hops higher over a longer way, between 30 and 64 design px', () => {
    expect(hopHeight(0)).toBe(30);
    expect(hopHeight(96)).toBeGreaterThan(hopHeight(0));
    expect(hopHeight(108)).toBeGreaterThan(hopHeight(96) - 1);
    expect(hopHeight(5000)).toBe(64);
  });

  it('runs a hop from the start to the end with an arc over the line, and the depth it sorts by is the line without the arc', () => {
    const o = { x: 0, y: 0, base: 0 };
    hopAt(0, 10, 20, 110, 220, 40, o);
    expect(o).toMatchObject({ x: 10, y: 20, base: 20 });
    hopAt(1, 10, 20, 110, 220, 40, o);
    expect(o.x).toBeCloseTo(110, 9);
    expect(o.y).toBeCloseTo(220, 9);
    hopAt(0.5, 10, 20, 110, 220, 40, o);
    expect(o.y).toBeCloseTo(o.base - 40, 9);
    expect(o.base).toBeGreaterThan(20);
    expect(o.base).toBeLessThan(220);
    // A height of nothing is a slide (what a stacked clone does: it comes out from behind its ninja).
    hopAt(0.5, 0, 0, 100, 0, 0, o);
    expect(o.y).toBe(0);
    // k is clamped.
    hopAt(7, 0, 0, 100, 0, 10, o);
    expect(o.x).toBeCloseTo(100, 9);
    hopAt(-3, 0, 0, 100, 0, 10, o);
    expect(o.x).toBeCloseTo(0, 9);
  });

  it('stumbles like a toy: the lean rings out and is gone before the stumble\'s time is over', () => {
    expect(wobbleRot(0)).toBe(0);
    expect(wobbleRot(-1)).toBe(0);
    let peak = 0;
    for (let t = 0.01; t < 0.3; t += 0.01) peak = Math.max(peak, Math.abs(wobbleRot(t)));
    expect(peak).toBeGreaterThan(0.12);
    expect(peak).toBeLessThan(0.4);
    expect(Math.abs(wobbleRot(WOBBLE[0]))).toBeLessThan(0.02);
    // It swings both ways.
    const signs = new Set<number>();
    for (let t = 0.01; t < 0.5; t += 0.01) signs.add(Math.sign(wobbleRot(t)));
    expect(signs.has(1) && signs.has(-1)).toBe(true);
  });

  it('squashes on landing and is back to 1 when the landing is over', () => {
    const o = { sx: 1, sy: 1 };
    landSquash(0, o);
    expect(o.sy).toBeLessThan(0.9);
    expect(o.sx).toBeGreaterThan(1);
    landSquash(LAND[0], o);
    expect(o).toEqual({ sx: 1, sy: 1 });
    landSquash(5, o);
    expect(o).toEqual({ sx: 1, sy: 1 });
  });

  it('drops the leaf of a clone that has gone: it sways, turns, sinks and is faded out when it ends', () => {
    const o = { x: 0, y: 0, rot: 0, alpha: 1 };
    leafFall(0, 1, o);
    expect(o).toMatchObject({ x: 0, y: 0, alpha: 1 });
    leafFall(0.5, 1, o);
    expect(o.y).toBeGreaterThan(5);
    expect(o.alpha).toBe(1);
    leafFall(1, 1, o);
    expect(o.alpha).toBe(0);
    expect(o.y).toBeGreaterThan(30);
    expect(o.y).toBeLessThan(60);
    let maxX = 0;
    for (let k = 0; k <= 1; k += 0.02) {
      leafFall(k, 1, o);
      maxX = Math.max(maxX, Math.abs(o.x));
    }
    expect(maxX).toBeLessThan(14);
    // The other side drifts the other way.
    const a = { x: 0, y: 0, rot: 0, alpha: 1 };
    const b = { x: 0, y: 0, rot: 0, alpha: 1 };
    leafFall(0.2, 1, a);
    leafFall(0.2, -1, b);
    expect(a.x).toBeCloseTo(-b.x, 9);
  });

  it('puts the ninja\'s leaf on with a drop and a back-out, keeps it, and slides it off and fades it at the end', () => {
    const o = { x: 0, y: 0, scale: 1, rot: 0, alpha: 1 };
    headLeaf(0, o);
    expect(o.scale).toBeLessThan(0.5);
    expect(o.y).toBeLessThan(-15);
    headLeaf(0.4, o);
    expect(o.alpha).toBe(1);
    expect(Math.abs(o.y)).toBeLessThan(2);
    expect(o.scale).toBeGreaterThan(0.9);
    headLeaf(1, o);
    expect(o.alpha).toBe(0);
    expect(o.x).toBeGreaterThan(10);
  });

  it('has times whose real floor is shorter than the battle life: nothing is stretched past what 1x shows', () => {
    for (const [life, floor] of [HOP, STEP, OUT, WOBBLE, LAND, HEAD_LEAF, LEAF_FALL, FADE]) expect(floor).toBeLessThanOrEqual(life);
    // The leap is the row's 0.3 s.
    expect(HOP[0]).toBe(LOOK.arrive);
  });
});

// ───────────────────────────── the scene ─────────────────────────────

const NINJA = 12;

interface Rig {
  scene: ReturnType<typeof makeClones> & { live(): Live };
  battle: { spOn: boolean; time: number; units: (UnitState | null)[]; enemies: unknown[]; events: Emitter<BattleEvents> };
  stage: {
    now: number;
    detail: 0 | 1 | 2;
    reduced: boolean;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn> };
    play: ReturnType<typeof vi.fn>;
    rules: Record<string, object>;
  };
  units: Container;
  front: Container;
  views: Map<number, Container>;
  ninja: UnitState;
  env: SpEnv;
}

interface Live {
  bodies: number;
  standing: number;
  stacked: number;
  full: number;
  lite: number;
  leaves: number;
  list: Array<{ uid: number; index: number; phase: string; cell: number; side: number; x: number; y: number; alpha: number; left: number; loud: boolean; lite: boolean }>;
}

function unitOf(uid: number, cell: number): UnitState {
  return { uid, id: 'r_ninja', cell, clone: [] as CloneState[] } as unknown as UnitState;
}

/** The ninja's view as the field makes it: a container at its feet whose depth is its feet. */
function viewOf(r: Rig, u: UnitState): Container {
  const v = new Container();
  v.position.set(cellCenterX(u.cell), cellCenterY(u.cell) + FEET_DY);
  v.zIndex = v.y;
  r.units.addChild(v);
  r.views.set(u.uid, v);
  return v;
}

function rig(opts: { detail?: 0 | 1 | 2; reduced?: boolean; scene?: boolean } = {}): Rig {
  const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn() };
  const stage = { now: 0, detail: opts.detail ?? 2, reduced: opts.reduced ?? false, fx, play: vi.fn(), rules: { zone: {}, shoot: {} } };
  const units = new Container();
  const front = new Container();
  const views = new Map<number, Container>();
  const ninja = unitOf(5, NINJA);
  const battle = { spOn: true, time: 10, units: new Array<UnitState | null>(25).fill(null), enemies: [] as unknown[], events: new Emitter<BattleEvents>() };
  battle.units[NINJA] = ninja;
  const env = {
    stage: stage as unknown as Stage,
    ctx: { layers: { units, fxFront: front, fxBack: new Container() }, unitView: (uid: number) => views.get(uid) ?? null, battle },
    battle,
  } as unknown as SpEnv;
  const r = { scene: (opts.scene === false ? null : makeClones(env)) as Rig['scene'], battle, stage, units, front, views, ninja, env } as Rig;
  viewOf(r, ninja);
  return r;
}

const seat = (cell: number, stacked = false): { cell: number; stacked: boolean; x: number; y: number } => ({ cell, stacked, x: cellCenterX(cell), y: cellCenterY(cell) });

/** The simulation's cast of the ninja: the clones are in its state already when the event arrives. */
function castOf(r: Rig, seats = [seat(7), seat(17)], over: { at?: number; first?: boolean; unit?: UnitState } = {}): SpCastEvent & { skill: 'clones' } {
  const unit = over.unit ?? r.ninja;
  const at = over.at ?? r.battle.time;
  unit.clone = seats.map((s, index) => ({ index, cell: s.stacked ? -1 : s.cell, left: 4, readyAt: at + 0.3, until: at + 8 }));
  return { unit, first: over.first ?? false, x: cellCenterX(unit.cell), y: cellCenterY(unit.cell), skill: 'clones', data: { seats, throws: 4, arrive: 0.3, at, life: 8 } } as never;
}

/** What happens at a cast on the screen: the event the scene hears itself, then the dispatcher's call for a cast that the stage rule let through. */
function shown(r: Rig, e: SpCastEvent & { skill: 'clones' }): void {
  r.battle.events.emit('spCast', e);
  r.scene.cast(e);
}

/** One frame: `dt` real seconds, `battleDt` seconds of the battle's clock (it is moved too). */
function frame(r: Rig, dt: number, battleDt: number): void {
  r.battle.time += battleDt;
  r.stage.now += dt;
  r.scene.update?.(dt, battleDt);
}

/** `seconds` of real time at the game speed `speed` (60 frames a second). */
function run(r: Rig, seconds: number, speed = 1): void {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) frame(r, 1 / 60, speed / 60);
}

const live = (r: Rig): Live => r.scene.live();
const feet = (cell: number): { x: number; y: number } => ({ x: cellCenterX(cell), y: cellCenterY(cell) + FEET_DY });

function throwOf(r: Rig, index: number, over: Partial<BattleEvents['cloneThrow']> = {}): void {
  const s = (r.ninja.clone.find((c) => c.index === index) ?? { index, cell: 7, left: 4 }) as CloneState;
  const stacked = s.cell < 0;
  const cell = stacked ? NINJA : s.cell;
  s.left = Math.max(0, s.left - 1);
  r.battle.events.emit('cloneThrow', {
    unit: r.ninja, index, cell, stacked, x: cellCenterX(cell), y: cellCenterY(cell), targetUid: 99, left: s.left,
    projectile: { uid: 100 + index, unitId: 'r_ninja', x: 0, y: 0, angle: 0, targetUid: 99, ghost: true },
    ...over,
  } as never);
}

function endOf(r: Rig, index: number, reason: BattleEvents['cloneEnd']['reason'] = 'done'): void {
  const s = (r.ninja.clone.find((c) => c.index === index) ?? { cell: 7 }) as CloneState;
  const cell = s.cell;
  r.ninja.clone = r.ninja.clone.filter((c) => c.index !== index);
  r.battle.events.emit('cloneEnd', { unit: r.ninja, index, cell, x: cellCenterX(cell < 0 ? NINJA : cell), y: cellCenterY(cell < 0 ? NINJA : cell), reason } as never);
}

describe('the clones\' scene', () => {
  beforeEach(() => {
    setFxSettings({ tier: 'high', reducedMotion: false });
    resetCloneArt();
    clearGhostStarts();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('the cast', () => {
    it('seats the two clones from the simulation\'s cast alone, even when the stage rule lost it: bodies, quietly (no puff, no sound, no leaf)', () => {
      const r = rig();
      r.battle.events.emit('spCast', castOf(r));
      expect(live(r)).toMatchObject({ bodies: 2, standing: 2, stacked: 0 });
      expect(live(r).list.map((c) => c.cell).sort()).toEqual([17, 7]);
      expect(live(r).list.every((c) => !c.loud)).toBe(true);
      expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
      expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
      expect(r.stage.play).not.toHaveBeenCalled();
      expect(live(r).leaves).toBe(0);
    });

    it('a cast the rule let through also puffs a ring of smoke at the ninja\'s feet, puts a leaf on its head, and plays the one existing poof sound', () => {
      const r = rig();
      shown(r, castOf(r));
      expect(live(r).bodies).toBe(2);
      expect(live(r).list.every((c) => c.loud)).toBe(true);
      expect(r.stage.fx.ps.burst).toHaveBeenCalledTimes(1);
      const [def, x, y] = r.stage.fx.ps.burst.mock.calls[0] as [{ tex: string; shape: { type: string } }, number, number];
      expect(def.tex).toBe('smoke');
      expect(def.shape.type).toBe('ring');
      expect(x).toBe(cellCenterX(NINJA));
      expect(y).toBeGreaterThan(cellCenterY(NINJA));
      expect(r.stage.fx.shockwave).toHaveBeenCalledTimes(1);
      expect(live(r).leaves).toBe(1);
      expect(r.stage.play).toHaveBeenCalledWith(expect.anything(), 'molt', expect.any(Number), expect.any(Number), expect.any(Number));
    });

    it('makes the pair once however the two tellings come, in either order', () => {
      const a = rig();
      const ea = castOf(a);
      a.battle.events.emit('spCast', ea);
      a.scene.cast(ea);
      a.battle.events.emit('spCast', ea);
      expect(live(a).bodies).toBe(2);
      const b = rig();
      const eb = castOf(b);
      b.scene.cast(eb);
      b.battle.events.emit('spCast', eb);
      expect(live(b).bodies).toBe(2);
      expect(live(b).list.every((c) => c.loud)).toBe(true);
    });

    it('never listens to another skill\'s cast', () => {
      const r = rig();
      r.battle.events.emit('spCast', { unit: r.ninja, first: false, x: 0, y: 0, skill: 'shove', data: {} } as never);
      expect(live(r).bodies).toBe(0);
    });

    it('under reduced motion makes no smoke, no leaf and no shockwave (the sound stays)', () => {
      setFxSettings({ tier: 'high', reducedMotion: true });
      const r = rig({ reduced: true });
      shown(r, castOf(r));
      expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
      expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
      expect(live(r).leaves).toBe(0);
      expect(r.stage.play).toHaveBeenCalled();
    });

    it('on the low tier puffs half as much and draws no shockwave', () => {
      setFxSettings({ tier: 'low', reducedMotion: false });
      const r = rig({ detail: 0 });
      shown(r, castOf(r));
      expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
      expect((r.stage.fx.ps.burst.mock.calls[0] as unknown[])[3]).toMatchObject({ count: 0.5 });
    });
  });

  describe('the leap to the seat', () => {
    it('leaves the ninja\'s feet and lands on the seat\'s tile after the row\'s 0.3 s, along an arc, sorted just behind a cat that shares its feet', () => {
      const r = rig();
      shown(r, castOf(r));
      const from = feet(NINJA);
      const first = live(r).list[0] as Live['list'][number];
      expect(first.phase).toBe('in');
      expect(first.x).toBeCloseTo(from.x, 3);
      expect(first.y).toBeCloseTo(from.y, 3);
      run(r, 0.15);
      const mid = live(r).list[0] as Live['list'][number];
      const to = feet(mid.cell);
      expect(mid.phase).toBe('in');
      // Part of the way, and higher than the straight line between the two (the arc).
      expect(Math.abs(mid.x - to.x) + Math.abs(mid.y - to.y)).toBeGreaterThan(1);
      const line = from.y + (to.y - from.y) * 0.5;
      expect(mid.y).toBeLessThan(Math.max(from.y, to.y));
      expect(mid.y).toBeLessThan(line + 1);
      run(r, 0.2);
      for (const c of live(r).list) {
        expect(c.phase).toBe('stand');
        expect(c.x).toBeCloseTo(feet(c.cell).x, 3);
        expect(c.y).toBeCloseTo(feet(c.cell).y, 3);
        const view = r.scene as unknown as { bodies: Array<{ root: Container; cell: number }> };
        const body = view.bodies.find((b) => b.cell === c.cell) as { root: Container };
        expect(body.root.zIndex).toBeCloseTo(feet(c.cell).y - 0.3, 6);
      }
    });

    it('fades in over the first third of the leap and then holds the row\'s standing opacity', () => {
      const r = rig();
      shown(r, castOf(r));
      expect((live(r).list[0] as Live['list'][number]).alpha).toBe(0);
      run(r, 0.05);
      const early = (live(r).list[0] as Live['list'][number]).alpha;
      expect(early).toBeGreaterThan(0);
      expect(early).toBeLessThan(LOOK.stackOffset.standingAlpha);
      run(r, 0.5);
      expect((live(r).list[0] as Live['list'][number]).alpha).toBeCloseTo(LOOK.stackOffset.standingAlpha, 2);
    });

    it('at 3x keeps the real floor: 0.3 s of battle is 0.1 s of real time, and the leap is not over before 0.14 s of it', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.1, 3);
      expect(live(r).list.every((c) => c.phase === 'in')).toBe(true);
      run(r, 0.06, 3);
      expect(live(r).list.every((c) => c.phase === 'stand')).toBe(true);
    });

    it('stands still under a popup, however long it lasts, and goes on after it', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.1);
      const before = JSON.stringify(live(r).list);
      for (let i = 0; i < 300; i++) frame(r, 1 / 60, 0);
      expect(JSON.stringify(live(r).list)).toBe(before);
      run(r, 0.4);
      expect(live(r).list.every((c) => c.phase === 'stand')).toBe(true);
    });

    it('breathes while it stands, on real time, but not while the battle\'s clock is still (a popup stills a clone completely)', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 1.4);
      const body = (r.scene as unknown as { bodies: Array<{ index: number; act: string; rig: Container }> }).bodies.find((b) => b.index === 0) as { act: string; rig: Container };
      expect(body.act).toBe('none');
      const seen = new Set<string>();
      for (let i = 0; i < 90; i++) {
        frame(r, 1 / 60, 1 / 60);
        seen.add(body.rig.scale.y.toFixed(4));
      }
      // It moves (a breath is a few percent of its height) ...
      expect(seen.size).toBeGreaterThan(10);
      const held = body.rig.scale.y;
      // ... and stands perfectly still under a popup.
      for (let i = 0; i < 300; i++) frame(r, 1 / 60, 0);
      expect(body.rig.scale.y).toBe(held);
    });

    it('under reduced motion does not leap: it is on its seat at once and only fades in over 0.15 s', () => {
      setFxSettings({ tier: 'high', reducedMotion: true });
      const r = rig({ reduced: true });
      shown(r, castOf(r));
      run(r, 1 / 60);
      for (const c of live(r).list) {
        expect(c.x).toBeCloseTo(feet(c.cell).x, 3);
        expect(c.y).toBeCloseTo(feet(c.cell).y, 3);
      }
      const half = (live(r).list[0] as Live['list'][number]).alpha;
      expect(half).toBeLessThan(0.3);
      run(r, 0.2);
      expect(live(r).list.every((c) => c.phase === 'stand')).toBe(true);
      expect((live(r).list[0] as Live['list'][number]).alpha).toBeCloseTo(LOOK.stackOffset.standingAlpha, 2);
    });

    it('lands the second clone off balance (it stumbles) and the first with a squash, and neither once it has settled', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.34);
      type Rigged = { bodies: Array<{ index: number; act: string; rig: Container }> };
      const bodies = (r.scene as unknown as Rigged).bodies;
      expect(bodies.find((b) => b.index === 0)?.act).toBe('land');
      expect(bodies.find((b) => b.index === 1)?.act).toBe('wobble');
      run(r, 0.1);
      const wob = Math.abs((bodies.find((b) => b.index === 1) as { rig: Container }).rig.rotation);
      expect(wob).toBeGreaterThan(0.01);
      run(r, 0.8);
      for (const b of bodies) expect(b.act).toBe('none');
    });
  });

  describe('a full board: the clones stand behind their ninja', () => {
    function stackedRig(): Rig {
      const r = rig();
      shown(r, castOf(r, [seat(NINJA, true), seat(NINJA, true)]));
      run(r, 0.5);
      return r;
    }

    it('puts one on each side of the ninja, up a little, as the row says (spread wider), and sorts them just behind it', () => {
      const r = stackedRig();
      expect(live(r)).toMatchObject({ bodies: 2, stacked: 2, standing: 0 });
      const ninja = feet(NINJA);
      const [a, b] = live(r).list as [Live['list'][number], Live['list'][number]];
      expect([a.side, b.side].sort()).toEqual([-1, 1]);
      for (const c of [a, b]) {
        expect(c.cell).toBe(-1);
        expect(c.x).toBeCloseTo(ninja.x + c.side * LOOK.stackOffset.x * STACK_SPREAD, 3);
        expect(c.y).toBeCloseTo(ninja.y + LOOK.stackOffset.y, 3);
      }
      const bodies = (r.scene as unknown as { bodies: Array<{ root: Container }> }).bodies;
      for (const b2 of bodies) expect(b2.root.zIndex).toBeCloseTo((r.views.get(5) as Container).zIndex - 0.5, 6);
    });

    it('is fainter than a standing clone, as the row says, and leans out from the ninja', () => {
      const r = stackedRig();
      // The row says 45%; the picture draws a stacked clone a step more opaque (STACK_ALPHA_BOOST), never less than the row and never past 1.
      for (const c of live(r).list) expect(c.alpha).toBeCloseTo(Math.min(1, LOOK.stackOffset.alpha * STACK_ALPHA_BOOST), 2);
      expect(STACK_ALPHA_BOOST).toBeGreaterThan(1);
      const bodies = (r.scene as unknown as { bodies: Array<{ side: number; rig: Container; sprite: Sprite }> }).bodies;
      for (const b of bodies) {
        expect(Math.sign(b.rig.rotation)).toBe(b.side);
        expect(Math.abs(b.rig.rotation)).toBeGreaterThan(STACK_LEAN * 0.7);
      }
    });

    it('is a bit smaller than a standing clone, by the row\'s scale', () => {
      const r = rig();
      shown(r, castOf(r, [seat(7), seat(NINJA, true)]));
      run(r, 0.6);
      const bodies = (r.scene as unknown as { bodies: Array<{ cell: number; sprite: Sprite }> }).bodies;
      const standing = bodies.find((b) => b.cell === 7) as { sprite: Sprite };
      const stacked = bodies.find((b) => b.cell === -1) as { sprite: Sprite };
      expect(Math.abs(stacked.sprite.scale.y) / Math.abs(standing.sprite.scale.y)).toBeCloseTo(LOOK.stackOffset.scale, 2);
    });

    it('slides out from behind the ninja (no arc) over the leap', () => {
      const r = rig();
      shown(r, castOf(r, [seat(NINJA, true), seat(NINJA, true)]));
      run(r, 0.05);
      const early = live(r).list.map((c) => c.y);
      const base = feet(NINJA).y + LOOK.stackOffset.y;
      // With no arc the feet go straight to their height: never above it by more than the leap's own slide.
      for (const y of early) expect(y).toBeGreaterThanOrEqual(base - 1);
    });

    it('goes where the ninja goes: moved, dragged to another cell, it carries its clones with it', () => {
      const r = stackedRig();
      const view = r.views.get(5) as Container;
      view.position.x += 120;
      view.zIndex = view.y;
      run(r, 1 / 60);
      for (const c of live(r).list) expect(c.x).toBeCloseTo(view.x + c.side * LOOK.stackOffset.x * STACK_SPREAD, 3);
    });

    it('hides while its ninja is held in a finger or being sold, and comes back when it is put down', () => {
      const r = stackedRig();
      const view = r.views.get(5) as Container;
      const was = (live(r).list[0] as Live['list'][number]).alpha;
      view.zIndex = 100000;
      run(r, 0.6);
      expect((live(r).list[0] as Live['list'][number]).alpha).toBeLessThan(0.05);
      view.zIndex = view.y;
      run(r, 0.8);
      expect((live(r).list[0] as Live['list'][number]).alpha).toBeCloseTo(was, 1);
    });

    it('one stacked and one standing: the stacked one takes the side of its own number', () => {
      const r = rig();
      shown(r, castOf(r, [seat(7), seat(NINJA, true)]));
      expect(live(r)).toMatchObject({ standing: 1, stacked: 1 });
      expect(live(r).list.find((c) => c.cell === -1)?.side).toBe(1);
    });
  });

  describe('a throw', () => {
    it('makes the clone a step fainter each time: 55, 47, 39, 31 %', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      const alphas: number[] = [];
      for (let n = 0; n < 4; n++) {
        alphas.push((live(r).list[0] as Live['list'][number]).alpha);
        if (n < 3) {
          throwOf(r, 0);
          run(r, 0.6);
        }
      }
      expect(alphas[0]).toBeCloseTo(0.55, 2);
      expect(alphas[1]).toBeCloseTo(0.47, 2);
      expect(alphas[2]).toBeCloseTo(0.39, 2);
      expect(alphas[3]).toBeCloseTo(0.31, 2);
    });

    it('leans into the throw and turns toward its target, and the other clone does not (each throws on its own)', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 1.2);
      const bodies = (r.scene as unknown as { bodies: Array<{ index: number; rig: Container; sprite: Sprite; act: string; facing: number }> }).bodies;
      const one = bodies.find((b) => b.index === 0) as { rig: Container; sprite: Sprite; act: string; facing: number };
      const two = bodies.find((b) => b.index === 1) as { rig: Container; act: string };
      throwOf(r, 0, { projectile: { uid: 100, unitId: 'r_ninja', x: 0, y: 0, angle: Math.PI, targetUid: 99, ghost: true } as never });
      expect(one.act).toBe('throw');
      expect(two.act).toBe('none');
      run(r, 0.05);
      // It reaches toward the left now: the rig is pushed that way and the sprite faces it.
      expect(one.rig.position.x).toBeLessThan(0);
      run(r, 0.5);
      expect(one.sprite.scale.x).toBeLessThan(0);
      expect(one.act).toBe('none');
    });

    it('does not move the ninja, a cat or an enemy', () => {
      const r = rig();
      shown(r, castOf(r));
      const before = JSON.stringify([r.battle.units.map((u) => u && [u.uid, u.cell]), r.battle.enemies]);
      throwOf(r, 0);
      throwOf(r, 1);
      run(r, 1);
      expect(JSON.stringify([r.battle.units.map((u) => u && [u.uid, u.cell]), r.battle.enemies])).toBe(before);
    });

    it('plays the ninja\'s throw sound at a lower volume and a higher pitch, once per volley (not once per clone), and only for a cast that was shown', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      r.stage.play.mockClear();
      throwOf(r, 0);
      throwOf(r, 1);
      const plays = r.stage.play.mock.calls.filter((c) => c[1] === 'atk_r_ninja');
      expect(plays).toHaveLength(1);
      const [, , volume, pitch] = plays[0] as [unknown, string, number, number];
      expect(volume).toBeLessThan(0.5);
      expect(pitch).toBeGreaterThan(1);
      const q = rig();
      q.battle.events.emit('spCast', castOf(q));
      run(q, 0.5);
      throwOf(q, 0);
      expect(q.stage.play).not.toHaveBeenCalled();
      expect(q.stage.fx.ps.burst).not.toHaveBeenCalled();
    });

    it('tells the projectile layer where a stacked clone\'s shuriken starts (the clone\'s own place) and nothing for a clone on its own tile', () => {
      const r = rig();
      shown(r, castOf(r, [seat(7), seat(NINJA, true)]));
      run(r, 0.5);
      throwOf(r, 0, { projectile: { uid: 300, unitId: 'r_ninja', x: 0, y: 0, angle: 0, targetUid: 99, ghost: true } as never });
      throwOf(r, 1, { projectile: { uid: 301, unitId: 'r_ninja', x: 0, y: 0, angle: 0, targetUid: 99, ghost: true } as never });
      expect(takeGhostStart(300)).toBeNull();
      const o = stackOffset(1, LOOK);
      expect(takeGhostStart(301)).toEqual({ dx: o.dx, dy: o.dy });
      expect(ghostStartsPending()).toBe(0);
    });

    it('is heard even when the clone\'s body is not there (a throw is the simulation\'s fact): no throw, and the offset is still told', () => {
      const r = rig();
      throwOf(r, 0);
      expect(live(r).bodies).toBe(0);
    });

    it('a throw that comes before the picture has landed finishes the leap at once (3x: the first volley can come before the real floor)', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.05);
      expect((live(r).list[0] as Live['list'][number]).phase).toBe('in');
      throwOf(r, 0);
      expect((live(r).list[0] as Live['list'][number]).phase).toBe('stand');
    });

    it('under reduced motion only fades a step: no lean, no sparks', () => {
      setFxSettings({ tier: 'high', reducedMotion: true });
      const r = rig({ reduced: true });
      shown(r, castOf(r));
      run(r, 0.5);
      throwOf(r, 0);
      run(r, 0.05);
      const b = (r.scene as unknown as { bodies: Array<{ index: number; rig: Container }> }).bodies.find((x) => x.index === 0) as { rig: Container };
      expect(b.rig.position.x).toBe(0);
      expect(b.rig.rotation).toBe(0);
      expect(r.stage.fx.ps.burst).not.toHaveBeenCalledWith(expect.objectContaining({ tex: 'spark' }), expect.anything(), expect.anything(), expect.anything());
    });
  });

  describe('a cat takes the tile', () => {
    it('hops over to the ninja\'s tile in about 0.2 s and stands behind it, keeping its throws and its fade', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      throwOf(r, 0);
      run(r, 0.3);
      const s = r.ninja.clone[0] as CloneState;
      s.cell = -1;
      r.battle.events.emit('cloneStep', { unit: r.ninja, index: 0, from: 7, to: NINJA, x: cellCenterX(7), y: cellCenterY(7) });
      const first = live(r).list.find((c) => c.index === 0) as Live['list'][number];
      expect(first.phase).toBe('step');
      expect(first.cell).toBe(-1);
      run(r, 0.1);
      const mid = live(r).list.find((c) => c.index === 0) as Live['list'][number];
      expect(mid.phase).toBe('step');
      // Between where it stood and where it goes.
      expect(mid.y).toBeGreaterThan(feet(7).y - 40);
      run(r, 0.3);
      const done = live(r).list.find((c) => c.index === 0) as Live['list'][number];
      expect(done.phase).toBe('stand');
      expect(done.x).toBeCloseTo(feet(NINJA).x + done.side * LOOK.stackOffset.x * STACK_SPREAD, 3);
      expect(done.left).toBe(3);
      expect(done.alpha).toBeCloseTo(Math.min(1, cloneAlpha(3, 4, true, LOOK) * STACK_ALPHA_BOOST), 2);
    });

    it('takes the side the ninja\'s other stacked clone does not', () => {
      const r = rig();
      shown(r, castOf(r, [seat(7), seat(NINJA, true)]));
      run(r, 0.5);
      const other = live(r).list.find((c) => c.index === 1) as Live['list'][number];
      (r.ninja.clone[0] as CloneState).cell = -1;
      r.battle.events.emit('cloneStep', { unit: r.ninja, index: 0, from: 7, to: NINJA, x: 0, y: 0 });
      const mine = live(r).list.find((c) => c.index === 0) as Live['list'][number];
      expect(mine.side).toBe(-other.side);
    });

    it('under reduced motion is behind the ninja at once', () => {
      setFxSettings({ tier: 'high', reducedMotion: true });
      const r = rig({ reduced: true });
      shown(r, castOf(r));
      run(r, 0.5);
      (r.ninja.clone[0] as CloneState).cell = -1;
      r.battle.events.emit('cloneStep', { unit: r.ninja, index: 0, from: 7, to: NINJA, x: 0, y: 0 });
      expect((live(r).list.find((c) => c.index === 0) as Live['list'][number]).phase).toBe('stand');
      run(r, 0.1);
      expect((live(r).list.find((c) => c.index === 0) as Live['list'][number]).cell).toBe(-1);
    });

    it('follows the state when the event was missed (a cell of -1 in the ninja\'s state puts the clone behind it)', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      (r.ninja.clone[1] as CloneState).cell = -1;
      run(r, 0.1);
      expect((live(r).list.find((c) => c.index === 1) as Live['list'][number]).cell).toBe(-1);
    });
  });

  describe('the end', () => {
    it('pops with a puff, leaves one leaf drifting down for 0.6 s after its last throw, and is gone', () => {
      const r = rig();
      shown(r, castOf(r));
      // The leaf the ninja put on its head at the cast has gone by now; the one a clone leaves is the only leaf there is.
      run(r, 1);
      expect(live(r).leaves).toBe(0);
      r.stage.fx.ps.burst.mockClear();
      r.stage.play.mockClear();
      endOf(r, 0, 'done');
      expect(r.stage.fx.ps.burst).toHaveBeenCalledTimes(1);
      expect(r.stage.play).toHaveBeenCalledWith(expect.anything(), 'whoosh', expect.any(Number), expect.any(Number), expect.any(Number));
      expect(live(r).leaves).toBe(1);
      expect((live(r).list.find((c) => c.index === 0) as Live['list'][number]).phase).toBe('out');
      run(r, OUT[0] + 0.05);
      expect(live(r).list.find((c) => c.index === 0)).toBeUndefined();
      expect(live(r).bodies).toBe(1);
      // The leaf is still falling when the body is gone, and is gone itself a little later.
      expect(live(r).leaves).toBe(1);
      run(r, LEAF_FALL[0] + 0.1);
      expect(live(r).leaves).toBe(0);
    });

    it('a clone that ran out of time pops with a puff and no leaf; one that was merged, sold or replaced pops without a sound', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 1);
      r.stage.play.mockClear();
      endOf(r, 0, 'timeout');
      expect(live(r).leaves).toBe(0);
      expect(r.stage.play).toHaveBeenCalled();
      r.stage.play.mockClear();
      endOf(r, 1, 'sold');
      expect(r.stage.play).not.toHaveBeenCalled();
      expect(live(r).leaves).toBe(0);
    });

    it('at the end of a stage or of the battle only fades (0.15 s): no puff, no sound, no leaf', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 1);
      r.stage.fx.ps.burst.mockClear();
      r.stage.play.mockClear();
      endOf(r, 0, 'stage');
      endOf(r, 1, 'end');
      expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
      expect(r.stage.play).not.toHaveBeenCalled();
      expect(live(r).leaves).toBe(0);
      run(r, FADE[0] / 2);
      const half = (r.scene as unknown as { bodies: Array<{ sprite: Sprite; on: boolean }> }).bodies.filter((b) => b.on);
      expect(half.length).toBe(2);
      for (const b of half) expect(b.sprite.alpha).toBeLessThan(0.3);
      run(r, FADE[0]);
      expect(live(r).bodies).toBe(0);
    });

    it('a clone from a cast that lost pops quietly: the body goes, no particle, no sound, no leaf', () => {
      const r = rig();
      r.battle.events.emit('spCast', castOf(r));
      run(r, 0.5);
      endOf(r, 0, 'done');
      expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
      expect(r.stage.play).not.toHaveBeenCalled();
      expect(live(r).leaves).toBe(0);
      run(r, 0.4);
      expect(live(r).bodies).toBe(1);
    });

    it('a new cast that finds the old clones still there ("replaced") sends them off and seats the new pair in the same breath, with no clash of numbers', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      endOf(r, 0, 'replaced');
      endOf(r, 1, 'replaced');
      r.battle.time += 1 / 60;
      shown(r, castOf(r, [seat(7), seat(17)]));
      const l = live(r);
      expect(l.bodies).toBe(4);
      expect(l.list.filter((c) => c.phase === 'out')).toHaveLength(2);
      expect(l.list.filter((c) => c.phase === 'in')).toHaveLength(2);
      run(r, 0.6);
      expect(live(r).bodies).toBe(2);
      expect(live(r).list.every((c) => c.phase === 'stand' && c.left === 4)).toBe(true);
    });

    it('a body the ninja\'s state no longer lists (and no event said why) fades out after 0.3 s of the battle\'s time, but not while the clock stands still', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      r.ninja.clone = [];
      for (let i = 0; i < 300; i++) frame(r, 1 / 60, 0);
      expect(live(r).bodies).toBe(2);
      run(r, 0.35);
      expect(live(r).list.every((c) => c.phase === 'out')).toBe(true);
      run(r, 0.4);
      expect(live(r).bodies).toBe(0);
    });
  });

  describe('a crowded board', () => {
    function many(r: Rig, ninjas: number): void {
      for (let n = 0; n < ninjas; n++) {
        const u = unitOf(100 + n, n % 25);
        r.battle.units[u.cell] = u;
        viewOf(r, u);
        r.battle.time += 0.01;
        shown(r, castOf(r, [seat((n + 5) % 25), seat((n + 9) % 25)], { unit: u }));
      }
    }

    it('draws the first ten bodies as figures and the rest as an outline only (the row\'s figure cap)', () => {
      const r = rig();
      many(r, 7);
      const l = live(r);
      expect(l.bodies).toBe(14);
      expect(l.full).toBe(10);
      expect(l.lite).toBe(4);
      const bodies = (r.scene as unknown as { bodies: Array<{ lite: boolean; sprite: Sprite; rim: Sprite; leaf: Sprite }> }).bodies;
      // With no baked outline (no canvas here) a lite body still shows its picture, so the clone is not lost.
      for (const b of bodies.filter((x) => x.lite)) expect(b.leaf.visible).toBe(false);
    });

    it('never makes more than 24 bodies and 8 leaves however many casts come, and reuses them', () => {
      const r = rig();
      many(r, 20);
      expect(live(r).bodies).toBeLessThanOrEqual(24);
      expect((r.scene as unknown as { bodies: unknown[] }).bodies.length).toBeLessThanOrEqual(24);
      expect((r.scene as unknown as { leaves: unknown[] }).leaves.length).toBeLessThanOrEqual(8);
      for (let i = 0; i < 40; i++) {
        for (const u of r.battle.units) if (u && u.clone.length) for (const c of u.clone.slice()) endOf2(r, u, c.index);
        run(r, 0.3);
        many(r, 6);
      }
      expect((r.scene as unknown as { bodies: unknown[] }).bodies.length).toBeLessThanOrEqual(24);
      expect(r.units.children.filter((c) => c.label === 'sp-clone').length).toBeLessThanOrEqual(24);
    });

    function endOf2(r: Rig, u: UnitState, index: number): void {
      u.clone = u.clone.filter((c) => c.index !== index);
      r.battle.events.emit('cloneEnd', { unit: u, index, cell: -1, x: 0, y: 0, reason: 'end' } as never);
    }
  });

  describe('what a clone is not', () => {
    it('has no rank band, no sticker, no badge: a body is a shadow, its art, its outline and a leaf, none of which takes a touch', () => {
      const r = rig();
      shown(r, castOf(r));
      const bodies = (r.scene as unknown as { bodies: Array<{ root: Container; eventMode: string }> }).bodies;
      expect(bodies).toHaveLength(2);
      for (const b of bodies) {
        expect(b.root.eventMode).toBe('none');
        expect(b.root.interactiveChildren).toBe(false);
        // The shadow and the rig (the outline, the body, the leaf): nothing else.
        expect(b.root.children).toHaveLength(2);
        expect((b.root.children[1] as Container).children).toHaveLength(3);
        expect(b.root.label).toBe('sp-clone');
      }
    });

    it('is not on the board: it adds nothing to the units, writes nothing to the ninja\'s state, and sorts in the units layer', () => {
      const r = rig();
      const cats = JSON.stringify(r.battle.units.map((u) => u && u.cell));
      shown(r, castOf(r));
      run(r, 1);
      expect(JSON.stringify(r.battle.units.map((u) => u && u.cell))).toBe(cats);
      expect(r.battle.units.filter(Boolean)).toHaveLength(1);
      expect(r.units.sortableChildren).toBe(true);
      for (const c of (r.scene as unknown as { bodies: Array<{ root: Container }> }).bodies) expect(c.root.parent).toBe(r.units);
    });

    it('sorts behind a cat that stands on a clone\'s tile, so the cat\'s pop-in lands on top of the clone that is leaving', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.5);
      const clone = (r.scene as unknown as { bodies: Array<{ cell: number; root: Container }> }).bodies.find((b) => b.cell === 7) as { root: Container };
      const catDepth = feet(7).y;
      expect(clone.root.zIndex).toBeLessThan(catDepth);
      // But in front of the cat in the row above.
      expect(clone.root.zIndex).toBeGreaterThan(feet(2).y);
    });
  });

  describe('the life of the scene', () => {
    it('cuts everything off on clear and can be used again after (a revive)', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.2);
      r.scene.clear();
      expect(live(r)).toMatchObject({ bodies: 0, leaves: 0 });
      for (const b of (r.scene as unknown as { bodies: Array<{ root: Container }> }).bodies) expect(b.root.visible).toBe(false);
      expect(ghostStartsPending()).toBe(0);
      shown(r, castOf(r, [seat(7), seat(17)], { at: r.battle.time + 1 }));
      expect(live(r).bodies).toBe(2);
      expect(live(r).list.every((c) => c.phase === 'in')).toBe(true);
    });

    it('lets go of every listener and every piece on destroy, and the events after it do nothing', () => {
      const r = rig();
      shown(r, castOf(r));
      run(r, 0.2);
      const roots = (r.scene as unknown as { bodies: Array<{ root: Container }> }).bodies.map((b) => b.root);
      r.scene.destroy();
      expect(roots.every((x) => x.destroyed)).toBe(true);
      expect(() => {
        r.battle.events.emit('spCast', castOf(r));
        throwOf(r, 0);
        r.battle.events.emit('cloneEnd', { unit: r.ninja, index: 0, cell: 7, x: 0, y: 0, reason: 'done' } as never);
      }).not.toThrow();
      expect(live(r).bodies).toBe(0);
      expect(r.units.children.filter((c) => c.label === 'sp-clone')).toHaveLength(0);
    });

    it('a listener that throws is caught: the scene logs it, empties itself and ignores what follows', () => {
      const r = rig();
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      shown(r, castOf(r));
      const bodies = (r.scene as unknown as { bodies: Array<{ root: Container }> }).bodies;
      Object.defineProperty(bodies[0] as object, 'phase', {
        get: () => {
          throw new Error('boom');
        },
        configurable: true,
      });
      expect(() => throwOf(r, 0)).not.toThrow();
      expect(err).toHaveBeenCalled();
      expect(live(r).bodies).toBe(0);
      expect(() => r.battle.events.emit('spCast', castOf(r, [seat(7), seat(17)], { at: 99 }))).not.toThrow();
      expect(live(r).bodies).toBe(0);
    });
  });

  describe('the real picture', () => {
    it('paints the leaf once on a 2D canvas the first time it is needed, and the pale body when the art can be drawn', async () => {
      const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
      const made: unknown[] = [];
      vi.stubGlobal('document', {
        createElement: () => {
          const c = { width: 0, height: 0, style: {}, getContext: () => ctx };
          made.push(c);
          return c;
        },
      });
      resetCloneArt();
      const { cloneArt } = await import('@/view/director/sp/cloneArt');
      const a = cloneArt();
      expect(a.leafTinted).toBe(false);
      expect(a.leaf.width).toBe(28);
      expect(made.length).toBeGreaterThanOrEqual(1);
      expect(cloneArt()).toBe(a);
      // The bake of the body needs a picture the canvas can draw: the one-pixel stand-in is tinted instead.
      expect(a.bodyTinted).toBe(true);
      expect(a.height).toBeGreaterThan(60);
      expect(a.height).toBeLessThan(120);
    });
  });
});

// ───────────────────────────── behind the real dispatcher ─────────────────────────────

describe('the clones\' scene behind the real dispatcher', () => {
  // The dispatcher's QA hook writes to `window.__dbg`.
  beforeEach(() => {
    vi.stubGlobal('window', { __dbg: {} });
    setFxSettings({ tier: 'high', reducedMotion: false });
    resetCloneArt();
    clearGhostStarts();
  });
  afterEach(() => vi.unstubAllGlobals());

  function mount(spOn = true): { r: Rig; staging: ReturnType<typeof mountSp>; stage: Stage; fire: (e: SpCastEvent) => void } {
    const r = rig({ scene: false });
    (r.battle as { spOn: boolean }).spOn = spOn;
    const hooks: Array<() => void> = [];
    const stage = {
      ...r.stage,
      ctx: r.env.ctx,
      addFrame: (fn: (dt: number) => void) => hooks.push(() => fn(1 / 60)),
      onDestroy: () => undefined,
      later: () => undefined,
      rules: r.stage.rules,
    } as unknown as Stage;
    const on: Bus = (type, fn) => {
      r.battle.events.on(type, fn as never);
    };
    // The stage and the rig share one clock for `now`.
    Object.defineProperty(stage, 'now', { get: () => r.stage.now });
    const staging = mountSp(stage, on);
    return { r, staging, stage, fire: (e) => r.battle.events.emit('spCast', e) };
  }

  it('is not mounted at all when the battle has no skills: no scene, no listener, nothing on the board', () => {
    const m = mount(false);
    expect(m.staging).toBeNull();
    m.fire(castOf(m.r));
    expect(m.r.units.children.filter((c) => c.label === 'sp-clone')).toHaveLength(0);
  });

  it('shows the first cast with its effects and seats the clones of a cast that LOST the stage rule quietly (the bodies are the simulation\'s state, not an effect)', () => {
    const m = mount();
    expect(m.staging).not.toBeNull();
    const scene = lazyLive<ReturnType<Rig['scene']['live']>>(m.staging, 'clones');
    m.fire(castOf(m.r, [seat(7), seat(17)], { first: true }));
    expect(scene.live().list.every((c) => c.loud)).toBe(true);
    expect(m.r.stage.fx.ps.burst).toHaveBeenCalledTimes(1);
    // A second ninja casts in the same quarter second: the rule loses its effect, its bodies still stand.
    const u2 = unitOf(6, 0);
    m.r.battle.units[0] = u2;
    viewOf(m.r, u2);
    m.fire(castOf(m.r, [seat(1), seat(5)], { unit: u2, at: m.r.battle.time + 0.01 }));
    expect(scene.live().bodies).toBe(4);
    expect(scene.live().list.filter((c) => c.uid === 6).every((c) => !c.loud)).toBe(true);
    expect(m.r.stage.fx.ps.burst).toHaveBeenCalledTimes(1);
    expect((m.staging as NonNullable<typeof m.staging>).rule.lost).toBe(1);
  });

  it('is cleared by a victory and by a defeat (the simulation has already ended every clone, so only the fades are cut)', () => {
    const m = mount();
    const scene = lazyLive<ReturnType<Rig['scene']['live']>>(m.staging, 'clones');
    m.fire(castOf(m.r, [seat(7), seat(17)], { first: true }));
    m.r.battle.time += 0.3;
    m.r.battle.events.emit('victory', {} as never);
    expect(scene.live().bodies).toBe(0);
    m.fire(castOf(m.r, [seat(7), seat(17)], { at: m.r.battle.time + 1 }));
    expect(scene.live().bodies).toBe(2);
    m.r.battle.events.emit('defeat', {} as never);
    expect(scene.live().bodies).toBe(0);
  });
});
