import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

// The baked textures need a renderer, the way a card is looked up needs the asset table: neither matters to what the ring does.
vi.mock('@/core/assets', async (original) => ({ ...(await original<typeof import('@/core/assets')>()), hasTex: () => true, tex: () => Texture.WHITE }));

import { Emitter } from '@/core/events';
import { Tweener } from '@/core/tween';
import { setFxSettings } from '@/fx/settings';
import { motion } from '@/ui';
import { unitDef } from '@/game';
import type { BattleApi, BattleEvents, SpCastEvent, UnitId, UnitState } from '@/game/api';
import { CELL_COUNT, CELL_H, CELL_W } from '@/game/geometry';
import { DESIGN_W } from '@/core/game';
import { BUFF_R } from '@/view/field/art';
import type { FieldArt } from '@/view/field/art';
import { BuffBoard, BUFF_SLOT } from '@/view/field/buffMath';
import type { FieldEnv } from '@/view/field/env';
import { SpRingView, markTexture, spRingArt, type RingLook, type SpRingArt } from '@/view/field/spRing';
import {
  FLASH_GROW, FLASH_SECONDS, PULSE_FASTEST, PULSE_MAX, PULSE_PERIOD, PULSE_SCALE, PulseClock, PulseRoster, RING_AT, RING_FULL, RING_MARK_RULES,
  RING_OUTER, RING_R, RING_STEPS, RING_W, SHRUG_SECONDS, momentK, pulseWave, ringClearance, ringExtent, ringFrame, ringMarkOf, shrugCurve,
} from '@/view/field/spRingMath';
import { SpRings } from '@/view/field/spRings';
import { clearRingHolds, holdRing, releaseRing } from '@/view/field/ringHold';
import { CELL_MARK_AT, CLASS_AT, FEET_DY, RANK_AT, UnitView } from '@/view/field/unitView';
import { UnitViews } from '@/view/field/units';

const DT = 1 / 60;

/** A 2D canvas that remembers nothing: enough for the sheet to be "painted" in a test. */
function stubCanvas(): ReturnType<typeof vi.fn> {
  const ctx = new Proxy({}, { get: () => () => undefined, set: () => true });
  const create = vi.fn(() => ({ width: 0, height: 0, style: {}, getContext: () => ctx }));
  vi.stubGlobal('document', { createElement: create });
  return create;
}

describe('the frame a gauge shows', () => {
  it('is the bare track at 0, one step per 24th, and the closed ring only when the gauge is full', () => {
    expect(RING_STEPS).toBe(24);
    expect(ringFrame(0)).toBe(0);
    expect(ringFrame(-1)).toBe(0);
    expect(ringFrame(Number.NaN)).toBe(0);
    expect(ringFrame(1 / 24 - 1e-6)).toBe(0);
    expect(ringFrame(1 / 24)).toBe(1);
    for (let k = 0; k < RING_STEPS; k++) expect(ringFrame((k + 0.5) / RING_STEPS), `step ${k}`).toBe(k);
    expect(ringFrame(0.999999)).toBe(23);
    expect(ringFrame(1)).toBe(RING_FULL);
    expect(ringFrame(1.5)).toBe(RING_FULL);
    expect(RING_FULL).toBe(24);
  });

  it('never goes backwards as a gauge fills, and shows all 25 frames on the way', () => {
    let last = -1;
    const seen = new Set<number>();
    for (let g = 0; g <= 1.0001; g += 0.001) {
      const f = ringFrame(g);
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
      seen.add(f);
    }
    expect(seen.size).toBe(RING_STEPS + 1);
  });
});

