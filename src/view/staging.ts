import { game } from '@/core/game';

let until = 0;

/**
 * Real seconds the lucky cat's toy capsule opens its lid before the toy screen comes up. The pick opens at the end of the very tick the
 * lid opens in and the battle's clock stops with it, so the lid's fireworks (`director/sp/capsule.ts`) run on the real clock for this long.
 */
export const CAPSULE_TOY_WAIT = 0.4;

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

/**
 * Real seconds from now until the lucky cat's toy screen may come up: whatever still holds the stage (the skills' banners that play or wait, the
 * boss banner) and then the lid's own `CAPSULE_TOY_WAIT`, so that the lid and its fireworks are SEEN before the screen replaces them.
 */
export function capsuleToyWait(): number {
  return stageHeldFor() + CAPSULE_TOY_WAIT;
}

/** Real seconds the toy screen of a relic offer waits before it comes up: a capsule's toy waits for the banners and then for its lid, a stage's pick for the boss banner. */
export function relicOfferWait(source?: 'capsule'): number {
  return source === 'capsule' ? capsuleToyWait() : stageHeldFor();
}
