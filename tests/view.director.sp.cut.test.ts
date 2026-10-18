import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined },
}));
vi.mock('@/core/assets', async (original) => {
  const { stubTex } = await import('./textureStub');
  return { ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: stubTex };
});
vi.mock('@/fx', async (original) => ({
  ...(await original<typeof import('@/fx')>()),
  fxTex: () => ({ id: 'streak', texture: Texture.WHITE, w: 256, h: 16, ax: 0, ay: 0.5 }),
}));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleApi, BattleEvents, EnemyId, EnemyState, SpCutData, UnitState } from '@/game/api';
import { PATH_LENGTH, cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import { BLINK_KEEP, GASH_KEY, LINES_LIVE, LINE_KEY, ORPHAN_REAL, TILT, afterimageTexture, makeCut, resetAfterimage } from '@/view/director/sp/cut';
import { tex } from '@/core/assets';
import type { SpEnv } from '@/view/director/sp/types';
import type { Stage } from '@/view/director/stage';

type Cast = Parameters<ReturnType<typeof makeCut>['cast']>[0];
type Live = {
  dashes: Array<{ seq: number; phase: string; k: number; x: number; y: number }>;
  lines: Array<{ uid: number; state: string; shown: boolean; orphan: boolean; casts: number[]; x: number; y: number }>;
  hops: number;
  waiting: number;
};

const FROM = 100;
const TO = 550;
const unit = (uid = 1, cell = 2): UnitState => ({ uid, id: 'w_samurai', cell }) as unknown as UnitState;

interface Scene {
  env: SpEnv;
  scene: ReturnType<typeof makeCut>;
  battle: { time: number; enemies: EnemyState[]; units: Array<UnitState | null>; events: Emitter<BattleEvents> };
  fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn>; dustPuff: ReturnType<typeof vi.fn> };
  stage: { play: ReturnType<typeof vi.fn>; later: ReturnType<typeof vi.fn>; shake: ReturnType<typeof vi.fn>; detail: 0 | 1 | 2; reduced: boolean; rules: Record<string, object> };
  front: Container;
  /** The samurai's view: a container with its art labelled `sprite`, as the field's UnitView has. */
  art: Sprite;
  enemy: (uid: number, travelled: number, id?: EnemyId) => EnemyState;
  live: () => Live;
  /** How many listeners the scene has on the battle's events right now. */
  listeners: () => number;
  /** One frame: `battleDt` seconds of the battle's clock (0 under a popup), `dt` real seconds. */
  tick: (battleDt: number, dt?: number) => void;
}

function build(detail: 0 | 1 | 2 = 1, reduced = false): Scene {
  const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn(), dustPuff: vi.fn() };
  const stage = { play: vi.fn(), later: vi.fn(), shake: vi.fn(), detail, reduced, fx, rules: { big: {}, strike: {}, zone: {} } };
  const front = new Container();
  const back = new Container();
  const events = new Emitter<BattleEvents>();
  // Count the listeners that are on: a destroyed scene must have given every one back.
  const counter = { active: 0 };
  const subscribe = events.on.bind(events) as (type: keyof BattleEvents, fn: never) => () => void;
  events.on = ((type: keyof BattleEvents, fn: never) => {
    counter.active++;
    const off = subscribe(type, fn);
    return () => {
      counter.active--;
      off();
    };
  }) as typeof events.on;
  const view = new Container();
  const art = new Sprite(Texture.WHITE);
  art.label = 'sprite';
  view.addChild(art);
  const enemies: EnemyState[] = [];
  const battle = { time: 3, enemies, units: [] as Array<UnitState | null>, events };
  battle.units[2] = unit();
  const env = {
    stage: stage as unknown as Stage,
    ctx: { layers: { fxBack: back, fxFront: front }, unitView: (uid: number) => (uid === 1 ? view : null), speed: 1 },
    battle: battle as unknown as BattleApi,
  } as unknown as SpEnv;
  const scene = makeCut(env);
  const s: Scene = {
    env,
    scene,
    battle,
    fx,
    stage,
    front,
    art,
    enemy: (uid, travelled, id = 'cucumber') => {
      const p = pathPoint(travelled);
      const e = { uid, id, travelled, x: p.x, y: p.y, angle: p.angle, hp: 10, maxHp: 10 } as unknown as EnemyState;
      enemies.push(e);
      return e;
    },
    live: () => (scene as unknown as { live(): Live }).live(),
    listeners: () => counter.active,
    tick: (battleDt, dt = battleDt) => {
      battle.time += battleDt;
      scene.update?.(dt, battleDt);
    },
  };
  return s;
}

