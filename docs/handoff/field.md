# Handoff: field (battle scene and playfield)

Date 2026-10-06. Engineer A. Paths: `src/scenes/BattleScene.ts`, `src/view/field/**`, `src/view/layout.ts`, `src/view/strings.ts`, `tests/view.field*.test.ts`, and the battle route in `src/main.ts`.

## What exists

| File | Role |
|---|---|
| `src/scenes/BattleScene.ts` | `BattleScene(run: RunConfig)`: builds the simulation (`createBattle(init, snapshot)`, falling back to a fresh run when the snapshot does not fit), the layer tree, the `Fx` facade and the `BattleContext`, then `createField`, `createDirector`, `createHud`. Owns the clock. Exports `setBattleExit(fn)` and `setBattleCreatedHook(fn)`. |
| `src/view/layout.ts` | `computeBattleLayout(w, h, safeTop, safeBottom)` (top HUD 168, bottom panel 452, the 720 x 624 field centred in the band, spare height split above and below) and `backgroundPlacement`. Pure. |
| `src/view/field/clock.ts` | `BattleClock`: speed, nesting pause reasons, hit-stop (longest wins), slow-motion that eases back over 200 ms. Pure. |
| `src/view/field/index.ts` | `createField(ctx)`: composes everything below; `update` runs units, enemies, shots, effects, input, cell looks, ground effects. |
| `background.ts`, `rug.ts` + `rugSkins.ts`, `walkway.ts` | Chapter art with edge-matched fill and dark top/bottom fade; the baked mat (13 skins as data, 8 patterns, stitched border, shadow, 20 inset tiles); the baked walkway (worn lane, paw trail, corner chevrons, doorway at the spawn). |
| `cells.ts` | Cell looks: selected (brackets), move (target ring), swap (double arrow), merge (rarity glow plus up arrow), blocked (dimmed plus cross). Each look has a glyph as well as a colour. Hover emphasis for the cell under a dragged unit; press flash on pointer-down. |
| `unitView.ts` + `units.ts` | Cat views (idle breathing with per-unit phase, spawn pop, attack lunge, merge flight and pop, molt spin, slide / swap hop, sell, blocked slump with a no-act glyph, weakened droop plus the fx swirl, sunlit warm tint and glow, shield dome, drag lift with a wider shadow). Pooled. |
| `enemyView.ts` + `enemies.ts` | Enemy views (walk bob and waddle from `enemy.age`, turn-around squash, spawn pop, hit flash / knock / squash, death collapse, damaged-only health bar with a cyan shield segment, status tints, laser focus ring, stun star, elite / boss aura and shadow, depth sort by y). Pooled. |
| `projectiles.ts` + `projectileLooks.ts` | Pooled shots, one look per unit type (pebble, arrow, shuriken, bullet streak, star arrow with a long trail, snowball, fireball with glow, bell, fish bone, music note, potion flask, coin, plus a generic orb). Textures are baked in `art.ts`. |
| `effects.ts` | Mirrors sunbeams, active hazards (wet / zap), zone areas (blizzard / black hole / potion cloud) and the laser dot from the simulation state every frame; hazard warnings come from the `hazardWarn` event. |
| `input.ts`, `policy.ts`, `rangeRing.ts`, `sellTag.ts` | Pointer handling and its pure decisions (drag threshold 10 px, tap vs drag, tap-tap, release rules, area classification), the clipped dashed range ring, the price tag shown over the sell zone. |
| `debug.ts` | `?scene=battle&chapter=N&stake=N&seed=N&mode=...&sandbox=1&runs=N` (plus `rug=`, `fx=`, `level=`) and `window.__dbg.battle = { scene, ctx, battle, give, skipToWave, spawn, win, lose, setSpeed }`. Loaded lazily by `main.ts`, debug builds only. |

## How it is wired

