# Hand-off: batch 5, item 2 (cats' own skills with an SP gauge) — design proposal only

Engineer key: `skills`. Deliverable: `docs/design_skills_v1.md` (Korean, for the owner) and one illustration, `docs/design_skills_v1_ring.png`. **No source file and no test was changed.** Nothing is committed, pushed or deployed. No player-facing string was added to the repository (the proposal carries draft Korean sentences and English names inside the document only), so `npm run font` was not needed.

## What the document decides (so the next engineers need not reread all of it)

* Twelve cats get one skill each: `w_viking`, `w_samurai`, `w_tiger`, `r_ninja`, `r_gunner`, `r_star`, `m_storm`, `m_frost`, `m_cosmo`, `t_bard`, `t_alch`, `t_lucky` (ranks epic, legendary, mythic).
* **Auto-cast** when the gauge is full (a full gauge waits for a target, like the warriors' roar). The laser stays the only hand-aimed tool; skills pick targets in the laser's area first, then elites and bosses, then the oldest enemy (`skillOrder`).
* **Gauge**: time only, 20 / 16 / 12 s by rank (epic / legendary / mythic); a new cat made by merge or summon or restored from a save starts at 50%; moving keeps it; molt and awakening carry the fraction over; sell loses it; a hazard-blocked cat's gauge stops; `choice` phases stop it with the simulation. "Faster with attacks" was **measured and left out** (+2 points, inside the noise, no class bias); `SP_COMBAT_RATE = 1` stays as a knob.
* **Where it shows**: a ring round the class sticker (the sticker is 28 px at `CLASS_AT`; ring radius 17, stroke 4.5, sticker moved 3 px inward). A bar under the cat does not work: the rank tag already fills the cell to its lower edge (checked on a real 25-cat board at 450 x 900 and 360 x 800). Full = a closed yellow circle with a glow and a slow pulse (never hue alone; reduced motion keeps a still star), at most 4 pulsing at once.
* **Viking's push**: `travelled -= 150` along the closed loop (clamped at 0), elites x0.35 and bosses x0.2 (the black hole's own factors), and a 4 s window shared with `pullImmuneUntil`. It keeps the enemies' spacing (the hole gathers them), does not explode, does not reduce the enemy count; its only gain is time in range.
* **No exceptions to the existing caps and immunities are needed.** None of the twelve adds a stun, freeze, slow or pull (the mages' skills add damage only). The one new rule is the shared displacement window.
* **No snapshot change**: saves hold unit ids at a wave start, so gauges are restored at 50% and `SIM_VERSION` stays 3.

## Facts found in the code that matter when this is built

* The word **skill** already means the cat's passive line: `unit.<id>.skill`, `UnitDef.skillText()`, `skillArgs`, the cats screen's `cats.unit.skill` ("특기" / "Skill"), `tests/sim.skills.test.ts`. The proposal uses the `sp` prefix in code (`data/spSkills.ts`, `sim/spSkills.ts`, `UnitState.sp`, event `spSkill`, `BattleInit.sp`) and suggests renaming the English passive label to "Ability".
* `makeUnit` (`sim/board.ts`) is the only factory, also used by `tests/simHelpers.ts` (`put`). A new `sp` field with a default there reaches every test. 33 test files name these twelve cats (13 of them simulation tests). Tests that run more than about 10 s and measure damage need an opt-out: `initOf({ sp: false })` in `simHelpers.ts` is the one-line way.
* The bots play through the public API only and the skills need no new command, so no bot change is required. The balance report needs `SIM_SP=0|1` and a few columns for before/after pairs.
* `damageEnemy` receives `src = the cat`, so the warriors' armour ignore and the mages' status-duration synergy reach skill damage; the elite and boss damage allowance (`capTokens`) applies to skill damage as well and is **not** to be bypassed.
* `BuffBoard` (`view/field/buffMath.ts`) works out who helps whom from the board layout only; the bard's timed buff needs a new input.
* The cat's tile is full: class sticker lower left, buff badge column right (`BUFF_SLOT`), cell mark upper right, rank tag at the lower edge. The selection sheet has no spare line either; the ring goes on the photo's corner and the skill text into the existing ⓘ bubble.

## The numbers (bot measurements, scratch prototype, chapter 1 unless noted, same seeds before and after, +-4 points)

Prototype and results live only in the scratch folder `C:/Users/dbals/AppData/Local/Temp/claude/C--MyProject-Project1/97b977cf-ee88-4410-a4ca-92da6c50675d/scratchpad/batch5/skills/proto` (a copy of `src`, a 250-line `sim/protoSp.ts`, `tests/skillsim.sim.ts`, outputs `out_*.txt`). It is not in the repository and should not be reused; rebuild from the rules in the document.

| Measure | Before | After (all twelve) |
|---|---|---|
| Synergy bot, butler 0 / 1 / 2 / 3 / 4 / 5 win % (150 runs) | 90 / 79 / 79 / 60 / 42 / 25 | 95 / 84 / 80 / 75 / 49 / 33 |
| Same, other seeds (100 runs) | 96 / 83 / 79 / 70 / 46 / 26 | 96 / 85 / 81 / 78 / 57 / 38 |
| Butler 3, class-pinned free / warrior / ranger / mage / trickster | 60 / 57 / 83 / 62 / 21 | 75 / 73 / 91 / 78 / 34 |
| Butler 3, chapters 1-5 (100 runs) | 60 / 41 / 54 / 64 / 67 | 75 / 57 / 62 / 74 / 72 |
| Butler 3 with chapter HP x1.05 / x1.10 / x1.15 (skills on) | 75 | 68 / 66 / 61 (x1.15 restores the old 60) |
| Skills of one class only, butler 3, own pinned line | 57 / 83 / 62 / 21 | warriors 67, rangers 92, mages 70, tricksters 24 |

By the formula (skill value = seconds of the cat's own output per cast) the board gains +4.8% in stage 1 rising to +16.2% in stage 6. The trickster skills added only +3 points to the trickster-pinned line: the first numbers to raise. The rangers are already the strongest class, so their three skills should start at about 70% of the table.
Simulation cost with 25 cats and 45 enemies: +1.8 microseconds per tick (4.4 -> 5.8 ms per 13 simulated seconds), negligible.

## What I saw with my own eyes

Headless Edge, port 5214, a debug battle (`?scene=battle&chapter=1&seed=7&debug=1&lang=ko`), `board({...})` with 25 cats, at 450 x 900 and 360 x 800: the plain board (rank tags, class stickers, badge column, cell marks) to find room; a thin bar under the feet (unreadable, rejected); a ring round the class sticker drawn in page memory only (white arcs were lost on the cream tiles, a dark track with an orange arc and a closed yellow ring for "full" reads at both widths). The dev server (PID 65808) and every Edge process of `profile-9384` are stopped.

## Could not verify

* How the push looks in motion and how three-times speed feels (no simulation-to-view prototype was built, by design).
* Human play: the bots never aim skills with the laser.
* Chapters 2-5 beyond butler 3, and the effect on the daily challenge, the gold dungeon and endless (another engineer is changing those in the same tree).

## Open questions for the owner (recommended answers in the document, section 7)

Auto-cast for v1; all twelve cats, built in the order warriors first; whether to give back the difficulty the skills take (the one-line lever is the chapter HP multiplier x1.15); rangers' skills at 70%; naming (skill / Ability); the merge start of 50%; no attack bonus; the name pop once per skill per run; skills on in daily, gold dungeon and endless; no gauge toys yet.
