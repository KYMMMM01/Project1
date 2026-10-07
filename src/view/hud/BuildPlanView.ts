/**
 * The build-planning well of the selection sheet: what the selected cat becomes ("합치면" and the next
 * rank of its class, or for a king the awakening and how far the requirements are), and how many
 * identical cats are on the board. Pure display: the maths is in planMath.ts.
 */
import { Container, Graphics } from 'pixi.js';
import { mixColor } from '@/core/math';
import { t } from '@/core/i18n';
import { AWAKEN_MIN_TIER, unitClass, unitDef, unitRarity, type UnitState } from '@/game';
import { Color, drawDashedRect, drawIcon, drawPaperFace, fitLabel, paperSeed, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import { CLASS_ACCENT, unitPhoto } from './kit';
import { SHEET } from './layoutMath';
import { canMergeNow, MERGE_NEED, planOf, type BuildPlan } from './planMath';

const PLAN_H = SHEET.well;

const PHOTO = 46;
const STITCH = 3;
/** The two lines of the right-hand block: 25 px apart, 6.5 px of paper above the upper and under the lower. */
const LINE_1 = 17.5;
const LINE_2 = 42.5;
const PAD = 14;
/** Widths of the right-hand block: a merge shows two short lines, an awakening two requirements with a status disc each. */
const RIGHT_MERGE = 224;
const RIGHT_AWAKEN = 266;

/** A small paper disc that says whether a requirement is met: a check on leaf paper, or an empty kraft ring. */
function statusDisc(met: boolean): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, 10).fill(met ? Color.leaf : Color.paperDim).stroke({ width: 2.5, color: met ? Color.leafDark : Color.kraftDark });
  c.addChild(g);
  if (met) c.addChild(drawIcon('check', 15));
  return c;
}

/** One row of the right-hand block: a status disc and a line of ink. */
function requirement(text: string, met: boolean, maxW: number): Container {
  const row = new Container();
  const disc = statusDisc(met);
  disc.position.set(11.5, 0);
  const label = uiLabel(text, { size: 24, anchorX: 0, align: 'left' });
  label.position.set(34, 1);
  fitLabel(label, maxW - 34, 24, 0.8);
  row.addChild(disc, label);
  return row;
}

export class BuildPlanView extends Container {
  private readonly seed = paperSeed();
  private readonly w: number;

  constructor(
    private readonly env: HudEnv,
    unit: UnitState,
    w: number,
  ) {
    super();
    this.w = w;
    const board = env.battle.units;
    const plan = planOf(unit.id, board);
    this.drawWell(this.metOf(plan, unit));
    const right = plan.kind === 'awaken' ? RIGHT_AWAKEN : RIGHT_MERGE;
    this.drawResult(plan, w - PAD - right);
    if (plan.kind === 'merge') this.drawTwins(plan, w - PAD - right, right);
    else if (plan.kind === 'awaken') this.drawAwaken(unit, w - PAD - right, right);
  }

  /** True when the plan can be carried out right now: a pair to drag, or every awakening requirement met. */
  private metOf(plan: BuildPlan, unit: UnitState): boolean {
    if (plan.kind === 'merge') return canMergeNow(plan);
    if (plan.kind === 'awaken') return this.env.battle.canAwaken(unit.cell) === null;
    return false;
  }

  /** The well turns mustard with a dashed line when the plan can be carried out right now. */
  private drawWell(met: boolean): void {
    const g = new Graphics();
    const fill = met ? mixColor(Color.paperDim, Color.mustard, 0.38) : Color.paperDim;
    drawPaperFace(g, 0, 0, { w: this.w, h: PLAN_H, radius: 20, fill, edge: Color.kraftDark, edgeAlpha: 0.4, grain: false, seed: this.seed });
    // A stitch just inside the well's edge: the two lines of text (7 px of paper above and under them) stay clear of it.
    if (met) drawDashedRect(g, STITCH, STITCH, this.w - STITCH * 2, PLAN_H - STITCH * 2, { radius: 20 - STITCH, color: Color.mustardDark, width: 2.5, dash: 10, gap: 7, seed: this.seed });
    this.addChild(g);
  }

  /** Left block: "merges into" / "awakens into", an arrow, the next cat's photo and name. */
  private drawResult(plan: BuildPlan, rightX: number): void {
    const cy = PLAN_H / 2;
    if (plan.result === null) {
      const top = uiLabel(t('hud.plan.top'), { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
      top.position.set(PAD + 4, cy);
      fitLabel(top, this.w - PAD * 2, 24, 0.8);
      this.addChild(top);
      return;
    }
    const def = unitDef(plan.result);
    const lead = uiLabel(t(plan.kind === 'awaken' ? 'hud.plan.awaken' : 'hud.plan.merge'), { size: 24, color: Color.inkSoft, anchorX: 0, align: 'left' });
    lead.position.set(PAD + 2, cy);
    fitLabel(lead, 116, 24, 0.8);
    const arrowX = PAD + 2 + Math.min(lead.width, 116) + 12;
    const arrow = new Graphics();
    arrow.poly([0, -10, 16, 0, 0, 10]).fill(CLASS_ACCENT[unitClass(plan.result)]).stroke({ width: 2.5, color: Color.ink, join: 'round' });
    arrow.position.set(arrowX, cy);
    const photo = unitPhoto({ size: PHOTO, rarity: unitRarity(plan.result), unit: plan.result });
    photo.position.set(arrowX + 30 + PHOTO / 2, cy - 1);
    const name = uiLabel(t(def.nameKey), { size: 26, anchorX: 0, align: 'left' });
    name.position.set(photo.x + PHOTO / 2 + 10, cy);
    fitLabel(name, rightX - name.x - 10, 26, 0.75);
    this.addChild(lead, arrow, photo, name);
  }

  /** Right block of a merge: how many identical cats there are, and the rule or the call to drag. */
  private drawTwins(plan: BuildPlan, x: number, maxW: number): void {
    const have = uiLabel(t('hud.plan.have', { n: plan.twins }), { size: 24, anchorX: 0, align: 'left' });
    have.position.set(x, LINE_1);
    fitLabel(have, maxW, 24, 0.8);
    const ready = canMergeNow(plan);
    const rule = uiLabel(t(ready ? 'hud.plan.ready' : 'hud.plan.rule', { n: MERGE_NEED }), { size: 24, color: ready ? Color.ink : Color.inkSoft, anchorX: 0, align: 'left' });
    rule.position.set(x, LINE_2);
    fitLabel(rule, maxW, 24, 0.8);
    this.addChild(have, rule);
  }

  /** Right block of a king: the two awakening requirements and where the player stands. */
  private drawAwaken(unit: UnitState, x: number, maxW: number): void {
    const b = this.env.battle;
    const tier = b.synergyTier(unitClass(unit.id));
    const need = b.awakenCost();
    const synergy = requirement(t('hud.plan.synergy', { need: AWAKEN_MIN_TIER, now: tier }), tier >= AWAKEN_MIN_TIER, maxW);
    synergy.position.set(x, LINE_1);
    const purr = requirement(t('hud.plan.purr', { have: b.purr, need }), b.purr >= need, maxW);
    purr.position.set(x, LINE_2);
    this.addChild(synergy, purr);
  }
}

