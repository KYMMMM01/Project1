import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

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
  fxTex: () => ({ id: 'streak', texture: Texture.WHITE, w: 256, h: 16, ax: 0, ay: 0.5 }),
}));

// The dispatcher is tested with stand-ins for what it hands the casts to: the scenes and the intro (a name bubble needs fonts).
const spies = vi.hoisted(() => ({
  intro: { first: vi.fn(), update: vi.fn(), clear: vi.fn(), destroy: vi.fn() },
  scene: { cast: vi.fn(), runHit: vi.fn(), runBurst: vi.fn(), runEnd: vi.fn(), bite: vi.fn(), update: vi.fn(), clear: vi.fn(), destroy: vi.fn() },
  made: [] as string[],
  /** Skills whose factory should throw, and how many times each factory was asked. */
  fail: new Set<string>(),
  attempts: {} as Record<string, number>,
}));
vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = spies.intro.first;
    update = spies.intro.update;
    clear = spies.intro.clear;
    destroy = spies.intro.destroy;
  },
}));
vi.mock('@/view/director/sp/scenes', () => ({
  SCENES: {
    shove: () => {
      spies.made.push('shove');
      return { ...spies.scene };
    },
    charge: () => {
      spies.attempts.charge = (spies.attempts.charge ?? 0) + 1;
      if (spies.fail.has('charge')) throw new Error('no texture');
      spies.made.push('charge');
      // The tiger's scene has a run in flight that the simulation carries on after a revive: a defeat does not clear it.
      return { ...spies.scene, survivesDefeat: true };
    },
    wanted: () => {
      spies.made.push('wanted');
      return { ...spies.scene };
    },
  },
}));

import { Emitter } from '@/core/events';
import { Trauma } from '@/fx';
import { setFxSettings } from '@/fx/settings';
import type { BattleApi, BattleEvents, EnemyId, EnemyState, SpCastEvent, SpShoved, UnitState } from '@/game/api';
import { PATH_LENGTH, pathPoint } from '@/game/geometry';
import { mountSp } from '@/view/director/sp';
import { Age, spanK } from '@/view/director/sp/span';
import { CUTIN_QUEUE, STAGE_GAP, StageRule, bubbleLift, introFor } from '@/view/director/sp/stageRule';
import { pointsAlong, roadInReach, runHolds, runsAround } from '@/view/director/sp/road';
import { makeShove } from '@/view/director/sp/shove';
import type { SpEnv } from '@/view/director/sp/types';
import type { Bus, Stage } from '@/view/director/stage';
import { Gate } from '@/view/director/stage';

describe('the stage rule', () => {
  it('lets one cast effect through per quarter second of real time and drops the ones inside it', () => {
    expect(STAGE_GAP).toBe(0.25);
    const r = new StageRule();
    expect(r.admit(10, false)).toBe(true);
    expect(r.admit(10.1, false)).toBe(false);
    expect(r.admit(10.249, false)).toBe(false);
    expect(r.admit(10.25, false)).toBe(true);
    expect(r.admit(10.3, false)).toBe(false);
    expect(r.shown).toBe(2);
    expect(r.lost).toBe(3);
  });

  it('counts the gap from the last effect that was SHOWN: a cast that lost takes no slot', () => {
    const r = new StageRule();
    r.admit(0, false);
    r.admit(0.2, false);
    // 0.2 lost, so 0.3 is 0.3 s after the shown one at 0 and passes.
    expect(r.admit(0.3, false)).toBe(true);
  });

  it('never drops the first cast of a skill, whatever was shown a moment ago, and it takes the slot like any shown cast', () => {
    const r = new StageRule();
    expect(r.admit(5, false)).toBe(true);
    expect(r.admit(5.01, true)).toBe(true);
    expect(r.admit(5.1, false)).toBe(false);
    expect(r.admit(5.27, false)).toBe(true);
    expect(r.admit(5.28, true)).toBe(true);
  });

  it('at 3x speed shows the same number of effects per real second as at 1x, however many casts come', () => {
    const r = new StageRule();
    let shown = 0;
    // Twelve skill cats casting every 0.5 s of game time each, at 3x: 72 casts a real second, one every 1/72 s.
    for (let t = 0; t < 2; t += 1 / 72) if (r.admit(t, false)) shown++;
    expect(shown).toBeLessThanOrEqual(Math.ceil(2 / STAGE_GAP) + 1);
    expect(shown).toBeGreaterThanOrEqual(2 / STAGE_GAP - 1);
  });

  it('plans the first cast\'s extras: the cut-in for rank 5 (the banner says the name, so no bubble on top of it), the bubble for the rest', () => {
    expect(introFor(3, 0)).toEqual({ bubble: true, cutIn: false });
    expect(introFor(4, 0)).toEqual({ bubble: true, cutIn: false });
    expect(introFor(5, 0)).toEqual({ bubble: false, cutIn: true });
    expect(introFor(undefined, 0)).toEqual({ bubble: true, cutIn: false });
  });

  it('lets a rank 5 cut-in wait behind the ones already queued, and drops it for the bubble only when the queue is full', () => {
    expect(introFor(5, CUTIN_QUEUE - 1)).toEqual({ bubble: false, cutIn: true });
    expect(introFor(5, CUTIN_QUEUE)).toEqual({ bubble: true, cutIn: false });
    expect(introFor(3, CUTIN_QUEUE)).toEqual({ bubble: true, cutIn: false });
  });

  it('stacks name bubbles that would cover one another (two first casts in one moment by cats side by side), and only those', () => {
    const h = 56;
    expect(bubbleLift([], 100, 130, h)).toBe(0);
    // A second bubble that overlaps the first goes one label higher; a third that overlaps both goes higher than the highest.
    const a = { x: 100, w: 130, lift: 0, k: 0.1 };
    expect(bubbleLift([a], 170, 250, h)).toBe(h + 6);
    const b = { x: 170, w: 250, lift: h + 6, k: 0.1 };
    expect(bubbleLift([a, b], 240, 190, h)).toBe(2 * (h + 6));
    // Far apart (or just touching): no lift.
    expect(bubbleLift([a], 400, 130, h)).toBe(0);
    expect(bubbleLift([a], 100 + 130, 130, h)).toBe(0);
    // A bubble that has begun to fade no longer holds the room.
    expect(bubbleLift([{ ...a, k: 0.8 }], 120, 130, h)).toBe(0);
  });
});

