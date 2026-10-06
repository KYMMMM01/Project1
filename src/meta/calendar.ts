/**
 * The 28-day login calendar and the comeback bonus. A missed day costs nothing: the calendar moves
 * one box for every date the player shows up on and never resets. Pure.
 */
import { CALENDAR, CALENDAR_DAYS } from './data/schedule';
import { COMEBACK_DAYS } from './data/economy';
import { daysBetween } from './time';
import type { Bundle, ProfileData } from './types';

export type CalendarState = ProfileData['calendar'];

/** The box (1..28) the next claim opens. */
export function calendarNext(cal: CalendarState): number {
  return (cal.stamp % CALENDAR_DAYS) + 1;
}

export function canClaimCalendar(cal: CalendarState, today: string): boolean {
  return today > cal.lastDate;
}

export function claimCalendar(
  cal: CalendarState,
  today: string,
): { cal: CalendarState; day: number; reward: Bundle } | null {
  if (!canClaimCalendar(cal, today)) return null;
  const day = calendarNext(cal);
  const wrapped = day === CALENDAR_DAYS;
  return {
    cal: { stamp: wrapped ? 0 : cal.stamp + 1, lastDate: today, cycles: cal.cycles + (wrapped ? 1 : 0) },
    day,
    reward: CALENDAR[day - 1] ?? {},
  };
}

/** True when the player was away for `COMEBACK_DAYS` dates or more (a first-ever session is not a comeback). */
export function comebackDue(lastActiveDate: string, today: string): boolean {
  return lastActiveDate !== '' && daysBetween(lastActiveDate, today) >= COMEBACK_DAYS;
}
