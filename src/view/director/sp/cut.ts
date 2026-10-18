/**
 * Already Cut, the samurai's scene (docs/design_skills_v2.md 3.2). The simulation does nothing to an enemy at the cast: it marks up to ten of
 * them and, `data.fuse` (1.2 s) later, cuts every one at once. The picture is what makes that readable:
 *
 *   1. THE AFTERIMAGE (the cast). The samurai on its tile blinks out for a moment and a flat cream afterimage of it (the cat's own art cut out
 *      to one shape, baked once) dashes along the stretch of road, `fromPath` to `toPath` (450 px, with the flow, round corners and over the seam),
 *      trailing a ribbon of cream paper that fades from the back. The enemies never feel it.
 *   2. THE THIN LINES. As the afterimage passes a marked enemy a small flash goes off on it and it is left with ONE thin cut line (an ink-edged
 *      cream slit across its body). The line rides the enemy by `uid` (it is the simulation's public enemy list, looked up once a frame), a little
 *      stronger for the last quarter of the fuse. An enemy that dies before the lines open leaves its line hanging where it died, faint: the line
 *      has not found a new owner yet. Two samurai that mark one enemy share one line (design 4.5); both cuts still land and both open.
 *   3. THE SHEATH CLICK (`cutOpen`, the fuse is over). A ring and a spark of cream at the samurai's tile and `imp_w_samurai`, and EVERY line opens
 *      at the same moment: the slit flares white-hot, then gapes (an ink-dark almond between two cream lips, with a paper starburst behind it) and fades. What the event says
 *      about each line is what is drawn: `cut` opens where it is; `moved` (its enemy died meanwhile) hops as a thin comet from the dead one's last
 *      place to the neighbour it passed to, and that neighbour is cut; `lost` fizzles where it hung. The numbers are the simulation's `hit`s, which
 *      follow the event in the same tick.
 *
 * Pair by `cutId` (two samurai may cast in one tick), never by time. A cast that lost the stage rule never reaches this scene, so a `cutOpen`
 * for a cut that was not shown is ignored; a cut that WAS shown but whose lines were cleared by a defeat still opens after a revive (the
 * gashes are drawn from the event's own numbers). Pictures are timed by the battle's clock with a floor in real time (`span.ts`). Reduced motion:
 * no moving afterimage (the ribbon is simply there and fades), no flashes, the gash opens already open. Low tier: a single band and no ink shadow
 * on the afterimage, no sparks, fewer lines. Nothing here moves an enemy or a cat.
 */
import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU, clamp, clamp01, lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import type { BattleEvents, EnemyState, SpCutData, UnitState } from '@/game';
import { cellCenterX, cellCenterY, pathPoint, wrapPath, type PathPoint } from '@/game/geometry';
import { Color } from '@/ui/theme';
import { bodyX } from '../../field/policy';
import { unitSpriteScale } from '../../field/unitView';
import { enemyInfo } from '../stage';
import { Pieces, Piece } from './runPieces';
import { Age } from './span';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

type Span = readonly [number, number];

/** [battle seconds, real floor] of each picture. */
const DASH: Span = [0.26, 0.15];
const FADE: Span = [0.3, 0.2];
const NICK: Span = [0.2, 0.12];
const OPEN: Span = [0.5, 0.32];
const OUT: Span = [0.18, 0.12];
const HOP: Span = [0.22, 0.14];
const BLINK: Span = [0.1, 0.07];
/** The cat on the tile keeps this much of its opacity while its afterimage runs. */
export const BLINK_KEEP = 0.25;
/** A line whose enemy is gone hangs on this many REAL seconds at most (a wave pause holds the battle clock, and the open with it). */
export const ORPHAN_REAL = 1.4;
/** The slant of every line (radians: rising to the right, as a katana cut). */
export const TILT = -0.55;
/** The most lines alive at once by quality tier, and the pool. */
export const LINES_LIVE = [12, 24, 36] as const;
const LINES_POOL = 36;
const DASHES = 3;
const HOPS_POOL = 12;
/** The waiting line: the ink under it and the cream line on it, in design px. */
export const WAIT_INK = 7.4;
export const WAIT_LINE = 3.6;
/** The last share of the fuse in which the lines tighten (a hint that the click is coming). */
const WARN_FROM = 0.75;
/** px of road between two points of the ribbon. */
const RIBBON_STEP = 30;
/** The streak shape is this many px tall at its fullest. */
const STREAK_H = 7.74;