describe('how long a picture lives', () => {
  it('is over when both its battle seconds and its real floor are: 0.4 s at 1x, but not under a third of a second\'s floor at 3x', () => {
    const life = 0.4;
    const floor = 0.2;
    // 1x: real and battle time go together.
    expect(spanK(0.2, 0.2, life, floor)).toBeCloseTo(0.5, 9);
    expect(spanK(0.4, 0.4, life, floor)).toBe(1);
    // 3x: the battle clock is through after 0.133 s real, but the floor says 0.2 s.
    expect(spanK(0.4, 0.133, life, floor)).toBeLessThan(1);
    expect(spanK(0.6, 0.2, life, floor)).toBe(1);
  });

  it('stands still under a popup: real time passes, the battle clock does not, and the picture does not move on', () => {
    const a = new Age();
    a.tick(0.1, 0.1);
    const k = a.k(0.4, 0.2);
    for (let i = 0; i < 100; i++) a.tick(0, 1 / 60);
    expect(a.k(0.4, 0.2)).toBeCloseTo(k, 9);
    expect(a.k(0.4, 0.2)).toBeLessThan(1);
  });

  it('never gives a progress outside 0..1', () => {
    expect(spanK(-1, 5, 0.4, 0.2)).toBe(0);
    expect(spanK(9, 9, 0.4, 0.2)).toBe(1);
  });
});

