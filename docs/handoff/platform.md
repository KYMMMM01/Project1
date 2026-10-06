# Hand-off: platform module (ads, purchases, lifecycle, storage, leaderboard, analytics)

Owner paths: `src/platform/**`, `src/demo/PlatformDemo.ts`, `tests/platform*.test.ts`, `tests/platformHelpers.ts`,
`src/vite-env.d.ts`. Longer how-to: `src/platform/README.md`.

## What exists

- One adapter per build, chosen by `VITE_PLATFORM` = `dev` (default) | `itch` | `crazygames` | `poki` | `gd` | `yt` | `toss` | `capacitor`
  (`resolve.ts`; the other adapters and their SDK URLs are dropped from the bundle).
- Four singletons (safe before boot, backed by a no-ads fallback adapter): `ads` (AdService), `iap` (IapService), `analytics`,
  `platform` (live view of the adapter), plus `submitScore`.
- `initPlatform()` boots it all (5 s adapter timeout, then the safe fallback; the game always starts).
- Dev mock UI as a DOM overlay (rewarded card, interstitial card, purchase sheet) and the QA scene `?demo=platform`.
- A transparent input shield (`inputShield.ts`) in every build: while an ad or purchase sheet is open the game is paused, muted
  and cannot be tapped, also during the SDK's own request.

## Consumer API (import everything from `@/platform`)

```ts
import { initPlatform, ads, iap, analytics, platform, submitScore, registerTossBridge, registerCapacitorPlugins,
         preparePlatformRuntime, AD_PLACEMENT_IDS, AD_PLACEMENTS, GLOBAL_AD_RULES, validateCatalogue,
         isValidTossPriceKrw, tossPriceProblems, type IapProductDef, type RewardedOutcome } from '@/platform';

// boot (src/main.ts, see REQUESTS): await preparePlatformRuntime(); await game.init(parent); await initPlatform();
// then, in the meta layer:
iap.registerProducts(defs: IapProductDef[]): PriceIssue[]          // [] = clean; IapProductDef.prices?.toss = { currency: 'KRW', amount }
iap.setGrantHandler((productId, orderId, ctx: { replay: boolean; source: 'purchase' | 'pending' | 'restore' }) => void | Promise<void>)
iap.setRevokeHandler((productId, orderId, ctx: { wasGranted: boolean }) => void | Promise<void>)   // refunds, once per order
iap.attachLedger({ load(): IapLedger, save(l): void | Promise<void> })   // keep the order ledger in the profile
ads.attachPersistence({ load(): AdCounters, save(c): void })             // keep the ad counters in the profile

// ads (AdService only REPORTS; the caller grants the reward)
ads.beginRun()                        // call when the player taps Start, BEFORE offering pre_run_snack; resets per-run limits, preloads
ads.endRun('victory' | 'defeat' | 'abandon')
ads.setAdFree(owned: boolean)         // Butler Pass
ads.canOffer(placement): boolean      // allocation-free, never throws; false while no ad is ready / any limit hit / modal open
ads.status(placement): { canOffer, reason, remaining, perRunLeft, dailyLeft, cooldownMs }
ads.remaining(placement): number
await ads.showRewarded(placement): 'rewarded' | 'dismissed' | 'unavailable' | 'capped'
await ads.showInterstitial(reason): boolean ; ads.canShowInterstitial(): { ok: true } | { ok: false, why }
// placements: pre_run_snack revive relic_reroll result_double snack_box daily_treat free_chest patrol_double shop_refresh

// purchases
await iap.purchase(id): 'purchased' | 'cancelled' | 'failed' | 'unavailable'
await iap.restorePurchases(): { ok, granted, revoked, finished, reason? }   // runs at every boot; wire it to the settings button
await iap.recoverPending(): number      // pending orders only (cheap)
iap.isAvailable(id?) ; iap.priceText(id) ; iap.productName(id)

await submitScore(boardId: string, score: number): void   // forwards on Toss / YouTube / dev, no-op elsewhere
platform.lifecycle.{loadingStart,loadingFinished,firstFrameReady,gameReady,gameplayStart,gameplayStop,happyMoment}()
platform.capabilities.{rewardedAds,interstitialAds,iap,adFreePurchase,leaderboard,cloudSave,usesPageVisibility,externalLinksAllowed,managesAdFrequency}
analytics.track(event, params)          // events: docs/명세_메타.md section 11
```

