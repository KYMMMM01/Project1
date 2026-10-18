/**
 * The bard's scene, "Jam Session!" (docs/design_skills_v2.md 3.10), and the alchemist's, "Turn Into Fish!" (3.11), on the view side: what each draws
 * from which event, the time model (a paused clock, 3x), the holds the two scenes make on the rest of the screen (a ring that waits for its note, a
 * kill that waits for its flask), reduced motion, the low tier, clean-up. The simulation's own side is in `sim.spJam.test.ts` and `sim.spFish.test.ts`;
 * here the scenes are fed stand-ins for the stage, and, where the order of the simulation's events matters, a real battle.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

vi.mock('@/audio', () => ({
  attackSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  critSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeHitSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  foeDieSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  impactSfx: () => ({ id: 'x', volume: 1, pitch: 1 }),
  audio: { play: () => undefined, playStep: () => undefined },
}));
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));
vi.mock('@/fx', async (original) => ({
  ...(await original<typeof import('@/fx')>()),
  fxTex: () => ({ id: 'disc', texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
}));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import type { BattleApi, BattleEvents, EnemyState, SpCastEvent, UnitState } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { SP_ROWS } from '@/game/data/spSkills';
import { FISH_PINK, FishChip, chipTexture, faceDisc, forgetFaces } from '@/view/fishArt';
import { mountDeaths } from '@/view/director/deaths';
import { FISH_HOLD_MAX, FishHolds, fishHoldsOf } from '@/view/director/sp/fishHold';
import { makeFish } from '@/view/director/sp/fish';
import { makeJam } from '@/view/director/sp/jam';
import { climbValue, curvePoint, dingStep, noteControl } from '@/view/director/sp/jamMath';
import type { SpEnv, SpScene } from '@/view/director/sp/types';
import type { Bus, Stage } from '@/view/director/stage';
import { bodyX } from '@/view/field/policy';
import { clearRingHolds, holdRing, ringHeld, ringHolds } from '@/view/field/ringHold';
import { SpRingView, spRingArt } from '@/view/field/spRing';
import { NOTE_GOLD, jamArt } from '@/view/jamArt';
import { advance, foe as simFoe, newSim, put, quietWave } from './simHelpers';

// ───────────────────────────── stand-ins ─────────────────────────────

const cat = (uid: number, id: string, cell: number, sp = 0.4): UnitState => ({ uid, id, cell, sp }) as unknown as UnitState;

const foe = (uid: number, x: number, y: number, id = 'cucumber', over: Partial<EnemyState> = {}): EnemyState =>
  ({ uid, id, x, y, angle: 0, travelled: 200, hp: 10, maxHp: 10, slow: 0, frozen: false, fish: false, burning: false, poisoned: false, enraged: false, ...over }) as unknown as EnemyState;

interface View {
  root: Container;
  body: Container;
  sprite: Sprite;
}

/** The field's enemy view as far as the scene looks at it: a root that holds a body that holds the enemy's own picture. */
function enemyView(): View {
  const root = new Container();
  root.label = 'enemy';
  const lean = new Container();
  const body = new Container();
  body.label = 'body';
  const sprite = new Sprite(Texture.WHITE);
  sprite.label = 'sprite';
  body.addChild(sprite);
  lean.addChild(body);
  root.addChild(lean);
  return { root, body, sprite };
}

interface Rig {
  stage: {
    now: number;
    detail: 0 | 1 | 2;
    reduced: boolean;
    play: ReturnType<typeof vi.fn>;
    playStep: ReturnType<typeof vi.fn>;
    laterReal: ReturnType<typeof vi.fn>;
    shake: ReturnType<typeof vi.fn>;
    rules: object;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn>; fleck: ReturnType<typeof vi.fn> };
  };
  battle: { spOn: boolean; time: number; enemies: EnemyState[]; units: UnitState[]; events: Emitter<BattleEvents> };
  front: Container;
  back: Container;
  enemies: Container;
  views: Map<number, View>;
  env: SpEnv;
  /** Run `seconds` of real time at `speed` (the battle's clock runs `speed` times as fast; 0 = a popup holds it). */
  run(scene: SpScene<never>, seconds: number, speed?: number): void;
  removed: number;
}

function rig(detail: 0 | 1 | 2 = 1, reduced = false): Rig {
  const events = new Emitter<BattleEvents>();
  const r = { removed: 0 } as Rig;
  const on = events.on.bind(events);
  events.on = ((type: keyof BattleEvents, fn: never) => {
    const off = on(type, fn);
    return () => {
      r.removed++;
      off();
    };
  }) as typeof events.on;
  r.battle = { spOn: true, time: 3, enemies: [], units: [], events };
  r.stage = {
    now: 0,
    detail,
    reduced,
    play: vi.fn(),
    playStep: vi.fn(),
    laterReal: vi.fn(),
    shake: vi.fn(),
    rules: { zone: {}, big: {}, hit: {}, coinTick: {} },
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), fleck: vi.fn() },
  };
  r.front = new Container();
  r.back = new Container();
  r.enemies = new Container();
  r.views = new Map();
  r.env = {
    stage: r.stage as unknown as Stage,
    ctx: { layers: { fxFront: r.front, fxBack: r.back, enemies: r.enemies }, enemyView: (uid: number) => r.views.get(uid)?.root ?? null },
    battle: r.battle as unknown as BattleApi,
  } as unknown as SpEnv;
  r.run = (scene, seconds, speed = 1) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      r.battle.time += speed / 60;
      r.stage.now += 1 / 60;
      scene.update?.(1 / 60, speed / 60);
    }
  };
  return r;
}

beforeEach(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  setFxSettings({ tier: 'mid', reducedMotion: false });
  clearRingHolds();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearRingHolds();
});

// ───────────────────────────── the bard: the maths ─────────────────────────────

