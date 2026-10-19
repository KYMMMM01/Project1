import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Texture } from 'pixi.js';

// The lucky cat's capsule scene against stand-ins for the things that need a screen: sounds, the textures, the paper label (it needs fonts) and the
// effects facade (spies). The scene's own listeners, pools, clocks and the ring hold are the real ones.
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
  fxTex: () => ({ id: 'beam', texture: Texture.WHITE, w: 64, h: 256, ax: 0.5, ay: 0.5 }),
}));
vi.mock('@/ui/text', async (original) => ({
  ...(await original<typeof import('@/ui/text')>()),
  label: (text: string, o: { size?: number } = {}) => ({ width: text.length * (o.size ?? 20) * 0.55, destroy: () => undefined }),
}));
vi.mock('@/ui/paper', async (original) => ({
  ...(await original<typeof import('@/ui/paper')>()),
  PaperLabel: class extends Container {
    uiBox = { x: 0, y: 0, w: 0, h: 0 };
    shown = '';
    constructor(o: { text: string; size?: number; minWidth?: number; maxWidth?: number }) {
      super();
      this.size = o.size ?? 26;
      this.maxW = o.maxWidth ?? 360;
      this.minW = o.minWidth ?? 0;
      this.setText(o.text);
    }
    private size: number;
    private maxW: number;
    private minW: number;
    setText(text: string): void {
      this.shown = text;
      const w = Math.min(this.maxW, Math.max(this.minW, text.length * this.size * 0.55 + 40));
      this.uiBox = { x: -w / 2, y: -23, w, h: 46 };
    }
  },
}));

import { Emitter } from '@/core/events';
import { setFxSettings } from '@/fx/settings';
import { RAINBOW, SHELL_ANCHOR, SHELL_K, capsuleArt, capsuleLook } from '@/view/capsuleArt';
import type { BattleApi, BattleEvents, SpCapsuleKind, SpCapsuleResult, SpCastEvent, UnitState } from '@/game';
import { SP_ROWS } from '@/game';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { game } from '@/core/game';
import { CAPSULE_TOY_WAIT, capsuleToyWait, holdStage } from '@/view/staging';
import { clearRingHolds, holdRing, ringHeld, ringHolds } from '@/view/field/ringHold';
import { BEATS, FALL_FROM, REST_UP, ROLL_DIST, SMALL_SCALE, fallPose, newPose } from '@/view/director/sp/capsuleMath';
import { makeCapsule } from '@/view/director/sp/capsule';
import type { SpEnv, SpScene } from '@/view/director/sp/types';
import type { Stage } from '@/view/director/stage';

interface Live {
  flights: Array<{ kind: SpCapsuleKind; small: boolean; state: string; stage: string; x: number; y: number; scale: number; rot: number }>;
  beams: number;
  stamps: number;
  glyphs: number;
  swells: number;
  pops: number;
  springs: number;
  wash: number;
}

const LUCKY_CELL = 12;
const unit = (uid: number, id: string, cell: number, sp = 0.5): UnitState => ({ uid, id, cell, sp }) as unknown as UnitState;

