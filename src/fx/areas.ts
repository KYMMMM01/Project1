/**
 * Ground areas: the patches that stay on the floor for a while. Friendly ones are cut from paper in a cool or earthy colour with
 * a cream rim and a dashed or dotted line inside it (blizzard, potion cloud, black hole); hostile ones wear berry and coral
 * (wet and live cells under hazard tape, the haste and heal rings round an enemy), so friend and foe differ by their rim before
 * anyone reads a colour. Every area has the same life: it lands (a sheet dropped on the floor, a ring spreading from it), it
 * loops with one small moving motif that stays quiet enough to read the enemies on it, it says it is ending (its dashes drop
 * out and the sheet draws in over the last second) and it lifts away. Under reduced motion the picture is the same and still,
 * with the ending shown by the missing dashes and a smaller, dimmer sheet.
 *
 * Views are pooled: the sprites and graphics of an area are built once and handed on to the next one, so starting a zone
 * allocates only its small handle and nothing is allocated per frame. The shapes are drawn at a reference radius and scaled.
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TAU, clamp01, lighten, mixColor } from '@/core/math';
import { Color } from '@/ui/theme';
import { bakeArea } from './areaArt';
import { drawHazardFrame } from './hazardFrame';
import { hash01, type FxRect, type ZoneHandle } from './loops';
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
const ENTER = 0.3;
const EXIT = 0.32;
/** Real seconds of warning before an area ends. */
export const AREA_WARN = 1;
const BLINK_HZ = 2;
/** The shortest warning, for an area that only lasts a moment. */
const MIN_WARN = 0.35;
/** The ring that spreads from a landing sheet. */
const LAND = 0.42;
/** This many areas or fewer move their motifs every frame. */
const FEW_AREAS = 6;
/** Seconds a motif update may come early. */
const MOTIF_SLACK = 0.002;
/** Areas that start together are spread over this many frames of motif updates. */
const STAGGER = 4;

const CREAM = Hue.cream;

/** When each of up to 64 dashes drops out during the warning (0 = first, 1 = last): a fixed shuffle, so the rim breaks up unevenly. */
const DROP_ORDER = new Float32Array(64);
for (let i = 0; i < 64; i++) DROP_ORDER[i] = 0.1 + 0.8 * hash01(i * 1.7 + 3);

/** The warning level at which each of the three dash groups drops out. */
const DASH_STEPS: readonly number[] = [0.3, 0.6, 0.9];

/** Which of the three groups dash `i` belongs to: scattered, so what is left of the rim looks torn rather than evenly thinned. */
function dashGroup(i: number): number {
  return Math.min(2, Math.floor(hash01(i * 2.3 + 1) * 3));
}

/** How many dash groups have dropped out at warning level `warn`: 0 is the whole ring, 3 is none of it. */
function dashLevel(warn: number): number {
  let level = 0;
  while (level < DASH_STEPS.length && warn > (DASH_STEPS[level] as number)) level++;
  return level;
}

/** Half the side of the square every baked piece covers: the reference radius, the widest rim and a little air. */
const BAKE_HALF = REF + 8;

/** What one kind of disc is made of once it has been drawn: the sheet with its cut rim, and the dashed line at each stage of the warning. */
interface Baked {
  sheet: Texture;
  /** `dashes[level]`: the ring with the first `level` groups gone. */
  dashes: Texture[];
}

/** The pieces of a kind as they get baked (a piece is one texture; the warm-up bakes one a frame). */
interface Parts {
  sheet: Texture | null;
  dashes: Array<Texture | null>;
}

const PARTS = new Map<DiscKind, Parts>();

/** How many pieces one kind is baked in: the sheet and the dashed ring at each stage of the warning. */
export const AREA_BAKE_STEPS = 1 + DASH_STEPS.length;
export const DISC_KINDS: readonly DiscKind[] = ['frost', 'brew', 'void', 'haste', 'heal'];

function partsOf(kind: DiscKind): Parts {
  let parts = PARTS.get(kind);
  if (!parts) {
    parts = { sheet: null, dashes: DASH_STEPS.map(() => null) };
    PARTS.set(kind, parts);
  }
  return parts;
}