describe('the notes\' flight, in numbers', () => {
  it('fans the four notes out of the lute across the line to the cat, all of them rising before they come down', () => {
    const out = { x: 0, y: 0 };
    const ctrls = [0, 1, 2, 3].map((lane) => ({ ...noteControl(100, 200, 300, 200, lane, 4, out) }));
    // Side by side across the line (the line is horizontal here, so the fan is in y apart from the rise), mirrored about its middle.
    expect(new Set(ctrls.map((c) => Math.round(c.y))).size).toBe(4);
    expect(ctrls[0]!.y + ctrls[3]!.y).toBeCloseTo(ctrls[1]!.y + ctrls[2]!.y, 6);
    for (const c of ctrls) {
      expect(c.x).toBeCloseTo(200, 6);
      expect(c.y).toBeLessThan(200);
    }
  });

  it('is safe for a note that lands where it started (no NaN) and for a single note', () => {
    const c = noteControl(50, 50, 50, 50, 0, 1, { x: 0, y: 0 });
    expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    expect(c.y).toBeLessThan(50);
  });

  it('runs the curve from the first point to the second', () => {
    const o = { x: 0, y: 0 };
    expect(curvePoint(10, 20, 50, -40, 90, 80, 0, o)).toEqual({ x: 10, y: 20 });
    expect(curvePoint(10, 20, 50, -40, 90, 80, 1, o)).toEqual({ x: 90, y: 80 });
    const mid = curvePoint(10, 20, 50, -40, 90, 80, 0.5, o);
    expect(mid.y).toBeLessThan(20);
  });

  it('climbs the ring from where it was held to the cat\'s own gauge, eased, never above it', () => {
    expect(climbValue(0.2, 0.4, 0, 0.4)).toBeCloseTo(0.2, 9);
    expect(climbValue(0.2, 0.4, 1, 0.4)).toBeCloseTo(0.4, 9);
    let last = 0.2;
    for (let k = 0; k <= 1.0001; k += 0.1) {
      const v = climbValue(0.2, 0.4, k, 0.4);
      expect(v).toBeGreaterThanOrEqual(last - 1e-12);
      last = v;
    }
    // Faster than linear at first (a quick jump that settles).
    expect(climbValue(0.2, 0.4, 0.3, 0.4)).toBeGreaterThan(0.2 + 0.2 * 0.3);
    // The cat cast meanwhile (its gauge is 0.05 now): the ring follows the cat, never the picture.
    expect(climbValue(0.2, 0.4, 0.5, 0.05)).toBe(0.05);
    // Out-of-range progress is clamped.
    expect(climbValue(0.2, 0.4, -1, 0.4)).toBeCloseTo(0.2, 9);
    expect(climbValue(0.2, 0.4, 5, 0.4)).toBeCloseTo(0.4, 9);
  });

  it('dings climb a pentatonic step for each note that lands, and stop climbing after the fifth', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(dingStep)).toEqual([0, 1, 2, 3, 4, 4, 4]);
    expect(dingStep(-1)).toBe(0);
  });

  it('paints the note and the sweep on first use, in code (no image file)', () => {
    const a = jamArt();
    expect(a.note).toBeDefined();
    expect(a.strum).toBeDefined();
    expect(jamArt()).toBe(a);
    expect(NOTE_GOLD).not.toBe(0xd96579);
  });
});

// ───────────────────────────── the bard: the scene ─────────────────────────────

type JamCast = Extract<SpCastEvent, { skill: 'jam' }>;

const jamCast = (notes: Array<{ uid: number; cell: number; kind: 'gauge' | 'attack'; before: number; after: number }>, first = false): JamCast =>
  ({ unit: cat(1, 't_bard', 12), first, x: 360, y: 330, skill: 'jam', data: { notes, fill: 0.2 } }) as unknown as JamCast;

/** A bard's chord: two skill cats whose gauges rise by a fifth and two cats with no skill that attack at once. */
const chord = (): JamCast =>
  jamCast([
    { uid: 2, cell: 6, kind: 'gauge', before: 0.2, after: 0.4 },
    { uid: 3, cell: 8, kind: 'gauge', before: 0.45, after: 0.65 },
    { uid: 4, cell: 16, kind: 'attack', before: 0, after: 0 },
    { uid: 5, cell: 18, kind: 'attack', before: 0, after: 0 },
  ]);

function jamWorld(detail: 0 | 1 | 2 = 1, reduced = false) {
  const r = rig(detail, reduced);
  // The simulation has already written the gauges when the event arrives.
  r.battle.units = [cat(2, 'm_frost', 6, 0.4), cat(3, 'w_viking', 8, 0.65), cat(4, 'r_sling', 16, 0), cat(5, 'w_sword', 18, 0)];
  const scene = makeJam(r.env);
  const live = () => (scene as unknown as { live(): { notes: number; stickers: number; climbs: number; sweeps: number; held: number } }).live();
  return { r, scene, live };
}

