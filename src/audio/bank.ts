/**
 * SoundBank: AudioBuffers baked per catalogue index, one variant at a time. A sound is baked on first use (the caller waits for
 * ensure(), which resolves with the first variant while the rest follow), ahead of its use by a frame-budgeted queue (bakeStep: the
 * game's warm-up asks for one variant per call), or in small idle slices queued after the context unlocks. So there is no boot
 * hitch and a sound is almost always ready before it is first heard.
 *
 * The bank holds at most `bankBudget(sampleRate)` bytes. A bake that would pass it drops the least recently played sounds first
 * (never one that is still baking, never the one that just landed); a dropped sound is simply baked again on its next use.
 */
import { bakeVariant } from './bake';
import { SOUNDS } from './sounds';

/**
 * The decoded-memory budget of the pre-rendered bank in decimal megabytes of mono float32 at 48 kHz: the figure the quality report
 * checks (all 140 sounds with every variant measure 13.0 of it).
 */
export const BANK_BUDGET_MB = 14;

/** The budget in bytes at a context's sample rate: the same amount of sound, so a 96 kHz device holds twice the bytes. */
export function bankBudget(sampleRate: number): number {
  return Math.round((BANK_BUDGET_MB * 1_000_000 * sampleRate) / 48000);
}

/** How many variants a catalogue entry is baked in. */
export function variantsOf(index: number): number {
  return SOUNDS[index]?.recipe.variants ?? 1;
}

interface Waiter {
  index: number;
  /** Wait for every variant, not just the first. */
  all: boolean;
  resolve: (buffers: AudioBuffer[] | undefined) => void;
}

function bytesOf(buffers: readonly AudioBuffer[]): number {
  let n = 0;
  for (const b of buffers) n += b.length * b.numberOfChannels * 4;
  return n;
}

export class SoundBank {
  /** The variants baked so far, in the order they landed: one or more once any has, all of them when the sound is complete. */
  private readonly sets: Array<AudioBuffer[] | undefined> = [];
  /** Bit v is set while variant v of the sound is baked or being baked. */
  private readonly claimed: number[] = [];
  /** Renders in flight per sound. */
  private readonly flying: number[] = [];
  /** When each sound was last played or baked (the bank's own counter), for the least-recently-used rule. */
  private readonly stamp: number[] = [];
  private readonly waiters: Waiter[] = [];
  /** Sounds whose remaining variants follow one another without being asked (a first use or an idle slice wants them all). */
  private readonly filling = new Set<number>();
  private readonly budget: number;
  private clock = 0;
  private held = 0;
  private inFlight = 0;
  private queue: number[] = [];
  private scheduled = false;
  private disposed = false;
  /** Sounds whose bake threw: they are not retried on every play, the engine synthesises them live. */
  private readonly failed = new Set<number>();
  private idleId: number | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private warned = false;
  /** Baking time per variant in ms (start to landing), so a slow device is visible in the debug stats. */
  bakeMs = 0;
  /** Sounds dropped to stay inside the budget. */
  evicted = 0;

  constructor(
    private readonly sampleRate: number,
    budget = bankBudget(sampleRate),
  ) {
    this.budget = budget;
  }

  /** The baked variants of a sound (a partial list while the rest are still baking), or undefined. Counts as a use. */
  get(index: number): AudioBuffer[] | undefined {
    const set = this.sets[index];
    if (set) this.stamp[index] = ++this.clock;
    return set;
  }

  /** Whether every variant of the sound is baked. */
  complete(index: number): boolean {
    return (this.sets[index]?.length ?? 0) >= variantsOf(index);
  }

  /** Sounds with every variant baked. */
  get bakedCount(): number {
    let n = 0;
    for (let i = 0; i < this.sets.length; i++) if (this.complete(i)) n++;
    return n;
  }

  /** Memory held by the baked buffers. */
  get bytes(): number {
    return this.held;
  }

  get limit(): number {
    return this.budget;
  }

  get pending(): number {
    return this.queue.length + this.inFlight;
  }

  hasFailed(index: number): boolean {
    return this.failed.has(index);
  }

  /** Variants of a sound that are neither baked nor on their way (0 for an unknown, failed or disposed sound). */
  left(index: number): number {
    if (this.disposed || this.failed.has(index) || !SOUNDS[index]) return 0;
    const taken = this.claimed[index] ?? 0;
    let n = 0;
    for (let v = 0; v < variantsOf(index); v++) if ((taken & (1 << v)) === 0) n++;
    return n;
  }

