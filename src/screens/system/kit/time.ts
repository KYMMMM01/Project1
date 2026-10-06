/** Countdown maths for the reset timers. Pure: callers pass the trusted clock reading. */
import { fmtDuration } from '@/core/format';

/** Milliseconds until the next local midnight (the daily reset). */
export function msUntilNextMidnight(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now;
}

/** Milliseconds until the next local Monday 00:00 (the weekly reset: weeks start on Monday). */
export function msUntilNextMonday(now: number): number {
  const d = new Date(now);
  const sinceMonday = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (7 - sinceMonday)).getTime() - now;
}

/** "5:12:03" under a day, "2일 4시간" beyond; rounds up so the label never reads 0:00 before the reset. */
export function countdownText(ms: number): string {
  return fmtDuration(Math.ceil(Math.max(0, ms) / 1000));
}

/** Whole days left until `until` (epoch ms), at least 1 while it is still in the future. */
export function daysUntil(until: number, now: number): number {
  return until > now ? Math.ceil((until - now) / 86_400_000) : 0;
}
