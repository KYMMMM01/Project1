import { Container, FillPattern, Graphics, Texture } from 'pixi.js';
import { mixColor } from '@/core/math';
import type { Box } from './layoutMath';
import {
  bubblePath,
  cachedPaperPath,
  clipPolyX,
  dashRuns,
  fitDash,
  hash32,
  insetPolygon,
  makeRng,
  paintPath,
  tapeOutline,
  tornMask,
  wobbleAmp,
  type BubbleTail,
  type TornSides,
} from './paperMath';
import { fitLabel, uiLabel } from './text';
import { ButtonPalettes, Color, TapeColors, type ButtonStyleId, type TapeName } from './theme';

export type { BubbleTail, TornSide, TornSides } from './paperMath';

/* ------------------------------------------------------------------- seeds */

let seedCounter = 1;

/**
 * A fresh wobble seed. Components take one in their constructor, so the same screen built in the
 * same order always cuts the same shapes, and a piece that redraws keeps its own.
 */
export function paperSeed(): number {
  return hash32(seedCounter++, 0x5eed);
}

/* ------------------------------------------------------------------- grain */

/** Sheets at least this big (px²) get the paper grain unless told otherwise. */
const GRAIN_MIN_AREA = 40000;

let grain: FillPattern | null = null;

/**
 * One small speckle-and-fibre texture, painted on a canvas the first time a large sheet needs it and
 * tiled at very low contrast: no filters, no per-frame work.
 */
function grainPattern(): FillPattern | null {
  if (grain) return grain;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const rnd = makeRng(0x9a11);
  for (let i = 0; i < 700; i++) {
    const dark = rnd() < 0.7;
    ctx.fillStyle = dark ? `rgba(120,84,48,${0.03 + rnd() * 0.04})` : `rgba(255,252,240,${0.06 + rnd() * 0.08})`;
    const s = 1 + Math.floor(rnd() * 2.4);
    ctx.fillRect(Math.floor(rnd() * size), Math.floor(rnd() * size), s, s);
  }
  ctx.lineWidth = 1;
  for (let i = 0; i < 34; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const a = rnd() * Math.PI;
    const l = 5 + rnd() * 9;
    ctx.strokeStyle = rnd() < 0.5 ? 'rgba(120,84,48,0.045)' : 'rgba(255,250,235,0.12)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  const tex = Texture.from(canvas);
  tex.source.style.addressMode = 'repeat';
  grain = new FillPattern(tex, 'repeat');
  return grain;
}

/* ------------------------------------------------------------------- floor */

/** The wooden floor every sheet lies on: planks with a darker groove between them. (0, 0) is the top-left of the rect it fills. */
export function drawFloor(g: Graphics, w: number, h: number): void {
  g.rect(0, 0, w, h).fill(Color.wood);
  const rnd = makeRng(0xf100);
  for (let y = 0; y < h; y += 172) {
    const tone = rnd();
    g.rect(0, y, w, 172).fill({ color: tone < 0.5 ? Color.woodDark : Color.woodLight, alpha: 0.05 + 0.07 * rnd() });
    for (let i = 0; i < 5; i++) {
      const sy = y + 14 + rnd() * 146;
      const sx = rnd() * w;
      g.rect(sx, sy, 90 + rnd() * 260, 2).fill({ color: Color.woodDark, alpha: 0.07 + 0.06 * rnd() });
    }
    g.rect(0, y, w, 4).fill({ color: Color.woodDark, alpha: 0.45 });
  }
}

/* ------------------------------------------------------------ paper pieces */

export type PaperKind = 'rect' | 'pill' | 'circle';

export interface PaperOpts {
  w: number;
  h: number;
  /** rect (default), pill (capsule) or circle (w and h are both taken as the larger of the two). */
  kind?: PaperKind;
  /** Corner radius of a rect. Default 22. */
  radius?: number;
  fill: number;
  /** Wobble seed (default: derived from the size, so equal sizes cut equal). Use paperSeed() for variety. */
  seed?: number;
  /** Thin line just inside the cut. Default: the paper a little darker. false = none. */
  edge?: number | false;
  /** Width and opacity of that line (default 2 px at 0.5): raise both for a bordered card. */
  edgeWidth?: number;
  edgeAlpha?: number;
  /** Sides torn instead of cut, with a pale fibre line along the tear. */
  torn?: TornSides;
  /** Flat shadow under the piece: false = none, a number = its vertical offset (default 5). */
  shadow?: boolean | number;
  /** Tile the paper grain over the face. Default: on sheets of 40 000 px² or more. */
  grain?: boolean;
  /** Multiplier on the hand-cut wobble: 0 = ruler straight, 1 = standard. */
  wobble?: number;
  alpha?: number;
  /** Opacity of the flat shadow (default 0.22). */
  shadowAlpha?: number;
}

interface Resolved {
  w: number;
  h: number;
  radius: number;
  seed: number;
  amp: number;
  mask: number;
}

function resolve(o: PaperOpts): Resolved {
  const kind = o.kind ?? 'rect';
  const side = Math.max(o.w, o.h);
  const w = kind === 'circle' ? side : o.w;
  const h = kind === 'circle' ? side : o.h;
  const radius = kind === 'rect' ? (o.radius ?? 22) : Math.min(w, h) / 2;
  return {
    w,
    h,
    radius,
    seed: o.seed ?? hash32(Math.round(w), Math.round(h), Math.round(radius)),
    amp: wobbleAmp(w, h, o.wobble ?? 1),
    mask: tornMask(o.torn),
  };
}

function shifted(pts: readonly number[], dx: number, dy: number): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = (pts[i] as number) + dx;
    out[i + 1] = (pts[i + 1] as number) + dy;
  }
  return out;
}

