/**
 * The gunner's "holstered" look: its gauge is full, and it is not firing at plain enemies on purpose, because an elite or a boss is coming
 * (docs/design_skills_v2.md 3.5, "the gun is saved"). The ring wears a small holster so the player reads "it is waiting", not "it is stuck".
 *
 * The rule is the simulation's own `holdingFire` (sim/sp/wanted.ts) worked out from what the battle makes public, with nothing added to the
 * simulation: in a plain wave, the wave after it brings an elite or a boss (the next wave's preview lists a wave target); in an elite or boss
 * wave, the target has not come out yet (no living `boss`, and the wave's own clock has not started, which it does when the target comes
 * out); never in the last wave of a run that has an end. `tests/view.field.spRing.test.ts` plays whole runs and holds this to the simulation's
 * answer at every tick.
 */
import { isWaveTarget } from '@/game';
import type { BattleApi, UnitState } from '@/game/api';

/** Whether the wave after `b.wave` has an elite or a boss, worked out once per wave and battle (the preview builds a list). */
const nextSpecial = new WeakMap<object, { wave: number; special: boolean }>();

function nextWaveIsSpecial(b: BattleApi): boolean {
  let c = nextSpecial.get(b);
  if (!c) {
    c = { wave: -1, special: false };
    nextSpecial.set(b, c);
  }
  if (c.wave !== b.wave) {
    c.wave = b.wave;
    const entries = b.previewWave(b.wave + 1);
    c.special = false;
    for (const en of entries) {
      if (isWaveTarget(en.enemy)) {
        c.special = true;
        break;
      }
    }
  }
  return c.special;
}

/** True while the gunners hold their fire. */
export function holdingFire(b: BattleApi): boolean {
  if (b.waveKind !== 'normal') return b.boss === null && b.waveTime <= 0;
  if (b.init.mode !== 'endless' && b.wave >= b.totalWaves) return false;
  return nextWaveIsSpecial(b);
}

/** The gunner's ring rule: a full gauge that is being saved wears the holster. Allocation-free once the wave's answer is cached. */
export function holsterMark(unit: UnitState, battle: BattleApi): 'holstered' | null {
  return unit.sp >= 1 && holdingFire(battle) ? 'holstered' : null;
}
