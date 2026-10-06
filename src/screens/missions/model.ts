/** Pure counting and mapping for the missions tab: what is claimable, and which icon a mission wears. */
import type { Profile } from '@/meta/profile';
import type { IconName } from '@/ui/icons';

/** The metrics a mission can count, mapped to the icon on its medallion. */
export function metricIcon(metric: string): IconName {
  switch (metric) {
    case 'runs':
      return 'swords';
    case 'merges':
      return 'arrow_up';
    case 'bosses':
      return 'skull';
    case 'relics':
      return 'gift';
    case 'wins':
      return 'trophy';
    case 'dailyChests':
      return 'chest';
    default:
      return 'star';
  }
}

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
