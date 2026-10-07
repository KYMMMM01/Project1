import { Emitter } from '@/core/events';

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