/** The paper's own thin rim tone: itself pulled toward warm brown. */
export function edgeTone(fill: number): number {
  return mixColor(fill, Color.shadow, 0.26);
}

/** Flat warm-brown shadow only, for pieces that press down onto it. (x, y) is the top-left of the piece. */
export function drawPaperShadow(g: Graphics, x: number, y: number, o: PaperOpts): void {
  if (o.shadow === false) return;
  const r = resolve(o);
  const dy = typeof o.shadow === 'number' ? o.shadow : 5;
  const path = cachedPaperPath(r.w, r.h, r.radius, r.seed, r.amp, r.mask);
  g.poly(shifted(path.pts, x, y + dy)).fill({ color: Color.shadow, alpha: o.shadowAlpha ?? 0.22 });
}

/** The cut edge `drawPaperFace` draws for these options, clockwise, in the same coordinates ((x, y) is the top-left of the piece): what a mount stuck on the piece is cut from. */
export function paperOutline(x: number, y: number, o: PaperOpts): number[] {
  const r = resolve(o);
  return shifted(cachedPaperPath(r.w, r.h, r.radius, r.seed, r.amp, r.mask).pts, x, y);
}

/** The paper itself: fill, grain, rim line, torn fibre. (x, y) is the top-left of the piece. */
export function drawPaperFace(g: Graphics, x: number, y: number, o: PaperOpts): void {
  const r = resolve(o);
  const path = cachedPaperPath(r.w, r.h, r.radius, r.seed, r.amp, r.mask);
  const pts = shifted(path.pts, x, y);
  g.poly(pts).fill({ color: o.fill, alpha: o.alpha ?? 1 });
  const pattern = (o.grain ?? r.w * r.h >= GRAIN_MIN_AREA) ? grainPattern() : null;
  if (pattern) g.poly(pts).fill(pattern);
  if (o.edge !== false && r.mask === 0) {
    g.poly(pts).stroke({ width: o.edgeWidth ?? 2, color: o.edge ?? edgeTone(o.fill), alpha: o.edgeAlpha ?? 0.5, alignment: 0, join: 'round' });
  }
  const fibre = mixColor(o.fill, Color.white, 0.6);
  for (const line of path.torn) {
    const moved = shifted(line, x, y);
    g.moveTo(moved[0] as number, moved[1] as number);
    for (let i = 2; i < moved.length; i += 2) g.lineTo(moved[i] as number, moved[i + 1] as number);
    g.stroke({ width: 2.2, color: fibre, alpha: 0.85, join: 'round', cap: 'round' });
  }
}

/** Shadow, then face, into one Graphics: for pieces that never move on their own. */
export function drawPaper(g: Graphics, x: number, y: number, o: PaperOpts): void {
  drawPaperShadow(g, x, y, o);
  drawPaperFace(g, x, y, o);
}

/**
 * A piece of paper as a display object. Origin = centre. `shadowG` and `faceG` are separate so a
 * button can press its face down onto a shadow that stays put.
 */
