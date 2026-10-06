import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { lerp } from '@/core/math';
import { Ease, uiTweens } from '@/core/tween';
import { Fx } from '@/fx';
import type { UnitId } from '@/game/api';
import { levelSourceOf, unitClass } from '@/game/data/roster';
import { unitDef } from '@/game/data/units';
import { errorKey, profile, tn } from '@/meta';
import type { UnitView } from '@/meta/economy';
import { MAX_LEVEL } from '@/meta/data/economy';
import type { BaseUnitId } from '@/meta/types';
import {
  Button, cacheStatic, Color, confirmDialog, countUpValue, drawDashedLine, drawIcon, drawPaperFace, motion, paperShape,
  popIn, ProgressBar, ScreenScaffold, toast, TweenBag, uiLabel,
} from '@/ui';
import { PAGE_TOP, paperPage, stampIn, stampMark, type PaperPage } from '../shop/paperBits';
import { services } from '../contract';
import { getShell } from '../shop/context';
import { cardProgress, lineSentence } from './collection';
import { LineRow } from './LineRow';
import { UnitHero } from './UnitHero';
import { deltaText, isImprovement, isUnitId, perkRows, STAT_KEYS, statText, unitStatsAt, type StatBlock, type StatKey } from './unitStats';

const HERO_TOP = 48;
const STAT_ROW = 72;
const PERK_ROW = 92;

interface StatRow {
  key: StatKey;
  now: Text;
  arrow: Container;
  next: Text;
  good: Container;
  bad: Container;
  delta: Text;
}

interface PerkRowView {
  level: number;
  row: Container;
  tick: Container;
  strip: Graphics;
  chip: Text;
  text: Text;
}

function statLabel(key: StatKey, value: number): string {
  const s = statText(key, value);
  return key === 'interval' ? t('cats.stat.sec', { n: s }) : s;
}

/** A coloured delta pill ("+13") under the text: leaf for better, berry for worse. */
function deltaPill(fill: number, edge: number): Container {
  const c = new Container();
  c.addChild(paperShape({ w: 112, h: 46, kind: 'pill', fill, edge, shadow: 3, grain: false }));
  return c;
}

/**
 * Full screen of one cat: a hero sheet (the sticker on a paper pedestal), its merge line with a plain-words
 * sentence, the numbers with next-level differences, the skill, the three level perks as a checklist, card
 * progress and the level-up button. Level-ups roll the numbers, stamp the sheet and rain paper confetti.
 */
class UnitScreen {
  private readonly bag = new TweenBag();
  private readonly scaffold: ScreenScaffold;
  private readonly fx: Fx;
  private readonly offUpdate: () => void;
  private readonly offProfile: () => void;
  private readonly fxHost = new Container();
  private readonly statRows: StatRow[] = [];
  private readonly perkViews: PerkRowView[] = [];
  private readonly action: Button;
  private hero: UnitHero | null = null;
  private cardBar: ProgressBar | null = null;
  private cardLine: Text | null = null;
  private wildLine: Text | null = null;
  private cardsView: Container | null = null;
  private cardsTop = 0;
  /** Whether the built cards page has room for the wild-card line. */
  private cardsWild = false;
  private unit!: UnitId;
  private base!: BaseUnitId;
  private guardian = false;
  private closing = false;
  private levelNow = 1;

  constructor(unit: UnitId) {
    this.scaffold = new ScreenScaffold({ title: t('cats.unit.title'), onBack: () => this.close(), actionBarHeight: 148 });
    game.popupLayer.addChild(this.scaffold);
    this.scaffold.content.addChild(this.fxHost);
    this.fx = new Fx(this.fxHost, uiTweens);
    this.offUpdate = game.onUpdate((dt) => this.fx.update(dt));

    this.action = new Button({ label: t('cats.unit.levelUp'), style: 'primary', width: 560, height: 112, fontSize: 44, tape: 'pink' });
    this.scaffold.actionBar.addChild(this.action);
    this.action.onTap(() => this.onAction());
    this.action.onDisabledTap(() => this.explain(this.view()));

    this.setUnit(unit);
    this.offProfile = profile.subscribe(() => {
      if (!this.closing) this.refresh();
    });
    void this.scaffold.show(true);
  }

