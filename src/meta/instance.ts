/**
 * The app's one profile, on the default store, the system clock and the platform singletons. This is
 * the only meta module that imports the platform barrel; tests build their own with createProfile().
 */
import { ads, analytics, iap, platform } from '@/platform';
import './strings';
import { attachPlatform } from './platformLink';
import { createProfile } from './profile';

export const profile = createProfile({
  analytics,
  ads,
  submitScore: (board, score) => {
    platform.leaderboard?.submit(board, score).catch(() => undefined);
  },
});

/**
 * Boot: load the save, connect ads and purchases, follow the app lifecycle. Call once, after
 * `initPlatform()`. Returns the function that undoes it.
 */
export async function initMeta(): Promise<() => void> {
  await profile.load();
  const detach = attachPlatform(profile, { ads, iap });
  const offResume = platform.lifecycle.onResume(() => profile.resume());
  const offPause = platform.lifecycle.onPause(() => {
    void profile.flush();
  });
  return () => {
    offPause();
    offResume();
    detach();
  };
}
