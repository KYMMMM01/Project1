import { defineConfig, loadEnv, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The sound board (`?scene=sounds`) is a test-build tool: its candidate sample files live in `public/soundboard/` and so land in `dist/soundboard/`.
 * `VITE_SOUNDBOARD=off npm run build` leaves the page out of the code (`main.ts`) and this plugin leaves the files out of the build folder, so a
 * store build carries neither.
 */
function dropSoundBoard(mode: string): Plugin {
  let outDir = 'dist';
  return {
    name: 'drop-soundboard',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const off = (process.env.VITE_SOUNDBOARD ?? loadEnv(mode, process.cwd(), 'VITE_').VITE_SOUNDBOARD) === 'off';
      if (off) rmSync(resolve(outDir, 'soundboard'), { recursive: true, force: true });
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
  plugins: [dropSoundBoard(mode)],
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
}));
