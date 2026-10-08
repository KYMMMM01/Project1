import { fmt, fmtDuration } from '@/core/format';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { FREE_CHEST_MS } from '@/meta/data/economy';
import { ads } from '@/platform';
import { Button, currencyIcon, HEADER, IconButton, ProgressBar, fitLabel, uiLabel } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HEAD_GROW, HomeCard } from './HomeCard';
import { chestPile, chestsWaiting } from './model';
import './strings';

const H = 376 + HEAD_GROW + 6;
const OPEN_H = 92;
/** A pile holds two stacked buttons in the card; "open all" gives a little height (still above the 88 px touch floor). */
const PILE_H = 88;
const PILE_GAP = 8;
/** The picture's box: roomy while one chest waits, small beside the "waiting" line when a pile does. */
const ART_BIG = { w: 150, h: 120 };
const ART_SMALL = { w: 84, h: 80 };
const WAITING_W = 176;

/** The free wooden chest: a countdown, then a claim that opens the chest at once; ad and gem shortcuts while it waits; "open all" once two or more chests wait. */
export class ChestCard extends HomeCard {
  private readonly art = currencyIcon('chest_wooden', 120);
  private readonly status = uiLabel('', { size: 26, wrap: 276 });
  /** "N chests waiting" beside the small picture while a pile waits. */
  private readonly waiting = uiLabel('', { size: 26, anchorX: 0, align: 'left', wrap: WAITING_W, lineHeight: 30 });
  private readonly bar: ProgressBar;
  private readonly open: Button;
  private readonly openAll: Button;
  private readonly ad: Button;
  private readonly gems: Button;
  private readonly odds: IconButton;
  private clock = 0;
  private ready = false;
  /** Chests the "open all" button opens; 0 = the card is in its plain layout. */
  private pile = 0;
  /** Which of the three layouts is placed now (-1 = none yet). */
  private laidFor = -1;

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.chest.title'), 'chest', { tape: 'yellow' });
    this.bar = new ProgressBar({ width: w - CARD_PAD * 2, height: 28, color: 'gold' });
    this.body.addChild(this.art, this.bar, this.status, this.waiting);

    this.odds = new IconButton({ icon: 'info', style: 'neutral', size: HEADER.disc });
    this.odds.position.set(this.head.control.x, this.head.control.y);
    this.odds.onTap(() => services.openOdds('wooden'));
    this.body.addChild(this.odds);