  /** Rebuild the static parts for a cat (also used when another cat of the line is picked). */
  setUnit(unit: UnitId): void {
    this.unit = unit;
    this.base = levelSourceOf(unit) as BaseUnitId;
    this.guardian = unit !== this.base;
    this.rebuild();
    this.refresh();
    this.scaffold.scroller?.scrollToTop(false);
  }

  private rebuild(): void {
    const c = this.scaffold.content;
    const W = this.scaffold.contentWidth;
    this.bag.killAll();
    for (const ch of [...c.children]) if (ch !== this.fxHost) ch.destroy({ children: true });
    this.statRows.length = 0;
    this.perkViews.length = 0;

    const hero = new UnitHero(this.unit, W);
    hero.position.set(0, HERO_TOP);
    c.addChildAt(hero, 0);
    this.hero = hero;
    let y = HERO_TOP + hero.heroH + 26;

    y += this.linePage(W, y) + 6;
    y += this.statsPage(W, y) + 6;
    y += this.skillPage(W, y) + 6;
    y += this.perksPage(W, y) + 6;
    this.cardsTop = y;
    this.cardsPage(W, y, false);
    c.addChild(this.fxHost);
    this.scaffold.refresh();
  }

  private place(page: PaperPage, y: number): number {
    page.view.position.set(0, y);
    this.scaffold.content.addChild(page.view);
    return page.height;
  }

  /** The five cats of this class with this one marked, and what two of this cat become, in words. */
  private linePage(W: number, y: number): number {
    const sentence = lineSentence(this.unit);
    const text = t(sentence.key, { a: t(`unit.${sentence.a}.name`), b: t(`unit.${sentence.b}.name`) });
    const line = uiLabel(text, { size: 28, wrap: W - 64, lineHeight: 36, anchorX: 0, anchorY: 0, align: 'left' });
    const row = new LineRow({ classId: unitClass(this.unit), width: W - 36, mode: 'mini', onTap: (u) => this.setUnit(u) });
    row.frames.get(this.unit)?.setMarked(true);
    const page = paperPage(W, row.rowHeight + 20 + line.height + 6, t('cats.unit.line'), 'info');
    row.position.set(18, PAGE_TOP + 14);
    line.position.set(30, PAGE_TOP + 14 + row.rowHeight + 20);
    page.content.addChild(row, line);
    return this.place(page, y);
  }

  private statsPage(W: number, y: number): number {
    const page = paperPage(W, STAT_KEYS.length * STAT_ROW + 8, t('cats.unit.stats'), 'primary');
    const g = new Graphics();
    STAT_KEYS.forEach((key, i) => {
      const ry = PAGE_TOP + 4 + i * STAT_ROW + STAT_ROW / 2;
      if (i > 0) drawDashedLine(g, 24, ry - STAT_ROW / 2, W - 24, ry - STAT_ROW / 2, { color: Color.kraftDark, alpha: 0.45, width: 2.5, dash: 10, gap: 8 });
      const label = uiLabel(t(`cats.stat.${key}`), { size: 28, anchorX: 0 });
      label.position.set(28, ry);
      const now = uiLabel('', { size: 30, anchorX: 1 });
      now.position.set(W - 332, ry);
      const arrow = drawIcon('arrow_up', 30, Color.inkSoft);
      arrow.rotation = Math.PI / 2;
      arrow.position.set(W - 296, ry);
      const next = uiLabel('', { size: 30, anchorX: 1 });
      next.position.set(W - 204, ry);
      const good = deltaPill(Color.leaf, Color.leafDark);
      const bad = deltaPill(Color.berry, Color.berryDark);
      good.position.set(W - 88, ry);
      bad.position.set(W - 88, ry);
      const delta = uiLabel('', { size: 26, color: Color.inkDeep });
      delta.position.set(W - 88, ry);
      page.content.addChild(label, now, arrow, next, good, bad, delta);
      this.statRows.push({ key, now, arrow, next, good, bad, delta });
    });
    cacheStatic(g);
    page.content.addChildAt(g, 0);
    return this.place(page, y);
  }

