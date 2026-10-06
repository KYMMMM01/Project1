/**
 * Pause/resume wiring: the adapter's own pause/resume signal (YouTube onPause, GD game pause, Capacitor
 * app state) and the page being hidden (every platform that allows the Page Visibility API) become ONE
 * pause/resume pair, for the game and for everyone subscribed to `platform.lifecycle`. The meta layer
 * flushes the save on pause and re-anchors its clock on resume, so a platform without an own signal
 * (Toss, CrazyGames, Poki, itch, dev) must not go silent. Pure: the DOM arrives as a PageSource.
 */
import type { Pauser } from './modal';
import type { PlatformAdapter } from './types';
import { safe, type Signal } from './util';

/** Whether the page is in front of the player (Page Visibility API plus pagehide/pageshow). */
export interface PageSource {
  isHidden(): boolean;
  /** `hidden` is the new state. Returns unsubscribe. */
  onChange(cb: (hidden: boolean) => void): () => void;
}

/** The browser page, or null where there is no document (node, workers). */
export function domPageSource(): PageSource | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  const hidden = (): boolean => document.visibilityState === 'hidden';
  return {
    isHidden: hidden,
    onChange(cb) {
      const onVisibility = (): void => cb(hidden());
      // visibilityState may still read 'visible' while pagehide runs.
      const onHide = (): void => cb(true);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', onHide);
      window.addEventListener('pageshow', onVisibility);
      return () => {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('pageshow', onVisibility);
      };
    },
  };
}

export interface LifecycleDeps {
  /** game.setExternalPause + audio.setMuted. */
  pauser: Pauser;
  signals: { pause: Signal; resume: Signal };
  /** After every resume: anything paid while the game was away. */
  onResumed(): void;
  page: PageSource | null;
}

/**
 * Pause on the first reason, resume when the last one lets go; each transition reaches the signals once,
 * however many reasons repeat it. The page counts only where the platform allows the Page Visibility API
 * (YouTube forbids it and delivers its own pause/resume).
 */
export function wireLifecycle(adapter: PlatformAdapter, deps: LifecycleDeps): void {
  const { pauser, signals } = deps;
  const holders = new Set<'platform' | 'page'>();
  const hold = (who: 'platform' | 'page'): void => {
    if (holders.has(who)) return;
    holders.add(who);
    if (holders.size > 1) return;
    pauser.setPaused(true);
    pauser.setMuted(true);
    signals.pause.emit();
  };
  const release = (who: 'platform' | 'page'): void => {
    if (!holders.delete(who) || holders.size > 0) return;
    pauser.setMuted(false);
    pauser.setPaused(false);
    signals.resume.emit();
    deps.onResumed();
  };

  safe(() => adapter.lifecycle.onPause(() => hold('platform')));
  safe(() => adapter.lifecycle.onResume(() => release('platform')));

  const page = adapter.capabilities.usesPageVisibility ? deps.page : null;
  if (page) {
    safe(() => {
      page.onChange((hidden) => (hidden ? hold('page') : release('page')));
      if (page.isHidden()) hold('page');
    });
  }
}
