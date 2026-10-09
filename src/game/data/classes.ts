/**
 * Class synergy steps (rules §6). The step is the number of different kinds of the class on the board, counting the
 * ranks from `SYNERGY_MIN_RANK` up: the first rank (the kitten) does not count, so the third step needs all four of the
 * other ranks, the guardian among them. A class's damage bonus reaches that class only; the side effects reach every cat.
 */
import { CLASS_IDS, type ClassDef, type ClassId } from '../api';
import { t } from '@/core/i18n';
import { SYNERGY_TIER_AT } from './balance';
import { tilesText } from './lengthText';
import type { SynergySpecial, SynergyTier } from './types';
import './strings';
import './stringsGame';

function tier(partial: Partial<SynergyTier>): SynergyTier {
  return { damage: 0, armorIgnore: 0, crit: 0, critMult: 0, statusMult: 0, speed: 0, rewardMult: 0, ...partial };
}

const NONE = tier({});

/**
 * The three steps of every class (v1.4, rangers v1.5). Warriors: damage for warriors, armour and ward ignore for everyone. Rangers:
 * damage for rangers at every step (v1.5), crit chance and crit damage for everyone. Mages: damage for mages, status duration for
 * everyone. Tricksters: unchanged (their numbers already reached every cat).
 */
export const SYNERGY: Readonly<Record<ClassId, readonly [SynergyTier, SynergyTier, SynergyTier]>> = {
  warrior: [tier({ damage: 0.12 }), tier({ damage: 0.3, armorIgnore: 0.15 }), tier({ damage: 0.65, armorIgnore: 0.3 })],
  ranger: [
    tier({ damage: 0.08, crit: 0.05 }),
    tier({ damage: 0.2, crit: 0.1, critMult: 0.05 }),
    tier({ damage: 0.45, crit: 0.2, critMult: 0.1 }),
  ],
  mage: [tier({ damage: 0.12 }), tier({ damage: 0.3, statusMult: 0.2 }), tier({ damage: 0.65, statusMult: 0.4 })],
  trickster: [tier({ speed: 0.05 }), tier({ speed: 0.1, rewardMult: 0.12 }), tier({ speed: 0.17, rewardMult: 0.3 })],
};

/** What the third step adds: one ability per class, switched on while the class holds all four kinds. */
export const SYNERGY_SPECIAL = {
  warrior: { kind: 'cry', every: 7, stun: 0.5, breakAmount: 0.3, breakDuration: 3 },
  ranger: { kind: 'ricochet', pct: 0.35, reach: 150 },
  mage: { kind: 'shatter', radius: 70, pct: 0.1 },
  trickster: { kind: 'party', speed: 0.4 },
} as const satisfies Record<ClassId, SynergySpecial>;

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

/** Placeholders of `synergy.<class>.<tier>`: the tier's own numbers, in display units. */
function tierArgs(classId: ClassId, tierNo: 1 | 2 | 3): { a: number; b: number; c: number } {
  const s = synergyTier(classId, tierNo);
  switch (classId) {
    case 'warrior': return { a: pct(s.damage), b: pct(s.armorIgnore), c: 0 };
    case 'ranger': return { a: pct(s.crit), b: pct(s.critMult), c: pct(s.damage) };
    case 'mage': return { a: pct(s.damage), b: 1 + s.statusMult, c: 0 };
    case 'trickster': return { a: pct(s.speed), b: 1 + s.rewardMult, c: 0 };
  }
}

/** Placeholders of `synergy.<class>.special`, from the special's own data. */
function specialArgs(classId: ClassId): Record<string, number | string> {
  const sp = SYNERGY_SPECIAL[classId];
  switch (sp.kind) {
    case 'cry': return { a: sp.every, b: sp.stun, c: pct(sp.breakAmount), d: sp.breakDuration };
    case 'ricochet': return { a: pct(sp.pct) };
    case 'shatter': return { a: tilesText(sp.radius), b: pct(sp.pct) };
    case 'party': return { a: pct(sp.speed) };
  }
}

function build(id: ClassId): ClassDef {
  return {
    id,
    nameKey: `class.${id}.name`,
    roleKey: `class.${id}.role`,
    specialNameKey: `synergy.${id}.special.name`,
    tierText: (n) => t(`synergy.${id}.${n}`, tierArgs(id, n)),
    specialText: () => t(`synergy.${id}.special`, specialArgs(id)),
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
