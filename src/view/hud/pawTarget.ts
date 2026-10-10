/**
 * Which cat, which pair and which cell the lessons' paw points at, as pure choices over the board. Each takes what it chose the last time
 * and keeps it for as long as it still fits, so a cat that arrives in an earlier cell, or a second pair that appears, does not pull the
 * paw across the board and back while the player is reading.
 */
import { mergeResultOf, unitRarityIndex, type UnitId } from '@/game';

type Board = ReadonlyArray<{ readonly id: UnitId } | null>;

/** The rank of the cats that awaken (the legendary, "king"). */
export const KING_RANK = 3;

function stillThere(board: Board, cell: number): boolean {
  return cell >= 0 && cell < board.length && board[cell] !== null;
}

/**
 * The weakest cat (the lowest rank; the first of them): the cheapest to molt or sell, and never the king while any other cat stands. `last` is
 * kept while it still holds a cat of that lowest rank.
 */
export function weakestCat(board: Board, last = -1): number {
  let best = -1;
  let low = Infinity;
  for (let c = 0; c < board.length; c++) {
    const u = board[c];
    if (!u) continue;
    const rank = unitRarityIndex(u.id);
    if (rank < low) {
      low = rank;
      best = c;
    }
  }
  const kept = last >= 0 ? board[last] : null;
  return kept && unitRarityIndex(kept.id) === low ? last : best;
}

/** The cat to tap when the lesson is only about the button that follows: the first one. */
export function firstCat(board: Board): number {
  for (let c = 0; c < board.length; c++) if (board[c]) return c;
  return -1;
}

/** The king that can awaken now (`ready` says which cells may): `last` is kept while it still can, else the first. */
export function kingCell(board: Board, ready: (cell: number) => boolean, last = -1): number {
  const isKing = (c: number): boolean => stillThere(board, c) && unitRarityIndex((board[c] as { id: UnitId }).id) === KING_RANK && ready(c);
  if (isKing(last)) return last;
  for (let c = 0; c < board.length; c++) if (isKing(c)) return c;
  return -1;
}

/** The two cells holding the same mergeable cat: the pair the paw has been working on while both still hold twins, else the first pair by cell. */
export function twinPair(board: Board, last: readonly [number, number] | null = null): [number, number] | null {
  const mergeable = (c: number): boolean => stillThere(board, c) && mergeResultOf((board[c] as { id: UnitId }).id) !== null;
  if (last && last[0] !== last[1] && mergeable(last[0]) && mergeable(last[1]) && board[last[0]]?.id === board[last[1]]?.id) return [last[0], last[1]];
  for (let a = 0; a < board.length; a++) {
    if (!mergeable(a)) continue;
    const id = (board[a] as { id: UnitId }).id;
    for (let b = a + 1; b < board.length; b++) if (board[b]?.id === id) return [a, b];
  }
  return null;
}

/** The cat the paw carries into a special cell: one that stands in the shade (`last` is kept while it still does). */
export function shadeCat(board: Board, lit: (cell: number) => boolean, last = -1): number {
  if (stillThere(board, last) && !lit(last)) return last;
  for (let c = 0; c < board.length; c++) if (board[c] && !lit(c)) return c;
  return -1;
}

/**
 * The special cell it lands on: an empty one first, otherwise one with another cat on it (they swap). `last` is kept while it is still a
 * special cell, not the cat's own, and in the same state (empty, or taken).
 */
export function sunLanding(board: Board, cells: readonly number[], from: number, last = -1): number {
  const free = (c: number): boolean => !board[c];
  if (last >= 0 && last !== from && cells.includes(last)) {
    // an empty cell stays the choice while it is empty; one with a cat on it, only while no other cell has come free
    if (free(last) || !cells.some((c) => c !== from && free(c))) return last;
  }
  let taken = -1;
  for (const c of cells) {
    if (c === from) continue;
    if (free(c)) return c;
    if (taken < 0) taken = c;
  }
  return taken;
}
