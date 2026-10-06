import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StorageBackend } from '@/core/save';

/** The "lost progress" report is once per session, so every test gets a fresh copy of the module. */
async function freshSave(): Promise<typeof import('@/core/save')> {
  vi.resetModules();
  return import('@/core/save');
}

/** A backend whose writes can be told to fail, or to land only in memory (the browser fallback). */
function flaky(): StorageBackend & { fail: boolean; memoryOnly: boolean; written: string[] } {
  const b = {
    fail: false,
    memoryOnly: false,
    written: [] as string[],
    get: async (): Promise<string | null> => null,
    set: async (_key: string, value: string): Promise<void> => {
      if (b.fail) throw new Error('quota');
      if (!b.memoryOnly) b.written.push(value);
    },
    remove: async (): Promise<void> => {},
    volatile: (): boolean => b.memoryOnly,
  };
  return b;
}

describe('SaveStore when storage cannot be written', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a failed write with a growing delay until it lands', async () => {
    const { SaveStore, setStorageBackend } = await freshSave();
    const b = flaky();
    setStorageBackend(b);
    const store = new SaveStore({ key: 'k', version: 1, defaults: () => ({ gold: 0 }) });
    b.fail = true;
    store.data.gold = 5;
    store.save();
    await vi.advanceTimersByTimeAsync(400);
    expect(b.written).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(b.written).toHaveLength(0);
    b.fail = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(b.written).toHaveLength(1);
    expect(JSON.parse(b.written[0] ?? '{}').data.gold).toBe(5);
    // Landed: no further writes are queued.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.written).toHaveLength(1);
  });

  it('treats a write that only reached memory as lost, keeps trying, and tells the player once', async () => {
    const { SaveStore, setStorageBackend, onStorageVolatile } = await freshSave();
    const b = flaky();
    setStorageBackend(b);
    const told = vi.fn();
    onStorageVolatile(told);
    const store = new SaveStore({ key: 'k2', version: 1, defaults: () => ({ gold: 0 }) });
    b.memoryOnly = true;
    store.data.gold = 9;
    store.save();
    await vi.advanceTimersByTimeAsync(400);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    expect(told).toHaveBeenCalledTimes(1);
    b.memoryOnly = false;
    await vi.advanceTimersByTimeAsync(8000);
    expect(b.written).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(b.written).toHaveLength(1);
    expect(told).toHaveBeenCalledTimes(1);
  });

  it('caps the retry delay at 30 s', async () => {
    const { SaveStore, setStorageBackend } = await freshSave();
    const b = flaky();
    setStorageBackend(b);
    const store = new SaveStore({ key: 'k3', version: 1, defaults: () => ({ gold: 0 }) });
    b.fail = true;
    store.data.gold = 1;
    await store.flush();
    store.save();
    await vi.advanceTimersByTimeAsync(400);
    for (let i = 0; i < 8; i++) await vi.advanceTimersByTimeAsync(30_000);
    b.fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(b.written).toHaveLength(1);
  });
});
