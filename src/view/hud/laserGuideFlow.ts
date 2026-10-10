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

// ───────────────────────── the paw that rides the lane ─────────────────────────

/**
 * The enemy the paw rides while the player is asked to put the dot down: the one it has been riding for as long as that one is on the field,
 * otherwise the one furthest along the loop. Without the first rule a faster enemy that overtakes the leader, or a new leader after a kill,
 * pulled the paw across the whole lane and back.
 */
export function followedEnemy<E extends { uid: number; travelled: number }>(enemies: ReadonlyArray<E>, riding: number | null): E | null {
  let lead: E | null = null;
  for (const e of enemies) {
    if (e.uid === riding) return e;
    if (!lead || e.travelled > lead.travelled) lead = e;
  }
  return lead;
}

/** Which side the paw's arm trails from while it rides at (x, y) on a screen of w x h. */
export type RideArm = 'upperLeft' | 'upperRight' | 'lowerLeft' | 'lowerRight';

/** How far past the line between two arms the paw has to ride before it turns the other way (px): riding along the line does not make it flip. */
export const ARM_HYSTERESIS = 60;
/** Where the arms change: below this share of the screen's height the arm comes down from above, right of this share of its width it leans left. */
const ARM_Y = 0.45;
const ARM_X = 0.6;

export function ridingArm(x: number, y: number, w: number, h: number, was: RideArm | null): RideArm {
  const below = was === null ? y > h * ARM_Y : was.startsWith('upper') ? y > h * ARM_Y - ARM_HYSTERESIS : y > h * ARM_Y + ARM_HYSTERESIS;
  const right = was === null ? x > w * ARM_X : was.endsWith('Left') ? x > w * ARM_X - ARM_HYSTERESIS : x > w * ARM_X + ARM_HYSTERESIS;
  if (below) return right ? 'upperLeft' : 'upperRight';
  return right ? 'lowerLeft' : 'lowerRight';
}
