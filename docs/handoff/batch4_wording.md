# Hand-off: batch 4, wording and landing (item C, and the join of the four areas)

Date 2026-10-10, base commit `a3b8536`. Owner's words and decisions: `docs/qa/directive_2026-10-10_batch4.md`. Nothing is committed, pushed or deployed.

## Part 1: the tree

At the start of this pass `npx tsc --noEmit -p .` printed nothing and the whole suite passed (162 files / 3,494 tests), so the four areas met without a break: no string key used by two people, no `StakeRules` literal, no rank count test left behind. Nothing of the four reports was left undone by its engineer. Open items of theirs are in their own notes (`batch4_meta.md`, `batch4_tutorial.md`, `batch4_toys.md`, `batch4_stakes.md`); the ones the lead has to carry are in "Open" below.

## Part 2: "막" is now "스테이지" (Stage)

Internal names stay (`act`, `actClear`, `ACT_PURR`, `actPurr`, topic id `acts`, keys `director.actClear`, `guide.acts.*`). Every player-facing string of both languages was found by grepping `막` and `\b[Aa]cts?\b` over `src/` and reading each hit; the other words with 막 were left (막대 = bar, 보호막 = shield, 막다/막아요/막으면 = block or hold out, 마지막 = last).

### Korean, key: old -> new

