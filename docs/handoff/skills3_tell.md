# Hand-off: skills, step 3 (telling the player)

Step 3 of `docs/qa/directive_2026-10-13_skills_build.md` (decisions 29 to 32). Three agents wrote it (the words, the three battle / cat screens, the teaching), a fourth put it together, read it as a player who has never heard of skills and as a code reviewer, fixed what held and proved it (section 7). **The simulation, the rings and the scenes were not touched**: `git diff HEAD -- src/game/sim src/view/director src/view/field` is empty. The only `src/game` edits are strings, one export line and the new data module `src/game/data/spTexts.ts`.

## 1. State

| | |
|---|---|
| Built | the skill's name, how often it casts and its one line in the selection sheet's "i" bubble, the 3-pick's hold tooltip and the cat screen's skill card; the board's ring on the selection sheet's photo; one tutorial lesson; a first-encounter card for normal runs; one guide topic. Korean and English |
| Switch | everything follows the one switch (section 4). With skills off (no parameter, `sp=0`) nothing of it exists anywhere and every screen is today's (checked by pixels, section 6) |
| New image files | none (the guide's picture and the sheet's ring are drawn in code from the field's own ring frame sheet) |
| Checks | `npx tsc --noEmit -p .` prints nothing; `npx vitest run` **217 files / 4,927 tests** green (211 / 4,833 before step 3); `npx vite build` into a scratch folder succeeds; `npm run font` gives the same subset after the review's text edits (639 Hangul syllables, `game-kr.c6744ff7.woff2`, the new words were all in it already) |

## 2. What is shown where

| Where | What | With skills off | Code |
|---|---|---|---|
| Selection sheet (battle), photo corner | the board's ring round a class sticker, lower left of the photo, turning with the cat's gauge, gold and closed when full, flashing when the cat casts. Only for a cat that has a skill | none, nothing listens to `spCast` | `view/hud/SheetRing.ts`, `SelectionSheet.ts` (`addRing`, `update(dt)`), `layoutMath.ts` (`SHEET.ring`, `sheetSkillRing`), `BottomPanel.ts` (passes `dt`) |
| Selection sheet, the "i" sticker and its bubble | every skill cat gets the sticker (before, only a cut line did). The bubble: the passive line, a blank line, then `스킬 · name`, `12초마다 · 저절로 써요` and the skill's line. Up for 14 s instead of 8 | today's sticker (only when the line is cut) and today's bubble | `view/hud/spTell.ts` (`withSkillText`, `hasSkillText`), `SelectionSheet.ts` |
| 3-pick summon, hold a card | the same three-line skill block after the passive line; the hint under the cards says "특기와 스킬" / "ability and skill" | today's tooltip and hint | `view/hud/popups/SummonPickPopup.ts` |
| Cat screen | a purple "스킬 / Skill" card: name, rank chip ("골목대장 스킬"), the line, a clock and "12초마다 · 저절로 써요". The passive's paper is titled "특기" / "Ability". A kitten or street cat gets "골목대장부터 스킬이 생겨요" under its ability line | no card, label "특기" / "Skill" as today | `screens/cats/UnitScreen.ts` (`skillPage`, `spPage`), `screens/cats/skillCard.ts` |
| Tutorial | lesson `sp_skill` (21 lessons with skills, 20 without): after the pick of three, when a ring reaches 70 % on a calm board, a read-only note with "got it", the spotlight on that ring. Taught in wave 3 only (`staleAt 4`), so it can never hold up the wave-4 elite lesson | the plan is the 20 lessons it always was (`stepsFor(spOn)`) | `view/hud/tutorialScript.ts`, `Tutorial.ts`, `view/hud/ringSpot.ts` |
| Normal run (no tutorial, or a skipped one) | the existing first-encounter card for the topic `sp_skill`, once per profile, pointing at the ring; "got it" / "more in the guidebook". In a real run it comes after the cards that were already queued (sun, swarm, speed ...), with a gap between them | never asks | `view/hud/ringWatch.ts`, three lines in `view/hud/index.ts` |
| Guidebook | topic `sp_skill` in the team section after `pick3`, with a picture of the viking's photo and its ring; "try it" goes to the cats tab. Not in the list, not counted unread, not offered by "next" / "back" | not listed at all (59 topics, as before) | `guide/topics.ts` (`SKILL_TOPICS`, `topicShown`, `bookHasSkills`, `topicsOf(section, skills)`), `GuideScreen.ts`, `progress.ts` (`unread(skills?)`), `Illustration.ts` (art `ring`), `facts.ts` |
| English labels | the passive is "Ability" and the new thing "Skill" only while skills are on (`sp.label.ability`, `sp.pick.tip`); with skills off it stays `cats.unit.skill` ("Skill") and `hud.pick.tip` | as today | `UnitScreen.ts`, `SummonPickPopup.ts` |

## 3. The keys

Game strings (`src/game/data/stringsGame.ts`):

- `sp.<id>.desc` (twelve, Korean and English): the skill's one line. **Every figure is a `{placeholder}`**; `spArgs(id)` (`src/game/data/spTexts.ts`) fills it from the skill's own row, so a retuned row changes the text. Placeholders per line: shove `push`; cut `span max fuse`; charge `dist`; clones `clones throws`; wanted `bite pool`; lap `sec` (the lap's time is `(PATH_LENGTH + extra) / speed`); cloud `life bolts` (`floor(life / every)`); knock `radius slowed frozen`; meteor `warn outer crater`; jam `notes fill`; fish `flasks boss elite bounty` (`flasks` = the big flask plus `smallTargets.withBig`; the same five fly with no big one); capsule `fish purr guardian` (the rank word comes from `rarity.mythic`).
- `sp.label.skill` ("스킬" / "Skill"), `sp.label.ability` ("특기" / "Ability"), `sp.cooldown` ("{s}초마다" / "every {s} s"), `sp.auto` ("저절로 써요" / "casts itself"), `sp.rank` ("{rank} 스킬"), `sp.later` ("{rank}부터 스킬이 생겨요"), `sp.pick.tip`.

Guide strings (`guide/stringsKo.ts`, `stringsEn.ts`): `guide.sp_skill.title`, `.teach` (the lesson's and the card's line: "고양이 옆 동그라미가 가득 차면 스킬을 써요. 누르지 않아도 돼요." as the directive words it), `.full` (six paragraphs; `spGuideFacts()` gives `rank below merge cosmo`).

Rank words are the game's five only (꼬마 · 동네 · 골목대장 · 대왕 · 수호신), always through an argument built from `rarity.*`, never typed. "동그라미" is the ring in Korean everywhere. The module `spTexts.ts` never looks at the switch: `spTexts(id)` returns `{ id, label, name, desc, cooldown, auto, rank, head, meta, bubble }`, `spTextsOfUnit(unitId)` the same or null, `spLaterText()`, `spGuideFacts()`.

## 4. The gate

One function decides: `skillsOn()` in `core/skillSwitch.ts` (the URL parameter `sp=1` / `sp=0`, else the constant `SKILLS_ON`, which is still `false`). `Profile.prepareRun` and the debug battle route put it into `BattleInit.sp`; a run keeps the value it started with.

- Inside a battle the screens ask `BattleApi.spOn` (so a saved run keeps its own setting): the sheet, its ring, the bubble, the pick, the lesson plan, the first-encounter watcher, the labels in the pick.
- Outside a battle there is no battle to ask, so they ask `skillsOn()` itself: the cat screen, the guidebook's list and counts (and the settings screen's unread count, which calls `unread()`).
- A card of a battle that plays with skills opens the guide on `sp_skill` by name; `bookHasSkills(topic)` then lists the topic for that visit even if the page's switch says off.
- The tests hold it: take the gate out of `withSkillText` / `hasSkillText`, `skillCardOf` and `topicShown` and nine tests in five files fail (section 7).

## 5. Files

New: `src/game/data/spTexts.ts`, `src/screens/cats/skillCard.ts`, `src/view/hud/{SheetRing,ringSpot,ringWatch,spTell}.ts`; tests `sim.spTexts`, `screens.cats.skillCard`, `view.hud.{spTell,sheetSkill,pickSkill,ring}`. Changed: the strings above, `src/game/index.ts` (one export line), `src/game/data/strings.ts` (the tunnel toy's wording, section 7), the HUD, cat-screen and guide files in section 2, `index.html` and `public/fonts/` (a new hash of the same subset). Existing tests changed honestly: `guide.progress` counts with `unread(true)` and has a skills-off test, `guide.text` / `guide.topics` list the new topic, `view.hud.script` has the new lesson in the order and in the "already taught" sets (STEPS is 21 long, `stepsFor(false)` is the 20 there were).

## 6. How it was looked at

Real screen (headless Edge, muted, my own Vite and CDP ports), Korean and English, 450 x 900 and 360 x 800: a chapter started from the home screen with a button press, a skill cat put on the board with `window.__dbg.battle.put`, the card read; the tutorial run played to the lesson (`/?debug=1&scene=battle&mode=tutorial&sandbox=1&sp=1`), held and dismissed; the sheet and its bubble for all twelve cats; the cat screen for a rank-3, a rank-5, the lucky cat and a kitten; the 3-pick with each card held; the guide page. Nothing was cut off; the longest bubbles (tiger in English at 360, the cosmo cat in Korean) fit above the sheet.

Skills off, **pixel comparison against HEAD**: `git archive HEAD` into a scratch folder (node_modules linked), a Vite on the same port, 29 screenshots of both builds from a hand-stepped game (`offcmp.mjs` in `...\scratchpad\skills3\final`): home (ko, en), the cat screen of a viking, the lucky cat and a paw puncher scrolled through, the guide's team list, the 3-pick and its hold tooltip, the sheets and "i" bubbles of three cats. 17 are byte-identical; the 12 that differ differ only in animated pixels (the sun tiles' sparkle, the start button's breathing, one spawn puff), nowhere in a text, a sheet, a card or a list. The scene graph of a skills-off sheet has no `sheet-ring` and no `sp-ring`. The tutorial with skills off lists 20 lessons in the old order and never the new one.

## 7. The review pass: found and fixed

Texts (a player's read; each was in the first draft):

1. **Fish line**: "small flasks 4" was only true when a boss or elite was there (five small ones fly otherwise). Now "플라스크 5개를 던져요" with `flasks` built from `big + smallTargets.withBig`; the English trimmed to fit the length limit.
2. **Wanted line** said only "a boss or elite", but the gunner also shoots the toughest plain enemy when there is none (`small`), which the "holds its fire before a boss wave" sentence presupposes. Now it says so, in 93 characters.
3. **Charge line**: "길 11칸을 거슬러" read badly; now "적이 가장 많이 몰린 길을 11칸 거슬러 달려요".
4. **Jam line** said "동그라미" twice in one clause and "each fill by" in English; now one note picks one cat.
5. **Bubble format**: the head's "(every 30 s)" broke across two lines for the tiger in English, and the bubble did not say that the skill casts itself. Now three lines: name / "12초마다 · 저절로 써요" / the line (`spTexts().bubble`, tests changed).
6. **Guide page** told the player to read the cooldown "in the card you get by tapping a cat", but it sits behind the "i" sticker; now it says so.
7. **A rank word that is not the game's**: the Cat Tunnel toy said "일반 고양이" / "a common cat" for a rank-1 cat. Now "꼬마 고양이" / "A Kitten" (`strings.ts`, one test). This is the same kind of defect the owner found in decision 28; it is not a skills text, so it also changes today's game (one toy line). Revert it if the owner prefers.

Code: the gate was checked by breaking it in a scratch copy (never in the repo): removing the `on` checks in `spTell.ts`, `skillCard.ts` and `topicShown` fails nine tests in five files; a text that types `1.6칸` instead of `{push}` fails three tests of `sim.spTexts`; a helper that stops giving `push` fails seven in two files. Nothing else was wrong in the diff: no simulation, scene or ring change; the existing tests were changed only where the count of lessons or of unread topics honestly moved.

## 8. For step 4 and for the owner

- The guide page does not explain the gunner's teal "holstered" ring and its chip, the stopped-ring mark, or the first-cast name bubble (the name bubble is self-explanatory; the other two need a paragraph and `npm run font`). Decide whether they are worth a paragraph.
- A first-encounter card that waited for a calm moment can show a ring that has just cast, which reads as empty; the wording still holds, so it was left.
- The card's picture is always the viking's photo and ring, whichever cat's ring it points at.
- Flipping `SKILLS_ON` stays the lead's decision. With it on, the home screen, guide, cat screen and every battle carry all of the above; the balance report, the phone performance pass, reduced motion, the rules specification (`docs/명세_전투규칙.md`, a texts note) and the patch notes are step 4.
- The English passive label "Ability" also exists as the class synergy's "ability" in the guide; the two are different things and the guide's wording was left alone.
