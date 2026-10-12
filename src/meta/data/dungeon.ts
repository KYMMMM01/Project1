/**
 * Numbers of the gold dungeon (rules: docs/명세_메타.md section 13). The run itself, eight waves of coins and a treasure chest at the end,
 * is game/data/goldDungeon.ts; this file is what it costs to enter and what it pays.
 */

/** Entries every day that cost nothing. One a day since 2026-10-12 (it was two). */
export const DUNGEON_FREE_ENTRIES = 1;
/**
 * Entries a day that can be bought on top (one rewarded ad or gems). None since 2026-10-12 (it was one). The code that sells an entry, the
 * card's buy row and their tests are kept: put 1 here to bring the extra entry back (and look at the pay first: see `DUNGEON_CHEST_GOLD`).
 */
export const DUNGEON_EXTRA_ENTRIES = 0;
export const DUNGEON_ENTRY_GEMS = 30;
/** AdService placement of the extra entry. It must be a row of the platform's AD_PLACEMENTS (daily 1, home) before the ad button can be used. */
export const DUNGEON_AD_PLACEMENT = 'dungeon_entry';

/**
 * Gold of a run = (WAVE_BASE x w + WAVE_STEP x w(w+1)/2 for the w waves cleared, + KILL x kills, + CHEST if the chest fell) x the chapter multiplier
 * of the tier. Each wave pays more than the one before it. 2026-10-12: one run a day with about a third of the enemies (131, not 399), so a kill
 * pays 0.6 -> 4; the chest at the end pays the lump that the x1.25 for a win (about 190 at tier 1) and the day's first-clear bonus (200) paid
 * before, folded into one number because there is one run a day. A full clear at tier 1 is 1,200, about 90% of the 1,348 that two full free runs
 * and the bonus made. It is paid once per run: with extra entries back, every run would pay it (the card's maximum is per run).
 */
export const DUNGEON_WAVE_BASE = 14;
export const DUNGEON_WAVE_STEP = 3;
export const DUNGEON_KILL_GOLD = 4;
export const DUNGEON_CHEST_GOLD = 456;

/** Tiers are the five chapters: tier n opens with chapter n cleared at butler level 0. */
export const DUNGEON_TIERS = 5;
