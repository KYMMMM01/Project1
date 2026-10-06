/** Pure rules of the attendance calendar's look: which state a day is in and which days carry the big stickers. */
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
