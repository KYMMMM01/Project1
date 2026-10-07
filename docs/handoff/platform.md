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
- If the platform storage fails to read at boot (hung SDK) the ad counters/ledger start empty for that session and are not merged
  back; since 2026-10-06 they, like the profile, are no longer written over the stored data (see "2026-10-06 review fixes").
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

## 2026-10-06 review fixes

Five confirmed defects, each with a test that fails on the old code (`tests/platform.*.test.ts`).

- **A failed read was "no data"** (`storage.ts`, `adapters/yt.ts`). `SaveStore.load()` read null, built the default profile and the
  first save wrote it over the intact one (Toss Storage, Preferences, YouTube `loadData` failing or past the 8 s timeout).
  `safeStorage` now remembers keys whose read failed and keeps every write to them in memory (readable for the session, never
  sent) until a read shows the slot empty, or until a later `get` hands the caller what is stored (held writes are then dropped).
  The same protects the ad counters and the IAP ledger. YouTube's raw `get` now throws while `loadData` has not succeeded instead
  of answering null. Consequence: after a failed launch read the session runs on defaults and its progress is not persisted; the
  next launch has the intact save. A way for the game to retry the load or tell the player needs `core/save` (see OPEN below).
  Tests: `platform.core` ("a read that failed is not no data", 5), `platform.adapters` (YouTube).
- **No pause/resume on Page Visibility platforms** (new `lifecycle.ts`, `boot.ts`). Toss, CrazyGames, Poki, itch and dev have no
  own signal, so `profile.flush()`, `profile.resume()` (clock re-anchor) and `iap.recoverPending()` never ran. `wireLifecycle`
  moved out of `boot.ts`: where `capabilities.usesPageVisibility` is true, `visibilitychange` / `pagehide` / `pageshow` now
  pause, mute and emit `lifecycleSignals` too. The adapter's own signal and the page are two holders; the game resumes when the
  last one lets go and each transition is emitted once. A page already hidden at boot counts. YouTube stays on its SDK signals
  only. Tests: `platform.lifecycle` (new file, includes the `platform.lifecycle.onPause/onResume` chain the meta layer uses).
- **`sweep_ticket` was not a placement** (`adPolicy.ts`). Added to `AD_PLACEMENT_IDS` / `AD_PLACEMENTS` with
  `{ daily: 2, home: true }` (cap from docs/명세_메타.md section 8; the pass does not skip it, GDD 8.3).
  Tests: `platform.adPolicy` (table), `platform.adService` (plays, 2 a day, owner still watches).
- **Home ads spent the per-run offer budget** (`adPolicy.ts`, `adService.ts`). New `PlacementRule.home` flag on `daily_treat`,
  `free_chest`, `patrol_double`, `shop_refresh`, `sweep_ticket` (GDD 8.2 "홈" / "일일 상점"): they neither count toward nor wait
  on the 2-per-run budget (`noteAdShown` takes the placement; `verdict` skips `offer_cap` for them). `snack_box` (result screen)
  still counts. The 90 s gap and the 12 a day still apply to them. Tests: `platform.adPolicy`, `platform.adService`.
- **localStorage backend ignored its own fallback** (`storage.ts`). `get` now reads the in-memory copy of a write localStorage
  refused before localStorage, a later successful write drops the copy, and the first refused write logs one warning.
  Test: `platform.core`.

Verification: `npx tsc --noEmit` prints nothing for `src/` and `tests/`; `npx vitest run tests/platform` -> 10 files, 238 tests pass
(12 of the new ones fail against the old sources). Not checked in a browser: the Page Visibility wiring is covered with a fake
page and stubbed `document` / `window` only.

OPEN (outside my paths; none blocks shipping):

- `core/save.ts`: `SaveStore.load()` cannot tell "no save" from "could not read", so after a failed read the session starts from
  defaults and cannot recover without a restart. A retry or a "progress could not be loaded" notice would need the store to ask
  the backend again.

## 2026-10-07 QA fixes

- **Storage reports lost writes (`qa-code-storage-failure-silent`, kit request 2).** `createLocalStorageBackend` and `safeStorage` implement `StorageBackend.volatile()` (true while a value lives only in memory: a refused or oversized write, a write held back after a failed read, or a nested backend that says so) and call `reportStorageVolatile()` from `@/core/save` where they fall back to memory. `SaveStore.flush` then retries at 2, 4, 8 up to 30 s, the kit shows one warning toast, and `volatile()` returns to false once a write lands. A failed removal does not count (no progress is lost). Tests: `tests/platform.core.test.ts` (a localStorage that frees up again, a throwing backend, an oversized value; each case imports fresh modules because the report is once per session).
- **Capacitor hardware Back (kit request 5): not wired.** The history entry `BackGesture` keeps while a popup or page is open already receives Android's default Back (`WebView.goBack()`); a `backButton` listener would disable that default and need `exitApp()` at the root. Needs a device test first.

