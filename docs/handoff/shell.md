# Handoff: shell (app flow, home screen, battle tab, pre-run page), paper scrapbook restyle

Date 2026-10-06. Paths: `src/app/**`, `src/scenes/HomeScene.ts`, `src/scenes/BootScene.ts`, `src/screens/shell/**`, `src/screens/battle/**`, `src/main.ts`, `public/manifest.webmanifest`, `public/icons/**`, `index.html` (icon link only), `tests/screens.shell*.test.ts`.
Everything is drawn from the kit (`@/ui`): no hex literals in these paths, no glow, gloss or stroked text, no purple.

## Audit against the original SHELL specification

| # | Requirement | State |
|---|---|---|
| 1 | HomeScene at `?scene=home` and as the normal landing scene; top bar below the safe area (level + XP ring, gold / gems / tickets with "+" -> `services.openShop`, settings -> `services.openSettings`); five tabs in `TAB_ORDER`, battle in the centre and emphasised, badges from `badge()`; content area passed through `resize(area)`; cross-fade, tab state kept, `show()/hide()`, only the visible tab updated; `Shell` (ui clock, area, goTab, currencyAnchor, refresh, startRun); music `home`; `debugExpose('home')` and `debugExpose('meta')` cheats | done (restyled) |
| 2 | One async boot: platform -> meta -> saved settings -> lifecycle signals -> first scene (new player: tutorial; returning: home; `pendingRun`: "continue?"); platform / meta failure degrades with one toast; CSS splash stays until the first scene is ready | done; new: the title moment (below) |
| 3 | `Shell.startRun` -> pre-run page (chapter, stake rules, boss, three snack offers by ad or gems, or none) -> `profile.prepareRun` -> `BattleScene`; exit returns to the battle tab; retry restarts the same request; wave-start snapshot saved | done (pre-run page rebuilt) |
| 4 | Battle tab: chapter card with prev / next and 0..5 stake selector, big START, cards for patrol, free chest, today's treats, daily + weekly cup, endless, sweep, calendar dot, first-purchase offer; hidden or locked with a hint per `featureUnlocked`; every claim flies currency to `currencyAnchor` and calls `refresh()`; `badge()` | done (all restyled) |
| 5 | Loop verified in the browser | done, see Verified |

Defects found and fixed on the way: `xpFraction(NaN, n)` returned NaN (the failing unit test; the code is fixed, the test is untouched); runs started from the home screen had no `window.__dbg.battle` hooks; the meta-clock cheat froze every time reward after a reload (see Cheats); the continue prompt was a bare text dialog; locked cards were rebuilt on every profile change.

## The look, piece by piece

- **Home floor** (`shell/HomeFloor.ts`): the kit's `drawFloor` plus flat pale window panes and a trail of paw prints, one Graphics built per size. Home and battle lie on the same boards. The key art is only used for the title moment and as the chapter-1 photo.
- **Top bar** (`shell/HomeTopBar.ts`, `LevelBadge.ts`): the account level is a round paper sticker (`Lv` over the number) with a painted teal XP ring (animated, punch on level-up), a kit `ProgressBar` beside it with `a / b`, a round cream settings `IconButton`, and three kit `CurrencyPill`s (teal torn strip, round "+"). The top bar has no plate of its own: the pieces lie on the floor.
- **Tab bar**: the kit `TabBar` (kraft strip with torn edge, cream tab held by tape, coral hero button, berry badges). Locked tabs keep the kit's padlock.
- **Chapter card** (`battle/ChapterCard.ts`, `ChapterPhoto.ts`): a cream sheet with a teal dashed cut line. The chapter is a taped photo (a crop of the chapter background, or of the key art for chapter 1; `coverCrop` in `layoutMath.ts`, cropped textures cached per picture and size), the chapter name on a mustard `PaperLabel`, the chapter number on a teal one, the best-stake pill, the boss as a sticker (white-bordered art, flat shadow, a tilt; a flat silhouette while the chapter is locked), previous / next as round cream buttons (also swipe), five page dots, the calendar button with the kit dot. Butler levels are six paper tags: coral = picked, mustard = can be tried, cream = cleared (green check stamp on the corner), kraft + lock = locked (`stakeTagState` in `model.ts`, tested). The picked level's rule is written in a speech bubble whose tail points at its tag. A locked chapter gets a kraft veil with the reason on a cream label.
- **START**: the coral kit `Button` with tape; `shell/bob.ts` lifts it 7 px and tilts it 0.8 degrees on a 1.25 s sine loop (killed in `hide()`, skipped under reduced motion). The kit press feedback is untouched.
- **Home cards** (`battle/HomeCard.ts`): cream sheet, a paper disc with the card's icon, title above a dashed rule, one tape strip each (colour per card, position from the card's seed), buttons / bars / pills from the kit. Locked cards are a kraft sheet with a dashed line, the lock and the unlock hint. The first-purchase card has a mustard backing. Treats are three cream wells.
- **Pre-run page** (`shell/PreRunScreen.ts`, `ClassLine.ts`): a scrapbook page on the kit scaffold: the chapter photo with name, mode label, stake flag, the boss sticker with a "chapter boss" caption, a "rules this run" sheet (teal title), the four class lines (every cat of a class in rank order with merge / awaken arrows: what two identical cats become, hidden for the tutorial, shown for chapter, daily and endless), and the three snack offers on cream sheets (ad button green, gem button teal). The big START is coral with tape and bobs.
- **Continue prompt** (`shell/ContinuePrompt.ts`): a popup sheet with the chapter photo, the chapter name and a coral "N waves" label from the snapshot, then "continue" (coral) / "give up" (cream). The give-up confirmation and the settle rewards are the kit dialogs.
- **Logo** (`shell/Logo.ts`): drawn in code, the title by language ("냥이 수비대" / "Meow Guard") on a large cream torn label with a teal cut line, a gingham tape strip and a mustard paw sticker; `play()` drops it on with an overshoot and waves the paw. Used by the title moment and by `BootScene`'s "ready" card.
- **Title moment** (`scenes/BootScene.ts`, `main.ts`): on a real launch, once the services are up, the splash gives way to the key art with the logo on its calm top third for at least 1.1 s (a tap skips), then fades into the first scene. QA routes skip it (`?scene=...`, `?notitle=1`); `?titlems=N` stretches it for screenshots.
- **Toasts / dialogs**: the kit's.
- **App icons**: `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (cat at 62 % inside a safe disc), `apple-touch-icon.png` (180): `art/units_v2/unit_w_paw.png` as a sticker on a cream disc over coral paper, flat shadow, generated with PIL (one 40-line script, not kept in the repo). `public/manifest.webmanifest`: background `#fbf3e2` (cream), theme `#c48f50` (wood, same as the `index.html` meta), portrait, standalone. `index.html` links the 180 px icon for iOS.

