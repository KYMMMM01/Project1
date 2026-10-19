/**
 * What the first cast of a skill in a run shows besides its scene, once per skill per run: a rank 5 skill shows its CUT-IN (the awakening's
 * banner in its short form, 0.8 s) and every other skill its NAME BUBBLE (the skill's name on a paper label over the cat). The banner already
 * says the name, so a rank 5 cast shows no bubble on top of it; a banner that could not be shown (its queue is full) leaves the bubble in its place,
 * and so does a banner that has to WAIT for the ones before it: the scene starts at once and the banner trails it by up to a second or more at 3x, so
 * the bubble names the skill over the cat while it happens and the banner follows. The stage is held for the whole chain of banners
 * (`holdStage`) so that the full screen a cast opens (the lucky cat's toy pick) comes up after them, not under or before its own banner.
 * Both are exempt from the stage rule (`stageRule.ts`): the dispatcher only calls them for a cast whose
 * `first` flag is set, and the simulation sets that flag once per skill.
 *
 * The bubble is timed by the battle's clock with a floor in real time (`span.ts`): about 0.8 s at 1x, never shorter than 0.6 s at 3x (a three
 * word English name has to be read), and it stands still under a popup. It stays ON THE BOARD (`bubbleSpot`): over the road it would hide the
 * very thing the cast acts on.
 *
 * The cut-in is the existing one (`awakeningCutIn`, real time, on the overlay layer) with two differences for a skill: it takes no taps (it
 * arrives in the middle of whatever the player is doing, so a drag that starts under it must reach the board) and at 2x and 3x it plays
 * faster. An awakening's own banner is never cut short: a skill's banner that finds one playing waits its turn (at most `CUTIN_QUEUE` wait,
 * none longer than `CUTIN_WAIT` real seconds), so two skills that cast for the first time a moment apart both show theirs.
 */
