import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android app (Google Play). The package name cannot change once the app is on Play (owner's pick, 2026-11-11).
 * webDir is the store build (`npm run build:store`, `.env.store`): never `dist`, which carries the sound board's candidate files.
 * After every web build: `npx cap sync android`. Steps and checks: docs/출시_구글플레이.md.
 */
const config: CapacitorConfig = {
  appId: 'com.bulssistudio.meowguard',
  appName: '냥이 수비대',
  webDir: 'dist-store',
  // The page's cream (manifest background) behind the WebView while it starts.
  backgroundColor: '#fbf3e2',
  plugins: {
    // index.html asks for viewport-fit=cover and the game reads env(safe-area-inset-*) (core/game.ts); the hint avoids a jump.
    SystemBars: { initialViewportFitValueHint: 'cover' },
  },
};

export default config;
