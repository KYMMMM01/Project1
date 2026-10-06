/** Wave-start save and restore (rules §14). Restoring itself happens in the Sim constructor. */
import type { BattleInit, BattleSnapshot, RelicId, UnitId } from '../api';
import { CELL_COUNT } from '../geometry';
import type { Sim } from './sim';

/** Bump when the rules change in a way that makes an old save meaningless. */
export const SIM_VERSION = 1;

export interface SnapData {
  init: BattleInit;
  /** The wave that was about to start. */
  wave: number;
  time: number;
  fish: number;
  fishFrac: number;
  purr: number;
  units: (UnitId | 0)[];
  relics: RelicId[];
  classLevels: number[];
  summonGrade: number;
  paidSummons: number;
  epicDry: number;
  molts: number;
  revived: boolean;
  rescueUsed: boolean;
  freeRerolls: number;
  paidRerollUsed: boolean;
  tutorialFree: number;
  tutorialOffer: boolean;
  sun: number[];
  rng: number[];
  stats: {
    kills: number;
    bossesKilled: number;
    summoned: number;
    merges: number;
    awakenings: number;
    wavesCleared: number;
    peak: number;
    bestRarity: number;
    damage: number[];
    luck: { score: number; mean: number; variance: number };
  };
}

export function captureSnapshot(s: Sim, wave: number): BattleSnapshot {
  const data: SnapData = {
    init: s.init,
    wave,
    time: s.time,
    fish: s.fish,
    fishFrac: s.fishFrac,
    purr: s.purr,
    units: s.units.map((u) => (u ? u.id : 0)),
    relics: s.relics.slice(),
    classLevels: s.classLevels.slice(),
    summonGrade: s.grade,
    paidSummons: s.paidSummons,
    epicDry: s.epicDry,
    molts: s.molts,
    revived: s.revived,
    rescueUsed: s.rescueUsed,
    freeRerolls: s.freeRerolls,
    paidRerollUsed: s.paidRerollUsed,
    tutorialFree: s.tutorialFree,
    tutorialOffer: s.tutorialOffer,
    sun: s.sunbeams.slice(),
    rng: s.rng.states(),
    stats: {
      kills: s.kills,
      bossesKilled: s.bossesKilled,
      summoned: s.summonedUnits,
      merges: s.merges,
      awakenings: s.awakenings,
      wavesCleared: s.wavesCleared,
      peak: s.peakEnemies,
      bestRarity: s.bestRarity,
      damage: Array.from(s.damageByUnit),
      luck: { score: s.luck.score, mean: s.luck.mean, variance: s.luck.variance },
    },
  };
  return { simVersion: SIM_VERSION, wave, data: JSON.stringify(data) };
}

/** Parses and sanity-checks a save. Returns null for another version or a malformed payload. */
export function parseSnapshot(snap: BattleSnapshot): SnapData | null {
  if (snap.simVersion !== SIM_VERSION) return null;
  try {
    const d = JSON.parse(snap.data) as SnapData;
    if (!d || typeof d !== 'object' || !d.init || d.wave !== snap.wave) return null;
    if (!Array.isArray(d.units) || d.units.length !== CELL_COUNT || !Array.isArray(d.rng) || d.rng.length !== 7) return null;
    if (d.init.mode === 'daily') return null;
    return d;
  } catch {
    return null;
  }
}
