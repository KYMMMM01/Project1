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
  // A save made before the skills existed carries no `sp`: it keeps the setting the caller gives it (the app passes `sp: false` for those),
  // so a run that began without skills never gets them half way. A save that has the field keeps its own.
  const own = data.init.sp === undefined && init.sp !== undefined ? { ...data.init, sp: init.sp } : data.init;
  return new Sim(own, data);
}
