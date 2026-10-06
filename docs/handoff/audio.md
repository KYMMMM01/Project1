# Audio module hand-off (`src/audio`)

Every sound is synthesised with WebAudio at runtime: no audio files. SFX and stingers are rendered once
by `OfflineAudioContext` into mono `AudioBuffer`s (on first use, plus idle slices after unlock); music is
live-synthesised by a look-ahead sequencer. `src/audio/api.ts` is untouched (frozen contract, 70 SFX ids,
4 music ids, 6 stingers).

**2026-10-07 re-voicing.** The sounds were written for the old dark, glossy, neon "candy" look. The game is now cut
paper on a wooden floor with matte sticker cats, so every sound was re-voiced as a material: paper, felt, wood,
rubber stamp, stickers, mallets (marimba, kalimba) and plucked strings (ukulele, upright bass). No id, no API and no
recipe file changed its name; there is no raw saw or square wave, no laser sweep, no long shimmering reverb and no
casino sparkle left in any SFX, stinger or track. Numbers below were measured offline in the browser (section 3).

## 1. What exists

| file | role |
|---|---|
| `index.ts` | `export * from './api'`, `export const audio: AudioApi`, `audioStats()` for dev HUDs |
| `engine.ts` | `AudioEngine`: lifecycle (unlock, visibility, iOS watchdog), buses, voice pool, play/playStep/music/stinger/duck, per-sound `climb` and `duck`, `dispose()` |
| `graph.ts` | `sfxBus -> master`, `musicBus -> musicLpf -> duckGain -> master`, reverb return, `master -> muteGain -> DynamicsCompressor (limiter) -> destination` |
| `sounds.ts` | catalogue: `ALL: Record<SfxId, Recipe>` (a missing id is a compile error), voice rule per family, prerender order |
| `recipe.ts` | the families (`Cat`), `CAT_TARGET`, the `Recipe` shape and **the material kit** (`paper`, `whoosh`, `puff`, `knock`, `stamp`, `pop`, `mallet`, `kalimba`, `pluck`, `shake`, `bell`, `thump`, `tick`) |
| `sfx-ui.ts`, `sfx-combat.ts`, `sfx-battle.ts` | the recipes (`satisfies Partial<Record<SfxId, Recipe>>`); `sfx-battle.ts` holds the 12 battle verbs |
| `stingers.ts` | 6 stinger recipes, `STINGER_DUCK`, `STINGER_MUFFLE` (defeat sweeps the music low-pass to 400 Hz) |
| `families.ts` | **new**: the 11 sound families and what each must measure (duration, attack, centroid window, energy under 200 Hz and over 4 kHz); drives the report and a unit test |
| `synth.ts` | oscillator/noise/filter/echo/reverb toolkit shared by SFX, stingers and music; `nodeStats` counts the nodes tracked synths keep alive |
| `bake.ts`, `bank.ts` | offline render + loudness normalisation + tail trim; lazy/idle bank, failed-bake memory |
| `voices.ts` | pure `VoiceLimiter` (per-id cap, min gap, density falloff, global cap 24) and `VoiceBudget` (music, 11 soft / 12 hard) |
| `sequencer.ts`, `scores.ts`, `instruments.ts`, `music.ts` | step clock, the 3 x 16-bar scores (unchanged), **the acoustic-combo instruments (rewritten)**, `MusicPlayer` |
| `envelopes.ts`, `theory.ts`, `analysis.ts` | pure maths (ADSR, duck plan, cross-fade curves, pentatonic ladder + `stepRatio`, FFT/loudness/modulation/**attack time**) |
| `report.ts`, `devtools.ts` | machine-checkable quality report (47 checks), music/mix/**loop-seam** renders, `window.__dbg.audio` hooks (debug builds only) |
| `src/demo/AudioDemo.ts` | `?demo=audio`: grid of all 70 SFX, music, intensity, stingers, playStep ladder, volume, stress (x1 and **x3 = speed 3**), HUD with node counts |
| `tests/audio*.test.ts` | 4 files: pure maths, every recipe, family partition and material rules, music scores, the engine against a recording WebAudio fake |

## 2. Consumer API

```ts
import { audio, SFX_IDS, type SfxId, type MusicId, type StingerId, type PlayOpts, audioStats } from '@/audio';

audio.init(): void                                  // once at boot (BootScene does); idempotent
audio.unlocked: boolean                             // context is running
audio.play(id: SfxId, opts?: { volume?, pitch?, pan?, delay? }): void
audio.playStep(id: SfxId, step: number, opts?): void // major-pentatonic ladder, 0 = base, 5 = +octave, capped +24 semitones (or the sound's own `climb`)
audio.music(id: 'none'|'home'|'battle'|'boss', fadeSeconds = 0.8): void
audio.setIntensity(v: number): void                 // 0..1, battle layers
audio.stinger(id: 'victory'|'defeat'|'boss_intro'|'mythic'|'level_up'|'jackpot'): void
audio.duck(depth: number, seconds: number): void    // music bus only
audio.setSfxVolume(v) / setMusicVolume(v) / setMuted(muted: boolean)   // muted nests (counter)
```

Contract details a caller should know (unchanged unless marked **new**):

* **Before unlock / hidden / muted.** One-shots (`play`, `playStep`, `stinger`, `duck`) are dropped silently. State calls are
  remembered and applied when audio can run: `music()`, `setIntensity()`, volumes and mute. Hidden tab = context suspended + music scheduler paused.
* **Unlock.** `resume()` is called synchronously inside the gesture, a 1-sample silent buffer is touched, `navigator.audioSession.type = 'playback'`,
  a hanging `resume()` is abandoned after 1.5 s, a frozen clock triggers suspend/resume and then one context rebuild.
* **Music transitions.** A track change enters on the next beat of the outgoing track (at most 0.7 s wait) and cross-fades equal-power; `'none'` and a
  first start do not wait. Intensity changes apply on the next bar line (a layer gain starts moving exactly on the downbeat) with a 0.45 s time constant.
* **Stingers** duck the music (`STINGER_DUCK` plus the phrase length); `defeat` also muffles it to 400 Hz.
* **New: the awakening dips the music by itself.** A recipe may carry `duck: { depth, seconds }`; the engine applies it whenever that sound starts
  (`awaken`: 0.55 for 1.3 s). Overlapping ducks merge (deeper floor, later end).
* **New: `playStep` honours `Recipe.climb`.** Noise-based ticks turn shrill when a ladder lifts them two octaves, so `coin` climbs at most 14 semitones,
  `gem` and `card_flip` and `reel_tick` and `enemy_die` 12, `star` 19. Everything else keeps the +24 semitone cap (`stepRatio` in `theory.ts`).
* **Voices.** Per-id max voices, min re-trigger gap and density falloff (volume = 1 / (1 + falloff * starts in the last 250 ms)), global cap 24 active
  (32 pooled nodes); a rejected voice is dropped. Repeating ids rotate 2 to 3 baked variants (never the same twice in a row) with +-2.5 to 8 % playback-rate
  and +-1 dB jitter (`Recipe.variants`, `Recipe.rate`; **new: ui_click, ui_back, ui_tab, ui_toggle, crit, zap and splash joined the list**).
* **Pan.** `PlayOpts.pan` is honoured (equal-power `StereoPannerNode` on the pooled voice, mono buffers). **No caller passes one yet**, see section 8.
* **First use of a sound that is still baking** plays as soon as the bake finishes (dropped after 0.3 s for frequent ids; a `big` sound or stinger waits up to 2 s).
  A failed bake falls back to live synthesis for that id (live synthesis ignores `pitch`).
* **Rapid summons:** at 4+ summons per second the director plays `summon_common` instead of rare/epic; the limiter also thins `summon_common/rare`.
* Dev: `audioStats()` returns bake count, KB, live voices, bus gains, `musicLpfHz`, `wantedTrack`, music counters and **new `nodes`**
  (`pooledVoices`, `sfxSources`, `musicLive`, `musicPeak`, `musicCreated`). In debug builds `window.__dbg.audio` has `report()`, `music(track, intensity, seconds)`,
  `seam(track, rate)`, `mix('battle'|'big')`, `wave(key, variant, half)`, `stats()`, `resetStats()` and `api` (the engine).

## 3. Measuring (the harness)

`window.__dbg.audio.report()` bakes every SFX and stinger exactly like the runtime (OfflineAudioContext, 48 kHz, mono, all variants) and measures, per
sound: duration (audible, -50 dB), peak, RMS and 200 ms loudness RMS, DC, click safety at both ends, **attack time** (10 % to 90 % of the first note's own
peak, `analysis.ts attackTime`), spectral centroid, the centroid above 300 Hz, the energy shares under 200 Hz ("weight", what a phone speaker cannot play) and
over 4 kHz ("sparkle", what tires the ear), AM rate and depth (purr), decoded KB, whether it clipped or was truncated. It then runs 47 checks: 36 design checks
(summon ladder, each family's material, loudness order, stingers) and one check per family from `families.ts`. In the Aside runner:

```
tools/aside_run.sh "await openGame('?demo=audio'); const r = await ev(async () => (await window.__dbg.audio.report())); console.log(r.failing, r.table); await done();"
```

The browser is the only place real DSP numbers exist (node has no `OfflineAudioContext`); the unit tests check the structure the numbers come from (recipes
fit their render length, no saw/square waves, family partition, ladders). Because I cannot listen, these numbers are the judge:

* **Paper tap** (ui_click, ui_back, pickup): at most 90 ms, attack at most 4 ms, no pitched sustain, centroid 300-1800 Hz, under 30 % of energy below 200 Hz.
* **Stamp** (reward_claim): a dull thud under a paper slap: 10-50 % of the energy under 200 Hz, attack under 6 ms.
* **Sticker pop** (star): pitched (centroid 400-900 Hz, i.e. D5), attack under 4 ms, 116 ms.
* Nothing in the game has more than 5 % of its energy above 4 kHz (`maxHigh` of every family) and nothing clips (largest peak 0.933, `awaken`).

### Family targets (`families.ts`) and result

| family | members | max ms | attack ms | centroid Hz | <200 Hz | >4 kHz |
|---|---|--:|--:|---|--:|--:|
| paper tap | ui_click ui_back pickup | 90 | 4 | 300-1800 | 0.30 | 0.08 |
| paper slide | ui_tab ui_popup_open ui_popup_close place card_flip | 125 | 40 | 300-1800 | 0.30 | 0.10 |
| wood knock | ui_toggle ui_error reel_tick reel_stop countdown_tick danger_alarm hazard_warn | 330 | 4 | 150-1600 | 0.60 | 0.05 |
| sticker and tine | ui_confirm coin gem star sell | 420 | 8 | 400-1800 | 0.05 | 0.05 |
| stamp and claim | reward_claim level_up purchase upgrade merge merge_big coin_many relic_pick wave_clear | 900 | 6 | 500-1800 | 0.35 | 0.05 |
| summon ladder | summon_common ... summon_mythic | 1300 | 4 | 500-1500 | 0.30 | 0.05 |
| shot | the 7 shoot_* | 200 | 20 | 200-2000 | 0.30 | 0.08 |
| hit | hit_light hit_heavy crit enemy_die zap laser_off | 340 | 4 | 180-1500 | 0.30 | 0.05 |
| status and verb | freeze stun buff heal weaken molt shield_break laser_on splash sunbeam wave_start call_wave whoosh chest_shake gamble_fail | 700 | 50 | 250-1800 | 0.30 | 0.08 |
| low drum | boss_warning boss_roar boss_die explosion purr | 1450 | 50 | 100-900 | 0.90 | 0.05 |
| fanfare | awaken chest_open jackpot and the 6 stingers | 1800 | 100 | 150-1700 | 0.70 | 0.05 |

**Result: `failing: []`, 47 of 47 checks pass, no clipping, nothing silent, no DC over 0.0002, nothing starting or ending on a click.**
Before (previous report): 12 sounds had more than 5 % of their energy over 4 kHz (shield_break 26 %, card_flip 11 %, shoot_claw 12 %, summon_mythic 12 %...); now none do (mean share 2.1 % to 0.5 %).
Mean centroid 1065 Hz to 827 Hz. Decoded bank 7.90 MB to **7.02 MB** at 48 kHz (6.45 MB at 44.1 kHz), all variants, mono.

### Every sound, after (and the old duration / centroid in brackets)

`ms` audible duration, `loud RMS` the 200 ms integrated level (short sounds are peak-limited, so their RMS reads low by design), `<200 Hz` / `>4 kHz` energy shares,
`attack` first-note rise time, KB decoded for all variants. Stingers are the last six rows.

| id | family | var | ms (was) | peak | loud RMS | centroid Hz (was) | <200 Hz | >4 kHz | attack ms | KB |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| ui_click | paper tap | 2 | 28 (50) | 0.200 | 0.0126 | 552 (658) | 0.01 | 0.03 | 1.0 | 13 |
| ui_back | paper tap | 2 | 38 (72) | 0.200 | 0.0160 | 369 (345) | 0.10 | 0.01 | 1.0 | 16 |
| ui_tab | paper slide | 2 | 89 (56) | 0.200 | 0.0165 | 1117 (1230) | 0.05 | 0.05 | 10.5 | 36 |
| ui_toggle | wood knock | 1 | 34 (55) | 0.153 | 0.0340 | 770 (906) | 0.00 | 0.00 | 1.0 | 8 |
| ui_popup_open | paper slide | 1 | 100 (95) | 0.200 | 0.0226 | 708 (921) | 0.06 | 0.02 | 22.0 | 20 |
| ui_popup_close | paper slide | 1 | 69 (73) | 0.200 | 0.0248 | 549 (646) | 0.13 | 0.02 | 11.0 | 14 |
| ui_error | wood knock | 1 | 98 (109) | 0.200 | 0.0235 | 250 (208) | 0.10 | 0.00 | 1.0 | 20 |
| ui_confirm | sticker and tine | 1 | 108 (100) | 0.200 | 0.0333 | 985 (1717) | 0.00 | 0.01 | 0.0 | 21 |
| coin | sticker and tine | 3 | 179 (197) | 0.174 | 0.0380 | 783 (1510) | 0.00 | 0.00 | 1.0 | 104 |
| coin_many | stamp and claim | 1 | 524 (726) | 0.401 | 0.0783 | 1460 (2289) | 0.00 | 0.01 | 1.0 | 99 |
| gem | sticker and tine | 1 | 272 (431) | 0.190 | 0.0396 | 1334 (1832) | 0.00 | 0.00 | 0.0 | 52 |
| reward_claim | stamp and claim | 1 | 352 (436) | 0.429 | 0.0752 | 833 (1431) | 0.23 | 0.00 | 3.0 | 67 |
| level_up | stamp and claim | 1 | 853 (701) | 0.411 | 0.0842 | 906 (1111) | 0.02 | 0.00 | 3.0 | 161 |
| star | sticker and tine | 1 | 116 (299) | 0.214 | 0.0380 | 572 (2122) | 0.00 | 0.00 | 1.0 | 23 |
| purchase | stamp and claim | 1 | 383 (414) | 0.367 | 0.0763 | 1560 (1555) | 0.07 | 0.01 | 3.0 | 73 |
| summon_common | summon ladder | 1 | 96 (104) | 0.240 | 0.0375 | 643 (488) | 0.00 | 0.00 | 1.0 | 19 |
| summon_rare | summon ladder | 1 | 398 (363) | 0.283 | 0.0621 | 961 (1198) | 0.00 | 0.00 | 1.0 | 76 |
| summon_epic | summon ladder | 1 | 598 (732) | 0.378 | 0.0784 | 1177 (1439) | 0.00 | 0.01 | 1.0 | 113 |
| summon_legendary | summon ladder | 1 | 836 (1341) | 0.446 | 0.0939 | 966 (1528) | 0.18 | 0.01 | 1.0 | 157 |
| summon_mythic | summon ladder | 1 | 1186 (1583) | 0.533 | 0.1179 | 1072 (1805) | 0.19 | 0.01 | 0.0 | 223 |
| merge | stamp and claim | 1 | 391 (412) | 0.347 | 0.0625 | 845 (819) | 0.00 | 0.00 | 1.0 | 74 |
| merge_big | stamp and claim | 1 | 606 (848) | 0.316 | 0.0752 | 791 (671) | 0.02 | 0.00 | 3.0 | 115 |
| sell | sticker and tine | 1 | 199 (147) | 0.214 | 0.0439 | 1118 (1266) | 0.00 | 0.01 | 7.0 | 38 |
| upgrade | stamp and claim | 1 | 557 (573) | 0.409 | 0.0752 | 635 (1332) | 0.01 | 0.00 | 3.0 | 106 |
| place | paper slide | 1 | 80 (67) | 0.200 | 0.0215 | 367 (319) | 0.03 | 0.00 | 14.0 | 16 |
| pickup | paper tap | 1 | 44 (60) | 0.200 | 0.0212 | 740 (1080) | 0.00 | 0.01 | 3.0 | 10 |
| shoot_arrow | shot | 2 | 52 (64) | 0.200 | 0.0261 | 1337 (679) | 0.00 | 0.02 | 3.0 | 22 |
| shoot_magic | shot | 2 | 113 (135) | 0.183 | 0.0280 | 710 (797) | 0.00 | 0.00 | 1.5 | 45 |
| shoot_cannon | shot | 2 | 83 (121) | 0.247 | 0.0396 | 243 (199) | 0.19 | 0.00 | 1.5 | 33 |
| shoot_ice | shot | 2 | 66 (84) | 0.200 | 0.0212 | 1786 (2376) | 0.00 | 0.00 | 1.0 | 27 |
| shoot_lightning | shot | 2 | 58 (100) | 0.200 | 0.0168 | 1002 (1349) | 0.00 | 0.02 | 2.5 | 24 |
| shoot_poison | shot | 2 | 119 (119) | 0.154 | 0.0280 | 394 (394) | 0.00 | 0.00 | 1.0 | 47 |
| shoot_claw | shot | 2 | 104 (99) | 0.200 | 0.0279 | 1447 (2429) | 0.02 | 0.03 | 15.0 | 41 |
| hit_light | hit | 3 | 32 (47) | 0.260 | 0.0229 | 329 (411) | 0.00 | 0.00 | 0.0 | 21 |
| hit_heavy | hit | 2 | 85 (109) | 0.323 | 0.0539 | 253 (240) | 0.14 | 0.00 | 1.5 | 33 |
| crit | hit | 2 | 47 (185) | 0.367 | 0.0427 | 1170 (1920) | 0.00 | 0.00 | 1.0 | 20 |
| explosion | low drum | 2 | 255 (584) | 0.565 | 0.0830 | 607 (858) | 0.56 | 0.02 | 4.5 | 92 |
| freeze | status and verb | 1 | 319 (377) | 0.160 | 0.0413 | 884 (2009) | 0.00 | 0.00 | 0.0 | 61 |
| stun | status and verb | 1 | 369 (354) | 0.283 | 0.0354 | 984 (971) | 0.00 | 0.00 | 1.0 | 70 |
| buff | status and verb | 1 | 436 (517) | 0.188 | 0.0440 | 956 (1215) | 0.00 | 0.00 | 34.0 | 83 |
| heal | status and verb | 1 | 462 (550) | 0.157 | 0.0411 | 1036 (946) | 0.00 | 0.00 | 47.0 | 87 |
| enemy_die | hit | 3 | 109 (160) | 0.311 | 0.0480 | 502 (446) | 0.00 | 0.01 | 1.7 | 63 |
| boss_warning | low drum | 1 | 1234 (1095) | 0.496 | 0.0746 | 191 (385) | 0.66 | 0.00 | 1.0 | 232 |
| boss_roar | low drum | 1 | 880 (1111) | 0.420 | 0.1029 | 201 (303) | 0.44 | 0.00 | 4.0 | 166 |
| boss_die | low drum | 1 | 1066 (1348) | 0.698 | 0.1177 | 356 (939) | 0.67 | 0.00 | 4.0 | 201 |
| wave_start | status and verb | 1 | 378 (444) | 0.239 | 0.0493 | 546 (425) | 0.03 | 0.00 | 5.0 | 72 |
| wave_clear | stamp and claim | 1 | 607 (639) | 0.337 | 0.0751 | 902 (826) | 0.00 | 0.00 | 1.0 | 115 |
| danger_alarm | wood knock | 1 | 206 (266) | 0.283 | 0.0407 | 274 (641) | 0.42 | 0.00 | 1.0 | 39 |
| countdown_tick | wood knock | 1 | 34 (43) | 0.224 | 0.0194 | 1195 (1320) | 0.00 | 0.00 | 0.0 | 8 |
| whoosh | status and verb | 1 | 198 (270) | 0.166 | 0.0316 | 1174 (869) | 0.00 | 0.03 | 12.0 | 38 |
| relic_pick | stamp and claim | 1 | 520 (684) | 0.395 | 0.0762 | 1448 (1118) | 0.00 | 0.01 | 0.0 | 98 |
| chest_shake | status and verb | 1 | 344 (339) | 0.252 | 0.0368 | 315 (494) | 0.03 | 0.00 | 0.0 | 66 |
| chest_open | fanfare | 1 | 995 (1154) | 0.367 | 0.0729 | 722 (1301) | 0.09 | 0.00 | 36.0 | 188 |
| card_flip | paper slide | 1 | 97 (92) | 0.200 | 0.0214 | 914 (1370) | 0.00 | 0.03 | 14.0 | 19 |
| reel_tick | wood knock | 1 | 23 (43) | 0.200 | 0.0137 | 1343 (1486) | 0.00 | 0.00 | 0.0 | 6 |
| reel_stop | wood knock | 1 | 60 (76) | 0.252 | 0.0275 | 257 (322) | 0.08 | 0.00 | 1.0 | 12 |
| jackpot | fanfare | 1 | 1040 (1237) | 0.487 | 0.0927 | 1328 (1394) | 0.04 | 0.00 | 1.0 | 196 |
| gamble_fail | status and verb | 1 | 598 (604) | 0.265 | 0.0439 | 565 (328) | 0.05 | 0.00 | 1.0 | 113 |
| laser_on | status and verb | 1 | 271 (274) | 0.183 | 0.0398 | 1581 (1015) | 0.00 | 0.01 | 0.0 | 52 |
| laser_off | hit | 1 | 89 (71) | 0.169 | 0.0270 | 840 (1076) | 0.00 | 0.00 | 0.0 | 18 |
| molt | status and verb | 1 | 497 (527) | 0.218 | 0.0440 | 928 (987) | 0.05 | 0.00 | 34.0 | 94 |
| purr | low drum | 1 | 464 (464) | 0.123 | 0.0350 | 129 (164) | 0.88 | 0.00 | 10.0 | 88 |
| awaken | fanfare | 1 | 1285 (1371) | 0.933 | 0.1211 | 794 (1298) | 0.05 | 0.00 | 47.0 | 242 |
| call_wave | status and verb | 1 | 506 (425) | 0.318 | 0.0335 | 709 (1463) | 0.02 | 0.00 | 3.0 | 96 |
| sunbeam | status and verb | 1 | 577 (694) | 0.151 | 0.0407 | 665 (704) | 0.00 | 0.00 | 30.0 | 109 |
| hazard_warn | wood knock | 1 | 174 (163) | 0.283 | 0.0373 | 1176 (1264) | 0.00 | 0.00 | 1.0 | 34 |
| splash | status and verb | 2 | 411 (410) | 0.263 | 0.0439 | 941 (1013) | 0.02 | 0.00 | 1.5 | 153 |
| zap | hit | 3 | 72 (86) | 0.252 | 0.0257 | 873 (1465) | 0.01 | 0.01 | 1.0 | 43 |
| weaken | status and verb | 1 | 456 (454) | 0.125 | 0.0396 | 383 (500) | 0.00 | 0.00 | 16.0 | 86 |
| shield_break | status and verb | 2 | 310 (413) | 0.280 | 0.0495 | 1470 (2404) | 0.00 | 0.00 | 0.0 | 118 |
| stinger:victory | fanfare | 1 | 1378 (1578) | 0.740 | 0.0895 | 748 (950) | 0.10 | 0.00 | 0.0 | 259 |
| stinger:defeat | fanfare | 1 | 1777 (1583) | 0.451 | 0.0850 | 501 (568) | 0.11 | 0.00 | 0.0 | 334 |
| stinger:boss_intro | fanfare | 1 | 1695 (1693) | 0.660 | 0.0821 | 175 (222) | 0.63 | 0.00 | 3.0 | 319 |
| stinger:mythic | fanfare | 1 | 1599 (1555) | 0.454 | 0.0875 | 1460 (776) | 0.14 | 0.01 | 0.0 | 301 |
| stinger:level_up | fanfare | 1 | 1179 (1027) | 0.588 | 0.0787 | 845 (1262) | 0.01 | 0.00 | 3.0 | 222 |
| stinger:jackpot | fanfare | 1 | 1484 (1577) | 0.576 | 0.1214 | 1485 (1175) | 0.04 | 0.00 | 1.0 | 279 |

## 4. The map: what plays when, and what it was and is

"Rate" is how often it can fire; the director's `SoundRule` (battle) and the engine's `VoiceLimiter` (every id) thin it further.

### UI

| id | trigger / rate | was | is |
|---|---|---|---|
| ui_click | every `Button` press (default), chips, HUD buttons; a few per second | sine bloop 760 to 430 Hz + octave ghost + tick | a paper grain (2.2 kHz band) over a felt pat (320 to 210 Hz); 2 variants, +-3 % pitch; 28 ms, attack 1 ms |
| ui_back | `IconButton` back / close, deselecting a cat in battle | lower bloop + triangle | grain at 1.5 kHz, slower deeper pat; 38 ms |
| ui_tab | tab switches, chapter chip, speed toggle (0.5), info toasts (0.6), **now also swapping two cats (0.8)** | rising B5 to D6 blip | a page turning: rising swish, falling swish (a double slide), settling pat; 89 ms |
| ui_toggle | switches; slider ticks (0.35, pitch 0.9 to 1.4) | tick + pip | one wooden knock at 900 Hz; 34 ms |
| ui_popup_open / close | every `Popup`; **now also the info bubble (0.35)** | noise whoosh + sine glide + chime | a sheet slides in (pink swish 600 to 2200 Hz) and lands with a pat and an edge tap / slides away lighter; 100 / 69 ms |
| ui_error | 27 refusal sites; disabled buttons (0.5); warning toasts (0.6); **now every refused field command (0.5)** | two buzzes: square + saw at 155 Hz | a double wooden knock (300 then 250 Hz, lighter); 98 ms, centroid 250 Hz, never a buzzer |
| ui_confirm | settings tick, shop, backup | C6 to G6 blips | two kalimba tines up a fifth (E5, B5); 108 ms |

### Rewards

| id | trigger / rate | was | is |
|---|---|---|---|
| coin, gem | counting up and flying currency (director `coinTick`: up to 25/s; `claim.ts` every 3rd arrival), reward tiles; dozens in a row, laddered by `playStep` | B5 to E6 triangle blips + sparkle; gem a glass FM bell in an echo | coin = one kalimba tine (G5) + wooden tick, 3 variants, climb 14; gem = small hand bell (E6) in a 55 ms room, climb 12 |
| coin_many | lucky cat's coin rain (at most one per 3 s), result, claim | 9 blips + metallic hiss + bell | 8-note kalimba run that speeds up, a wooden rattle (2.4 kHz band), a hand bell; 524 ms |
| reward_claim | claim buttons (`claimFx`, shop, backup, result) | "ba-DING": thump, blip, bell, sparkles | **a rubber stamp** (dull thud, paper slap 18 ms behind) and one kalimba ding; 352 ms |
| star | **now the reward-sticker pop** (see section 5), `Decor` stars, shooting-star relic; ladders | B6 glass twinkle + shivering D7 | **a sticker pop**: a sine gliding up a minor third in 22 ms to D5 with a peel tick; climb 19; 116 ms |
| level_up | result level-up, snack-stick merge, upgrade of the summon level, revive, rescue | fast C-E-G blips + ringing C6 + bell | stamp, a rising C-E-G marimba figure, a long C6; 853 ms |
| purchase | shop purchase | cash register: blips + coin-rattle + bell | a receipt stamped, a kalimba tine, a small hand bell; 383 ms |
| sell | selling a cat (0.8) | two dings + hiss | a paper slip torn off + two coins on wood; 199 ms |
| upgrade | class synergy step-up (`playStep(tier)`), class chip, unit upgrade | rising glide + blip + bell + sparkle | light stamp, a ukulele strum G-B-D, a marimba G; 557 ms |
| relic_pick | choosing a toy (3 call sites) | two FM bells + glide + shimmer | a sticker pop, a marimba fifth climbing out of it, a bell, a puff of paper; 520 ms |
| wave_clear | act clear, boss defeated banner | three blips + chime chord + sparkles | marimba triad rolled up, a long C6, a small bell, a shake; 607 ms |
| chest_shake | chest reveal | five knocks + high jingle | five wooden knocks between two pitches + a rattle of pebbles (2.2 kHz band); 344 ms |
| chest_open | chest reveal, result chest | saw creak, thump, chime bloom, 8 sparkles | lid creak (triangle through a rising formant), pop and slap, a puff of confetti, a marimba arpeggio, a kalimba tine; 995 ms |
| card_flip | chest and result card flips (ladder, 0.6) | high noise swish + tick | swish, tap, a soft D5 tick so a row of flips climbs the scale; climb 12; 97 ms |
| reel_tick, reel_stop | `CurrencyPill` count-up (0.5, ladder), shop reel | sine ticks | wooden ticks / a felt thunk with a knock; 23 / 60 ms |

### Battle

| id | trigger / rate | was | is |
|---|---|---|---|
| summon_common to mythic | every summon; the button can fire 4+/s (the director sends `summon_common` when rapid) | pop, then rising riser + saw chord + bell sparkles, mythic 1.58 s with a supersaw hall | **one instrument family, richer each rank**: common = sticker pop (96 ms); rare + two kalimba tines (398); epic + marimba triad, bell, confetti (598); legendary + a low felt thump, a five-step marimba climb, kalimba cascade, bell, shaker (836); mythic + deep thump, seven-step run, a roll on C6, kalimba shower, two bells, shaker (1186). Length, peak, loudness, weight and brightness all climb (checked) |
| merge | every merge of rank 0-1 (`playStep`, chain ladder **plus rank**) | falling suck-in + C5 pop + G5 bell | a pop where the cats meet, then a ukulele pair rising E5 to A5; **each rank lands one step higher** |
| merge_big | merge of rank 2+ | longer suck-in with sub, thump, chime chord, sparkles | a stamp, a rolled marimba triad C-E-G-C, a kalimba tine, a puff of confetti; 606 ms |
| place | moving a cat (0.5) | thud + puff + tick | a short swish, the landing pat and an edge tap; 80 ms |
| pickup | picking a cat up, selecting one (0.5) | rising blip | a sticker peeled off: rising swish with a small pop; 44 ms |
| shoot_arrow, claw, magic, cannon, ice, lightning, poison | every attack, one per unit per 60 ms, director limit 10/s (`stage.rules.shoot`) | whip, saw swipe, sine pew with vibrato, boom, FM glass, saw zap, bubbles | a paper dart; a paw swipe that lands with a felt pat; a fizz-pop (bubble + noise chopped at 45 Hz); a cardboard-tube popper; a tiny wind-chime tink; cellophane crackle; bubbles (unchanged). All 50-120 ms, low-passed at 5 kHz, 2 variants, +-4-6 % pitch |
| hit_light | every plain hit, director limit 16/s | pat 520 to 260 Hz + 2.2 kHz noise | **a soft thwack**: pat 400 to 250 Hz + a 1.5 kHz paper grain; 32 ms, 3 variants |
| hit_heavy | hits of 8 % max HP or on big enemies; strikes | pat + saturated drop + noise + click | **a paper punch**: pat 280 to 110 Hz, a low-passed slap that closes, a flat snap; 85 ms |
| crit | every crit | thump + crack + A6 bell | **the same thwack, brighter and louder**: pat 480 Hz, grain at 2.8 kHz, a wooden tok on top; 47 ms |
| zap | **magic hits (new, 0.5)**, lightning hazard, storm strike, cosmo zone | saw arc + crackle + thump | **a fizz**: cellophane crackle chopped at 90 Hz, a soft sine pop rising a fourth, a felt pat; 72 ms, 3 variants |
| enemy_die | every kill (kill ladder, 0.55), elite (0.84 pitch) | noise puff + sine drop | a paper ball crumpled and popped: crackle chopped at 60 Hz + a soft pop 440 to 170 Hz; 109 ms, 3 variants, climb 12 |
| explosion | splash shots (0.35), boss death blasts | fireball: falling low-pass, brown rumble, 95 Hz sub | a paper bag popped: closing low-pass burst, short whump, 220 Hz drop, confetti flutter; 255 ms, 56 % under 200 Hz (was 73 %) |
| freeze, stun | status cues (0.7, 0.6), slow | three FM glass notes; bonk + three tweets | three kalimba tines falling D6-A5-E5 + frost hush; a wooden bonk + three dizzy mallet notes |
| buff | **now boss "vaccinate" (0.6)**; was never played | saw swell + blips | a ukulele strum rising C-E-G + a marimba triad; 436 ms |
| heal | enemy heal ticks (0.3, once per 0.9 s per enemy) | vibrato glide + harp trill + shimmer | a warm sine glide up a fifth + a kalimba trill; 462 ms |
| laser_on, laser_off | laser pointer on / off | 620 to 2100 Hz pew with vibrato and twinkles; mirror | a switch tick + two marimba notes climbing D6-A6; a tick + one note sagging A5 to E5; 271 / 89 ms |
| molt, purr | molt; purr currency flight (0.5) | soft cloud + chimes; flutter on saws | soft cloud + two kalimba tines G5-D6; flutter on **triangles** (25.4 Hz measured, 88 % under 200 Hz) |
| wave_start, call_wave | wave start (0.65); call next wave (player) | saw horn; saw brass "ta-TAA" | two marimba notes G4-D5 with a low thump and a brush; **ta-TAA**: a short then a longer higher marimba stab with a stamp and a bell (506 ms) |
| sunbeam | sunbeams move (0.5) | open C-G-E stack, 0.5 s reverb, 0.4 echo | the same warm swell with a 0.2-feedback echo and no reverb; 577 ms |
| hazard_warn | hazard warning (0.7; zap pitch 1.2) | two triangle + square ticks, minor third | **two clear wooden knocks a fourth apart** (A5, D6), pitch held; 174 ms |
| splash, weaken, shield_break | wet hazard, boss splash, alchemist zone; weakened cat; armour / shield break (status pitch 1.5) | slap + plop + spray + bubbles; saw wah; FM glass shatter | the same water with a softer spray; a triangle "wuh" deflating 480 to 230 Hz; a paper shield tearing: crack, knock, eight wooden pings, a marimba body (310 ms) |
| boss_warning | boss (0.9) / elite (0.55) wave warning | saw siren C5 / G4 three times | **a low mallet roll**: nine felt hits that speed up and swell + a wooden knock on each, one deep hit; no siren; 1234 ms |
| boss_roar | boss spawn, enrage, tiger stomp (pitch 1.5), boss death opening (pitch 0.62) | detuned saw growl through formant filters | a big drum hit, a low upright note sagging 262 to 196 Hz with a slow vibrato, a rumble and a rustle of paper; 880 ms |
| boss_die | boss death | falling blast + 3 secondary blasts + saw sink | **a cardboard tower collapsing**: a felt thud, a crumple that closes down, nine wooden knocks falling in pitch, a last soft thump; 1066 ms |
| danger_alarm | danger heartbeat (the director spaces it by danger level), danger rising | two triangle beeps | **a heartbeat knocked on wood**: "lub-dub", the second lighter; 206 ms |
| countdown_tick | overflow countdown, one per second, pitch rises 18 % per second | sine + tick at E6 | one wooden knock at E6; 34 ms |
| whoosh | call next wave, boss inhale / whirl, zone end, pre-run, chest, relic screen; ladder | noise + tone glide | a sheet of paper passing: pink noise through a slow rising band; 198 ms |
| awaken | each awakening (0.9) | noise + saw riser, glissando, saw chord, bell cascade, twinkles; 1371 ms, peak 0.785 | **a short proud fanfare**: a mallet roll up C major, then at 0.4 s the stamp, a full marimba chord over a low plucked C, a hand bell and a "ta-daa" G5 to C6; **1285 ms**, peak 0.933, loudness 0.121 (+0.5 dB over the big target); dips the music itself |

### Flow, gacha and the rest

`jackpot` (SFX) and `gamble_fail` are defined but never played: the game has no gamble, and the jackpot fanfare is the stinger. Both were re-voiced (a confetti-cannon run and a kind two-note "oh no")
so the demo grid stays honest. All other ids have at least one caller (`buff` got its first this round).

### Stingers

| id | trigger | was | is |
|---|---|---|---|
| victory | win (director, boss finale, result) | brass fanfare, timpani, cymbal wash, 9 sparkles | **a warm little tune in C**: a marimba climb G-C-E-G lands at 0.5 s on the stamp and a full chord over a low plucked C, a kalimba tune E-D-C above, a shake and confetti; 1378 ms, centroid 748 Hz |
| defeat | loss | triangle sigh + pad + low-passed noise | **a gentle falling phrase**: three soft marimba notes E5 D5 B4 over a warm triangle bed and a low plucked E; no tremolo; 1777 ms, 11 % under 200 Hz; the music still muffles to 400 Hz |
| boss_intro | (defined; the director uses `boss_warning` + the boss track) | saw pad, riser, blast, brass chord | a low mallet roll that speeds up, two cold bell tings, one huge hit with a low pluck and a D-minor marimba chord; 1695 ms |
| mythic | awakening impact (0.3 s after the awaken sound starts) | the whole summon fantasy | **the halo**: awaken already strikes the chord, so this has no attack of its own: a quiet C6/G5 marimba roll, a held low C, bells and kalimba tines in the C pentatonic set; 1599 ms, -3 dB |
| level_up | unit perk unlock, rescue | brass climb + chord | stamp, marimba climb C-E-G, a held C6 chord, bells; 1179 ms |
| jackpot | legendary chest | 8-note run + 32 coin blips + supersaw chord | a confetti cannon: marimba run, 20 kalimba tines falling, stamp, rolled hand bells; 1484 ms |

## 5. Gaps found and wired

Ordered by what the player would notice. Each is one line (plus its import when the file had none).

| gap | edit |
|---|---|
| magic and physical hits shared `hit_light` | `src/view/director/combat.ts:178`: `e.type === 'magic' ? 'zap' : 'hit_light'` (id only) |
| every merge rank sounded the same (only the chain count climbed) | `src/view/director/growth.ts:102`: `step + tier` (pitch of the pentatonic step; the rank lands one step higher) |
| swap and move shared one sound (a third apart) | `src/view/director/growth.ts:226`: swap plays `ui_tab` (the double slide) at 0.8 instead of `place` at pitch 1.26 |
| reward stickers popped on with the claim stamp | `src/ui/RewardPopup.ts:70` and `src/screens/shop/rewards.ts:37`: `sfxFor` returns `star` (sticker pop) instead of `reward_claim` (the stamp stays on the Claim button) |
| refused field commands (a cat shakes its head) were silent | `src/view/field/units.ts:275` (+ import at :2): `audio.play('ui_error', { volume: 0.5 })` inside `refuse()`, which both the refused event and the failed drop reach |
| the info bubble (haptic only) was silent | `src/ui/Tooltip.ts:82` (+ import at :2): `audio.play('ui_popup_open', { volume: 0.35 })` |
| burn, poison and bleed showed particles but made no sound | `src/view/director/palette.ts:119-121` (`STATUS_SFX`): `zap` at 0.7 pitch (a low fizz), `shoot_poison` at 0.9, `shoot_claw` at 0.8; the existing 0.6 s per-enemy gate and `rules.status` ration them |
| `buff` was never played; a boss vaccinating its allies played `heal` | `src/view/director/boss.ts:128`: `stage.direct('buff', 0.6, 0.9)` |

Not wired because the API is frozen or the call is not a one-liner: result-screen music (section 8), per-sound stereo placement.

## 6. Mix

**Loudness families** (`CAT_TARGET`, baked into every buffer; peak / RMS target, `trim` in dB orders sounds inside a family). Reordered: it used to be ui < reward < combat < big.

| family | peak | RMS | who |
|---|--:|--:|---|
| ui | 0.20 | 0.034 | every `ui_*`, place, pickup, card_flip, reel_tick, reel_stop, countdown_tick, purr |
| fire | 0.20 | 0.028 | the 7 shots (quietest texture) |
| tick | 0.24 | 0.038 | coin, gem, star, summon_common: made to be heard in dozens |
| hit | 0.26 | 0.034 | hit_light, hit_heavy (+4 dB), crit (+3), enemy_die (+3), laser_off |
| combat | 0.40 | 0.062 | merge, sell, status cues, wave verbs, hazards, danger_alarm, summon_rare, explosion (+3) |
| reward | 0.46 | 0.075 | claim, level_up, purchase, upgrade, merge_big, coin_many, wave_clear, relic_pick, summon_epic |
| big | 0.70 | 0.115 | summon_legendary (-2) and mythic, awaken (+2.5), boss sounds, chest_open, jackpot |
| stinger | 0.74 | 0.12 | the six stingers |

* **Music sits under everything**: `MUSIC_BASE` 0.22 and a per-track level. Full-intensity music measured RMS 0.041 (was 0.050-0.071): 2 to 4.8 dB quieter than before.
  It is ducked 0.5-0.75 under stingers (`STINGER_DUCK`), by the director's `DUCK_BY_TIER` under big summons, and **by 0.55 for 1.3 s under the awakening** (new).
* **Voice cap and rate limits.** Global cap 24 active (32 pooled), per-id `maxVoices` 1-6 and `minGap` 0.03-0.5 s, density falloff on every repeating family (fire 0.15, hit 0.18-0.2,
  tick 0.12, summon 0.25). Unchanged numbers except the new `tick` family default (4 voices, 40 ms, 0.12).
* **Variation.** Variants rotate without repeating; `rate` jitter 2.5-8 % and +-1 dB on every id heard many times per second; the director adds its own +-5 % detune and the kill and merge ladders.
* **Settings.** `setSfxVolume` / `setMusicVolume` use the v^1.5 taper, `setMuted` nests, a hidden tab suspends the context and pauses the scheduler: all unchanged and covered by the engine tests.
* **Stereo** by screen position is supported by the engine (`pan`, equal-power on mono voices). No caller passes one yet.
* **Worst-case pile-ups through the limiter** (offline, 6 s / 5 s): the battle mix (16 hits/s + 4 deaths/s + 8 shots/s + 5 coins/s + blasts over full-intensity battle music):
  peak 0.728 with the limiter (was 0.823), pumping 1.9 dB (was 2.6), no voice dropped. "Everything big at once" (mythic + merge_big + boss_die + boss_roar + jackpot + legendary + awaken over the battle mix):
  peak 0.916 with the limiter (0.993 without, would clip), pumping 3.7 dB (was 4.6).

### Nodes and voices (the engine's own counters, Aside tab)

| situation | SFX pool (gain + panner each) | live SFX sources | SFX active (cap 24) | music nodes live (peak) | skipped steps |
|---|--:|--:|--:|--:|--:|
| `?demo=audio`, before (just unlocked, nothing played) | 0 | 0 | 0 | 0 | 0 |
| after all 70 ids + ladder + 6 stingers + 6 tracks | 6 | 0 | 0 (peak 6) | 40 (146 while two tracks cross-fade) | 0 |
| battle music at intensity 1, idle | 0 | 0 | 0 | 93 (96) | 0 |
| crowded wave x1: 463 sounds in 12 s | 7 | 5 | 5 (peak 7) | 59 (108) | 0 |
| **crowded wave at speed 3**: 865 sounds in 12 s (48 hits/s, 12 deaths/s, 24 shots/s, 15 coins/s, a blast every 0.7 s) | **12** | 8 | 8 (peak **13**) | 87 (108) | 0 |
| home scene, 60 s (home track) | 0 | 0 | 0 | 70-121 (121) | 0 |

At speed 3 the engine carries about 12 pooled voices (24 nodes) + 8 sources + 108 music nodes + the fixed graph (9 nodes and the convolver) = **about 150 nodes** and thins the stream itself (527 minimum-gap drops in 12 s, no per-id or global drops).
Music created 1843 nodes in 12 s; each ends and is disconnected when its voice ends (`nodeStats.live` swings between about 40 and 120 as bars start and end and never climbs). No page errors in any run; the home run (60 s) and the demo run left no growth in baked memory (6854 KB, 76 of 76 sounds, flat).
The scene-driven battle (`?scene=battle&chapter=1&seed=7&sandbox=1&runs=5`, 16 cats, x1 then x3, 100 s) ran with `PAGE_ERRORS []`, battle music running, 0 skipped steps and 0 shed notes
(the headless tab renders about 1-2 frames per second, so the fight itself produced few sounds: 35 in 100 s; the density numbers above come from driving the engine on a wall-clock timer instead).

## 7. Music

Scores (notes, form, keys, tempos, layer thresholds) did not change; the instruments did. Home 96 BPM C major, battle 128 BPM G major (the dominant of C: the adjacent key, so the cross-fade from home
shares six of seven notes), boss 142 BPM D minor. A 16-bar form each; `tests/audio-scores.test.ts` still proves key, register and polyphony.

| instrument | was | is |
|---|---|---|
| kick | saturated sine drop 130-165 Hz, click | felt-beater thud 140 to 65 Hz, light saturation, no click (level 0.3-0.55 of before) |
| snare | highpassed noise (500 Hz) + band at 2.4 kHz, saturated in the boss | a brush on a cardboard box: noise band at 1.8 / 1.5 kHz + a wooden triangle body |
| hat, open hat | noise high-passed at 8 / 7 / 9 kHz | paper shaker: noise band at 5.4 / 4.8 / 6 kHz with a 6 ms swell |
| crash | noise high-passed at 4.8 kHz + 8.5 kHz peak | a bell tree in the track's key (G major pentatonic / D minor) under a swell of paper |
| tom | sine 157 to 98 Hz | felt mallet on a wooden box an octave higher, with a woody tick |
| rim | noise + triangle | claves: a 1.1 kHz wooden tok |
| bass | home sine + triangle; battle saw (low-pass 1.1 kHz) + sine; boss saw palm-mute + sine | upright: a soft sine with light saturation, its octave, a mid-range finger tick; boss adds a muted triangle |
| chord (home) | Rhodes: FM sine "bark" + tine | **ukulele strum**: nylon triangle plucks 12 ms apart with a closing low-pass |
| pad | detuned saws, low-passed 0.85 to 1.5 kHz | slow triangles a few cents apart, same filters, quieter |
| arp | triangle (home, boss), square + triangle (battle) | nylon pluck (home, battle); high kalimba tines for the boss's tension ticks |
| lead | home music-box sine; battle saw + square + vibrato; boss saw unison saturated | **marimba** (fundamental + 4th partial + felt knock); battle and boss add a quiet nylon pluck under it; no vibrato, no saturation |
| lead2 (battle octave) | sine + triangle | kalimba tines |
| stab (boss) | saw chords through a closing low-pass | pizzicato: muted nylon plucks |

Measured (offline, real graph with limiter, 10 s, 48 kHz):

| track | peak (was) | RMS (was) | centroid Hz (was) | <200 Hz (was) | overlap | shed |
|---|--:|--:|--:|--:|--:|--:|
| home | 0.287 (0.260) | 0.0408 (0.0517) | 240 (202) | 0.58 (0.74) | 6 | 0 |
| battle, intensity 0 (bass, kick, shaker only) | 0.178 (0.289) | 0.0237 (0.0504) | 174 (182) | 0.82 (0.79) | 4 | 0 |
| battle, intensity 0.4 | 0.265 (0.319) | 0.0293 (0.0517) | 277 (206) | 0.57 (0.74) | 8 | 0 |
| battle, intensity 1 | 0.417 (0.431) | 0.0410 (0.0603) | 513 (470) | 0.32 (0.55) | 12 | 3 |
| boss | 0.435 (0.410) | 0.0412 (0.0714) | 265 (309) | 0.62 (0.59) | 12 | 0 |

The stripped bed (intensity 0) is deliberately sparse and low; the layers add the ukulele counter-line and pad (layer 1), the marimba hook and the brush snare (layer 2) and the kalimba octave hook, open shaker, toms and bell-tree crashes (layer 3).
Rhythm and counter-melody, not drive: a full battle is 4.8 dB louder than its bed, and the share of energy under 200 Hz falls from 0.82 to 0.32.

**Loops and layer entries.** The loop point is measured with `window.__dbg.audio.seam(track, rate)`: one loop plus two seconds rendered, then the deepest 50 ms level dip within +-0.75 s of the loop point
compared with the worst such dip at any other bar line (dB under the local mean): home 8.1 against 16.4, battle 12.9 against 15.6, boss 15.9 against 14.1 (1.8 dB worse than its worst bar line, the fill into the loop). So the loop is no more of a
hole than any bar line. Layer changes start on a downbeat: `MusicPlayer.applyIntensity` runs at step 0 of a bar and `LayerMixer` only schedules a layer once its gain has moved (`tests/audio-engine.test.ts` "applies an intensity change on the next bar line").
A track change still enters on the outgoing track's next beat (at most 0.7 s) and cross-fades equal-power.

## 8. Verification, gaps and requests

* `npx tsc --noEmit`: nothing in `src/` or `tests/`. `npx vitest run`: 65 files, 1507 tests pass (audio: 4 files, 346 tests: pure maths, every recipe, the family partition, the material rules (no saw or square, FM index), the
  battle verbs and material vocabulary, scores, the engine incl. the awakening duck and the node counters).
* Browser (Aside, dev server): `report()` 76 sounds, **47/47 checks, `failing: []`**; `?demo=audio`: all 70 ids, an 11-step ladder, 6 stingers and 6 track/intensity changes ran with `PAGE_ERRORS []`, 76/76 baked (6854 KB),
  0 per-id and 0 global drops, 0 skipped music steps; the sandbox battle (100 s, x1 then x3) and the home scene (60 s) ran with `PAGE_ERRORS []`.
* **Known gaps.**
  1. **No result music.** `MusicId` has no `result`, so the result screen is silent after the victory / defeat stinger (the director silences the battle track); adding it needs `api.ts` (frozen) and one `audio.music('result')` call in `ResultScreen`. Until then the stinger is the result music.
  2. **No stereo placement yet.** The engine pans; `stage.play` / `stage.playStep` in `src/view/director/stage.ts` do not take a position. A follow-up for the director owner: pass `pan: clamp((x - 360) / 360, -0.6, 0.6)` for shots, hits and deaths.
  3. `jackpot` (SFX) and `gamble_fail` are never played (see section 4); `boss_intro` (stinger) is never played either, the director uses `boss_warning` and the boss track.
  4. Still from before: the context is not re-created when the output sample rate changes after a Bluetooth switch; the first play of a big sound before the idle prerender reaches it is late by its bake time; live synthesis (no `OfflineAudioContext`) ignores `pitch`.
  5. The sound of the swap (`ui_tab`) and of the awakening (`awaken` at t=0 and the `mythic` halo at about 0.3 s) were designed from the numbers; they are the first things to judge by ear.
* **A human with ears should check first, in this order:**
  1. Phone speaker, UI: `ui_click` / `ui_back` / `ui_tab` (28-89 ms, centroids 369-1117 Hz): audible and pleasant, not thin? Then `ui_error`: a refusal and not another tap?
  2. The stamp: `reward_claim`, `level_up`, `merge_big` (150 Hz thud with a paper slap): is the thud felt on a phone, and does the stamp read as "claimed"?
  3. A crowded wave at speed 3 under the battle track: `hit_light` thwack, `zap` fizz for magic, `enemy_die` crumple, the shots. A texture, or a ticking?
  4. The awakening: `awaken` lands at 0.4 s and the `mythic` stinger enters about 0.3 s after the cut-in starts: one fanfare, or two chords fighting?
  5. Boss: `boss_warning` roll (no siren: does it still say "danger"?), `boss_roar`, `boss_die` collapse.
  6. Music: home (ukulele + marimba), then battle layers 0 to 3 and the boss track. Is the bass thick enough on a phone with the new upright, is the boss too tame without saws, do the layer entries land on the bar?
  7. Reward lists: `star` (sticker pop) climbing the pentatonic scale next to `coin` and `gem` ladders; `playStep` caps (coin 14, gem 12).
  8. The swap: `ui_tab` as a double slide against `place` for a plain move.
  9. Burn / poison / bleed cues (0.2-0.3 volume): useful or noise?
* Optional requests (unchanged): `setDanger(level)` in `api.ts` for the low-HP state (the graph already has the `musicLpf` node it would drive); a way to duck the SFX bus too for a "silence beat" before legendary reveals.
