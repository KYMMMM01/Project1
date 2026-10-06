/** The "weekly" sub-tab: five weekly missions, the all-done chest, the weekly cup and the endless tiers. */
import { Container, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { profile } from '@/meta';
import { WEEKLY_CHEST_REWARD } from '@/meta/data/schedule';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import { motion, TweenBag } from '@/ui/motion';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { toast } from '@/ui/Toast';
import { partsOf } from '../system/kit/parts';
import { partIcon, RewardList } from '../system/kit/rewardChip';
import { countdownText, msUntilNextMonday } from '../system/kit/time';
import { bakedPanel, ClaimedMark } from '../system/kit/widgets';
import { MISSION_ROW_H, MissionRowView } from './MissionRowView';
import type { MissionActions, Section } from './sections';
import { TierCard } from './TierCard';
import './strings';

const GAP = 14;
const CHEST_H = 270;

export class WeeklySection implements Section {
  readonly view = new Container();
  readonly height: number;
  private readonly bag = new TweenBag();
  private readonly rows: MissionRowView[] = [];
  private readonly timer: Text;
  private readonly chestBar: ProgressBar;
  private readonly chest: Container;
  private readonly chestBtn: Button;
  private readonly chestMark = new ClaimedMark(72);
  private readonly cup: TierCard;
  private readonly endless: TierCard;
  private lastSecond = -1;
  private wasReady = false;
  private wasClaimed = false;

  constructor(private readonly w: number, private readonly act: MissionActions) {
    const view = this.view;
    const title = uiLabel(t('rt.mis.weekly.title'), { size: 36, anchorX: 0, strokeWidth: 6 });
    title.position.set(8, 30);
    this.timer = uiLabel('', { size: 24, color: Color.textDim, anchorX: 1, strokeWidth: 4, shadow: false });
    this.timer.position.set(w - 8, 32);
    view.addChild(title, this.timer);

    let y = 76;
    profile.missionsView('weekly').forEach((row, i) => {
      const rv = new MissionRowView(w, row, false, {
        claim: (b) => this.act.claimMission('weekly', i, b),
        go: () => (row.metric === 'dailyChests' ? this.act.goDaily() : this.act.goBattle()),
      });
      rv.position.set(0, y);
      view.addChild(rv);
      this.rows.push(rv);
      y += MISSION_ROW_H + GAP;
    });

    const card = bakedPanel(w, CHEST_H, 'gold', 34);
    card.position.set(0, y);
    view.addChild(card);
    this.chest = new Container();
    this.chest.addChild(partIcon({ kind: 'chest', chest: 'gold', n: 1 }, 156));
    this.chest.position.set(118, y + 112);
    const chestTitle = uiLabel(t('rt.mis.weekly.chest'), { size: 34, anchorX: 0, strokeWidth: 6 });
    chestTitle.position.set(236, y + 50);
    const barW = w - 236 - 40;
    this.chestBar = new ProgressBar({ width: barW, height: 46, color: 'gold', value: 0, label: '' });
    this.chestBar.position.set(236 + barW / 2, y + 112);
    const reward = new RewardList(partsOf(WEEKLY_CHEST_REWARD), { direction: 'row', size: 44, fontSize: 26, maxWidth: 130 });
    reward.position.set(236 - reward.uiBox.x, y + 196);
    this.chestBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: 200, height: 88, fontSize: 36 });
    this.chestBtn.position.set(w - 40 - 100, y + 196);
    this.chestBtn.onTap(() => this.act.claimWeeklyChest(this.chestBtn));
    this.chestBtn.onDisabledTap(() => toast(t('meta.mission.weeklyChest'), 'info'));
    this.chestMark.position.copyFrom(this.chestBtn.position);
    const odds = new Button({ label: t('rt.common.odds'), style: 'neutral', width: 170, height: 80, fontSize: 26 });
    odds.position.set(118, y + 226);
    odds.onTap(() => this.act.openOdds('gold'));
    view.addChild(this.chest, chestTitle, this.chestBar, reward, this.chestBtn, this.chestMark, odds);
    y += CHEST_H + GAP;

    this.cup = new TierCard(w, {
      titleKey: 'rt.mis.cup.title',
      subKey: 'rt.mis.cup.sub',
      icon: 'trophy',
      feature: 'cup',
      head: (n) => t('meta.cup.tier', { n }),
      read: () => {
        const v = profile.cupView();
        return {
          tiers: v.tiers,
          cur: v.score,
          headline: t('rt.mis.cup.score', { n: v.score }),
          detail: t('rt.mis.cup.today', { n: v.todayBest }),
        };
      },
      claim: (i, from) => this.act.claimCup(i, from),
      goLabelKey: 'rt.mis.cup.play',
      go: () => this.act.goBattle(),
    });
    this.cup.position.set(0, y);
    y += this.cup.cardH + GAP;

    this.endless = new TierCard(w, {
      titleKey: 'rt.mis.endless.title',
      subKey: 'rt.mis.endless.sub',
      icon: 'skull',
      feature: 'endless',
      head: (n) => t('meta.endless.tier', { n }),
      read: () => {
        const v = profile.endlessView();
        return {
          tiers: v.tiers,
          cur: v.weekBest,
          headline: t('meta.endless.tier', { n: v.weekBest }),
          detail: t('rt.mis.endless.best', { best: v.best }),
        };
      },
      claim: (i, from) => this.act.claimEndless(i, from),
      goLabelKey: 'rt.mis.endless.play',
      go: () => this.act.goBattle(),
    });
    this.endless.position.set(0, y);
    y += this.endless.cardH;
    view.addChild(this.cup, this.endless);
    this.height = y;
    this.syncChest(false);
  }

  sync(animate: boolean): void {
    profile.missionsView('weekly').forEach((row, i) => this.rows[i]?.sync(row, animate));
    this.syncChest(animate);
    this.cup.sync(animate);
    this.endless.sync(animate);
  }

  private syncChest(animate: boolean): void {
    const rows = profile.missionsView('weekly');
    const done = rows.filter((r) => r.claimed).length;
    const ready = profile.weeklyChestReady();
    const claimed = profile.data.week.chestClaimed;
    this.chestBar.setLabel(t('rt.mis.weekly.count', { n: done, max: rows.length }));
    this.chestBar.setValue(rows.length > 0 ? done / rows.length : 0, animate);
    this.chestBtn.visible = !claimed;
    this.chestBtn.setEnabled(ready);
    this.chestMark.visible = claimed;
    this.chest.alpha = claimed ? 0.55 : 1;
    if (animate && claimed && !this.wasClaimed) this.chestMark.stamp();
    if (ready) this.chestBtn.startPulse({ times: 3 });
    else this.chestBtn.stopPulse();
    if (ready && !this.wasReady) this.wiggle();
    this.wasReady = ready;
    this.wasClaimed = claimed;
  }

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
    this.timer.text = t('rt.common.resetsIn', { time: countdownText(msUntilNextMonday(now)) });
    fitLabel(this.timer, this.w - 16 - 320, 24);
  }

  destroy(): void {
    this.bag.killAll();
    this.view.destroy({ children: true });
  }
}
