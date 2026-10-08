import { BitmapFont, BitmapFontManager, BitmapText, Container, TextStyle, type Texture } from 'pixi.js';
import { fmt } from '@/core/format';
import { clamp, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Color, FONT_FAMILY } from '@/ui/theme';
import { popCurve, springWobble } from './curves';
import { Bodies, Boxes, crossed, findSpot, outranks, Pending, regionOf, type Area, type PlaceIn, type Spot } from './numberPlan';
import { fxSettings, NUMBER_LEVELS, type NumberLevel } from './settings';

export type NumStyle = 'damage' | 'crit' | 'kill' | 'dot' | 'soak' | 'heal' | 'gold' | 'hurt' | 'big';

const BAKED = 64;
/** Height of a digit in the baked face, and the stroke's two widths: the digits of an ordinary number carry a thin outline, a big one a thick one. */
const CAP_HEIGHT = 47;
const STROKE_THIN = 10;
const STROKE_THICK = 15;
/** The digits' ink sits this far below the middle of the line the text object measures (baked px). */
const INK_DROP = 4.7;
/** How far a number's pop may exceed its resting size: places are kept clear for that much. */
const PEAK = 1.1;
/** How far a number's own bump (a merged hit) swells it. */
const BUMP = 0.2;
const BUMP_SECONDS = 0.12;
/** What a character measures at the baked size: a figure's width is worked out from its characters, never read from the text object (that lays it out on the spot, for every merged hit). */
const GLYPH = 36.5;
const GLYPH_WIDE = 64;
/** How far a face colour is lightened toward cream: on artwork the digits are light with a brown stroke (kit rule), the hue still says the kind. */
const FACE_LIGHT = 0.3;
const CHARS = [['0', '9'], ['A', 'Z'], '+-.,!x%ai ×만억조'];
/** Hits on one enemy in this many seconds are one number. */
const MERGE_WINDOW = 0.3;
/** A merged hit lets its number live this much longer from the pop: the new figure is read for about a third of a second at least. */
const MERGE_AGE = 0.12;
/** A body whose heading is this far off the horizontal (|sin|) is on a side stretch of the lane, where a number has only the strip between the screen's edge and the board. */
const SIDE_LANE = 0.7;
/** Room kept between the strip's two edges and a number standing in it. */
const SIDE_GAP = 2;
/** Places searched for per frame (a search is the dearest thing a hit can ask for in a crowd): past this the hits of the frame are not shown. */
const TRIES_PER_FRAME = 3;
/** After a number found no place its enemy is not looked for again for this long: the lane has not changed much, and the hits go on adding up. */
const RETRY_SECONDS = 0.12;
/** Seconds an enemy (its own too: a number that follows it under the HUD is pushed onto it) may stand in a number before it is gone. */
const YIELD_SECONDS = 0.08;
/** A place must stay free for this share of the number's life: the others keep walking while it is up. */
const HORIZON = 0.7;
/** Numbers of this priority and above are the big ones (a crit, a killing blow, a heavy hit on a boss, damage taken). */
const BIG_PRIO = 2;
/** A number's own ring of places: how many rows above the bar and how many places along a row are tried. */
const PLAIN_ROWS = 2;
const PLAIN_COLS = 3;
const BIG_ROWS = 3;
const BIG_COLS = 5;

const faces = new Map<string, string>();
const fonts = new Map<string, ReturnType<typeof BitmapFontManager.getFont>>();

/** The bitmap font of one face colour and outline: the paper tone lightened toward cream inside one flat brown stroke. Baked once per pair. */
function faceFont(color: number, thin: boolean): string {
  const key = color.toString(16) + (thin ? 't' : 'h');
  let name = faces.get(key);
  if (name) return name;
  name = 'FxNum' + key;
  faces.set(key, name);
  BitmapFont.install({
    name,
    chars: CHARS,
    resolution: 2,
    padding: 10,
    style: {
      fontFamily: FONT_FAMILY,
      fontSize: BAKED,
      fill: mixColor(color, Color.paperLight, FACE_LIGHT),
      stroke: { color: Color.ink, width: thin ? STROKE_THIN : STROKE_THICK, join: 'round' },
    },
  });
  fonts.set(name, BitmapFontManager.getFont('0', new TextStyle({ fontFamily: name, fontSize: BAKED })));
  return name;
}

