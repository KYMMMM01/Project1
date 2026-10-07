import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { bundleParts, describeBundle, profile, type Bundle, type BundlePart } from '@/meta';
import { ads } from '@/platform';
import { Button, Color, drawIcon, drawPaper, paperSeed, uiLabel, type IconName } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HEAD_GROW, HomeCard } from './HomeCard';
import { playClaim } from './claim';
import './strings';

const H = 356 + HEAD_GROW;
const GAP = 14;

function iconOf(reward: Bundle): IconName {
  const first: BundlePart | undefined = bundleParts(reward)[0];
  switch (first?.kind) {
    case 'gold':
      return 'coin';
    case 'gems':
      return 'gem';
    case 'tickets':
      return 'ticket';
    case 'chest':
      return 'chest';
    default:
      return 'cards';
  }
}

interface Slot {
  root: Container;
  button: Button;
  mark: Container;
}

/** Today's treats: three rewards, each behind one rewarded ad. The reward is shown before the ad button. */
export class TreatsCard extends HomeCard {
  private readonly slots: Slot[] = [];

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.treat.title'), 'gift', { tape: 'pink' });
    const rewards = profile.treatView();
    const slotW = (w - CARD_PAD * 2 - GAP * (rewards.length - 1)) / rewards.length;
    const top = this.contentTop - 4;
    const seed = paperSeed();
    const slotH = H - top - CARD_PAD;
    rewards.forEach((row, i) => {
      const root = new Container();
      root.position.set(CARD_PAD + i * (slotW + GAP), top);
      const bg = new Graphics();
      drawPaper(bg, 0, 0, { w: slotW, h: slotH, radius: 26, fill: Color.paperDim, seed, shadow: 3, grain: false });
      const icon = drawIcon(iconOf(row.reward), 70);
      icon.position.set(slotW / 2, 52);
      const text = uiLabel(describeBundle(row.reward).join(' '), { size: 24, wrap: slotW - 20, anchorY: 0 });
      text.position.set(slotW / 2, 100);
      const button = new Button({ label: t('battle.treat.watch'), icon: 'ad', style: 'success', width: slotW - 20, height: 88, fontSize: 30, disabledMark: 'none' });
      button.position.set(slotW / 2, slotH - 10 - 44);
      button.onTap(() => void this.take(i, button));
      const mark = new Container();
      mark.addChild(drawIcon('check', 54));
      mark.position.set(slotW / 2, slotH - 10 - 44);
      mark.visible = false;
      root.addChild(bg, icon, text, button, mark);
      this.body.addChild(root);
      this.slots.push({ root, button, mark });
    });
    this.sync();
  }

  override sync(): void {
    const rows = profile.treatView();
    const adReady = profile.data.owned.butler || ads.canOffer('daily_treat');
    rows.forEach((row, i) => {
      const slot = this.slots[i] as Slot;
      slot.button.visible = !row.claimed;
      slot.mark.visible = row.claimed;
      slot.root.alpha = row.claimed ? 0.6 : 1;
      slot.button.setEnabled(!row.claimed && adReady);
    });
  }

  private async take(index: number, button: Button): Promise<void> {
    const reward = profile.treatView()[index]?.reward;
    if (!reward) return;
    const r = await this.claim(button, () => profile.claimTreat(index));
    if (!r) return;
    const rest = playClaim(button, bundleParts(r.value), this.shell);
    this.sync();
    this.shell.refresh();
    if (rest.length > 0) await services.showRewards(rest, t('battle.treat.title'));
  }
}
