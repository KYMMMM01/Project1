# src/platform: one codebase, every channel

Ads, in-app purchases, lifecycle signals, storage, leaderboard and analytics sit behind a few singletons.
Gameplay and meta code import them from the barrel and never touch a vendor SDK:

```ts
import { initPlatform, ads, iap, analytics, platform, submitScore } from '@/platform';
```

They exist from the first import (backed by a safe no-ads adapter), so a call made before `initPlatform()`
resolves answers `'unavailable'` and never throws.

## Build-time platform

`VITE_PLATFORM` = `dev` (default) | `itch` | `crazygames` | `poki` | `gd` | `yt` | `toss` | `capacitor`

```
VITE_PLATFORM=poki npx vite build           # only the Poki adapter + its SDK URL end up in the bundle
VITE_PLATFORM=gd VITE_GD_GAME_ID=xxxx npx vite build
```

`resolve.ts` compares the literal env constant in each branch, so the bundler folds the others away.
Per-platform variables (all optional, read at build time):

| variable | used by |
|---|---|
| `VITE_GD_GAME_ID` | gd (required, otherwise the adapter refuses to start and the safe fallback runs) |
| `VITE_TOSS_REWARDED_AD_GROUP_ID` | toss |
| `VITE_ADMOB_REWARDED_ID`, `VITE_ADMOB_TESTING=1` | capacitor |

## Boot (3 lines in `src/main.ts`)

```ts
await preparePlatformRuntime();   // toss only: swaps Pixi's `new Function` generators for polyfills; before game.init()
await game.init(parent);
await initPlatform();             // never rejects: adapter init is capped at 5 s, then the safe fallback takes over
```

`initPlatform()` also installs the platform storage into `core/save`, sets `game.pauseOnHidden` from
`capabilities.usesPageVisibility`, wires pause/resume to `game.setExternalPause` / `audio.setMuted` and to `platform.lifecycle.onPause/onResume`
(the adapter's own signal, and on every platform with `usesPageVisibility` the page being hidden or shown:
`lifecycle.ts`; the game resumes when the last reason lets go), wires the platform's mute switch (YouTube
audio setting, CrazyGames `muteAudio`), re-attaches ad
counters and the IAP ledger from platform storage, preloads ads and starts the purchase restore.

Right after boot the meta layer sets its two handlers (the restore waits for them):

```ts
iap.registerProducts(CATALOGUE);                          // returns price problems, [] when clean
iap.setGrantHandler(async (productId, orderId, ctx) => {  // idempotent on orderId; ctx = { replay, source }
  /* ctx.source: 'purchase' | 'pending' | 'restore' */
});
iap.setRevokeHandler(async (productId, orderId, ctx) => { // refunds; once per order; ctx = { wasGranted }
});
```

## Consumer API

```ts
// runs: call beginRun() when the player taps Start, BEFORE offering pre_run_snack
ads.beginRun(): void                       // resets per-run limits, preloads the next rewarded ad
ads.endRun(result: 'victory' | 'defeat' | 'abandon'): void
ads.setAdFree(owned: boolean): void        // Butler Pass

// rewarded: AdService only reports, the CALLER grants
ads.canOffer(placement): boolean           // false while no ad is ready, any limit is hit or a modal is open
ads.remaining(placement): number           // per-run / daily cap left, Infinity = no limit
ads.status(placement): PlacementStatus     // { canOffer, reason, remaining, perRunLeft, dailyLeft, cooldownMs }
await ads.showRewarded(placement): 'rewarded' | 'dismissed' | 'unavailable' | 'capped'

// interstitial at a natural break (portal builds only)
await ads.showInterstitial(reason: string): boolean
ads.canShowInterstitial(): { ok: true } | { ok: false, why }

// store the counters in the profile instead of platform storage
ads.attachPersistence({ load(): AdCounters, save(c: AdCounters): void })

// purchases
iap.registerProducts(defs: IapProductDef[]): PriceIssue[]
await iap.purchase(id): 'purchased' | 'cancelled' | 'failed' | 'unavailable'
await iap.restorePurchases(): { ok, granted, revoked, finished, reason? }   // boot does it; settings button too
await iap.recoverPending(): number         // pending orders only (resume does it)
iap.isAvailable(id?): boolean   iap.priceText(id): string
iap.attachLedger({ load(): IapLedger, save(l): void | Promise<void> })

// leaderboard: forwards where the platform has one, no-op elsewhere
await submitScore(boardId, score): void

// lifecycle (CrazyGames / Poki / YouTube signals)
platform.lifecycle.loadingStart() / loadingFinished() / firstFrameReady() / gameReady()
platform.lifecycle.gameplayStart() / gameplayStop() / happyMoment()
platform.capabilities.{rewardedAds, interstitialAds, iap, adFreePurchase, leaderboard, cloudSave, ...}
platform.identity?.userKey()

analytics.track('run_start', { mode: 'classic' })   // event names: docs/명세_메타.md section 11
```

### Ad rules (GDD 8.2, all in `adPolicy.ts`)