const SPARKS: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.14, 0.26], speed: [120, 300], spread: 0.45, drag: 4, alignVel: true, stretch: 0.002, size: [16, 26], sizeEnd: [5, 8],
  colors: [Hue.cream, Hue.sun], fadeIn: 0, fadeOut: 0.5,
};
const CLICK_SPARKS: EmitDef = {
  tex: 'sparkle', prio: 1, count: 5, life: [0.25, 0.42], shape: { type: 'circle', r: 10 }, speed: [60, 150], drag: 3, size: [12, 20], sizeEnd: [3, 5], rot: [0, TAU],
  spin: [-3, 3], colors: [Hue.cream, Hue.spark], alpha: 0.95, fadeIn: 0.05, fadeOut: 0.6,
};
const FIZZLE_PUFF: EmitDef = {
  tex: 'smoke', prio: 0, count: 2, life: [0.3, 0.5], shape: { type: 'circle', r: 6 }, speed: [10, 40], drag: 3, gravity: -16, size: [14, 20], sizeEnd: [30, 42], rot: [0, TAU],
  colors: [Hue.cream, Hue.dust], alpha: 0.5, fadeIn: 0.08, fadeOut: 0.6,
};

const point: PathPoint = { x: 0, y: 0, angle: 0 };
const scratch: PathPoint = { x: 0, y: 0, angle: 0 };
const xs = new Float32Array(64);
const ys = new Float32Array(64);

let ghost: Texture | null = null;

/**
 * The samurai's afterimage: its own art cut out to one flat cream shape (the sticker border and all), painted on a 2D canvas the first time a cut is
 * shown. Null when the art cannot be drawn (no art, no canvas): the scene then draws the cat's own picture pale instead.
 */
