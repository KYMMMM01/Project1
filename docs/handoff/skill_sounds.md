# Skill sounds hand-off (`src/audio/sfx-skills.ts`, 2026-10-19)

The owner asked (2026-10-18) for the effects to be better and for every skill to sound like itself ("호랑이는 포효, 닌자는 연기 퐁, 사무라이는 챙"). Until now a skill scene played whatever the game already had. Now every one of the twelve skills has sounds of its own at the moments of its scene. **Agents cannot listen**: everything below was judged by offline renders (numbers and spectrograms); the owner listens on the sound board (`?scene=sounds`). The full plan, the measurements and the honest list of what is unknown are in `docs/qa/sound_audit_2026-10-18.md`, section 12 and appendix E. Decisions 38 and 40 of `docs/qa/directive_2026-10-13_skills_build.md` bind (own synth, or the three Kenney CC0 packs, nothing else).

## What changed

| where | what |
|---|---|
| `src/audio/sfx-skills.ts` | **new**: 48 recipes `sp_*` (27 signatures of tier `skill`, 21 small sounds of tier `skillTick`). Synthesis is the main material; 22 recordings are laid UNDER some of them (`Recipe.needs`). A recipe is a whole sound without its recordings. |
| `src/audio/samples.ts` | **new**: `SampleStore` (reads the WAVs of `src/assets/sfx/` by hand, no `decodeAudioData`; a file that fails or takes over 6 s leaves the recipe with its synthesis), `parseWav`, `sampleStore` (the game's one store), `SAMPLE_URLS` (a `import.meta.glob` of `src/assets/sfx/**/*.wav`). Loaded when the context first runs (`engine.onRunning`), awaited by `bakeVariant` for recipes that `needs` them. |
| `src/audio/synth.ts` | `Synth.sample(id, { at, v, rate, from, dur, fade, attack, lp, hp, send })`. |
| `src/audio/recipe.ts` | `Cat` += `skill` (peak 0.62 / RMS 0.10) and `skillTick` (0.34 / 0.05) in `CAT_TARGET`; `Recipe.needs`; `Variant.i` (the variant's number: a recipe may pick `files[i % n]`). |
| `src/audio/sounds.ts`, `api.ts`, `families.ts`, `bank.ts`, `bake.ts`, `engine.ts` | the 48 ids in `SFX_IDS`; five families (`skill fanfare and prize`, `skill voice and breath`, `skill blow`, `skill ring and glass`, `skill air and boing`); `BANK_BUDGET_MB` 14 -> 17; `bakeVariant` waits for `needs`; a `skill` sound waits up to 2 s for its first bake (like a big one); `onRunning` preloads the samples. `PlayOpts.pan` / `delay` already existed in the engine. |
| `src/view/director/stage.ts` | rules `skill` (never refuses: a signature and every sound that happens once or twice in a skill) and `skillTick` (0.025 s apart, six starts in any 0.12 s, outside the fight's shared `chatter` pool: hoofbeats, stars, bolts). `play` / `playStep` take `pan` and `delay` (seconds on the audio clock); `panOf(sceneX)` (+-0.6); `stagger(kind, gap, max)` (holds the next sound of a kind back so that a bunch that lands in one instant becomes a quick run). |
| `src/view/director/sp/*.ts`, `intro.ts` | the sound calls only (and the few new ones). The old borrowed sounds (`hit_heavy`, `whoosh`, `molt`, `zap`, `shield_break`, `place`, `explosion`, `chest_open`, `level_up`, `atk_*`, `imp_*`, `awaken`) are gone from the skill scenes. The rank 5 cut-in plays `sp_cutin` (0.65 s) instead of `awaken` (1.24 s). The arrow of the star archer plays its whoosh in pieces along the lap, each panned to where the arrow is (`Arrow.update`). |
| `src/view/soundPlan.ts`, `warmup.ts` | `SKILL_SOUNDS` (per cat) and `skillSounds()`: when a skill cat appears in a battle with skills on, its skill sounds are baked ahead (behind the cat's own release and impact). |
| `src/soundboard/` | the 12 skill rows have a "새것" (`NEW_VERSIONS` in `next.ts`: the scenes' own calls with the same volumes, pitches and rounded times); "지금" = the old borrowed sounds (the `now` cues of `catalog.ts`, with the old cut-in `awaken` added to the four rank 5 rows); new section `skillsingle` "스킬 소리 낱개" with one row per `sp_*` id (the Kenney files each one uses are named in its text). `GAP_SECONDS` += `skill` 0, `skillTick` 0.025. |
| `src/assets/sfx/` + `docs/licenses/sounds.md` | the 22 files (448 KB) and the ledger's "In the game" table, both written by `tools/sfx/ship.mjs`. |
| `tools/sfx/ship.mjs`, `tools/sfx/audit/*` | `ship.mjs` (copy + check + ledger); audit tools extended (`sheet.mjs`, `skill_levels.mjs`, `skill_table.mjs`, `skill_battle_stats.mjs`; `run_setup.js` / `run_skills.mjs` / `mixall.mjs` / `skills_stack.mjs` / `mix_page.js` take pan, delay and run names). |

## How to change or add a skill sound

1. Add the id to `SFX_IDS` (`api.ts`), a recipe to `SKILL_RECIPES` (`signature({...})` or `small({...})`), the id to one of the five families (`families.ts`) and to `SKILL_SOUNDS` (`soundPlan.ts`), a row to `SKILL_SINGLES` in `src/soundboard/catalog.ts` (Korean text; run `npm run font`). Tests insist on each.
2. Call it from the scene through the stage: `stage.play(stage.rules.skill, 'sp_x', volume, pitch, detune, stage.panOf(x), delay)`. `skill` for a signature and for anything that comes once or twice in a cast, `skillTick` for what comes by the dozen. `stage.stagger('kind', 0.055)` as the `delay` for a bunch that lands together.
3. Level: set `trim` so that `volume x` baked L100 hits the target (signature -16.5 ~ -19, small -22 ~ -26): `tools/sfx/audit/skill_levels.mjs` prints the trim for every sound (needs the render of `sheet.mjs`, see audit 12.8). The baker never passes a peak of 0.95; keep skill peaks under -1 dBFS (the report wants `awaken` to stay the highest peak).
4. A recording: put the converted WAV into `public/soundboard/kenney/<pack>/` (`tools/sfx/convert.mjs`, only the three approved packs), add a row to `FILES` of `tools/sfx/ship.mjs`, run it (`node tools/sfx/ship.mjs`), list it in the recipe's `needs`, use `s.sample('<pack>/<file>', {...})`. `tests/audio-skills.test.ts` checks that every file is WAV 16-bit mono 44.1 kHz, <= 60 KB and <= 0.4 s, has a ledger row, is used by some recipe and that every recipe's `needs` is exactly what it lays.
5. Measure: `window.__dbg.audio.report()` must have `failing: []`; then the 3x battles (audit 12.8).

## Tests (all green, tsc clean)

`tests/audio-skills.test.ts` (18: WAV reading, the store, the files and the ledger, tiers, voice rules, families, ducks, `needs`, variants), `tests/view.director.stage.sound.test.ts` (pan, delay, stagger, rules), each scene's own file in `tests/view.director.sp.*.test.ts` (every skill's scene plays its sound at its moment: the tiger's roar / landing / hoofbeat / end roar, the arrow's panned whooshes and a ping per star, the cloud's five beats, the capsule's fall / bounces / rattle / opening and six prizes, the ninja's hop / throw / vanish, the cut's sheath and clash 40 ms apart, ...; the fakes of these files have `panOf`, `stagger` and the two rules), `tests/view.warmup.test.ts` / `view.soundPlan.test.ts` (skill sounds baked ahead only with skills on), `tests/view.director.sp.run.test.ts` ("with skills off none of this exists" now also asserts no sound), `tests/audio-recipes.test.ts` (the fake synth records samples; six recipe files; 30 MB bound), `tests/audio-bank.test.ts` / `audio-engine.test.ts` (17 MB). Full suite: 225 files, 5,199 tests (the three that fail under CPU load pass alone: `meta.profile`, `sim.bots`, `sim.perf`).

## Not done / left for the next agent (hits and mix)

> **Done since, by the hit pass of 2026-10-19 (`docs/handoff/hit_sounds.md`)**: the fight bus that dips under every signature (`hush`, 3 dB, 0.45 s; the roar 0.6 s), the soft-clip ceiling, the seeded stream of chance, a piercing arrow as one blow and a fading echo (`Volley`), the first-tap loss in the engine. The roar and the cut-in are 2 dB and 1.5 dB lower (the roar was a quarter to a half of the energy of the busiest second). What is still open in the list below: the optional moments and the ears.

* Fight bus ducking, soft clip, the seeded PRNG, "once per shot" for piercing hits, the first-tap loss (audit 9, 10.2). The tiger's roar is 22 ~ 36 % of the energy of the second it sounds in; a fight bus that dips under `skill` sounds is the fix.
* The bank has 0.6 MB left of 17 (16.4 measured at 48 kHz).
* Optional moments of the plan that were not worth a call site: the shield's "resist" tick, per-enemy ticks of the samurai's afterimage, a burst when the star archer fells an enemy, the flying cup, the crater's sizzle, the bard's ring bounce.
* Nobody has heard any of it, on the board or on a phone. The roar is a cartoon made of triangle waves, a formant sweep and a 27 Hz flutter and will not sound like a tiger: if the owner wants a real one, an ElevenLabs recording (paid key) or an approved CC0 animal pack is the way (the Kenney packs have no animal).

## Deploy

Not deployed. The tree holds other workflows' edits (the tutorial and the art); `npm run font` was run (`game-kr.e039a629.woff2` at the time of writing). When it is whole: `tools/deploy_pages.sh`, then the owner opens `https://kymmmm01.github.io/Project1/?scene=sounds`, taps "스킬" and presses "지금" / "새것".

## Landing review (2026-10-19)

`docs/qa/sound_audit_2026-10-18.md`, section 14. All 48 sounds were baked again and looked at one by one: no click at a start or an end (first and last sample 0, tails under -37 dB before the 8 ms fade, nothing truncated), nothing above 4 % of the energy over 6 kHz that comes by the dozen (the star ping, the hoofbeat, the thunder tick, the shard), the loudest at the cast (the glass 17 %, the sheath 15 %, the stamp 13 % over 4 kHz) is heard once. Twelve signatures at once through the real graph do not touch the ceiling. **One change**: `sp_clone_hop` was nearly the same sound as `sp_stomp` (fingerprint distance 3.4: both a low felt "tup" and a puff of dust, from two different skills). It is now a light "tip" (a sine slipping 880 -> 640 Hz, a leaf's rustle, almost nothing under 250 Hz), `trim` 3.5 -> 6 so that it still plays at the plan's -25 LUFS at the scene's volume 0.7; its nearest sound is 9.5 away.

The board's texts that named the old borrowed sounds in the skills' scenes (`explosion`, `shield_break`, `whoosh`, `foe_glass_hit`, `shoot_magic`) were corrected: `shoot_magic` is no longer played by anything (the cloud scene has `sp_cloud_pop`).

Still for the owner's ears: the tiger's roar (a cartoon of triangle waves and a formant), which of the three Kenney "chaeng" files fits, the glittering tail of the glass, whether the samples fuse with the synthesis under them.