describe('the road inside a cat\'s reach', () => {
  const tileX = 90 + 54;
  const tileY = 90 + 48;

  it('is one stretch round the corner for a cat in the board\'s corner, every sample inside its reach', () => {
    const runs = roadInReach(tileX, tileY, 220);
    expect(runs.length).toBe(1);
    const run = runs[0] as { start: number; length: number };
    expect(run.length).toBeGreaterThan(300);
    expect(run.length).toBeLessThan(700);
    for (let t = 0; t <= 1; t += 0.05) {
      const p = pathPoint(run.start + run.length * t);
      expect(Math.hypot(p.x - tileX, p.y - tileY)).toBeLessThanOrEqual(220 + 12);
    }
  });

  it('is the whole lap when everything is in reach and nothing when nothing is', () => {
    expect(roadInReach(360, 330, 2000)).toEqual([{ start: 0, length: PATH_LENGTH }]);
    expect(roadInReach(360, 330, 20)).toEqual([]);
  });

  it('keeps a stretch that crosses the start of the loop in one piece', () => {
    // The loop starts at the top left; a point just under it has the stretch on both sides of the seam.
    const runs = roadInReach(60, 70, 120);
    expect(runs.length).toBe(1);
    const run = runs[0] as { start: number; length: number };
    expect(run.start + run.length).toBeGreaterThan(PATH_LENGTH * 0.99);
  });

  it('cuts a long stretch down to the part something stands on, with a margin, and leaves out a stretch with nothing on it', () => {
    // A cat in the board's corner reaches the left road, the corner and the start of the top road as ONE stretch round the seam.
    const [run] = roadInReach(tileX, tileY, 260, 10);
    expect(run).toBeDefined();
    const whole = run as { start: number; length: number };
    // Enemies on the top road only (road coordinates 110 to 250 are after the seam, and inside the stretch: it ends near 300, so the margin fits).
    const coords = [110, 160, 250];
    const [cut] = runsAround([whole], coords, 44);
    expect(cut).toBeDefined();
    const part = cut as { start: number; length: number };
    expect(part.length).toBeCloseTo(250 - 110 + 88, 6);
    expect(part.length).toBeLessThan(whole.length - 100);
    // It is the stretch's own piece: every point of it is in the whole, and it begins 44 px before the first enemy.
    expect(runHolds(whole, part.start)).toBe(true);
    expect(runHolds(whole, part.start + part.length)).toBe(true);
    expect(((part.start - (110 - 44)) % PATH_LENGTH + PATH_LENGTH) % PATH_LENGTH).toBeCloseTo(0, 6);
    // Nobody on it, or nobody known: nothing to draw; an unknown enemy beside a known one changes nothing.
    expect(runsAround([whole], [PATH_LENGTH / 2], 44)).toEqual([]);
    expect(runsAround([whole], [undefined, undefined], 44)).toEqual([]);
    expect(runsAround([whole], [undefined, ...coords], 44)).toEqual([part]);
    // The margin never reaches past the stretch.
    const wide = runsAround([whole], coords, 5000)[0] as { start: number; length: number };
    expect(wide.length).toBeCloseTo(whole.length, 6);
    // Two stretches: only the one with an enemy on it is kept.
    const other = { start: 900, length: 200 };
    expect(runsAround([other, whole], coords, 44)).toHaveLength(1);
  });

  it('spreads points evenly along a stretch, both ends included', () => {
    const run = { start: 100, length: 400 };
    const pts = pointsAlong(run, 5);
    expect(pts).toHaveLength(5);
    const a = pathPoint(100);
    const b = pathPoint(500);
    expect(pts[0]).toMatchObject({ x: a.x, y: a.y });
    expect(pts[4]).toMatchObject({ x: b.x, y: b.y });
    expect(pointsAlong(run, 1)).toHaveLength(1);
  });
});

// ── the dispatcher ──

interface Harness {
  battle: { spOn: boolean; time: number; enemies: EnemyState[]; events: Emitter<BattleEvents> };
  stage: Stage;
  on: Bus;
  handlers: number;
  frames: Array<(dt: number) => void>;
  destroy: () => void;
}

function harness(spOn: boolean): Harness {
  const events = new Emitter<BattleEvents>();
  const h = { handlers: 0 } as Harness;
  const frames: Array<(dt: number) => void> = [];
  const disposers: Array<() => void> = [];
  h.battle = { spOn, time: 0, enemies: [], events };
  h.stage = {
    now: 0,
    ctx: { battle: h.battle },
    addFrame: (fn: (dt: number) => void) => frames.push(fn),
    onDestroy: (fn: () => void) => disposers.push(fn),
  } as unknown as Stage;
  h.on = ((type: keyof BattleEvents, fn: never) => {
    h.handlers++;
    events.on(type, fn);
  }) as unknown as Bus;
  h.frames = frames;
  h.destroy = () => {
    for (let i = disposers.length - 1; i >= 0; i--) (disposers[i] as () => void)();
  };
  return h;
}

const unit = (): UnitState => ({ uid: 1, id: 'w_viking', cell: 0 }) as unknown as UnitState;
const cast = (skill: string, first: boolean, data: object = {}): SpCastEvent => ({ unit: unit(), first, x: 0, y: 0, skill, data }) as unknown as SpCastEvent;

