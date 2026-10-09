import { Emitter } from '@/core/events';
import type { CurrencyReason } from '@/game/api';

/** A share of a currency gain that has reached its counter. */
export interface Landing {
  kind: 'fish' | 'purr';
  amount: number;
}

/**
 * The director tells the HUD when a flying icon touches its counter (or when no icon could be sent), so the
 * number ticks up on the frame of the touch and not on a guessed timer that the icons' varying flight times miss.
 */
export const landings = new Emitter<{ landed: Landing }>();

/**
 * Whether a gain is shown by an icon flying to its counter (and so by a landing that pays the number in). The opening purse has no icon, and
 * the steady income (a whole fish every couple of seconds with no place it comes from) would send an icon from the middle of the field to
 * the pill all the time: it just ticks the number.
 */
export function flies(reason: CurrencyReason): boolean {
  return reason !== 'start' && reason !== 'income';
}
