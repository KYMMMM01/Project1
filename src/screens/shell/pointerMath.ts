/** Pure geometry of the home pointer (the guidebook's "try it"): the window round a target and which side the hand comes from. */

export interface PointRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Room a tab keeps between what it scrolls to and the page's edges: the raised middle tab of the bar reaches 58 px up into the page. */
export const POINT_MARGIN = 84;

/** How far the window stands off the target, and how close it may come to the screen edge. */
const GROW = 10;
const EDGE = 6;
/** Height the hand needs above a target to stand there without leaving the screen (the hand is about 80 px tall at its scale). */
export const HAND_ROOM = 120;

/** `target` grown by the window's margin and kept on screen, in whole pixels (so a target that did not move does not repaint). */
export function pointerRect(out: PointRect, target: PointRect, screenW: number, screenH: number): PointRect {
  const left = Math.max(EDGE, Math.round(target.x - GROW));
  const top = Math.max(EDGE, Math.round(target.y - GROW));
  const right = Math.min(screenW - EDGE, Math.round(target.x + target.w + GROW));
  const bottom = Math.min(screenH - EDGE, Math.round(target.y + target.h + GROW));
  out.x = left;
  out.y = top;
  out.w = Math.max(0, right - left);
  out.h = Math.max(0, bottom - top);
  return out;
}

/** The hand comes down from above the window when there is room for it between the window and `top` (the bottom edge of the bar above the page), otherwise up from below. */
export function handAbove(window: PointRect, top: number): boolean {
  return window.y - top >= HAND_ROOM;
}