describe('the skills\' dispatcher', () => {
  beforeEach(() => {
    // `debugExpose` (the QA hooks) writes on `window.__dbg`.
    vi.stubGlobal('window', { __dbg: {} });
    for (const group of [spies.intro, spies.scene]) for (const fn of Object.values(group)) fn.mockClear();
    spies.made.length = 0;
    spies.fail.clear();
    spies.attempts = {};
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is not there in a battle without skills: nothing is made, no event is listened to', () => {
    const h = harness(false);
    expect(mountSp(h.stage, h.on)).toBeNull();
    expect(h.handlers).toBe(0);
    expect(h.frames).toHaveLength(0);
    expect(spies.made).toEqual([]);
    h.battle.events.emit('spCast', cast('shove', true));
    expect(spies.scene.cast).not.toHaveBeenCalled();
    expect(spies.intro.first).not.toHaveBeenCalled();
  });

  it('builds a scene on the first cast of its skill and not before, and hands each cast to the scene of its skill, once the stage rule lets it through', () => {
    const h = harness(true);
    const staging = mountSp(h.stage, h.on);
    // Nothing is built at mount: three scenes (and in the real registry twelve) would be empty layers, pools and listeners on every board.
    expect(spies.made).toEqual([]);
    expect(Object.keys(staging?.scenes ?? {})).toEqual([]);
    const e = cast('shove', false);
    h.battle.events.emit('spCast', e);
    expect(spies.made).toEqual(['shove']);
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    expect(spies.scene.cast).toHaveBeenCalledWith(e);
    // A second cast of the same skill makes nothing more; another skill makes its own, and only its own.
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('shove', false));
    expect(spies.made).toEqual(['shove']);
    h.battle.events.emit('spCast', cast('wanted', true));
    expect(spies.made).toEqual(['shove', 'wanted']);
    expect(Object.keys(staging?.scenes ?? {}).sort()).toEqual(['shove', 'wanted']);
  });

  it('builds the scene of a cast that LOST the stage rule too (a scene that follows the simulation\'s state must exist), and the lost cast shows nothing', () => {
    const h = harness(true);
    const staging = mountSp(h.stage, h.on);
    h.stage.now = 4;
    h.battle.events.emit('spCast', cast('shove', true));
    h.stage.now = 4.05;
    // Inside the gap and not marked first: the charge scene is built (the cast is the first this director sees of it) and shows nothing.
    h.battle.events.emit('spCast', cast('charge', false, { runId: 1 }));
    expect(spies.made).toEqual(['shove', 'charge']);
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    expect(staging?.rule.lost).toBe(1);
  });

  it('a factory that throws costs its skill the picture and nothing else: logged once, not asked again, no slot spent, the intro still shown', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness(true);
    const staging = mountSp(h.stage, h.on);
    spies.fail.add('charge');
    expect(() => h.battle.events.emit('spCast', cast('charge', true, { runId: 1 }))).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
    expect(spies.scene.cast).not.toHaveBeenCalled();
    expect(staging?.rule.shown).toBe(0);
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('charge', false, { runId: 2 }));
    expect(spies.attempts.charge).toBe(1);
    expect(err).toHaveBeenCalledTimes(1);
    // The other skills are untouched, and the failed one's run events find no scene.
    h.battle.events.emit('spCast', cast('shove', false));
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    expect(() => h.battle.events.emit('spRunHit', { runId: 1, skill: 'charge', enemy: {} as EnemyState, x: 0, y: 0, head: 0 })).not.toThrow();
    expect(spies.scene.runHit).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it('drops the effect of a cast that comes inside the gap and shows it again after, by REAL time', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    const emit = (first = false): void => h.battle.events.emit('spCast', cast('shove', first));
    h.stage.now = 1;
    emit();
    h.stage.now = 1.1;
    emit();
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    // The simulation clock says nothing about it: three casts in one simulated second at 3x are a third of a real second.
    h.battle.time = 50;
    h.stage.now = 1.2;
    emit();
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    h.stage.now = 1.3;
    emit();
    expect(spies.scene.cast).toHaveBeenCalledTimes(2);
  });

  it('draws the intro of a first cast even when the stage was busy, and the first cast itself is shown', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    h.stage.now = 2;
    h.battle.events.emit('spCast', cast('shove', false));
    h.stage.now = 2.05;
    const first = cast('charge', true);
    h.battle.events.emit('spCast', first);
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
    expect(spies.intro.first).toHaveBeenCalledWith(first);
    expect(spies.scene.cast).toHaveBeenCalledTimes(2);
    // Later casts of the same skill show no intro.
    h.stage.now = 5;
    h.battle.events.emit('spCast', cast('charge', false));
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
  });

  it('shows the intro of a skill with no scene at all (the name bubble does not wait for a picture)', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    h.battle.events.emit('spCast', cast('lap', true));
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
    expect(spies.scene.cast).not.toHaveBeenCalled();
  });

  it('passes a run\'s events on only when its cast was shown, and forgets the run when it ends', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    h.stage.now = 1;
    h.battle.events.emit('spCast', cast('charge', false, { runId: 1 }));
    h.stage.now = 1.05;
    h.battle.events.emit('spCast', cast('charge', false, { runId: 2 }));
    const hit = (runId: number): BattleEvents['spRunHit'] => ({ runId, skill: 'charge', enemy: {} as EnemyState, x: 0, y: 0, head: 0 });
    h.battle.events.emit('spRunHit', hit(1));
    h.battle.events.emit('spRunHit', hit(2));
    expect(spies.scene.runHit).toHaveBeenCalledTimes(1);
    h.battle.events.emit('spRunBurst', { runId: 1, skill: 'lap', x: 0, y: 0, radius: 1, points: [] });
    h.battle.events.emit('spRunBurst', { runId: 2, skill: 'lap', x: 0, y: 0, radius: 1, points: [] });
    expect(spies.scene.runBurst).toHaveBeenCalledTimes(0);
    h.battle.events.emit('spRunEnd', { runId: 1, skill: 'charge', unit: unit(), hits: 3 });
    h.battle.events.emit('spRunEnd', { runId: 2, skill: 'charge', unit: unit(), hits: 3 });
    expect(spies.scene.runEnd).toHaveBeenCalledTimes(1);
    // The run is over: a late event of it is nobody's.
    h.battle.events.emit('spRunHit', hit(1));
    expect(spies.scene.runHit).toHaveBeenCalledTimes(1);
  });

  it('passes the gunner\'s bite on to its scene when the shot that made it was shown, and not when it lost', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    const bite = {} as BattleEvents['bite'];
    h.stage.now = 1;
    h.battle.events.emit('spCast', cast('wanted', false));
    h.battle.events.emit('bite', bite);
    expect(spies.scene.bite).toHaveBeenCalledTimes(1);
    h.stage.now = 1.1;
    h.battle.events.emit('spCast', cast('wanted', false));
    h.battle.events.emit('bite', bite);
    expect(spies.scene.bite).toHaveBeenCalledTimes(1);
  });

  it('gives every scene its frame with the real and the battle seconds, the battle ones 0 while the battle stands still', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    expect(h.frames).toHaveLength(1);
    // Before any cast there is no scene to give a frame to (the intro has its own).
    h.battle.time = 0.5;
    (h.frames[0] as (dt: number) => void)(1 / 60);
    expect(spies.scene.update).not.toHaveBeenCalled();
    expect(spies.intro.update).toHaveBeenLastCalledWith(1 / 60, 0.5);
    h.battle.events.emit('spCast', cast('shove', true));
    h.battle.time = 1;
    (h.frames[0] as (dt: number) => void)(1 / 60);
    expect(spies.scene.update).toHaveBeenCalledTimes(1);
    expect(spies.scene.update).toHaveBeenLastCalledWith(1 / 60, 0.5);
    expect(spies.intro.update).toHaveBeenLastCalledWith(1 / 60, 0.5);
    (h.frames[0] as (dt: number) => void)(1 / 60);
    expect(spies.scene.update).toHaveBeenLastCalledWith(1 / 60, 0);
  });

  it('cuts everything off on victory and on defeat, and frees everything when the director goes', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    // A victory before anything has cast has no scene to cut off; then all three skills cast once.
    h.battle.events.emit('victory', {} as BattleEvents['victory']);
    expect(spies.scene.clear).not.toHaveBeenCalled();
    spies.intro.clear.mockClear();
    h.battle.events.emit('spCast', cast('shove', true));
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('charge', true, { runId: 1 }));
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('wanted', true));
    h.battle.events.emit('victory', {} as BattleEvents['victory']);
    expect(spies.scene.clear).toHaveBeenCalledTimes(3);
    expect(spies.intro.clear).toHaveBeenCalledTimes(1);
    // A defeat clears the short, local scenes (the shove, the poster) but not the tiger's run: the simulation freezes its run at the defeat and
    // carries it on after a revive, and its picture (timed by the battle's clock) freezes and goes on with it.
    h.battle.events.emit('defeat', { reason: 'overrun' });
    expect(spies.scene.clear).toHaveBeenCalledTimes(5);
    expect(spies.intro.clear).toHaveBeenCalledTimes(2);
    h.destroy();
    expect(spies.scene.destroy).toHaveBeenCalledTimes(3);
    expect(spies.intro.destroy).toHaveBeenCalledTimes(1);
  });

  it('fails alone: a scene that throws in its cast never unwinds the simulation, is logged, cleared and switched off for the rest of the battle', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness(true);
    mountSp(h.stage, h.on);
    spies.scene.cast.mockImplementationOnce(() => {
      throw new Error('no 2D canvas');
    });
    // The emitter does not catch: the throw would come out of `emit` (out of the simulation's tick, in the middle of the cast's rule).
    expect(() => h.battle.events.emit('spCast', cast('shove', true))).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
    expect(spies.scene.clear).toHaveBeenCalledTimes(1);
    // The shove is off now: a later cast of it reaches nothing and takes no slot; the other scenes work as before.
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('shove', false));
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    h.battle.events.emit('spCast', cast('charge', false, { runId: 4 }));
    expect(spies.scene.cast).toHaveBeenCalledTimes(2);
    // Its frame is not asked for any more either (one scene is left to update: the tiger's, built by its first cast).
    spies.scene.update.mockClear();
    (h.frames[0] as (dt: number) => void)(1 / 60);
    expect(spies.scene.update).toHaveBeenCalledTimes(1);
    h.destroy();
    // The broken scene is still destroyed with the director, and only the two that were ever built.
    expect(spies.scene.destroy).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it('fails alone in every other call too: the run events, the bite, the frame and the intro', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = harness(true);
    mountSp(h.stage, h.on);
    const boom = (): never => {
      throw new Error('boom');
    };
    // The shove is built first and stays whole, so there is a scene left to give a frame to when the gunner's breaks.
    h.battle.events.emit('spCast', cast('shove', true));
    h.stage.now += 1;
    spies.intro.first.mockImplementationOnce(boom);
    expect(() => h.battle.events.emit('spCast', cast('wanted', true, { mode: 'bite' }))).not.toThrow();
    // The intro threw, the picture did not care.
    expect(spies.scene.cast).toHaveBeenCalledTimes(2);
    spies.scene.bite.mockImplementationOnce(boom);
    expect(() => h.battle.events.emit('bite', { amount: 1 } as BattleEvents['bite'])).not.toThrow();
    spies.intro.update.mockImplementationOnce(boom);
    expect(() => (h.frames[0] as (dt: number) => void)(1 / 60)).not.toThrow();
    // The scene frames after the intro's failure still ran.
    expect(spies.scene.update).toHaveBeenCalled();
    h.stage.now += 1;
    h.battle.events.emit('spCast', cast('charge', false, { runId: 6 }));
    spies.scene.runHit.mockImplementationOnce(boom);
    expect(() => h.battle.events.emit('spRunHit', { runId: 6, skill: 'charge', enemy: {} as EnemyState, x: 0, y: 0, head: 0 })).not.toThrow();
    // The tiger's scene threw in its run: it is off, so the end of that run is not handed to it.
    expect(() => h.battle.events.emit('spRunEnd', { runId: 6, skill: 'charge', unit: {} as UnitState, hits: 1 })).not.toThrow();
    expect(spies.scene.runEnd).not.toHaveBeenCalled();
    expect(err.mock.calls.length).toBe(4);
    err.mockRestore();
  });

  it('gives a skill whose scene is not made yet no slot of the stage rule, and still shows its first-cast bubble', () => {
    const h = harness(true);
    const staging = mountSp(h.stage, h.on);
    h.stage.now = 5;
    // `lap` has no scene in this registry: its cast shows nothing and must not make a visible cast of another skill lose the slot.
    h.battle.events.emit('spCast', cast('lap', true));
    expect(staging?.rule.shown).toBe(0);
    expect(staging?.rule.lost).toBe(0);
    expect(spies.intro.first).toHaveBeenCalledTimes(1);
    h.battle.events.emit('spCast', cast('shove', false));
    expect(spies.scene.cast).toHaveBeenCalledTimes(1);
    expect(staging?.rule.shown).toBe(1);
  });

  it('remembers a run that was in flight at a defeat (the revive goes on with it) and forgets it at a victory', () => {
    const h = harness(true);
    mountSp(h.stage, h.on);
    const hit = { runId: 9, skill: 'charge', enemy: {} as EnemyState, x: 0, y: 0, head: 0 } as BattleEvents['spRunHit'];
    h.stage.now = 3;
    h.battle.events.emit('spCast', cast('charge', false, { runId: 9 }));
    h.battle.events.emit('defeat', { reason: 'overrun' });
    h.battle.events.emit('revive', { removed: 0 });
    h.battle.events.emit('spRunHit', hit);
    expect(spies.scene.runHit).toHaveBeenCalledTimes(1);
    h.battle.events.emit('victory', {} as BattleEvents['victory']);
    h.battle.events.emit('spRunHit', hit);
    expect(spies.scene.runHit).toHaveBeenCalledTimes(1);
  });
});

