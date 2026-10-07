/** Pure helpers of the tutorial run: when the free-play nudge points at the summon button, and which two cats make a pair. */

/** Seconds of unspent fish before the free-play nudge points at the summon button, how long it stays, and how often it may come back. */
export const NUDGE_AFTER = 5;
export const NUDGE_FOR = 5;
export const NUDGE_MAX = 3;
/** Until the board holds this many cats the nudge keeps coming back: a player who only did the scripted steps loses on wave 4 with fish unspent. */
export const NUDGE_CATS = 6;
/** In the prep before the first summon (a skipped tutorial waits there for the button) the nudge comes this soon. */
export const FIRST_SUMMON_AFTER = 1.5;

/** True when the nudge is due: the fish have sat unspent long enough, and it either still has a try left or the board is still thin. */
export function nudgeDue(idle: number, nudges: number, cats: number): boolean {
  if (idle < NUDGE_AFTER) return false;
  return cats < NUDGE_CATS || nudges < NUDGE_MAX;
}

/** The two cells holding the same unit, preferring the pair that sits closest together; null when there is none. */
export function findMergePair(board: ReadonlyArray<string | null>): [number, number] | null {
  let best: [number, number] | null = null;
  let bestGap = Infinity;
  for (let a = 0; a < board.length; a++) {
    const ua = board[a];
    if (!ua) continue;
    for (let b = a + 1; b < board.length; b++) {
      if (board[b] !== ua) continue;
      const gap = Math.abs((a % 5) - (b % 5)) + Math.abs(Math.floor(a / 5) - Math.floor(b / 5));
      if (gap < bestGap) {
        bestGap = gap;
        best = [a, b];
      }
    }
  }
  return best;
}
