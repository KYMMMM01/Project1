/** One mission written on the notebook page: a check box, the line, a painted bar, the reward sticker and the claim / go / stamp control. */
import { CanvasTextMetrics, Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import type { MissionRow } from '@/meta/routines';
import { Button, Color, motion, PaperLabel, ProgressBar, TweenBag, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { CheckBox, StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { NOTE_MARGIN_X, NOTE_ROW_H } from './Notebook';
import './strings';

const BTN_W = 152;
const BTN_H = 88;
const EDGE = 24;
const BAR_H = 44;
const BAR_GAP = 10;

export interface MissionRowHandlers {
  claim(button: Button): void;
  go(): void;
}

/** A pen line through each written line of `text`, as (width, y) pairs relative to the text's top-left. */
function strikeLines(text: Text, lineHeight: number): { w: number; y: number }[] {
  const m = CanvasTextMetrics.measureText(text.text, text.style);
  return m.lineWidths.map((w, i) => ({ w, y: i * lineHeight + lineHeight / 2 + 1 }));
}

/** Origin = top-left of the row (a page row of NOTE_ROW_H). */
export class MissionRowView extends Container {
  readonly uiBox: Box;
  private readonly bag = new TweenBag();
  private readonly box = new CheckBox(54);
  private readonly bar: ProgressBar;
  private readonly claimBtn: Button;
  private readonly goBtn: Button;
  private readonly stamp = new StampMark({ text: t('rt.common.claimed'), size: 26, maxWidth: BTN_W, tilt: -0.1 });
  private readonly strike = new Container();
  private readonly reward: RewardList;
  private claimed = false;

  constructor(
    w: number,
    row: MissionRow,
    showPoints: boolean,
    h: MissionRowHandlers,
  ) {
    super();
    const H = NOTE_ROW_H;
    this.uiBox = { x: 0, y: 0, w, h: H };

    this.box.position.set(54, H / 2);
    const textX = NOTE_MARGIN_X + 24;
    const btnX = w - EDGE - BTN_W / 2;
    const chipX = btnX - BTN_W / 2 - 58;
    const textW = chipX - 62 - textX;

    // A long English line drops to the 24 px floor instead of running to a third line.
    const text = t('meta.mission.' + row.id, { n: row.target });
    let size = 28;
    let lh = 34;
    let title = uiLabel(text, { size, wrap: textW, align: 'left', anchorX: 0, anchorY: 0, lineHeight: lh });
    if (title.height > lh * 2 + 4) {
      title.destroy();
      size = 24;
      lh = 30;
      title = uiLabel(text, { size, wrap: textW, align: 'left', anchorX: 0, anchorY: 0, lineHeight: lh });
    }
    // Title and bar are one block, centred in the row whatever the number of lines.
    const top = Math.round((H - (title.height + BAR_GAP + BAR_H)) / 2);
    title.position.set(textX, top);

    // The pen line that crosses the written line out once the reward is taken; grows from the left.
    const pen = new Graphics();
    for (const { w: lw, y } of strikeLines(title, lh)) {
      pen.moveTo(0, y).lineTo(lw * 0.5, y - 1.2).lineTo(lw, y + 0.6).stroke({ width: 3.5, color: Color.ink, alpha: 0.6, cap: 'round', join: 'round' });
    }
    this.strike.addChild(pen);
    this.strike.position.set(textX, top);

    this.bar = new ProgressBar({ width: textW, height: BAR_H, color: 'green', value: 0, label: '' });
    this.bar.position.set(textX + textW / 2, top + title.height + BAR_GAP + BAR_H / 2);

    this.reward = new RewardList(partsOf(row.reward), { direction: 'row', size: 52, fontSize: 26, layout: 'column', maxWidth: 108 });
    this.reward.position.set(chipX, showPoints && row.points > 0 ? 52 : H / 2 - 4);
    this.addChild(this.box, title, this.strike, this.bar, this.reward);

    if (showPoints && row.points > 0) {
      const pts = new PaperLabel({ text: t('rt.mis.pts', { n: row.points }), size: 24, paper: 'mustard', torn: 'ends', padX: 12, padY: 4, maxWidth: 116 });
      pts.position.set(chipX, H - 30);
      this.addChild(pts);
    }

    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: BTN_W, height: BTN_H, fontSize: 32 });
    this.claimBtn.position.set(btnX, H / 2);
    this.claimBtn.onTap(() => h.claim(this.claimBtn));
    this.goBtn = new Button({ label: t('rt.mis.go'), style: 'neutral', width: BTN_W, height: BTN_H, fontSize: 30 });
    this.goBtn.position.copyFrom(this.claimBtn.position);
    this.goBtn.onTap(() => h.go());
    this.stamp.position.copyFrom(this.claimBtn.position);
    this.addChild(this.claimBtn, this.goBtn, this.stamp);
    this.sync(row, false);
  }

  /** Bring the row to `row`'s state; `animate` writes the check, draws the pen line and slams the stamp. */
  sync(row: MissionRow, animate: boolean): void {
    this.bar.setLabel(`${row.progress}/${row.target}`);
    this.bar.setValue(row.target > 0 ? Math.min(1, row.progress / row.target) : 0, animate);
    const fresh = animate && row.claimed && !this.claimed;
    this.claimed = row.claimed;
    const open = row.complete && !row.claimed;
    this.box.setReady(open);
    this.box.setDone(row.claimed, animate);
    this.claimBtn.visible = open;
    this.goBtn.visible = !row.complete;
    this.stamp.visible = row.claimed;
    this.reward.setDim(row.claimed);
    this.drawStrike(row.claimed, fresh);
    if (fresh) this.stamp.slam();
    if (open) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
  }

  private drawStrike(on: boolean, animate: boolean): void {
    this.bag.killAll();
    this.strike.visible = on;
    this.strike.scale.x = 1;
    if (!on || !animate || motion.reduced) return;
    this.strike.scale.x = 0;
    this.bag.run({
      duration: 0.3,
      delay: 0.12,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.strike.scale.x = k;
      },
      onComplete: () => {
        this.strike.scale.x = 1;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
