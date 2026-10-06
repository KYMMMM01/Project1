# Audio module hand-off (`src/audio`)

Every sound is synthesised with WebAudio at runtime: no audio files. SFX and stingers are rendered once
by `OfflineAudioContext` into mono `AudioBuffer`s (on first use, plus idle slices after unlock); music is
live-synthesised by a look-ahead sequencer. `src/audio/api.ts` is untouched (frozen contract, 70 SFX ids
including the twelve new battle verbs).

## What exists

| file | role |
|---|---|
| `index.ts` | `export * from './api'`, `export const audio: AudioApi`, `audioStats()` for dev HUDs |
| `engine.ts` | `AudioEngine`: lifecycle (unlock, visibility, iOS watchdog), buses, voice pool, play/music/stinger/duck, `dispose()` |
| `graph.ts` | `sfxBus -> master`, `musicBus -> musicLpf -> duckGain -> master`, reverb return, `master -> muteGain -> DynamicsCompressor (limiter) -> destination` |
| `sounds.ts` | catalogue: `ALL: Record<SfxId, Recipe>` (a missing id is a compile error), voice rules per tier, prerender order |
| `sfx-ui.ts`, `sfx-combat.ts`, `sfx-battle.ts` | the recipes (`satisfies Partial<Record<SfxId, Recipe>>`, merged exhaustively in `sounds.ts`); `sfx-battle.ts` is new (12 ids) |
| `stingers.ts` | 6 stinger recipes, `STINGER_DUCK`, `STINGER_MUFFLE` (defeat sweeps the music low-pass to 400 Hz) |
| `recipe.ts`, `synth.ts` | recipe vocabulary and the oscillator/noise/filter/echo/reverb toolkit shared by SFX, stingers and music |
| `bake.ts`, `bank.ts` | offline render + loudness normalisation + tail trim; lazy/idle bank, failed-bake memory |
| `voices.ts` | pure `VoiceLimiter` (per-id cap, min gap, density falloff, global cap 24) and `VoiceBudget` (music, 11 soft / 12 hard) |
| `sequencer.ts`, `scores.ts`, `instruments.ts`, `music.ts` | step clock (`nextBoundary`), the 3 x 16-bar scores, instrument voices, `MusicPlayer` |
| `envelopes.ts`, `theory.ts`, `analysis.ts` | pure maths (ADSR, duck plan, cross-fade curves, pentatonic ladder, FFT/loudness/`modulation`) |
| `report.ts`, `devtools.ts` | machine-checkable quality report, music/mix renders, `window.__dbg.audio` hooks (debug builds only) |
| `src/demo/AudioDemo.ts` | `?demo=audio`: grid of all 70 SFX (teal block = the new verbs), music, intensity, stingers, playStep ladder, volume, stress |
| `tests/audio*.test.ts` | 333 tests: pure maths, every recipe, music scores, and the engine against a recording WebAudio fake |

## Consumer API

```ts
import { audio, SFX_IDS, type SfxId, type MusicId, type StingerId, type PlayOpts, audioStats } from '@/audio';

audio.init(): void                                  // once at boot (BootScene does); idempotent
audio.unlocked: boolean                             // context is running
audio.play(id: SfxId, opts?: { volume?, pitch?, pan?, delay? }): void
audio.playStep(id: SfxId, step: number, opts?): void // major-pentatonic ladder, 0 = base, 5 = +octave, capped +24 semitones
audio.music(id: 'none'|'home'|'battle'|'boss', fadeSeconds = 0.8): void
audio.setIntensity(v: number): void                 // 0..1, battle layers
audio.stinger(id: 'victory'|'defeat'|'boss_intro'|'mythic'|'level_up'|'jackpot'): void
audio.duck(depth: number, seconds: number): void    // music bus only
audio.setSfxVolume(v) / setMusicVolume(v) / setMuted(muted: boolean)   // muted nests (counter)
```

Contract details a caller should know:

* **Before unlock / hidden / muted.** One-shots (`play`, `playStep`, `stinger`, `duck`) are dropped silently. State
  calls are remembered and applied when audio can run: `music()`, `setIntensity()`, volumes and mute. So
  `audio.music('home')` at boot is fine: it starts on the first tap. `audioStats().wantedTrack` shows the pending request.
