import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { bundleParts, describeBundle, iapSpec, profile } from '@/meta';
import { iap } from '@/platform';
import { Button, Color, Tag, drawIcon, fitLabel, toast, uiLabel } from '@/ui';
import { refusalCue } from '@/ui/press';
import { services, type Shell } from '../contract';
import { CARD_PAD, HEAD_GROW, HomeCard, RIM_GROW } from './HomeCard';
import { PROMO_PRODUCT } from './promo';
import './strings';

/** The price button's lip reached past the card's bottom edge; the card is as tall as the header, the body and the same 24 px under the button every other card has. */
const H = 252 + HEAD_GROW + RIM_GROW + 25;
/** The list stays left of the price button. */
const LIST_W = 260;
const ROW_H = 40;

/** The first-purchase pack, shown as a card on the tab (never a popup) while its 72-hour window is open. */
export class PromoCard extends HomeCard {
  private readonly price: Button;

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, iap.productName(PROMO_PRODUCT), 'gift', { tape: 'yellow', featured: true, reserve: 170 });
    const gift = drawIcon('gift', 104);
    gift.position.set(CARD_PAD + 52, this.contentTop + 78);
    const spec = iapSpec(PROMO_PRODUCT);
    const list = this.buildList(spec ? describeBundle(spec.bundle) : []);
    list.position.set(CARD_PAD + 124, this.contentTop + 78);
    this.price = new Button({ label: iap.priceText(PROMO_PRODUCT), style: 'primary', width: 232, height: 96, fontSize: 40 });
    this.price.position.set(w - CARD_PAD - 116, this.contentTop + 130);
    this.price.onTap(() => void this.buy());
    const tag = new Tag({ text: t('battle.promo.tag'), style: 'danger', shape: 'flag', fontSize: 24 });
    tag.position.set(w - CARD_PAD - tag.uiBox.w / 2, this.head.cy);
    this.body.addChild(gift, list, this.price, tag);
    this.price.startPulse({ times: 4 });
  }

  /** One row per prize, each behind a coral dot, centred on the gift (a bare stack of lines reads as one run-on sentence). */
  private buildList(parts: readonly string[]): Container {
    const list = new Container();
    parts.forEach((text, i) => {
      const y = (i - (parts.length - 1) / 2) * ROW_H;
      const dot = new Graphics().circle(0, y, 6).fill(Color.coral);
      const row = uiLabel(text, { size: 26, anchorX: 0, anchorY: 0.5, align: 'left' });
      row.position.set(20, y);
      fitLabel(row, LIST_W - 20, 26);
      list.addChild(dot, row);
    });
    return list;
  }

  override sync(): void {
    this.price.setLabel(iap.priceText(PROMO_PRODUCT));
  }

  /** The grant makes the card go away (the pack is no longer purchasable) before the store call returns, so nothing after the purchase may need the card. */
  private async buy(): Promise<void> {
    this.price.setBusy(true);
    const outcome = await iap.purchase(PROMO_PRODUCT);
    if (!this.destroyed) this.price.setBusy(false);
    if (outcome === 'cancelled') {
      toast(t('shop.buy.cancel'), 'info');
      return;
    }
    if (outcome === 'failed') {
      refusalCue();
      toast(t('shop.buy.fail'), 'error');
      return;
    }
    if (outcome === 'unavailable') {
      toast(t('shop.buy.unavailable'), 'warning');
      return;
    }
    this.shell.refresh();
    const spec = iapSpec(PROMO_PRODUCT);
    if (spec) await services.showRewards(bundleParts(spec.bundle), iap.productName(PROMO_PRODUCT));
    this.shell.refresh();
    void profile.flush();
  }
}
