import type { Container } from 'pixi.js';
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
  /** Design-space point => viewport CSS pixel (for synthetic clicks). */
  toClient(x: number, y: number): { x: number; y: number };
  /**
   * Every shown text matching `re`, topmost (drawn last) first, with its box in viewport CSS pixels: pass cx, cy to a click. A text
   * scrolled out of its list or off the canvas is listed too, with `inView` false (a click there would land on something else).
   */
  texts(re: RegExp): ({ text: string; inView: boolean } & ClientBox)[];
  /** Scroll the scroll view holding the topmost text matching `re` so that text sits near the top of the view, at once. False when none holds it. */
  scrollTo(re: RegExp): boolean;
  /** Each hook on window.__dbg with the functions it offers (docs/기능지도.md says what they are for). */
  help(): string[];
  [extra: string]: unknown;
}

/** A box in viewport CSS pixels, the unit of a synthetic click (Pixi's global space is the canvas's own CSS pixels). */
export interface ClientBox {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
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
    texts: (re) => textNodes(re).map((n) => ({ text: n.text, inView: inView(n), ...clientBox(n) })),
    scrollTo(re) {
      const node = textNodes(re)[0];
      for (let p = node?.parent; node && p; p = p.parent) {
        const host = p as Container & { isScrollHost?: boolean; content?: Container; padding?: number; scrollTo?: (y: number, animated: boolean) => void };
        if (host.isScrollHost && host.content && host.scrollTo) {
          // A little room above, so the heading or the card the text sits on shows too.
          host.scrollTo(host.content.toLocal({ x: 0, y: node.getBounds().minY }).y + (host.padding ?? 0) - SCROLL_ROOM, false);
          return true;
        }
      }
      return false;
    },
    help: () =>
      Object.entries(window.__dbg ?? {}).map(([name, v]) => {
        if (typeof v === 'function') return `${name}()`;
        const fns = v && typeof v === 'object' ? Object.keys(v).filter((k) => typeof (v as Record<string, unknown>)[k] === 'function') : [];
        return fns.length > 0 ? `${name}: ${fns.join(', ')}` : name;
      }),
  };
}

/** Design pixels left above a text that scrollTo brings up. */
const SCROLL_ROOM = 96;

/** Drawn on screen now: every ancestor up to the stage visible, not faded out, renderable. */
function shown(node: Container): boolean {
  for (let p: Container | null = node; p; p = p.parent) {
    if (!p.visible || p.alpha <= 0.02 || !p.renderable) return false;
    if (p === game.app.stage) return true;
  }
  return false;
}

/** Shown texts matching `re`, topmost first: the stage draws its children in order, so the last found is drawn on top. */
function textNodes(re: RegExp): (Container & { text: string })[] {
  const found: (Container & { text: string })[] = [];
  const walk = (n: Container): void => {
    if (!n.visible) return;
    if ('text' in n && typeof n.text === 'string' && re.test(n.text) && shown(n)) found.push(n as Container & { text: string });
    for (const c of n.children) walk(c);
  };
  walk(game.app.stage);
  return found.reverse();
}

/** The text's centre is on the canvas and inside every mask above it (a scroll view clips its list with one). */
function inView(node: Container): boolean {
  const b = node.getBounds();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  const { screen } = game.app;
  if (x < screen.x || x > screen.x + screen.width || y < screen.y || y > screen.y + screen.height) return false;
  for (let p: Container | null = node; p; p = p.parent) {
    const mask = p.mask;
    if (!mask || typeof mask !== 'object' || !('getLocalBounds' in mask)) continue;
    // Pixi leaves a mask out of every measurement (its getBounds is empty), so map the mask's own outline to the canvas.
    const m = mask as Container;
    const lb = m.getLocalBounds();
    const a = m.toGlobal({ x: lb.minX, y: lb.minY });
    const z = m.toGlobal({ x: lb.maxX, y: lb.maxY });
    if (x < Math.min(a.x, z.x) || x > Math.max(a.x, z.x) || y < Math.min(a.y, z.y) || y > Math.max(a.y, z.y)) return false;
  }
  return true;
}

function clientBox(node: Container): ClientBox {
  const c = game.app.canvas.getBoundingClientRect();
  const b = node.getBounds();
  const x = c.left + b.x;
  const y = c.top + b.y;
  return { x, y, w: b.width, h: b.height, cx: x + b.width / 2, cy: y + b.height / 2 };
}

/** Feature modules attach their own helpers (e.g. dbg.battle) without importing each other. */
export function debugExpose(name: string, value: unknown): void {
  if (window.__dbg) window.__dbg[name] = value;
}