describe('the bard\'s scene', () => {
  it('sends four notes out at once, strums and holds the two rings that are going to climb at the gauge they had BEFORE the note', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    expect(live()).toMatchObject({ notes: 4, sweeps: 1, held: 2 });
    // The simulation says 0.4 and 0.65: the rings keep the old 0.2 and 0.45 until their notes land.
    expect(ringHeld(2)).toBe(0.2);
    expect(ringHeld(3)).toBe(0.45);
    expect(ringHeld(4)).toBeUndefined();
    // The strum sounds as a chord: the bard's own strummed shot, low and full, and the same an octave up a hair later.
    expect(r.stage.play).toHaveBeenCalledWith(expect.anything(), 'atk_t_bard', expect.any(Number), expect.closeTo(0.78, 2), expect.any(Number));
    expect(r.stage.laterReal).toHaveBeenCalledTimes(1);
    expect(r.stage.fx.shockwave).toHaveBeenCalledTimes(1);
  });

  it('lands the two attack notes first (they zip: the cat\'s own attack is one tick behind the cast), the gauge notes later, and the ring then climbs and is let go', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.2);
    // The two attack notes zip and have landed; the two gauge notes (0.36 s) are still in the air.
    expect(live().stickers).toBe(2);
    expect(live().notes).toBe(2);
    expect(live().climbs).toBe(0);
    // Still holding both rings.
    expect(ringHeld(2)).toBe(0.2);
    r.run(scene as never, 0.25);
    expect(live().notes).toBe(0);
    expect(live().climbs).toBeGreaterThan(0);
    // The ring has started to climb: more than before, at most what the cat has.
    const mid = ringHeld(2) as number;
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThanOrEqual(0.4 + 1e-9);
    r.run(scene as never, 0.5);
    expect(live()).toMatchObject({ climbs: 0, held: 0 });
    expect(ringHeld(2)).toBeUndefined();
    expect(ringHeld(3)).toBeUndefined();
    expect(ringHolds()).toBe(0);
    // The stickers have gone too after their 0.6 s.
    r.run(scene as never, 0.4);
    expect(live().stickers).toBe(0);
  });

  it('pings each ring with a ding that climbs a step and puts a sticker on each cat that gets a free attack', () => {
    const { r, scene } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.8);
    const dings = r.stage.playStep.mock.calls.filter((c) => c[1] === 'imp_t_bard');
    expect(dings).toHaveLength(4);
    expect(new Set(dings.map((c) => c[2])).size).toBe(4);
    // A ping (ring) and a star per ring that climbs, none for the attack notes' cats.
    expect(r.stage.fx.shockwave.mock.calls.length).toBe(1 + 2);
    expect(r.stage.fx.fleck).toHaveBeenCalledTimes(2);
  });

  it('staggers the gauge notes: one leaves the lute every 0.03 battle seconds and none is drawn before its turn; the attack notes leave at once', () => {
    const { r, scene } = jamWorld();
    scene.cast(chord());
    const visible = (): number => r.front.children.filter((c) => c.visible && (c as Sprite).texture === jamArt().note).length;
    // Before the first frame has run the notes still wait; after 1/60 s the two attack notes and the first gauge note have left.
    expect(visible()).toBe(0);
    r.run(scene as never, 1 / 60);
    expect(visible()).toBe(3);
    r.run(scene as never, 0.04);
    expect(visible()).toBe(4);
  });

  it('is timed by the battle clock: a popup stands the notes and the held rings still, and they go on after it', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.1);
    const before = live();
    r.run(scene as never, 2.5, 0);
    expect(live()).toEqual(before);
    expect(ringHeld(2)).toBe(0.2);
    r.run(scene as never, 1.2);
    expect(live()).toMatchObject({ notes: 0, held: 0 });
  });

  it('keeps a real floor at 3x: a gauge note is not on its cat in 0.12 s of real time, though the battle clock has run 0.36 s', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.12, 3);
    expect(live().notes).toBeGreaterThan(0);
    expect(ringHeld(2)).toBe(0.2);
    r.run(scene as never, 0.4, 3);
    expect(live().notes).toBe(0);
  });

  it('lets the ring go at once when the cat cast meanwhile (its gauge fell below what the picture held)', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.1);
    (r.battle.units[0] as { sp: number }).sp = 0.02;
    r.run(scene as never, 1 / 60);
    expect(ringHeld(2)).toBeUndefined();
    expect(live().held).toBe(1);
  });

  it('lets a ring go that nobody landed a note on, after a while, and when its cat has left the board', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.battle.units.splice(1, 1);
    r.run(scene as never, 1 / 60);
    expect(ringHeld(3)).toBeUndefined();
    expect(live().held).toBe(1);
    // The other one: a clock that ran on past the hold's limit lets go too.
    r.battle.time += 5;
    r.run(scene as never, 1 / 60);
    expect(live().held).toBe(0);
  });

  it('does not drop a hold it did not make (a fish capsule\'s hold on the same cat)', () => {
    const { r, scene } = jamWorld();
    scene.cast(chord());
    // The capsule takes the ring over (a different value), the bard\'s notes land: the capsule\'s hold stays.
    holdRing(2, 0.77);
    r.run(scene as never, 1.4);
    expect(ringHeld(2)).toBe(0.77);
  });

  it('does not drop a hold it did not make when its own hold runs out or the scene is cleared either', () => {
    const { r, scene } = jamWorld();
    scene.cast(chord());
    holdRing(2, 0.77);
    // The clock runs past the hold's limit: the picture lets go of its record, and the capsule's value stays.
    r.battle.time += 5;
    r.run(scene as never, 1 / 60);
    expect(ringHeld(2)).toBe(0.77);
    scene.clear();
    expect(ringHeld(2)).toBe(0.77);
    expect(ringHeld(3)).toBeUndefined();
  });

  it('does not hold a ring whose gauge did not move, and holds nothing for an attack note', () => {
    const { scene, live } = jamWorld();
    scene.cast(jamCast([{ uid: 2, cell: 6, kind: 'gauge', before: 0.4, after: 0.4 }, { uid: 4, cell: 16, kind: 'attack', before: 0, after: 0 }]));
    expect(live().held).toBe(0);
    expect(ringHeld(2)).toBeUndefined();
  });

  it('aims at the ring of the cat\'s view when there is one, and at the cell when there is not', () => {
    const { r, scene } = jamWorld();
    const view = new Container();
    const ring = new Container();
    ring.label = 'sp-ring';
    ring.position.set(222, 235);
    view.addChild(ring);
    (r.env.ctx as unknown as { unitView: (uid: number) => Container | null }).unitView = (uid) => (uid === 2 ? view : null);
    r.front.position.set(0, 0);
    scene.cast(jamCast([{ uid: 2, cell: 6, kind: 'gauge', before: 0.2, after: 0.4 }, { uid: 3, cell: 8, kind: 'gauge', before: 0.45, after: 0.65 }]));
    const notes = r.front.children.filter((c) => (c as Sprite).texture === jamArt().note) as Sprite[];
    r.run(scene as never, 0.5);
    // The two notes have landed; their sprites are hidden. Check the ends the notes flew to through the shockwaves at the landing.
    expect(notes.every((n) => !n.visible)).toBe(true);
    const at = r.stage.fx.shockwave.mock.calls.map((c) => [c[0], c[1]]);
    expect(at).toContainEqual([222, 235]);
    // The other cat has no view: its ring is where the cell says (the cell's middle plus the ring's place from the feet).
    const x8 = 90 + 54 + 108 * 3 - 30;
    expect(at.some(([x]) => Math.abs((x as number) - x8) < 1)).toBe(true);
  });

  it('under reduced motion nothing flies and nothing is made of particles, but the ring still climbs', () => {
    const { r, scene, live } = jamWorld(2, true);
    scene.cast(chord());
    expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(live().sweeps).toBe(0);
    const sprites = r.front.children.filter((c) => (c as Sprite).texture === jamArt().note) as Sprite[];
    r.run(scene as never, 0.05);
    // Each note sits on its cat from the start, fading in.
    const spots = new Set(sprites.map((s) => `${Math.round(s.x)},${Math.round(s.y)}`));
    expect(spots.size).toBe(4);
    r.run(scene as never, 1.2);
    expect(r.stage.fx.ps.burst).not.toHaveBeenCalled();
    expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(r.stage.fx.fleck).not.toHaveBeenCalled();
    expect(live()).toMatchObject({ notes: 0, held: 0 });
    expect(ringHeld(2)).toBeUndefined();
  });

  it('on the low tier makes no trail of sparkles and thins the rest', () => {
    const low = jamWorld(0);
    low.scene.cast(chord());
    low.r.run(low.scene as never, 0.3);
    const trailLow = low.r.stage.fx.ps.burst.mock.calls.length;
    clearRingHolds();
    const high = jamWorld(2);
    high.scene.cast(chord());
    high.r.run(high.scene as never, 0.3);
    expect(trailLow).toBeLessThan(high.r.stage.fx.ps.burst.mock.calls.length);
  });

  it('reuses its pieces: forty casts never make more than the pool\'s twelve notes, and leave nothing held', () => {
    const { r, scene, live } = jamWorld();
    for (let i = 0; i < 40; i++) {
      scene.cast(chord());
      r.run(scene as never, 0.1);
    }
    const notes = r.front.children.filter((c) => (c as Sprite).texture === jamArt().note);
    // 12 notes and 8 stickers share the note's picture.
    expect(notes.length).toBeLessThanOrEqual(12 + 8);
    expect(live().notes).toBeLessThanOrEqual(12);
    scene.clear();
    expect(live()).toEqual({ notes: 0, stickers: 0, climbs: 0, sweeps: 0, held: 0 });
    expect(ringHolds()).toBe(0);
  });

  it('clear lets every ring go and hides everything; destroy takes the sprites off the field', () => {
    const { r, scene, live } = jamWorld();
    scene.cast(chord());
    r.run(scene as never, 0.1);
    scene.clear();
    expect(live()).toEqual({ notes: 0, stickers: 0, climbs: 0, sweeps: 0, held: 0 });
    expect(ringHolds()).toBe(0);
    expect(r.front.children.every((c) => !c.visible)).toBe(true);
    scene.destroy();
    expect(r.front.children.filter((c) => !c.destroyed)).toHaveLength(0);
  });

  it('is a scene of the registry and takes no listener of its own', () => {
    const { r } = jamWorld();
    expect(r.removed).toBe(0);
  });
});

