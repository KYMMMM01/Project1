/// <reference types="vite/client" />

/** package.json "version", set at build time (vite.config.ts define). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Build-time platform: 'dev' (default) | 'itch' | 'crazygames' | 'poki' | 'gd' | 'yt' | 'toss' | 'capacitor'. */
  readonly VITE_PLATFORM?: string;
  /** Publisher's privacy policy URL (settings > About); the row is hidden while unset. */
  readonly VITE_PRIVACY_URL?: string;
  /** Publisher's terms of service URL. */
  readonly VITE_TERMS_URL?: string;
  /** Support contact: a web page or a mailto: address. */
  readonly VITE_SUPPORT_URL?: string;
  /** 'off' leaves the sound board route (`?scene=sounds`) out of the build; delete `dist/soundboard/` as well. */
  readonly VITE_SOUNDBOARD?: string;
  /** 'on' keeps the QA hooks, cheats and QA routes (?debug=1, ?scene=...) in a store build: internal test builds only (core/debug.ts). */
  readonly VITE_DEBUG?: string;
  /** Capacitor build: the AdMob rewarded ad unit id (ads are off while unset). */
  readonly VITE_ADMOB_REWARDED_ID?: string;
  /** '1' makes the Capacitor build ask AdMob for test ads (internal test builds). */
  readonly VITE_ADMOB_TESTING?: string;
  /** Capacitor build: RevenueCat's public Google SDK key (goog_...); purchases are unavailable while unset. */
  readonly VITE_REVENUECAT_API_KEY?: string;
  /** Capacitor build: the Play Console leaderboard id of the endless mode's best wave (Google Play Games); the board is skipped while unset. */
  readonly VITE_PGS_LEADERBOARD_ENDLESS?: string;
}
