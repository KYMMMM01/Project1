/** Internal shapes of the live simulation objects. The public ones (api.ts) are what the renderer sees. */
import type { EnemyState, HazardKind, HazardState, UnitId, UnitState } from '../api';
import type { AttackSpec, EnemySpec, UnitSpec } from '../data/types';

export interface PerkTotals {
  range: number;
  damage: number;
  speed: number;
  crit: number;
  critMult: number;
  radius: number;
  targets: number;
  duration: number;
  effect: number;
  reach: number;
  aura: number;
}

export interface SimUnit extends UnitState {
  spec: UnitSpec;
  /** Index in UNIT_IDS (for per-unit totals). */
  unitIndex: number;
  classIndex: number;
  rarityIndex: number;
  /** Time until which the unit is still dazed after leaving a hazard cell. */
  recoverAt: number;
  /** Earliest time worth scanning for targets again (a failed scan proves nothing is close). */
  searchAfter: number;
  attackCount: number;
  /** Next coin rain (lucky cat), 0 for cats without one. */
  coinAt: number;
  perk: PerkTotals;
  /** Fraction of armour the unit ignores (warrior synergy, every cat). */
  armorIgnore: number;
  /** Multiplier on the status durations the unit inflicts (mage synergy, every cat). */
  statusMult: number;
  /** Rolls made for the rangers' sure crit, and the interval in force (0 while their third synergy step is off). */
  shots: number;
  sureCritEvery: number;
  /** True once merged away, sold, molted or awakened. */
  removed: boolean;
}

/** Bit flags of `SimEnemy.mask`: statuses that need per-tick bookkeeping. */
export const ST_SLOW = 1;
export const ST_STUN = 2;
export const ST_FREEZE = 4;
export const ST_BURN = 8;
export const ST_POISON = 16;
export const ST_BLEED = 32;
export const ST_BREAK = 64;
export const ST_VULN = 128;
export const ST_HASTE = 256;
export const ST_DOT = ST_BURN | ST_POISON | ST_BLEED;
/** The statuses the mages' third synergy step looks for on an enemy that falls. */
export const ST_MAGIC = ST_SLOW | ST_FREEZE | ST_BURN | ST_POISON | ST_VULN;

export interface SimEnemy extends EnemyState {
  spec: EnemySpec;
  /** Index in the live `enemies` array. */
  index: number;
  /** Health of one cucumber of the wave this enemy was born in; children of splitters inherit it. */
  baseHp: number;
  speed: number;
  /** The wave's elite or boss. */
  target: boolean;
  dead: boolean;
  /** Scratch stamp for "already visited" tests (chain lightning). */
  mark: number;
  isBoss: boolean;
  isElite: boolean;
  mask: number;
  slowUntil: number;
  stunUntil: number;
  freezeUntil: number;
  ccImmuneUntil: number;
  slowImmuneUntil: number;
  /** The black hole that dragged it last, and when no hole may drag it again. */
  pullUid: number;
  pullImmuneUntil: number;
  burnDps: number;
  burnUntil: number;
  burnSrc: SimUnit | null;
  poisonDps: number;
  poisonUntil: number;
  poisonSrc: SimUnit | null;
  bleedDps: number;
  bleedUntil: number;
  bleedSrc: SimUnit | null;
  breakAmount: number;
  breakUntil: number;
  vulnAmount: number;
  vulnUntil: number;
  hasteAmount: number;
  hasteUntil: number;
  dotAt: number;
  /** Next time of the enemy's own periodic ability (spray, dryer); 0 = none. */
  pulseAt: number;
  healAcc: number;
  /** Damage an elite / boss may still absorb right now, and how fast that allowance refills per second. */
  capTokens: number;
  capRate: number;
}

/** Pooled: `uid`, `unitId` and the other fields are rewritten each time the object is reused. */
export interface SimProjectile {
  uid: number;
  unitId: UnitId;
  x: number;
  y: number;
  angle: number;
  targetUid: number;
  src: SimUnit;
  target: SimEnemy | null;
  damage: number;
  speed: number;
  /** Where the target was last seen. */
  tx: number;
  ty: number;
}

export type ZoneAttack = Extract<AttackSpec, { shape: 'frost' | 'void' | 'brew' }>;

export interface SimZone {
  uid: number;
  unitId: UnitId;
  x: number;
  y: number;
  radius: number;
  timeLeft: number;
  duration: number;
  src: SimUnit;
  spec: ZoneAttack;
  damage: number;
  tickAt: number;
}

export interface HazardBatch {
  kind: HazardKind;
  cells: number[];
  states: HazardState[];
  duration: number;
  /** Absolute times the hazard starts (after the warning) and ends. */
  startAt: number;
  endAt: number;
  active: boolean;
}
