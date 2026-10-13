/**
 * The cats' skills (docs/design_skills_v2.md, the data appendix): one row per skill with every number the design names, under the
 * appendix's names. `D` in a comment is the cat's current hit (`stats.damage`).
 *
 * A skill is "built" when its row says so: only then does the cat's definition carry `spSkill` (directive decision 8), the gauge runs
 * and the handler in `sim/sp/registry.ts` is called. A row can be added before its skill exists; flip `built` last.
 *
 * How to add a skill (the agents of steps 1 and 2): fill its row below (the shape is already typed), write its handler under
 * `sim/sp/<name>.ts` (see `sim/sp/types.ts`), put the handler in `sim/sp/registry.ts` and set `built: true` here. The payload of its
 * cast event goes into `SpPayload` in `game/api.ts`.
 */
import type { SpRank, SpSkillId, UnitId } from '../api';

/**
 * The STARTING cooldown of a skill, by the rank of its cat: Alley Boss 18, King 24, Guardian 34 (higher ranks are bigger, not more
 * frequent). The table is a record of where the rows started: the rows below carry their own numbers and nothing in the game reads this.
 */
export const SP_COOLDOWN: Readonly<Record<SpRank, number>> = { 3: 18, 4: 24, 5: 34 };

/** Where a gauge starts (0..1). A merge result and a restored cat start where the attack gauge does (`MERGE_START_CHARGE`); a molt or an awakening keeps the ratio. */
export const SP_START_NEW = 0.5;
export const SP_START_MERGE = 0.5;
export const SP_START_RESTORE = 0.5;

/** A full gauge whose skill has nothing to do re-checks every this many seconds, not every tick. */
export const SP_RECHECK = 0.2;
/** Two rank 5 skills cast at least this many seconds apart; the later cat waits with its gauge full. */
export const SP_RANK5_GAP = 1.2;

/** The cat of each skill (all twelve names are reserved) and its rank. */
export const SP_UNIT_OF: Readonly<Record<SpSkillId, UnitId>> = {
  shove: 'w_viking', cut: 'w_samurai', charge: 'w_tiger', clones: 'r_ninja', wanted: 'r_gunner', lap: 'r_star',
  cloud: 'm_storm', knock: 'm_frost', meteor: 'm_cosmo', jam: 't_bard', fish: 't_alch', capsule: 't_lucky',
};
export const SP_RANK_OF: Readonly<Record<SpSkillId, SpRank>> = {
  shove: 3, cut: 4, charge: 5, clones: 3, wanted: 4, lap: 5, cloud: 3, knock: 4, meteor: 5, jam: 3, fish: 4, capsule: 5,
};

export interface SpRowBase<K extends SpSkillId> {
  id: K;
  unit: UnitId;
  rank: SpRank;
  /**
   * Seconds the gauge takes to fill: this skill's own cell (directive decision 1), nothing is derived from the rank. It STARTS as
   * `SP_COOLDOWN[rank]`; the lead proposes a number per skill after the bots have measured it and the owner settles it. A test holds
   * every row to `0 < cooldown <= 34` (the owner's ceiling: a skill that is too strong at 34 s is turned down by its own numbers).
   */
  cooldown: number;
  nameKey: string;
  /** True once the skill works end to end (handler registered). Only then does the cat carry `spSkill`. */
  built: boolean;
}

/** Shield Shove: pushes everything in the cat's reach back along the road, then a light thump. */
export interface SpShoveRow extends SpRowBase<'shove'> {
  /** px an ordinary enemy slides back along the road. */
  push: number;
  /** Seconds the slide takes. */
  slide: number;
  /** Damage of the thump, in D (no crit). */
  thump: number;
  /** Share of `push` an elite / a boss slides (the black hole's factors). */
  eliteFactor: number;
  bossFactor: number;
  /** Seconds a pushed enemy cannot be pushed again (its own window; the black hole's is separate). */
  window: number;
  /** An enemy that has travelled less than this is not a target (it would pile up on the start of the road). */
  minTravelled: number;
}

