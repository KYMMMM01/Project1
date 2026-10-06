/** Gameplay start/stop signals for the platform (portals pause ads and show/hide UI around them). Deduplicated. */
import { platform } from '@/platform';

let playing = false;

/** A battle began. */
export function gameplayStart(): void {
  if (playing) return;
  playing = true;
  platform.lifecycle.gameplayStart();
}

/** The battle ended (result shown, or the player left). Safe to call when nothing is running. */
export function gameplayStop(): void {
  if (!playing) return;
  playing = false;
  platform.lifecycle.gameplayStop();
}
