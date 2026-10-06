/** One reward step of the weekly cup or the endless tiers: goal, reward, and a claim / progress / done control. */
import { Container, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { TierRow } from '@/meta/routines';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import type { Box } from '@/ui/layoutMath';
import { fitLabel, uiLabel } from '@/ui/text';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { bakedPanel, ClaimedMark } from '../system/kit/widgets';
import { tierFill } from './model';
import './strings';

export const TIER_CELL_H = 292;
const BTN_H = 88;

/** Origin = top-left of the cell. */
export class TierCell extends Container {
  readonly uiBox: Box;
  private readonly bar: ProgressBar;
  private readonly claimBtn: Button;
  private readonly mark = new ClaimedMark(72);
  private claimed = false;

  constructor(
    w: number,
    head: string,
    row: TierRow,
    cur: number,
    onClaim: (button: Button) => void,
  ) {
    super();
    this.uiBox = { x: 0, y: 0, w, h: TIER_CELL_H };
    this.addChild(bakedPanel(w, TIER_CELL_H, 'inset', 26));

    const title = uiLabel(head, { size: 26, strokeWidth: 5, shadow: false });
    fitLabel(title, w - 20, 26);
    title.position.set(w / 2, 34);

    const reward = new RewardList(partsOf(row.reward), { direction: 'column', size: 56, fontSize: 28, maxWidth: w - 24, gap: 4 });
    reward.position.set(w / 2, 120);

    const cx = w / 2;
    const cy = TIER_CELL_H - 18 - BTN_H / 2 - 4;
    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: w - 24, height: BTN_H, fontSize: 32 });
    this.claimBtn.position.set(cx, cy);
    this.claimBtn.onTap(() => onClaim(this.claimBtn));
    this.bar = new ProgressBar({ width: w - 32, height: 38, color: 'blue', value: tierFill(cur, row.need), label: '' });
    this.bar.position.set(cx, cy);
    this.mark.position.set(cx, cy);
    this.addChild(title, reward, this.bar, this.claimBtn, this.mark);
    this.sync(row, cur, false);
  }

  sync(row: TierRow, cur: number, animate: boolean): void {
    const open = row.reached && !row.claimed;
    this.bar.setLabel(t('rt.mis.tier.progress', { cur: Math.min(cur, row.need), need: row.need }));
    this.bar.setValue(tierFill(cur, row.need), animate);
    this.bar.visible = !row.reached;
    this.claimBtn.visible = open;
    this.mark.visible = row.claimed;
    this.alpha = row.claimed ? 0.8 : 1;
    if (animate && row.claimed && !this.claimed) this.mark.stamp();
    this.claimed = row.claimed;
    if (open) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
