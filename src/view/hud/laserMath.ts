/** The numbers the laser pointer's explanation shows, read from the battle's real data (no value is written twice). Pure. */
import { LASER_VULNERABLE, TRAINING, modifierSpec, relicSpec, trainingBonus } from '@/game';
import type { DailyModifierId, LaserState, RelicId } from '@/game';

export interface LaserFacts {
  /** Seconds the dot stays on, and seconds until it can be used again once it has ended (both with every change applied). */
  duration: number;
  cooldown: number;
  /** Extra damage in percent that an enemy inside the dot's area takes. */
  bonusPercent: number;
  /** What the toy that changes the laser adds, and whether this run has it. */
  toy: { has: boolean; duration: number; cooldownCut: number };
  /** The training "laser charge": its level and the seconds it takes off the cooldown at that level; `perLevel` is what one level takes off. */
  training: { level: number; cooldownCut: number; perLevel: number };
  /** A daily rule that fixes the cooldown (0 = none today). */
  rule: number;
}

/** The toy that lengthens the laser and shortens its recharge. */
export const LASER_TOY: RelicId = 'batteries';
export const LASER_RULE: DailyModifierId = 'long_laser';

export function laserFacts(
  laser: Pick<LaserState, 'duration' | 'cooldownTotal'>,
  relics: ReadonlyArray<RelicId>,
  training: Readonly<Record<string, number>>,
  modifiers: ReadonlyArray<DailyModifierId> | undefined,
): LaserFacts {
  const fx = relicSpec(LASER_TOY).fx;
  const level = Math.max(0, Math.min(TRAINING.laser_cd.maxLevel, Math.floor(training.laser_cd ?? 0)));
  const rule = modifiers?.includes(LASER_RULE) ? (modifierSpec(LASER_RULE).laserCooldown ?? 0) : 0;
  return {
    duration: laser.duration,
    cooldown: laser.cooldownTotal,
    bonusPercent: Math.round(LASER_VULNERABLE * 100),
    toy: { has: relics.includes(LASER_TOY), duration: fx.laserDuration ?? 0, cooldownCut: fx.laserCooldownCut ?? 0 },
    training: { level, cooldownCut: trainingBonus(training).laserCooldownCut, perLevel: TRAINING.laser_cd.perLevel },
    rule,
  };
}

/** Seconds as the card prints them: "5", "14.1" (no trailing zero). */
export function secondsText(s: number): string {
  const r = Math.round(s * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