  private skillPage(W: number, y: number): number {
    const text = uiLabel(unitDef(this.unit).skillText(), { size: 28, wrap: W - 64, lineHeight: 38, anchorX: 0, anchorY: 0, align: 'left' });
    const page = paperPage(W, text.height + 14, t('cats.unit.skill'), 'mustard');
    text.position.set(30, PAGE_TOP + 8);
    page.content.addChild(text);
    return this.place(page, y);
  }

  private perksPage(W: number, y: number): number {
    const rows = perkRows(this.unit, 1);
    const page = paperPage(W, rows.length * PERK_ROW + 6, t('cats.unit.perks'), 'success');
    rows.forEach((r, i) => {
      const row = new Container();
      row.position.set(0, PAGE_TOP + 4 + i * PERK_ROW);
      const strip = new Graphics();
      const chip = uiLabel(t('cats.unit.perkAt', { n: r.level }), { size: 28, anchorX: 0 });
      chip.position.set(94, PERK_ROW / 2);
      const check = new Container();
      const box = new Graphics();
      drawPaperFace(box, -22, -22, { w: 44, h: 44, radius: 10, fill: Color.paperLight, edge: Color.kraftDark, edgeAlpha: 0.9, grain: false });
      cacheStatic(box);
      const tick = drawIcon('check', 38);
      check.addChild(box, tick);
      check.position.set(54, PERK_ROW / 2);
      const text = uiLabel(r.text, { size: 28, anchorX: 0, wrap: W - 270, lineHeight: 34, align: 'left' });
      text.position.set(192, PERK_ROW / 2);
      row.addChild(strip, check, chip, text);
      page.content.addChild(row);
      this.perkViews.push({ level: r.level, row, tick, strip, chip, text });
    });
    return this.place(page, y);
  }

  /** Card progress, or for a guardian the note that it follows its king. The wild-card line gets its room only when there is one. */
  private cardsPage(W: number, y: number, wild: boolean): void {
    this.cardsWild = wild;
    this.cardBar = null;
    this.cardLine = null;
    this.wildLine = null;
    if (this.guardian) {
      const note = uiLabel(t('cats.unit.guardianNote', { unit: t(`unit.${this.base}.name`) }), { size: 26, color: Color.inkSoft, wrap: W - 64, lineHeight: 34, anchorX: 0, anchorY: 0, align: 'left' });
      const page = paperPage(W, note.height + 10, t('cats.unit.cards'), 'danger');
      note.position.set(30, PAGE_TOP + 6);
      page.content.addChild(note);
      this.place(page, y);
      this.cardsView = page.view;
      return;
    }
    const page = paperPage(W, 48 + 14 + 34 + (wild ? 30 : 0) + 14, t('cats.unit.cards'), 'danger');
    this.cardBar = new ProgressBar({ width: W - 56, height: 48, color: 'blue', label: '' });
    this.cardBar.position.set(W / 2, PAGE_TOP + 28);
    this.cardLine = uiLabel('', { size: 26, anchorX: 0, anchorY: 0, wrap: W - 64, lineHeight: 32, align: 'left' });
    this.cardLine.position.set(30, PAGE_TOP + 48 + 20);
    this.wildLine = uiLabel('', { size: 24, color: Color.inkSoft, anchorX: 0, anchorY: 0, wrap: W - 64, lineHeight: 30, align: 'left' });
    this.wildLine.position.set(30, PAGE_TOP + 48 + 56);
    page.content.addChild(this.cardBar, this.cardLine, this.wildLine);
    this.place(page, y);
    this.cardsView = page.view;
  }

