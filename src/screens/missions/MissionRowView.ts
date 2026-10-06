/** One mission as a row: medallion, text, progress, reward and the claim / go / done control. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { MissionRow } from '@/meta/routines';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import { drawIcon } from '@/ui/icons';
import type { Box } from '@/ui/layoutMath';
import { cacheStatic, vGradient } from '@/ui/shapes';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { bakedPanel, ClaimedMark } from '../system/kit/widgets';
import { metricIcon } from './model';
import './strings';

export const MISSION_ROW_H = 196;
const BTN_W = 172;
const BTN_H = 88;
const SIDE = 24;

export interface MissionRowHandlers {
  claim(button: Button): void;
  go(): void;
}

/** Origin = top-left of the row. */
export class MissionRowView extends Container {
  readonly uiBox: Box;
  private readonly bar: ProgressBar;
  private readonly claimBtn: Button;
  private readonly goBtn: Button;
  private readonly mark = new ClaimedMark(72);
  private readonly body = new Container();
  private claimed = false;

  constructor(
    w: number,
    row: MissionRow,
    private readonly showPoints: boolean,
    h: MissionRowHandlers,
  ) {
    super();
    this.uiBox = { x: 0, y: 0, w, h: MISSION_ROW_H };
    const H = MISSION_ROW_H;
    this.addChild(bakedPanel(w, H, 'default', 30), this.body);

    const disc = new Graphics();
    disc.circle(0, 4, 44).fill({ color: Color.black, alpha: 0.3 });
    disc.circle(0, 0, 44).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    cacheStatic(disc);
    disc.position.set(SIDE + 44 + 2, H / 2);
    const icon = drawIcon(metricIcon(row.metric), 54);
    icon.position.copyFrom(disc.position);
    this.body.addChild(disc, icon);

    const textX = SIDE + 44 * 2 + 20;
    const colW = BTN_W + 16;
    const textW = w - textX - colW - SIDE;
    const title = uiLabel(t('meta.mission.' + row.id, { n: row.target }), {
      size: 28,
      wrap: textW,
      align: 'left',
      anchorX: 0,
      anchorY: 0,
      lineHeight: 34,
      strokeWidth: 5,
      shadow: false,
    });
    title.position.set(textX, 22);
    this.body.addChild(title);

    this.bar = new ProgressBar({
      width: textW,
      height: 36,
      color: 'green',
      value: row.target > 0 ? row.progress / row.target : 0,
      label: `${row.progress}/${row.target}`,
    });
    this.bar.position.set(textX + textW / 2, H - 56);
    this.body.addChild(this.bar);

    const colX = w - SIDE - BTN_W / 2;
    const reward = new RewardList(partsOf(row.reward), { direction: 'row', size: 48, fontSize: 28, maxWidth: BTN_W });
    reward.position.set(colX, 40);
    this.body.addChild(reward);
    if (this.showPoints && row.points > 0) {
      const pts = uiLabel(t('rt.mis.pts', { n: row.points }), { size: 24, color: Color.gold, strokeWidth: 4, shadow: false });
      fitLabel(pts, BTN_W, 24);
      pts.position.set(colX, 74);
      this.body.addChild(pts);
    }

    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: BTN_W, height: BTN_H, fontSize: 34 });
    this.claimBtn.position.set(colX, H - 18 - BTN_H / 2 - 2);
    this.claimBtn.onTap(() => h.claim(this.claimBtn));
    this.goBtn = new Button({ label: t('rt.mis.go'), style: 'neutral', width: BTN_W, height: BTN_H, fontSize: 32 });
    this.goBtn.position.copyFrom(this.claimBtn.position);
    this.goBtn.onTap(() => h.go());
    this.mark.position.set(colX, this.claimBtn.y);
    this.body.addChild(this.claimBtn, this.goBtn, this.mark);
    this.sync(row, false);
  }

  /** Bring the row to `row`'s state; `animate` plays the stamp and the bar fill. */
  sync(row: MissionRow, animate: boolean): void {
    this.bar.setLabel(`${row.progress}/${row.target}`);
    this.bar.setValue(row.target > 0 ? row.progress / row.target : 0, animate);
    const stampNow = animate && row.claimed && !this.claimed;
    this.claimed = row.claimed;
    this.claimBtn.visible = row.complete && !row.claimed;
    this.goBtn.visible = !row.complete;
    this.mark.visible = row.claimed;
    this.body.alpha = row.claimed ? 0.8 : 1;
    if (stampNow) this.mark.stamp();
    if (this.claimBtn.visible) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
