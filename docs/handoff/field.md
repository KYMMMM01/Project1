# Handoff: field (battle scene and playfield), paper scrapbook restyle

Date 2026-10-06. Paths: `src/scenes/BattleScene.ts`, `src/view/field/**`, `src/view/layout.ts`, `src/view/strings.ts`, `tests/view.field*.test.ts`. The playfield now lives in the paper world of `docs/handoff/ui.md`: cut paper on a wooden floor, flat warm shadows, dashed teal lines, washi tape. Behaviour, timing and the contract (`src/view/context.ts`) are unchanged; the earlier hand-off (clock, input rules, pooling, hand-off to the director) still holds and is summarised in "How it is wired".

## The look, piece by piece

| Piece | How it is made |
|---|---|
| **Board** (`rug.ts`) | One cream sheet (`buildRug(skin)`, origin = top-left, still exports `RUG_W/RUG_H/RUG_X/RUG_Y`, used by the shop preview): hand-cut edge on a flat shadow (`drawPaperShadow/Face`, one `paperSeed()`), the skin's flat pattern, a dashed line 8 px inside (`drawDashedRect`), one strip of tape at the top, and twenty cell squares laid on it (a shade darker, soft irregular corners, own seed each). The pattern is drawn twice: full strength under the cells (it shows in the gutters and the rim) and as a whisper over them. Baked once with `cacheStatic`. |
| **Rug skins** (`rugSkins.ts`) | All 13 ids are craft mats: `{ pattern, paper, mark, dash, tape, tapePrint }`, every colour a kit token or a `mixColor` of two (no hex). Default = the mock's cream sheet, plain, teal dash, sky dotted tape. Patterns: plain, stripes, gingham, dots, paws, waves, stars, diamond. `cellPaper(skin)` = the sheet a shade darker. |
| **Walkway** (`walkway.ts`) | A quiet trail of paw prints in `woodDark` at 34 % alpha along the loop, four small cream paper arrow tags at the corners (travel direction), and the entrance: a cut-paper mouse door with a dark opening and a coral arrow tag in front of it. Baked once. This game has no leak point (enemies circle until the field count rules end the run, see the battle spec), so there is nothing else to sign. |
| **Cells** (`cells.ts`, `art.ts`) | Three shared sprites per cell: a flat paper tint (`tileFill`, tinted), a dashed outline (`tileRing`, tinted) and a small round sticker. Looks: `selected` teal, `origin` kraft (the empty slot a lifted cat left), `move` teal, `swap` mustard, `merge` leaf green, `blocked` berry. Moves and swaps stay quiet (faint tint and outline) until the pointer is over them; merges stay loud and their outline breathes; blocked shows a soft berry tint and a sticker only under the pointer. Every look has its own sticker as well as its colour. Press = the paper dips. |
| **Drag preview** (`preview.ts`) | Over an identical cat: a paper speech bubble with the RESULT's portrait, its name and its rank name from `mergeResultOf(held.id)` (the line a build follows; flips below the cell on the top row, tail always on the target, clamped to the field). Over an empty cell: a 40 % ghost of the held cat. Over another cat: a ghost of that cat in the cell the held one left. One pooled object, redrawn only when the result or tail changes, never per frame. |
| **Cats** (`unitView.ts`) | A flat ground shadow, a **rank tag** under the feet (paper in the rarity hue with one cream pip per rank, so rank never rests on colour), a **class sticker** (round, class paper, cream border, flat shadow) at the left foot, sunlit = a warm tint (no glow). Lifted: the shadow grows, the sprite rises, tilts the way it is pulled and leans (`lean`). Shield = flat sky bubble with a cream outline; cannot act = berry sticker with a slash. Spawn and reveal pops overshoot a little (1.7 to 2.1, was 2.2 to 3.0). |
| **Enemies** (`enemyView.ts`) | Flat shadow; **health bar** = kraft strip (9-slice) with a painted fill (`paintTexture`, leaf / mustard / coral by health) and a sky shield segment; elite = mustard star sticker and a dashed mustard ground ring, boss = berry crown sticker and a dashed berry ring; status = flat tints plus one small sticker above the bar (slow, freeze, burn, poison, rage); focus = dashed berry ring; stun = a paper star. |
| **Range ring** (`rangeRing.ts`) | A dashed teal circle (dashes of constant length at any range) with a faint flat teal fill, clipped to the field. |
| **Shots** (`projectiles.ts`, `projectileLooks.ts`, `art.ts`) | Flat shapes with a cream sticker border and a thin ink edge; the streak behind is a pale flat swipe (no additive glow). `ProjectileLook.glow` is gone. |
| **Sell tag** (`sellTag.ts`) | A cream paper pill, berry-dark "Sell" cue, fish icon, ink amount. |
| **Floor** (`background.ts`) | The chapter art is untouched; on top of it a warm vignette (one stretched sprite of `fxVignette()` in `Color.shadow`) and a warm shade at the top and bottom (no more purple-brown `bgDeep`), so the cream sheet stays the brightest thing on the floor. |
| **Ground effects** (`effects.ts` + `fx/zones.ts`) | Sunbeam cell = a flat mustard patch, two pale leaning bands and a small sun sticker; hazard warning and active hazard = berry dashed outline, flat tint (water blue or mustard), a drop or bolt sticker. See `fx.md`. |

