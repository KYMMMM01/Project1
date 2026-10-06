# Handoff: hud (battle HUD, popups and run screens)

Date 2026-10-06. Paths: `src/view/hud/**`, tests `tests/view.hud*.test.ts`. Entry point `createHud(ctx): HudPart` (`src/view/hud/index.ts`), built against `src/view/context.ts` only. The first version was written by an interrupted engineer; this note comes from the integration pass that finished and verified it.

## Specification C checklist

| Requirement | State |
|---|---|
| Top area: pause, enemy gauge with danger colours and overflow countdown, speed button (1x / 2x, 3x with the Butler Pass, all in sandbox) | done |
| Wave row: act / wave label, wave timer bar, next-wave preview strip with tooltips (name, description, traits), owned toys with tooltips | done; the two strips are one touch target each (88 minimum) and a tap picks the icon nearest the finger |
| Boss / elite strip: name, health with ghost trail, estimated kill time (green / amber / red), marker on the wave timer | done, reworked: it now takes over the preview / toy area of row 2 (the old bar sat on the walkway and hid the boss on 1280-high screens) |
| Class chips, class sheet (role, three tiers with the active one lit, upgrade button) | done |
| Currency row with count-up and pop, pity chip (from 9 of 12), odds chip with the live OddsTable popup | done; the pity chip grows leftwards so it never touches the odds chip |
| Action row: grade upgrade, SUMMON (acts on pointerdown, hold repeat 350 ms / 140 ms, six-step tracker, "no space", short purse), laser indicator with hint, call next wave with its bonus | done |
| Selection bar: portrait, name, rarity, class, stats, skill line, Molt (three-class picker with cost and molts left), Awaken (reason from the Fail code), Sell (refund), close; sell strip while dragging | done |
| Pick-of-three popup, toy choice full screen with one inline reroll (free, then ad / gems through the meta layer), pause menu with settings screen, refusal toasts for every Fail code | done |
| End of run: continue (once, ad / gems), result with luck line, rewards through `profile.finishRun`, double and snack offers, Retry / Home | done; sandbox shows statistics only |
| Staged reveal by `run.runsPlayed` (GDD 9.1) and the three-step tutorial with hand and spotlight | done; a free-play nudge was added between the merge and the scripted pick |
| `anchor(name)` | done (`fish`, `purr`, `enemyGauge`, `wave`, `summon`, `relics`, `laser`) |

(Fill in the rest of this note from the final verification.)
