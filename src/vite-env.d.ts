/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Build-time platform: 'dev' (default) | 'itch' | 'crazygames' | 'poki' | 'gd' | 'yt' | 'toss' | 'capacitor'. */
  readonly VITE_PLATFORM?: string;
}