## Files

`art.ts` (baked textures: shadow, rank tags, class stickers, cell stickers, tile paper and outline, rings, shield bubble, status and elite/boss stickers, bar track, shot shapes), `background.ts`, `cells.ts`, `clock.ts`, `debug.ts`, `effects.ts`, `enemies.ts`, `enemyView.ts`, `env.ts`, `index.ts`, `input.ts`, `motion.ts`, `policy.ts` (tints are tokens now), `preview.ts` (new), `projectileLooks.ts`, `projectiles.ts`, `rangeRing.ts`, `rug.ts`, `rugSkins.ts`, `sellTag.ts`, `unitView.ts`, `units.ts`, `walkway.ts`.

Removed because the restyle left them unused: `perimeterDashes` (stitching), the rarity glow colour of the merge look (`UnitViews.mergeColor`), the rarity base discs, the sunlit glow sprite, additive trails and glows on shots, the enemy aura and the dark health plate.

## How it is wired

- Layer tree: `background`, then the never-moving `shake` container holding `fieldRoot` with `floor, zones, fxBack, enemies, units, projectiles, fxFront, numbers`, then `hud`, then `overlay`. Cells and the drag preview use `floor` (tints, ghosts) and `projectiles` (stickers and the bubble, above the cats).
- Clock (`BattleScene.update`), pause, hit-stop and slow motion: unchanged. The field reads the simulation every frame and uses events only for flourishes.
- Awakening hand-off, boss death hold, drag events, refusal head-shake: unchanged (the cut-in in `fx.md` now hands over to the new cat as before; seen working, see below).
- Rug skins reach the field through `RunConfig.rugSkin` -> `rugSkin(id)`; unknown ids fall back to `DEFAULT_RUG`.
- Debug route and hooks unchanged: `?scene=battle&chapter=N&seed=N&sandbox=1&runs=N&rug=ID&lang=en|ko&debug=1`, `window.__dbg.battle`.

## Verified

- `npx tsc --noEmit` prints nothing for the whole tree; `npx vitest run tests/view.field tests/view.director tests/fx` = 13 files, 262 tests green (full suite: the one known `screens.shell.layout` xp-ring failure only). New or changed tests: rug skins as paper (token colours, cells a shade darker, every tape name exists, default = the mock's sheet), unit tints as tokens, sticker numerals (see `fx.md`), the no-purple palette test (see `director.md`).
- Browser (Aside, `PAGE_ERRORS` `[]` in every run), screenshots in `scratchpad/shots/field/` (open these): `s1_prep` (prep with cats, sunbeams, shield bubble, walkway, entrance), `s1_selected`, `s1_drag_merge` (leaf outlines, result bubble, origin outline, lifted cat), `s1_drag_move`, `s1_drag_swap` (ghosts, quiet outlines), `s8_sell` (paper sell tag), `s8_laser`, `s2_cutin_b`, `s2_boss_warning`, `s2_hazard_warn`, `s2_hazard_warn2`, `s11_after` (awakened cat in place after the cut-in), `s9_victory_a/b`, `s6_defeat_a/b`, `ch1` to `ch5` and `ch1_tall` to `ch5_tall` (each chapter with its own mat, 720 x 1280 and the 720 x 1600 layout), `crowd1/2` (crowded wave 21, chapter 3), `rugs_sheet` (all 13 mats with cats on them), `en_drag_merge`, `en_banners`, `en_tall` (English).
- Tall layouts were produced by overriding `window.visualViewport` to 405 x 900 and firing `resize` (`game.h` becomes 1600).
- Frame time (Aside, chapter 3, wave 21, 20 cats, 48 enemies on screen, speed 3, 150 frames of `game.tick + render + gl.finish`, same script before and after): before mean 9.2 ms, p50 7.7, p95 17.2; after mean 9.4, 9.7 and 9.2 ms over three runs, p50 7.5 to 8.3, p95 15.7 to 17.8. No measurable change. Every paper shape is baked once (`cacheStatic` or texture bakes in `art.ts`), cell and status looks switch textures and tints only.

## Known gaps

- The sell zone is the HUD's panel: a dragged cat disappears behind it (the field layer sits under the HUD), only the sell tag shows. Unchanged behaviour, noted for the HUD owner.
- The `blocked` cell look (berry tint, no-entry sticker) was checked in code and in the art bake, but not captured with a real blocked target (a hazard-wet cell) in the browser.
- Zone looks of the three zone casters (blizzard, black hole, potion cloud) were seen only as the green potion discs in `crowd1`; blizzard and black hole are covered by the unit tests only.
- Enemy status stickers were seen (slow, burn); freeze, poison and rage share the same code path and were not individually captured.
- No leak point exists in the rules (see Walkway), so only the entrance carries a sign.
- Touch input on a real phone was not tested.

## REQUESTS

None. For other parts: the shop's `fxPreview` (`src/screens/shop/blocksStyle.ts`) still draws the old dark gradient and `drawGlow`; its rug preview uses `buildRug` and picks up the new mats without a change.
