/**
 * Ground areas: the patches that stay on the floor for a while. They are drawn in the game's own cartoon style (flat colours, a thick
 * dark-brown outline) and built in layers: a base that sits on the floor and shows the real reach, one drawn layer turning above it, and
 * a few flat particles that belong to the thing (flakes falling in the blizzard, scraps and stars spiralling into the black hole's core,
 * bubbles rising and popping from the potion). Nothing is added as light. Friendly areas are round and cool or magical (ice blue, lime,
 * violet); hostile ones are small and quiet (the haste and heal rings are one thin line hugging the carrier's body, in the colour of the
 * sticker its helped enemies wear; wet and live cells keep their hazard tape), so a friend and a foe differ by shape, colour family and motion.
 *
 * Every area has the same life: it lands (the base grows with an overshoot and a flat ring spreads from it), it loops, it warns (for
 * the last second the base draws in and blinks) and it lifts away. Under reduced motion the picture is the same and still, the
 * ending shown by a smaller, dimmer base. A low tier drops half the particles first. Areas that pile up on the lane thin out: the
 * newer of two friendly areas that overlap is fainter and keeps fewer particles, so a late wave with a dozen of them is a patchwork you can
 * still read the enemies through, not a wall.
 *
 * Views are pooled: the sprites of an area are built once and handed on to the next one, so starting a zone allocates only its small
 * handle and nothing is allocated per frame. The shapes are built at a reference radius and scaled.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TAU, clamp01, damp, lighten, mixColor } from '@/core/math';
import { Color } from '@/ui/theme';
import { drawHazardFrame } from './hazardFrame';
import { hash01, type FxRect, type ZoneHandle } from './loops';
import { BOLT_IDS, paint, type PaintId } from './paint';
import { Light } from './light';
import { Hue } from './palette';
import { fxSettings } from './settings';
import { fxTex, type FxTexId } from './textures';

export type DiscKind = 'frost' | 'brew' | 'void' | 'haste' | 'heal';
export type CellKind = 'wet' | 'zap';

/** A zone handle that also takes the simulation's clock: the last second warns that the area is ending. */
export interface AreaHandle extends ZoneHandle {
  /**
   * Seconds the area has left and how long it lasts in all, both in real time (the caller divides the simulation's by the game
   * speed). The warning is the last second, or the last third of a short life. Infinity = no end announced.
   */
  setLeft(seconds: number, total?: number): void;
}

/** Radius the disc shapes are built at; a view is scaled to the real reach. */
const REF = 100;
/** The drawn base is this many reach radii across, so it is the reach and a rim, not a bigger patch. */
const SPAN = 2.1;
const EXIT = 0.32;
/** Real seconds of warning before an area ends. */
export const AREA_WARN = 1;
/** The warning blinks this many times a second at most (the flash-safety limit is three). */
const BLINK_HZ = 2;
/** The shortest warning, for an area that only lasts a moment. */
const MIN_WARN = 0.35;
/** The ring that spreads from a landing area. */
const LAND = 0.45;
/** This many areas or fewer move their motifs every frame. */
const FEW_AREAS = 6;
/** Seconds a motif update may come early. */
const MOTIF_SLACK = 0.002;
/** Areas that start together are spread over this many frames of motif updates. */
const STAGGER = 4;
/** Two friendly areas overlap when their centres are closer than this share of their radii added; seconds between looks at who overlaps. */
const OVERLAP = 0.75;
const CROWD_EVERY = 0.2;
/** How many older areas on top of it make an area as faint as it goes. */
const CROWD_FULL = 3;

const CREAM = Hue.cream;

/** The drawn pictures each kind of disc is made of, in the order a warm-up should upload them. */
export const AREA_PICTURES: Readonly<Record<DiscKind, readonly PaintId[]>> = {
  frost: ['zone_frost', 'zone_snow', 'burst_ring'],
  brew: ['zone_ooze', 'burst_ring'],
  void: ['zone_hole', 'zone_holearms', 'burst_ring'],
  haste: [],
  heal: [],
};
export const DISC_KINDS: readonly DiscKind[] = ['frost', 'brew', 'void', 'haste', 'heal'];
/** The ring of a carrier is `AURA_RING` of its picture across, the reach hint `AURA_HINT` (the share of the cell the drawn circle fills). */
const AURA_RING = 110 / 128;
const AURA_HINT = 240 / 256;
/** The picture's size that makes the ring `2 * REF` across (a view is then scaled to the carrier's real size). */
const AURA_BOX = (2 * REF) / AURA_RING;
/** How opaque a carrier's ring is: it is a mark to find the carrier by, not a thing to look at. */
const AURA_ALPHA = 0.8;
/** The reach hint of a new carrier: held for this long after landing, then faded over the next `HINT_FADE`, at most this opaque. */
const HINT_HOLD = 0.3;
const HINT_FADE = 0.8;
const HINT_ALPHA = 0.32;
/** The areas that are friends and may pile up (the hostile rings follow their enemy and never do). */
const FRIENDLY: ReadonlySet<DiscKind> = new Set<DiscKind>(['frost', 'brew', 'void']);

