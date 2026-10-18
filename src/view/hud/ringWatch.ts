/**
 * The first skill ring that is nearly full, outside the tutorial's own lesson (docs/qa/directive_2026-10-13_skills_build.md, decision 29): the moment a
 * normal run (or a tutorial that was skipped) asks the first-encounter scheduler for the card of the topic `sp_skill`, which says what the ring beside the cat
 * is for. The card is the existing one (src/view/hud/hints.ts): the topic's title and teaching line, "got it" and "more in the guidebook", it holds the
 * battle while it is read, and it comes once in a lifetime. It points at the ring itself (the field's `sp-ring` node, a child of the cat's view), else at the cat.
 *
 * Only a battle that plays with skills (`BattleApi.spOn`, a saved run keeps the setting it started with) ever asks, so with skills off nothing here does
 * anything. In the tutorial run the lesson of the same topic (tutorialScript.ts) teaches it and `Hints.only` keeps the card away.
 */
import type { Container } from 'pixi.js';
import type { EnvImpl } from './env';
import { nearRingCell } from './ringSpot';

/** Seconds between two looks at the board (the ring takes whole seconds to fill; the card waits for a calm moment by itself). */
export const RING_WATCH_EVERY = 0.25;

/** The topic of the card. */
export const RING_TOPIC = 'sp_skill';

/** The ring drawn on a cat's view, or null (the field labels it). */
export function ringNodeOf(view: Container): Container | null {
  return view.getChildByLabel('sp-ring', true);
}

export class RingWatch {
  private clock = 0;

  constructor(private readonly env: EnvImpl) {}

  update(dt: number): void {
    const { battle, hints } = this.env;
    if (!battle.spOn || hints.has(RING_TOPIC)) return;
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = RING_WATCH_EVERY;
    const cell = nearRingCell(battle.units);
    const unit = cell >= 0 ? battle.units[cell] : null;
    const view = unit ? this.env.ctx.unitView(unit.uid) : null;
    if (!view) return;
    // A request that is already waiting or on screen is ignored by the scheduler, and so is one for a topic the player has been taught.
    hints.request(RING_TOPIC, ringNodeOf(view) ?? view);
  }
}
