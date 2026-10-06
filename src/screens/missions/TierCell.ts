/** One reward step of the weekly cup or the endless tiers: the goal, the reward sticker, and a bar / claim / stamp at the foot. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { TierRow } from '@/meta/routines';
import { Button, cacheStatic, Color, drawDashedRect, fitLabel, ProgressBar, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { SHEET_SEEDS, sharedSheet } from '../system/kit/sheets';
import { tierFill } from './model';
import './strings';

export const TIER_CELL_H = 304;
const BTN_H = 88;

/** Origin = top-left of the cell. */
export class TierCell extends Container {
  readonly uiBox: Box;
  private readonly bar: ProgressBar;
  private readonly claimBtn: Button;
  private readonly stamp = new StampMark({ text: t('rt.common.claimed'), size: 24, maxWidth: 170, tilt: -0.1 });
  private readonly ring = new Graphics();
  private readonly reward: RewardList;
  private claimed = false;

  constructor(
    w: number,
    index: number,
    head: string,
    row: TierRow,
    cur: number,
    onClaim: (button: Button) => void,
  ) {
    super();
    this.uiBox = { x: 0, y: 0, w, h: TIER_CELL_H };
    this.addChild(sharedSheet(w, TIER_CELL_H, { fill: Color.paperLight, radius: 24, seed: SHEET_SEEDS[index % SHEET_SEEDS.length] }));
    drawDashedRect(this.ring, 7, 7, w - 14, TIER_CELL_H - 14, { radius: 18, width: 3 });
    cacheStatic(this.ring);
    this.ring.visible = false;

    const title = uiLabel(head, { size: 26 });
    fitLabel(title, w - 24, 26);
    title.position.set(w / 2, 36);

    const parts = partsOf(row.reward);
    this.reward = new RewardList(parts, { direction: 'row', layout: 'column', size: parts.length > 1 ? 64 : 76, fontSize: 28, gap: 10, maxWidth: (w - 20) / Math.max(1, parts.length) });
    this.reward.position.set(w / 2, 124);

    const cx = w / 2;
    const cy = TIER_CELL_H - 18 - BTN_H / 2;
    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: w - 28, height: BTN_H, fontSize: 32 });
    this.claimBtn.position.set(cx, cy);
    this.claimBtn.onTap(() => onClaim(this.claimBtn));
    this.bar = new ProgressBar({ width: w - 36, height: 44, color: 'blue', value: tierFill(cur, row.need), label: '' });
    this.bar.position.set(cx, cy);
    this.stamp.position.set(cx, cy);
    this.addChild(this.ring, title, this.reward, this.bar, this.claimBtn, this.stamp);
    this.sync(row, cur, false);
  }

  sync(row: TierRow, cur: number, animate: boolean): void {
    const open = row.reached && !row.claimed;
    this.bar.setLabel(t('rt.mis.tier.progress', { cur: Math.min(cur, row.need), need: row.need }));
    this.bar.setValue(tierFill(cur, row.need), animate);
    this.bar.visible = !row.reached;
    this.claimBtn.visible = open;
    this.ring.visible = open;
    this.stamp.visible = row.claimed;
    this.reward.setDim(row.claimed);
    if (animate && row.claimed && !this.claimed) this.stamp.slam();
    this.claimed = row.claimed;
    if (open) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
