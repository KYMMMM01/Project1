/**
 * Versioned JSON persistence behind a swappable backend. The default backend is localStorage; a
 * portal/store adapter may replace it (CrazyGames data module, Capacitor Preferences, ...) before load.
 */
export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

class LocalStorageBackend implements StorageBackend {
  // Private-mode Safari and sandboxed iframes can throw on any localStorage access; fall back to
  // memory so the game still runs (progress then lasts for the session only).
  private mem = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.mem.get(key) ?? null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      this.mem.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      this.mem.delete(key);
    }
  }
}

let backend: StorageBackend = new LocalStorageBackend();

export function setStorageBackend(b: StorageBackend): void {
  backend = b;
}

export function getStorageBackend(): StorageBackend {
  return backend;
}

interface Envelope<T> {
  v: number;
  t: number;
  data: T;
}

export interface SaveStoreOptions<T> {
  key: string;
  version: number;
  /** Fresh state for a new player. Must return a new object every call. */
  defaults: () => T;
  /**
   * Upgrade data saved by an older version. Receives the raw stored object and its version and must
   * return data valid for the current version. Missing fields are then filled from `defaults()`.
   */
  migrate?: (raw: unknown, fromVersion: number) => unknown;
}

export class SaveStore<T extends object> {
  data: T;
  loaded = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  constructor(private readonly opts: SaveStoreOptions<T>) {
    this.data = opts.defaults();
  }

  async load(): Promise<void> {
    let fresh = this.opts.defaults();
    try {
      const text = await backend.get(this.opts.key);
      if (text) {
        const env = JSON.parse(text) as Envelope<unknown>;
        let raw: unknown = env.data;
        if (typeof env.v === 'number' && env.v < this.opts.version && this.opts.migrate) {
          raw = this.opts.migrate(raw, env.v);
        }
        if (raw && typeof raw === 'object') fresh = deepFill(raw, fresh) as T;
      }
    } catch (err) {
      // A corrupt save must never brick the game: keep the bad blob for support and start fresh.
      console.warn('[save] failed to load, starting fresh', err);
      try {
        const bad = await backend.get(this.opts.key);
        if (bad) await backend.set(this.opts.key + '.corrupt', bad);
      } catch {
        /* ignore */
      }
    }
    this.data = fresh;
    this.loaded = true;
  }

  /** Mark dirty; the write is debounced so bursts of changes cost one serialization. */
  save(): void {
    this.dirty = true;
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, 400);
  }

  /** Write immediately (call on visibility loss / before an ad / at the end of a run). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    const env: Envelope<T> = { v: this.opts.version, t: Date.now(), data: this.data };
    try {
      await backend.set(this.opts.key, JSON.stringify(env));
    } catch (err) {
      console.warn('[save] write failed', err);
      this.dirty = true;
    }
  }

  async reset(): Promise<void> {
    this.data = this.opts.defaults();
    this.dirty = true;
    await this.flush();
  }
}

/**
 * Take `saved` values where they exist and match the default's shape; otherwise keep the default.
 * This is what lets a new build add fields without a migration step. Arrays and records whose
 * default is empty are taken wholesale from the save.
 */
export function deepFill(saved: unknown, def: unknown): unknown {
  if (def === null || def === undefined) return saved ?? def;
  if (Array.isArray(def)) return Array.isArray(saved) ? saved : def;
  if (typeof def === 'object') {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return def;
    const d = def as Record<string, unknown>;
    const s = saved as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const defKeys = Object.keys(d);
    for (const k of defKeys) out[k] = k in s ? deepFill(s[k], d[k]) : d[k];
    // Open-ended records (e.g. unit id -> level): keep saved keys the default does not know about.
    for (const k of Object.keys(s)) if (!(k in out)) out[k] = s[k];
    return out;
  }
  return typeof saved === typeof def ? saved : def;
}
