import { fmt, fmtDuration } from '@/core/format';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { ads } from '@/platform';
import { Button, Color, ProgressBar, drawIcon, uiLabel } from '@/ui';
import type { Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import { playClaim } from './claim';
import './strings';

const H = 316;
const BTN_W = 252;

/** Patrol: gold the cats collected while the player was away, claimed for free or doubled by an ad. */
export class PatrolCard extends HomeCard {
  private readonly amount = uiLabel('0', { size: 56, anchorX: 0 });
  private readonly bar: ProgressBar;
  private readonly note = uiLabel('', { size: 24, anchorX: 0, anchorY: 0, color: Color.inkSoft, align: 'left', wrap: 340 });
  private readonly collect: Button;
  private readonly double: Button;
  private clock = 0;
  private ready = false;

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.patrol.title'), 'paw', { tape: 'sky' });
    const left = CARD_PAD;
    const coin = drawIcon('coin', 64);
    coin.position.set(left + 32, this.contentTop + 40);
    this.amount.position.set(left + 76, this.contentTop + 40);
    this.bar = new ProgressBar({ width: 340, height: 40, color: 'gold', label: '' });
    this.bar.position.set(left + 170, this.contentTop + 112);
    this.note.position.set(left, this.contentTop + 144);
    this.body.addChild(coin, this.amount, this.bar, this.note);

    const x = w - CARD_PAD - BTN_W / 2;
    this.collect = new Button({ label: t('battle.patrol.collect'), icon: 'coin', style: 'primary', width: BTN_W, height: 92, fontSize: 38, disabledMark: 'none' });
    this.collect.position.set(x, this.contentTop + 60);
    this.collect.onTap(() => void this.take(false));
    this.double = new Button({ label: t('battle.patrol.double'), icon: 'ad', style: 'success', width: BTN_W, height: 92, fontSize: 32, disabledMark: 'none' });
    this.double.position.set(x, this.contentTop + 60 + 92 + 12);
    this.double.onTap(() => void this.take(true));
    this.body.addChild(this.collect, this.double);
    this.sync();
  }

  override sync(): void {
    const v = profile.patrolView();
    this.amount.text = fmt(v.gold);
    this.bar.setValue(v.capMs > 0 ? v.ms / v.capMs : 0, false);
    this.bar.setLabel(`${fmtDuration(v.ms / 1000)} / ${fmtDuration(v.capMs / 1000)}`);
    this.note.text = v.full ? t('battle.patrol.full') : v.collectable ? t('battle.patrol.cap', { time: fmtDuration(v.capMs / 1000) }) : t('battle.patrol.empty');
    const butler = profile.data.owned.butler;
    const canDouble = v.collectable && v.doublesLeft > 0 && (butler || ads.canOffer('patrol_double'));
    this.collect.setEnabled(v.collectable);
    this.double.setEnabled(canDouble);
    this.double.setIcon(butler ? 'coin' : 'ad');
    this.double.setSublabel(v.collectable ? t('battle.patrol.double.gain', { n: fmt(v.gold * 2) }) : undefined);
    if (v.collectable && !this.ready) this.collect.startPulse({ times: 3 });
    this.ready = v.collectable;
  }

  override tick(dt: number): void {
    this.clock += dt;
    if (this.clock < 1) return;
    this.clock = 0;
    this.sync();
  }

  /** True when there is gold to collect (tab badge). */
  get waiting(): boolean {
    return profile.patrolView().collectable;
  }

  private async take(double: boolean): Promise<void> {
    const button = double ? this.double : this.collect;
    const r = await this.claim(button, () => profile.claimPatrol(double));
    if (!r) return;
    playClaim(button, [{ kind: 'gold', n: r.value }], this.shell);
    this.sync();
    this.shell.refresh();
  }
}
