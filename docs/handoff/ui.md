# Handoff: ui (UI kit), paper scrapbook restyle

Date 2026-10-06. Module: `src/ui/**`, gallery `src/demo/UiDemo.ts` (`?demo=ui&page=0..11`), CSS splash in `index.html`, tests `tests/ui.test.ts`, `tests/ui.components.test.ts`, `tests/ui.paper.test.ts`.
Everything is still drawn in code (PixiJS v8 Graphics + Text); no image files. Import from the barrel: `import { Button, Panel, paperShape, tapeStrip, ... } from '@/ui'`. Construct UI after BootScene has loaded the fonts.

## The look

"A sunny home by day", shape language "paper scrapbook" (the approved mock is `art/style2/uistyle_paper.png`, option C). Everything is cut paper lying on a warm wooden floor.

- **Matte and flat.** No gloss, no glass highlights, no plastic gradients, no glow halos, no thick dark outline on panels or buttons.
- **Cut edges.** Every piece is a rounded rectangle whose edge wobbles by 1 to 2.1 px along a few slow waves, deterministic per shape (seeded, so nothing shimmers between frames, resizes or reloads). A side can be *torn* instead: short irregular teeth with a pale fibre line.
- **Layering.** Depth is a flat warm-brown shadow (about 22 % alpha, 0 / +5 px, no blur) and an optional thin darker line just inside the cut. Sheets of 40 000 px² or more get a very quiet paper grain (one 128 px canvas texture, created once, tiled by a `FillPattern`).
- **Tape and dashes.** Washi tape (dots, gingham, stripes, plain; pink, sky, yellow, green) marks the selected or recommended piece and holds sheets down, one piece per card at most. A teal dashed "cut here" line runs inside big sheets and between rows.
- **Text.** Dark ink (`Color.ink`) straight on the paper: no stroke, no shadow. Only text on artwork or on the dark dim is light, and then it carries a brown stroke (`onArt`).
- **The one drawn line** is the speech bubble / tooltip outline (2.5 px ink, wobbly, with a tail).

## Tokens (`theme.ts`)

Every old token name is still there with its new meaning, so nothing breaks; new code should prefer the semantic names.

| Token | Value | Use |
|---|---|---|
| `ink` | `0x4a3222` | text and glyphs on paper; also `outline`, `text` |
| `inkSoft` | `0x7d5e45` | secondary text on cream (AA); also `textDim` |
| `inkDeep` | `0x3b2418` | labels on coloured craft paper (coral, berry, teal); also `textDark` |
| `onArt` | `0xfffaf0` | light text, only on artwork or the dim, always with a brown stroke |
| `paper` / `paperLight` / `paperDim` | `fbf3e2` / `fffaee` / `edddbb` | cream sheet / card lying on a sheet / nested well; legacy `panel`, `panelLight`, `panelDark` |
| `kraft` / `kraftDark` / `track` | `d9b88a` / `b48f62` / `d3bb94` | secondary strips and bases / their edge / the strip bars and sliders are painted into |
| `wood` / `woodDark` | `c48f50` / `a06a33` | the floor; legacy scene backgrounds `bg`, `bgDeep` |
| `shadow` | `0x6a4527` | the flat shadow colour (drawn at about 22 % alpha) |
| `inkMid` / `woodLight` / `pressTint` / `stone` / `bronze` | `6b4d38` `e0b070` `ece0d0` `a59d90` `b8845a` | added 2026-10-07: unselected tab labels on kraft (AA) / sunlit floor streaks / the tint a pressed paper takes / the warm-grey silver and the copper of the synergy tiers |
| `coral` / `teal` / `mustard` / `leaf` / `berry` / `violet` (+ `...Dark`) | `f0796b` `5fb9c4` `f0bc43` `7dba5c` `d96579` `9c84c0` | craft papers; legacy `primary`, `info`, `gold`, `success`, `danger`, `purple` (+ `...Dark`) |
| `neutral` / `neutralDark` | `d9b88a` / `a88457` | kraft |
| `gem`, `energy` | `6ccbe0`, `9ccb5e` | currency colours |
| `Dim` | `0x3a2514` at 0.58 | popup dim: warm brown, never black or purple |
| `TapeColors` | pink `f3a9ba`, sky `9acbea`, yellow `f5d36a`, green `a6d48b` | washi tape body and its printed mark |
| `Rarity` | common `c9bba3`, rare `4fa3c7`, epic `9c7fc2`, legendary `e8a23a`, mythic `df5c6f` (+ `dark`, `light`, `glow`) | five matte hues readable on cream; `RARITY_GOLD` `eab84a` is the mythic accent |
| `ButtonPalettes` | `primary` coral, `success` leaf, `info` teal, `danger` berry, `neutral` cream, `purple` violet, **new** `mustard`, **new** `kraft` | each has `base`, `top`, `bottom` (a hair either side of base), `lip` (darker edge tone), `ink`, `textStroke` |