function bakeSheet(look: DiscLook): Texture {
  const sheet = new Graphics();
  outline(sheet, look.edge, look.steps).fill({ color: look.paper, alpha: look.paperAlpha });
  outline(sheet, look.edge, look.steps).stroke({ width: look.rimWidth, color: look.rim, alpha: look.rimAlpha, join: 'bevel' });
  return bakeArea(sheet, 2 * BAKE_HALF, 2 * BAKE_HALF);
}

function bakeDashes(look: DiscLook, level: number): Texture {
  const ring = new Graphics();
  for (let i = 0; i < look.dashCount; i++) {
    if (dashGroup(i) < level) continue;
    const th = (i / look.dashCount) * TAU;
    const r = look.dashAt * REF;
    const cx = Math.cos(th) * r;
    const cy = Math.sin(th) * r;
    const tx = -Math.sin(th) * look.dashW * 0.5;
    const ty = Math.cos(th) * look.dashW * 0.5;
    ring.moveTo(cx - tx, cy - ty).lineTo(cx + tx, cy + ty);
  }
  ring.stroke({ width: look.dashH, color: look.dash, cap: 'round' });
  return bakeArea(ring, 2 * BAKE_HALF, 2 * BAKE_HALF);
}

/**
 * Bake piece `step` (0 the sheet, then the three dashed rings) of a kind if it has not been baked yet. The warm-up calls this a piece
 * a frame before a wave that needs the kind; `bakedOf` does the same for whatever is missing the first time an area of the kind starts.
 */
export function bakeAreaStep(kind: DiscKind, step: number): void {
  const parts = partsOf(kind);
  const look = LOOKS[kind];
  if (step === 0) parts.sheet ??= bakeSheet(look);
  else if (step - 1 < parts.dashes.length) parts.dashes[step - 1] ??= bakeDashes(look, step - 1);
}

/** True when every piece of the kind is baked. */
export function areaBaked(kind: DiscKind): boolean {
  const parts = PARTS.get(kind);
  return !!parts && parts.sheet !== null && parts.dashes.every((d) => d !== null);
}

function bakedOf(kind: DiscKind): Baked {
  for (let step = 0; step < AREA_BAKE_STEPS; step++) bakeAreaStep(kind, step);
  const parts = partsOf(kind);
  return { sheet: parts.sheet as Texture, dashes: parts.dashes as Texture[] };
}

/** A sprite of a baked piece, centred on the area's origin and sized in design px. */
function pieceSprite(texture: Texture): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.eventMode = 'none';
  return s;
}

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

  hide(): void {
    this.s.visible = false;
  }
}

/** A closed path round the origin whose radius is `edge(angle)` times the reference radius. */
function outline(g: Graphics, edge: (th: number) => number, steps: number): Graphics {
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * TAU;
    const r = REF * edge(th);
    if (i === 0) g.moveTo(r, 0);
    else g.lineTo(Math.cos(th) * r, Math.sin(th) * r);
  }
  return g.closePath();
}

interface DiscLook {
  edge(th: number): number;
  /** Points of the outline polygon: enough that the scallops and bumps stay round, no more. */
  steps: number;
  paper: number;
  /** Opacity of the sheet: low enough that the floor, the path and the enemies on it read through. */
  paperAlpha: number;
  /** The rim: colour, width and opacity of the cut edge. */
  rim: number;
  rimWidth: number;
  rimAlpha: number;
  dash: number;
  dashCount: number;
  /** Length and thickness of a dash; a dotted line has the same two (a dot is a short fat dash). */
  dashW: number;
  dashH: number;
  /** Radius of the dashed line as a share of the reference radius. */
  dashAt: number;
  /** Slow turn of the dashed line, radians per second. */
  dashSpin: number;
  /** The sheet pulls in to this share at the end of the warning (the black hole to its core). */
  exitShrink: number;
  build(v: DiscArea): void;
  animate(v: DiscArea, age: number, warn: number, calm: boolean): void;
}

/** Eased growth of a motif that lands with the sheet: 0 until its turn, then a small overshoot. */
function grow(age: number, delay: number, span: number): number {
  return Ease.backOut(clamp01((age - delay) / span));
}