export class PaperPiece extends Container {
  readonly shadowG = new Graphics();
  readonly faceG = new Graphics();
  readonly uiBox: Box;

  constructor(opts: PaperOpts) {
    super();
    const r = resolve(opts);
    this.uiBox = { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h };
    drawPaperShadow(this.shadowG, -r.w / 2, -r.h / 2, opts);
    drawPaperFace(this.faceG, -r.w / 2, -r.h / 2, opts);
    this.addChild(this.shadowG, this.faceG);
  }
}

/** Builder for the common case: `paperShape({ w: 300, h: 100, fill: Color.paper })`. */
export function paperShape(opts: PaperOpts): PaperPiece {
  return new PaperPiece(opts);
}

/* -------------------------------------------------------------------- tape */

export type TapePattern = 'plain' | 'dots' | 'gingham' | 'stripes';

export interface TapeOpts {
  name?: TapeName;
  pattern?: TapePattern;
  w?: number;
  h?: number;
  /** Tilt in degrees (default -4). */
  angle?: number;
  seed?: number;
}

/**
 * A strip of washi tape: semi-opaque, printed with a pattern, cut with zig-zag ends and stuck on at
 * a slight angle. Origin = centre of the strip. Use one per card at most: it marks the selected or
 * recommended thing, or holds a sheet down.
 */
export function tapeStrip(o: TapeOpts = {}): Graphics {
  const w = o.w ?? 96;
  const h = o.h ?? 32;
  const tooth = 3.5;
  const col = TapeColors[o.name ?? 'pink'];
  const pattern = o.pattern ?? 'dots';
  const seed = o.seed ?? hash32(Math.round(w), Math.round(h), pattern.length);
  const g = new Graphics();
  const body = tapeOutline(w, h, tooth, seed);
  g.poly(shifted(body, 0, 1.6)).fill({ color: Color.shadow, alpha: 0.14 });
  g.poly(body).fill({ color: col.base, alpha: 0.88 });
  const xl = -w / 2 + tooth + 2;
  const xr = w / 2 - tooth - 2;
  const y0 = -h / 2;
  if (pattern === 'dots') {
    const rows = Math.max(1, Math.floor(h / 12));
    for (let r = 0; r < rows; r++) {
      const y = y0 + (h * (r + 0.5)) / rows;
      for (let x = xl + 5 + (r % 2) * 6; x < xr - 2; x += 12) g.circle(x, y, 2.2).fill({ color: col.mark, alpha: 0.85 });
    }
  } else if (pattern === 'gingham') {
    for (let x = xl; x < xr; x += 14) {
      g.rect(x, y0, Math.min(7, xr - x), h).fill({ color: col.mark, alpha: 0.4 });
    }
    for (let y = y0 + 2; y < y0 + h; y += 14) {
      g.rect(xl, y, xr - xl, Math.min(7, y0 + h - y)).fill({ color: col.mark, alpha: 0.4 });
    }
  } else if (pattern === 'stripes') {
    const sw = 7;
    for (let x = xl - h; x < xr + 4; x += sw * 2) {
      const band = clipPolyX([x, y0, x + sw, y0, x + sw - h, y0 + h, x - h, y0 + h], xl, xr);
      if (band.length >= 6) g.poly(band).fill({ color: col.mark, alpha: 0.55 });
    }
  }
  g.rotation = ((o.angle ?? -4) * Math.PI) / 180;
  g.eventMode = 'none';
  return g;
}

/* ------------------------------------------------------------------ dashes */

export interface DashOpts {
  color?: number;
  width?: number;
  dash?: number;
  gap?: number;
  alpha?: number;
  seed?: number;
  /** Corner radius of a dashed rect. Default 24. */
  radius?: number;
}

const dashCache = new Map<string, number[][]>();

function cachedRuns(key: string, build: () => number[][]): number[][] {
  let runs = dashCache.get(key);
  if (!runs) {
    runs = build();
    dashCache.set(key, runs);
    if (dashCache.size > 200) {
      const oldest = dashCache.keys().next();
      if (!oldest.done) dashCache.delete(oldest.value);
    }
  }
  return runs;
}

function strokeRuns(g: Graphics, runs: readonly (readonly number[])[], x: number, y: number, o: DashOpts): void {
  for (const run of runs) {
    g.moveTo((run[0] as number) + x, (run[1] as number) + y);
    for (let i = 2; i < run.length; i += 2) g.lineTo((run[i] as number) + x, (run[i + 1] as number) + y);
  }
  g.stroke({ width: o.width ?? 3.5, color: o.color ?? Color.teal, alpha: o.alpha ?? 1, cap: 'round', join: 'round' });
}

