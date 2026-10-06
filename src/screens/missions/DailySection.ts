/** The "daily" sub-tab: the day's chest with its points bar, then the five missions. */
import { Container, type Text } from 'pixi.js';
import { toast } from '@/ui/Toast';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { DailyChestView, MissionRow } from '@/meta/routines';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import { drawIcon } from '@/ui/icons';
import { motion, TweenBag } from '@/ui/motion';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { Ease } from '@/core/tween';
import { partsOf } from '../system/kit/parts';
import { partIcon, RewardList } from '../system/kit/rewardChip';
import { countdownText, msUntilNextMidnight } from '../system/kit/time';
import { bakedPanel, ClaimedMark } from '../system/kit/widgets';
import { MISSION_ROW_H, MissionRowView } from './MissionRowView';
import type { MissionActions, Section } from './sections';
import './strings';

const CARD_H = 290;
const GAP = 14;

export class DailySection implements Section {
  readonly view = new Container();
  readonly height: number;
  private readonly bag = new TweenBag();
  private readonly rows: MissionRowView[] = [];
  private readonly bar: ProgressBar;
  private readonly chest: Container;
  private readonly claimBtn: Button;
  private readonly mark = new ClaimedMark(72);
  private readonly timer: Text;
  private lastSecond = -1;
  private wasReady = false;
  private wasClaimed = false;

  constructor(private readonly w: number, private readonly act: MissionActions) {
    const view = this.view;
    const chestView = profile.dailyChestView();
    view.addChild(bakedPanel(w, CARD_H, 'gold', 34));

    const title = uiLabel(t('rt.mis.daily.title'), { size: 36, anchorX: 0, strokeWidth: 6 });
    title.position.set(40, 50);
    const clock = drawIcon('clock', 34);
    this.timer = uiLabel('', { size: 24, color: Color.textDim, anchorX: 1, strokeWidth: 4, shadow: false });
    this.timer.y = 52;
    clock.position.set(w - 40 - 17, 52);
    this.timer.x = w - 82;
    view.addChild(title, clock, this.timer);

    const barW = w - 80 - 170;
    this.bar = new ProgressBar({
      width: barW,
      height: 52,
      color: 'gold',
      value: chestView.points / chestView.need,
      label: t('meta.mission.points', { points: chestView.points, need: chestView.need }),
    });
    this.bar.position.set(40 + barW / 2, 124);
    view.addChild(this.bar);

    this.chest = new Container();
    this.chest.addChild(partIcon({ kind: 'chest', chest: 'silver', n: 1 }, 136));
    this.chest.position.set(w - 40 - 68, 134);
    view.addChild(this.chest);

    const reward = new RewardList(partsOf(chestView.reward), { direction: 'row', size: 44, fontSize: 26, gap: 14, maxWidth: 100 });
    const rb = reward.uiBox;
    reward.position.set(40 - rb.x, 214);
    view.addChild(reward);

    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: 200, height: 88, fontSize: 36 });
    this.claimBtn.position.set(40 + barW - 100, 214);
    this.claimBtn.onTap(() => this.act.claimDailyChest(this.claimBtn));
    this.claimBtn.onDisabledTap(() => toast(t('meta.mission.dailyChest'), 'info'));
    this.mark.position.copyFrom(this.claimBtn.position);
    view.addChild(this.claimBtn, this.mark);

    const odds = new Button({ label: t('rt.common.odds'), style: 'neutral', width: 170, height: 80, fontSize: 26 });
    odds.position.set(w - 40 - 68, 238);
    odds.onTap(() => this.act.openOdds('silver'));
    view.addChild(odds);

    let y = CARD_H + GAP;
    profile.missionsView('daily').forEach((row, i) => {
      const rv = new MissionRowView(w, row, true, {
        claim: (b) => this.act.claimMission('daily', i, b),
        go: () => this.act.goBattle(),
      });
      rv.position.set(0, y);
      view.addChild(rv);
      this.rows.push(rv);
      y += MISSION_ROW_H + GAP;
    });
    this.height = y - GAP;
    this.syncChest(chestView, false);
  }

  sync(animate: boolean): void {
    profile.missionsView('daily').forEach((row: MissionRow, i) => this.rows[i]?.sync(row, animate));
    this.syncChest(profile.dailyChestView(), animate);
  }

  private syncChest(c: DailyChestView, animate: boolean): void {
    this.bar.setLabel(t('meta.mission.points', { points: c.points, need: c.need }));
    this.bar.setValue(c.points / c.need, animate);
    this.claimBtn.visible = !c.claimed;
    this.claimBtn.setEnabled(c.ready);
    this.mark.visible = c.claimed;
    this.chest.alpha = c.claimed ? 0.55 : 1;
    if (animate && c.claimed && !this.wasClaimed) this.mark.stamp();
    if (c.ready) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
    if (c.ready && !this.wasReady) this.wiggle();
    this.wasReady = c.ready;
    this.wasClaimed = c.claimed;
  }

  /** Three quick nods of the chest: "I am open". */
  private wiggle(): void {
    if (motion.reduced) return;
    this.bag.killOf(this.chest);
    this.bag.run({
      duration: 0.9,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.chest.rotation = Math.sin(k * Math.PI * 6) * 0.1 * (1 - k);
        this.chest.scale.set(1 + 0.06 * Math.sin(k * Math.PI));
      },
      onComplete: () => {
        this.chest.rotation = 0;
        this.chest.scale.set(1);
      },
    });
  }

  second(now: number): void {
    const s = Math.floor(now / 1000);
    if (s === this.lastSecond) return;
    this.lastSecond = s;
    this.timer.text = t('rt.common.resetsIn', { time: countdownText(msUntilNextMidnight(now)) });
    fitLabel(this.timer, this.w - 80 - 220, 24);
  }

  destroy(): void {
    this.bag.killAll();
    this.view.destroy({ children: true });
  }
}
