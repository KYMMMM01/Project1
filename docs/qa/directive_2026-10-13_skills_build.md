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
2. Skill damage does not roll crits. Every skill's damage goes through `damageEnemy` (armour, wards, the vulnerability cap, the elite / boss damage cap). The single exception is the gunner's bite (6% of an elite's or boss's maximum health outside the cap, 12% per target in total, shared between gunners). (Clarified at the step-2 review: that sentence is about the skills' own damage. The ninja's clones throw the ninja's own shuriken, which roll crit and ricochet like any shuriken of the ninja, as design 3.4.3 no. 21 says; the owner is asked to confirm this reading, see `docs/handoff/skills2_sim.md`.)
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

## Step 2 (started 2026-10-14; the owner, after step 1 was deployed and paused at his word: "작업 이어서 ㄱㄱ")

Step 1 is done and committed (simulation `0231f06`, view `1558287`): the frame, the ring, the cast director and four skills. Its hand-offs are the ground step 2 stands on: `docs/handoff/skills1_sim.md` (section 8: how a skill is added) and `docs/handoff/skills1_view.md` (section 5: how a scene or a ring mark is added). Step 2 adds the other eight skills: the samurai's cut, the ninja's clones, the storm cat's cloud, the frost queen's knock, the cosmo cat's meteor, the bard's jam session, the alchemist's transmutation, the lucky cat's capsule (design v2.3 section 3.12, with the six-line prize table and the fish capsule's half gauge back).

18. Decisions 1 to 17 hold for step 2. For every question the design's section 7 still lists, the document's recommended answer is taken (each is a data cell or a flag).
19. **Cooldowns: the owner has settled the four step-1 skills** (2026-10-14, to the lead's proposal from the step-1 bot report: "쿨타임은 제안대로 ㄱㄱ"): shield shove **12 s** (was 18), starlight lap **26 s** (was 34), wanted shot 24 s (unchanged), tiger's charge 34 s (unchanged). The eight skills of step 2 stay at the design's starting values (18 / 24 / 34 s by the cat's rank, each in its row's own cell, none above 34) until the lead has proposed values from the step-2 measurement and the owner has settled them. The lead applies the two new values himself after the step-2 measurement that was running when the owner answered has finished (so that one report is not measured half with the old and half with the new values), and measures the two skills again.
20. **No new image file in step 2 either.** The design lists new art (the cloud, the glass, the capsule colours and marks, the big fish): draw them in code or tint existing art, good enough to read at lane size. Candidate sheets for real art go to the owner afterwards (his standing rule: art is confirmed from a comparison sheet first).
21. Sounds: reuse the game's existing sounds and its own way of making them; no audio files from outside. Every window opened for a check is muted.
22. `SKILLS_ON` stays `false` through step 2. It is flipped by the lead only when all twelve skills, the texts of step 3 and the measurement are in.
23. The bard's jam session may fill the lucky cat's gauge (the design's recommendation: keep, measure, and exclude the cat only if it proves too rich). The measurement of step 2 must report it.
24. The step-1 skills are not to be changed while the eight are added (their rules, numbers and scenes), except where a new skill needs a hook; say so in the hand-off.

25. **After the step-2 bot report the owner decided four things** (2026-10-14, to the lead's questions: "1. 일단 그대로  권장대로 ㄱㄱ"). (a) Difficulty stays as it is for now: no enemy number is raised although twelve skills lift the bots' win rate from 49.6% to 57.1%. (b) **Several lucky cats give one stream of capsules**: when a lucky cat casts, every other lucky cat on the board starts its gauge over with it (data cell `sharedGauge true`). The lead had described this to the owner as "only one capsule at a time however many lucky cats"; the knob built earlier (`oneAtATime`) only spaced capsules in the air and did not reduce their number, so the gauge is shared instead. (c) Cooldowns: the samurai's cut 24 -> **20 s**, the frost queen's knock 24 -> **20 s**; the other six step-2 skills stay at their starting values. (d) The ninja's clones' shuriken roll crits like the ninja's own (a known exception to "skills do not roll crits").
26. The view of step 2 must show a second lucky cat's ring emptying together with the caster's (it follows from the unit state; nothing to build beyond the ring that exists).

27. **The tiger's charge, after the owner played it** (2026-10-14: "호랑이 돌격 쿨타임 30초로 줄이고 돌진을 적이 많이 몰려있는 곳에 해야하는데 이상한줄에서 하는데?"): cooldown 34 -> **30 s**; the heaviest stretch wins and the laser's dot only breaks ties; while a wave is still sending enemies out the tiger waits for a stretch of weight 8 (`crowd`), and takes the best stretch of weight 3 only once everything is out. This is the one change to a step-1 skill's rule during step 2 (decision 24 gives way to the owner's word).
28. **Rank names in every text are the game's own: 꼬마 · 동네 · 골목대장 · 대왕 · 수호신 (Kitten, Street, Alley Boss, King, Guardian).** The owner found "전설·신화 고양이" in a toy's text (fixed, with one more of the kind in the starting snacks). Never write 일반 · 희귀 · 영웅 · 전설 · 신화 or common · rare · epic · legendary · mythic in anything a player reads.

## Step 3 (started 2026-10-18): telling the player

Steps 1 and 2 are committed and deployed with the switch off (`51372e9`): twelve skills, their rings and scenes. Step 3 makes a player who has never heard of skills understand them: what the ring means, what each cat's skill does, that it casts itself.

29. **Where it is told** (design v1 sections 2.3, 5 and 6; v2 section 5.3): the selection sheet (the same ring on the photo corner, turning live; the ⓘ bubble gets the skill's name and one line after the passive line), the cat screen (one card for the skill: name, line, cooldown in seconds, and the rank it comes with), the 3-pick summon's tooltip, one tutorial lesson (a short read-only bubble the first time a ring is nearly full: "고양이 옆 동그라미가 가득 차면 스킬을 써요. 누르지 않아도 돼요."), one guide topic, and the name bubble that already exists. Nothing new on the battle HUD beyond that.
30. **Everything of step 3 follows the switch**: with skills off (the public build today) none of it appears anywhere, in battle or at home, so testers see exactly today's game; with `?sp=1` (and later `SKILLS_ON`) all of it appears. One function decides it, the one the app already uses for battles.
31. **Words**: Korean first, warm and short like the game's other lines, numbers filled from the rows' own cells through the strings' arguments (never typed into the text), rank names only 꼬마 · 동네 · 골목대장 · 대왕 · 수호신 (decision 28); the cats' existing passive line stays "특기" in Korean; in English the existing passive label becomes "Ability" and the new thing is "Skill" (design v1 question 5). Each skill's line says what the player sees happen, not internal mechanics; the capsule's line names its six prizes in plain words. Run `npm run font` after the texts.
32. No new image files; the lesson count test and every test that counts texts are updated honestly, not loosened.

## Step 4 and after (2026-10-18)

The owner, after step 3: "켜고 패치 노트랑 영상은 괜찮아 1. 수호신 스킬은 항상 그려 2. 시간은 굳이 안보여줘도 돼 3. 그림 그려 그러는김에 이펙트 연출 부분 전체적으로 폴리싱해봐 특히 타격음/효과음 쪽 좀 더 손보면 괜찮을거 같다는 테스터들 평가가 있었음 4. 그리고 튜토리얼쪽 버그가 꽤 많이 나는거 같아 난잡하다 해야 할까 한번 확인해봐".

33. **`SKILLS_ON` is true** ("켜고"): testers play with the twelve skills. No patch notes and no patch video for it ("패치 노트랑 영상은 괜찮아"). A run saved before the switch keeps the setting it started with.
34. **Every rank 5 cast is drawn** ("수호신 스킬은 항상 그려"): the stage rule exempts rank 5 casts like first casts (`StageRule.admit(now, exempt)`).
35. **No timer on the boss as a fish** ("시간은 굳이 안보여줘도 돼").
36. **Next work, in this order of the owner's list**: real art for the skills (candidate sheet first, his standing rule), a polish of the effects across the game with the hit sounds and sound effects first (the testers' comment), and a look at the tutorial, which he finds buggy and messy.

37. **The owner's picks from the art sheet `art/skills_v1/_sheet.png`** (2026-10-18, verbatim): "1. 분신이 아니라 유령 같아보임 연기 꼬리 말고 다리 달아줘 색감도 그림자 느낌으로 해줘 너무 진하지는 않고 분신들의 외관이 보일 정도로 1-2. B 2. C로 잘 보이게 강조를 더 해줘 효과음도 챙하는 소리 도 끼리 맞부딪히는 소리같은거로 해주고 전체적으로 스킬에 효과음을 넣으면 좋을거 같긴하네 예를들어 호랑이 장군은 스킬 시전할때 호랑이 소리가 난다거나 닌자는 분신 소환할때 연기 터지는 소리(퐁하는 소리)랑 연기가 나면서 분신이 나오고 그런식으로 연출부분에 힘써줘 3. B 4. B 5. B인데 얼굴은 빼주고 충격 섬광이나 충격 고리를 더 진하게 그리고 충격 고리는 무슨 레이스 장식같아 보이니까 좀더 후폭풍 처럼 보이도록 해주고".
    - Confirmed as they are: the capsule set **B** (tilted chunky shells, bigger marks) and the cloud **B** (round cloud with cat ears).
    - Redrawn and shown again before use: the ninja's clone (a copy of the ninja WITH LEGS, no smoke tail, a shadow-like tone that is not too dark so the ninja's look shows through) and the stacked pair in layout **B** in that same look; the samurai's cut **C** (ripped paper) with much stronger emphasis so it reads; the meteor **B** WITHOUT its face, a stronger (darker, more saturated) landing flash, and an impact ring that looks like a blast wave, not lace.
38. **Sound for the skills** (same message): every skill gets its own sound at its moment, made the game's own way (the procedural synth in src/audio), for example the tiger general's tiger roar on cast, the ninja's smoke "pop" as the clones come out of the smoke, the samurai's "챙" of two blades striking; and the effects as a whole get more care (the testers asked for better hit sounds and sound effects). Decision 21 (reuse existing sounds only) is lifted for this. Agents cannot listen: they judge by measurement and the owner listens to a before / after sound board.

39. **The owner's picks from the second sheet** (2026-10-18): clone "저건 외관이 생각보다 너무 잘보인다 좀 더 진하게 해도 될듯 색감은 B로" (tone B, darker: three code-darkened strengths in `art/skills_v1/_sheet_r3.png`, his pick pending), cut **C** (`cut2_c`), meteor **A** (`meteor2_a`: dust-cloud blast ring). With the first sheet's capsule **B** and cloud **B** the art set is settled once the clone's strength is picked.
40. **Sounds come from free asset sites or ElevenLabs, never anything with unclear rights** (the owner: "효과음 같은 경우는 사운드 무료 에셋 사이트들이나 일레븐렙스 통해서 해줘" and "출시해야 하니까 저작권 안걸리게 조심하고"). Only CC0 sources (for example Kenney's packs) and ElevenLabs on a paid plan (commercial use without attribution; the free plan asks for attribution) or the game's own synthesizer. Every file that ships is listed in a license ledger (`docs/licenses/sounds.md`: file, source URL, license, date). Each download is approved by the owner first (file, source, size).

## Working rules for every agent

- Shared working tree: several agents edit at once. Use the Edit tool on your own files only; never `git stash`, `git checkout`, `git reset`, `git clean` or commit. If you must touch a file another agent owns, make the smallest edit and say so in your hand-off.
- Each agent that needs a dev server or a headless browser uses its own ports (Vite 52xx, CDP 93xx as given in the prompt), the harness in `tools/edge` (`lib.mjs` `openGame`, always `close()`), and checks for leftover `msedge` processes when done. Evals must return plain data.
- Timeouts in the test suite under CPU load are usually other processes: rerun the file alone before changing anything.
- Hand-off notes go to `docs/handoff/skills1_<area>.md`: what exists (types, events with their payloads, data cells), what is left, anything a later step must know.
- The rules specification `docs/명세_전투규칙.md` gets a new section for the skills as they are implemented (rules as the code has them, values with their data cell names).