describe('the bard\'s ring on the real ring view', () => {
  it('shows the held gauge and not the cat\'s own while a note is in the air (the ring\'s frame follows `ringHeld`)', () => {
    // `SpRings.tick` asks `ringHeld(uid) ?? u.sp`; this is the contract the scene stands on.
    holdRing(7, 0.2);
    expect(ringHeld(7) ?? 0.4).toBe(0.2);
    clearRingHolds();
    expect(ringHeld(7) ?? 0.4).toBe(0.4);
  });

  it('wears the brown-edged closed ring on a trickster only, and the gold one on every other class', () => {
    const art = spRingArt();
    const trick = new SpRingView(art);
    const plain = new SpRingView(art);
    const look = { frame: 24, blocked: false, pulsing: false, wave: 0, flash: -1, mark: null, calm: false, low: false };
    const body = (v: SpRingView): Texture => ((v as unknown as { body: Sprite }).body).texture;
    trick.draw({ ...look, trick: true }, 1 / 60);
    plain.draw({ ...look, trick: false }, 1 / 60);
    expect(body(trick)).toBe(art.trick);
    expect(body(plain)).toBe(art.frames[24]);
    expect(art.trick).not.toBe(art.frames[24]);
    // An arc is the same for everyone: the trickster's own ring differs only when the gauge is full.
    trick.draw({ ...look, frame: 10, trick: true }, 1 / 60);
    expect(body(trick)).toBe(art.frames[10]);
    // And back.
    trick.draw({ ...look, trick: true }, 1 / 60);
    expect(body(trick)).toBe(art.trick);
  });
});

// ───────────────────────────── the alchemist: the holds ─────────────────────────────

describe('kills that wait for a flask', () => {
  const pay = (x: number, y: number, delta = 4, reason: 'kill' | 'wave' = 'kill'): BattleEvents['fish'] => ({ total: 100, delta, reason, x, y });

  it('holds nothing until something is expected: the first line answers false', () => {
    const h = new FishHolds();
    expect(h.hold(pay(100, 45))).toBe(false);
    expect(h.staged(1)).toBe(false);
    expect(h.size).toBe(0);
  });

  it('keeps the reward of an expected kill (matched by where the enemy stood) and flies it on release, once', () => {
    const h = new FishHolds();
    const flown: number[] = [];
    h.fire = (e) => flown.push(e.delta);
    h.expect(7, 300.25, 45, 10);
    h.expect(8, 340.5, 45, 10);
    expect(h.staged(7)).toBe(true);
    expect(h.staged(9)).toBe(false);
    // A reward of another kind, or somewhere else, is none of its business.
    expect(h.hold(pay(300.25, 45, 4, 'wave'))).toBe(false);
    expect(h.hold(pay(500, 45))).toBe(false);
    expect(h.hold(pay(300.25, 45, 4))).toBe(true);
    // The same spot again (a second reward there) is not held a second time.
    expect(h.hold(pay(300.25, 45, 9))).toBe(false);
    expect(h.kept).toBe(1);
    expect(flown).toEqual([]);
    h.release(7);
    expect(flown).toEqual([4]);
    expect(h.staged(7)).toBe(false);
    h.release(7);
    expect(flown).toEqual([4]);
    // The other one was never offered a reward: its release flies nothing.
    h.release(8);
    expect(flown).toEqual([4]);
    expect(h.size).toBe(0);
  });

  it('lets an expectation nobody released go after FISH_HOLD_MAX battle seconds, and flies what it kept', () => {
    const h = new FishHolds();
    const flown: number[] = [];
    h.fire = (e) => flown.push(e.delta);
    h.expect(1, 100, 45, 5 + FISH_HOLD_MAX);
    h.hold(pay(100, 45, 3));
    h.sweep(5 + FISH_HOLD_MAX - 0.01);
    expect(flown).toEqual([]);
    h.sweep(5 + FISH_HOLD_MAX + 0.01);
    expect(flown).toEqual([3]);
    expect(h.size).toBe(0);
  });

  it('flush flies everything it kept and ends every expectation', () => {
    const h = new FishHolds();
    const flown: number[] = [];
    h.fire = (e) => flown.push(e.delta);
    h.expect(1, 100, 45, 99);
    h.expect(2, 140, 45, 99);
    h.hold(pay(140, 45, 6));
    h.flush();
    expect(flown).toEqual([6]);
    expect(h.size).toBe(0);
    expect(h.staged(1)).toBe(false);
  });

  it('is one registry per battle', () => {
    const a = {};
    const b = {};
    expect(fishHoldsOf(a)).toBe(fishHoldsOf(a));
    expect(fishHoldsOf(a)).not.toBe(fishHoldsOf(b));
  });
});

describe('the death director with the alchemist\'s holds', () => {
  function director() {
    const handlers = new Map<string, Array<(e: Record<string, unknown>) => void>>();
    const on = ((type: string, fn: (e: Record<string, unknown>) => void) => {
      handlers.set(type, [...(handlers.get(type) ?? []), fn]);
    }) as unknown as Bus;
    const battle = { time: 0, enemies: [], init: { mode: 'chapter' }, wave: 1, totalWaves: 24 };
    const stage = {
      now: 0,
      ctx: { battle },
      fx: { dustPuff: vi.fn(), deathPuff: vi.fn(), iceShatter: vi.fn(), explosion: vi.fn(), coinBurst: vi.fn() },
      killLadder: { next: () => 0 },
      rules: { die: {}, eliteDie: {} },
      playStep: vi.fn(),
      play: vi.fn(),
      addFrame: vi.fn(),
    };
    const currency = { onFish: vi.fn(), onPurr: vi.fn(), claimBig: vi.fn() };
    mountDeaths(stage as unknown as Stage, on, currency as never, {} as never, {} as never);
    const emit = (type: string, e: Record<string, unknown>): void => {
      for (const fn of handlers.get(type) ?? []) fn(e);
    };
    return { battle, stage, currency, emit };
  }
  const dust = (uid: number, x: number, y: number): EnemyState => foe(uid, x, y, 'dust');
  const die = (en: EnemyState, over: Record<string, unknown> = {}): Record<string, unknown> => ({ enemy: en, x: en.x, y: en.y, fish: 4, purr: 0, killer: {}, ...over });

  it('flies the reward and plays the ordinary death at once when no flask is expected (skills off, a cast that lost the stage rule)', () => {
    const d = director();
    d.emit('fish', { total: 10, delta: 4, reason: 'kill', x: 300, y: 45 });
    expect(d.currency.onFish).toHaveBeenCalledTimes(1);
    d.emit('enemyDie', die(dust(1, 300, 45), { transmuted: true }));
    expect(d.stage.fx.deathPuff).toHaveBeenCalledTimes(1);
  });

  it('keeps the reward and the death of a staged kill until its flask lands, then flies the reward', () => {
    const d = director();
    const holds = fishHoldsOf(d.battle);
    holds.expect(1, 300, 45, 99);
    d.emit('fish', { total: 10, delta: 4, reason: 'kill', x: 300, y: 45 });
    d.emit('enemyDie', die(dust(1, 300, 45), { transmuted: true }));
    expect(d.currency.onFish).not.toHaveBeenCalled();
    expect(d.stage.fx.deathPuff).not.toHaveBeenCalled();
    expect(d.stage.playStep).not.toHaveBeenCalled();
    holds.release(1);
    expect(d.currency.onFish).toHaveBeenCalledTimes(1);
    expect(d.currency.onFish).toHaveBeenCalledWith({ total: 10, delta: 4, reason: 'kill', x: 300, y: 45 });
  });

  it('does not touch an ordinary kill next to a staged one, nor a staged enemy\'s death when it did not come from a flask', () => {
    const d = director();
    const holds = fishHoldsOf(d.battle);
    holds.expect(1, 300, 45, 99);
    d.emit('fish', { total: 10, delta: 2, reason: 'kill', x: 500, y: 45 });
    expect(d.currency.onFish).toHaveBeenCalledTimes(1);
    d.emit('enemyDie', die(dust(2, 500, 45)));
    expect(d.stage.fx.deathPuff).toHaveBeenCalledTimes(1);
    // An enemy that happens to be expected but dies in the usual way (no `transmuted`) is an ordinary death.
    d.emit('enemyDie', die(dust(1, 300, 45)));
    expect(d.stage.fx.deathPuff).toHaveBeenCalledTimes(2);
  });
});

