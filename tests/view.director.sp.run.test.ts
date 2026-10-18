/**
 * The two RUNNING scenes of the skills: the tiger's charge (`director/sp/charge.ts`) and the star archer's lap (`director/sp/lap.ts`), and what
 * they are built on (`runTrack.ts`: where the body is; `runPieces.ts`: the pooled pieces). Like the shove's tests these are fed a fake battle
 * (a clock, a board, a stage that counts what it is asked for) and real events; nothing here reaches into the simulation.
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
vi.mock('@/fx', async (original) => ({
  ...(await original<typeof import('@/fx')>()),
  fxTex: () => ({ id: 'x', texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
}));
// The dispatcher test at the bottom mounts the real dispatcher with the real scenes of THESE two skills only (the name bubble needs fonts).
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/view/director/sp/scenes', async () => {
  const charge = await import('@/view/director/sp/charge');
  const lap = await import('@/view/director/sp/lap');
  return { SCENES: { charge: charge.makeCharge, lap: lap.makeLap } };
});

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleEvents, EnemyState, SpCastEvent, UnitState } from '@/game/api';
import { PATH_LENGTH, cellCenterX, cellCenterY, pathPoint, wrapPath } from '@/game/geometry';
import { mountSp } from '@/view/director/sp';
import { lazyLive } from './lazyScene';
import { BODY_SCALE, GHOST_KEEP, MERGE_AGE, MERGE_DIST, makeCharge } from '@/view/director/sp/charge';
import { NIGHT_ALPHA, makeLap } from '@/view/director/sp/lap';
import { bodyX } from '@/view/field/policy';
import { Piece, Pieces, SpritePiece } from '@/view/director/sp/runPieces';
import { covered, headingOf, runCoord, runEndsAt, runPlace, trackOf, type RunTrack } from '@/view/director/sp/runTrack';
import type { SpEnv, SpScene } from '@/view/director/sp/types';
import { enemyInfo, type Bus, type Stage } from '@/view/director/stage';

// ── what a cast carries (the simulation's own numbers: docs/handoff/skills1_sim.md section 2) ──

const TIGER_CELL = 11;
const TIGER_DATA = { dir: -1 as const, delay: 0.3, duration: 1.1, dist: 1100, speed: 1000, leap: 0.3 };
const LAP_DATA = { dir: 1 as const, delay: 0, duration: 1.219, dist: PATH_LENGTH + 100, speed: 2000 };

const tigerUnit = (uid = 5, cell = TIGER_CELL): UnitState => ({ uid, id: 'w_tiger', cell }) as unknown as UnitState;
const archerUnit = (uid = 6, cell = 12): UnitState => ({ uid, id: 'r_star', cell }) as unknown as UnitState;

function tigerCast(at: number, runId = 1, startPath = 700, unit = tigerUnit()): SpCastEvent & { skill: 'charge' } {
  const land = pathPoint(startPath);
  return {
    unit,
    first: false,
    x: cellCenterX(unit.cell),
    y: cellCenterY(unit.cell),
    skill: 'charge',
    data: { ...TIGER_DATA, runId, at, startPath, landX: land.x, landY: land.y },
  } as never;
}

function lapCast(at: number, runId = 1, startPath = 1200, unit = archerUnit()): SpCastEvent & { skill: 'lap' } {
  const start = pathPoint(startPath);
  return {
    unit,
    first: false,
    x: cellCenterX(unit.cell),
    y: cellCenterY(unit.cell),
    skill: 'lap',
    data: { ...LAP_DATA, runId, at, startPath, startX: start.x, startY: start.y },
  } as never;
}

const enemy = (uid: number, id = 'cucumber', x = 300, y = 45): EnemyState => ({ uid, id, x, y, angle: 0, travelled: 200, hp: 10, maxHp: 10 }) as unknown as EnemyState;
const hitOf = (runId: number, skill: 'charge' | 'lap', e: EnemyState, x = e.x, y = e.y, head = 0): BattleEvents['spRunHit'] => ({ runId, skill, enemy: e, x, y, head });

/** The scenes with every optional hook present (both scenes have them all). */
const chargeScene = (env: SpEnv): Required<SpScene<'charge'>> => makeCharge(env) as Required<SpScene<'charge'>>;
const lapScene = (env: SpEnv): Required<SpScene<'lap'>> => makeLap(env) as Required<SpScene<'lap'>>;

// ── a battle in a box ──

interface Arena {
  events: Emitter<BattleEvents>;
  battle: { spOn: boolean; time: number; units: (UnitState | null)[]; enemies: EnemyState[]; events: Emitter<BattleEvents> };
  stage: {
    now: number;
    detail: 0 | 1 | 2;
    reduced: boolean;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn>; dustPuff: ReturnType<typeof vi.fn> };
    play: ReturnType<typeof vi.fn>;
    playStep: ReturnType<typeof vi.fn>;
    shake: ReturnType<typeof vi.fn>;
    rules: Record<string, object>;
  };
  back: Container;
  front: Container;
  views: Map<number, Container>;
  env: SpEnv;
  /** The battle clock stands still (a popup). */
  paused: boolean;
}

function arena(detail: 0 | 1 | 2 = 2): Arena {
  const events = new Emitter<BattleEvents>();
  const battle = { spOn: true, time: 10, units: new Array<UnitState | null>(25).fill(null), enemies: [] as EnemyState[], events };
  const stage = {
    now: 0,
    detail,
    reduced: false,
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), dustPuff: vi.fn() },
    play: vi.fn(),
    playStep: vi.fn(),
    shake: vi.fn(),
    rules: { big: {}, heavyHit: {}, strike: {} },
  };
  const back = new Container();
  const front = new Container();
  const views = new Map<number, Container>();
  const env = {
    stage: stage as unknown as Stage,
    ctx: { layers: { fxBack: back, fxFront: front }, battle, unitView: (uid: number) => views.get(uid) ?? null },
    battle,
  } as unknown as SpEnv;
  return { events, battle, stage, back, front, views, env, paused: false };
}

/** A cat's view as the field keeps it: a root with a child sprite labelled `sprite`. */
function viewOf(a: Arena, u: UnitState): Sprite {
  const root = new Container();
  const art = new Sprite(Texture.WHITE);
  art.label = 'sprite';
  root.addChild(art);
  a.views.set(u.uid, root);
  a.battle.units[u.cell] = u;
  return art;
}

interface Frames {
  update?(dt: number, battleDt: number): void;
}

/** One frame: real `dt`, and the battle clock moves `speed` times as far (not at all under a popup), as the dispatcher hands it to a scene. */
function frame(a: Arena, scene: Frames, speed = 1, dt = 1 / 60): void {
  const before = a.battle.time;
  if (!a.paused) a.battle.time += speed * dt;
  a.stage.now += dt;
  scene.update?.(dt, a.battle.time - before);
}

/** Frames until the battle clock has moved `seconds` (battle seconds). */
function advance(a: Arena, scene: Frames, seconds: number, speed = 1): void {
  const until = a.battle.time + seconds - 1e-9;
  let guard = 0;
  while (a.battle.time < until && guard++ < 100000) frame(a, scene, speed);
}

beforeEach(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  vi.stubGlobal('window', { __dbg: {} });
  setFxSettings({ tier: 'high', reducedMotion: false });
});
afterEach(() => vi.unstubAllGlobals());

// ── where the body is ──

