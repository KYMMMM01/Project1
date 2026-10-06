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
