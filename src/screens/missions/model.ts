/** Pure counting and mapping for the missions tab: what is claimable, bar fills and the days of the cup week. */
import type { Profile } from '@/meta/profile';
import { addDays } from '@/meta/time';

export interface MissionBadges {
  daily: number;
  weekly: number;
  total: number;
}

/** Claimable things per sub-tab. Everything is 0 while the missions feature is locked. */
export function missionBadges(p: Profile): MissionBadges {
  if (!p.featureUnlocked('missions')) return { daily: 0, weekly: 0, total: 0 };
  let daily = p.missionsView('daily').filter((m) => m.complete && !m.claimed).length;
  if (p.dailyChestView().ready) daily++;
  let weekly = p.missionsView('weekly').filter((m) => m.complete && !m.claimed).length;
  if (p.weeklyChestReady()) weekly++;
  if (p.featureUnlocked('cup')) weekly += p.cupView().tiers.filter((t) => t.reached && !t.claimed).length;
  if (p.featureUnlocked('endless')) weekly += p.endlessView().tiers.filter((t) => t.reached && !t.claimed).length;
  return { daily, weekly, total: daily + weekly };
}

/** Share of a tier's goal reached, 0..1. */
export function tierFill(cur: number, need: number): number {
  return need > 0 ? Math.min(1, Math.max(0, cur / need)) : 0;
}

/** Position of tier markers along a bar that ends at the last tier's goal (0..1). */
export function tierMarks(needs: readonly number[]): number[] {
  const top = Math.max(1, ...needs);
  return needs.map((n) => n / top);
}

export interface WeekDay {
  /** 0 = Monday. */
  index: number;
  key: string;
  /** Best daily-challenge wave of that day, 0 when none was played. */
  best: number;
  today: boolean;
  future: boolean;
}

/** The seven days of the cup week (its Monday is `week`) with the best wave of each. */
export function weekDays(week: string, days: Readonly<Record<string, number>>, today: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDays(week, index);
    return { index, key, best: days[key] ?? 0, today: key === today, future: key > today };
  });
}
