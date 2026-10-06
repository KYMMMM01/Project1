import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SaveStore, getStorageBackend, setStorageBackend, type StorageBackend } from '@/core/save';
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
  vi.unstubAllGlobals();
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

  it('the localStorage backend reads back a write localStorage refused, and uses localStorage again once it accepts', async () => {
    const disk = new Map([['k', 'old']]);
    let full = true;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => disk.get(k) ?? null,
        setItem: (k: string, v: string) => {
          if (full) throw new Error('QuotaExceededError');
          disk.set(k, v);
        },
        removeItem: (k: string) => void disk.delete(k),
      },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = createLocalStorageBackend();
    await b.set('k', 'new');
    await b.set('j', 'x');
    await expect(b.get('k')).resolves.toBe('new'); // not the stale 'old'
    await expect(b.get('j')).resolves.toBe('x'); // not null
    expect(disk.get('k')).toBe('old');
    expect(warn).toHaveBeenCalledOnce(); // flagged once, not per write
    full = false;
    await b.set('k', 'newer');
    expect(disk.get('k')).toBe('newer');
    await expect(b.get('k')).resolves.toBe('newer'); // the stashed 'new' no longer shadows localStorage
    await b.remove('k');
    await expect(b.get('k')).resolves.toBeNull();
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

describe('a read that failed is not "no data"', () => {
  const envelope = (gems: number): string => JSON.stringify({ v: 1, t: 0, data: { gems } });
  const gemsOnDisk = (disk: Map<string, string>): unknown => (JSON.parse(disk.get('save') ?? 'null') as { data?: { gems?: number } } | null)?.data?.gems;

  /** A disk whose first read fails (rejects or never answers); every later call works. */
  function flakyDisk(initial: Record<string, string>, firstRead: 'rejects' | 'hangs') {
    const disk = new Map(Object.entries(initial));
    let reads = 0;
    const backend: StorageBackend = {
      get: (key) => {
        reads += 1;
        if (reads > 1) return Promise.resolve(disk.get(key) ?? null);
        return firstRead === 'rejects' ? Promise.reject(new Error('Storage unavailable')) : new Promise<string | null>(() => undefined);
      },
      set: async (key, value) => {
        disk.set(key, value);
      },
      remove: async (key) => {
        disk.delete(key);
      },
    };
    return { disk, backend };
  }

  const newStore = () => new SaveStore({ key: 'save', version: 1, defaults: () => ({ gems: 0 }) });
  let previous: StorageBackend;
  beforeEach(() => {
    previous = getStorageBackend();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => setStorageBackend(previous));

  it.each(['rejects', 'hangs'] as const)('a first read that %s never lets the default profile replace the stored one', async (mode) => {
    const { disk, backend } = flakyDisk({ save: envelope(5000) }, mode);
    setStorageBackend(safeStorage(backend, { maxBytes: 1_000_000 }));
    const store = newStore();
    const loading = store.load();
    await vi.advanceTimersByTimeAsync(8000);
    await loading;
    expect(store.data.gems).toBe(0); // the session starts from defaults ...
    for (const gems of [10, 20]) {
      store.data.gems = gems;
      store.save();
      await store.flush();
    }
    expect(gemsOnDisk(disk)).toBe(5000); // ... but the save on the platform is untouched
  });

  it('writes go through once a read shows the slot is really empty', async () => {
    const { disk, backend } = flakyDisk({}, 'rejects');
    setStorageBackend(safeStorage(backend, { maxBytes: 1_000_000 }));
    const store = newStore();
    await store.load();
    store.data.gems = 7;
    store.save();
    await store.flush();
    expect(gemsOnDisk(disk)).toBe(7);
  });

  it('writes go through once the caller has been handed what is stored', async () => {
    const { disk, backend } = flakyDisk({ save: envelope(5000) }, 'rejects');
    const s = safeStorage(backend, { maxBytes: 1_000_000 });
    await expect(s.get('save')).resolves.toBeNull(); // the failed read
    await s.set('save', envelope(1)); // held: the caller never saw the 5000
    expect(gemsOnDisk(disk)).toBe(5000);
    await expect(s.get('save')).resolves.toBe(envelope(5000)); // the retry succeeds and the caller sees it
    await s.set('save', envelope(5001));
    expect(gemsOnDisk(disk)).toBe(5001);
    await expect(s.get('save')).resolves.toBe(envelope(5001)); // and the held write did not come back
  });

  it('keeps held writes readable for the session while the read keeps failing, and a removal still removes', async () => {
    const raw: StorageBackend = {
      get: () => Promise.reject(new Error('down')),
      set: async () => undefined,
      remove: async () => undefined,
    };
    const s = safeStorage(raw, { maxBytes: 1_000_000 });
    await expect(s.get('k')).resolves.toBeNull();
    await s.set('k', 'mine');
    await expect(s.get('k')).resolves.toBe('mine');
    await s.remove('k');
    await expect(s.get('k')).resolves.toBeNull();
  });

  it('the ad counters and the order ledger are protected the same way', async () => {
    const { disk, backend } = flakyDisk({ ledger: JSON.stringify({ n: 3 }) }, 'rejects');
    const p = createStoragePersistence(safeStorage(backend, { maxBytes: 1_000_000 }), 'ledger', (x) => ({
      n: (x as { n?: number } | undefined)?.n ?? 0,
    }));
    await p.hydrate();
    expect(p.load()).toEqual({ n: 0 });
    p.save({ n: 1 });
    await p.flush();
    expect(JSON.parse(disk.get('ledger') ?? '{}')).toEqual({ n: 3 });
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
