/**
 * Training ground (gold sinks that give small permanent bonuses). `Loadout.training` maps these ids to
 * levels; the simulation reads them through `trainingBonus`.
 */
import { t } from '@/core/i18n';
import type { TrainingDef } from './types';
import './stringsGame';

export const TRAINING_IDS = ['start_fish', 'kill_fish', 'damage', 'boss_time', 'enemy_cap', 'start_purr', 'laser_cd'] as const;
export type TrainingId = (typeof TRAINING_IDS)[number];

/** Gold cost of level `level` (1-based): 200 x 1.6^(level - 1), rounded; built by repeated multiplication. */
function goldCost(level: number): number {
  let c = 200;
  for (let i = 1; i < level; i++) c *= 1.6;
  return Math.round(c);
}

function def(id: TrainingId, maxLevel: number, perLevel: number, shown: (level: number) => number): TrainingDef {
  return {
    id,
    nameKey: `training.${id}.name`,
    descKey: `training.${id}.desc`,
    maxLevel,
    perLevel,
    effectText: (level) => t(`training.${id}.effect`, { a: shown(level) }),
    cost: goldCost,
  };
}

export const TRAINING: Readonly<Record<TrainingId, TrainingDef>> = {
  start_fish: def('start_fish', 10, 5, (l) => l * 5),
  kill_fish: def('kill_fish', 10, 0.02, (l) => l * 2),
  damage: def('damage', 10, 0.02, (l) => l * 2),
  boss_time: def('boss_time', 10, 1, (l) => l),
  enemy_cap: def('enemy_cap', 10, 1, (l) => l),
  start_purr: def('start_purr', 9, 1, (l) => Math.floor(l / 3)),
  laser_cd: def('laser_cd', 10, 0.3, (l) => Math.round(l * 3) / 10),
};

export interface TrainingBonus {
  startFish: number;
  killFish: number;
  damage: number;
  bossTime: number;
  enemyCap: number;
  startPurr: number;
  laserCooldownCut: number;
}

function level(training: Readonly<Record<string, number>>, id: TrainingId): number {
  const v = training[id] ?? 0;
  const max = TRAINING[id].maxLevel;
  return v < 0 ? 0 : v > max ? max : Math.floor(v);
}

export function trainingBonus(training: Readonly<Record<string, number>>): TrainingBonus {
  return {
    startFish: level(training, 'start_fish') * TRAINING.start_fish.perLevel,
    killFish: level(training, 'kill_fish') * TRAINING.kill_fish.perLevel,
    damage: level(training, 'damage') * TRAINING.damage.perLevel,
    bossTime: level(training, 'boss_time') * TRAINING.boss_time.perLevel,
    enemyCap: level(training, 'enemy_cap') * TRAINING.enemy_cap.perLevel,
    startPurr: Math.floor(level(training, 'start_purr') / 3),
    laserCooldownCut: level(training, 'laser_cd') * TRAINING.laser_cd.perLevel,
  };
}

export function trainingDef(id: TrainingId): TrainingDef {
  return TRAINING[id];
}
