/** Pure helpers of the season pass tab: counting, naming and scroll targets. */
import type { PassView } from '@/meta/routines';
import type { Profile } from '@/meta/profile';
import { SEASON_NAME_COUNT } from './strings';

export const PASS_ROW_H = 168;
export const PASS_ROW_GAP = 12;

/** Cells (free and premium) whose reward can be taken right now. */
export function passClaimable(view: PassView): number {
  return view.free.filter((r) => r.claimable).length + view.premiumRow.filter((r) => r.claimable).length;
}

export function passBadgeCount(p: Profile): number {
  return p.featureUnlocked('pass') ? passClaimable(p.passView()) : 0;
}

/** i18n key of the season's name; seasons cycle through a short list of names. */
export function seasonNameKey(season: number): string {
  const i = ((Math.floor(season) % SEASON_NAME_COUNT) + SEASON_NAME_COUNT) % SEASON_NAME_COUNT;
  return `rt.pass.season.${i}`;
}

/** Tier row (1-based) the list opens on: the tier the player has reached, or the first one before any. */
export function focusTier(view: PassView): number {
  return Math.max(1, view.tier);
}

/** Scroll offset that puts row `tier` about a third of the way down the viewport, clamped to the list. */
export function scrollTargetFor(tier: number, viewH: number, contentH: number, topPad = 0): number {
  const rowTop = topPad + (tier - 1) * (PASS_ROW_H + PASS_ROW_GAP);
  const y = rowTop - viewH * 0.3 + PASS_ROW_H / 2;
  return Math.max(0, Math.min(Math.max(0, contentH - viewH), y));
}

/** XP bar fill of the current tier, 0..1 (full at the last tier). */
export function xpFill(view: PassView): number {
  return view.xpPerTier > 0 ? Math.min(1, Math.max(0, view.xpIntoTier / view.xpPerTier)) : 0;
}

/** Premium tiers that opened retroactively with the purchase (reached and not yet claimed). */
export function retroactiveCount(view: PassView): number {
  return view.premiumRow.filter((r) => r.reached && !r.claimed).length;
}