describe('where a running body is (runTrack)', () => {
  const tiger: RunTrack = trackOf({ ...TIGER_DATA, at: 10, startPath: 700 });
  const lap: RunTrack = trackOf({ ...LAP_DATA, at: 10, startPath: 1200 });

  it('stands at the start until its delay is over, then covers speed x time, and stops at the end of the run', () => {
    expect(covered(tiger, 9)).toBe(0);
    expect(covered(tiger, 10.29)).toBe(0);
    expect(covered(tiger, 10.3)).toBeCloseTo(0, 9);
    expect(covered(tiger, 10.8)).toBeCloseTo(500, 9);
    expect(covered(tiger, 11.4)).toBeCloseTo(1100, 9);
    expect(covered(tiger, 99)).toBe(1100);
    expect(covered(lap, 10)).toBe(0);
    expect(covered(lap, 10.5)).toBeCloseTo(1000, 9);
    expect(covered(lap, 99)).toBe(PATH_LENGTH + 100);
  });

  it('is the road point startPath + dir x covered: against the flow for the tiger, with it for the arrow', () => {
    const t = 10.8;
    const a = runPlace(tiger, t, { x: 0, y: 0, angle: 0 });
    const b = pathPoint(700 - 500);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
    const c = runPlace(lap, 10.5, { x: 0, y: 0, angle: 0 });
    const d = pathPoint(1200 + 1000);
    expect(c.x).toBeCloseTo(d.x, 9);
    expect(c.y).toBeCloseTo(d.y, 9);
  });

  it('ends when the simulation\'s run ends: the tiger 1.4 s after the cast, the arrow 1.219 s', () => {
    expect(runEndsAt(tiger)).toBeCloseTo(11.4, 9);
    expect(runEndsAt(lap)).toBeCloseTo(11.219, 3);
  });

  it('wraps over the seam of the road in both directions without a jump', () => {
    for (const [track, from, to] of [
      [trackOf({ ...TIGER_DATA, at: 0, startPath: 400 }), 0.3, 1.4],
      [trackOf({ ...LAP_DATA, at: 0, startPath: PATH_LENGTH - 300 }), 0, 1.219],
    ] as const) {
      let last: { x: number; y: number } | null = null;
      let crossed = false;
      let prev = runCoord(track, from);
      for (let t = from; t <= to + 1e-9; t += 1 / 600) {
        const c = runCoord(track, t);
        if (Math.abs(c - prev) > PATH_LENGTH / 2) crossed = true;
        prev = c;
        const p = runPlace(track, t, { x: 0, y: 0, angle: 0 });
        // At 2,000 px/s a step of 1/600 s is 3.3 px: the picture never jumps, the seam is no special place.
        if (last) expect(Math.hypot(p.x - last.x, p.y - last.y)).toBeLessThanOrEqual((track.speed / 600) * 1.001 + 1e-6);
        last = { x: p.x, y: p.y };
      }
      expect(crossed).toBe(true);
    }
  });

  it('keeps the coordinate inside the loop and a lap ends 100 px past where it began', () => {
    for (let t = 10; t < 12; t += 0.01) {
      const c = runCoord(lap, t);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThan(PATH_LENGTH);
    }
    expect(runCoord(lap, 99)).toBeCloseTo(wrapPath(1200 + 100), 6);
  });

  it('faces the way the road runs for a body with the flow and the other way against it', () => {
    expect(headingOf(lap, 0.5)).toBe(0.5);
    expect(headingOf(tiger, 0.5)).toBeCloseTo(0.5 + Math.PI, 9);
  });
});

// ── the pool the scenes' pieces live in ──

describe('the pooled pieces (runPieces)', () => {
  class Dot extends Piece {
    hid = 0;
    hide(): void {
      this.on = false;
      this.hid++;
    }
    destroy(): void {}
  }

  it('makes a piece on first use, reuses a finished one and never grows past its cap', () => {
    let made = 0;
    const pool = new Pieces(() => {
      made++;
      return new Dot();
    }, 4);
    for (let i = 0; i < 40; i++) pool.take().start(10, 10);
    expect(made).toBe(4);
    expect(pool.live).toBe(4);
    pool.clear();
    expect(pool.live).toBe(0);
    pool.take().start(1, 1);
    expect(made).toBe(4);
  });

  it('at a tier\'s limit takes over the OLDEST piece, so the newest hits of a long run are still drawn', () => {
    const pool = new Pieces(() => new Dot(), 10);
    const first = pool.take();
    first.start(10, 10);
    pool.update(0, 1, () => undefined);
    for (let i = 0; i < 2; i++) pool.take(3).start(10, 10);
    expect(pool.live).toBe(3);
    const fourth = pool.take(3);
    expect(fourth).toBe(first);
    expect(first.hid).toBe(1);
    expect(pool.live).toBe(2);
    fourth.start(10, 10);
    expect(pool.live).toBe(3);
    expect(pool.list.length).toBe(3);
  });

  it('holds a piece still under a popup: real time goes on, the battle clock does not, and the picture does not move on', () => {
    const pool = new Pieces(() => new Dot(), 4);
    const p = pool.take();
    p.start(0.4, 0.2);
    const seen: number[] = [];
    for (let i = 0; i < 300; i++) pool.update(0, 1 / 60, (_, k) => seen.push(k));
    expect(p.on).toBe(true);
    expect(Math.max(...seen)).toBe(0);
    // The popup closes: the battle clock runs again and the piece lives out its life.
    pool.update(0.4, 1 / 60, () => undefined);
    expect(p.on).toBe(false);
  });

  it('ages a piece by the battle clock with a floor in real time: at 3x a 0.4 s picture lasts 0.2 s, and it is hidden the frame it is over', () => {
    const pool = new Pieces(() => new Dot(), 4);
    const p = pool.take();
    p.start(0.4, 0.2);
    // 3x: the battle life (0.4 s) is gone after 0.133 s of real time, but the floor keeps the piece for 0.2 s.
    pool.update(0.4, 0.133, () => undefined);
    expect(p.on).toBe(true);
    pool.update(0.05, 0.05, () => undefined);
    expect(p.on).toBe(true);
    pool.update(0.05, 0.03, () => undefined);
    expect(p.on).toBe(false);
  });

  it('a sprite piece starts hidden, is shown by its owner and goes away with hide()', () => {
    const parent = new Container();
    const p = new SpritePiece(parent, Texture.WHITE);
    expect(p.sprite.visible).toBe(false);
    p.sprite.visible = true;
    p.hide();
    expect(p.sprite.visible).toBe(false);
    p.destroy();
  });
});

// ── the tiger ──

