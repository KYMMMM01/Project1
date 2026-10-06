import type { EmitterHandle } from './particles';

/** What looping effects (auras, trails, clouds, rays) hand back to their owner. */
export interface FxHandle {
  readonly alive: boolean;
  /** End the effect; particles already in flight finish their lives. */
  stop(): void;
  /** Detach from any followed object and move the effect to a fixed point. */
  moveTo(x: number, y: number): void;
}

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
