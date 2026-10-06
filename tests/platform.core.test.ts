import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS, Analytics } from '@/platform/analytics';
import {
  createLocalStorageBackend,
  createMemoryBackend,
  createStoragePersistence,
  safeStorage,
} from '@/platform/storage';
import { createBusyFlag, settleWithin, utf8Length } from '@/platform/util';
import { ModalGate } from '@/platform/modal';
import { makePauser } from './platformHelpers';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Analytics', () => {
  it('uses the event names from docs/명세_메타.md section 11', () => {
    expect([...ANALYTICS_EVENTS]).toEqual([
      'run_start',
      'run_end',
      'tutorial_step',
      'ad_offer',
      'ad_result',
      'iap_view',
      'iap_result',
      'currency',
      'chest_open',
      'unit_level',
      'mission_claim',
      'feature_unlock',
    ]);
  });

  it('keeps a 200-entry ring buffer, oldest dropped first', () => {
    const a = new Analytics();
    for (let i = 0; i < 250; i++) a.track('currency', { i });
    const buf = a.buffer();
    expect(buf).toHaveLength(200);
    expect(buf[0]?.params.i).toBe(50);
    expect(buf[199]?.params.i).toBe(249);
    expect(a.count).toBe(250);
    expect(a.last(3).map((r) => r.params.i)).toEqual([247, 248, 249]);
    a.clear();
    expect(a.buffer()).toEqual([]);
  });

  it('mirrors to console.debug only when enabled and never throws from a sink or the hook', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const quiet = new Analytics();
    quiet.track('run_start');
    expect(spy).not.toHaveBeenCalled();
    const loud = new Analytics({ console: true });
    loud.addSink(() => {
      throw new Error('sink');
    });
    const hooked: string[] = [];
    loud.setAdapterHook((e, p) => {
      hooked.push(`${e}:${String(p.mode)}`);
      throw new Error('hook');
    });
    expect(() => loud.track('run_end', { mode: 'classic' })).not.toThrow();
    expect(spy).toHaveBeenCalledOnce();
    expect(hooked).toEqual(['run_end:classic']);
    expect(loud.buffer()).toHaveLength(1);
  });

  it('exposes a debug api for debugExpose', () => {
    const a = new Analytics();
    a.track('ad_offer', { placement: 'revive' });
    const api = a.debugApi() as { buffer(): unknown[]; count(): number };
    expect(api.buffer()).toHaveLength(1);
    expect(api.count()).toBe(1);
  });
});

