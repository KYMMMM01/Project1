/**
 * Numbers of the gold dungeon (rules: docs/명세_메타.md section 13). The run itself, eight waves, is
 * game/data/goldDungeon.ts; this file is what it costs to enter and what it pays.
 */

/** Entries every day that cost nothing. */
export const DUNGEON_FREE_ENTRIES = 2;
/** Entries a day that can be bought on top (one rewarded ad or gems): three runs at most. */
export const DUNGEON_EXTRA_ENTRIES = 1;
export const DUNGEON_ENTRY_GEMS = 30;
/** AdService placement of the extra entry. It must be a row of the platform's AD_PLACEMENTS (daily 1, home) before the ad button can be used. */
export const DUNGEON_AD_PLACEMENT = 'dungeon_entry';

/**
 * Gold of a run = (WAVE_BASE + WAVE_STEP x w, summed over the waves cleared, + KILL x kills) x chapter multiplier
 * of the tier x (victory ? VICTORY : 1). Each wave pays more than the one before it.
 */
export const DUNGEON_WAVE_BASE = 8;
export const DUNGEON_WAVE_STEP = 2;
export const DUNGEON_KILL_GOLD = 0.35;
export const DUNGEON_VICTORY_MULT = 1.25;
/** The first victory of the day adds this much gold per point of the tier's multiplier. */
export const DUNGEON_FIRST_CLEAR_GOLD = 100;

/** Tiers are the five chapters: tier n opens with chapter n cleared at butler level 0. */
export const DUNGEON_TIERS = 5;
