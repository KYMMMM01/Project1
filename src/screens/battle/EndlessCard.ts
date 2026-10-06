import { t } from '@/core/i18n';
import { bundleParts, profile } from '@/meta';
import { Button, Color, ProgressBar, uiLabel } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import { playClaim } from './claim';
import './strings';

const H = 296;
const BTN_W = 232;

/** Endless mode: the best wave reached, this week's progress toward the prizes, and the way in. */
export class EndlessCard extends HomeCard {
  private readonly best = uiLabel('', { size: 34, anchorX: 0 });
  private readonly week = uiLabel('', { size: 26, anchorX: 0, color: Color.inkSoft });
  private readonly bar: ProgressBar;
  private readonly play: Button;
  private readonly claimPrize: Button;

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.endless.title'), 'skull', { tape: 'pink' });
    this.best.position.set(CARD_PAD, this.contentTop + 22);
    this.week.position.set(CARD_PAD, this.contentTop + 66);
    this.bar = new ProgressBar({ width: 372, height: 36, color: 'red', label: '' });
    this.bar.position.set(CARD_PAD + 186, this.contentTop + 120);
    this.body.addChild(this.best, this.week, this.bar);

    const x = w - CARD_PAD - BTN_W / 2;
    this.play = new Button({ label: t('battle.endless.play'), icon: 'play', style: 'primary', width: BTN_W, height: 88, fontSize: 38 });
    this.play.position.set(x, this.contentTop + 52);
    this.play.onTap(() => void this.shell.startRun({ mode: 'endless' }));
    this.claimPrize = new Button({ label: t('battle.endless.claim'), icon: 'gift', style: 'success', width: BTN_W, height: 88, fontSize: 26, disabledMark: 'none' });
    this.claimPrize.position.set(x, this.contentTop + 52 + 88 + 12);
    this.claimPrize.onTap(() => void this.takePrize());
    this.body.addChild(this.play, this.claimPrize);
    this.sync();
  }

  get claimable(): number {
    return profile.endlessView().tiers.filter((tier) => tier.reached && !tier.claimed).length;
  }

  override sync(): void {
    const v = profile.endlessView();
    this.best.text = t('battle.endless.best', { n: v.best });
    this.week.text = t('battle.endless.week', { n: v.weekBest });
    const next = v.tiers.find((tier) => !tier.reached);
    this.bar.setValue(next ? v.weekBest / next.need : 1, false);
    this.bar.setLabel(next ? `${v.weekBest} / ${next.need}` : `${v.weekBest}`);
    const waiting = v.tiers.some((tier) => tier.reached && !tier.claimed);
    this.claimPrize.setEnabled(waiting);
    if (waiting) this.claimPrize.startPulse({ times: 3 });
  }

  private async takePrize(): Promise<void> {
    const index = profile.endlessView().tiers.findIndex((tier) => tier.reached && !tier.claimed);
    if (index < 0) return;
    const r = await this.claim(this.claimPrize, async () => profile.claimEndless(index));
    if (!r) return;
    const rest = playClaim(this.claimPrize, bundleParts(r.value), this.shell);
    this.sync();
    this.shell.refresh();
    if (rest.length > 0) await services.showRewards(rest, t('battle.endless.title'));
  }
}
