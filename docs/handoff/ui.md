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
- **Retired but kept so old call sites compile**: `glossGradient` returns a fully transparent gradient; `drawPill`'s `gloss`, `rim`, `outlineWidth` and `drawShadow`'s `spread` are accepted and ignored; `drawGlow` is unchanged but is for light over artwork only. **Removed**: `drawBevelRect/Base/Face`, `BevelOpts`, `drawRibbon`, `RibbonColors`, `cardShapes.ts` (wing, flame and chamfer silhouettes).

## MIGRATION (for the engineers fixing call sites outside `src/ui`)

| Old habit | New |
|---|---|
| White text on a panel (`uiLabel(t, { color: 0xffffff })`, `Color.text`, `Color.white` as text) | Default ink: `uiLabel(t)`. Pass nothing, or `Color.ink`. Secondary text: `Color.inkSoft` (or `Color.textDim`, same value). |
| Text with a dark stroke + shadow (`stroke: Color.outline, strokeWidth: 5`) | Drop both. Only keep a stroke when the text sits directly on artwork or the dim: `artLabel(t, { size })` or `uiLabel(t, { onArt: true })`. |
| `Color.textDim` as a light grey-lilac on a dark panel | It is now soft brown: right on cream, wrong on the dim. On the dim use `Color.onArt`. |
| `numberText(34, 0xffffff, ...)` | `numberText(34, Color.ink, ...)` (the default); on artwork `numberText(34, Color.onArt, '', true)`. |
| Dark purple fills (`vGradient(Color.panelLight, Color.panelDark)`, `Color.bgDeep` plates, `0x1b1036`...) | A paper piece: `paperShape(...)`, `drawPaper(g, x, y, { w, h, fill: Color.paper })`, or a kit `Panel`. Nested area: `Color.paperDim`. A scene background: `drawFloor(g, w, h)`. |
| `.stroke({ width: 5, color: Color.outline, alignment: 1 })` round a plate | Remove the outline; the shape has a flat shadow and a thin rim instead. |
| `glossGradient`, glossy ellipses, `drawGlow` on a panel or button | Delete the highlight. Keep `drawGlow` only for light over artwork (a chest burst, rays). |
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
