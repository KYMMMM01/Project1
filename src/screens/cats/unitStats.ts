/** Pure stat maths of the unit screen: what a cat does at a collection level, and the step to the next one. */
import { UNIT_IDS, type UnitId } from '@/game/api';
import { LEVEL_DAMAGE_STEP } from '@/game/data/balance';
import { tilesOf, tilesText } from '@/game/data/lengthText';
import { levelSourceOf } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import { MAX_LEVEL } from '@/meta/data/economy';

export interface StatBlock {
  damage: number;
  interval: number;
  range: number;
  crit: number;
  critMult: number;
}

export type StatKey = keyof StatBlock;

export const STAT_KEYS: readonly StatKey[] = ['damage', 'interval', 'range', 'crit'];

/** Level-based stats of a cat on an empty board: base values, +10% damage per level and the perks unlocked so far. */
export function unitStatsAt(id: UnitId, level: number): StatBlock {
  const spec = unitSpec(id);
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  let damage = 0;
  let speed = 0;
  let range = 0;
  let crit = 0;
  let critMult = 0;
  for (const p of spec.perks) {
    if (lv < p.level) continue;
    if (p.key === 'damage') damage += p.value;
    else if (p.key === 'speed') speed += p.value;
    else if (p.key === 'range') range += p.value;
    else if (p.key === 'crit') crit += p.value;
    else if (p.key === 'critMult') critMult += p.value;
  }
  const b = spec.base;
  return {
    damage: b.damage * (1 + LEVEL_DAMAGE_STEP * (lv - 1)) * (1 + damage),
    interval: b.interval / (1 + speed),
    range: b.range * (1 + range),
    crit: Math.min(1, b.crit + crit),
    critMult: b.critMult + critMult,
  };
}

/** Which way is "better" for a stat: a shorter interval is an improvement, the rest want more. */
export function isImprovement(key: StatKey, delta: number): boolean {
  return key === 'interval' ? delta < 0 : delta > 0;
}

/** The number a stat is shown as: damage keeps one decimal below 10, the interval two, range in tiles with one decimal, crit as whole percent points. */
function shown(key: StatKey, value: number): number {
  switch (key) {
    case 'damage':
      return value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
    case 'interval':
      return Math.round(value * 100) / 100;
    case 'range':
      return tilesOf(value);
    case 'crit':
      return Math.round(value * 100);
    case 'critMult':
      return Math.round(value * 10) / 10;
  }
}

/** Number text for a stat: damage keeps one decimal below 10, the interval two, range in tiles (the unit the skill sentences count in), crit as a percentage. */
export function statText(key: StatKey, value: number): string {
  const v = shown(key, value);
  if (key === 'crit') return v + '%';
  if (key === 'range') return tilesText(value);
  return key === 'critMult' ? 'x' + v : String(v);
}

/**
 * Signed difference text between two values of one stat ("+13", "-0.05", "+3%p"), or '' when nothing changes. It is
 * the difference of the two numbers as they are shown, so "14 -> 15" always reads "+1" and never "+1.4".
 */
export function deltaText(key: StatKey, from: number, to: number): string {
  const d = shown(key, to) - shown(key, from);
  if (d === 0) return '';
  const sign = d > 0 ? '+' : '-';
  const m = Math.abs(d);
  switch (key) {
    case 'crit':
      return sign + m + '%p';
    case 'interval':
      return sign + Math.round(m * 100) / 100;
    case 'damage':
    case 'critMult':
      return sign + Math.round(m * 10) / 10;
    case 'range':
      return sign + Math.round(m * 10) / 10;
  }
}

/** The perk levels (4 / 7 / 10) with whether a cat of `level` has them. */
export function perkRows(id: UnitId, level: number): { level: number; text: string; unlocked: boolean }[] {
  return unitSpec(id).perks.map((p) => ({ level: p.level, text: p.text(), unlocked: level >= p.level }));
}

export function isUnitId(id: string): id is UnitId {
  return (UNIT_IDS as readonly string[]).includes(id);
}

/** The unit whose collection level a cat uses: itself, or the class legendary for a guardian. */
export function levelSource(id: UnitId): UnitId {
  return levelSourceOf(id);
}
