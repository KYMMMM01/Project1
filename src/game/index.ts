/**
 * Public barrel of the battle game logic: the simulation entry point, the static data accessors the
 * UI needs, and the constants a HUD might show. The contract types live in ./api and ./geometry.
 */
import './data/strings';
import './data/stringsGame';

export * from './api';
export { createBattle } from './sim/create';
export { SIM_VERSION } from './sim/snapshot';

export * from './data/roster';
export {
  SPECIAL_CELLS, allSpecialCells, cellShown, specialCellName, specialCellOf, specialCellSpec, specialCellText,
  type SpecialCellSpec, type SpecialCellStat,
} from './data/cells';
export { TILE_PX, tilesOf, tilesText } from './data/lengthText';
export { unitDef, unitSpec, allUnitDefs, auraScale } from './data/units';
export { enemyDef, enemySpec, allEnemyDefs, bossSpec, BOSS_SPECS, budgetMult, isWaveTarget } from './data/enemies';
export { relicDef, relicSpec, allRelicDefs, COUNTER_RELICS } from './data/relics';
export { classDef, allClassDefs, synergyTier, tierForDistinct, SYNERGY, SYNERGY_SPECIAL } from './data/classes';
export { chapterWaves, scriptFor, waveEntries, entriesBudget, waveKindOf, actOf, actFeatures } from './data/waves';
export { stakeControlText, stakeRules, stakeText, STAKE_STEPS } from './data/stakes';
export { MODIFIER_IDS, modifierSpec, modifierName, modifierText } from './data/modifiers';
export { TRAINING, TRAINING_IDS, trainingBonus, trainingDef } from './data/training';
export * from './data/balance';
export type * from './data/types';