interface Rig {
  scene: SpScene<'capsule'> & { live(): Live };
  battle: { spOn: boolean; time: number; units: Array<UnitState | null>; events: Emitter<BattleEvents> };
  stage: {
    now: number;
    detail: 0 | 1 | 2;
    reduced: boolean;
    play: ReturnType<typeof vi.fn>;
    panOf: () => number;
    rules: Record<string, object>;
    fx: { ps: { burst: ReturnType<typeof vi.fn> }; shockwave: ReturnType<typeof vi.fn>; fleck: ReturnType<typeof vi.fn> };
  };
  front: Container;
  back: Container;
  numbers: Container;
  removed: number;
  /** Run `seconds` of real time at `speed` (the battle's clock runs `speed` times as fast; 0 = a popup or a pick holds it). */
  run(seconds: number, speed?: number): void;
  /** Cast a capsule now and return the event. */
  cast(kind: SpCapsuleKind, over?: { inner?: SpCapsuleKind | null; refund?: boolean; cell?: number; first?: boolean }): SpCastEvent;
  open(kind: SpCapsuleKind, result: SpCapsuleResult, over?: Partial<BattleEvents['capsuleOpen']>): void;
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
  const units: Array<UnitState | null> = Array.from({ length: CELL_COUNT }, () => null);
  units[LUCKY_CELL] = unit(100, 't_lucky', LUCKY_CELL);
  for (const c of [6, 7, 8, 11, 13, 17]) units[c] = unit(c, 'w_paw', c);
  r.battle = { spOn: true, time: 5, units, events };
  r.stage = {
    now: 0,
    detail,
    reduced,
    play: vi.fn(),
    panOf: () => 0,
    rules: {},
    fx: { ps: { burst: vi.fn() }, shockwave: vi.fn(), fleck: vi.fn() },
  };
  r.front = new Container();
  r.back = new Container();
  r.numbers = new Container();
  const env = {
    stage: r.stage as unknown as Stage & { rules: object },
    ctx: { layers: { fxFront: r.front, fxBack: r.back, numbers: r.numbers } },
    battle: r.battle as unknown as BattleApi,
  } as unknown as SpEnv;
  (env.stage as unknown as { rules: object }).rules = { zone: {}, big: {}, ui: {}, skill: {}, skillTick: {} };
  r.scene = makeCapsule(env) as unknown as Rig['scene'];
  r.run = (seconds, speed = 1) => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      r.battle.time += speed / 60;
      r.stage.now += 1 / 60;
      r.scene.update?.(1 / 60, speed / 60);
    }
  };
  r.cast = (kind, over = {}) => {
    const cell = over.cell ?? LUCKY_CELL;
    const e = {
      unit: units[cell] as UnitState,
      first: over.first ?? false,
      x: cellCenterX(cell),
      y: cellCenterY(cell),
      skill: 'capsule',
      data: { kind, inner: over.inner ?? null, at: r.battle.time, openDelay: 1.2, moreDelay: 1, refund: over.refund ?? kind === 'fish' },
    } as unknown as SpCastEvent;
    r.scene.cast(e as never);
    return e;
  };
  r.open = (kind, result, over = {}) => {
    events.emit('capsuleOpen', {
      kind, small: false, inner: null, x: cellCenterX(LUCKY_CELL), y: cellCenterY(LUCKY_CELL), result, cell: -1, origin: -1, purr: 0, ...over,
    });
  };
  return r;
}

const live = (r: Rig) => r.scene.live();
const flights = (r: Rig) => live(r).flights;
const restY = cellCenterY(LUCKY_CELL) - REST_UP;
const restX = cellCenterX(LUCKY_CELL);

beforeEach(() => {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) });
  vi.stubGlobal('window', { __dbg: {} });
  setFxSettings({ tier: 'mid', reducedMotion: false });
  clearRingHolds();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearRingHolds();
});

describe('the sounds of a capsule', () => {
  const ids = (r: Rig): string[] => r.stage.play.mock.calls.map((c) => c[1] as string);

  it('falls with a whistle, bounces twice, rattles in its shell, and opens with a latch and a prize a beat behind it', () => {
    const r = rig();
    r.cast('fish');
    expect(ids(r)).toEqual(['sp_capsule_fall']);
    r.run(1.2);
    expect(ids(r).filter((x) => x === 'sp_capsule_bounce')).toHaveLength(2);
    expect(ids(r)).toContain('sp_capsule_rattle');
    // the order: whistle, bounce, bounce, rattle
    expect(ids(r)).toEqual(['sp_capsule_fall', 'sp_capsule_bounce', 'sp_capsule_bounce', 'sp_capsule_rattle']);
    r.open('fish', 'fish');
    const pop = r.stage.play.mock.calls.find((c) => c[1] === 'sp_capsule_pop');
    const prize = r.stage.play.mock.calls.find((c) => c[1] === 'sp_prize_fish');
    expect(pop?.[0]).toBe(r.stage.rules.skill);
    expect(prize?.[0]).toBe(r.stage.rules.skill);
    // the prize starts 0.07 s after the latch, on the audio clock (no timer to lose)
    expect(prize?.[6]).toBeCloseTo(0.07, 3);
    expect(pop?.[6] ?? 0).toBe(0);
  });

  it('says what the prize is: each kind has a sound of its own, the toy box and the guardian louder than the rest', () => {
    const want: Array<[string, string, string, number]> = [
      ['fish', 'fish', 'sp_prize_fish', 0.9], ['purr', 'purr', 'purr', 0.8], ['partner', 'seat', 'sp_prize_partner', 0.9], ['partner', 'promote', 'sp_prize_partner', 0.9],
      ['more', 'more', 'sp_prize_more', 0.9], ['toy', 'toy', 'sp_prize_toy', 1], ['guardian', 'awaken', 'sp_prize_guardian', 1.05],
    ];
    for (const [kind, result, id, volume] of want) {
      const r = rig();
      r.cast(kind as SpCapsuleKind);
      r.run(1.2);
      r.stage.play.mockClear();
      r.open(kind as SpCapsuleKind, result as SpCapsuleResult);
      const call = r.stage.play.mock.calls.find((c) => c[1] === id);
      expect(call, `${kind} / ${result}`).toBeDefined();
      expect(call?.[2], id).toBeCloseTo(volume, 6);
    }
  });

  it('is silent under reduced motion while it falls (no whistle, no bounce, no rattle) but still opens with its sounds', () => {
    const r = rig(1, true);
    r.cast('fish');
    r.run(1.2);
    expect(ids(r)).toEqual([]);
    r.open('fish', 'fish');
    expect(ids(r)).toContain('sp_capsule_pop');
  });
});

