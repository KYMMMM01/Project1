/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time platform: 'dev' (default) | 'itch' | 'crazygames' | 'poki' | 'gd' | 'yt' | 'toss' | 'capacitor'. */
  readonly VITE_PLATFORM?: string;
  /** Publisher's privacy policy URL (settings > About); the row is hidden while unset. */
  readonly VITE_PRIVACY_URL?: string;
  /** Publisher's terms of service URL. */
  readonly VITE_TERMS_URL?: string;
  /** Support contact: a web page or a mailto: address. */
  readonly VITE_SUPPORT_URL?: string;
}