/** The glyph sheets of every face font baked so far: the warm-up puts them on the graphics card before the first number is drawn. */
export function numberFontTextures(): Texture[] {
  const out: Texture[] = [];
  for (const font of fonts.values()) for (const page of font.pages) out.push(page.texture);
  return out;
}

/**
 * Draw the quiet face font of `color` now: for a colour that is not one of the stock styles' (a damage-over-time tick, a shield), whose font
 * would otherwise be drawn on the frame of its first number, 20 ms in the middle of a fight.
 */
export function bakeNumberFace(color: number): void {
  faceFont(color, true);
}

interface StyleDef {
  /** Flat face colour of the digits, and whether their outline is the thin one. */
  face: number;
  thin: boolean;
  /** Height of the digits with their outline on screen, design px, at magnitude 1 and at magnitude 1000 (it grows with log10). */
  ink: readonly [number, number];
  /** The widest the digits are drawn: a longer figure is drawn smaller. */
  width: number;
  life: number;
  /** How far it drifts up and outward over its life. */
  rise: number;
  out: number;
  /** Opacity while it is held (it fades over the last 40% of its life). */
  alpha: number;
  /** Starts, peaks and settles at these multiples of the target scale. */
  pop: readonly [number, number, number];
  popSeconds: number;
  /** Radians of random tilt amplitude (crit wobble). */
  tilt: number;
  /** 0 quiet .. 3 never dropped: who is sent away first when the crowd rule needs room. */
  prio: number;
  /** What a level must allow for this number to be shown (`NumberLevel`). */
  gate: 'always' | 'hit' | 'tick' | 'soak' | 'extras';
  /** A damage-over-time tick or a soaked hit: its own slot per enemy, beside the ordinary number's. */
  quiet: boolean;
  prefix: string;
  suffix: string;
}

const STYLES: Record<NumStyle, StyleDef> = {
  damage: {
    face: Color.coral, thin: true, ink: [28, 30], width: 100, life: 0.7, rise: 16, out: 10, alpha: 1,
    pop: [0.7, 1.1, 1], popSeconds: 0.08, tilt: 0, prio: 1, gate: 'hit', quiet: false, prefix: '', suffix: '',
  },
  crit: {
    face: Color.mustard, thin: false, ink: [40, 44], width: 112, life: 0.85, rise: 24, out: 14, alpha: 1,
    pop: [0.55, 1.2, 1], popSeconds: 0.14, tilt: 0.05, prio: 2, gate: 'always', quiet: false, prefix: '', suffix: '!',
  },
  kill: {
    face: Color.coral, thin: false, ink: [40, 44], width: 112, life: 0.85, rise: 24, out: 14, alpha: 1,
    pop: [0.55, 1.2, 1], popSeconds: 0.14, tilt: 0, prio: 2, gate: 'always', quiet: false, prefix: '', suffix: '',
  },
  big: {
    face: Color.mustard, thin: false, ink: [42, 46], width: 120, life: 0.95, rise: 26, out: 14, alpha: 1,
    pop: [0.5, 1.25, 1], popSeconds: 0.16, tilt: 0.05, prio: 3, gate: 'always', quiet: false, prefix: '', suffix: '!',
  },
  dot: {
    face: Color.teal, thin: true, ink: [21, 23], width: 64, life: 0.55, rise: 10, out: 8, alpha: 0.85,
    pop: [0.8, 1.05, 1], popSeconds: 0.08, tilt: 0, prio: 0, gate: 'tick', quiet: true, prefix: '', suffix: '',
  },
  soak: {
    face: Color.teal, thin: true, ink: [21, 23], width: 64, life: 0.55, rise: 10, out: 8, alpha: 0.85,
    pop: [0.8, 1.05, 1], popSeconds: 0.08, tilt: 0, prio: 0, gate: 'soak', quiet: true, prefix: '', suffix: '',
  },
  heal: {
    face: Color.leaf, thin: true, ink: [28, 30], width: 100, life: 0.7, rise: 18, out: 0, alpha: 1,
    pop: [0.6, 1.15, 1], popSeconds: 0.12, tilt: 0, prio: 1, gate: 'extras', quiet: false, prefix: '+', suffix: '',
  },
  gold: {
    face: Color.mustard, thin: true, ink: [28, 30], width: 100, life: 0.7, rise: 18, out: 0, alpha: 1,
    pop: [0.6, 1.15, 1], popSeconds: 0.12, tilt: 0, prio: 1, gate: 'extras', quiet: false, prefix: '+', suffix: '',
  },
  hurt: {
    face: Color.berry, thin: false, ink: [34, 38], width: 112, life: 0.85, rise: 22, out: 0, alpha: 1,
    pop: [0.5, 1.2, 1], popSeconds: 0.14, tilt: 0, prio: 2, gate: 'always', quiet: false, prefix: '-', suffix: '',
  },
};