function cut(s: Scene, cutId: number, uids: number[], over: Partial<SpCutData> = {}): Cast {
  const marks = uids.map((uid) => {
    const e = s.battle.enemies.find((x) => x.uid === uid) as EnemyState;
    return { uid, x: e.x, y: e.y };
  });
  const data: SpCutData = { cutId, anchorUid: uids[0] ?? 0, anchorPath: 325, fromPath: FROM, toPath: TO, at: s.battle.time, fuse: 1.2, marks, ...over };
  return { unit: unit(), first: false, x: cellCenterX(2), y: cellCenterY(2), skill: 'cut', data } as unknown as Cast;
}

/** The roots of the marks (each is tilted by TILT) and every child of the scene's layer. */
const layerOf = (s: Scene): Container => s.front.children[0] as Container;
const roots = (s: Scene): Container[] => layerOf(s).children.filter((c) => c instanceof Container && c.rotation === TILT) as Container[];

const open = (s: Scene, cutId: number, lines: BattleEvents['cutOpen']['lines'], at = 3): void =>
  s.battle.events.emit('cutOpen', { cutId, unit: unit(), at, lines });
const line = (uid: number, x: number, y: number, kind: 'cut' | 'moved' | 'lost' = 'cut', to = 0, toX = x, toY = y): BattleEvents['cutOpen']['lines'][number] =>
  ({ uid, kind, to, x, y, toX, toY });