// ───────────────────────────── frost: a scalloped doily of ice with crystals growing in from the rim ─────────────────────────────

const FLAKES = 5;
const SPIKES = 14;
/** Seconds after which every crystal has finished growing. */
const SPIKE_GROWN = 0.28 + SPIKES * 0.022 + 0.05;

const FROST: DiscLook = {
  steps: 112,
  edge: (th) => 0.9 + 0.1 * Math.pow(Math.abs(Math.sin(7 * th)), 0.5),
  paper: mixColor(Hue.ice, CREAM, 0.5),
  paperAlpha: 0.66,
  rim: CREAM,
  rimWidth: 7,
  rimAlpha: 0.95,
  dash: mixColor(Hue.water, Color.inkSoft, 0.4),
  dashCount: 28,
  dashW: 8,
  dashH: 5.2,
  dashAt: 0.8,
  dashSpin: 0.12,
  exitShrink: 0.2,
  build(v) {
    const ice = mixColor(Hue.water, Color.inkSoft, 0.25);
    for (let i = 0; i < SPIKES; i++) v.spikes.push(new Part('wedge', ice, 10, 9, v.layer));
    for (let i = 0; i < FLAKES; i++) {
      v.flakeBack.push(new Part('crystal', mixColor(Hue.water, Color.inkSoft, 0.35), 24, 24, v.layer));
      v.flakes.push(new Part('crystal', CREAM, 20, 20, v.layer));
    }
  },
  animate(v, age, warn, calm) {
    // Crystals grow in from the rim one after the other and then stand still (nothing to update); they are the first thing to go when the area ends.
    if (age < SPIKE_GROWN || warn !== v.spikeWarn) {
      v.spikeWarn = warn;
      for (let i = 0; i < SPIKES; i++) {
        const sp = v.spikes[i] as Part;
        const th = (i / SPIKES) * TAU;
        const g = calm ? 1 : grow(age, i * 0.022, 0.28);
        const gone = warn > (DROP_ORDER[i] as number) ? 0 : 1;
        const len = 20 * g * gone;
        const base = 0.89 * REF;
        sp.at(Math.cos(th) * (base - len), Math.sin(th) * (base - len), th);
        // A crystal that is gone is a sliver a tenth of a pixel long, not a hidden one: showing and hiding would re-record the layer's draw calls.
        sp.size(Math.max(0.1, len), 9);
      }
    }
    // Snowflakes drift down, turning slowly, and settle: they shrink and melt into the sheet where they land.
    for (let j = 0; j < FLAKES; j++) {
      const period = 2.7 + 0.4 * j;
      const phase = calm ? 0.4 + 0.12 * j : age / period + j * 0.37;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 7.1 + j * 3.3) * TAU;
      const r0 = Math.sqrt(hash01(cyc * 5.3 + j * 1.9)) * 0.62 * REF;
      let x = Math.cos(a0) * r0 + Math.sin(t * 5 + j) * 7;
      let y = Math.sin(a0) * r0 * 0.8 - 26 + t * 64;
      const reach = Math.hypot(x, y);
      if (reach > 0.7 * REF) {
        x *= (0.7 * REF) / reach;
        y *= (0.7 * REF) / reach;
      }
      const settle = t > 0.78 ? (t - 0.78) / 0.22 : 0;
      const a = clamp01(t / 0.12) * (1 - settle) * (1 - 0.6 * warn);
      const size = 30 - 9 * settle;
      const f = v.flakes[j] as Part;
      const b = v.flakeBack[j] as Part;
      f.at(x, y, t * 2.2 + j);
      b.at(x, y, t * 2.2 + j);
      f.size(size, size);
      b.size(size * 1.2, size * 1.2);
      f.s.alpha = a;
      b.s.alpha = a * 0.75;
    }
  },
};

// ───────────────────────────── brew: a bubbly cloud, bubbles rising and popping ─────────────────────────────

const BUBBLES = 8;