Placements and caps: `pre_run_snack`, `revive`, `relic_reroll`, `result_double` once per run;
`snack_box` 3, `daily_treat` 3, `free_chest` 4, `patrol_double` 3, `shop_refresh` 2, `sweep_ticket` 2 per local day
(`sweep_ticket` is the sweep-ticket ad of docs/명세_메타.md section 8, not a GDD 8.2 row). The home and shop
placements (`daily_treat`, `free_chest`, `patrol_double`, `shop_refresh`, `sweep_ticket`: `home: true`) sit outside any
run: the 2-per-run budget below neither counts nor blocks them.
Global: no offer in the first run, 90 s between any two ads, at most 2 ads put in front of the player per
run (watched or dismissed), at most 12 completed rewarded ads a day.
The ad-free Butler Pass pays out `result_double`, `free_chest` and `patrol_double` without an ad (the
placement caps still count, no global rule does); `revive`, `pre_run_snack` and `relic_reroll` still need
an ad (or gems, in the UI).
Interstitials: only on platforms that sell them (portals), only right after a victory, never in the first
session or before 3 completed runs, never to the pass owner, 120 s since any ad unless the SDK throttles
by itself (`capabilities.managesAdFrequency`: CrazyGames, Poki).

### Purchases without a server

On every boot (and from the settings button) `restorePurchases()` lists the platform's pending orders and,
where it offers them (Toss `getCompletedOrRefundedOrders`, Capacitor/RevenueCat `restorePurchases`),
its completed and refunded orders. Pending orders are granted and completed; completed orders missing from
the local ledger are granted again, idempotently (`ctx.source === 'restore'`: a consumable the player
already received on another device is granted again too, so the meta layer decides per product what a
restore means); refunded orders go once to the revoke handler. Catalogue prices per channel
(`IapProductDef.prices`) are checked by `pricing.ts`: a Toss price is KRW, VAT included, a multiple of 11,
within 440..1,540,000.

## Wiring the two npm-package platforms (5 lines each)

The SDK packages are not dependencies of this repo. Install them where you build that platform (other
builds drop the import before resolving it; `vite dev` needs them installed too).

Apps in Toss: `npm i @apps-in-toss/web-framework`

```ts
if (import.meta.env.VITE_PLATFORM === 'toss') {
  const ait = await import('@apps-in-toss/web-framework');
  registerTossBridge(ait);               // from '@/platform'; before initPlatform()
}
```

Capacitor: `npm i @capacitor/app @capacitor/preferences @capacitor-community/admob @revenuecat/purchases-capacitor`

```ts
if (import.meta.env.VITE_PLATFORM === 'capacitor') {
  const { AdMob, RewardAdPluginEvents: R } = await import('@capacitor-community/admob');
  registerCapacitorPlugins({ AdMob, Preferences, App, Purchases }, { rewardRewarded: R.Rewarded, rewardDismissed: R.Dismissed });
}   // (import Preferences / App / Purchases the same way). Without it the adapter looks in window.Capacitor.Plugins.
```

While a bridge is missing the adapter reports ads and purchases as unavailable and uses localStorage.

## Dev mock (`VITE_PLATFORM=dev`)

DOM overlay above the canvas (not Pixi): rewarded ad card with a 5 s bar, then "보상 받기"; "닫기 (보상
없음)" during the countdown; interstitial 3 s; purchase bottom sheet. Popups open in 240 ms and close in
140 ms (research 03 U-05/U-06), buttons are at least 44 CSS px and 96 design units tall, Escape closes
what may be closed. While any modal is open the game is paused, muted and shielded from taps, and a
transparent input shield (`inputShield.ts`, all builds) swallows taps during real SDK ad requests too.
URL switches: `?adfail=1` ads unavailable, `?adfast=1` 0.3 s ads, `?iapfail=1` payment fails,
`?iapcrash=1` the app "dies" right after payment (the order stays pending; the next boot grants it once).
Demo scene: `?demo=platform` (add `&skip=1` to start past the first-run guards, `&keep=1` to keep counters).
It also has Restore, Refund last (the dev store refunds the newest order) and New device (forget the
ledger and reload: the boot restore must grant the completed orders again).

## Rules the code keeps (research C-7)

No `eval` / `new Function` in this folder; the only external request is the vendor SDK script of the
platform being built (never in dev / itch); storage calls never throw and always settle (a key whose read failed is not
written over: see `safeStorage`); every ad,
purchase and boot step has a watchdog or timeout; rewards come only from the SDK's completion signal;
YouTube never touches the Page Visibility API (`capabilities.usesPageVisibility = false`).

## Files

`types.ts` contracts, `adPolicy.ts` limits and interstitial policy (pure), `adService.ts`, `iapService.ts`,
`pricing.ts` (catalogue price rules), `leaderboard.ts`, `modal.ts` (one pause+mute+input-block gate shared
by ads and purchases), `inputShield.ts`, `analytics.ts`, `storage.ts`, `registry.ts` (singletons), `boot.ts`
(`initPlatform`), `lifecycle.ts` (pause/resume wiring), `resolve.ts` (build-time switch), `runtime.ts`, `bridges.ts` (Toss / Capacitor typed
bridges), `sdkLoader.ts`, `fallback.ts`, `adapters/*`.
Tests: `tests/platform*.test.ts` (node, no DOM).
