# Directive 2026-10-13: build the per-cat skills

Read this first. It records the owner's words, what is being built, and the lead's decisions. The specification is `docs/design_skills_v2.md` (the twelve skills, common rules in 3.0, checks in 4, costs and build order in 5, data appendix) together with `docs/design_skills_v1.md` sections 2 (gauge rules, the ring, the screen budget) and 5 (where the code is touched). Where the two differ, v2 wins (its section 0 lists every difference).

## The owner's words (verbatim)

- The idea (2026-10-12): "골목대장 이상 캐릭터마다 각자의 스킬을 만드는건 어떤가 싶은데 sp게이지 같은걸 넣어서 인게임에서 게이지가 차는걸로 쿨타임을 표현하고 다 차면 스킬쓰게하고 (일단 바이킹냥은 적을 밀치는 류로 생각중)"
- On the first draft: "겹치는 것도 많고 단순 스탯증가식이 많아서 심심한 느낌이야 특히 별빛사수는 수호신 스킬이라고는 생각이 안드네 연금술사 냥도 그냥 기본 특기랑 겹치는 효과라 별로고"
- His decisions on the second draft are quoted in the design document (section 1 and the change list): the gunner is a boss specialist, the bard plays the jam session, the alchemist transmutes elites and bosses, the ninja's clones fight from tiles, and the lucky cat's capsule has the six-line prize table with the fish line (v2.3).
- The go-ahead (2026-10-13): "문서 작업 끝나면 구현 시작하자"

## What is built, in four steps (design document 5.3)

1. **Step 1 (this directive's first workflows): the frame + the viking's shove + the tiger's charge + the starlight archer's lap + the gunner's wanted shot.** The gauge, the automatic cast, the ring, the delayed list, the cut-in, and four skills of four different shapes.
2. Step 2: the other eight cats (samurai, ninja, storm cat, frost queen, cosmo cat, bard, alchemist, lucky cat), sounds, the effects budget at 3x speed.
3. Step 3: telling the player (selection sheet, cat screen, summon tooltip, a tutorial lesson, the guide, texts in Korean and English, the font).
4. Step 4: balance report, phone performance, reduced motion, the rules specification and patch notes.

Each step ends with all checks green (`npx tsc --noEmit -p .`, `npx vitest run`, `npm run font` after any text change) and a look at the real screen.

## The lead's decisions (the owner said "start", so the document's recommended answers in section 7 are taken; each is one data cell or one flag and can be turned back)

1. Skills cast themselves when the gauge is full and the skill's condition holds; the gauge fills by time only. **Each skill has its own cooldown, set by how strong that skill is** (the owner, 2026-10-13, after the build had started: "자동 발동, 게이지같은 경우는 스킬의 성능에 따라 쿨타임을 다르게 설정하는게 맞는거같긴해"). So the cooldown is a data cell of each skill's own row and nothing derives it from the cat's rank. The design's 18 / 24 / 34 s by rank are only the starting values; after the bots have measured each skill's share, the lead proposes a cooldown per skill and the owner settles it. **No cooldown is longer than 34 s** (the owner, when the lead said the lucky cat's capsule might need more than 34 s: "아냐 34초보다 길어지는건 좀 그래"): a skill that is too strong at 34 s is turned down through its own numbers (for the capsule: the odds row and the prize amounts), never by a longer gauge.
2. Skill damage does not roll crits. Every skill's damage goes through `damageEnemy` (armour, wards, the vulnerability cap, the elite / boss damage cap). The single exception is the gunner's bite (6% of an elite's or boss's maximum health outside the cap, 12% per target in total, shared between gunners).
3. The tiger keeps attacking from its tile while its picture runs along the road.
4. The gunner holds its fire in the wave before an elite or boss wave.
5. A rank-5 cut-in is shown the first time each skill is cast in a run; rank-5 casts are spaced at least 1.2 s apart.
6. Skills are on in every mode (chapter, daily, endless, gold dungeon, tutorial).
7. **No enemy or other balance number is retuned.** The owner tunes balance by hand. Skills make runs easier; we measure with the bots (same seeds, skills off against on) and report the before / after. Do not "compensate" anywhere.
8. **Only a cat whose skill is implemented has a skill** (`UnitDef.spSkill` is absent for the others), so the screen never shows a ring that does nothing.
9. **The switch.** The simulation takes `BattleInit.sp` (absent = on, so tests exercise the skills). The app decides it in ONE place from a constant `SKILLS_ON` and the URL parameter `sp=1` / `sp=0`, which overrides the constant and works without the debug flag. **`SKILLS_ON` is `false` until all twelve skills are in**: testers on the public test build keep playing the game they know, and the owner previews with `?sp=1`. The flag is part of the run's init, so a saved run keeps the setting it started with.
10. Saved runs store nothing new. A restored cat starts at 50% gauge. `SIM_VERSION` stays 3. No new random stream (a new stream changes the save format).
11. Determinism: no `Math.random`, targets in a fixed order (the document's `skillOrder`, then `uid`; cells by number), the `combat` stream only where the document says so.
12. Existing tests are not weakened. A test that measures another mechanic over a long fight may switch skills off through the shared test helper with a one-line comment saying why. A test about whole-run outcomes keeps skills on; if it holds a recorded number that legitimately moves, update it and list every such change in the hand-off note.
13. Performance: the gauge pass is O(25) per tick and a full gauge waiting for its condition checks it every 0.2 s, not every tick; the view bakes the ring into one frame sheet (no `Graphics` redrawn per frame), at most four full rings pulse at once, and the effects of casts obey a stage rule (one cast effect per 0.25 s of real time; the rest show the ring flash only).
14. Art: no new image is generated in step 1. Where the document lists new art (the tiger's paw prints), use existing art or shapes drawn in code; candidate sheets go to the owner later.
15. Sound: step 1 reuses existing sounds. **Every browser or game window opened for a check is muted** (`tools/edge` launches with `--mute-audio`; keep it).
16. Words: the new thing is "스킬" / "Skill" in the player's eyes; the cats' existing passive line is "특기". Step 1 adds only the four skill names (Korean and English) for the name bubble; run `npm run font` after adding text.

17. **The lucky cat's fish capsule gives half the gauge back** (step 2). The owner: "수호자 등급인데 34초로 긴 쿨타임에 생선만 달랑 주는것도 불쾌하지 않을까 싶네"; the lead proposed that a lucky cat whose capsule was the fish capsule restarts its gauge at 50% (the next capsule comes after 17 s; the mean interval goes from 34 s to about 28.9 s, about 18% more capsules), and the owner chose it: "권장안으로 ㄱㄱ". Data cell `fishRefund 0.5` on the capsule's row.

## Working rules for every agent

- Shared working tree: several agents edit at once. Use the Edit tool on your own files only; never `git stash`, `git checkout`, `git reset`, `git clean` or commit. If you must touch a file another agent owns, make the smallest edit and say so in your hand-off.
- Each agent that needs a dev server or a headless browser uses its own ports (Vite 52xx, CDP 93xx as given in the prompt), the harness in `tools/edge` (`lib.mjs` `openGame`, always `close()`), and checks for leftover `msedge` processes when done. Evals must return plain data.
- Timeouts in the test suite under CPU load are usually other processes: rerun the file alone before changing anything.
- Hand-off notes go to `docs/handoff/skills1_<area>.md`: what exists (types, events with their payloads, data cells), what is left, anything a later step must know.
- The rules specification `docs/명세_전투규칙.md` gets a new section for the skills as they are implemented (rules as the code has them, values with their data cell names).
