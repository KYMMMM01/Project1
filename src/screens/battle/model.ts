/** Pure rules of the battle tab: what is selectable, what the tab opens on, which cards show. No rendering. */
import { CHAPTERS, MAX_STAKE } from '@/game/data/roster';
import { canPlayStake, chaptersCleared } from '@/meta/rewards';

export interface Selection {
  chapter: number;
  stake: number;
}

export const CHAPTER_COUNT = CHAPTERS.length;
export const STAKE_COUNT = MAX_STAKE + 1;
/** The first-purchase card stays on the home tab this long once it has appeared (GDD section 8.3). */
export const PROMO_WINDOW_MS = 72 * 3_600_000;

const DATE_FORMAT = {
  ko: new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'UTC' }),
  en: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
} as const;

/** "10월 7일" / "Oct 7" for a "YYYY-MM-DD" day; what the daily card tags today's challenge with (the ruleset code is for support, not for players). */
export function dailyDateLabel(date: string, lang: 'ko' | 'en'): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return DATE_FORMAT[lang].format(Date.UTC(y, m - 1, d));
}

/** A chapter opens once the one before it is cleared at stake 0. */
export function chapterUnlocked(cleared: readonly number[], chapter: number): boolean {
  return chapter >= 1 && chapter <= CHAPTER_COUNT && (chapter === 1 || (cleared[chapter - 2] ?? 0) >= 1);
}

/** Highest stake cleared in a chapter, or -1 when none is. */
export function bestStake(cleared: readonly number[], chapter: number): number {
  return Math.min(MAX_STAKE, (cleared[chapter - 1] ?? 0) - 1);
}

export function stakePlayable(cleared: readonly number[], chapter: number, stake: number): boolean {
  return canPlayStake(cleared, chapter, stake);
}

export type StakeTagState = 'selected' | 'cleared' | 'open' | 'locked';

/** How one butler-level tag is drawn: the picked one, a cleared one (check stamp), one that can be tried, or one still locked. */
export function stakeTagState(cleared: readonly number[], chapter: number, stake: number, selected: number): StakeTagState {
  if (!stakePlayable(cleared, chapter, stake)) return 'locked';
  if (stake === selected) return 'selected';
  return stake < (cleared[chapter - 1] ?? 0) ? 'cleared' : 'open';
}

/** A stake can be swept once it is cleared (the ticket pays 60% of a win). */
export function sweepable(cleared: readonly number[], chapter: number, stake: number): boolean {
  return stake >= 0 && stake < (cleared[chapter - 1] ?? 0) && chapterUnlocked(cleared, chapter);
}

/** The next thing to beat: the first chapter not yet cleared, at the first stake not yet cleared there. */
export function frontier(cleared: readonly number[]): Selection {
  const chapter = Math.min(CHAPTER_COUNT, chaptersCleared(cleared) + 1);
  return { chapter, stake: Math.min(MAX_STAKE, cleared[chapter - 1] ?? 0) };
}

/**
 * Pull a selection onto something that can be shown: a chapter in range (a locked one may be looked
 * at) and a butler level the player may start there (stake 0 when the chapter is still locked).
 */
export function clampSelection(cleared: readonly number[], sel: Selection): Selection {
  const chapter = Math.min(CHAPTER_COUNT, Math.max(1, Math.round(sel.chapter)));
  let stake = Math.min(MAX_STAKE, Math.max(0, Math.round(sel.stake)));
  while (stake > 0 && !stakePlayable(cleared, chapter, stake)) stake--;
  return { chapter, stake };
}

export interface FinishedRun {
  mode: string;
  chapter: number;
  stake: number;
  firstClear: boolean;
}

/**
 * Where the tab points after a run: a chapter's first clear moves on to the next chapter; any other
 * chapter run stays on that chapter at the first stake not yet beaten. Daily and endless runs change nothing.
 */
export function selectionAfterRun(cleared: readonly number[], run: FinishedRun, current: Selection): Selection {
  if (run.mode !== 'chapter') return clampSelection(cleared, current);
  if (run.firstClear && run.stake === 0 && run.chapter < CHAPTER_COUNT) return clampSelection(cleared, { chapter: run.chapter + 1, stake: 0 });
  return clampSelection(cleared, { chapter: run.chapter, stake: Math.min(MAX_STAKE, cleared[run.chapter - 1] ?? 0) });
}

/** Home cards appear after the tutorial; before that the tab is just the chapter and the start button. */
export function cardsVisible(runsPlayed: number): boolean {
  return runsPlayed >= 1;
}

/** The first-purchase card shows for 72 hours from the moment it first became eligible. */
export function promoVisible(since: number, now: number): boolean {
  return since > 0 && now >= since && now - since < PROMO_WINDOW_MS;
}

/** Number on the tab badge: how many things wait to be collected. */
export function badgeCount(waiting: { patrol: boolean; chest: boolean; calendar: boolean; cup: number; endless: number }): number {
  return (waiting.patrol ? 1 : 0) + (waiting.chest ? 1 : 0) + (waiting.calendar ? 1 : 0) + waiting.cup + waiting.endless;
}

/** Share of the next weekly-cup tier earned, 0..1 (1 when every tier is reached). */
export function cupProgress(score: number, tiers: readonly { need: number }[]): { next: number | null; fraction: number } {
  const next = tiers.find((tier) => score < tier.need);
  if (!next) return { next: null, fraction: 1 };
  const index = tiers.indexOf(next);
  const floor = index > 0 ? (tiers[index - 1] as { need: number }).need : 0;
  return { next: next.need, fraction: Math.min(1, Math.max(0, (score - floor) / Math.max(1, next.need - floor))) };
}