  /** Rebuild the last page when the wild-card line appears or goes away, so no blank band is left under the card line. */
  private fitCardsPage(wild: boolean): void {
    if (this.guardian || wild === this.cardsWild) return;
    this.cardsView?.destroy({ children: true });
    this.cardsPage(this.scaffold.contentWidth, this.cardsTop, wild);
    this.scaffold.content.addChild(this.fxHost);
    this.scaffold.refresh();
  }

  private view(): UnitView {
    return profile.unitView(this.base);
  }

  /** Redraw every number from the profile. */
  private refresh(): void {
    const v = this.view();
    const level = v.level;
    this.levelNow = level;
    this.hero?.setLevel(level);
    const now = unitStatsAt(this.unit, level);
    const next = unitStatsAt(this.unit, Math.min(MAX_LEVEL, level + 1));
    this.setStats(now, next, v.quote.maxed);
    const W = this.scaffold.contentWidth;
    perkRows(this.unit, level).forEach((r, i) => {
      const pv = this.perkViews[i];
      if (!pv) return;
      pv.tick.visible = r.unlocked;
      pv.text.alpha = r.unlocked ? 1 : 0.6;
      pv.chip.alpha = r.unlocked ? 1 : 0.6;
      pv.strip.clear();
      if (r.unlocked) drawPaperFace(pv.strip, 16, 6, { w: W - 32, h: PERK_ROW - 12, radius: 18, fill: Color.paperDim, edge: Color.leaf, edgeAlpha: 0.7, grain: false });
    });
    this.refreshAction(v);
  }

  private setStats(now: StatBlock, next: StatBlock, maxed: boolean): void {
    for (const r of this.statRows) {
      r.now.text = statLabel(r.key, now[r.key]);
      const text = maxed ? '' : deltaText(r.key, now[r.key], next[r.key]);
      const show = text !== '';
      const good = isImprovement(r.key, next[r.key] - now[r.key]);
      r.arrow.visible = show;
      r.next.visible = show;
      r.good.visible = show && good;
      r.bad.visible = show && !good;
      r.delta.visible = show;
      r.next.text = statLabel(r.key, next[r.key]);
      r.delta.text = text;
    }
  }

  private refreshAction(v: UnitView): void {
    const q = v.quote;
    if (this.guardian) {
      this.action.setLabel(t('cats.unit.toLegendary', { unit: t(`unit.${this.base}.name`) }));
      this.action.setSublabel(undefined);
      this.action.setEnabled(true);
      return;
    }
    const p = cardProgress(v);
    const wildText = p.maxed ? '' : !q.enoughCards ? tn('cats.unit.needMore', q.wildUsed - v.wild) : q.wildUsed > 0 ? tn('cats.unit.wildLine', q.wildUsed) : v.wild > 0 ? tn('cats.unit.wildHave', v.wild) : '';
    this.fitCardsPage(wildText !== '');
    if (this.cardBar && this.cardLine && this.wildLine) {
      this.cardBar.setColor(p.maxed ? 'gold' : p.have >= p.needed ? 'green' : 'blue');
      this.cardBar.setLabel(p.maxed ? t('cats.max') : `${p.have}/${p.needed}`);
      this.cardBar.setValue(p.needed > 0 ? p.have / p.needed : 1, false);
      this.cardLine.text = p.maxed ? t('cats.unit.maxLine') : t('cats.unit.cardsLine', { own: v.cards, need: q.cards });
      this.wildLine.text = wildText;
    }
    if (q.maxed) {
      this.action.setLabel(t('cats.unit.maxed'));
      this.action.setSublabel(undefined);
      this.action.setEnabled(false);
      return;
    }
    this.action.setLabel(t('cats.unit.levelUp'));
    this.action.setSublabel(fmt(q.gold), 'coin');
    this.action.setEnabled(q.enoughCards && q.enoughGold);
  }

