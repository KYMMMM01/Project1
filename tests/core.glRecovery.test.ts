import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELOAD_LIMIT, RELOAD_WINDOW_MS, RESTORE_WAIT_MS, mayReload, recentReloads, watchContext, type WatchEnv } from '@/core/glRecovery';

/** A session storage that lives in a map, so the reload history is kept between the pages of a test. */
function storage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

interface Rig {
  canvas: EventTarget;
  events: string[];
  reloads: number;
  clock: { now: number };
  fire: () => void;
  env: WatchEnv;
  stop: () => void;
}

function rig(): Rig {
  const canvas = new EventTarget();
  const events: string[] = [];
  const clock = { now: 1_000_000 };
  const timers: Array<{ at: number; fn: () => void; live: boolean }> = [];
  const r: Rig = {
    canvas,
    events,
    reloads: 0,
    clock,
    fire: () => {
      for (const t of timers.slice()) {
        if (t.live && t.at <= clock.now) {
          t.live = false;
          t.fn();
        }
      }
    },
    env: {
      now: () => clock.now,
      reload: () => void r.reloads++,
      setTimer: (fn, ms) => {
        const t = { at: clock.now + ms, fn, live: true };
        timers.push(t);
        return () => {
          t.live = false;
        };
      },
    },
    stop: () => undefined,
  };
  r.stop = watchContext(
    canvas as unknown as HTMLCanvasElement,
    {
      lost: () => events.push('lost'),
      settled: (reloading) => events.push(reloading ? 'reload' : 'carry-on'),
    },
    r.env,
  );
  return r;
}

describe('the reload limit', () => {
  it('counts only the reloads of the last two minutes', () => {
    const now = 1_000_000;
    expect(recentReloads([now - RELOAD_WINDOW_MS - 1, now - 5, now + 50], now)).toEqual([now - 5]);
    expect(mayReload([], now)).toBe(true);
    expect(mayReload([now - 10], now)).toBe(RELOAD_LIMIT > 1);
    expect(mayReload([now - 10, now - 20], now)).toBe(RELOAD_LIMIT > 2);
    expect(mayReload([now - RELOAD_WINDOW_MS - 5, now - RELOAD_WINDOW_MS - 9], now)).toBe(true);
  });
});

describe('a lost graphics context', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', storage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stops the game at once and starts the page again when the context comes back', () => {
    const r = rig();
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(r.events).toEqual(['lost']);
    expect(r.reloads).toBe(0);
    r.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(r.events).toEqual(['lost', 'reload']);
    expect(r.reloads).toBe(1);
    // The wait that was running is over: nothing else happens.
    r.clock.now += RESTORE_WAIT_MS + 1;
    r.fire();
    expect(r.reloads).toBe(1);
    r.stop();
  });

  it('never reloads when the reload history cannot be stored (no storage): the game goes on, so a page cannot loop', () => {
    const broken = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => undefined, clear: () => undefined, key: () => null, length: 0,
    } as unknown as Storage;
    vi.stubGlobal('sessionStorage', broken);
    for (let i = 0; i < 4; i++) {
      const r = rig();
      r.canvas.dispatchEvent(new Event('webglcontextlost'));
      r.canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(r.reloads, `loss ${i + 1}`).toBe(0);
      expect(r.events).toEqual(['lost', 'carry-on']);
      r.stop();
    }
  });

  it('starts the page again when the context does not come back in time', () => {
    const r = rig();
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    r.clock.now += RESTORE_WAIT_MS - 1;
    r.fire();
    expect(r.reloads).toBe(0);
    r.clock.now += 2;
    r.fire();
    expect(r.events).toEqual(['lost', 'reload']);
    expect(r.reloads).toBe(1);
    r.stop();
  });

  it('ignores a second loss while the first is waited for, and a restore nobody was waiting for', () => {
    const r = rig();
    r.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(r.events).toEqual([]);
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(r.events).toEqual(['lost']);
    r.stop();
  });

  it('plays on after the allowed reloads in two minutes instead of reloading for ever', () => {
    const r = rig();
    for (let i = 0; i < RELOAD_LIMIT; i++) {
      r.canvas.dispatchEvent(new Event('webglcontextlost'));
      r.canvas.dispatchEvent(new Event('webglcontextrestored'));
      r.clock.now += 10_000;
    }
    expect(r.reloads).toBe(RELOAD_LIMIT);
    r.events.length = 0;
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    r.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(r.events).toEqual(['lost', 'carry-on']);
    expect(r.reloads).toBe(RELOAD_LIMIT);
    // Two minutes on, a loss is answered as it was.
    r.clock.now += RELOAD_WINDOW_MS + 1;
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    r.canvas.dispatchEvent(new Event('webglcontextrestored'));
    expect(r.reloads).toBe(RELOAD_LIMIT + 1);
    r.stop();
  });

  it('stops listening when asked to', () => {
    const r = rig();
    r.stop();
    r.canvas.dispatchEvent(new Event('webglcontextlost'));
    expect(r.events).toEqual([]);
  });
});
