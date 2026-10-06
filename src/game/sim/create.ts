import type { BattleApi, BattleInit, BattleSnapshot } from '../api';
import { Sim } from './sim';
import { parseSnapshot } from './snapshot';

/**
 * Starts a battle. With a wave-start `snapshot` it resumes that run (the field is emptied and the wave
 * restarts after the usual preparation time); a snapshot of another version, of another run or a
 * damaged one gives `null`.
 */
export function createBattle(init: BattleInit): BattleApi;
export function createBattle(init: BattleInit, snapshot: BattleSnapshot): BattleApi | null;
export function createBattle(init: BattleInit, snapshot?: BattleSnapshot): BattleApi | null {
  if (!snapshot) return new Sim(init, null);
  const data = parseSnapshot(snapshot);
  if (!data || data.init.seed !== init.seed || data.init.mode !== init.mode || data.init.chapter !== init.chapter) return null;
  return new Sim(data.init, data);
}