There is no local palette. `ClassLine` and the pre-run photos reuse `unitPhoto` and `CLASS_ACCENT` from `@/view/hud/kit` (read-only imports, so the class colours and cat photos match the battle HUD); its arrows are filled with the class accent and outlined in ink, a drawn mark like the speech-bubble line. `HomeFloor` and `HomeCard` use only tokens.

## Wiring (unchanged unless noted)

- `main.ts` -> `createApp()` (`app/boot.ts`) -> `BootScene(first scene, services, onShown, titleMs)` -> `HomeScene` / `BattleScene`. `app/flow.ts` owns `startRun`, `offerContinue`, retry, wave-start snapshots, the exit callback (`setBattleExit(homeScene('battle'))`), and now also installs the battle debug hooks on runs started from home (debug builds only).
- `shell` (`shell/controller.ts`) is the single `Shell` object; the home scene attaches and detaches itself.
- `TabHost` builds the five tabs once per home scene.

## Cheats and debug routes (debug builds and `?debug=1`)

`?scene=home[&tab=cats]`, `?fresh=1` (empty save and real clock), `?lang=ko|en` (after the settings are applied), `?notitle=1`, `?titlems=N`.
`window.__dbg.home = { shell, scene, goTab }`; `window.__dbg.meta = { profile, addGold, addGems, addTickets, addCards, addChest, finishRuns, unlockAll, advance({hours, days}), startPending(chapter), reset }`; `window.__dbg.battle` (from the battle scene) now also exists after a start from the home screen.
`advance` moves the meta wall clock and the offset is kept in `localStorage` (`meowguard.debug.clockShift`) and applied before the profile loads: without that, a reload read as "clock set back" and froze patrol, chest and calendar (`profile.frozen`, "기기 시계가 바뀐 것 같아요"). `?fresh=1` and `reset()` clear it.
`window.__dbg.home.scene.host.tabs.battle.scroll.scrollTo(y, false)` scrolls the battle tab deterministically for screenshots (a drag keeps its inertia).

## Verified

`npx tsc --noEmit`: nothing printed for the whole tree. `npx vitest run tests/screens.shell tests/ui`: 5 files, 96 tests green (new: `coverCrop` x4, `stakeTagState` x2; the xp ring test now passes).
Aside runs, `PAGE_ERRORS []` on all of them except the chest reveal (see REQUESTS 2). Screenshots are in `scratchpad/shots/shell/` (the folder of this session):