/** The styles whose faces a battle bakes while its scene is built; the rest are baked when first asked for. */
const STOCK: readonly NumStyle[] = ['damage', 'crit', 'kill', 'big', 'dot'];

/**
 * Bake the face fonts of the stock styles once: about 140 ms of drawing glyphs, so a battle does it while its scene is built
 * (BattleScene) and not on the frame of the first hit; show() calls it lazily too.
 */
export function ensureNumberFonts(): void {
  for (const style of STOCK) faceFont(STYLES[style].face, STYLES[style].thin);
}

/**
 * The body a number belongs to: an enemy, as a box (its picture and the health bar above it) with the direction it walks. The director
 * keeps one of these and refills it for each hit, so a hit allocates nothing.
 */
export interface NumberTarget {
  /** One number per target and kind: hits on the same uid are merged. */
  uid: number;
  /** Centre of the body. */
  x: number;
  y: number;
  /** Half the width of the box, its reach above the centre (to the top of the health bar) and below it. */
  hw: number;
  top: number;
  bottom: number;
  /** Direction of travel, radians: the number drifts away from the lane's centre line, which is to the left of it. */
  angle: number;
  /** The target's full health: the levels ask for a share of it. */
  maxHp: number;
  /** A boss or an elite: the levels ask less of its hits. */
  heavy: boolean;
  /** A boss: its numbers are shown even when the lane around it is full (clear only of its own body, the HUD and the board). */
  boss: boolean;
}

export interface NumberOpts {
  /** Override the style's face colour. */
  color?: number;
  /** Extra size multiplier. */
  scale?: number;
  /** The body it belongs to; without one the number stands above the point it is shown at. */
  target?: NumberTarget;
}

/** One number: the stroked digits as one text object. */
class Num {
  readonly root = new Container();
  readonly face: BitmapText;
  style: NumStyle = 'damage';
  def: StyleDef = STYLES.damage;
  age = 0;
  /** Seconds since the first hit it holds: hits are merged into it while this is under `MERGE_WINDOW`. */
  span = 0;
  /** 1 right after a merged hit, falling to 0: the number swells by that much. */
  bump = 0;
  /** Seconds an enemy has stood in it: a number gives way (fades out) when one walks into it. A boss's number does not. */
  crossing = 0;
  holds = false;
  /** Chosen to make room for a newer number (see `reserve`). */
  doomed = false;
  value = 0;
  /** Its slot (`uid * 2 + quiet`; -1 for a number that belongs to no body) and the region of the screen it counts against. */
  slot = -1;
  uid = -1;
  region = 0;
  /** The body's centre as last seen and how fast it moves (px per second): a number whose body has died goes on with it. */
  ex = 0;
  ey = 0;
  vx = 0;
  vy = 0;
  /** Where the number starts from the body's centre, and how far it drifts. */
  ox = 0;
  oy = 0;
  dx = 0;
  dy = 0;
  scale = 1;
  /** The widest its digits may be drawn (px): its style's, or less on a side stretch of the lane. */
  cap = 0;
  tiltAmp = 0;
  /** Half the width of the digits at scale 1. */
  half = 0;
  /** Centre and half sizes of what is drawn now, for the next number to keep clear of. */
  cx = 0;
  cy = 0;
  bw = 0;
  bh = 0;

  constructor(readonly font: string) {
    this.face = new BitmapText({ text: '', style: { fontFamily: font, fontSize: BAKED } });
    this.face.anchor.set(0.5);
    this.root.addChild(this.face);
    this.root.visible = false;
    this.root.eventMode = 'none';
  }

  /** Set the text; its width is the estimate the places are found with (asking the text object for it would lay it out on the spot, for every merged hit). */
  setText(text: string): void {
    this.face.text = text;
    this.half = measure(text) / 2;
  }
}