Rules implemented (GDD 8.2/8.3, all pure in `adPolicy.ts` / `pricing.ts` / `iapService.ts`):
placement caps (per run: pre_run_snack, revive, relic_reroll, result_double = 1; per local day: snack_box 3, daily_treat 3,
free_chest 4, patrol_double 3, shop_refresh 2); no offer in the first run; 90 s between any two ads; at most 2 ads put in front of
the player per run (watched or dismissed count, ad-free payouts do not); at most 12 completed rewarded ads a day; the Butler Pass
pays result_double / free_chest / patrol_double without an ad (placement caps still count, no global rule does) while revive,
pre_run_snack, relic_reroll still need an ad. Interstitials: only on platforms that sell them (portals; Toss, Capacitor and itch
never), only right after a victory, never in the first session or before 3 completed runs, never to the pass owner, 120 s since
any ad unless the SDK throttles itself (`managesAdFrequency`: CrazyGames, Poki). Rewarded preload at run start and after every
show. Toss price rule: KRW, VAT included, multiple of 11, 440..1,540,000.

## Requirement checklist (read from the code, then verified)

All 10 numbered requirements of the original spec: done (adapter interface, build-time selection, adapters, AdService, IapService,
dev mock, analytics, boot helper, hard constraints, demo). After the review of the previous work these were partial or missing and
are now fixed: placement table was the old one; interstitial policy allowed abandoned runs and had a dead per-session knob; no
global ad rules; Butler Pass covered everything; no restore/refund path; no preload at run start; no leaderboard service; no price
validator; the registry's pause wrapper dropped the new input-block hook (found in the browser); the Toss/Capacitor adapters carried
dead interstitial code; an ad request the SDK never answered left CrazyGames/Poki/YouTube "busy" for the whole session; Toss
localised prices were never fetched when products were registered after boot; the dev overlay could lock the game out if removed
from the DOM from outside and had no Escape/Tab handling or recipe timings.

## Verification (2026-10-06)

- Types: `npx tsc --noEmit` prints nothing for my paths; the whole repo is at 0 errors right now.
- Unit tests: `npx vitest run tests/platform` -> 9 files, 217 tests pass (adPolicy 33, adService 42, adapters 54, core 14, iap 23,
  restore 13, pricing 29, registry 5, leaderboard 4). Covered: caps, cooldowns, per-run reset, date rollover and clock rollback,
  global rules, ad-free matrix, interstitial matrix (exhaustive), watchdog restore, preload, idempotent ledger incl. crash between
  pay and grant, restore of completed orders, refunds, deferred restore, price validator, leaderboard, every adapter against a fake SDK.
- Per-platform builds (`VITE_PLATFORM=<id> npx vite build`), then grep of the output JS:

| platform | built | own marker | foreign adapter marker / SDK URL | SDK URL present | `eval(` | `new Function` |
|---|---|---|---|---|---|---|
| dev | yes | 1 | none | none | 0 | 0 |
| itch | yes | 1 | none | none | 0 | 0 |
| crazygames | yes | 1 | none | sdk.crazygames.com/crazygames-sdk-v3.js | 0 | 0 |
| poki | yes | 1 | none | game-cdn.poki.com/scripts/v2/poki-sdk.js | 0 | 0 |
| gd | yes | 1 | none | html5.api.gamedistribution.com/main.min.js | 0 | 0 |
| yt | yes | 1 | none | www.youtube.com/game_api/v1 | 0 | 0 |
| toss | yes | 1 | none | none (adds pixi unsafe-eval polyfill, +32 KB) | 0 | 0 |
| capacitor | yes | 1 | none | none | 0 | 0 |

  PixiJS itself still calls the `Function(...)` constructor in every build (5 call sites in the minified bundle, no `new Function`
  text, none in platform code). The toss build additionally contains `pixi.js/unsafe-eval` (the polyfill that replaces those
  generators); it only helps if `preparePlatformRuntime()` runs BEFORE `game.init()` (REQUESTS 1). I could not check a toss build under
  a CSP without `unsafe-eval` because that needs the main.ts change.
- Browser (Aside, dev server): demo scene `?demo=platform`, screenshots in `scratchpad/shots/platform/` (`01_home`, `A_ad_card`,
  `A_ad_done`, `A_after`, `C_sheet`, `C_after_restore`, `D_iapfail`, `D_adfail`...). Checked with flags read from `__dbg.platform.state()`:
  rewarded completed (paused 1, muted 1, ticker stopped, shield present, taps on the game ignored; after claim everything back to 0
  and no leftover DOM); dismissed (no grant, 90 s gap blocks the next offer, showRewarded answers 'capped'); unavailable (`?adfail=1`);
  interstitial after a win then blocked by the gap; overlay removed from the DOM mid-ad (settles 'dismissed', clean); Escape; platform
  pause arriving during an ad (depths nest and unwind); four rapid calls (one ad, rest refused); purchase / cancel / Escape / failed
  (`?iapfail=1`) / crash after payment (`?iapcrash=1`, granted once on the next boot, not again on the third); refund -> revoke handler,
  restore twice changes nothing; "New device" (ledger forgotten, reload) re-grants the completed order with `source: 'restore'` and
  does not grant the refunded one. PAGE_ERRORS `[]` in every run.