- Layer tree: `background`, then a never-moving `shake` container holding `fieldRoot` (positioned at the layout's field origin) with `floor, zones, fxBack, enemies, units, projectiles, fxFront, numbers`, then `hud`, then `overlay`. `fxBack` sits right above `zones` (behind characters, as its comment says), not above `projectiles` as the contract's list order reads. `game.setShakeTarget(shake)` is set on construction and cleared on exit, so only the field shakes.
- Clock (`BattleScene.update`): `battleDt = clock.tick(dt, fxClock)`; the simulation, `ctx.tweens` take `battleDt`; `ctx.ui`, the three parts and `ctx.fx` take real `dt`. Effect presets that ask for hit-stop go through a `TimeFreeze` whose factor is multiplied in, so the guide's caps hold. The scene pauses with reason `system` while `game` reports the tab hidden.
- The field reads the simulation every frame (units, enemies, projectiles, zones, hazards, sunbeams, laser) and uses events only for flourishes, so skipped or missing events (fast-forward, revive) cannot leave stale visuals; vanished views fade quietly.
- Ground effects (sunbeams, hazards, zones) run on a second `Fx` bound to `layers.zones`, updated by the field. `ctx.fx` (on `fxFront`) is used for the laser dot and the weakened swirl.
- `ctx.exit()` goes to the scene registered with `setBattleExit(() => new HomeScene())`, otherwise `BootScene`. `ctx.retry()` starts a new `BattleScene` (same seed for sandbox and daily runs, a fresh seed otherwise; `runsPlayed + 1`).
- `finished`: the scene announces it itself only when the director has not within 8 real seconds of the simulation's `victory` / `defeat` event.

## Things the director and HUD should know

- Unit view containers: `ctx.unitView(uid)` is the unit's `root` (positioned at the feet). The field never writes the root's scale, alpha or visibility except when it recycles the view, so `popIn`, `punchScale` and friends are safe on it. The sprite is `root.getChildByLabel('sprite', true)`. The field overwrites root position every frame.
- Awakening hand-off: on `awaken` the field keeps the OLD unit's view (hide it with `visible = false` or `alpha = 0` when your cut-in starts; otherwise the field fades it at 0.9 s) and creates the NEW unit's view hidden; reveal it by making its root visible (for example `popIn`) on your impact; otherwise the field pops it in at 2.4 s. This was not exercised against a real cut-in.
- Boss death: a dead boss's view stays standing, still, in `ctx.enemyView(uid)` for 2.6 s or until its root is hidden (`visible = false` / `alpha = 0`), then the field removes it. Other enemies collapse in 170 ms (a white flash first). Enemy sprite: `root.getChildByLabel('sprite', true)`.
- The field plays `audio.play('pickup')` and a light haptic when a drag lifts a unit (it owns that gesture). Do not repeat it on the `drag` event. Every other sound is yours.
- `ctx.events 'drag'` is emitted on lift, whenever the cell under the pointer or the sell state changes, and with `{ from: null }` when the drag ends (drop, cancel, or interruption).
- Interrupted drags (popup, pending choice, pause, lost pointer) put the unit back with a spring.

## Verified

- `npx tsc --noEmit` prints nothing for my paths; `npx vitest run tests/view.field` passes (42 tests: layout and background placement, tap / release / area decisions, range-ring clipping, battle clock, attack / walk / death curves, rug skins and stitching, projectile looks).
- Browser (Aside runner, screenshots in `scratchpad/shots/field/`, PAGE_ERRORS `[]` throughout): `f01_start` (empty board with sunbeams, doorway, paw trail), `f04_five_units` and `f05`-`f07` (summon pops, drag with every highlight, merge flight, result pop, projectiles in flight), `f10_mid_*` (bot-built mid-run board with walking cucumbers and a roomba), `g1_enemies` / `g1b_hazard` (elite, storm-cloud boss, wet and zap hazards with the blocked unit slumped and its no-act glyph), `g2_selected` (selection brackets, range ring, swap / move looks), `g3_laser` (laser dot), `g4_sell` / `g5_sold` (price tag over the sell zone, sale), `h1_kitchen_checks` (chapter 2 with the checks mat). Retry (fresh scene, same sandbox seed) and exit (boot screen) verified without errors.
- The Aside tab renders at about 1 fps, so animation checks advance the game by hand (`ticker.update(lastTime + ms)` in a loop) and the QA scripts use that.

## Known gaps

- Not seen in the browser: the awakening hand-off against the real cut-in, molt, the zone looks (blizzard / black hole / potion cloud), enemy status tints beyond hazards, boss death hold with the director's sequence, tall (1600) and notch layouts (the maths is unit-tested only), and touch input on a real phone.
- `skipToWave` mutes the simulation's event emitter while it fast-forwards (so the HUD opens no offers) and then every view re-reads the state; `win()` keeps events on, so offers opened during it stay open until the result flow takes over.
- Units that are not on the board when a snapshot resumes appear with the normal spawn pop.
- The sell tag's label (`view.sell`) is a new Hangul string; run `npm run font` (the dev script does it on start) so the subset has its glyphs.
- Enemy sprites for `balloon_small` borrow the big balloon's art at a smaller size (no `enemy_balloon_small` image exists).

## REQUESTS

None blocking. Suggestions for other parts: the HUD's toy-pick screen and summon popup do not close when the simulation's pending choice is resolved from outside (only seen with the debug fast-forward); the director may want to use `layers.fxBack` for ground rings since the field leaves it empty.