const BREW: DiscLook = {
  steps: 72,
  edge: (th) => 0.86 + 0.14 * Math.pow(Math.abs(Math.sin(4 * th)), 0.6),
  paper: mixColor(Color.leaf, CREAM, 0.28),
  paperAlpha: 0.44,
  rim: CREAM,
  rimWidth: 7,
  rimAlpha: 0.95,
  dash: Color.leafDark,
  dashCount: 30,
  dashW: 0.5,
  dashH: 7,
  dashAt: 0.78,
  dashSpin: -0.1,
  exitShrink: 0.2,
  build(v) {
    const ring = lighten(Color.leaf, 0.62);
    for (let i = 0; i < BUBBLES; i++) {
      v.bubbleFill.push(new Part('dot', lighten(Color.leaf, 0.35), 10, 10, v.layer));
      v.bubbles.push(new Part('ring', ring, 10, 10, v.layer));
    }
  },
  animate(v, age, warn, calm) {
    for (let i = 0; i < BUBBLES; i++) {
      const period = 1.5 + 0.26 * i;
      const phase = calm ? 0.35 + 0.09 * i : age / period + i * 0.29;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 11.7 + i * 2.3) * TAU;
      const r0 = Math.sqrt(hash01(cyc * 3.9 + i * 5.1)) * 0.6 * REF;
      const x = Math.cos(a0) * r0 + Math.sin(t * 9 + i) * 4;
      const y = Math.sin(a0) * r0 * 0.7 + 22 - t * 52;
      // It swells as it rises, then pops: the ring flies open and is gone.
      const pop = t > 0.82 ? (t - 0.82) / 0.18 : 0;
      const d = (7 + 19 * Math.min(1, t / 0.82)) * (1 + 0.9 * pop);
      const a = clamp01(t / 0.1) * (1 - pop) * (1 - 0.55 * warn);
      const b = v.bubbles[i] as Part;
      const f = v.bubbleFill[i] as Part;
      b.at(x, y);
      f.at(x, y);
      b.size(d, d);
      f.size(d * 0.8, d * 0.8);
      b.s.alpha = a;
      f.s.alpha = a * 0.4 * (1 - pop);
    }
  },
};

// ───────────────────────────── void: a torn ink sheet with a paper spiral and scraps pulled in ─────────────────────────────

const SCRAPS = 10;

const VOID: DiscLook = {
  steps: 96,
  edge: (th) => 0.94 + 0.03 * Math.sin(9 * th + 1) + 0.025 * Math.sin(13 * th + 2) + 0.02 * Math.sin(23 * th),
  paper: Color.ink,
  paperAlpha: 0.5,
  rim: Color.kraftDark,
  rimWidth: 6,
  rimAlpha: 1,
  dash: CREAM,
  dashCount: 40,
  dashW: 0.5,
  dashH: 5.5,
  dashAt: 0.86,
  dashSpin: 0.5,
  exitShrink: 0.85,
  build(v) {
    v.swirlA = new Part('vortex', Color.kraft, 1.5 * REF, 1.5 * REF, v.layer);
    v.swirlB = new Part('vortex', CREAM, 0.9 * REF, 0.9 * REF, v.layer);
    v.core = new Part('dot', Color.inkDeep, 30, 30, v.layer);
    v.coreRing = new Part('ring', CREAM, 38, 38, v.layer);
    for (let i = 0; i < SCRAPS; i++) {
      const tint = i % 3 === 0 ? CREAM : i % 3 === 1 ? Color.kraft : Color.paperDim;
      v.scraps.push(new Part(i % 2 === 0 ? 'confetti' : 'shard', tint, 14, 9, v.layer));
    }
  },
  animate(v, age, warn, calm) {
    const spin = (calm ? 0.25 : 1) * (1 + 2.4 * warn);
    (v.swirlA as Part).s.rotation = age * 2.2 * spin;
    (v.swirlB as Part).s.rotation = -age * 3.4 * spin;
    (v.swirlA as Part).s.alpha = 0.78;
    (v.swirlB as Part).s.alpha = 0.7;
    const beat = calm ? 0 : Math.sin(age * 3.1) * 0.05 + 0.2 * warn * Math.sin(age * 14);
    const core = 30 * (1 + beat + 0.4 * warn);
    (v.core as Part).size(core, core);
    (v.coreRing as Part).size(core * 1.3, core * 1.3);
    // Scraps of paper spiral in from the rim and shrink to nothing at the core: this thing eats what is near it.
    for (let i = 0; i < SCRAPS; i++) {
      const rate = (1 + 0.5 * warn) / (1.5 + 0.12 * (i % 4));
      const phase = calm ? 0.2 + 0.08 * i : age * rate + i / SCRAPS;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 13.3 + i * 4.1) * TAU;
      const r = REF * (0.9 - 0.82 * t * t);
      const a = a0 + 4.6 * t * t + (calm ? 0 : age * 0.5);
      const s = v.scraps[i] as Part;
      s.at(Math.cos(a) * r, Math.sin(a) * r, a + t * 9);
      const k = 1 - 0.7 * t;
      s.size(14 * k, 9 * k);
      s.s.alpha = clamp01(t / 0.08) * (1 - clamp01((t - 0.92) / 0.08));
    }
  },
};