/** A hand-drawn "cut here" line round a rounded rectangle. (x, y) is its top-left corner. */
export function drawDashedRect(g: Graphics, x: number, y: number, w: number, h: number, o: DashOpts = {}): void {
  const dash = o.dash ?? 16;
  const gap = o.gap ?? 11;
  const radius = o.radius ?? 24;
  const seed = o.seed ?? hash32(Math.round(w), Math.round(h), 0xda5);
  const key = `r|${Math.round(w)}|${Math.round(h)}|${radius}|${dash}|${gap}|${seed}`;
  const runs = cachedRuns(key, () => dashRuns(cachedPaperPath(w, h, radius, seed, 0.9).pts, true, dash, gap));
  strokeRuns(g, runs, x, y, o);
}

/** Stroke dash runs that were already cut (a polyline per dash, see dashRuns) with the usual dashed-line style. */
export function drawDashRuns(g: Graphics, runs: readonly (readonly number[])[], o: DashOpts = {}): void {
  strokeRuns(g, runs, 0, 0, o);
}

/**
 * A dashed line `inset` px inside a sheet drawn by drawPaper / drawPaperFace with the same `sheet` options and the same (x, y):
 * it is the sheet's own cut edge moved inward, so it keeps one distance from it all the way round (a second rectangle with its
 * own wobble drifts across the edge, which on a bordered sheet shows as a line that is not parallel to it).
 */
export function drawDashedInset(g: Graphics, x: number, y: number, sheet: PaperOpts, inset: number, o: DashOpts = {}): void {
  const r = resolve(sheet);
  const dash = o.dash ?? 16;
  const gap = o.gap ?? 11;
  const key = `i|${Math.round(r.w * 10)}|${Math.round(r.h * 10)}|${Math.round(r.radius * 10)}|${r.seed}|${Math.round(r.amp * 100)}|${inset}|${dash}|${gap}`;
  const runs = cachedRuns(key, () => dashRuns(insetPolygon(cachedPaperPath(r.w, r.h, r.radius, r.seed, r.amp, 0).pts, inset), true, dash, gap));
  strokeRuns(g, runs, x, y, o);
}

/** A hand-drawn dashed line; it sags a pixel or so, like a ruler-less pen. */
export function drawDashedLine(g: Graphics, x0: number, y0: number, x1: number, y1: number, o: DashOpts = {}): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 1) return;
  const { dash, gap } = fitDash(len, o.dash ?? 16, o.gap ?? 11);
  const seed = o.seed ?? hash32(Math.round(len), 0xda6);
  const key = `l|${Math.round(len)}|${dash.toFixed(2)}|${gap.toFixed(2)}|${seed}`;
  const runs = cachedRuns(key, () => {
    const rnd = makeRng(seed);
    const n = Math.max(1, Math.ceil(len / 24));
    const pts: number[] = [];
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const d = i === 0 || i === n ? 0 : (rnd() - 0.5) * 1.6;
      pts.push((x1 - x0) * t + nx * d, (y1 - y0) * t + ny * d);
    }
    return dashRuns(pts, false, dash, gap);
  });
  strokeRuns(g, runs, x0, y0, o);
}

/* ----------------------------------------------------------- painted fills */

/** A brush-painted bar: flat colour, round left cap, an uneven leading edge. (x, y) is its top-left corner. */
export function drawPaintFill(g: Graphics, x: number, y: number, w: number, h: number, color: number, seed?: number): void {
  if (w <= 0) return;
  const pts = paintPath(Math.max(w, h), h, seed ?? hash32(Math.round(w), Math.round(h), 0xfa1), 1.1);
  g.poly(shifted(pts, x, y)).fill(color);
}

/* ---------------------------------------------------------- speech bubbles */

export interface BubbleOpts {
  fill?: number;
  /** Hand-drawn line colour. Default: ink. */
  line?: number;
  lineWidth?: number;
  radius?: number;
  seed?: number;
  tail?: BubbleTail;
  shadow?: boolean;
}

/**
 * Cream paper with a hand-drawn dark-brown outline and a small tail: the one place in the kit with a
 * drawn line. (x, y) is the top-left of the body; the tail reaches outside [y, y + h] on its side.
 */
