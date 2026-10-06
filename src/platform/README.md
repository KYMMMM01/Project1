# src/platform: one codebase, every channel

Ads, in-app purchases, lifecycle signals, storage and analytics sit behind four singletons. Gameplay and
meta code import them from the barrel and never touch a vendor SDK:

```ts
import { initPlatform, ads, iap, analytics, platform } from '@/platform';
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
| `VITE_TOSS_REWARDED_AD_GROUP_ID`, `VITE_TOSS_INTERSTITIAL_AD_GROUP_ID` | toss |
| `VITE_ADMOB_REWARDED_ID`, `VITE_ADMOB_INTERSTITIAL_ID`, `VITE_ADMOB_TESTING=1` | capacitor |

## Boot (3 lines in `src/main.ts`, see CORE REQUESTS in the report)

```ts
await preparePlatformRuntime();   // toss only: swaps Pixi's `new Function` generators for polyfills; before game.init()
await game.init(parent);
await initPlatform();             // never rejects: adapter init is capped at 5 s, then the safe fallback takes over
```

`initPlatform()` also installs the platform storage into `core/save`, sets `game.pauseOnHidden` from
`capabilities.usesPageVisibility`, wires platform pause/resume (and the YouTube audio signal) to
`game.setExternalPause` / `audio.setMuted`, re-attaches ad counters and the IAP ledger from platform
storage, preloads ads and starts recovering unfinished orders.

## Consumer API

```ts
// runs
ads.beginRun(): void                       // resets per-run limits
ads.endRun(result: 'victory' | 'defeat' | 'abandon'): void
ads.setAdFree(owned: boolean): void        // premium butler pass

// rewarded: AdService only reports, the CALLER grants
ads.canOffer(placement): boolean           // hide/disable the offer in the UI
ads.remaining(placement): number           // Infinity = no limit
ads.status(placement): PlacementStatus     // { canOffer, reason, remaining, perRunLeft, dailyLeft, cooldownMs }
await ads.showRewarded(placement): 'rewarded' | 'dismissed' | 'unavailable' | 'capped'

// interstitial at a natural break
await ads.showInterstitial(reason: string): boolean
ads.canShowInterstitial(): { ok: true } | { ok: false, why }

// store the counters in the profile instead of platform storage
ads.attachPersistence({ load(): AdCounters, save(c: AdCounters): void })

// purchases
iap.registerProducts(defs: IapProductDef[])
iap.setGrantHandler(async (productId, orderId, { replay }) => { /* idempotent on orderId */ })
await iap.purchase(id): 'purchased' | 'cancelled' | 'failed' | 'unavailable'
await iap.recoverPending(): number         // boot does this; safe any time
iap.isAvailable(id?): boolean   iap.priceText(id): string
iap.attachLedger({ load(): IapLedger, save(l): void | Promise<void> })

// lifecycle (CrazyGames / Poki / YouTube signals)
platform.lifecycle.loadingStart() / loadingFinished() / firstFrameReady() / gameReady()
platform.lifecycle.gameplayStart() / gameplayStop() / happyMoment()
platform.capabilities.{rewardedAds, interstitialAds, iap, adFreePurchase, leaderboard, cloudSave, ...}
platform.leaderboard?.submit(boardId, score)   platform.identity?.userKey()

analytics.track('run_start', { mode: 'classic' })   // event names: docs/명세_메타.md section 11
```

Placement ids and limits live in `adPolicy.ts` (`AD_PLACEMENTS`, mirrors 명세_메타.md section 8). Offers
begin with the second run; interstitials never show in the first session, before 3 completed runs, within
120 s of any ad, right after a defeat, to ad-free owners, or where the platform has none.

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
없음)" during the countdown; interstitial 3 s; purchase bottom sheet. URL switches:
`?adfail=1` ads unavailable, `?adfast=1` 0.3 s ads, `?iapfail=1` payment fails, `?iapcrash=1` the app
"dies" right after payment (the order stays pending; the next boot grants it once).
Demo scene: `?demo=platform` (add `&skip=1` to start past the first-run guards, `&keep=1` to keep counters).

## Rules the code keeps (research C-7)

No `eval` / `new Function` in this folder; the only external request is the vendor SDK script of the
platform being built (never in dev / itch); storage calls never throw and always settle; every ad,
purchase and boot step has a watchdog or timeout; rewards come only from the SDK's completion signal;
YouTube never touches the Page Visibility API (`capabilities.usesPageVisibility = false`).

## Files

`types.ts` contracts, `adPolicy.ts` limits and interstitial policy (pure), `adService.ts`, `iapService.ts`,
`modal.ts` (one pause+mute gate shared by ads and purchases), `analytics.ts`, `storage.ts`, `registry.ts`
(singletons), `boot.ts` (`initPlatform`), `resolve.ts` (build-time switch), `runtime.ts`, `bridges.ts`
(Toss / Capacitor typed bridges), `sdkLoader.ts`, `fallback.ts`, `adapters/*`.
Tests: `tests/platform*.test.ts` (node, no DOM).
