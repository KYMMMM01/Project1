import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCapacitorPlugins, type CapPlayGames } from '@/platform/bridges';
import { playGames, resetPlayGamesForTests, type PlayGamesState } from '@/platform/playGames';

function fake(over: Partial<{ authenticated: boolean; available: boolean; signInOk: boolean; name: string }> = {}) {
  const o = { authenticated: true, available: true, signInOk: true, name: '냥집사', ...over };
  const p = {
    isAuthenticated: vi.fn(async () => ({ available: o.available, authenticated: o.authenticated })),
    signIn: vi.fn(async () => ({ available: o.available, authenticated: o.signInOk })),
    getPlayer: vi.fn(async () => ({ playerId: 'p1', displayName: o.name })),
    submitScore: vi.fn(async () => ({ available: true, submitted: true })),
    showLeaderboard: vi.fn(async () => undefined),
    saveSnapshot: vi.fn(async () => ({ available: true, saved: true })),
    loadSnapshot: vi.fn(async (): Promise<{ available: boolean; found?: boolean; data?: string | null }> => ({ available: true, found: true, data: '{"v":1}' })),
  } satisfies CapPlayGames;
  registerCapacitorPlugins({ PlayGames: p });
  return p;
}

afterEach(() => {
  registerCapacitorPlugins(null);
  resetPlayGamesForTests();
  vi.unstubAllEnvs();
});

describe('Google Play Games', () => {
  it('without the plugin (web build) it stays "none" and every call is a quiet no', async () => {
    await playGames.start();
    expect(playGames.state()).toEqual({ status: 'none' });
    expect(await playGames.connect()).toBe(false);
    expect(await playGames.load('profile')).toBeNull();
    expect(await playGames.save('profile', 'x', '')).toBe(false);
  });

  it('the automatic sign-in: connecting, then signed in with the Play Games name', async () => {
    fake();
    const seen: PlayGamesState[] = [];
    playGames.onChange((s) => seen.push(s));
    await playGames.start();
    expect(seen).toEqual([{ status: 'wait' }, { status: 'on', name: '냥집사' }]);
  });

  it('not signed in shows the connect button; the button signs in through Play Games', async () => {
    const p = fake({ authenticated: false });
    await playGames.start();
    expect(playGames.state()).toEqual({ status: 'off' });
    expect(await playGames.connect()).toBe(true);
    expect(p.signIn).toHaveBeenCalledTimes(1);
    expect(playGames.state()).toEqual({ status: 'on', name: '냥집사' });
  });

  it('a build without a Play Games project id reports "none", a failed sign-in "off"', async () => {
    fake({ available: false });
    await playGames.start();
    expect(playGames.state()).toEqual({ status: 'none' });
    resetPlayGamesForTests();
    fake({ authenticated: false, signInOk: false });
    await playGames.start();
    expect(await playGames.connect()).toBe(false);
    expect(playGames.state()).toEqual({ status: 'off' });
  });

  it('scores go to the board id of this build, only when signed in, as whole numbers', async () => {
    const p = fake({ authenticated: false });
    vi.stubEnv('VITE_PGS_LEADERBOARD_ENDLESS', 'CgkI_endless');
    await playGames.start();
    await playGames.submit('endless_best', 41.7);
    expect(p.submitScore).not.toHaveBeenCalled(); // not signed in
    await playGames.connect();
    await playGames.submit('endless_best', 41.7);
    await playGames.submit('weekly_cup', 10); // no Play Console board for it
    await playGames.submit('endless_best', 0);
    expect(p.submitScore.mock.calls).toEqual([[{ leaderboardId: 'CgkI_endless', score: 41 }]]);
    expect(await playGames.showBoard('endless_best')).toBe(true);
    expect(p.showLeaderboard).toHaveBeenCalledWith({ leaderboardId: 'CgkI_endless' });
    vi.stubEnv('VITE_PGS_LEADERBOARD_ENDLESS', '');
    expect(await playGames.showBoard('endless_best')).toBe(false);
  });

  it('the cloud save reads and writes through Saved Games when signed in', async () => {
    const p = fake();
    await playGames.start();
    expect(await playGames.load('profile')).toBe('{"v":1}');
    expect(await playGames.save('profile', 'data', 'Lv 3')).toBe(true);
    expect(p.saveSnapshot).toHaveBeenCalledWith({ name: 'profile', data: 'data', description: 'Lv 3' });
    p.loadSnapshot.mockResolvedValueOnce({ available: true, found: false, data: null });
    expect(await playGames.load('profile')).toBeNull();
    p.saveSnapshot.mockRejectedValueOnce(new Error('snapshot too large'));
    expect(await playGames.save('profile', 'big', '')).toBe(false);
  });
});
