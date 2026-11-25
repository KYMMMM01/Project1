/** One achievement on the notebook page: a check box, the step's name and line, a painted bar, the reward sticker, step pips and the claim / stamp control. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { achievementText } from '@/meta/achievements';
import { honorCosmetic } from '@/meta/data/catalog';
import { Button, Color, fitLabel, ProgressBar, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { CheckBox, StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { NOTE_MARGIN_X, NOTE_ROW_H } from './Notebook';
import type { AchievementRow } from './model';
import './strings';

const BTN_W = 152;
const BTN_H = 88;
const EDGE = 24;
const BAR_H = 36;
const DESC_LINE = 27;
const PIP_R = 15;
const PIP_GAP = 8;
const STEP_COLOR = { claimed: Color.leaf, ready: Color.mustard, open: Color.paperDim } as const;

/** Origin = top-left of the row (a page row of NOTE_ROW_H). */
export class AchievementRowView extends Container {
  readonly uiBox: Box;
  private readonly box = new CheckBox(54);
  private readonly bar: ProgressBar;
  private readonly claimBtn: Button;
  private readonly stamp = new StampMark({ text: t('rt.common.claimed'), size: 26, maxWidth: BTN_W, tilt: -0.1 });
  private readonly pips = new Container();
  private readonly textX = NOTE_MARGIN_X + 24;
  private readonly textW: number;
  private readonly chipX: number;
  private body = new Container();
  private key = '';

  constructor(w: number, claim: (key: string, button: Button) => void) {
    super();
    const H = NOTE_ROW_H;
    this.uiBox = { x: 0, y: 0, w, h: H };
    const btnX = w - EDGE - BTN_W / 2;
    this.chipX = btnX - BTN_W / 2 - 58;
    this.textW = this.chipX - 62 - this.textX;

    this.box.position.set(54, H / 2);
    this.bar = new ProgressBar({ width: this.textW, height: BAR_H, color: 'green', value: 0, label: '', labelSize: 24 });
    this.bar.position.set(this.textX + this.textW / 2, H - 12 - BAR_H / 2);
    this.pips.position.set(this.chipX, H - 12 - BAR_H / 2);
    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: BTN_W, height: BTN_H, fontSize: 32 });
    this.claimBtn.position.set(btnX, H / 2);
    this.claimBtn.onTap(() => claim(this.key, this.claimBtn));
    this.stamp.position.copyFrom(this.claimBtn.position);
    this.addChild(this.box, this.body, this.bar, this.pips, this.claimBtn, this.stamp);
  }

  /** The name, the line and the gem sticker of the step on show (rebuilt only when the step changes). */
  private rebuild(row: AchievementRow): void {
    this.body.destroy({ children: true });
    this.body = new Container();
    const text = achievementText(row.def);
    const name = uiLabel(text.name, { size: 30, align: 'left', anchorX: 0, anchorY: 0 });
    fitLabel(name, this.textW, 30);
    name.position.set(this.textX, 10);
    const desc = uiLabel(text.desc, { size: 24, color: Color.inkSoft, wrap: this.textW, align: 'left', anchorX: 0, anchorY: 0, lineHeight: DESC_LINE });
    desc.position.set(this.textX, 46);
    // A third line would run into the bar: cut it with an ellipsis.
    const full = desc.text;
    for (let n = full.length - 1; n > 0 && desc.height > DESC_LINE * 2 + 2; n--) desc.text = full.slice(0, n).trimEnd() + '…';
    // A hard achievement also hands out a cosmetic (docs/명세_프로필꾸미기.md 8.4).
    const honor = honorCosmetic(row.def.key);
    const reward = new RewardList(partsOf(honor ? { gems: row.def.gems, cosmetics: [honor] } : { gems: row.def.gems }), {
      direction: 'row', size: 52, fontSize: 26, layout: 'column', maxWidth: 108,
    });
    reward.position.set(this.chipX, row.steps.length > 1 ? 52 : NOTE_ROW_H / 2 - 4);
    this.body.addChild(name, desc, reward);
    this.addChildAt(this.body, 1);
  }

  /** The numbered dots under the sticker: a step taken is green, one that waits is gold. */
  private drawPips(row: AchievementRow): void {
    for (const c of this.pips.removeChildren()) c.destroy({ children: true });
    const n = row.steps.length;
    if (n < 2) return;
    const g = new Graphics();
    const x0 = -((n - 1) * (PIP_R * 2 + PIP_GAP)) / 2;
    row.steps.forEach((s, i) => {
      const x = x0 + i * (PIP_R * 2 + PIP_GAP);
      g.circle(x, 0, PIP_R).fill(STEP_COLOR[s]).stroke({ width: 2.5, color: s === 'open' ? Color.kraftDark : Color.ink, alpha: 0.8 });
      const num = uiLabel(i + 1, { size: 24 });
      num.scale.set(0.8);
      num.position.set(x, 0);
      this.pips.addChild(num);
    });
    this.pips.addChildAt(g, 0);
  }

  /** Bring the row to `row`'s state; `animate` writes the check, fills the bar and slams the stamp. */
  sync(row: AchievementRow, animate: boolean): void {
    const fresh = row.def.key !== this.key;
    if (fresh) {
      this.key = row.def.key;
      this.rebuild(row);
    }
    this.drawPips(row);
    this.bar.setLabel(`${row.current.toLocaleString('en-US')} / ${row.def.target.toLocaleString('en-US')}`);
    this.bar.setValue(Math.min(1, row.current / row.def.target), animate && !fresh);
    const done = row.state === 'done';
    const open = row.state === 'claimable';
    this.box.setReady(open);
    this.box.setDone(done, animate);
    this.claimBtn.visible = open;
    this.stamp.visible = done;
    this.body.alpha = done ? 0.55 : 1;
    this.bar.alpha = done ? 0.55 : 1;
    this.pips.alpha = done ? 0.55 : 1;
    if (open) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