describe('the samurai\'s cut: the cast', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetAfterimage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends an afterimage across the stretch and marks every enemy with a line that appears as the afterimage passes it', () => {
    const s = build(2);
    for (const [uid, t] of [[1, 160], [2, 300], [3, 480]] as const) s.enemy(uid, t);
    s.scene.cast(cut(s, 1, [1, 2, 3]));
    let live = s.live();
    expect(live.dashes).toHaveLength(1);
    expect(live.lines.map((l) => l.uid).sort()).toEqual([1, 2, 3]);
    expect(live.lines.every((l) => l.state === 'wait')).toBe(true);
    // At the cast nothing is drawn on the road yet: the afterimage has not reached the first enemy.
    s.tick(0.01);
    live = s.live();
    expect(live.lines.filter((l) => l.shown)).toHaveLength(0);
    // Enemy 1 stands 60 px into the 450 px stretch, enemy 2 200 px and enemy 3 380 px in: they show in that order.
    const order: number[] = [];
    for (let i = 0; i < 40; i++) {
      s.tick(1 / 60);
      for (const l of s.live().lines) if (l.shown && !order.includes(l.uid)) order.push(l.uid);
    }
    expect(order).toEqual([1, 2, 3]);
    expect(s.live().lines.every((l) => l.shown)).toBe(true);
    expect(s.live().waiting).toBe(1);
  });

  it('puts the line on the enemy where it is DRAWN and carries it along when the enemy walks, without moving the enemy', () => {
    const s = build(1);
    const e = s.enemy(1, 200);
    const before = { ...e };
    s.scene.cast(cut(s, 1, [1]));
    for (let i = 0; i < 30; i++) s.tick(1 / 60);
    const l0 = s.live().lines[0] as Live['lines'][number];
    expect(l0.x).toBeCloseTo(e.x, 6);
    expect(l0.y).toBeLessThan(e.y);
    const p = pathPoint(260);
    e.x = p.x;
    e.y = p.y;
    s.tick(1 / 60);
    const l1 = s.live().lines[0] as Live['lines'][number];
    expect(l1.x).toBeCloseTo(p.x, 6);
    expect(e).toMatchObject({ x: p.x, y: p.y, travelled: 200, hp: 10 });
    expect(before.hp).toBe(10);
  });

  it('crosses the stretch over the seam of the loop: the afterimage is where the road is, whatever the stretch', () => {
    const s = build(1);
    s.enemy(1, PATH_LENGTH - 40);
    s.scene.cast(cut(s, 1, [1], { fromPath: PATH_LENGTH - 225, toPath: 225 }));
    for (let i = 0; i < 12; i++) s.tick(1 / 60);
    const d = s.live().dashes[0] as Live['dashes'][number];
    expect(d.phase).toBe('run');
    // Halfway across (k about .6 by the ease) the head is on the road, not outside it.
    const expected = pathPoint(PATH_LENGTH - 225 + 450 * Math.sin((d.k * Math.PI) / 2));
    expect(d.x).toBeCloseTo(expected.x, 4);
    expect(d.y).toBeCloseTo(expected.y, 4);
  });

  it('is timed by the battle\'s clock: the afterimage holds still under a popup however long real time goes on', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    s.tick(0.05);
    const k = (s.live().dashes[0] as Live['dashes'][number]).k;
    for (let i = 0; i < 300; i++) s.tick(0, 1 / 60);
    expect((s.live().dashes[0] as Live['dashes'][number]).k).toBeCloseTo(k, 9);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });

  it('keeps step with a faster game but not below its real floor: at 3x the crossing is not over in a third of its time', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    // 0.26 battle seconds is through after 0.087 real ones at 3x; the floor (0.15 s) says the crossing is not.
    for (let t = 0; t < 0.1; t += 1 / 60) s.tick(3 / 60, 1 / 60);
    expect((s.live().dashes[0] as Live['dashes'][number]).phase).toBe('run');
    for (let t = 0; t < 0.12; t += 1 / 60) s.tick(3 / 60, 1 / 60);
    expect((s.live().dashes[0] as Live['dashes'][number]).phase).not.toBe('run');
  });

  it('blinks the samurai\'s art on its tile while the afterimage runs and gives it back whole', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    for (let i = 0; i < 8; i++) s.tick(1 / 60);
    expect(s.art.alpha).toBeLessThan(0.8);
    expect(s.art.alpha).toBeGreaterThanOrEqual(BLINK_KEEP - 1e-9);
    for (let i = 0; i < 90; i++) s.tick(1 / 60);
    expect(s.art.alpha).toBe(1);
  });

  it('gives the art back when the scene is cleared in the middle of the blink, and never leaves a dimmed cat behind', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    for (let i = 0; i < 8; i++) s.tick(1 / 60);
    expect(s.art.alpha).toBeLessThan(1);
    s.scene.clear();
    expect(s.art.alpha).toBe(1);
  });

  it('plays the cast\'s sound through the stage\'s rule and puffs dust at the tile', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    expect(s.stage.play).toHaveBeenCalledWith(s.stage.rules.big, 'atk_w_samurai', expect.any(Number), expect.any(Number), expect.any(Number));
    expect(s.fx.dustPuff).toHaveBeenCalledTimes(1);
  });
});

