/** Pure helpers on reward bundles shared by every routine screen. */
import { bundleParts, type BundlePart } from '@/meta/bundle';
import type { Bundle } from '@/meta/types';
import type { CurrencyKind } from '../../contract';

export type { CurrencyKind };

export function partsOf(bundle: Bundle): BundlePart[] {
  return bundleParts(bundle);
}

export function isCurrency(part: BundlePart): part is Extract<BundlePart, { kind: CurrencyKind }> {
  return part.kind === 'gold' || part.kind === 'gems' || part.kind === 'tickets';
}

/** True when everything in the reward is a plain currency: it can fly to the top bar without a popup. */
export function currencyOnly(parts: readonly BundlePart[]): boolean {
  return parts.length > 0 && parts.every(isCurrency);
}

export function currencyTotals(parts: readonly BundlePart[]): Record<CurrencyKind, number> {
  const out: Record<CurrencyKind, number> = { gold: 0, gems: 0, tickets: 0 };
  for (const p of parts) if (isCurrency(p)) out[p.kind] += p.n;
  return out;
}

/** Image key of a reward part, or '' when the part is drawn with a vector icon. */
export function textureKey(part: BundlePart): string {
  switch (part.kind) {
    case 'gold':
      return 'icon_gold';
    case 'gems':
      return 'icon_gem';
    case 'chest':
      return part.chest === 'wooden' ? 'icon_chest_wood' : part.chest === 'silver' ? 'icon_chest_silver' : 'icon_chest_gold';
    case 'card':
      return `unit_${part.unit}`;
    default:
      return '';
  }
}

/** Number of icons worth flying for an amount: a few for small sums, a fistful for big ones. */
export function flightCount(total: number): number {
  if (total <= 0) return 0;
  return Math.max(3, Math.min(12, Math.round(Math.sqrt(total))));
}

/** Slight, repeatable tilt for a sticker, in radians, from any integer: seven steps either side of straight. */
export function stickerTilt(n: number): number {
  return ((((n % 7) + 7) % 7) - 3) * 0.014;
}
