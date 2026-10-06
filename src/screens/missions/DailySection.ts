/** The "daily" sub-tab: the day's chest with its points bar, then the five missions on a notebook page. */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { MissionRow } from '@/meta/routines';
import { msUntilNextMidnight } from '../system/kit/time';
import { CHEST_STRIP_H, ChestStrip } from './ChestStrip';
import { MissionRowView } from './MissionRowView';
import { Notebook } from './Notebook';
import type { MissionActions, Section } from './sections';
import './strings';

/** Room above the first card for the label that straddles its top edge. */
const TOP = 30;
const GAP = 52;

export class DailySection implements Section {
  readonly view = new Container();
  readonly height: number;
  private readonly strip: ChestStrip;
  private readonly rows: MissionRowView[] = [];

  constructor(w: number, act: MissionActions) {
    const chest = profile.dailyChestView();
    this.strip = new ChestStrip(w, {
      title: t('rt.mis.daily.title'),
      chest: 'silver',
      reward: chest.reward,
      timer: true,
      hint: t('meta.mission.dailyChest'),
      claim: (from) => act.claimDailyChest(from),
      odds: () => act.openOdds('silver'),
    });
    this.strip.position.set(0, TOP);

    const missions = profile.missionsView('daily');
    const book = new Notebook(w, missions.length, t('rt.mis.daily.list'));
    book.position.set(0, TOP + CHEST_STRIP_H + GAP);
    missions.forEach((row, i) => {
      const rv = new MissionRowView(w, row, true, {
        claim: (b) => act.claimMission('daily', i, b),
        go: () => act.goBattle(),
      });
      rv.position.set(0, book.rowY(i));
      book.addChild(rv);
      this.rows.push(rv);
    });
    this.view.addChild(this.strip, book);
    this.height = TOP + CHEST_STRIP_H + GAP + book.pageH;
    this.sync(false);
  }

  sync(animate: boolean): void {
    profile.missionsView('daily').forEach((row: MissionRow, i) => this.rows[i]?.sync(row, animate));
    const c = profile.dailyChestView();
    this.strip.sync({ value: c.need > 0 ? Math.min(1, c.points / c.need) : 0, label: t('meta.mission.points', { points: c.points, need: c.need }), ready: c.ready, claimed: c.claimed }, animate);
  }

  second(now: number): void {
    this.strip.tick(now, msUntilNextMidnight(now));
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