/**
 * Pooled floating combat text. A number belongs to an enemy: it starts above the enemy's health bar, follows it, drifts up and outward
 * and fades, and it is never drawn on an enemy, the board or the HUD (`findSpot`). Hits on one enemy within `MERGE_WINDOW` are one
 * number that bumps; when the lane is crowded the numbers that find no free place are not shown, and a budget per screen region and per
 * frame keeps the crits and killing blows and then the largest figures (`NUMBER_LEVELS`). Motion is analytic in update(dt): no tweens,
 * no per-frame allocation.
 */
export class FloatingNumbers {
  readonly layer = new Container();
  private readonly active: Num[] = [];
  private readonly pools = new Map<string, Num[]>();
  /** Total BitmapText objects ever created, per stats(). */
  created = 0;
  skipped = 0;
  /** New numbers started since the last `update`, by class, and the times a place was looked for: a crowded lane would otherwise try for every hit. */
  private plainThisFrame = 0;
  private bigThisFrame = 0;
  private triesThisFrame = 0;
  private fontsReady = false;
  private time = 0;
  private readonly pending = new Pending();
  private readonly boxes = new Boxes(64);
  private readonly spot: Spot = { ox: 0, oy: 0, dx: 0, dy: 0 };
  private readonly place: PlaceIn = { x: 0, y: 0, hw: 0, top: 0, bottom: 0, nx: 0, w: 0, h: 0, rise: 0, out: 0, vx: 0, vy: 0, horizon: 0, rows: 0, cols: 0, uid: -1 };

  /** The boxes of the bodies on the field, refilled every frame by `sense` (the director lists the enemies). */
  readonly bodies = new Bodies();
  sense: ((into: Bodies) => void) | null = null;

  /** Maximum simultaneous numbers; lowering it lets the extras finish. */
  cap: number;
  /** Where a number may stand (field space): the scene sets the HUD's lower edge, the screen's sides and bottom panel, and the board. */
  readonly area: Area = { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity, keepX0: 0, keepY0: 0, keepX1: 0, keepY1: 0 };

  constructor(parent: Container, cap = 40) {
    this.cap = cap;
    this.layer.label = 'fx-numbers';
    this.layer.eventMode = 'none';
    parent.addChild(this.layer);
  }

  get count(): number {
    return this.active.length;
  }

