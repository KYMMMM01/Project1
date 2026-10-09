# Hand-off: meta layer (`src/meta`)

Pure logic + persistence for profile, economy, progression, rewards, chests with published odds, missions, 28-day calendar, season pass, patrol, shop, cosmetics, daily challenge, weekly cup, endless tiers, sweep, piggy bank, IAP grants/refunds and the backup code ("냥이 코드"). No rendering. Rules: `docs/명세_메타.md` v1.0 (Korean, matches GDD 7-8). Numbers: `src/meta/data/{economy,schedule,catalog}.ts`.

## What exists

| path | role |
|---|---|
| `src/meta/index.ts` | public barrel (also loads the i18n strings) |
| `instance.ts` | the app's `profile` singleton + `initMeta()`; only file importing the platform barrel at runtime |
| `profile.ts` / `routines.ts` / `economy.ts` / `core.ts` | the stateful facade `Profile` (inheritance chain `ProfileCore -> EconomyProfile -> RoutineProfile -> Profile`); every command returns `Result` |
| `rewards.ts units.ts odds.ts chests.ts missions.ts calendar.ts pass.ts patrol.ts shop.ts daily.ts features.ts bundle.ts time.ts backup.ts` | pure rules, no clock, no I/O |
| `profileData.ts` | schema defaults, clamping, `migrateProfile`, `SaveStore` factory (key `meowguard.profile`, version 1) |
| `platformLink.ts` | `attachPlatform`: AdCounters persistence adapter, IAP catalogue + grant + revoke handlers, ad-free flag |
| `strings.ts` | ko (해요체) + en via `addStrings`; error toasts `meta.err.<code>` |
| `testing.ts` | test kit (`createTestProfile`, `FakeClock`, `ScriptedAds`); not imported by the game |
| `tests/meta.{rules,chests,schedule,profile,economy}.test.ts` | 126 tests + the progression report |

## Consumer API

```ts
import { profile, initMeta, errorKey, oddsView, ODDS, describeBundle, t... } from '@/meta';

// boot (after initPlatform()): load save, attach ads/IAP, follow lifecycle resume/pause. Returns an undo fn.
const stop = await initMeta();

// every command: { ok: true, value } | { ok: false, error: MetaError }  -> toast t(errorKey(error))
profile.subscribe(() => redraw()): () => void     // one 'change' per command; profile.events.on('currency'|'chest'|'unlock'|'unitLevel'|'accountLevel'|'run', fn)
profile.refresh()          // call when a screen opens and about once a minute: date rollovers, unlocks
profile.resume()           // app returned from background (initMeta wires it to the platform lifecycle)
profile.data               // read-only view of ProfileData (gold, gems, tickets, levels, cards, wild, chests, cleared, ...)
profile.equipped           // { rug, fx } ids for the renderer
profile.featureUnlocked('daily' | 'sweep' | ...), profile.frozen   // frozen = clock was moved: time rewards refused

// a run
await profile.prepareRun({ mode, chapter?, stake?, snack?: { id: 'fish'|'purr'|'rare_summon', via: 'ad'|'gems' } }): Result<BattleInit>
await profile.saveSnapshot(snapshot | null)        // at every wave start; profile.pendingRun after a crash = "continue?"
await profile.finishRun(stats: RunStats, { abandoned? }): Result<RunReward>   // pays everything, calls ads.endRun
await profile.settlePendingRun() / discardPendingRun()
await profile.doubleResult('ad'|'gems'), profile.sweep(chapter, stake): Result<{gold,xp}>
await profile.pay('revive'|'relic_reroll'|'start_snack'|'result_double'|'chest_skip', 'ad'|'gems'): Result<void>   // pays only; caller applies the effect

// units / training / chests / shop
profile.units(): UnitView[]; profile.levelUp(unit); profile.trainingRows(); profile.train(id)
profile.oddsOf('wooden'|'silver'|'gold'): OddsView     // rows, guarantee, pity counter+target, one-line summary, version
profile.buyChest(kind); await profile.openChest(kind): Result<ChestResult>; profile.ackReveal(id)   // reveal queue survives a restart
profile.shopView(); buyShop(slot); await refreshShop(); ticketView(); buyTicket(); await watchTicketAd()
profile.cosmetics(); buyCosmetic(id); equip(id); piggyView(); breakPiggyFree()

// recurring
freeChestView/claimFreeChest/skipFreeChest(via); patrolView/claimPatrol(double); calendarView/claimCalendar/claimComeback
missionsView('daily'|'weekly')/claimMission/dailyChestView/claimDailyChest/claimWeeklyChest
treatView/claimTreat(slot); claimSnackChest(); passView/claimPass(track,tier)/claimAllPass(track)
dailyView() (code "D-20261107-r1", seed, chapter, modifiers); cupView/claimCup(i); endlessView/claimEndless(i); gemPassView/claimGemPass

// money and entitlements
profile.isPurchasable(productId)   // combine with iap.isAvailable(id): web portals hide the products
profile.grantOrder / revokeOrder   // wired by attachPlatform; idempotent on order id

// backup code
await profile.exportCode(): string                    // MG1.z.<crc32>.<base64url deflate>; MG1.r.* where CompressionStream is missing
await profile.inspectCode(code) / importCode(code)    // validates (checksum, version, shape), migrates, clamps; nothing changes on error
```

