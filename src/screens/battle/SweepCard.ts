import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { bundleParts, profile } from '@/meta';
import { TICKET_AD_AMOUNT } from '@/meta/data/economy';
import { ads } from '@/platform';
import { Button, Color, drawIcon, fitLabel, toast, uiLabel } from '@/ui';
import type { Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import { playClaim } from './claim';
import { sweepable, type Selection } from './model';
import './strings';

const H = 376;

/** Sweep: spend a ticket to collect the reward of a cleared level without playing it. Tickets can be topped up right here. */
export class SweepCard extends HomeCard {
  private readonly count = uiLabel('', { size: 44, anchorX: 0 });
  private readonly target = uiLabel('', { size: 26, anchorX: 0, anchorY: 0, color: Color.inkSoft });
  private readonly note = uiLabel('', { size: 24, anchorX: 0, anchorY: 0, color: Color.inkSoft, align: 'left', wrap: 276 });
  private readonly go: Button;
  private readonly ad: Button;
  private readonly gems: Button;
  private sel: Selection = { chapter: 1, stake: 0 };

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.sweep.title'), 'sweep', { tape: 'green' });
    const icon = drawIcon('ticket', 60);
    icon.position.set(CARD_PAD + 30, this.contentTop + 40);
    this.count.position.set(CARD_PAD + 72, this.contentTop + 40);
    this.target.position.set(CARD_PAD, this.contentTop + 82);
    this.note.position.set(CARD_PAD, this.contentTop + 116);
    this.body.addChild(icon, this.count, this.target, this.note);

    const bw = w - CARD_PAD * 2;
    const half = (bw - 12) / 2;
    const y = H - CARD_PAD - 44;
    this.go = new Button({ label: t('battle.sweep.go'), icon: 'sweep', style: 'primary', width: bw, height: 92, fontSize: 38 });
    this.go.position.set(w / 2, y);
    this.go.onTap(() => void this.sweep());
    this.ad = new Button({ label: `+${TICKET_AD_AMOUNT}`, icon: 'ad', style: 'success', width: half, height: 92, fontSize: 28, disabledMark: 'none' });
    this.ad.position.set(CARD_PAD + half / 2, y);
    this.ad.onTap(() => void this.topUp('ad'));
    this.gems = new Button({ label: '', sublabel: '+1', icon: 'gem', style: 'info', width: half, height: 92, fontSize: 28 });
    this.gems.position.set(CARD_PAD + half + 12 + half / 2, y);
    this.gems.onTap(() => void this.topUp('gems'));
    this.body.addChild(this.go, this.ad, this.gems);
    this.sync();
  }

  /** The level the chapter card currently points at. */
  setTarget(sel: Selection): void {
    this.sel = sel;
    this.sync();
  }

  override sync(): void {
    const d = profile.data;
    const v = profile.ticketView();
    const can = sweepable(d.cleared, this.sel.chapter, this.sel.stake);
    this.count.text = t('battle.sweep.tickets', { n: v.count });
    fitLabel(this.count, this.cardW - CARD_PAD * 2 - 72, 44);
    this.target.text = t('battle.sweep.target', { chapter: t('chapter.' + this.sel.chapter + '.name'), n: this.sel.stake });
    fitLabel(this.target, this.cardW - CARD_PAD * 2, 26);
    const empty = v.count <= 0;
    this.go.visible = !empty;
    this.ad.visible = empty;
    this.gems.visible = empty;
    this.note.text = can ? '' : t('battle.sweep.need');
    this.go.setEnabled(can && !empty);
    if (empty) {
      this.ad.setEnabled(v.adsLeft > 0 && v.count < v.stock && (d.owned.butler || ads.canOffer('sweep_ticket')));
      this.gems.setLabel(fmt(v.gemPrice));
    }
  }

  private async sweep(): Promise<void> {
    const { chapter, stake } = this.sel;
    const r = await this.claim(this.go, async () => profile.sweep(chapter, stake));
    if (!r) return;
    // The gold is already in the profile: it flies to the top bar like any other claim, and a sheet asking to "claim" it again would be a second payout.
    playClaim(this.go, bundleParts({ gold: r.value.gold }), this.shell);
    toast(t('battle.sweep.done', { xp: fmt(r.value.xp) }), 'success');
    this.sync();
    this.shell.refresh();
  }

  private async topUp(via: 'ad' | 'gems'): Promise<void> {
    const button = via === 'ad' ? this.ad : this.gems;
    const r = await this.claim(button, async () => (via === 'ad' ? profile.watchTicketAd() : profile.buyTicket()));
    if (!r) return;
    this.sync();
    this.shell.refresh();
  }
}