// ── the shove's scene ──

describe('the shield shove\'s scene', () => {
  const shoved = (uid: number, x: number, y: number, to: number, angle = 0): SpShoved => ({ uid, x, y, angle, toX: x - to, toY: y, distance: to });
  const enemy = (uid: number, id: EnemyId, x: number, y: number): EnemyState => ({ uid, id, x, y, angle: 0, travelled: 200, hp: 10, maxHp: 10 }) as unknown as EnemyState;

  interface Scene {
    env: SpEnv;
    scene: ReturnType<typeof makeShove>;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn> };
    stage: { play: ReturnType<typeof vi.fn>; later: ReturnType<typeof vi.fn>; shake: ReturnType<typeof vi.fn>; detail: 0 | 1 | 2; reduced: boolean; rules: { big: object; zone: object } };
    back: Container;
    front: Container;
    enemies: EnemyState[];
  }

  function build(detail: 0 | 1 | 2 = 1): Scene {
    const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn() };
    const stage = { play: vi.fn(), later: vi.fn(), shake: vi.fn(), detail, reduced: false, fx, rules: { big: {}, zone: {} } };
    const back = new Container();
    const front = new Container();
    const enemies: EnemyState[] = [];
    const env = {
      stage: stage as unknown as Stage,
      ctx: { layers: { fxBack: back, fxFront: front } },
      battle: { enemies } as unknown as BattleApi,
    } as unknown as SpEnv;
    return { env, scene: makeShove(env), fx, stage, back, front, enemies };
  }

  const event = (pushed: SpShoved[], x = 144, y = 138): Parameters<ReturnType<typeof makeShove>['cast']>[0] =>
    ({ unit: unit(), first: false, x, y, skill: 'shove', data: { range: 220, slide: 0.35, pushed } }) as never;

  const crowd = (s: Scene, n: number): SpShoved[] => {
    const out: SpShoved[] = [];
    for (let i = 0; i < n; i++) {
      s.enemies.push(enemy(i + 1, 'cucumber', 200 + i * 30, 45));
      out.push(shoved(i + 1, 200 + i * 30, 45, 160));
    }
    return out;
  };

  const live = (s: Scene): { wedges: number; slides: number; slams: number } => (s.scene as unknown as { live(): { wedges: number; slides: number; slams: number } }).live();

  beforeEach(() => {
    const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
    setFxSettings({ tier: 'mid', reducedMotion: false });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a ghost and a swipe for each enemy it pushed, at the quality tier\'s limit, the ones first in the cast\'s order kept', () => {
    for (const [detail, max] of [[0, 4], [1, 8], [2, 12]] as const) {
      const s = build(detail);
      s.scene.cast(event(crowd(s, 20)));
      expect(live(s).slides, `tier ${detail}`).toBe(max);
      expect(live(s).slams).toBe(1);
      expect(live(s).wedges).toBe(1);
    }
  });

  it('draws the wave only over the road where something is pushed: not the empty stretch the cat\'s reach also covers', () => {
    const s = build(1);
    // The cat in the corner reaches the left road AND the top road (one stretch round the corner); the crowd stands on the top road.
    s.scene.cast(event(crowd(s, 6)));
    const wedge = s.back.children.find((c) => c instanceof Graphics) as Graphics;
    expect(wedge).toBeDefined();
    const b = wedge.getLocalBounds();
    // The left road is 99 px to the left of the cat: a wedge that reached it would start there.
    expect(b.minX).toBeGreaterThan(-20);
    // And it does reach the crowd: the top road to the right of the cat.
    expect(b.maxX).toBeGreaterThan(100);
  });

  it('shows nothing for a shove that pushed nothing (the simulation never sends one; the picture has no direction to take)', () => {
    const s = build(1);
    expect(() => s.scene.cast(event([]))).not.toThrow();
    expect(live(s)).toEqual({ wedges: 0, slides: 0, slams: 0 });
    expect(s.fx.shockwave).not.toHaveBeenCalled();
  });

  it('puts the ghost where the enemy stood and the swipe from there toward where it stops, and moves no enemy', () => {
    const s = build(1);
    const pushed = [shoved(1, 300, 45, 160)];
    s.enemies.push(enemy(1, 'cucumber', 300, 45));
    const before = { ...(s.enemies[0] as EnemyState) };
    s.scene.cast(event(pushed));
    const [swipe, ghost] = s.back.children.filter((c) => c instanceof Sprite) as Sprite[];
    expect((ghost as Sprite).position.x).toBeCloseTo(300, 6);
    expect((ghost as Sprite).position.y).toBeCloseTo(45, 6);
    expect((swipe as Sprite).position.x).toBeCloseTo(300, 6);
    // 160 px back along the road: the swipe is as long as the slide (the streak texture is 256 px at scale 1) and points back (angle pi).
    expect((swipe as Sprite).scale.x * 256).toBeCloseTo(160, 4);
    expect(Math.abs((swipe as Sprite).rotation)).toBeCloseTo(Math.PI, 6);
    expect(s.enemies[0]).toEqual(before);
  });

  it('draws what it is told from the event alone: an enemy it cannot find gets no ghost and nothing throws', () => {
    const s = build(1);
    s.scene.cast(event([shoved(77, 300, 45, 160)]));
    expect(live(s).slides).toBe(0);
  });

  it('braces an elite or a boss instead of streaking it: a ring and dust at its feet, a smaller ghost', () => {
    const s = build(1);
    s.enemies.push(enemy(1, 'cucumber', 200, 45), enemy(2, 'spray', 300, 45), enemy(3, 'boss_blender', 400, 45));
    s.scene.cast(event([shoved(1, 200, 45, 160), shoved(2, 300, 45, 56), shoved(3, 400, 45, 32)]));
    // The slam's ring at the cat, then one ring each for the elite and the boss.
    const rings = s.fx.shockwave.mock.calls.map((c) => c[0] as number);
    expect(rings).toContain(300);
    expect(rings).toContain(400);
    expect(rings).not.toContain(200);
    // Their ghosts are fainter: the heavier the body, the less it left behind (a slide piece is a swipe then a ghost).
    const ghosts = s.back.children.filter((c, i) => c instanceof Sprite && i % 2 === 1) as Sprite[];
    expect(ghosts).toHaveLength(3);
    expect(ghosts[1]?.alpha).toBeLessThan(ghosts[0]?.alpha ?? 0);
    expect(ghosts[2]?.alpha).toBeLessThan(ghosts[1]?.alpha ?? 0);
  });

  it('is timed by the battle\'s clock: it holds still under a popup however long real time goes on', () => {
    const s = build(1);
    s.scene.cast(event(crowd(s, 4)));
    s.scene.update?.(0.1, 0.1);
    expect(live(s).slides).toBe(4);
    for (let i = 0; i < 600; i++) s.scene.update?.(1 / 60, 0);
    expect(live(s)).toEqual({ wedges: 1, slides: 4, slams: 1 });
  });

  it('keeps step with a faster game but not below the real floor: at 3x it is not gone in a third of its time', () => {
    const s = build(1);
    s.scene.cast(event(crowd(s, 3)));
    // 0.6 battle seconds in 0.2 real: the battle clock is through (0.5 s), the floor (0.28 s) is not.
    for (let t = 0; t < 0.2; t += 1 / 60) s.scene.update?.(1 / 60, 3 / 60);
    expect(live(s).slides).toBe(3);
    for (let t = 0; t < 0.2; t += 1 / 60) s.scene.update?.(1 / 60, 3 / 60);
    expect(live(s)).toEqual({ wedges: 0, slides: 0, slams: 0 });
  });

  it('clears at once on victory, defeat and the battle\'s end and can be used again after', () => {
    const s = build(1);
    s.scene.cast(event(crowd(s, 5)));
    s.scene.clear();
    expect(live(s)).toEqual({ wedges: 0, slides: 0, slams: 0 });
    for (const c of [...s.back.children, ...s.front.children]) expect(c.visible).toBe(false);
    s.scene.cast(event(crowd(s, 2)));
    expect(live(s).slides).toBe(2);
    s.scene.destroy();
    expect(s.back.children).toHaveLength(0);
    expect(s.front.children).toHaveLength(0);
  });

  it('does not grow without end: many casts in a row reuse the same few pieces', () => {
    const s = build(2);
    for (let i = 0; i < 40; i++) {
      s.enemies.length = 0;
      s.scene.cast(event(crowd(s, 14)));
      for (let t = 0; t < 1; t += 1 / 30) s.scene.update?.(1 / 30, 1 / 30);
    }
    expect(s.back.children.length).toBeLessThanOrEqual(3 + 24 * 2);
    expect(s.front.children.length).toBeLessThanOrEqual(2);
  });

  it('has a sound and a nudge of the camera, rationed: the sound goes through the stage\'s rule and the nudge through its own gate; none under reduced motion', () => {
    const s = build(1);
    s.scene.cast(event(crowd(s, 3)));
    expect(s.stage.play).toHaveBeenCalledWith(s.stage.rules.big, 'hit_heavy', expect.any(Number), expect.any(Number), expect.any(Number));
    expect(s.stage.shake).toHaveBeenCalledWith(Trauma.t1, Gate.spShake, expect.any(Number));
    const calm = build(1);
    calm.stage.reduced = true;
    calm.scene.cast(event(crowd(calm, 3)));
    expect(calm.stage.shake).not.toHaveBeenCalled();
  });

  it('finds the road for the wedge itself: a cat far from every road gets no wedge, and its enemies still slide', () => {
    const s = build(1);
    s.scene.cast(event(crowd(s, 2), 360, 330));
    expect(live(s).wedges).toBe(0);
    expect(live(s).slides).toBe(2);
  });
});
