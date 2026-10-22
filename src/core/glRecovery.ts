/**
 * When the browser takes the WebGL context away (a phone short of graphics memory, the GPU process restarting, a long stay in the background) everything the
 * game baked into render textures is gone with it: panels, buttons, icons and the field's drawn pieces come back as empty pictures, and nothing in the game knows
 * how to draw them again (each is made once, by code, and the builders are not kept). What it could do before was to carry on blind.
 *
 * So the game treats a lost context as the end of this page and starts again from what is saved (the player is offered the run at its last wave, the same way
 * as after the phone closed the page on its own): it stops at once while the context is away, waits a few seconds for it to come back, and reloads, once the
 * context is back or when it did not come in time. A loop is not possible: after two such reloads in two minutes it plays on as it was.
 */

/** How long a lost context is waited for before the page is started again (ms). */
export const RESTORE_WAIT_MS = 4000;
/** Reloads allowed in `RELOAD_WINDOW_MS`: a device that loses its context every few seconds must not be reloaded forever. */
export const RELOAD_LIMIT = 2;
export const RELOAD_WINDOW_MS = 120_000;

const KEY = 'meowguard.glreload';

/** The reloads that count against the limit: those of the last `RELOAD_WINDOW_MS` before `now`. */
export function recentReloads(history: readonly number[], now: number): number[] {
  return history.filter((t) => Number.isFinite(t) && t <= now && now - t < RELOAD_WINDOW_MS);
}

/** Whether another reload is allowed at `now`. */
export function mayReload(history: readonly number[], now: number): boolean {
  return recentReloads(history, now).length < RELOAD_LIMIT;
}

function read(): number[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is number => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

/** Stores the reload history; false when there is no storage (a private window, a blocked one) or it did not keep what was written. */
function write(list: number[]): boolean {
  try {
    const text = JSON.stringify(list);
    sessionStorage.setItem(KEY, text);
    return sessionStorage.getItem(KEY) === text;
  } catch {
    return false;
  }
}

export interface ContextWatch {
  /** The context is gone: stop the game (it cannot draw). */
  lost(): void;
  /** The game may go on (the context is back and no reload was possible), or the page is about to start again (`reloading`). */
  settled(reloading: boolean): void;
}

export interface WatchEnv {
  now(): number;
  reload(): void;
  setTimer(fn: () => void, ms: number): () => void;
}

const REAL: WatchEnv = {
  now: () => Date.now(),
  reload: () => location.reload(),
  setTimer: (fn, ms) => {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
  },
};

/**
 * Follow the context of `canvas`: `watch.lost()` when it goes, and when it is back (or `RESTORE_WAIT_MS` have passed without it) the page is started
 * again, unless the limit says it was already, in which case `watch.settled(false)` lets the game go on. Returns a function that stops the watching.
 */
export function watchContext(canvas: HTMLCanvasElement, watch: ContextWatch, env: WatchEnv = REAL): () => void {
  let cancel: (() => void) | null = null;
  let away = false;

  const settle = (): void => {
    cancel?.();
    cancel = null;
    away = false;
    const now = env.now();
    const history = recentReloads(read(), now);
    // A reload only when its record is kept: without storage the limit could not be kept, and a device that lost its context on every load
    // would be reloaded forever. Then the game goes on as it is.
    if (mayReload(history, now) && write([...history, now])) {
      watch.settled(true);
      env.reload();
    } else {
      watch.settled(false);
    }
  };

  const onLost = (): void => {
    if (away) return;
    away = true;
    watch.lost();
    cancel = env.setTimer(settle, RESTORE_WAIT_MS);
  };
  const onRestored = (): void => {
    if (away) settle();
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  return () => {
    cancel?.();
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
