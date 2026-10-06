/**
 * "How long until the boss dies at the current rate?" from the damage dealt over the last five
 * simulated seconds. Fixed-size buckets, no allocation per hit.
 */
export const WINDOW = 5;
const BUCKET = 0.25;
const SLOTS = Math.round(WINDOW / BUCKET);
/** Below this much observed time the rate is too noisy to show. */
const MIN_OBSERVED = 1.5;

export type KillTone = 'green' | 'amber' | 'red';

export class DamageWindow {
  private readonly ids = new Float64Array(SLOTS).fill(-1);
  private readonly sums = new Float64Array(SLOTS);
  private since = 0;

  /** Forget everything and start observing at `now` (a new boss appeared). */
  reset(now: number): void {
    this.ids.fill(-1);
    this.sums.fill(0);
    this.since = now;
  }

  record(now: number, amount: number): void {
    const id = Math.floor(now / BUCKET);
    const slot = id % SLOTS;
    if (this.ids[slot] !== id) {
      this.ids[slot] = id;
      this.sums[slot] = 0;
    }
    this.sums[slot] += amount;
  }

  /** Damage per second over the window, or -1 while there is not enough observation yet. */
  rate(now: number): number {
    const newest = Math.floor(now / BUCKET);
    // The oldest bucket starts a little under five seconds back: divide by the time the buckets really cover.
    const covered = now - (newest - SLOTS + 1) * BUCKET;
    const observed = Math.min(covered, now - this.since);
    if (observed < MIN_OBSERVED) return -1;
    let sum = 0;
    for (let i = 0; i < SLOTS; i++) {
      const id = this.ids[i] as number;
      if (id >= 0 && id > newest - SLOTS) sum += this.sums[i] as number;
    }
    return sum / observed;
  }

  /** Seconds to kill `remainingHp` at the current rate: Infinity when nothing lands, -1 when unknown. */
  estimate(now: number, remainingHp: number): number {
    const r = this.rate(now);
    if (r < 0) return -1;
    if (remainingHp <= 0) return 0;
    return r > 0 ? remainingHp / r : Infinity;
  }
}

/** Green while the kill lands within 2/3 of the time left, amber up to 11/12, red beyond (GDD 10). */
export function killTone(estimate: number, timeLeft: number): KillTone {
  if (timeLeft <= 0) return 'red';
  const ratio = estimate / timeLeft;
  if (ratio < 2 / 3) return 'green';
  if (ratio < 11 / 12) return 'amber';
  return 'red';
}