`ButtonPalette` lost `rimTop`, `rimBottom` and `glow` (nothing outside `src/ui` read them). `PanelColors` is now `{ fill, edge, text, textDim }`. `PanelVariant` gained `'kraft'`. `ButtonStyleId` gained `'mustard' | 'kraft'`. `PALETTE_PREVIEWS`, `applyPalettePreview` and the `?theme=` hack are gone.

## Paper primitives (`paper.ts`, geometry in `paperMath.ts`)

All exported from `@/ui`. Geometry is generated once per size/seed and cached (`cachedPaperPath`, dash runs, tape outlines); nothing is rebuilt per frame.

| Export | One-line usage |
|---|---|
| `paperShape(opts)` -> `PaperPiece` | `host.addChild(paperShape({ w: 300, h: 100, kind: 'pill', fill: Color.paper }))`: a Container (origin = centre) with `.shadowG` and `.faceG`. `kind` is `'rect' | 'pill' | 'circle'`; also `radius`, `seed`, `torn`, `shadow`, `grain`, `wobble`, `edge`, `edgeWidth`, `edgeAlpha`, `alpha`. |
| `drawPaper(g, x, y, opts)` | Shadow + face into a Graphics you own; (x, y) is the top-left of the piece. `drawPaperShadow` and `drawPaperFace` draw the halves separately (a button presses its face onto a shadow that stays). |
| `paperSeed()` | A fresh wobble seed; take one per component in its constructor and reuse it on every redraw. Without a `seed` the shape is cut from its size, so equal sizes cut equal. |
| `tapeStrip({ name, pattern, w, h, angle })` -> Graphics | A strip of washi tape, origin = centre, zig-zag ends, slight tilt. `name`: `pink|sky|yellow|green`; `pattern`: `dots|gingham|stripes|plain`. |
| `drawDashedRect(g, x, y, w, h, { radius, color, width, dash, gap })` | The teal "cut here" line round a rounded rectangle (hand-drawn wobble, cached dash runs). |
| `drawDashedLine(g, x0, y0, x1, y1, opts)` | A dashed rule, also hand-drawn. |
| `new PaperLabel({ text, size, paper, torn, tape })` | A torn paper label that sizes itself to its text (`setText`, `setMaxWidth`); `paper` is a `ButtonStyleId` or a raw colour; `torn: 'ends' | 'bottom' | 'none'`. |
| `drawPaintFill(g, x, y, w, h, color)` | A brush-painted bar: round left cap, uneven leading edge (for one-off drawings; bars that animate use `paintTexture`). |
| `paintTexture(color, h)` (in `shapes.ts`) | The same painted fill baked into a texture for a 9-slice (`leftWidth = rightWidth = h / 2`); what `ProgressBar` and `Slider` use. |
| `drawSpeechBubble(g, x, y, w, h, { tail, radius })` | Cream paper with a hand-drawn brown outline and a tail (`tail: { side: 'top' | 'bottom', x, len, half }`). |
| `drawFloor(g, w, h)` | The wooden floor (planks, grain streaks): use it for a scene background. |
| `edgeTone(fill)` | The paper's own darker rim colour. |

`paperMath.ts` (pure, unit-tested in `tests/ui.paper.test.ts`): `hash32`, `makeRng`, `paperPath`, `cachedPaperPath`, `wobbleAmp`, `tornMask`, `bubblePath`, `dashRuns`, `tapeOutline`, `clipPolyX`, `paintPath`.

## Components (names, options and behaviour unchanged unless listed)

