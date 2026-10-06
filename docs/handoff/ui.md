# Handoff: ui (UI kit)

Date 2026-10-06. Module: `src/ui/**`, gallery `src/demo/UiDemo.ts` (`?demo=ui&page=0..7`), tests `tests/ui.test.ts` and `tests/ui.components.test.ts`.
Everything is drawn in code (PixiJS v8 Graphics + Text); no image files. Import from the barrel: `import { Button, popups, toast, ... } from '@/ui'` (or the file paths below). Construct UI after BootScene has loaded the fonts: `numberText()` bakes its glyph atlas on first use.

## What exists

| File | Exports |
|---|---|
| `theme.ts`, `text.ts` | unchanged exports (`Color`, `Rarity`, `RARITY_ORDER`, `Hit`, `ButtonPalettes`, `label`, `uiLabel`, `fitLabel`, ...). Added `textResolution()`: every `label()` now rasterises at device-pixels-per-design-px (capped at 2) instead of Pixi's automatic density |
| `shapes.ts`, `colors.ts` | `drawPanel / drawPill / drawBevelRect / drawBevelBase / drawBevelFace / drawRibbon / drawShadow / drawGlow`, shared cached gradients, `cacheStatic / refreshCache`, colour helpers |
| `icons.ts` | `drawIcon(name, size, color?)`, `ICON_NAMES` (61 icons). New: purr, laser, sun, molt, wave_call, class_warrior, class_ranger, class_mage, class_trickster, target, sweep, ticket, calendar, wardrobe, share, code, speed_1/2/3, eye (warning already existed) |
| `Button.ts`, `IconButton.ts` | `Button`, `IconButton` |
| `Panel.ts`, `Popup.ts`, `dialogs.ts`, `RewardPopup.ts` | `Panel`, `Popup`, `popups`, `confirmDialog`, `alertDialog`, `RewardPopup`, `showRewards` |
| `Toast.ts`, `Tooltip.ts` | `toast`, `clearToasts`, `tooltip`, `attachTooltip`, `HOLD_DELAY` |
| `ProgressBar.ts`, `Decor.ts`, `Badge.ts`, `Tag.ts`, `controls.ts`, `TabBar.ts`, `ScrollView.ts`, `CurrencyPill.ts` | `ProgressBar`, `CooldownRing`, `Divider`, `Stars`, `LoadingSpinner`, `Badge`, `Tag`, `Toggle`, `Slider`, `Stepper`, `TabBar`, `SegmentTabs`, `ScrollView`, `CurrencyPill`, `TopBar` |
| `CardFrame.ts`, `cardShapes.ts` | `CardFrame` (frame silhouette now varies by rarity) and its pure geometry |
| **new** `RarityPips.ts`, `ClassChip.ts`, `OddsTable.ts` + `oddsMath.ts`, `ScreenScaffold.ts`, `rarity.ts`, `prefs.ts` | see below |
| `layout.ts` + `layoutMath.ts`, `scrollPhysics.ts`, `countUp.ts`, `numbers.ts`, `motion.ts`, `press.ts` | layout helpers, scroll maths, count-up maths, `numberText`, `motion.reduced` + `TweenBag`, press registry |

## Consumer API (additions and changes)

