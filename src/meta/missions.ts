/**
 * Daily and weekly missions, the day/week slices they live in, and the date rollovers. Pure: each
 * function returns a new slice and never reads the clock; the caller passes the date.
 */
import { DAILY_MISSIONS, WEEKLY_MISSIONS, type MissionDef, type MissionMetric } from './data/schedule';
import { TREAT_SLOTS } from './data/economy';
import type { Bundle, DaySlice, MissionState, WeekSlice } from './types';

export type MetricDelta = Partial<Record<MissionMetric, number>>;

export function emptyMissions(defs: readonly MissionDef[]): MissionState {
  return { progress: defs.map(() => 0), claimed: defs.map(() => false) };
}

export function freshDay(date: string): DaySlice {
  return {
    date,
    missions: emptyMissions(DAILY_MISSIONS),
    chestClaimed: false,
    treat: Array.from({ length: TREAT_SLOTS }, () => false),
    snackChests: 0,
    ticketAds: 0,
    shopRefreshes: 0,
    patrolDoubles: 0,
    chestSkips: 0,
    challengeCleared: false,
  };
}

export function freshWeek(week: string): WeekSlice {
  return { week, missions: emptyMissions(WEEKLY_MISSIONS), chestClaimed: false };
}

/** Dates only move forward: a date that is not later than the stored one keeps the slice as it is. */
export function rollDay(day: DaySlice, today: string): DaySlice {
  return today > day.date ? freshDay(today) : day;
}

export function rollWeek(week: WeekSlice, thisWeek: string): WeekSlice {
  return thisWeek > week.week ? freshWeek(thisWeek) : week;
}

export function advanceMissions(state: MissionState, defs: readonly MissionDef[], delta: MetricDelta): MissionState {
  return {
    claimed: state.claimed,
    progress: defs.map((d, i) => Math.min(d.target, (state.progress[i] ?? 0) + (delta[d.metric] ?? 0))),
  };
}

export function missionComplete(state: MissionState, defs: readonly MissionDef[], i: number): boolean {
  const d = defs[i];
  return d !== undefined && (state.progress[i] ?? 0) >= d.target;
}

/** Mark mission `i` claimed. Null when it is not complete yet or was claimed already. */
export function claimMission(
  state: MissionState,
  defs: readonly MissionDef[],
  i: number,
): { state: MissionState; reward: Bundle; points: number } | null {
  const d = defs[i];
  if (!d || !missionComplete(state, defs, i) || state.claimed[i]) return null;
  const claimed = state.claimed.slice();
  claimed[i] = true;
  return { state: { progress: state.progress, claimed }, reward: d.reward, points: d.points };
}

/** Points of the claimed missions: the day's chest opens at 100. */
export function claimedPoints(state: MissionState, defs: readonly MissionDef[]): number {
  let n = 0;
  defs.forEach((d, i) => {
    if (state.claimed[i]) n += d.points;
  });
  return n;
}

export function allClaimed(state: MissionState): boolean {
  return state.claimed.length > 0 && state.claimed.every(Boolean);
}
