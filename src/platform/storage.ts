/**
 * Storage helpers. Hard rule (research C-7): storage calls never throw and always settle, even when
 * localStorage is blocked (private mode, sandboxed iframe) or an SDK never answers.
 * Pure: no module-level DOM access, safe in node.
 */
import type { StorageBackend } from '@/core/save';
import type { PlatformStorage } from './types';
import { settleWithin, utf8Length } from './util';

export function createMemoryBackend(): StorageBackend {
  const m = new Map<string, string>();
  return {
    get: async (key) => m.get(key) ?? null,
    set: async (key, value) => {
      m.set(key, value);
    },
    remove: async (key) => {
      m.delete(key);
    },
  };
}

/**
 * window.localStorage with an in-memory fallback. Never throws, works with no `window` at all. A write
 * localStorage refuses (quota, Safari private mode) is kept in memory and read back from there, so the
 * session never sees stale data; the next write tries localStorage again.
 */
export function createLocalStorageBackend(): StorageBackend {
  const mem = createMemoryBackend();
  let warned = false;
  const ls = (): Storage | null => {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  };
  return {
    async get(key) {
      // A value localStorage refused is newer than whatever it still holds.
      const kept = await mem.get(key);
      if (kept !== null) return kept;
      try {
        const s = ls();
        if (s) return s.getItem(key);
      } catch {
        /* blocked */
      }
      return null;
    },
    async set(key, value) {
      try {
        const s = ls();
        if (s) {
          s.setItem(key, value);
          await mem.remove(key);
          return;
        }
      } catch {
        if (!warned) {
          warned = true;
          try {
            console.warn('[localStorage] write failed; keeping data in memory for this session');
          } catch {
            /* ignore */
          }
        }
      }
      await mem.set(key, value);
    },
    async remove(key) {
      try {
        const s = ls();
        if (s) s.removeItem(key);
      } catch {
        /* ignore */
      }
      await mem.remove(key);
    },
  };
}

export interface SafeStorageOptions {
  /** Largest value (UTF-8 bytes) the platform accepts. */
  maxBytes: number;
  /** A call that has not answered after this long counts as failed. Default 8000. */
  timeoutMs?: number;
  label?: string;
}

const FAILED = Symbol('storage-failed');

/**
 * Wrap a raw backend so that: exceptions and hangs become a memory-only fallback instead of an
 * error, oversized values are refused (kept in memory, not sent), and every promise settles.
 * Values that could not be written stay readable for the session through the memory mirror.
 *
 * A read that fails still has to answer, and "no data" makes the caller (SaveStore) start from
 * defaults. Those defaults must never replace a save that merely could not be read, so writes to such
 * a key stay in memory until a read shows the slot empty, or until the caller has been handed what is
 * stored (it then builds its state from it).
 */
export function safeStorage(raw: StorageBackend, o: SafeStorageOptions): PlatformStorage {
  const timeoutMs = o.timeoutMs ?? 8000;
  const label = o.label ?? 'storage';
  /** key -> value that could not be written through (null = removal that failed). */
  const dirty = new Map<string, string | null>();
  /** Keys whose last read failed: the caller was told "no data" without anyone knowing what is stored. */
  const unread = new Set<string>();
  let warned = false;
  const warnOnce = (msg: string): void => {
    if (warned) return;
    warned = true;
    try {
      console.warn(`[${label}] ${msg}; keeping data in memory for this session`);
    } catch {
      /* ignore */
    }
  };

  const call = async <T>(fn: () => Promise<T>): Promise<T | typeof FAILED> => {
    let p: Promise<T>;
    try {
      p = fn();
    } catch {
      return FAILED;
    }
    return settleWithin<T | typeof FAILED>(p, timeoutMs, FAILED);
  };

  const read = async (key: string): Promise<string | null | typeof FAILED> => {
    const r = await call(() => raw.get(key));
    if (r === FAILED) {
      warnOnce('read failed');
      return FAILED;
    }
    return typeof r === 'string' ? r : null;
  };

  return {
    maxBytes: o.maxBytes,
    async get(key) {
      if (dirty.has(key) && !unread.has(key)) return dirty.get(key) ?? null;
      const r = await read(key);
      if (r === FAILED) {
        unread.add(key);
        return dirty.get(key) ?? null;
      }
      // The caller rebuilds from what it is handed now; writes made without seeing it are void.
      if (unread.delete(key)) dirty.delete(key);
      return r;
    },
    async set(key, value) {
      if (utf8Length(value) > o.maxBytes) {
        warnOnce(`value for "${key}" exceeds ${o.maxBytes} bytes`);
        dirty.set(key, value);
        return;
      }
      if (unread.has(key) && (await read(key)) !== null) {
        dirty.set(key, value);
        return;
      }
      unread.delete(key);
      const r = await call(() => raw.set(key, value));
      if (r === FAILED) {
        warnOnce('write failed');
        dirty.set(key, value);
      } else {
        dirty.delete(key);
      }
    },
    async remove(key) {
      const r = await call(() => raw.remove(key));
      if (r === FAILED) {
        warnOnce('remove failed');
        dirty.set(key, null);
      } else {
        dirty.delete(key);
        unread.delete(key);
      }
    },
  };
}

/**
 * Synchronous JSON persistence on top of async storage, for the services that expose a sync
 * `load()/save()` pair (AdService counters, IAP ledger). `hydrate()` reads once at boot; `save()`
 * updates the cache at once and writes through in the background (coalesced).
 */
export interface StoragePersistence<T> {
  load(): T;
  save(value: T): void;
  hydrate(): Promise<void>;
  /** Resolves when queued writes have been issued. */
  flush(): Promise<void>;
}

export function createStoragePersistence<T>(
  storage: StorageBackend,
  key: string,
  normalize: (raw: unknown) => T,
): StoragePersistence<T> {
  let cache: T = normalize(undefined);
  let queued: Promise<void> = Promise.resolve();
  let dirtyWrite = false;

  const write = (): void => {
    if (dirtyWrite) return;
    dirtyWrite = true;
    queued = queued.then(async () => {
      dirtyWrite = false;
      try {
        await storage.set(key, JSON.stringify(cache));
      } catch {
        /* safeStorage never throws; a custom backend might */
      }
    });
  };

  return {
    load: () => cache,
    save(value) {
      cache = value;
      write();
    },
    async hydrate() {
      try {
        const text = await storage.get(key);
        if (text) cache = normalize(JSON.parse(text));
      } catch {
        cache = normalize(undefined);
      }
    },
    flush: () => queued,
  };
}