describe('the tiger\'s scene', () => {
  interface Live {
    runs: number;
    stomps: number;
    prints: number;
    bodies: Array<{ id: number; phase: string; x: number; y: number; ghost: number }>;
  }
  const live = (s: unknown): Live => (s as { live(): Live }).live();
  const stompsOf = (s: unknown): Array<{ x: number; y: number; count: number; on: boolean }> => (s as { stomps: { list: Array<{ x: number; y: number; count: number; on: boolean }> } }).stomps.list;
  const roadOf = (startPath: number, cov: number): { x: number; y: number } => pathPoint(startPath - cov);

  /** A tiger on its tile with a view, and a cast at the battle's present time. */
  function setup(detail: 0 | 1 | 2 = 2, startPath = 700) {
    const a = arena(detail);
    const art = viewOf(a, tigerUnit());
    const scene = chargeScene(a.env);
    const e = tigerCast(a.battle.time, 1, startPath);
    scene.cast(e as never);
    return { a, art, scene, e };
  }

  it('leaps from its tile to the landing point over the leap, growing to 1.5x, and the leap\'s end is where the run starts', () => {
    const { a, scene, e } = setup();
    const from = { x: cellCenterX(TIGER_CELL), y: cellCenterY(TIGER_CELL) };
    expect(live(scene).bodies[0]?.phase).toBe('leap');
    let last = live(scene).bodies[0] as Live['bodies'][number];
    // Half way through the 0.3 s leap it is between the tile and the landing.
    advance(a, scene, 0.15);
    const mid = live(scene).bodies[0] as Live['bodies'][number];
    expect(mid.phase).toBe('leap');
    expect(Math.hypot(mid.x - from.x, mid.y - (from.y + 48 * 0)) ).toBeGreaterThan(30);
    expect(Math.hypot(mid.x - e.data.landX, mid.y - e.data.landY)).toBeGreaterThan(30);
    advance(a, scene, 0.16);
    last = live(scene).bodies[0] as Live['bodies'][number];
    expect(last.phase).toBe('run');
    expect(Math.hypot(last.x - e.data.landX, last.y - e.data.landY)).toBeLessThan(25);
    expect(BODY_SCALE).toBe(1.5);
  });

  it('is on the road where the simulation\'s body is, at every frame, at 1x, 2x and 3x', () => {
    for (const speed of [1, 2, 3]) {
      const { a, scene, e } = setup(2, 700);
      const track = trackOf(e.data);
      let checked = 0;
      let guard = 0;
      while (live(scene).bodies[0]?.phase !== 'roar' && guard++ < 2000) {
        frame(a, scene, speed);
        const b = live(scene).bodies[0];
        if (b?.phase !== 'run') continue;
        const want = roadOf(700, covered(track, a.battle.time));
        expect(b.x, `speed ${speed} t ${a.battle.time}`).toBeCloseTo(want.x, 6);
        expect(b.y, `speed ${speed} t ${a.battle.time}`).toBeCloseTo(want.y, 6);
        checked++;
      }
      // About 1.1 s of running at 1/60 s frames of 1x / 2x / 3x game speed.
      expect(checked, `speed ${speed}`).toBeGreaterThan(Math.floor(60 / speed) - 2);
    }
  });

  it('is at the same place at the same battle time whatever the game speed', () => {
    const at = (speed: number): { x: number; y: number } => {
      const { a, scene } = setup(2, 700);
      // Run until the battle clock first reaches 0.9 s after the cast, then read the place and compare it with the road at THAT clock.
      advance(a, scene, 0.9, speed);
      const b = live(scene).bodies[0] as Live['bodies'][number];
      const want = roadOf(700, covered(trackOf(tigerCast(10, 1, 700).data), a.battle.time));
      expect(b.x).toBeCloseTo(want.x, 6);
      expect(b.y).toBeCloseTo(want.y, 6);
      return { x: want.x, y: want.y };
    };
    const one = at(1);
    for (const speed of [2, 3]) {
      const other = at(speed);
      // The clocks differ by less than a frame of the faster speed (50 ms x 1000 px/s = 50 px).
      expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeLessThan(55);
    }
  });

  it('holds still under a popup: the clock stands, the body, the stomps and the ghost do not move for as long as it does', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.9);
    scene.runHit(hitOf(1, 'charge', enemy(1, 'cucumber', 600, 45)));
    frame(a, scene);
    const body = { ...(live(scene).bodies[0] as Live['bodies'][number]) };
    const stomps = live(scene).stomps;
    a.paused = true;
    for (let i = 0; i < 400; i++) frame(a, scene);
    const now = live(scene);
    expect(now.bodies[0]).toEqual(body);
    expect(now.stomps).toBe(stomps);
    a.paused = false;
    advance(a, scene, 0.1);
    expect((live(scene).bodies[0] as Live['bodies'][number]).x).not.toBe(body.x);
  });

  it('puts a stomp AT the enemy the event names, not at the body: the first tick of a run touches enemies behind its head', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.5);
    const e = enemy(9, 'cucumber', 123, 321);
    // The body is far from (123, 321); the stomp goes where the enemy stood.
    scene.runHit(hitOf(1, 'charge', e, 123, 321, 17));
    const [s] = stompsOf(scene).filter((x) => x.on);
    expect(s?.x).toBeCloseTo(123, 6);
    expect(s?.y).toBeCloseTo(321 + enemyInfo('cucumber').size * 0.28, 6);
    expect(live(scene).stomps).toBe(1);
    expect(live(scene).prints).toBeGreaterThanOrEqual(1);
  });

  it('merges stomps of a packed road: hits within reach of a young stomp join it, a far one or an old one is a new stomp', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.5);
    const near = (n: number, x: number): BattleEvents['spRunHit'] => hitOf(1, 'charge', enemy(n, 'cucumber', x, 45), x, 45);
    scene.runHit(near(1, 300));
    scene.runHit(near(2, 300 + MERGE_DIST - 4));
    scene.runHit(near(3, 300 + 10));
    expect(live(scene).stomps).toBe(1);
    expect(stompsOf(scene).find((s) => s.on)?.count).toBe(3);
    // A hit that is far away is its own stomp.
    scene.runHit(near(4, 300 + 4 * MERGE_DIST));
    expect(live(scene).stomps).toBe(2);
    // The same place, but after the first stomp has grown old: not merged any more.
    advance(a, scene, MERGE_AGE + 0.05);
    scene.runHit(near(5, 300));
    expect(live(scene).stomps).toBe(3);
  });

  it('merges by the battle\'s clock, not by real time: under a popup a stomp stays young', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.5);
    scene.runHit(hitOf(1, 'charge', enemy(1, 'cucumber', 300, 45)));
    a.paused = true;
    for (let i = 0; i < 120; i++) frame(a, scene);
    scene.runHit(hitOf(1, 'charge', enemy(2, 'cucumber', 310, 45)));
    expect(live(scene).stomps).toBe(1);
  });

  it('gives one burst, one print and one thud for a knot of enemies, and a stomp per enemy for a loose line', () => {
    const packed = setup(2, 700);
    advance(packed.a, packed.scene, 0.5);
    packed.a.stage.play.mockClear();
    for (let i = 0; i < 12; i++) packed.scene.runHit(hitOf(1, 'charge', enemy(i + 1, 'cucumber', 300 + i * 2, 45)));
    expect(live(packed.scene).stomps).toBe(1);
    expect(packed.a.stage.play.mock.calls.filter((c) => c[1] === 'imp_w_tiger').length).toBe(1);
    const loose = setup(2, 700);
    advance(loose.a, loose.scene, 0.5);
    for (let i = 0; i < 6; i++) loose.scene.runHit(hitOf(1, 'charge', enemy(i + 1, 'cucumber', 100 + i * 120, 45)));
    expect(live(loose.scene).stomps).toBe(6);
  });

  it('keeps the newest stomps when a crowded road is more than a tier shows: the oldest give way, the pool does not grow', () => {
    for (const [detail, limit] of [[0, 8], [1, 14], [2, 22]] as const) {
      const { a, scene } = setup(detail, 700);
      advance(a, scene, 0.5);
      // A crowd spread over the field (six to a row, sixty apart or more: no two merge), the last one in the bottom row.
      for (let i = 0; i < 60; i++) {
        scene.runHit(hitOf(1, 'charge', enemy(i + 1, 'cucumber', 50 + (i % 6) * 120, 40 + Math.floor(i / 6) * 60)));
        advance(a, scene, 1 / 60);
      }
      expect(live(scene).stomps, `tier ${detail}`).toBe(limit);
      // The newest are among them and the oldest are not: the last enemy's row is on, the first rows are gone.
      const ys = stompsOf(scene).filter((s) => s.on).map((s) => s.y);
      expect(Math.max(...ys), `tier ${detail}`).toBeGreaterThanOrEqual(40 + 9 * 60);
      expect(Math.min(...ys), `tier ${detail}`).toBeGreaterThan(40 + 4 * 60);
      expect(stompsOf(scene).length).toBeLessThanOrEqual(24);
    }
  });

  it('draws the body inside the screen on the side roads (pulled in like every big body of the field) while the road\'s own place stays what the formula says', () => {
    // Start on the right road, run up and along the top road to the left one: the road's x is 675 and then 45 and the body is drawn between.
    let start = 0;
    while (pathPoint(start).x < 674.9 || pathPoint(start).y < 250) start++;
    const { a, scene } = setup(2, start + 100);
    const run = (scene as unknown as { runs: Array<{ body: Container; sprite: Sprite; x: number; base: number }> }).runs[0] as { body: Container; sprite: Sprite; x: number; base: number };
    // The test texture is a pixel: give the body the size of a real one (about 100 px a cat, 150 as the tiger).
    run.base = 100 / Math.max(1, run.sprite.texture.height);
    let minRoad = 1e9;
    let maxRoad = -1e9;
    let pulledIn = false;
    let guard = 0;
    while (live(scene).runs > 0 && guard++ < 1500) {
      frame(a, scene, 1);
      if (live(scene).bodies[0]?.phase === 'back') break;
      // (The body is thin for a moment while it turns round: its width goes through nothing as it faces the other way.)
      const half = Math.abs(run.sprite.width) / 2;
      expect(run.body.position.x - half).toBeGreaterThanOrEqual(0);
      expect(run.body.position.x + half).toBeLessThanOrEqual(720);
      if (half > 50 && (run.x < 70 || run.x > 650)) {
        expect(Math.abs(run.body.position.x - run.x)).toBeGreaterThan(8);
        pulledIn = true;
      }
      minRoad = Math.min(minRoad, run.x);
      maxRoad = Math.max(maxRoad, run.x);
    }
    expect(pulledIn).toBe(true);
    // The run did reach both side roads, where the road is closer to the edge than the body is wide.
    expect(maxRoad).toBeGreaterThan(674);
    expect(minRoad).toBeLessThan(46);
  });

  it('puts a stomp where the enemy is drawn: a big body on a side road is pulled in from the edge, as the field draws it', () => {
    const { a, scene } = setup();
    advance(a, scene, 0.4);
    scene.runHit(hitOf(1, 'charge', enemy(7, 'boss_blender', 45, 300)));
    const stomp = stompsOf(scene).find((s) => s.on);
    expect(stomp?.x).toBeCloseTo(bodyX(45, enemyInfo('boss_blender').size), 6);
    expect(stomp?.x).toBeGreaterThan(45 + 10);
    // An ordinary small one in the middle of the field is where it stands.
    scene.runHit(hitOf(1, 'charge', enemy(8, 'cucumber', 400, 45)));
    expect(stompsOf(scene).some((s) => s.on && Math.abs(s.x - 400) < 1e-6)).toBe(true);
  });

  it('dresses the tile while the tiger is out: the cat becomes a ghost, an outline is drawn on the tile, and both go when it is home', () => {
    const { a, art, scene } = setup(2, 700);
    expect(art.alpha).toBe(1);
    advance(a, scene, 0.9);
    expect(art.alpha).toBeCloseTo(GHOST_KEEP, 6);
    expect(live(scene).bodies[0]?.ghost).toBe(1);
    const outline = a.back.children.flatMap((c) => (c as Container).children).filter((c) => c instanceof Sprite && c.visible && Math.abs(c.x - cellCenterX(TIGER_CELL)) < 1e-6 && Math.abs(c.y - cellCenterY(TIGER_CELL)) < 1e-6);
    expect(outline.length).toBe(1);
    // The simulation's run ends; the tiger roars, walks home, and the cat is whole again.
    scene.runEnd({ runId: 1, skill: 'charge', unit: tigerUnit(), hits: 3 });
    advance(a, scene, 2);
    expect(live(scene).runs).toBe(0);
    expect(art.alpha).toBe(1);
    expect(a.back.children.flatMap((c) => (c as Container).children).filter((c) => c instanceof Sprite && c.visible && Math.abs(c.x - cellCenterX(TIGER_CELL)) < 1e-6).length).toBe(0);
  });

  it('walks home to the tile after the run: roars where the run ended, then comes back and arrives at the tile\'s feet', () => {
    const { a, scene, e } = setup(2, 700);
    const phases = new Set<string>();
    advance(a, scene, 1.0);
    phases.add((live(scene).bodies[0] as Live['bodies'][number]).phase);
    scene.runEnd({ runId: 1, skill: 'charge', unit: tigerUnit(), hits: 3 });
    let arrive: { x: number; y: number } | null = null;
    let guard = 0;
    while (live(scene).runs > 0 && guard++ < 1000) {
      frame(a, scene);
      const b = live(scene).bodies[0];
      if (b) {
        phases.add(b.phase);
        if (b.phase === 'back') arrive = { x: b.x, y: b.y };
      }
    }
    expect([...phases]).toEqual(expect.arrayContaining(['run', 'roar', 'back']));
    const end = pathPoint(700 - 1100);
    expect(arrive).not.toBeNull();
    // The walk goes from where the run ended toward the tile: the last drawn place is nearer the tile than the end of the run was.
    const tile = { x: cellCenterX(TIGER_CELL), y: cellCenterY(TIGER_CELL) };
    expect(Math.hypot((arrive as { x: number }).x - tile.x, (arrive as { y: number }).y - tile.y)).toBeLessThan(Math.hypot(end.x - tile.x, end.y - tile.y));
    expect(e.data.dist).toBe(1100);
  });

  it('shows the roar and the walk back for about a second at 1x and for their real floors at 3x (0.6 s), by the battle clock', () => {
    const after = (speed: number): number => {
      const { a, scene } = setup(2, 700);
      // The run ends 1.4 s after the cast (0.3 s of leap and 1.1 s on the road): measure from there.
      advance(a, scene, 1.4, speed);
      scene.runEnd({ runId: 1, skill: 'charge', unit: tigerUnit(), hits: 3 });
      let frames = 0;
      while (live(scene).runs > 0 && frames < 3000) {
        frame(a, scene, speed);
        frames++;
      }
      return frames / 60;
    };
    const one = after(1);
    // The roar (0.26 s) and the walk (0.8 s), and the cat's own 0.14 s of coming back.
    expect(one).toBeGreaterThan(1);
    expect(one).toBeLessThan(1.4);
    const three = after(3);
    // The floors: 0.16 s of roar and 0.45 s of walk, so a third of the 1x time would be too quick to read.
    expect(three).toBeGreaterThan(0.58);
    expect(three).toBeLessThan(one);
  });

  it('the tiger is sold while it runs: the mark and the ghost go at once, the body ends in a puff, nothing is left, the cat is whole', () => {
    const { a, art, scene } = setup(2, 700);
    advance(a, scene, 0.7);
    expect(art.alpha).toBeLessThan(0.5);
    // Sold: the tile is empty, and the view is recycled (not found by its uid any more).
    a.battle.units[TIGER_CELL] = null;
    a.views.delete(5);
    advance(a, scene, 0.1);
    expect(live(scene).bodies[0]?.ghost).toBeLessThan(1);
    scene.runEnd({ runId: 1, skill: 'charge', unit: tigerUnit(), hits: 3 });
    let guard = 0;
    while (live(scene).runs > 0 && guard++ < 2000) frame(a, scene);
    expect(live(scene).runs).toBe(0);
    expect(a.stage.fx.dustPuff).toHaveBeenCalled();
    expect(a.back.children.flatMap((c) => (c as Container).children).filter((c) => c instanceof Sprite && c.visible && Math.abs(c.x - cellCenterX(TIGER_CELL)) < 1e-6).length).toBe(0);
    // The cat that was sold is not in the scene any more; the art we had ghosted was given back with its view.
    expect(art.alpha).toBeLessThanOrEqual(1);
  });

  it('a cat put on the tile the tiger left is not dressed as a tiger: the mark leaves the moment the tiger does', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.7);
    a.battle.units[TIGER_CELL] = tigerUnit(77);
    advance(a, scene, 0.4);
    const marks = a.back.children.flatMap((c) => (c as Container).children).filter((c) => c instanceof Sprite && c.visible && Math.abs(c.x - cellCenterX(TIGER_CELL)) < 1e-6 && Math.abs(c.y - cellCenterY(TIGER_CELL)) < 1e-6);
    expect(marks.length).toBe(0);
  });

  it('is cut off by victory or defeat (no end event comes): clear() takes the body, the stomps, the prints, the mark and the ghost away', () => {
    const { a, art, scene } = setup(2, 700);
    advance(a, scene, 0.9);
    scene.runHit(hitOf(1, 'charge', enemy(1, 'cucumber', 300, 45)));
    expect(live(scene).runs).toBe(1);
    expect(art.alpha).toBeLessThan(1);
    scene.clear();
    const now = live(scene);
    expect(now).toMatchObject({ runs: 0, stomps: 0, prints: 0 });
    expect(art.alpha).toBe(1);
    expect(visibleSprites(a.back, a.front)).toBe(0);
    // And a later frame draws nothing back.
    for (let i = 0; i < 30; i++) frame(a, scene);
    expect(visibleSprites(a.back, a.front)).toBe(0);
  });

  it('two tigers at once each keep their own body, and one run ending does not end the other', () => {
    const a = arena(2);
    viewOf(a, tigerUnit(5, 11));
    viewOf(a, tigerUnit(8, 13));
    const scene = chargeScene(a.env);
    scene.cast(tigerCast(a.battle.time, 1, 700, tigerUnit(5, 11)) as never);
    advance(a, scene, 0.5);
    scene.cast(tigerCast(a.battle.time, 2, 1500, tigerUnit(8, 13)) as never);
    advance(a, scene, 0.5);
    const two = live(scene).bodies;
    expect(two.map((b) => b.id).sort()).toEqual([1, 2]);
    const track1 = trackOf(tigerCast(10, 1, 700).data);
    const want1 = roadOf(700, covered(track1, a.battle.time));
    expect((two.find((b) => b.id === 1) as { x: number }).x).toBeCloseTo(want1.x, 6);
    scene.runEnd({ runId: 1, skill: 'charge', unit: tigerUnit(5, 11), hits: 1 });
    advance(a, scene, 0.1);
    expect(live(scene).bodies.find((b) => b.id === 2)?.phase).toBe('run');
    expect(live(scene).bodies.find((b) => b.id === 1)?.phase).not.toBe('run');
  });

  it('never makes more than three bodies however many casts come, and the pools stop growing', () => {
    const a = arena(2);
    const scene = chargeScene(a.env);
    for (let i = 0; i < 40; i++) {
      const u = tigerUnit(100 + i, i % 25);
      viewOf(a, u);
      scene.cast(tigerCast(a.battle.time, i + 1, (i * 211) % 2000, u) as never);
      for (let h = 0; h < 5; h++) scene.runHit(hitOf(i + 1, 'charge', enemy(h, 'cucumber', 100 + h * 90, 45)));
      advance(a, scene, 0.3);
    }
    expect(live(scene).runs).toBeLessThanOrEqual(3);
    // 3 bodies (2 sprites, a shadow and a container) + 3 outlines + 24 stomps (2 sprites each) + 60 prints, in two layers: a hard bound.
    const count = (c: Container): number => c.children.reduce((n, ch) => n + 1 + count(ch as Container), 0);
    expect(count(a.back) + count(a.front)).toBeLessThan(200);
  });

  it('under reduced motion: no camera nudge, no leap\'s rise or squash, no trail of dust; the body still lands where the run starts', () => {
    const a = arena(2);
    a.stage.reduced = true;
    viewOf(a, tigerUnit());
    const scene = chargeScene(a.env);
    const e = tigerCast(a.battle.time, 1, 700);
    scene.cast(e as never);
    advance(a, scene, 0.15);
    const body = (scene as unknown as { runs: Array<{ body: Container }> }).runs[0]?.body as Container;
    const sprite = body.children[1] as Sprite;
    // On the ground (a leap that does not rise), at its natural proportions (a squash would stretch one axis).
    expect(sprite.position.y).toBe(0);
    expect(Math.abs(sprite.scale.x) / Math.abs(sprite.scale.y)).toBeCloseTo(1, 6);
    advance(a, scene, 0.3);
    expect(a.stage.shake).not.toHaveBeenCalled();
    const b = live(scene).bodies[0] as Live['bodies'][number];
    expect(b.phase).toBe('run');
  });

  it('at full quality the landing nudges the camera once, softly, and thuds once', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.4);
    expect(a.stage.shake).toHaveBeenCalledTimes(1);
    const sounds = a.stage.play.mock.calls.map((c) => c[1]);
    expect(sounds.filter((s) => s === 'atk_w_tiger')).toHaveLength(1);
    expect(sounds.filter((s) => s === 'imp_w_tiger')).toHaveLength(1);
    void scene;
  });

  it('the low tier lays no paw prints along the road and no dust, the high tier does both', () => {
    const run = (detail: 0 | 1 | 2): { prints: number; puffs: number } => {
      const { a, scene } = setup(detail, 700);
      advance(a, scene, 1.3);
      return { prints: live(scene).prints, puffs: a.stage.fx.ps.burst.mock.calls.length };
    };
    const low = run(0);
    const high = run(2);
    expect(low.prints).toBeLessThanOrEqual(1);
    expect(high.prints).toBeGreaterThan(8);
    expect(high.puffs).toBeGreaterThan(low.puffs);
  });

  it('draws only from the event and the clock: it moves no enemy and no cat', () => {
    const { a, scene } = setup(2, 700);
    const e = enemy(1, 'cucumber', 300, 45);
    a.battle.enemies.push(e);
    const before = JSON.stringify(e);
    const cat = JSON.stringify(a.battle.units[TIGER_CELL]);
    advance(a, scene, 0.9);
    scene.runHit(hitOf(1, 'charge', e));
    advance(a, scene, 1);
    expect(JSON.stringify(e)).toBe(before);
    expect(JSON.stringify(a.battle.units[TIGER_CELL])).toBe(cat);
  });

  it('destroy() frees everything it made', () => {
    const { a, scene } = setup(2, 700);
    advance(a, scene, 0.9);
    scene.destroy();
    expect(a.back.children.length + a.front.children.length).toBe(0);
  });
});

