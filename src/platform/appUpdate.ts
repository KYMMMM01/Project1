/**
 * The store update on the Android app (android/.../AppUpdatePlugin.java, Google Play In-App Updates): whether Play has a newer version
 * of the game for this player, its store page, and quitting the app. Every other build, an app not installed from Play and a check
 * that fails or takes too long answer "no update", so the game never waits on it. QA: ?update=1 on a debug build says there is one.
 */
import { debugEnabled } from '@/core/debug';
import { getCapacitorPlugins } from './bridges';

/** A check still out after this long is taken as "no update": the title must not hang on the Play service. */
const CHECK_MS = 4000;

export const appUpdate = {
  async ready(): Promise<boolean> {
    if (debugEnabled() && new URLSearchParams(location.search).get('update') === '1') return true;
    const check = getCapacitorPlugins()?.AppUpdate?.check();
    if (!check) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), CHECK_MS);
    });
    const available = await Promise.race([check.then((r) => r.available === true, () => false), late]);
    clearTimeout(timer);
    return available;
  },
  openStore(): void {
    void getCapacitorPlugins()?.AppUpdate?.openStore().catch(() => undefined);
  },
  quit(): void {
    void getCapacitorPlugins()?.App?.exitApp?.().catch(() => undefined);
  },
};
