import { SUN_SPEED, relicSpec } from '@/game';
import type { RelicId } from '@/game/api';

/** The attack-speed bonus (percent) of a cat on a sunbeam cell with these toys: the base, plus what each toy adds (`sunny_spot`). */
export function sunBonusPercent(relics: ReadonlyArray<RelicId>): number {
  let speed = SUN_SPEED;
  for (const id of relics) speed += relicSpec(id).fx.sunSpeed ?? 0;
  return Math.round(speed * 100);
}
