/** What a claim looks like: icons burst out of the tapped control and fly into the top bar, or the reward popup for anything else. */
import type { Container } from 'pixi.js';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import { uiTweens } from '@/core/tween';
import { flyTo } from '@/fx';
import { flightArt } from '../../partPicture';
import { flightTuning, originX } from '../../shell/flight';
import type { BundlePart } from '@/meta/bundle';
import { services, type Shell } from '../../contract';
import { stampPending } from './marks';
import { currencyOnly, currencyTotals, flightCount, type CurrencyKind } from './parts';

const KINDS: readonly CurrencyKind[] = ['gold', 'gems', 'tickets'];
/** The most a reward sheet keeps the top bar's numbers back: it stays open as long as the player likes. */
const HOLD_BEHIND_SHEET = 90;
/** How long a flight waits behind a stamp that is landing: the stamp has been seen by then. */
const STAMP_SEEN = 0.2;

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
  // A claim that stamps its line is heard when the stamp lands, and its sheet waits for the stamp to be seen first.
  const stamp = stampPending();
  if (stamp === null) audio.play('reward_claim');
  if (!currencyOnly(parts)) {
    if (!stamp) return services.showRewards(parts, title);
    // The top bar already knows the new balance: it keeps the old numbers back through the stamp's beat and behind the sheet.
    const totals = currencyTotals(parts);
    for (const kind of KINDS) if (totals[kind] > 0) shell.pending(kind, totals[kind], stamp + HOLD_BEHIND_SHEET);
    return uiTweens.call(stamp, () => undefined).finished.then(() => services.showRewards(parts, title, true));
  }
  const totals = currencyTotals(parts);
  for (const kind of KINDS) if (totals[kind] > 0) shell.pending(kind, totals[kind]);
  // The icons burst out of the stamped line: they wait a beat so the stamp is seen before the pile covers it.
  const fly = (): Promise<void> => {
    const flights: Promise<void>[] = [];
    for (const kind of KINDS) {
      const total = totals[kind];
      if (total <= 0) continue;
      let arrived = 0;
      const to = shell.currencyAnchor(kind);
      const handle = flyTo({
        from,
        to,
        ...flightTuning(originX(from), to.x),
        count: flightCount(total),
        size: 52,
        ...flightArt(kind, 52),
        onArrive: () => {
          arrived++;
          shell.landed(kind);
          // A tick on every third coin: a downpour of identical sounds reads as noise.
          if (arrived % 3 === 1) audio.play(kind === 'gems' ? 'gem' : 'coin', { volume: 0.8 });
        },
      });
      flights.push(handle.done);
    }
    return Promise.all(flights).then(() => undefined);
  };
  if (!stamp) return fly();
  return uiTweens.call(Math.min(stamp, STAMP_SEEN), () => undefined).finished.then(fly);
}
