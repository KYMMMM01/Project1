import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createScoreSubmitter } from '@/platform/leaderboard';
import type { PlatformAdapter, PlatformLeaderboard } from '@/platform/types';
import { fakeAdapter } from './platformHelpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** An adapter that does (or does not) advertise a leaderboard, and the board object it would use. */
function adapterWith(board: PlatformLeaderboard | undefined, leaderboard = true): PlatformAdapter {
  const base = fakeAdapter({ leaderboard }).adapter;
  return { ...base, leaderboard: board };
}

function recordingBoard() {
  const sent: Array<[string, number]> = [];
  const board: PlatformLeaderboard = {
    submit: async (id, score) => {
      sent.push([id, score]);
    },
  };
  return { sent, board };
}

describe('submitScore pass-through', () => {
  it('forwards the board id and a whole-number score to the platform', async () => {
    const { sent, board } = recordingBoard();
    const submit = createScoreSubmitter(() => adapterWith(board));
    await submit('main', 1234);
    await submit('weekly', 99.9);
    expect(sent).toEqual([
      ['main', 1234],
      ['weekly', 99],
    ]);
  });

  it('is a no-op where the platform has no leaderboard (capability off or no object)', async () => {
    const { sent, board } = recordingBoard();
    await createScoreSubmitter(() => adapterWith(board, false))('main', 5);
    expect(sent).toEqual([]);
    await expect(createScoreSubmitter(() => adapterWith(undefined))('main', 5)).resolves.toBeUndefined();
  });

  it('ignores junk instead of sending it', async () => {
    const { sent, board } = recordingBoard();
    const submit = createScoreSubmitter(() => adapterWith(board));
    await submit('', 5);
    await submit('main', Number.NaN);
    await submit('main', Number.POSITIVE_INFINITY);
    expect(sent).toEqual([]);
  });

  it('never throws and always settles, even when the platform rejects, throws or hangs', async () => {
    const rejects: PlatformLeaderboard = { submit: () => Promise.reject(new Error('offline')) };
    await expect(createScoreSubmitter(() => adapterWith(rejects))('main', 1)).resolves.toBeUndefined();
    const throws: PlatformLeaderboard = {
      submit: () => {
        throw new Error('sync boom');
      },
    };
    await expect(createScoreSubmitter(() => adapterWith(throws))('main', 1)).resolves.toBeUndefined();
    const hangs: PlatformLeaderboard = { submit: () => new Promise(() => undefined) };
    const p = createScoreSubmitter(() => adapterWith(hangs))('main', 1);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(p).resolves.toBeUndefined();
  });
});
