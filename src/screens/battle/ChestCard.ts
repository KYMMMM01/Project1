import { Sprite } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { fmt, fmtDuration } from '@/core/format';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { FREE_CHEST_MS } from '@/meta/data/economy';
import { ads } from '@/platform';
import { Button, IconButton, ProgressBar, drawIcon, fitLabel, uiLabel } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import './strings';

const H = 376;

/** The free wooden chest: a countdown, then a claim that opens the chest at once; ad and gem shortcuts while it waits. */
export class ChestCard extends HomeCard {
  private readonly art = hasTex('icon_chest_wood') ? new Sprite(tex('icon_chest_wood')) : drawIcon('chest', 120);
  private readonly status = uiLabel('', { size: 26, wrap: 276 });
  private readonly bar: ProgressBar;
  private readonly open: Button;
  private readonly ad: Button;
  private readonly gems: Button;
  private readonly odds: IconButton;
  private clock = 0;
  private ready = false;

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.chest.title'), 'chest', { tape: 'yellow' });
    const cx = w / 2;
    if (this.art instanceof Sprite) {
      this.art.anchor.set(0.5);
      this.art.scale.set(Math.min(150 / this.art.texture.width, 120 / this.art.texture.height));
    }
    this.art.position.set(cx, this.contentTop + 70);
    this.status.position.set(cx, this.contentTop + 156);
    this.bar = new ProgressBar({ width: w - CARD_PAD * 2, height: 28, color: 'gold' });
    this.bar.position.set(cx, this.contentTop + 156);
    this.body.addChild(this.art, this.bar, this.status);

    this.odds = new IconButton({ icon: 'info', style: 'neutral', size: 56 });
    this.odds.position.set(w - CARD_PAD - 28, 38);
    this.odds.onTap(() => services.openOdds('wooden'));
    this.body.addChild(this.odds);

    const bw = w - CARD_PAD * 2;
    const half = (bw - 12) / 2;
    const y = H - CARD_PAD - 44;
    this.open = new Button({ label: t('battle.chest.open'), icon: 'chest', style: 'primary', width: bw, height: 92, fontSize: 40 });
    this.open.position.set(cx, y);
    this.open.onTap(() => void this.take());
    this.ad = new Button({ label: t('battle.treat.watch'), icon: 'ad', style: 'success', width: half, height: 92, fontSize: 26, disabledMark: 'none' });
    this.ad.position.set(CARD_PAD + half / 2, y);
    this.ad.onTap(() => void this.take('ad'));
    this.gems = new Button({ label: fmt(profile.freeChestView().skipGems), icon: 'gem', style: 'info', width: half, height: 92, fontSize: 30 });
    this.gems.position.set(CARD_PAD + half + 12 + half / 2, y);
    this.gems.onTap(() => void this.take('gems'));
    this.body.addChild(this.open, this.ad, this.gems);
    this.sync();
  }

  get waiting(): boolean {
    return profile.freeChestView().ready;
  }

  override sync(): void {
    const v = profile.freeChestView();
    this.ready = v.ready;
    this.open.visible = v.ready;
    this.ad.visible = !v.ready;
    this.gems.visible = !v.ready;
    this.bar.visible = !v.ready;
    this.status.visible = v.ready;
    this.gems.setLabel(fmt(v.skipGems));
    if (v.ready) {
      this.status.text = t('battle.chest.ready');
      this.status.position.y = this.contentTop + 156;
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
}