  private onAction(): void {
    if (this.guardian) {
      this.setUnit(this.base);
      return;
    }
    const v = this.view();
    if (!v.quote.enoughCards || !v.quote.enoughGold) {
      this.explain(v);
      return;
    }
    const before = { level: v.level, stats: unitStatsAt(this.unit, v.level) };
    const r = profile.levelUp(this.base);
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      audio.play('ui_error');
      return;
    }
    this.celebrate(before.level, before.stats);
  }

  /** Say why the button is off and offer the way to fix it. */
  private explain(v: UnitView): void {
    audio.play('ui_error');
    haptic('warning');
    const q = v.quote;
    if (q.maxed) return;
    if (!q.enoughCards) {
      const need = Math.max(1, q.wildUsed - v.wild);
      void confirmDialog({
        title: t('cats.err.cardsTitle'),
        message: tn('cats.err.cards', need),
        confirmLabel: t('cats.err.goShop'),
        cancelLabel: t('cats.err.later'),
      }).then((go) => {
        if (go) {
          this.close();
          services.openShop('chests');
        }
      });
      return;
    }
    void confirmDialog({
      title: t('cats.err.goldTitle'),
      message: t('cats.err.gold', { n: fmt(q.gold - profile.data.gold) }),
      confirmLabel: t('cats.err.goBattle'),
      cancelLabel: t('cats.err.later'),
    }).then((go) => {
      if (go) {
        this.close();
        getShell()?.goTab('battle');
      }
    });
  }

  /** Paper confetti, a stamp on the sheet and a number roll; the sheet scrolls into view first. */
  private celebrate(fromLevel: number, from: StatBlock): void {
    const level = this.levelNow;
    const W = this.scaffold.contentWidth;
    const hero = this.hero;
    const perkUnlocked = perkRows(this.unit, level).some((r) => r.level === level);
    audio.play('upgrade');
    if (perkUnlocked) audio.stinger('level_up');
    haptic(perkUnlocked ? 'success' : 'medium');

    this.scaffold.scroller?.scrollToTop(true);
    hero?.celebrate();
    this.fx.confettiRain({ count: 70, x: W / 2, y: HERO_TOP + 40, width: W - 80 });

    const to = unitStatsAt(this.unit, level);
    const next = unitStatsAt(this.unit, Math.min(MAX_LEVEL, level + 1));
    const maxed = level >= MAX_LEVEL;
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.55,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        hero?.setLevel(Math.round(countUpValue(fromLevel, level, k)));
        for (const r of this.statRows) r.now.text = statLabel(r.key, lerp(from[r.key], to[r.key], k));
      },
      onComplete: () => this.setStats(to, next, maxed),
    });

    const pv = this.perkViews.find((p) => p.level === level);
    if (pv && !motion.reduced) popIn(this.bag, pv.tick, { from: 0.4, duration: 0.4, overshoot: 3 });

    const stamp = stampMark(t('cats.stamp'), { size: 48, maxWidth: W - 120, tilt: -0.14 });
    stamp.position.set(W / 2 + 70, HERO_TOP + 138);
    this.scaffold.content.addChild(stamp);
    stampIn(this.bag, stamp, 0.1, () => game.shake(0.12));
    this.bag.run({
      duration: motion.reduced ? 0.4 : 0.35,
      delay: motion.reduced ? 0.4 : 1.3,
      ease: Ease.linear,
      onUpdate: (k) => {
        stamp.alpha = 0.94 * (1 - k);
      },
      onComplete: () => stamp.destroy({ children: true }),
    });
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    this.offProfile();
    void this.scaffold.hide(true).then(() => this.destroy());
  }

  destroy(): void {
    this.closing = true;
    this.offProfile();
    this.offUpdate();
    this.bag.killAll();
    this.fx.destroy();
    this.scaffold.destroy({ children: true });
    if (active === this) active = null;
  }
}

let active: UnitScreen | null = null;

/** Open the unit screen for any of the 20 cats; ids that are not cats are ignored. */
export function openUnitScreen(unit: string): void {
  if (!isUnitId(unit)) return;
  if (active) {
    active.setUnit(unit);
    return;
  }
  active = new UnitScreen(unit);
}
