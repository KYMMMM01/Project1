import type { EmitterHandle } from './particles';

/** What looping effects (auras, trails, clouds, rays) hand back to their owner. */
export interface FxHandle {
  readonly alive: boolean;
  /** End the effect; particles already in flight finish their lives. */
  stop(): void;
  /** Detach from any followed object and move the effect to a fixed point. */
  moveTo(x: number, y: number): void;
}

/** When a composite effect peaks and when it is over, in seconds from the call. */
export interface FxTimeline {
  /** Moment of impact: reveal the unit, drop the loot, hide the boss. */
  impact: number;
  /** Seconds until the effect has fully played out. */
  duration: number;
}

/**
 * A timeline you can also await. The promise settles when the sequence is over, or earlier when its
 * clock is killed (scene exit, Fx.clear()), so an `await` can never hang. Awaiting is optional:
 * every sequence is non-blocking and plays on its own.
 */
export type FxSequence = Promise<void> & FxTimeline;

/** Several emitters controlled as one effect. */
export class EmitterGroup implements FxHandle {
  constructor(private readonly emitters: readonly EmitterHandle[]) {}

  get alive(): boolean {
    for (const e of this.emitters) if (e.alive) return true;
    return false;
  }

  stop(): void {
    for (const e of this.emitters) e.stop();
  }

  moveTo(x: number, y: number): void {
    for (const e of this.emitters) e.moveTo(x, y);
  }
}
