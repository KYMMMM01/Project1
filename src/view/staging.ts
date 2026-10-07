import { game } from '@/core/game';

let until = 0;

/**
 * The director tells the HUD that a staged moment (the boss-defeated banner) still needs the stage for `seconds` of real
 * time: a full screen that the same moment opens, like the toy choice, waits for it instead of covering it half-way.
 */
export function holdStage(seconds: number): void {
  until = Math.max(until, game.time + seconds);
}

/** Real seconds the stage is still held (0 when free). */
export function stageHeldFor(): number {
  return Math.max(0, until - game.time);
}
