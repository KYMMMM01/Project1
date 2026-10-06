/**
 * Paper pieces the shop and cats screens share: a titled page, a stamp, a luggage price tag, a die-cut
 * coupon, a bookmark ribbon and a flat sunburst. Geometry is built once per piece; nothing here runs per frame.
 */
import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { haptic } from '@/core/haptics';
import { mixColor, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import {
  backOut, bindPress, ButtonPalettes, cacheStatic, Color, drawDashedLine, drawIcon, edgeTone, fitLabel, motion, Panel, paperSeed,
  TweenBag, uiLabel, type ButtonStyleId, type PressBinding, type TapeName,
} from '@/ui';
import { couponPath, cutPoly, lowered, type CouponCut } from './cutMath';

/* ---------------------------------------------------------------- titled page */

/** Room above a page's top edge for its title label, and the content offset below that edge. */
const PAGE_OVER = 44;
export const PAGE_TOP = 56;
const PAGE_BOTTOM = 24;

export interface PaperPage {
  view: Container;
  /** Origin = top-left of the sheet; keep content at y >= PAGE_TOP, below the title label. */
  content: Container;
  /** Height of the page including the label overhang. */
  height: number;
}

/** A cream sheet with its title on a torn label across the top edge. Origin = top-left of the whole thing (label overhang included). */
export function paperPage(w: number, innerH: number, title: string, ribbon: ButtonStyleId, tape?: TapeName): PaperPage {
  const h = PAGE_TOP + innerH + PAGE_BOTTOM;
  const panel = new Panel({ width: w, height: h, title, ribbon, tape });
  panel.position.set(w / 2, PAGE_OVER + h / 2);
  const view = new Container();
  view.addChild(panel);
  return { view, content: panel.content, height: PAGE_OVER + h + 6 };
}

/* ------------------------------------------------------------- cut geometry */

/** Flat shadow, the paper and its thin rim, for a polygon (a custom cut). */
export function drawCut(g: Graphics, pts: number[], fill: number, shadow = 5): void {
  if (shadow > 0) g.poly(lowered(pts, shadow)).fill({ color: Color.shadow, alpha: 0.22 });
  g.poly(pts).fill(fill);
  g.poly(pts).stroke({ width: 2, color: edgeTone(fill), alpha: 0.5, alignment: 0, join: 'round' });
}

/** A die-cut coupon: the cut paper, then the dashed perforation between its notches. Origin = top-left. */
export function drawCoupon(g: Graphics, w: number, h: number, cut: CouponCut, fill: number, seed = paperSeed()): void {
  drawCut(g, cutPoly(couponPath(w, h, cut), seed, 0.9), fill);
  const o = { color: Color.kraftDark, alpha: 0.6, width: 2.5, dash: 9, gap: 8 };
  if (cut.axis === 'x') drawDashedLine(g, cut.at, cut.r + 8, cut.at, h - cut.r - 8, o);
  else drawDashedLine(g, cut.r + 8, cut.at, w - cut.r - 8, cut.at, o);
}

/* ---------------------------------------------------------------- bookmark */

/** A ribbon bookmark hanging from a top edge: a flat strip with a swallow-tail, the label on it. Origin = top-centre. */
export function bookmark(text: string, style: ButtonStyleId, width = 112): Container {
  const pal = ButtonPalettes[style];
  const t = uiLabel(text, { size: 24, color: pal.ink });
  const w = Math.max(width, Math.ceil(t.width) + 26);
  fitLabel(t, w - 20, 24);
  const h = 76;
  const g = new Graphics();
  const body = cutPoly([-w / 2, 0, w / 2, 0, w / 2, h, 0, h - 20, -w / 2, h], paperSeed(), 0.8);
  g.poly(lowered(body, 4)).fill({ color: Color.shadow, alpha: 0.22 });
  g.poly(body).fill(pal.base);
  g.poly(body).stroke({ width: 2, color: pal.lip, alpha: 0.6, alignment: 0, join: 'round' });
  t.position.set(0, 26);
  const c = new Container();
  c.addChild(g, t);
  cacheStatic(g);
  return c;
}

/* ------------------------------------------------------------------ stamp */

export interface StampOpts {
  color?: number;
  size?: number;
  /** The stamp never grows past this width; longer text shrinks. */
  maxWidth?: number;
  /** Radians. Default a few degrees anticlockwise. */
  tilt?: number;
}

/** An ink stamp: two lines round a word, pressed on paper. The one drawn line besides the speech bubble. Origin = centre. */
export function stampMark(text: string, o: StampOpts = {}): Container {
  const color = o.color ?? Color.berryDark;
  const size = o.size ?? 34;
  const t = uiLabel(text, { size, color });
  const padX = 24;
  if (o.maxWidth) fitLabel(t, o.maxWidth - padX * 2, size);
  const w = Math.ceil(t.width) + padX * 2;
  const h = Math.round(size * 1.15) + 24;
  const g = new Graphics();
  g.roundRect(-w / 2, -h / 2, w, h, 12).stroke({ width: 5, color, alignment: 0.5 });
  g.roundRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 7).stroke({ width: 2, color, alignment: 0.5 });
  const c = new Container();
  c.addChild(g, t);
  c.rotation = o.tilt ?? -0.12;
  c.alpha = 0.94;
  return c;
}

