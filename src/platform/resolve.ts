/**
 * Build-time platform selection. Every branch compares the literal `import.meta.env.VITE_PLATFORM`
 * constant, which Vite replaces with a string at build time, so the bundler folds the comparisons and
 * drops every other adapter together with its SDK URL. A build for one platform contains only that
 * adapter (verified per platform in the final report).
 *
 * VITE_PLATFORM: 'dev' (default) | 'itch' | 'crazygames' | 'poki' | 'gd' | 'yt' | 'toss' | 'capacitor'
 */
import type { PlatformAdapter } from './types';

/** The platform this bundle was built for. */
export const PLATFORM_ID: string = import.meta.env.VITE_PLATFORM ?? 'dev';

export async function resolveAdapter(): Promise<PlatformAdapter> {
  if (import.meta.env.VITE_PLATFORM === 'itch') {
    return (await import('./adapters/itch')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'crazygames') {
    return (await import('./adapters/crazygames')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'poki') {
    return (await import('./adapters/poki')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'gd') {
    return (await import('./adapters/gd')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'yt') {
    return (await import('./adapters/yt')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'toss') {
    return (await import('./adapters/toss')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === 'capacitor') {
    return (await import('./adapters/capacitor')).createAdapter();
  }
  if (import.meta.env.VITE_PLATFORM === undefined || import.meta.env.VITE_PLATFORM === 'dev') {
    return (await import('./adapters/dev')).createAdapter();
  }
  throw new Error('Unknown VITE_PLATFORM');
}