/** One atlas shape as a sprite sized in design px (the atlas cell's own size is divided out). */
class Part {
  readonly s: Sprite;
  private readonly w0: number;
  private readonly h0: number;

  constructor(id: FxTexId, tint: number, w: number, h: number, parent: Container) {
    const info = fxTex(id);
    this.s = new Sprite(info.texture);
    this.s.anchor.set(info.ax, info.ay);
    this.s.tint = tint;
    this.s.eventMode = 'none';
    this.w0 = info.w;
    this.h0 = info.h;
    this.size(w, h);
    parent.addChild(this.s);
  }

  size(w: number, h: number): void {
    this.s.scale.set(w / this.w0, h / this.h0);
  }

  at(x: number, y: number, rotation = 0): void {
    this.s.position.set(x, y);
    this.s.rotation = rotation;
  }
}

/** One drawn picture as a sprite `w` design px wide, centred. */
class Pic {
  readonly s: Sprite;

  constructor(id: PaintId, w: number, parent: Container) {
    this.s = new Sprite(paint(id));
    this.s.anchor.set(0.5);
    this.s.eventMode = 'none';
    this.size(w);
    parent.addChild(this.s);
  }

  size(w: number): void {
    this.s.scale.set(w / Math.max(1, this.s.texture.width));
  }
}

/** A look: what a kind of disc is built of and how its layers and particles move. */
interface DiscLook {
  /** The base starts at this share of its size and grows to full over `enter` seconds with an overshoot. */
  from: number;
  enter: number;
  /** The base pulls in to this share while it lifts away (the black hole to its core). */
  exitShrink: number;
  /** The colour of the ring that spreads as the area lands (null: none; a carrier's ring just opens). */
  land: number | null;
  build(v: DiscArea): void;
  /** Layers that turn: every frame, a few sprites. `crowd` (0..1) is how much older areas lie over this one. */
  spin(v: DiscArea, age: number, warn: number, calm: boolean, crowd: number): void;
  /** Particles: only when the layer says the motif is due. `share` is the part of them kept (0..1). */
  animate(v: DiscArea, age: number, warn: number, calm: boolean, share: number): void;
}

/** Hide the particles beyond the share a weaker tier or a crowded lane keeps; they are only toggled when the share changes. */
function keep(parts: readonly Part[], share: number): number {
  const n = Math.max(0, Math.ceil(parts.length * share));
  for (let i = 0; i < parts.length; i++) {
    const v = i < n;
    const s = (parts[i] as Part).s;
    if (s.visible !== v) s.visible = v;
  }
  return n;
}

// ───────────────────────────── frost: an ice patch with a swirl of snow over it ─────────────────────────────

const FLAKES = 6;

const FROST: DiscLook = {
  from: 0.35,
  enter: 0.42,
  exitShrink: 0.12,
  land: Light.iceEdge,
  build(v) {
    v.base = new Pic('zone_frost', SPAN * REF, v.layer);
    v.swirl = new Pic('zone_snow', 1.55 * REF, v.layer);
    v.swirl.s.alpha = 0;
    for (let i = 0; i < FLAKES; i++) v.flakes.push(new Part('crystal', i % 2 === 0 ? CREAM : Light.ice, 16, 16, v.layer));
  },
  spin(v, age, warn, calm, crowd) {
    const k = calm ? 0.2 : 1 + 0.8 * warn;
    const grown = clamp01((age - 0.15) / 0.5);
    const swirl = v.swirl as Pic;
    swirl.s.rotation = age * 0.5 * k;
    swirl.s.alpha = 0.85 * grown * (1 - 0.4 * warn) * (1 - 0.7 * crowd);
    (v.base as Pic).s.alpha = 0.92 * (1 - 0.45 * crowd);
  },
  animate(v, age, warn, calm, share) {
    const n = keep(v.flakes, share);
    // Snowflakes fall in a slow swirl, turning, and melt away near the floor.
    for (let j = 0; j < n; j++) {
      const period = 3.1 + 0.37 * j;
      const phase = calm ? 0.35 + 0.1 * j : age / period + j * 0.31;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 7.1 + j * 3.3) * TAU;
      const r0 = (0.25 + 0.6 * hash01(cyc * 5.3 + j * 1.9)) * 0.8 * REF;
      const ang = a0 + t * 1.6 + (calm ? 0 : age * 0.35);
      const rad = r0 * (1 - 0.35 * t);
      const f = v.flakes[j] as Part;
      f.at(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.8 + (t - 0.5) * 30, t * 2.4 + j);
      const size = (12 + 6 * hash01(j * 2.7)) * (1 - 0.3 * t);
      f.size(size, size);
      f.s.alpha = Math.pow(Math.sin(Math.PI * t), 0.7) * (1 - 0.6 * warn);
    }
  },
};

// ───────────────────────────── brew: a green pool with bubbles rising and popping ─────────────────────────────

const BUBBLES = 7;
const SPLASH = 6;