  show(x: number, y: number, value: number | string, style: NumStyle = 'damage', o: NumberOpts = {}): void {
    const mode = fxSettings.numbers;
    if (mode === 'off') return;
    const level = NUMBER_LEVELS[mode];
    const def = STYLES[style];
    if (!this.fontsReady) {
      ensureNumberFonts();
      this.fontsReady = true;
    }
    const t = o.target ?? null;
    let total = typeof value === 'number' ? value : 0;
    let slot = -1;
    if (t && typeof value === 'number') {
      slot = t.uid * 2 + (def.quiet ? 1 : 0);
      const live = this.live(slot);
      if (live) {
        if (live.span < MERGE_WINDOW && def.prio <= live.def.prio) {
          live.value += value;
          live.bump = 1;
          live.age = Math.min(live.age, MERGE_AGE);
          const wide = live.half * live.scale;
          this.setText(live, live.value, o);
          // A figure that grows widens away from the body it was placed beside, not onto it.
          live.ox += Math.sign(live.ox) * (live.half * live.scale - wide) * PEAK;
          this.apply(live);
          return;
        }
        // A stronger kind of number (a crit over an ordinary hit) takes the merged damage over; an old one simply gives way.
        if (live.span < MERGE_WINDOW) total += live.value;
        this.discard(live);
      } else {
        total = this.pending.add(slot, value, this.time, MERGE_WINDOW);
        // The last look found no place for it: the lane has not changed much since.
        if (this.pending.held(slot, this.time)) {
          this.skipped++;
          return;
        }
      }
    }
    if (!this.allowed(def, level, total, t)) {
      this.skipped++;
      return;
    }
    const big = def.prio >= BIG_PRIO;
    if ((big ? this.bigThisFrame >= level.bigFrame : this.plainThisFrame >= level.plainFrame) || this.triesThisFrame >= TRIES_PER_FRAME) {
      this.skipped++;
      return;
    }
    this.triesThisFrame++;
    const text = figure(def, typeof value === 'number' ? total : value);
    const wide = measure(text);
    const cap = this.widthFor(def, t, x);
    const scale = scaleOf(def, total, wide, o, cap);
    // The crowd rule first (it is cheap and refuses most): a number that may not be shown need not look for a place.
    if (!this.reserve(def, level, total, t ? t.x : x, t ? t.y : y)) {
      this.skipped++;
      return;
    }
    if (!this.stand(def, scale, wide / 2, x, y, t, big)) {
      this.release();
      if (slot >= 0) this.pending.hold(slot, this.time + RETRY_SECONDS);
      this.skipped++;
      return;
    }
    this.release(true);
    const font = faceFont(o.color ?? def.face, def.thin);
    let n = this.pools.get(font)?.pop();
    if (!n) {
      n = new Num(font);
      this.created++;
      this.layer.addChild(n.root);
    }
    n.style = style;
    n.def = def;
    n.age = 0;
    n.span = 0;
    n.bump = 0;
    n.crossing = 0;
    n.holds = t !== null && t.boss;
    n.value = total;
    n.setText(text);
    n.cap = cap;
    n.scale = scaleOf(def, total, n.half * 2, o, cap);
    n.ox = this.spot.ox;
    n.oy = this.spot.oy;
    n.dx = this.spot.dx;
    n.dy = this.spot.dy;
    if (slot >= 0) this.pending.drop(slot);
    n.slot = slot;
    n.uid = t ? t.uid : -1;
    n.ex = t ? t.x : x;
    n.ey = t ? t.y : y;
    n.vx = this.place.vx;
    n.vy = this.place.vy;
    n.region = regionOf(n.ex, n.ey);
    n.tiltAmp = def.tilt * (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
    n.root.visible = true;
    if (big) this.bigThisFrame++;
    else this.plainThisFrame++;
    this.layer.addChild(n.root);
    this.active.push(n);
    this.apply(n);
  }

  update(dt: number): void {
    this.time += dt;
    this.plainThisFrame = 0;
    this.bigThisFrame = 0;
    this.triesThisFrame = 0;
    if (this.sense) {
      this.bodies.reset();
      this.sense(this.bodies);
      this.bodies.settle(dt);
    }
    const list = this.active;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const n = list[i] as Num;
      n.age += dt;
      n.span += dt;
      n.bump = Math.max(0, n.bump - dt / BUMP_SECONDS);
      if (n.age >= n.def.life) {
        this.give(n);
        continue;
      }
      if (n.uid >= 0) {
        const b = this.bodies.find(n.uid);
        if (b >= 0) {
          n.ex = this.bodies.x[b] as number;
          n.ey = this.bodies.y[b] as number;
          n.vx = this.bodies.vx[b] as number;
          n.vy = this.bodies.vy[b] as number;
        } else {
          n.ex += n.vx * dt;
          n.ey += n.vy * dt;
        }
      }
      this.apply(n);
      if (!n.holds && crossed(this.bodies, -1, n.cx, n.cy, n.bw, n.bh)) n.crossing += dt;
      else n.crossing = Math.max(0, n.crossing - dt);
      if (n.crossing >= YIELD_SECONDS) {
        this.give(n);
        continue;
      }
      list[w++] = n;
    }
    list.length = w;
  }

  clear(): void {
    for (const n of this.active) this.give(n);
    this.active.length = 0;
    this.pending.clear();
  }

  destroy(): void {
    this.clear();
    this.layer.destroy({ children: true });
  }

  stats(): { alive: number; created: number; skipped: number } {
    return { alive: this.active.length, created: this.created, skipped: this.skipped };
  }

  /** The number alive in `slot`, if any. */
  private live(slot: number): Num | null {
    for (const n of this.active) if (n.slot === slot) return n;
    return null;
  }

  /** Whether a level shows a number of this style for `total` damage on `t`. */
  private allowed(def: StyleDef, level: NumberLevel, total: number, t: NumberTarget | null): boolean {
    const share = t && t.maxHp > 0 && total > 0 ? total / t.maxHp : 1;
    switch (def.gate) {
      case 'hit':
        return share >= (t && t.heavy ? level.heavyShare : level.hitShare);
      case 'tick':
        return share >= level.tickShare;
      case 'soak':
        return level.soak;
      case 'extras':
        return level.extras;
      default:
        return true;
    }
  }

