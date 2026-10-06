/**
 * Every tunable constant of the battle simulation, with its unit. Rules: docs/명세_전투규칙.md.
 * Nothing here is computed with Math.pow: tables that grow geometrically are filled by repeated
 * multiplication so every platform produces the same numbers.
 */

// ── time ──
export const TICK = 1 / 60;
export const MAX_TICKS_PER_STEP = 10;
export const PREP_TIME = 3;
export const NORMAL_WAVE_TIME = 15;
export const TUTORIAL_WAVE_TIME = 12;
export const SPAWN_START = 0.6;
export const SPAWN_WINDOW = 9;
export const BOSS_APPEAR = 1.0;
export const ESCORT_WINDOW = 10;
export const ELITE_LIMITS: readonly number[] = [40, 45, 50];
export const BOSS_LIMITS: readonly number[] = [50, 55, 60];
export const CLEAR_DELAY = 1.2;
export const NEXT_WAVE_DELAY = 1.0;
export const ENRAGE_HP_FRACTION = 0.5;
export const ENRAGE_COOLDOWN_MULT = 0.7;
/**
 * An elite or boss cannot be melted: it takes at most `maxHealth / (BOSS_MIN_KILL x limit)` damage per
 * second (with a short burst allowance), so even the strongest board needs this fraction of the limit.
 */
export const BOSS_MIN_KILL = 0.45;
export const BOSS_CAP_BURST = 1.5;

// ── field limits ──
export const ENEMY_CAP = 60;
export const OVERFLOW_GRACE = 2.0;
export const REVIVE_GRACE = 4.0;
export const REVIVE_CAP_FRACTION = 0.4;
export const REVIVE_BOSS_HP_CUT = 0.35;
export const REVIVE_BOSS_TIME = 20;
export const DANGER_CAUTION = 2 / 3;
export const DANGER_ALARM = 5 / 6;

// ── economy ──
export const START_FISH = 100;
export const WAVE_FISH_BASE = 6;
export const WAVE_FISH_PER_WAVE = 1.5;
export const CALL_FISH_PER_SECOND = 1.5;
export const CALL_FISH_MAX = 15;
export const ACT_PURR = 2;
export const ACT_FISH_BASE = 20;
export const ACT_FISH_PER_ACT = 10;
export const BOSS_FISH = 60;
export const BOSS_PURR = 2;
export const ELITE_FISH = 25;
export const ELITE_PURR = 1;

// ── summoning ──
export const SUMMON_BASE = 12;
export const SUMMON_STEP = 6;
export const SUMMON_CAP = 80;
export const OFFER_EVERY = 6;
export const OFFER_OPTIONS = 3;
export const OFFER_REROLLS = 8;
/** Free toy rerolls per run. */
export const FREE_REROLLS = 1;
/** Cost to reach grade 1..5. */
export const SUMMON_GRADE_COSTS: readonly number[] = [60, 90, 130, 180, 240];
/** Rarity odds per summon grade: [common, rare, epic, legendary], percent. */
export const SUMMON_ODDS: readonly (readonly [number, number, number, number])[] = [
  [70, 25, 5, 0],
  [64, 28, 7.4, 0.6],
  [58, 31, 9.8, 1.2],
  [52, 34, 12.2, 1.8],
  [46, 37, 14.6, 2.4],
  [40, 40, 17, 3],
];
/** Soft pity: after this many summons without epic-or-better, epic odds start to climb. */
export const PITY_LIMIT = 12;
export const PITY_STEP = 0.03;
export const PITY_MAX = 0.35;
/** Luck score of a summon result by rarity index (common..legendary). */
export const LUCK_SCORE: readonly number[] = [0, 1, 3, 8];

/** Relic offer rarity weights [common, rare, epic, legendary] for the acts 1-2, 3-4 and 5+ (rules §13). */
export const RELIC_RARITY_WEIGHTS: readonly (readonly number[])[] = [
  [70, 30, 0, 0],
  [0, 60, 40, 0],
  [0, 0, 60, 40],
];

// ── board ──
export const SELL_FISH: readonly number[] = [20, 40, 80, 160, 320];
export const SELL_PURR: readonly number[] = [0, 0, 1, 1, 3];
export const MOLT_COST = 1;
export const MOLT_LIMIT = 6;
export const AWAKEN_COST = 12;
export const AWAKEN_MIN_TIER = 2;
export const MERGE_START_CHARGE = 0.5;
export const LEVEL_DAMAGE_STEP = 0.1;
export const CLASS_UPGRADE_COSTS: readonly number[] = [60, 100, 160, 240, 340];
export const CLASS_UPGRADE_BONUS = 0.15;
export const HAZARD_RECOVER = 0.3;
export const HAZARD_WARNING = 0.8;
export const SUN_CELLS = 4;
export const SUN_SPEED = 0.2;
export const FIRST_SUN_CELLS: readonly number[] = [6, 7, 12, 13];
export const SYNERGY_TIER_AT: readonly number[] = [2, 3, 4];