const BREW: DiscLook = {
  from: 0.3,
  enter: 0.4,
  exitShrink: 0.25,
  land: Light.lime,
  build(v) {
    v.base = new Pic('zone_ooze', SPAN * REF, v.layer);
    for (let i = 0; i < BUBBLES; i++) v.bubbles.push(new Part('bubble', lighten(Color.leaf, 0.6), 10, 10, v.layer));
    for (let i = 0; i < SPLASH; i++) v.drops.push(new Part('droplet', mixColor(Light.lime, CREAM, 0.2), 10, 15, v.layer));
  },
  spin(v, age, _warn, calm, crowd) {
    const base = v.base as Pic;
    // The pool wobbles like a liquid: a slow swell and a small turn.
    const swell = calm ? 1 : 1 + 0.03 * Math.sin(age * 2.4);
    base.s.scale.set(((SPAN * REF) / Math.max(1, base.s.texture.width)) * swell);
    base.s.rotation = calm ? 0 : 0.05 * Math.sin(age * 1.3);
    base.s.alpha = 0.92 * (1 - 0.45 * crowd);
  },
  animate(v, age, warn, calm, share) {
    const n = keep(v.bubbles, share);
    for (let i = 0; i < n; i++) {
      const period = 1.5 + 0.26 * i;
      const phase = calm ? 0.35 + 0.09 * i : age / period + i * 0.29;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 11.7 + i * 2.3) * TAU;
      const r0 = Math.sqrt(hash01(cyc * 3.9 + i * 5.1)) * 0.62 * REF;
      const b = v.bubbles[i] as Part;
      b.at(Math.cos(a0) * r0 + Math.sin(t * 9 + i) * 4, Math.sin(a0) * r0 * 0.7 + 22 - t * 52);
      // It swells as it rises, then pops: the film opens out and is gone.
      const pop = t > 0.82 ? (t - 0.82) / 0.18 : 0;
      const d = (8 + 16 * Math.min(1, t / 0.82)) * (1 + 0.8 * pop);
      b.size(d, d);
      b.s.alpha = clamp01(t / 0.1) * (1 - pop) * (1 - 0.55 * warn);
    }
    // Landing splash: drops fly out of the pool for the first half second.
    for (let i = 0; i < SPLASH; i++) {
      const d = v.drops[i] as Part;
      const t = calm ? 1 : age / 0.5;
      d.s.visible = t < 1;
      if (t >= 1) continue;
      const dir = (i / SPLASH) * TAU + 0.4;
      const reach = (0.55 + 0.45 * hash01(i * 4.1)) * REF * 1.05;
      d.at(Math.cos(dir) * reach * Ease.cubicOut(t), Math.sin(dir) * reach * 0.8 * Ease.cubicOut(t) - 38 * Math.sin(Math.PI * t), dir + Math.PI / 2);
      d.s.alpha = 1 - t * t;
    }
  },
};

// ───────────────────────────── void: a black hole, its arms turning, scraps and stars falling into the core ─────────────────────────────

const SCRAPS = 8;
const STARS = 4;

const VOID: DiscLook = {
  from: 0.12,
  enter: 0.5,
  exitShrink: 0.88,
  land: Light.voidRim,
  build(v) {
    v.hole = new Pic('zone_hole', SPAN * REF, v.layer);
    v.arms = new Pic('zone_holearms', 1.6 * REF, v.layer);
    for (let i = 0; i < SCRAPS; i++) v.scraps.push(new Part(i % 2 === 0 ? 'spark' : 'confetti', Light.voidScraps[i % Light.voidScraps.length] as number, 14, 9, v.layer));
    for (let i = 0; i < STARS; i++) v.stars.push(new Part('sparkle', CREAM, 12, 12, v.layer));
  },
  spin(v, age, warn, calm, crowd) {
    const k = calm ? 0.2 : 1 + 2.2 * warn;
    const arms = v.arms as Pic;
    const hole = v.hole as Pic;
    arms.s.rotation = age * 1.25 * k;
    arms.s.alpha = 0.9 * (1 - 0.6 * crowd);
    hole.s.rotation = -age * 0.3 * k;
    hole.s.alpha = 0.95 * (1 - 0.45 * crowd);
    // The core breathes and swells in the warning, as if the hole were about to close or burst.
    const beat = calm ? 0 : 0.025 * Math.sin(age * 3.1) + 0.06 * warn * Math.sin(age * 14);
    hole.s.scale.set(((SPAN * REF) / Math.max(1, hole.s.texture.width)) * (1 + beat + 0.05 * warn));
  },
  animate(v, age, warn, calm, share) {
    // Scraps spiral in from the rim and shrink to nothing at the core: this thing eats what is near it.
    const n = keep(v.scraps, share);
    for (let i = 0; i < n; i++) {
      const rate = (1 + 0.5 * warn) / (1.4 + 0.12 * (i % 4));
      const phase = calm ? 0.2 + 0.08 * i : age * rate + i / SCRAPS;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 13.3 + i * 4.1) * TAU;
      const r = REF * (0.95 - 0.78 * t * t);
      const a = a0 + 5 * t * t + (calm ? 0 : age * 0.5);
      const s = v.scraps[i] as Part;
      s.at(Math.cos(a) * r, Math.sin(a) * r, a + Math.PI / 2 + t * 6);
      const k = 1 - 0.65 * t;
      s.size(15 * k, 9 * k);
      s.s.alpha = clamp01(t / 0.08) * (1 - clamp01((t - 0.9) / 0.1));
    }
    const m = keep(v.stars, share);
    for (let i = 0; i < m; i++) {
      const a = (calm ? 0 : age * (0.9 + 0.2 * i)) + (i / STARS) * TAU;
      const r = REF * (0.55 + 0.07 * Math.sin(age * 1.7 + i * 2));
      const s = v.stars[i] as Part;
      s.at(Math.cos(a) * r, Math.sin(a) * r, a);
      const d = 8 + 6 * Math.sin(age * 5 + i * 1.7);
      s.size(Math.max(3, d), Math.max(3, d));
      s.s.alpha = 0.9 - 0.5 * warn;
    }
  },
};