/** The Tiger Has Arrived: a run against the flow along the busiest stretch of road. */
export interface SpChargeRow extends SpRowBase<'charge'> {
  /** px of road the run covers, its speed in px/s, and the seconds of the leap before it. */
  dist: number;
  speed: number;
  leap: number;
  /** Damage per enemy passed, in D, once each. */
  power: number;
  /** The stomp goes through armour and ward (the damage cap still applies). */
  ignoreDefence: boolean;
  /** Weight of an ordinary enemy, an elite and a boss when the busiest stretch is chosen. */
  weights: readonly [normal: number, elite: number, boss: number];
  /** The cast waits until the best stretch weighs at least this much. */
  minWeight: number;
}

/** Starlight Lap: one silver arrow once round the road with the flow. */
export interface SpLapRow extends SpRowBase<'lap'> {
  /** px/s, and the px added to one lap so enemies walking ahead are caught too. */
  speed: number;
  extra: number;
  /** Damage per enemy passed, in D, and the most all hits of one cast may add up to (each share shrinks when more are passed). */
  power: number;
  pool: number;
  /** The burst of an enemy that falls: its share of the hit and its radius in px (the passive's, with no second burst). */
  burst: { pct: number; radius: number };
  /** The cast waits for this many enemies on the field (or an elite / boss). */
  minEnemies: number;
}

/** Wanted: One Shot: a share of an elite's or boss's maximum health outside its damage cap, or part of a plain enemy's health. */
export interface SpWantedRow extends SpRowBase<'wanted'> {
  /** Share of maximum health one shot takes from an elite / boss, and the most one target gives in all (shared by every gunner). */
  bite: number;
  pool: number;
  /** The bite is outside the elite / boss damage cap and ignores armour and ward. */
  ignoreCap: boolean;
  ignoreDefence: boolean;
  /** Share of current health taken from the sturdiest plain enemy when no elite or boss is there. */
  small: number;
  /** `nextWaveSpecial`: hold fire (gauge full) in the wave before an elite / boss wave. */
  hold: 'nextWaveSpecial' | 'none';
}

/** The rows of the skills that have one. Step 2 adds the other eight (type here, value below). */
export interface SpRows {
  shove: SpShoveRow;
  charge: SpChargeRow;
  lap: SpLapRow;
  wanted: SpWantedRow;
}

export type SpRow = SpRows[keyof SpRows];

export const SP_ROWS: SpRows = {
  shove: {
    id: 'shove', unit: 'w_viking', rank: 3, cooldown: 18, nameKey: 'sp.shove.name',
    push: 160, slide: 0.35, thump: 0.25, eliteFactor: 0.35, bossFactor: 0.2, window: 3, minTravelled: 30,
    built: true, // shove
  },
  charge: {
    id: 'charge', unit: 'w_tiger', rank: 5, cooldown: 34, nameKey: 'sp.charge.name',
    dist: 1100, speed: 1000, leap: 0.3, power: 1.2, ignoreDefence: true, weights: [1, 2, 3], minWeight: 3,
    built: true, // charge
  },
  lap: {
    id: 'lap', unit: 'r_star', rank: 5, cooldown: 34, nameKey: 'sp.lap.name',
    speed: 2000, extra: 100, power: 0.8, pool: 12.8, burst: { pct: 0.25, radius: 90 }, minEnemies: 4,
    built: true, // lap
  },
  wanted: {
    id: 'wanted', unit: 'r_gunner', rank: 4, cooldown: 24, nameKey: 'sp.wanted.name',
    bite: 0.06, pool: 0.12, ignoreCap: true, ignoreDefence: true, small: 0.2, hold: 'nextWaveSpecial',
    built: true, // wanted
  },
};

const ROWS_BY_ID = SP_ROWS as unknown as Readonly<Partial<Record<SpSkillId, SpRow>>>;

/** The row of a skill, built or not (null for a skill with no row yet). */
export function spRowOf(id: SpSkillId): SpRow | null {
  return ROWS_BY_ID[id] ?? null;
}

const BUILT_BY_UNIT = new Map<UnitId, SpRow>();
for (const row of Object.values(ROWS_BY_ID) as SpRow[]) if (row.built) BUILT_BY_UNIT.set(row.unit, row);

/** The row of the skill of a cat, or null when the cat has none or its skill is not built yet. */
export function spSkillOfUnit(unit: UnitId): SpRow | null {
  return BUILT_BY_UNIT.get(unit) ?? null;
}
