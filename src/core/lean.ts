/**
 * A lighter game for a device that keeps losing its page.
 *
 * Whatever the game weighs, some phone will have less to give (an old one, one with many apps open, an app's own browser): the page is closed under the player, the
 * game starts again, and the same weight closes it again. The trail the game leaves (`crumbs.ts`) says when that has happened, and after two such ends within a day the
 * next start is lean: it draws at a lower density (nearly half less memory for the drawing buffer, the pictures baked from it and every line of text), leaves the whole
 * sound catalogue unbaked until a sound is asked for, and does not put the pictures of kinds that may never come on the graphics card ahead of time. It looks a
 * little softer and may hitch a little more; it does not change a rule or a number, and a phone that never loses its page never sees it.
 *
 * `?lean=1` and `?lean=0` force it on and off (to look at it, or to rule it out).
 */

/** Ends of the page, within `LEAN_WINDOW_MS`, that make the next start lean. */
export const LEAN_AFTER_ENDS = 2;
export const LEAN_WINDOW_MS = 24 * 3600 * 1000;
/** The densest the game draws (device pixels per css pixel) in each mode. */
export const NORMAL_RESOLUTION = 2;
export const LEAN_RESOLUTION = 1.5;

export interface LeanVerdict {
  lean: boolean;
  /** Why, for the diagnostics page. */
  reason: string;
}

/** The decision from what is known at start: how many times the page ended under the player lately, and the `lean` parameter of the address. */
export function decideLean(recentEnds: number, param: string | null): LeanVerdict {
  if (param === '1') return { lean: true, reason: 'forced on by ?lean=1' };
  if (param === '0') return { lean: false, reason: 'forced off by ?lean=0' };
  if (recentEnds >= LEAN_AFTER_ENDS) return { lean: true, reason: `${recentEnds} ends under the player in the last 24 hours` };
  return { lean: false, reason: recentEnds > 0 ? `${recentEnds} end in the last 24 hours (lean from ${LEAN_AFTER_ENDS})` : 'no ends on record' };
}

let verdict: LeanVerdict = { lean: false, reason: 'not decided' };

/** Decide once, at boot (after the trail has been read). */
export function startLean(recentEnds: number, search: string): LeanVerdict {
  verdict = decideLean(recentEnds, new URLSearchParams(search).get('lean'));
  return verdict;
}

/** Whether this page is the lean one. */
export function leanMode(): boolean {
  return verdict.lean;
}

export function leanVerdict(): LeanVerdict {
  return verdict;
}

/** The densest the stage draws in the present mode. */
export function maxResolution(): number {
  return verdict.lean ? LEAN_RESOLUTION : NORMAL_RESOLUTION;
}
