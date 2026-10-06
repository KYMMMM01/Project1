/** What a claim looks like: icons burst out of the tapped control and fly into the top bar, or the reward popup for anything else. */
import type { Container } from 'pixi.js';
import { audio } from '@/audio';
import { hasTex, tex } from '@/core/assets';
import { haptic } from '@/core/haptics';
import { flyTo } from '@/fx';
import type { BundlePart } from '@/meta/bundle';
import { services, type Shell } from '../../contract';
import { currencyOnly, currencyTotals, flightCount, textureKey, type CurrencyKind } from './parts';
import { partIcon } from './rewardChip';

const KINDS: readonly CurrencyKind[] = ['gold', 'gems', 'tickets'];

export interface FlightOrigin {
  x: number;
  y: number;
}

/**
 * Give feedback for a reward that was already paid by the meta layer. Plain currencies fly from
 * `from` to their top-bar pill; anything else (chests, cards, skins) goes to the shared reward
 * popup, which flies the currencies itself. Resolves when the feedback is over.
 */
export function payout(shell: Shell, parts: readonly BundlePart[], from: Container | FlightOrigin, title?: string): Promise<void> {
  if (parts.length === 0) return Promise.resolve();
  haptic('success');
  if (!currencyOnly(parts)) {
    audio.play('reward_claim');
    return services.showRewards(parts, title);
  }
  audio.play('reward_claim');
  const totals = currencyTotals(parts);
  const flights: Promise<void>[] = [];
  for (const kind of KINDS) {
    const total = totals[kind];
    if (total <= 0) continue;
    const key = textureKey({ kind, n: total });
    let arrived = 0;
    const handle = flyTo({
      from,
      to: shell.currencyAnchor(kind),
      count: flightCount(total),
      size: 52,
      ...(key && hasTex(key) ? { texture: tex(key) } : { make: () => partIcon({ kind, n: total }, 52) }),
      onArrive: () => {
        arrived++;
        // A tick on every third coin: a downpour of identical sounds reads as noise.
        if (arrived % 3 === 1) audio.play(kind === 'gems' ? 'gem' : 'coin', { volume: 0.8 });
      },
    });
    flights.push(handle.done);
  }
  return Promise.all(flights).then(() => undefined);
}
