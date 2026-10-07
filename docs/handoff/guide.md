# Handoff: guide (the explanations, the guidebook, the tutorial's lessons)

Date 2026-10-07. Paths: `src/guide/**`, the lesson machinery in `src/view/hud/**` (list below), the tutorial script of the simulation (`src/game/sim/tutorial.ts`), the guidebook row of the home settings screen (`src/screens/system/settingsScreen.ts`), tests `tests/guide.*.test.ts`, `tests/view.hud.script.test.ts`, `tests/view.hud.encounters.test.ts`, `tests/sim.tutorial.test.ts`. Design and the lesson script as built: GDD section 9.

## One source of truth: `src/guide`

| File | What it is |
|---|---|
| `topics.ts` | The list: `TOPIC_LIST` (58 topics), each with `id`, `section` (start, team, field, foes, home), `art` and an optional `try` target (a battle control, a home tab). `topicDef`, `topicsOf`, `isTopicId`. |
| `facts.ts` | `factsOf(id)`: the numbers a topic quotes, read from the data tables (`game/data/balance`, `classes`, `enemies`, `stakes`, `waves`, `meta/data/*`, `meta/odds`) at the moment the text is built, in the current language. |
| `stringsKo.ts`, `stringsEn.ts`, `strings.ts` | `guide.<id>.title|teach|full` for every topic plus the screens' own words. No digit is typed: every figure is a `{placeholder}` (a test fails otherwise). `teach` is one or two short sentences for a bubble (at most 40 Korean / 72 English characters); `full` is the guidebook page, a line break starts a paragraph. |
| `text.ts` | `topicTitle`, `topicTeach`, `topicFull` (facts filled in). |
| `Illustration.ts` | `illustration(art, size)`: a paper tile with the topic's cats, enemy, toy, chest, board cell (flat sun, puddle or bolt) or kit glyph, built from the game's own stickers. |
| `progress.ts` | `GuideProgress`: what was **taught** (a lesson covered it), **read** (its page was opened) and whether the tutorial was **skipped**, persisted under `meowguard.hints` (version 2, migrated from the old `{ seen }` hints; "erase progress" wipes it with the rest). `guideProgress` is the player's own; sandbox runs get a private in-memory one. `unread()` drives the "new" stickers. |
| `GuideScreen.ts` | `openGuide({ topic?, progress?, host?, onClose? })`, `closeGuide()`. A `ScreenScaffold` notebook: section tabs in the action bar (a dot on a tab with unread pages), a list per section, a page per topic with previous / next and, when it makes sense, "try it" (`host.tryControl(control, topic)` in a battle, `host.goTab(tab)` on the home screen). Opening a page marks it read. |

## Entrances

1. Home settings: a large coral button at the top of the sheet (`settingsScreen.ts`; its sub line is the unread count).
2. Battle pause menu: a "guidebook" row (`PauseMenu.ts`, action `guide`); closing the guidebook brings the menu back, "try it" resumes the battle and puts a bubble on the control.
3. The "more in the guidebook" button of every first-encounter card, and the end-of-tutorial card.

## The lesson machinery (`src/view/hud`)

| File | Role |
|---|---|
| `tutorialScript.ts` (pure) | `STEPS`: the 19 lessons in order, each with the controls it reveals, its trigger (`when`), what it points at (`target`), what counts as done (`done`, a counter that moved since it began), whether it holds the clock, whether it is read-only (`ok`) or a timed note, its patience and the wave after which it is stale. `TutorialScript.update(world, dt, held)` returns begin / done / drop events. Urgent lessons (the elite, the boss) cut in on a lesson in progress; `relax()` lets go of a hold; `stop()` is the skip; `abandon()` drops a lesson that cannot be shown. |
| `Tutorial.ts` | The view of it: counts the player's actions from events, builds the `World` snapshot every frame (allocation-free; the geometry is re-measured ten times a second), paints the spotlight (dim with a window, dashed edge, blockers only while the clock is held), the hand, the note, the skip button; applies the clock hold; the free-play nudge (and the prep nudge for a skipped tutorial). |
| `LessonBubble.ts` | The paper bubble: picture tile, optional title, words, up to two buttons; placed by `bubbleMath.placeBubble`. Used as the tutorial note (no title, "got it" for read-only lessons) and as the first-encounter card. |
| `LessonFx.ts` | Pooled flat paper celebrations: a starburst with an open window when a control arrives, a "nice!" sticker with confetti when a lesson is done. |
| `hints.ts` | The first-encounter scheduler (formerly the one-line hints): `request(topic, target)`, `used(topic)`, `hold(s)`, `explain(...)` (refusals, unchanged). A card holds the battle while it is read, never stacks, waits for banners and popups, is taught when dismissed or when the player does the thing. `only` restricts it during the tutorial run (only `awaken`). |
| `encounters.ts` (pure), `encounterWatch.ts` | Which topic a thing belongs to (traits of the next wave's preview, boss by id, the run's own rules) and which events ask for which card. |
| `policy.ts` | `Reveal` gained `chips`; `revealFlags(tutorial, revealed)` (a normal run shows everything, the tutorial starts with five basics plus what taught lessons revealed); `HintId = TopicId`. |
| `env.ts` | `reveal` is live now: `env.showControl(key, fresh)` flips a flag and emits `env.revealed`; `ClassRow`, `CurrencyRow`, `ActionRow`, `TopBar`, `SelectionSheet` pop their control in on that event. `env.lessonOn(topic)` / `env.lesson()` let a popup carry a lesson (the pick of three, the toy choice, the class sheet); `env.note(key)` counts the class sheet's closing. |

## Debug hooks (debug builds)

`window.__dbg.lessons = { topic(), left(), card(), laser(), rectOf(target), progress }`: the lesson being taught, the lessons still to come, the topic of the card on screen, the laser guide's step, where a target is, and the progress object (`markTaught(id)`, `markSkipped()`, `skipped`). `tools/battle_motion.js` already calls `markSkipped()` after `mcOpen` so its captures are not interrupted by lessons; a run that wants the lessons opens the game itself (`openGame`, `mcInit`, `mcWarp`).

## Verified

See the 2026-10-07 owner feedback section of `hud.md` for the list of runs and the screenshot names. Tests: `npx vitest run tests/guide tests/view.hud tests/sim.tutorial.test.ts`.

## Known gaps

- No "replay the tutorial" row in the guidebook (a lost or quit tutorial run can be retried from its result screen).
- The Hangul font subset (`public/fonts/game-kr.woff2`) was rebuilt with `npm run font`; run it again after any string change.
- "Try it" for the home tabs closes the guidebook and the settings sheet and goes to the tab; it does not highlight a control there.

## REQUESTS

- `src/app/flow.ts` `chooseFirstScene` / `dropInterruptedTutorial`: a player who skipped the tutorial and then closed the app gets a tutorial run again (it opens as an easy run with no lessons and everything revealed). Going home instead needs `!guideProgress.skipped` next to `profile.data.stats.runs === 0` in `chooseFirstScene`.
- `src/screens/system/resetProgress.ts` `PROGRESS_KEYS` also lacks `meowguard.laser` (the laser explanation's counters), so an erased profile still has its laser guide marked done.
