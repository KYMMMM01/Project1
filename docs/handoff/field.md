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

## 2026-10-07 fixups

`SunNote.show(cell)` asks `info.tap('sun:<cell>', anchor, text)` (`src/view/info.ts`; the HUD draws it): the same lit cell again closes the note, another lit cell replaces it, a tap elsewhere or 5 s closes it (see `hud.md`). The field no longer uses the kit tooltip.


## 2026-10-07 leftovers

Warm-up of the field (see `fx.md` for the queue and the numbers): `field/warmPlan.ts` (pure: `enemyArtKey` = the rule of `enemyTextureKey` with the lookup passed in, `auraAreaOf`, `waveNeeds(previewEntries, has)` = pictures, aura areas and head count of a wave, `spareFor(count)` = 4 to 12 bodies), `field/warmup.ts` (`FieldWarmup`: when the wave or phase changes it reads `previewWave(wave + 1)`, then one frame at a time and never on a slow frame it makes one enemy body for the pool, `EnemyViews.spare(n)`, and one pooled ground-area view, `Fx.readyArea(kind)` for the ground effects' `Fx`, only for a kind that has been baked). A body is a dozen sprites; the first enemy of a battle used to build its bodies and its aura ring on the frame it walked in (first clock 14 ms, first pill 22 ms). `__dbg.battle.warmLeft()` says what the queue has left. Tests: `view.field.warm.test.ts` (7, over the real wave scripts of all five chapters).


## 2026-10-08 VFX polish

What the field draws for the battle effects changed (the painted sprites, the colours and the layer code are in `fx.md`, "2026-10-08 VFX polish"). Battle effects are no longer paper; cats, enemies, the HUD and the board still are.

**Shots** (`projectileLooks.ts`, `projectiles.ts`; the baked paper shapes of `art.ts` are gone). A shot is its painted picture with, in four shared containers (shadows, painted streaks, pictures, additive lights): an orientation, a path, a streak, a light, and what it sheds. `ProjectileLook`: `paint`, `size`, `spin`, `oriented`, `flip`, `lob`, `tint`, `streak`, `glow`, `shed`.

| Cat | Picture and flight | Streak and light | Sheds |
|---|---|---|---|
| r_sling | pebble, 36 px, tumbling, straight | dusty streak | dust |
| r_archer | green-fletched arrow, 88 px, points along its path, straight | pale green streak | none |
| r_ninja | steel shuriken, 48 px, spins fast, straight | cold streak and light | glints |
| r_gunner | cork, 50 px, points along its path, fast | warm streak | gunsmoke |
| r_star | moon arrow, 96 px (tinted deeper so it reads on cream), straight | long silver-blue streak, moon light | sparkles |
| m_snow | snowball, 46 px, thrown on an arc (34 px), spins | cold light | snow dust |
| m_fire | fireball, 80 px, thrown on an arc (30 px), the flame tail trails because the picture turns along the arc | orange streak, warm light | embers |
| t_bell | the bell's sound ring, 60 px, faces its flight | gold light | sparkles |
| t_chef | ladle, 72 px, tumbles on a low arc | none | steam |
| t_bard | pink note, upright, a little sway | pink light | pink sparkles |
| t_lucky | gold coin, flips edge-on, arc | gold light | glints |

Size and light grow with the cat's rank (`rankSize` 1 to 1.24, `rankLight` 0.8 to 1.1). A small stretch at launch (long and thin for what points along its path, a pop for what spins; none under reduced motion). The picture follows the tangent of the arc it really draws (the simulation's path is straight; the arc is drawn on top, as before). Shed particles stop being made once the flecks are 55 % full, so a hit always has room for its own.

**The throw of an area.** The ice queen, the cosmic cat and the alchemist have no shot in the simulation: their area simply appears with the attack. Now each throws something first (`castLook`): a shard of ice (fast), a dark star (it gathers speed), a flask (a high arc), over 0.14 to 0.4 s (shorter at 2x and 3x speed), and the area opens where it lands (`Projectiles.cast`, `castWait(zoneUid)`; `FieldEffects.syncZones` waits for it, the enemies inside are tagged only once it is open). Where it lands it bursts: crystals, a violet ring, a green splash with drops. Reduced motion: no throw, the area is there at once.

**Marks** (`weaponMarks.ts`): the same pooled marks (22 at most, 8 started a frame) with painted pictures: `burst_star` for a blunt blow, `burst_slash` for blades, `burst_glint` and sparks, `burst_ring` for bells and the two ring weapons, the stuck `shot_arrow`, `mark_snow` and `mark_scorch` decals (the scorch with its own `flare` of light, ember dots rising), notes, the coin. The bright ones are additive (`ADDS`), so a blow lights the enemy it lands on; a mark has one blend mode, so the scorch is two marks. The potion's `shatter` mark is gone (the flask lands in the shot layer).

