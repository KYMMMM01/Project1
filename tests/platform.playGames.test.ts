import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCapacitorPlugins, type CapPlayGames } from '@/platform/bridges';
import { playGames, resetPlayGamesForTests, type PlayGamesState } from '@/platform/playGames';

function fake(over: Partial<{ authenticated: boolean; available: boolean; signInOk: boolean; name: string }> = {}) {
  const o = { authenticated: true, available: true, signInOk: true, name: '냥집사', ...over };
  const p = {
    isAuthenticated: vi.fn(async () => ({ available: o.available, authenticated: o.authenticated })),
    signIn: vi.fn(async () => ({ available: o.available, authenticated: o.signInOk })),
    getPlayer: vi.fn(async () => ({ playerId: 'p1', displayName: o.name })),
    unlockAchievement: vi.fn(async () => ({ available: true })),
    incrementAchievement: vi.fn(async () => ({ available: true })),
    showAchievements: vi.fn(async () => undefined),
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
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', '{"first_win":"CgkI_a1"}');
    await playGames.start();
    expect(playGames.state()).toEqual({ status: 'none' });
    expect(await playGames.connect()).toBe(false);
    playGames.unlock('first_win');
    playGames.increment('first_win', 2);
    expect(await playGames.showAchievements()).toBe(false);
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

  it('unlock maps the game key to the Play Console id, only when signed in', async () => {
    const p = fake();
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', '{"first_win":"CgkI_a1","wave_10":"CgkI_a2"}');
    await playGames.start();
    playGames.unlock('first_win');
    expect(p.unlockAchievement.mock.calls).toEqual([[{ id: 'CgkI_a1' }]]);
    resetPlayGamesForTests();
    const q = fake({ authenticated: false });
    await playGames.start();
    playGames.unlock('wave_10');
    expect(q.unlockAchievement).not.toHaveBeenCalled();
  });

  it('an unknown key, a missing map and a broken map are silent no-ops', async () => {
    const p = fake();
    await playGames.start();
    playGames.unlock('first_win'); // no map yet
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', '{"first_win":"CgkI_a1"}');
    playGames.unlock('nope');
    playGames.increment('nope', 1);
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', 'not json');
    playGames.unlock('first_win');
    expect(p.unlockAchievement).not.toHaveBeenCalled();
    expect(p.incrementAchievement).not.toHaveBeenCalled();
  });

  it('an unlock made before the sign-in finishes is sent once signed in, once', async () => {
    const p = fake();
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', '{"first_win":"CgkI_a1"}');
    const started = playGames.start(); // the state is "wait" until the sign-in answers
    playGames.unlock('first_win');
    playGames.unlock('first_win');
    expect(p.unlockAchievement).not.toHaveBeenCalled();
    await started;
    expect(p.unlockAchievement.mock.calls).toEqual([[{ id: 'CgkI_a1' }]]);
  });

  it('increment sends whole steps only when signed in', async () => {
    const p = fake();
    vi.stubEnv('VITE_PGS_ACHIEVEMENTS', '{"kills":"CgkI_k"}');
    playGames.increment('kills', 3); // not started yet
    await playGames.start();
    playGames.increment('kills', 3.9);
    playGames.increment('kills', 0);
    expect(p.incrementAchievement.mock.calls).toEqual([[{ id: 'CgkI_k', steps: 3 }]]);
  });

  it('showAchievements opens the Google screen when signed in and reports a failure as false', async () => {
    const p = fake();
    await playGames.start();
    expect(await playGames.showAchievements()).toBe(true);
    expect(p.showAchievements).toHaveBeenCalledTimes(1);
    p.showAchievements.mockRejectedValueOnce(new Error('achievements unavailable'));
    expect(await playGames.showAchievements()).toBe(false);
  });
});
