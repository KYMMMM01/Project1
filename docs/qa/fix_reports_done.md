# fix:routine

qa-routine-cal-day28-wrap: FIXED. I added `calendarPage` in `calendarModel.ts`. It keeps the page that day 28 just completed on show, with every day stamped and "28/28", until tomorrow. The cycle label and the n/28 text are now rewritten on every sync, and the claim flies from the claimed day (`r.value.day`). Proof: `c28_after_claim.png` and `c28_reopen.png` show "1번째 달력 28/28일" with the stamp on day 28. `c28_next_day.png` shows "2번째 달력 0/28일" with day 1 circled and the button enabled. Regression test for `calendarPage`.

qa-routine-import-levelup-gems: FIXED. After a successful `importCode`, the seen-level and seen-unlock record is set to the restored profile exactly (`seenAfterImport`, `markProfileSeen` in `prefs.ts`). It runs even if the import popup is closing. The real Settings > 코드 불러오기 flow was run with the routine record missing: record `null` before, `seenLevel 98` plus every unlock after, 0 popups, gems stay 777. Regression tests for `seenAfterImport`.

qa-routine-pass-days-stale: FIXED. The days tag is kept in a field and rewritten in `syncAll`. Proof: `p_days_12.png` reads "12일 남았어요" and `p_ending_popup.png` reads "2일 남았어요" after `advance`.

qa-routine-cal-popup-stale: FIXED. `CalendarPopup` subscribes to the profile and redraws only when the page, stamp, claimable flag or welcome gift changed. It ignores change events during its own claim so the stamp still slams, and unsubscribes in `destroy`. Proof: with the popup left open over `advance({days:1})`, it showed the next page with "오늘 받기" enabled (`c28_next_day.png`). Claiming day 1 from that same popup worked.

qa-routine-pass-owned-crown: FIXED. New `IconLabel` in `kit/tags.ts`: the crown and text are centred as one group inside the torn paper, and the text shrinks rather than the paper. Proof: 3x crop `o_owned_crop.png` shows no overlap.

qa-routine-comeback-dismiss-dot: FIXED within my area. The dot is drawn by `BattleTab.syncCalendar`, which is not mine, but it now leads somewhere. When the silver chest is waiting as the calendar opens, a "어서 와요! / 은 상자 x1 / 받기" row (`calendarWelcome.ts`) sits between the grid and the claim button. Proof: `w_row.png` and `w_row_en.png` show the row. Claiming raised silver chests 0 to 1, `comebackReady` went false, and the row greyed to "받았어요" (`w_row_claimed2.png`). The note is still offered once per launch.

qa-routine-season-end-unclaimed: FIXED in part, FORWARDED in part. The wipe itself is meta (`rollSeason`); see REQUESTS. In my area, on each of the last three days the first visit to the pass tab shows a note "시즌이 곧 끝나요" with the open rewards as stickers and "모두 받기" / "나중에" (`seasonEndWarning`, remembered once per season and day as `passWarned` in `meowguard.routine`). Proof: `p_ending_popup.png` and `p_ending_last_day.png`; revisiting the tab the same day showed 0 popups. Regression test for `seasonEndWarning`.

qa-code-domfield-stale-after-resize: FIXED. `DomTextField` no longer has its own resize listener, which ran before the popup had moved. Both code popups override `layout()` and call `field.place()` after `super.layout()`. Proof: with the report's viewport override the textarea top is 395 after `game.h` went 1280 to 1543, equal to the well top the report cites (`d_after.png`).

Verification: `tsc` prints nothing for my paths. `npx vitest run tests/screens.routine` passes with 42 tests. Every browser run had `PAGE_ERRORS []`. Screenshots are in `scratchpad/shots/fix-routine/`. The hand-off note `docs/handoff/routine.md` has the "2026-10-07 QA fixes" section appended.

