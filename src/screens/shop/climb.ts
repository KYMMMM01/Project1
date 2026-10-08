/**
 * The climb of a chest opening: which colour the stage shows after each beat of the wind-up. Every opening starts on the lowest rank's
 * quiet colour and a beat may promote it; it ends on the best rank inside and never passes it or goes down, so the player reads the
 * result from the staging as it unfolds. Pure data and a pick from it, no pictures and no sound.
 */
import { CHEST_RARITIES, type ChestRarity } from '@/meta/types';

/** The highest rank a chest can hold. */
export const TOP_RANK = CHEST_RARITIES.length - 1;

export interface ClimbPattern {
  id: string;
  /** Share (percent) of the openings of this best rank that get this pattern: a row of the table adds up to 100. */
  odds: number;
  /** The colour (a rank) the stage shows after each beat: it rises, never falls and ends on the best rank. */
  beats: readonly number[];
  /** The last promotion comes late: the chest looks done at the colour before it, goes still for a breath, and then cracks to the new one. */
  late?: boolean;
}

/** The patterns of each best rank. Most openings promote steadily; the others hold back, tease or leap. */
export const CLIMBS: Record<ChestRarity, readonly ClimbPattern[]> = {
  common: [
    { id: 'quiet', odds: 70, beats: [0, 0] },
    { id: 'quick', odds: 30, beats: [0] },
  ],
  rare: [
    { id: 'steady', odds: 55, beats: [0, 1] },
    { id: 'early', odds: 25, beats: [1, 1] },
    { id: 'tease', odds: 20, beats: [0, 0, 1] },
  ],
  epic: [
    { id: 'steady', odds: 50, beats: [0, 1, 2] },
    { id: 'late', odds: 25, beats: [0, 1, 2], late: true },
    { id: 'leap', odds: 25, beats: [0, 2, 2] },
  ],
  legendary: [
    { id: 'steady', odds: 50, beats: [0, 1, 2, 3] },
    { id: 'late', odds: 30, beats: [0, 1, 2, 3], late: true },
    { id: 'leap', odds: 20, beats: [0, 2, 3] },
  ],
};

/** A stable number from the stored results of an opening (a replay after an app restart gets the same one). */
export function climbSeed(results: readonly { id: number; seed: number }[]): number {
  let h = 2166136261;
  for (const r of results) {
    h = Math.imul(h ^ (r.id | 0), 16777619);
    h = Math.imul(h ^ (r.seed | 0), 16777619);
  }
  // The last mixing step spreads the low bits, which the pick reads.
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return h >>> 0;
}

/** The pattern of an opening whose best rank is `best`: the odds of the table, read at `seed` (the same seed always gives the same pattern). */
export function pickClimb(best: ChestRarity, seed: number): ClimbPattern {
  const rows = CLIMBS[best];
  let roll = (seed >>> 0) % 100;
  for (const p of rows) {
    if (roll < p.odds) return p;
    roll -= p.odds;
  }
  return rows[rows.length - 1] as ClimbPattern;
}

/** Ranks climbed on each beat of a pattern (0 for a quiet beat), starting from the lowest rank. */
export function climbSteps(pattern: ClimbPattern): number[] {
  let at = 0;
  return pattern.beats.map((rank) => {
    const step = rank - at;
    at = rank;
    return step;
  });
}
