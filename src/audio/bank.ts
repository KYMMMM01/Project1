/**
 * SoundBank: lazily baked AudioBuffers per catalogue index. A sound is baked on first use (the
 * caller waits for ensure()) or in small idle slices queued after the context unlocks, so there
 * is no boot hitch and a frequently used sound is almost always ready before it is first heard.
 */
import { bakeVariant } from './bake';
import { SOUNDS } from './sounds';

export class SoundBank {
  private readonly ready: Array<AudioBuffer[] | undefined> = [];
  private readonly jobs = new Map<number, Promise<AudioBuffer[] | undefined>>();
  private queue: number[] = [];
  private scheduled = false;
  private disposed = false;
  /** Sounds whose bake threw: they are not retried on every play, the engine synthesises them live. */
  private readonly failed = new Set<number>();
  private idleId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private warned = false;
  /** Baking time per sound in ms, so a slow device is visible in the debug stats. */
  bakeMs = 0;

  constructor(private readonly sampleRate: number) {}

  get(index: number): AudioBuffer[] | undefined {
    return this.ready[index];
  }

  get bakedCount(): number {
    let n = 0;
    for (const r of this.ready) if (r) n++;
    return n;
  }

  get bytes(): number {
    let n = 0;
    for (const list of this.ready) if (list) for (const b of list) n += b.length * b.numberOfChannels * 4;
    return n;
  }

  get pending(): number {
    return this.queue.length + this.jobs.size;
  }

  hasFailed(index: number): boolean {
    return this.failed.has(index);
  }

  /** Bake every variant of `index` now (shared by concurrent callers). Resolves undefined on failure. */
  ensure(index: number): Promise<AudioBuffer[] | undefined> {
    const done = this.ready[index];
    if (done) return Promise.resolve(done);
    if (this.failed.has(index)) return Promise.resolve(undefined);
    const running = this.jobs.get(index);
    if (running) return running;
    const def = SOUNDS[index];
    if (!def) return Promise.resolve(undefined);
    const job = (async () => {
      const t0 = performance.now();
      try {
        const n = def.recipe.variants ?? 1;
        const out: AudioBuffer[] = [];
        for (let v = 0; v < n; v++) out.push((await bakeVariant(def.recipe, def.key, v, this.sampleRate)).buffer);
        this.ready[index] = out;
        return out;
      } catch (err) {
        this.failed.add(index);
        if (!this.warned) {
          this.warned = true;
          console.warn(`[audio] could not bake "${def.key}"`, err);
        }
        return undefined;
      } finally {
        this.bakeMs += performance.now() - t0;
        this.jobs.delete(index);
      }
    })();
    this.jobs.set(index, job);
    return job;
  }

  /** Queue indices for background baking, one sound per idle slice. */
  enqueue(indices: readonly number[]): void {
    for (const i of indices) if (!this.ready[i] && !this.queue.includes(i)) this.queue.push(i);
    this.schedule();
  }

  /** Stop background baking and forget the queue; buffers already baked stay readable. */
  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    if (this.idleId !== null) cancelIdleCallback(this.idleId);
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.idleId = null;
    this.timerId = null;
    this.scheduled = false;
  }

  private schedule(): void {
    if (this.disposed || this.scheduled || this.queue.length === 0) return;
    this.scheduled = true;
    const run = (deadline?: IdleDeadline): void => {
      this.idleId = null;
      this.timerId = null;
      // A busy frame leaves no idle time: wait for the next slice rather than bake into a long frame.
      if (deadline && !deadline.didTimeout && deadline.timeRemaining() < 3) {
        this.scheduled = false;
        this.schedule();
        return;
      }
      this.scheduled = false;
      const next = this.queue.shift();
      if (next === undefined) return;
      void this.ensure(next).then(() => this.schedule());
    };
    if (typeof requestIdleCallback === 'function') this.idleId = requestIdleCallback(run, { timeout: 250 });
    else this.timerId = setTimeout(run, 24);
  }
}