/** Slam a stamp down: it arrives big and transparent, lands with a small squash. */
export function stampIn(bag: TweenBag, stamp: Container, delay = 0, onLand?: () => void): void {
  const tilt = stamp.rotation;
  if (motion.reduced) {
    onLand?.();
    return;
  }
  stamp.scale.set(2.4);
  stamp.alpha = 0;
  bag.run({
    duration: 0.2,
    delay,
    ease: Ease.cubicIn,
    onUpdate: (k) => {
      stamp.scale.set(2.4 - 1.4 * k);
      stamp.alpha = Math.min(0.94, k * 3);
      stamp.rotation = tilt - 0.2 * (1 - k);
    },
    onComplete: () => {
      stamp.rotation = tilt;
      onLand?.();
      bag.run({
        duration: 0.22,
        ease: Ease.linear,
        onUpdate: (k) => stamp.scale.set(1 + 0.09 * Math.sin(k * Math.PI)),
        onComplete: () => stamp.scale.set(1),
      });
    },
  });
}

/* ----------------------------------------------------------------- sunburst */

/** A flat paper sunburst: `count` triangular rays of one colour, origin = the centre. Rotate it slowly; it never glows. */
export function paperSun(radius: number, count: number, color: number, alpha = 1): Graphics {
  const g = new Graphics();
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * TAU;
    const a1 = a0 + (TAU / count) * 0.5;
    g.poly([0, 0, Math.cos(a0) * radius, Math.sin(a0) * radius, Math.cos(a1) * radius, Math.sin(a1) * radius]).fill({ color, alpha });
  }
  cacheStatic(g);
  return g;
}

/* ----------------------------------------------------------------- price tag */

/** The warm darker shade a pressed piece of paper takes on. */
const PRESS_TINT = mixColor(Color.white, Color.kraft, 0.3);

export interface PriceTagOpts {
  width: number;
  height?: number;
  /** Paper colour (a button palette). Default coral. */
  style?: ButtonStyleId;
  currency?: 'gold' | 'gems';
  /** Shown with the currency icon in front. */
  amount?: number;
  /** A word after the price ("Buy and open"), or alone for a tag without a price ("Free"). */
  label?: string;
  fontSize?: number;
}

/**
 * A luggage price tag you press: chamfered paper, a reinforced hole at the left end with a loop of string,
 * the price and an optional word on it. Pressing moves the paper onto its shadow on the pointerdown frame.
 * Origin = centre of the face.
 */
export class PriceTag extends Container {
  readonly boxW: number;
  readonly boxH: number;
  private readonly face = new Container();
  private readonly bag = new TweenBag();
  private readonly press: PressBinding;
  private tapFn: (() => void) | null = null;
  private wobble = 1;