**The shield** (`shieldDome.ts`, `enemyView.ts`, `enemies.ts`). An enemy that wears one (the cone) is drawn inside a glass dome (`ShieldDome`, built the first time a view wears one and then pooled with it): a steel-blue sphere with hexagon panes and a white rim, a third wider than the body, drawn in front of it and moving with it, opening like a bubble when the enemy arrives, breathing (1.8 % of its size, slowly). A small steel shield icon sits at the left end of the health bar (the area tag moves out one place), and the shield segment of the bar is the same steel (`Light.shield`, also the shield's number and sparks in the director). A hit on the shield: the glass lights up and punches 7 %, a ring runs out from where it was struck, on the side the attacker is (the cat's last attack position), with a spark and a glint (`hit`; bigger for a crit or a blow of 20 % of the shield); the stuck arrow stays in the glass. Cracks as it weakens: none above two thirds, light cracks below, heavy below a third (`crackStage`), and the glass fainter. When it breaks (`shieldBreak`) the dome is gone in a frame, the icon too, the body flinches (a punch and a flash in the rim colour) and `Fx.shieldBreak` throws the six shards. Reduced motion: no ripple or sparks, no breathing; the glass still lights up and the cracks still show.

Colour: steel blue and white on purpose. The blizzard is cyan ice and spiked and flat on the floor; the dome is a round glass bubble standing up, with a hexagon pattern; side by side (`shots/fxv2/shield3/shield_vs_blizzard`) nothing else is mistaken for it. Frost, a bubble, a spiral never wear this blue-grey.

**Enemies inside a friendly area** wear a tint while no status of their own colours them: frost, a violet pull (the hole), a green wash (the potion) (`ZONE_TINT`), besides the tag by the bar. The hostile rings and cells are in `fx.md`.

