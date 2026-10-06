/**
 * ModalGate: the single place that pauses the game and mutes audio for an ad or a purchase sheet and
 * guarantees the matching restore. Ads and IAP share one gate, so they can never overlap.
 * Pure: the actual pause/mute implementation is injected (boot wires game.setExternalPause and
 * audio.setMuted).
 */
export interface Pauser {
  setPaused(paused: boolean): void;
  setMuted(muted: boolean): void;
}

export interface ModalLease {
  readonly label: string;
  readonly released: boolean;
  /** Restore pause and mute. Idempotent. */
  release(): void;
}

export class ModalGate {
  private current: ModalLease | null = null;

  constructor(private readonly pauser: Pauser) {}

  get busy(): boolean {
    return this.current !== null;
  }

  get label(): string | null {
    return this.current?.label ?? null;
  }

  /** Pause + mute and return a lease, or null if another modal is already open. */
  acquire(label: string): ModalLease | null {
    if (this.current) return null;
    const gate = this;
    let released = false;
    const lease: ModalLease = {
      label,
      get released() {
        return released;
      },
      release() {
        if (released) return;
        released = true;
        if (gate.current === lease) gate.current = null;
        // Restore both even if the first throws; the order mirrors acquire in reverse.
        try {
          gate.pauser.setMuted(false);
        } catch {
          /* keep going */
        }
        try {
          gate.pauser.setPaused(false);
        } catch {
          /* keep going */
        }
      },
    };
    this.current = lease;
    try {
      this.pauser.setPaused(true);
    } catch {
      /* keep going */
    }
    try {
      this.pauser.setMuted(true);
    } catch {
      /* keep going */
    }
    return lease;
  }
}
