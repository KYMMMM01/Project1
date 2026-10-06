import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease, uiTweens } from '@/core/tween';
import { lerp } from '@/core/math';
import { Fx } from '@/fx';
import type { UnitId } from '@/game/api';
import { levelSourceOf, unitClass, unitRarity } from '@/game/data/roster';
import { unitDef } from '@/game/data/units';
import { errorKey, profile } from '@/meta';
import type { UnitView } from '@/meta/economy';
import { MAX_LEVEL } from '@/meta/data/economy';
import type { BaseUnitId } from '@/meta/types';
import {
  Button, Color, confirmDialog, countUpValue, drawGlow, drawIcon, drawShadow, fitLabel, Panel, popIn, ProgressBar, punch,
  rarityName, Rarity, ScreenScaffold, toast, TweenBag, uiLabel, vGradient, motion,
} from '@/ui';
import { unitPortrait } from '../shop/art';
import { classIcon } from '../shop/keys';
import { services } from '../contract';
import { getShell } from '../shop/context';
import { cardProgress } from './collection';
import { deltaText, isImprovement, isUnitId, perkRows, STAT_KEYS, statText, unitStatsAt, type StatBlock, type StatKey } from './unitStats';

const PORTRAIT = 360;
const HERO_H = 700;
const CAT_Y = 290;

interface StatRow {
  key: StatKey;
  label: Text;
  now: Text;
  arrow: Container;
  next: Text;
  delta: Text;
}

interface PerkRowView {
  level: number;
  icon: Container;
  lock: Container;
  chip: Text;
  text: Text;
  plate: Graphics;
  row: Container;
}

function statLabel(key: StatKey, value: number): string {
  const s = statText(key, value);
  return key === 'interval' ? t('cats.stat.sec', { n: s }) : s;
}

/** Full screen of one cat: big portrait on a pedestal, numbers, perks, card progress and the level-up button. */
class UnitScreen {
  private readonly bag = new TweenBag();
  private readonly scaffold: ScreenScaffold;
  private readonly fx: Fx;
  private readonly offUpdate: () => void;
  private readonly offProfile: () => void;
  private readonly raysLayer = new Container();
  private readonly fxHost = new Container();
  private readonly portraitHost = new Container();
  private readonly levelText: Text;
  private readonly statRows: StatRow[] = [];
  private readonly perkViews: PerkRowView[] = [];
  private cardBar: ProgressBar | null = null;
  private cardLine: Text | null = null;
  private wildLine: Text | null = null;
  private cat: Container | null = null;
  private readonly action: Button;
  private rays: ReturnType<Fx['rays']> | null = null;
  private unit!: UnitId;
  private base!: BaseUnitId;
  private guardian = false;
  private closing = false;
  private levelNow = 1;

  constructor(unit: UnitId) {
    this.scaffold = new ScreenScaffold({
      title: t('cats.unit.title'),
      onBack: () => this.close(),
      actionBarHeight: 148,
    });
    game.popupLayer.addChild(this.scaffold);
    const c = this.scaffold.content;
    c.addChild(this.raysLayer, this.portraitHost, this.fxHost);
    this.fx = new Fx(this.fxHost, uiTweens);
    this.offUpdate = game.onUpdate((dt) => this.fx.update(dt));

    this.levelText = uiLabel('', { size: 46, strokeWidth: 7 });
    this.action = new Button({ label: t('cats.unit.levelUp'), style: 'primary', width: 560, height: 112, fontSize: 44 });
    this.scaffold.actionBar.addChild(this.action);
    this.action.onTap(() => this.onAction());
    this.action.onDisabledTap(() => this.explain(this.view()));

    this.setUnit(unit);
    this.offProfile = profile.subscribe(() => {
      if (!this.closing) this.refresh();
    });
    void this.scaffold.show(true);
  }

  /** Rebuild the static parts for a cat (also used when switching from a guardian to its king). */
  setUnit(unit: UnitId): void {
    this.unit = unit;
    this.base = levelSourceOf(unit) as BaseUnitId;
    this.guardian = unit !== this.base;
    this.rebuild();
    this.refresh();
  }