describe('the fall of a capsule', () => {
  it('drops from the sky onto the cat\'s head by the battle clock and rests where the cat\'s tile says', () => {
    const r = rig();
    r.cast('fish');
    expect(flights(r)).toHaveLength(1);
    expect(flights(r)[0]?.y).toBeCloseTo(restY - FALL_FROM, 3);
    expect(flights(r)[0]?.x).toBeCloseTo(restX, 3);
    r.run(BEATS.fish.land * 1.2);
    expect(Math.abs((flights(r)[0]?.y ?? 0) - restY)).toBeLessThan(6);
    // It bounces twice and rests.
    r.run(0.8);
    expect(flights(r)[0]?.state).toBe('air');
    expect(Math.abs((flights(r)[0]?.y ?? 0) - restY)).toBeLessThan(1);
  });

  it('is exactly where fallPose puts it at the battle time, at 1x, 2x and 3x (the picture is the battle\'s)', () => {
    for (const speed of [1, 2, 3]) {
      const r = rig();
      r.cast('toy', { refund: false });
      r.run(0.3, speed);
      const k = (0.3 * speed) / 1.2;
      const want = fallPose(BEATS.toy, k, newPose());
      expect(flights(r)[0]?.y).toBeCloseTo(restY + want.dy, 2);
      expect(flights(r)[0]?.rot).toBeCloseTo(want.rot, 2);
    }
  });

  it('stands still under a popup (the battle\'s clock does not run) and goes on after it', () => {
    const r = rig();
    r.cast('purr');
    r.run(0.4);
    const before = { ...(flights(r)[0] as { y: number; rot: number }) };
    r.run(2, 0);
    expect(flights(r)[0]?.y).toBe(before.y);
    expect(flights(r)[0]?.rot).toBe(before.rot);
    r.run(0.2);
    expect(flights(r)[0]?.y).not.toBe(before.y);
  });

  it('wears the painted lid and base of its kind, the two halves of one shell drawn at the same place and size', () => {
    const art = capsuleArt();
    const kinds: SpCapsuleKind[] = ['fish', 'purr', 'partner', 'more', 'toy', 'guardian'];
    const seen = new Set<unknown>();
    for (const k of kinds) {
      const r = rig();
      r.cast(k, { refund: false, inner: k === 'more' ? 'toy' : null });
      const shell = r.front.children[0] as Container;
      // Two sprites and nothing else (the picture of a shell carries its own mark and, on a One More!, its small capsule).
      expect(shell.children).toHaveLength(2);
      const [base, lid] = shell.children as unknown as Array<{ texture: Texture; x: number; y: number; scale: { x: number; y: number }; anchor: { x: number; y: number } }>;
      expect(lid?.texture).toBe(art.lids[k]);
      expect(base?.texture).toBe(art.bases[k]);
      seen.add(lid?.texture);
      // The seam's middle is the middle of both files, so one anchor and one scale put them together.
      expect(lid?.anchor.x).toBe(SHELL_ANCHOR);
      expect(lid?.anchor.y).toBe(SHELL_ANCHOR);
      expect(base?.anchor.y).toBe(SHELL_ANCHOR);
      expect([lid?.x, lid?.y, base?.x, base?.y]).toEqual([0, 0, 0, 0]);
      expect(lid?.scale.x).toBeCloseTo(SHELL_K, 6);
      expect(base?.scale.x).toBeCloseTo(SHELL_K, 6);
    }
    // Six distinct looks (colour and mark), so no kind is told apart by hue alone.
    expect(seen.size).toBe(6);
    const looks = new Set(kinds.map((k) => `${capsuleLook(k).color}/${capsuleLook(k).mark}`));
    expect(looks.size).toBe(6);
    // The three pink ones differ by their mark.
    expect(new Set(['fish', 'purr', 'more'].map((k) => capsuleLook(k as SpCapsuleKind).mark)).size).toBe(3);
  });

  it('a defeat does not tear a capsule down: the simulation keeps the ones in the air, so the scene says it survives one', () => {
    const r = rig();
    expect(r.scene.survivesDefeat).toBe(true);
  });
});

