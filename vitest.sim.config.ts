import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

// `npm run sim`: the balance report. It lives apart from the unit tests (different file suffix) because
// it plays thousands of runs; it prints tables and never fails on balance numbers.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.sim.ts'],
    environment: 'node',
    testTimeout: 0,
    hookTimeout: 0,
    disableConsoleIntercept: true,
  },
});
