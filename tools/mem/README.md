# Memory measurements (iPhone-sized, headless Edge)

What a phone has to hold, measured the same way every time, so a change that makes the game heavier is seen before a tester's iPhone
closes the page (2026-10-22: `docs/qa/ios_reload_2026-10-22.md`). It runs a **production build** in a headless Edge made to look like an
iPhone (390 x 844 css px, devicePixelRatio 3, touch) over SwiftShader.

What carries over to a phone: the counts and byte sizes of graphics textures, multisample renderbuffers, 2D canvases, decoded pictures and audio
buffers (`init.js` watches every WebGL call; the heap is queried over CDP). What does not: the browser's own process sizes (`proc R/G/B`), speed, and how
WebKit accounts for any of it. Only a real iPhone says where its limit is.

## Run

```
npx vite build --base /Project1/ --outDir <dir>              # with the path written as C:/... under Git Bash, and MSYS_NO_PATHCONV=1
npx vite preview --base /Project1/ --outDir <dir> --port 5288 --host 127.0.0.1
CDP_PORT=9361 node tools/mem/scen.mjs <name> 5288 --battle=180 --battle2=60 --idle=75     # home, first tap, battle, home, battle
CDP_PORT=9361 node tools/mem/screens.mjs <name> 5288                                       # what each tap on the home screen costs, with the peak inside it
node tools/mem/compare.mjs <nameA> <nameB>                                                 # the two side by side
```

Results go to `.shots/mem/out/` (`MEM_OUT` changes it). **One browser at a time**: the scripts share one DevTools port (`CDP_PORT`, default 9361) and refuse to
start when it is busy. `scen.mjs` takes about 12 minutes.

## Reading the lines

`js` JS heap after a forced GC / before it; `audio` baked sounds; `gl` graphics texture bytes (mipmaps counted); `rb` multisample renderbuffers;
`canv` live 2D canvases; `bmp` decoded art pictures; `src` Pixi texture sources alive / MB; `tree` display objects on the stage;
`proc R/G/B` the browser's renderer, GPU and main processes (Chromium, not WebKit). `compare.mjs` adds the sum of the parts and the stage's own drawing buffer.

Figures of 2026-10-22 (battle after 30 s, same scenario): 887 MB before, 389 MB after the changes; the numbers to keep an eye on are `GL MSAA renderbuffers`
(0 now), `2D canvases` (28 MB), `GL textures` (111 MB) and `SUM`.