  /**
   * Start baking the next variant of a sound that is not baked or on its way: one bounded step of work, whose synchronous part (building
   * the offline graph, 2 to 14 ms) lands in the caller's frame and whose render runs on the audio thread.
   * @returns whether a bake started
   */
  bakeStep(index: number): boolean {
    if (this.left(index) === 0) return false;
    const def = SOUNDS[index];
    if (!def) return false;
    const taken = this.claimed[index] ?? 0;
    let v = 0;
    while ((taken & (1 << v)) !== 0) v++;
    this.claimed[index] = taken | (1 << v);
    this.flying[index] = (this.flying[index] ?? 0) + 1;
    this.inFlight++;
    const t0 = performance.now();
    void bakeVariant(def.recipe, def.key, v, this.sampleRate).then(
      (baked) => this.landed(index, baked.buffer, t0),
      (err: unknown) => this.broke(index, t0, err),
    );
    return true;
  }

  /**
   * The first variant of a sound, baking it now when nothing is on its way; the remaining variants follow one after another
   * (`all`: wait for them too). Resolves with what is baked, or undefined when the bake failed.
   */
  ensure(index: number, all = false): Promise<AudioBuffer[] | undefined> {
    const have = this.sets[index];
    if (have && (!all || this.complete(index))) {
      this.stamp[index] = ++this.clock;
      return Promise.resolve(have);
    }
    if (this.failed.has(index) || this.disposed || !SOUNDS[index]) return Promise.resolve(have);
    this.filling.add(index);
    if ((this.flying[index] ?? 0) === 0) this.bakeStep(index);
    return new Promise((resolve) => this.waiters.push({ index, all, resolve }));
  }

  /** Queue indices for background baking, one sound per idle slice. */
  enqueue(indices: readonly number[]): void {
    for (const i of indices) if (!this.complete(i) && !this.queue.includes(i)) this.queue.push(i);
    this.schedule();
  }

  /** Stop background baking and forget the queue; buffers already baked stay readable and nobody waits for a bake any more. */
  dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.filling.clear();
    if (this.idleId !== null) cancelIdleCallback(this.idleId);
    if (this.timerId !== null) clearTimeout(this.timerId);
    this.idleId = null;
    this.timerId = null;
    this.scheduled = false;
    for (const w of this.waiters.splice(0)) w.resolve(this.sets[w.index]);
  }

  private landed(index: number, buffer: AudioBuffer, t0: number): void {
    this.inFlight--;
    this.flying[index] = (this.flying[index] ?? 1) - 1;
    this.bakeMs += performance.now() - t0;
    if (this.disposed) return;
    const set = this.sets[index] ?? [];
    this.sets[index] = set;
    set.push(buffer);
    this.held += buffer.length * buffer.numberOfChannels * 4;
    this.stamp[index] = ++this.clock;
    this.evictFor(index);
    this.settle(index);
    if (this.filling.has(index) && !this.complete(index) && !this.bakeStep(index)) this.filling.delete(index);
    else if (this.complete(index)) this.filling.delete(index);
  }

  private broke(index: number, t0: number, err: unknown): void {
    this.inFlight--;
    this.flying[index] = (this.flying[index] ?? 1) - 1;
    this.bakeMs += performance.now() - t0;
    this.failed.add(index);
    this.filling.delete(index);
    if (!this.warned) {
      this.warned = true;
      console.warn(`[audio] could not bake "${SOUNDS[index]?.key ?? index}"`, err);
    }
    this.settle(index);
  }

  /** Answer the callers that were waiting for this sound: the first variant has landed, or all of them, or the bake failed. */
  private settle(index: number): void {
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i] as Waiter;
      if (w.index !== index) continue;
      const set = this.sets[index];
      if (this.failed.has(index) || (set && (!w.all || this.complete(index)))) {
        this.waiters.splice(i, 1);
        w.resolve(set);
      }
    }
  }

  /** Drop the least recently played sounds until the bank fits its budget again; `keep` (the one that just landed) and sounds still baking stay. */
  private evictFor(keep: number): void {
    while (this.held > this.budget) {
      let victim = -1;
      for (let i = 0; i < this.sets.length; i++) {
        if (i === keep || !this.sets[i] || (this.flying[i] ?? 0) > 0) continue;
        if (victim < 0 || (this.stamp[i] ?? 0) < (this.stamp[victim] ?? 0)) victim = i;
      }
      if (victim < 0) return;
      this.held -= bytesOf(this.sets[victim] as AudioBuffer[]);
      this.sets[victim] = undefined;
      this.claimed[victim] = 0;
      this.filling.delete(victim);
      this.evicted++;
    }
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
      void this.ensure(next, true).then(() => this.schedule());
    };
    if (typeof requestIdleCallback === 'function') this.idleId = requestIdleCallback(run, { timeout: 250 });
    else this.timerId = setTimeout(run, 24);
  }
}
