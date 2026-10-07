/**
 * Class sheet: what the class does, its fixed five-rank line as a ladder of photos (owned ranks lit
 * with their counts, merge and awaken arrows), the three synergy steps explained against that ladder,
 * and the class upgrade button. Opened by tapping a class chip. The frame, the title and the class's role are built at once; the ladder,
 * the steps and the upgrade come a frame apart each, under the entrance (Staged), so the sheet opens in frames of about a third of its cost.
 */
import { Container, Graphics, Point, type DestroyOptions, type Text } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { CLASS_UPGRADE_BONUS, SYNERGY_TIER_AT, classDef, type ClassId } from '@/game';
import { Hand } from '../Hand';
import { FROM_BELOW, pawBounds, placePaw, tipSpot } from '../handMath';
import { Button, Color, drawDashedInset, drawIcon, drawPaper, drawPaperFace, fitLabel, Panel, paperSeed, Popup, punch, Staged, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from '../env';
import { ClassLadder, LADDER_H } from '../ClassLadder';
import { CLASS_ACCENT, CLASS_ICON, Subs } from '../kit';
import { nextTierGoal, rankCounts } from '../planMath';

const W = 672;
const SIDE = 24;
const ROW_H = 80;
const LADDER_Y = 160;
const RULE_Y = LADDER_Y + LADDER_H + 26;
const HEAD_Y = RULE_Y + 62;
const ROWS_Y = HEAD_Y + 42;
const UPGRADE_Y = ROWS_Y + ROW_H * 3 + 18;
/** Centre of the column holding each step's dots and its count. */
const DOTS_X = 100;

interface TierRow {
  g: Graphics;
  dots: Graphics;
  check: Container;
  tier: number;
  need: number;
}

/** The synergy steps, once built. */
interface Steps {
  haveT: Text;
  goalT: Text;
  rows: TierRow[];
}

/** The upgrade block, once built. */
interface Upgrade {
  levelT: Text;
  btn: Button;
}

export class ClassSheet extends Popup<void> {
  private readonly subs = new Subs();
  private readonly bag = new TweenBag();
  private readonly staged: Staged;
  private readonly panel: Panel;
  private ladder: ClassLadder | null = null;
  private steps: Steps | null = null;
  private upgrade: Upgrade | null = null;
  private hand: Hand | null = null;
  private readonly seed = paperSeed();
  private tierNow = -1;

  constructor(
    private readonly env: HudEnv,
    private readonly classId: ClassId,
  ) {
    super({ dismissResult: undefined, priority: 1 });
    const def = classDef(classId);
    const accent = CLASS_ACCENT[classId];
    const showUpgrade = env.reveal.classUpgrade;

    // The upgrade button's face ends 194 px under UPGRADE_Y and its lip 6 px lower: 24 px of paper under that.
    const h = UPGRADE_Y + (showUpgrade ? 224 : 8);
    this.panel = new Panel({ width: W, height: h, title: t(def.nameKey), onClose: () => this.close() });
    const c = this.panel.content;

    // The class glyph on a round kraft patch, then what the class does.
    const med = new Graphics();
    drawPaper(med, -44, -44, { w: 88, h: 88, kind: 'circle', fill: accent, edge: Color.kraftDark, shadow: 4, grain: false, seed: this.seed });
    med.position.set(SIDE + 50, 112);
    const icon = drawIcon(CLASS_ICON[classId], 60);
    icon.position.copyFrom(med.position);
    const role = uiLabel(t(def.roleKey), { size: 26, wrap: W - 190 - SIDE, lineHeight: 34, align: 'left', anchorX: 0, anchorY: 0.5 });
    role.position.set(SIDE + 114, 112);
    c.addChild(med, icon, role);

    // The tutorial's upgrade lesson: a paw on the button (the sheet is where the lesson goes on). It lies on the popup itself, in screen
    // space, so it keeps its size when the sheet is fitted to a short screen and can be placed against the screen's edges.
    if (env.lesson() === 'class_upgrade' && showUpgrade) {
      this.hand = new Hand();
      this.hand.visible = false;
      this.addChild(this.hand);
    }

    this.body.addChild(this.panel);
    this.setContentSize(W + 24, h + 100);

    const ev = env.battle.events;
    for (const type of ['upgrade', 'synergy', 'summon', 'merge', 'molt', 'awaken', 'sell', 'fish'] as const) {
      this.subs.add(ev.on(type, () => this.refresh(true)));
    }
    const stages = [() => this.buildLadder(), () => this.buildSteps()];
    if (showUpgrade) stages.push(() => this.buildUpgrade());
    this.staged = new Staged(stages);
    this.staged.start();
  }

  override finishBuild(): void {
    this.staged.finish();
  }

  override layout(w: number, h: number): void {
    super.layout(w, h);
    if (this.hand?.visible) this.pawOnButton();
  }

  override onOpened(): void {
    // The paw arrives once the sheet has settled, so it never points at a button that is still on its way.
    this.bag.call(0.4, () => this.pawOnButton());
  }

  /** The ladder and the rule it shows. */
  private buildLadder(): void {
    const ladder = new ClassLadder(this.classId, W - SIDE * 2 - 8);
    ladder.position.set(SIDE + 4, LADDER_Y);
    // The tutorial's first look at the sheet says what to look at and how to leave it.
    const rule = uiLabel(this.env.lesson() === 'classes' ? t('guide.tut.sheet') : t('hud.class.rule'), { size: 24, color: Color.inkSoft, wrap: W - SIDE * 2 - 20, lineHeight: 30 });
    rule.position.set(W / 2, RULE_Y + 18);
    this.panel.content.addChild(ladder, rule);
    this.ladder = ladder;
    this.refresh(false);
  }

  /** The synergy steps: how many different cats of the class are on the board, and what the next step asks for. */
  private buildSteps(): void {
    const c = this.panel.content;
    const def = classDef(this.classId);
    const haveT = uiLabel('', { size: 26, anchorX: 0, align: 'left' });
    haveT.position.set(SIDE + 4, HEAD_Y);
    const goalT = uiLabel('', { size: 24, color: Color.inkSoft, anchorX: 1, align: 'right' });
    goalT.position.set(W - SIDE - 4, HEAD_Y);
    c.addChild(haveT, goalT);
    const rows: TierRow[] = [];
    for (let i = 0; i < 3; i++) {
      const tierNo = (i + 1) as 1 | 2 | 3;
      const need = SYNERGY_TIER_AT[i] ?? i + 2;
      const y = ROWS_Y + i * ROW_H;
      const g = new Graphics();
      g.position.set(0, y);
      // The dots sit over their count, centred in a column of their own.
      const dots = new Graphics();
      dots.position.set(DOTS_X - (need * 22) / 2, y + ROW_H / 2 - 13);
      const count = uiLabel(t(tierNo === 3 ? 'hud.class.need.more' : 'hud.class.need', { n: need }), { size: 24 });
      fitLabel(count, 110, 24, 0.8);
      count.position.set(DOTS_X, y + ROW_H / 2 + 16);
      const text = uiLabel(def.tierText(tierNo), { size: 26, wrap: W - 190 - 90, lineHeight: 32, align: 'left', anchorX: 0 });
      text.position.set(190, y + ROW_H / 2);
      const check = drawIcon('check', 38);
      check.position.set(W - SIDE - 34, y + ROW_H / 2);
      c.addChild(g, dots, count, text, check);
      rows.push({ g, dots, check, tier: tierNo, need });
    }
    this.steps = { haveT, goalT, rows };
    this.refresh(false);
  }

  private buildUpgrade(): void {
    const levelT = uiLabel('', { size: 30, anchorX: 0, align: 'left' });
    levelT.position.set(SIDE + 8, UPGRADE_Y + 26);
    const noteT = uiLabel(t('hud.class.note', { n: Math.round(CLASS_UPGRADE_BONUS * 100) }), {
      size: 24, color: Color.inkSoft, anchorX: 0, align: 'left', wrap: W - 80,
    });
    noteT.position.set(SIDE + 8, UPGRADE_Y + 68);
    const btn = new Button({ label: t('hud.upgrade'), style: 'success', width: 320, height: 96, fontSize: 38, fireOnDown: true });
    btn.position.set(W / 2, UPGRADE_Y + 146);
    btn.onTap(() => {
      this.env.ctx.command('upgradeClass', () => this.env.battle.upgradeClass(this.classId));
    });
    this.panel.content.addChild(levelT, noteT, btn);
    this.upgrade = { levelT, btn };
    this.refresh(false);
  }

  /** The paw's tip on the upgrade button's free side (its label stays clear), the arm coming in from where the screen has room. */
  private pawOnButton(): void {
    const hand = this.hand;
    const btn = this.upgrade?.btn;
    if (!hand || !btn || hand.destroyed || !this.parent) return;
    const b = btn.getBounds();
    const a = this.toLocal(new Point(b.x, b.y));
    const z = this.toLocal(new Point(b.x + b.width, b.y + b.height));
    const { tip, label } = tipSpot({ x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y });
    const pose = placePaw({
      tips: [tip],
      bounds: pawBounds(this.env.layout()),
      keep: [{ ...label, weight: 3 }],
      prefer: FROM_BELOW,
    });
    hand.place(tip.x, tip.y, pose.rotation);
    hand.tap();
    if (!hand.visible) {
      hand.visible = true;
      hand.alpha = 0;
      this.bag.run({ duration: 0.2, onUpdate: (k) => (hand.alpha = k) });
    }
  }

  /** Dots for the different cats of the class on the board: lit up to the count, one per kind the step asks for. */
  private drawRow(r: TierRow, distinct: number, tier: number): void {
    const accent = CLASS_ACCENT[this.classId];
    const lit = r.tier <= tier;
    const current = r.tier === tier;
    r.check.visible = lit;
    r.g.clear();
    const face = {
      w: W - SIDE * 2, h: ROW_H - 12, radius: 20, fill: lit ? Color.paperLight : Color.paperDim,
      edge: lit ? accent : Color.kraftDark, edgeWidth: lit ? 3 : 2, edgeAlpha: lit ? 0.95 : 0.4, grain: false, seed: this.seed + r.tier,
    } as const;
    drawPaperFace(r.g, SIDE, 6, face);
    if (current) drawDashedInset(r.g, SIDE, 6, face, 6, { color: accent, width: 2.5, dash: 10, gap: 7 });
    r.dots.clear();
    for (let i = 0; i < r.need; i++) {
      const on = i < distinct;
      r.dots.circle(i * 22 + 11, 0, 9).fill(on ? accent : Color.paperDim).stroke({ width: 2.5, color: on ? Color.ink : Color.kraftDark });
    }
  }

  /** Brings what is built so far up to date; a part that comes later is brought up to date when it is built. */
  private refresh(animate: boolean): void {
    const b = this.env.battle;
    const id = this.classId;
    this.ladder?.set(rankCounts(id, b.units));
    const steps = this.steps;
    if (steps) {
      const distinct = b.classDistinct(id);
      steps.haveT.text = t('hud.class.have', { n: distinct });
      const goal = nextTierGoal(distinct);
      steps.goalT.text = goal ? t('hud.class.goal', { tier: goal.tier, n: goal.missing }) : t('hud.class.goalMax');
      fitLabel(steps.goalT, W - SIDE * 2 - 8 - steps.haveT.width - 16, 24, 0.75);
      const tier = b.synergyTier(id);
      for (const r of steps.rows) this.drawRow(r, distinct, tier);
      if (animate && tier > this.tierNow && this.tierNow >= 0) punch(this.bag, this.panel, 0.03, 0.2);
      this.tierNow = tier;
    }
    const up = this.upgrade;
    if (up) {
      const level = b.classUpgradeLevel(id);
      const cost = b.classUpgradeCost(id);
      up.levelT.text = t('hud.class.level', { lv: level, max: 5 });
      if (cost < 0) {
        up.btn.setLabel(t('hud.maxed'));
        up.btn.setSublabel(undefined);
        up.btn.setStyle('neutral');
      } else {
        up.btn.setLabel(t('hud.upgrade'));
        up.btn.setSublabel(fmt(cost), 'fish');
        up.btn.setStyle(b.fish >= cost ? 'success' : 'kraft');
      }
      if (animate) punch(this.bag, up.levelT, 0.18, 0.2);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.subs.dispose();
    this.staged.destroy();
    this.bag.killAll();
    super.destroy(options);
  }
}