```ts
// Themed rarity words come from i18n keys rarity.common ... rarity.mythic. Never type them in components.
rarityName(r: RarityId): string                      // '@/ui/rarity'
uiPrefs.colorAssist: boolean                         // '@/ui/prefs' - set before building cards; spells the rarity out on CardFrame

new RarityPips({ owned?: boolean[5], size?: 16, gap? })   // origin = row centre, .uiBox
  .set(owned: readonly boolean[], animate = true)    // lit pips pop; dim = hollow socket, top rarity pip is a star
  .owned / .count

new ClassChip({ icon: IconName, owned?: boolean[5], tier?: 0..3, accent?, tierSfx? = 'upgrade' | false, onTap? })  // 168 x 76, origin = centre
  .setTier(n, animate = true)                        // a rise punches the chip, flares a glow, pops the new step, plays tierSfx
  .setOwned(flags, animate = true) .setSelected(v) .onTap(fn | null)
  // pressed state on the pointerdown frame; a hold >= HOLD_DELAY (the tooltip delay) is not a tap; tier 0..3 restyles the border (plain / bronze / silver / gold)

new OddsTable({ width = 600, rows: OddsRow[], footnote?, framed = true })   // origin = TOP-LEFT, .tableHeight, .uiBox
  OddsRow = { value: 0..1; rarity?: RarityId; label?: string; color?: number }  // label defaults to rarityName(rarity)
  .setRows(rows, animate = false)  .setFootnote(text | undefined)
formatOdds(p): string  oddsBarWidth(p, trackW, minPx = 8)  oddsTotal(values)       // '@/ui/oddsMath' (pure)

new ScreenScaffold({ title, onBack?, scroll = true, actionBarHeight = 0, padding = 24, titleHeight = 104, backdrop = true })
  .content            // add body widgets here; origin = top-left of the padded body (the ScrollView's content when scroll = true)
  .actionBar          // add buttons here; (0, 0) = middle of the bar above the home-indicator inset
  .scroller           // ScrollView | null,  .bodyRect, .contentWidth, .viewportHeight
  .addTitleAction(item)  .setTitle(text)  .onBack(fn)  .back()  .refresh()  .show(animate) / .hide(animate): Promise<void>
  ScreenScaffold.handleBack(): boolean    // topmost visible scaffold goes back; Escape is wired already, call it after popups.handleBack() for the browser back gesture
  // relayouts itself on game 'resize'; header/footer reach under the notch / home indicator, content stays inside them
```

Changed behaviour you may notice:

- **Button**: labelled buttons hang a padlock on their corner while disabled, so "locked" is never colour-only (`disabledMark: 'none'` skips it, e.g. when the price already explains the state; icon-only buttons default to 'none'). Press also tints the face; release overshoot is 160 ms / 1.06. `startPulse()` now stops after 5 beats by default (guide U-04), `{ times: -1 }` loops until `stopPulse()`.
- **Badge**: counts above 9 read `9+` (guide 3.5); default dot is 22 px.
- **CurrencyPill / RewardPopup / countUp**: numbers use `fmt()` from `@/core/format` (ko: 1.2만 / 3.4억, en: 12.3K). `numberText` carries 만 억 조. `CurrencyPill` ticks (`tickSfx`, default `reel_tick`, <= 20/s, rising a step per tick, only for rolls of 25+).
- **RewardPopup**: `onChoose(choice, tiles)` fires once, on the frame of dismissal (button, Escape, Back), with each tile's Pixi-global centre, so the caller can start `fx.flyTo` from the tiles.
- **Popup**: subclasses still build in `body`; `shell` is the animated wrapper. `setContentSize(w, h)` lets a popup shrink to fit a short screen or a long message (dialogs and RewardPopup do).
- **TabBar**: label 24 px, `onReselect(fn)` for "tap the active tab to scroll to top".
- **CardFrame**: silhouette per rarity (plain, double line, chamfered corners + jewels, wings + crown, flame crest + star), pips via `RarityPips`, `uiBox` includes the ornaments that overhang the plate. NEW tag is a capsule on small cards (no longer covers the level badge).
- **Toast**: capped at two lines; a repeat of the toast that is already leaving is queued instead of extending it.
- **Stars.setEarned** is safe to call while an earlier call is still animating.

## Verified

