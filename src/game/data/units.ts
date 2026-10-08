/**
 * The 20 cats: level-1 stats, attack descriptors, auras and level perks (rules §7.1). Every
 * sentence a player reads about a cat is built from these numbers through i18n.
 */
import { UNIT_IDS, type DamageType, type UnitDef, type UnitId } from '../api';
import { t } from '@/core/i18n';
import { unitClass, unitRarity } from './roster';
import type { AttackSpec, PerkKey, PerkSpec, UnitAura, UnitSpec } from './types';
import './strings';
import './stringsGame';

type Row = [damage: number, interval: number, range: number, crit: number, critMult: number];

/** Perk values are fractions for these keys, plain numbers for the rest. */
const PERCENT_KEYS: ReadonlySet<PerkKey> = new Set<PerkKey>(['range', 'damage', 'speed', 'crit', 'radius', 'effect', 'aura']);

function perk(level: 4 | 7 | 10, key: PerkKey, value: number): PerkSpec {
  const shown = PERCENT_KEYS.has(key) ? Math.round(value * 100) : value;
  return { level, key, value, text: () => t(`perk.${key}`, { a: shown }) };
}

interface Def {
  type: DamageType;
  row: Row;
  proj: number;
  attack: AttackSpec;
  aura?: UnitAura;
  perks: [PerkSpec, PerkSpec, PerkSpec];
  args?: Record<string, number>;
}

function pct(v: number): number {
  return Math.round(v * 100);
}