## 2026-10-07 owner feedback

Item: "광고나 결제 창이 이전 톤앤매너임" (the test ad sheet and the test purchase sheet still looked like the old dark-purple candy kit).

- **Root cause.** `devOverlay.ts` still carried the pre-restyle look: `#2b1d52` panels, a yellow ring with a dark outline stroke on the text, glossy gradient buttons, a purple dim. It is plain HTML and CSS, so the kit restyle never reached it, and it is what the owner sees in the test build and wherever no real SDK is present.
- **What changed.**
  - New `src/platform/adapters/devOverlayStyle.ts`: the whole stylesheet (`OVERLAY_CSS`) and ONE documented token block (`PAPER`, hand-copied from `src/ui/theme.ts`: a stylesheet cannot read the kit and the `@/ui` barrel would pull PixiJS into the platform chunk). The sheet is cream paper with a hand-cut edge (a fixed `clip-path` polygon plus uneven corner radii on a `::before`, so the 0-blur `drop-shadow` follows the cut), a flat warm-brown shadow, washi tape drawn with gradients (sky gingham on the ad, pink dots on the purchase sheet; the sheet's existing `.lp-grab` element is the tape), dark ink text with no stroke and no shadow in `GameLatin`/`GameKR`, a kraft track with a flat teal fill, a coral primary paper that presses onto its shadow, a kraft secondary, a teal paper tag, the price on a mustard highlighter, a warm-brown dim at 58 % (`Dim`). Disabled buttons are kraft drained toward cream (ink stays full strength), the failure line is `berryDark`, the keyboard focus line is a dashed teal "cut here" line.
  - Motion: the card lands (slides up with a small tilt and settles), the sheet slides up with a small overshoot (its paper bleeds 70 design px below the screen so the overshoot never shows a gap), tape slaps on, the tag pops, content rises in the old stagger, and the claim button is stamped down when the reward becomes ready. Exits are 140 ms (`CLOSE_MS` is 150 and is now exported). Nothing waits for an animation: the old trap, timers, Escape, tab trap and the unmount liveness check are untouched.
  - Reduce motion: the old `@media (prefers-reduced-motion)` is gone (the game does not follow the OS flag). `openOverlay` reads `motion.reduced` from `@/ui/motion` (a leaf module; only `core/tween` behind it, no Pixi) and adds `.lp-calm` to the root; that class removes every animation and transition and the root is removed at once on close. The still image carries the same information.
  - DOM: every id, `data-lp` hook, class and callback is as before; additions are the `lp-calm` root class and a `TEST` tag element in the purchase sheet (the owner asked for an `AD` / `TEST` paper tag; `AD` was already a literal).
  - Also fixed in passing: `sweep_ticket` had no `platform.placement.*` string, so the ad showed the raw id "sweep_ticket" (ko and en added; a test now requires a label for every `AD_PLACEMENT_IDS` entry).
- **Tests.** `tests/platform.overlayStyle.test.ts` (15): every copied token equals the kit (`Color`, `Dim`, `TapeColors`; the `Record` type fails to compile when a token has no kit source), colours only through the tokens, every `rgba()` built from a token, press and muted shades derived the kit's way, no blur, text stroke, text shadow or blend mode, every shadow layer has a 0 blur radius, no vertical lighting ramp, every class used in `devOverlay.ts` is styled, every keyframe exists, touch targets (120 / 88 design px) and text (24 design px), exits no longer than `CLOSE_MS`, the `.lp-calm` rule, no input blocked by an entrance, a label for every ad placement.
- **How it was checked (scratchpad `shots/ov3` to `ov6`).** The overlay modules were driven in a plain page next to the game (a fake canvas the overlay lays out against), so each state could be frozen: `ov3` stills (ko and en, 506 x 900 canvas and the 1440 x 900 window: purchase confirm, purchase failure, rewarded ad counting down and reward ready, interstitial); `ov4` strips from Web Animations seeks (`strip_buyIn`, `strip_buyOut`, `strip_adIn`, `strip_adOut`, `strip_stamp`); `ov5` reduce-motion (0 animations, root gone right after the click) and a 405 x 900 tall canvas; `ov6` the real game: `?scene=home&tab=shop` with `__dbg.shop.actions.buyProduct('gems_260')` (confirm, pay, reward), `actions.ticketAd()` (ad counting down, ready, claim), and `&iapfail=1&lang=en` (the failure line).
- **Not covered.** The strips come from seeked animations in a page without the game loop (the tab renders 1 to 2 fps), so the motion is judged frame by frame, not at speed. A real SDK sheet (Toss, Apple, Google, an ad network) is not drawn by this file and keeps the store's own look.
