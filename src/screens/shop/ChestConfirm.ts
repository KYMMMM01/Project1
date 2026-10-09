import type { DestroyOptions, Text } from 'pixi.js';
import { fmt } from '@/core/format';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { ChestKind } from '@/meta/types';
import { Button, Color, Panel, Popup, popups, TweenBag, uiLabel } from '@/ui';
import { CONFIRM_ARM_S, chestBuyView, confirmArmed } from './shopLogic';

const W = 620;
const SIDE = 44;
const BTN_H = 104;

/**
 * "Buy this chest?": the odds the draw code rolls from (GDD 8.4 wants them at the moment of purchase) set as a short
 * ladder instead of one run of text: the card count, the chance of each rank and the guarantees in ink, the fine print
 * (wild-card share, the bonus rule, the table version) smaller below. The price sits on the buy button with its gem.
 * For several chests the odds are the same (they are per card and per chest): the top line gives the cards of the whole
 * purchase, a smaller line says each chest keeps its own odds and guarantees, and the button shows the total price.
 *
 * The buy button is greyed and inert for the first CONFIRM_ARM_S seconds. The popup opens inside the tap on the shop's buy
 * tag and sits at the screen centre, where that tag (or a second tap of a double tap) is often right under the buy button:
 * a repeat tap must not be able to confirm a purchase nobody has had time to read.
 */
class ChestConfirm extends Popup<boolean> {
  private readonly bag = new TweenBag();
  private readonly buy: Button;
  /** Game-clock seconds at which the popup came on screen; never armed before it does. */
  private openedAt = Number.POSITIVE_INFINITY;

  constructor(kind: ChestKind, count: number) {
    super({ dismissResult: false, backdropClose: true, priority: 2 });
    const odds = profile.oddsOf(kind);
    const view = chestBuyView(kind, count, odds.cards, profile.data.goldOpened);
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
    add(view.cardsLine, 36, Color.ink, 0);
    if (view.eachLine) add(view.eachLine, 24, Color.inkSoft, 6);
    add(t('odds.rows'), 24, Color.inkSoft, 14);
    add(odds.rows.filter((r) => r.p > 0).map((r) => `${r.label} ${r.text}`).join(' · '), 28, Color.ink, 4);
    for (const g of odds.guaranteeTexts) add(g, 28, Color.ink, 10);
    add(odds.wildText, 24, Color.inkSoft, 18);
    if (odds.pity) add(odds.pity.text, 24, Color.inkSoft, 6);
    add(t('meta.odds.version', { v: odds.version }), 24, Color.inkSoft, 6);

    const h = y + 36 + BTN_H + 48;
    const panel = new Panel({ width: W, height: h, title: view.title, torn: 'bottom', tape: 'sky' });
    panel.content.addChild(...lines);

    const gap = 24;
    const bw = (W - 80 - gap) / 2;
    const cancel = new Button({ label: t('shop.chest.cancel'), style: 'neutral', width: bw, height: BTN_H, fontSize: 36 });
    cancel.position.set(W / 2 - (bw + gap) / 2, h - 48 - BTN_H / 2);
    cancel.onTap(() => this.close(false));
    const buy = new Button({
      label: t('shop.chest.confirmBuy'), style: 'primary', width: bw, height: BTN_H, fontSize: 36, sublabel: fmt(view.price), sublabelIcon: 'gem',
      enabled: false, disabledMark: 'none',
    });
    buy.position.set(W / 2 + (bw + gap) / 2, h - 48 - BTN_H / 2);
    // Greyed out the button swallows taps by itself (and says "not yet" with a shake); the clock check is the rule it follows.
    buy.onTap(() => {
      if (confirmArmed(this.openedAt, game.time)) this.close(true);
    });
    this.buy = buy;
    panel.content.addChild(cancel, buy);

    this.body.addChild(panel);
    // The title label rises above the sheet and the tape pokes out of its top-left corner.
    this.setContentSize(W + 80, h + 90);
  }

  override onOpened(): void {
    this.openedAt = game.time;
    this.bag.call(CONFIRM_ARM_S, () => {
      if (!this.buy.destroyed) this.buy.setEnabled(true);
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

/** Ask whether to buy `count` chests of a kind (one by default) for their price; resolves true on the buy button, false on cancel, the backdrop or Escape. */
export function confirmChestBuy(kind: ChestKind, count = 1): Promise<boolean> {
  return popups.open(new ChestConfirm(kind, count));
}
