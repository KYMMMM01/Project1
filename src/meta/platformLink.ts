/**
 * The meta layer's side of the platform wiring, by interface only: ad counters live in the profile,
 * the IAP catalogue and the grant handler are registered, the Butler Pass flag follows the profile.
 * Nothing here imports a vendor adapter.
 */
import type { AdPersistence } from '@/platform/adPolicy';
import type { AdService } from '@/platform/adService';
import { normalizeLedger, type IapLedgerStore, type IapService } from '@/platform/iapService';
import { iapProductDefs } from './data/catalog';
import type { Profile } from './profile';

/** AdService counters stored in the profile, so they travel with a backup code and a device move. */
export function createAdPersistence(profile: Profile): AdPersistence {
  return {
    load: () => profile.data.ads,
    save: (counters) => {
      profile.data.ads = counters;
      profile.persist();
    },
  };
}

/** The IAP order ledger stored in the profile, written to disk before `save` resolves. */
export function createLedgerStore(profile: Profile): IapLedgerStore {
  return {
    load: () => normalizeLedger(profile.data.iapLedger),
    save: (ledger) => {
      profile.data.iapLedger = ledger;
      return profile.persistNow();
    },
  };
}

export interface PlatformServices {
  ads: Pick<AdService, 'attachPersistence' | 'setAdFree'>;
  iap: Pick<IapService, 'registerProducts' | 'attachLedger' | 'setGrantHandler' | 'setRevokeHandler'>;
}

/**
 * Connect a loaded profile to the ad and purchase services. Returns the function that undoes it.
 * Call after `profile.load()`; the IAP service then recovers any paid-but-ungranted order and
 * reports refunded ones to `profile.revokeOrder`.
 */
export function attachPlatform(profile: Profile, services: PlatformServices): () => void {
  services.ads.attachPersistence(createAdPersistence(profile));
  services.ads.setAdFree(profile.data.owned.butler);
  services.iap.registerProducts(iapProductDefs());
  services.iap.attachLedger(createLedgerStore(profile));
  services.iap.setGrantHandler((productId, orderId, ctx) => profile.grantOrder(productId, orderId, ctx.source));
  services.iap.setRevokeHandler((productId, orderId) => profile.revokeOrder(orderId, productId));
  const off = profile.subscribe(() => services.ads.setAdFree(profile.data.owned.butler));
  return () => {
    off();
    services.iap.setGrantHandler(null);
    services.iap.setRevokeHandler(null);
  };
}
