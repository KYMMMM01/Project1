# Handoff: field (battle scene and playfield), paper scrapbook restyle

Date 2026-10-06. Paths: `src/scenes/BattleScene.ts`, `src/view/field/**`, `src/view/layout.ts`, `src/view/strings.ts`, `tests/view.field*.test.ts`. The playfield now lives in the paper world of `docs/handoff/ui.md`: cut paper on a wooden floor, flat warm shadows, dashed teal lines, washi tape. Behaviour, timing and the contract (`src/view/context.ts`) are unchanged; the earlier hand-off (clock, input rules, pooling, hand-off to the director) still holds and is summarised in "How it is wired".

## The look, piece by piece

| Piece | How it is made |
|---|---|
| **Board** (`rug.ts`) | One cream sheet (`buildRug(skin)`, origin = top-left, still exports `RUG_W/RUG_H/RUG_X/RUG_Y`, used by the shop preview): hand-cut edge on a flat shadow (`drawPaperShadow/Face`, one `paperSeed()`), the skin's flat pattern, a dashed line 8 px inside (`drawDashedRect`), one strip of tape at the top, and twenty cell squares laid on it (a shade darker, soft irregular corners, own seed each). The pattern is drawn twice: full strength under the cells (it shows in the gutters and the rim) and as a whisper over them. Baked once with `cacheStatic`. |
| **Rug skins** (`rugSkins.ts`) | All 13 ids are craft mats: `{ pattern, paper, mark, dash, tape, tapePrint }`, every colour a kit token or a `mixColor` of two (no hex). Default = the mock's cream sheet, plain, teal dash, sky dotted tape. Patterns: plain, stripes, gingham, dots, paws, waves, stars, diamond. `cellPaper(skin)` = the sheet a shade darker. |
| **Walkway** (`walkway.ts`) | A quiet trail of paw prints in `woodDark` at 34 % alpha along the loop, four small cream paper arrow tags at the corners (travel direction), and the entrance: a cut-paper mouse door with a dark opening and a coral arrow tag in front of it. Baked once. This game has no leak point (enemies circle until the field count rules end the run, see the battle spec), so there is nothing else to sign. |
| **Cells** (`cells.ts`, `art.ts`) | Three shared sprites per cell: a flat paper tint (`tileFill`, tinted), a dashed outline (`tileRing`, tinted) and a small round sticker. Looks: `selected` teal, `origin` kraft (the empty slot a lifted cat left), `move` teal, `swap` mustard, `merge` leaf green, `blocked` berry. Moves and swaps stay quiet (faint tint and outline) until the pointer is over them (while a cat is merely selected, `pick` = the same teal outline plus the move sticker on every empty cell, because a tap there moves it; a swap shows nothing, a tap on another cat selects it); merges stay loud and their outline breathes; blocked shows a soft berry tint and a sticker only under the pointer. Every look has its own sticker as well as its colour. Press = the paper dips. |
| **Drag preview** (`preview.ts`) | Over an identical cat: a paper speech bubble with the RESULT's portrait, its name and its rank name from `mergeResultOf(held.id)` (the line a build follows; sits over the row above or under the row below, whichever hides fewer cats (`previewBelow`), the top row always below and the bottom row always above, tail always on the target, clamped to the field; gone the moment the cat is released). Over an empty cell: a 40 % ghost of the held cat. Over another cat: a ghost of that cat in the cell the held one left. One pooled object, redrawn only when the result or tail changes, never per frame. |
| **Cats** (`unitView.ts`) | A flat ground shadow, a **rank tag** under the feet (paper in the rarity hue with one cream pip per rank, so rank never rests on colour), a **class sticker** (round, class paper, cream border, flat shadow) at the left foot, sunlit = a warm tint (no glow). Lifted: the shadow grows, the sprite rises, tilts the way it is pulled and leans (`lean`). Shield = flat dashed sky ring (opaque, like the selection ring); cannot act = berry sticker with a slash. Spawn and reveal pops overshoot a little (1.7 to 2.1, was 2.2 to 3.0). |
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

- (2026-10-07: a lifted cat is drawn above the sell strip now, see the polish section.)
- (2026-10-07: the `blocked` look was captured by forcing `dropAction` to `'none'`; see the polish section.)
- (2026-10-07: blizzard, black hole and potion cloud were captured, see the polish section.)
- (2026-10-07: every status sticker was captured, see the polish section.)
- No leak point exists in the rules (see Walkway), so only the entrance carries a sign.
- Touch input on a real phone was not tested.

## REQUESTS

None. For other parts: the shop's `fxPreview` (`src/screens/shop/blocksStyle.ts`) still draws the old dark gradient and `drawGlow`; its rug preview uses `buildRug` and picks up the new mats without a change.

## 2026-10-07 polish

