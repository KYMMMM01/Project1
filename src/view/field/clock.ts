import type { PauseReason } from '../context';

/** Seconds a slow-motion takes to ease back to normal speed once its hold has ended. */
const EASE_BACK = 0.2;

/**
 * The battle's time source: converts real frame time into battle time. Game speed multiplies it;
 * pause reasons nest (the battle runs only while none is active); a hit-stop freezes it for a span
 * of real time (the longest request wins); slow-motion scales it for a span and then eases back.
 * Pure logic, no rendering.
 */
export class BattleClock {
  speed = 1;
  private readonly reasons = new Set<PauseReason>();
  private freezeLeft = 0;
  private slowTo = 1;
  private slowHold = 0;
  private slow = 1;

  get paused(): boolean {
    return this.reasons.size > 0;
  }

  /** The pause reasons currently held (QA hooks report them). */
  get held(): PauseReason[] {
    return [...this.reasons];
  }

  /** True when `reason` is the only one holding the battle (no list is made: the HUD asks every frame while a lesson holds). */
  heldOnlyBy(reason: PauseReason): boolean {
    return this.reasons.size === 1 && this.reasons.has(reason);
  }

  get frozen(): boolean {
    return this.freezeLeft > 0;
  }

  /** Current slow-motion factor (1 = normal). */
  get slowFactor(): number {
    return this.slow;
  }

  /** @returns true when the battle's paused state changed. */
  setPaused(reason: PauseReason, paused: boolean): boolean {
    const before = this.paused;
    if (paused) this.reasons.add(reason);
    else this.reasons.delete(reason);
    return before !== this.paused;
  }

  freeze(ms: number): void {
    this.freezeLeft = Math.max(this.freezeLeft, ms / 1000);
  }

  slowmo(scale: number, ms: number): void {
    const s = Math.min(1, Math.max(0.05, scale));
    this.slowTo = this.slowHold > 0 ? Math.min(this.slowTo, s) : s;
    this.slowHold = Math.max(this.slowHold, ms / 1000);
  }

  /**
   * Advance by `dt` real seconds and return how many seconds of battle time that is. `extra`
   * multiplies the result (effect presets that run their own hit-stop).
   */
  tick(dt: number, extra = 1): number {
    const frozen = this.freezeLeft > 0;
    if (frozen) this.freezeLeft = Math.max(0, this.freezeLeft - dt);
    if (this.slowHold > 0) {
      this.slowHold -= dt;
      this.slow = this.slowTo;
    } else if (this.slow < 1) {
      this.slow = this.slow + (dt * (1 - this.slowTo)) / EASE_BACK;
      if (this.slow > 1 - 1e-9) this.slow = 1;
    }
    if (frozen || this.paused) return 0;
    return dt * this.speed * this.slow * extra;
  }
}
