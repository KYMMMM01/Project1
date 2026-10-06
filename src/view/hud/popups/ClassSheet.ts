/**
 * Class sheet: what the class does, its three synergy tiers with the reached ones lit, and the class
 * upgrade button (level, cost). Opened by tapping a class chip.
 */
import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { CLASS_UPGRADE_BONUS, SYNERGY_TIER_AT, classDef, type ClassId } from '@/game';
import { Button, Color, drawIcon, fitLabel, Panel, Popup, punch, RarityPips, TweenBag, uiLabel, vGradient } from '@/ui';
import type { HudEnv } from '../env';
import { CLASS_ACCENT, CLASS_ICON, Subs } from '../kit';

const W = 620;
const ROW_H = 92;

export class ClassSheet extends Popup<void> {
  private readonly subs = new Subs();
  private readonly bag = new TweenBag();
  private readonly panel: Panel;
  private readonly pips = new RarityPips({ size: 24, gap: 12 });
  private readonly haveT: Text;
  private readonly rows: { g: Graphics; check: Container; tier: number }[] = [];
  private readonly levelT: Text;
  private readonly noteT: Text;
  private readonly upBtn: Button;
  private tierNow = -1;

  constructor(
    private readonly env: HudEnv,
    private readonly classId: ClassId,
  ) {
    super({ dismissResult: undefined, priority: 1 });
    const def = classDef(classId);
    const accent = CLASS_ACCENT[classId];

    const h = 130 + 150 + ROW_H * 3 + 24 + 190;
    this.panel = new Panel({ width: W, height: h, title: t(def.nameKey), onClose: () => this.close() });
    const c = this.panel.content;

    // Medallion + role text.
    const med = new Graphics();
    med.circle(0, 5, 46).fill({ color: 0x07030f, alpha: 0.35 });
    med.circle(0, 0, 46).fill(vGradient(0x6a56b6, 0x34256b)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    med.circle(0, 0, 52).stroke({ width: 3, color: accent, alpha: 0.8 });
    med.position.set(80, 118);
    const icon = drawIcon(CLASS_ICON[classId], 64);
    icon.position.set(80, 118);
    const role = uiLabel(t(def.roleKey), { size: 28, wrap: 410, lineHeight: 38, align: 'left', anchorX: 0, anchorY: 0, strokeWidth: 4, shadow: false });
    role.position.set(150, 76);
    c.addChild(med, icon, role);

    // Owned rarities on the board.
    this.pips.position.set(W / 2 - 80, 218);
    this.haveT = uiLabel('', { size: 26, color: Color.textDim, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.haveT.position.set(W / 2 + 10, 218);
    c.addChild(this.pips, this.haveT);

    // The three tiers.
    for (let i = 0; i < 3; i++) {
      const tierNo = (i + 1) as 1 | 2 | 3;
      const y = 262 + i * ROW_H;
      const g = new Graphics();
      g.position.set(0, y);
      const need = uiLabel(t(tierNo === 3 ? 'hud.class.need.more' : 'hud.class.need', { n: SYNERGY_TIER_AT[i] ?? i + 2 }), {
        size: 26, strokeWidth: 4, shadow: false,
      });
      need.position.set(86, y + ROW_H / 2 - 4);
      fitLabel(need, 100, 26, 0.8);
      const text = uiLabel(def.tierText(tierNo), { size: 26, wrap: 330, lineHeight: 32, align: 'left', anchorX: 0, strokeWidth: 4, shadow: false });
      text.position.set(160, y + ROW_H / 2 - 4);
      const check = drawIcon('check', 38);
      check.position.set(W - 52, y + ROW_H / 2 - 4);
      c.addChild(g, need, text, check);
      this.rows.push({ g, check, tier: tierNo });
    }

    // Upgrade.
    const uy = 262 + ROW_H * 3 + 20;
    this.levelT = uiLabel('', { size: 30, anchorX: 0, align: 'left', strokeWidth: 5 });
    this.levelT.position.set(40, uy + 24);
    this.noteT = uiLabel(t('hud.class.note', { n: Math.round(CLASS_UPGRADE_BONUS * 100) }), {
      size: 24, color: Color.textDim, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false, wrap: W - 80,
    });
    this.noteT.position.set(40, uy + 64);
    this.upBtn = new Button({ label: t('hud.upgrade'), style: 'success', width: 320, height: 96, fontSize: 38, fireOnDown: true });
    this.upBtn.position.set(W / 2, uy + 140);
    this.upBtn.onTap(() => {
      env.ctx.command('upgradeClass', () => env.battle.upgradeClass(classId));
    });
    c.addChild(this.levelT, this.noteT, this.upBtn);
    if (!env.reveal.classUpgrade) {
      this.levelT.visible = this.noteT.visible = this.upBtn.visible = false;
    }

    this.body.addChild(this.panel);
    this.setContentSize(W + 80, h + 100);

    const ev = env.battle.events;
    for (const type of ['upgrade', 'synergy', 'summon', 'merge', 'molt', 'awaken', 'sell', 'fish'] as const) {
      this.subs.add(ev.on(type, () => this.refresh(true)));
    }
    this.refresh(false);
  }

  private refresh(animate: boolean): void {
    const b = this.env.battle;
    const id = this.classId;
    this.pips.set(b.classOwned(id), animate);
    this.haveT.text = t('hud.class.have', { n: b.classDistinct(id) });
    const tier = b.synergyTier(id);
    this.rows.forEach((r) => {
      const lit = r.tier <= tier;
      r.check.visible = lit;
      r.g.clear();
      r.g.roundRect(24, 6, W - 48, ROW_H - 12, 22)
        .fill(lit ? vGradient(0x6a4fc0, 0x3e2b82) : { color: 0x1a1034, alpha: 0.7 })
        .stroke({ width: r.tier === tier ? 5 : 3, color: r.tier === tier ? CLASS_ACCENT[id] : Color.outline, alignment: 1 });
    });
    if (animate && tier > this.tierNow && this.tierNow >= 0) punch(this.bag, this.panel, 0.03, 0.2);
    this.tierNow = tier;

    const level = b.classUpgradeLevel(id);
    const cost = b.classUpgradeCost(id);
    this.levelT.text = t('hud.class.level', { lv: level, max: 5 });
    if (cost < 0) {
      this.upBtn.setLabel(t('hud.maxed'));
      this.upBtn.setSublabel(undefined);
      this.upBtn.setStyle('neutral');
    } else {
      this.upBtn.setLabel(t('hud.upgrade'));
      this.upBtn.setSublabel(fmt(cost), 'fish');
      this.upBtn.setStyle(b.fish >= cost ? 'success' : 'neutral');
    }
    if (animate) punch(this.bag, this.levelT, 0.18, 0.2);
  }

  override destroy(options?: DestroyOptions): void {
    this.subs.dispose();
    this.bag.killAll();
    super.destroy(options);
  }
}
