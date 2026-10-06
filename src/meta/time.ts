/**
 * Calendar math on local dates ('YYYY-MM-DD') and the clock guard. There is no server, so the device
 * clock is the only time source; the guard makes moving it earn nothing.
 */
import { ROLLBACK_SLACK_MS } from './data/economy';

const MS_DAY = 86_400_000;

export function dateKey(ms: number): string {
  const d = new Date(ms);
  return keyOf(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function keyOf(y: number, m: number, d: number): string {
  return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

/** Days since 1970-01-01 of a date key. Uses UTC arithmetic, so it is immune to time zones and DST. */
export function dayNumber(key: string): number {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  return Math.floor(Date.UTC(y, m - 1, d) / MS_DAY);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(key: string, n: number): string {
  const d = new Date((dayNumber(key) + n) * MS_DAY);
  return keyOf(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** The Monday of the week that contains `key`. */
export function weekKey(key: string): string {
  // 1970-01-01 was a Thursday: (n + 3) % 7 is 0 on Mondays.
  const sinceMonday = (((dayNumber(key) + 3) % 7) + 7) % 7;
  return addDays(key, -sinceMonday);
}

/** 'YYYYMMDD', used in the daily challenge code. */
export function compactDate(key: string): string {
  return key.slice(0, 4) + key.slice(5, 7) + key.slice(8, 10);
}

export interface ClockSource {
  /** Wall clock, epoch ms. */
  wall(): number;
  /** Monotonic ms (performance.now). */
  mono(): number;
}

/**
 * Trusted time for one app session.
 *
 * Backwards: a wall clock earlier than the saved `lastSeenAt` (by more than the slack) freezes every
 * time-based reward for the session. Moving during the session: the wall clock is checked against
 * the monotonic clock; a disagreement freezes the session as well and `now()` keeps following the
 * monotonic extrapolation, so a forward jump is never written into `lastSeenAt`. A jump made while
 * the app is closed cannot be told from a long absence, which is why every time-based reward is also
 * capped (patrol hours, one stored chest, one calendar box per date).
 */
export class SessionClock {
  private anchorWall = 0;
  private anchorMono = 0;
  private rolledBack = false;
  private jumped = false;

  constructor(private readonly src: ClockSource, lastSeenAt: number) {
    this.anchor(lastSeenAt);
  }

  /** Re-anchor after the app came back from the background (the monotonic clock may have paused). */
  anchor(lastSeenAt: number): void {
    this.anchorWall = this.src.wall();
    this.anchorMono = this.src.mono();
    if (this.anchorWall < lastSeenAt - ROLLBACK_SLACK_MS) this.rolledBack = true;
  }

  /** Compare against another saved `lastSeenAt` (an imported profile) without moving the anchor. */
  observe(lastSeenAt: number): void {
    if (this.now() < lastSeenAt - ROLLBACK_SLACK_MS) this.rolledBack = true;
  }

  now(): number {
    const wall = this.src.wall();
    const expected = this.anchorWall + (this.src.mono() - this.anchorMono);
    if (Math.abs(wall - expected) > ROLLBACK_SLACK_MS) {
      this.jumped = true;
      return expected;
    }
    return wall;
  }

  /** True when time-based rewards must not progress this session. */
  get frozen(): boolean {
    this.now();
    return this.rolledBack || this.jumped;
  }
}

/** `lastSeenAt` never decreases and never follows a frozen clock. */
export function nextLastSeen(last: number, now: number, frozen: boolean): number {
  return frozen ? last : Math.max(last, now);
}