* **Unlock.** `resume()` is called synchronously inside pointerdown/pointerup/touchend/click/keydown while the context is
  not running (iOS), a 1-sample silent buffer is touched inside the gesture, `navigator.audioSession.type = 'playback'`
  is set before the context exists, a hanging `resume()` is abandoned after 1.5 s, and a frozen clock after returning
  from the background triggers suspend/resume and then one context rebuild.
* **Music transitions.** A track change enters on the next beat of the outgoing track (at most 0.7 s wait) and
  cross-fades equal-power; `'none'` and a first start do not wait. Intensity changes apply on the next bar line
  (<= 1.9 s at 128 BPM) with a 0.45 s time constant (a ~1.8 s fade), so a new layer enters on a downbeat.
* **Stingers** duck the music (`STINGER_DUCK`, plus the phrase length); `defeat` also muffles it to 400 Hz (1.2 s in, 0.8 s out).
* **Ducks** dip in ~75 ms and recover over 0.5 to 1.2 s; overlapping ducks merge (deeper floor, later end).
* **Voices.** Per-id max voices, min re-trigger gap and density falloff (volume = 1 / (1 + falloff * starts in the last
  250 ms)), global cap 24 active (32 pooled nodes); a rejected voice is dropped. Frequent ids rotate 2 to 3 baked variants
  (never the same twice in a row) with +-4 to 8 % playback-rate and +-1 dB jitter.
* **First use of a sound that is still baking** plays as soon as the bake finishes: dropped after 0.3 s for frequent
  ids, but a `big` sound or stinger waits up to 2 s (measured on a slow software-rendered tab: purr 44 ms,
  shield_break 64 ms, mythic stinger 247 ms, awaken 338 ms, summon_mythic 388 ms). Idle prerender bakes one sound per slice
  (ui/reward/fire/hit/combat first, big/stingers last): a few seconds after unlock when the page has idle time, at worst about 19 s
  (250 ms idle timeout x 76 sounds) under a saturated main thread.
  A failed bake falls back to live synthesis for that id.
* **Rapid summons (guide 2.2.1):** at 4+ summons per second play `summon_common` instead of rare/epic; the limiter
  already thins `summon_common/rare` (80 ms gap, 4 voices, density falloff).
* **Guide 5.1 "silence beat"** before a legendary reveal: `audio.duck(1, 0.25)` silences the music; SFX are not ducked.
* Dev: `audioStats()` returns bake count, KB, live voices, bus gains, `musicLpfHz`, `wantedTrack`, music counters.
  In debug builds `window.__dbg.audio` has `report()`, `music(track, intensity, seconds)`, `mix('battle'|'big')`,
  `wave(key, variant, half)`, `stats()`, `resetStats()` and `api` (the engine).

## The twelve new battle verbs (`sfx-battle.ts`)

Each recipe carries a comment explaining why its layers and numbers give the character. Measured rows are in the table below.

| id | design | measured |
|---|---|---|
| `laser_on` | sine glide 620->2100 Hz with 22 Hz vibrato (a laser dot wobbling), triangle ghost, switch tick, G7/C8 twinkles in a short echo | 274 ms, centroid 1.0 kHz |
| `laser_off` | mirror image: sine 1500->520 Hz, triangle ghost, dull tick | 71 ms |
| `molt` | pink-noise poof with a 35 ms attack through a closing low-pass (fluff = no transient), soft body, G5 -> D6 chimes | 527 ms, 0.2 % above 4 kHz |
| `purr` | every layer chopped by one 25 Hz flutter: detuned saw 98 Hz (low-passed), triangle 196 Hz, band-passed pink noise rasp; `ui` tier, 1 voice | 464 ms, AM measured 25.4 Hz (index 0.6), 78 % of energy under 200 Hz, peak 0.145 |
| `awaken` | noise+saw riser, 8-note C-major glissando C4..E6 rolling up, lands at 0.4 s on a detuned saw chord + sub thump + noise burst, bell cascade, twinkles, fluttering air | 1371 ms, loudest SFX (peak 0.785, loudness 0.135, +2.0 dB over the mythic stinger) |
| `call_wave` | bright saw brass "ta-TAA" (G major), low-pass blats open to 7 kHz in 50 ms, lightly saturated, breath noise, bell ping | 425 ms, centroid 1.46 kHz (3.4x the warm `wave_start` horn) |
| `sunbeam` | open C-G-E sine stack with 35 ms attacks, slow vibrato, drifting air, long damped echo, late B6 twinkle | 694 ms, centroid 0.7 kHz |
| `hazard_warn` | two 70 ms ticks B5 -> D6 (minor third up): triangle + thin square + octave pip + woodblock tick | 163 ms (danger_alarm is 266) |
| `splash` | pink slap with a rising band-pass, sine plop, spray, seven rising bubble glides; 2 variants | 410 ms |
| `zap` | 20 ms high-passed snap, saw 1700->200 Hz through a resonant band-pass chopped at 70 Hz, crackle chopped at 110 Hz, thump; 2 variants | 86 ms, bright part at 2.0 kHz |
| `weaken` | saw+triangle gliding 480->230 Hz with +-70 cent vibrato and a 7.5 Hz wobble, resonant low-pass drooping 2.4 kHz -> 420 Hz | 454 ms, centroid 0.5 kHz |
| `shield_break` | high-passed crack + knock, 14 inharmonic FM glass pings 1.6 to 5.4 kHz spread over 0.3 s, mid bell, 45 Hz rattle; 2 variants | 413 ms, 26 % above 4 kHz |