- `npx tsc --noEmit` filtered to `src/ui`, `src/demo/UiDemo.ts`, `tests/ui*` prints nothing. (The only errors in the tree right now are in `src/view/director/banners.ts`, not mine.)
- `npx vitest run tests/ui`: 2 files, 53 tests green. New: `formatOdds`, `oddsBarWidth`, `oddsTotal`, `scaffoldLayout`, card silhouette geometry (`chamferPoints`, `flamePoints`, `wingPoints`, `roundedPolyPath`, incl. zero-length edges), `rarityName` fallback, locale-aware count-up text (ko and en). The old K/M test now runs per language.
- Gallery in the Aside browser, `PAGE_ERRORS []` on every run: all 8 pages (`?demo=ui&page=0..7`), pressed button (face on the lip, tinted), disabled tap (toast + corner padlock), confirm dialog, backdrop-tap close, RewardPopup (count-up, rays), a long toast (cut to two lines), scrolled list (inertia, indicator), tab bar, hold tooltip, full-screen scaffold (header, scroll, action bar, back button, then again with `safeTop = 48 / safeBottom = 34` and a `resize` event), cards in all rarities and three sizes, colour-assist cards, class chips for tiers 0..3, odds table, ko and en wrapped labels.
- **The Aside browser reports `prefers-reduced-motion: reduce`**, so `motion.reduced` is true there by default and every loop, pop and glint is skipped. I ran each interactive check in that mode and again with `window.__dbg.ui.motion.reduced = false` (set before building the page). Sampled numbers with motion on: ClassChip tier-up body scale 1 -> 1.138 -> 1 in 0.35 s, glow alpha 0.76 -> 0 over 0.6 s, new bar 0.2 -> 1.2 -> 1; mythic RarityPips pop 0.79 -> 1.23 -> 1 with the ring shown for 0.4 s; legendary glint and mythic border cycle running on the cards; CTA pulse; rewards sunburst.
- Escape ordering (motion on): an alert over a ScreenScaffold, first Escape closes the popup only, second goes back; a second `scaffold()` call while open is ignored; 12 toasts in a row and a RewardPopup dismissed with Escape end with the UI tween count back at its baseline and no warnings.
- Leaks: cycling all 8 demo pages three times with reduced motion leaves a single live UI tween (the busy spinner on page 0); with motion on, two full cycles give identical live-tween counts per page (3, 0, 3, 9, 0, 0, 0, 0 for pages 0..7), so nothing accumulates. Texture memory after visiting every page is 60 MB (525 pooled `cacheAsTexture` targets; Pixi's `TexturePool` keeps returned targets for reuse).
- Defects found and fixed while doing this: `ScrollView.destroy` scheduled a re-measure of itself through its own `childRemoved` handler, which threw inside `Tweener.update` on the next frame (and, because `Tweener.update` compacts its list as it goes, left phantom tweens behind); the tooltip arrow pointed the wrong way; `Stars.setEarned` could leave stars invisible when called twice quickly; `RewardPopup` destroyed a per-popup gradient texture still bound in a batch (Pixi warning on every close); the NEW tag covered the level badge on small cards; `RarityPips` showed both the lit and the hollow pip until the first `set`; NaN into `ProgressBar.setValue` / `Slider.setValue` / `CooldownRing.setProgress` / `CurrencyPill.setAmount` is now treated as 0.
- Hunted and found fine: no `any` / `ts-ignore` / TODO in the module; no allocation in per-frame update paths (count-up skips frames whose integer did not change); every component's `destroy()` kills its tweens and listeners (`TweenBag`, press registry, `stage.off`, `game.onUpdate` unsubscribers, window key listeners); Graphics are never used as parents (a Pixi deprecation warning in one new component was fixed).

## Known gaps

- Digits are not tabular: `numberText` uses the proportional Lilita One digits, so a rolling counter jitters by a pixel or two (it stays centred).
- There is no global text-size setting yet (guide 3.8 S/M/L); every label uses the size its component asks for.
- Tooltips are not repositioned on resize (they hide on the next press).
- Popups are not cleared on scene change: call `popups.closeAll()` (and `clearToasts()`) when leaving a scene.
- The Hangul font subset `public/fonts/game-kr.woff2` is stale: strings such as 꼬마 / 동네 / 골목대장 fall back to the system font in the gallery (visible as thin glyphs between the chunky ones). `npm run font` fixes it; it is outside my paths.
- No inline rewarded-ad card component: compose `Panel` + `Button({ icon: 'ad' })` inside a `ScreenScaffold` (the gallery's "Full screen" button shows one).

## REQUESTS

1. Run `npm run font` (rebuilds `public/fonts/*.woff2` from every string in `src/`): the Korean subset predates the current strings.
2. `src/core/tween.ts` `Tweener.update`: a throwing callback leaves the list half-compacted (earlier survivors are duplicated), so one bad callback keeps stepping some tweens twice per frame from then on. A `try/finally` around the loop that applies the compaction would make it self-healing. Not needed by the UI once its own throw was fixed.
3. Type errors outside my paths (not mine): `src/view/director/banners.ts(68,22)` and `(281,32)`, TS6138 unused properties `size` and `stage`.
