/** The first-purchase offer's 72-hour window, kept on this device. */
import { SaveStore } from '@/core/save';
import { profile } from '@/meta';
import { iap } from '@/platform';
import { promoVisible } from './model';

export const PROMO_PRODUCT = 'baby_cat_pack';
/** The card appears after the third run (GDD section 8.3), as a card, never as a popup. */
const MIN_RUNS = 3;

const store = new SaveStore<{ since: number }>({ key: 'meowguard.promo', version: 1, defaults: () => ({ since: 0 }) });
let loading: Promise<void> | null = null;

/** Load the saved window start (once). */
export function loadPromo(): Promise<void> {
  loading ??= store.load();
  return loading;
}

/**
 * Whether the card shows now. The window opens the first time the offer is eligible (the product is
 * still unbought, the platform sells it and three runs are done) and closes 72 hours later.
 */
export function promoActive(): boolean {
  if (!store.loaded) return false;
  const eligible = profile.data.stats.runs >= MIN_RUNS && profile.isPurchasable(PROMO_PRODUCT) && iap.isAvailable(PROMO_PRODUCT);
  if (!eligible) return false;
  const now = profile.now();
  if (store.data.since <= 0) {
    store.data.since = now;
    store.save();
  }
  return promoVisible(store.data.since, now);
}
