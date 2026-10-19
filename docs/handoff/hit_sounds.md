# Hit sounds and the mix (2026-10-19)

The testers said the hit sounds and the effects needed work ("특히 타격음/효과음 쪽 좀 더 손보면 괜찮을거 같다"). The audit (`docs/qa/sound_audit_2026-10-18.md`) found why, the skills pass gave every
skill its own sounds, and this pass is the one the audit called "타격음과 믹스": the weapons' sounds, what an enemy answers with, the layers a blow adds, the boss's cues, and how all of it is
mixed. **Nobody here has heard any of it.** Agents cannot listen: every figure below is an offline render measured in a muted headless Edge, every judgement of the kind "does it sound
like a thwack" is a hypothesis that the owner closes on the sound board (`?scene=sounds`: 지금 / 새것 on 75 rows).

Rules the work stayed inside (`docs/qa/directive_2026-10-13_skills_build.md`, decisions 38 and 40): sounds come from the game's own synthesis (`src/audio`), from the three CC0 packs by Kenney
that are in `art/sfx_src/kenney/` and from nothing else. Seven recordings were added to the game, each a copy of a converted file of the board's candidate tab, listed in `docs/licenses/sounds.md`
(29 files in all now, 555 KB, WAV 16-bit mono 44.1 kHz: Safari and Chrome on phones read it, there is no start delay to smear the first millisecond of a hit).

## What changed, in one place