**A lifted cat stays visible over the sell strip.** The strip is HUD paper (layer `hud`) and the playfield layers are below it, so a cat dragged past the field edge went under the strip and only its sell tag showed. `createField` now adds a field-space container `field-lift` to `layers.overlay` (the layer above the HUD; added before the director's banner host, so banners stay on top; `context.ts` untouched) and `UnitViews.seat` moves a view there while `liftsAboveHud(dragging, selling, y)` (new, pure, `policy.ts`, tested) is true: while held, while being sold (the 0.22 s shrink plays above the strip instead of behind it) and while it springs home from below `FIELD_H - 24`. Everything else stays in `units`. The lift is repositioned in `resize`. It is not shaken with the board. Proof: `shots/polish/c1_sell_hold_ko.png` (the viking cat above the berry strip, price tag above it), `c1_sell_exit_ko` (mid-sale); lift children 1 while held and 0 after the sale.

**Verified after the restyle (browser, `PAGE_ERRORS []`):** enemy status stickers, one per enemy (freeze, slow, burn, poison, rage, shield bar with its sky segment, stun star, focus ring) in `c2_status_zones_b.png`; the weaken swirl on a cat, the blizzard disc, the black-hole spiral, the potion cloud, a wet puddle with its berry dashed outline and drop sticker, and the "cannot act" sticker on cats standing on wet and zap cells in `c2_zones_hazards.png`. The status tints are faint on a green cucumber (a multiply tint); the stickers carry the meaning, so nothing was changed. The `blocked` drop-target look was forced with `battle.dropAction = () => 'none'` while dragging (`c3_crop.png`: soft berry tint on the empty cells, berry dashed outline and no-entry sticker under the pointer). It cannot occur with the current rules (`dropActionOf` returns `'none'` only for a bad source cell), so it stays as the total mapping of `DropAction` and was not removed.

Known gaps now: touch input on a real phone, as before.

## 2026-10-07 QA fixes

See `battle.md`. Field side: `decideTap` never swaps (a tap selects, moves or merges), the `pick` cell look for the move targets of a selected cat, `previewBelow(row, rows, hiddenAbove, hiddenBelow, roomAbove, roomBelow)` with the preview hidden on release, the sell tag with the purr, the 26 px rank tag, the opaque dashed shield ring, `EnemyView.drawX()` keeping big bodies on screen, number bounds from the layout (`clampNumbers`).

## 2026-10-07 motion review

Seen frame by frame at full motion (full table in `director.md`, "2026-10-07 motion review"). What changed in the field:

- `src/view/timing.ts` (new, shared with the director): `SLIDE_SECONDS`, `MERGE_SECONDS`, `REVEAL_DELAY` / `REVEAL_OVERSHOOT` / `REVEAL_MS` per rank, `QUICK_REVEAL_WINDOW`, `ANTICIPATION_SECONDS`.
- `units.ts`: every sticker tween (pop, hop, merge flight and hold, molt, sell, refusal, drag spring-back) runs on `ctx.ui`; a summon holds its cat until the effect's impact (rank delay, short reveal when a second legendary-or-better follows within 3 s); a merge's materials arrive on the burst (`MERGE_SECONDS`).
- `unitView.ts`: `appear(tweens, overshoot, ms, delay)` hides the whole view during the delay, pops the body, grows the shadow and rank tag, then slaps the class sticker on; the attack coils from the unit's `charge` (`coilPose`) and starts from that coil (`windStart`), so the lunge is on the release frame.
- `input.ts`: a cat that has not shown yet cannot be picked up.
- Tests: `view.field.motion.test.ts` (coil continuity, rank ladder, hop and merge lengths).

Second pass (table in `director.md`): `MOLT_SECONDS` and `BOSS_DROP` in `timing.ts`; `EnemyView.appear(tweens, ui)` drops a boss onto the lane (0.14 s, real time) and lands it with a squash, reduced motion keeps the fade-in pop.


## 2026-10-07 owner feedback

- **Arrivals (`arrivals.ts`, `units.ts`, `unitView.ts`, `toss.ts`).** `UnitViews` listens for `summon`; when the view is made the cat's pop waits `tossFor(source)` (0.26 s for the button, the script and a pick; none for relic gifts and under reduced motion) plus the rank's own delay. `Arrivals.toss` flies a pooled paper sticker in the rank's colour with a paw on it from `ctx.anchor('summon')` (a pick: from where the sheet was) along an arc (`tossPoint`, lifted by `tossLift`, `tossScale` swells it in the air) on `ctx.ui`, with a quiet `whoosh`; on the landing frame `Arrivals.ring` flashes a dashed ring round the cell on `layers.fxFront` (cream rim under dashes in the rank's deep colour, coral for the first rank), 0.7 s, settling from 1.3x; nothing waits for it (input is never blocked). The cat wears a paper "NEW" tag (`Tag`, `view.new`) from its pop for `NEW_TAG_SECONDS` = 2 s on the field's clock; each view has its own, so several quick summons each keep theirs. Reduced motion: no flight, the ring (no pulse) and the tag (no pop) still show. [`of1/d2/d2`, `of5/d3/d3_rapid_full`, `d3_single_reduced`]
- **Sunbeam cells (`fx/zones.ts`, see `fx.md`).** The field changed only around them: `UnitView.sunMark` (a small sun sticker, upper right of a cat standing in the light, pops on with an overshoot and rocks; the baked `art.sunMark`), `SunNote` + `FieldInput.onEmptyTap`: a tap on an empty lit cell says "A sunny cell. A cat standing here attacks {n}% faster." in the kit's bubble, `n` from `sunMath.sunBonusPercent(relics)` (base `SUN_SPEED` plus `sunny_spot`), tested. Checked on all 13 mats with a cat on three lit cells and two empty ones, over all five chapter backgrounds [`of2/sheets/rugs_sun_sheet`].
- **Laser (`laser.ts`, `enemyView.ts`, `effects.ts`).** `LaserView`: while the dot is about to be placed (`aimingFor()`) or is on, the lane is a pale paper band with dashed teal edges (brightest while aiming, calmer while active); while it is on a paper tag follows the dot with the real bonus and the seconds left (long form for the first 2.6 s: "Cats hit enemies near here first / Damage +15% . 5s", then "+15% . 4s"). `EnemyView.targetMark`: a coral crosshair sticker over every enemy the sim marks `focused` (pops on and off with `damp`, breathes). `laserDot` draws the marked area (`ZoneOpts.radius`, the sim's 130 px).
- **Numbers.** `FloatingNumbers.minX / minY / maxX` bounds unchanged; hits that would end on the clamp line are spread (fx.md).

Tests: `view.field.sun.test.ts`; the field's pure parts live in `toss.ts` (`view.toss.test.ts`).

## 2026-10-07 owner feedback (second round)

- **Areas on the field (`effects.ts`).** `Roster` keeps the live handles by key (a zone's uid, a clock's uid) and sweeps what nobody asked for. Each zone and hazard handle gets `setLeft(timeLeft / speed, duration / speed)` every frame (so the warning is one real second at 3x too). Enemies inside a zone or a ring (the simulation's own test: distance < radius + enemy radius) get `EnemyViews.zoneTouch(uid, kind)`; the `EnemyView` shows a 29 px tag (snowflake, bubbles, spiral, chevrons, plus; `art.zoneMark`) beside the health bar, popping on and fading 0.6 s after the last touch. Rings follow clocks and pills (at most four).
- **Weapons (see `src/view/weapons.ts`, the one table).** `motion.ts`: a pose is `{ lunge, sx, sy, rot, rise }`; `coilPose(spec, coil)` is the wind-up (the cat coils in `spec.lead` seconds before the release), `releasePose(spec, t, coil0)` starts exactly where the coil left it, reaches the contact pose after `strike` (0.03 to 0.08 s, so contact is on the frame of the sound) and returns with a rebound and a shiver (`twang`). `UnitView` plays it per cat.
- **Shots (`projectileLooks.ts`, `projectiles.ts`, `art.ts`).** Every shot is drawn 1.2 to 1.5 times bigger; snowballs, fireballs, ladles and coins fly in an arc (`lob` px, swelling at the top, with a ground shadow on the straight line); the cork gun fires a cork, the fireball is a flame turned head first, the chef throws a ladle (was a bone).
- **Marks (`weaponMarks.ts`, pooled, 22 at most, 8 started per frame, light ones give way above 14).** Swing: sword arc, axe chop, polearm sweep, katana thin line (all from the `strike` / `attack` events), the cork gun's smoke. Impact: star burst (blunt), stuck arrow riding the enemy for 0.7 s, splat (snow) and scorch (fire) once per shot, spark (shuriken, lightning, star arrow), ring (bell, frost, void), notes (lute), coin (flip), potion shatter with its zone.
- **Enemy reactions (`reactions.ts`, `enemies.ts`).** The material comes from the audio module's own `foeHitSfx`, so sound and picture agree: soft things (cucumber, dust, drop, balloon, cloud) squash and wobble; hard ones (roomba, clock, cone, dryer, spray, glass) knock back rigidly and rattle; paper flutters. The white flash is a tint in the weapon's colour. A body answers at most every 70 ms; a heavy weapon and a crit move it more.
- Tests: `view.field.motion.test.ts` (every cat's pose: continuity, contact timing, distinct wind-ups), `view.field.weapons.test.ts` (the table, materials, marks: pooling, budgets, reduced motion), `view.field.clock.test.ts` (looks).

## 2026-10-07 last gaps

Performance of a crowded wave: see `fx.md` ("the crowded wave got slower, and why"). Field side: `EnemyView.flash` (a persistent flat copy of the body that is only faded, so a hit changes no structure; it replaces `hitFlash` on enemies), `policy.depthKey` / `depthFrame` (the enemy layer is sorted every 4th frame, key rounded to 6 px), `FieldEffects.update(dt)` looks up who stands in an area or ring every 0.1 s (the zone tag holds 0.6 s). Tests: `view.field.policy.test.ts`.