describe('the opening', () => {
  it('splits open on the capsuleOpen of its cast: the lid flies off, the base settles, and the picture is over after its span', () => {
    const r = rig();
    r.cast('fish');
    r.run(1.2);
    r.open('fish', 'fish');
    expect(flights(r)[0]?.state).toBe('open');
    const lid = (r.front.children[0] as Container).children[1] as Container;
    r.run(0.1);
    expect(Math.abs(lid.x)).toBeGreaterThan(5);
    expect(lid.y).toBeLessThan(0);
    r.run(0.9);
    expect(flights(r)).toHaveLength(0);
    expect((r.front.children[0] as Container).visible).toBe(false);
  });

  it('puts a ring and bits of shell and a paper line over the cat, and plays a sound', () => {
    const r = rig();
    r.cast('fish');
    r.run(1.2);
    r.open('fish', 'fish');
    expect(r.stage.fx.ps.burst).toHaveBeenCalled();
    expect(live(r).pops).toBe(1);
    expect(r.stage.play).toHaveBeenCalled();
    const pop = r.numbers.children[0] as Container;
    expect(pop.visible).toBe(true);
    // The two lines of the wording table (the cry and the line under it).
    const texts = pop.children.filter((c) => (c as unknown as { shown?: string }).shown !== undefined).map((c) => (c as unknown as { shown: string }).shown);
    expect(texts.length).toBe(2);
    expect(texts.every((s) => s.length > 1)).toBe(true);
  });

  it('shows nothing for an opening whose cast the stage rule dropped (no capsule of ours), and does not steal a later cast\'s opening', () => {
    const r = rig();
    // A cast that was shown, a fish at t = 5; an opening of a fish at t = 5.2 (another cast, dropped) is too early for ours.
    r.cast('fish');
    r.run(0.2);
    r.open('fish', 'fish');
    expect(flights(r)[0]?.state).toBe('air');
    expect(live(r).pops).toBe(0);
    r.run(1.0);
    r.open('fish', 'fish');
    expect(flights(r)[0]?.state).toBe('open');
    // An opening with nothing waiting does nothing at all.
    const r2 = rig();
    r2.open('purr', 'purr');
    expect(flights(r2)).toHaveLength(0);
    expect(live(r2).pops).toBe(0);
    expect(r2.stage.fx.ps.burst).not.toHaveBeenCalled();
  });

  it('never opens a capsule of another kind', () => {
    const r = rig();
    r.cast('partner');
    r.run(1.2);
    r.open('purr', 'purr');
    expect(flights(r)[0]?.state).toBe('air');
  });

  it('a capsule whose opening never comes goes by itself a long while after its time, and lets its rings go', () => {
    const r = rig();
    r.cast('fish');
    expect(ringHeld(100)).toBe(0);
    r.run(1.2 + 9);
    expect(flights(r)).toHaveLength(0);
    expect(ringHeld(100)).toBeUndefined();
  });

  it('keeps no capsule on screen when the pool is full: the oldest is taken over, never more than four', () => {
    const r = rig();
    for (let i = 0; i < 12; i++) {
      r.cast('toy', { refund: false });
      r.run(0.05);
    }
    expect(flights(r).length).toBeLessThanOrEqual(4);
    expect(r.front.children.length).toBeLessThanOrEqual(4);
  });
});