/** Sprites and graphics that are visible anywhere under the given containers. */
function visibleSprites(...roots: Container[]): number {
  let n = 0;
  const walk = (c: Container): void => {
    for (const ch of c.children as Container[]) {
      if (!ch.visible) continue;
      if (ch instanceof Sprite || ch.constructor.name === 'Graphics') n++;
      walk(ch);
    }
  };
  for (const r of roots) walk(r);
  return n;
}

// ── the star archer ──

describe('the star archer\'s scene', () => {
  interface Live {
    runs: number;
    stars: number;
    bursts: number;
    night: number;
    heads: Array<{ id: number; phase: string; x: number; y: number }>;
  }
  const live = (s: unknown): Live => (s as { live(): Live }).live();
  const starsOf = (s: unknown): Array<{ x: number; y: number; on: boolean }> => (s as { stars: { list: Array<{ x: number; y: number; on: boolean }> } }).stars.list;
  const burstsOf = (s: unknown): Array<{ x: number; y: number; radius: number; on: boolean }> => (s as { bursts: { list: Array<{ x: number; y: number; radius: number; on: boolean }> } }).bursts.list;

  function setup(detail: 0 | 1 | 2 = 2, startPath = 1200) {
    const a = arena(detail);
    const scene = lapScene(a.env);
    const e = lapCast(a.battle.time, 1, startPath);
    scene.cast(e as never);
    return { a, scene, e };
  }

  it('comes down at the start point and runs with the flow: the head is on the road where the simulation\'s body is, at 1x, 2x and 3x', () => {
    for (const speed of [1, 2, 3]) {
      const { a, scene, e } = setup(2, 1200);
      const track = trackOf(e.data);
      let checked = 0;
      let guard = 0;
      while (live(scene).heads[0] && guard++ < 4000) {
        frame(a, scene, speed);
        const h = live(scene).heads[0];
        if (!h || h.phase !== 'run') continue;
        const want = pathPoint(1200 + covered(track, a.battle.time));
        expect(h.x, `speed ${speed}`).toBeCloseTo(want.x, 6);
        expect(h.y, `speed ${speed}`).toBeCloseTo(want.y, 6);
        checked++;
      }
      expect(checked, `speed ${speed}`).toBeGreaterThan(Math.floor(72 / speed) - 4);
    }
  });

  it('runs the whole lap round the corners and over the seam without a jump, and ends 100 px past where it began', () => {
    const { a, scene } = setup(2, PATH_LENGTH - 300);
    let last: { x: number; y: number } | null = null;
    let corners = 0;
    let guard = 0;
    let prevAngle = Number.NaN;
    while (live(scene).heads[0]?.phase !== 'fade' && guard++ < 1000) {
      frame(a, scene, 1);
      const h = live(scene).heads[0];
      if (!h || h.phase !== 'run') continue;
      if (last) expect(Math.hypot(h.x - last.x, h.y - last.y)).toBeLessThanOrEqual(2000 / 60 + 0.01);
      last = { x: h.x, y: h.y };
      const angle = pathPoint(wrapPath(PATH_LENGTH - 300 + covered(trackOf(lapCast(10, 1, PATH_LENGTH - 300).data), a.battle.time))).angle;
      if (!Number.isNaN(prevAngle) && Math.abs(angle - prevAngle) > 0.01) corners++;
      prevAngle = angle;
    }
    expect(corners).toBeGreaterThan(3);
    const end = pathPoint(PATH_LENGTH - 300 + PATH_LENGTH + 100);
    expect(last).not.toBeNull();
    expect(Math.hypot((last as { x: number }).x - end.x, (last as { y: number }).y - end.y)).toBeLessThan(2000 / 60 + 1);
  });

  it('holds still under a popup, the head, the stars and the night', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.3);
    const star = enemy(3, 'cucumber', 400, 200);
    scene.runHit(hitOf(1, 'lap', star));
    frame(a, scene);
    const before = JSON.stringify(live(scene));
    a.paused = true;
    for (let i = 0; i < 400; i++) frame(a, scene);
    const after = live(scene);
    expect(after.heads).toEqual((JSON.parse(before) as Live).heads);
    expect(after.stars).toBe((JSON.parse(before) as Live).stars);
    expect(after.night).toBeCloseTo((JSON.parse(before) as Live).night, 9);
  });

  it('draws the stars of a packed road small and without their sparkle, so that they do not run together into a band; a calm road gets full ones', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.3);
    type Star = { on: boolean; dense: boolean; size: number; glow: { visible: boolean } };
    const stars = (): Star[] => (scene as unknown as { stars: { list: Star[] } }).stars.list.filter((s) => s.on);
    for (let i = 0; i < 14; i++) scene.runHit(hitOf(1, 'lap', enemy(i + 1, 'cucumber', 100 + i * 38, 45)));
    expect(stars()).toHaveLength(14);
    expect(stars().every((s) => !s.dense && s.glow.visible)).toBe(true);
    const full = (stars()[0] as Star).size;
    // More than fourteen in a third of a battle second: the next ones are small and have no sparkle behind them.
    scene.runHit(hitOf(1, 'lap', enemy(15, 'cucumber', 640, 45)));
    scene.runHit(hitOf(1, 'lap', enemy(16, 'cucumber', 600, 45)));
    const last = stars().slice(-2);
    expect(last.every((s) => s.dense && !s.glow.visible)).toBe(true);
    expect(last[0]?.size).toBeCloseTo(full * 0.6, 6);
    // The road thins out: a hit a second later is a full star again.
    advance(a, scene, 1);
    scene.runHit(hitOf(1, 'lap', enemy(17, 'cucumber', 300, 45)));
    const again = stars().filter((s) => s.dense === false && s.glow.visible);
    expect(again.length).toBeGreaterThanOrEqual(1);
    expect(again[again.length - 1]?.size).toBeCloseTo(full, 6);
  });

  it('puts a star where the enemy is drawn: a big body on the side road is pulled in from the edge', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.3);
    scene.runHit(hitOf(1, 'lap', enemy(7, 'boss_blender', 45, 300)));
    const star = starsOf(scene).find((s) => s.on);
    expect(star?.x).toBeCloseTo(bodyX(45, enemyInfo('boss_blender').size), 6);
  });

  it('is a dusk and not a night: it stays under a third of the paper so that the rings and the cats keep their colour', () => {
    expect(NIGHT_ALPHA).toBeLessThanOrEqual(0.36);
    expect(NIGHT_ALPHA).toBeGreaterThanOrEqual(0.25);
  });

  it('flashes a star on each enemy it marks, AT the enemy where the event says, and never from the arrow\'s own place', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.4);
    const head = live(scene).heads[0] as Live['heads'][number];
    const e1 = enemy(1, 'cucumber', 123, 456);
    scene.runHit(hitOf(1, 'lap', e1, 123, 456));
    const size = enemyInfo('cucumber').size;
    const s = starsOf(scene).find((x) => x.on);
    expect(s?.x).toBeCloseTo(123, 6);
    expect(s?.y).toBeCloseTo(456 - size * 0.1, 6);
    expect(Math.hypot((s as { x: number }).x - head.x, (s as { y: number }).y - head.y)).toBeGreaterThan(50);
    // An enemy the arrow passes without a mark gets nothing: no event, no star (the pool was kept for the originals).
    expect(live(scene).stars).toBe(1);
    expect(a.stage.playStep).toHaveBeenCalledTimes(1);
  });

  it('a lap that marks twenty enemies shows twenty stars, each at its enemy, and the sound climbs a step each time up to a ring', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.3);
    for (let i = 0; i < 20; i++) scene.runHit(hitOf(1, 'lap', enemy(i + 1, 'cucumber', 40 + i * 30, 45)));
    expect(live(scene).stars).toBe(20);
    const steps = a.stage.playStep.mock.calls.map((c) => c[2] as number);
    expect(steps.slice(0, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0]);
  });

  it('keeps the NEWEST stars when the tier shows fewer, the pool never grows past 44', () => {
    for (const [detail, limit] of [[0, 18], [1, 32], [2, 44]] as const) {
      const { a, scene } = setup(detail, 1200);
      advance(a, scene, 0.3);
      for (let i = 0; i < 60; i++) scene.runHit(hitOf(1, 'lap', enemy(i + 1, 'cucumber', 40 + i * 10, 45 + i)));
      expect(live(scene).stars, `tier ${detail}`).toBe(limit);
      expect(starsOf(scene).some((s) => s.on && Math.abs(s.x - (40 + 59 * 10)) < 1e-6), `tier ${detail}`).toBe(true);
      expect(starsOf(scene).length).toBeLessThanOrEqual(44);
    }
  });

  it('bursts like a star for an enemy it fells: a paper star as wide as the burst\'s radius at the enemy, and a small star on each victim', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.3);
    scene.runBurst({ runId: 1, skill: 'lap', x: 222, y: 333, radius: 90, points: [{ x: 250, y: 330 }, { x: 200, y: 340 }, { x: 240, y: 300 }] } as never);
    expect(live(scene).bursts).toBe(1);
    const b = burstsOf(scene).find((x) => x.on);
    expect(b).toMatchObject({ x: 222, y: 333, radius: 90 });
    expect(live(scene).stars).toBe(3);
    expect(a.stage.fx.shockwave).toHaveBeenCalledWith(222, 333, expect.objectContaining({ radius: 90 }));
    // A burst with no victims is still a burst.
    scene.runBurst({ runId: 1, skill: 'lap', x: 10, y: 10, radius: 90, points: [] } as never);
    expect(live(scene).bursts).toBe(2);
  });

  it('settles the night while the arrow runs, gently (never above the guide\'s 0.45), and lifts it when the arrow is done', () => {
    const { a, scene } = setup(2, 1200);
    expect(live(scene).night).toBe(0);
    const levels: number[] = [];
    const night = (scene as unknown as { night: { sprite: Sprite } }).night.sprite;
    let peak = 0;
    for (let i = 0; i < 600 && live(scene).runs + live(scene).night > 0; i++) {
      frame(a, scene, 1);
      levels.push(live(scene).night);
      peak = Math.max(peak, night.alpha);
    }
    expect(Math.max(...levels)).toBe(1);
    expect(peak).toBeCloseTo(NIGHT_ALPHA, 6);
    expect(NIGHT_ALPHA).toBeLessThanOrEqual(0.45);
    // It comes in over 0.3 s and goes out over 0.5 s: no step of a frame is more than a fifth of the whole.
    for (let i = 1; i < levels.length; i++) expect(Math.abs((levels[i] as number) - (levels[i - 1] as number))).toBeLessThan(0.2);
    expect(live(scene).night).toBe(0);
    expect(night.visible).toBe(false);
  });

  it('keeps the night for as long as either of two arrows runs, and lifts it only after the second', () => {
    const a = arena(2);
    const scene = lapScene(a.env);
    scene.cast(lapCast(a.battle.time, 1, 1200) as never);
    advance(a, scene, 0.5);
    scene.cast(lapCast(a.battle.time, 2, 300, archerUnit(7, 13)) as never);
    // The first arrow ends; the second is still running, so the night stays up.
    scene.runEnd({ runId: 1, skill: 'lap', unit: archerUnit(), hits: 4 });
    advance(a, scene, 0.5);
    expect(live(scene).heads.filter((h) => h.phase === 'run').length).toBe(1);
    expect(live(scene).night).toBe(1);
    scene.runEnd({ runId: 2, skill: 'lap', unit: archerUnit(7, 13), hits: 4 });
    advance(a, scene, 1.2);
    expect(live(scene).runs).toBe(0);
    expect(live(scene).night).toBe(0);
  });

  it('is not shorter than its floor at 3x: the night takes at least a fifth of a real second to settle and a third to lift', () => {
    const { a, scene } = setup(2, 1200);
    let framesUp = 0;
    while (live(scene).night < 1 && framesUp < 600) {
      frame(a, scene, 3);
      framesUp++;
    }
    expect(framesUp / 60).toBeGreaterThanOrEqual(0.19);
    scene.runEnd({ runId: 1, skill: 'lap', unit: archerUnit(), hits: 4 });
    let framesDown = 0;
    while (live(scene).night > 0 && framesDown < 600) {
      frame(a, scene, 3);
      framesDown++;
    }
    expect(framesDown / 60).toBeGreaterThanOrEqual(0.33);
  });

  it('is off under reduced motion: no night, no drop; the arrow, its ribbon and the stars still run', () => {
    const a = arena(2);
    a.stage.reduced = true;
    const scene = lapScene(a.env);
    scene.cast(lapCast(a.battle.time, 1, 1200) as never);
    for (let i = 0; i < 60; i++) {
      frame(a, scene, 1);
      expect(live(scene).night).toBe(0);
    }
    scene.runHit(hitOf(1, 'lap', enemy(1)));
    expect(live(scene).stars).toBe(1);
    expect(live(scene).heads[0]?.phase).toBe('run');
    expect(a.stage.shake).not.toHaveBeenCalled();
  });

  it('is cut off by victory or defeat: clear() takes the arrow, the stars and the bursts away and the night lifts by REAL time even with the clock stopped', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.5);
    scene.runHit(hitOf(1, 'lap', enemy(1, 'cucumber', 300, 45)));
    scene.runBurst({ runId: 1, skill: 'lap', x: 100, y: 100, radius: 90, points: [] } as never);
    expect(live(scene).night).toBe(1);
    scene.clear();
    expect(live(scene)).toMatchObject({ runs: 0, stars: 0, bursts: 0 });
    // The battle is over: its clock does not move again, and the night must still go.
    a.paused = true;
    for (let i = 0; i < 30; i++) frame(a, scene);
    expect(live(scene).night).toBe(0);
    expect(visibleSprites(a.front)).toBe(0);
  });

  it('a new cast after a clear brings the night back: the scene may be used again after a revive', () => {
    const { a, scene } = setup(2, 1200);
    advance(a, scene, 0.5);
    scene.clear();
    for (let i = 0; i < 30; i++) frame(a, scene);
    scene.cast(lapCast(a.battle.time, 9, 800) as never);
    advance(a, scene, 0.5);
    expect(live(scene).night).toBe(1);
    expect(live(scene).runs).toBe(1);
  });

  it('a sold archer changes nothing: the scene never reads the cat, the arrow runs on', () => {
    const { a, scene } = setup(2, 1200);
    // The cat is not on the board at all.
    a.battle.units.fill(null);
    advance(a, scene, 0.8);
    expect(live(scene).heads[0]?.phase).toBe('run');
    scene.runEnd({ runId: 1, skill: 'lap', unit: { ...archerUnit(), removed: true } as never, hits: 4 });
    advance(a, scene, 1);
    expect(live(scene).runs).toBe(0);
  });

  it('the low tier has a short ribbon and sheds no glints; the high tier does', () => {
    const glints = (detail: 0 | 1 | 2): number => {
      const { a, scene } = setup(detail, 1200);
      a.stage.fx.ps.burst.mockClear();
      advance(a, scene, 1.0);
      return a.stage.fx.ps.burst.mock.calls.length;
    };
    expect(glints(0)).toBe(0);
    expect(glints(2)).toBeGreaterThan(5);
  });

  it('moves no enemy and no cat, and destroy() frees everything it made', () => {
    const { a, scene } = setup(2, 1200);
    const e = enemy(1, 'cucumber', 300, 45);
    a.battle.enemies.push(e);
    const before = JSON.stringify(e);
    advance(a, scene, 0.6);
    scene.runHit(hitOf(1, 'lap', e));
    advance(a, scene, 1);
    expect(JSON.stringify(e)).toBe(before);
    scene.destroy();
    expect(a.front.children.length + a.back.children.length).toBe(0);
  });
});