describe('the samurai\'s cut: the lines open', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetAfterimage();
  });
  afterEach(() => vi.unstubAllGlobals());

  const marked = (s: Scene, n: number): number[] => {
    const uids: number[] = [];
    for (let i = 0; i < n; i++) {
      s.enemy(i + 1, 150 + i * 30);
      uids.push(i + 1);
    }
    s.scene.cast(cut(s, 1, uids));
    for (let i = 0; i < 40; i++) s.tick(1 / 60);
    return uids;
  };

  it('tightens its lines by the battle clock: under a popup a line stands as it was, and it goes on tightening after', () => {
    const s = build(2);
    s.enemy(1, 300);
    s.scene.cast(cut(s, 1, [1]));
    // 0.95 s of the 1.2 s fuse: inside the last quarter, where the lines tighten.
    for (let i = 0; i < 57; i++) s.tick(1 / 60);
    const look = (): number[] => roots(s).flatMap((r) => (r.children as Sprite[]).filter((c) => c instanceof Sprite).map((c) => c.scale.y));
    const before = look();
    expect(before.length).toBeGreaterThan(0);
    for (let i = 0; i < 180; i++) s.tick(0, 1 / 60);
    expect(look()).toEqual(before);
    for (let i = 0; i < 9; i++) s.tick(1 / 60);
    expect(look()).not.toEqual(before);
  });

  it('draws a waiting line as the owner\'s painted line (and nothing else of its own), a little bigger as the click comes, with the gash held back', () => {
    const s = build(2);
    s.enemy(1, 300);
    s.scene.cast(cut(s, 1, [1]));
    for (let i = 0; i < 20; i++) s.tick(1 / 60);
    const root = roots(s).find((c) => c.visible) as Container;
    const [wait, gash] = root.children as Sprite[];
    expect(wait?.texture).toBe(tex(LINE_KEY));
    expect(gash?.texture).toBe(tex(GASH_KEY));
    expect(wait?.visible).toBe(true);
    expect(gash?.visible).toBe(false);
    const early = (wait as Sprite).scale.y;
    // Along the line's own axis (the root is tilted), its height following the file's proportions.
    expect((wait as Sprite).scale.x).toBeGreaterThan(0);
    for (let i = 0; i < 40; i++) s.tick(1 / 60);
    expect((wait as Sprite).scale.y).toBeGreaterThan(early);
  });

  it('opens a line into its gash: the slit flares, the painted gash grows out of it and the line gives way, then both are gone', () => {
    const s = build(2);
    const uids = marked(s, 1);
    const e = s.battle.enemies[0] as EnemyState;
    open(s, 1, [line(uids[0] as number, e.x, e.y)]);
    const root = roots(s).find((c) => c.visible) as Container;
    const [wait, gash] = root.children as Sprite[];
    const seen: Array<{ line: number; gash: number; gashH: number }> = [];
    for (let i = 0; i < 40; i++) {
      s.tick(1 / 60);
      seen.push({ line: wait?.visible ? wait.alpha : 0, gash: gash?.visible ? gash.alpha : 0, gashH: gash?.visible ? gash.scale.y / gash.scale.x : 0 });
    }
    // The gash fills in while the line fades out, and its height grows from a slit to its full picture.
    const mid = seen.find((x) => x.gash > 0.3) as { line: number; gash: number; gashH: number };
    expect(mid).toBeDefined();
    expect(mid.gashH).toBeLessThan(1);
    expect(Math.max(...seen.map((x) => x.gashH))).toBeCloseTo(1, 1);
    expect(seen.some((x) => x.line > 0.5)).toBe(true);
    expect(seen[seen.length - 1]?.line).toBe(0);
    // And it is over after its time.
    for (let i = 0; i < 120; i++) s.tick(1 / 60);
    expect(s.live().lines).toHaveLength(0);
    expect(gash?.visible).toBe(false);
  });

  it('opens EVERY line in the same frame, each at its enemy, and the tile clicks once', () => {
    const s = build(1);
    const uids = marked(s, 6);
    const lines = uids.map((uid) => {
      const e = s.battle.enemies.find((x) => x.uid === uid) as EnemyState;
      return line(uid, e.x, e.y);
    });
    open(s, 1, lines);
    const live = s.live();
    expect(live.lines).toHaveLength(6);
    expect(live.lines.every((l) => l.state === 'open')).toBe(true);
    expect(live.waiting).toBe(0);
    // The sheath click: a ring at the samurai's tile and its sound, once.
    expect(s.fx.shockwave).toHaveBeenCalledTimes(1);
    expect(s.fx.shockwave.mock.calls[0]?.[0]).toBe(cellCenterX(2));
    expect(s.stage.play.mock.calls.filter((c) => c[1] === 'imp_w_samurai')).toHaveLength(1);
  });

  it('gapes, holds and is gone: nothing of it is left after its time, and the same pieces serve the next cut', () => {
    const s = build(1);
    const uids = marked(s, 4);
    const e0 = s.battle.enemies[0] as EnemyState;
    open(s, 1, uids.map((u) => line(u, e0.x, e0.y)));
    for (let i = 0; i < 90; i++) s.tick(1 / 60);
    expect(s.live().lines).toHaveLength(0);
    const kids = s.front.children.length;
    for (let n = 2; n < 20; n++) {
      s.scene.cast(cut(s, n, uids));
      for (let i = 0; i < 20; i++) s.tick(1 / 60);
      open(s, n, uids.map((u) => line(u, e0.x, e0.y)));
      for (let i = 0; i < 90; i++) s.tick(1 / 60);
    }
    expect(s.front.children.length).toBe(kids);
  });

  it('shows a `moved` line as a comet from the dead enemy\'s place to the neighbour, which is cut; the dead one\'s line goes out', () => {
    const s = build(1);
    marked(s, 3);
    const [a, b] = s.battle.enemies as [EnemyState, EnemyState];
    // Enemy 1 dies: its line hangs on where it died.
    s.battle.enemies.splice(0, 1);
    for (let i = 0; i < 5; i++) s.tick(1 / 60);
    const hung = s.live().lines.find((l) => l.uid === 1) as Live['lines'][number];
    expect(hung.orphan).toBe(true);
    expect(hung.x).toBeCloseTo(a.x, 4);
    open(s, 1, [line(1, a.x, a.y, 'moved', 2, b.x, b.y), line(2, b.x, b.y), line(3, b.x + 30, b.y)]);
    const live = s.live();
    expect(live.hops).toBe(1);
    // Two cuts landed on enemy 2's place (its own and the one that moved to it): both are drawn; the dead one's old line has gone out.
    expect(live.lines.filter((l) => l.state === 'open')).toHaveLength(3);
    expect(live.lines.find((l) => l.uid === 1)?.state).toBe('out');
  });

  it('lets a `lost` line fizzle where it hung: no gash, a puff, and the line goes out', () => {
    const s = build(1);
    marked(s, 2);
    const a = s.battle.enemies[0] as EnemyState;
    s.battle.enemies.splice(0, 1);
    s.tick(1 / 60);
    s.fx.ps.burst.mockClear();
    open(s, 1, [line(1, a.x, a.y, 'lost'), line(2, (s.battle.enemies[0] as EnemyState).x, (s.battle.enemies[0] as EnemyState).y)]);
    const live = s.live();
    expect(live.lines.filter((l) => l.state === 'open')).toHaveLength(1);
    expect(live.lines.find((l) => l.uid === 1)?.state).toBe('out');
    expect(s.fx.ps.burst.mock.calls.some((c) => c[1] === a.x && c[2] === a.y)).toBe(true);
    for (let i = 0; i < 60; i++) s.tick(1 / 60);
    expect(s.live().lines).toHaveLength(0);
  });

  it('lets a line whose enemy is gone hang on for at most ORPHAN_REAL real seconds, even while the battle clock stands still', () => {
    const s = build(1);
    marked(s, 2);
    s.battle.enemies.splice(0, 1);
    for (let t = 0; t < ORPHAN_REAL - 0.2; t += 1 / 60) s.tick(0, 1 / 60);
    expect(s.live().lines.find((l) => l.uid === 1)?.state).toBe('wait');
    for (let t = 0; t < 0.4; t += 1 / 60) s.tick(0, 1 / 60);
    expect(s.live().lines.find((l) => l.uid === 1)?.state ?? 'gone').not.toBe('wait');
  });

  it('pairs a cut with its cast by cutId, in whatever order two samurai\'s lines open, and ignores a cut that was not shown', () => {
    const s = build(1);
    for (let i = 0; i < 4; i++) s.enemy(i + 1, 150 + i * 40);
    s.scene.cast(cut(s, 7, [1, 2]));
    s.scene.cast(cut(s, 8, [3, 4]));
    for (let i = 0; i < 40; i++) s.tick(1 / 60);
    const at = (uid: number): BattleEvents['cutOpen']['lines'][number] => {
      const e = s.battle.enemies.find((x) => x.uid === uid) as EnemyState;
      return line(uid, e.x, e.y);
    };
    // A cut whose cast lost the stage rule: nothing to open, nothing thrown.
    expect(() => open(s, 99, [at(1)])).not.toThrow();
    expect(s.live().lines.every((l) => l.state === 'wait')).toBe(true);
    open(s, 8, [at(3), at(4)]);
    expect(s.live().lines.filter((l) => l.state === 'open').map((l) => l.uid).sort()).toEqual([3, 4]);
    expect(s.live().lines.filter((l) => l.state === 'wait').map((l) => l.uid).sort()).toEqual([1, 2]);
    expect(s.live().waiting).toBe(1);
    open(s, 7, [at(1), at(2)]);
    expect(s.live().lines.every((l) => l.state === 'open')).toBe(true);
    expect(s.live().waiting).toBe(0);
  });

  it('draws ONE line on an enemy two samurai marked, and both cuts open a gash', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    s.scene.cast(cut(s, 2, [1]));
    for (let i = 0; i < 40; i++) s.tick(1 / 60);
    let live = s.live();
    expect(live.lines).toHaveLength(1);
    expect(live.lines[0]?.casts).toEqual([1, 2]);
    const e = s.battle.enemies[0] as EnemyState;
    open(s, 1, [line(1, e.x, e.y)]);
    live = s.live();
    // The shared line stays for the cast that is left; this cut got a gash of its own.
    expect(live.lines.filter((l) => l.state === 'wait')).toHaveLength(1);
    expect(live.lines.filter((l) => l.state === 'open')).toHaveLength(1);
    open(s, 2, [line(1, e.x, e.y)]);
    live = s.live();
    expect(live.lines.filter((l) => l.state === 'wait')).toHaveLength(0);
    expect(live.lines.filter((l) => l.state === 'open')).toHaveLength(2);
  });

  it('still opens a cut whose lines were cleared by a defeat, once a revive lets the simulation go on, from the event\'s own numbers', () => {
    const s = build(1);
    const uids = marked(s, 3);
    s.scene.clear();
    expect(s.live().lines).toHaveLength(0);
    const e = s.battle.enemies[0] as EnemyState;
    open(s, 1, uids.map((u) => line(u, e.x, e.y)));
    expect(s.live().lines.filter((l) => l.state === 'open')).toHaveLength(3);
  });

  it('cuts the lines of a cut at once and can be used again after', () => {
    const s = build(1);
    marked(s, 5);
    s.scene.clear();
    for (const c of s.front.children) {
      for (const k of (c as Container).children ?? []) expect(k.visible).toBe(false);
    }
    expect(s.live()).toMatchObject({ dashes: [], lines: [], hops: 0 });
    s.enemy(20, 200);
    s.scene.cast(cut(s, 5, [20]));
    expect(s.live().lines).toHaveLength(1);
  });

  it('draws what it is told from the events and the public enemy list alone: no enemy is moved or changed', () => {
    const s = build(1);
    const uids = marked(s, 4);
    const snap = JSON.stringify(s.battle.enemies);
    open(s, 1, uids.map((u) => line(u, 0, 0)));
    for (let i = 0; i < 90; i++) s.tick(1 / 60);
    expect(JSON.stringify(s.battle.enemies)).toBe(snap);
  });

  it('takes no click at a tile the samurai has left (sold): the cut still opens', () => {
    const s = build(1);
    const uids = marked(s, 2);
    s.battle.units[2] = null;
    const e = s.battle.enemies[0] as EnemyState;
    open(s, 1, uids.map((u) => line(u, e.x, e.y)));
    expect(s.fx.shockwave).not.toHaveBeenCalled();
    expect(s.live().lines.filter((l) => l.state === 'open')).toHaveLength(2);
  });
});

