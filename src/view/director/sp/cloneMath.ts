/**
 * The numbers of the ninja's clones' picture (docs/design_skills_v2.md 3.4), with no renderer in them so a test can hold them: how faint a
 * clone is after each throw, which side of its ninja a stacked clone peeks out on, the arc of its hop, the stumble of the clumsy one, the
 * path of a falling leaf. The scene (`clones.ts`) puts them on sprites.
 *
 * Times are [battle seconds, real floor] pairs (`span.ts`): a picture lasts until both are over, so it keeps its shape under a popup and is
 * still readable at 3x.
 */
import { clamp, clamp01 } from '@/core/math';
import { Ease } from '@/core/tween';

/** What of the clones' data row the picture needs (`SP_ROWS.clones`): its own, so a test can hand any numbers. */
export interface CloneLook {
  stackOffset: { x: number; y: number; scale: number; alpha: number; standingAlpha: number };
  figureCap: number;
  throws: number;
  arrive: number;
}

/** The leap to the seat, the hop back to the ninja's tile (a cat took the seat), the "pop" at the end, a clumsy landing, a squash on landing. */
export const HOP: readonly [number, number] = [0.3, 0.14];
export const STEP: readonly [number, number] = [0.2, 0.12];
export const OUT: readonly [number, number] = [0.2, 0.12];
export const WOBBLE: readonly [number, number] = [0.6, 0.38];
export const LAND: readonly [number, number] = [0.2, 0.12];
/** Under reduced motion: the clone only fades in and out in place, in this much time (design: "0.15 s"). */
export const FADE: readonly [number, number] = [0.15, 0.15];
/** The leaf the ninja wears for a moment at the cast, and the leaf a clone leaves behind when it goes. */
export const HEAD_LEAF: readonly [number, number] = [0.6, 0.4];
export const LEAF_FALL: readonly [number, number] = [0.6, 0.45];

/** A clone gets this much fainter with every throw: 55 -> 47 -> 39 -> 31 % for a standing one (design 3.4). */
export const FADE_STEP = 0.08;
/** However many throws it has made, a clone stays at least this visible (a stacked one starts lower, and must not vanish before its last throw). */
export const ALPHA_FLOOR = 0.2;

/** The opacity of a clone that has `left` of `throws` throws left: the row's standing / stacked start, a step lower for every throw made. */
export function cloneAlpha(left: number, throws: number, stacked: boolean, look: CloneLook): number {
  const made = clamp(throws - left, 0, Math.max(0, throws));
  const start = stacked ? look.stackOffset.alpha : look.stackOffset.standingAlpha;
  return Math.max(Math.min(ALPHA_FLOOR, start), start - FADE_STEP * made);
}

/** The side (-1 left, 1 right) a stacked clone peeks out on: its own number's side, unless another stacked clone of the same ninja has it. */
export function stackSide(index: number, taken: ReadonlyArray<number>): -1 | 1 {
  const want = index % 2 === 0 ? -1 : 1;
  return taken.includes(want) ? (want === -1 ? 1 : -1) : want;
}

/**
 * How much farther from its ninja the picture puts a stacked clone than the row's offset says, and how far it leans outward (radians).
 * Looked at on the real screen (a full board of 25, 450 px wide, a cell is 54 x 48 px): at the row's own +-16 design px the two pale bodies hide
 * behind the ninja and show a sliver of scarf and tail, which nobody reads as two clones. At 1.9x and a lean of 0.16 each head is out beside
 * the ninja's and the body stays inside the cell (30 + half a body is about the cell's half width, 54). One constant each, the row stays the design's.
 */
export const STACK_SPREAD = 2.4;
export const STACK_LEAN = 0.22;
/**
 * A stacked clone is drawn this many times as opaque as its row says (the row's 45% is the design's; capped at 1): the pair is the one case with no empty tile
 * to stand on, and on a full, busy board two pale bodies at 45% beside the ninja were a sliver (the player-eye review of step 2). Only the picture's own opacity;
 * `cloneAlpha` stays what the row says.
 */
export const STACK_ALPHA_BOOST = 1.8;

/**
 * The painted PAIR (two clones shoulder to shoulder, one picture) that stands behind a ninja whose two clones are both stacked: how big it is drawn next
 * to a single clone (the picture's figures are a little smaller than a lone clone's, and each has to be seen round the ninja's body), and how far up
 * its feet stand (design px; up is negative: a row further back on the rug, so the heads show over the ninja's shoulders). Found on the real screen.
 */