// ───────────────────────────── hostile rings round an enemy: speed comets and healing crosses ─────────────────────────────

const COMETS = 6;
const CROSSES = 5;

const HASTE_RIM = mixColor(Color.berry, CREAM, 0.3);

const HASTE: DiscLook = {
  steps: 48,
  edge: () => 1,
  paper: Color.coral,
  paperAlpha: 0.12,
  rim: HASTE_RIM,
  rimWidth: 5,
  rimAlpha: 0.8,
  dash: Color.coralDark,
  dashCount: 32,
  dashW: 9,
  dashH: 5.5,
  dashAt: 0.93,
  dashSpin: 0.35,
  exitShrink: 0.2,
  build(v) {
    for (let i = 0; i < COMETS; i++) v.comets.push(new Part('spark', Color.coralDark, 26, 8, v.layer));
  },
  animate(v, age, _warn, calm) {
    for (let i = 0; i < COMETS; i++) {
      const a = (calm ? 0 : age * 1.5) + (i / COMETS) * TAU;
      const c = v.comets[i] as Part;
      c.at(Math.cos(a) * 0.7 * REF, Math.sin(a) * 0.7 * REF, a + Math.PI / 2);
    }
  },
};

const HEAL: DiscLook = {
  steps: 48,
  edge: () => 1,
  paper: Color.berry,
  paperAlpha: 0.1,
  rim: HASTE_RIM,
  rimWidth: 5,
  rimAlpha: 0.8,
  dash: Color.berry,
  dashCount: 32,
  dashW: 0.5,
  dashH: 6.5,
  dashAt: 0.93,
  dashSpin: -0.25,
  exitShrink: 0.2,
  build(v) {
    for (let i = 0; i < CROSSES; i++) v.crosses.push(new Part('plus', mixColor(Color.berry, CREAM, 0.12), 16, 16, v.layer));
  },
  animate(v, age, _warn, calm) {
    for (let i = 0; i < CROSSES; i++) {
      const phase = calm ? 0.3 + 0.1 * i : age / 2.4 + i / CROSSES;
      const cyc = Math.floor(phase);
      const t = phase - cyc;
      const a0 = hash01(cyc * 9.1 + i * 2.9) * TAU;
      const r0 = Math.sqrt(hash01(cyc * 4.7 + i)) * 0.62 * REF;
      const c = v.crosses[i] as Part;
      c.at(Math.cos(a0) * r0, Math.sin(a0) * r0 * 0.8 + 24 - t * 50);
      const k = 12 + 8 * Math.sin(Math.PI * t);
      c.size(k, k);
      c.s.alpha = Math.sin(Math.PI * t);
    }
  },
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

/** One disc area: shadow, sheet with its cut rim, a dashed line, the kind's motif, and the landing ring. */
class DiscArea implements Pooled {
  readonly root = new Container();
  readonly layer = new Container();
  readonly spikes: Part[] = [];
  readonly flakes: Part[] = [];
  readonly flakeBack: Part[] = [];
  readonly bubbles: Part[] = [];
  readonly bubbleFill: Part[] = [];
  readonly scraps: Part[] = [];
  readonly comets: Part[] = [];
  readonly crosses: Part[] = [];
  /** The warning level the crystals were last placed for (they are only moved when it changes). */
  spikeWarn = -1;
  swirlA: Part | null = null;
  swirlB: Part | null = null;
  core: Part | null = null;
  coreRing: Part | null = null;
  gen = 0;
  active = false;
  left = Infinity;
  span = AREA_WARN;
  handle: Handle | null = null;
  private readonly landing: Part;
  /** The dashed line: one sprite whose texture is swapped for a thinner ring as the warning passes each step. */
  private readonly dash: Sprite;
  private readonly dashTextures: readonly Texture[];
  private dashStage = -1;
  private age = 0;
  private leaving = false;
  private leaveAge = 0;
  private radius = REF;
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
    const shadow = new Part('disc', Hue.shadow, 2 * REF, 2 * REF, this.root);
    shadow.at(2.5, 6);
    shadow.s.alpha = 0.2;
    const baked = bakedOf(kind);
    this.dashTextures = baked.dashes;
    this.dash = pieceSprite(baked.dashes[0] as Texture);
    this.root.addChild(pieceSprite(baked.sheet), this.dash);
    this.root.addChild(this.layer);
    look.build(this);
    this.landing = new Part('ring', CREAM, 2 * REF, 2 * REF, this.root);
  }

  /** `every` is the layer's current motif interval: the first move of the motif waits a share of it that depends on the slot. */
  start(x: number, y: number, radius: number, every: number): void {
    this.gen++;
    this.active = true;
    this.left = Infinity;
    this.span = AREA_WARN;
    this.age = 0;
    this.leaving = false;
    this.leaveAge = 0;
    this.spikeWarn = -1;
    this.dashStage = -1;
    this.radius = radius;
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

  /** `every` is how often (seconds) the motif's many small parts are moved; the sheet itself follows every frame. */
  update(dt: number, every: number): void {
    if (!this.active) return;
    this.age += dt;
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
    let scale = calm ? 1 : 0.55 + 0.45 * Ease.backOut(clamp01(age / ENTER));
    let alpha = clamp01(age / 0.12);
    let rot = 0;
    // The ending: the sheet draws in and dims, and (with motion) blinks slowly, in step with its dashes dropping out.
    scale *= 1 - 0.14 * warn;
    if (warn > 0) alpha *= calm ? 1 - 0.18 * warn : 1 - 0.3 * warn * (Math.sin(age * TAU * BLINK_HZ) > 0 ? 1 : 0.35);
    if (this.leaving) {
      const k = clamp01(this.leaveAge / EXIT);
      scale *= 1 - look.exitShrink * k;
      alpha *= 1 - k;
      rot = calm ? 0 : 0.3 * k * (this.kind === 'void' ? -4 : 1);
    }
    this.root.scale.set((this.radius / REF) * scale);
    this.root.rotation = rot;
    this.root.alpha = first ? 0 : alpha;
    // Dashes: a slow turn, then they drop out in three steps as the end nears.
    this.dash.rotation = calm ? 0 : age * look.dashSpin;
    const stage = dashLevel(warn);
    if (stage !== this.dashStage) {
      this.dashStage = stage;
      this.dash.visible = stage < this.dashTextures.length;
      if (this.dash.visible) this.dash.texture = this.dashTextures[stage] as Texture;
    }
    // The landing ring: one flat ring that spreads from the sheet's edge as it lands.
    const lk = clamp01(age / LAND);
    this.landing.s.visible = !calm && lk < 1;
    if (this.landing.s.visible) {
      const d = 2 * REF * (0.9 + 0.3 * Ease.cubicOut(lk));
      this.landing.size(d, d);
      this.landing.s.alpha = 0.9 * (1 - lk);
    }
    if (motif) look.animate(this, age, warn, calm);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ───────────────────────────── cells under hazard: wet puddles and live cells ─────────────────────────────

const RIPPLES = 3;
const DROPS = 3;
/** Where a cat's feet stand in its cell, as a share of the cell height from the middle: the puddle and the zig-zag lie there, where the cat does not cover them. */
const FEET = 0.24;

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
  private readonly pool: Part | null = null;
  private readonly ripples: Part[] = [];
  private readonly drops: Part[] = [];
  private readonly glyph: Part | null = null;
  private readonly zig: Graphics | null = null;
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
      this.pool = new Part('puddle', Hue.water, w * 0.9, h * 0.56, this.body);
      this.pool.s.alpha = 0.82;
      for (let i = 0; i < RIPPLES; i++) this.ripples.push(new Part('ring', CREAM, 10, 4, this.body));
      for (let i = 0; i < DROPS; i++) this.drops.push(new Part('droplet', mixColor(Hue.water, CREAM, 0.45), 11, 16, this.body));
    } else {
      // A zig-zag warning across the cell and a bolt glyph at its heart.
      const zig = new Graphics();
      const amp = h * 0.16;
      for (let row = 0; row < 2; row++) {
        const y = h * (FEET - 0.04 + (row === 0 ? -0.07 : 0.07));
        zig.moveTo(-w * 0.4, y);
        for (let k = 1; k <= 8; k++) zig.lineTo(-w * 0.4 + (w * 0.8 * k) / 8, y + (k % 2 === 0 ? -amp : amp) * 0.5);
      }
      zig.stroke({ width: 5, color: Color.mustardDark, cap: 'round', join: 'round' });
      this.zig = zig;
      this.body.addChild(zig);
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
    this.tape.alpha = warn > 0 ? (calm ? 1 - 0.5 * warn : 1 - 0.55 * warn * (Math.sin(age * TAU * BLINK_HZ) > 0 ? 1 : 0.2)) : 1;
    if (this.kind === 'wet') this.wet(age, warn, calm);
    else this.zap(age, warn, calm);
  }

  private wet(age: number, warn: number, calm: boolean): void {
    const pool = this.pool as Part;
    // The puddle dries up as the end nears: it shrinks and loses colour.
    const dry = 1 - 0.5 * warn;
    pool.size(this.w * 0.9 * dry, this.h * 0.56 * dry);
    pool.s.alpha = 0.82 * (1 - 0.35 * warn);
    this.tint.s.alpha = 0.3 * (1 - 0.6 * warn);
    pool.at(0, FEET * this.h);
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
    const zig = this.zig as Graphics;
    zig.alpha = (calm ? 0.85 : 0.55 + 0.4 * flick) * (1 - 0.6 * warn);
    zig.scale.set(1, calm ? 1 : Math.sin(age * 9) > 0 ? 1 : -1);
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

  constructor(into: Container) {
    this.parent.label = 'areas';
    this.parent.eventMode = 'none';
    into.addChild(this.parent);
  }

  /** Areas on screen right now. */
  get count(): number {
    return this.live.length;
  }

  /** A round area of `radius` design px at (x, y). */
  disc(kind: DiscKind, x: number, y: number, radius: number): AreaHandle {
    let free = this.freeDisc.get(kind);
    if (!free) {
      free = [];
      this.freeDisc.set(kind, free);
    }
    let v = free.pop();
    if (!v) {
      const pool = free;
      v = new DiscArea(kind, LOOKS[kind], this.all.length, (d) => this.release(d, pool));
      this.parent.addChild(v.root);
      this.all.push(v);
    }
    v.start(x, y, radius, this.motifEvery());
    return this.begin(v);
  }

  /**
   * Build one view of `kind` ahead of the first area that needs it and leave it in the pool, so that area does not build its sprites on the frame
   * it starts. Only once the kind is baked (building it would bake what is missing, all at once). Returns true when a view was built.
   */
  ready(kind: DiscKind): boolean {
    let free = this.freeDisc.get(kind);
    if (!free) {
      free = [];
      this.freeDisc.set(kind, free);
    }
    if (free.length > 0 || !areaBaked(kind)) return false;
    const pool = free;
    const v = new DiscArea(kind, LOOKS[kind], this.all.length, (d) => this.release(d, pool));
    this.parent.addChild(v.root);
    this.all.push(v);
    free.push(v);
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
   * blizzards and clouds on a late wave) moves at the pace the eye still reads as smooth, slower on a weaker tier. The sheets, rims
   * and the dashed lines turn every frame regardless.
   */
  private motifEvery(): number {
    const tier = fxSettings.tier;
    if (this.live.length <= FEW_AREAS) return tier === 'low' ? 1 / 30 : 0;
    return tier === 'high' ? 1 / 40 : tier === 'mid' ? 1 / 30 : 1 / 20;
  }

  update(dt: number): void {
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
