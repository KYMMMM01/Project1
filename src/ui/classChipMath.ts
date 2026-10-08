/**
 * Where every part of the class chip sits, as numbers: the chip draws from them and the tests check them. Origin = the chip's centre.
 *
 * The rule: all parts lie in the content box, the chip's cut edge moved in by `CLASS_CHIP_PAD` on all four sides (its corners rounded to
 * match, so a part in a corner keeps the same distance from the edge). The pad holds the border (up to 5 px, drawn inside the cut), the
 * tier-3 dashed ring (`CLASS_CHIP_RING_INSET`) and the paper's hand-cut wobble (up to ~1.6 px), with a clear gap left over for each.
 */
export const CLASS_CHIP_W = 168;
export const CLASS_CHIP_H = 84;
export const CLASS_CHIP_RADIUS = 26;
export const CLASS_CHIP_PAD = 13;
/** The widest border a tier draws (inside the cut edge). */
export const CLASS_CHIP_BORDER_MAX = 5;
/** The tier-3 dashed ring runs this far inside the cut edge (centre line): past the 5 px border, short of the content box. */
export const CLASS_CHIP_RING_INSET = 8;
/** The selected chip's dashed line runs this far outside the cut edge. */
export const CLASS_CHIP_SELECT_OUTSET = 7;

/** The class glyph's round well. `shadow` is how far its flat shadow reaches below the well. */
export const CHIP_DISC = { cx: -45, cy: 0, r: 26, shadow: 3, icon: 38 } as const;

/** The five rarity pips: `x` is the centre of the row, `y` its centre line. The last (the star) is the rightmost. */
export const CHIP_PIPS = { x: 26, y: -21.2, size: 11, gap: 5 } as const;
/** Outer reach of a pip from its centre, stroke included: a dot's radius and the star's tip. */
const PIP_REACH = CHIP_PIPS.size / 2 + 1;
const STAR_REACH = (CHIP_PIPS.size / 2) * 1.22 + 1;

/** The three rising synergy bars, centred on `x`, standing on `base`; a lit bar's stroke is drawn outside its rectangle (`stroke` px). */
export const CHIP_BARS = { x: 26, base: 26.5, w: 15, gap: 6, heights: [13, 21, 29] as readonly number[], stroke: 2.5 } as const;

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface ChipPart {
  readonly name: string;
  /** Points on the part's outline (enough of them that a part inside the content box at all of them is inside it). */
  readonly pts: readonly Pt[];
}

export interface TapeSpot {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Degrees. */
  angle: number;
}

/** Centre x of rarity pip `i`. */
export function pipX(i: number): number {
  return CHIP_PIPS.x + (i - 2) * (CHIP_PIPS.size + CHIP_PIPS.gap);
}

/** Left edge of bar `i`. */
export function barX(i: number): number {
  const n = CHIP_BARS.heights.length;
  return CHIP_BARS.x - (CHIP_BARS.w * n + CHIP_BARS.gap * (n - 1)) / 2 + i * (CHIP_BARS.w + CHIP_BARS.gap);
}

/** Whether (x, y) lies in the content box (a rounded rectangle: the cut edge moved in by the pad). */
export function inContent(x: number, y: number): boolean {
  const hw = CLASS_CHIP_W / 2 - CLASS_CHIP_PAD;
  const hh = CLASS_CHIP_H / 2 - CLASS_CHIP_PAD;
  const r = CLASS_CHIP_RADIUS - CLASS_CHIP_PAD;
  const dx = Math.abs(x) - (hw - r);
  const dy = Math.abs(y) - (hh - r);
  if (dx <= 0 || dy <= 0) return Math.abs(x) <= hw + 1e-6 && Math.abs(y) <= hh + 1e-6;
  return dx * dx + dy * dy <= r * r + 1e-6;
}

function circle(name: string, cx: number, cy: number, r: number, drop = 0): ChipPart {
  const pts: Pt[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r + (Math.sin(a) > 0 ? drop : 0) });
  }
  return { name, pts };
}

/** Every drawn part, as outline points: the well with its shadow, each pip (the star by its ten vertices) and each bar. */
export function classChipParts(): ChipPart[] {
  const parts: ChipPart[] = [circle('disc', CHIP_DISC.cx, CHIP_DISC.cy, CHIP_DISC.r, CHIP_DISC.shadow)];
  const lastPip = 4;
  for (let i = 0; i < lastPip; i++) parts.push(circle(`pip${i}`, pipX(i), CHIP_PIPS.y, PIP_REACH));
  const star: Pt[] = [];
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const r = k % 2 === 0 ? STAR_REACH : STAR_REACH * 0.5;
    star.push({ x: pipX(lastPip) + Math.cos(a) * r, y: CHIP_PIPS.y + Math.sin(a) * r });
  }
  parts.push({ name: 'star', pts: star });
  const s = CHIP_BARS.stroke;
  CHIP_BARS.heights.forEach((h, i) => {
    const x0 = barX(i) - s;
    const x1 = barX(i) + CHIP_BARS.w + s;
    const y0 = CHIP_BARS.base - h - s;
    const y1 = CHIP_BARS.base + s;
    parts.push({ name: `bar${i}`, pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
  });
  return parts;
}

/**
 * The washi tape holds the chip's top-left corner down: it lies across the corner (along its tangent, so it covers the border and the
 * paper's padding and none of the content). Variant 0 and 1 differ by a few degrees so neighbouring chips do not look stamped.
 */
export function classChipTape(variant: number): TapeSpot {
  return { x: -73, y: -33, w: 38, h: 18, angle: variant % 2 === 0 ? -40 : -48 };
}

/** The four corners of a tape spot, rotated about its centre. */
export function tapeCorners(t: TapeSpot): Pt[] {
  const a = (t.angle * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sy]) => {
    const lx = (sx as number) * (t.w / 2);
    const ly = (sy as number) * (t.h / 2);
    return { x: t.x + lx * c - ly * s, y: t.y + lx * s + ly * c };
  });
}