**Gallery** (`?demo=fx`, `src/demo/FxDemo.ts`): 94 entries now. `shot <cat>` (11: the field's own `Projectiles` and `WeaponMarks` drawing a stand-in simulation at 40 % speed onto a cucumber), `cast m_frost / m_cosmo / t_alch` (the throw, then the area, counting down its warning), `chain m_storm`, `foe ring haste / heal`, `foe cell wet / zap` (3.4 s with the warning), `shield idle / hit / cracked / break` (a cone in the real `ShieldDome`). `__dbg.fx.play('shot r_star')`, `.where(name)`, `.page(n)`.

**Warm-up.** Every painted picture is on the `later` queue of `BattleWarmup`; the pictures of an aura's ring come with the wave that brings it (`waveNeeds().areas`, `AREA_PICTURES`); `FieldWarmup` builds one pooled view of each kind as before (no baking first).

**Proof** (strips in `scratchpad/shots/fxv2/`, Aside, `PAGE_ERRORS []`; stepped at 1/30 s): every ranged cat's shot and hit with one enemy: `proof_a/shot_r_{sling,archer,ninja,gunner}`, `proof_b/shot_{r_star,m_snow,m_fire,t_bell}`, `proof_c/shot_{t_chef,t_bard,t_lucky,m_storm}`; each area from the throw to its end on a busy lane: `zone_a/zone_{m_frost,m_cosmo,t_alch}`; the same under reduced motion (`zone_calm/calm_*`) and on the low tier (`zone_low/low_*`); the shield idle, hit, cracked, broken: `shield2/shield_break`, and next to a blizzard: `shield3/shield_vs_blizzard`; the hostile rings and cells: `aura1`; two crowded late waves on other chapters: `crowd_2/crowd_ch2` (kitchen floor), `crowd_4/crowd_ch4` (garden); the gallery: `demo1/demo_shots_*`.

**Tests.** `view.field.shots.test.ts` (16: every shooter has its own picture at a readable size, who points and who spins, who is lobbed, the three throws and their timing, rank, orientation, the stretch, the arc, the streak, shedding and its limit, pooling, the held-back area), `view.field.shield.test.ts` (7: crack stages, the dome opening, the cracks, fainter as it weakens, the ripple, reduced motion, drop and raise again), `view.field.weapons.test.ts` (a zone start leaves no mark).

**Not verified.** A real phone. The dome over a boss (no boss wears a shield; only the cone does). The shield of an enemy that comes back from a revive.


## 2026-10-08 VFX restyle

The field's share of the restyle (pictures, colours, areas and numbers are in `fx.md`, "2026-10-08 VFX restyle"). What the field draws is the game's own cartoon style again: flat colours, a thick dark-brown outline, nothing lit.

**Shots** (`projectileLooks.ts`, `projectiles.ts`): the three shared containers are shadows, flat streaks, pictures (the additive "lights" container is gone, so `layer.children[2]` is still the bodies). `ProjectileLook` lost `glow` and `tint`; `shed` is `{ kind, color }`; `rankLight` is `rankTrail` (streak opacity, 0.8 to 1.1 by rank). The streak is the flat `tail` shape anchored just ahead of the picture's middle. Table of the cats unchanged (picture, size, spin, arc, trail colour, what it sheds); the moon arrow is no longer tinted deeper, its brown outline carries it on cream.

**Marks** (`weaponMarks.ts`): every mark is normal blend; `flare` and `ADDS` are gone (a fireball's landing spawns a `star` in `Light.warm` beside the scorch). Ring marks are one lighter ring (30 to 106 px), at most six alive (`RING_BUSY`) unless the blow kills or crits; the scorch decal is 86 px.

**The shield is a ring** (`shieldRing.ts`, which replaces `shieldDome.ts`; `art.ts` bakes the rings, `enemyView.ts` wears them). An enemy that wears a shield (the cone) has:
- a thin round outline hugging the body: `ringWidth(size)` = 0.92 x the picture's size + 4 px (a creature does not fill its picture). It is a dark-brown line (5.4 px) with a cobalt line (2.6 px) inside it and a very faint cobalt tint (7 %), drawn in the cartoon style, in the one colour no friendly effect wears (`Light.shield`, see `fx.md`). It is a sprite in the enemy's `lean` container, so it walks with the body and does not bump with its squash;
- baked once at seven diameters (`RING_SIZES` 44 to 170 px) in three looks (`whole`, `dashed`, `lit`), 21 small textures (`FieldArt.shieldRing`); a ring is the nearest size scaled by a few per cent, so the line is the same thickness on a cone and on a boss, and forty rings are one batch;
- a hit (`hit(strong)`): the ring turns to its pale `lit` look for the first 0.09 s of 0.16 s and bumps (8 %, 14 % for a crit or a blow of 20 % of the shield); a second hit inside 0.1 s changes nothing more, so a crowd of hits is not a strobe. Nothing else: no spark, no ripple, no ring running out;
- nearly gone: below 25 % of the shield (`NEARLY_GONE`) the ring is `dashed` (twelve dashes), and whole again if the shield mends;
- a break: the ring and the badge are gone in a frame, the body flinches in the ring's pale colour and `Fx.shieldBreak` pops three or four flat shards (`fx.md`);
- the badge: `badge_shield` (the cobalt shield picture, 20 px) at the left end of the health bar, as the small steel icon was (the area tag moves out one place); the shield segment of the bar is the same cobalt;
- it opens with a small overshoot when the enemy arrives (0.2 s) and then **does not move**: no breathing, no pulse, no glow. Reduced motion: it is simply there, a hit only lights it, no bump.
`EnemyViews` no longer follows where each cat attacked from (the direction of a blow does not matter to a ring), `EnemyView.shieldHit(strong)` takes no `Fx`.

Checked on eighteen shielded cones side by side on the lane (full, half and nearly gone shields, a volley of hits on every second one): each ring reads as its own enemy, the dashed ones stand out, and nothing is bigger than the bodies (`s15/shield15`).

**Warm-up**: `PAINT_IDS` lists the 42 pictures, all on the `later` queue; `AREA_PICTURES` as before.

**Tests**: `view.field.shield.test.ts` (rewritten, 9: the baked sizes and the nearest one, the dashed threshold, the ring as wide as the body and a few pixels, no breathing, dashed and whole again, flash and bump and a hard blow bumps more, not a strobe, reduced motion, drop and raise again), `view.field.shots.test.ts` (three containers, nothing tinted, `rankTrail`), `view.warmup.test.ts` (`fx_badge_shield`).

**Not verified.** A real phone. A ring round an enemy bigger than a cone (no other enemy wears a shield yet: the sizes up to 170 px are baked for a boss).

## 2026-10-08 damage numbers

See `fx.md`, "damage numbers". What the field gave to it: `policy.ts` has the enemy body's geometry in one place (`bodySize`, `bodyX`, `barRise`, `barOffset`, `barWidth`, `bodyBox`) and `EnemyView` reads its picture's size, its x at the screen's edge and the bar's place from it, so the numbers and the picture cannot disagree about where an enemy is. `index.ts` `clampNumbers` sets `fx.numbers.area` from the layout on every `layout` event: the HUD's lower edge (`safeTop + topH - fieldY`), the bottom panel's upper edge, an 8 px margin at the sides and the board inset by 6 px as the place where no number may stand. Nothing about how the field looks changed.
