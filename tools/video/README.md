# Patch-notes video tooling

Makes `video/패치영상_2026-10-10.mp4` (1920x1080, 30 fps, H.264 + AAC) and `video/패치영상_2026-10-10_thumb.png` from `tools/video/script.json`.
It is a parody of the "game news patch summary" format for this game only: no footage, image, logo, name or voice of any other video is used.
The pictures are the game's own art (`art/**`, `src/assets/img`), the fonts are the game's full Jua and Lilita One files (from `node_modules/@expo-google-fonts`, so every Hangul glyph is there; the game's subset is not used), and the music is the owner's own file.
Nothing here is part of the game build, and nothing in `src/` is touched. Outputs, the music and the work folder are git-ignored (`video/*.mp4`, `video/*.mp3|wav|ogg`, `video/work/`); the thumbnail PNG is the one output that is not.

## Rebuild

```
cd tools/video && npm install          # once (mp4-muxer only)
node tools/video/build.mjs             # from the repo root: narration -> timeline -> render -> mp4 + thumbnail (about 1 minute)
```

Needs Windows with PowerShell and the voice "Microsoft Heami Desktop" (System.Speech), Node 18+, and Microsoft Edge (headless Edge does the drawing and the WebCodecs encoding;
set `EDGE_PATH` if it is installed elsewhere). The music must be a file at `video/bgm.mp3`, `video/bgm.wav` or `video/bgm.ogg`.
The server listens on `127.0.0.1:5431` (`VIDEO_PORT` changes it). It never uses the game's dev server port.

Other commands:

| command | what it does |
|---|---|
| `node tools/video/build.mjs --timeline` | voices changed lines, prints every card with its start, length and caption, no render |
| `node tools/video/build.mjs --stills 3.5,c07@2.6 --shots-dir <dir>` | draws only those moments to PNG (seconds, or `cNN@u` = u seconds into card cNN); the quick way to look at a layout |
| `node tools/video/build.mjs --verify --shots-dir <dir>` | opens the finished MP4 in a page like a viewer: size and duration, one still per card and the first and last frame, then decodes its audio (loudness per 5 s, peak, speech against the rest) and writes `verify.json` |
| `node tools/video/inspect.mjs [file]` | reads the MP4 boxes without a browser: brands, fast start, codec strings, keyframe spacing, bit rates |
| `node tools/video/analyze.mjs [from to]` | decodes the music and prints its loudness every 0.5 s and a tempo guess; with two times it also prints the 50 ms envelope and the strong onsets of that stretch |
| `--force-tts`, `--no-tts` | voice every line again / skip the voice step |

## Change a line

Everything is in `tools/video/script.json`. Each card has:

* `say`: what the voice reads. Write numbers the way they are SPOKEN ("이백사십", "오 곱하기 오", "영 점 오", "십 점 십"): the Windows voice reads digits badly.
* `caption`: what is burned into the picture (digits, `**word**` for the yellow highlight, `→` is drawn as an arrow because the game fonts have no arrow glyph).
* `kind` (`hook`, `chapter`, `board`, `ladder`, `specials`, `change`, `columns`, `auras`, `swap`, `cells`, `laser`, `missions`, `codex`, `music`, `stat`, `outro`), `chapter`, `tag` (`buff`, `nerf`, `adjust`, `new`, `measure`), `since` (which build the change came in), and the numbers: `rows` with `{ "t": "num", "label", "from", "to", "unit", "dec", "good" }` (old value struck through, new value ticks up; `good` true / false / null picks green / berry / teal), `{ "t": "text", "from", "to" }` and `{ "t": "note" }`.
* `art` keys: `u:w_tiger` (art/units_v2), `boss:vacuum` and `enemy:dust` (art/enemies_v2), `cell:sun`, `icon:fish`, `misc:icon_purr`, `relic:cat_tower`, `fx:zone_hole`, `img:<name>` (src/assets/img).

After editing, run `node tools/video/build.mjs`. Only lines whose `say` text (or the voice and rate) changed are voiced again (a hash is kept next to each WAV in `video/work/tts`).
Card length = 0.15 s lead + the real length of the WAV + 0.28 s breath, rounded up to the next half beat of the music so the cuts land on the groove (a card is never shorter than `timing.minCard`).
`tts.rate` is 5 (the brief said 4 to 5). `video.bitrate` is 8 Mbps; use 3000000 to get a file of about 40 MB for chat apps.
`build.mjs` also checks every character on screen against both fonts and prints the ones neither has (today: only the arrow, which is drawn instead).

## The music

The bed is whatever file is at `video/bgm.(mp3|wav|ogg)`. The owner's track is 247.6 s long, 128 BPM, and has no silent lead-in (it starts at about -21 dBFS and builds); its biggest hit, the "drop" after a one-second breakdown, is at 82.059 s of the file.
`script.json` says so: `bgm.dropAt` (that time in the track), `bgm.dropInVideo` (0.3 s: where in the video the hit should land) and `bgm.beat` (0.46875 s). The video therefore starts at 81.759 s of the track.
If you change the music, run `analyze.mjs`, find its strong moment, and edit those three numbers (the cut grid follows `beat` and `dropInVideo`).

Mix (`script.json` -> `mix`, code in `player/audio.js`), all offline at 48 kHz:
1. each narration line is levelled to -14 dBFS RMS, with a soft ceiling for its rare peaks;
2. the music stretch is levelled slowly (60 % of the distance to -19.5 dBFS RMS, so the drop stays louder than the quiet parts but nothing disappears), starts with a 30 ms fade-in, and is looped on a 16-bar crossfade if the track is shorter than the video (not needed with this track; `?mode=mix&bedLimit=30` tests it);
3. it is ducked by 10.5 dB under the voice with a 200 ms attack and a 250 ms release; lines closer than 0.9 s keep it ducked, so it does not pump between lines (in this video that means one long duck from the first line to the last);
4. it fades out over the last 2 s; the last picture fades to dark;
5. the sum is brought up so its loudest 0.01 % reach -1 dBFS and a look-ahead limiter holds the ceiling (-1 dBFS).

## How it works

`build.mjs` writes `video/work/lines.json`, runs `tts.ps1` (one WAV per line and its word times), measures the WAVs, writes `video/work/timeline.json`, then `runner.mjs` starts `server.mjs` and headless Edge on `player/index.html`.
The page (`render.js`) loads the fonts and pictures, mixes the sound (`audio.js`), and for each frame calls `drawFrame(ctx, t)` (`scenes.js`), a pure function of `t = frame / 30`; each frame goes to a `VideoEncoder` as a `VideoFrame` (a keyframe every 2 s, the queue is bounded), the matching 1600 samples of sound go to an `AudioEncoder`, and `mp4-muxer` (fast start, in memory) writes the file, which the page POSTs to the server (`video/work/out/video.mp4`).
`build.mjs` then copies it to `video/` and the thumbnail beside it. A run is fully deterministic: the same script and files give the same video.
`player/probe.html` is the first check that was made of what the browser can encode.

If a run is aborted, leftover headless Edge processes that use `video/work/edge-profile` can stay alive; the next run stops them first.

## What could not be checked here

Nobody listened to the result. The sound was checked by numbers only (levels per window, peak, speech against the music under it, no sample at full scale in the decoded MP4), and the voice is a Windows text-to-speech voice, so its pronunciation of a few words may need an ear.