describe('storage never throws and always settles', () => {
  it('safeStorage turns a throwing backend into a memory fallback', async () => {
    const boom = {
      get: () => {
        throw new Error('sync');
      },
      set: () => Promise.reject(new Error('quota')),
      remove: () => Promise.reject(new Error('nope')),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = safeStorage(boom, { maxBytes: 100 });
    await expect(s.get('k')).resolves.toBeNull();
    await expect(s.set('k', 'v')).resolves.toBeUndefined();
    await expect(s.get('k')).resolves.toBe('v'); // readable for the session
    await expect(s.remove('k')).resolves.toBeUndefined();
    await expect(s.get('k')).resolves.toBeNull();
  });

  it('safeStorage settles when the backend hangs', async () => {
    const hang = {
      get: () => new Promise<string | null>(() => undefined),
      set: () => new Promise<void>(() => undefined),
      remove: () => new Promise<void>(() => undefined),
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = safeStorage(hang, { maxBytes: 100, timeoutMs: 1000 });
    let done = 0;
    const all = Promise.all([s.get('a'), s.set('a', 'x'), s.remove('a')]).then(() => (done = 1));
    await vi.advanceTimersByTimeAsync(1000);
    await all;
    expect(done).toBe(1);
  });

  it('safeStorage refuses oversized values (kept in memory, never sent) and reports maxBytes', async () => {
    const sent: string[] = [];
    const raw = createMemoryBackend();
    const spySet = raw.set.bind(raw);
    raw.set = async (k, v) => {
      sent.push(k);
      await spySet(k, v);
    };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const s = safeStorage(raw, { maxBytes: 10 });
    expect(s.maxBytes).toBe(10);
    await s.set('big', 'x'.repeat(11));
    await s.set('ok', 'x'.repeat(10));
    expect(sent).toEqual(['ok']);
    await expect(s.get('big')).resolves.toBe('x'.repeat(11));
  });

  it('the localStorage backend works with no window at all (node) and as a plain round trip', async () => {
    const b = createLocalStorageBackend();
    await b.set('a', '1');
    await expect(b.get('a')).resolves.toBe('1');
    await b.remove('a');
    await expect(b.get('a')).resolves.toBeNull();
  });

  it('counts UTF-8 bytes', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('가')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
  });

  it('StoragePersistence: sync load/save over async storage with hydrate and coalesced writes', async () => {
    const raw = createMemoryBackend();
    await raw.set('k', JSON.stringify({ n: 7 }));
    let writes = 0;
    const set = raw.set.bind(raw);
    raw.set = async (k, v) => {
      writes++;
      await set(k, v);
    };
    const p = createStoragePersistence(raw, 'k', (x) => ({ n: (x as { n?: number } | undefined)?.n ?? 0 }));
    expect(p.load()).toEqual({ n: 0 });
    await p.hydrate();
    expect(p.load()).toEqual({ n: 7 });
    p.save({ n: 8 });
    p.save({ n: 9 });
    p.save({ n: 10 });
    await p.flush();
    expect(writes).toBe(1); // three saves in one tick -> one write
    expect(JSON.parse((await raw.get('k')) ?? '{}')).toEqual({ n: 10 });
    await raw.set('k', 'not json {');
    await p.hydrate();
    expect(p.load()).toEqual({ n: 0 }); // corrupt data degrades to defaults
  });

  it('createBusyFlag expires so a silent SDK cannot disable ads for the whole session', () => {
    let t = 1_000;
    const f = createBusyFlag(500, () => t);
    expect(f.active).toBe(false);
    f.begin();
    expect(f.active).toBe(true);
    t += 499;
    expect(f.active).toBe(true);
    t += 1;
    expect(f.active).toBe(false);
    f.begin();
    f.end();
    expect(f.active).toBe(false);
  });

  it('settleWithin never rejects', async () => {
    await expect(settleWithin(Promise.reject(new Error('x')), 10, 'fb')).resolves.toBe('fb');
    await expect(settleWithin(Promise.resolve('ok'), 10, 'fb')).resolves.toBe('ok');
  });
});

describe('ModalGate', () => {
  it('pauses+mutes once, refuses a second lease, restores idempotently even if the pauser throws', () => {
    const p = makePauser();
    const gate = new ModalGate(p.pauser);
    const a = gate.acquire('a');
    expect(a).not.toBeNull();
    expect(gate.acquire('b')).toBeNull();
    a?.release();
    a?.release();
    // input is blocked first and released first; pause and mute mirror each other
    expect(p.calls).toEqual(['block:true', 'pause:true', 'mute:true', 'block:false', 'mute:false', 'pause:false']);
    expect(gate.busy).toBe(false);

    const angry = new ModalGate({
      setInputBlocked: () => {
        throw new Error('b');
      },
      setPaused: () => {
        throw new Error('p');
      },
      setMuted: () => {
        throw new Error('m');
      },
    });
    const l = angry.acquire('x');
    expect(() => l?.release()).not.toThrow();
    expect(angry.busy).toBe(false);
  });

  it('works with a pauser that has no input shield', () => {
    const calls: string[] = [];
    const gate = new ModalGate({ setPaused: (v) => calls.push(`p${v}`), setMuted: (v) => calls.push(`m${v}`) });
    gate.acquire('a')?.release();
    expect(calls).toEqual(['ptrue', 'mtrue', 'mfalse', 'pfalse']);
  });
});