import { Container, Graphics } from 'pixi.js';
import { tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { awakeningCutIn, awakeningPlan, fxSettings, NAME_SIZE, nameSizeFor } from '@/fx';
import { unitClass, unitDef } from '@/game';
import type { SpCastEvent, UnitId } from '@/game';
import { BOARD_W, BOARD_X, BOARD_Y, cellCenterX, cellCenterY } from '@/game/geometry';
import { game } from '@/core/game';
import { Ease } from '@/core/tween';
import { PaperLabel } from '@/ui/paper';
import { label } from '@/ui/text';
import { Color } from '@/ui/theme';
import { holdStage } from '../../staging';
import { FEET_DY } from '../../field/unitView';
import { CLASS_COLOR } from '../palette';
import { Age } from './span';
import { bubbleLift, introFor } from './stageRule';
import type { SpEnv } from './types';

/** The bubble lives this many battle seconds, and at least this many real ones. */
export const BUBBLE_LIFE = 0.8;
export const BUBBLE_FLOOR = 0.6;
/** Where the bubble's tip stands above the cat's feet (the top of the tallest cat, a little over). */
const TIP_ABOVE_FEET = 96;
/** The label keeps this far inside the board's edges. */
const EDGE = 4;
/** The tail's length, and the paper's overhang above it, in design px: the label's top is `TAIL + h + 2` above the tip. */
const TAIL = 15;
/** How far the bubble rises while it lives (px), and the biggest size it pops to (a share): both must still fit under the board's top edge. */
const RISE = 10;
const POP_MAX = 1.1;
const MAX_LIVE = 4;
/** A queued cut-in that has waited this long (real seconds) is given up (its bubble was shown when it joined the queue). */
export const CUTIN_WAIT = 3;
/** The cut-in plays this many times as fast at 2x and at 3x speed. */
export const CUTIN_TEMPO = { 1: 1, 2: 1.25, 3: 1.5 } as const;

/**
 * The size the cut-in's name label starts at. The label is about 380 px wide and cuts what it cannot shrink to fit with an ellipsis ("The Tiger
 * Has Ar..." in English at the normal 58), so a long name is measured once and given a smaller start (a cat's own name keeps the default).
 */
export function cutInNameSize(name: string): number {
  const probe = label(name, { size: NAME_SIZE });
  const size = nameSizeFor(probe.width);
  probe.destroy();
  return size;
}

/** The speed-up of the skills' banner at the game's speed (1, 2 or 3). */
export function cutInTempo(speed: number): number {
  return speed >= 3 ? CUTIN_TEMPO[3] : speed >= 2 ? CUTIN_TEMPO[2] : CUTIN_TEMPO[1];
}

/**
 * Where a name bubble stands. `tipX` / `tipY` are where its tail points (over the cat's head); `dx` is how far the label itself is shifted
 * sideways from the tip so that the whole label stays over the board (a cat in the first or last column would otherwise have it on the road
 * at the side); `tipY` is pushed down when the label would rise above the board's top edge (a cat in the first row would have it on the road
 * above). `w` and `h` are the label's size; `lift` stacks it above another bubble (`bubbleLift`) and is added on top of all that.
 */
export function bubbleSpot(cell: number, w: number, h: number, lift: number): { tipX: number; tipY: number; dx: number } {
  const tipX = cellCenterX(cell);
  const lo = BOARD_X + EDGE + w / 2;
  const hi = BOARD_X + BOARD_W - EDGE - w / 2;
  const dx = Math.min(hi, Math.max(lo, tipX)) - tipX;
  const natural = cellCenterY(cell) + FEET_DY - TIP_ABOVE_FEET;
  // The label's top stands `TAIL + h + 2` above the tip (a little more while it pops), and it rises RISE px while it lives.
  const highest = BOARD_Y + EDGE + (TAIL + h + 2) * POP_MAX + RISE;
  return { tipX, tipY: Math.max(natural, highest) - lift, dx };
}

interface Bubble {
  root: Container;
  age: Age;
  /** Where the tip stands (the root's resting place). */
  y: number;
  /** The label's centre and width, and how far it was lifted off the cat's head so as not to cover another bubble (stageRule.ts `bubbleLift`). */
  x: number;
  w: number;
  lift: number;
}

/** A skill whose cut-in is waiting for the one on the screen. */
interface Waiting {
  skill: SpCastEvent['skill'];
  unitId: UnitId;
  cell: number;
  /** Real seconds it has waited. */
  wait: number;
}

export class SpIntro {
  private readonly live: Bubble[] = [];
  private readonly waiting: Waiting[] = [];
  /** Real time (`game.time`) by which every banner that plays or waits will have played (each for its full length): what a full screen that follows waits for. */
  private chainEnd = 0;

  constructor(private readonly env: SpEnv) {}

  /** The first cast of a skill: its bubble, or its cut-in when it is a rank 5 skill. */
  first(e: SpCastEvent): void {
    const plan = introFor(unitDef(e.unit.id).spSkill?.rank, this.waiting.length);
    if (plan.bubble) this.bubble(e.skill, e.unit.id, e.unit.cell);
    if (!plan.cutIn) return;
    this.reserve(this.bannerLength());
    // An awakening's banner (or an earlier skill's) is never cut short: this one waits its turn.
    if (awakeningCutIn.playing || this.waiting.length > 0) {
      this.waiting.push({ skill: e.skill, unitId: e.unit.id, cell: e.unit.cell, wait: 0 });
      // It will come after the picture it announces (the cast's scene starts at once; the banner trails the ones before it by up to a second or
      // more): the name stands over the cat now, the way it does for a skill below rank 5, and the banner follows.
      this.bubble(e.skill, e.unit.id, e.unit.cell);
    } else this.cutIn(e.skill, e.unit.id);
  }

  /** How long a skill's banner plays, in real seconds, at the speed the game runs now. */
  private bannerLength(): number {
    return awakeningPlan(true, fxSettings.reducedMotion, cutInTempo(this.env.ctx.speed)).total;
  }

  /**
   * A banner of `seconds` has been taken on (playing now, or in the queue): the stage is held for the whole chain, so that a full screen the same
   * cast opens (the lucky cat's toy pick) waits for it instead of coming up while its own banner is still to come (`staging.ts`, `capsuleToyWait`).
   */
  private reserve(seconds: number): void {
    const now = game.time;
    this.chainEnd = Math.max(this.chainEnd, now) + seconds;
    holdStage(this.chainEnd - now);
  }

  private bubble(skill: SpCastEvent['skill'], unitId: UnitId, cell: number): void {
    while (this.live.length >= MAX_LIVE) this.drop(this.live[0] as Bubble);
    const paper = CLASS_COLOR[unitClass(unitId)];
    const label = new PaperLabel({ text: t(`sp.${skill}.name`), size: 26, paper, ink: Color.inkDeep, minWidth: 110, maxWidth: 360, torn: 'ends' });
    const w = label.uiBox.w;
    const h = label.uiBox.h - 5;
    const tail = new Graphics();
    tail.poly([-11, 0, 11, 0, 0, TAIL]).fill(paper);
    tail.position.set(0, -(TAIL + 1));
    // Two first casts in the same moment by cats side by side: the second label stands one label higher instead of covering the first.
    const at = bubbleSpot(cell, w, h, 0);
    const lift = bubbleLift(this.live.map((b) => ({ x: b.x, w: b.w, lift: b.lift, k: b.age.k(BUBBLE_LIFE, BUBBLE_FLOOR) })), at.tipX + at.dx, w, h + TAIL);
    const spot = lift > 0 ? bubbleSpot(cell, w, h, lift) : at;
    label.position.set(spot.dx, -(TAIL + 1) - h / 2 - 1);
    const root = new Container();
    root.eventMode = 'none';
    root.addChild(tail, label);
    root.position.set(spot.tipX, spot.tipY);
    root.alpha = 0;
    root.scale.set(0);
    // Over the cast's own pictures (the shield lands on the same spot): the name is what the player has to read.
    this.env.ctx.layers.numbers.addChild(root);
    this.live.push({ root, age: new Age(), y: spot.tipY, x: spot.tipX + spot.dx, w, lift });
  }

  private cutIn(skill: SpCastEvent['skill'], unitId: UnitId): void {
    const { stage } = this.env;
    // The banner's own short fanfare (`sp_cutin`, half a second: the skill's sound follows at once and is not buried under the awakening's 1.2 s).
    stage.direct('sp_cutin', 0.9);
    const name = t(`sp.${skill}.name`);
    stage.fx.awakening(tex(`unit_${unitId}`), name, {
      short: true,
      tag: t('rarity.mythic'),
      color: CLASS_COLOR[unitClass(unitId)],
      nameSize: cutInNameSize(name),
      passThrough: true,
      tempo: cutInTempo(this.env.ctx.speed),
    });
  }

  update(dt: number, battleDt: number): void {
    this.advanceCutIns(dt);
    const calm = this.env.stage.reduced;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i] as Bubble;
      b.age.tick(battleDt, dt);
      const k = b.age.k(BUBBLE_LIFE, BUBBLE_FLOOR);
      if (k >= 1) {
        this.drop(b);
        continue;
      }
      const pop = calm ? 1 : Ease.backOut(Math.min(1, k / 0.18));
      b.root.scale.set(Math.max(0.001, pop));
      b.root.alpha = k > 0.78 ? (1 - k) / 0.22 : Math.min(1, k / 0.08);
      b.root.position.y = b.y - (calm ? 0 : RISE * Ease.cubicOut(k));
    }
  }

  /** Start the next waiting cut-in when the screen is free; give up on one that has waited too long (its skill shows the bubble instead). */
  private advanceCutIns(dt: number): void {
    if (this.waiting.length === 0) return;
    for (const w of this.waiting) w.wait += dt;
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i] as Waiting;
      if (w.wait <= CUTIN_WAIT) continue;
      this.waiting.splice(i, 1);
      // Its bubble was shown when it joined the queue; the banner it will not get is no longer waited for.
      this.chainEnd = Math.max(game.time, this.chainEnd - this.bannerLength());
    }
    if (this.waiting.length > 0 && !awakeningCutIn.playing) {
      const next = this.waiting.shift() as Waiting;
      this.cutIn(next.skill, next.unitId);
    }
  }

  /** Take every bubble off now and forget the banners that were waiting. */
  clear(): void {
    while (this.live.length > 0) this.drop(this.live[0] as Bubble);
    this.waiting.length = 0;
    this.chainEnd = 0;
  }

  destroy(): void {
    this.clear();
  }

  /** What is up and what waits (QA and tests). */
  pending(): { bubbles: number; waiting: number } {
    return { bubbles: this.live.length, waiting: this.waiting.length };
  }

  private drop(b: Bubble): void {
    const i = this.live.indexOf(b);
    if (i >= 0) this.live.splice(i, 1);
    b.root.parent?.removeChild(b.root);
    b.root.destroy({ children: true });
  }
}