  private rebuild(): void {
    const c = this.scaffold.content;
    const W = this.scaffold.contentWidth;
    const rarity = unitRarity(this.unit);
    const rs = Rarity[rarity];
    this.rays?.stop();
    this.rays = null;
    this.bag.killAll();
    for (const ch of [...c.children]) {
      if (ch !== this.raysLayer && ch !== this.portraitHost && ch !== this.fxHost) ch.destroy({ children: true });
    }
    this.portraitHost.removeChildren().forEach((ch) => ch.destroy({ children: true }));
    this.statRows.length = 0;
    this.perkViews.length = 0;

    // Hero: slow rays, pedestal, the cat on it.
    this.rays = this.fx.rays(W / 2, CAT_Y, { color: rs.glow, radius: 460, speed: 0.22, alpha: 0.55, count: 12, parent: this.raysLayer });
    const glow = new Graphics();
    drawGlow(glow, W / 2, CAT_Y + 20, 300, rs.glow, 0.35);
    const ped = new Graphics();
    drawShadow(ped, W / 2 - 200, CAT_Y + 215, 400, 70, 35, { alpha: 0.5, spread: 22, offsetY: 10 });
    ped.ellipse(W / 2, CAT_Y + 262, 210, 52).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 6, color: Color.outline, alignment: 1 });
    ped.ellipse(W / 2, CAT_Y + 250, 178, 40).fill(vGradient(rs.light, rs.dark)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    this.portraitHost.addChild(glow, ped);
    const cat = unitPortrait(this.unit, rarity, PORTRAIT);
    cat.position.set(W / 2, CAT_Y);
    this.portraitHost.addChild(cat);
    this.cat = cat;
    if (!motion.reduced) {
      const sx = cat.scale.x;
      this.bag.run({
        duration: 1.5, repeat: -1, yoyo: true, ease: Ease.sineInOut,
        onUpdate: (k) => {
          cat.y = CAT_Y - 10 * k;
          cat.scale.y = sx * (1 + 0.015 * k);
        },
      });
    }

    const name = uiLabel(t(`unit.${this.unit}.name`), { size: 56, strokeWidth: 8 });
    fitLabel(name, W - 40, 56);
    name.position.set(W / 2, 38);
    const pill = new Container();
    const pillBg = new Graphics();
    const rt = uiLabel(rarityName(rarity), { size: 28, strokeWidth: 5, shadow: false });
    const rw = rt.width + 44;
    pillBg.roundRect(-rw / 2, -26, rw, 52, 26).fill(vGradient(rs.color, rs.dark)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    pill.addChild(pillBg, rt);
    pill.position.set(W / 2 - 110, 100);
    const cls = unitClass(this.unit);
    const clsRow = new Container();
    const clsIc = drawIcon(classIcon(cls), 46);
    const clsT = uiLabel(t(`class.${cls}.name`), { size: 28, strokeWidth: 5, shadow: false, anchorX: 0 });
    clsIc.position.set(0, 0);
    clsT.position.set(34, 0);
    clsRow.addChild(clsIc, clsT);
    clsRow.position.set(W / 2 + 40, 100);

    this.levelText.position.set(W / 2, CAT_Y + 255);
    const flavour = uiLabel(t(unitDef(this.unit).descKey), { size: 28, color: Color.textDim, strokeWidth: 4, shadow: false, wrap: W - 60, lineHeight: 36 });
    flavour.position.set(W / 2, CAT_Y + 345);
    c.addChild(name, pill, clsRow, this.levelText, flavour);

    let y = HERO_H;
    // Stats.
    const statsPanel = this.panel(W, 96 + STAT_KEYS.length * 74 + 14, t('cats.unit.stats'), y);
    STAT_KEYS.forEach((key, i) => {
      const ry = 90 + i * 74 + 37;
      const label = uiLabel(t(`cats.stat.${key}`), { size: 28, strokeWidth: 4, shadow: false, anchorX: 0 });
      label.position.set(28, ry);
      const now = uiLabel('', { size: 30, strokeWidth: 5, shadow: false, anchorX: 1 });
      now.position.set(W - 330, ry);
      const arrow = drawIcon('arrow_up', 30, Color.textDim);
      arrow.rotation = Math.PI / 2;
      arrow.position.set(W - 292, ry);
      const next = uiLabel('', { size: 30, strokeWidth: 5, shadow: false, anchorX: 1 });
      next.position.set(W - 190, ry);
      const delta = uiLabel('', { size: 26, color: Color.success, strokeWidth: 4, shadow: false, anchorX: 1 });
      delta.position.set(W - 32, ry);
      statsPanel.content.addChild(label, now, arrow, next, delta);
      this.statRows.push({ key, label, now, arrow, next, delta });
    });
    y += statsPanel.panelH + 22;

    // Skill.
    const skillText = uiLabel(unitDef(this.unit).skillText(), { size: 28, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: W - 56, lineHeight: 38 });
    const skillH = 84 + skillText.height + 26;
    const skillPanel = this.panel(W, skillH, t('cats.unit.skill'), y);
    skillText.position.set(28, 84);
    skillPanel.content.addChild(skillText);
    y += skillH + 22;

    // Perks.
    const rows = perkRows(this.unit, 1);
    const perkPanel = this.panel(W, 90 + rows.length * 96 + 14, t('cats.unit.perks'), y);
    rows.forEach((r, i) => {
      const row = new Container();
      row.position.set(0, 90 + i * 96);
      const plate = new Graphics();
      const chip = uiLabel(t('cats.unit.perkAt', { n: r.level }), { size: 26, strokeWidth: 5 });
      chip.position.set(80, 44);
      const icon = drawIcon('check', 40, Color.success);
      icon.position.set(W - 56, 44);
      const lock = drawIcon('lock', 40);
      lock.position.set(W - 56, 44);
      const text = uiLabel(r.text, { size: 28, strokeWidth: 4, shadow: false, anchorX: 0, wrap: W - 260, lineHeight: 34 });
      text.position.set(150, 44);
      row.addChild(plate, chip, text, icon, lock);
      perkPanel.content.addChild(row);
      this.perkViews.push({ level: r.level, icon, lock, chip, text, plate, row });
    });
    y += perkPanel.panelH + 22;

    // Card progress or the guardian note.
    if (this.guardian) {
      const note = uiLabel(t('cats.unit.guardianNote', { unit: t(`unit.${this.base}.name`) }), {
        size: 26, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: W - 56, lineHeight: 34,
      });
      const h = 36 + note.height + 36;
      const p = this.panel(W, h, '', y);
      note.position.set(28, 36);
      p.content.addChild(note);
      this.cardBar = null;
      this.cardLine = null;
      this.wildLine = null;
    } else {
      const p = this.panel(W, 90 + 48 + 18 + 36 + 34 + 24, t('cats.unit.cards'), y);
      this.cardBar = new ProgressBar({ width: W - 56, height: 48, color: 'blue', label: '' });
      this.cardBar.position.set(W / 2, 90 + 24);
      this.cardLine = uiLabel('', { size: 26, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: W - 56, lineHeight: 32 });
      this.cardLine.position.set(28, 90 + 48 + 18);
      this.wildLine = uiLabel('', { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false, anchorX: 0, anchorY: 0, wrap: W - 56, lineHeight: 30 });
      this.wildLine.position.set(28, 90 + 48 + 60);
      p.content.addChild(this.cardBar, this.cardLine, this.wildLine);
    }
    this.scaffold.refresh();
  }

  private panel(W: number, h: number, title: string, y: number): Panel {
    const p = new Panel({ width: W, height: h, variant: 'inset' });
    p.position.set(W / 2, y + h / 2);
    if (title) {
      const hd = uiLabel(title, { size: 34, strokeWidth: 6, anchorX: 0, color: Color.primary });
      hd.position.set(28, 44);
      p.content.addChild(hd);
    }
    this.scaffold.content.addChild(p);
    return p;
  }

  private view(): UnitView {
    return profile.unitView(this.base);
  }

  /** Redraw every number from the profile. */
  private refresh(): void {
    const v = this.view();
    const level = v.level;
    this.levelNow = level;
    this.levelText.text = t('cats.lv', { n: level });
    const now = unitStatsAt(this.unit, level);
    const next = unitStatsAt(this.unit, Math.min(MAX_LEVEL, level + 1));
    this.setStats(now, next, v.quote.maxed);
    perkRows(this.unit, level).forEach((r, i) => {
      const pv = this.perkViews[i];
      if (!pv) return;
      pv.icon.visible = r.unlocked;
      pv.lock.visible = !r.unlocked;
      const dim = r.unlocked ? 1 : 0.5;
      pv.text.alpha = dim;
      pv.chip.alpha = dim;
      pv.plate.clear();
      if (r.unlocked) pv.plate.roundRect(14, 6, this.scaffold.contentWidth - 28, 76, 18).fill({ color: Color.success, alpha: 0.16 });
    });
    this.refreshAction(v);
  }

  private setStats(now: StatBlock, next: StatBlock, maxed: boolean): void {
    for (const r of this.statRows) {
      r.now.text = statLabel(r.key, now[r.key]);
      const d = next[r.key] - now[r.key];
      const show = !maxed && deltaText(r.key, now[r.key], next[r.key]) !== '';
      r.arrow.visible = show;
      r.next.visible = show;
      r.delta.visible = show;
      r.next.text = statLabel(r.key, next[r.key]);
      r.delta.text = show ? deltaText(r.key, now[r.key], next[r.key]) : '';
      const good = isImprovement(r.key, d);
      r.delta.tint = good ? 0xffffff : Color.danger;
      r.next.tint = 0xffffff;
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
    if (this.cardBar && this.cardLine && this.wildLine) {
      this.cardBar.setColor(p.maxed ? 'gold' : p.have >= p.needed ? 'green' : 'blue');
      this.cardBar.setLabel(p.maxed ? t('cats.max') : `${p.have}/${p.needed}`);
      this.cardBar.setValue(p.needed > 0 ? p.have / p.needed : 1, false);
      this.cardLine.text = p.maxed ? t('cats.unit.maxLine') : t('cats.unit.cardsLine', { own: v.cards, need: q.cards });
      if (p.maxed) this.wildLine.text = '';
      else if (!q.enoughCards) this.wildLine.text = t('cats.unit.needMore', { n: q.wildUsed - v.wild });
      else if (q.wildUsed > 0) this.wildLine.text = t('cats.unit.wildLine', { n: q.wildUsed, m: q.wildUsed });
      else this.wildLine.text = v.wild > 0 ? t('cats.unit.wildHave', { n: v.wild }) : '';
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
        message: t('cats.err.cards', { n: need }),
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

  private celebrate(fromLevel: number, from: StatBlock): void {
    const level = this.levelNow;
    const rarity = unitRarity(this.unit);
    const rs = Rarity[rarity];
    const W = this.scaffold.contentWidth;
    const perkUnlocked = perkRows(this.unit, level).some((r) => r.level === level);
    audio.play('upgrade');
    if (perkUnlocked) audio.stinger('level_up');
    haptic(perkUnlocked ? 'success' : 'medium');

    this.fx.rays(W / 2, CAT_Y, { color: rs.glow, radius: 620, speed: 1.4, alpha: 0.9, count: 14, duration: 0.9, parent: this.raysLayer });
    this.fx.levelUp(W / 2, CAT_Y + 40);
    if (!motion.reduced) {
      punch(this.bag, this.levelText, 0.35, 0.3);
      if (this.cat) punch(this.bag, this.cat, 0.06, 0.3, this.cat.scale.x);
    }

    const to = unitStatsAt(this.unit, level);
    const next = unitStatsAt(this.unit, Math.min(MAX_LEVEL, level + 1));
    const maxed = level >= MAX_LEVEL;
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.55,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.levelText.text = t('cats.lv', { n: Math.round(countUpValue(fromLevel, level, k)) });
        for (const r of this.statRows) r.now.text = statLabel(r.key, lerp(from[r.key], to[r.key], k));
      },
      onComplete: () => this.setStats(to, next, maxed),
    });

    const pv = this.perkViews.find((p) => p.level === level);
    if (pv && !motion.reduced) popIn(this.bag, pv.row, { from: 0.9, duration: 0.35, overshoot: 2.6 });

    const banner = uiLabel(t('cats.leveled', { unit: t(`unit.${this.unit}.name`), level }), { size: 52, strokeWidth: 8, color: Color.primary });
    fitLabel(banner, W - 40, 52);
    banner.position.set(W / 2, CAT_Y - 40);
    this.scaffold.content.addChild(banner);
    this.bag.run({
      duration: motion.reduced ? 0.4 : 1.1,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        banner.y = CAT_Y - 40 - 90 * k;
        banner.alpha = k < 0.7 ? 1 : (1 - k) / 0.3;
        banner.scale.set(1 + 0.25 * Math.sin(Math.min(1, k * 3) * Math.PI / 2));
      },
      onComplete: () => banner.destroy(),
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
    this.rays?.stop();
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
