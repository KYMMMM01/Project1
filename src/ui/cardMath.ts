/**
 * The geometry of a unit card, as pure numbers (no Pixi), so every layer can be tested against the others. Origin = centre of the
 * card's box. One outline rules them all: the cut edge of the cream paper. The dashed line, the rarity mat and the portrait window
 * are offsets of that outline (insetPolygon), so they run parallel to it at a fixed distance however it wobbles, and the photo
 * corners are cut from the mat's own outline, so none can stick out past it. Things that are straight (the name, the bar, the
 * stickers) are placed from the nominal edge, the cut edge's mean line, which the wobble never leaves by more than `amp`.
 */
import { cachedPaperPath, cornerCap, cutBelow, dashRuns, hash32, insetPolygon, wobbleAmp } from './paperMath';

export type CardSizeId = 'small' | 'medium' | 'large';

export interface CardBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardSpec {
  w: number;
  h: number;
  /** Corner radius of the cream paper's cut edge. */
  radius: number;
  /** Cream border: from the cut edge to the rarity mat. */
  border: number;
  /** From the cut edge to the dashed line (rare and up). */
  dash: number;
  /** From the mat to the portrait window, on all four sides. */
  frame: number;
  /** Height of the cream strip under the mat, less 3 px (the name and the bar live there). */
  plate: number;
  /** Gap between a sticker and the window edge it sits against. */
  pad: number;
  /** Straight stretch of a photo corner past the end of the mat's own corner arc. */
  leg: number;
  /** Name, level badge, progress bar and tier pip sizes. */
  name: number;
  level: number;
  bar: number;
  pip: number;
  /** How far a sticker reaches past the cut edge sideways / above it. */
  over: number;
  crest: number;
  /** Washi tape height (rarity legendary and up). */
  tape: number;
  /** Photo corners on the top corners too (a card), or on the bottom ones only (the compact plate keeps its top corners for the level badge and the ready sticker). */
  topCaps: boolean;
  /** The dashed line: dash length, gap and stroke width. */
  dashLen: number;
  dashGap: number;
  dashWidth: number;
}

export const CARD_SPECS: Record<CardSizeId, CardSpec> = {
  small: { w: 150, h: 200, radius: 20, border: 8, dash: 4, frame: 4, plate: 80, pad: 6, leg: 10, name: 24, level: 24, bar: 30, pip: 11, over: 8, crest: 14, tape: 18, topCaps: true, dashLen: 7, dashGap: 5, dashWidth: 2 },
  medium: { w: 220, h: 292, radius: 26, border: 10, dash: 5, frame: 5, plate: 92, pad: 8, leg: 14, name: 28, level: 24, bar: 32, pip: 13, over: 10, crest: 18, tape: 22, topCaps: true, dashLen: 9, dashGap: 7, dashWidth: 2 },
  large: { w: 320, h: 424, radius: 34, border: 14, dash: 7, frame: 6, plate: 116, pad: 10, leg: 20, name: 38, level: 30, bar: 34, pip: 17, over: 14, crest: 26, tape: 32, topCaps: true, dashLen: 12, dashGap: 9, dashWidth: 2.5 },
};

/** The cut wobbles at 55 % of the kit's usual amplitude: still hand-cut, and the layers inside never drift more than a pixel off true. */
export const CARD_WOBBLE = 0.55;

export interface CardGeometry {
  spec: CardSpec;
  seed: number;
  /** Wobble amplitude of the cut edge in px; the paper's mean edge lies `amp + 0.5` inside the box. */
  amp: number;
  /** The cream paper's cut edge, centred on the origin, clockwise. */
  outer: number[];
  /** Mean line of the cut edge (the box inset by amp + 0.5). */
  nominal: CardBox;
  dash: number[];
  /** The dashed line cut into strokes (dashRuns of `dash`). */
  dashRuns: number[][];
  mat: number[];
  matRadius: number;
  /** y of the mat's straight bottom edge. */
  matBottom: number;
  window: number[];
  /** The window on the nominal edge: where portraits and stickers are placed. */
  windowRect: CardBox;
  /** Photo corners, one polygon each: top-left, top-right, bottom-right, bottom-left. */
  caps: number[][];
}