export function drawSpeechBubble(g: Graphics, x: number, y: number, w: number, h: number, o: BubbleOpts = {}): void {
  const radius = o.radius ?? 24;
  const seed = o.seed ?? hash32(Math.round(w), Math.round(h), 0xb0b);
  const amp = wobbleAmp(w, h, 1);
  const base = cachedPaperPath(w, h, radius, seed, amp).pts;
  const outline = o.tail ? bubblePath(w, h, radius, seed, amp, o.tail) : base;
  if (o.shadow !== false) g.poly(shifted(outline, x, y + 5)).fill({ color: Color.shadow, alpha: 0.22 });
  const pts = shifted(outline, x, y);
  g.poly(pts).fill(o.fill ?? Color.paperLight);
  g.poly(pts).stroke({ width: o.lineWidth ?? 2.5, color: o.line ?? Color.ink, join: 'round', cap: 'round' });
}

/* ------------------------------------------------------------- paper label */

export interface PaperLabelOpts {
  text: string;
  /** Font size (default 30). */
  size?: number;
  /** A palette name, or a raw paper colour. Default 'kraft'. */
  paper?: ButtonStyleId | number;
  /** Text colour; default: the paper's own ink. */
  ink?: number;
  padX?: number;
  padY?: number;
  minWidth?: number;
  /** The label never grows past this; longer text shrinks, then is cut with an ellipsis. */
  maxWidth?: number;
  /** Which ends are torn: both short ends (default), the bottom edge, or none. */
  torn?: 'ends' | 'bottom' | 'none';
  /** Stick a strip of tape across the top-left corner. */
  tape?: TapeName | false;
  seed?: number;
}

/**
 * A torn paper label that sizes itself to its text: section headers, popup titles, state captions on
 * artwork. Origin = centre. setText() re-measures and redraws.
 */
export class PaperLabel extends Container {
  readonly uiBox: Box = { x: 0, y: 0, w: 0, h: 0 };
  private readonly opts: PaperLabelOpts;
  private readonly seed: number;
  private text = '';
  private art: Container | null = null;

  constructor(opts: PaperLabelOpts) {
    super();
    this.opts = { ...opts };
    this.seed = opts.seed ?? paperSeed();
    this.setText(opts.text);
  }

  /** Re-fit to a new width limit (a header that shares its row with buttons). */
  setMaxWidth(maxWidth: number): void {
    if (maxWidth === this.opts.maxWidth) return;
    this.opts.maxWidth = maxWidth;
    this.setText(this.text);
  }

  setText(text: string): void {
    this.text = text;
    this.art?.destroy({ children: true });
    const o = this.opts;
    const size = o.size ?? 30;
    const pal = typeof o.paper === 'number' ? null : ButtonPalettes[o.paper ?? 'kraft'];
    const fill = typeof o.paper === 'number' ? o.paper : (pal?.base ?? Color.kraft);
    const t = uiLabel(text, { size, color: o.ink ?? pal?.ink ?? Color.ink });
    const padX = o.padX ?? 26;
    const padY = o.padY ?? 12;
    const w0 = Math.max(o.minWidth ?? 0, Math.ceil(t.width) + padX * 2);
    const w = o.maxWidth ? Math.min(o.maxWidth, w0) : w0;
    if (w < w0) fitLabel(t, w - padX * 2, size);
    const h = Math.round(size * 1.15) + padY * 2;
    const mode = o.torn ?? 'ends';
    const art = new Container();
    const g = new Graphics();
    drawPaper(g, -w / 2, -h / 2, {
      w,
      h,
      radius: 12,
      fill,
      seed: this.seed,
      torn: mode === 'ends' ? ['left', 'right'] : mode === 'bottom' ? 'bottom' : undefined,
      grain: false,
    });
    art.addChild(g);
    if (o.tape) {
      const tape = tapeStrip({ name: o.tape, w: 54, h: 22, angle: -28, pattern: 'dots', seed: this.seed });
      tape.position.set(-w / 2 + 14, -h / 2 + 4);
      art.addChild(tape);
    }
    t.position.set(0, 1);
    art.addChild(t);
    this.addChild(art);
    this.art = art;
    this.uiBox.x = -w / 2;
    this.uiBox.y = -h / 2;
    this.uiBox.w = w;
    this.uiBox.h = h + 5;
  }
}
