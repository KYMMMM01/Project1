/**
 * Achievement progress, measured from the profile every time (nothing says "reached" in the save; only the claimed list and a few
 * counters do, `ProfileData.achv`). Pure. The goals are in data/achievements.ts, the claim command in routines.ts.
 */
import type { RunStats } from '@/game/api';
import { t } from '@/core/i18n';
import { GOLD_DUNGEON_WAVES } from '@/game/data/goldDungeon';
import { MAX_STAKE } from '@/game/data/roster';
import { CALENDAR_DAYS } from './data/schedule';
import { MAX_LEVEL, TRAINING_MAX } from './data/economy';
import {
  ACHIEVEMENTS, UNITS_RAISED_LEVEL, type AchievementDef, type AchievementGroup, type AchievementKey, type AchievementMetric,
} from './data/achievements';
import { accountProgress } from './units';
import { BASE_UNITS, TRAINING_IDS, type ProfileData } from './types';

export type AchievementState = ProfileData['achv'];

const count = <T>(items: readonly T[], test: (item: T) => boolean): number => items.filter(test).length;

/** The measured value of each metric. A step is reached when its metric is at least its target. */
const MEASURES: Record<AchievementMetric, (d: ProfileData) => number> = {
  chapters: (d) => count(d.cleared, (n) => n >= 1),
  // cleared[c] = stakes cleared in a row from 0, so the highest cleared stake is one less (stake 0 is the plain level).
  butlerBest: (d) => Math.max(0, ...d.cleared) - 1,
  butlerFull: (d) => count(d.cleared, (n) => n >= MAX_STAKE + 1),
  wins: (d) => d.achv.wins,
  merges: (d) => d.stats.merges,
  endless: (d) => d.endless.best,
  daily: (d) => d.achv.daily,
  dungeon: (d) => count(d.dungeon.best, (b) => b.waves >= GOLD_DUNGEON_WAVES),
  unitsRaised: (d) => count(BASE_UNITS, (u) => d.levels[u] >= UNITS_RAISED_LEVEL),
  unitsMax: (d) => count(BASE_UNITS, (u) => d.levels[u] >= MAX_LEVEL),
  trainingMax: (d) => count(TRAINING_IDS, (k) => d.training[k] >= TRAINING_MAX),
  relics: (d) => d.achv.relics.length,
  mythic: (d) => (d.achv.mythic ? 1 : 0),
  awaken: (d) => d.achv.awaken,
  calendar: (d) => d.calendar.cycles * CALENDAR_DAYS + d.calendar.stamp,
  account: (d) => accountProgress(d.accountXp).level,
};

export function achievementDef(key: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.key === key);
}

export interface AchievementProgress {
  /** The measured value, held at `target` once reached. */
  current: number;
  target: number;
  reached: boolean;
}

export function achievementProgress(d: ProfileData, def: AchievementDef): AchievementProgress {
  const value = Math.max(0, MEASURES[def.metric](d));
  return { current: Math.min(value, def.target), target: def.target, reached: value >= def.target };
}

/** Every reached achievement, claimed or not, in table order (what Play Games is told). */
export function reachedAchievements(d: ProfileData): AchievementKey[] {
  return ACHIEVEMENTS.filter((a) => achievementProgress(d, a).reached).map((a) => a.key);
}

/** Reached and not claimed yet: the rows with a claim button and the missions tab's red dot. */
export function claimableAchievements(d: ProfileData): AchievementKey[] {
  return reachedAchievements(d).filter((k) => !d.achv.claimed.includes(k));
}

/** The step a group's row shows: its first unclaimed step, or the last step once all are claimed. */
export function currentStep(d: ProfileData, group: AchievementGroup): AchievementDef {
  const steps = ACHIEVEMENTS.filter((a) => a.group === group);
  return steps.find((a) => !d.achv.claimed.includes(a.key)) ?? (steps[steps.length - 1] as AchievementDef);
}

/** Name and description of a step in the current language (`{n}` filled with the target, thousands separated). */
export function achievementText(def: AchievementDef): { name: string; desc: string } {
  return {
    name: t('meta.ach.' + def.key + '.name'),
    desc: t('meta.ach.' + def.key + '.desc', { n: def.target.toLocaleString('en-US') }),
  };
}

/** The counters after a finished run. The tutorial never counts; a daily challenge win counts only as the day's first clear. */
export function achievementsAfterRun(a: AchievementState, stats: RunStats, dailyFirstClear: boolean): AchievementState {
  if (stats.mode === 'tutorial') return a;
  return {
    claimed: a.claimed,
    wins: a.wins + (stats.victory && (stats.mode !== 'daily' || dailyFirstClear) ? 1 : 0),
    daily: a.daily + (dailyFirstClear ? 1 : 0),
    awaken: a.awaken + stats.awakenings,
    mythic: a.mythic || stats.bestRarity === 'mythic',
    relics: [...new Set([...a.relics, ...stats.relics])],
  };
}