  constructor(o: PriceTagOpts) {
    super();
    const w = o.width;
    const h = o.height ?? 88;
    this.boxW = w;
    this.boxH = h;
    const pal = ButtonPalettes[o.style ?? 'primary'];
    const cham = h * 0.34;
    const hole = cham * 0.9;
    const seed = paperSeed();
    const outline = cutPoly([-w / 2 + cham, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2 + cham, h / 2, -w / 2, h / 2 - cham, -w / 2, -h / 2 + cham], seed, 0.9);

    const shadow = new Graphics();
    shadow.poly(lowered(outline, 5)).fill({ color: Color.shadow, alpha: 0.22 });
    const art = new Graphics();
    art.poly(outline).fill(pal.base);
    art.poly(outline).stroke({ width: 2, color: pal.lip, alpha: 0.6, alignment: 0, join: 'round' });
    // The reinforced hole and the string through it.
    const hx = -w / 2 + hole + 4;
    art.circle(hx, 0, 14).fill(edgeTone(pal.base));
    art.circle(hx, 0, 8).fill(Color.woodDark);
    art
      .moveTo(hx, 0)
      .bezierCurveTo(hx - 26, -h * 0.22, hx - 30, -h * 0.55, hx - 8, -h * 0.5)
      .stroke({ width: 3, color: Color.inkSoft, cap: 'round' });
    cacheStatic(shadow);
    cacheStatic(art);

    const content = new Container();
    const fs = o.fontSize ?? 32;
    const gap = 10;
    const left = -w / 2 + cham + 22;
    const avail = w / 2 - 14 - left;
    const parts: Container[] = [];
    let used = 0;
    if (o.amount !== undefined) {
      const ic = drawIcon(o.currency === 'gold' ? 'coin' : 'gem', Math.round(h * 0.5));
      const num = uiLabel(fmt(o.amount), { size: fs, color: pal.ink });
      parts.push(ic, num);
      used = ic.width + num.width + gap * 2;
    }
    if (o.label) {
      const word = uiLabel(o.label, { size: o.amount === undefined ? fs : Math.max(24, fs - 6), color: pal.ink });
      fitLabel(word, Math.max(60, avail - used), fs);
      parts.push(word);
    }
    const total = parts.reduce((s, p) => s + p.width, 0) + gap * Math.max(0, parts.length - 1);
    let x = left + Math.max(0, (avail - total) / 2);
    for (const p of parts) {
      p.position.set(x + p.width / 2, -1);
      x += p.width + gap;
      content.addChild(p);
    }

    this.face.addChild(art, content);
    this.addChild(shadow, this.face);
    this.hitArea = new Rectangle(-w / 2, -Math.max(h, 88) / 2, w, Math.max(h, 88) + 5);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.press = bindPress(this, {
      down: () => {
        this.bag.killOf(this.face);
        this.face.y = 3;
        this.face.rotation = 0;
        this.face.scale.set(0.97);
        this.face.tint = PRESS_TINT;
        shadow.alpha = 0.55;
        haptic('tap');
      },
      up: (fire) => {
        this.face.tint = Color.white;
        shadow.alpha = 1;
        this.face.y = 0;
        this.face.scale.set(1.035);
        this.wobble = -this.wobble;
        this.face.rotation = 0.028 * this.wobble;
        if (!motion.reduced) {
          this.bag.to(this.face.scale, { x: 1, y: 1 }, { duration: 0.2, ease: backOut(2.2) });
          this.bag.to(this.face, { rotation: 0 }, { duration: 0.2, ease: backOut(2.2) });
        } else {
          this.face.scale.set(1);
          this.face.rotation = 0;
        }
        if (fire) {
          audio.play('ui_click');
          this.tapFn?.();
        }
      },
    });
  }

  onTap(fn: (() => void) | null): this {
    this.tapFn = fn;
    return this;
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    this.bag.killAll();
    this.tapFn = null;
    super.destroy(options);
  }
}

/** A small cream pill with ink text ("x3", "x500"): a count on a corner. Origin = centre. */
export function countPill(text: string, fill: number = Color.paperLight, edge: number = Color.kraftDark): Container {
  const t = uiLabel(text, { size: 24 });
  const w = Math.max(60, Math.ceil(t.width) + 26);
  const h = 38;
  const g = new Graphics();
  const pts = cutPoly(pillPoints(w, h), paperSeed(), 0.5, 40);
  g.poly(lowered(pts, 3)).fill({ color: Color.shadow, alpha: 0.22 });
  g.poly(pts).fill(fill);
  g.poly(pts).stroke({ width: 2, color: edge, alpha: 0.7, alignment: 0, join: 'round' });
  const c = new Container();
  c.addChild(g, t);
  cacheStatic(g);
  return c;
}

function pillPoints(w: number, h: number): number[] {
  const r = h / 2;
  const pts: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 10;
    pts.push(w / 2 - r + r * Math.cos(a), r * Math.sin(a));
  }
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 10;
    pts.push(-w / 2 + r + r * Math.cos(a), r * Math.sin(a));
  }
  return pts;
}