export const PAIR_SCALE = 1.1;
export const PAIR_RAISE = 40;

/** The feet of the pair: the ninja's feet (and the row's own small lift), straight behind it and raised by `PAIR_RAISE`. */
export function pairFeet(ninjaX: number, ninjaY: number, look: CloneLook, out: { x: number; y: number }): void {
  out.x = ninjaX;
  out.y = ninjaY + look.stackOffset.y - PAIR_RAISE;
}

/** Where a stacked clone's feet are from its ninja's feet: the row's offset (design px, up is negative) times the spread, to the left or the right. */
export function stackOffset(side: -1 | 1, look: CloneLook): { dx: number; dy: number } {
  return { dx: side * look.stackOffset.x * STACK_SPREAD, dy: look.stackOffset.y };
}

/** The feet of a stacked clone: its ninja's feet and `stackOffset`. */
export function stackFeet(ninjaX: number, ninjaY: number, side: -1 | 1, look: CloneLook, out: { x: number; y: number }): void {
  out.x = ninjaX + side * look.stackOffset.x * STACK_SPREAD;
  out.y = ninjaY + look.stackOffset.y;
}

/** The height (design px) of the hop over `distance` px: a neighbour is a hop, a tile across the board a high leap. */
export function hopHeight(distance: number): number {
  return clamp(30 + distance * 0.1, 30, 64);
}

/** Where a hop is at `k` (0..1): the straight line from (x0, y0) to (x1, y1) and an arc of `height` over it (a slide for a height of 0). `out.y` includes the arc; `out.base` does not (what the depth order is taken from). */
export function hopAt(k: number, x0: number, y0: number, x1: number, y1: number, height: number, out: { x: number; y: number; base: number }): void {
  const e = Ease.cubicOut(clamp01(k));
  out.x = x0 + (x1 - x0) * e;
  out.base = y0 + (y1 - y0) * e;
  out.y = out.base - height * Math.sin(Math.PI * clamp01(k));
}

/** The stumble of the clumsy clone `t` seconds after it lands: a lean that rings out (radians; the caller flips it for the way the clone faces). */
export function wobbleRot(t: number): number {
  if (t <= 0) return 0;
  return 0.34 * Math.exp(-5.2 * t) * Math.sin(17 * t);
}

/** The squash of a landing at `t` seconds: [x, y] scales, back to 1 over `LAND[0]`. */
export function landSquash(t: number, out: { sx: number; sy: number }): void {
  const q = clamp01(1 - t / LAND[0]);
  out.sx = 1 + 0.1 * q;
  out.sy = 1 - 0.16 * q;
}

/** A leaf falling from (0, 0) at `k` (0..1): it sways, turns and sinks 40 px, and fades over the last stretch. `side` is the way it first drifts. */
export function leafFall(k: number, side: -1 | 1, out: { x: number; y: number; rot: number; alpha: number }): void {
  const q = clamp01(k);
  const sway = Math.sin(q * Math.PI * 2.5);
  out.x = side * 11 * sway;
  out.y = 40 * Ease.quadIn(q) * 0.6 + 40 * q * 0.4;
  out.rot = side * 0.8 * Math.sin(q * Math.PI * 2.5 + 0.9);
  out.alpha = q < 0.6 ? 1 : (1 - q) / 0.4;
}

/**
 * The leaf the ninja puts on its head at the cast: it drops in from above with a back-out, stays, and in the last third slips off the side and
 * fades (`k` 0..1; the offsets are from the spot on the head).
 */
export function headLeaf(k: number, out: { x: number; y: number; scale: number; rot: number; alpha: number }): void {
  const q = clamp01(k);
  const drop = clamp01(q / 0.18);
  const off = clamp01((q - 0.66) / 0.34);
  out.scale = 0.25 + 0.75 * Ease.backOut(drop);
  out.y = -22 * (1 - Ease.cubicOut(drop)) + 12 * off * off;
  out.x = 16 * off;
  out.rot = -0.3 * (1 - drop) + 0.16 * Math.sin(q * 14) * (1 - off) + 1.1 * off;
  out.alpha = q < 0.72 ? 1 : (1 - q) / 0.28;
}

/** Whether a clone that starts while `fullLive` clones are already drawn as full bodies is only an outline: the row's figure cap is full. */
export function isLite(fullLive: number, look: CloneLook): boolean {
  return fullLive >= Math.max(0, look.figureCap);
}