// ───────────────────────────── hostile rings round an enemy: speed and mending ─────────────────────────────

/**
 * A carrier's reach, drawn faintly at the aura's real radius for the first moments of its life, then gone: where its help reaches is
 * worth a glance when it appears and clutter after that.
 */
function reachHint(v: DiscArea, age: number, tint: number): void {
  const hint = v.hint as Part;
  const fade = clamp01(1 - (age - HINT_HOLD) / HINT_FADE);
  hint.s.visible = v.hintK > 0 && fade > 0;
  if (!hint.s.visible) return;
  const w = (2 * REF * v.hintK) / AURA_HINT;
  hint.size(w, w);
  hint.s.tint = tint;
  hint.s.alpha = HINT_ALPHA * fade;
}

const HASTE: DiscLook = {
  from: 0.8,
  enter: 0.25,
  exitShrink: 0.1,
  land: null,
  build(v) {
    v.ring = new Part('auraDash', Color.coral, AURA_BOX, AURA_BOX, v.layer);
    v.hint = new Part('auraReach', Color.coral, 2 * REF, 2 * REF, v.layer);
  },
  spin(v, age, _warn, calm) {
    // A gauge of short strokes turning slowly: one thin line, no fill, never in the way of what it rings.
    (v.ring as Part).s.rotation = calm ? 0 : age * 0.9;
    (v.ring as Part).s.alpha = AURA_ALPHA;
    reachHint(v, age, Color.coral);
  },
  animate() {},
};

const HEAL: DiscLook = {
  from: 0.8,
  enter: 0.25,
  exitShrink: 0.1,
  land: null,
  build(v) {
    v.ring = new Part('auraBead', Color.berry, AURA_BOX, AURA_BOX, v.layer);
    v.hint = new Part('auraReach', Color.berry, 2 * REF, 2 * REF, v.layer);
  },
  spin(v, age, _warn, calm) {
    // A plain line with four beads and a slow two-beat pulse.
    const ring = v.ring as Part;
    const beat = calm ? 0 : Math.pow(Math.max(0, Math.sin(age * 5.2)), 6) * 0.035;
    ring.size(AURA_BOX * (1 + beat), AURA_BOX * (1 + beat));
    ring.s.rotation = calm ? 0 : -age * 0.35;
    ring.s.alpha = AURA_ALPHA;
    reachHint(v, age, Color.berry);
  },
  animate() {},
};

const LOOKS: Readonly<Record<DiscKind, DiscLook>> = { frost: FROST, brew: BREW, void: VOID, haste: HASTE, heal: HEAL };

// ───────────────────────────── the pooled view of one disc area ─────────────────────────────

interface Pooled {
  /** Bumped on every start: a handle from an earlier life can no longer steer this view. */
  gen: number;
  active: boolean;
  left: number;
  /** Seconds before the end at which the warning starts. */
  span: number;
  update(dt: number, every: number): void;
  stop(): void;
  moveTo(x: number, y: number): void;
}

/** One disc area: the base and its turning layer and particles under one root. */
class DiscArea implements Pooled {
  readonly root = new Container();
  readonly layer = new Container();
  base: Pic | null = null;
  /** A carrier's thin ring and its reach hint (hostile rings only). */
  ring: Part | null = null;
  hint: Part | null = null;
  /** The hint's reach as a multiple of the ring's radius (0: no hint: another carrier's circle already shows the reach here). */
  hintK = 0;
  swirl: Pic | null = null;
  arms: Pic | null = null;
  hole: Pic | null = null;
  readonly flakes: Part[] = [];
  readonly bubbles: Part[] = [];
  readonly drops: Part[] = [];
  readonly scraps: Part[] = [];
  readonly stars: Part[] = [];
  gen = 0;
  active = false;
  left = Infinity;
  span = AREA_WARN;
  handle: Handle | null = null;
  /** Start order: of two overlapping areas the one with the higher number is the newer, and is the one that thins out. */
  serial = 0;
  /** How many older friendly areas lie over this one, as a share of `CROWD_FULL` (set by the layer; `crowd` follows it smoothly). */
  crowdWant = 0;
  radius = REF;
  /** The ring that spreads from the area's edge as it lands: flat, in the colour of the kind. */
  private readonly land: Sprite;
  private age = 0;
  private leaving = false;
  private leaveAge = 0;
  private crowd = 0;
  /** Time on the area's own clock at which its motif is next moved (see `AreaLayer.update`). */
  private motifAt = 0;