    const bw = w - CARD_PAD * 2;
    const half = (bw - 12) / 2;
    const y = H - CARD_PAD - 44;
    this.open = new Button({ label: t('battle.chest.open'), icon: 'chest', style: 'primary', width: bw, height: OPEN_H, fontSize: 40 });
    this.open.onTap(() => void this.take());
    this.openAll = new Button({ label: '', style: 'mustard', width: bw, height: PILE_H, fontSize: 28 });
    this.openAll.onTap(() => void this.takeAll());
    this.ad = new Button({ label: t('battle.treat.watch'), icon: 'ad', style: 'success', width: half, height: 92, fontSize: 26, disabledMark: 'none' });
    this.ad.position.set(CARD_PAD + half / 2, y);
    this.ad.onTap(() => void this.take('ad'));
    this.gems = new Button({ label: fmt(profile.freeChestView().skipGems), icon: 'gem', style: 'info', width: half, height: 92, fontSize: 30 });
    this.gems.position.set(CARD_PAD + half + 12 + half / 2, y);
    this.gems.onTap(() => void this.take('gems'));
    this.body.addChild(this.open, this.openAll, this.ad, this.gems);
    this.sync();
  }

  override sync(): void {
    const v = profile.freeChestView();
    const count = chestsWaiting(profile.data.chests.wooden, v.ready);
    this.ready = v.ready;
    this.pile = chestPile(count);
    const piled = this.pile > 0;
    this.open.visible = v.ready;
    // While a pile waits the skip shortcuts step aside: the chests already in hand come first, and the card has no room for a third row.
    this.ad.visible = !v.ready && !piled;
    this.gems.visible = !v.ready && !piled;
    this.openAll.visible = piled;
    this.bar.visible = !v.ready;
    this.status.visible = v.ready && !piled;
    this.waiting.visible = piled;
    this.gems.setLabel(fmt(v.skipGems));
    this.layoutFor(piled, v.ready);
    if (piled) {
      this.waiting.text = t('battle.chest.waiting', { n: fmt(count) });
      fitLabel(this.waiting, WAITING_W, 26);
      this.openAll.setLabel(t('battle.chest.openAll', { n: this.pile }));
    }
    if (v.ready) {
      this.status.text = t('battle.chest.ready');
      this.open.startPulse({ times: 3 });
    } else {
      this.bar.setValue(1 - v.waitMs / FREE_CHEST_MS, false);
      this.bar.setLabel(t('battle.chest.wait', { time: fmtDuration(v.waitMs / 1000) }));
      this.ad.setEnabled(v.skipsLeft > 0 && (profile.data.owned.butler || ads.canOffer('free_chest')));
    }
    fitLabel(this.status, this.cardW - CARD_PAD * 2, 26);
  }

  override tick(dt: number): void {
    this.clock += dt;
    if (this.clock < 1) return;
    this.clock = 0;
    const wasReady = this.ready;
    this.sync();
    if (wasReady !== this.ready) this.shell.refresh();
  }

  /**
   * Place the picture, the lines and the buttons for one of three layouts: plain (one chest, or the countdown), a pile with the
   * free chest ready (the open button over "open all"), a pile while the countdown runs (the bar, then "open all"). Only redone
   * when the layout changes; both stacked buttons end on the line where the neighbouring card's button ends.
   */
  private layoutFor(piled: boolean, ready: boolean): void {
    const key = piled ? (ready ? 2 : 1) : 0;
    if (key === this.laidFor) return;
    this.laidFor = key;
    const cx = this.cardW / 2;
    const top = this.contentTop;
    // The neighbouring sweep card's button is centred here: the buttons of this card end on the same line.
    const baseline = H - CARD_PAD - 44;
    const box = piled ? ART_SMALL : ART_BIG;
    const shape = this.art.getLocalBounds();
    this.art.scale.set(Math.min(box.w / shape.width, box.h / shape.height));
    if (!piled) {
      this.art.position.set(cx, top + 70);
      this.status.position.set(cx, top + 156);
      this.bar.position.set(cx, top + 156);
      this.open.position.set(cx, baseline);
      return;
    }
    const band = top + 4 + ART_SMALL.h / 2;
    this.art.position.set(CARD_PAD + ART_SMALL.w / 2, band);
    this.waiting.position.set(CARD_PAD + ART_SMALL.w + 14, band);
    const pileY = baseline + (OPEN_H - PILE_H) / 2;
    this.openAll.position.set(cx, pileY);
    if (ready) this.open.position.set(cx, pileY - PILE_H / 2 - PILE_GAP - OPEN_H / 2);
    else this.bar.position.set(cx, top + 4 + ART_SMALL.h + 44);
  }

  /** Claim the chest (free when ready, by ad or gems while waiting) and open it. */
  private async take(via?: 'ad' | 'gems'): Promise<void> {
    const button = via === 'ad' ? this.ad : via === 'gems' ? this.gems : this.open;
    const claimed = await this.claim(button, async () => (via ? profile.skipFreeChest(via) : profile.claimFreeChest()));
    if (!claimed) return;
    const opened = await this.claim(button, () => profile.openChest('wooden'));
    this.sync();
    this.shell.refresh();
    if (opened) {
      await services.revealChest(opened.value);
      this.shell.refresh();
    }
  }

  /** "Open all": the free chest first when it is ready, then the whole pile through the meta layer's bulk open and one reveal for it (the shop's own path). */
  private async takeAll(): Promise<void> {
    const count = this.pile;
    if (count < 2) return;
    if (this.ready && !(await this.claim(this.openAll, async () => profile.claimFreeChest()))) return;
    const opened = await this.claim(this.openAll, () => profile.openChests('wooden', count));
    this.sync();
    this.shell.refresh();
    if (opened) {
      await services.revealChest(opened.value);
      this.shell.refresh();
    }
  }
}
