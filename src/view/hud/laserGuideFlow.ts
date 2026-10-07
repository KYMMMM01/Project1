/**
 * The guided first use of the laser pointer, as steps with no display objects in them: spotlight the button and let the
 * player open the explanation, point at the lane while they place the dot, then show them the marks it made. It never
 * holds the clock (the field has to take the touch that places the dot), so there is no pause reason to leave stuck, and
 * doing the real thing at any step moves it along.
 */
import type { BattlePhase } from '@/game';

export type GuideStep = 'wait' | 'press' | 'place' | 'see' | 'done';

/** Give up waiting for the dot after this long (the player is busy with something else): the guide is over and not shown again. */
export const PLACE_PATIENCE = 24;
/** How long the marks and the cats' reaction are pointed out. */
export const SEE_FOR = 4.5;
/** Enemies that must be on the field before the guide starts, so the marks have something to land on. */
export const GUIDE_ENEMIES = 2;

export interface GuideWorld {
  phase: BattlePhase;
  enemies: number;
  /** The laser can be placed right now. */
  ready: boolean;
  /** A popup, a staged banner, a drag or a forced tutorial step is going on. */
  busy: boolean;
}

/** True when the guide may begin: a wave is running with a few enemies in it, the laser is ready and nothing else has the player's attention. */
export function guideDue(w: GuideWorld): boolean {
  return w.phase === 'wave' && w.enemies >= GUIDE_ENEMIES && w.ready && !w.busy;
}

export class LaserGuideFlow {
  step: GuideStep = 'wait';
  private clock = 0;

  /** The world is right: spotlight the button. */
  start(): void {
    if (this.step !== 'wait') return;
    this.step = 'press';
    this.clock = 0;
  }

  /** The explanation card was closed (with "use it" or without): the player has read it, so on to the dot. */
  onCardClosed(): void {
    if (this.step !== 'press') return;
    this.step = 'place';
    this.clock = 0;
  }

  /** The dot went down, from the guide's own pointing or on the player's own initiative. */
  onDot(): void {
    if (this.step !== 'press' && this.step !== 'place') return;
    this.step = 'see';
    this.clock = 0;
  }

  /** `paused`: the clock stands still while a popup is open. Returns true on the frame the guide ends. */
  tick(dt: number, paused: boolean): boolean {
    if (this.step === 'wait' || this.step === 'done' || paused) return false;
    this.clock += dt;
    const limit = this.step === 'see' ? SEE_FOR : this.step === 'place' ? PLACE_PATIENCE : Infinity;
    if (this.clock < limit) return false;
    this.step = 'done';
    return true;
  }

  get done(): boolean {
    return this.step === 'done';
  }
}