// ── through the dispatcher ──

describe('the two scenes behind the dispatcher', () => {
  function mount() {
    const a = arena(2);
    const handlers: Array<(dt: number) => void> = [];
    const disposers: Array<() => void> = [];
    const stage = Object.assign(a.stage, {
      ctx: a.env.ctx,
      addFrame: (fn: (dt: number) => void) => handlers.push(fn),
      onDestroy: (fn: () => void) => disposers.push(fn),
    });
    const on = ((type: keyof BattleEvents, fn: never) => a.events.on(type, fn)) as unknown as Bus;
    const staging = mountSp(stage as unknown as Stage, on);
    const tick = (speed = 1): void => {
      if (!a.paused) a.battle.time += speed / 60;
      stage.now += 1 / 60;
      for (const h of handlers) h(1 / 60);
    };
    return { a, staging, tick, destroy: () => disposers.reverse().forEach((d) => d()) };
  }

  it('routes the cast, the hits, the burst and the end of a run to the scene of its skill, and only for a run whose cast was shown', () => {
    const m = mount();
    viewOf(m.a, tigerUnit());
    const charge = lazyLive<{ runs: number; stomps: number; bodies: Array<{ id: number; phase: string }> }>(m.staging, 'charge');
    m.a.events.emit('spCast', tigerCast(m.a.battle.time, 1, 700) as never);
    // A second cast in the same quarter second loses to the stage rule: its run shows nothing of its own.
    m.a.events.emit('spCast', tigerCast(m.a.battle.time, 2, 1500, tigerUnit(8, 13)) as never);
    for (let i = 0; i < 40; i++) m.tick();
    m.a.events.emit('spRunHit', hitOf(1, 'charge', enemy(1)));
    m.a.events.emit('spRunHit', hitOf(2, 'charge', enemy(2, 'cucumber', 900, 200)));
    expect(charge.live().runs).toBe(1);
    expect(charge.live().stomps).toBe(1);
    // The shown run ends: the scene hears it; the dropped run's end is not forwarded.
    m.a.events.emit('spRunEnd', { runId: 2, skill: 'charge', unit: tigerUnit(8, 13), hits: 1 });
    m.a.events.emit('spRunEnd', { runId: 1, skill: 'charge', unit: tigerUnit(), hits: 1 });
    for (let i = 0; i < 20; i++) m.tick();
    expect(charge.live().runs).toBe(1);
    expect(charge.live().bodies.find((b) => b.id === 1)?.phase).not.toBe('run');
    m.destroy();
  });

  it('a victory cuts a run off with no end event: both scenes are empty and the night lifts', () => {
    for (const end of ['victory'] as const) {
      const m = mount();
      viewOf(m.a, tigerUnit());
      const charge = lazyLive<{ runs: number; stomps: number; prints: number }>(m.staging, 'charge');
      const lap = lazyLive<{ runs: number; stars: number; night: number }>(m.staging, 'lap');
      m.a.events.emit('spCast', tigerCast(m.a.battle.time, 1, 700) as never);
      for (let i = 0; i < 20; i++) m.tick();
      m.a.stage.now += 1;
      m.a.events.emit('spCast', lapCast(m.a.battle.time, 2, 1200) as never);
      for (let i = 0; i < 40; i++) m.tick();
      m.a.events.emit('spRunHit', hitOf(2, 'lap', enemy(1)));
      expect(charge.live().runs).toBe(1);
      expect(lap.live().runs).toBe(1);
      expect(lap.live().stars).toBe(1);
      expect(end).toBe('victory');
      m.a.events.emit('victory', { stats: {} as never });
      expect(charge.live()).toMatchObject({ runs: 0, stomps: 0, prints: 0 });
      expect(lap.live()).toMatchObject({ runs: 0, stars: 0 });
      m.a.paused = true;
      for (let i = 0; i < 40; i++) m.tick();
      expect(lap.live().night).toBe(0);
      expect(visibleSprites(m.a.back, m.a.front)).toBe(0);
      m.destroy();
      expect(m.a.back.children.length + m.a.front.children.length).toBe(0);
    }
  });

  it('a defeat in the middle of a run freezes the picture with the battle clock, and a revive carries it on: body, stomps, stars, tile mark and night come back to life', () => {
    const m = mount();
    viewOf(m.a, tigerUnit());
    type ChargeLive = { runs: number; stomps: number; bodies: Array<{ id: number; phase: string; x: number; y: number }> };
    const charge = lazyLive<ChargeLive>(m.staging, 'charge');
    const lap = lazyLive<{ runs: number; stars: number; night: number; heads: Array<{ x: number; y: number }> }>(m.staging, 'lap');
    m.a.events.emit('spCast', tigerCast(m.a.battle.time, 1, 700) as never);
    for (let i = 0; i < 30; i++) m.tick();
    m.a.stage.now += 1;
    m.a.events.emit('spCast', lapCast(m.a.battle.time, 2, 1200) as never);
    for (let i = 0; i < 30; i++) m.tick();
    expect(charge.live().runs).toBe(1);
    expect(lap.live().runs).toBe(1);
    const night = lap.live().night;
    expect(night).toBeGreaterThan(0.5);
    // The defeat: the simulation's clock stands still, and so does everything the view drew for the two runs.
    m.a.events.emit('defeat', { reason: 'overrun' });
    m.a.paused = true;
    const frozen = { body: charge.live().bodies[0] as ChargeLive['bodies'][number], head: lap.live().heads[0] as { x: number; y: number } };
    for (let i = 0; i < 60; i++) m.tick();
    expect(charge.live().runs).toBe(1);
    expect(lap.live().runs).toBe(1);
    expect(charge.live().bodies[0]).toMatchObject({ x: frozen.body.x, y: frozen.body.y });
    expect(lap.live().heads[0]).toMatchObject({ x: frozen.head.x, y: frozen.head.y });
    expect(lap.live().night).toBeCloseTo(night, 6);
    // The revive: the clock runs, the run goes on, its events (a stomp, a star) still find their scene and the end of the run is heard.
    m.a.events.emit('revive', { removed: 0 });
    m.a.paused = false;
    for (let i = 0; i < 12; i++) m.tick();
    expect(charge.live().bodies[0]?.x === frozen.body.x && charge.live().bodies[0]?.y === frozen.body.y).toBe(false);
    m.a.events.emit('spRunHit', hitOf(1, 'charge', enemy(5)));
    m.a.events.emit('spRunHit', hitOf(2, 'lap', enemy(6)));
    expect(charge.live().stomps).toBe(1);
    expect(lap.live().stars).toBe(1);
    m.a.events.emit('spRunEnd', { runId: 1, skill: 'charge', unit: tigerUnit(), hits: 1 });
    m.a.events.emit('spRunEnd', { runId: 2, skill: 'lap', unit: tigerUnit(), hits: 1 });
    for (let i = 0; i < 400; i++) m.tick();
    expect(charge.live().runs).toBe(0);
    expect(lap.live().runs).toBe(0);
    expect(lap.live().night).toBe(0);
    m.destroy();
  });

  it('with skills off none of this exists', () => {
    const a = arena(2);
    a.battle.spOn = false;
    const stage = Object.assign(a.stage, { ctx: a.env.ctx, addFrame: vi.fn(), onDestroy: vi.fn() });
    expect(mountSp(stage as unknown as Stage, (() => undefined) as unknown as Bus)).toBeNull();
    expect(a.back.children.length + a.front.children.length).toBe(0);
  });
});