  /** Find a free place for a number of this style, `scale` and half width `half` (see `findSpot`); a boss's number settles for one that is only clear of its own body. The place lands in `this.spot`. */
  private stand(def: StyleDef, scale: number, half: number, x: number, y: number, t: NumberTarget | null, big: boolean): boolean {
    this.syncBoxes();
    const p = this.place;
    p.x = t ? t.x : x;
    p.y = t ? t.y : y;
    p.hw = t ? t.hw : 0;
    p.top = t ? t.top : 0;
    p.bottom = t ? t.bottom : 0;
    p.nx = t ? Math.sin(t.angle) : 0;
    p.w = half * scale * PEAK;
    p.h = (inkPx(def, scale) / 2) * PEAK;
    p.rise = def.rise;
    p.out = def.out;
    const b = t ? this.bodies.find(t.uid) : -1;
    p.vx = b >= 0 ? (this.bodies.vx[b] as number) : 0;
    p.vy = b >= 0 ? (this.bodies.vy[b] as number) : 0;
    p.horizon = def.life * HORIZON;
    p.rows = big ? BIG_ROWS : PLAIN_ROWS;
    p.cols = big ? BIG_COLS : PLAIN_COLS;
    p.uid = t ? t.uid : -1;
    const s = this.spot;
    return findSpot(p, this.area, this.bodies, this.boxes, false, s) || !!(t && t.boss && findSpot(p, this.area, this.bodies, this.boxes, true, s));
  }

  /** Fill `boxes` from the numbers alive, in their order. */
  private syncBoxes(): void {
    const list = this.active;
    const boxes = this.boxes;
    const m = Math.min(list.length, boxes.cap);
    for (let i = 0; i < m; i++) {
      const n = list[i] as Num;
      boxes.set(i, n.cx, n.cy, n.bw, n.bh, n.vx, n.vy);
    }
    boxes.count = m;
  }

  /**
   * The crowd rule: whether a number of this style and `value` may be started now. Each class (ordinary, big) has a limit per screen
   * region and on the whole screen, and the tier's `cap` is shared by both; when a limit is reached the lowest ranking number (priority,
   * then the larger figure) that ranks below the newcomer is marked to go for it, and when there is none the newcomer is not shown.
   * `release` then sends the marked ones away (the newcomer found its place) or lets them stay (it did not).
   */
  private reserve(def: StyleDef, level: NumberLevel, value: number, x: number, y: number): boolean {
    const cls = def.prio >= BIG_PRIO ? 1 : 0;
    const region = regionOf(x, y);
    const ok =
      this.fit(cls, region, cls ? level.bigRegion : level.plainRegion, def.prio, value) &&
      this.fit(cls, -1, cls ? level.bigAll : level.plainAll, def.prio, value) &&
      this.fit(-1, -1, this.cap, def.prio, value);
    if (!ok) this.release();
    return ok;
  }