// ───────────────────────────── the alchemist: the scene ─────────────────────────────

type FishCast = Extract<SpCastEvent, { skill: 'fish' }>;

const fishCast = (big: { uid: number; x: number; y: number; boss: boolean; seconds: number; lock: number } | null, small: number[], first = false): FishCast =>
  ({
    unit: cat(1, 't_alch', 2),
    first,
    x: 360,
    y: 138,
    skill: 'fish',
    data: { big: big ? { ...big, cats: 3 } : null, small: small.map((uid) => ({ uid, x: 150 + uid * 20, y: 45 })) },
  }) as unknown as FishCast;

interface FishLive {
  throws: number;
  stands: number;
  fish: Array<{ uid: number; mode: string; loud: boolean; left: number; hidden: boolean }>;
  held: number;
}

function fishWorld(detail: 0 | 1 | 2 = 1, reduced = false) {
  const r = rig(detail, reduced);
  const boss = foe(100, 381, 45, 'boss_blender');
  const smalls = [1, 2, 3, 4].map((uid) => foe(uid, 150 + uid * 20, 45, 'dust'));
  r.battle.enemies = [boss, ...smalls];
  for (const e of r.battle.enemies) r.views.set(e.uid, enemyView());
  const holds = fishHoldsOf(r.battle);
  const fired: number[] = [];
  holds.fire = (e) => fired.push(e.delta);
  const scene = makeFish(r.env);
  const live = () => (scene as unknown as { live(): FishLive }).live();
  const bigData = { uid: 100, x: 381, y: 45, boss: true, seconds: 4, lock: 8 };
  /** What the simulation does in the cast tick, in its order: the cast, the status, then each small one's reward and death. */
  const sim = (big: typeof bigData | null = bigData, small = [1, 2, 3, 4], castIt = true): void => {
    const e = fishCast(big, small);
    r.battle.events.emit('spCast', e);
    if (castIt) scene.cast(e);
    if (big) {
      boss.fish = true;
      r.battle.events.emit('status', { enemy: boss, kind: 'fish', duration: big.seconds });
    }
    for (const uid of small) {
      const en = smalls[uid - 1] as EnemyState;
      holds.hold({ total: 1, delta: 4, reason: 'kill', x: en.x, y: en.y });
      r.battle.events.emit('enemyDie', { enemy: en, x: en.x, y: en.y, fish: 4, purr: 0, killer: null, transmuted: true });
    }
    r.battle.enemies = r.battle.enemies.filter((x) => !small.includes(x.uid));
  };
  return { r, scene, live, boss, smalls, holds, fired, sim, bigData };
}

const visibleOf = (v: View): boolean => v.sprite.visible;

