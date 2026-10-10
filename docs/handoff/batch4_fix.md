# Hand-off: batch 4, closing pass (review findings)

Engineer key: `fix`. Four findings from the three reviewers were checked one by one. Nothing is committed, pushed or deployed. No player-facing string changed in this pass, so `npm run font` was run only to confirm the subset (it reproduced `game-kr.a3dcbdba.woff2` byte for byte).

## The four findings

| # | Finding | Verdict | What was done |
|---|---|---|---|
| 1 | Skipping the tutorial mid-run left `hints.only = {awaken}`, so the elite (wave 4) and boss (wave 8) cards of that same run never came | Real | `Hints.request` (`src/view/hud/hints.ts`) ignores the `only` filter once `progress.skipped` is true. The filter now ends with the lessons by itself, on every path (the skip dialog, a resumed run after a skip), and nothing has to remember to clear it. Test: `tests/view.hud.hints.test.ts` ("leaves the cards to the tutorial's lessons ... until the lessons are skipped"); it fails with the old line. Seen on screen (headless Edge, 450x900, ko): skip at the first lesson, play on, the elite card opens at wave 4 (before: queue empty). |
| 2 | Glass marble's 60% was pinned by no test (back to 25% failed nothing) | Real | `tests/sim.relics.test.ts` "glass marble": a second enemy at 97 px from the impact is hit only at +60% (reach is 55 x scale + 18: 73 / 86.75 / 106), a third at 112 px never. The test also asserts the reach equals 106 from the data. Both halves fail on their own with the old 25%. |
| 3 | The electric pad was moved down a rank, against the owner's call that it is too good | Real (a departure from the decision) | Put back at **rare**, numbers untouched. The brief says a wrong decision is reported, not replaced by something else. Updated: `RELIC_RARITY`, `RELIC_IDS` order, spec section 13 (rank table, per-rank means, the pad note), the GDD rank table, the toys hand-off. Rank counts are now **10 / 7 / 7 / 6**. `tests/sim.toyRanks.test.ts` has the new counts and a test pinning the three toys the owner named (tunnel epic and every 3rd wave, blanket common and -10%, pad rare with slow +30% / +15%). |
| 4 | Spec and GDD still described the elite / boss control limits without the butler-level numbers | Real (docs only) | Added the level note to spec lines for the war cry, the lightning cat (two rows), the roar and the enemy-resist table row, and to the GDD slow line. The player-facing texts were already data-driven. |

## Left alone on purpose

* `new LaserGuide(..., !lessons, ...)` in `src/view/hud/index.ts` is also set once at build, so a tutorial run skipped mid-run does not start the laser's guided first use by itself in that run (it does in the next). Old code, not in this batch's diff, nothing in the directive asks for it.
* `RELIC_SCORE` in `src/game/sim/bots.ts` still ranks the nap blanket 5 (the toys engineer left it).

## Checks

* `npx tsc --noEmit -p .`: clean.
* Whole suite: 163 files, 3,501 tests, all pass (base: 154 files / 3,389).
* The dev server (port 5209) is stopped, and no Edge process of the `profile-9369` folder is left.

## Open questions for the owner

See the final report of the closing pass; the short list: the pad (lower to common, raise the +15%, or name the board that felt too strong), the nap blanket's effect, the purr toys at +3 (or +2), whether a codex opened from a battle link should clear every "new" mark, the order of the attendance popup, and the top-bar form "스테이지 3 · 12/24".