- `before_home.png`, `before_home_unlocked.png`: the old look, for comparison.
- `h1.png` (first home after the tutorial, top), `sa1.png`/`sa2.png` (the same home scrolled: only patrol and chest open, the rest kraft with hints), `sd1.png`-`sd3.png` (every card waiting or claimable: promo, patrol, free chest, sweep, treats, daily + cup, locked endless), `r1.png`/`r2.png`, `cn1.png`/`cn2.png` (patrol claim with coins flying to the bar, badge going 5 -> 4), `fin_en_1280.png`, `fin_en_1600.png`, `fin_en_1600_b.png` (English, 1280 and 1600 tall), `chapters.png` (chapters 3, 4 and the locked 5 with tags, dots, stamp, bosses).
- Pre-run: `h2.png` (top, chapter 1 with the key-art photo), `daily2.png` (daily rules + the four class lines), `sc1.png`/`sc2.png` (snack rows), `d2.png`/`en2.png` (English).
- Continue prompt: `p1.png` (with the "1웨이브" label and the key-art photo), `t1.png` (at 1600 tall).
- Title moment: `e2.png` (ko), `title_en_tall.png` (en, 1600 tall).
- Loop: `e3.png` -> tutorial -> `f1.png`/`g3.png` -> result `l2.png` -> home `h1.png`; chapter run from the home `n0.png` (pre-run) -> `m1.png` -> `m2.png` (home after a win: chapter 3 selected, level-up popup, gold 1,517 -> 2,128, `cleared` [1,1,...]); pending run -> `pc1.png` -> continue into the battle (scene `BattleScene`).
- `icons.png`: the four app icons.

Loop numbers (from the run logs): fresh profile -> tutorial win -> `runs 1`, gold 190, 26/120 XP, home shows chapter 1; a chapter-2 win from the home (the frontier) -> `cleared [1,1,0,0,0]`, gold +611, XP +58, the card selection moves on to chapter 3; patrol claim +672 gold with the badge dropping by one; free chest claim -> reveal opens and 5 cards land; killed mid-run -> next boot offers "continue" and resumes.

## Known gaps

- The Aside tab renders about 2 fps, so motion (bob, logo drop, tab fade, coin flights) was checked by stills and by state, not by feel.
- Currency, chest and toy icons are the old art until the redrawn ones arrive under the same keys: `ChestCard` uses `icon_chest_wood`, `claim.ts` flies `icon_gold` / `icon_gem`; both go through `hasTex` with a drawn fallback and need no change.
- Sweep was restyled but not re-run through a real tap (the logic is unchanged and was exercised through the profile).
- The wooden floor has no real window artwork; the pale panes are flat shapes at 10 % opacity.
- A tablet / desktop landscape layout does not exist (the portrait stage is centred), as before.

## REQUESTS (outside my paths)

1. `src/meta` `featureHint`: the locked-card text reads "주방을(를) 클리어하면 열려요." (a chapter name with the particle written as "을(를)"). A phrasing without a particle ("클리어하면 열려요: 주방") or a particle-aware helper would read better on every locked card and tab toast.
2. `src/screens/shop/ChestReveal.ts` (`buildCards`, reached from the free-chest card through `services.revealChest`) writes a `console.warn` when a free chest with cards is opened (it shows in `window.__errors`), and the reveal screen is still the old dark purple scene.
3. `src/core/scene.ts` `drawCover` fills the transition cover with `0x120b24` (dark purple), so the iris into a battle and the fade out of a splash are purple; `src/core/game.ts` creates the Pixi application with `backgroundColor: 0x1b1233`. Both should be warm brown (`Dim.backdrop`, `Color.woodDark`).
4. `npm run font`: the Hangul subset predates the strings added here ("합성 줄", "합성", "각성", "N웨이브"); they render today through the fallback font.

## 2026-10-07 QA fixes

Six testers' reports (`docs/qa/findings_shell.json`, 17 items) went through one by one; each was confirmed first (browser or code), then fixed at its root and checked again the same way. Aside runs ended with `PAGE_ERRORS []`; shots are in `scratchpad/shots/fix-shell/`. `npx tsc --noEmit` prints nothing for these paths, `npx vitest run tests/screens.shell` is green (4 files, 45 tests).