function moved(pts: readonly number[], dx: number, dy: number): number[] {
  const out = new Array<number>(pts.length);
  for (let i = 0; i < pts.length; i += 2) {
    out[i] = (pts[i] as number) + dx;
    out[i + 1] = (pts[i + 1] as number) + dy;
  }
  return out;
}

function bounds(pts: readonly number[]): { l: number; t: number; r: number; b: number } {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    l = Math.min(l, pts[i] as number);
    r = Math.max(r, pts[i] as number);
    t = Math.min(t, pts[i + 1] as number);
    b = Math.max(b, pts[i + 1] as number);
  }
  return { l, t, r, b };
}

/** What the layered frame needs: the cut, three insets, where the mat ends and how its dashes and photo corners are cut. */
export interface FrameSpec {
  w: number;
  h: number;
  radius: number;
  border: number;
  dash: number;
  frame: number;
  /** y of the mat's straight bottom edge, relative to the centre. */
  matBottom: number;
  leg: number;
  dashLen: number;
  dashGap: number;
}

const frames = new Map<string, CardGeometry>();

/**
 * The layers of a photo frame from one cut outline: the dashed line, the mat and the window are offsets of the cut edge and the
 * photo corners are cut from the mat's outline. Every frame of one spec is cut from the same die, so it is made once per spec.
 */
export function frameGeometry(f: FrameSpec, spec: CardSpec): CardGeometry {
  const key = [f.w, f.h, f.radius, f.border, f.dash, f.frame, f.matBottom, f.leg, f.dashLen, f.dashGap].join('|');
  const hit = frames.get(key);
  if (hit) return hit;
  const seed = hash32(f.w, f.h, 0xca7d);
  const amp = wobbleAmp(f.w, f.h, CARD_WOBBLE);
  const pe = amp + 0.5;
  const outer = moved(cachedPaperPath(f.w, f.h, f.radius, seed, amp).pts, -f.w / 2, -f.h / 2);
  const matRadius = f.radius - f.border;
  const mat = cutBelow(insetPolygon(outer, f.border), f.matBottom, matRadius);
  const window = insetPolygon(mat, f.frame);
  const nominal: CardBox = { x: -f.w / 2 + pe, y: -f.h / 2 + pe, w: f.w - pe * 2, h: f.h - pe * 2 };
  const wx = nominal.x + f.border + f.frame;
  const wy = nominal.y + f.border + f.frame;
  const windowRect: CardBox = { x: wx, y: wy, w: nominal.w - 2 * (f.border + f.frame), h: f.matBottom - f.frame - wy };
  const mb = bounds(mat);
  const reach = (Math.PI / 4) * matRadius + f.leg;
  const caps = [
    cornerCap(mat, mb.l, mb.t, reach),
    cornerCap(mat, mb.r, mb.t, reach),
    cornerCap(mat, mb.r, mb.b, reach),
    cornerCap(mat, mb.l, mb.b, reach),
  ];
  const dash = insetPolygon(outer, f.dash);
  const geo: CardGeometry = { spec, seed, amp, outer, nominal, dash, dashRuns: dashRuns(dash, true, f.dashLen, f.dashGap), mat, matRadius, matBottom: f.matBottom, window, windowRect, caps };
  frames.set(key, geo);
  return geo;
}

/** Every card of one size is cut from the same die. */
export function cardGeometry(size: CardSizeId): CardGeometry {
  const s = CARD_SPECS[size];
  return frameGeometry({ w: s.w, h: s.h, radius: s.radius, border: s.border, dash: s.dash, frame: s.frame, matBottom: s.h / 2 - s.plate - 3, leg: s.leg, dashLen: s.dashLen, dashGap: s.dashGap }, s);
}

/**
 * The compact frame of the cats line and the chest reveal: `matH` is the height of the mat as drawn from its top edge, so the
 * window is `matH - 2 * frame` tall. Smaller insets than a card's, the same construction.
 */
