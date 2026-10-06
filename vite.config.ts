import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// base './' keeps every asset URL relative so the same build runs from a portal iframe,
// a sub-path (GitHub Pages) or a Capacitor file:// origin.
export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true, host: '127.0.0.1' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
});
