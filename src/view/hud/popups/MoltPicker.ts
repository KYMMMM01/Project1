/** Molt: pick the class the kitten turns into. Shows the purr cost and how many molts are left. */
import { Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { CLASS_IDS, classDef, unitClass, type ClassId } from '@/game';
import { Color, drawIcon, fitLabel, Panel, Popup, uiLabel, vGradient } from '@/ui';
import type { HudEnv } from '../env';
import { CLASS_ACCENT, CLASS_ICON, PressCard, unitPortrait } from '../kit';

const W = 640;
const CARD_W = 184;
const CARD_H = 196;

export class MoltPicker extends Popup<void> {
  constructor(
    private readonly env: HudEnv,
    private readonly cell: number,
  ) {
    super({ dismissResult: undefined, priority: 1 });
    const b = env.battle;
    const unit = b.units[cell];
    const from = unit ? unitClass(unit.id) : null;
    const h = 420;
    const panel = new Panel({ width: W, height: h, title: t('hud.molt'), onClose: () => this.close() });
    const c = panel.content;
    const cost = b.moltCost();
    const left = b.moltsLeft();

    const info = uiLabel(t('hud.molt.info', { cost, left }), { size: 28, wrap: W - 80, strokeWidth: 4, shadow: false });
    info.position.set(W / 2, 92);
    c.addChild(info);

    if (unit) {
      const pic = unitPortrait(unit.id, 70);
      pic.position.set(W / 2, 148);
      c.addChild(pic);
    }

    const options = CLASS_IDS.filter((id) => id !== from);
    options.forEach((id, i) => {
      const x = W / 2 + (i - (options.length - 1) / 2) * (CARD_W + 14);
      const card = new PressCard(CARD_W, CARD_H, () => this.choose(id), { onDown: true });
      card.position.set(x, 280);
      const g = new Graphics();
      g.roundRect(-CARD_W / 2, -CARD_H / 2 + 6, CARD_W, CARD_H, 28).fill({ color: 0x07030f, alpha: 0.35 });
      g.roundRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 28)
        .fill(vGradient(0x5b46a8, 0x35266b))
        .stroke({ width: 5, color: Color.outline, alignment: 1 });
      g.roundRect(-CARD_W / 2 + 6, -CARD_H / 2 + 6, CARD_W - 12, CARD_H - 12, 22).stroke({ width: 3, color: CLASS_ACCENT[id], alpha: 0.8, alignment: 1 });
      const icon = drawIcon(CLASS_ICON[id], 84);
      icon.position.set(0, -26);
      const name = uiLabel(t(classDef(id).nameKey), { size: 34, strokeWidth: 5 });
      fitLabel(name, CARD_W - 20, 34);
      name.position.set(0, 52);
      const result = uiLabel(t('hud.molt.keep'), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false });
      result.position.set(0, 86);
      fitLabel(result, CARD_W - 16, 24, 0.8);
      card.addChild(g, icon, name, result);
      // A short purse stays tappable: the refusal toast explains why, and the dimmed card says it ahead of time.
      card.alpha = left > 0 && b.purr >= cost ? 1 : 0.6;
      panel.content.addChild(card);
    });

    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 100);
  }

  private choose(id: ClassId): void {
    const { ctx, battle } = this.env;
    const fail = ctx.command('molt', () => battle.molt(this.cell, id), this.cell);
    if (fail === null) this.close();
  }
}
