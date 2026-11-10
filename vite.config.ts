import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Trims a build to what its platform needs. The sound board (`?scene=sounds`) is a test-build tool: its candidate sample files live in
 * `public/soundboard/` and so land in `dist/soundboard/`; `VITE_SOUNDBOARD=off` leaves the page out of the code (`main.ts`) and this plugin
 * leaves the files out of the build folder. A Capacitor build (`npm run build:store`, `.env.store`) also drops the web-app manifest and its
 * icons: the Android app has its own launcher icon, and the store listing icon is uploaded in Play Console.
 */
function trimBuild(mode: string): Plugin {
  let outDir = 'dist';
  const env = (key: string) => process.env[key] ?? loadEnv(mode, process.cwd(), 'VITE_')[key];
  const app = () => env('VITE_PLATFORM') === 'capacitor';
  return {
    name: 'trim-build',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return app() ? html.replace(/^\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\r?\n/gm, '') : html;
    },
    closeBundle() {
      if (env('VITE_SOUNDBOARD') === 'off') rmSync(resolve(outDir, 'soundboard'), { recursive: true, force: true });
      if (app()) {
        // public/legal/ (privacy policy, terms) is served by the web build's site; the app links to it (.env.store).
        rmSync(resolve(outDir, 'legal'), { recursive: true, force: true });
        rmSync(resolve(outDir, 'icons'), { recursive: true, force: true });
        rmSync(resolve(outDir, 'manifest.webmanifest'), { force: true });
      }
    },
  };
}

// base './' keeps every asset URL relative so the same build runs from a portal iframe,
// a sub-path (GitHub Pages) or a Capacitor file:// origin.
export default defineConfig(({ mode }) => ({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [trimBuild(mode)],
  // The title shows it (screens/shell/TitleOverlay.ts); android/app/build.gradle's versionName follows the same number.
  define: { __APP_VERSION__: JSON.stringify((JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version) },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
}));
