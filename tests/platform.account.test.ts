import { afterEach, describe, expect, it, vi } from 'vitest';
import { account, resetAccountForTests } from '@/platform/account';
import { firebaseConfigured } from '@/platform/firebase';
import { ranking, seoulWeek } from '@/platform/ranking';
import { seoulWeekKey } from '../functions/src/rules';

afterEach(() => {
  resetAccountForTests();
  vi.unstubAllEnvs();
});

// The Firebase SDK itself is not loaded here: these are the guest paths every build without a Firebase config takes (and the web build
// before the console setup). The signed-in paths need the real project and are checked on a device.
describe('the game account without a Firebase config', () => {
  it('stays "none" and answers every call with a quiet no', async () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', '');
    expect(firebaseConfigured()).toBe(false);
    await account.start();
    expect(account.state()).toEqual({ status: 'none' });
    expect(await account.signIn()).toBe(false);
    expect(await account.loadSave()).toBeNull();
    expect(await account.writeSave('{"v":1}', 10)).toBe(false);
    expect(await account.deleteAccount()).toBe('failed');
  });

  it('needs the api key, the project id and the app id together', () => {
    vi.stubEnv('VITE_FIREBASE_API_KEY', 'k');
    vi.stubEnv('VITE_FIREBASE_PROJECT_ID', 'meowguard');
    vi.stubEnv('VITE_FIREBASE_APP_ID', '');
    expect(firebaseConfigured()).toBe(false);
    vi.stubEnv('VITE_FIREBASE_APP_ID', '1:2:web:3');
    expect(firebaseConfigured()).toBe(true);
  });
});

describe('the rankings signed out', () => {
  it('sends nothing and has no place to show', async () => {
    expect(await ranking.submitRun({ waves: 40, seconds: 900 })).toBe(false);
    expect(await ranking.mine('week')).toBeNull();
  });
});

describe('the week of the rankings', () => {
  it('is the same Monday on the phone and on the server, around the Seoul midnight that starts a week', () => {
    // Monday 2026-11-16 00:00 in Seoul is Sunday 15:00 UTC.
    for (const ms of [Date.UTC(2026, 10, 15, 14, 59), Date.UTC(2026, 10, 15, 15, 0), Date.UTC(2026, 10, 12, 3), Date.UTC(2026, 11, 31, 20)]) {
      expect(seoulWeek(ms)).toBe(seoulWeekKey(ms));
    }
    expect(seoulWeek(Date.UTC(2026, 10, 15, 14, 59))).toBe('2026-11-09');
    expect(seoulWeek(Date.UTC(2026, 10, 15, 15, 0))).toBe('2026-11-16');
  });
});
