/** The "weekly" sub-tab: five weekly missions on a notebook page, the all-done chest, the weekly cup and the endless tiers. */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { WEEKLY_CHEST_REWARD } from '@/meta/data/schedule';
import { dateKey } from '@/meta/time';
import { msUntilNextMonday } from '../system/kit/time';
import { TimerTag } from '../system/kit/tags';
import { CHEST_STRIP_H, ChestStrip } from './ChestStrip';
import { weekDays } from './model';
import { MissionRowView } from './MissionRowView';
import { Notebook } from './Notebook';
import type { MissionActions, Section } from './sections';
import { TierCard } from './TierCard';
import './strings';

/** Room above a card for the label that straddles its top edge. */
const TOP = 30;
const GAP = 52;

export class WeeklySection implements Section {
  readonly view = new Container();
  readonly height: number;
  private readonly rows: MissionRowView[] = [];
  private readonly timer = new TimerTag(310);
  private readonly strip: ChestStrip;
  private readonly cup: TierCard;
  private readonly endless: TierCard;

  constructor(w: number, act: MissionActions) {
    const missions = profile.missionsView('weekly');
    const book = new Notebook(w, missions.length, t('rt.mis.weekly.title'));
    book.position.set(0, TOP);
    missions.forEach((row, i) => {
      const rv = new MissionRowView(w, row, false, {
        claim: (b) => act.claimMission('weekly', i, b),
        go: () => (row.metric === 'dailyChests' ? act.goDaily() : act.goBattle()),
      });
      rv.position.set(0, book.rowY(i));
      book.addChild(rv);
      this.rows.push(rv);
    });
    this.timer.position.set(w - 28, 34);
    book.addChild(this.timer);
    let y = TOP + book.pageH + GAP;

    this.strip = new ChestStrip(w, {
      title: t('rt.mis.weekly.chest'),
      chest: 'gold',
      reward: WEEKLY_CHEST_REWARD,
      timer: false,
      hint: t('meta.mission.weeklyChest'),
      claim: (from) => act.claimWeeklyChest(from),
      odds: () => act.openOdds('gold'),
    });
    this.strip.position.set(0, y);
    y += CHEST_STRIP_H + GAP - 8;

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
          days: weekDays(v.week, profile.data.cup.days, dateKey(profile.now())),
        };
      },
      claim: (i, from) => act.claimCup(i, from),
      goLabelKey: 'rt.mis.cup.play',
      go: () => act.goBattle(),
    });
    this.cup.position.set(0, y);
    y += this.cup.cardH + 28;

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
      claim: (i, from) => act.claimEndless(i, from),
      goLabelKey: 'rt.mis.endless.play',
      go: () => act.goBattle(),
    });
    this.endless.position.set(0, y);
    y += this.endless.cardH;
    this.view.addChild(book, this.strip, this.cup, this.endless);
    this.height = y;
    this.sync(false);
  }

  sync(animate: boolean): void {
    const rows = profile.missionsView('weekly');
    rows.forEach((row, i) => this.rows[i]?.sync(row, animate));
    const done = rows.filter((r) => r.claimed).length;
    this.strip.sync(
      {
        value: rows.length > 0 ? done / rows.length : 0,
        label: t('rt.mis.weekly.count', { n: done, max: rows.length }),
        ready: profile.weeklyChestReady(),
        claimed: profile.data.week.chestClaimed,
      },
      animate,
    );
    this.cup.sync(animate);
    this.endless.sync(animate);
  }

  second(now: number): void {
    this.timer.tick(now, msUntilNextMonday(now));
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