describe('where the ring stands on a cat', () => {
  const lim = { x: CELL_W / 2, y: CELL_H / 2 };

  it('sits inside the cell at rest, at the top of its pulse and at the biggest of its flash', () => {
    for (const scale of [1, 1 + PULSE_SCALE, FLASH_GROW]) {
      const e = ringExtent(FEET_DY, scale);
      expect(e.left, `left at ${scale}`).toBeGreaterThanOrEqual(-lim.x);
      expect(e.right).toBeLessThanOrEqual(lim.x);
      expect(e.top).toBeGreaterThanOrEqual(-lim.y);
      expect(e.bottom).toBeLessThanOrEqual(lim.y);
    }
  });

  it('stays inside the cell\'s paper (the sheet lays one 98 px wide and 86 px tall on every cell) at rest', () => {
    const e = ringExtent(FEET_DY, 1);
    expect(e.left).toBeGreaterThanOrEqual(-(CELL_W - 10) / 2);
    expect(e.top).toBeGreaterThanOrEqual(-(CELL_H - 10) / 2);
    expect(e.bottom).toBeLessThanOrEqual((CELL_H - 10) / 2);
  });

  it('keeps clear of the rank tag of every rank, the longest included, even at the top of its pulse and its flash', () => {
    for (let pips = 1; pips <= 5; pips++) {
      expect(ringClearance(pips, RANK_AT, 1), `${pips} pips`).toBeGreaterThan(1);
      expect(ringClearance(pips, RANK_AT, 1 + PULSE_SCALE), `${pips} pips, pulsing`).toBeGreaterThan(0);
      expect(ringClearance(pips, RANK_AT, FLASH_GROW), `${pips} pips, flashing`).toBeGreaterThan(0);
    }
  });

  it('keeps clear of the buff badges (a column on the right flank) and of the special cell\'s badge', () => {
    const right = RING_AT.x + RING_OUTER * (1 + PULSE_SCALE);
    expect(right).toBeLessThan(BUFF_SLOT.x - BUFF_R);
    const sun = { x: CELL_MARK_AT.x, y: CELL_MARK_AT.y, r: 22 * 0.8 };
    expect(Math.hypot(RING_AT.x - sun.x, RING_AT.y - sun.y)).toBeGreaterThan(sun.r + RING_OUTER * FLASH_GROW);
  });

  it('wraps the class sticker: the sticker moves to the ring\'s centre, a little in and up from where a cat without a ring wears it', () => {
    expect(RING_AT.x).toBeGreaterThan(CLASS_AT.x);
    expect(RING_AT.y).toBeLessThan(CLASS_AT.y);
    // The ring's line covers the sticker's cream border (radius 16) and no more than a couple of px beyond.
    expect(RING_R - RING_W / 2).toBeLessThanOrEqual(16);
    expect(RING_OUTER).toBeLessThan(19);
  });

  it('is big enough to read at 450 x 900 and at 360 x 800 (a design px is width / 720 screen px) and still inside the cell there', () => {
    for (const width of [450, 360]) {
      const k = width / DESIGN_W;
      expect(RING_W * k, `line at ${width}`).toBeGreaterThanOrEqual(1.9);
      expect(2 * RING_OUTER * k, `diameter at ${width}`).toBeGreaterThanOrEqual(18);
      // The cell on screen is 108 x 96 design px times k: the ring's flash still has at least a pixel to spare on the left.
      const left = (ringExtent(FEET_DY, FLASH_GROW).left + (CELL_W / 2)) * k;
      expect(left, `room at ${width}`).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('the pulse of the full rings', () => {
  const run = (roster: PulseRoster, full: number[]): void => {
    roster.begin();
    for (const uid of full) roster.see(uid, true);
    roster.end();
  };

  it('lets the first four to become full pulse, in that order, and the rest stand still', () => {
    expect(PULSE_MAX).toBe(4);
    const r = new PulseRoster();
    run(r, [7]);
    run(r, [7, 3]);
    run(r, [7, 3, 9, 1]);
    run(r, [7, 3, 9, 1, 5, 2]);
    expect(r.order()).toEqual([7, 3, 9, 1]);
    for (const uid of [7, 3, 9, 1]) expect(r.pulses(uid)).toBe(true);
    for (const uid of [5, 2]) expect(r.pulses(uid)).toBe(false);
    expect(r.full).toBe(6);
  });

  it('gives a place to the next one waiting, in order, when a pulsing ring casts or its cat leaves', () => {
    const r = new PulseRoster();
    run(r, [1, 2, 3, 4]);
    run(r, [1, 2, 3, 4, 5]);
    run(r, [1, 2, 3, 4, 5, 6]);
    expect(r.order()).toEqual([1, 2, 3, 4]);
    // 2 casts: 5 (full before 6) takes its place; the order is still the order they became full.
    run(r, [1, 3, 4, 5, 6]);
    expect(r.order()).toEqual([1, 3, 4, 5]);
    expect(r.pulses(6)).toBe(false);
    // 1 is sold.
    run(r, [3, 4, 5, 6]);
    expect(r.order()).toEqual([3, 4, 5, 6]);
  });

  it('puts a ring that fills again behind the others (it became full later), and shows the cats of one frame in the order it was shown them', () => {
    const r = new PulseRoster();
    run(r, [10, 11, 12, 13, 14]);
    expect(r.order()).toEqual([10, 11, 12, 13]);
    run(r, [11, 12, 13, 14]);
    run(r, [10, 11, 12, 13, 14]);
    expect(r.order()).toEqual([11, 12, 13, 14]);
    expect(r.pulses(10)).toBe(false);
  });

  it('forgets everything on clear and never lets more than four pulse whatever the board holds', () => {
    const r = new PulseRoster();
    run(r, Array.from({ length: CELL_COUNT }, (_, i) => i + 1));
    expect(r.order()).toHaveLength(PULSE_MAX);
    r.clear();
    expect(r.order()).toEqual([]);
    expect(r.full).toBe(0);
  });

  it('keeps a pulse clock that follows the battle\'s clock, stands still when it does and never runs more than 1.5 times as fast as real time', () => {
    const c = new PulseClock();
    c.advance(0, DT);
    expect(c.seconds).toBe(0);
    c.advance(DT, DT);
    expect(c.seconds).toBeCloseTo(DT, 9);
    // 3x speed: three battle frames' worth in one real frame, but at most 1.5 of them count.
    const before = c.seconds;
    c.advance(3 * DT, DT);
    expect(c.seconds - before).toBeCloseTo(PULSE_FASTEST * DT, 9);
    // Slow motion: slower is followed as it is.
    const mid = c.seconds;
    c.advance(0.4 * DT, DT);
    expect(c.seconds - mid).toBeCloseTo(0.4 * DT, 9);
    // So the swell never exceeds 3 a second.
    expect(PULSE_FASTEST / PULSE_PERIOD).toBeLessThanOrEqual(3);
  });

  it('has a wave that rests at 0 and swells to 1 once a period', () => {
    expect(pulseWave(0)).toBeCloseTo(0, 9);
    expect(pulseWave(PULSE_PERIOD / 2)).toBeCloseTo(1, 9);
    expect(pulseWave(PULSE_PERIOD)).toBeCloseTo(0, 9);
    for (let t = 0; t < 2; t += 0.01) {
      expect(pulseWave(t)).toBeGreaterThanOrEqual(0);
      expect(pulseWave(t)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('the moments after a cast', () => {
  it('count progress on the battle clock and end', () => {
    expect(momentK(5, 5, 0.4)).toBe(0);
    expect(momentK(5.2, 5, 0.4)).toBeCloseTo(0.5, 9);
    expect(momentK(5.4, 5, 0.4)).toBe(-1);
    expect(momentK(4.9, 5, 0.4)).toBe(-1);
    expect(FLASH_SECONDS).toBeGreaterThan(0);
  });

  it('shrug up and back down: nothing at the ends, most in the middle', () => {
    expect(shrugCurve(0)).toBeCloseTo(0, 9);
    expect(shrugCurve(0.5)).toBeCloseTo(1, 9);
    expect(shrugCurve(1)).toBeCloseTo(0, 9);
    expect(shrugCurve(-1)).toBe(0);
    expect(shrugCurve(2)).toBe(0);
  });
});

describe('the marks a ring wears', () => {
  const unit = (over: Partial<UnitState> = {}): UnitState => ({ blocked: false, sp: 0.2, ...over }) as unknown as UnitState;
  const battle = {} as BattleApi;

  afterEach(() => {
    delete RING_MARK_RULES.wanted;
  });

  it('shows a stopped cat first, whatever else is true', () => {
    expect(ringMarkOf('shove', unit({ blocked: true, sp: 1 }), battle, true)).toBe('stopped');
  });

  it('asks the skill\'s own rule next: the hook the gunner\'s "holstered" look goes through', () => {
    expect(ringMarkOf('wanted', unit(), battle, false)).toBeNull();
    const rule = vi.fn(() => 'ready' as const);
    RING_MARK_RULES.wanted = rule;
    const u = unit({ sp: 1 });
    expect(ringMarkOf('wanted', u, battle, false)).toBe('ready');
    expect(rule).toHaveBeenCalledWith(u, battle);
    // A skill without a rule is not asked.
    expect(ringMarkOf('shove', u, battle, false)).toBeNull();
  });

  it('puts a still star on a full ring under reduced motion, where nothing pulses, and on no other', () => {
    expect(ringMarkOf('shove', unit({ sp: 1 }), battle, true)).toBe('ready');
    expect(ringMarkOf('shove', unit({ sp: 0.99 }), battle, true)).toBeNull();
    expect(ringMarkOf('shove', unit({ sp: 1 }), battle, false)).toBeNull();
  });
});

describe('the ring as a view', () => {
  const sheet: SpRingArt = {
    frames: Array.from({ length: RING_FULL + 1 }, () => new Texture()),
    flash: new Texture(),
    glow: new Texture(),
    holster: new Texture(),
    trick: new Texture(),
  };
  const look = (over: Partial<RingLook> = {}): RingLook => ({ frame: 5, blocked: false, pulsing: false, wave: 0, flash: -1, mark: null, calm: false, low: false, ...over });
  const parts = (v: SpRingView): { glow: Sprite; body: Sprite; flash: Sprite; mark: Sprite } => {
    const [glow, body, flash, mark] = v.root.children as Sprite[];
    return { glow: glow as Sprite, body: body as Sprite, flash: flash as Sprite, mark: mark as Sprite };
  };

  beforeEach(() => setFxSettings({ tier: 'mid', reducedMotion: false }));
  afterEach(() => vi.unstubAllGlobals());

  it('wears the frame of the gauge, changing it only when the gauge crosses a step, with no halo until it is full', () => {
    const v = new SpRingView(sheet);
    const { body, glow } = parts(v);
    v.draw(look({ frame: 7 }), DT);
    expect(body.texture).toBe(sheet.frames[7]);
    expect(glow.visible).toBe(false);
    v.draw(look({ frame: 8 }), DT);
    expect(body.texture).toBe(sheet.frames[8]);
    v.draw(look({ frame: RING_FULL }), DT);
    expect(body.texture).toBe(sheet.frames[RING_FULL]);
    expect(glow.visible).toBe(true);
    v.draw(look({ frame: 0 }), DT);
    expect(body.texture).toBe(sheet.frames[0]);
    expect(glow.visible).toBe(false);
  });

  it('swells only when it is full, among the first four and moving: the others stand exactly still', () => {
    const v = new SpRingView(sheet);
    const { body, glow } = parts(v);
    const draw = (l: Partial<RingLook>): void => {
      for (let i = 0; i < 30; i++) v.draw(look({ frame: RING_FULL, wave: 1, ...l }), DT);
    };
    draw({ pulsing: false });
    expect(body.scale.x).toBe(1);
    const still = glow.alpha;
    draw({ pulsing: true });
    expect(body.scale.x).toBeCloseTo(1 + PULSE_SCALE, 6);
    expect(glow.alpha).toBeGreaterThan(still);
    // A partly full ring never swells, pulsing or not.
    const part = new SpRingView(sheet);
    for (let i = 0; i < 30; i++) part.draw(look({ frame: 10, wave: 1, pulsing: true }), DT);
    expect(parts(part).body.scale.x).toBe(1);
  });

  it('eases a swell in and out instead of jumping when a ring starts or stops pulsing', () => {
    const v = new SpRingView(sheet);
    const { body } = parts(v);
    v.draw(look({ frame: RING_FULL, wave: 1, pulsing: true }), DT);
    expect(body.scale.x).toBeGreaterThan(1);
    expect(body.scale.x).toBeLessThan(1 + PULSE_SCALE);
  });

  it('does not swell under reduced motion and shows no halo or swell on the low tier, but still shows the full ring', () => {
    for (const mode of [{ calm: true }, { low: true }]) {
      const v = new SpRingView(sheet);
      const { body, glow } = parts(v);
      for (let i = 0; i < 30; i++) v.draw(look({ frame: RING_FULL, wave: 1, pulsing: true, ...mode }), DT);
      expect(body.scale.x).toBe(1);
      expect(body.texture).toBe(sheet.frames[RING_FULL]);
      if ('low' in mode) expect(glow.visible).toBe(false);
    }
  });

  it('flashes white for a moment after a cast and then not at all; the flash grows no more than the cell has room for', () => {
    const v = new SpRingView(sheet);
    const { flash } = parts(v);
    v.draw(look({ flash: -1 }), DT);
    expect(flash.visible).toBe(false);
    let biggest = 0;
    for (const k of [0, 0.25, 0.5, 0.75, 0.99]) {
      v.draw(look({ flash: k }), DT);
      expect(flash.visible).toBe(true);
      biggest = Math.max(biggest, flash.scale.x);
    }
    expect(biggest).toBeLessThanOrEqual(FLASH_GROW + 1e-9);
    v.draw(look({ flash: -1 }), DT);
    expect(flash.visible).toBe(false);
  });

  it('under reduced motion the flash fades in place, and on the low tier it only blinks', () => {
    const calm = new SpRingView(sheet);
    calm.draw(look({ flash: 0.3, calm: true }), DT);
    expect(parts(calm).flash.scale.x).toBe(1);
    const low = new SpRingView(sheet);
    low.draw(look({ flash: 0.3, low: true }), DT);
    expect(parts(low).flash.visible).toBe(true);
    low.draw(look({ flash: 0.8, low: true }), DT);
    expect(parts(low).flash.visible).toBe(false);
  });

  it('shows a stopped cat\'s ring greyed, and takes the grey off again', () => {
    const v = new SpRingView(sheet);
    const { body } = parts(v);
    v.draw(look({ blocked: true }), DT);
    expect(body.tint).not.toBe(0xffffff);
    v.draw(look({ blocked: false }), DT);
    expect(body.tint).toBe(0xffffff);
  });

  it('wears a mark only while it has one', () => {
    stubCanvas();
    const v = new SpRingView(sheet);
    const { mark } = parts(v);
    expect(mark.visible).toBe(false);
    v.draw(look({ mark: 'stopped' }), DT);
    expect(mark.visible).toBe(true);
    expect(mark.texture).toBe(markTexture('stopped'));
    v.draw(look({ mark: null }), DT);
    expect(mark.visible).toBe(false);
  });

  it('arrives with the sticker it wraps: it takes its scale and opacity while the sticker pops in', () => {
    const v = new SpRingView(sheet);
    const sticker = new Sprite();
    sticker.scale.set(0);
    sticker.alpha = 0;
    v.bind(sticker);
    v.draw(look(), DT);
    expect(v.root.alpha).toBe(0);
    expect(parts(v).body.scale.x).toBe(0);
    sticker.scale.set(1);
    sticker.alpha = 1;
    v.draw(look(), DT);
    expect(v.root.alpha).toBe(1);
    expect(parts(v).body.scale.x).toBe(1);
  });

  it('paints its sheet once: 25 arcs and the closed ring, the flash and the halo cut from one source', () => {
    stubCanvas();
    const a = spRingArt();
    expect(spRingArt()).toBe(a);
    expect(a.frames).toHaveLength(RING_FULL + 1);
    const sources = new Set([...a.frames, a.flash, a.glow].map((t) => t.source));
    expect(sources.size).toBe(1);
    expect(new Set(a.frames.map((t) => `${t.frame.x},${t.frame.y}`)).size).toBe(RING_FULL + 1);
  });
});

// ── on a board ──

const art = (() => {
  const white = (): Texture => new Texture({ source: Texture.WHITE.source });
  return {
    tileFill: white(),
    reachFrame: white(),
    toyFrame: [white(), white(), white()],
    buffBadge: { speed: white(), damage: white() },
    buffRing: white(),
    shadow: white(),
    rank: { common: white(), rare: white(), epic: white(), legendary: white(), mythic: white() },
    badge: { warrior: white(), ranger: white(), mage: white(), trickster: white() },
    shield: white(),
    noAct: white(),
    cellMark: { sun: white(), bowl: white(), bubble: white(), stump: white(), treat: white() },
  } as unknown as FieldArt;
})();

interface FakeBattle {
  spOn: boolean;
  time: number;
  units: Array<UnitState | null>;
  enemies: never[];
  specialCell: string;
  events: Emitter<BattleEvents>;
  listeners: number;
}

function fakeBattle(spOn: boolean): FakeBattle {
  const events = new Emitter<BattleEvents>();
  const b: FakeBattle = { spOn, time: 0, units: new Array<UnitState | null>(CELL_COUNT).fill(null), enemies: [], specialCell: 'sun', events, listeners: 0 };
  const on = events.on.bind(events);
  (events as { on: unknown }).on = (type: keyof BattleEvents, fn: never): (() => void) => {
    const off = on(type, fn);
    if (type !== 'spCast') return off;
    b.listeners++;
    let gone = false;
    return () => {
      if (!gone) b.listeners--;
      gone = true;
      off();
    };
  };
  return b;
}

function cat(uid: number, id: UnitId, cell: number, sp = 0, over: Partial<UnitState> = {}): UnitState {
  return {
    uid, id, cell, level: 1, charge: 0, sp, blocked: false, weakened: 0, sunlit: false, shielded: false, dodge: 0, kills: 0, damageDealt: 0,
    buffAttackSpeed: 0, buffDamage: 0, stats: { interval: 1, damage: 1, range: 1, crit: 0, critMult: 2 }, ...over,
  } as unknown as UnitState;
}

function world(spOn: boolean): { battle: FakeBattle; views: UnitViews; layer: Container; frame: (dt?: number, dBattle?: number) => void; ring: (uid: number) => SpRingView | null } {
  const battle = fakeBattle(spOn);
  const ui = new Tweener();
  const layer = new Container();
  const env = {
    ctx: { layers: { overlay: new Container(), fxFront: new Container() }, ui, tweens: ui, layout: { w: 720, h: 1280 }, anchor: () => ({ x: 0, y: 0 }) },
    battle: battle as unknown as BattleApi,
    art,
    buffs: new BuffBoard(),
    ground: {},
    time: 0,
  } as unknown as FieldEnv;
  const views = new UnitViews(env, layer, new Container());
  const frame = (dt = DT, dBattle = dt): void => {
    battle.time += dBattle;
    env.time += dt;
    ui.update(dt);
    views.update(dt, null);
  };
  return { battle, views, layer, frame, ring: (uid) => views.get(uid)?.spRing ?? null };
}

describe('the rings of a board', () => {
  beforeEach(() => {
    stubCanvas();
    setFxSettings({ tier: 'mid', reducedMotion: false });
    motion.reduced = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    motion.reduced = false;
  });

  const body = (v: SpRingView): Sprite => v.root.children[1] as Sprite;

  it('makes nothing when the battle plays without skills: no listener, no ring, the sticker where every cat wears it, the same children', () => {
    const painted = stubCanvas();
    const w = world(false);
    expect(w.views.rings).toBeNull();
    w.battle.units[0] = cat(1, 'w_viking', 0, 1);
    w.battle.units[1] = cat(2, 'w_paw', 1);
    w.frame();
    expect(w.battle.listeners).toBe(0);
    const viking = w.views.get(1) as UnitView;
    const paw = w.views.get(2) as UnitView;
    expect(viking.spRing).toBeNull();
    expect(viking.root.children.length).toBe(paw.root.children.length);
    expect(viking.root.getChildByLabel('sp-ring')).toBeNull();
    const sticker = viking.root.children.find((c) => c instanceof Sprite && c.x === CLASS_AT.x && c.y === CLASS_AT.y);
    expect(sticker).toBeDefined();
    // And the sheet was never painted.
    expect(painted).not.toHaveBeenCalled();
  });

  it('gives a ring to a cat with a skill and none to a cat without one; the ring\'s sticker steps to the ring\'s place', () => {
    const w = world(true);
    expect(w.battle.listeners).toBe(1);
    expect(unitDef('w_viking').spSkill).toBeDefined();
    expect(unitDef('w_paw').spSkill).toBeUndefined();
    w.battle.units[0] = cat(1, 'w_viking', 0, 0.5);
    w.battle.units[1] = cat(2, 'w_paw', 1, 0);
    w.frame();
    const viking = w.views.get(1) as UnitView;
    const paw = w.views.get(2) as UnitView;
    expect(viking.spRing).not.toBeNull();
    expect(paw.spRing).toBeNull();
    expect(viking.root.children.includes((viking.spRing as SpRingView).root)).toBe(true);
    expect((viking.spRing as SpRingView).root.position.x).toBe(RING_AT.x);
    expect((viking.spRing as SpRingView).root.position.y).toBe(RING_AT.y);
    expect(paw.root.children.find((c) => c.label === 'sp-ring')).toBeUndefined();
  });

  it('shows the gauge: the frame follows the unit\'s own number', () => {
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 0);
    w.battle.units[0] = u;
    w.frame();
    const ring = w.ring(1) as SpRingView;
    const tex = (): Texture => body(ring).texture;
    const frame0 = tex();
    u.sp = 0.5;
    w.frame();
    const half = tex();
    expect(half).not.toBe(frame0);
    u.sp = 0.52;
    w.frame();
    expect(tex()).toBe(half);
    u.sp = 1;
    w.frame();
    expect(tex()).not.toBe(half);
  });

  it('gives a trickster\'s full ring the brown-edged frame and every other class the gold one (the trickster\'s sticker is the gold\'s own mustard)', () => {
    const w = world(true);
    w.battle.units[0] = cat(1, 't_bard', 0, 1);
    w.battle.units[1] = cat(2, 'w_viking', 1, 1);
    w.battle.units[2] = cat(3, 't_bard', 2, 0.5);
    w.frame();
    const art = spRingArt();
    expect(body(w.ring(1) as SpRingView).texture).toBe(art.trick);
    expect(body(w.ring(2) as SpRingView).texture).toBe(art.frames[RING_FULL]);
    // An arc is the same for a trickster: only a full ring differs.
    expect(body(w.ring(3) as SpRingView).texture).toBe(art.frames[12]);
  });

  it('follows the cat: it is inside the cat\'s own view, so a move of the view carries it', () => {
    const w = world(true);
    w.battle.units[0] = cat(1, 'w_viking', 0, 0.5);
    w.frame();
    const v = w.views.get(1) as UnitView;
    const ring = (v.spRing as SpRingView).root;
    expect(ring.parent).toBe(v.root);
    // The view moves (a drag, a hop, a slide) and the ring keeps its place in it: the world position of the ring is the view's plus a fixed offset.
    const worldX = (): number => v.root.x + ring.x * v.root.scale.x;
    const before = worldX();
    v.root.position.x += 100;
    expect(worldX() - before).toBeCloseTo(100, 9);
    expect(ring.x).toBe(RING_AT.x);
  });

  it('takes the ring off a recycled view that is given a cat without a skill, and puts the sticker back', () => {
    const w = world(true);
    w.battle.units[0] = cat(1, 'w_viking', 0, 0.5);
    w.frame();
    const v = w.views.get(1) as UnitView;
    const ring = v.spRing as SpRingView;
    const sticker = v.root.children.find((c) => c instanceof Sprite && c.x === RING_AT.x && c.y === RING_AT.y) as Sprite;
    expect(sticker).toBeDefined();
    // The same view is given an ordinary cat (the pool does this after a merge or a molt).
    v.assign(cat(9, 'w_paw', 0), art);
    w.views.rings?.attach(v, cat(9, 'w_paw', 0));
    expect(v.spRing).toBeNull();
    expect(ring.root.visible).toBe(false);
    expect(sticker.x).toBe(CLASS_AT.x);
    expect(sticker.y).toBe(CLASS_AT.y);
    // And a skill cat again: the same ring comes back, clean.
    v.assign(cat(10, 'r_gunner', 0, 0.2), art);
    w.views.rings?.attach(v, cat(10, 'r_gunner', 0, 0.2));
    expect(v.spRing).toBe(ring);
    expect(ring.root.visible).toBe(true);
    expect(sticker.x).toBe(RING_AT.x);
  });

  it('flashes and shrugs after a cast, timed by the battle\'s clock, and stops after FLASH_SECONDS of it', () => {
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 0);
    w.battle.units[0] = u;
    w.frame();
    const v = w.views.get(1) as UnitView;
    const ring = v.spRing as SpRingView;
    const flash = ring.root.children[2] as Sprite;
    expect(flash.visible).toBe(false);
    w.battle.events.emit('spCast', { unit: u, first: false, x: 0, y: 0, skill: 'shove', data: { range: 100, slide: 0.35, pushed: [] } } as SpCastEvent);
    w.frame(DT, 0);
    expect(flash.visible).toBe(true);
    // A popup holds the battle: real time passes, the battle clock does not, so the flash and the shrug stand still.
    const k0 = flash.alpha;
    for (let i = 0; i < 120; i++) w.frame(DT, 0);
    expect(flash.visible).toBe(true);
    expect(flash.alpha).toBeCloseTo(k0, 9);
    // The battle runs again: half the flash in, the cat is at the top of its shrug; at the end, nothing.
    for (let t = 0; t < FLASH_SECONDS / 2; t += DT) w.frame();
    expect(v.shrug).toBeGreaterThan(0.9);
    for (let t = 0; t < FLASH_SECONDS; t += DT) w.frame();
    expect(flash.visible).toBe(false);
    expect(v.shrug).toBe(0);
    expect(SHRUG_SECONDS).toBeLessThan(FLASH_SECONDS + 1e-9);
  });

  it('runs the flash at the speed of the game: 3x passes it in a third of the real time', () => {
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 0);
    w.battle.units[0] = u;
    w.frame();
    const flash = (w.ring(1) as SpRingView).root.children[2] as Sprite;
    w.battle.events.emit('spCast', { unit: u, first: false, x: 0, y: 0, skill: 'shove', data: { range: 100, slide: 0.35, pushed: [] } } as SpCastEvent);
    let frames = 0;
    while (flash.visible || frames === 0) {
      w.frame(DT, 3 * DT);
      if (++frames > 200) break;
    }
    expect(frames).toBeLessThanOrEqual(Math.ceil(FLASH_SECONDS / (3 * DT)) + 2);
    expect(frames).toBeGreaterThan(Math.floor(FLASH_SECONDS / (3 * DT)) - 2);
  });

  it('lets no more than four full rings swell at once, the first four to become full, however many are full', () => {
    const w = world(true);
    const ids: UnitId[] = ['w_viking', 'w_tiger', 'r_gunner', 'r_star', 'w_viking', 'r_star'];
    const units = ids.map((id, i) => cat(i + 1, id, i, 0.5));
    units.forEach((u, i) => (w.battle.units[i] = u));
    w.frame();
    // They become full one after another, the last-but-one first.
    const order = [4, 1, 0, 5, 2, 3];
    for (const cell of order) {
      (units[cell] as UnitState).sp = 1;
      for (let i = 0; i < 3; i++) w.frame();
    }
    // Run to the top of a swell.
    for (let t = 0; t < 2; t += DT) w.frame();
    const swelling = new Set<number>();
    for (let t = 0; t < PULSE_PERIOD; t += DT) {
      w.frame();
      for (const u of units) if (body(w.ring(u.uid) as SpRingView).scale.x > 1.01) swelling.add(u.uid);
    }
    expect([...swelling].sort()).toEqual(order.slice(0, PULSE_MAX).map((cell) => (units[cell] as UnitState).uid).sort());
    expect(swelling.size).toBe(PULSE_MAX);
    // The one that became full fifth starts to swell when the first of them casts.
    (units[order[0] as number] as UnitState).sp = 0;
    for (let t = 0; t < 1; t += DT) w.frame();
    const next = (units[order[PULSE_MAX] as number] as UnitState).uid;
    let seen = false;
    for (let t = 0; t < PULSE_PERIOD; t += DT) {
      w.frame();
      if (body(w.ring(next) as SpRingView).scale.x > 1.01) seen = true;
    }
    expect(seen).toBe(true);
  });

  it('does not swell a stopped cat\'s ring and shows its mark', () => {
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 1, { blocked: true });
    w.battle.units[0] = u;
    for (let t = 0; t < 1; t += DT) w.frame();
    const ring = w.ring(1) as SpRingView;
    expect(body(ring).scale.x).toBe(1);
    expect(body(ring).tint).not.toBe(0xffffff);
    expect((ring.root.children[3] as Sprite).visible).toBe(true);
    expect(w.views.rings?.pulsing()).toEqual([]);
  });

  it('stops listening and forgets its flashes when the field goes', () => {
    const w = world(true);
    expect(w.battle.listeners).toBe(1);
    const emit = vi.spyOn(w.battle.events, 'emit');
    w.views.destroy();
    // The listener is really released (a battle that is left must not keep a view's handler alive).
    expect(w.battle.listeners).toBe(0);
    w.battle.events.emit('spCast', { unit: cat(1, 'w_viking', 0), first: false, x: 0, y: 0, skill: 'shove', data: { range: 1, slide: 1, pushed: [] } } as SpCastEvent);
    expect(emit).toHaveBeenCalled();
    expect(w.views.rings?.pulsing()).toEqual([]);
  });

  it('shrugs no cat under reduced motion (the flash fades in place and the cat keeps still)', () => {
    motion.reduced = true;
    setFxSettings({ tier: 'mid', reducedMotion: true });
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 0);
    w.battle.units[0] = u;
    w.frame();
    const v = w.views.get(1) as UnitView;
    w.battle.events.emit('spCast', { unit: u, first: false, x: 0, y: 0, skill: 'shove', data: { range: 100, slide: 0.35, pushed: [] } } as SpCastEvent);
    let peak = 0;
    for (let t = 0; t < FLASH_SECONDS; t += DT) {
      w.frame();
      peak = Math.max(peak, v.shrug);
    }
    expect(peak).toBe(0);
    // The same cast with motion on does shrug (the test would pass for a ring that never shrugs at all otherwise).
    motion.reduced = false;
    setFxSettings({ tier: 'mid', reducedMotion: false });
    w.battle.events.emit('spCast', { unit: u, first: false, x: 0, y: 0, skill: 'shove', data: { range: 100, slide: 0.35, pushed: [] } } as SpCastEvent);
    for (let t = 0; t < SHRUG_SECONDS / 2; t += DT) w.frame();
    expect(v.shrug).toBeGreaterThan(0.9);
  });

  describe('a gunner that is saving its shot', () => {
    const saved = RING_MARK_RULES.wanted;
    afterEach(() => {
      RING_MARK_RULES.wanted = saved;
    });
    const parts = (v: SpRingView): { glow: Sprite; body: Sprite; mark: Sprite } => ({ glow: v.root.children[0] as Sprite, body: v.root.children[1] as Sprite, mark: v.root.children[3] as Sprite });

    it('is full but not ready: no pulse slot, no swell, no halo, its own teal ring and a bigger mark', () => {
      RING_MARK_RULES.wanted = () => 'holstered';
      const w = world(true);
      const gunner = cat(1, 'r_gunner', 0, 1);
      const viking = cat(2, 'w_viking', 1, 1);
      w.battle.units[0] = gunner;
      w.battle.units[1] = viking;
      for (let t = 0; t < 2; t += DT) w.frame();
      // The viking is ready and pulses; the gunner is not in the roster at all.
      expect(w.views.rings?.pulsing()).toEqual([2]);
      const sheet = spRingArt();
      const g = parts(w.ring(1) as SpRingView);
      expect(g.body.texture).toBe(sheet.holster);
      expect(g.body.texture).not.toBe(sheet.frames[RING_FULL]);
      expect(g.glow.visible).toBe(false);
      expect(g.mark.visible).toBe(true);
      expect(g.mark.texture).toBe(markTexture('holstered'));
      const v = parts(w.ring(2) as SpRingView);
      expect(v.body.texture).toBe(sheet.frames[RING_FULL]);
      expect(v.glow.visible).toBe(true);
      // Over two whole pulses the gunner's ring never swells and the ready one does.
      let gunnerTop = 0;
      let vikingTop = 0;
      for (let t = 0; t < PULSE_PERIOD * 2; t += DT) {
        w.frame();
        gunnerTop = Math.max(gunnerTop, g.body.scale.x);
        vikingTop = Math.max(vikingTop, v.body.scale.x);
      }
      expect(gunnerTop).toBe(1);
      expect(vikingTop).toBeGreaterThan(1.03);
      // The mark is bigger than the small ones (a chip of 9 px on a 360 px screen was not read as a pistol): 28 design px against 18.
      expect(g.mark.scale.x * 24).toBeGreaterThanOrEqual(26);
    });

    it('takes no pulse slot from a cat that is ready: five ready cats and a holstered gunner, the four that pulse are ready ones', () => {
      RING_MARK_RULES.wanted = () => 'holstered';
      const w = world(true);
      const ids: UnitId[] = ['r_gunner', 'w_viking', 'w_tiger', 'r_star', 'w_viking', 'r_star'];
      ids.forEach((id, i) => (w.battle.units[i] = cat(i + 1, id, i, 1)));
      for (let t = 0; t < 2; t += DT) w.frame();
      const pulsing = w.views.rings?.pulsing() ?? [];
      expect(pulsing).toHaveLength(PULSE_MAX);
      expect(pulsing).not.toContain(1);
    });

    it('goes back to the gold ring that pulses when the shot is let go (the target has come out)', () => {
      let holding = true;
      RING_MARK_RULES.wanted = () => (holding ? 'holstered' : null);
      const w = world(true);
      w.battle.units[0] = cat(1, 'r_gunner', 0, 1);
      for (let t = 0; t < 1; t += DT) w.frame();
      const g = parts(w.ring(1) as SpRingView);
      expect(g.body.texture).toBe(spRingArt().holster);
      holding = false;
      for (let t = 0; t < 1; t += DT) w.frame();
      expect(g.body.texture).toBe(spRingArt().frames[RING_FULL]);
      expect(g.glow.visible).toBe(true);
      expect(w.views.rings?.pulsing()).toEqual([1]);
      expect(g.mark.visible).toBe(false);
    });
  });

  it('swells the pulsing rings a quarter of a pulse apart, not together', () => {
    const w = world(true);
    const units = [cat(1, 'w_viking', 0, 1), cat(2, 'w_tiger', 1, 1), cat(3, 'r_star', 2, 1), cat(4, 'r_gunner', 3, 1)];
    units.forEach((u, i) => (w.battle.units[i] = u));
    for (let t = 0; t < 2; t += DT) w.frame();
    const peaks = units.map(() => 0);
    const at: number[][] = units.map(() => []);
    let differ = 0;
    let frames = 0;
    for (let t = 0; t < PULSE_PERIOD * 2; t += DT) {
      w.frame();
      frames++;
      const scales = units.map((u) => body(w.ring(u.uid) as SpRingView).scale.x);
      scales.forEach((x, i) => (at[i] as number[]).push(x));
      if (Math.max(...scales) - Math.min(...scales) > 0.02) differ++;
      scales.forEach((x, i) => (peaks[i] = Math.max(peaks[i] as number, x)));
    }
    // Each of them swells by the full amount, but not at the same moments: most frames the four are not at one size.
    for (const p of peaks) expect(p).toBeGreaterThan(1 + PULSE_SCALE * 0.9);
    expect(differ).toBeGreaterThan(frames / 2);
    // The first and the third (half a pulse apart) are at opposite ends of the swell for a good part of the time.
    const first = at[0] as number[];
    const third = at[2] as number[];
    let opposite = 0;
    first.forEach((x, i) => {
      if (Math.abs(x - (third[i] as number)) > PULSE_SCALE * 0.5) opposite++;
    });
    expect(opposite).toBeGreaterThan(10);
  });

  it('has the rings on a view that only exists for a battle with skills: a unit view alone never has one', () => {
    const v = new UnitView(art, 'sun');
    v.assign(cat(1, 'w_viking', 0, 1), art);
    expect(v.spRing).toBeNull();
    expect(v.root.children.find((c) => c.label === 'sp-ring')).toBeUndefined();
    expect(v.shrug).toBe(0);
  });

  it('rises and swells a cat while it shrugs and not otherwise', () => {
    const v = new UnitView(art, 'sun');
    v.assign(cat(1, 'w_viking', 0, 0), art);
    const u = cat(1, 'w_viking', 0, 0);
    v.step(DT, 0, u, false);
    const rest = (v.root.children[1] as Container).scale.y;
    v.shrug = 1;
    v.step(DT, 0, u, false);
    const up = (v.root.children[1] as Container).scale.y;
    expect(up).toBeGreaterThan(rest * 1.1);
    v.shrug = 0;
    v.step(DT, 0, u, false);
    expect((v.root.children[1] as Container).scale.y).toBeCloseTo(rest, 9);
  });
});

describe('the place of a pulsing ring among the pulsing ones', () => {
  it('counts the pulsing rings in the order they became full, 0 for the first, and 0 for any ring that does not pulse', () => {
    const r = new PulseRoster();
    const frame = (uids: number[]): void => {
      r.begin();
      for (const u of uids) r.see(u, true);
      r.end();
    };
    frame([5]);
    frame([5, 9]);
    frame([5, 9, 2]);
    frame([5, 9, 2, 7]);
    frame([5, 9, 2, 7, 4]);
    expect([5, 9, 2, 7].map((u) => r.slot(u))).toEqual([0, 1, 2, 3]);
    // The fifth to become full waits: it does not pulse and has no place.
    expect(r.pulses(4)).toBe(false);
    expect(r.slot(4)).toBe(0);
    // The first casts: the others move up and the waiting one takes the last place.
    frame([9, 2, 7, 4]);
    expect([9, 2, 7, 4].map((u) => r.slot(u))).toEqual([0, 1, 2, 3]);
    expect(r.slot(404)).toBe(0);
  });
});

describe('SpRings alone', () => {
  it('is only made by a battle with skills (the field asks `BattleApi.spOn`) and holds no state that outlives it', () => {
    const b = fakeBattle(true);
    const rings = new SpRings({ battle: b as unknown as BattleApi } as unknown as FieldEnv);
    expect(b.listeners).toBe(1);
    rings.destroy();
    expect(b.listeners).toBe(0);
    expect(rings.pulsing()).toEqual([]);
  });
});

describe('the gauge a scene holds on a ring (`ringHold.ts`)', () => {
  beforeEach(() => {
    stubCanvas();
    setFxSettings({ tier: 'mid', reducedMotion: false });
    motion.reduced = false;
    clearRingHolds();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    motion.reduced = false;
    clearRingHolds();
  });

  const body = (v: SpRingView): Sprite => v.root.children[1] as Sprite;

  it('shows the held value in place of the cat\'s own while a scene holds it, and the cat\'s own again once it is let go', () => {
    const w = world(true);
    w.battle.units[0] = cat(1, 'w_viking', 0, 0.5);
    w.frame();
    const ring = w.ring(1) as SpRingView;
    const sheet = spRingArt();
    expect(body(ring).texture).toBe(sheet.frames[12]);
    // The fish capsule's refund: the simulation wrote the half already, the ring shows empty until the lid springs it back.
    holdRing(1, 0);
    w.frame();
    expect(body(ring).texture).toBe(sheet.frames[0]);
    holdRing(1, 1);
    w.frame();
    expect(body(ring).texture).toBe(sheet.frames[RING_FULL]);
    // Another cat's hold changes nothing here.
    releaseRing(1);
    holdRing(99, 0);
    w.frame();
    expect(body(ring).texture).toBe(sheet.frames[12]);
  });

  it('leaves a ring alone when nothing is held (the cat\'s own gauge, as it always was)', () => {
    const w = world(true);
    const u = cat(1, 'w_viking', 0, 0);
    w.battle.units[0] = u;
    w.frame();
    const ring = w.ring(1) as SpRingView;
    for (const sp of [0.3, 0.6, 0.9]) {
      u.sp = sp;
      w.frame();
      expect(body(ring).texture).toBe(spRingArt().frames[Math.floor(sp * RING_STEPS)]);
    }
  });
});

describe('the ring sheet has room for every frame it cuts', () => {
  it('lays the trickster\'s closed ring inside the canvas (a sheet one row short would cut it from outside, and the ring would be empty)', () => {
    const create = stubCanvas();
    // A fresh sheet: the module keeps the first one made, so look at the canvas the first test of this file made, through its textures.
    const a = spRingArt();
    const canvas = (a.trick.source as unknown as { resource: { width: number; height: number } }).resource;
    expect(canvas.height).toBeGreaterThan(0);
    for (const t of [...a.frames, a.flash, a.glow, a.holster, a.trick]) {
      expect(t.frame.x + t.frame.width, t.label).toBeLessThanOrEqual(canvas.width / 3 + 1e-6);
      expect(t.frame.y + t.frame.height, t.label).toBeLessThanOrEqual(canvas.height / 3 + 1e-6);
    }
    vi.unstubAllGlobals();
    void create;
  });
});

describe('the lucky cat\'s partner arrives from the sky', () => {
  beforeEach(() => {
    stubCanvas();
    setFxSettings({ tier: 'mid', reducedMotion: false });
    motion.reduced = false;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    motion.reduced = false;
  });

  /** A summon of this source, then the frame that makes the cat's view; returns what the arrivals were asked to do. */
  function summoned(source: 'skill' | 'button' | 'choice'): { drop: number; toss: number; ring: number } {
    const w = world(true);
    const arrivals = (w.views as unknown as { arrivals: { drop: (...a: unknown[]) => void; toss: (...a: unknown[]) => void; ring: (...a: unknown[]) => void } }).arrivals;
    const calls = { drop: 0, toss: 0, ring: 0 };
    arrivals.drop = () => void calls.drop++;
    arrivals.toss = () => void calls.toss++;
    arrivals.ring = () => void calls.ring++;
    // The NEW tag needs a font; what it looks like is not what these tests are about.
    vi.spyOn(UnitView.prototype, 'markNew').mockImplementation(() => undefined);
    const u = cat(7, 'w_paw', 6);
    w.battle.units[6] = u;
    w.battle.events.emit('summon', { unit: u, source });
    w.frame();
    return calls;
  }

  it('falls straight down for a summon of source skill (a gift from above), with no toss from the summon button', () => {
    expect(summoned('skill')).toEqual({ drop: 1, toss: 0, ring: 0 });
  });

  it('is tossed from the button for the player\'s own summon and from the pick\'s sheet for a pick, as it always was', () => {
    expect(summoned('button')).toEqual({ drop: 0, toss: 1, ring: 0 });
    expect(summoned('choice')).toEqual({ drop: 0, toss: 1, ring: 0 });
  });

  it('under reduced motion lands at once (just the ring), whatever the source', () => {
    motion.reduced = true;
    expect(summoned('skill')).toEqual({ drop: 0, toss: 0, ring: 1 });
  });
});
