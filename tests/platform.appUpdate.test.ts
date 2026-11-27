import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerCapacitorPlugins, type CapApp, type CapAppUpdate } from '@/platform/bridges';
import { appUpdate } from '@/platform/appUpdate';

function fake(check: CapAppUpdate['check']) {
  const p = { check: vi.fn(check), openStore: vi.fn(async () => undefined) } satisfies CapAppUpdate;
  const app = { addListener: vi.fn(() => ({ remove: () => undefined })), exitApp: vi.fn(async () => undefined) } satisfies CapApp;
  registerCapacitorPlugins({ AppUpdate: p, App: app });
  return { p, app };
}

beforeEach(() => {
  vi.stubGlobal('location', { search: '' });
});

afterEach(() => {
  registerCapacitorPlugins(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the store update check', () => {
  it('says what Play says', async () => {
    fake(async () => ({ available: true }));
    expect(await appUpdate.ready()).toBe(true);
    fake(async () => ({ available: false }));
    expect(await appUpdate.ready()).toBe(false);
  });

  it('answers no update off the Android app, when the check fails and when Play is slow', async () => {
    expect(await appUpdate.ready()).toBe(false);
    fake(() => Promise.reject(new Error('not installed from Play')));
    expect(await appUpdate.ready()).toBe(false);
    vi.useFakeTimers();
    fake(() => new Promise(() => undefined));
    const late = appUpdate.ready();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await late).toBe(false);
  });

  it('says there is one on a debug build asked with ?update=1', async () => {
    vi.stubGlobal('location', { search: '?debug=1&update=1' });
    expect(await appUpdate.ready()).toBe(true);
  });

  it('opens the store page and quits through the plugins', () => {
    const { p, app } = fake(async () => ({ available: true }));
    appUpdate.openStore();
    appUpdate.quit();
    expect(p.openStore).toHaveBeenCalledOnce();
    expect(app.exitApp).toHaveBeenCalledOnce();
  });
});