  constructor(
    readonly kind: DiscKind,
    private readonly look: DiscLook,
    /** Which of the layer's views this is: areas started together move their motifs on different frames. */
    readonly slot: number,
    private readonly onRelease: (v: DiscArea) => void,
  ) {
    this.root.eventMode = 'none';
    this.root.visible = false;
    this.root.addChild(this.layer);
    look.build(this);
    this.land = new Sprite(paint('burst_ring'));
    this.land.anchor.set(0.5);
    this.land.eventMode = 'none';
    this.land.visible = false;
    if (look.land !== null) this.land.tint = look.land;
    this.root.addChild(this.land);
  }

  /** `every` is the layer's current motif interval: the first move of the motif waits a share of it that depends on the slot. */
  start(x: number, y: number, radius: number, every: number, serial: number, reach: number): void {
    this.gen++;
    this.active = true;
    this.left = Infinity;
    this.span = AREA_WARN;
    this.age = 0;
    this.leaving = false;
    this.leaveAge = 0;
    this.radius = radius;
    this.hintK = reach > 0 ? reach / radius : 0;
    this.serial = serial;
    this.crowd = 0;
    this.crowdWant = 0;
    this.root.position.set(x, y);
    this.root.visible = true;
    this.root.alpha = 0;
    this.motifAt = ((this.slot % STAGGER) / STAGGER) * every;
    this.apply(true, true);
  }

  stop(): void {
    if (!this.active || this.leaving) return;
    this.leaving = true;
    this.leaveAge = 0;
  }

  moveTo(x: number, y: number): void {
    this.root.position.set(x, y);
  }

  get x(): number {
    return this.root.position.x;
  }

  get y(): number {
    return this.root.position.y;
  }

  /** `every` is how often (seconds) the motif's many small parts are moved; the layers that turn follow every frame. */
  update(dt: number, every: number): void {
    if (!this.active) return;
    this.age += dt;
    this.crowd = damp(this.crowd, this.crowdWant, 0.15, dt);
    if (this.leaving) {
      this.leaveAge += dt;
      if (this.leaveAge >= EXIT) {
        this.active = false;
        this.root.visible = false;
        this.onRelease(this);
        return;
      }
    }
    // A little early is on time: two 60 Hz frames are 33.3 ms, and a motif due then must not wait for a third.
    const motif = this.age >= this.motifAt - MOTIF_SLACK;
    if (motif) this.motifAt = this.age + every;
    this.apply(false, motif);
  }

