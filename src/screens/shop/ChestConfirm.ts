import type { Text } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { ChestKind } from '@/meta/types';
import { Button, Color, Panel, Popup, popups, uiLabel } from '@/ui';

const W = 620;
const SIDE = 44;
const BTN_H = 104;

/**
 * "Buy this chest?": the odds the draw code rolls from (GDD 8.4 wants them at the moment of purchase) set as a short
 * ladder instead of one run of text: the card count, the chance of each rank and the guarantees in ink, the fine print
 * (wild-card share, the bonus rule, the table version) smaller below. The price sits on the buy button with its gem.
 */
class ChestConfirm extends Popup<boolean> {
  constructor(kind: ChestKind, price: number) {
    super({ dismissResult: false, backdropClose: true, priority: 2 });
    const odds = profile.oddsOf(kind);
    const wrap = W - SIDE * 2;
    const lines: Text[] = [];
    let y = 92;
    const add = (text: string, size: number, color: number, gapBefore: number): void => {
      const line = uiLabel(text, { size, color, anchorX: 0, anchorY: 0, wrap, lineHeight: size + 6, align: 'left' });
      y += gapBefore;
      line.position.set(SIDE, y);
      y += line.height;
      lines.push(line);
    };
    add(t('shop.chest.cards', { n: fmt(odds.cards) }), 36, Color.ink, 0);
    add(t('odds.rows'), 24, Color.inkSoft, 14);
    add(odds.rows.filter((r) => r.p > 0).map((r) => `${r.label} ${r.text}`).join(' · '), 28, Color.ink, 4);
    for (const g of odds.guaranteeTexts) add(g, 28, Color.ink, 10);
    add(odds.wildText, 24, Color.inkSoft, 18);
    if (odds.pity) add(odds.pity.text, 24, Color.inkSoft, 6);
    add(t('meta.odds.version', { v: odds.version }), 24, Color.inkSoft, 6);

    const h = y + 36 + BTN_H + 48;
    const panel = new Panel({ width: W, height: h, title: t('shop.chest.confirmTitle', { chest: odds.title }), torn: 'bottom', tape: 'sky' });
    panel.content.addChild(...lines);

    const gap = 24;
    const bw = (W - 80 - gap) / 2;
    const cancel = new Button({ label: t('shop.chest.cancel'), style: 'neutral', width: bw, height: BTN_H, fontSize: 36 });
    cancel.position.set(W / 2 - (bw + gap) / 2, h - 48 - BTN_H / 2);
    cancel.onTap(() => this.close(false));
    const buy = new Button({ label: t('shop.chest.confirmBuy'), style: 'primary', width: bw, height: BTN_H, fontSize: 36, sublabel: fmt(price), sublabelIcon: 'gem' });
    buy.position.set(W / 2 + (bw + gap) / 2, h - 48 - BTN_H / 2);
    buy.onTap(() => this.close(true));
    panel.content.addChild(cancel, buy);

    this.body.addChild(panel);
    // The title label rises above the sheet and the tape pokes out of its top-left corner.
    this.setContentSize(W + 80, h + 90);
  }
}

/** Ask whether to buy a chest for `price` gems; resolves true on the buy button, false on cancel, the backdrop or Escape. */
export function confirmChestBuy(kind: ChestKind, price: number): Promise<boolean> {
  return popups.open(new ChestConfirm(kind, price));
}