  /** Send the numbers marked to go away (`go`), or take the marks off. */
  private release(go = false): void {
    const list = this.active;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Num;
      if (a.doomed) {
        a.doomed = false;
        if (go) {
          this.give(a);
          continue;
        }
      }
      list[w++] = a;
    }
    list.length = w;
  }

  /** Whether fewer than `limit` numbers of a class (0 ordinary, 1 big, -1 any) and region (-1 any) stand, or one of them ranks below the newcomer: that one is marked to go. */
  private fit(cls: number, region: number, limit: number, prio: number, value: number): boolean {
    let count = 0;
    let victim: Num | null = null;
    for (const a of this.active) {
      if (a.doomed || (cls >= 0 && (a.def.prio >= BIG_PRIO ? 1 : 0) !== cls) || (region >= 0 && a.region !== region)) continue;
      count++;
      if (!victim || outranks(victim.def.prio, victim.value, a.def.prio, a.value)) victim = a;
    }
    if (count < limit) return true;
    if (!victim || !outranks(prio, value, victim.def.prio, victim.value)) return false;
    victim.doomed = true;
    return true;
  }

  /** Take a number off the screen at once. */
  private discard(n: Num): void {
    const i = this.active.indexOf(n);
    if (i >= 0) this.active.splice(i, 1);
    this.give(n);
  }

  /** Show `value` on a number that is alive: its text is laid out and its size follows the real width. */
  private setText(n: Num, value: number | string, o: NumberOpts): void {
    n.setText(figure(n.def, value));
    n.scale = scaleOf(n.def, typeof value === 'number' ? value : 0, n.half * 2, o, n.cap);
  }

  /**
   * The widest a figure of `def` may be drawn for body `t` (or for a point at `x` with no body): the style's own width, and on a side stretch of the lane no more than the strip
   * between the screen's edge and the board holds (a longer figure is drawn smaller there rather than not at all).
   */
  private widthFor(def: StyleDef, t: NumberTarget | null, x: number): number {
    const a = this.area;
    const side = t ? Math.abs(Math.sin(t.angle)) >= SIDE_LANE : x < a.keepX0 || x > a.keepX1;
    if (!side || a.keepX1 <= a.keepX0) return def.width;
    const strip = Math.min(a.keepX0 - a.minX, a.maxX - a.keepX1) - 2 * SIDE_GAP;
    return Math.min(def.width, strip / PEAK);
  }

  private apply(n: Num): void {
    const d = n.def;
    const t = n.age / d.life;
    const pop = popCurve(Math.min(1, n.age / d.popSeconds), d.pop[0], d.pop[1], d.pop[2]) * (1 + BUMP * n.bump);
    const s = n.scale * pop;
    const root = n.root;
    root.scale.set(s);
    const bw = n.half * n.scale * PEAK;
    const bh = (inkPx(d, n.scale) / 2) * PEAK;
    const a = this.area;
    const ease = Ease.cubicOut(Math.min(1, n.age / (d.life * 0.9)));
    n.cx = clamp(n.ex + n.ox + n.dx * ease, a.minX + bw, a.maxX - bw);
    n.cy = clamp(n.ey + n.oy + n.dy * ease, a.minY + bh, a.maxY - bh);
    n.bw = bw;
    n.bh = bh;
    root.position.set(n.cx, n.cy - INK_DROP * s);
    root.rotation = n.tiltAmp === 0 ? 0 : springWobble(n.age, n.tiltAmp, 3.2, 3.5);
    // Held at its style's opacity for the first 60% of life, then faded out.
    root.alpha = d.alpha * (t < 0.6 ? 1 : 1 - Ease.quadIn((t - 0.6) / 0.4)) * (1 - n.crossing / YIELD_SECONDS);
  }

  /** Put a number back in its pool. */
  private give(n: Num): void {
    n.root.visible = false;
    n.slot = -1;
    n.uid = -1;
    let pool = this.pools.get(n.font);
    if (!pool) {
      pool = [];
      this.pools.set(n.font, pool);
    }
    pool.push(n);
  }
}

/** Height of the ink of a number of this style at this scale (px). */
function inkPx(def: StyleDef, scale: number): number {
  return scale * (CAP_HEIGHT + (def.thin ? STROKE_THIN : STROKE_THICK));
}

/** Width of a figure at the baked size, from its characters (the Korean units are wide). */
function measure(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) w += text.charCodeAt(i) > 0x7f ? GLYPH_WIDE : GLYPH;
  return w;
}

/** The scale a figure of `magnitude` and `width` (baked px) is drawn at: its style's size, smaller when it would be wider than the style allows. */
function scaleOf(def: StyleDef, magnitude: number, width: number, o: NumberOpts, cap: number): number {
  // Size grows with log10 of the magnitude (a 4-digit hit reads a little bigger than a 2-digit one).
  const k = clamp(Math.log10(Math.max(1, Math.abs(magnitude))) / 3, 0, 1);
  const px = def.ink[0] + (def.ink[1] - def.ink[0]) * k;
  const scale = (px / (CAP_HEIGHT + (def.thin ? STROKE_THIN : STROKE_THICK))) * (o.scale ?? 1);
  // A long figure is drawn smaller rather than wider than a number may be: "864,408!" must not span the lane.
  const wide = width * scale;
  return wide > cap ? (scale * cap) / wide : scale;
}

/**
 * The short number format of a figure (`fmt`, a minus sign never shown). Below 10,000 `fmt` groups the thousands with `toLocaleString`, which
 * builds a number formatter on every call (about 50 us, on every hit that asks for a place); the same text is made by hand here.
 */
function shortFigure(value: number): string {
  const v = Math.floor(Math.abs(value));
  if (v >= 10_000) return fmt(v);
  return v < 1000 ? String(v) : Math.floor(v / 1000) + ',' + String(v % 1000).padStart(3, '0');
}

/** The text of a figure: its style's prefix and suffix round the short number format. */
function figure(def: StyleDef, value: number | string): string {
  return def.prefix + (typeof value === 'number' ? shortFigure(value) : value.replace(/^-/, '')) + def.suffix;
}