REQUESTS:
1. `src/meta` (`rollSeason` in `pass.ts` and the profile's pass slice): pay or mail unclaimed free tiers, and an owner's premium tiers, at season rollover instead of wiping them. My warning note only covers players who open the pass tab.
2. `npm run font` once more for the new Hangul in the pass and calendar strings.

# fix:kit

qa-flow-toast-over-currency: FIXED. Toasts now rest at safeTop+262, under the home currency row, and rise in from below. `v_toast_home.png` shows the gold, gem and ticket pills clear.

qa-collection-popup-stack-visible: FIXED. `popups.open()` over an open popup now cross-fades the lower sheet and its dim out, so the dim no longer doubles and no second ribbon peeks out. The lower one returns when the top closes. Read back with and without motion: lower `visible false / alpha 0 / covered`, top visible, lower back at alpha 1. Regression test in `tests/ui.stack.test.ts`.

qa-look-min-font-kit: FIXED.
- `MIN_FONT` is 24. `uiLabel`, `numberText`, ProgressBar and CooldownRing labels, Badge, Tag, Button, and CardFrame name, level, bar and NEW tag all stop at 24 (CardFrame small bar 30, plate 80; medium bar 32, plate 92).
- Popups were also shrinking 24 px text to 22: `Popup.layout` now scales to the drawn bounds, not the padded "+80" declaration. The calendar renders at scale 1.
- A Text walk over home, cats, shop, missions, pass, calendar, pause menu and selection sheet finds nothing under 24 px. The English-only strings you listed ("Weekly cup", "Claim cup prize") were not walked in English but sit behind the same floor.
- One residual is in REQUESTS item 1.

qa-look-disabled-contrast: FIXED. `mutedPalette` moved to `theme.ts` with full `Color.ink` and a lighter muted kraft. A test asserts contrast above 4.5 on every palette. `v_unit_clean.png` shows "레벨 업" and "100" readable, and the "Awaken" button in `v_sel.png` is readable.

qa-look-reroll-icon: FIXED. Redrawn as a thin ring with two small arrowheads, legible at 36 px. Checked in the icon harness (`icons.png`) and in the real pause menu (`v_pause.png`).

qa-look-hex-leftovers: FIXED. ProgressBar, ClassChip, TabBar, Button, CurrencyPill, CardFrame, ScrollView, numbers, paper, shapes, `core/game.ts`, `core/scene.ts`, FxDemo and AudioDemo now use tokens. New tokens: `inkMid`, `woodLight`, `pressTint`, `stone`, `bronze`. The only literals left in my paths are `theme.ts`, `icons.ts`, and the white/black maths in `colors.ts` and `core/math.ts`. The additive blend was removed with known-1.

qa-code-back-gesture-unwired: FIXED. New `src/ui/backGesture.ts`, wired inside `PopupManager` and `ScreenScaffold`. In the real browser, `history.back()` closed only the top of two popups, then the other. A button close drops the spare entry again. Desktop Aside has no hardware Back, so this was tested with `history.back()`. Fake-history unit tests cover the controller. Capacitor's hardware back is REQUESTS item 5.

qa-code-storage-failure-silent: FIXED in my part, FORWARDED for the rest. `core/save.ts` gets `StorageBackend.volatile?()`, `reportStorageVolatile`, `onStorageVolatile` and `isStorageVolatile`. `SaveStore.flush` retries lost writes at 2, 4, 8 up to 30 s and reports once. The kit shows one warning toast (`ui.storage.volatile`, ko/en). Tests in `tests/core.save.test.ts`. The production backend lives in `src/platform/storage.ts` and never throws, so platform must call it (REQUESTS 2).

known-1: FIXED. RewardPopup draws a flat paper sunburst baked once, with no gradient, no `drawGlow` and no additive blend (`v_ui_rewards.png`). `drawGlow` stays exported but nothing in the kit calls it.

known-2: FIXED. SegmentTabs and TabBar labels are built in `Color.inkMid`, and selection is a tint from the new `tintToward(inkMid, ink)`. No white literal remains.

known-3: FIXED. New `ProgressBarOpts.labelSize` (floored at 24).

known-4: FIXED. The "ad" icon is now a teal television with an ink screen and no violet.

known-5: FIXED. `?demo=fx` now has a wood floor, a kraft header, kit paper buttons at 88 px, paper name labels and a warm well behind each effect cell. Cat stand-in and effect tints use tokens (`v_fx3.png`).

REQUESTS (the full note is appended to `docs/handoff/ui.md` under "2026-10-07 QA fixes"):
1. `src/screens/shop/rewards.ts`: `setContentSize(PANEL_W + 80, …)` is still shrunk to 0.978 because its `paperSun` widens the drawn bounds, so its 24 px text renders at 23.5. Use `PANEL_W + 48`.
2. `src/platform/storage.ts`: call `reportStorageVolatile()` from `core/save` in the memory-fallback paths of `safeStorage` and `createLocalStorageBackend`. Also add `volatile()` to the returned backend so `SaveStore` keeps retrying.
3. Settings screen owner: show a persistent line when `isStorageVolatile()` is true. The toast fires once and a scene change can swallow it.
4. HUD owner: the countdown bar can use `labelSize: 24`. Check refusal toasts now that they sit at y 262, over the top row of the board.
5. Platform, for Capacitor/TWA: forward hardware back to `popups.handleBack() || ScreenScaffold.handleBack()`.
6. Run `npm run font` for the new string `ui.storage.volatile`.

Tests: `npx tsc --noEmit` is clean in my paths, and `npx vitest run tests/ui tests/core` gives 6 files and 88 tests passing. Aside runs ended with `PAGE_ERRORS []`. Screenshots are in `…/scratchpad/shots/fix-kit/`. No commits made.

# fix:other

qa-look-wild-plural: FIXED in part, REJECTED in part.
- Plural: the earlier engineer's `tn()` (`src/meta/plural.ts`) now carries every counted meta text. I checked it in the browser: `shots/fix-other/c_treats.png` reads "1 wild card (Street)", and `tests/meta.rules.test.ts` pins the singular forms.
- Rank naming: REJECTED. "Street" is `rarity.rare` (동네) and "Alley Boss" is `rarity.epic` (골목대장). They are two different ranks, and `rarity.*` is the single source of both names.

qa-battle-docs-drift-costs: FIXED. I verified the earlier GDD edits against `balance.ts` (SUMMON_STEP 6, AWAKEN_COST 12).
- GDD 3.2 now says `12 + 6n`, 3.3 and 3.6 say awaken costs 12, and the comparison-table row and D-06 in 설계_결정_기록.md match.
- Purr per run is 19 in the GDD, which I recomputed from ACT_PURR, BOSS_PURR, ELITE_PURR and the wave kinds.
- Also fixed `docs/명세_메타.md`, which still said `sweep_ticket` was missing from the platform table, and removed the resolved bullet in `docs/handoff/platform.md`.

qa-flow-en-copy: FIXED.
- Plural wild card: same fix and proof as qa-look-wild-plural.
- Unlock toast: the "Missions is now unlocked!" toast no longer exists. `HomeScene.announceUnlocks` was replaced by the routine owner's unlock popup, so nothing read `meta.toast.unlock`. I deleted that string and its test instead of keeping it as dead text. I proved this from the code only: the unlock popup never appeared in my Aside runs, so I did not see it.

Requests left by the kit and routine owners:
- Season wipe (routine request 1): FIXED. `MetaCore.rollover` now pays every reached tier the player never took when a season ends (free row always, premium row for an owner), then resets.
  - Browser proof: with 560 pass XP and `advance({days:31})`, gold went 1,410 to 2,610, gems 22 to 47 and wooden chests 3 to 4. The season moved 0 to 1 with no open tier.
  - Tests are in `tests/meta.profile.test.ts`, and 명세_메타 "시즌 패스" describes the rule.
  - The balances just rise, with no "your season ended" notice.
- Storage lost-write reporting (kit request 2): FIXED. `createLocalStorageBackend` and `safeStorage` now implement `volatile()` and call `reportStorageVolatile()` where they fall back to memory.
  - Browser proof: with `Storage.prototype.setItem` made to throw, the toast showed, stored gold stayed 0 while live gold was 7,777, and after restoring it the retry wrote 7,777 (`shots/fix-other/s_volatile.png`).
  - Tests are in `tests/platform.core.test.ts`.
  - That run's PAGE_ERRORS held only the expected "[localStorage] write failed" warning.
- Capacitor hardware Back (kit request 5): DEFERRED. The history entry that `BackGesture` keeps already receives Android's default Back. A `backButton` listener would turn that default off and need an `exitApp()` path, which wants a device test first.

State of my paths:
- `tsc` prints nothing for `src/game`, `src/meta`, `src/platform`, `src/audio` and their tests.
- `npx vitest run tests/meta tests/platform tests/audio tests/review tests/sim tests/core.save.test.ts` passes: 31 files, 949 tests. The whole suite passed earlier: 63 files, 1476 tests.
- Elsewhere `tsc` still reports errors in `src/screens/shop/ChestReveal.ts`, which belongs to another owner.

Hand-off: sections "2026-10-07 QA fixes" are appended to `docs/handoff/meta.md` and `docs/handoff/platform.md`. I made no commits.

REQUESTS (outside my paths):
1. `src/screens/shop/blocksStore.ts:190` calls `t('meta.piggy.free', …)`, which bypasses the singular. Use `tn('meta.piggy.free', p.daysUntilFree, { days: p.daysUntilFree, n: fmt(p.freeBreakGems) })` from `@/meta`, so English reads "After 1 day". Owner: collection/shop.
2. Run `npm run font` once every owner is done. It writes `public/fonts`, and the Hangul subset predates the new pass, calendar and settings strings and `ui.storage.volatile`. Forwarded by both the routine and kit owners.
3. Settings screen owner: show a persistent line while `isStorageVolatile()` is true, because the toast fires once and a scene change can swallow it (kit request 3).
4. Kit's items 1 and 4 (`src/screens/shop/rewards.ts` content width and the HUD `labelSize`) also belong to other owners.

# fix:collection

qa-code-chest-reveal-no-resize: FIXED. `ChestReveal` now handles `resize`: it redraws the floor and its hit area, refits the grid, and moves the placed cards, the chest and the header and footer. Proof: at game.h 1543, mid-flight, the floor covers the whole screen and the shop is not visible or tappable below it (`rv_resize_end_en`).
qa-code-shop-free-timer-frozen: FIXED. The countdown text is built with its text and kept across hide, and `show()` re-syncs it. Proof: the line reads "다음 상자까지 3:59:59" at first build. After goTab cats, advance 1 h and goTab shop, it reads 2:59:48, which matches `waitMs` of 10,788,656.
qa-collection-claim-flight-gems-huge: FIXED. `fitted()` in `art.ts` now wraps the sprite in a container, so the flight no longer overwrites the fit scale. Proof: in `rw_claim_fly` the gems, coins and ticket are about 48 px.
qa-collection-line-tags-cover-portraits: FIXED (the interrupted engineer's work, which I verified). The arrows are no wider than the gap plus 5 px, with the words in a band above. Proof: `cats_ko_0` and `cats_en_760`, and a test on `arrowWidth`.
qa-collection-damage-delta-vs-rounded: FIXED (previous work, verified). The pill is now the difference of the two shown numbers. Proof: `unit_en_a` shows Sword Cat L4 as 18 → 20 +2. A test sweeps all 16 cats at all levels.
qa-collection-en-pack-contents-under-button: FIXED. The coupon height follows the wrapped contents. Proof: `sh_gems_en` shows the full text above the button.
qa-collection-free-chest-ad-label-truncated: FIXED. The two skip buttons are stacked at full width, so the label is no longer cut. Proof: `sh_chests_a_ko2` and `sh_chests_a_en`. I also widened the Odds button to 176 px, because the English "Odds" was cut to "O..." in the same card.
qa-collection-en-class-names-truncated: FIXED (previous work, verified). Names wrap to two lines. Proof: `cats_en_760`.
qa-collection-pity-label-and-target: FIXED. The bar reads "연 금 상자 9/10" or "Chests opened 9/10". The bonus chest also shows "Target: Samurai Cat". Proof: `sh_chests_b_en`.
qa-collection-balance-updates-before-claim: FORWARDED (shell owner, see REQUESTS 1). `HomeScene` refreshes the top bar on every profile change, so no change inside my paths can hold the numbers. I removed my redundant `shell.refresh()` calls before the reward popups.
qa-collection-reveal-card-flash-top-left: FIXED. A card back is placed on its arc's first point before it becomes visible. Proof: over 400 ticks of a 17-stack gold reveal, 4,217 visible-card samples had 0 at (0,0).
qa-collection-reveal-count-pill-over-dots: FIXED. The pill hangs at the plate foot. Proof: `rv_summary`.
qa-collection-ticket-ad-ignores-ad-policy: FIXED. The button now checks `ads.canOffer('sweep_ticket')`, and the block signature includes it. Proof: on a fresh profile the ad button is disabled.
qa-collection-en-grammar-counts: FIXED for cats and shop. "Two Sword Cats merge into one Viking Cat." has an exact-string test, plus `.one` forms for the cards line and the shop's days-left and gems-needed strings. FORWARDED: English `meta.reward.chest` "{n} x {name}" is a meta string (REQUESTS 2).
qa-collection-unit-cards-page-spare-band: FIXED (previous work, verified). `unit_en_b` shows no blank band.
qa-look-ko-particle-rug: FIXED. The key now uses "챕터 {n}을(를)". Proof: `sh_cos_ko` reads "챕터 1을 / 2를 / 3을". "골드 {n}(으)로" got the same treatment.
qa-look-chest-reveal-names: FIXED. Names are 24 px on the wooden floor, wrap instead of shrinking, and the grid picks the column count with the biggest plates. Proof: `rv_summary`, `rv_resize_end_en`.
qa-look-en-truncated-names: FIXED, same fix as the class-names report above.
qa-look-confirm-dialog: FIXED. The new `ChestConfirm.ts` lays the odds out as a ladder and has a coral Buy button with a gem icon and price. The odds stay on screen because GDD 8.4 requires them at the purchase step. Proof: `cf_confirm_ko2`.
qa-look-price-controls: FIXED in the shop. Gem packs are coral like the other real-money prices, and green stays for free and claim. FORWARDED: the home promo card is in `PromoCard.ts` (REQUESTS 3).
qa-look-violet-leftovers: FIXED for the pass section label, which is now mustard (`sh_pass_ko`). REJECTED for the wild tiles: they are the epic rarity mat, the one place violet should stay.
qa-look-ladder-arrows: FIXED, same fix as the line-tags report.
qa-flow-chest-reveal-title-offcentre: FIXED. The title slides to the middle once the skip button is gone. Proof: `rv_summary`.
known-6 (x0 in the reward popup): FIXED. Amounts below 10 show at once, and larger ones roll from x0. Proof: the popup's count texts at open read x2, x3, x2, x1, plus x0 for the two rolling amounts (260 and 5,000).

I also fixed one thing the testers did not report. The card bar on a cats-tab plate showed "30…" for needs of 120 or 200, so it now shows only the count held when "have/needed" will not fit.

State of my paths:
- `tsc`: `npx tsc --noEmit | grep -E '^(src|tests)/'` prints nothing in my paths.
- Tests: the two collection test files pass (28 tests), and the full suite passes (64 files, 1,487 tests).
- Browser: every Aside run ended with `PAGE_ERRORS []`.

REQUESTS:
1. Shell / `HomeScene` (`src/scenes/HomeScene.ts`, `HomeTopBar`): add `shell.holdBalances(): () => void`, so the currency pills keep their shown values until the claim flight lands. `rewards.ts` would take the hold when the sheet opens and release it on landing.
2. Meta strings: English `meta.reward.chest` "{n} x {name}" needs a plural, or wording like "{name} x{n}".
3. `src/screens/battle/PromoCard.ts`: use the same coral `Button` for the price.
4. `src/ui/dialogs.ts` `confirmDialog`: the confirm button is always green and has no icon slot. Only the shop's chest purchase has its own coral confirm.

Files are in `src/screens/shop` (`ChestReveal.ts`, `RevealCard.ts`, `ChestConfirm.ts` new, `ShopTab.ts`, `blocksChests.ts`, `blocksStore.ts`, `blocksStyle.ts`, `rewards.ts`, `art.ts`, `strings.ts`) and `src/screens/cats/LineFrame.ts`. The tests are `tests/screens.collection.shop.test.ts` and `tests/screens.collection.test.ts`, and the "2026-10-07 QA fixes" section is appended to `docs/handoff/collection.md`.

# fix:battle

- qa-code-quit-after-end-shows-defeat: FIXED. `canOpenPause(phase, ending)` stops the pause button once the sim says won or lost. After `lose()`, tapping pause leaves the pause reasons `[]`; unit test added.
- qa-code-selltag-omits-purr: FIXED. `SellTag.place(x, y, fish, purr)` draws a longer tag with the purr icon; `b1_sell_drag` shows the tag and the strip agree.
- qa-look-dmg-numbers-hud: FIXED. The earlier clamp kept; digits are now light with one flat brown stroke (no cream outline, no drop shadow). The translucent hit-spark disc and crit ring are gone, and numbers are also kept inside the screen sides. Proof: `j1_numbers`, `i1_bosses`.
- qa-look-selection-sheet-small: FIXED. My text/target audit (text under 24 px, tap targets under 88 px) is empty for kitten, king and guardian sheets in ko and en. The skill line has a full-height 88 px hit band. Sell is now 240 px wide so "+80 · purr +1" is not cut (Awaken 214, Molt 186). The skill line stays one line, because the sheet cannot grow without covering the summon row.
- qa-look-tooltip-over-popup: FIXED. The engineer's fix covered class sheet and odds only; the pause menu still opened under the enemy card. `Hud.pauseMenu()` now hides it first (`l1_pause_after_tip`).
- qa-look-rank-pips: FIXED. Rank tag is 26 px tall (was 18) with 9.6 px pips, and the class sticker moved up so a five-pip tag never runs under it. It is still below the 36 px the report asked for, because wider tags would not fit the 108 px cell.
- qa-look-tall-gap: REJECTED. The field is already centred, with 178 design px of floor above and below at 720 x 1600. It cannot scale up because `FIELD_W` equals the design width.
- qa-look-translucent-discs: FIXED. The shield bubble is now a dashed opaque ring, and `buffAura`'s steady 32 % disc is a ring outline. Proof: `j1_shield`.
- qa-battle-tutorial-passive-loss: FIXED. The nudge repeats until the board holds 6 cats, and a lost run with fish and room left says so on the result screen. The report stepped the sim through the API, which skips the HUD update, so the nudge never ran there. With real frames the hand and "Fish ready!" bubble point at Summon after 5 s idle (`t1_idle7`).
- qa-battle-toplane-overlays: FIXED for the stacking only. Hints wait 2.6 s after banners, refusals are bubbles on the pressed control, and the pair hint points at both cats and avoids the lane. The wave banner and synergy caption still sit on the lane's top run for about 1 s, because no other free band exists at 1280.
- qa-battle-tap-tap-moves-and-swaps: FIXED. `decideTap` never swaps; tapping another cat selects it. Empty cells show a teal move cue while a cat is selected. Tapping cells 0, 12, 7 in turn leaves the board unchanged; tap-move still works.
- qa-battle-tutorial-finger-over-preview: FIXED. The hand hides while a cat is held (`t1_dragmerge`).
- qa-battle-tutorial-bubble-covers-board-row: FIXED. The bubble weighs cats, pills, chips and the lane against each side, and the chips and synergy copy is two lines.
- qa-battle-hint-bubbles-over-hud: FIXED. Hints are dismissed when their control is used, with tighter padding. A grade hint can still touch the pills' bottom edge by a few px.
- qa-battle-skill-text-truncated: FIXED as an affordance only. A cut line now has an info mark and a full-height tap band; the text itself is still cut.
- qa-battle-damage-numbers-layering: FIXED. Numbers stay under the HUD edge and inside the sides. The crit burst sits on the field layer, below the HUD.
- qa-battle-continue-wave-number-mismatch: FIXED. The card reads "Wave 12/24" like the HUD (`b2_continue`).
- qa-battle-pity-chip-unlabeled: FIXED. Two-line chip, "천장" / "Pity" over the percentage.
- qa-battle-right-column-crowding: FIXED. Call button is 236 x 84, right edge on the odds button's, laser 4 px lower (`d1_call`).
- qa-battle-laser-affordance: FIXED. The laser button now plays `ui_click`, the tooltip closes when the dot is placed, and the hint no longer says "when it is on". I did not add an arm mode, since the dot goes straight onto the lane.
- qa-battle-feedback-gaps: FIXED. Measured with a wrapped `audio.play`: deselect plays `ui_back`, laser button plays `ui_click`. Swap pitch is raised in the code but I did not measure it.
- qa-battle-chapter-bg-similar: DEFERRED. The backgrounds are painted image files; a tint is an art decision and needs your confirmation before regeneration.
- qa-battle-boss-clipped-left-edge: FIXED. `EnemyView.drawX()` keeps big bodies 6 px inside the screen on the outer lanes, left and right (`i1_bosses`).
- qa-battle-tutorial-open-polish: FIXED for the hand (button's top-right corner, label readable, not cut by the screen bottom). The blank panel is REJECTED: it is the staged reveal in the GDD and fills once the chips appear after the first merge.
- qa-battle-merge-preview-hides-neighbours: FIXED. The bubble takes the cat-free side of the top and bottom rows when it fits, and hides the moment the cat is released. While a wave banner is up it can sit under it for about a second (`l1_preview_top`, `l1_preview_bottom`).
- qa-battle-elite-warning-covers-board: FIXED. The warning is a 100 px strip on the lane's top run (was 150 px over two rows); the first row is clear (`j1_warn`).
- qa-flow-relic-screen-tween-exception: FIXED. Deal and fade tweens are keyed per card and killed before `render()` destroys the card. I could not reproduce the real-run path from the sandbox; the debug `win()` flow with the toy screen open ran clean for 14 s with no page errors.

**tsc and tests.** `tsc --noEmit` prints nothing in my paths. The full `npx vitest run` is 64 files and 1,487 tests green. New tests are in `tests/view.hud.qa.test.ts`, the tap rule in `view.field.policy.test.ts`, and number bounds in `fx.numbers.test.ts`. Every browser run ended with `PAGE_ERRORS []`.

**Docs.** I appended "2026-10-07 QA fixes" sections to `docs/handoff/battle.md` (the full table), `hud.md`, `field.md`, `director.md` and `fx.md`, and corrected stale lines in `field.md` and `fx.md`.

**REQUESTS:** none. The earlier request on `SceneManager.cover` in `src/core/scene.ts` still stands.

# fix:shell

qa-code-pause-restart-blocked: FIXED. `flow.retry` now discards the pending run (no reward, no run counted) before `begin()`, and the old battle's wave saves are ignored. Checked in a real run: Pause > Restart > confirm gave a new BattleScene, a new seed, and `stats.runs` unchanged at 3.
qa-code-promo-card-reward-skipped: FIXED. The reward sheet no longer depends on the card still existing, and cancelled, failed and unavailable outcomes now toast like the shop. Checked with the dev store sheet: pay opened the Kitten Pack reward sheet and gems went 22 to 202.
qa-code-gameplay-lifecycle-holes: FIXED, one gap left. `gameplayStart` fires again on `revive`, and `HomeScene.enter` calls `gameplayStop`, so quitting from the pause menu cannot leave "playing" on in the menus. Both are covered by unit tests. After Pause > Quit the portal still sees play until Home is tapped, because `abandon()` emits nothing (REQUESTS 1).
qa-code-chest-reveal-never-replayed: FIXED. `afterFirstScene` replays `profile.data.reveals` through `services.revealChest` before offering a left-over run. Checked: open a chest, close the tab, reopen, and the reveal plays again; skipping it took `reveals` from 1 to 0.
qa-code-prerun-lines-labels-clipped: FIXED. Merge arrows are plain and only the awaken arrow carries its caption. Rank names get the room up to their neighbours via the new `captionRooms` helper, so "Alley Boss" is no longer cut. Screenshots in en and ko show no clipping.
qa-look-home-card-strings: FIXED. The daily tag shows the date ("Oct 8" / "10월 8일"). The promo contents are one row per prize behind a coral dot, checked in ko and en.
qa-look-pills-cramped: FIXED for spacing, and the "+" colour is FORWARDED. Gutters are 24 px with the coin sticker overhang counted, and the gap between pills is 33 px. The "+" disc colour is in kit `CurrencyPill` (REQUESTS 2).
qa-flow-prerun-adbtn-reenabled: FIXED. The new `LockSet` restores each button's own availability, and I added `tests/screens.shell.lockset.test.ts`. Checked: tapping a gem button with 12 gems gave "Not enough gems." and the ad buttons stayed grey.
qa-flow-tutorial-giveup-skips-ftue: FIXED. `dropInterruptedTutorial` discards a pending tutorial without counting a run. Checked: kill in the tutorial and reopen, and it lands in BattleScene with mode tutorial and `runs` 0.
qa-flow-endless-claim-label-truncated-en: FIXED. The strings are now "Cup prize" / "Weekly prize" at one size in 248 px buttons. Checked in an English screenshot: no ellipsis.
qa-flow-locked-card-untitled: FIXED. The locked veil keeps the icon and title row. Checked in an English screenshot of the Endless card.
qa-flow-locked-chapter-label-clipped: FIXED. The veil shows only the lock and the reason appears once, in the speech bubble. The English wording is now "Clear the previous chapter first."; I checked the locked chapter in ko only. The toast on tapping the disabled Go! button is unchanged, as tap feedback.
qa-flow-classline-en-overflow: FIXED. Same fix as the prerun-lines report above, checked in English.
qa-flow-classline-thumb-noise: FIXED. `shell/thumb.ts` gives each photo a pre-reduced, cached copy, and the thumbnails are clean in the screenshots.
qa-flow-claim-popup-after-apply: FIXED. Sweep and the give-up settle now fly the currency to the bar and show a toast, with no "claim" sheet. Checked both: sweep took gold from 1,410 to 1,692, and give-up took it from 470 to 552.
qa-flow-continue-wave-mismatch: FIXED by wording. The prompt reads "From wave N" / "N웨이브부터", which matches what happens: a wave save is taken as the wave starts, and a restore starts in the prep before it. Checked: the prompt says 3웨이브부터 and the resumed battle is in prep at wave 2.
qa-routine-unlock-toast-over-note: FIXED, proven from code only. `announceUnlocks` and `markUnlocksSeen` are gone, and `autoPopups` decides the unlock note from the profile, so each unlock is announced once. I did not reproduce the first-win route in the browser: the debug `win()` led to the toy pick screen instead of the result screen.

I also re-ran `npm run font` (new Hangul in the strings). The half-done edit was only a test mock: `screens.shell.flow.test.ts` passed `battle.events` in the wrong shape, so the code needed no change.

**State.** `npx tsc --noEmit` prints nothing for my paths; the only errors left are in `src/screens/shop/ChestReveal.ts` and `tests/screens.collection.shop.test.ts`, which belong to another owner. `npx vitest run tests/screens.shell`: 4 files, 45 tests passed. All Aside runs ended with `PAGE_ERRORS []`. Shots are in `C:/Users/dbals/AppData/Local/Temp/claude/C--MyProject-Project1/bab6e25d-5797-4d29-9afe-b47772556f90/scratchpad/shots/fix-shell/`. The hand-off section is appended to `C:\MyProject\Project1\docs\handoff\shell.md`.

**REQUESTS**
1. `src/view/hud/index.ts` `afterPause('quit')`: emit `ctx.events.emit('finished', { victory: false })` after `battle.abandon()`, so the platform gets `gameplayStop` on the result screen.
2. `src/ui` `CurrencyPill`: the "+" disc is leaf green on a teal strip; cream or mustard would read better (QA polish).
3. `src/meta/strings.ts`: `meta.toast.unlock` (ko and en) is no longer used by anything and can be removed.