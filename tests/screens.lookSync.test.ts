import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOOK_COOLDOWN_MS, type LookWire } from '../functions/src/looks';

/** The app around the sync, faked: the account, the server calls, the profile and the app lifecycle. */
const app = vi.hoisted(() => ({
  state: { status: 'on', uid: 'u1' } as { status: string; uid?: string },
  accountFns: new Set<(s: { status: string; uid?: string }) => void>(),
  profileFns: new Set<() => void>(),
  resumeFns: new Set<() => void>(),
  wear: { icon: 'icon_w_paw', frame: 'frame_default', plate: 'plate_default' },
  xp: 0,
  me: vi.fn(),
  setLook: vi.fn(),
}));

vi.mock('@/platform', () => ({
  account: {
    state: () => app.state,
    onChange: (fn: () => void) => (app.accountFns.add(fn), () => app.accountFns.delete(fn)),
  },
  platform: { lifecycle: { onResume: (fn: () => void) => (app.resumeFns.add(fn), () => app.resumeFns.delete(fn)) } },
  ranking: { me: app.me, setLook: app.setLook },
}));
vi.mock('@/meta', () => ({
  // One level per 100 xp keeps the numbers readable.
  accountProgress: (xp: number) => ({ level: 1 + Math.floor(xp / 100) }),
  profile: {
    get look() {
      return app.wear;
    },
    data: {
      get accountXp() {
        return app.xp;
      },
    },
    subscribe: (fn: () => void) => (app.profileFns.add(fn), () => app.profileFns.delete(fn)),
  },
}));

import { lookOf, startLookSync } from '../src/screens/system/lookSync';

const base: LookWire = { i: 'icon_w_paw', f: 'frame_default', p: 'plate_default', lv: 1 };
const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const change = async (): Promise<void> => {
  app.profileFns.forEach((f) => f());
  await flush();
};

describe('lookOf', () => {
  it('joins the wear and the account level, clamped to 1..99', () => {
    expect(lookOf(app.wear, 250)).toEqual({ ...base, lv: 3 });
    expect(lookOf(app.wear, 1_000_000).lv).toBe(99);
  });
});

describe('startLookSync', () => {
  let stop = (): void => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    app.state = { status: 'on', uid: 'u1' };
    app.wear = { icon: 'icon_w_paw', frame: 'frame_default', plate: 'plate_default' };
    app.xp = 0;
    app.me.mockReset().mockResolvedValue({ name: 'n', look: base });
    app.setLook.mockReset().mockResolvedValue('ok');
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('reads the server look after sign-in and uploads nothing when it matches', async () => {
    stop = startLookSync();
    await flush();
    expect(app.me).toHaveBeenCalledTimes(1);
    expect(app.setLook).not.toHaveBeenCalled();
  });

  it('uploads once after sign-in when the server look differs', async () => {
    app.me.mockResolvedValue({ name: 'n', look: null });
    stop = startLookSync();
    await flush();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    expect(app.setLook).toHaveBeenCalledWith({ icon: 'icon_w_paw', frame: 'frame_default', plate: 'plate_default', level: 1 });
  });

  it('uploads a changed wear once, and skips changes that leave the look equal', async () => {
    stop = startLookSync();
    await flush();
    await change();
    expect(app.setLook).not.toHaveBeenCalled();
    app.wear = { ...app.wear, frame: 'frame_wood' };
    await change();
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    expect(app.setLook).toHaveBeenLastCalledWith({ icon: 'icon_w_paw', frame: 'frame_wood', plate: 'plate_default', level: 1 });
  });

  it('sends the newest look when it changed during an upload', async () => {
    stop = startLookSync();
    await flush();
    let done: (r: string) => void = () => undefined;
    app.setLook.mockReturnValueOnce(new Promise((r) => (done = r)));
    app.wear = { ...app.wear, frame: 'frame_wood' };
    await change();
    app.xp = 100;
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    done('ok');
    await flush();
    expect(app.setLook).toHaveBeenCalledTimes(2);
    expect(app.setLook).toHaveBeenLastCalledWith({ icon: 'icon_w_paw', frame: 'frame_wood', plate: 'plate_default', level: 2 });
  });

  it('waits out the cooldown after too-soon, then retries once', async () => {
    stop = startLookSync();
    await flush();
    app.setLook.mockResolvedValueOnce('too-soon');
    app.xp = 100;
    await change();
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LOOK_COOLDOWN_MS + 3_000);
    expect(app.setLook).toHaveBeenCalledTimes(2);
  });

  it('keeps a failed upload pending until the app comes back', async () => {
    stop = startLookSync();
    await flush();
    app.setLook.mockResolvedValueOnce('failed');
    app.xp = 100;
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    // Coins and the like change the profile all the time: they must not call the server again for the same look.
    await change();
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(1);
    app.resumeFns.forEach((f) => f());
    await flush();
    expect(app.setLook).toHaveBeenCalledTimes(2);
  });

  it('tries again after a failure when the look itself changes', async () => {
    stop = startLookSync();
    await flush();
    app.setLook.mockResolvedValueOnce('failed');
    app.xp = 100;
    await change();
    app.wear = { ...app.wear, plate: 'plate_dots' };
    await change();
    expect(app.setLook).toHaveBeenCalledTimes(2);
  });

  it('does not read the server again on every profile change while the read fails', async () => {
    app.me.mockResolvedValue(null);
    stop = startLookSync();
    await flush();
    await change();
    await change();
    expect(app.me).toHaveBeenCalledTimes(1);
    app.resumeFns.forEach((f) => f());
    await flush();
    expect(app.me).toHaveBeenCalledTimes(2);
  });

  it('forgets the server look on sign-out and reads it again on the next sign-in', async () => {
    stop = startLookSync();
    await flush();
    app.state = { status: 'off' };
    app.accountFns.forEach((f) => f(app.state));
    await flush();
    app.state = { status: 'on', uid: 'u2' };
    app.accountFns.forEach((f) => f(app.state));
    await flush();
    expect(app.me).toHaveBeenCalledTimes(2);
  });
});
