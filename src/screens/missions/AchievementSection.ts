/** The "achievement" sub-tab: one row per group of goals on a notebook page, claimable ones first, finished ones dimmed at the bottom. */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import { ACHIEVEMENTS } from '@/meta/data/achievements';
import { claimableAchievements } from '@/meta/achievements';
import { AchievementRowView } from './AchievementRowView';
import { achievementRows } from './model';
import { Notebook } from './Notebook';
import type { MissionActions, Section } from './sections';
import './strings';

/** Room above the page for the label that straddles its top edge. */
const TOP = 30;

export class AchievementSection implements Section {
  readonly view = new Container();
  readonly height: number;
  private readonly book: Notebook;
  private readonly rows = new Map<string, AchievementRowView>();

  constructor(w: number, act: MissionActions) {
    const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
    this.book = new Notebook(w, groups.length, t('rt.mis.ach.title'), 'yellow', (from) => act.claimAllAchievements(from));
    this.book.position.set(0, TOP);
    for (const g of groups) {
      const rv = new AchievementRowView(w, (key, button) => act.claimAchievement(key, button));
      this.book.addChild(rv);
      this.rows.set(g, rv);
    }
    this.view.addChild(this.book);
    this.height = TOP + this.book.pageH;
    this.sync(false);
  }

  sync(animate: boolean): void {
    const rows = achievementRows(profile.data);
    rows.forEach((row, i) => {
      const rv = this.rows.get(row.def.group);
      rv?.position.set(0, this.book.rowY(i));
      rv?.sync(row, animate);
    });
    this.book.bar?.sync(claimableAchievements(profile.data).length);
  }

  second(): void {}

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