export function plateGeometry(w: number, h: number, matH: number): CardGeometry {
  const border = 6;
  const pe = wobbleAmp(w, h, CARD_WOBBLE) + 0.5;
  const base = CARD_SPECS.small;
  const spec: CardSpec = { ...base, w, h, radius: 18, border, dash: 3, frame: 5, pad: 2, leg: 8, tape: Math.min(20, Math.max(16, Math.round(w * 0.14))), topCaps: false, dashLen: 8, dashGap: 6, dashWidth: 2 };
  return frameGeometry({ w, h, radius: 18, border, dash: 3, frame: 5, matBottom: -h / 2 + pe + border + matH, leg: 8, dashLen: 8, dashGap: 6 }, spec);
}

/* --------------------------------------------------------------- placed parts */

/** The bar in the plate: as wide as the plate is, with the same inset from the cut edge on the sides and below. */
export function barBox(spec: CardSpec, geo: CardGeometry): CardBox {
  const inset = spec.border + 4;
  const w = geo.nominal.w - 2 * inset;
  const bottom = geo.nominal.y + geo.nominal.h - inset;
  return { x: -w / 2, y: bottom - spec.bar, w, h: spec.bar };
}

/** Centre line of the name: the middle of what the plate has left, between the mat and the bar (or the content inset when there is no bar). */
export function nameCentre(spec: CardSpec, geo: CardGeometry, hasBar: boolean): number {
  const floor = hasBar ? barBox(spec, geo).y : geo.nominal.y + geo.nominal.h - (spec.border + 4);
  return (geo.matBottom + floor) / 2;
}

/** The level badge: its top edge on the window's pad, its left edge clear of the photo corner beside it. */
export function levelBadgeBox(spec: CardSpec, geo: CardGeometry, w: number, h: number): CardBox {
  const cap = geo.caps[0] as number[];
  let right = -Infinity;
  for (let i = 0; i < cap.length; i += 2) right = Math.max(right, cap[i] as number);
  return { x: right + spec.pad, y: geo.windowRect.y + spec.pad, w, h };
}

/**
 * The compact plate's level badge: a round disc of diameter `d` on the plate's upper-left corner, its centre `d / 5` in from the box corner on both
 * axes. It hangs off the corner (the window's middle, where the cat's head is, stays free) and its right edge stops short of the tape's left end
 * (the tape is centred and 0.42 of the plate wide) and of the star on it.
 */
export function plateBadgeBox(geo: CardGeometry, d: number): CardBox {
  const { w, h } = geo.spec;
  const inset = d / 5;
  return { x: -w / 2 + inset - d / 2, y: -h / 2 + inset - d / 2, w: d, h: d };
}

/** The tier pips' backing pill: centred, resting `pad` above the window's bottom edge. */
export function pipsPillBox(spec: CardSpec, geo: CardGeometry, w: number): CardBox {
  const h = spec.pip * 1.9;
  const wr = geo.windowRect;
  return { x: -w / 2, y: wr.y + wr.h - spec.pad - h, w, h };
}

/** Washi tape: centred on the top edge, tall enough that its tilted lower end still clears the window. */
export function tapeBox(spec: CardSpec): CardBox {
  const w = spec.w * 0.42;
  return { x: -w / 2, y: -spec.h / 2 + 1 - spec.tape / 2, w, h: spec.tape };
}

/** The mythic star sticker sits on the middle of the tape, a little taller than it. */
export function starBox(spec: CardSpec): CardBox {
  const t = tapeBox(spec);
  const size = Math.round(spec.tape * 1.25);
  return { x: -size / 2, y: t.y + t.h / 2 - size / 2, w: size, h: size };
}

/** A dashed ring `gap` px outside the cut edge, parallel to it (the selected-frame marker), cut into strokes once per geometry. */
export function ringRuns(geo: CardGeometry, gap: number, dash: number, space: number): number[][] {
  return dashRuns(insetPolygon(geo.outer, -gap), true, dash, space);
}
