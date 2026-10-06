/**
 * Unit levels, the training ground, account levels and the Loadout handed to a battle. Pure.
 */
import { RELIC_IDS, type Loadout, type UnitId } from '@/game/api';
import {
  ACCOUNT_LEVEL_CAP,
  CARD_BASE,
  CARD_RARITY_FACTOR,
  GOLD_BASE,
  GOLD_RARITY_FACTOR,
  MAX_LEVEL,
  START_PURR_LEVELS,
  TRAINING_COST_BASE,
  TRAINING_COST_GROWTH,
  TRAINING_DEFS,
  TRAINING_MAX,
} from './data/economy';
import { DAILY_UNIT_LEVEL } from './data/schedule';
import { BASE_UNITS, CHEST_RARITIES, TRAINING_IDS, type BaseUnitId, type ChestRarity, type TrainingId } from './types';

/** The four units of each rarity, one per class (warrior, ranger, mage, trickster). */
export const UNITS_BY_RARITY: Readonly<Record<ChestRarity, readonly BaseUnitId[]>> = {
  common: ['w_paw', 'r_sling', 'm_snow', 't_bell'],
  rare: ['w_sword', 'r_archer', 'm_fire', 't_chef'],
  epic: ['w_viking', 'r_ninja', 'm_storm', 't_bard'],
  legendary: ['w_samurai', 'r_gunner', 'm_frost', 't_alch'],
};

export const RARITY_OF: Readonly<Record<BaseUnitId, ChestRarity>> = (() => {
  const out = {} as Record<BaseUnitId, ChestRarity>;
  for (const r of CHEST_RARITIES) for (const u of UNITS_BY_RARITY[r]) out[u] = r;
  return out;
})();

// ───────────────────────────── level costs ─────────────────────────────

/** Cards needed to go from `toLevel - 1` to `toLevel` (2..10). */
export function cardsToLevel(rarity: ChestRarity, toLevel: number): number {
  const base = CARD_BASE[toLevel - 2];
  return base === undefined ? 0 : Math.ceil(base * CARD_RARITY_FACTOR[rarity] - 1e-9);
}

export function goldToLevel(rarity: ChestRarity, toLevel: number): number {
  const base = GOLD_BASE[toLevel - 2];
  return base === undefined ? 0 : Math.round(base * GOLD_RARITY_FACTOR[rarity]);
}

/** Total cards / gold to climb from level 1 to `level`. */
export function totalCardsTo(rarity: ChestRarity, level: number): number {
  let n = 0;
  for (let l = 2; l <= level; l++) n += cardsToLevel(rarity, l);
  return n;
}

export function totalGoldTo(rarity: ChestRarity, level: number): number {
  let n = 0;
  for (let l = 2; l <= level; l++) n += goldToLevel(rarity, l);
  return n;
}

export interface LevelQuote {
  unit: BaseUnitId;
  level: number;
  maxed: boolean;
  /** Cost of the next level. */
  cards: number;
  gold: number;
  /** How the cards would be paid: the unit's own cards first, wild cards for the rest. */
  ownUsed: number;
  wildUsed: number;
  enoughCards: boolean;
  enoughGold: boolean;
}

export function quoteLevelUp(unit: BaseUnitId, level: number, own: number, wild: number, gold: number): LevelQuote {
  const rarity = RARITY_OF[unit];
  const maxed = level >= MAX_LEVEL;
  const cards = maxed ? 0 : cardsToLevel(rarity, level + 1);
  const goldCost = maxed ? 0 : goldToLevel(rarity, level + 1);
  const ownUsed = Math.min(own, cards);
  const wildUsed = cards - ownUsed;
  return {
    unit, level, maxed, cards, gold: goldCost, ownUsed, wildUsed,
    enoughCards: !maxed && wildUsed <= wild,
    enoughGold: !maxed && gold >= goldCost,
  };
}

// ───────────────────────────── account level ─────────────────────────────

/** XP needed to go from `level` to `level + 1`. */
export function xpForNext(level: number): number {
  return 80 + 40 * level;
}

export interface AccountProgress {
  level: number;
  /** XP into the current level and the size of the level. */
  into: number;
  need: number;
}

export function accountProgress(xp: number): AccountProgress {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (level < ACCOUNT_LEVEL_CAP && left >= xpForNext(level)) {
    left -= xpForNext(level);
    level++;
  }
  return { level, into: left, need: xpForNext(level) };
}

// ───────────────────────────── training ─────────────────────────────

/** Gold to buy training level `toLevel` (1..10). */
export function trainCost(toLevel: number): number {
  return Math.round(TRAINING_COST_BASE * Math.pow(TRAINING_COST_GROWTH, toLevel - 1));
}

export interface TrainingEffects {
  startFish: number;
  killFishPct: number;
  damagePct: number;
  bossTimeSec: number;
  /** Seconds taken off the laser pointer's cooldown. */
  laserCdSec: number;
  startPurr: number;
}

export function trainingEffects(levels: Readonly<Record<TrainingId, number>>): TrainingEffects {
  const perLevel = (id: TrainingId): number => (TRAINING_DEFS.find((d) => d.id === id)?.perLevel ?? 0) * (levels[id] ?? 0);
  const purrLevel = levels.start_purr ?? 0;
  return {
    startFish: perLevel('start_fish'),
    killFishPct: perLevel('kill_fish'),
    damagePct: perLevel('damage'),
    bossTimeSec: perLevel('boss_time'),
    laserCdSec: Math.round(perLevel('laser_cd') * 10) / 10,
    startPurr: START_PURR_LEVELS.filter((l) => purrLevel >= l).length,
  };
}

export function totalTrainingCost(): number {
  let n = 0;
  for (let l = 1; l <= TRAINING_MAX; l++) n += trainCost(l);
  return n * TRAINING_IDS.length;
}

// ───────────────────────────── loadout ─────────────────────────────

/**
 * What a battle receives. The daily challenge fixes every unit at the same level and turns the
 * training ground off so everyone plays the same game.
 */
export function buildLoadout(
  levels: Readonly<Record<BaseUnitId, number>>,
  training: Readonly<Record<TrainingId, number>>,
  daily: boolean,
): Loadout {
  const unitLevels: Partial<Record<UnitId, number>> = {};
  for (const u of BASE_UNITS) unitLevels[u] = daily ? DAILY_UNIT_LEVEL : (levels[u] ?? 1);
  const trained: Record<string, number> = {};
  if (!daily) for (const id of TRAINING_IDS) trained[id] = training[id] ?? 0;
  return { unitLevels, training: trained, relicPool: [...RELIC_IDS] };
}
