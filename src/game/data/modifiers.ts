/** Daily-challenge rule variants (rules §13). Each id may be combined with others in `BattleInit.modifiers`. */
import type { DailyModifierId } from '../api';
import { t } from '@/core/i18n';
import type { ModifierSpec } from './types';
import './stringsGame';

export const MODIFIER_IDS: readonly DailyModifierId[] = [
  'rich', 'swarm', 'giants', 'lucky_day', 'rush', 'glass_cannon', 'no_rangers', 'toy_box', 'sunny_day', 'long_laser',
];

const SPECS: Record<DailyModifierId, ModifierSpec> = {
  rich: { id: 'rich', fishMult: 2, enemyCap: 40, args: { a: 2, b: 40 } },
  swarm: { id: 'swarm', countMult: 1.5, hpMult: 0.65, args: { a: 50, b: 35 } },
  giants: { id: 'giants', countMult: 0.6, hpMult: 1.8, args: { a: 40, b: 80 } },
  lucky_day: { id: 'lucky_day', epicBonus: 0.1, summonCostMult: 1.5, args: { a: 10, b: 50 } },
  rush: { id: 'rush', normalWaveTime: 11, args: { a: 11 } },
  glass_cannon: { id: 'glass_cannon', damageBonus: 0.5, enemyCap: 35, args: { a: 50, b: 35 } },
  no_rangers: { id: 'no_rangers', banClass: 'ranger', args: {} },
  toy_box: { id: 'toy_box', relicPicks: 2, args: { a: 2 } },
  sunny_day: { id: 'sunny_day', sunCells: 10, args: { a: 10 } },
  long_laser: { id: 'long_laser', laserCooldown: 6, args: { a: 6 } },
};

export function modifierSpec(id: DailyModifierId): ModifierSpec {
  return SPECS[id];
}

export function modifierName(id: DailyModifierId): string {
  return t(`modifier.${id}.name`);
}

/** One-line rule text with the real numbers filled in. */
export function modifierText(id: DailyModifierId): string {
  const a = SPECS[id].args;
  return t(`modifier.${id}.desc`, { a: a.a ?? 0, b: a.b ?? 0 });
}
