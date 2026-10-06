/**
 * The boot sequence: platform -> meta -> saved settings -> flow wiring -> first scene. Every stage
 * degrades instead of failing: a broken platform SDK or an unreadable save is reported once with a
 * toast and the game starts anyway.
 */
import { debugEnabled } from '@/core/debug';
import { detectLang, setLang, t } from '@/core/i18n';
import { getStorageBackend } from '@/core/save';
import type { Scene } from '@/core/scene';
import { loadFxTier, setFxSettings } from '@/fx';
import { initMeta, profile } from '@/meta';
import { getBootResult, initPlatform, platform } from '@/platform';
import { markUnlocksSeen } from '@/scenes/HomeScene';
import type { TabId } from '@/screens/contract';
import { shell } from '@/screens/shell/controller';
import '@/screens/shell/strings';
import { installSystemScreens } from '@/screens/system';
import { toast } from '@/ui';
import { currentSettings, ensureSettings } from '@/view/hud/settings';
import { installCheats } from './cheats';
import { afterFirstScene, chooseFirstScene, homeScene, installFlow } from './flow';

const REFRESH_MS = 60_000;
const SAVE_KEYS = ['meowguard.profile', 'meowguard.settings'] as const;

export interface AppStart {
  /** Land on the home screen (on this tab) even for a brand-new profile. Used by the `?scene=home` QA route. */
  home?: { tab?: TabId };
}

export interface App {
  /** Starts the services (once) and resolves when they are up. Never rejects. */
  start(opts?: AppStart): Promise<void>;
  /** The first scene, valid after `start()` settled. */
  firstScene(): Scene;
  /** Call once the first scene is on screen. */
  shown(): void;
}

export function createApp(): App {
  const warnings: string[] = [];
  let first: (() => Scene) | null = null;
  let started: Promise<void> | null = null;

  const attempt = async (stage: string, fn: () => void | Promise<void>, warning?: string): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      console.error(`[boot] ${stage} failed`, err);
      if (warning && !warnings.includes(warning)) warnings.push(warning);
    }
  };

  async function boot(opts: AppStart): Promise<void> {
    await attempt('platform', async () => {
      await initPlatform();
      if (getBootResult() === 'fallback') warnings.push('shell.boot.warn.platform');
      platform.lifecycle.loadingStart();
    });
    // QA: `?fresh=1` starts from an empty save.
    if (debugEnabled() && new URLSearchParams(location.search).has('fresh')) {
      await attempt('fresh save', async () => {
        for (const key of SAVE_KEYS) await getStorageBackend().remove(key);
      });
    }
    await attempt('meta', async () => {
      await initMeta();
      setInterval(() => profile.refresh(), REFRESH_MS);
    }, 'shell.boot.warn.meta');
    markUnlocksSeen();
    await attempt('settings', async () => {
      await ensureSettings();
      if (!currentSettings().lang) setLang(detectLang());
      const tier = loadFxTier();
      if (tier) setFxSettings({ tier });
    });
    installFlow();
    await attempt('system screens', () => installSystemScreens(shell));
    installCheats();
    await attempt('first scene', async () => {
      first = opts.home ? homeScene(opts.home.tab) : await chooseFirstScene();
    });
    first ??= homeScene();
  }

  return {
    start: (opts = {}) => (started ??= boot(opts)),
    firstScene: () => (first ?? homeScene())(),
    shown() {
      for (const key of warnings) toast(t(key), 'warning');
      warnings.length = 0;
      platform.lifecycle.loadingFinished();
      platform.lifecycle.firstFrameReady();
      platform.lifecycle.gameReady();
      afterFirstScene();
    },
  };
}
