/** Pure motion of the cards on stage: out of the opening, the suspense wobble, the flip, the show and the flight down. Allocation-free. */
import { lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { backOut } from '@/ui';
import { FLIP_TURN } from './revealFlow';
import { PLATE } from './revealPlan';

/** Where a card is and how it is drawn in one frame. `s` is the plate scale, `flipX` the share of its width it shows while it turns. */
export interface CardPose {
  x: number;
  y: number;
  s: number;
  flipX: number;
  rot: number;
}

export function newCardPose(): CardPose {
  return { x: 0, y: 0, s: 1, flipX: 1, rot: 0 };
}

/** Plate scale of a beat of n cards on stage: one card is big, three or four share the width. */
export function stageScale(n: number): number {
  return n <= 1 ? 2.2 : n === 2 ? 1.85 : n === 3 ? 1.6 : 1.3;
}

/** Space between the cards of one beat on stage. */
export const STAGE_GAP = 12;

/** Centre x of card `j` of `n` on stage, the row centred on `cx`. */
export function stageX(n: number, j: number, cx: number): number {
  const w = PLATE.w * stageScale(n);
  return cx - ((n - 1) * (w + STAGE_GAP)) / 2 + j * (w + STAGE_GAP);
}

/** How wildly a face-down card wobbles by rank: a common hardly moves, a legendary can hardly be held down. */
const WOBBLE_AMP = [0.015, 0.07, 0.11, 0.15] as const;
const WOBBLE_HOP = [0, 4, 9, 16] as const;

const overshoot = backOut(1.5);
const popScale = backOut(1.9);
const flipBack = backOut(2.2);

/** Out of the opening to its place on stage: a shot up that overshoots a little and settles, growing as it comes. */
export function risePose(out: CardPose, k: number, fromX: number, fromY: number, toX: number, toY: number, toScale: number, side: number): CardPose {
  const u = Math.min(1, Math.max(0, k));
  out.x = lerp(fromX, toX, Ease.cubicOut(u));
  out.y = lerp(fromY, toY, overshoot(u));
  out.s = toScale * (0.3 + 0.7 * popScale(u));
  out.flipX = 1;
  out.rot = side * 0.5 * (1 - u);
  return out;
}

/** Face down on stage: wobbling harder and faster as the flip comes, with a little hop for the high ranks and a pulse on every tick. */
export function wobblePose(out: CardPose, age: number, dur: number, rank: number, toX: number, toY: number, toScale: number, tickAge: number): CardPose {
  const k = dur > 0 ? Math.min(1, age / dur) : 1;
  const amp = (WOBBLE_AMP[rank] ?? 0.15) * (0.35 + 0.65 * k);
  // The wobble speeds up: its phase grows faster than the clock.
  const ph = Math.PI * 2 * (3.5 * age + 5 * age * k);
  out.x = toX;
  out.y = toY - (WOBBLE_HOP[rank] ?? 16) * k * Math.abs(Math.sin(ph * 0.5));
  out.rot = Math.sin(ph) * amp;
  out.s = toScale * (1 + 0.012 * Math.sin(age * 9) + 0.07 * Math.exp(-14 * tickAge) * (rank > 0 ? 1 : 0));
  out.flipX = 1;
  return out;
}

/** The turn: edge-on at `FLIP_TURN`, then back out wide with an overshoot; the card lifts a little while it turns. */
export function flipPose(out: CardPose, k: number, toX: number, toY: number, toScale: number): CardPose {
  const u = Math.min(1, Math.max(0, k));
  out.flipX = u < FLIP_TURN ? 1 - Ease.quadIn(u / FLIP_TURN) : flipBack((u - FLIP_TURN) / (1 - FLIP_TURN));
  out.x = toX;
  out.y = toY - 22 * Math.sin(Math.PI * u);
  out.s = toScale * (1 + 0.1 * Math.sin(Math.PI * u));
  out.rot = 0.07 * Math.sin(Math.PI * 2 * u) * (1 - u);
  return out;
}

/** The silhouette waiting on stage: it gathers itself (a slow swell) and shivers harder as the peel comes. */
export function shadePose(out: CardPose, age: number, dur: number, toX: number, toY: number, toScale: number): CardPose {
  const k = dur > 0 ? Math.min(1, age / dur) : 1;
  out.x = toX + Math.sin(age * 58) * 2.2 * k;
  out.y = toY;
  out.s = toScale * (1 + 0.07 * Math.sin(Math.min(1, k * 1.4) * (Math.PI / 2)) + 0.01 * Math.sin(age * 7));
  out.flipX = 1;
  out.rot = Math.sin(age * 37) * 0.025 * k;
  return out;
}

/** Face up on stage: a breath of life; the best card of an epic or legendary chest swells and settles. */
export function showPose(out: CardPose, age: number, dur: number, swell: boolean, toX: number, toY: number, toScale: number): CardPose {
  const k = dur > 0 ? Math.min(1, age / dur) : 1;
  const pulse = swell ? 0.16 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - 0.35 * k) : 0;
  out.x = toX;
  out.y = toY;
  out.s = toScale * (1 + pulse + 0.01 * Math.sin(age * 7));
  out.flipX = 1;
  out.rot = 0;
  return out;
}

/** From the stage to its place in the summary: an arc that bulges to the side, shrinking to the plate's size there. */
export function flyPose(out: CardPose, k: number, fromX: number, fromY: number, fromScale: number, toX: number, toY: number, toScale: number, side: number): CardPose {
  const e = Ease.cubicInOut(Math.min(1, Math.max(0, k)));
  const bulge = Math.sin(Math.PI * e);
  out.x = lerp(fromX, toX, e) + side * 44 * bulge;
  out.y = lerp(fromY, toY, e) - 26 * bulge;
  out.s = lerp(fromScale, toScale, e);
  out.flipX = 1;
  out.rot = side * 0.16 * bulge;
  return out;
}