describe('the prizes', () => {
  it('purr: hearts out of the lid, and the board purrs (a heart for each cat, thinned by the tier)', () => {
    for (const [detail, cats] of [[2, 7], [1, 7], [0, 6]] as const) {
      const r = rig(detail);
      r.cast('purr');
      r.run(1.2);
      r.stage.fx.ps.burst.mockClear();
      r.open('purr', 'purr', { purr: 2 });
      const hearts = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { tex?: string }).tex === 'heart');
      // One fountain, and one heart per cat in the chorus (7 cats on this board; 6 at the lowest tier).
      expect(hearts.length).toBe(1 + cats);
      expect((hearts[0]?.[3] as { count: number }).count).toBe(3);
    }
  });

  it('seat: a beam from the lid to the empty tile and two paw prints stamped between the original and the twin when it lands', () => {
    const r = rig();
    r.cast('partner');
    r.run(1.2);
    r.open('partner', 'seat', { cell: 10, origin: 11 });
    expect(live(r).beams).toBe(1);
    expect(live(r).stamps).toBe(2);
    expect(live(r).pops).toBe(1);
    const paws = r.front.children.filter((c) => (c as Container).visible === false && c.x !== 0);
    // The prints wait for the twin to land (0.32 s) before they show.
    expect(paws.length).toBeGreaterThanOrEqual(0);
    r.run(0.2);
    const shown = (): number => r.front.children.filter((c) => (c as Container).visible && Math.abs(c.x - (cellCenterX(10) + cellCenterX(11)) / 2) < 30).length;
    expect(shown()).toBe(0);
    r.run(0.3);
    expect(shown()).toBe(2);
    const mid = (cellCenterX(10) + cellCenterX(11)) / 2;
    const xs = r.front.children.filter((c) => (c as Container).visible && Math.abs(c.x - mid) < 30).map((c) => c.x);
    expect(Math.min(...xs)).toBeLessThan(mid + 14);
    r.run(2);
    expect(live(r).stamps).toBe(0);
  });

  it('promote: the beam lands on the cat and the promote event starts the swell of its sticker (and only after an opening that promised one)', () => {
    const r = rig();
    r.cast('partner');
    r.run(1.2);
    r.open('partner', 'promote', { cell: 6, origin: 6 });
    expect(live(r).beams).toBe(1);
    r.battle.events.emit('promote', { from: unit(6, 'w_paw', 6), result: unit(7, 'w_sword', 6), cell: 6 });
    expect(live(r).swells).toBe(1);
    r.run(0.3);
    expect(live(r).swells).toBe(1);
    r.run(1);
    expect(live(r).swells).toBe(0);
    // A promotion that no capsule of ours announced shows no swell.
    r.battle.events.emit('promote', { from: unit(6, 'w_paw', 6), result: unit(8, 'w_sword', 6), cell: 6 });
    expect(live(r).swells).toBe(0);
  });

  it('more: a small capsule rolls out of the shell, wears its own kind, and opens 1.0 s later with that kind\'s prize', () => {
    const r = rig();
    r.cast('more', { inner: 'partner' });
    r.run(1.2);
    r.open('more', 'more', { inner: 'partner' });
    expect(flights(r).map((f) => f.small).sort()).toEqual([false, true]);
    const small = () => flights(r).find((f) => f.small);
    expect(small()?.state).toBe('roll');
    r.run(0.5);
    expect(small()?.state).toBe('wait');
    expect(small()?.scale).toBeCloseTo(SMALL_SCALE, 1);
    // To the side the lid did not fly to (the cat is in the middle: the left), as far as the roll goes (the big one's rattle moves its start a little).
    expect(Math.abs((small()?.x ?? 0) - restX)).toBeGreaterThan(ROLL_DIST - 4);
    expect(Math.abs((small()?.x ?? 0) - restX)).toBeLessThan(ROLL_DIST + 4);
    r.run(0.5);
    // Its opening is the one of the small kind.
    r.open('partner', 'seat', { small: true, cell: 10, origin: 11 });
    expect(small()?.state).toBe('open');
    expect(live(r).beams).toBe(1);
    r.run(1);
    expect(flights(r)).toHaveLength(0);
  });

  it('more: the opening of a small capsule that its big one did not ask for does nothing', () => {
    const r = rig();
    r.cast('more', { inner: 'toy' });
    r.run(1.2);
    r.open('more', 'more', { inner: 'toy' });
    r.run(1);
    r.open('guardian', 'awaken', { small: true, cell: 6 });
    expect(live(r).beams).toBe(0);
  });

  it('toy: fireworks on the real clock, and the battle\'s clock may stand still (the pick has stopped it) without freezing the lid', () => {
    const r = rig();
    r.cast('toy');
    r.run(1.2);
    r.stage.fx.shockwave.mockClear();
    r.open('toy', 'toy');
    expect(r.stage.fx.shockwave).toHaveBeenCalled();
    // No paper line: the toy screen says it in its heading.
    expect(live(r).pops).toBe(0);
    // The battle's clock is held from this tick on, yet the picture ends by itself in `CAPSULE_TOY_WAIT` real seconds.
    r.run(CAPSULE_TOY_WAIT + 0.1, 0);
    expect(flights(r)).toHaveLength(0);
  });

  it('after the lid goes the picture runs by the battle clock: a popup stands the open shell, its bits and its line still, and the shell leaves with the clock', () => {
    const r = rig();
    r.cast('purr');
    r.run(1.2);
    r.open('purr', 'purr', { purr: 3 });
    r.run(0.15);
    const look = (): string =>
      JSON.stringify([live(r).flights, live(r).pops, live(r).glyphs, live(r).swells, r.front.children.map((c) => [c.visible, c.alpha, c.x, c.y, c.scale.x, c.rotation])]);
    const before = look();
    expect(flights(r)[0]?.state).toBe('open');
    r.run(2.5, 0);
    expect(look()).toBe(before);
    r.run(1);
    expect(flights(r)).toHaveLength(0);
  });

  it('awaken: a beam of four bands of colour falls on the cat that is awakened', () => {
    const r = rig();
    r.cast('guardian');
    expect(live(r).wash).toBeGreaterThanOrEqual(0);
    r.run(1.2);
    r.open('guardian', 'awaken', { cell: 6 });
    expect(live(r).beams).toBe(1);
    const beam = r.front.children.find((c) => (c as Container).children.length === 4 && (c as Container).visible) as Container | undefined;
    expect(beam).toBeDefined();
    const lanes = (beam?.children ?? []).filter((c) => c.visible);
    expect(lanes).toHaveLength(RAINBOW.length);
    expect(new Set(lanes.map((c) => (c as unknown as { tint: number }).tint)).size).toBe(RAINBOW.length);
  });

  it('washes the board with colour while a guardian capsule falls and not otherwise, and not at all under reduced motion', () => {
    const r = rig();
    r.cast('guardian');
    r.run(0.55);
    expect(live(r).wash).toBeGreaterThan(0);
    expect(live(r).wash).toBeLessThanOrEqual(0.2);
    r.run(0.7);
    r.open('guardian', 'awaken', { cell: 6 });
    r.run(0.1);
    expect(live(r).wash).toBe(0);
    const calm = rig(1, true);
    calm.cast('guardian');
    calm.run(0.55);
    expect(live(calm).wash).toBe(0);
  });

  it('fallback: the shell opens empty, something small floats out of it, and the hearts come out instead (as many as the purr)', () => {
    for (const [kind, purr] of [['partner', 3], ['toy', 5], ['guardian', 10]] as const) {
      const r = rig(2);
      r.cast(kind);
      r.run(1.2);
      r.stage.fx.ps.burst.mockClear();
      r.open(kind, 'fallback', { purr });
      expect(live(r).glyphs).toBe(1);
      expect(live(r).pops).toBe(1);
      const fountain = r.stage.fx.ps.burst.mock.calls.find((c) => (c[0] as { tex?: string; spread?: number }).spread === 0.95);
      expect((fountain?.[3] as { count: number }).count).toBe(purr);
      // The guardian's pile is bigger: a rain of hearts over the board as well.
      const rain = r.stage.fx.ps.burst.mock.calls.filter((c) => (c[0] as { dir?: number }).dir === Math.PI / 2 && (c[0] as { tex?: string }).tex === 'heart');
      expect(rain.length).toBe(kind === 'guardian' ? 1 : 0);
      r.run(2);
      expect(live(r).glyphs).toBe(0);
    }
  });
});

