/**
 * The maths of the bard's notes (`jam.ts`), pure so that `tests/view.director.sp.jamFish.test.ts` can hold it to its numbers: the curve a note
 * flies, how the four notes fan out of the lute, and what a ring shows while its gauge climbs after a note.
 */

export interface Spot {
  x: number;
  y: number;
}

/**
 * The control point of one note's flight (a quadratic curve from the lute to the cat). The notes of one chord leave in a fan, side by side across
 * the line to the cat, and all of them rise before they come down: `lane` of `lanes` picks the side, the distance picks the height.
 */
export function noteControl(x0: number, y0: number, x1: number, y1: number, lane: number, lanes: number, out: Spot): Spot {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const px = len > 1e-6 ? -dy / len : 0;
  const py = len > 1e-6 ? dx / len : -1;
  const off = lane - (lanes - 1) / 2;
  const side = off * Math.min(34, len * 0.2);
  out.x = (x0 + x1) / 2 + px * side;
  out.y = (y0 + y1) / 2 + py * side - Math.min(72, 26 + len * 0.22);
  return out;
}

/** A point of the quadratic curve (`x0`, `y0`) to (`x1`, `y1`) bent toward (`cx`, `cy`), at `k` 0..1. */
export function curvePoint(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, k: number, out: Spot): Spot {
  const u = 1 - k;
  out.x = u * u * x0 + 2 * u * k * cx + k * k * x1;
  out.y = u * u * y0 + 2 * u * k * cy + k * k * y1;
  return out;
}

/**
 * What a ring shows while its gauge climbs after the note landed: from the value it was held at to the cat's own gauge, `k` 0..1 into the climb.
 * It eases out (a quick jump that settles) and never shows more than the cat's own gauge, so a cast that spent the gauge meanwhile wins.
 */
export function climbValue(from: number, to: number, k: number, actual: number): number {
  const kk = k <= 0 ? 0 : k >= 1 ? 1 : k;
  const eased = 1 - (1 - kk) * (1 - kk) * (1 - kk);
  return Math.min(actual, from + (to - from) * eased);
}

/** The pentatonic step of the n-th note to land in a chord: they climb, so four dings make a small run. */
export function dingStep(n: number): number {
  return n < 0 ? 0 : Math.min(n, 4);
}