| what | how |
|---|---|
| The 20 weapons' **landing** sounds (`imp_*`) | rebuilt on one plan (below), a new file `src/audio/sfx-impacts.ts`; the recordings under 8 of them |
| The 20 **releases** (`atk_*`) | the weak ones fixed (the archer's twang is up where a phone plays it, the sling's snap has a crack, the gunner's pop and the fire and cosmo casts have middles), the loud ones brought down so a release is the lighter half of its pair; every line still grows by rank |
| `hit_heavy`, `crit`, `explosion` | the weight a phone can play, a crack on top; the crit is clearly the biggest of the layers |
| What an **enemy answers** (`foe_*_hit`, 10 materials) | one band each, a crack on the hard ones (plastic, tin, glass), the soft ones (dust, cloud) kept soft |
| The boss's cues (`boss_warning`, `boss_roar`) | 2.5 to 3.5 dB lower, a middle a phone plays; they and `boss_die` dip the fight bus and the music |
| The **mix** | three effect buses, the fight bus gives way to a big moment (`hush.ts`), a ceiling after the limiter, the music dips under every big moment |
| **Variety without chance** | the variants take turns, the pitch and level spread come from a seeded stream (`random.ts`), the sounds of blows that land together start a few ms apart, a shot is one blow and a fading echo |
| The **director** | a shot's blows (`Volley`), a spread (`Stage.playSpread`), the sound placed where the enemy is (`panOfField`), the detune from the seeded stream |
| The **board** | "지금" and "새것" on every changed row, the old recipes kept word for word as `old_*` (`src/audio/sfx-before.ts`) |
| The **first tap** on a phone | the engine resumes inside a touchend / click (the board agent found the hole; the engine fix was started by the agent before this one and is finished and tested here) |

## How a hit is built (`src/audio/hitkit.ts`)

The audit measured 20 impacts: sixteen had almost nothing between 2.5 and 6 kHz in their first 20 ms (the "찰" of a contact), a third of their energy sat under 250 Hz where a phone
speaker plays almost nothing, and five rang for 80 ms and more. So a hit is now three things in a fixed order of time:

1. **crack**, 16 ms of noise in a band around 3 to 4 kHz that starts in 2 ms and holds (a plateau: a spike of the same peak would have to be five times louder and the baker would push
   everything else down to fit it; measured, a crack of level 0.7 to 1 gives 6 to 13 % of the first 20 ms between 2.5 and 6 kHz);
2. **body** a phone plays: a drop driven by a saturator and a high-pass so that its harmonics sit at 300 to 1200 Hz (a sine at 100 Hz is lost), or a knock of wood or tin;
3. **material**: what the thing is made of, the recipe's own synthesis with a few milliseconds of a real recording under it where one helps. A recipe is a whole sound without its file.

The two measures the report now checks for every impact: `biteFrac` (the plain share of the first 21 ms between 2.5 and 6 kHz, >= 0.05) and `phoneFrac` (the share of the energy at 250 Hz and up,
>= 0.35), and `fallMs` (peak to a tenth: <= 60 ms, the top rank of a line <= 80 ms).

Figures are "ms · loudness L100 (K-weighted, 100 ms) · bite (plain share of the first 20 ms between 2.5 and 6 kHz) · phone % (energy at 250 Hz and up) · fall (ms from the peak to a tenth)" of the first variant, before and after.

| cat | what it is made of | recording | before | after |
|---|---|---|---|---|
| 솜방망이 `imp_w_paw` | glove on a cushion: a leather slap (1.25 kHz band) + a pat driven through a high-pass so a phone plays it + crack 3.4 kHz | - | 45 · -27.9 · 0.003 · 8 · 17 | **43 · -26.6 · 0.064 · 87 · 17** |
| 검사냥 `imp_w_sword` | wood on wood: a recorded wooden knock + a clack (820 Hz) + crack 3.6 kHz + a short pat | `impactWood_light_002` | 55 · -23.1 · 0.002 · 70 · 26 | **56 · -26.3 · 0.126 · 95 · 15** |
| 바이킹냥 `imp_w_viking` | an axe into wood: a recorded chop + a driven drop 220 to 90 Hz + a burst of splinters + crack (the toy bell of the old one is gone) | `chop` | 123 · -22.2 · 0.006 · 37 · 58 | **60 · -23.3 · 0.075 · 47 · 54** |
| 사무라이냥 `imp_w_samurai` | a clean cut: snap + a falling "tsk" 3.1 to 2.3 kHz + a short steel ring + a light cut-through (the long "챙" is the skill's) | `impactMetal_medium_004` | 149 · -18.7 · 0.141 · 66 · 50 | **71 · -21.9 · 0.221 · 97 · 33** |
| 호랑이 장군 `imp_w_tiger` | a polearm lands: the wooden shaft + a driven drop 360 to 130 Hz + a clack + crack + a puff of dust | `impactWood_medium_000` | 163 · -18.2 · 0.005 · 12 · 81 | **103 · -21.2 · 0.119 · 71 · 52** |
| 새총냥 `imp_r_sling` | a pebble on cardboard: a tok (560 Hz) + a tick of paper + crack | - | 36 · -28.1 · 0.001 · 100 · 28 | **33 · -26.6 · 0.067 · 100 · 27** |
| 궁수냥 `imp_r_archer` | an arrow into a board: a recorded wooden knock + a tok + crack + the shaft quivering | `impactWood_light_000` | 102 · -25.8 · 0 · 100 · 40 | **60 · -25 · 0.131 · 97 · 27** |
| 닌자냥 `imp_r_ninja` | a star on a tin sign: a recorded clang + a tink + a thunk + crack + a small bounce | `impactMetal_medium_000` | 93 · -22.5 · 0.01 · 100 · 67 | **84 · -23 · 0.08 · 100 · 58** |
| 총잡이냥 `imp_r_gunner` | a cork on a tin plate: a recorded tin ring + a tok + a ring of its own (1.1 kHz) + crack + a pat and a low body | `impactTin_medium_003` | 80 · -22.8 · 0.002 · 90 · 27 | **61 · -21 · 0.129 · 45 · 29** |
| 별빛 사수 `imp_r_star` | ONE short twinkle (was a 230 ms double ping): a sine that rises a fifth A6 to E7 + a glassy partial + a soft pat + a faint crack; 5 dB softer | - | 230 · -17.2 · 0.014 · 96 · 127 | **71 · -20.5 · 0.085 · 100 · 37** |
| 눈덩이냥 `imp_m_snow` | a "pof": a muffled burst of powder + a whump + a crunch + crack | - | 51 · -28.8 · 0.012 · 32 · 24 | **57 · -26 · 0.091 · 57 · 22** |
| 불꽃냥 `imp_m_fire` | a flame catching: a burst + a whump with harmonics + embers + crack | - | 144 · -23.3 · 0.004 · 22 · 68 | **83 · -23.9 · 0.056 · 45 · 43** |
| 번개냥 `imp_m_storm` | the bolt lands: a hard snap + a draining triangle + a whump + a low body + a longer crackle | - | 106 · -22.7 · 0.011 · 52 · 45 | **104 · -23.5 · 0.092 · 68 · 45** |
| 얼음 여왕 `imp_m_frost` | unchanged (it already had the crack and the short fall); 2 dB softer | - | 81 · -17.7 · 0.073 · 96 · 51 | **78 · -21.7 · 0.093 · 96 · 50** |
| 우주냥 `imp_m_cosmo` | the vacuum lets go: a driven drop 420 to 120 Hz + a small sub + a rumble + a plop + crack | - | 227 · -18.4 · 0 · 13 · 107 | **135 · -21.1 · 0.076 · 72 · 64** |
| 방울냥 `imp_t_bell` | a small bell tapped: a bright tink (E6) with a bell's partials + the clapper's crack | - | 61 · -27.4 · 0 · 22 · 32 | **90 · -24.8 · 0.091 · 100 · 34** |
| 요리사냥 `imp_t_chef` | the frying pan clangs: a recorded pot + four pan partials + crack | `metalPot2` | 99 · -25.5 · 0.072 · 99 · 45 | **52 · -24.3 · 0.174 · 100 · 20** |
| 악사냥 `imp_t_bard` | one plink: two plucked strings + the string's slap (crack) + the lute's belly | - | 111 · -23.4 · 0.002 · 100 · 57 | **70 · -24.3 · 0.085 · 99 · 27** |
| 연금술사냥 `imp_t_alch` | a flask bursts: a wet burst + three bubbles + a short fizz + a plop + a glass tick + crack (was 212 ms) | - | 212 · -21.4 · 0.34 · 97 · 119 | **62 · -21.4 · 0.24 · 93 · 47** |
| 복고양이 `imp_t_lucky` | coins landing: four clinks 22 ms apart + a last coin settling + crack + a soft pat (was 131 ms, four clinks 30 ms apart) | - | 131 · -17.4 · 0.006 · 97 · 106 | **103 · -20.7 · 0.131 · 99 · 76** |

## Releases, layers, enemies, bosses

Releases (`atk_*`) in the same figures. A release is the lighter half of its pair: every one is under its landing now (the report holds it: at most 95 % of the landing's loudness), every class line still grows by rank.

| release | before | after | what changed |
|---|---|---|---|
| `atk_w_paw` | 74 · -29.8 · 0.164 · 81 · 38 | **73 · -28.2 · 0.24 · 76 · 42** | a bit stronger |
| `atk_w_sword` | 120 · -27.7 · 0.047 · 98 · 73 | **122 · -25.5 · 0.11 · 98 · 80** | lighter |
| `atk_w_viking` | 184 · -24 · 0.013 · 90 · 85 | **185 · -27.1 · 0.012 · 90 · 91** | lighter |
| `atk_w_samurai` | 79 · -20.8 · 0.707 · 95 · 32 | **77 · -23.8 · 0.569 · 95 · 34** | 5 dB lighter |
| `atk_w_tiger` | 195 · -21.5 · 0.005 · 68 · 59 | **193 · -24.8 · 0.002 · 66 · 61** | 3 dB lighter |
| `atk_r_sling` | 56 · -30.3 · 0 · 97 · 35 | **55 · -28.2 · 0.036 · 97 · 35** | a crack on the snap (bite 0 to 0.04), stronger |
| `atk_r_archer` | 146 · -25.2 · 0 · 23 · 79 | **108 · -26.6 · 0.035 · 100 · 71** | the twang is up at 330 Hz (the phone share 23 to 100 %), a crack on the nock, 38 ms shorter |
| `atk_r_ninja` | 83 · -23.8 · 0.325 · 100 · 40 | **82 · -24.8 · 0.248 · 100 · 42** | lighter |
| `atk_r_gunner` | 73 · -22.5 · 0.002 · 43 · 41 | **61 · -25.8 · 0.015 · 78 · 36** | a pop that a phone plays (43 to 78 %) |
| `atk_r_star` | 227 · -19.4 · 0.057 · 83 · 100 | **135 · -24.6 · 0.055 · 76 · 90** | shorter (227 to 135 ms), 5 dB lighter |
| `atk_m_snow` | 80 · -26.8 · 0.029 · 97 · 29 | **80 · -27.8 · 0.04 · 97 · 18** | unchanged but for 1 dB |
| `atk_m_fire` | 193 · -25.4 · 0.645 · 35 · 71 | **205 · -29.3 · 0.682 · 51 · 81** | a middle (35 to 51 %) |
| `atk_m_storm` | 101 · -21.3 · 0.558 · 100 · 44 | **102 · -23.3 · 0.537 · 100 · 49** | lighter |
| `atk_m_frost` | 136 · -21.2 · 0.155 · 100 · 64 | **158 · -23.8 · 0.154 · 100 · 61** | lighter |
| `atk_m_cosmo` | 219 · -21.2 · 0 · 28 · 22 | **216 · -24.9 · 0 · 49 · 57** | a driven sweep (28 to 49 %) |
| `atk_t_bell` | 165 · -25.9 · 0.018 · 100 · 78 | **157 · -27.2 · 0.018 · 100 · 72** | about the same |
| `atk_t_chef` | 80 · -25.1 · 0.015 · 100 · 12 | **84 · -26.7 · 0.015 · 100 · 16** | about the same |
| `atk_t_bard` | 237 · -24.4 · 0 · 100 · 186 | **237 · -28 · 0 · 100 · 186** | lighter |
| `atk_t_alch` | 139 · -19.9 · 0.151 · 100 · 89 | **138 · -24.3 · 0.151 · 100 · 85** | 4 dB lighter |
| `atk_t_lucky` | 212 · -18.4 · 0.007 · 100 · 89 | **122 · -23.5 · 0.007 · 100 · 58** | shorter (212 to 122 ms), 5 dB lighter |

The layers, the enemies' answers and the boss's cues:

| sound | before | after | what changed |
|---|---|---|---|
| `hit_heavy` | 87 · -21.3 · 0.001 · 16 · 39 | **84 · -22 · 0.07 · 52 · 31** | a drop through 320 to 120 Hz that a phone plays + the low body under it + a slap + a clack + a crack (was 84 % under 250 Hz) |
| `crit` | 76 · -23.8 · 0.034 · 43 · 31 | **55 · -21.2 · 0.111 · 48 · 28** | a crack at 4.3 kHz (the biggest of all: bite 0.11 against 0.03), a short ping, a body a phone plays; 2.6 dB louder than before |
| `explosion` | 221 · -18.5 · 0.089 · 27 · 113 | **178 · -21.5 · 0.058 · 57 · 70** | a driven drop for the weight + the crack + a shorter tail (221 to 178 ms) |
| `foe_juicy_hit` | 45 · -29.8 · 0.016 · 99 · 21 | **38 · -25.6 · 0.095 · 100 · 15** | a squish + a plop + the crunch of skin (a crack 2.6 kHz) |
| `foe_fluff_hit` | 64 · -26.7 · 0.002 · 54 · 22 | **65 · -25.3 · 0.004 · 58 · 15** | stays soft: no crack, a muffled pat |
| `foe_water_hit` | 48 · -28.7 · 0.001 · 100 · 22 | **45 · -25.7 · 0.017 · 100 · 29** | a "plip" (900 to 1500 Hz) and a second drop climbing out of it: 1.4 kHz |
| `foe_rubber_hit` | 62 · -27.1 · 0 · 100 · 30 | **59 · -23.9 · 0.407 · 100 · 35** | a boing and a squeak high up (2.4 to 3.6 kHz): 1.7 kHz |
| `foe_plastic_hit` | 22 · -32.9 · 0.001 · 100 · 10 | **28 · -26.9 · 0.202 · 99 · 14** | a hollow tok at 1.6 kHz + a crack (was a 22 ms tick that nobody heard: -33 LUFS) |
| `foe_tin_hit` | 67 · -26.4 · 0.009 · 100 · 36 | **61 · -23.8 · 0.099 · 100 · 27** | a tink (1.1 kHz) + a spring + a tick of the tin |
| `foe_motor_hit` | 59 · -30.5 · 0 · 59 · 18 | **58 · -25.7 · 0.036 · 71 · 16** | a bonk on the shell (500 Hz) + the motor hiccup + a tick |
| `foe_paper_hit` | 36 · -26.2 · 0.001 · 100 · 25 | **28 · -25.7 · 0.031 · 100 · 28** | a slap on a paper tube (a band around 2 kHz) + the crack of the paper |
| `foe_glass_hit` | 60 · -26.4 · 0.011 · 100 · 28 | **56 · -25.2 · 0.127 · 100 · 23** | a tink + a second tink a fifth up + the tick of the glass |
| `foe_cloud_hit` | 111 · -26.6 · 0 · 15 · 56 | **110 · -23.7 · 0.001 · 41 · 56** | a driven thud + a rumble: a phone plays 41 % (was 15 %) |
| `boss_warning` | 1225 · -15.5 · 0 · 27 · 157 | **1226 · -18.2 · 0 · 35 · 185** | 2.7 dB lower, a middle a phone plays (27 to 35 %); the fight bus and the music dip under it |
| `boss_roar` | 870 · -13.9 · 0 · 18 · 651 | **870 · -17.2 · 0 · 39 · 538** | 3.3 dB lower, a middle a phone plays (18 to 39 %); the fight bus and the music dip under it |

## The director (what the player's fight asks of the engine)

* `Volley` (`src/view/director/policy.ts`): the blows of one weapon that come within 0.12 s of each other are one shot: the first is heard in full, the second at 0.6, the third at 0.4, the rest
  not at all, and a blow that matters (a kill, a heavy hit, a crit) is never silent, it takes the last step. This is what keeps a piercing arrow from sounding once for every enemy it goes through;
  the star archer's landing was half of all the weapon sounds of a fight. (The enemy's answer to a blow follows the share of the blow it answers.)
* `Stage.playSpread`: the sounds of blows that land in the same instant start 11 ms apart (at most three gaps) instead of stacking into one louder blow; only a sound the rule lets through takes a place in the run.
* The sound of a blow, an enemy's answer, a death and a release is placed where it happens (`Stage.panOfField`, at most 0.6 to a side; a phone with one speaker hears no difference).
* `Stage.play` draws its little detune from `audioRandom()` (a seeded stream), so the same fight gives the same sounds.
* The rules of `createRules()` are unchanged: what was thinned before is thinned now (the shared pool of 9 starts in 0.3 s, the gaps). The numbers below are what the new sounds and the volley do inside them.

## The mix

* **Buses** (`src/audio/graph.ts`): `fightBus` (weapons, enemies, the layers of a blow, status cues) -> `fightDuck` -> `sfxBus`; `skillBus` (the skills' signatures and small sounds, the big moments, the stingers); `uiBus`
  (interface, rewards). All three go to `sfxBus` (the user's volume), then `master`, the limiter (the old compressor, unchanged) and a **ceiling** (`ceilingCurve`: a WaveShaper that leaves everything under 0.6 as it is
  and bends what is above it towards 0.944 = -0.5 dBFS, so that nothing the limiter's 3 ms attack lets through is ever a clip). `BUS_LEVEL` is 1.26 / 1 / 1 (the fight bus +2 dB: the hits are levelled by their loudness
  families, `CAT_TARGET`, and an ordinary second then sat 2 to 4 dB under where it was; see "unsure").
* **Hush** (`src/audio/hush.ts`): a recipe with `hush: { db, seconds }` takes the room: the fight bus dips by that much from the moment the sound starts (5 ms time constant, held, back in 85 ms x 3) and joins a dip
  that is still running (deeper floor wins, later end wins). Every signature of a skill (3 dB, 0.45 s; the tiger's roar 0.6 s), the awakening (4 dB, 0.9 s), `boss_warning` (2.5 dB), `boss_roar` (3 dB) and `boss_die` (3 dB).
  The same class drives the engine and the offline measurement (`tools/sfx/audit/mix_page.js`).
* **Music**: every one of those moments dips the music too (`duck`, 0.3 to 0.55 deep: 3 to 7 dB). The music's base level is unchanged (`MUSIC_BASE` 0.22: the owner has not answered the audit's question 3).
* **Voice limits per sound**: an impact sounds twice at most (was three), no closer than 50 ms (the star's 70 ms), and gets quieter the more of it there were in the last quarter second (`falloff` 0.18); the crit twice;
  a signature once or twice. The engine's global rules (24 voices, 10 fight voices, three buckets) are unchanged. `tests/audio-mix.test.ts` holds the table.
* **Variants in turn**: the engine takes the baked variants one after the other (the same one never twice in a row, from the very first play), the pitch and level spread are drawn from `random.ts`.

## Before and after, the busiest second of a 3x chapter

Five 3x chapters (the twelve skill cats and 8 to 13 helpers), recorded twice: **before** is the state this pass started from (old recipes, old mix, old director), **after** is the new director, recipes and mix. The bot picks cats by chance, so it is not the same second twice; the second table is the paired one: the *same* recorded calls of the five "before" runs replayed through the new engine and recipes (not the new director). All figures are offline renders through the engine's own limiter, buses, hush and duck; LUFS is K-weighted over the busiest 1 s; "peak" is after the limiter and the ceiling.

| run | busiest 1 s, SFX LUFS | peak after limiter (dBFS) | music in that second (dBFS) | limiter max reduction (dB) | voices at once (that second) | median second, SFX LUFS | top three by energy (after) |
|---|---|---|---|---|---|---|---|
| chapter 1 | -15.8 -> **-19.2** | -0.92 -> **-2.02** | -38 -> **-39.5** | 1.6 -> **0.6** | 20 -> **14** | -21.2 -> **-22.5** | sp_arrow_whoosh 19 %, sp_night_hush 10.4, sp_poster_slap 7.5 |
| chapter 3 | -17.4 -> **-19.8** | -2.02 -> **-2.6** | -38 -> **-44.6** | 1.7 -> **2.9** | 12 -> **15** | -21.3 -> **-23.1** | sp_meteor_boom 17.8, sp_meteor_ring 13.4, imp_r_star 10.1 |
| chapter 5 | -15.6 -> **-19.4** | -1.83 -> **-3.13** | -37.7 -> **-42.6** | 2.2 -> **1.9** | 18 -> **15** | -20.3 -> **-22.7** | boss_roar 19.4, sp_thunder_tick 9.1, sp_tiger_roar 8.7 |
| hard 5 | -15.7 -> **-18.6** | -1.76 -> **-2.89** | -37.9 -> **-40.9** | 1.5 -> **2.6** | 19 -> **16** | -20.8 -> **-22.4** | sp_arrow_whoosh 18.6, boss_warning 12.6, boss_roar 12.4 |
| hard 2 | -14.9 -> **-17.1** | -1.87 -> **-2.28** | -37.7 -> **-42.3** | 2.1 -> **2.4** | 17 -> **18** | -24.3 -> **-24.2** | sp_cutin 11.2, imp_r_star 6.9, sp_flask_pop 6 |
| **mean** | -15.9 -> **-18.8** | -1.7 -> **-2.6** | -37.9 -> **-42.0** | 1.8 -> **2.1** | 17.2 -> **15.6** | -21.6 -> **-23.0** | |

Paired (the same calls, the old engine against the new engine and recipes):

| run | busiest 1 s, SFX LUFS | peak after limiter | music in that second | median second, SFX LUFS |
|---|---|---|---|---|
| chapter 1 | -15.8 -> **-17.5** | -0.92 -> **-1.84** | -38 -> **-42.4** | -21.2 -> **-21.0** |
| chapter 3 | -17.4 -> **-19.0** | -2.02 -> **-1.84** | -38 -> **-43.1** | -21.3 -> **-21.4** |
| chapter 5 | -15.6 -> **-17.4** | -1.83 -> **-2.70** | -37.7 -> **-44.1** | -20.3 -> **-22.1** |
| hard 5 | -15.7 -> **-17.0** | -1.76 -> **-2.10** | -37.9 -> **-41.8** | -20.8 -> **-21.4** |
| hard 2 | -14.9 -> **-16.8** | -1.87 -> **-1.90** | -37.7 -> **-44.1** | -24.3 -> **-26.3** |
| **mean** | -15.9 -> **-17.5** | -1.7 -> **-2.1** | -37.9 -> **-43.1** | -21.6 -> **-22.4** |

* **Nothing clips, with room to spare**: 0 clipped samples in all fifteen renders (5 before, 5 paired, 5 after); the limiter takes off 0.6 to 2.9 dB, and the ceiling (-0.5 dBFS) is never reached (highest peak after it: -0.92 before, -1.84 to -2.02 after).
* **The busiest second is 3 LU quieter and its music is 4 dB lower** (the hush and the duck, plus the louder fight bus). About 1.6 LU of the drop is the engine and recipes alone (paired), the other 1.3 is the director (one shot = one blow and an echo, 11 ms spread, hits no longer stacking).
* **An ordinary second is about 1 LU quieter** (median second -21.6 -> -23.0; paired -22.4), the gap to the music went from 16.2 to 15.1 LU (paired 15.4). The fight bus was lifted 2 dB to keep it from dropping more; one number, `BUS_LEVEL.fight`.
* **Concurrency**: in the busiest second 17.2 -> 15.6 voices; over a whole run the maximum 19 to 21 -> 18 to 20 (cap 24); the engine passes 89.2 to 89.7 % of the calls (89 to 91 % before).
* **Who eats the second** (energy share): the star archer's `imp_r_star` went from 15 to 42 % to 6.8 to 10.1 %; the largest single share is now a skill signature or the boss (arrow whoosh 18.6 to 19, boss roar 19.4 in a boss wave, meteor boom 17.8).

## The board

`?scene=sounds`: 75 rows have "지금" and "새것" (`src/soundboard/next.ts`, made from the board's own rows so the cues cannot drift): every release and landing, the 20 pairs, the layers, the explosion, the 10 enemy answers, the boss's warning and cry. "지금" plays `old_<id>`, the old recipes
word for word under new names (`src/audio/sfx-before.ts`, 54 of them) and baked with the seed of the sound they were, so it is the sound the game played, grain for grain. They are `legacy` recipes: the game never plays them, they are not baked
ahead, belong to no family, check or budget, and a store build (`VITE_SOUNDBOARD=off`) leaves them out. **When the owner has chosen**: delete `sfx-before.ts`, the 54 ids from `LEGACY_SFX_IDS` in `api.ts`, `HIT_PASS_*` and the `old` side in `next.ts`
(the tests that name them go with them).

## How to measure (nothing is played)

Everything goes through muted headless Edge (`tools/edge/cdp.mjs` passes `--mute-audio`) and a Vite server of your own; never unmute, never play a sound on the speakers.

* One sound: `node tools/sfx/audit/sheet.mjs <name> --ids imp_w_sword,... [--variants all]` (a picture and a table: length, peak, loudness, centroid, attack, t20, bite, body, phone share) or the quality report in the page, `window.__dbg.audio.report()`
  (92 checks: now with the crack, the phone share, the fall time, the release under the landing and the enemy answers' bands).
* A fight: `node tools/sfx/audit/run_battle.mjs <name> <chapter> <level> 14000 <fillers> 300` records every audio call of a scripted 3x chapter (twelve skill cats on the board); `node tools/sfx/audit/mixall.mjs <name> ...` replays the recording through the
  engine's own limiter, buses, hush and music duck and renders the busiest second and a median one (`mix_page.js` now mirrors the engine: round robin, the seeded stream, the buses, the hush, the duck). Restart Vite after editing source: a module that is
  loaded twice makes `run_setup.js` hook the wrong `Stage`.
* The runs are **not** repeatable: the bot picks cats by chance, so two recordings of one chapter differ by 5 % in calls and by 2x in single sounds. Compare sums over the five runs, not single sounds.
* The scripts of this pass, all in `tools/sfx/audit/` (set `AUDIT_OUT=<folder>` for their output, `AUDIT_VITE` / `AUDIT_CDP` for the ports; all of them are muted headless Edge): `hits_measure.mjs <name> <ids>` (like `sheet.mjs`, in chunks with a timeout, a table of numbers; `--noimg` skips the pictures), `report.mjs [full|combat]` (the engine's quality report as JSON), `fix_lines.mjs <report.json> [--apply]` (fits the `db` of the class lines so the rank order holds), `board_check.mjs` (the sound board at 360 px: plays every "지금" and "새것" of the hit pass and looks for errors), `parse_mix.cjs` (the `mixall.mjs` text of the five runs into the tables above).

## Not done, unsure (the owner's ears close all of it)

1. **Nobody has heard any of it.** The numbers say each hit has a crack, a body a phone plays and a short fall; they cannot say it is pleasant. The things most likely to be wrong by ear:
   * the **crack** (16 ms of noise, a plateau) may read as a hiss ("tss") and not a tick ("tak") on some of the 20; its length and level are two numbers in `crack()` (`hitkit.ts`) and a `crack(...)` line in each recipe;
   * the **star archer's twinkle** may be too small now (a rising fifth of 71 ms, 5 dB softer than the old double ping) and, with the volley, at most three of them sound for one arrow;
   * the **recordings under the hits** (an axe, wooden knocks, steel, tin, a pot) may not fuse with the synthesis and be heard as two sounds: each is one `rec(...)` line with its own level, and the recipe is a whole sound without it;
   * the **enemies' answers** moved: water at 1.4 kHz, the rubber's squeak at 2.4 to 3.6 kHz (bite 0.4) may be shrill on a phone; dust and cloud stay soft on purpose;
   * the **boss's cry and drum roll** are 3 dB lower (and dip the fight and the music): they may now feel small next to a skill's signature;
   * **a release lighter than its landing** (3 to 6 dB lighter) may feel like weak shots;
   * the **ladder of a shot** (full, 0.6, 0.4, then nothing) is a rule of mine, not something a tester asked for.
2. **The fight bus is 2 dB up** (`BUS_LEVEL.fight` 1.26) because levelling the hits by what a blow needs left an ordinary second 2 to 4 dB under where it was. It is one number; the skills' signatures are untouched. Whether the whole game should be louder, and the **music** (still `MUSIC_BASE` 0.22: the audit's question 3 is open; the median second is 13.6 to 16.3 LU above it now, it was 13.5 to 17.6), are the owner's calls.
3. **The director's rules were left as they are** (the shared pool of 9 starts in 0.3 s and the gaps still refuse about 60 % of the weapon sounds a fight asks for); only the star archer's flood and the stacking of simultaneous blows were taken in hand. A rule that prefers a new kind or a higher priority over "who came first" (audit 10.2) is not done.
4. **The pan** of blows and deaths is new (at most 0.6 to a side). A phone with one speaker is unaffected; on headphones a fight is now stereo.
5. **Phones**: nothing was tried on a real phone or an iPhone (the 250 Hz model is an assumption: a phone's speaker rolls off between 250 and 400 Hz, differently on every phone). The first-tap fix was looked at in headless Edge with real touch events (see `sound_board.md`).
6. **Ten of the old ids that nothing plays** (`shoot_arrow`, ...: the owner's question 5) are still there; `hit_light` (a relic's hit) and `foe_*_die` were left alone; the stingers, the UI and the music were not touched.
7. The runs of the bot are not repeatable (±5 % calls, ±2x for single sounds). The busiest second is a different second in every run, so the "before" and "after" of the busiest second are two samples of five, not a paired comparison; the replay of the *same* recording through the old and the new mix (the "same calls" column) is the paired one.

## Files

| file | role |
|---|---|
| `src/audio/hitkit.ts` | the kit of a hit: `crack`, `thud`, `tap`, `ring`, `rec`, and the names of the recordings |
| `src/audio/sfx-impacts.ts` (new) | the 20 landings `imp_*`; `sfx-cats.ts` keeps the 20 releases and the `swing()` / `impact()` helpers (the voice rule of an impact: 2 voices, 50 ms, `falloff` 0.18) |
| `src/audio/sfx-combat.ts` | `hit_heavy`, `crit`, `explosion`, `boss_warning`, `boss_roar`, `boss_die` (hush and music duck) ; `sfx-foes.ts` the ten answers ; `sfx-battle.ts` the awakening's hush ; `sfx-skills.ts` the signatures' hush, the roar's and the cut-in's trim |
| `src/audio/sfx-before.ts` (new) | the old recipes as `old_<id>` (54), `legacy`, for the board's "지금" |
| `src/audio/hush.ts`, `random.ts` (new) | the dip of the fight bus; the seeded stream of chance |
| `src/audio/graph.ts`, `envelopes.ts` | the three buses, `BUS_LEVEL`, the ceiling after the limiter (`ceilingCurve`) |
| `src/audio/engine.ts` | buses per sound, the hush, the variants in turn, the seeded spread, `wake()` on touchend / click, `seed()` |
| `src/audio/recipe.ts`, `bake.ts`, `bank.ts`, `sounds.ts`, `api.ts` | `Recipe.hush`, `Recipe.seed`, `Recipe.legacy`; the old versions outside the bank's budget and out of a store build; `LEGACY_SFX_IDS`, `GAME_SFX_IDS`, `isLegacySfx` |
| `src/audio/analysis.ts`, `report.ts` | `biteFrac`, `phoneFrac`, `fallMs` and seven new checks (92 in all, `failing: []`) |
| `src/view/director/policy.ts`, `stage.ts`, `combat.ts`, `deaths.ts` | `Volley`; `playSpread`, `panOfField`, `direct(pan, delay)`, the seeded detune; the blows, answers, releases and deaths |
| `src/soundboard/next.ts`, `catalog.ts` | the 75 before / after rows; the descriptions of the changed rows |
| `tools/sfx/audit/mix_page.js`, `tools/sfx/ship.mjs` | the offline mixer now mirrors the engine; the seven new recordings in the ledger |
| `src/assets/sfx/` + `docs/licenses/sounds.md` | 29 files (555 KB), seven new: `impactWood_light_000`, `impactWood_light_002`, `impactWood_medium_000`, `impactMetal_medium_000`, `impactMetal_medium_004` (impact-sounds), `chop`, `metalPot2` (rpg-audio); all CC0 (Kenney) |
| `tests/audio-mix.test.ts` (new, 34), `tests/view.director.hitSound.test.ts` (new, 10), `tests/audio-engine.test.ts` (+11), `tests/audio-bank.test.ts` (+1), `tests/soundboard.*` (+4), `tests/audio-recipes.test.ts` / `audio-combat.test.ts` | the hush, the ceiling, the buses, the voice limits, the levels, the seeded stream, a hit's crack and body, the recordings and the ledger; the engine on a fake context (buses, hush, variants in turn, seeds, limits); the volley, the spread, the pan; the legacy outside the budget; the before / after rows |

## Landing review (2026-10-19): what was changed afterwards

A fourth agent looked at all of it with fresh eyes (`docs/qa/sound_audit_2026-10-18.md`, section 14). No click at a start or an end, nothing harsh in what repeats (at most 7.3 % of the energy above 6 kHz), nothing that can clip (184 sounds started in the same instant at volume 4 through the real graph: -1.04 dBFS after the ceiling, +32 dBFS without the limiter), the report still `failing: []` (92 checks). Three changes to the figures above:

| sound | before the review | now | why |
|---|---|---|---|
| `imp_m_snow` | 74 ms · -23.3 · bite 0.23 · phone share 55 % · centroid 645 Hz | 69 ms · -23.2 · bite 0.31 · phone share 92 % · centroid 1.3 kHz; 250 Hz and under 45 % -> 7 %, over 4 kHz 3 -> 5.6 % | nearest pair of the new hits to `imp_m_fire` (fingerprint distance 4.2): both were a low whump with a crack. The snow is a powder "pof" now (the low-pass opens at 1.9 kHz, a lighter pat, a fine 95 Hz crunch at 1.9 kHz); the fire keeps the deep whump and the slow embers. Distance 8.1 |
| `imp_m_cosmo` | -20.6 (the top rank of the mage line 1.6 dB under the frost queen) | -18.6 (`db` -0.4 -> 1.6) | K-weighted loudest 100 ms; a phone plays its low drop worse still |
| `sp_clone_hop` (the skills' file) | like `sp_stomp` (distance 3.4) | a light 880 -> 640 Hz "tip" and a leaf, nearest sound at 9.5 | see `skill_sounds.md` |

What the review did not touch and the owner may want to decide by ear: the volley ladder 1 / 0.6 / 0.4 (a stack of the same cat may sound thin), `coin` (2.9 a second, 185 ms: an old sound), the music level (13 to 16 LU under the effects in an ordinary second), the rubber and water answers (squeak at 2.4 to 3.6 kHz), and `imp_w_samurai` against `imp_t_bell` (fingerprint distance 1.09 against a minimum of 1.0: both are a bright tink).
