import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { bundleParts, describeBundle, iapSpec, profile } from '@/meta';
import { iap } from '@/platform';
import { Button, Tag, drawIcon, fitLabel, toast, uiLabel } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import { PROMO_PRODUCT } from './promo';
import './strings';

const H = 252;

/** The first-purchase pack, shown as a card on the tab (never a popup) while its 72-hour window is open. */
export class PromoCard extends HomeCard {
  private readonly price: Button;
  private readonly contents = uiLabel('', { size: 26, anchorX: 0, anchorY: 0, align: 'left', wrap: 330 });

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, iap.productName(PROMO_PRODUCT), 'gift', { tape: 'yellow', featured: true });
    const gift = drawIcon('gift', 104);
    gift.position.set(CARD_PAD + 52, this.contentTop + 78);
    this.contents.position.set(CARD_PAD + 124, this.contentTop + 8);
    const spec = iapSpec(PROMO_PRODUCT);
    this.contents.text = spec ? describeBundle(spec.bundle).join('\n') : '';
    this.price = new Button({ label: iap.priceText(PROMO_PRODUCT), style: 'primary', width: 232, height: 96, fontSize: 40 });
    this.price.position.set(w - CARD_PAD - 116, this.contentTop + 130);
    this.price.onTap(() => void this.buy());
    const tag = new Tag({ text: t('battle.promo.tag'), style: 'danger', shape: 'flag', fontSize: 24 });
    tag.position.set(w - CARD_PAD - tag.uiBox.w / 2, 40);
    this.body.addChild(gift, this.contents, this.price, tag);
    fitLabel(this.contents, 330, 26, 0.9);
    this.price.startPulse({ times: 4 });
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
      audio.play('ui_error');
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
