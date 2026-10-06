/**
 * Particle accounting. Pure so the policy can be unit-tested without a renderer.
 *
 * Priorities: 0 ambient/decor, 1 normal, 2 important (crits, merges), 3 critical (rare reveals).
 * Each priority may only fill the pool up to a fraction of the cap, so when the pool is crowded the
 * least important emissions are refused first and critical ones keep the last slots.
 */
export const PRIORITY_FILL: readonly number[] = [0.55, 0.8, 0.95, 1];

export type Rng = () => number;

export class ParticleBudget {
  live = 0;
  peak = 0;
  /** Particles that were wanted but refused (stat only). */
  dropped = 0;
  granted = 0;

  /** Hard ceiling; lowering it never kills live particles, it only refuses new ones. */
  cap: number;

  constructor(cap = 700) {
    this.cap = cap;
  }

  /** Slots a priority-`prio` emission may still take (never negative). */
  room(prio: number): number {
    const p = prio < 0 ? 0 : prio > 3 ? 3 : prio | 0;
    const r = Math.floor(this.cap * (PRIORITY_FILL[p] as number)) - this.live;
    return r > 0 ? r : 0;
  }

  /** How many of `want` particles of `prio` may be created right now. Does not reserve them. */
  grant(want: number, prio: number): number {
    if (want <= 0) return 0;
    const r = this.room(prio);
    const n = r < want ? r : want;
    this.note(want, n);
    return n;
  }

  /** Statistics only: `want` were requested, `got` were allowed. */
  note(want: number, got: number): void {
    this.dropped += want - got;
    this.granted += got;
  }

  /** Free slots left for the highest priority. */
  get free(): number {
    return this.cap - this.live;
  }

  add(n: number): void {
    this.live += n;
    if (this.live > this.peak) this.peak = this.live;
  }

  remove(n: number): void {
    this.live = Math.max(0, this.live - n);
  }

  reset(): void {
    this.live = 0;
  }
}

/**
 * Scale an effect's particle count by the quality setting. Fractions are rounded stochastically so
 * 0.25 quality on a 6-particle burst gives 1 or 2 across calls instead of always 1; priority-2+
 * effects never drop to zero so a crit still reads on the lowest setting.
 */
export function scaleCount(n: number, quality: number, prio: number, rng: Rng = Math.random): number {
  if (n <= 0) return 0;
  const x = n * quality;
  let c = Math.floor(x);
  if (rng() < x - c) c++;
  if (c === 0 && prio >= 2) c = 1;
  return c;
}