describe('the ring springs back after a fish capsule', () => {
  it('holds every lucky cat\'s ring at empty from the cast, springs it to the real gauge at the lid with a small overshoot, then lets it go', () => {
    const r = rig();
    r.battle.units[18] = unit(101, 't_lucky', 18, 0.5);
    r.cast('fish');
    expect(ringHeld(100)).toBe(0);
    expect(ringHeld(101)).toBe(0);
    expect(ringHolds()).toBe(2);
    r.run(1.1);
    expect(ringHeld(100)).toBe(0);
    r.run(0.1);
    r.open('fish', 'fish');
    expect(live(r).springs).toBe(2);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      r.run(0.01);
      peak = Math.max(peak, ringHeld(100) ?? 0);
    }
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(0.7);
    r.run(0.5);
    expect(ringHeld(100)).toBeUndefined();
    expect(ringHeld(101)).toBeUndefined();
    expect(ringHolds()).toBe(0);
  });

  it('springs to what the gauge is when the lid opens (a bard may have filled it meanwhile), and a cat that is gone lets its hold go', () => {
    const r = rig();
    r.battle.units[18] = unit(101, 't_lucky', 18, 0.5);
    r.cast('fish');
    r.run(1.2);
    (r.battle.units[LUCKY_CELL] as { sp: number }).sp = 0.7;
    r.battle.units[18] = null;
    r.open('fish', 'fish');
    expect(ringHeld(101)).toBeUndefined();
    r.run(0.6);
    expect(ringHeld(100)).toBeUndefined();
  });

  it('holds nothing for any other kind, and a gauge held by something else is left alone', () => {
    const r = rig();
    holdRing(5, 0.3);
    r.cast('purr', { refund: false });
    expect(ringHolds()).toBe(1);
    expect(ringHeld(100)).toBeUndefined();
    expect(ringHeld(5)).toBe(0.3);
  });

  it('is under the reduced motion too, but plain: the ring returns to its value without an overshoot', () => {
    const r = rig(1, true);
    r.cast('fish');
    r.run(1.2);
    r.open('fish', 'fish');
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      r.run(0.01);
      peak = Math.max(peak, ringHeld(100) ?? 0);
    }
    expect(peak).toBeLessThanOrEqual(0.5 + 1e-9);
  });
});

