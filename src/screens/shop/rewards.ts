import { Container, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { flyIconCount, flyTo } from '@/fx';
import type { BundlePart } from '@/meta/bundle';
import { drawIcon, showRewards, type RewardTilePoint } from '@/ui';
import { getShell } from './context';
import { flyingCurrencies, rewardDescs } from './shopLogic';

const CURRENCY_ICON = { gold: 'coin', gems: 'gem', tickets: 'ticket' } as const;

function lookup(key: string): Texture | null {
  return hasTex(key) ? tex(key) : null;
}

/**
 * The "you received" popup for a bundle. When the player claims, every currency tile sends a few icons
 * flying to the matching spot in the top bar, and the bar is refreshed when the last one lands.
 */
export async function showRewardsPopup(parts: readonly BundlePart[], title?: string): Promise<void> {
  const shell = getShell();
  const descs = rewardDescs(parts, lookup);
  if (descs.length === 0) return;
  const currencies = flyingCurrencies(parts);
  await showRewards({
    title: title ?? t('rewards.title'),
    rewards: descs,
    claimLabel: t('rewards.claim'),
    onChoose: (_choice, tiles) => {
      if (!shell) return;
      let pending = 0;
      const landed = (): void => {
        pending--;
        if (pending <= 0) shell.refresh();
      };
      for (const tile of tiles) {
        const kind = currencies.find((c) => CURRENCY_ICON[c.kind] === tile.reward.icon && c.n === tile.reward.amount)?.kind;
        if (!kind) continue;
        pending++;
        flyFrom(tile, kind, shell.currencyAnchor(kind), landed);
      }
      if (pending === 0) shell.refresh();
    },
  });
}

function flyFrom(tile: RewardTilePoint, kind: 'gold' | 'gems' | 'tickets', to: { x: number; y: number }, onDone: () => void): void {
  const from = game.overlayLayer.toLocal({ x: tile.x, y: tile.y });
  flyTo({
    from: { x: from.x, y: from.y },
    to,
    count: flyIconCount(tile.reward.amount, 8),
    make: (): Container => drawIcon(CURRENCY_ICON[kind], 48),
    onDone,
  });
}