const DEFS: Record<UnitId, Def> = {
  w_paw: {
    type: 'physical', row: [7.5, 0.55, 200, 0.05, 2], proj: 0,
    attack: { shape: 'single' },
    perks: [perk(4, 'speed', 0.1), perk(7, 'crit', 0.05), perk(10, 'damage', 0.15)],
  },
  w_sword: {
    type: 'physical', row: [16, 0.9, 215, 0.05, 2], proj: 0,
    attack: { shape: 'cleave', radius: 85, targets: 4 },
    perks: [perk(4, 'range', 0.1), perk(7, 'targets', 1), perk(10, 'radius', 0.2)],
    args: { a: 85, b: 4 },
  },
  w_viking: {
    type: 'physical', row: [135, 1.5, 235, 0.1, 2], proj: 0,
    attack: { shape: 'cleave', radius: 75, targets: 2, effect: { kind: 'armor_break', amount: 0.5, duration: 4 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'targets', 1), perk(10, 'duration', 2)],
    args: { a: pct(0.5), b: 4, c: 75, d: 2 },
  },
  w_samurai: {
    type: 'physical', row: [140, 1.4, 255, 0.15, 2], proj: 0,
    attack: { shape: 'line', reach: 130, effect: { kind: 'bleed', amount: 0.25, duration: 3 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'reach', 30), perk(10, 'effect', 0.15)],
    args: { a: 130, b: 3, c: pct(0.25) },
  },
  w_tiger: {
    type: 'physical', row: [220, 1.1, 285, 0.2, 2], proj: 0,
    attack: { shape: 'blast', radius: 120, stomp: { every: 4, stun: 1, breakAmount: 0.5, breakDuration: 4 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'radius', 0.2), perk(10, 'duration', 0.5)],
    args: { a: 120, b: 4, c: 1, d: pct(0.5) },
  },
  r_sling: {
    type: 'physical', row: [12, 1.1, 420, 0.05, 2], proj: 900,
    attack: { shape: 'single' },
    perks: [perk(4, 'range', 0.1), perk(7, 'crit', 0.08), perk(10, 'damage', 0.25)],
  },
  r_archer: {
    type: 'physical', row: [19, 0.65, 460, 0.15, 2], proj: 1000,
    attack: { shape: 'single' },
    perks: [perk(4, 'range', 0.1), perk(7, 'speed', 0.12), perk(10, 'crit', 0.1)],
    args: { a: pct(0.15), b: 2 },
  },
  r_ninja: {
    type: 'physical', row: [30, 0.8, 440, 0.25, 2], proj: 1000,
    attack: { shape: 'multi', targets: 3 },
    perks: [perk(4, 'range', 0.1), perk(7, 'targets', 1), perk(10, 'crit', 0.1)],
    args: { a: 3 },
  },
  r_gunner: {
    type: 'physical', row: [420, 2.0, 620, 0.3, 3], proj: 1400,
    attack: { shape: 'single', priority: 'max_hp' },
    perks: [perk(4, 'range', 0.1), perk(7, 'crit', 0.1), perk(10, 'critMult', 0.5)],
    args: { a: 3 },
  },
  r_star: {
    type: 'physical', row: [250, 0.8, 620, 0.3, 2.5], proj: 1200,
    attack: { shape: 'pierce', targets: 2, width: 40, blastRadius: 90, blastPct: 0.5 },
    perks: [perk(4, 'range', 0.1), perk(7, 'targets', 1), perk(10, 'radius', 0.25)],
    args: { a: 2, b: 90, c: pct(0.5) },
  },
  m_snow: {
    type: 'magic', row: [8, 1.2, 290, 0, 2], proj: 700,
    attack: { shape: 'splash', radius: 55, effect: { kind: 'slow', amount: 0.2, duration: 1.5 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'effect', 0.1), perk(10, 'radius', 0.2)],
    args: { a: 55, b: pct(0.2), c: 1.5 },
  },
  m_fire: {
    type: 'magic', row: [20, 1.3, 300, 0, 2], proj: 700,
    attack: { shape: 'splash', radius: 65, effect: { kind: 'burn', amount: 0.3, duration: 3 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'duration', 1), perk(10, 'radius', 0.2)],
    args: { a: 65, b: 3, c: pct(0.3) },
  },
  m_storm: {
    type: 'magic', row: [50, 1.1, 320, 0, 2], proj: 0,
    attack: { shape: 'chain', targets: 4, reach: 130, falloff: 0.8 },
    perks: [perk(4, 'range', 0.1), perk(7, 'targets', 1), perk(10, 'reach', 30)],
    args: { a: 4, b: pct(0.8), c: 130 },
  },
  m_frost: {
    type: 'magic', row: [50, 1.6, 340, 0, 2], proj: 0,
    attack: { shape: 'frost', radius: 95, duration: 3, tick: 0.5, tickPct: 0.4, slow: 0.4, freezeChance: 0.08, freezeTime: 0.8 },
    perks: [perk(4, 'range', 0.1), perk(7, 'radius', 0.15), perk(10, 'duration', 1)],
    args: { a: 95, b: 3, c: pct(0.4), d: pct(0.08) },
  },
  m_cosmo: {
    type: 'magic', row: [200, 2.6, 380, 0, 2], proj: 0,
    attack: { shape: 'void', radius: 120, duration: 1.2, pull: 90 },
    perks: [perk(4, 'range', 0.08), perk(7, 'radius', 0.15), perk(10, 'damage', 0.2)],
    args: { a: 120, b: 1.2 },
  },
  t_bell: {
    type: 'magic', row: [8, 1.0, 260, 0, 2], proj: 800,
    attack: { shape: 'single' },
    aura: { shieldNeighbours: true, neighbourSpeed: 0.08 },
    perks: [perk(4, 'range', 0.1), perk(7, 'aura', 0.5), perk(10, 'speed', 0.2)],
    args: { a: pct(0.08) },
  },
  t_chef: {
    type: 'magic', row: [20, 1.0, 300, 0, 2], proj: 800,
    attack: { shape: 'single' },
    aura: { chef: { cap: 12 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'damage', 0.3), perk(10, 'aura', 0.5)],
    args: { a: 12 },
  },
  t_bard: {
    type: 'magic', row: [42, 1.2, 320, 0, 2], proj: 800,
    attack: { shape: 'single' },
    aura: { neighbourDamage: 0.2 },
    perks: [perk(4, 'range', 0.1), perk(7, 'aura', 0.25), perk(10, 'aura', 0.25)],
    args: { a: pct(0.2) },
  },
  t_alch: {
    type: 'magic', row: [90, 1.8, 340, 0, 2], proj: 0,
    attack: { shape: 'brew', radius: 80, duration: 4, vulnerable: 0.25, poisonPct: 0.2 },
    perks: [perk(4, 'range', 0.1), perk(7, 'radius', 0.15), perk(10, 'duration', 1)],
    args: { a: 80, b: 4, c: pct(0.25), d: pct(0.2) },
  },
  t_lucky: {
    type: 'magic', row: [200, 1.5, 400, 0, 2], proj: 900,
    attack: { shape: 'single' },
    aura: { boardSpeed: 0.2, coinRain: { every: 12, pct: 1, slow: 0.3, slowDuration: 1.5 } },
    perks: [perk(4, 'range', 0.1), perk(7, 'aura', 0.25), perk(10, 'aura', 0.25)],
    args: { a: pct(0.2), b: 12 },
  },
};

function build(id: UnitId): UnitSpec {
  const d = DEFS[id];
  const [damage, interval, range, crit, critMult] = d.row;
  return {
    id,
    classId: unitClass(id),
    rarity: unitRarity(id),
    damageType: d.type,
    nameKey: `unit.${id}.name`,
    descKey: `unit.${id}.desc`,
    skillText: () => t(`unit.${id}.skill`, d.args ?? {}),
    base: { damage, interval, range, crit, critMult },
    projectileSpeed: d.proj,
    attack: d.attack,
    aura: d.aura ?? {},
    perks: d.perks,
    skillArgs: d.args ?? {},
  };
}

const SPECS = {} as Record<UnitId, UnitSpec>;
for (const id of UNIT_IDS) SPECS[id] = build(id);
export function unitDef(id: UnitId): UnitDef {
  return SPECS[id];
}

export function unitSpec(id: UnitId): UnitSpec {
  return SPECS[id];
}

export function allUnitDefs(): UnitDef[] {
  return UNIT_IDS.map((id) => SPECS[id]);
}