export function afterimageTexture(source: Texture): Texture | null {
  if (ghost) return ghost;
  try {
    const res = source.source?.resource as CanvasImageSource | undefined;
    if (!res || typeof document === 'undefined') return null;
    const scale = source.source.resolution || 1;
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(res, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = `rgb(${(Color.paperLight >> 16) & 255},${(Color.paperLight >> 8) & 255},${Color.paperLight & 255})`;
    ctx.fillRect(0, 0, w, h);
    ghost = new Texture({ source: new CanvasSource({ resource: canvas, resolution: scale, autoGarbageCollect: false }), label: 'sp_cut_afterimage' });
    return ghost;
  } catch {
    return null;
  }
}

/** Forget the baked afterimage (tests). */
export function resetAfterimage(): void {
  ghost = null;
}

/** The sprite of a cat's view (the field's `UnitView` labels its art `sprite`). */
function artOf(view: Container | null): Sprite | null {
  const s = view?.getChildByLabel('sprite', true) ?? null;
  return s instanceof Sprite ? s : null;
}

/** One streak sprite, centred, flat and tapered (the atlas's `streak`); `length` and `thick` in design px. */
function streak(parent: Container, tint: number): Sprite {
  const s = fxTex('streak');
  const sp = new Sprite(s.texture);
  sp.anchor.set(0.5, 0.5);
  sp.tint = tint;
  sp.eventMode = 'none';
  sp.visible = false;
  parent.addChild(sp);
  return sp;
}

/** Lay a streak along the root's x axis: `length` px long, `thick` px at its fullest, `dy` px off the middle. */
function lay(sp: Sprite, length: number, thick: number, dy: number, alpha: number): void {
  sp.visible = alpha > 0.01 && thick > 0.05;
  sp.position.set(0, dy);
  sp.scale.set(length / 256, thick / STREAK_H);
  sp.alpha = alpha;
}

/** The afterimage crossing the stretch: a head (the cat's cut-out shape with a dark one under it) and a ribbon behind it. */
class Dash {
  on = false;
  /** Which cast it belongs to (a line asks the dash that marked it how far it has got). */
  seq = 0;
  /** 0..1: how far across the stretch it has got (1 once it has fallen away). */
  k = 0;
  phase: 'run' | 'fade' | 'done' = 'done';
  /** Where the head is drawn (QA and tests). */
  x = 0;
  y = 0;
  private from = 0;
  private len = 450;
  /** px of road the afterimage crosses. */
  get span(): number {
    return this.len;
  }
  private facing = 1;
  private base = 0.3;
  private readonly run = new Age();
  private readonly post = new Age();
  private readonly head = new Container();
  private readonly shade = new Sprite();
  private readonly body = new Sprite();
  private readonly ribbon = new Graphics();

  constructor(parent: Container) {
    for (const s of [this.shade, this.body]) {
      s.anchor.set(0.5, 1);
      s.eventMode = 'none';
    }
    this.shade.tint = Color.inkDeep;
    this.shade.alpha = 0.4;
    this.head.addChild(this.shade, this.body);
    this.head.eventMode = 'none';
    this.head.visible = false;
    this.ribbon.eventMode = 'none';
    this.ribbon.visible = false;
    parent.addChild(this.ribbon, this.head);
  }

  begin(seq: number, d: SpCutData, unit: UnitState, calm: boolean, detail: 0 | 1 | 2): void {
    this.on = true;
    this.seq = seq;
    this.k = calm ? 1 : 0;
    this.phase = calm ? 'fade' : 'run';
    this.from = d.fromPath;
    const gap = wrapPath(d.toPath - d.fromPath);
    this.len = gap > 20 ? gap : 450;
    this.run.reset();
    this.post.reset();
    const art = tex('unit_' + unit.id);
    const flat = afterimageTexture(art);
    const t = flat ?? art;
    this.body.texture = t;
    this.shade.texture = t;
    this.base = unitSpriteScale(unit.id, art.height) * 0.9;
    // With no cut-out the cat's own picture is drawn pale; with it the shape is flat cream.
    this.body.alpha = flat ? 1 : 0.7;
    this.shade.visible = detail > 0 && flat !== null;
    this.head.visible = !calm;
    this.head.alpha = 1;
    this.ribbon.visible = true;
    this.ribbon.alpha = 1;
    this.facing = 1;
    this.place(0);
  }

  /** The head at `s` px along the stretch. */
  private place(s: number): void {
    pathPoint(this.from + s, point);
    this.x = point.x;
    this.y = point.y;
    const c = Math.cos(point.angle);
    if (Math.abs(c) > 0.35) this.facing = c > 0 ? 1 : -1;
    else this.facing = point.x < 360 ? 1 : -1;
    const sc = this.base;
    this.head.position.set(point.x, point.y + 12);
    this.body.scale.set(sc * this.facing, sc);
    this.shade.scale.set(sc * 1.1 * this.facing, sc * 1.1);
    this.shade.position.set(2 * this.facing, 3);
  }

  update(dt: number, battleDt: number, calm: boolean, detail: 0 | 1 | 2): void {
    if (this.phase === 'run') {
      this.run.tick(battleDt, dt);
      this.k = this.run.k(DASH[0], DASH[1]);
      const s = this.len * Ease.sineOut(this.k);
      this.place(s);
      this.draw(1, detail, s);
      if (this.k >= 1) {
        this.phase = 'fade';
        this.post.reset();
      }
      return;
    }
    if (this.phase !== 'fade') return;
    this.post.tick(battleDt, dt);
    const f = this.post.k(FADE[0], FADE[1]);
    if (f >= 1) {
      this.hide();
      return;
    }
    this.k = 1;
    this.head.alpha = calm ? 0 : 1 - f * f;
    this.draw(1 - f, detail, this.len, f);
  }

  /** The ribbon: the part of the stretch the head has crossed, in up to three bands, the oldest thinnest and faintest; `tail` (0..1) eats it from the back. */
  private draw(alpha: number, detail: 0 | 1 | 2, upTo: number, tail = 0): void {
    const g = this.ribbon;
    g.clear();
    const from = upTo * tail;
    const len = upTo - from;
    if (len < 4 || alpha <= 0.01) return;
    const n = Math.min(xs.length, Math.max(2, Math.ceil(len / RIBBON_STEP) + 1));
    for (let i = 0; i < n; i++) {
      pathPoint(this.from + from + (len * i) / (n - 1), scratch);
      xs[i] = scratch.x;
      ys[i] = scratch.y;
    }
    const line = (a: number, b: number): void => {
      g.moveTo(xs[a] as number, ys[a] as number);
      for (let i = a + 1; i <= b; i++) g.lineTo(xs[i] as number, ys[i] as number);
    };
    if (detail > 0) {
      line(0, n - 1);
      g.stroke({ width: 20, color: Hue.cream, alpha: 0.22 * alpha, cap: 'round', join: 'round' });
    }
    const bands = detail === 0 ? 1 : 3;
    for (let b = 0; b < bands; b++) {
      const a = Math.floor((b * (n - 1)) / bands);
      const z = Math.floor(((b + 1) * (n - 1)) / bands);
      if (z <= a) continue;
      line(a, z);
      g.stroke({ width: 4 + (bands === 1 ? 3 : b * 2.2), color: Hue.cream, alpha: alpha * (bands === 1 ? 0.9 : 0.4 + 0.3 * b), cap: 'round', join: 'round' });
    }
  }

  hide(): void {
    this.on = false;
    this.phase = 'done';
    this.head.visible = false;
    this.ribbon.visible = false;
    this.ribbon.clear();
  }

  destroy(): void {
    this.head.destroy({ children: true });
    this.ribbon.destroy();
  }
}

type MarkState = 'off' | 'wait' | 'open' | 'out';

/**
 * One line: a thin cut (an ink almond with a cream almond on it) that rides its enemy, then a gash (an ink almond between two cream lips, a paper
 * crescent and a flash) once it opens. Pooled; a line is also made, already open, for a cut with no line to open (a shared or cleared line).
 */
class Mark {
  state: MarkState = 'off';
  uid = 0;
  /** The casts waiting on this line (one line per enemy; each cast that marked it opens at its own time). */
  casts: number[] = [];
  /** Where it is drawn (design px, the middle of the body). */
  x = 0;
  y = 0;
  size = 56;
  length = 60;
  openLength = 56;
  gape = 8;
  /** The dash that marked it and how far across the stretch it must be to show; `shown` once it has. */
  dash: Dash | null = null;
  dashSeq = 0;
  appear = 0;
  /** The first cast's time and fuse (the lines tighten in the last quarter of it). */
  at = 0;
  fuse = 1.2;
  shown = false;
  /** The enemy is gone: the line hangs where it died. `orphanReal` counts the real seconds it has. */
  orphan = false;
  orphanReal = 0;
  /** Order of creation (the oldest is taken over when the pool is full). */
  born = 0;
  readonly age = new Age();
  private readonly nick = new Age();
  private nicking = false;
  readonly root = new Container();
  private readonly flash: Sprite;
  private readonly inner: Sprite;
  private readonly lipA: Sprite;
  private readonly lipB: Sprite;

  constructor(parent: Container) {
    this.flash = new Sprite(fxTex('starburst').texture);
    this.flash.anchor.set(0.5);
    this.flash.eventMode = 'none';
    this.flash.visible = false;
    this.flash.tint = Hue.sun;
    this.inner = streak(this.root, Color.inkDeep);
    this.lipA = streak(this.root, Hue.cream);
    this.lipB = streak(this.root, Hue.cream);
    this.root.addChild(this.flash);
    this.root.rotation = TILT;
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** A waiting line on an enemy. */
  begin(uid: number, cast: number, d: SpCutData, x: number, y: number, size: number, dash: Dash, appear: number, born: number): void {
    this.state = 'wait';
    this.uid = uid;
    this.casts.length = 0;
    this.casts.push(cast);
    this.dash = dash;
    this.dashSeq = dash.seq;
    this.appear = appear;
    this.at = d.at;
    this.fuse = d.fuse;
    this.shown = false;
    this.orphan = false;
    this.orphanReal = 0;
    this.born = born;
    this.age.reset();
    this.setSize(size);
    this.x = x;
    this.y = y;
    this.root.visible = false;
    this.flash.visible = false;
  }

  private setSize(size: number): void {
    this.size = size;
    this.length = clamp(size * 1.2, 40, 130);
    this.openLength = clamp(size * 1.05, 36, 120);
    this.gape = clamp(size * 0.12, 4.5, 9);
  }

  /** The line is drawn on its enemy for the first time: a small flash. */
  show(calm: boolean, detail: number): void {
    this.shown = true;
    this.root.visible = true;
    if (!calm && detail > 0) {
      this.nicking = true;
      this.nick.reset();
    }
  }

  /** A gash that opens at once (the line's own, or a fresh one). */
  openAt(x: number, y: number, size: number, born: number): void {
    this.state = 'open';
    this.casts.length = 0;
    this.dash = null;
    this.born = born;
    this.x = x;
    this.y = y;
    this.setSize(size);
    this.shown = true;
    this.orphan = false;
    this.nicking = false;
    this.age.reset();
    this.root.visible = true;
  }

  /** The line goes out where it hangs (its enemy and its cast are gone). */
  retire(): void {
    if (this.state !== 'wait') return;
    this.state = 'out';
    this.casts.length = 0;
    this.age.reset();
    this.nicking = false;
  }

  /** The thin line: its look at `warn` (0..1: how close the click is). */
  drawWait(dt: number, battleDt: number, warn: number, calm: boolean, detail: number): void {
    if (this.orphan) this.orphanReal += dt;
    const faint = this.orphan ? 0.5 : 1;
    const t = (calm ? 0 : warn) * 0.7;
    this.root.position.set(this.x, this.y);
    // Thick enough to read on a phone (1 design px is 0.625 px at 450 wide: the ink is 4.5 px, the cream 2.3 px): the marked road must look different from the unmarked one for the whole fuse.
    lay(this.inner, this.length * (0.92 + 0.08 * warn), (WAIT_INK + 2.2 * t) * (this.orphan ? 0.8 : 1), 0, 0.92 * faint);
    lay(this.lipA, this.length * (0.92 + 0.08 * warn), (WAIT_LINE + 1.2 * t) * (this.orphan ? 0.8 : 1), 0, faint);
    this.lipB.visible = false;
    if (this.nicking) {
      this.nick.tick(battleDt, dt);
      const k = this.nick.k(NICK[0], NICK[1]);
      if (k >= 1 || detail === 0) {
        this.nicking = false;
        this.flash.visible = false;
      } else {
        this.flash.visible = true;
        this.flash.scale.set(((this.size * 0.95) / Math.max(1, this.flash.texture.width)) * (0.5 + 0.6 * Ease.cubicOut(k)));
        this.flash.alpha = 0.9 * (1 - k);
        this.flash.rotation = -TILT + k;
      }
    } else this.flash.visible = false;
  }

  /** The gash: a white-hot flare along the slit, then it splits (a dark gap between two bright lips), holds and fades. Returns false when it is over. */
  drawOpen(dt: number, battleDt: number, calm: boolean, detail: number): boolean {
    this.age.tick(battleDt, dt);
    const k = this.age.k(OPEN[0], OPEN[1]);
    if (k >= 1) return false;
    const hot = calm ? 0 : 1 - clamp01((k - 0.04) / 0.14);
    const u = calm ? 1 : Ease.cubicOut(clamp01((k - 0.06) / 0.2));
    const gap = this.gape * u;
    // The dark of the gash is brief (it hid the packed road for 0.3 s): the lips fade from the start of the second half, the ink earlier.
    const alpha = k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65;
    const length = this.openLength;
    this.root.position.set(this.x, this.y);
    lay(this.inner, length, gap + 3, 0, 0.62 * alpha * alpha * (1 - hot));
    lay(this.lipA, length, 3.4 + 7 * hot, gap / 2, alpha);
    lay(this.lipB, length, 3.4 + 7 * hot, -gap / 2, alpha);
    const f = calm ? 1 : clamp01(k / 0.3);
    this.flash.visible = !calm && detail > 0 && f < 1;
    if (this.flash.visible) {
      this.flash.scale.set(((this.size * 1.0) / Math.max(1, this.flash.texture.width)) * (0.55 + 0.6 * Ease.cubicOut(f)));
      this.flash.alpha = 0.85 * (1 - f);
      this.flash.rotation = -TILT + f * 0.7;
    }
    return true;
  }

  /** The thin line going out (a line whose enemy and cast are gone). Returns false when it is over. */
  drawOut(dt: number, battleDt: number): boolean {
    this.age.tick(battleDt, dt);
    const k = this.age.k(OUT[0], OUT[1]);
    if (k >= 1) return false;
    this.root.position.set(this.x, this.y);
    lay(this.inner, this.length * (1 - k), 3.2, 0, 0.5 * (1 - k));
    lay(this.lipA, this.length * (1 - k), 1.6, 0, 0.6 * (1 - k));
    this.lipB.visible = false;
    return true;
  }

  hide(): void {
    this.state = 'off';
    this.casts.length = 0;
    this.dash = null;
    this.nicking = false;
    this.root.visible = false;
    this.flash.visible = false;
    this.inner.visible = false;
    this.lipA.visible = false;
    this.lipB.visible = false;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** The thin comet a moved line makes, from the dead enemy's last place to the one it passed to. */
class Hop extends Piece {
  readonly sprite: Sprite;
  ax = 0;
  ay = 0;
  bx = 0;
  by = 0;
  constructor(parent: Container) {
    super();
    const s = fxTex('streak');
    this.sprite = new Sprite(s.texture);
    this.sprite.anchor.set(0, 0.5);
    this.sprite.tint = Hue.cream;
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    parent.addChild(this.sprite);
  }
  hide(): void {
    this.on = false;
    this.sprite.visible = false;
  }
  destroy(): void {
    this.sprite.destroy();
  }
}

class CutScene implements SpScene<'cut'> {
  private readonly layer = new Container();
  private readonly dashes: Dash[] = [];
  private readonly marks: Mark[] = [];
  private readonly hops: Pieces<Hop>;
  /** The cuts whose cast was shown and whose lines have not opened yet (kept through a defeat: a revive lets them open). */
  private readonly known = new Set<number>();
  private readonly lookup = new Map<number, EnemyState>();
  private seq = 0;
  private born = 0;
  private readonly offs: Array<() => void> = [];
  /** A listener threw: the scene shows nothing for the rest of the battle. */
  private broken = false;
  /** The samurai whose art is blinked out on its tile while its afterimage runs. */
  private blinkUid = -1;
  private blink = 0;
  private blinkTo = 0;
  private artView: Container | null = null;
  private art: Sprite | null = null;
  private lastAlpha = 1;

  constructor(readonly env: SpEnv) {
    // Over the board, the enemies and the cats (the lines are ON the enemies), under the numbers.
    env.ctx.layers.fxFront.addChild(this.layer);
    this.layer.eventMode = 'none';
    this.hops = new Pieces(() => new Hop(this.layer), HOPS_POOL);
    this.offs.push(env.battle.events.on('cutOpen', (e) => this.safe('open', () => this.onOpen(e))));
  }

  /**
   * The scene's own listener is called by the simulation in the middle of a rule (`cutOpen` comes BEFORE the `hit`s of that cut), and an emitter
   * does not catch: a throw here would unwind through `Sim.tick` and lose the cut's damage. So it is logged, and the scene empties itself and
   * switches off for the rest of the battle (the way the other listening scenes do).
   */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] cut ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  cast(e: SpCastOf<'cut'>): void {
    if (this.broken) return;
    const { stage } = this.env;
    const d = e.data;
    const detail = stage.detail;
    const calm = stage.reduced;
    this.known.add(d.cutId);
    this.refresh();
    const dash = this.takeDash();
    dash.begin(++this.seq, d, e.unit, calm, detail);
    this.blinkStart(e.unit, calm);
    for (const m of d.marks) {
      const en = this.lookup.get(m.uid);
      // One line per enemy: a second cast that marks it only adds itself to the line's casts.
      const have = this.lineOf(m.uid);
      if (have) {
        if (!have.casts.includes(d.cutId)) have.casts.push(d.cutId);
        continue;
      }
      const info = en ? enemyInfo(en.id) : null;
      const size = info?.size ?? 56;
      const line = this.takeMark(LINES_LIVE[detail]);
      const offset = en ? wrapPath(wrapPath(en.travelled) - d.fromPath) : 0;
      line.begin(m.uid, d.cutId, d, bodyX(en ? en.x : m.x, size), (en ? en.y : m.y) - size * 0.05, size, dash, clamp01(offset / dash.span), ++this.born);
    }
    stage.fx.dustPuff(e.x, e.y + 24, { scale: 0.8 });
    stage.play(stage.rules.big, 'atk_w_samurai', 0.7, 1.05, 0.04);
  }

  /** A cut opens: every line at once. */
  private onOpen(e: BattleEvents['cutOpen']): void {
    if (!this.known.delete(e.cutId)) return;
    const { stage, battle } = this.env;
    const detail = stage.detail;
    this.refresh();
    for (const l of e.lines) {
      const own = this.lineOf(l.uid, e.cutId);
      if (own) own.casts.splice(own.casts.indexOf(e.cutId), 1);
      if (l.kind === 'lost') {
        // It had nowhere to go: it goes out where it hung.
        if (own && own.casts.length === 0) own.retire();
        if (!stage.reduced) stage.fx.ps.burst(FIZZLE_PUFF, l.x, l.y, { count: detail === 0 ? 0.5 : 1 });
        continue;
      }
      const to = this.lookup.get(l.kind === 'moved' ? l.to : l.uid);
      const size = to ? enemyInfo(to.id).size : 56;
      const x = bodyX(l.toX, size);
      const y = l.toY - size * 0.05;
      if (l.kind === 'moved') {
        const h = this.hops.take();
        h.start(HOP[0], HOP[1]);
        h.ax = l.x;
        h.ay = l.y;
        h.bx = x;
        h.by = y;
        h.sprite.visible = true;
        this.drawHop(h, 0);
        if (own && own.casts.length === 0) own.retire();
      }
      // The line itself opens when no other cast still waits on it; a shared line stays for the cast that is left, and this cut gets a gash of its own.
      let m: Mark;
      if (l.kind === 'cut' && own && own.casts.length === 0) m = own;
      else {
        m = this.takeMark(LINES_LIVE[detail]);
      }
      m.openAt(x, y, size, ++this.born);
      if (detail > 0 && !stage.reduced) stage.fx.ps.burst(SPARKS, x, y, { dir: TILT - Math.PI / 2, spread: 1.1, scale: Math.max(0.8, size / 56), count: detail === 1 ? 0.7 : 1 });
    }
    // The sheath click at the samurai's tile (it may have been sold meanwhile: then there is no tile to click).
    const u = e.unit;
    const on = battle.units[u.cell];
    if (on && on.uid === u.uid) {
      const cx = cellCenterX(u.cell);
      const cy = cellCenterY(u.cell);
      stage.fx.shockwave(cx, cy + 8, { color: Hue.cream, radius: 52 });
      if (detail > 0 && !stage.reduced) stage.fx.ps.burst(CLICK_SPARKS, cx, cy - 6, { count: detail === 1 ? 0.7 : 1 });
    }
    stage.play(stage.rules.strike, 'imp_w_samurai', 0.75, 1.2, 0.04);
  }

  private refresh(): void {
    this.lookup.clear();
    for (const en of this.env.battle.enemies) this.lookup.set(en.uid, en);
  }

  /** The waiting line on enemy `uid` (when `cast` is given, the one that cast waits on). */
  private lineOf(uid: number, cast?: number): Mark | null {
    for (const m of this.marks) if (m.state === 'wait' && m.uid === uid && (cast === undefined || m.casts.includes(cast))) return m;
    return null;
  }

  private takeDash(): Dash {
    let d = this.dashes.find((x) => !x.on);
    if (!d) {
      if (this.dashes.length < DASHES) {
        d = new Dash(this.layer);
        this.dashes.push(d);
      } else {
        d = this.dashes.reduce((a, b) => (a.seq <= b.seq ? a : b));
        d.hide();
      }
    }
    return d;
  }

  /** A free line; at the tier's limit (or a full pool) the oldest is taken over. */
  private takeMark(limit: number): Mark {
    let free: Mark | null = null;
    let oldest: Mark | null = null;
    let live = 0;
    for (const m of this.marks) {
      if (m.state === 'off') {
        if (!free) free = m;
        continue;
      }
      live++;
      if (!oldest || m.born < oldest.born) oldest = m;
    }
    if (oldest && live >= Math.min(limit, LINES_POOL)) {
      oldest.hide();
      return oldest;
    }
    if (free) return free;
    const m = new Mark(this.layer);
    this.marks.push(m);
    return m;
  }

  private readonly paintHop = (h: Hop, k: number): void => this.drawHop(h, k);

  private drawHop(h: Hop, k: number): void {
    const dx = h.bx - h.ax;
    const dy = h.by - h.ay;
    const dist = Math.hypot(dx, dy);
    const head = this.env.stage.reduced ? 1 : Ease.cubicOut(clamp01(k / 0.7));
    const tail = this.env.stage.reduced ? 0 : Ease.cubicOut(clamp01((k - 0.25) / 0.75));
    const x0 = lerp(h.ax, h.bx, tail);
    const y0 = lerp(h.ay, h.by, tail);
    h.sprite.position.set(x0, y0);
    h.sprite.rotation = Math.atan2(dy, dx);
    h.sprite.scale.set((dist * Math.max(0.02, head - tail)) / 256, 0.5);
    h.sprite.alpha = 0.95 * (1 - Math.max(0, k - 0.6) / 0.4);
  }

  // ── the samurai's tile ──

  private blinkStart(unit: UnitState, calm: boolean): void {
    // One samurai blinks at a time: a second cast in the same moment gives the first its opacity back.
    if (this.blinkUid >= 0 && this.blinkUid !== unit.uid) this.setArtBack();
    this.blinkUid = unit.uid;
    this.blinkTo = calm ? 0 : 1;
    if (calm) this.setArt(1);
  }

  private tickBlink(dt: number, battleDt: number, dashing: boolean): void {
    if (this.blinkUid < 0) return;
    this.blinkTo = dashing && !this.env.stage.reduced ? 1 : 0;
    const rate = Math.min(battleDt / BLINK[0], dt / BLINK[1]);
    this.blink = this.blinkTo > this.blink ? Math.min(this.blinkTo, this.blink + rate) : Math.max(this.blinkTo, this.blink - rate);
    this.setArt(1 - (1 - BLINK_KEEP) * this.blink);
    if (this.blink <= 0 && this.blinkTo === 0) this.blinkUid = -1;
  }

  /** Set the opacity of the samurai's art on its tile (through the view the field keeps for it; nothing to do when there is none). */
  private setArt(alpha: number): void {
    if (this.blinkUid < 0) return;
    const view = this.env.ctx.unitView(this.blinkUid);
    if (view !== this.artView) {
      // The view was given to another cat (or the samurai left): give the old one its opacity back.
      if (this.art && !this.art.destroyed) this.art.alpha = 1;
      this.artView = view;
      this.art = artOf(view);
      this.lastAlpha = 1;
    }
    const art = this.art;
    if (!art || art.destroyed) return;
    if (alpha !== this.lastAlpha) {
      this.lastAlpha = alpha;
      art.alpha = alpha;
    }
  }

  update(dt: number, battleDt: number): void {
    if (this.broken) return;
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    let waiting = false;
    for (const m of this.marks) if (m.state === 'wait') waiting = true;
    if (waiting) this.refresh();
    let dashing = false;
    for (const d of this.dashes) {
      if (!d.on) continue;
      d.update(dt, battleDt, calm, detail);
      if (d.phase === 'run') dashing = true;
    }
    this.tickBlink(dt, battleDt, dashing);
    const now = battle.time;
    for (const m of this.marks) {
      if (m.state === 'off') continue;
      if (m.state === 'wait') this.tickWait(m, dt, battleDt, now, calm, detail);
      else if (m.state === 'open') {
        if (!m.drawOpen(dt, battleDt, calm, detail)) m.hide();
      } else if (!m.drawOut(dt, battleDt)) m.hide();
    }
    this.hops.update(battleDt, dt, this.paintHop);
  }

  private tickWait(m: Mark, dt: number, battleDt: number, now: number, calm: boolean, detail: 0 | 1 | 2): void {
    const en = this.lookup.get(m.uid);
    if (en) {
      const size = m.size;
      m.x = bodyX(en.x, size);
      m.y = en.y - size * 0.05;
      m.orphan = false;
      m.orphanReal = 0;
    } else if (!m.orphan) m.orphan = true;
    if (m.orphan && m.orphanReal >= ORPHAN_REAL) {
      m.retire();
      return;
    }
    if (!m.shown) {
      const d = m.dash;
      const across = !d || !d.on || d.seq !== m.dashSeq || d.k >= m.appear;
      if (across) m.show(calm, detail);
    }
    if (!m.shown) return;
    // The last quarter of the fuse: the line tightens. The fuse is the first cast's (the lines of another cast that share this one tighten with it).
    const fuse = clamp01((now - m.at) / m.fuse);
    m.drawWait(dt, battleDt, clamp01((fuse - WARN_FROM) / (1 - WARN_FROM)), calm, detail);
  }

  clear(): void {
    for (const d of this.dashes) d.hide();
    for (const m of this.marks) m.hide();
    this.hops.clear();
    this.lookup.clear();
    this.setArtBack();
    // `known` stays: a cut whose cast was shown still opens after a revive (see the header).
  }

  private setArtBack(): void {
    if (this.blinkUid >= 0) this.setArt(1);
    this.blinkUid = -1;
    this.blink = 0;
    this.blinkTo = 0;
    this.art = null;
    this.artView = null;
  }

  destroy(): void {
    this.clear();
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const d of this.dashes) d.destroy();
    for (const m of this.marks) m.destroy();
    this.hops.destroy();
    this.dashes.length = 0;
    this.marks.length = 0;
    this.known.clear();
    this.layer.destroy();
  }

  /** What is on screen right now (QA and tests). */
  live(): {
    dashes: Array<{ seq: number; phase: string; k: number; x: number; y: number }>;
    lines: Array<{ uid: number; state: string; shown: boolean; orphan: boolean; casts: number[]; x: number; y: number }>;
    hops: number;
    waiting: number;
  } {
    return {
      dashes: this.dashes.filter((d) => d.on).map((d) => ({ seq: d.seq, phase: d.phase, k: d.k, x: d.x, y: d.y })),
      lines: this.marks.filter((m) => m.state !== 'off').map((m) => ({ uid: m.uid, state: m.state, shown: m.shown, orphan: m.orphan, casts: [...m.casts], x: m.x, y: m.y })),
      hops: this.hops.live,
      waiting: this.known.size,
    };
  }
}

export const makeCut: SpSceneFactory<'cut'> = (env) => new CutScene(env);

