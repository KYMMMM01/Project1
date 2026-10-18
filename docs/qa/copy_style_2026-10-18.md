# Copy review 2026-10-18: the owner's words and the style the review follows

## The owner's words (verbatim)

"아 그리고 설명 문구나 이런거 말이 어색한 부분이 많아 고양이 스킬 설명에도 스킬 게이지를 동그라미라고하는것도 이상함 이런거 한번 전체적으로 검토해보고 수정해"

(Many descriptions and texts read awkwardly; calling the skill gauge "동그라미" in the cat skill descriptions is odd too; review it all and fix it.)

Earlier, same subject: "장난감중에 전설/신화 고양이라는 말이 들어간 장난감이 있는데 우리는 그런 등급표현이 아니잖아" (2026-10-14): only the game's own rank names.

## What the review does

Every text a player reads, Korean first (the testers are Korean), English second: fix what is awkward, unnatural, translated-sounding, wrong, inconsistent or unclear. Keep the meaning, the placeholders and the length limits. Do not rewrite a line that is already natural just to change it.

## Terms (one word for one thing, everywhere)

| Thing | Korean | English |
|---|---|---|
| the ring round a skill cat's class sticker | **스킬 게이지** (never 동그라미, 고리, 원) | skill gauge |
| the new active power | 스킬 | Skill |
| the cats' passive line | 특기 | Ability |
| the five ranks | 꼬마 · 동네 · 골목대장 · 대왕 · 수호신 (never 일반 · 희귀 · 영웅 · 전설 · 신화) | Kitten · Street · Alley Boss · King · Guardian |
| two identical cats becoming one of the next rank | 합치기 / 합치면 / 합쳐요 (the HUD's word; not 합성 in player text) | merge |
| changing a cat's class with purr | 털갈이 | molt |
| a King becoming a Guardian | 각성 | awaken |
| the 4-wave block | 스테이지 (never 막) | stage |
| the difficulty steps | 집사 단계 | butler level (as the game already says) |
| elite / boss | 정예 / 보스 | elite / boss |
| currencies | 생선 · 골골 · 보석 | fish · purr · gems |
| toys | 장난감 | toys |
| the board's squares, distances | 칸 | tile(s) |
| the laser pointer | 레이저 | laser |

## Korean style

- The game's voice: warm, short, 해요체, a little playful. Write it the way a Korean mobile game writes it, not the way a translation reads.
- No translated-sounding patterns: chains of "~의 ~의", "~하는 것", "~에 대해", needless passives ("~되어지다"), English word order, "그리고/또한" to start a sentence, "당신".
- No particles written for both cases after a placeholder or a word: "을(를)", "이(가)", "은(는)", "와(과)", "(으)로". Rephrase so the particle is not needed, or put the number before a counter word ("길을 11칸", not "{dist}을(를)").
- No internal mechanics words: D, 틱, 판정, 몫, 상한값, 스택, 쿨타임 in player text (say "N초마다").
- Numbers and units the same way everywhere: "12초", "1.6칸", "+20%", "+2", "×2" or "2배" (pick the one the screen already uses), the middle dot · for lists inside a line.
- Short: a line that must fit a bubble or a card stays within its length test; if a fix makes a line longer, shorten elsewhere in it.

## English style

Plain, concise game English, consistent with the table above; title case only where the game already uses it (names), sentence case elsewhere. No rank words other than the five.

## How changes are made

- Every change keeps the key, the placeholders (`{a}`, `{s}`, `{rank}`...) and the line's length limit; tests that check texts are updated honestly, never loosened.
- `npm run font` after the changes (the Korean font is a subset).
- A change log for the owner: `docs/qa/copy_review_2026-10-18.md` with each changed line as before → after (Korean), grouped by screen.