## Verification

* `npx tsc --noEmit`: zero errors (whole project at the time of the last run, not only my paths).
* `npx vitest run tests/audio`: 4 files, 333 tests pass (audio 40, scores 17, recipes 254, engine 22). The engine tests drive the
  real `AudioEngine` and `MusicPlayer` against a recording fake: idempotent init (one context, one listener set), drops
  before unlock, synchronous resume in the gesture, retry after `interrupted`, no resume stacking while one hangs,
  remembered music/intensity, hidden/visible without a burst, mute nesting, duck merging, defeat muffle, beat-quantised
  track entry, bar-quantised intensity, rapid track switching stays bounded, failed-bake fallback, `dispose()` leaves no
  listener or timer. Compile-time check: removing `BATTLE_RECIPES` from the merge in `sounds.ts` fails `tsc` (TS2740 missing awaken, call_wave, ...).
* Offline report in the Aside browser (`await window.__dbg.audio.report()`): 76 sounds (70 SFX + 6 stingers), 30/30 design checks,
  `failing: []`. Nothing silent, clipped (max peak 0.83), DC above 0.0002, or starting/ending on a click; every duration is
  inside its declared window. Checks include the summon ladder, hit_light band limiting, tier order, purr = 25 Hz, awaken = biggest.
* **Decoded memory, measured:** SFX 6.17 MB + stingers 1.74 MB = **7.90 MB at 48 kHz** (7.26 MB at 44.1 kHz), decimal MB, all variants, mono
  (`SoundBank.bytes` after a full prerender reads 7718 KB). Reached by mono rendering (the previous stereo set measured about 13 MB), baking
  tails only down to -40 dB under each sound's peak, 2 variants for shots, and trimmed stingers. Music costs no decoded memory.
* Music rendered offline through the real graph (8 s, limiter on): home peak 0.24 / overlap 6; battle at intensity 0 peak 0.28 / overlap 4;
  battle at intensity 1 peak 0.39 / overlap 12 (3 notes shed by the budget); boss peak 0.48 / overlap 12; none clipped, DC <= 0.003.
* Worst-case SFX pile-ups through the limiter: battle mix (16 hits/s + 4 deaths/s + 8 shots/s + 5 coins/s + blasts) peak 0.81, level swing 1.6 dB, 200 voices,
  none dropped; the "everything big at once" mix (mythic + merge_big + boss_die + boss_roar + jackpot + legendary + awaken over the battle mix)
  peak 0.94 (0.99 would clip) with 4.8 dB swing.
* Live run in the browser, 21 s of battle music at intensity 1 plus the stress SFX load: music overlap 12 (budget), 471 voices created, 0 skipped
  steps, sfx active peak 8 (cap 24), 0 per-id/global drops, 76/76 baked; after stopping, runs 0 / live voices 0 / active sfx 0 and a flat JS heap (40.6 -> 43.1 MB).
  `liveVoices` peaks at 15 because it also counts notes already handed over inside the 120 ms look-ahead.