- Production builds served statically: toss build boots with `adapter=toss` and reports ads/IAP unavailable without a bridge,
  storage works, interstitial blocked ('platform'); crazygames build with its SDK script blocked by CSP boots on the safe fallback
  (`boot=fallback`, console warning "failed to initialise, using safe fallback") and the game runs.

## Known gaps / UNVERIFIED (per adapter, with the assumption made)

- crazygames: confirmed from docs.crazygames.com: video-ads (adCooldown, ~3 min between midgame ads -> `managesAdFrequency`), game
  (`settings.muteAudio`, `add/removeSettingsChangeListener`, "outranks in-game audio"). Assumed: the listener's argument shape (the
  adapter reads the live `muteAudio` instead).
- poki: confirmed developers.poki.com/guide/sdk-html5 ("Poki's system decides when a player is ready for another ad" -> managesAdFrequency).
  Assumed: `happyTime(intensity)` exists (called only if present).
- gd: `SDK_REWARDED_WATCH_COMPLETE`, `preloadAd('rewarded')` from the GD wiki mirror; no statement found that GD throttles
  interstitials, so `managesAdFrequency` stays false. A real game id (`VITE_GD_GAME_ID`) is needed.
- yt: surface from developers.google.com/youtube/gaming/playables; `managesAdFrequency` false (no statement found);
  `engagement.sendScore({value})` integer only.
- toss: confirmed `IAP.getCompletedOrRefundedOrders()` (no parameters in the web SDK, first page only, `{hasNext,nextKey,orders:[{orderId,sku,status,date}]}`,
  needs Toss app 5.231.0+; older apps throw -> restore reports `ok:false`). Only the first page is visible, so an old order that
  fell off it is re-granted only if the ledger also lost it. Assumed: `getProductItemList` item shape (`displayAmount`), native
  Storage limit (kept under 1 MB), rewarded ad group id from `VITE_TOSS_REWARDED_AD_GROUP_ID`.
- capacitor: assumed RevenueCat `restorePurchases()` -> CustomerInfo (confirmed method name only) with
  `nonSubscriptionTransactions[{transactionIdentifier|transactionId, productIdentifier|productId}]` (item fields and whether
  consumables appear: not documented where I could read it); refunds are not visible there, so `revoke` never fires on that
  platform. Also assumed: `getProducts`, `purchaseStoreProduct`, `transaction.transactionIdentifier`, `userCancelled`, and that
  `Capacitor.Plugins.<Name>` exposes plugins (else `registerCapacitorPlugins`). EEA consent (UMP) is not handled.
- Restore re-grants a consumable too when the ledger lacks its order (as specified: "anything missing"); a player who kept the gems
  on another device gets them again. `ctx.source === 'restore'` lets the grant handler decide per product.
- If the platform storage fails to read at boot (hung SDK) the ad counters/ledger start empty for that session; the ledger of a
  later successful read is not merged back (only matters on YouTube-like cloud storage, which sells nothing).
- Screenshot of the interstitial card itself was not captured in this session (Aside screenshots took 5-10 s, the card lasts 3 s);
  its state was verified by flags and it shares the rewarded card's layout.
- Korean glyphs in the dev overlay partly fall back to the system font: the GameKR subset does not contain every glyph of the new
  `platform.*` strings (REQUESTS 3).

## REQUESTS (outside my paths)

1. `src/main.ts` / BootScene: call `await preparePlatformRuntime(); await game.init(parent); await initPlatform();` before the first
   scene (today only the demo imports `@/platform`); toss/capacitor builds also call `registerTossBridge(...)` /
   `registerCapacitorPlugins(...)` before `initPlatform()` (5 lines, README).
2. `src/main.ts`: `import.meta.glob('./demo/*Demo.ts')` ships every demo (UiDemo 122 KB, FxDemo 97 KB, PlatformDemo...) in every
   production build; restrict it to dev (`import.meta.env.DEV ? import.meta.glob(...) : {}`).
3. Fonts: re-run the Korean font subsetter (`scripts/build-font.mjs`) after this change so the `platform.*` ko strings
   (`allStrings()`) are in GameKR.
4. Meta layer (docs/명세_메타.md section 8 still has the old placement table: replace by GDD 8.2): call `ads.beginRun()` on the Start
   tap before offering pre_run_snack and `ads.endRun()` at the result; `ads.setAdFree(true)` for Butler Pass owners; register
   `iap.setGrantHandler` and `iap.setRevokeHandler` (idempotent on orderId) right after boot; put `prices.toss` (KRW) on every
   catalogue product and assert `iap.registerProducts(...)` returns `[]` in a test; a settings button for `iap.restorePurchases()`;
   `attachLedger` / `attachPersistence` onto the profile; UI should show an offer 600 ms after a defeat (research 03 U-11), show the
   reward first and always offer the gem alternative.