`profile.grant/spend/clawback/addCards/applyBundle` are the single money path (reason code, `currency` event, analytics `currency`); UI code should not call them. Tests inject analytics and ads (`createProfile({ analytics, ads, store?, clock?, seed? })`), so nothing prints in tests.

Text: `describeBundle(bundle): string[]`, `featureHint(feature)`, `t('meta.err.' + code)`. Names of rarities/units/chapters come from `src/game/data/strings.ts` (imported by `src/meta/strings.ts`); modifier and training names stay in the game data (`modifier.<id>.name`, `training.<id>.*`).

## Verified

- `npx vitest run tests/meta` : 126 tests pass (typecheck of `src/meta` and `tests/meta*` is clean; remaining `tsc` errors are in other engineers' paths). Full suite: only `tests/sim.flow.test.ts` (sim snapshot) fails, not mine.
- Odds: chi-square p>0.001 on raw card rarity for all three chests (200k cards each), wild share 30% and unit evenness; 10,000 simulated profiles x (1 silver + 10 gold): no silver without epic+, no gold with <3 legendary, the 10th gold chest always pays 8 cards to the lowest-level legendary and no other chest does. Effective rates after the guarantee stay within 0.5 points of the table (the guarantee tops up 1.0% of silver and 5.2% of gold chests).
- Time: clock set back between sessions, jumped forward inside a session, small drift, `resume()` after sleep, import cannot unfreeze, daily limits never come back on a rolled-back date, patrol 8/12/24 h caps.
- Money: order grants replayed/concurrent/after restart give once; refund before/after grant; restored consumables give nothing; ledger and ad counters persist through the profile and a restart; real `IapService` + fake adapter run purchase, restore and refund end to end.
- Backup code: round trip into a clean profile, whitespace tolerant, bit flips/cuts/foreign tags/newer versions rejected, nonsense values clamped, no `CompressionStream` fallback, ~1.2k characters for a small profile (10 chests opened).
- Real browser (Aside, dev server): loaded `/src/meta/index.ts` in the page, opened 10 gold chests, saw the pity on the 10th, produced and inspected a code (CompressionStream present), localStorage save written; Korean odds text reads correctly ("금 상자 10개째마다 가장 레벨이 낮은 대왕(지금: 사무라이냥) 카드 8장이 더 들어요. (0/10)"). `PAGE_ERRORS []`. There is no UI in this layer, so no screenshots.

## Measured curve (free player, 3 runs + 3 ads a day, mean of 8 simulated players)

Bot: two visits a day (1 run + 1 ad; 2 runs + 2 ads), claims everything, plays the daily challenge once, sweeps with all tickets on the best cleared stage, levels the rarest affordable unit first, trains with up to 15% of its gold, spends gems on the six gem cosmetics first and then on silver chests. Battles are a model (`winChance`: 50% at the recommended level `1 + 0.75(chapter-1) + 0.7*stake`, daily challenge 35%), not the real sim.

```
day | avg level common/rare/epic/legendary | training lv | gems held | gold held | stakes cleared
  1 | 1.6/1.8/2.6/2.3 |  0 |  42 |   48 |  1.0
  3 | 3.1/3.7/3.7/3.1 |  0 | 184 |  186 |  3.1
  7 | 4.5/5.0/5.0/4.1 |  0 | 116 |  575 |  9.5
 14 | 6.0/6.0/6.0/5.2 |  9 | 301 | 1208 | 20.6
 30 | 7.4/7.1/7.0/5.8 | 24 | 104 | 5095 | 29.9
 60 | 8.6/8.1/8.0/7.0 | 32 |  79 | 5940 | 30.0
```

- Epic units reach level 8 on day **50** (46-54), legendary level 8 on day **93** (88-104), all 16 units level 10 on day 205 (195-210; GDD says ~250, so the late game is about 18% fast).
- Free gem income in the first 30 days: **71 a day** = first clears 24.3, daily mission chest 18.6, treat 7.7, free pass row 6.7, account levels 5.4, calendar 4.7, piggy 3.6.
- Gold income (first 60 days) ~9.7k/day: sweeps 3.2k, runs 3.1k, patrol 1.6k, missions 0.96k, treat 0.3k, pass 0.3k, calendar 0.2k.
- 33,000 KRW = 4,600 gems = 9 gold chests = 540 cards (104 epic and 55 legendary, wild included): 22% of what all four epics need for level 8 (about 8 days of a free player's epic cards), 23% of the legendaries' (about 19 days). Cards still cost gold to use.

Tuned (all mine, in `data/`): patrol 42 gold/h base, mission gold 150 / weekly 400, weekly targets 21 runs / 300 merges / 35 bosses / 15 wins / 5 daily chests, cup tiers 40 / 85 / 125, first-clear gems 12 + 5 x stake with lighter chests above stake 0, calendar gold, free pass row, shop lot prices 600 / 1,000 / 2,000 / 4,000 gold (the cheap lots were a second legendary faucet), account level gems 10, 2 consolation cards, sweeps and the daily challenge not counting toward missions.

## Known gaps

- The curve depends on the battle model above; re-run `tests/meta.economy.test.ts` with real win rates from `npm run sim` (replace `winChance`/`synthStats`) and re-check the three targets. Gold, not cards, binds epics; cards bind legendaries.
- Achievements (~30 in the GDD) are not implemented; relics are all unlocked (`Loadout.relicPool` = every relic).
- Only the 11 launch products; the 19,800 growth fund and the 55,000 gem pack are post-launch.
- Time cheating between sessions (clock moved forward while the app is closed) cannot be detected without a server; every time reward is capped instead. A backup code is as trustworthy as the save file (checksum, not a signature).
- No UI: first-purchase card timing (72 h), red dots, confirmation dialogs and the reveal animation are screen work.
- Leaderboard: the weekly cup score goes to `platform.leaderboard?.submit('weekly_cup', score)`; the board must exist per platform.

## REQUESTS (outside my paths)

1. `src/main.ts`: after `await initPlatform()` add `await initMeta()` (from `@/meta`), and a ~60 s timer calling `profile.refresh()`.
2. `src/platform/adPolicy.ts`: add `sweep_ticket: { daily: 2 }` to `AD_PLACEMENTS` / `AD_PLACEMENT_IDS`. Until then the meta layer caps it itself and AdService lets it through unlimited.
3. `src/game/data/training.ts`: align with the meta rules (drop `enemy_cap`, cost `200 x 1.55^(level-1)`, `start_purr` max 10 with +1 at 3/6/9, `laser_cd` -0.3 s). Meta passes `Loadout.training` for exactly `start_fish, kill_fish, damage, boss_time, laser_cd, start_purr` (0..10).
4. Sim: `RunStats.bossesKilled` should count elites too (the "보스·정예" missions read it) and `relics.length` is the "장난감 N개" mission count.
5. `docs/기획서_GDD.md`: §6 (3 difficulties, 3 stars), §7.1 (`챕터·난이도 배수`), §7.3 (`적 한도 +1`, start purr caps at level 9) and §7.5 (`챕터 5 × 난이도 3 × 별 3`, `별 3개로 깬 스테이지` for sweep) still describe the old rules; 명세_메타 v1.0 is current.
6. Keep the keys `rarity.*`, `unit.<id>.name`, `chapter.<n>.name` in `src/game/data/strings.ts` (meta texts point at them; `tests/meta.rules.test.ts` checks them in both languages).
7. Outside my paths, `tsc` still reports errors in `src/game/sim/**` and `tests/audio-recipes.test.ts` (not mine).

## 2026-10-06 review fixes

- **economy-4 (OPEN, no code change in `src/meta`)**: the "보스·정예" missions (`d_bosses` target 4, 20 of the chest's 100 points; `w_bosses` target 35) read `RunStats.bossesKilled`, which `src/game/sim/flow.ts:276` raises on boss waves only (8, 16, 24). Elite waves (4, 12, 20) never count, so a flawless 24-wave win credits 3, not 6. Nothing inside `src/meta/**` (minus `profile*.ts`) can see the elites: `advanceMissionMetrics` only receives the finished delta, and `profile.ts:187/211` builds it from `stats.bossesKilled`. Changing the mission texts or targets instead would contradict 명세_메타 (보스·정예 4 / 35), so that is left to the designer. Request #4 above is therefore still the fix, one of:
  1. `flow.ts:276`: `if (s.waveKind !== 'normal') s.bossesKilled++;` (the elite wave also ends only by killing the elite: `flow.ts:358` loses the run on a timeout). `tests/sim.flow.test.ts:156` pins the boss-only count and must follow.
  2. `profile.ts:187/211`: count the elite and boss waves in `1..stats.wavesCleared` (`waveKindOf` from `@/game/data/waves`) instead of `stats.bossesKilled`. Do not do both, or elites count twice.
  Once it lands, set `WAVES_PER_BOSS_KILL` to 4 in `tests/meta.economy.test.ts` (it models the sim as it is today, 8) and re-read the gem/day curve (a 24-wave win then credits 6, not 3).

- **profile.ts (save-4, 6, 7, 8)**, tests in `tests/review.save.test.ts`:
  - `importCode` re-applies every refund this device already took: an order that is revoked here but still paid in the code is taken back from the code's copy (`takeBack`, the body of `revokeOrder`), so the code's gems, chests, flags and rug do not return. The Butler Pass flag is still OR-ed across the two devices, but not when every Butler order in the merged ledger was refunded (a code made after the refund no longer revives it on the device that still held the pass).
  - `grantOrder`, `finishRun`, `doubleResult` and `sweep` call `refresh()` before they write into the day, week, cup or season slices, so a purchase or run at 00:00:20 lands in today's slices instead of being wiped by the next rollover. Cost: one extra `change` event per command. A gem pass bought while the clock is frozen counts its 30 days from `lastSeenAt` (the time `gemPassView()` judges it by).
  - A refunded season order closes the premium row only if it is of the stored season and no other unrefunded season order of that season is left (`closesPremiumRow`), judged from the order's `t`; `AppliedOrder` has no "opened the row" field and `types.ts` is not mine. Side effect: refunding the first of two same-season orders while the second stands keeps the row (the second one is paid).
  - Not changed: `routines.ts` has its own private `accrualNow()`; `grantOrder` repeats its one-line rule (`frozen ? lastSeenAt : now`). Making it `protected` there would let `profile.ts` call it. The other commands in `economy.ts` / `routines.ts` still rely on the minute timer for the rollover, as before.

- economy-4 (2026-10-07): the "보스·정예" mission metric now adds the cleared elite waves (4, 12, 20) to the bosses the run reports (`bossAndEliteKills` in `profile.ts`; test in `tests/review.save.test.ts`). The lifetime `stats.bosses` counter still counts bosses only.

## 2026-10-07 QA fixes

Three reports in `docs/qa/findings_other.json`, plus the requests the UI-kit and routine owners left for `src/meta` and `src/platform`. The earlier engineer had already done the English plurals, the unlock copy and the GDD cost drift; I checked each and finished the rest.

- **English counts (`qa-look-wild-plural`, `qa-flow-en-copy`).** `tn(key, count, vars?)` (`src/meta/plural.ts`, exported from `@/meta`) reads `key.one` for a count of exactly 1 in English and `key` otherwise; Korean has no plural. It carries every counted meta text: `describeBundle` (gems, tickets, wild cards, cards), `featureHint` ("Unlocks after 1 run."), the odds guarantee lines and `meta.piggy.free`. The rank naming half of `qa-look-wild-plural` is rejected: "Street" (`rare`, 동네) and "Alley Boss" (`epic`, 골목대장) are two different ranks, and `rarity.*` is the single source of both names. Test: `tests/meta.rules.test.ts` ("writes a count of one in the singular", same placeholders in both forms).
- **The unlock toast is gone.** The "Missions is now unlocked!" toast was produced by `HomeScene.announceUnlocks`, which the shell owner replaced by the routine owner's unlock popup (`autoPopups.unlock`: feature name plus `rt.sys.feat.*` text). Nothing read `meta.toast.unlock` any more, so the string and its test are deleted instead of kept as dead text. `meta.toast.claimed` and `meta.toast.levelUp` are unused as well and left alone (not in a report).
- **GDD cost drift (`qa-battle-docs-drift-costs`).** GDD 3.2 (`12 + 6n`), 3.3 (awaken needs 12 purr), 3.6 (purr budget 19 per run, first awaken around wave 16: 3 / 7 / 10 / 14 / 17 / 19 at the end of waves 4 / 8 / 12 / 16 / 20 / 24, matches 명세_전투규칙 section 16), the top-unit row of the comparison table and D-06 in 설계_결정_기록. I recomputed the 19 from `ACT_PURR`, `BOSS_PURR`, `ELITE_PURR` and the wave kinds. `docs/명세_메타.md` section 8 no longer says the platform table lacks `sweep_ticket` (it has had the row for a day).
- **Season rollover pays what is owed (routine request 1).** `MetaCore.rollover` now calls `settleSeason` on the pass slice it is about to replace: every reached tier not yet taken is paid with `pass_free`, and with `pass_premium` for an owner, then the slice resets. It runs whether or not the pass tab was ever opened or unlocked, and once per roll (a player away for two seasons gets the stored season's share, nothing is invented for the seasons in between). 명세_메타 "시즌 패스" says so. Tests in `tests/meta.profile.test.ts`: free-only vs premium owner (gold 800, a wooden chest, gems 25 / 185, a silver chest), nothing while the season runs, one payment for a skipped season. There is no mail or notice; the balances just rise. A "your season ended and we paid X" note would need `PassView` to carry the bundle and the pass screen to show it (routine area).
- **Storage tells the player (kit request 2, `qa-code-storage-failure-silent`).** `createLocalStorageBackend` and `safeStorage` now implement `volatile()` (true while a value only lives in memory: a refused or oversized write, a write held back after a failed read) and call `reportStorageVolatile()` where they fall back to memory. With `SaveStore.flush` that means: one toast, the write retried at 2, 4, 8 up to 30 s, and `volatile()` back to false when the write lands. Tests in `tests/platform.core.test.ts` (a full localStorage that frees up, a throwing backend, an oversized value).
- **Capacitor hardware back (kit request 5): not done, on purpose.** `BackGesture` keeps a spare history entry while anything Back can close is open, and Android's WebView default for Back is `goBack()` when it can, which pops that entry and reaches the popup handlers. A `backButton` listener would switch that default off and need an `exitApp()` path at the root; that wants a real device, so it waits for one.

Checked in the browser (`?debug=1`, screens in the session scratchpad `shots/fix-other/`): `c_treats` (English, the treat slot reads "1 wild card (Street)"); season rollover with 560 pass XP (tier 5, tiers 1 to 5 open) and `advance({ days: 31 })`: gold 1,410 to 2,610, gems 22 to 47, wooden chests 3 to 4, season 0 to 1, tier 0, no open tier; storage with `Storage.prototype.setItem` made to throw: `s_volatile` shows the "이 기기에 저장할 수 없어요" toast under the currency row, the stored gold stayed 0 while the live gold was 7,777, and after the override was removed the retry wrote 7,777. `PAGE_ERRORS` was `[]` in the first two; the third shows only the expected `[localStorage] write failed` warning. Aside scripts cannot use `import()` (the REPL refuses external modules), and the tab reloads whenever another owner saves a file, so do the whole scenario in one `ev`.

REQUESTS (outside my paths):

1. `src/screens/shop/blocksStore.ts:190` calls `t('meta.piggy.free', …)`: use `tn('meta.piggy.free', p.daysUntilFree, { days: p.daysUntilFree, n: fmt(p.freeBreakGems) })` from `@/meta` so the English line reads "After 1 day" and not "After 1 days".
2. `npm run font` once all owners are done (the Hangul subset predates the new pass, calendar, settings and `ui.storage.volatile` strings).
3. Settings screen: a persistent line while `isStorageVolatile()` is true (kit request 3; the toast fires once and a scene change can swallow it).

## 2026-10-07 owner feedback (item C: opening a pile of chests)

New API, nothing else in the meta layer changed:
- `profile.openChests(kind, count = CHEST_BULK_MAX): Promise<Result<ChestResult[]>>` (`economy.ts`). Opens `min(count, owned, CHEST_BULK_MAX)` chests of one kind. Each chest goes through the same private step a single open uses (`applyChest`: its own `deps.seed()`, `drawChest` with the state as the previous chest left it, so the guarantees, the pity counter (`goldOpened` advances per gold chest: a bonus lands on the tenth even in the middle of a pile) and the pity target all advance chest by chest; cards credited, overflow gold, `chest_open` analytics and the `chest` event per chest). `openChest(kind)` is now `openChests(kind, 1)`, so a pile and the same number of single opens give the same results by construction.
- **Safety, as for a single open.** The whole pile is decided in one synchronous pass, `commit()` once, then `await flush()`, and only then does the call resolve; nothing is shown before it is on disk. If the app dies before the flush none of it happened; after it, every result is in `profile.data.reveals` and the replay after a restart shows them.
- `ChestResult.batch?: number` (new, optional): set to the id of the first chest on every chest of a pile of two or more; the replay groups consecutive stored reveals with the same tag into one opening. `CHEST_BULK_MAX = 50` (`data/economy.ts`) caps a pile and is also how many stored reveals are kept (it was 20), so a pile never loses its first chests from the replay list. Saves written before this still load (the field is optional).
- Tests (`tests/meta.chests.test.ts`, "opening a pile of chests"): for wooden, silver and gold, a pile of six equals six single opens (results, cards, wild, gold, `goldOpened`, ids, stored reveals); a pity bonus on exactly the tenth chest of a pile that starts at the eighth; two bonuses in a pile of twelve; stored before it resolves, a restart finds the whole pile tagged, acknowledging each id empties the list; asking for more than owned opens what is owned, the cap holds, an empty stock refuses with `nothing_to_claim`; a lone chest carries no tag.

## 2026-10-09 batch (gold dungeon, test grants)

Rules and numbers: `docs/명세_메타.md` section 13 (the spec is v1.1 now). Two items of the owner's batch: a daily dungeon for earning gold (directive 11) and a test button that adds gold (directive 14).

**New files.** `src/meta/dungeon.ts` (pure rules: `dungeonWaveGold`, `dungeonGold`, `dungeonFirstClearGold`, `dungeonMaxGold`, `dungeonTierOpen`, `dungeonTopTier`, `dungeonEntriesLeft`, `dungeonCanBuy`), `src/meta/data/dungeon.ts` (every number), `src/game/data/goldDungeon.ts` (the eight waves, `goldDungeonScript(wave)`, `goldDungeonSpawns()` = 399). Tests: `tests/meta.dungeon.test.ts` (38), `tests/meta.dungeon.sim.test.ts` (10), `tests/screens.shell.dungeon.test.ts` (13).

**Profile API.**
```ts
profile.dungeonView(): DungeonView        // unlocked, waves, tiers[5] { open, maxGold, bonus, best }, top, freeEntries, used, bought, entriesLeft, canBuy, entryGems, firstClearOpen
await profile.buyDungeonEntry('ad' | 'gems'): Result<DungeonView>   // the day's one extra entry; only paid for here, the run takes it when it starts
await profile.prepareRun({ mode: 'gold', chapter: tier })           // takes the entry NOW and flushes; no snack; stake 0
profile.grantTest(currency, amount): Result<number>                 // development platform only (MetaDeps.testGrants)
```
`RunReward` gains optional `kills` and `bonus` (gold dungeon only; `gold` already holds the bonus). `DaySlice.dungeon = { used, bought, firstClear }`, `ProfileData.dungeon.best[5] = { waves, kills, gold }`; both default in old saves (deepFill) and are clamped by `normalizeProfile`. New feature id `dungeon` (chapter 1 cleared) with its strings, unlock popup row and jump target. New `Reason`s: `dungeon`, `offer_dungeon`, `test`.

**Rules that matter.** The entry is taken when the run starts and saved with it (a discarded run, a killed app or a restart never gives it back, and never gives another). `finishRun` for a gold run needs the pending run that started it, so a second settlement, or one for a run that never started, returns `nothing_to_claim` (no double pay on restart; tested with `keepStorage` restarts and `settlePendingRun`). A run that ends after midnight belongs to the new day (same rule as every other slice). The "boss and elite" missions skip gold runs (`bossAndEliteKills`): the dungeon has no wave 4 elite. Payout `round((sum(8 + 2w) + 0.35 x kills) x chapter multiplier x (win ? 1.25 : 1))` plus 100 x multiplier for the first win of the day; full clear 345 / 448 / 551 / 689 / 861 per tier, a tier-3 day of two wins 1,262 (about 23% of a chapter-3 player's ~5,400 gold a day, the table is in the spec). Doubling on the result screen works as for every run.

**Battle side (additive edits outside my paths, as the brief allowed).**
- `src/game/api.ts`: `BattleMode` gains `'gold'`.
- `src/game/sim/sim.ts`: imports `goldDungeonScript` / `GOLD_DUNGEON_WAVES` and `WaveScript` (the `waveKindOf` import is gone); `totalWaves` has a `gold` arm; new method `scriptOf(wave)` (gold script, else `scriptFor(scriptChapter, wave)`); `restore` (wave kind), `waveHealth` and `previewWave` call it.
- `src/game/sim/flow.ts`: `ACT_LENGTH` import (the `waveKindOf` import is gone); `buildSpawns` and `startWave` read the script through `s.scriptOf`; `endNormalWave` closes an act of the gold dungeon on the wave clock (`stage = 'clearing'`, the usual clear delay, then `completeAct`: act reward, toy offer, and after wave 8 the victory).
- Nothing in geometry, units, synergy or the other modes moved; `scriptOf` returns exactly what the old calls returned for them (the whole existing suite stays green).

**Measured (not tuned against).** Bots on the 5x5 board, tiers 1 / 3 / 5 x unit level 1 / 3 / 6, 12 seeds: synergy bot wins 75 to 100% (kills 326 to 396), the merge-only bot 58 to 100% (kills 283 to 369); a win takes 126 s of game time. After the unit-rule change a re-measure is due: the spawn count (399) and the payout table do not depend on the rules, the win rate does.

**Verified in the browser** (Aside, port 5199, ko and en, 720 x 1280 and 1600): the card locked / entries left / none left with ad + gems / all used; real taps on the tier stepper, the gem entry (30 gems paid, "Entries 1/3", pre-run opens, back keeps the entry), a whole run from the card through the pre-run page to the result (+500 gold with the 160 first-win bonus, XP +26, "최고 기록!" callout, the "홈" button, then the top bar counting up while the coins fly in), day rollover (`advance({days:1})`: entries 2/2, bonus open again), a run left pending and given up from the "continue?" prompt (nothing paid twice, entries unchanged after a reload), the settings test block (all three buttons, flight and toast). Not tapped in the browser: the result screen's "다시 도전" with no entry left (covered by the guard in `retry`, not by a test).

**Known gaps.**
- The ad button of the extra entry stays off until the platform row exists (REQUEST 1). Proven with the row added at run time in the page: the test ad opens (`dungeon_entry`), the claim books the entry, the pre-run page follows.
- A run the app dies in pays by the last saved wave only (kills are not in `RunStats` of an interrupted run: `interruptedStats`).
- The restart in the pause menu takes a second entry (the first is already gone); with none left it now only shows a toast and keeps the current run (`src/app/flow.ts`).

**REQUESTS (outside my paths).**
1. `src/platform/adPolicy.ts`: add `'dungeon_entry'` to `AD_PLACEMENT_IDS` and `dungeon_entry: { daily: 1, home: true }` to `AD_PLACEMENTS`; `src/platform/adapters/devOverlay.ts`: `'platform.placement.dungeon_entry': '골드 던전 입장'` / `'Gold Dungeon entry'` (a test checks every placement has a string); `tests/platform.adPolicy.test.ts`: the pinned table gets the row. Nothing else: the meta layer already asks for `DUNGEON_AD_PLACEMENT`.
2. `src/guide`: a topic for the dungeon. `topics.ts`: `T('gold_dungeon', 'home', ico('coin'), { tab: 'battle', point: 'battle.dungeon' })` and `'battle.dungeon'` in `HomePoint` (the battle tab already answers it); `facts.ts`: `gold_dungeon: () => ({ waves: GOLD_DUNGEON_WAVES, free: DUNGEON_FREE_ENTRIES, gems: DUNGEON_ENTRY_GEMS, win: DUNGEON_VICTORY_MULT, bonus: DUNGEON_FIRST_CLEAR_GOLD })`; `stringsKo.ts`: title `골드 던전`, teach `하루 두 번, 짧은 판으로 골드를 모아요.`, full `{waves}웨이브를 버티는 2분짜리 판이에요. 보스는 없고, 넘긴 웨이브와 처치한 적의 수만큼 골드를 받아요.\n끝까지 막으면 {win}배, 그날 첫 클리어는 골드가 더 붙어요. 하루에 {free}번은 공짜이고, 한 번 더는 광고나 보석 {gems}개로 들어가요.\n단계는 깬 챕터만큼 열리고, 높을수록 골드를 더 줘요.`; `stringsEn.ts` the same in English.
3. `src/view/hud` (result screen): show the first-clear bonus of a gold run (`RunReward.bonus`, "오늘 첫 클리어 +160") next to the new-best callout; hide or soften "다시 도전" when `profile.dungeonView().entriesLeft` is 0 (the click now only toasts). In the battle, a running "gold earned" readout and a coin pop on each kill would carry "enemies drop gold" (`RunReward.kills` x 0.35 is the rate); I have no art or HUD slot for it.
4. `src/view/field/debug.ts`: `MODES` lacks `'gold'`, so `?scene=battle&mode=gold` falls back to a chapter run.


## 2026-10-09 batch: the swap of the chef and the bell kitten

One line outside the gold-dungeon work: `UNITS_BY_RARITY` (`src/meta/units.ts`) moved `t_chef` to common and `t_bell` to rare, with the sim's roster (`sim.md`, "2026-10-09 batch: rules v1.4"). A saved profile needs no migration: levels, cards and chest history are keyed by cat id, so the bell kitten keeps its level and cards and the chef keeps its own; what changes is the price of each cat's next level (rare table for the bell, common for the chef) and which card slot of a chest drops which cat. `tests/meta.rules.test.ts` (meta table against the sim's rarities) covers it.

## 2026-10-09 batch: release test (gold dungeon)

Played with real taps: home card (2 entries, tier stepper, first-clear sticker) -> pre-run page -> a won run (bot with the debug `win()`) -> result (+683 gold with the 250 first-clear bonus, shown now as its own line) -> home (entries 1/2, best 436 gold, sticker gone), then the last entry: the result's "다시 도전" is greyed because no entry is left (`RunConfig.canRetry`). The test block in the settings: "골드 +10,000" took 2,686 to 12,686 and 12,686 to 22,686 gold in Korean and English. The meta engineer's REQUESTS 1 to 4 are done (ad placement in `platform.md`, guide topic in `guide.md`, result bonus and retry in `hud.md`, `?scene=battle&mode=gold` in `view/field/debug.ts` `MODES`). Not tapped: buying the entry with the ad on a real SDK, a run killed by the app dying.
