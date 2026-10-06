/**
 * Leaderboard pass-through. Pure: the adapter lookup is injected so it is unit-testable in node.
 * Platforms with a board (Toss game center, YouTube sendScore, the dev mock) forward the score; every
 * other platform ignores the call. It never throws and always settles.
 */
import type { PlatformAdapter } from './types';
import { settleWithin } from './util';

/** A score submission that has not answered after this long is abandoned (best effort). */
const SUBMIT_TIMEOUT_MS = 8000;

export type ScoreSubmitter = (boardId: string, score: number) => Promise<void>;

export function createScoreSubmitter(getAdapter: () => PlatformAdapter): ScoreSubmitter {
  return async (boardId, score) => {
    if (typeof boardId !== 'string' || boardId === '' || !Number.isFinite(score)) return;
    const a = getAdapter();
    const board = a.leaderboard;
    if (!a.capabilities.leaderboard || !board) return;
    // Platform boards take whole numbers.
    await settleWithin<void>(Promise.resolve().then(() => board.submit(boardId, Math.trunc(score))), SUBMIT_TIMEOUT_MS, undefined);
  };
}
