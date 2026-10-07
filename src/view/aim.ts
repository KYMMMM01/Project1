import { game } from '@/core/game';

let until = 0;

/**
 * The HUD tells the field that the player is about to place the laser dot (the button was pressed, the card said
 * "use it", the tutorial points at the lane): the field lights the lane as the valid area for `seconds` of real time.
 */
export function startAim(seconds: number): void {
  until = game.time + seconds;
}

/** The dot is down, or the player moved on: the lane goes quiet. */
export function stopAim(): void {
  until = 0;
}

/** Real seconds the lane is still lit for aiming (0 when not aiming). */
export function aimingFor(): number {
  return Math.max(0, until - game.time);
}
