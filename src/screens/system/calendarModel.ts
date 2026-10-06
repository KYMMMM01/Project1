/** Pure rules of the attendance calendar's look: which state a day is in, which page is on show and which days carry the big stickers. */
import type { CalendarView } from '@/meta/routines';

export type CellState = 'claimed' | 'today' | 'upcoming';

export function calendarCellState(day: number, view: Pick<CalendarView, 'stamp' | 'next' | 'canClaim'>): CellState {
  if (day <= view.stamp) return 'claimed';
  return day === view.next && view.canClaim ? 'today' : 'upcoming';
}

/** Days 7 / 14 / 21 / 28 (the last column of the grid) carry the calendar's big rewards. */
export function isBigDay(day: number): boolean {
  return day % 7 === 0;
}

export interface CalendarPage {
  /** 1-based number of the page on show. */
  page: number;
  stamp: number;
  next: number;
  canClaim: boolean;
}

/**
 * The page to draw. The meta layer wraps the stamp to 0 and opens the next page in the same call that
 * stamps the last day, so on that date (stamp 0, a finished page behind it, last claim today) the page
 * just completed stays on show with every day stamped; the empty one appears when tomorrow can be claimed.
 */
export function calendarPage(view: Pick<CalendarView, 'stamp' | 'next' | 'cycles' | 'canClaim'>, claimedToday: boolean, days: number): CalendarPage {
  if (view.stamp === 0 && view.cycles > 0 && claimedToday) return { page: view.cycles, stamp: days, next: view.next, canClaim: false };
  return { page: view.cycles + 1, stamp: view.stamp, next: view.next, canClaim: view.canClaim };
}