describe('the alchemist\'s scene', () => {
  it('throws five flasks, stands in for the four enemies the simulation took off the field, and expects their kills', () => {
    const w = fishWorld();
    w.sim();
    expect(w.live().throws).toBe(5);
    expect(w.live().stands).toBe(4);
    expect(w.holds.size).toBe(4);
    for (const uid of [1, 2, 3, 4]) expect(w.holds.staged(uid)).toBe(true);
    expect(w.holds.staged(100)).toBe(false);
    expect(w.live().fish).toMatchObject([{ uid: 100, mode: 'wait', loud: true }]);
    // The boss's own picture is still there while its flask flies.
    expect(visibleOf(w.r.views.get(100) as View)).toBe(true);
    // The stand-ins are in the enemies' layer, in front of the enemies behind them (a half step above their depth).
    expect(w.r.enemies.children.filter((c) => c.visible)).toHaveLength(4);
  });

  it('lets each small flask land with a puff and a plink, releases its kill, and takes its stand-in away', () => {
    const w = fishWorld();
    w.sim();
    expect(w.fired).toEqual([]);
    w.r.run(w.scene as never, 0.5);
    expect(w.fired).toEqual([4, 4, 4, 4]);
    expect(w.live().stands).toBe(0);
    expect(w.live().held).toBe(0);
    expect(w.r.enemies.children.every((c) => !c.visible)).toBe(true);
    const sounds = w.r.stage.play.mock.calls.map((c) => c[1]);
    expect(sounds.filter((s) => s === 'foe_glass_hit').length).toBeGreaterThanOrEqual(5);
    expect(sounds).toContain('molt');
  });

  it('turns the boss into a fish when the big flask lands: its own picture is put away, the fish and its chip are drawn on the enemy\'s own body', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.2);
    expect(w.live().fish[0]?.mode).toBe('wait');
    expect(visibleOf(view)).toBe(true);
    w.r.run(w.scene as never, 0.3);
    expect(w.live().fish[0]).toMatchObject({ mode: 'swim', loud: true, hidden: true });
    expect(visibleOf(view)).toBe(false);
    // The fish is a child of the enemy's body (it squashes with a hit, sorts with the enemies), the chip of its root.
    expect(view.body.children.some((c) => c.label === 'sp-fish')).toBe(true);
    expect(view.root.children.some((c) => c.label === 'sp-fish-chip')).toBe(true);
    // The smoke, the glass, the ring, a nudge.
    expect(w.r.stage.fx.ps.burst).toHaveBeenCalled();
    expect(w.r.stage.shake).toHaveBeenCalledTimes(1);
  });

  it('draws the fish\'s ring from the battle clock: full at the cast, empty when its time is up', () => {
    const w = fishWorld();
    w.sim();
    w.r.run(w.scene as never, 0.6);
    const chip = (w.r.views.get(100) as View).root.children.find((c) => c.label === 'sp-fish-chip') as Container;
    expect(chip.visible).toBe(true);
    const left0 = w.live().fish[0]?.left as number;
    expect(left0).toBeGreaterThan(3);
    expect(left0).toBeLessThan(3.5);
    w.r.run(w.scene as never, 2, 0);
    expect(w.live().fish[0]?.left).toBe(left0);
    w.r.run(w.scene as never, 1);
    expect(w.live().fish[0]?.left as number).toBeCloseTo(left0 - 1, 1);
  });

  it('puts the boss\'s picture back on `fishEnd`, shakes it off, shows the lock for `lock` seconds and then lets go of everything', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 1);
    // Four seconds after the cast the simulation says it wore off.
    w.r.battle.time = 3 + 4;
    w.boss.fish = false;
    w.r.battle.events.emit('fishEnd', { enemy: w.boss, lock: 8 });
    expect(visibleOf(view)).toBe(true);
    expect(view.body.children.some((c) => c.label === 'sp-fish')).toBe(false);
    expect(w.live().fish[0]).toMatchObject({ mode: 'back' });
    // Pink smoke and a plink on the way out.
    const sounds = w.r.stage.play.mock.calls.map((c) => c[1]);
    expect(sounds.filter((s) => s === 'molt').length).toBeGreaterThanOrEqual(2);
    // It rocks for a moment, then stands still again.
    w.r.run(w.scene as never, 0.2);
    expect(view.sprite.rotation).not.toBe(0);
    w.r.run(w.scene as never, 0.5);
    expect(view.sprite.rotation).toBe(0);
    expect(w.live().fish[0]).toMatchObject({ mode: 'lock' });
    const chip = view.root.children.find((c) => c.label === 'sp-fish-chip') as Container;
    expect(chip.visible).toBe(true);
    w.r.run(w.scene as never, 8);
    expect(w.live().fish).toEqual([]);
    expect(view.root.children.some((c) => c.label === 'sp-fish-chip')).toBe(false);
  });

  it('puts everything away at once when the fish dies as a fish, for the boss\'s own death to play', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    w.r.battle.events.emit('enemyDie', { enemy: w.boss, x: 400, y: 45, fish: 40, purr: 1, killer: null });
    expect(visibleOf(view)).toBe(true);
    expect(view.body.children.some((c) => c.label === 'sp-fish')).toBe(false);
    expect(view.root.children.some((c) => c.label === 'sp-fish-chip')).toBe(false);
    expect(w.live().fish).toEqual([]);
  });

  it('shows a fish the stage rule dropped quietly: no flask, no smoke, no sound, but the fish is there (it is the simulation\'s state)', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim(w.bigData, [], false);
    expect(w.live().throws).toBe(0);
    expect(w.live().fish[0]).toMatchObject({ mode: 'swim', loud: false, hidden: true });
    expect(visibleOf(view)).toBe(false);
    expect(w.r.stage.play).not.toHaveBeenCalled();
    expect(w.r.stage.shake).not.toHaveBeenCalled();
    // It ends loudly or not as the simulation says; it never plays the "plink" of a cast that was not shown.
    w.r.battle.events.emit('fishEnd', { enemy: w.boss, lock: 8 });
    expect(w.r.stage.play).not.toHaveBeenCalled();
    expect(visibleOf(view)).toBe(true);
  });

  it('starts over on a new cast of the same enemy: one record, one chip, one fish on its body, never a second of anything', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    w.boss.fish = false;
    w.r.battle.events.emit('fishEnd', { enemy: w.boss, lock: 8 });
    w.r.run(w.scene as never, 0.6);
    expect(w.live().fish[0]?.mode).toBe('lock');
    // The lock ran out in the simulation's mind a moment before the scene's (a tick of difference), and the alchemist casts again.
    w.r.battle.enemies = [w.boss, ...w.smalls];
    w.sim();
    expect(w.live().fish).toHaveLength(1);
    expect(w.live().fish[0]).toMatchObject({ mode: 'wait', loud: true });
    expect(view.root.children.filter((c) => c.label === 'sp-fish-chip')).toHaveLength(0);
    w.r.run(w.scene as never, 0.6);
    expect(w.live().fish[0]?.mode).toBe('swim');
    expect(view.root.children.filter((c) => c.label === 'sp-fish-chip')).toHaveLength(1);
    expect(view.body.children.filter((c) => c.label === 'sp-fish')).toHaveLength(1);
  });

  it('finds a fish it never heard of by the enemy\'s own state', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.boss.fish = true;
    w.r.run(w.scene as never, 0.2);
    expect(w.live().fish[0]).toMatchObject({ uid: 100, mode: 'swim', loud: false });
    expect(visibleOf(view)).toBe(false);
  });

  it('is timed by the battle clock: a popup stands the flasks in the air, and 3x keeps the real floor', () => {
    const a = fishWorld();
    a.sim();
    a.r.run(a.scene as never, 0.1);
    const before = a.live();
    a.r.run(a.scene as never, 2.5, 0);
    expect(a.live()).toEqual(before);
    expect(a.fired).toEqual([]);
    const b = fishWorld();
    b.sim();
    b.r.run(b.scene as never, 0.1, 3);
    // 0.3 battle seconds have run, but only 0.1 real ones: the small flasks (0.16 s floor) are still in the air.
    expect(b.fired).toEqual([]);
    b.r.run(b.scene as never, 0.3, 3);
    expect(b.fired).toHaveLength(4);
    expect(b.live().fish[0]?.mode).toBe('swim');
  });

  it('swims by the battle clock: the flop, the squash and the countdown stand still under a popup, and go on with the clock (also at 3x)', () => {
    const w = fishWorld();
    w.sim();
    w.r.run(w.scene as never, 0.9);
    const body = (): Container => (w.r.views.get(100) as View).root.getChildByLabel('sp-fish', true) as Container;
    const pose = (): number[] => {
      const b = body();
      return [b.rotation, b.scale.x, b.scale.y, b.skew.y, b.y, b.alpha, w.live().fish[0]?.left as number];
    };
    const before = pose();
    expect(before.every((v) => Number.isFinite(v))).toBe(true);
    w.r.run(w.scene as never, 2.5, 0);
    expect(pose()).toEqual(before);
    w.r.run(w.scene as never, 0.1);
    expect(pose()).not.toEqual(before);
    // At 3x the clock of the flop runs 3 times as fast as real time, not faster and not slower: the countdown loses the battle seconds.
    const left = w.live().fish[0]?.left as number;
    w.r.run(w.scene as never, 0.2, 3);
    expect(left - (w.live().fish[0]?.left as number)).toBeCloseTo(0.6, 1);
  });

  it('pops in and shakes itself back by the battle clock too: a popup stands the pop-in and the rock still', () => {
    const a = fishWorld();
    a.sim();
    const fishOf = (): Container | null => (a.r.views.get(100) as View).root.getChildByLabel('sp-fish', true) as Container | null;
    // Run until the big flask has landed and the fish is on the boss, a frame into its pop-in.
    for (let f = 0; f < 240 && !fishOf(); f++) a.r.run(a.scene as never, 1 / 60);
    a.r.run(a.scene as never, 0.03);
    const pop = (): number[] => {
      const b = fishOf() as Container;
      return [b.scale.x, b.scale.y, b.alpha];
    };
    const early = pop();
    a.r.run(a.scene as never, 2, 0);
    expect(pop()).toEqual(early);
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 1);
    w.r.battle.time = 3 + 4;
    w.boss.fish = false;
    w.r.battle.events.emit('fishEnd', { enemy: w.boss, lock: 8 });
    w.r.run(w.scene as never, 0.1);
    const rock = view.sprite.rotation;
    expect(rock).not.toBe(0);
    w.r.run(w.scene as never, 2, 0);
    expect(view.sprite.rotation).toBe(rock);
    expect(w.live().fish[0]).toMatchObject({ mode: 'back' });
  });

  it('a boss that wears off before its flask landed never shows a fish', () => {
    const w = fishWorld();
    w.sim();
    w.boss.fish = false;
    w.r.battle.events.emit('fishEnd', { enemy: w.boss, lock: 8 });
    expect(w.live().fish).toEqual([]);
    w.r.run(w.scene as never, 1);
    expect(visibleOf(w.r.views.get(100) as View)).toBe(true);
  });

  it('victory or defeat flies every kill it kept, puts the boss\'s picture back and draws nothing more', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.05);
    expect(w.fired).toEqual([]);
    w.scene.clear();
    expect(w.fired).toEqual([4, 4, 4, 4]);
    expect(w.live()).toEqual({ throws: 0, stands: 0, fish: [], held: 0 });
    expect(visibleOf(view)).toBe(true);
    // The same, with a fish out.
    const v = fishWorld();
    const view2 = v.r.views.get(100) as View;
    v.sim();
    v.r.run(v.scene as never, 0.6);
    expect(visibleOf(view2)).toBe(false);
    v.scene.clear();
    expect(visibleOf(view2)).toBe(true);
    expect(view2.body.children.some((c) => c.label === 'sp-fish')).toBe(false);
    expect(view2.root.children.some((c) => c.label === 'sp-fish-chip')).toBe(false);
  });

  it('after a clear it can be used again (a revive)', () => {
    const w = fishWorld();
    w.sim();
    w.scene.clear();
    const again = fishWorld();
    again.sim();
    again.r.run(again.scene as never, 0.6);
    expect(again.live().fish[0]?.mode).toBe('swim');
  });

  it('draws the fish where the enemy stands, on the screen, and facing the way it walks', () => {
    const w = fishWorld();
    w.boss.x = 710;
    (w.r.battle.enemies[0] as EnemyState).angle = Math.PI;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    const body = (w.r.views.get(100) as View).body.children.find((c) => c.label === 'sp-fish') as Container;
    expect(body.scale.x).toBeLessThan(0);
    // The landing place of the flask is pulled in like every big body (`bodyX`).
    expect(bodyX(710, 114)).toBeLessThan(710);
  });

  it('a boss hit while it swims squashes the fish with the body it is a child of', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    view.body.scale.set(1.3, 0.8);
    const fishBody = view.body.children.find((c) => c.label === 'sp-fish') as Container;
    expect(fishBody.parent).toBe(view.body);
  });

  it('puts the chip one place further from the bar when the enemy already wears a status sticker', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    const chip = view.root.children.find((c) => c.label === 'sp-fish-chip') as Container;
    const x0 = chip.x;
    w.boss.slow = 0.4;
    w.r.run(w.scene as never, 0.2);
    expect(chip.x).toBeGreaterThan(x0);
  });

  it('reuses its pieces: forty casts never make more than ten flasks and four fish', () => {
    const w = fishWorld();
    for (let i = 0; i < 40; i++) {
      w.sim();
      w.r.battle.enemies = [w.boss, ...w.smalls];
      w.r.run(w.scene as never, 0.1);
    }
    const flasks = w.r.front.children.filter((c) => c instanceof Sprite);
    expect(flasks.length).toBeLessThanOrEqual(10);
    expect(w.r.enemies.children.length).toBeLessThanOrEqual(10);
    expect(w.live().fish.length).toBeLessThanOrEqual(4);
    w.scene.clear();
    expect(w.live().fish).toEqual([]);
  });

  it('under reduced motion nothing flies, flops or smokes, and nothing shakes; the fish still appears and the kills still fly', () => {
    const w = fishWorld(2, true);
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    expect(w.fired).toHaveLength(4);
    expect(w.live().fish[0]?.mode).toBe('swim');
    expect(visibleOf(view)).toBe(false);
    expect(w.r.stage.fx.ps.burst).not.toHaveBeenCalled();
    expect(w.r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(w.r.stage.fx.fleck).not.toHaveBeenCalled();
    expect(w.r.stage.shake).not.toHaveBeenCalled();
    const body = view.body.children.find((c) => c.label === 'sp-fish') as Container;
    w.r.run(w.scene as never, 0.5);
    expect(body.rotation).toBe(0);
  });

  it('on the low tier the fish blows no bubbles and drips no water, and the smoke is thinner', () => {
    const low = fishWorld(0);
    low.sim();
    low.r.run(low.scene as never, 2);
    const lowBursts = low.r.stage.fx.ps.burst.mock.calls.length;
    const high = fishWorld(2);
    high.sim();
    high.r.run(high.scene as never, 2);
    expect(lowBursts).toBeLessThan(high.r.stage.fx.ps.burst.mock.calls.length);
  });

  it('destroy releases its listeners, flies what it kept and takes everything off the field', () => {
    const w = fishWorld();
    const view = w.r.views.get(100) as View;
    w.sim();
    w.r.run(w.scene as never, 0.6);
    const before = w.r.removed;
    w.scene.destroy();
    expect(w.r.removed - before).toBe(3);
    expect(visibleOf(view)).toBe(true);
    expect(w.r.front.children.filter((c) => !c.destroyed)).toHaveLength(0);
    expect(w.r.enemies.children.filter((c) => !c.destroyed)).toHaveLength(0);
  });

  it('fails alone: a throw in its own listener switches it off and does not unwind into the simulation', () => {
    const w = fishWorld();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    (w.r.env.ctx as unknown as { enemyView: () => never }).enemyView = () => {
      throw new Error('boom');
    };
    // A fish the stage rule dropped is shown from the `status` event: the throw happens inside the simulation's own emit.
    expect(() => w.sim(w.bigData, [], false)).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    expect(w.live().fish).toEqual([]);
    // Switched off: the next event does nothing and does not log again.
    expect(() => w.r.battle.events.emit('status', { enemy: w.boss, kind: 'fish', duration: 4 })).not.toThrow();
    expect(err).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});

describe('the fish\'s chip and face', () => {
  it('paints a pink chip and a crossed-out one on first use, in code', () => {
    expect(chipTexture('fish')).toBeDefined();
    expect(chipTexture('lock')).toBeDefined();
    expect(chipTexture('fish')).toBe(chipTexture('fish'));
    expect(chipTexture('fish')).not.toBe(chipTexture('lock'));
    expect(FISH_PINK).toBeGreaterThan(0);
  });

  it('redraws the ring only when it crosses a step of a thirty-sixth of a turn', () => {
    const chip = new FishChip();
    chip.set('fish', 1);
    expect(chip.filled).toBe(36);
    const g = (chip as unknown as { ring: { clear: () => void } }).ring;
    const clear = vi.spyOn(g, 'clear');
    chip.set('fish', 0.999);
    chip.set('fish', 0.985);
    expect(clear).toHaveBeenCalledTimes(0);
    chip.set('fish', 0.5);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(chip.filled).toBe(18);
    chip.set('fish', 0);
    expect(chip.filled).toBe(0);
    chip.set('lock', 0.25);
    expect(chip.shows).toBe('lock');
    expect(chip.filled).toBe(9);
    chip.destroy();
  });

  it('bakes no face where there is no picture to draw from (a test), and says so instead of throwing', () => {
    forgetFaces();
    expect(faceDisc(Texture.WHITE, 'boss_test')).toBeNull();
    expect(() => faceDisc(Texture.WHITE, 'boss_test')).not.toThrow();
  });
});

// ───────────────────────────── a real battle ─────────────────────────────

describe('against the real simulation', () => {
  /** The alchemist at 7 with a paw at 2 and a sling at 12, a boss standing on the top road and four weaklings: the cast of `sim.spFish.test.ts`. */
  function battle() {
    const sim = newSim();
    quietWave(sim);
    const alch = put(sim, 7, 't_alch', 0);
    put(sim, 2, 'w_paw', 0);
    put(sim, 12, 'r_sling', 0);
    const boss = simFoe(sim, 'boss_blender', 300);
    boss.frozen = true;
    boss.capTokens = Infinity;
    const weak = [0, 1, 2, 3].map((i) => {
      const e = simFoe(sim, 'dust', 120 + i * 30, 1e9);
      e.hp = 0.2 * e.baseHp || 5;
      e.maxHp = e.hp;
      e.frozen = true;
      return e;
    });
    return { sim, alch, boss, weak };
  }

  it('sends its events in the order the scene stands on: the cast first, then the status, then each small one\'s reward and its death', () => {
    const { sim, alch } = battle();
    const order: string[] = [];
    for (const type of ['spCast', 'status', 'fish', 'enemyDie', 'fishEnd'] as const) {
      (sim.events.on as (t: string, fn: (e: unknown) => void) => void)(type, (e) => {
        const x = e as { kind?: string; reason?: string; transmuted?: boolean; skill?: string };
        if (type === 'spCast' && x.skill !== 'fish') return;
        order.push(type === 'status' ? `status:${x.kind}` : type === 'fish' ? `fish:${x.reason}` : type === 'enemyDie' ? `die:${x.transmuted ? 't' : 'n'}` : type);
      });
    }
    alch.sp = 1;
    advance(sim, 0.4);
    expect(order.slice(0, 2)).toEqual(['spCast', 'status:fish']);
    const rest = order.slice(2);
    expect(rest.length).toBeGreaterThan(0);
    for (let i = 0; i < rest.length; i += 2) expect(rest.slice(i, i + 2)).toEqual(['fish:kill', 'die:t']);
  });

  it('delivers the cast BEFORE it takes the small ones off the field: they are still in the battle list while the scene hears the cast (the stand-ins depend on it)', () => {
    const { sim, alch, weak } = battle();
    const seen: number[][] = [];
    sim.events.on('spCast', (e) => {
      if (e.skill !== 'fish') return;
      seen.push(weak.map((w) => (sim.enemies.includes(w) ? 1 : 0)));
    });
    alch.sp = 1;
    advance(sim, 0.4);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([1, 1, 1, 1]);
    // And by the end of the same tick they are gone from the list (the reward and the death followed).
    expect(weak.every((w) => !sim.enemies.includes(w))).toBe(true);
  });

  it('plays a whole cast: expects every kill, flies every reward after the flask, shows the fish for the time the simulation says and ends with the lock', () => {
    const { sim, alch, boss, weak } = battle();
    const r = rig();
    // The scene is made over the real battle; the stage is the stand-in.
    r.battle = sim as never;
    const view = enemyView();
    r.views.set(boss.uid, view);
    for (const e of weak) r.views.set(e.uid, enemyView());
    r.env = { ...r.env, battle: sim as unknown as BattleApi };
    const holds = fishHoldsOf(sim);
    const fired: number[] = [];
    holds.fire = (e) => fired.push(e.delta);
    // What the death director does with the events, by hand.
    sim.events.on('fish', (e) => {
      if (!holds.hold(e)) fired.push(-e.delta);
    });
    const scene = makeFish(r.env);
    sim.events.on('spCast', (e) => {
      if (e.skill === 'fish') scene.cast(e as Parameters<typeof scene.cast>[0]);
    });
    let last = sim.time;
    const frames = (seconds: number): void => {
      const n = Math.round(seconds / TICK);
      for (let i = 0; i < n; i++) {
        sim.step(TICK);
        const dt = sim.time - last;
        last = sim.time;
        scene.update?.(dt, dt);
      }
    };
    const live = () => (scene as unknown as { live(): FishLive }).live();
    alch.sp = 1;
    frames(0.1);
    // The cast happened: nothing flew yet.
    expect(live().throws).toBeGreaterThan(0);
    expect(fired.filter((d) => d < 0)).toEqual([]);
    expect(holds.size + fired.length).toBeGreaterThan(0);
    frames(0.6);
    // All the kills the scene expected flew AFTER its flasks landed, with the simulation's own doubled bounty.
    expect(fired.length).toBeGreaterThan(0);
    expect(fired.every((d) => d > 0)).toBe(true);
    expect(live().fish[0]).toMatchObject({ uid: boss.uid, mode: 'swim' });
    expect(boss.fish).toBe(true);
    expect(view.sprite.visible).toBe(false);
    // The fish wears off when the simulation says (4 s after the cast, give or take a tick), and the picture follows within a frame.
    const row = SP_ROWS.fish;
    let ended = false;
    sim.events.on('fishEnd', () => (ended = true));
    frames(row.fishTime.boss);
    expect(ended).toBe(true);
    expect(boss.fish).toBe(false);
    expect(view.sprite.visible).toBe(true);
    expect(['back', 'lock']).toContain(live().fish[0]?.mode);
    frames(row.fishLock.boss + 1);
    expect(live().fish).toEqual([]);
    scene.destroy();
  });

  it('drives the bard\'s scene over a real cast: the simulation has written the gauges, the ring holds the old ones until the notes land', () => {
    const sim = newSim();
    quietWave(sim);
    const bard = put(sim, 12, 't_bard', 0);
    const viking = put(sim, 6, 'w_viking', 0);
    viking.sp = 0.3;
    const before = viking.sp;
    const r = rig();
    r.env = { ...r.env, battle: sim as unknown as BattleApi };
    const scene = makeJam(r.env);
    sim.events.on('spCast', (e) => {
      if (e.skill === 'jam') scene.cast(e as Parameters<typeof scene.cast>[0]);
    });
    bard.sp = 1;
    bard.spCheckAt = 0;
    sim.step(TICK);
    sim.step(TICK);
    expect(viking.sp).toBeGreaterThan(before + 0.15);
    expect(ringHeld(viking.uid)).toBeCloseTo(before, 1);
    let last = sim.time;
    for (let i = 0; i < 120; i++) {
      sim.step(TICK);
      const dt = sim.time - last;
      last = sim.time;
      scene.update?.(dt, dt);
    }
    expect(ringHeld(viking.uid)).toBeUndefined();
    scene.destroy();
  });
});
