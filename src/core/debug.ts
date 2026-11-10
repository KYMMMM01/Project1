import { game } from './game';
import { scenes } from './scene';

/**
 * QA hooks on window.__dbg — enabled in dev builds, with ?debug=1 and on the developer lab (?scene=lab). Automated browser checks use
 * these to convert design coordinates to client pixels and to read captured errors. A store build (VITE_PLATFORM=capacitor) has none of
 * them, nor the cheats and QA routes behind them, unless it is an internal test build made with VITE_DEBUG=on.
 */
export interface DebugApi {
  game: typeof game;
  scenes: typeof scenes;
  /** Design-space point -> viewport CSS pixel (for synthetic clicks). */
  toClient(x: number, y: number): { x: number; y: number };
  [extra: string]: unknown;
}

declare global {
  interface Window {
    __dbg?: DebugApi;
    __errors?: string[];
  }
}

export function debugEnabled(): boolean {
  if (import.meta.env.VITE_PLATFORM === 'capacitor' && import.meta.env.VITE_DEBUG !== 'on') return false;
  const params = new URLSearchParams(location.search);
  return import.meta.env.DEV || params.has('debug') || params.get('scene') === 'lab';
}

export function installDebug(): void {
  const errors: string[] = [];
  window.__errors = errors;
  const push = (s: string) => {
    if (errors.length < 200) errors.push(s);
  };
  window.addEventListener('error', (e) => push(`error: ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => push(`rejection: ${String((e.reason as Error)?.stack ?? e.reason)}`));
  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push('console.error: ' + args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : String(a))).join(' '));
    origError(...args);
  };
  const origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    push('console.warn: ' + args.map(String).join(' '));
    origWarn(...args);
  };

  window.__dbg = {
    game,
    scenes,
    toClient(x: number, y: number) {
      const r = game.app.canvas.getBoundingClientRect();
      return { x: r.left + x * game.scale, y: r.top + y * game.scale };
    },
  };
}

/** Feature modules attach their own helpers (e.g. dbg.battle) without importing each other. */
export function debugExpose(name: string, value: unknown): void {
  if (window.__dbg) window.__dbg[name] = value;
}