  private apply(first: boolean, motif: boolean): void {
    const calm = fxSettings.reducedMotion;
    const look = this.look;
    const age = this.age;
    const warn = this.left >= this.span ? 0 : clamp01(1 - Math.max(0, this.left) / this.span);
    // Blinking is a flash: with flashes off, or under reduced motion, the warning is a steady dimming instead.
    const steady = calm || !fxSettings.flashes;
    const blink = Math.sin(age * TAU * BLINK_HZ) > 0;
    let scale = calm ? 1 : look.from + (1 - look.from) * Ease.backOut(clamp01(age / look.enter));
    let alpha = clamp01(age / 0.12);
    let rot = 0;
    // The ending: the base draws in and dims and, with motion, blinks.
    scale *= 1 - 0.1 * warn;
    if (warn > 0) alpha *= steady ? 1 - 0.25 * warn : 1 - 0.4 * warn * (blink ? 0 : 1);
    if (this.leaving) {
      const k = clamp01(this.leaveAge / EXIT);
      scale *= 1 - look.exitShrink * k;
      alpha *= 1 - k;
      rot = calm ? 0 : 0.3 * k * (this.kind === 'void' ? -4 : 1);
    }
    const unit = this.radius / REF;
    this.root.scale.set(unit * scale);
    this.root.rotation = rot;
    this.root.alpha = first ? 0 : alpha;
    look.spin(this, age, warn, calm, this.crowd);
    // The landing ring: one flat ring spreads from the area's edge as it lands.
    const lk = clamp01(age / LAND);
    this.land.visible = !calm && lk < 1 && look.land !== null;
    if (this.land.visible) {
      const d = 2 * REF * (0.7 + 0.5 * Ease.cubicOut(lk));
      this.land.scale.set(d / Math.max(1, this.land.texture.width));
      this.land.alpha = 0.85 * (1 - lk);
    }
    if (motif) look.animate(this, age, warn, calm, (fxSettings.tier === 'low' ? 0.5 : 1) * (1 - 0.7 * this.crowd));
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ───────────────────────────── cells under hazard: wet puddles and live cells ─────────────────────────────

const RIPPLES = 3;
const DROPS = 3;
/** Where a cat's feet stand in its cell, as a share of the cell height from the middle: the puddle and the bolts lie there, where the cat does not cover them. */
const FEET = 0.24;
/** Seconds between one painted bolt and the next in a live cell. */
const ZAP_FLICKER = 0.07;

/** A hazard cell: hazard tape round the edge, a berry sticker on the corner, and the kind's own picture inside. */
class CellArea implements Pooled {
  readonly root = new Container();
  gen = 0;
  active = false;
  left = Infinity;
  span = AREA_WARN;
  handle: Handle | null = null;
  private readonly body = new Container();
  private readonly tint: Part;
  private readonly pool: Pic | null = null;
  private readonly ripples: Part[] = [];
  private readonly drops: Part[] = [];
  private readonly glyph: Part | null = null;
  private readonly bolts: Sprite[] = [];
  private readonly sparks: Part[] = [];
  private readonly tape: Graphics;
  private age = 0;
  private leaving = false;
  private leaveAge = 0;

  constructor(
    readonly kind: CellKind,
    readonly w: number,
    readonly h: number,
    private readonly onRelease: (v: CellArea) => void,
  ) {
    this.root.eventMode = 'none';
    this.root.visible = false;
    this.root.addChild(this.body);
    const wet = kind === 'wet';
    this.tint = new Part('patch', wet ? Hue.water : Hue.zap, w - 6, h - 6, this.body);
    this.tint.s.alpha = wet ? 0.3 : 0.36;
    if (wet) {
      this.pool = new Pic('zone_puddle', w * 0.9, this.body);
      this.pool.s.alpha = 0.92;
      for (let i = 0; i < RIPPLES; i++) this.ripples.push(new Part('ring', CREAM, 10, 4, this.body));
      for (let i = 0; i < DROPS; i++) this.drops.push(new Part('droplet', mixColor(Hue.water, CREAM, 0.45), 11, 16, this.body));
    } else {
      // Two painted bolts crackle across the cell at the cat's feet, and a bolt glyph sits at its heart.
      for (let row = 0; row < 2; row++) {
        const bolt = new Sprite(paint(BOLT_IDS[row] as PaintId));
        bolt.anchor.set(0.5);
        bolt.eventMode = 'none';
        bolt.position.set(0, h * (FEET - 0.04 + (row === 0 ? -0.07 : 0.07)));
        this.body.addChild(bolt);
        this.bolts.push(bolt);
      }
      this.glyph = new Part('zapGlyph', CREAM, 34, 34, this.body);
      for (let i = 0; i < 3; i++) this.sparks.push(new Part('bolt', CREAM, 22, 5, this.body));
    }
    this.tape = new Graphics();
    drawHazardFrame(this.tape, w - 6, h - 6, 12, 20);
    this.root.addChild(this.tape);
    // The kind's sticker on the corner: colour is never the only cue.
    const stickerAt = (parent: Container): void => {
      const x = -w / 2 + 24;
      const y = -h / 2 + 24;
      new Part('disc', Hue.shadow, 34, 34, parent).at(x + 1.5, y + 3);
      new Part('disc', CREAM, 34, 34, parent).at(x, y);
      new Part('disc', Color.berry, 28, 28, parent).at(x, y);
      new Part(wet ? 'droplet' : 'zapGlyph', CREAM, wet ? 10 : 15, wet ? 15 : 15, parent).at(x, y + (wet ? 1 : 0));
    };
    stickerAt(this.root);
  }

  start(x: number, y: number): void {
    this.gen++;
    this.active = true;
    this.left = Infinity;
    this.span = AREA_WARN;
    this.age = 0;
    this.leaving = false;
    this.leaveAge = 0;
    this.root.position.set(x, y);
    this.root.visible = true;
    this.root.alpha = 0;
    this.apply(true);
  }

  stop(): void {
    if (!this.active || this.leaving) return;
    this.leaving = true;
    this.leaveAge = 0;
  }

  moveTo(x: number, y: number): void {
    this.root.position.set(x, y);
  }

  update(dt: number): void {
    if (!this.active) return;
    this.age += dt;
    if (this.leaving) {
      this.leaveAge += dt;
      if (this.leaveAge >= EXIT + 0.1) {
        this.active = false;
        this.root.visible = false;
        this.onRelease(this);
        return;
      }
    }
    this.apply(false);
  }

  private apply(first: boolean): void {
    const calm = fxSettings.reducedMotion;
    const age = this.age;
    const warn = this.left >= this.span ? 0 : clamp01(1 - Math.max(0, this.left) / this.span);
    let scale = calm ? 1 : 1 + 0.12 * (1 - Ease.cubicOut(clamp01(age / 0.25)));
    let alpha = clamp01(age / 0.15);
    if (this.leaving) {
      const k = clamp01(this.leaveAge / (EXIT + 0.1));
      scale *= 1 - 0.1 * k;
      alpha *= 1 - k;
    }
    this.root.scale.set(scale);
    this.root.alpha = first ? 0 : alpha;
    // The tape blinks slowly as the hazard runs out (still: the tape fades to half).
    this.tape.alpha = warn > 0 ? (calm || !fxSettings.flashes ? 1 - 0.5 * warn : 1 - 0.55 * warn * (Math.sin(age * TAU * BLINK_HZ) > 0 ? 1 : 0.2)) : 1;
    if (this.kind === 'wet') this.wet(age, warn, calm);
    else this.zap(age, warn, calm);
  }

  private wet(age: number, warn: number, calm: boolean): void {
    const pool = this.pool as Pic;
    // The puddle dries up as the end nears: it shrinks and loses colour.
    const dry = 1 - 0.5 * warn;
    pool.size(this.w * 0.9 * dry);
    pool.s.alpha = 0.92 * (1 - 0.35 * warn);
    pool.s.rotation = calm ? 0 : 0.06 * Math.sin(age * 1.1);
    this.tint.s.alpha = 0.3 * (1 - 0.6 * warn);
    pool.s.position.set(0, FEET * this.h);
    for (let i = 0; i < RIPPLES; i++) {
      const phase = calm ? 0.35 + i * 0.2 : age / 1.7 + i / RIPPLES;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const r = this.ripples[i] as Part;
      const wd = this.w * 0.36 * (0.14 + 0.86 * Ease.cubicOut(t)) * dry;
      r.at((hash01(cyc * 3 + i) - 0.5) * this.w * 0.46, FEET * this.h + (hash01(cyc * 5 + i + 7) - 0.5) * this.h * 0.12);
      r.size(wd, wd * 0.42);
      r.s.alpha = calm ? 0.55 : 0.85 * Math.pow(1 - t, 1.4);
    }
    // Drops fall into it from above and make the rings.
    for (let i = 0; i < DROPS; i++) {
      const d = this.drops[i] as Part;
      if (calm) {
        d.s.visible = false;
        continue;
      }
      const phase = age / 1.3 + i / DROPS;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const fall = t < 0.5 ? t / 0.5 : 1;
      d.s.visible = t < 0.5;
      d.at((hash01(cyc * 3 + i + 40) - 0.5) * this.w * 0.5, -this.h * 0.2 + fall * this.h * (FEET + 0.2));
      d.s.alpha = (1 - 0.5 * warn) * 0.95;
    }
  }

  private zap(age: number, warn: number, calm: boolean): void {
    const flick = calm ? 0.6 : 0.5 + 0.5 * Math.sin(age * 17) * Math.sin(age * 7.3 + 1);
    this.tint.s.alpha = (0.26 + 0.16 * flick) * (1 - 0.5 * warn);
    const step = calm ? 0 : Math.floor(age / ZAP_FLICKER);
    for (let i = 0; i < this.bolts.length; i++) {
      const b = this.bolts[i] as Sprite;
      b.texture = paint(BOLT_IDS[(step * 2 + i * 3) % BOLT_IDS.length] as PaintId);
      const wide = (this.w * 0.92) / Math.max(1, b.texture.width);
      b.scale.set(wide * (calm || step % 2 === 0 ? 1 : -1), wide * 0.9);
      b.alpha = (calm ? 0.9 : 0.55 + 0.45 * flick) * (1 - 0.6 * warn);
    }
    const glyph = this.glyph as Part;
    const g = 34 * (1 + (calm ? 0 : 0.1 * Math.sin(age * 8)));
    glyph.size(g, g);
    glyph.s.alpha = 1 - 0.55 * warn;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i] as Part;
      const phase = age * 6 + i * 2.1;
      const cyc = Math.floor(phase);
      const on = !calm && phase - cyc < 0.35;
      s.s.visible = on;
      if (!on) continue;
      const a = hash01(cyc * 7.7 + i) * TAU;
      s.at(Math.cos(a) * this.w * 0.28, Math.sin(a) * this.h * 0.28, a);
      s.s.alpha = 1 - 0.6 * warn;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

class Handle implements AreaHandle {
  private promise: Promise<void> | null = null;
  private resolve: (() => void) | null = null;
  private over = false;

  constructor(
    private readonly view: DiscArea | CellArea,
    private readonly gen: number,
  ) {}

  get alive(): boolean {
    return this.view.gen === this.gen && this.view.active;
  }

  get done(): Promise<void> {
    if (this.over || !this.alive) return Promise.resolve();
    this.promise ??= new Promise<void>((res) => {
      this.resolve = res;
    });
    return this.promise;
  }

  stop(): void {
    if (this.alive) this.view.stop();
  }

  moveTo(x: number, y: number): void {
    if (this.alive) this.view.moveTo(x, y);
  }

  setLeft(seconds: number, total = Infinity): void {
    if (!this.alive) return;
    this.view.left = seconds;
    this.view.span = Math.min(AREA_WARN, Math.max(MIN_WARN, total * 0.35));
  }

  settle(): void {
    this.over = true;
    this.resolve?.();
  }
}

// ───────────────────────────── the layer ─────────────────────────────

/** Every ground area of one scene: starts them from the pool, steps the live ones, and gives each back when it has left. */
export class AreaLayer {
  private readonly parent = new Container();
  private readonly live: Array<DiscArea | CellArea> = [];
  private readonly freeDisc = new Map<DiscKind, DiscArea[]>();
  private readonly freeCell = new Map<string, CellArea[]>();
  private readonly all: Array<DiscArea | CellArea> = [];
  private serial = 0;
  private crowdWait = 0;

  constructor(into: Container) {
    this.parent.label = 'areas';
    this.parent.eventMode = 'none';
    into.addChild(this.parent);
  }

  /** Areas on screen right now. */
  get count(): number {
    return this.live.length;
  }

  private make(kind: DiscKind, free: DiscArea[]): DiscArea {
    const v = new DiscArea(kind, LOOKS[kind], this.all.length, (d) => this.release(d, free));
    this.parent.addChild(v.root);
    this.all.push(v);
    return v;
  }

  private freeOf(kind: DiscKind): DiscArea[] {
    let free = this.freeDisc.get(kind);
    if (!free) {
      free = [];
      this.freeDisc.set(kind, free);
    }
    return free;
  }

  /** A round area of `radius` design px at (x, y); a hostile ring may also draw its `reach` (design px) faintly for its first moments. */
  disc(kind: DiscKind, x: number, y: number, radius: number, reach = 0): AreaHandle {
    const free = this.freeOf(kind);
    const v = free.pop() ?? this.make(kind, free);
    v.start(x, y, radius, this.motifEvery(), ++this.serial, reach);
    this.crowdWait = 0;
    return this.begin(v);
  }

  /** Build one view of `kind` ahead of the first area that needs it and leave it in the pool. Returns true when a view was built. */
  ready(kind: DiscKind): boolean {
    const free = this.freeOf(kind);
    if (free.length > 0) return false;
    free.push(this.make(kind, free));
    return true;
  }

  /** A hazard cell: `rect` is its top-left based footprint in the layer's coordinates. */
  cell(kind: CellKind, rect: FxRect): AreaHandle {
    const key = `${kind}:${Math.round(rect.w)}x${Math.round(rect.h)}`;
    let free = this.freeCell.get(key);
    if (!free) {
      free = [];
      this.freeCell.set(key, free);
    }
    let v = free.pop();
    if (!v) {
      const pool = free;
      v = new CellArea(kind, rect.w, rect.h, (c) => this.release(c, pool));
      this.parent.addChild(v.root);
      this.all.push(v);
    }
    v.start(rect.x + rect.w / 2, rect.y + rect.h / 2);
    return this.begin(v);
  }

  private begin(v: DiscArea | CellArea): AreaHandle {
    const h = new Handle(v, v.gen);
    v.handle = h;
    this.live.push(v);
    return h;
  }

  private release<T extends DiscArea | CellArea>(v: T, free: T[]): void {
    const i = this.live.indexOf(v);
    if (i >= 0) {
      this.live[i] = this.live[this.live.length - 1] as DiscArea | CellArea;
      this.live.pop();
    }
    v.handle?.settle();
    v.handle = null;
    free.push(v);
  }

  /**
   * How often (seconds) the motifs of the areas on screen are moved. A handful of areas move every frame; a crowd of them (twenty
   * blizzards and clouds on a late wave) moves at the pace the eye still reads as smooth, slower on a weaker tier. The layers that turn
   * follow every frame regardless.
   */
  private motifEvery(): number {
    const tier = fxSettings.tier;
    if (this.live.length <= FEW_AREAS) return tier === 'low' ? 1 / 30 : 0;
    return tier === 'high' ? 1 / 40 : tier === 'mid' ? 1 / 30 : 1 / 20;
  }

  /** Tell each friendly area how many older ones lie over it, so the newer of a pile thins out. Twenty areas: a few hundred distance checks, five times a second. */
  private refreshCrowd(): void {
    const list = this.live;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!(a instanceof DiscArea) || !FRIENDLY.has(a.kind)) continue;
      let over = 0;
      for (let j = 0; j < list.length; j++) {
        const b = list[j];
        if (j === i || !(b instanceof DiscArea) || !FRIENDLY.has(b.kind) || b.serial >= a.serial) continue;
        const reach = (a.radius + b.radius) * OVERLAP;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (dx * dx + dy * dy < reach * reach) over++;
      }
      a.crowdWant = Math.min(1, over / CROWD_FULL);
    }
  }

  update(dt: number): void {
    this.crowdWait -= dt;
    if (this.crowdWait <= 0) {
      this.crowdWait = CROWD_EVERY;
      this.refreshCrowd();
    }
    const every = this.motifEvery();
    // A view releases itself from inside its own update, which swaps the last live one into its place: walk backwards.
    for (let i = this.live.length - 1; i >= 0; i--) (this.live[i] as DiscArea | CellArea).update(dt, every);
  }

  /** Take every area away at once (scene change, `Fx.clear`). */
  clear(): void {
    for (const v of this.live.slice()) {
      v.active = false;
      v.root.visible = false;
      v.handle?.settle();
      v.handle = null;
    }
    this.live.length = 0;
    for (const list of this.freeDisc.values()) list.length = 0;
    for (const list of this.freeCell.values()) list.length = 0;
    // Everything is back in the pool in one go: rebuild the free lists from the views that exist.
    for (const v of this.all) {
      if (v instanceof DiscArea) this.freeDisc.get(v.kind)?.push(v);
      else this.freeCell.get(`${v.kind}:${Math.round(v.w)}x${Math.round(v.h)}`)?.push(v);
    }
  }

  destroy(): void {
    this.live.length = 0;
    this.freeDisc.clear();
    this.freeCell.clear();
    for (const v of this.all) v.handle?.settle();
    this.all.length = 0;
    this.parent.destroy({ children: true });
  }
}
