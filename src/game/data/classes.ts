/** Class synergy tiers (rules §6). The tier is the number of different unit types of the class on the board. */
import { CLASS_IDS, type ClassDef, type ClassId } from '../api';
import { t } from '@/core/i18n';
import { SYNERGY_TIER_AT } from './balance';
import type { SynergyTier } from './types';
import './strings';
import './stringsGame';

function tier(partial: Partial<SynergyTier>): SynergyTier {
  return { damage: 0, armorIgnore: 0, crit: 0, critMult: 0, statusMult: 0, speed: 0, rewardMult: 0, ...partial };
}

const NONE = tier({});

export const SYNERGY: Readonly<Record<ClassId, readonly [SynergyTier, SynergyTier, SynergyTier]>> = {
  warrior: [tier({ damage: 0.15 }), tier({ damage: 0.36, armorIgnore: 0.2 }), tier({ damage: 0.72, armorIgnore: 0.4 })],
  ranger: [tier({ crit: 0.07 }), tier({ crit: 0.15, critMult: 0.3 }), tier({ crit: 0.24, critMult: 0.7 })],
  mage: [tier({ damage: 0.15 }), tier({ damage: 0.36, statusMult: 0.25 }), tier({ damage: 0.72, statusMult: 0.5 })],
  trickster: [tier({ speed: 0.05 }), tier({ speed: 0.1, rewardMult: 0.12 }), tier({ speed: 0.17, rewardMult: 0.3 })],
};

/** Numbers of one tier (all zero for tier 0). */
export function synergyTier(classId: ClassId, tierNo: number): SynergyTier {
  return tierNo < 1 ? NONE : SYNERGY[classId][Math.min(tierNo, 3) - 1] as SynergyTier;
}

/** Tier (0..3) a count of distinct unit types reaches. */
export function tierForDistinct(distinct: number): number {
  let tierNo = 0;
  for (let i = 0; i < SYNERGY_TIER_AT.length; i++) if (distinct >= (SYNERGY_TIER_AT[i] as number)) tierNo = i + 1;
  return tierNo;
}

function pct(v: number): number {
  return Math.round(v * 100);
}

function tierArgs(classId: ClassId, tierNo: 1 | 2 | 3): { a: number; b: number } {
  const s = synergyTier(classId, tierNo);
  switch (classId) {
    case 'warrior': return { a: pct(s.damage), b: pct(s.armorIgnore) };
    case 'ranger': return { a: pct(s.crit), b: s.critMult };
    case 'mage': return { a: pct(s.damage), b: 1 + s.statusMult };
    case 'trickster': return { a: pct(s.speed), b: 1 + s.rewardMult };
  }
}

function build(id: ClassId): ClassDef {
  return {
    id,
    nameKey: `class.${id}.name`,
    roleKey: `class.${id}.role`,
    tierText: (n) => t(`synergy.${id}.${n === 1 ? 1 : 2}`, tierArgs(id, n)),
  };
}

const DEFS = {} as Record<ClassId, ClassDef>;
for (const id of CLASS_IDS) DEFS[id] = build(id);

export function classDef(id: ClassId): ClassDef {
  return DEFS[id];
}

export function allClassDefs(): ClassDef[] {
  return CLASS_IDS.map((id) => DEFS[id]);
}