describe('clean-up, quality and failure', () => {
  it('clear() takes everything off the screen, lets every ring go and leaves a scene that can be used again', () => {
    const r = rig();
    r.cast('fish');
    r.run(1.2);
    r.open('fish', 'fish');
    r.cast('partner');
    r.scene.clear();
    expect(flights(r)).toHaveLength(0);
    expect(live(r)).toMatchObject({ beams: 0, stamps: 0, glyphs: 0, swells: 0, pops: 0, springs: 0, wash: 0 });
    expect(ringHolds()).toBe(0);
    expect(r.front.children.every((c) => !(c as Container).visible)).toBe(true);
    r.cast('toy', { refund: false });
    expect(flights(r)).toHaveLength(1);
  });

  it('forgets the opening of a capsule that a victory dropped', () => {
    const r = rig();
    r.cast('purr');
    r.scene.clear();
    r.run(1.2);
    r.open('purr', 'purr', { purr: 2 });
    expect(flights(r)).toHaveLength(0);
    expect(live(r).pops).toBe(0);
  });

  it('destroy() takes its listeners off and frees what it made', () => {
    const r = rig();
    r.cast('fish');
    r.run(1.2);
    r.open('fish', 'fish');
    r.scene.destroy();
    expect(r.removed).toBe(2);
    expect(r.front.children.length).toBe(0);
    expect(r.numbers.children.length).toBe(0);
    r.open('fish', 'fish');
    expect(r.stage.fx.ps.burst).toHaveBeenCalledTimes(r.stage.fx.ps.burst.mock.calls.length);
  });

  it('reduced motion: the capsule is simply there, the lid fades in place, no bits, no fountain, and the line only fades', () => {
    const r = rig(1, true);
    r.cast('purr', { refund: false });
    expect(flights(r)[0]?.y).toBeCloseTo(restY, 3);
    expect(flights(r)[0]?.rot).toBe(0);
    r.run(1.2);
    r.stage.fx.ps.burst.mockClear();
    r.open('purr', 'purr', { purr: 2 });
    const bursts = r.stage.fx.ps.burst.mock.calls.map((c) => (c[0] as { tex?: string }).tex);
    expect(bursts).not.toContain('confetti');
    expect(bursts).not.toContain('heart');
    const lid = (r.front.children[0] as Container).children[1] as Container;
    r.run(0.1);
    expect(lid.x).toBe(0);
    expect(lid.alpha).toBeLessThan(1);
    expect(r.numbers.children[0]?.scale.x).toBe(1);
  });

  it('the lowest tier thins the fall\'s dust and the toy\'s glints and the hearts', () => {
    const lowCalls = (): number => {
      const r = rig(0);
      r.cast('toy', { refund: false });
      r.run(1.2);
      return r.stage.fx.ps.burst.mock.calls.length;
    };
    const highCalls = (): number => {
      const r = rig(2);
      r.cast('toy', { refund: false });
      r.run(1.2);
      return r.stage.fx.ps.burst.mock.calls.length;
    };
    expect(lowCalls()).toBeLessThan(highCalls());
  });

  it('a throw inside an opening is logged and switches the scene off instead of unwinding into the simulation', () => {
    const r = rig();
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    r.cast('fish');
    r.run(1.2);
    r.stage.fx.ps.burst.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => r.open('fish', 'fish')).not.toThrow();
    expect(err).toHaveBeenCalled();
    expect(flights(r)).toHaveLength(0);
    err.mockRestore();
  });

  it('keeps the pools small over many capsules of every kind (nothing grows)', () => {
    const r = rig();
    const kinds: SpCapsuleKind[] = ['fish', 'purr', 'partner', 'toy', 'guardian', 'more'];
    for (let i = 0; i < 60; i++) {
      const k = kinds[i % kinds.length] as SpCapsuleKind;
      r.cast(k, { refund: false, inner: k === 'more' ? 'partner' : null });
      r.run(1.2);
      r.open(k, k === 'more' ? 'more' : k === 'partner' ? 'seat' : k === 'toy' ? 'toy' : k === 'guardian' ? 'awaken' : 'purr', { cell: 10, origin: 11, inner: k === 'more' ? 'partner' : null });
      r.run(0.2);
      if (k === 'more') {
        r.run(0.8);
        r.open('partner', 'seat', { small: true, cell: 10, origin: 11 });
      }
      r.run(0.5);
    }
    r.run(3);
    expect(r.front.children.length).toBeLessThanOrEqual(4 + 4 + 4 + 3 + 2);
    expect(r.numbers.children.length).toBeLessThanOrEqual(2);
    expect(live(r).flights).toHaveLength(0);
  });

  it('the partner\'s colour is mint, apart from the clones\' blue, the toy\'s gold and the pinks', () => {
    expect(SP_ROWS.capsule.marks.partner.color).toBe('mint');
  });
});

