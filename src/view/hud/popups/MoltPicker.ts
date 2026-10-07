/** Molt: pick the class line the kitten moves to. Each card shows the cat it would become: same rank, other class. */
import { Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { CLASS_IDS, classDef, unitClass, unitDef, unitOf, unitRarity, type ClassId, type UnitId } from '@/game';
import { Color, drawIcon, drawPaper, fitLabel, Panel, paperSeed, Popup, uiLabel } from '@/ui';
import type { HudEnv } from '../env';
import { balanceWrap, CLASS_ACCENT, CLASS_ICON, PressCard, unitPhoto } from '../kit';

const W = 640;
const CARD_W = 184;
const CARD_H = 232;

export class MoltPicker extends Popup<void> {
  constructor(
    private readonly env: HudEnv,
    private readonly cell: number,
  ) {
    super({ dismissResult: undefined, priority: 1 });
    const b = env.battle;
    const unit = b.units[cell];
    const from = unit ? unitClass(unit.id) : null;
    const h = 508;
    const panel = new Panel({ width: W, height: h, title: t('hud.molt'), onClose: () => this.close() });
    const c = panel.content;
    const cost = b.moltCost();
    const left = b.moltsLeft();
    const seed = paperSeed();

    const info = uiLabel(t('hud.molt.info', { cost, left }), { size: 26, wrap: W - 100, lineHeight: 34 });
    balanceWrap(info, W - 100);
    info.position.set(W / 2, 112);
    c.addChild(info);

    if (unit) {
      const pic = unitPhoto({ size: 68, rarity: unitRarity(unit.id), unit: unit.id, seed });
      pic.position.set(W / 2, 194);
      c.addChild(pic);
    }

    const options = CLASS_IDS.filter((id) => id !== from);
    options.forEach((id, i) => {
      const x = W / 2 + (i - (options.length - 1) / 2) * (CARD_W + 14);
      const becomes: UnitId | null = unit ? unitOf(id, unitRarity(unit.id)) : null;
      const card = new PressCard(CARD_W, CARD_H, () => this.choose(id), { onDown: true });
      card.position.set(x, 370);
      const g = new Graphics();
      drawPaper(g, -CARD_W / 2, -CARD_H / 2, { w: CARD_W, h: CARD_H, radius: 24, fill: Color.paperLight, edge: CLASS_ACCENT[id], edgeWidth: 3, edgeAlpha: 0.9, grain: false, seed: seed + i + 1 });
      const patch = new Graphics();
      drawPaper(patch, -31, -31, { w: 62, h: 62, kind: 'circle', fill: CLASS_ACCENT[id], edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 20 + i });
      patch.position.set(0, -72);
      const icon = drawIcon(CLASS_ICON[id], 42);
      icon.position.copyFrom(patch.position);
      const name = uiLabel(t(classDef(id).nameKey), { size: 30 });
      fitLabel(name, CARD_W - 20, 30);
      name.position.set(0, -26);
      card.addChild(g, patch, icon, name);
      if (becomes) {
        const photo = unitPhoto({ size: 76, rarity: unitRarity(becomes), unit: becomes, seed: seed + 40 + i });
        photo.position.set(0, 36);
        const becomesName = uiLabel(t(unitDef(becomes).nameKey), { size: 24 });
        fitLabel(becomesName, CARD_W - 16, 24, 0.8);
        becomesName.position.set(0, 94);
        card.addChild(photo, becomesName);
      }
      // A short purse stays tappable: the refusal toast explains why, and the dimmed card says it ahead of time.
      card.alpha = left > 0 && b.purr >= cost ? 1 : 0.6;
      panel.content.addChild(card);
    });

    this.body.addChild(panel);
    this.setContentSize(W + 24, h + 100);
  }

  private choose(id: ClassId): void {
    const { ctx, battle } = this.env;
    const fail = ctx.command('molt', () => battle.molt(this.cell, id), this.cell);
    if (fail === null) this.close();
  }
}