* Pre-unlock, in the real page: `init()` x3 created 0 extra `AudioContext`s; with the context `suspended`, play/playStep/stinger/duck changed nothing
  (`sfxPlayed 0`, duck gain 1), `music('home')` + `setIntensity(0.5)` were remembered, and the first tap started the track.
* Screenshots (`scratchpad/shots/audio`): `demo_home.png` (grid, HUD), `demo_scrolled.png` (the teal block with all 12 new ids),
  `demo_battle_music.png` (HUD during battle music: "music battle voices 14/15 overlap 12"), `demo_defeat.png`. `PAGE_ERRORS []` in every run.
  I cannot listen: sound design was checked through the report's spectral, modulation, duration and loudness measurements above.

## Guide (docs/research/03) items applied

Voice caps/cooldowns per category (5.3), +-1 dB / pitch jitter with no same-variant repeat (5.1), 5 kHz low-pass on rapid-fire ids with the 0.26 peak cap
(5.3), duck dip ~80 ms / release 0.5 to 1.2 s (5.1), defeat music low-pass 400 Hz (5.4), bar-quantised layer changes and beat-quantised track switch (5.4),
synchronous gesture resume, silent-buffer unlock, `audioSession = 'playback'`, 1.5 s resume timeout, clock watchdog, one context (5.5),
mono SFX with pooled source -> gain -> pan voices (5.5 #9, #11), summon thinning (2.2.1), SFX levels by tier (ui -13 dBFS, reward -8, big -3).

## Known gaps

* Not done from guide 5.5: re-creating the context when the output sample rate changes after a Bluetooth switch (#6; buffers keep their own rate, so only
  the WebKit device-rate bug is open) and the silent `<audio loop>` silent-switch fallback for iOS before 16.4 (#3; `audioSession` covers current iOS).
* The first play of a big sound before the idle prerender has reached it is late by its bake time (0.25 to 0.4 s on a slow headless tab).
* No stereo: the stereo path was removed to meet the 8 MB budget (phones fold it to mono). Width comes from play-time `pan` only.
* The headless Aside tab renders at about 2 fps, so button taps in the demo lag; verification used direct API calls and polling for stats.
* `tests/sim.rules.test.ts` currently has 3 failing tests (another module): not mine.

## Requests

* Optional, `src/audio/api.ts` (frozen): `setDanger(level: number)` for the guide's low-HP state (music low-pass 1200 Hz + intensity up, 5.4 / D-01). The
  graph already has the `musicLpf` node it would drive.
* Optional, `src/audio/api.ts`: a way to duck the SFX bus too (`duck(depth, seconds, { sfx: true })`) for the legendary "silence beat" (-15 dB, 5.1).

## Final report table (offline render, 48 kHz, mono, all variants)

`ms` audible duration, `dc` DC offset, `<200 Hz` / `>4 kHz` energy shares (weight / sparkle), KB decoded for all variants. Stingers are the last six rows (`stinger:`).

| id | var | ms | peak | rms | dc | centroid Hz | <200 Hz | >4 kHz | KB |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| ui_click | 1 | 50 | 0.23 | 0.0523 | 0 | 658 | 0 | 0 | 10 |
| ui_back | 1 | 72 | 0.23 | 0.0584 | 0.0001 | 345 | 0.057 | 0 | 15 |
| ui_tab | 1 | 56 | 0.23 | 0.0479 | 0 | 1230 | 0 | 0.002 | 12 |
| ui_toggle | 1 | 55 | 0.134 | 0.0766 | 0 | 906 | 0 | 0.001 | 11 |
| ui_popup_open | 1 | 95 | 0.23 | 0.0527 | 0 | 921 | 0 | 0.006 | 19 |
| ui_popup_close | 1 | 73 | 0.23 | 0.0572 | 0 | 646 | 0 | 0.003 | 15 |
| ui_error | 1 | 109 | 0.155 | 0.0543 | 0 | 208 | 0.846 | 0 | 22 |
| ui_confirm | 1 | 100 | 0.23 | 0.0381 | 0 | 1717 | 0 | 0.012 | 20 |
| coin | 3 | 197 | 0.38 | 0.059 | 0 | 1510 | 0 | 0.005 | 114 |
| coin_many | 1 | 726 | 0.38 | 0.055 | 0 | 2289 | 0.002 | 0.058 | 137 |
| gem | 1 | 431 | 0.337 | 0.0628 | 0 | 1832 | 0 | 0.051 | 81 |
| reward_claim | 1 | 436 | 0.38 | 0.0656 | 0 | 1431 | 0.001 | 0.003 | 82 |
| level_up | 1 | 701 | 0.419 | 0.0724 | 0 | 1111 | 0 | 0.002 | 132 |
| star | 1 | 299 | 0.33 | 0.061 | 0 | 2122 | 0 | 0.031 | 57 |
| purchase | 1 | 414 | 0.373 | 0.061 | 0 | 1555 | 0.001 | 0.007 | 78 |
| summon_common | 1 | 104 | 0.277 | 0.0661 | 0 | 488 | 0.001 | 0 | 20 |
| summon_rare | 1 | 363 | 0.384 | 0.0694 | 0 | 1198 | 0.001 | 0.003 | 69 |
| summon_epic | 1 | 732 | 0.547 | 0.0776 | 0 | 1439 | 0.08 | 0.02 | 138 |
| summon_legendary | 1 | 1341 | 0.7 | 0.0891 | 0 | 1528 | 0.186 | 0.074 | 252 |
| summon_mythic | 1 | 1583 | 0.785 | 0.1154 | 0 | 1805 | 0.234 | 0.12 | 298 |
| merge | 1 | 412 | 0.326 | 0.0532 | 0 | 819 | 0 | 0.003 | 78 |
| merge_big | 1 | 848 | 0.394 | 0.0609 | 0 | 671 | 0.231 | 0 | 160 |
| sell | 1 | 147 | 0.339 | 0.0619 | 0 | 1266 | 0 | 0.011 | 29 |
| upgrade | 1 | 573 | 0.426 | 0.0657 | 0 | 1332 | 0 | 0.003 | 108 |
| place | 1 | 67 | 0.23 | 0.0614 | 0 | 319 | 0.025 | 0 | 13 |
| pickup | 1 | 60 | 0.23 | 0.0595 | 0 | 1080 | 0 | 0 | 13 |
| shoot_arrow | 2 | 64 | 0.2 | 0.039 | 0 | 679 | 0.001 | 0.019 | 26 |
| shoot_magic | 2 | 135 | 0.155 | 0.0341 | 0 | 797 | 0 | 0 | 52 |
| shoot_cannon | 2 | 121 | 0.27 | 0.0509 | 0 | 199 | 0.784 | 0 | 47 |
| shoot_ice | 2 | 84 | 0.2 | 0.0408 | 0 | 2376 | 0 | 0 | 33 |
| shoot_lightning | 2 | 100 | 0.2 | 0.0295 | 0 | 1349 | 0 | 0.018 | 40 |
| shoot_poison | 2 | 119 | 0.154 | 0.0363 | 0 | 394 | 0.002 | 0 | 47 |
| shoot_claw | 2 | 99 | 0.196 | 0.0398 | 0 | 2429 | 0 | 0.123 | 40 |
| hit_light | 3 | 47 | 0.26 | 0.0588 | 0 | 411 | 0 | 0 | 30 |
| hit_heavy | 2 | 109 | 0.349 | 0.0733 | 0 | 240 | 0.449 | 0 | 42 |
| crit | 2 | 185 | 0.29 | 0.0515 | 0 | 1920 | 0.008 | 0.035 | 62 |
| explosion | 2 | 584 | 0.65 | 0.0963 | 0 | 858 | 0.734 | 0.079 | 220 |
| freeze | 1 | 377 | 0.211 | 0.0497 | 0 | 2009 | 0 | 0.036 | 72 |
| stun | 1 | 354 | 0.326 | 0.0466 | 0 | 971 | 0.071 | 0 | 67 |
| buff | 1 | 517 | 0.316 | 0.0565 | 0 | 1215 | 0.002 | 0.004 | 98 |
| heal | 1 | 550 | 0.242 | 0.052 | 0 | 946 | 0 | 0 | 104 |
| enemy_die | 3 | 160 | 0.287 | 0.0541 | 0 | 446 | 0.002 | 0 | 91 |
| boss_warning | 1 | 1095 | 0.282 | 0.0814 | 0 | 385 | 0.452 | 0 | 207 |
| boss_roar | 1 | 1111 | 0.558 | 0.105 | 0 | 303 | 0.641 | 0 | 209 |
| boss_die | 1 | 1348 | 0.7 | 0.1087 | 0 | 939 | 0.656 | 0.085 | 254 |
| wave_start | 1 | 444 | 0.247 | 0.0544 | 0 | 425 | 0.017 | 0 | 84 |
| wave_clear | 1 | 639 | 0.426 | 0.0462 | 0 | 826 | 0 | 0 | 120 |
| danger_alarm | 1 | 266 | 0.146 | 0.0531 | 0 | 641 | 0 | 0 | 51 |
| countdown_tick | 1 | 43 | 0.258 | 0.0581 | 0 | 1320 | 0 | 0 | 9 |
| whoosh | 1 | 270 | 0.231 | 0.0338 | 0 | 869 | 0.06 | 0.013 | 52 |
| relic_pick | 1 | 684 | 0.346 | 0.0724 | 0 | 1118 | 0 | 0.001 | 129 |
| chest_shake | 1 | 339 | 0.29 | 0.0463 | 0 | 494 | 0.292 | 0.018 | 65 |
| chest_open | 1 | 1154 | 0.442 | 0.0671 | 0 | 1301 | 0.177 | 0.011 | 217 |
| card_flip | 1 | 92 | 0.23 | 0.0354 | 0 | 1370 | 0.034 | 0.112 | 18 |
| reel_tick | 1 | 43 | 0.23 | 0.052 | 0 | 1486 | 0 | 0 | 9 |
| reel_stop | 1 | 76 | 0.29 | 0.0701 | 0.0001 | 322 | 0.243 | 0.001 | 15 |
| jackpot | 1 | 1237 | 0.556 | 0.0665 | 0 | 1394 | 0.209 | 0.02 | 233 |
| gamble_fail | 1 | 604 | 0.137 | 0.0533 | 0 | 328 | 0.001 | 0 | 114 |
| laser_on | 1 | 274 | 0.259 | 0.0452 | 0 | 1015 | 0 | 0.019 | 52 |
| laser_off | 1 | 71 | 0.207 | 0.0452 | 0 | 1076 | 0 | 0 | 15 |
| molt | 1 | 527 | 0.28 | 0.0564 | 0 | 987 | 0.052 | 0.002 | 100 |
| purr | 1 | 464 | 0.145 | 0.0413 | 0 | 164 | 0.779 | 0 | 89 |
| awaken | 1 | 1371 | 0.785 | 0.1347 | 0 | 1298 | 0.174 | 0.075 | 258 |
| call_wave | 1 | 425 | 0.278 | 0.061 | 0 | 1463 | 0.001 | 0.072 | 81 |
| sunbeam | 1 | 694 | 0.209 | 0.0531 | 0 | 704 | 0 | 0.003 | 131 |
| hazard_warn | 1 | 163 | 0.326 | 0.0461 | 0 | 1264 | 0 | 0.001 | 32 |
| splash | 2 | 410 | 0.326 | 0.0513 | 0 | 1013 | 0.018 | 0.007 | 153 |
| zap | 2 | 86 | 0.29 | 0.0264 | 0 | 1465 | 0.251 | 0.066 | 33 |
| weaken | 1 | 454 | 0.208 | 0.0477 | 0 | 500 | 0.001 | 0 | 86 |
| shield_break | 2 | 413 | 0.365 | 0.0503 | 0 | 2404 | 0.001 | 0.257 | 153 |
| stinger:victory | 1 | 1578 | 0.74 | 0.1107 | 0 | 950 | 0.222 | 0.01 | 297 |
| stinger:defeat | 1 | 1583 | 0.271 | 0.0865 | 0 | 568 | 0.047 | 0 | 298 |
| stinger:boss_intro | 1 | 1693 | 0.645 | 0.112 | 0 | 222 | 0.84 | 0.011 | 319 |
| stinger:mythic | 1 | 1555 | 0.83 | 0.1073 | 0 | 776 | 0.536 | 0.023 | 292 |
| stinger:level_up | 1 | 1027 | 0.51 | 0.0981 | 0 | 1262 | 0 | 0.007 | 193 |
| stinger:jackpot | 1 | 1577 | 0.74 | 0.1041 | 0 | 1175 | 0.171 | 0.018 | 296 |