- **Button / IconButton**: a paper cut-out with a flat shadow. Pressing moves the paper 3 to 4 px onto its shadow, scales it to 0.97 and tints it a shade darker on the pointerdown frame; release springs back with a 1.035 overshoot and 1.6 degrees of wobble (alternating sides). Disabled = desaturated kraft with soft ink plus the corner padlock. New: `tape?: TapeName` strip across the top (one main CTA per screen). `shine()` is now an attention wiggle (the paper rocks and settles); there is no glossy sweep any more. Icon buttons default to cream.
- **Panel / Popup / dialogs / RewardPopup**: a cream sheet with grain; the title sits on a torn coloured `PaperLabel` straddling the top edge; `ribbon` picks its colour. New `Panel` options: `torn` (sides) and `tape` (top centre; with a title it is stuck across the label's corner). The close button is a round kraft IconButton. Dialogs and the reward popup tear their bottom edge and carry tape. Reward tiles are photo frames (cream border, rarity-coloured mat) with the amount on a teal strip.
- **TabBar**: a kraft strip with a torn top edge; the selected tab is a cream paper tab that slides up through the tear, held by tape; the hero tab is a raised paper circle (coral when selected). **SegmentTabs**: kraft strip with a cream paper piece (and a bit of tape) that slides.
- **ProgressBar**: kraft track, painted flat fill with an uneven leading edge, label in ink. The `shine` option is gone. **CooldownRing**: kraft ring, painted arc. Colours: gold = mustard, green = leaf, red = coral-red, blue = teal, purple = violet, cyan = sky.
- **CurrencyPill**: a teal torn strip with the icon over its left end, number in dark ink. **Badge**: coral dot on a cream ring. **Tag**: flat coloured paper (pill, flag, burst). **Toast**: a cream strip with a coloured paper medallion and one piece of tape. **Tooltip**: speech bubble.
- **CardFrame**: a paper photo frame (cream border, mat in the rarity colour). Ornaments pile up with the tier so rarity never relies on colour: rare = dashed inner line, epic = + photo-corner mounts, legendary = + tape, mythic = + gold accents and a star sticker; the five pips and the optional `colorAssist` name stay. **RarityPips**, **ClassChip** (tier = border colour/width; tier 3 adds a dashed inner line; selected = teal dashed line + tape; tier-up sends out a ring instead of a glow), **OddsTable** (cream well, dashed row separators, painted bars), **Toggle / Slider / Stepper**, **Divider** (teal dashed line), **Stars**, **LoadingSpinner** (ink dots), **ScrollView** indicator (soft ink).
- **ScreenScaffold**: wooden floor backdrop, a kraft header strip torn along its lower edge with the title on a cream `PaperLabel`, a kraft action bar torn along its top edge.
- **Icons** (`icons.ts`): shapes untouched. Fills are flat (two-tone ramps collapse to their middle), the glossy sheen and tube highlights are gone, the generic glyphs (close, back, check, plus, minus, play, pause, fast forward, speakers, music, gear, speed, reroll, info, question) are ink, and the hot candy hues are re-mapped (blue -> teal, purple -> violet, red -> berry, white -> cream). Outlines are the ink brown.
- **Text** (`text.ts`): `label` / `uiLabel` default to ink, no stroke, no shadow. New `LabelOpts.onArt` and `artLabel()`: light fill with a brown stroke, for text on artwork. `numberText(size, color = ink, text, onArt = false)`: the atlas is bare white (tinted), `onArt` bakes the stroke in.
- **Removed**: the whole gradient section of `shapes.ts` (`gradient`, `vGradient`, `vGradient3`, `glossGradient`, `glowGradient`, `drawGlow`, `GradStop`) and `rgba()` in `colors.ts`; nothing in the tree used them any more. Also removed earlier: `drawBevelRect/Base/Face`, `BevelOpts`, `drawRibbon`, `RibbonColors`, `cardShapes.ts` (wing, flame and chamfer silhouettes).

## MIGRATION (for the engineers fixing call sites outside `src/ui`)

| Old habit | New |
|---|---|
| White text on a panel (`uiLabel(t, { color: 0xffffff })`, `Color.text`, `Color.white` as text) | Default ink: `uiLabel(t)`. Pass nothing, or `Color.ink`. Secondary text: `Color.inkSoft` (or `Color.textDim`, same value). |
| Text with a dark stroke + shadow (`stroke: Color.outline, strokeWidth: 5`) | Drop both. Only keep a stroke when the text sits directly on artwork or the dim: `artLabel(t, { size })` or `uiLabel(t, { onArt: true })`. |
| `Color.textDim` as a light grey-lilac on a dark panel | It is now soft brown: right on cream, wrong on the dim. On the dim use `Color.onArt`. |
| `numberText(34, 0xffffff, ...)` | `numberText(34, Color.ink, ...)` (the default); on artwork `numberText(34, Color.onArt, '', true)`. |
| Dark purple fills (`vGradient(Color.panelLight, Color.panelDark)`, `Color.bgDeep` plates, `0x1b1036`...) | A paper piece: `paperShape(...)`, `drawPaper(g, x, y, { w, h, fill: Color.paper })`, or a kit `Panel`. Nested area: `Color.paperDim`. A scene background: `drawFloor(g, w, h)`. |
| `.stroke({ width: 5, color: Color.outline, alignment: 1 })` round a plate | Remove the outline; the shape has a flat shadow and a thin rim instead. |
| `glossGradient`, glossy ellipses, `drawGlow` on a panel or button (all gone from the kit) | Delete the highlight; a burst behind a reward is a flat `paperSun`. |
| `drawBevelRect`, `drawRibbon` | `drawPaper` / `PaperLabel`. |
| White icons on dark buttons | Icons are ink on paper already; leave `drawIcon(name, size)` without a colour. |
| A selected / recommended marker (gold glow, white ring) | One piece of tape: `tapeStrip({ name: 'sky' })` on the corner, or a dashed teal line round the piece (`drawDashedRect`). |
| Section divider (engraved groove) | `Divider` (dashed teal) or `drawDashedLine`. |
| A dark vignette behind popups | `Dim` is warm brown at 0.58; use `Dim.backdrop`, never `0x000000` or purple. |
| Rarity colours | `Rarity[r].color` is the mat / bar colour, `.dark` the edge or a mark on cream, `.light` a pale tint. `.glow` is for effects over artwork only. |
| `style: 'purple'` for a quiet secondary button | `purple` is now a muted violet craft paper (special / premium). The quiet secondary is `neutral` (cream); use `kraft` for a close or back action. |

**Text on artwork**: `artLabel('x12', { size: 28 })`, or sit it on a torn label: `new PaperLabel({ text: '준비해요', size: 28, paper: Color.paper })`.

**A custom paper piece** (HUD plate, field sheet, home card):

```ts
const g = new Graphics();
drawPaper(g, -w / 2, -h / 2, { w, h, radius: 28, fill: Color.paper, seed: paperSeed() });   // shadow + face
drawDashedRect(g, -w / 2 + 14, -h / 2 + 14, w - 28, h - 28, { radius: 18 });                // optional cut line
container.addChild(g, tapeStrip({ name: 'sky', pattern: 'dots' }));                          // one piece of tape
cacheStatic(container);                                                                       // bake once
```
Take one `paperSeed()` when you construct a component and pass it on every redraw; a different seed gives a different wobble.

## Verified

- `npx tsc --noEmit` filtered to `src/ui`, `src/demo/UiDemo.ts`, `tests/ui*`, prints nothing.
- `npx vitest run tests/ui`: 3 files green. New `tests/ui.paper.test.ts` (seeded determinism, wobble stays inside its box and inside 1 to 2.1 px, torn sides and fibre lines, bubble tail splice, dash runs, tape zig-zag, slab clipping, painted-fill silhouette) and a `paper theme` block in `tests/ui.components.test.ts` (contrast of ink on every paper, ink on every button palette, legacy token mapping, warm dim, five distinct rarity hues). The card-silhouette tests went with `cardShapes.ts`.
- Aside browser, `PAGE_ERRORS` is `[]` on every run: all 12 gallery pages at 720 x 1280 and again at 720 x 1600 (page 0, 9, 11), pressed button (held pointerdown), disabled state, confirm and delete dialogs, reward popup, toast, tooltip, full-screen scaffold, selected tab, and the smoke boots `?scene=home`, `?scene=home&tab=cats`, `?scene=battle&chapter=1&seed=7&sandbox=1&runs=5` (the kit renders correctly inside them; their own hard-coded purple rug is not mine). The splash was inspected by un-hiding `#boot` on a loaded page.
- `npx vitest run`: 55 files, everything green except the known `tests/screens.shell.layout.test.ts` "xp ring fraction".

## Screenshots to open

Aside output in the session scratchpad, `shots/final/p0..p11` is the last full pass of the gallery (`?demo=ui&page=0..11`): `p0` palettes and CTA, `p1` states (normal / pressed / disabled / busy / badge) and icon buttons, `p2` panels and popup buttons, `p3` currency pills, bars, rings, toggles, slider, stepper, stars, `p4` paper shapes, washi tape, dashed lines, torn labels, `p5` speech bubbles, tags, badges, divider, `p6` card frames in all five rarities, `p7` all 61 icons, `p8` scroll list, `p9` tab bar and segmented control, `p10` class chips, pips and odds table, **`p11` the approved battle mock rebuilt from kit parts only: hold it next to `art/style2/uistyle_paper.png`**. Also `shots/ui/`: `confirm`, `danger`, `rewards`, `toast`, `tooltip`, `scaffold` (popups, toast, speech-bubble tooltip, full-screen scaffold), `tabs_cards` (selected tab), `splash` (the CSS boot card), `tall_0`, `tall_9`, `tall_11` (720 x 1600), and `shots/smoke/` (`home`, `home_cats`, `battle`: the real game around the kit).

## Known gaps

- Screens outside `src/ui` still hard-code the old colours and white strokes, so they look half-converted until their owners follow the migration table (expected). The Aside tab in this environment renders at about 1.5 fps (the audio demo does the same), so game-clock animations (tooltip hold, reward count-up, toast timing) run at roughly 0.15x speed there; I drove those states directly (`tooltip.show`, `__dbg.ui.*`) and held the pointer down for seconds. Other engineers' Vite reloads also reset the page mid-run now and then.
- The wood floor is flat planks with a few grain streaks; the mock's sunlit window shadows are artwork, not kit.
- Fonts: the Hangul subset `public/fonts/game-kr.woff2` is still stale (see REQUESTS).
- Paper grain only on pieces of 40 000 px² or more (or with `grain: true`); it is a 128 px tile and can show repetition on a very large sheet.
- Reduced motion: the Aside browser reports it, so the press spring, tape and tab slides were checked statically; the tweens are the same code paths as before.

## REQUESTS

1. Run `npm run font` (rebuilds `public/fonts/*.woff2` from every string in `src/`): the Korean subset predates the current strings.
2. `src/core/tween.ts` `Tweener.update`: a throwing callback leaves the list half-compacted; a `try/finally` around the loop that applies the compaction would make it self-healing.
3. Screens that read `ButtonPalettes[x].rimTop/rimBottom/glow` (none found in the tree today) must switch to `base/lip/ink`.
4. Owners of `src/screens/**` and `src/view/hud/**`: apply the MIGRATION table above; the biggest wins are text colours and stroke options, then the `vGradient(Color.panelLight, Color.panelDark)` plates.

## 2026-10-07 QA fixes

Behaviour you can rely on now (everything additive; no export or option was removed):

- **24 px floor.** `MIN_FONT` is 24: `uiLabel`, `numberText`, the `ProgressBar` / `CooldownRing` label, `Badge` counts, `Tag`, `Button` (label and sublabel) and the `CardFrame` name, level, bar and NEW tag all stop at 24. `CardFrame` small is now name 24, level 24, bar 30, plate 80; medium bar 32, plate 92 (the card box did not change). New `ProgressBarOpts.labelSize` (floored at 24) for bars under 43 px, so the HUD no longer needs to overlay its own text. `fitLabel` keeps ellipsising instead of shrinking below the floor; `fitWidth` is still the unconditional shrink (callers own the result).
- **Popups fit what is drawn.** `Popup.layout` takes the narrower of the declared footprint and the drawn bounds of `body` when it decides to scale, so the habitual "+80" padding of `setContentSize` no longer shrinks a 680 px sheet to 0.93 and its 24 px text to 22. A popup that really is wider than the screen still scales. `RewardPopup` now declares `PANEL_W + 48`.
- **One sheet at a time.** `popups.open()` over an open popup cross-fades the lower one out (shell and dim; the new sheet brings its own dim, so it never doubles) and back in when the top one closes. Queue order, `top`, `count` and `closeAll` are unchanged.
- **System Back.** New `backGesture()` (`src/ui/backGesture.ts`): while a popup or a full-screen `ScreenScaffold` that has an `onBack` is shown the page sits on one spare history entry; Back pops it, the handlers run (popups, then the scaffold), and it is pushed again if something is still open. Closing the last overlay with a button drops the spare entry again, so the first Back from home still means "leave". Wired inside `PopupManager` and `ScreenScaffold`; nothing to call. The pure `BackGesture` class takes a `HistoryPort`, so it is unit-tested with a fake history. Capacitor's hardware back is a separate event (platform area): call `popups.handleBack() || ScreenScaffold.handleBack()` from it.
- **Toast** rests at `safeTop + 262`, under the home currency row and the battle wave bar, and rises into place instead of dropping in from the top.
- **Disabled buttons** keep full `Color.ink` on the drained paper (AA, tested); the price on a disabled button stays readable. `mutedPalette` moved to `theme.ts` and is exported.
- **Icons**: `reroll` is two chasing arrows (thin ring, small heads; legible at 36 px); `ad` is a teal television with an ink screen (no violet).
- **Tokens only**: `ProgressBar` (leaf, coral, gem, paperLight), `ClassChip` (bronze, stone), `TabBar` / `SegmentTabs` (labels are built in `inkMid`, selection is `tintToward(inkMid, ink)`, new in `colors.ts`), `Button` / `CurrencyPill` / `CardFrame` / `ScrollView` / `numbers` / `paper` / `shapes` (white, pressTint, woodLight), `core/game.ts` and `core/scene.ts` (woodDark, inkDeep). The only literals left in `src/ui` are `theme.ts`, `icons.ts` (exempt), the white/black of `shade()` in `colors.ts` and the maths of `core/math.ts`.
- **RewardPopup** draws a flat paper sunburst (12 faint cream rays baked once, turned slowly); no gradient, no glow, no additive blend.
- **Storage** (`core/save.ts`): `StorageBackend.volatile?()` (true while writes only reach memory), `reportStorageVolatile()`, `onStorageVolatile(fn)`, `isStorageVolatile()`. `SaveStore.flush` treats a throw or a volatile backend as a lost write, reports it once and retries after 2, 4, 8 ... up to 30 s. The kit shows one warning toast for it (`ui.storage.volatile`, strings in `src/ui/strings.ts`).
- **FxDemo** (`?demo=fx`): wood floor, kraft header, kit paper buttons (88 px high), paper name labels, a warm well behind each effect cell; the cat stand-in and every effect tint use tokens (no purple, no hex).

Verified: `npx tsc --noEmit` clean in `src/ui`, `src/core`, `src/demo`, `tests/ui*`, `tests/core*`; `npx vitest run tests/ui tests/core` 6 files green (new `tests/ui.stack.test.ts`: type floor, muted-button contrast on every palette, `tintToward`, the Back controller with a fake history, popup cover and uncover, popup fit; new `tests/core.save.test.ts`: retry with backoff, memory-only writes, 30 s cap). Aside, `PAGE_ERRORS []`: home toast (`v_toast_home`), two stacked popups with and without motion (stack state read back: lower `visible false / alpha 0 / covered`, top visible, lower back after the top closes), real `history.back()` through one and two popups and after a button close (state `{meowBack:true}` then null), kit reward popup, pause menu and selection sheet in English (`v_pause`, `v_sel`), disabled level-up button (`v_unit_clean`), calendar at scale 1, gallery pages 1, 3, 6, 9, FX gallery (`v_fx3`). A walk over every Text on home / cats / shop / missions / pass / calendar / pause / selection sheet finds nothing under 24 px.

### REQUESTS (outside `src/ui`, `src/demo`, `src/core`)

1. `src/screens/shop/rewards.ts` (`RewardSheet`, `setContentSize(PANEL_W + 80, ...)`): its `paperSun` makes the drawn bounds wider than the declaration, so the sheet is still scaled to 0.978 and its 24 px text renders at 23.5. Declare `PANEL_W + 48` like the kit `RewardPopup`.
2. `src/platform/storage.ts` (`safeStorage` and `createLocalStorageBackend`): they never throw, so `SaveStore` cannot see a lost write. Call `reportStorageVolatile()` from `core/save` in their memory-fallback paths and add `volatile()` (true while any key is memory-only) to the returned backend so `SaveStore` keeps retrying.
3. Settings screen owner: a persistent line when `isStorageVolatile()` is true ("Progress is not being saved on this device"); the toast is shown once and `clearToasts()` on a scene change can swallow it.
4. HUD owner: the countdown bar can use `labelSize: 24` instead of overlaying its own text; refusal toasts now sit at y 262, over the top row of the board rather than the wave bar, check they still read well there.
5. Capacitor / TWA hardware back (`src/platform`): forward it to `popups.handleBack() || ScreenScaffold.handleBack()` (both exported by `@/ui`).
6. `npm run font`: one new string (`ui.storage.volatile`) on top of the existing request.

## 2026-10-07 finishing pass

- **CurrencyPill "+"**: now a cream paper disc (`neutral` IconButton, 58 px) with the ink plus, instead of leaf green on the teal strip. Users: the home top bar (gold, gems, tickets) and `?demo=ui`; the battle currency row has no "+".
- **Dead code**: the gradient and glow helpers of `shapes.ts` and `rgba()` are deleted (see the list above); `src/ui` has no gradient left at all.
- **Applied from the QA requests**: HUD `ProgressBar.labelSize` (battle countdown bar) and the reward sheet's `PANEL_W + 48` content width (its scale is 1, read back in the browser).

## 2026-10-07 motion review

First look at the kit in motion: every frame below was stepped by hand with `game.tick(dt)` at full motion (the Aside tab reports reduced motion, so QA had only seen the reduced paths). Method and tools: `tools/ui_motion.sh <key> <moment.js>` runs a moment through the Aside runner, `tools/ui_motion_capture.js` is its prelude (`scene`, `richHome`, `steps`, `frames`, `down` / `up` / `tap`, `posOf`, `textPos`, `sfxLog`, `tile`), `tools/ui_motion_tile.py` tiles the numbered shots into a labelled strip. The page keeps rendering with `ticker.speed = 0` (a stopped ticker makes the browser time out on screenshots) and the capture advances the game itself; sound calls are logged against the capture clock so the frame of impact can be compared. Things the method taught: a module the dev server changed is imported as `?t=...`, so a plain `import()` is a second copy of `motion` (take the URL from `performance.getEntriesByType('resource')`); a scene built while the OS flag was on keeps its loops off (rebuild the home scene once full motion is on); promise continuations (a transition's `await tween.finished`) only run when the script yields between ticks.

Strips are in the session scratchpad `shots/<folder>/strip_*.png`.

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| Large primary button, press and release | `btn/strip_big` | Right already: pointerdown snaps (0.97, tint, shadow 0.55), release springs 0.28 s (lift 1.5 px, 1.035, 1.6 degrees alternating) | none | same. `IconButton` extends `Button`, so round and small buttons are the same code |
| Disabled button tapped | `btn/strip_dis` | Shake fine, but sound stacked: the button's own `ui_error` plus the toast's `ui_error` (warning) or `ui_tab` (info) on the same frame | `press.ts` `noteRefusal()` / `justRefused()`: a toast opened in the same tap stays quiet; duplicate `audio.play('ui_error')` removed from the START and stake-tag handlers | one cue per refusal |
| Popup open / close | `pop/strip_pop` | Good: 0.82 to 1 with a back ease in 0.18 s, dim fades with it, 0.12 s cubic-in out | none | same |
| Full-screen page open / close | `scaf/strip_scaf` | The floor and header appeared on frame one and vanished on the last frame (a hard cut) while only the content faded | sheet rises 36 px and settles (back 1.5, 0.26 s), header drops 14 px, floor and header fade with it; leaving sinks 14 px in 0.14 s | cross-fades cleanly (also seen in `settings/strip_set`, `unit/strip_unitopen`, `h_start/strip_startp`) |
| Toast in / out | `toast/strip_toast` | Rises 56 px with a back ease, leaves 40 px up in 0.2 s: good (the exit window was missed by one beat, read from the code) | none | same |
| Tooltip | `tip/strip_tip` | Opened with a pop from the tail tip; closing destroyed it in one frame | 0.1 s shrink and fade from the tail tip, apart from the opening tween so a new tooltip cannot cut it short | not re-captured (two runs timed out on a reload) |
| Toggle, slider thumb | `ctl1/strip_tog`, `strip_sld` | Knob slides 0.2 s with a back ease, thumb grows 1.14 and settles: good | none | same |
| Segmented control, tab bar | `ctl4/strip_seg`, `ctl3/strip_tab` | Paper piece slides with a small overshoot; selected tab rises with its tape, the hero circle turns cream: good | none | same |
| Progress bar fill | `ctl2/strip_bar` | A bar with `format` showed its end value (`100%`) from the first frame while the fill was still moving | the derived label is set from the painted edge in `setFill` | label follows the fill |
| Number count-up (currency pill) | `ctl2/strip_cnt` | Roll 0.4 to 0.8 s with the icon punch and tick sounds: good | none | same |
| Card frames re-laid | `ctl4/strip_seg` | Cards resize and the NEW tags grow with them: good | none | same |
| Scroll rubber band and indicator | `scroll/strip_rub` | Band stops at about 65 px, spring back over 0.45 s, indicator fades: good | none | same |

Also changed for the whole screen set (see the other notes): `ScreenScaffold` is what every full-screen page uses, `Button.setLift(px)` raises the paper off its shadow (START bob), `SegmentTabs.select(id, animate, silent)` lets a list that follows its scroll move the highlight without a sound.

### REQUESTS (kit)

1. `src/fx/flyTo.ts`: the burst of a flight starting next to a screen edge sends icons off-screen. The screens now pass a short `burstRadius` / `bulge` near the edges (`screens/shell/flight.ts`); a clamp inside `flyTo` would cover every caller.
2. `src/audio`: `place` is used as the stamp's knock (volume 0.45). A dedicated short "stamp" sound would fit better. (Answered in the second pass below: the stamp now plays `reward_claim`.)

### Second pass (the rest of the list)

Same method; new capture helpers: `texts()` (every visible string with its design position, to find what to tap) and a retry of a timed-out screenshot in `steps()`. Two more pitfalls: a step of 0.25 s or more distorts any choreography that is a chain of awaited promises (the chest reveal showed cards "missing" at dt 0.5, they were just between continuations; a dt of 1 s also lets two tweens of one object end in the same update), so keep steps at or under 0.17 s and use `adv()` for the long gaps; and the Vite dev server reloads the page whenever any file is saved (the other half of the game is being edited all the time), so a run that suddenly reads `window.__cap` as undefined was reloaded mid-way, run it again.

| Moment | Strip | Before | Change | After |
|---|---|---|---|---|
| Number count-up start (`CurrencyPill.setAmount(x, true)`) | measured per frame in `req1` (text and sound per tick) | A tween takes its first step on the tick after the call, and the tick sound played on every changed integer: a big number is shown abbreviated (`2만` to `2.01만` needs 100 more), so the sound came 1 to 3 frames before anything moved on screen | the first step is taken in the call itself; the tick plays only when the shown text changes; the tick of that first step is owed to the next frame (the one that draws it), so a roll that is put straight back in the same frame (`Shell.pending` after `refresh()` in every claim) stays silent | `0 + 400`: text `30` on the call, tick on the first drawn frame; `20000 + 800`: `2만` until the second frame, then `2.01만` with its tick; put back in the same frame: no sound |
| Page landed (`ScreenScaffold.show`) | none (API) | the promise resolved on completion and also when the slide was killed, and nothing said so | `show(animate = true, onLanded?)`: `onLanded` runs on the frame the page has landed (at once without motion), never when `hide()` / `destroy()` cut the slide short; the promise is unchanged | the pre-run page starts its START bob when it has landed instead of while it rises |
| Tooltip fade-out | `tip/strip_tp` | not re-captured | none | the bubble shrinks to its tail tip and fades in about 0.1 s, nothing left behind |
| Refusal sound plus toast | sound logs of `cup`, `buy`, `short` | 15 sites played `ui_error` and then opened a warning / error toast that played `ui_error` again in the same frame | `refusalCue()` (`@/ui/press`): the cue and `noteRefusal()` in one call, used where a toast explains the refusal in the same handler | one cue per refusal |
| Rubber-stamp sound | `cup`, `passall`, `cal`, `chestd` logs | the stamp's landing borrowed `place` at 0.45 | `stampThud()` plays `reward_claim` (the audio owner's rubber stamp: dull thud, paper slap, one kalimba ding) at 0.7 | see `routine.md`: a claim leaves its sound to the stamp's landing |

`ScreenScaffold.show(animate, onLanded)` is additive: every existing call (`void scaffold.show(true)`) is unchanged.

### REQUESTS (second pass)

1. `src/audio`: `reward_claim` ends in a kalimba ding, which is right for "claimed" and a bit much for the "sold" and the level-up stamps (they sound on top of `purchase` / `upgrade`). An id that is only the stamp (thud and slap) would let `stampThud` pick by context.
2. `src/platform/adapters/devOverlay.ts`: the dev purchase and ad sheets are DOM overlays in the old deep purple with a yellow button (see its header comment); they are what a tester sees between the shop and the reward popup. Their timing is CSS, not the game clock, so no strip can show it.


## 2026-10-07 owner feedback

**A. The selected tab's paper was too short.** Root cause: `Tab.redrawPaper` cut the cream tab `barH - STRIP_TOP + 30` tall from `y = -STRIP_TOP - 8`, so it ended 22 px above the bar's bottom edge and the 24 px label (centre line 102) hung out over the kraft strip; the hero tab had no paper at all, so its label always sat on the kraft. Now the paper is a pure box, `tabPaperBox(cell, barH, featured)` in `layoutMath.ts` (constants in `TAB_BAR`): it starts above the torn edge and runs `TAB_BAR.bleed` (40 px) past the bar's bottom *including `game.safeBottom`*, so its rounded corners, rim and shadow are always off the screen and no bottom edge is ever seen. The hero tab (selected) now stands on the same kind of cream paper, taller (top at -58, it has to hold the raised disc), with the coral disc on it; its disc keeps its own tape. The hit area of the hero follows. Nothing else of `TabBar` changed (names, options, badge, lock).
Tests: `tests/ui.stack.test.ts` "tab bar paper" (icon and label inside the sheet, bottom edge past the screen with a 0 / 20 / 34 px inset, hero above its disc).
Stills (scratchpad `shots/a/`): `sheet_ko` (all five tabs selected, 720 x 1280), `sheet_en_tall` (English, 720 x 1600 with a 34 px inset, badges on three tabs), and `shots/dm/sheet.png` (the kit gallery `?demo=ui&page=9`: hero, a plain tab with a badge, the badge-9+ tab).

**Capture helpers** (`tools/ui_motion_capture.js`): `tall(on, inset)` replaces the page's visual viewport (720 x 1600 design space, optional home-indicator inset) so tall layouts can be captured; `snap(name)` is `shot` with the retry the runner needs when the tab is not the one being drawn. One more pitfall for whoever follows: while another engineer saves files, the dev server on 5173 reloads the page about every 20 s and a long capture dies halfway. I ran my captures on a frozen copy of the tree (a second Vite in the scratchpad on port 5174, `GAME_PORT=5174`), re-syncing only my own paths between runs.

## 2026-10-07 last gaps

- **Button: the icon could sit on its own sublabel.** A button with an icon, a label and a sublabel (the guidebook button in the settings sheet: a 52 px "?" next to a 40 px label, with a 24 px sublabel under it) gave the first row `fontSize * 1.08` of height, so an icon taller than that line hung about 4 px into the sublabel row. The row heights are now `buttonRows(fontSize, iconSize, subFontSize, hasLabel, hasSub)` in `layoutMath.ts` (first row = the taller of the label line and the icon); buttons without a sublabel are placed exactly as before. Test: `tests/ui.components.test.ts` "buttonRows". Seen fixed in the settings sheet's first button and in the sweep card's gem button.
- **`ScrollView.scrollToShow(target, margin = 24, animated = false)`**: scrolls just far enough to bring a descendant of `content` fully into view (a target taller than the view lines its top edge up). Used by the home pointer (see `shell.md`).
- **Alignment audit**: method and result in `shell.md` ("2026-10-07 last gaps", item 4). The kit's only fault was the Button above.