- **Restart from the pause menu** (`app/flow.ts` `retry`): the run in progress is still the pending one, so `prepareRun` refused it. `retry` now calls `profile.discardPendingRun()` (no reward, no run counted) first; after a result nothing is pending and that is a no-op. The wave-start save of the old battle is ignored once its run is no longer the pending one (the old battle stays on screen for the length of the transition). Checked in a real run: new scene, new seed, `stats.runs` unchanged.
- **Platform play signals**: `gameplayStart` again after a `revive`; `HomeScene.enter` calls `gameplayStop`, so quitting from the pause menu cannot leave "playing" on in the menus. Open: after Pause > Quit the portal still sees play until Home is tapped (see REQUESTS 1).
- **Killed tutorial** (`dropInterruptedTutorial`): a pending tutorial run is discarded without counting as a run at boot, in `startRun` and in `offerContinue`; a new player gets the tutorial again instead of a "continue / give up" prompt that paid it out. Checked: kill in the tutorial, reopen: `BattleScene`, mode `tutorial`, `runs` 0.
- **Chest reveal cut short**: `afterFirstScene` replays `profile.data.reveals` (oldest first, only over the home scene) through `services.revealChest` before it offers a left-over run; the reveal acknowledges itself when it ends. Checked: open a chest, close the tab, reopen: the reveal plays again, `reveals` goes 1 -> 0.
- **Rewards that are already in the profile no longer ask to be "claimed"**: sweep and the give-up settle fly the currency to the top bar through `playClaim` and show a toast; only cards and chests get a sheet. Checked both in the browser (bar 1,410 -> 1,692 gold after a sweep, no sheet).
- **First-purchase card**: the reward sheet no longer depends on the card still existing (the grant makes it go away before the store call returns), and cancelled / failed / unavailable outcomes toast like the shop does. The contents are one row per prize behind a coral dot (no more "180" running into "은 상자"). Checked with the dev store sheet: pay -> reward sheet.
- **Pre-run snack buttons** (`shell/LockSet.ts`): buttons that go quiet while a start is in flight come back to their own availability, so an ad that is not ready stays grey after a refused gem purchase (tests in `screens.shell.lockset.test.ts`; checked: "Not enough gems." and the ad buttons stay grey).
- **Class lines** (`ClassLine.ts`, `layoutMath.ts` `classLineSlots` / `captionRooms`): the merge arrows are plain (the panel's hint says what they mean), only the awakening arrow carries its caption in a gap of its own, and each rank name may use the room up to its neighbours' names ("Alley Boss" is no longer cut). The photos get a pre-reduced copy (`shell/thumb.ts`, exact 2x2 halvings, cached per size) instead of a 10x GPU minification, so they are clean stickers.
- **Home cards**: the daily tag shows the date ("Oct 8" / "10월 8일", `dailyDateLabel`) instead of the ruleset key; locked cards keep their icon and title above the veil; a locked chapter's veil shows only the lock (the reason is written once, in the speech bubble, "Clear the previous chapter first."); the English claim buttons are "Cup prize" / "Weekly prize" at one size, both columns 248 wide.
- **Top bar**: 24 px gutters, the coin sticker's overhang counted (`pillRow`), 33 px between pills.
- **Continue prompt**: it reads "From wave N" / "N웨이브부터", which is what happens (a wave save is taken as the wave starts and a restore starts in the prep before it).
- **First-win toasts**: `HomeScene` no longer toasts unlocks (and `markUnlocksSeen` is gone): the unlock note of `screens/system/autoPopups.ts` is decided from the profile and lists them once.
- `npm run font` was re-run (new Hangul in the strings).

Rejected: none. Forwarded: see REQUESTS.

### REQUESTS (outside my paths)

1. `src/view/hud/index.ts` `afterPause('quit')`: `battle.abandon()` emits nothing, so the context never announces `finished` and the platform keeps believing the player is in play on the result screen. Emitting `ctx.events.emit('finished', { victory: false })` there (the flow's `gameplayStop` listens to it) would close the gap.
2. `src/ui` `CurrencyPill`: the round "+" is leaf green on a teal strip; cream or mustard would read better (QA polish, `qa-look-pills-cramped`).
3. `src/meta/strings.ts`: `meta.toast.unlock` is no longer used by anything.

## 2026-10-07 finishing pass

- **Desktop frame** (`index.html`): only where the window is wider than 9:16 (`@media (min-aspect-ratio: 9/16)`), the page around the canvas is a CSS floor: 172 px planks with a groove and a light edge, alternating tone, staggered end joints (`html::before` and `body::before`, each masked to every other row), a vignette (`#stage::before`, behind the canvas) and a flat stepped shadow on the canvas. Colours are the kit's wood tokens (`#c48f50`, `#a06a33`, `#e0b070`); no image is loaded. A phone is narrower than 9:16, so none of it is declared there and it paints the flat colour only. The boot splash is unchanged and sits above the floor.
- **Legal and support links** (settings > About): `src/app/legalLinks.ts` reads three build-time variables. A row appears only for a variable that is set to an `http(s)://` URL (or, for support, a `mailto:` address); anything else hides it. With none set the About block is not drawn and only the version line shows.

  | Variable | Row |
  |---|---|
  | `VITE_PRIVACY_URL` | 개인정보 처리방침 / Privacy policy |
  | `VITE_TERMS_URL` | 이용약관 / Terms of service |
  | `VITE_SUPPORT_URL` | 문의하기 / Contact support |

  Set them where the build runs, e.g. `VITE_PRIVACY_URL=https://example.com/privacy VITE_TERMS_URL=https://example.com/terms VITE_SUPPORT_URL=mailto:help@example.com npm run build` (or in `.env.production`). Web pages open in a new tab with `noopener,noreferrer` (the platform layer has no link opener; if a channel needs one, change `openLegalLink` only); a `mailto:` goes to the mail app. The keys are typed in `src/vite-env.d.ts`; the pure part (which rows show) is tested in `tests/screens.system.links.test.ts`.
- **Piggy bank line** in the shop reads `tn('meta.piggy.free', days, ...)`, so English says "After 1 day".

## 2026-10-07 motion review

Stepped frame by frame at full motion (method and tools in `docs/handoff/ui.md`, "2026-10-07 motion review"; strips in the session scratchpad `shots/<folder>/`).

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| CSS splash to title | `title/strip_title`, `title2/strip_logo` | The splash card fades out in 0.35 s (CSS opacity) under the key art: fine. The logo's first play could not be caught (see below); a replay shows the plate dropping with a back ease and the paw popping and waving: right | none | same |
| Title into the first scene | `title2/strip_logo` | Hard cut: the key art was replaced by the home scene in one frame (`goto(..., 'none')`, meant for the splash that covers it) | with a title moment the hand-over goes through the fade cover (0.2 s out, 0.25 s in) | art dips out, home fades in |
| Iris into and out of a battle | `iris/strip_iris` | Broken: the cover is a rectangle with a round hole, and a hole larger than the rectangle does not triangulate, so for the first 60 % of the close and the last 55 % of the open the whole screen was solid dark and the circle only appeared at the very end (`core/scene.ts`) | the cover is a stroked ring wide enough to reach every corner, no hole | the circle sweeps in and out; 0.38 s cubic-in close, 0.45 s cubic-out open |
| Level sticker and XP ring on a level-up | `v_level/strip_lv` | The ring and the bar unwound backwards (78 % to 25 %) and the number changed at once | both fill to the brim together, the sticker takes the new number with its punch, the next level starts from empty; a second refresh during the sequence no longer cuts it (`LevelBadge`, `HomeTopBar`) | one continuous fill |
| Currency pill receiving flying coins | `v_fly/strip_fly`, `v_land/strip_land` | The number rolled the moment the reward was granted, 0.8 s before the first coin arrived, and the icon only punched once after the last | `Shell.pending(kind, n)` puts the pill back to its old amount while a flight is on its way, `Shell.landed(kind)` bumps the icon per coin and starts the roll at the first one (claims on the battle tab, missions, calendar, reward sheet; the sheet holds the pills back for as long as it is open) | coins land, icon bumps, number rolls (2만 to 2.08만 in `strip_land`) |
| Chapter card previous / next | `h_chapter/strip_chap` | New photo slides in 70 px while the old slides out, cubic ease, labels cross-fade: reads well | none | same |
| Butler level tag, rule bubble | `h_chapter/strip_tagp`, `v_bob/strip_tag2` | Tail jumped to the new tag and the rule text swapped in one frame | tail glides with a small overshoot (0.22 s) and the new rule slides up 10 px while fading in | follows the pick |
| START idle bob and press | `h_start/strip_bob`, `v_bob/strip_bob2` | The whole button (shadow included) moved 7 px: no depth, barely visible | `Button.setLift`: the paper rises 9 px off its flat shadow, the shadow stays (also on the pre-run page's start button) | reads as a float |
| START press into the pre-run page | `h_start/strip_startp` | Press fine; the page's floor popped in while the content faded | the scaffold change above | page rises and settles over the home |
| Home cards, tab swap | `pass/strip_pass` | Cross-fade 0.2 s in (cubic-out) / 0.1 s out: fine | none | same |
| Patrol claim | `h_cards/strip_claim` | Button turns grey at once, coins burst from it and hang: fine | burst and curve kept short beside the screen edge | same |
| Free chest / patrol becoming ready | `h_cards/strip_ready` | The card swaps state in one frame, the button pulses three beats: fine | none | same |
| Returning home with rewards | not captured | needs a played battle | | |

### Could not capture

- The first play of the logo: the splash and the title start before the page can be frozen, so the title strips show the plate already settled (a replay of `Logo.play` is in `title2`; its first three frames show the cream plate without its text, which is the replay starting from a settled state, not what a player sees).
- Returning from a battle with rewards (the home scene counting up behind the result) and the CSS splash fade itself (not on the game clock).

### REQUESTS

- The result screen / `src/scenes/BattleScene.ts`: after a win the home scene is built fresh, so its pills roll from zero. A `Shell.pending(kind, amount)` call for the run's rewards before the scene change would make them roll up with the coins like the other claims.

### Second pass

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| Return from a battle with rewards | `ret2/strip_rt` | Right: the result page is cut away by the iris (0.38 s), the dark holds for the scene change, the home opens (0.45 s) with the coins already flying from the middle (`view/hud/homeClaim.ts`, `Shell.pending` before the first frame), the pills keep their old numbers until the first coin lands (`3.04만` at the end), the battle tab is on the picked chapter, the badges are drawn with the new state | none | same. The `coin_many` sound is on the frame the scene swaps, about 0.1 s before the iris shows the burst: inside a beat, left alone (the call is in the HUD's file) |
| Continue prompt after a simulated kill | `cont/strip_cp` | Opens as a kit popup over the home; "give up" closes it and opens the "really?" dialog after a 0.1 s bare home: right | none | same |
| START bob on the pre-run page | (code, see `ui.md`) | began while the page was still rising, so the lift and the rise added up | `PreRunScreen` starts the bob in `scaffold.show(true, onLanded)` | the button floats once the page has settled |
| Tooltip fade-out | `tip/strip_tp` | not re-captured | none | see `ui.md` |

### Could not capture (second pass)

The first play of the logo and the CSS splash fade (as before: they happen before the page can be frozen). The automatic unlock note in the queue never came up in two runs (the level-up note took its place), so only comeback, its reward sheet and level-up were seen.

## 2026-10-07 owner feedback

**F. "Next chapter" after a win.** `RunConfig.next` (see `src/view/context.ts`) is now supplied for every run the app flow builds (home start, retry, continue, tutorial). The battle owner only has to call `run.next?.()` when the won result screen is built (after `finishRun` has paid out: it returns null before, and for a result that was never recorded) and draw a button from `{ chapter, stake, start() }`; `start()` needs no further care.
- **Decision** (`src/app/nextRun.ts`, pure, `nextRunPlan(cleared, lastRun)`; `tests/screens.shell.nextRun.test.ts`): from `profile.data.cleared` and `profile.data.lastRun` after the payout. A defeat, a daily and an endless run offer nothing; the tutorial leads to chapter 1 at butler level 0. A chapter run leads to the next chapter at the same butler level when `canPlayStake` says so, otherwise to that chapter at the highest level the player may play (a won chapter always unlocks the next one, so there is always level 0). After the last chapter: the same chapter at the next butler level, only when this win is the first clear (so that level "just unlocked") and the level exists; otherwise null.
- **Path** (`src/app/flow.ts`): `nextRunOf(init)` builds the closure; it only answers for the run this battle played (the record's mode, chapter and level must match). `start()` calls `startRun({ mode: 'chapter', chapter, stake }, onOpened)`, the very function the home screen's start button is wired to: the "run in progress" offer (`offerContinue`), the pre-run page with rules and snack offers, `prepareRun` (pending-run record), the `iris` transition and the platform play signals (`gameplayStart` in the battle's created hook). `startRun` gained an optional second argument `onOpened`, called once the battle is opening (not when the player backs out of the page). The flow uses it to call `rememberSelection({ chapter, stake })` (new, exported from `@/screens/battle`): the battle tab then shows that chapter and level when the home scene is rebuilt, and treats the finished run as seen, so Home afterwards shows the same place instead of what the finished run alone would have pointed at.
- **Replay of stored reveals** (`afterFirstScene`): one call, `services.revealChest([...profile.data.reveals])`; the service plays chests opened together as one pile and the others one by one (see `collection.md`).
- Checked in the browser (Aside, `?scene=home&tab=battle&fresh=1`): chapter 1 started from the home screen, `__dbg.battle.win()`, `scenes.current.run.next()` -> `{ chapter: 2, stake: 0 }` (null before the win), `.start()` -> the pre-run page opens over the result screen, START -> battle of chapter 2 level 0, a rebuilt home scene shows "챕터 2". Unit tests: `tests/screens.shell.flow.test.ts` (new block: null before the payout and for another run's record, tutorial -> chapter 1, pre-run page request, cancelling moves nothing, starting prepares the run and moves the chapter card), `tests/screens.shell.nextRun.test.ts`.

## 2026-10-07 last gaps

**1. "Open all" on the home free-chest card** (`battle/ChestCard.ts`; pure rules `chestsWaiting` and `chestPile` in `battle/model.ts`). Waiting chests = the wooden chests in hand plus the free one when it is ready (it is claimed first). From two on the card offers "한번에 열기 (N)" / "Open all (N)" (N at most `CHEST_BULK_MAX`, the same rule as the shop's `pileSize`). The tap claims the free chest when it is ready, then calls `profile.openChests('wooden', N)` and hands the stored list to `services.revealChest` once: one rattle, one pop, one merged summary, exactly the shop's path.
Without crowding: the card keeps its 376 px height. With a pile the picture shrinks (84 x 80) beside a "N chests waiting" line, and the coral "열기" (92 px) and the mustard "한번에 열기" (88 px) stack so that their lower edge lands on the line where the sweep card's button ends. While the countdown runs with a pile, the countdown bar and "open all" replace the ad and gem skip buttons (they are back as soon as the pile is opened). Three layouts, placed only when the layout changes.
Seen (scratchpad `shots/c1`, Korean `shots/chest1`): ready with one chest; ready plus one in hand ("2 chests waiting", "Open all (2)"); 100 chests ("Open all (50)"); countdown with a pile; plain countdown with ad and gems; sweep with no tickets. Tests: `tests/screens.shell.model.test.ts` ("free-chest card: open all").

**3. "Try it" on the home screen points** (`shell/HomePointer.ts`, geometry in `shell/pointerMath.ts`). `shell.pointAt(tab, point)` (new on the controller and on `HomeSurface`) opens the tab, asks it where `point` is and shows a soft spotlight (the tutorial's dim at half strength, a dashed window 10 px off the target) with the tutorial's paper hand (`view/hud/Hand`) tapping at its near edge: from above when there are 120 px between the window and the top bar, from below otherwise. It blocks nothing and leaves on the first press anywhere (the stage hears the press and the control under it still gets it), when the target is gone or hidden, or with the scene. It re-measures ten times a second (blocks rebuild, so a resolver is a closure, never a held object) and repaints only when the window moved. Reduced motion: no fade, no pulse, no tap loop.
`TabScreen.pointAt?(point)` is the new optional method: each tab brings the thing into view (`ScrollView.scrollToShow(target, POINT_MARGIN = 84)`; the margin clears the raised middle tab) and returns the resolver.
Points (`HomePoint` in `guide/topics.ts`; every topic of the home section has one): `cats.cards` (first photo of the first visible class page), `cats.wild` (the wild-card strip), `shop.free` and `shop.chests` (the free and the silver chest cards, via `BlockBuild.points`), `battle.calendar`, `battle.stakes` (the six butler-level tags), `battle.patrol`, `battle.sweep`, `battle.daily`, `battle.cup` (the cup bar), `battle.endless`, `missions.list` (first mission of the day), `missions.chest`, `pass.head`, and `settings.backup` (answered by the settings sheet, see `routine.md`).
Verified end to end with real taps (settings, guidebook, "고양이 카드와 레벨" page, "가 볼래요": the cats tab with the hand on the first photo; the backup topic: the settings sheet scrolled to "코드 보내기" with the hand on it) and by calling `__dbg.home.shell.pointAt(tab, point)` for every point (scratchpad `shots/pt1`, `pt2`, `e2e`). Tests: `tests/screens.shell.pointer.test.ts`, `tests/guide.topics.test.ts`.

**4. Alignment audit, home half.** Method: a display-tree walker run through `window.__dbg` (scratchpad `h/audit.js`, not in the repo). For every visible text it finds the smallest paper (Graphics or Sprite) the text sits on and reports a text more than 3 px outside it; it also reports two texts overlapping, a text cut by the screen edge or the safe area, an icon more than 5 px off its disc's centre and a badge on a text. Scroll views are clipped to their own rectangle. It was run on a rich profile (gold 99,999,999, gems 1,234,567, 90 tickets, 9,999 cards, chests waiting) in Korean 1280, Korean 1600, English 1280 and English 1600 (and 1600 with a 34 px home-indicator inset). Covered: title; home top bar; the five tabs (so the tab bar with every tab selected); the battle tab at four scroll positions and in every state of its cards (fresh profile without cards, after one run with locked cards, rich, free chest ready / ready with a pile / countdown with a pile / plain countdown, sweep with and without tickets); the chapter card for chapters 1, 2 (locked), 3 and 5 and butler levels 0, 1, 3 and 5 (bubble tails on the picked tag); pre-run page; cats tab and its five filters; unit screens of three cats (scrolled too); every shop section; odds screens; chest reveal (a gold chest, a pile of 12 silver) with its summaries; reward popup; missions daily and weekly (top and bottom); the pass (start, middle, end); settings at five scroll positions; guidebook list, home list and a page; calendar; the backup export, import and preview stages; the automatic popups (level up, new unlocks, welcome back); toasts of the four kinds; the test ad sheet and the test purchase sheet. Every screenshot was also looked at (Korean 1280 and English 1600 in full; the others where the walker flagged something or the text is longest).
Real faults found and fixed: (a) the Meow Code import sheet's button row was off centre and its right button ended 5 px short of the sheet's edge (`routine.md`); (b) the icon of a button with a sublabel overlapped the sublabel (`ui.md`: the guidebook button in settings, the sweep card's gem button); (c) the guidebook's topic rows kept their two text lines high in the row, 30 px above the picture's centre, now centred (`guide.md`); (d) a Korean perk line and a bundle contents line joined with " · " could wrap with the dot at the start of a line (the Butler pass card), now comma lists (`collection.md`); (e) the free-chest card's own button line (item 1).
Findings that are not faults: the walker's remaining lines were a label over its sublabel overlapping by 5 px of line box with no ink on ink, the level badge's "Lv" over its number (6 px of line box), mid-flight cards of a chest reveal, and content that lies behind the tab bar or under a locked card's veil.
Left alone, outside my paths (REQUEST): the test ad sheet (`platform/adapters/devOverlay.ts`) keeps room for the "claim" button that appears after the countdown, so for those 2 seconds there is a 200 px empty hole between the countdown line and the "close" button.
Not reached: the daily gem-pass popup (needs the pass bought; it is the same `NoticePopup` as the welcome-back popup that was checked).

**5. Final captures** (scratchpad `shots/f1_full`, `shots/f1_reduced`, comparison sheets `cmp1.png` and `cmp2.png`): home, shop, cats, missions, pass, the sweep pointer, the settings sheet and the guidebook at full motion and with "reduce motion" on (`motion.reduced` read in the page: false / true). Same layout and the same walker result in both (the only difference is the start button's bob); no page errors.

REQUESTS: the test ad sheet's empty gap (above); nothing else.

## 2026-10-07 fixups

**2. The paw on the home side** (`shell/HomePointer.ts`, `shell/pointerMath.ts`; `tests/screens.shell.pointer.test.ts`, 8 tests). The pointer still turned the whole `Hand` container by half a turn and scaled it to 0.72 (a 100 px paw lying with its arm over the label, tapping at the window's edge). It now uses the hand's own API like the tutorial does: `Hand.place(x, y, rotation)` and `Hand.tap()` at full size (`PAW_LENGTH` 140), and the geometry is `pawFor(target, room, texts)`:
- the tip lands on the part of the target the page shows (`visiblePart`; a card scrolled half out is pointed at where it can be seen); `tipSpot` gives the first spot, a wide card (150 px or more) offers three more (lower right, lower left, middle of the lower edge);
- `placePaw` (battle's `handMath`: from below at a 15 to 35 degree slant first) is run per spot with `room` as its bounds; the cost adds the target's own lines of writing (every visible `Text` under the target, measured when the window is painted) and a tip that would land on a line; the cheapest wins. So the paw reaches in from below at a slant, never lies flat or upside down, never leaves `room`, and keeps off the text it points at as far as the target allows.
- `room` is the page between the bars (`shell.area`, so neither the screen edge nor the tab bar cuts it); `showPointer(parent, resolve, room)` takes another one: the settings sheet passes `scaffold.bodyRect`.
- Patting goes on across repaints (only the first paint starts `tap()`); `handAbove` and `HAND_ROOM` are gone with the old placement. Fade in and out go through `fadeTo` (see `ui.md`).
- Seen at full motion: the guidebook "try it" on ten points (battle.calendar, daily, stakes; cats.cards, wild; shop.free, chests; missions; pass) in Korean 720 x 1280 (scratchpad `shots/ptr1_sheet.png`) and a 12-frame tap strip on the free chest button (`shots/ptr2/strip_tap.png`): the arm comes in along its own line, touches (ring at the tip), draws back. Unit tests cover 720 x 1280 and 720 x 1600 (inset 44 / 34) rooms with a small icon, a wide card with two lines of text, a card on the last row, an icon at the right edge, one in the lower left corner and a tall card.

**3. Art swap of the chapter card** now slides through a settled keyed tween (see `ui.md` item 2); the cats tab's layout stops a running rise.

## 2026-10-07 precision

Home cards (layout numbers in `ui.md`, "2026-10-07 precision"). `HomeCard` takes its header from `headerLayout` (disc 56, icon 38, one centre line with the title and the right-hand control, separator 24 px in at both ends and 12 px under the row, body 12 px under it): the chest card's info button, the promo flag and the daily card's date tag sit on `head.control` / `head.cy`. Every card's height grew by `HEAD_GROW` (20 px; the featured promo card also by its 9 px rim), and the bottoms were evened out so each card ends 24 px under its last visible element (promo +25 because its price button's lip ran past the bottom edge, patrol -7, chest and sweep +6). The locked veil's dashed slot starts under the header. Measured with `tools/kit_zoom.sh` (content 22.6 to 25.6 px from the card's sides on every card). Nothing else of the shell moved: the top bar's pills and badge share the 24 px side margin, the tab bar is unchanged. Stills in the session scratchpad: `shots/home2`, `lock2`, `en1`, `ver1`.