| key | old | new |
|---|---|---|
| `guide.acts.title` | 막과 웨이브 | 스테이지와 웨이브 |
| `guide.acts.teach` (the tutorial's bubble) | 웨이브 {actLen}개가 한 막이에요. 막이 끝나면 보상이 있어요. | 웨이브 {actLen}개가 한 스테이지예요. 끝나면 보상이 있어요. |
| `guide.acts.full` | 웨이브 {actLen}개가 한 막이고, 한 챕터는 {acts}막 {waves}웨이브예요. / 막이 끝나면 생선과 골골을 받고… | 웨이브 {actLen}개를 묶어 스테이지라고 해요. 한 챕터는 {acts}스테이지, {waves}웨이브예요. / 스테이지가 끝나면 생선과 골골을 받고… |
| `guide.purr.full` | …막을 넘길 때마다 {act}개를 받아요 | …스테이지를 넘길 때마다 {act}개를 받아요 |
| `guide.sun.full` | 특수 칸은 막이 끝날 때마다 새 자리로… | 특수 칸은 스테이지가 끝날 때마다 새 자리로… |
| `guide.toys.full` | 막이 끝날 때마다 장난감… 이른 막에는 {early}, 중간 막에는 {mid}, 뒷막에는 {late} 비율로… 다음 막의 적에게… | 스테이지가 끝날 때마다 장난감… 앞쪽 스테이지에는 {early}, 중간에는 {mid}, 뒤쪽에는 {late} 비율로… 다음 스테이지의 적에게… |
| `codex.cell.special.text` | …막이 끝날 때마다 새 자리로 옮겨요 | …스테이지가 끝날 때마다 새 자리로 옮겨요 |
| `modifier.toy_box.desc` | 막을 깰 때마다 장난감을 {a}개 골라요. | 스테이지를 깰 때마다 장난감을 {a}개 골라요. |
| `stake.2` | 막을 깰 때 받는 골골이 {a}개로 줄어요. | 스테이지를 깰 때 받는 골골이 {a}개로 줄어요. |
| `relic.purr_pillow.desc` | 막을 깰 때마다 골골 +{a} | 스테이지를 깰 때마다 골골 +{a} |
| `director.wave` (banner) | {act}막 · 웨이브 {wave} | 스테이지 {act} · 웨이브 {wave} |
| `director.actClear` | {act}막 클리어! | 스테이지 {act} 클리어! |
| `hud.relic.cleared` (toy screen title) | {act}막 클리어! | 스테이지 {act} 클리어! |
| `hud.fail.not_enough_purr` | 골골이 모자라요. 막을 깰 때 받아요. | 골골이 모자라요. 스테이지를 깰 때 받아요. |
| `hud.wave` (top bar) | {act}막 · 웨이브 {wave}/{total} | 스테이지 {act} · {wave}/{total} |
| `hud.waveOpen` (top bar, endless) | {act}막 · 웨이브 {wave} | 스테이지 {act} · {wave}번째 |
| `hud.pause.where` (new) | (the pause menu used `hud.wave`) | 스테이지 {act} · 웨이브 {wave}/{total} |
| `hud.pause.whereOpen` (new) | (the pause menu used `hud.waveOpen`) | 스테이지 {act} · 웨이브 {wave} |

### English, key: old -> new

| key | old | new |
|---|---|---|
| `guide.acts.title` | Acts and waves | Stages and waves |
| `guide.acts.teach` | {actLen} waves make an act. Each act ends with rewards. | {actLen} waves make a stage. Each stage ends with rewards. |
| `guide.acts.full` | …{actLen} waves make an act, and a chapter is {acts} acts, {waves} waves. When an act ends… | …{actLen} waves make a stage, and a chapter is {acts} stages, {waves} waves. When a stage ends… |
| `guide.purr.full` | …each cleared act {act} | …each cleared stage {act} |
| `guide.sun.full` | …whenever an act ends | …whenever a stage ends |
| `guide.toys.full` | After every act… Early acts offer…, the middle acts…, the late acts…; …the next act. | After every stage… Early stages offer…, the middle stages…, the late stages…; …the next stage. |
| `codex.cell.special.text` | …when an act ends | …when a stage ends |
| `modifier.toy_box.desc` | Pick {a} toys every time you clear an act. | Pick {a} toys every time you clear a stage. |
| `stake.2` | Clearing an act pays {a} purr. | Clearing a stage pays {a} purr. |
| `relic.purr_pillow.desc` | +{a} purr every time you clear an act | +{a} purr every time you clear a stage |
| `director.wave` | Act {act} · Wave {wave} | Stage {act} · Wave {wave} |
| `director.actClear` | Act {act} clear! | Stage {act} clear! |
| `hud.relic.cleared` | Act {act} cleared! | Stage {act} cleared! |
| `hud.fail.not_enough_purr` | …when you clear an act. | …when you clear a stage. |
| `hud.wave` | Act {act} · Wave {wave}/{total} | Stage {act} · {wave}/{total} |
| `hud.waveOpen` | Act {act} · Wave {wave} | Stage {act} · Wave {wave} |
| `hud.pause.where` / `hud.pause.whereOpen` (new) | | Stage {act} · Wave {wave}/{total} / Stage {act} · Wave {wave} |

English already used "stage" for a different thing (a chapter at a butler level: sweep, first clear). Those four lines were reworded so "Stage" means only the block of four waves: `meta.err.not_cleared` ("You can only sweep stages you have already cleared." -> "You can only sweep a chapter you have already cleared at that butler level."), `shop.tickets.sub` ("…a cleared stage…" -> "…a cleared chapter…"), `hud.res.firstClear` ("New stage cleared! Chapter {chapter} · Butler {stake}" -> "First clear! Chapter {chapter} · Butler {stake}"), `rt.sys.feat.sweep` ("…cleared stages…" -> "…cleared chapters…"). Korean says 단계 there and is unchanged.

### The top bar: "스테이지 3 · 12/24"

The label (`TopBar.waveLabel`, `COLUMN_W` 228 design px, `padX` 12) has **204 px** of text at **24 px** type, which is the kit's minimum (`MIN_FONT`; `fitLabel` cannot shrink it, so a longer text is cut with "…"). Layout is full: 16 + 228 + 8 + 4 cards (242) + 8 + 5 toys (200) + 16 = 718 of 720, so the label cannot grow. Widths measured in the page with the game font (`uiLabel(text, { size: 24 }).width`):

| text | px | |
|---|---|---|
| 3막 · 웨이브 12/24 (old) | 174.9 | fits |
| 스테이지 3 · 웨이브 12/24 | 235.8 | cut |
| 3스테이지 · 웨이브 12/24 | 231.3 | cut |
| 스테이지 3 · 웨이브 8/8 (tutorial) | 214.2 | cut |
| 스테이지 3 · 웨이브 12 (no total) | 195.5 | fits, but 스테이지 12 · 웨이브 48 is 210.8 (endless) |
| 3스테이지 · 12/24 | 169.0 | fits |
| **스테이지 3 · 12/24** (chosen) | **173.5** | fits; widest real case 스테이지 6 · 24/24 = 179.3 |
| Stage 3 · Wave 12/24 | 218.2 | cut |
| **Stage 3 · 12/24** (chosen) | **154.7** | fits; widest Stage 6 · 24/24 = 160.4 |

Choice: the word 스테이지 stays whole and first ("스테이지 3", the same shape as the banner "스테이지 3 · 웨이브 12", the toy screen "스테이지 3 클리어!", the pause menu), and the label drops the word 웨이브 but keeps the total, because "12/24" says how far the run is and every wave start already shows "스테이지 3 · 웨이브 12" in full. The endless label has no total, so Korean reads "스테이지 20 · 79번째" (191.5 px on screen; 25 · 100 would be 203.6, just in) and English keeps the word, "Stage 20 · Wave 79" (196 px on screen). **English endless at wave 100 or more is 4 px too wide (208.1) and loses its last glyph to "…"**; the weekly endless tiers stop at wave 80. The pause menu has room, so it has its own keys with the full form ("스테이지 1 · 웨이브 1/24 · 0:03"). Viewing at 360 x 800 and 450 x 900 in both languages: nothing is cut (stills in the session scratchpad `batch4/wording/shots/topbar-*`).

### Other changes in this pass

* `src/view/hud/LessonBubble.ts`: the lesson note now uses `balanceWrap` like the first-encounter cards (a lesson of two lines breaks into two lines of about the same length). It was needed for the lesson that changed: "웨이브 4개가 한 스테이지예요. 끝나면 보상이 / 있어요." left a stray word. No line count and no bubble height changes.
* `src/view/hud/popups/PauseMenu.ts`: uses `hud.pause.where` / `hud.pause.whereOpen`.
* Docs: one terminology line near the top of `docs/명세_전투규칙.md`, `docs/명세_메타.md` and `docs/기획서_GDD.md` (they keep saying 막); `README.md` line 14.
* Font: `npm run font` was run after the text change (`game-kr.a3dcbdba.woff2`, 618 Hangul syllables; `index.html` and `public/fonts` changed accordingly). `tests/core.font.test.ts` passes.
* New `tests/wording.stage.test.ts` (5): every string that names the block says 스테이지 / Stage; no string of either language holds the old 막 patterns (`3막`, `한 막`, `막을 깰`, `막마다`, `뒷막`…) or the word act (placeholders aside); the stage number has the same shape everywhere (word first); English "stage" is not used for the sweep and first-clear lines; the top bar label is the short form.
* No existing test quoted the old words.

## Part 3: what was looked at (headless Edge on its own dev server, stills in the scratchpad)

Top bar (ko, en, 360 x 800 and 450 x 900); the tutorial's stage lesson (real first-run tutorial driven to wave 2; ko 360 and 450, en 450); the toy-choice screen titled "스테이지 5 클리어!" and the gold dungeon's "스테이지 1 클리어!" ribbon and screen; the wave banner; the pause menu; the result screen of a bot-won run (it shows no stage number, only "웨이브 24/24"); the guidebook page "스테이지와 웨이브"; the codex cells page; the codex toy list (all ranks, the purr pillow card in ko and en); a monster page (boss_vacuum at chapter 2, butler 3, and the control rows of three foes); the stake picker's rule bubble at 2, 3 and 5 in ko and en; the calendar that opens by itself after the first settled run (claim, then the unlock popup follows); the codex badge (6 on the book button before, none after opening and closing the codex; stickers and the tab dot while it is open); endless at wave 79. No page errors in any run.

## Open

* The owner may prefer "스테이지 3 · 웨이브 12" without the total (it fits for the normal 24-wave run, 199.7 px at worst, but not for endless or the tutorial's 8/8); the choice above keeps the total. One key to change: `hud.wave` (ko and en).
* English endless at wave 100+ clips 4 px (see above).
* Not changed, for the lead and the owner: the nap blanket's effect, `RELIC_SCORE` in `bots.ts`, the open questions of the four notes.
