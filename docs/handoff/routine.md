# Handoff: routine screens (missions, season pass, settings, calendar, automatic popups), paper scrapbook restyle

Date 2026-10-07. Paths: `src/screens/missions/**`, `src/screens/pass/**`, `src/screens/system/**`, `tests/screens.routine*.test.ts`.
Everything is drawn from the kit (`@/ui`) plus a few paper pieces of its own in `src/screens/system/kit`. No hex literals, no local palette, no glow, gloss, stroked text or purple in these paths.

## Audit against the original ROUTINE specification

| # | Requirement | State |
|---|---|---|
| 1a | Missions: sub-tabs daily / weekly | done |
| 1b | Daily: five missions (icon, text with numbers from the meta layer, progress bar, reward, Claim that becomes a check), points bar with its chest at 100, time left until reset | done. The icon medallion became a check box (the metric icon was decoration and no longer fits the to-do list); the reset time is a paper tag; the row also shows its points on a mustard label |
| 1c | Weekly: five missions, the all-done chest, the weekly cup (this week's best waves, three tiers with claim), endless tiers (40 / 60 / 80) | done. New: the cup card lists the seven days of the week with the best wave of each, today circled |
| 1d | Claims animate rewards and call `shell.refresh()`; `badge()` = claimable things; locked features show their unlock hint | done (`payout` flies currencies to the top bar, anything else goes through `services.showRewards`; the locked cup / endless are kraft notes inside their cards) |
| 2a | Pass: season name, days left, current tier, XP bar | done |
| 2b | 30 tiers, free and premium reward side by side, states locked / claimable / claimed, premium dimmed with a lock until owned, Claim per cell, "claim all", auto-scroll to the current tier | done |
| 2c | Premium purchase (platform IAP through the meta layer; hidden when purchases are unavailable), retroactive unlock celebration, `badge()` = claimable cells | done (without a store the coupon is replaced by a plain "premium" lane label) |
| 3a | Settings: music and sound sliders, shake (3), flashes, haptics, damage numbers, effects quality (4), language applied live, "냥이 코드" export with copy and import with paste, preview and confirmation, restore purchases, version, reset behind a double confirmation | done. Partial in one point: the settings persist through the battle HUD's settings store (`meowguard.settings`, shared with the pause menu so both always agree) and the effect-quality choice through `meowguard.routine`; the meta profile has no settings slot. Applied at once to audio, `game.shakeScale`, fx, haptics and i18n |
| 3b | Calendar: 28-day grid, today highlighted, claimed and upcoming states, days 7 / 14 / 21 / 28 emphasised, Claim | done |
| 3c | Automatic popups from the profile: comeback, feature unlocked (with a jump button), account level-up with its gems, monthly gem pass; one at a time, never during a battle | done (the gate is `popupPolicy.mayShowPopup`; checked in the browser, see Verified) |

Defects found and fixed on the way: the import popup was a fixed 740 px tall (a hole under the buttons on the first stage); the comeback popup read "돌아온 걸 환영해요! 은 상자와..." (a meta string with a dangling particle), it now has its own line; seven unused strings were deleted; `calendarCellState` and the big-day rule moved into a pure module with tests.

## The look, piece by piece

- **Notebook** (`missions/Notebook.ts`, `MissionRowView.ts`): the five missions are lines on a ruled cream page with a coral margin line, three punched holes and a teal label with tape ("오늘 할 일"). Each line: a paper check box, the mission text, a painted green bar, the reward as a sticker, and the control. A finished line gets a dashed teal ring round its box and a green Claim button; the claim writes a double-pass check into the box, draws a pen line through the text from left to right and slams a "받았어요" rubber stamp where the button was. Not done = a quiet "가기" button.
- **Chest strip** (`ChestStrip.ts`): the daily and the weekly chest are a featured card (cream on a mustard backing, a pink gingham tape): a label, the painted gold points bar that ends under the chest sticker, the reward stickers, Claim and "확률 보기". The chest wiggles three times when it opens. Daily carries the reset countdown tag; weekly shows it on the notebook.
- **Tier card** (`TierCard.ts`, `TierCell.ts`): cup and endless are cream cards with a teal cut line, an icon sticker, a mustard label with the standing, one painted bar with goal marks, and three tier cells (goal, reward stickers, then a bar / Claim / stamp at the foot; a ready cell gets the teal dashed ring). The cup also lists Mon to Sun.
- **Pass** (`PassTab.ts`, `PassRowView.ts`, `Coupon.ts`): a header with the season on a coral label, a "days left" tag, the tier as a mustard sticker, a cream tier label over the painted XP bar, "claim all" with the count badge. Under it two paper lanes with torn ends: cream for free, mustard for premium, a kraft track with a mustard painted fill between them, and a numbered sticker for every tier (mustard once reached, larger with a strip of sky tape for the current tier). Rewards are stickers on cream cards; a claimable card gets a teal dashed ring and a green "받기" tag, a claimed one a round check stamp, a locked one a padlock sticker. The premium purchase is a mustard **coupon** with a perforated stub and the crown; it presses like a button and shows a spinner while the store is open. After a purchase paper confetti falls (`kit/confetti.ts`, one `Fx` created per burst and released 4.5 s later) and a note lists what opened.
- **Settings** (`settingsScreen.ts`, `settingsForm.ts`): four cream sheets (sound, screen, game, my records), each with its teal label across the top edge and rows divided by dashed lines; kit sliders, toggles and segmented strips; the backup code and restore purchases inside "my records"; the destructive reset alone on a kraft note with tape and a dashed line, then the version on a kraft tag. Language switches live (the screen rebuilds itself after the handler returns).
- **Backup popups** (`backupPopups.ts`, `domField.ts`): the paste / copy field is a real `<textarea>` over a recessed well, with a teal dashed border, an ivory slip and ink text. The preview is a torn receipt of ruled rows; the replace warning is a mustard note with a warning sign; the sheet is cut again at the height of each stage.
- **Calendar** (`calendarPopup.ts`, `calendarModel.ts`): a wall calendar page. A kraft header strip (calendar number, days done), 24 ordinary date squares with a small sticker each, and the last column wider with a bigger sticker on a mustard backing (days 7 / 14 / 21 / 28). A claimed day shows a round check stamp, today a marker circle round the date, a strip of tape and a gentle breathing; the extra part of a reward is a small sticker in the corner.
- **Automatic notes** (`kit/noticePopup.ts`, `autoPopups.ts`): one small paper note, one sticker (ivory disc, tilted, pops in), one or two lines, reward stickers and one or two buttons. The unlock note lists up to three features on ruled lines ("그리고 N가지 더").
- **Kit** (`system/kit`): `sheets.ts` (`paperSheet`, `sharedSheet`, `stickerDisc`, `lockedNote`), `marks.ts` (`CheckBox`, `StampMark`), `rewardChip.ts` (`partSticker`, `RewardChip`, `RewardList`), `tags.ts` (`NoteTag`, `TimerTag`), `confetti.ts`, `claimFx.ts`, `noticePopup.ts`.

## Wiring

Unchanged from the first hand-off: `createMissionsTab`, `createPassTab`, `installSystemScreens(shell)` (called once at boot by `src/app/boot.ts`, a second call replaces the first); services `openSettings` and `openCalendar`; claims go through the meta commands and then `payout` (currencies fly, everything else is `services.showRewards`). New: `installSystemScreens` disposes the confetti layer too. QA hooks on `window.__dbg.routine`: `openSettings()`, `openCalendar()`, `popups` (the kit popup manager), `scrollSettingsTo(y)`, `markSeen()` (counts every level and unlock as announced, so no automatic popup interrupts a screenshot).

Timings kept: nothing waits for an animation before accepting input; every press is the kit's own feedback on pointerdown; the stamp, the pen line and the check are fire-and-forget tweens in a `TweenBag` killed in `destroy()`. Geometry is built once per size (shared baked textures per size / seed; the two pass lanes are plain geometry because they are taller than a texture should be); no per-frame allocation in `update` (the countdown tags rewrite their text once a second).

## Cheats used (debug builds / `?debug=1`)

`?scene=home&tab=missions|pass&fresh=1&debug=1`, then `window.__dbg.meta.unlockAll()`, `profile.data.day.missions.progress = [...]`, `profile.data.week...`, `profile.data.cup.days`, `profile.data.endless.weekBest`, `profile.data.pass.xp`, `meta.advance({ days })` (day and week rollover), `profile.grantOrder('gem_pass', id)`, `profile.data.comeback.pending = true`, `__dbg.routine.markSeen()`. Pass purchase: tap the coupon, then `document.querySelector('[data-lp="pay"]').click()` in the dev store sheet.

## Verified

- `npx tsc --noEmit`: nothing printed for `src/screens/{missions,pass,system}` and `tests/screens.routine*`.
- `npx vitest run tests/screens.routine`: 3 files, 36 tests (new: `weekDays` across a month boundary, `calendarCellState`, big days, `stickerTilt`; the strings test still checks that ko and en have the same keys and placeholders and that every literal key is defined).
- Aside browser, `PAGE_ERRORS []` on every run. Screenshots in the session scratchpad `shots/routine/`:
  - Missions daily: `m_daily_top`, `m_daily_rows`, `m_daily_claimed` (first mission checked, struck out and stamped, coins flying), `f_all_claimed` (all five claimed, badge 5 -> 3 -> 1), `f_chest_claim` / `f_chest_done` (the chest claim: reward popup, gems flying), `f_next_day` (day rollover: new list, empty bar, a fresh countdown).
  - Missions weekly: `m_weekly_top`, `m_weekly_mid`, `m_weekly_low`, `w_cup_ready` (two tiers ready), `w_cup_claimed` (first tier stamped), `w_endless_ready`, `w_next_week` (week rollover), `l_weekly_partial` (endless locked: a kraft note with the unlock hint inside its card), `l_missions_fresh` (the whole tab locked).
  - Pass: `p_top`, `p_t1`, `p_focus` (auto-scroll to tier 12 with tiers 1 to 9 stamped), `p_focus_tall`, `e_pass` (English, coupon), `b_celebrate` (after the dev-store purchase: confetti, "프리미엄이 열렸어요", 480 gems, 3 silver chests, 1 gold chest), `t_pass` (1600 tall).
  - Settings: `s_top`, `s_mid`, `x_bottom`, `e_settings_end` (English), `t_settings` (1600 tall); backup code: `x_export` (1,446 characters in the real textarea), `x_import_filled`, `x_import_preview` (the receipt and the warning).
  - Calendar: `c_open`, `c_day1` (day 1 stamped, coins flying), `c_day5` (four stamped, today circled and taped, day 28 gem sticker), `t_calendar` (1600 tall).
  - Automatic notes: `pp1` (comeback), `pp2` (gem pass), `pp3` (level up), `pp4` (new unlocks with three rows and "그리고 10가지 더"), one at a time and in that order.
  - Tall layout: `t_daily`, `t_weekly`, `t_pass`, `t_calendar`, `t_settings` (720 x 1600).
  - English: `e_daily`, `e_daily_rows`, `e_weekly_cup`, `e_pass`, `e_settings`, `e_settings_end`.
- Backup code round trip: export in the real field, paste into the import field, preview rows (level 98, gold, gems, chapters, saved at), apply button reachable; claims of every kind (mission, daily chest, weekly mission, weekly chest, cup tier, pass tier / claim all, calendar day, gem pass, comeback); day rollover (`advance({ days: 1 })`: missions and chest reset, calendar can claim again) and week rollover (`advance({ days: 7 })`: weekly list and cup reset).
- Popups during a battle: on `?scene=battle&...&sandbox=1` with a pending comeback and gem pass the popup count stays 0 (`__dbg.routine.popups.count`).

## Known gaps

- The Aside tab renders at about 1.5 fps, so the check, pen line, stamp, wiggle, coupon rock and confetti were checked by stills (and by state) rather than by feel; the tweens use the same `TweenBag` / `Ease` paths as the kit.
- Currency, chest and toy icons are still the old art until the redrawn ones arrive under the same texture keys (`icon_gold`, `icon_gem`, `icon_chest_*`); they sit on stickers and go through `hasTex` with a drawn fallback, so nothing changes in code. The ticket, wild-card, card and cosmetic parts are drawn kit icons.
- The reset countdown is "초기화까지 22:56:46" (a long Korean line fits in the 310 px tag by shrinking to about 21 px).
- Reduced motion: the stamp, the pen line, the check and the breathing of today's date are skipped; checked in code, not on a reduced-motion device.
- `DomTextField` is a DOM overlay: on a very small phone the OS keyboard may cover the lower half of the import popup (the text area stays where the paste button leaves it).

## REQUESTS (outside my paths)

1. `npm run font`: the Hangul subset predates strings such as "이번 주 할 일", "오늘 할 일", "받았어요", "그리고 N가지 더", "월 화 수 목 금 토 일"; they render through the fallback font until it is rebuilt.
2. `src/screens/shop` (`showRewards`): the reward popup shown after a chest claim lists the claimed parts counting up from 0 ("x0" for a chest for several seconds on a slow tab); it is the collection owner's popup, not changed here.
