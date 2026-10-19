# Sound licenses (the ledger)

Rule of the owner (2026-10-18, directive `docs/qa/directive_2026-10-13_skills_build.md` decisions 38 and 40): the game is released commercially, so every sound has a clear right.

Sounds come only from

1. the game's own procedural synthesizer (`src/audio`): no file, no license question;
2. CC0 packs by Kenney (https://kenney.nl), downloaded with the owner's approval into `art/sfx_src/kenney/` (the zips and the unpacked `Audio` folders with each pack's `License.txt`: "Creative Commons Zero, CC0", free for personal, educational and commercial use, credit not required);
3. ElevenLabs, only later and only if the owner provides a paid-plan key (the paid plan allows commercial use without attribution; the free plan asks for attribution).

Nothing else: no other site, no other download, no sound from memory of a commercial game. **Every sample file that ships (in the game or in the test build) is listed here** with its source pack and file, URL, license and date.

| pack | URL | license | downloaded | files in the pack folder |
|---|---|---|---|---|
| Impact Sounds 1.0 (Kenney) | https://kenney.nl/assets/impact-sounds | CC0 (`art/sfx_src/kenney/kenney_impact-sounds/License.txt`) | 2026-10-18 | 130 Ogg |
| RPG Audio (Kenney) | https://kenney.nl/assets/rpg-audio | CC0 (`art/sfx_src/kenney/kenney_rpg-audio/License.txt`) | 2026-10-18 | 51 Ogg (+ `Preview.ogg`, not used) |
| Interface Sounds 1.0 (Kenney) | https://kenney.nl/assets/interface-sounds | CC0 (`art/sfx_src/kenney/kenney_interface-sounds/License.txt`) | 2026-10-18 | 100 Ogg |

## How the files are converted

The originals are Ogg Vorbis, which iOS Safari cannot be relied on to play. Everything served is converted by `tools/sfx/convert.mjs` (see its header) to **16-bit PCM WAV, mono, 44.1 kHz**: headless Edge (muted) decodes the Ogg with `decodeAudioData`, the page mixes the channels to mono (a file whose decoded peak is over 0.98 is turned down to 0.98 first: 19 of the Ogg files decode above 0.98, 16 of them above 1.0 and up to 1.22, and would clip in 16 bits; the manifest says `scaledBy` for each), trims the silence in front (to 1 ms before the first sample above -70 dB of the peak) and behind (to 5 ms after the last sample above -60 dB, with a 5 ms fade so the cut cannot click), writes the WAV and decodes it again to prove it plays and keeps its length. Every browser decodes WAV (iOS Safari, Android Chrome, desktop Chrome / Edge / Firefox). **Why not AAC or MP3:** they are smaller (about a quarter) but add a start delay that depends on the decoder (measured on this machine: Edge aligns an AAC file but eats the first ~450 samples of a sound that begins at sample 0; Safari's behaviour cannot be measured here), and a hit sound needs its attack where it was recorded. The size stays small by the trim: the three served sets are 130 + 51 + 27 files, 6.4 MB together; a single hit is 5 to 25 KB (doors and pots, the longest, 60 to 150 KB). A file chosen for the game can be made smaller still (22.05 kHz for dull sounds) or re-encoded to AAC with an edit list once it can be tested on an iPhone: do that in the same ledger row ("how converted").

The tool also measures every file (length after the trim, peak, loudness the way the game's own analysis takes it (`loudRms` of `src/audio/analysis.ts`), spectral centroid) and writes it to `public/soundboard/kenney/manifest.json`, which the board shows next to each candidate.

## Test build: sound board candidates (not in the game)

These files are served by the test build for the sound board (`?scene=sounds`, tab "후보 (CC0)") so the owner can listen to them. The game does not load them. A file that is later used in the game is copied to its place in `src/` and gets a row in the next table, with the name it has in the game.

<!-- board:begin -->
| file served | source pack / file | source URL | license | date | where it is used |
|---|---|---|---|---|---|
| public/soundboard/kenney/impact-sounds/footstep_carpet_000.wav | impact-sounds / footstep_carpet_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_carpet_001.wav | impact-sounds / footstep_carpet_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_carpet_002.wav | impact-sounds / footstep_carpet_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_carpet_003.wav | impact-sounds / footstep_carpet_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_carpet_004.wav | impact-sounds / footstep_carpet_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_concrete_000.wav | impact-sounds / footstep_concrete_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_concrete_001.wav | impact-sounds / footstep_concrete_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_concrete_002.wav | impact-sounds / footstep_concrete_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_concrete_003.wav | impact-sounds / footstep_concrete_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_concrete_004.wav | impact-sounds / footstep_concrete_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_grass_000.wav | impact-sounds / footstep_grass_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_grass_001.wav | impact-sounds / footstep_grass_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_grass_002.wav | impact-sounds / footstep_grass_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_grass_003.wav | impact-sounds / footstep_grass_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_grass_004.wav | impact-sounds / footstep_grass_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_snow_000.wav | impact-sounds / footstep_snow_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_snow_001.wav | impact-sounds / footstep_snow_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_snow_002.wav | impact-sounds / footstep_snow_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_snow_003.wav | impact-sounds / footstep_snow_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_snow_004.wav | impact-sounds / footstep_snow_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_wood_000.wav | impact-sounds / footstep_wood_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_wood_001.wav | impact-sounds / footstep_wood_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_wood_002.wav | impact-sounds / footstep_wood_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_wood_003.wav | impact-sounds / footstep_wood_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/footstep_wood_004.wav | impact-sounds / footstep_wood_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactBell_heavy_000.wav | impact-sounds / impactBell_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactBell_heavy_001.wav | impact-sounds / impactBell_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactBell_heavy_002.wav | impact-sounds / impactBell_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactBell_heavy_003.wav | impact-sounds / impactBell_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactBell_heavy_004.wav | impact-sounds / impactBell_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGeneric_light_000.wav | impact-sounds / impactGeneric_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGeneric_light_001.wav | impact-sounds / impactGeneric_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGeneric_light_002.wav | impact-sounds / impactGeneric_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGeneric_light_003.wav | impact-sounds / impactGeneric_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGeneric_light_004.wav | impact-sounds / impactGeneric_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_heavy_000.wav | impact-sounds / impactGlass_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_heavy_001.wav | impact-sounds / impactGlass_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_heavy_002.wav | impact-sounds / impactGlass_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_heavy_003.wav | impact-sounds / impactGlass_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_heavy_004.wav | impact-sounds / impactGlass_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_light_000.wav | impact-sounds / impactGlass_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_light_001.wav | impact-sounds / impactGlass_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_light_002.wav | impact-sounds / impactGlass_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_light_003.wav | impact-sounds / impactGlass_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_light_004.wav | impact-sounds / impactGlass_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_medium_000.wav | impact-sounds / impactGlass_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_medium_001.wav | impact-sounds / impactGlass_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_medium_002.wav | impact-sounds / impactGlass_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_medium_003.wav | impact-sounds / impactGlass_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactGlass_medium_004.wav | impact-sounds / impactGlass_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_heavy_000.wav | impact-sounds / impactMetal_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_heavy_001.wav | impact-sounds / impactMetal_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_heavy_002.wav | impact-sounds / impactMetal_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_heavy_003.wav | impact-sounds / impactMetal_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_heavy_004.wav | impact-sounds / impactMetal_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_light_000.wav | impact-sounds / impactMetal_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_light_001.wav | impact-sounds / impactMetal_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_light_002.wav | impact-sounds / impactMetal_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_light_003.wav | impact-sounds / impactMetal_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_light_004.wav | impact-sounds / impactMetal_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_medium_000.wav | impact-sounds / impactMetal_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_medium_001.wav | impact-sounds / impactMetal_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_medium_002.wav | impact-sounds / impactMetal_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_medium_003.wav | impact-sounds / impactMetal_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMetal_medium_004.wav | impact-sounds / impactMetal_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMining_000.wav | impact-sounds / impactMining_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMining_001.wav | impact-sounds / impactMining_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMining_002.wav | impact-sounds / impactMining_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMining_003.wav | impact-sounds / impactMining_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactMining_004.wav | impact-sounds / impactMining_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlank_medium_000.wav | impact-sounds / impactPlank_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlank_medium_001.wav | impact-sounds / impactPlank_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlank_medium_002.wav | impact-sounds / impactPlank_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlank_medium_003.wav | impact-sounds / impactPlank_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlank_medium_004.wav | impact-sounds / impactPlank_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_heavy_000.wav | impact-sounds / impactPlate_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_heavy_001.wav | impact-sounds / impactPlate_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_heavy_002.wav | impact-sounds / impactPlate_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_heavy_003.wav | impact-sounds / impactPlate_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_heavy_004.wav | impact-sounds / impactPlate_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_light_000.wav | impact-sounds / impactPlate_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_light_001.wav | impact-sounds / impactPlate_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_light_002.wav | impact-sounds / impactPlate_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_light_003.wav | impact-sounds / impactPlate_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_light_004.wav | impact-sounds / impactPlate_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_medium_000.wav | impact-sounds / impactPlate_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_medium_001.wav | impact-sounds / impactPlate_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_medium_002.wav | impact-sounds / impactPlate_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_medium_003.wav | impact-sounds / impactPlate_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPlate_medium_004.wav | impact-sounds / impactPlate_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_heavy_000.wav | impact-sounds / impactPunch_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_heavy_001.wav | impact-sounds / impactPunch_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_heavy_002.wav | impact-sounds / impactPunch_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_heavy_003.wav | impact-sounds / impactPunch_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_heavy_004.wav | impact-sounds / impactPunch_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_medium_000.wav | impact-sounds / impactPunch_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_medium_001.wav | impact-sounds / impactPunch_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_medium_002.wav | impact-sounds / impactPunch_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_medium_003.wav | impact-sounds / impactPunch_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactPunch_medium_004.wav | impact-sounds / impactPunch_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_heavy_000.wav | impact-sounds / impactSoft_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_heavy_001.wav | impact-sounds / impactSoft_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_heavy_002.wav | impact-sounds / impactSoft_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_heavy_003.wav | impact-sounds / impactSoft_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_heavy_004.wav | impact-sounds / impactSoft_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_medium_000.wav | impact-sounds / impactSoft_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_medium_001.wav | impact-sounds / impactSoft_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_medium_002.wav | impact-sounds / impactSoft_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_medium_003.wav | impact-sounds / impactSoft_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactSoft_medium_004.wav | impact-sounds / impactSoft_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactTin_medium_000.wav | impact-sounds / impactTin_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactTin_medium_001.wav | impact-sounds / impactTin_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactTin_medium_002.wav | impact-sounds / impactTin_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactTin_medium_003.wav | impact-sounds / impactTin_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactTin_medium_004.wav | impact-sounds / impactTin_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_heavy_000.wav | impact-sounds / impactWood_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_heavy_001.wav | impact-sounds / impactWood_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_heavy_002.wav | impact-sounds / impactWood_heavy_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_heavy_003.wav | impact-sounds / impactWood_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_heavy_004.wav | impact-sounds / impactWood_heavy_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_light_000.wav | impact-sounds / impactWood_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_light_001.wav | impact-sounds / impactWood_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_light_002.wav | impact-sounds / impactWood_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_light_003.wav | impact-sounds / impactWood_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_light_004.wav | impact-sounds / impactWood_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_medium_000.wav | impact-sounds / impactWood_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_medium_001.wav | impact-sounds / impactWood_medium_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_medium_002.wav | impact-sounds / impactWood_medium_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_medium_003.wav | impact-sounds / impactWood_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/impact-sounds/impactWood_medium_004.wav | impact-sounds / impactWood_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/beltHandle1.wav | rpg-audio / beltHandle1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/beltHandle2.wav | rpg-audio / beltHandle2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookClose.wav | rpg-audio / bookClose.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookFlip1.wav | rpg-audio / bookFlip1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookFlip2.wav | rpg-audio / bookFlip2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookFlip3.wav | rpg-audio / bookFlip3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookOpen.wav | rpg-audio / bookOpen.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookPlace1.wav | rpg-audio / bookPlace1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookPlace2.wav | rpg-audio / bookPlace2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/bookPlace3.wav | rpg-audio / bookPlace3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/chop.wav | rpg-audio / chop.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/cloth1.wav | rpg-audio / cloth1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/cloth2.wav | rpg-audio / cloth2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/cloth3.wav | rpg-audio / cloth3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/cloth4.wav | rpg-audio / cloth4.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/clothBelt.wav | rpg-audio / clothBelt.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/clothBelt2.wav | rpg-audio / clothBelt2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/creak1.wav | rpg-audio / creak1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/creak2.wav | rpg-audio / creak2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/creak3.wav | rpg-audio / creak3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorClose_1.wav | rpg-audio / doorClose_1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorClose_2.wav | rpg-audio / doorClose_2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorClose_3.wav | rpg-audio / doorClose_3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorClose_4.wav | rpg-audio / doorClose_4.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorOpen_1.wav | rpg-audio / doorOpen_1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/doorOpen_2.wav | rpg-audio / doorOpen_2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/drawKnife1.wav | rpg-audio / drawKnife1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/drawKnife2.wav | rpg-audio / drawKnife2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/drawKnife3.wav | rpg-audio / drawKnife3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/dropLeather.wav | rpg-audio / dropLeather.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep00.wav | rpg-audio / footstep00.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep01.wav | rpg-audio / footstep01.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep02.wav | rpg-audio / footstep02.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep03.wav | rpg-audio / footstep03.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep04.wav | rpg-audio / footstep04.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep05.wav | rpg-audio / footstep05.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep06.wav | rpg-audio / footstep06.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep07.wav | rpg-audio / footstep07.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep08.wav | rpg-audio / footstep08.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/footstep09.wav | rpg-audio / footstep09.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/handleCoins.wav | rpg-audio / handleCoins.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/handleCoins2.wav | rpg-audio / handleCoins2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/handleSmallLeather.wav | rpg-audio / handleSmallLeather.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/handleSmallLeather2.wav | rpg-audio / handleSmallLeather2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/knifeSlice.wav | rpg-audio / knifeSlice.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/knifeSlice2.wav | rpg-audio / knifeSlice2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/metalClick.wav | rpg-audio / metalClick.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/metalLatch.wav | rpg-audio / metalLatch.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/metalPot1.wav | rpg-audio / metalPot1.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/metalPot2.wav | rpg-audio / metalPot2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/rpg-audio/metalPot3.wav | rpg-audio / metalPot3.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/click_001.wav | interface-sounds / click_001.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/click_002.wav | interface-sounds / click_002.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/click_003.wav | interface-sounds / click_003.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/click_004.wav | interface-sounds / click_004.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/click_005.wav | interface-sounds / click_005.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_001.wav | interface-sounds / select_001.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_002.wav | interface-sounds / select_002.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_003.wav | interface-sounds / select_003.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_004.wav | interface-sounds / select_004.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_005.wav | interface-sounds / select_005.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_006.wav | interface-sounds / select_006.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_007.wav | interface-sounds / select_007.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/select_008.wav | interface-sounds / select_008.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_001.wav | interface-sounds / switch_001.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_002.wav | interface-sounds / switch_002.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_003.wav | interface-sounds / switch_003.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_004.wav | interface-sounds / switch_004.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_005.wav | interface-sounds / switch_005.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_006.wav | interface-sounds / switch_006.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/switch_007.wav | interface-sounds / switch_007.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/tick_001.wav | interface-sounds / tick_001.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/tick_002.wav | interface-sounds / tick_002.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/tick_004.wav | interface-sounds / tick_004.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/toggle_001.wav | interface-sounds / toggle_001.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/toggle_002.wav | interface-sounds / toggle_002.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/toggle_003.wav | interface-sounds / toggle_003.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
| public/soundboard/kenney/interface-sounds/toggle_004.wav | interface-sounds / toggle_004.ogg | https://kenney.nl/assets/interface-sounds | CC0 | 2026-10-18 | sound board candidate only (not in the game) |
<!-- board:end -->

## In the game

Sample files that ship with the game, read by `src/audio/samples.ts` and laid UNDER a synthesised recipe of `src/audio/sfx-skills.ts` (the skills' signatures) or `src/audio/sfx-impacts.ts` (the landing of a weapon: wood, tin, steel, an axe, a pot) (a recipe is a whole sound without them: a file that does not load costs the layer, not the sound). Each is a copy of the converted candidate of the sound board (`public/soundboard/kenney/<pack>/<name>.wav`, see "How the files are converted" above: 16-bit mono 44.1 kHz PCM WAV, the silence around the sound trimmed), byte for byte, except the ones whose row says "cut at N ms": those are cut there with a 12 ms fade-out because the game only needs the first part of a long ring. Made by `node tools/sfx/ship.mjs`, which also writes this table and refuses anything that is not from the three packs, not in that format, or over 60 KB or 400 ms. The date is the day the file was put into the game (the three packs were downloaded on 2026-10-18). 29 files, 542 KB in all. Not recoded to AAC: see above (the start delay of a compressed file would blur the first millisecond of a hit, and 20 to 45 KB per file is smaller than the code around it).

| file in the game | source pack / file | source URL | license | date | where it plays |
|---|---|---|---|---|---|
| src/assets/sfx/impact-sounds/impactMetal_light_000.wav | impact-sounds / impactMetal_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_cut_clash: the "chaeng" of the samurai skill (variant 0) |
| src/assets/sfx/impact-sounds/impactMetal_light_001.wav | impact-sounds / impactMetal_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_cut_clash: the "chaeng" (variant 1) |
| src/assets/sfx/impact-sounds/impactMetal_light_003.wav | impact-sounds / impactMetal_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_cut_clash: the long ring under variant 0 (cut at 300 ms) |
| src/assets/sfx/impact-sounds/impactMetal_light_004.wav | impact-sounds / impactMetal_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_cut_clash: the "chaeng" (variant 2) |
| src/assets/sfx/impact-sounds/impactMetal_heavy_001.wav | impact-sounds / impactMetal_heavy_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shield_slam: the iron rim of the viking shield |
| src/assets/sfx/impact-sounds/impactWood_heavy_000.wav | impact-sounds / impactWood_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shield_slam: the wooden body of the viking shield |
| src/assets/sfx/impact-sounds/impactMetal_heavy_000.wav | impact-sounds / impactMetal_heavy_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_meteor_boom: the debris of the meteor |
| src/assets/sfx/impact-sounds/impactTin_medium_003.wav | impact-sounds / impactTin_medium_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_poster_hole: the cork through the tin of the poster; imp_r_gunner: the tin plate under the cork |
| src/assets/sfx/impact-sounds/impactGlass_light_000.wav | impact-sounds / impactGlass_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shard_hit: a shard of ice glass (variant 0) |
| src/assets/sfx/impact-sounds/impactGlass_light_001.wav | impact-sounds / impactGlass_light_001.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shard_hit (variant 1), sp_glass_tap: the ice queen's tap |
| src/assets/sfx/impact-sounds/impactGlass_light_002.wav | impact-sounds / impactGlass_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shard_hit (variant 2), sp_flask_pop: the big flask of the alchemist |
| src/assets/sfx/impact-sounds/impactGlass_light_003.wav | impact-sounds / impactGlass_light_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shard_hit: a shard of ice glass (variant 3) |
| src/assets/sfx/impact-sounds/impactGlass_light_004.wav | impact-sounds / impactGlass_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_shard_hit: a shard of ice glass (variant 4) |
| src/assets/sfx/impact-sounds/impactGlass_heavy_003.wav | impact-sounds / impactGlass_heavy_003.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_glass_shatter: the body of the breaking glass |
| src/assets/sfx/impact-sounds/impactGlass_medium_004.wav | impact-sounds / impactGlass_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_glass_shatter: the pieces of the breaking glass (cut at 300 ms) |
| src/assets/sfx/impact-sounds/impactGeneric_light_000.wav | impact-sounds / impactGeneric_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_capsule_bounce: plastic on the board (variant 0) |
| src/assets/sfx/impact-sounds/impactGeneric_light_002.wav | impact-sounds / impactGeneric_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_capsule_bounce (variant 1) |
| src/assets/sfx/impact-sounds/impactGeneric_light_004.wav | impact-sounds / impactGeneric_light_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | sp_capsule_bounce (variant 2) |
| src/assets/sfx/rpg-audio/metalLatch.wav | rpg-audio / metalLatch.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | sp_sheath: the sword going home; sp_capsule_pop: the latch of the capsule |
| src/assets/sfx/rpg-audio/handleCoins2.wav | rpg-audio / handleCoins2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | sp_capsule_rattle: the prize rattling in its shell |
| src/assets/sfx/rpg-audio/bookClose.wav | rpg-audio / bookClose.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | sp_poster_slap: the wanted poster slapped on the boss |
| src/assets/sfx/impact-sounds/impactWood_light_002.wav | impact-sounds / impactWood_light_002.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | imp_w_sword: the wooden bar of the wooden sword (the knock under the crack) |
| src/assets/sfx/impact-sounds/impactWood_light_000.wav | impact-sounds / impactWood_light_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | imp_r_archer: the arrow into the wooden board |
| src/assets/sfx/impact-sounds/impactWood_medium_000.wav | impact-sounds / impactWood_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | imp_w_tiger: the shaft of the polearm (cut at 140 ms) |
| src/assets/sfx/impact-sounds/impactMetal_medium_000.wav | impact-sounds / impactMetal_medium_000.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | imp_r_ninja: the shuriken on tin (cut at 110 ms) |
| src/assets/sfx/impact-sounds/impactMetal_medium_004.wav | impact-sounds / impactMetal_medium_004.ogg | https://kenney.nl/assets/impact-sounds | CC0 | 2026-10-19 | imp_w_samurai: the edge of the blade |
| src/assets/sfx/rpg-audio/chop.wav | rpg-audio / chop.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | imp_w_viking: the axe chopping (the first 60 ms are used; the file is cut at 80 ms) |
| src/assets/sfx/rpg-audio/metalPot2.wav | rpg-audio / metalPot2.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | imp_t_chef: the frying pan (the first 90 ms are used; the file is cut at 130 ms) |
| src/assets/sfx/rpg-audio/knifeSlice.wav | rpg-audio / knifeSlice.ogg | https://kenney.nl/assets/rpg-audio | CC0 | 2026-10-19 | sp_dash: the samurai's afterimage tearing down the road (cut at 300 ms) |