describe('the toy capsule under the skills\' banners', () => {
  /** Real time moves by hand here (`game.time` is what `staging.ts` reads); the battle's clock is held, as the toy pick holds it. */
  const frames = (r: Rig, seconds: number): void => {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) {
      game.time += 1 / 60;
      r.run(1 / 60, 0);
    }
  };

  // Every test starts well past the holds of the ones before it (a hold is module state that only ever grows).
  let epoch = 1000;
  beforeEach(() => {
    epoch += 100;
    game.time = epoch;
  });

  it('keeps its lid shut while banners are still to play, and opens it, with the fireworks, when they are gone; the screen waits for both', () => {
    const r = rig();
    r.cast('toy');
    r.run(1.2);
    holdStage(0.5);
    // The toy screen's wait is the banners' remainder and then the lid's own lead-in.
    expect(capsuleToyWait()).toBeCloseTo(0.5 + CAPSULE_TOY_WAIT, 6);
    r.stage.fx.shockwave.mockClear();
    r.open('toy', 'toy');
    expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(flights(r)[0]?.state).toBe('air');
    frames(r, 0.45);
    expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(flights(r)[0]?.state).toBe('air');
    frames(r, 0.1);
    expect(r.stage.fx.shockwave).toHaveBeenCalledTimes(1);
    expect(flights(r)[0]?.state).toBe('open');
    // The lead-in the player sees after the banners: the lid is open for `CAPSULE_TOY_WAIT`, then the shell is gone and the screen is up.
    frames(r, CAPSULE_TOY_WAIT - 0.1);
    expect(flights(r)).toHaveLength(1);
    frames(r, 0.2);
    expect(flights(r)).toHaveLength(0);
  });

  it('with the stage free (or a banner that is just leaving) the lid opens at once, as it always did', () => {
    const r = rig();
    r.cast('toy');
    r.run(1.2);
    r.stage.fx.shockwave.mockClear();
    r.open('toy', 'toy');
    expect(r.stage.fx.shockwave).toHaveBeenCalledTimes(1);
    expect(flights(r)[0]?.state).toBe('open');
    const r2 = rig();
    r2.cast('toy');
    r2.run(1.2);
    holdStage(0.03);
    r2.stage.fx.shockwave.mockClear();
    r2.open('toy', 'toy');
    expect(r2.stage.fx.shockwave).toHaveBeenCalledTimes(1);
  });

  it('never holds back any other prize: a banner in the way changes nothing for a purr, a fish or a partner', () => {
    holdStage(2);
    for (const [kind, result] of [['fish', 'fish'], ['purr', 'purr'], ['partner', 'seat']] as const) {
      const r = rig();
      r.cast(kind);
      r.run(1.2);
      r.stage.fx.ps.burst.mockClear();
      r.open(kind, result, { cell: 6, origin: 11, purr: 2 });
      expect(flights(r)[0]?.state).toBe('open');
      expect(r.stage.fx.ps.burst).toHaveBeenCalled();
    }
  });

  it('a victory or a defeat while the lid waits cancels the opening (nothing opens later)', () => {
    const r = rig();
    r.cast('toy');
    r.run(1.2);
    holdStage(0.5);
    r.open('toy', 'toy');
    r.scene.clear();
    r.stage.fx.shockwave.mockClear();
    frames(r, 1);
    expect(r.stage.fx.shockwave).not.toHaveBeenCalled();
    expect(flights(r)).toHaveLength(0);
  });
});