// ── laser pointer ──
export const LASER_DURATION = 5;
export const LASER_COOLDOWN = 15;
export const LASER_RADIUS = 130;
export const LASER_VULNERABLE = 0.15;

// ── combat ──
export const VULNERABLE_CAP = 2.0;
export const SLOW_CAP = 0.5;
export const SLOW_CAP_BOSS = 0.25;
export const HASTE_CAP = 0.6;
export const CC_IMMUNE_AFTER = 3;
export const ELITE_CC_FACTOR = 0.5;
export const DOT_TICK = 0.5;
export const PROJECTILE_RETARGET = 80;
export const MAX_ENEMY_SPEED = 210;
export const AURA_TICK = 0.1;

// ── chapters and modes ──
export const CHAPTER_COUNT = 5;
export const ACT_LENGTH = 4;
export const CHAPTER_ACTS = 6;
export const CHAPTER_WAVES = CHAPTER_ACTS * ACT_LENGTH;
export const TUTORIAL_WAVES = 8;
export const DAILY_WAVES = 16;
export const ENDLESS_GROWTH = 1.14;
/**
 * Chapters 1..5. Tuned so the recommended unit level clears each chapter at the same rate: the unit
 * levels (+10% damage per level) carry most of the growth, the chapters add rules instead.
 * Rules v1.2 scaled every value by about 1.05: merges keep their class, so a planned ladder is stronger.
 */
export const CHAPTER_HP_MULT: readonly number[] = [1.05, 1.13, 1.21, 1.44, 1.47];
/** Unit level each chapter is balanced for (chapter 5 is balanced for 5..6; 6 is used). */
export const RECOMMENDED_LEVEL: readonly number[] = [1, 2, 3, 4, 6];
export const TUTORIAL_HP_MULT = 0.7;
export const DAILY_UNIT_LEVEL = 5;

// ── wave composition ──
/** A normal wave holds this many cucumbers' worth of health. */
export const WAVE_BUDGET = 24;
export const ESCORT_BUDGET_ELITE = 8;
export const ESCORT_BUDGET_BOSS = 10;

/**
 * Base health of one cucumber, wave 1..24 (index 0 unused). The table, not a formula, so each wave can
 * be fitted to the reference bot's measured firepower.
 */
export const HP_INDEX: readonly number[] = [
  0,
  59.0, 69.0, 80.8, 94.5, 111, 129,
  151, 177, 207, 242, 284, 332,
  388, 454, 531, 622, 728, 851,
  996, 1165, 1363, 1595, 1866, 2183,
];

/** Elite health at waves 4, 12, 20 (index 0..2) and boss health at 8, 16, 24. */
export const ELITE_HP: readonly number[] = [1055, 3848, 10080];
export const BOSS_HP: readonly number[] = [1590, 4064, 14405];

/** Cucumber health at `wave`; past wave 24 it keeps growing by ENDLESS_GROWTH per wave. */
export function hpIndex(wave: number): number {
  if (wave <= HP_INDEX.length - 1) return HP_INDEX[wave < 1 ? 1 : wave] as number;
  let v = HP_INDEX[HP_INDEX.length - 1] as number;
  for (let w = HP_INDEX.length - 1; w < wave; w++) v *= ENDLESS_GROWTH;
  return v;
}

/** Health of the n-th (0-based) elite or boss of a run; later ones are 8 waves apart and grow with the wave health. */
export function specialHp(kind: 'elite' | 'boss', ordinal: number): number {
  const table = kind === 'elite' ? ELITE_HP : BOSS_HP;
  if (ordinal < table.length) return table[ordinal] as number;
  let v = table[table.length - 1] as number;
  for (let i = table.length - 1; i < ordinal; i++) for (let k = 0; k < 8; k++) v *= ENDLESS_GROWTH;
  return v;
}

/** Time limit of the n-th (0-based) elite or boss; endless waves stay at the last value. */
export function specialLimit(kind: 'elite' | 'boss', ordinal: number): number {
  const table = kind === 'elite' ? ELITE_LIMITS : BOSS_LIMITS;
  return table[Math.min(ordinal, table.length - 1)] as number;
}
