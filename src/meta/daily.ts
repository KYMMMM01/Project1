/**
 * The daily challenge (date-derived seed and rules), the weekly cup and the endless tiers. Pure.
 */
import { Rng } from '@/core/rng';
import type { DailyModifierId } from '@/game/api';
import { DAILY_CHAPTER_POOL, DAILY_MODIFIERS, DAILY_RULESET, DAILY_WAVES } from './data/schedule';
import { compactDate, daysBetween } from './time';

/** FNV-1a, 32 bit. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "D-20261107-r1": the date and the ruleset revision. Everyone on that date plays the same game. */
export function dailyCode(date: string, ruleset: number = DAILY_RULESET): string {
  return `D-${compactDate(date)}-r${ruleset}`;
}

export function parseDailyCode(code: string): { date: string; ruleset: number } | null {
  const m = /^D-(\d{4})(\d{2})(\d{2})-r(\d+)$/.exec(code.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() + 1 !== Number(m[2]) || d.getUTCDate() !== Number(m[3])) return null;
  return { date, ruleset: Number(m[4]) };
}

export interface DailySetup {
  code: string;
  date: string;
  seed: number;
  chapter: number;
  stake: 0;
  modifiers: DailyModifierId[];
  waves: number;
}

export function dailySetup(date: string, ruleset: number = DAILY_RULESET): DailySetup {
  const code = dailyCode(date, ruleset);
  const seed = hashString(code);
  const rng = new Rng(seed);
  return {
    code,
    date,
    seed,
    chapter: rng.pick(DAILY_CHAPTER_POOL),
    stake: 0,
    modifiers: [rng.pick(DAILY_MODIFIERS)],
    waves: DAILY_WAVES,
  };
}

// ───────────────────────────── weekly cup ─────────────────────────────

/** Sum of the best daily-challenge wave of each date inside the week that starts on `week`. */
export function cupScore(days: Readonly<Record<string, number>>, week: string): number {
  let sum = 0;
  for (const [date, best] of Object.entries(days)) {
    const k = daysBetween(week, date);
    if (k >= 0 && k < 7) sum += best;
  }
  return sum;
}