describe('the samurai\'s cut: reduced motion, the low tier and the pools', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetAfterimage();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('under reduced motion the afterimage does not move (no head, the lines are there at once), the tile does not blink, and the gash opens already open without sparks', () => {
    const s = build(1, true);
    s.enemy(1, 200);
    s.enemy(2, 260);
    s.scene.cast(cut(s, 1, [1, 2]));
    s.tick(1 / 60);
    const live = s.live();
    expect(live.dashes[0]?.k).toBe(1);
    expect(live.lines.every((l) => l.shown)).toBe(true);
    expect(s.art.alpha).toBe(1);
    const e = s.battle.enemies[0] as EnemyState;
    s.fx.ps.burst.mockClear();
    open(s, 1, [line(1, e.x, e.y)]);
    expect(s.fx.ps.burst).not.toHaveBeenCalled();
    s.tick(1 / 60);
    const root = roots(s).find((c) => c.visible) as Container;
    const [wait, gash] = root.children as Sprite[];
    // The painted gash is open at its full height from the first frame (no growing), and the waiting line has gone.
    expect(gash?.visible).toBe(true);
    expect(gash?.scale.y).toBeCloseTo(gash?.scale.x ?? 0, 9);
    expect(wait?.visible).toBe(false);
  });

  it('on the low tier the open throws no sparks, the afterimage has no ink shadow, and fewer lines are kept', () => {
    const s = build(0);
    for (let i = 0; i < 30; i++) s.enemy(i + 1, 150 + i * 30);
    s.scene.cast(cut(s, 1, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    for (let i = 0; i < 40; i++) s.tick(1 / 60);
    s.fx.ps.burst.mockClear();
    const e = s.battle.enemies[0] as EnemyState;
    open(s, 1, [line(1, e.x, e.y)]);
    expect(s.fx.ps.burst).not.toHaveBeenCalled();
    // A third cast of ten marks on the low tier keeps at most LINES_LIVE[0] lines alive: the oldest give way.
    for (let n = 2; n <= 3; n++) {
      s.scene.cast(cut(s, n, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((u) => u + 10 * (n - 1))));
    }
    expect(LINES_LIVE[0]).toBe(12);
    expect(s.live().lines.length).toBeLessThanOrEqual(LINES_LIVE[0] + 1);
  });

  it('never grows past its pools over many casts at the highest tier', () => {
    const s = build(2);
    for (let i = 0; i < 12; i++) s.enemy(i + 1, 150 + i * 28);
    const uids = Array.from({ length: 10 }, (_, i) => i + 1);
    for (let n = 1; n <= 40; n++) {
      s.scene.cast(cut(s, n, uids));
      for (let i = 0; i < 10; i++) s.tick(1 / 60);
      if (n % 2 === 0) open(s, n, uids.map((u) => line(u, 200, 40)));
    }
    // At most three afterimages (head + ribbon each) and 36 lines (a root each) and 12 comets.
    expect(layerOf(s).children.length).toBeLessThanOrEqual(3 * 2 + 36 + 12);
    expect(s.live().lines.length).toBeLessThanOrEqual(36);
  });

  it('destroys what it made and releases its listener', () => {
    const s = build(1);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    s.tick(1 / 60);
    expect(s.listeners()).toBe(1);
    s.scene.destroy();
    expect(s.front.children).toHaveLength(0);
    // The listener is given back, and an event after destroy does nothing and throws nothing.
    expect(s.listeners()).toBe(0);
    expect(() => open(s, 1, [line(1, 0, 0)])).not.toThrow();
    expect(s.live().lines).toHaveLength(0);
  });
});

describe('the afterimage\'s picture', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is baked once from the art, and is null (the cat is drawn pale instead) when there is nothing to bake from', () => {
    resetAfterimage();
    // No document at all: nothing to paint on.
    expect(afterimageTexture(Texture.WHITE)).toBeNull();
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ctx };
    const create = vi.fn(() => canvas);
    vi.stubGlobal('document', { createElement: create });
    const art = { source: { resource: {}, resolution: 2 }, width: 100, height: 120 } as unknown as Texture;
    const a = afterimageTexture(art);
    const b = afterimageTexture(art);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(create).toHaveBeenCalledTimes(1);
    // The canvas is painted at the picture's own pixels (the texture's size in design px times its resolution).
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(240);
    resetAfterimage();
  });
});

describe('the samurai\'s cut: the view fails alone', () => {
  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
    resetAfterimage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a throw in its own `cutOpen` listener is logged and does not unwind into the simulation that emitted it; the scene then shows nothing', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const s = build(2);
    s.enemy(1, 200);
    s.scene.cast(cut(s, 1, [1]));
    // The sheath click is the last thing `onOpen` does: make it throw after the lines have opened.
    s.fx.shockwave.mockImplementation(() => {
      throw new Error('no texture');
    });
    expect(() => open(s, 1, [line(1, 10, 20)])).not.toThrow();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('[skills] cut open failed');
    // It emptied itself: nothing on screen, and a later cast or frame draws nothing (and throws nothing).
    expect(s.live().lines).toHaveLength(0);
    expect(s.live().dashes).toHaveLength(0);
    s.enemy(2, 300);
    expect(() => s.scene.cast(cut(s, 2, [2]))).not.toThrow();
    s.tick(0.1);
    expect(s.live().dashes).toHaveLength(0);
    expect(s.live().lines).toHaveLength(0);
    // The listener is still given back at the end.
    s.scene.destroy();
    expect(s.listeners()).toBe(0);
  });
});
