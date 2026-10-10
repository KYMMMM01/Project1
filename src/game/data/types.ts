/**
 * Shapes of the data tables that go beyond the public contract in game/api.ts. The simulation reads
 * these; the UI only needs the accessor functions exported from game/index.ts.
 */
import type {
  BossAbilityId, ClassId, DailyModifierId, EnemyDef, EnemyId, HazardKind, RelicId, StatusKind, UnitDef, UnitPerk,
} from '../api';

/** A status effect an attack applies to every enemy it damages. `amount` means: slow / break / vulnerable
 * fraction, or (for burn, poison, bleed) the fraction of the unit's damage per second dealt per second. */
export interface HitEffect {
  kind: StatusKind;
  amount: number;
  duration: number;
}

export interface StompSpec {
  /** Every Nth attack also stuns and breaks the armour of everything in range. */
  every: number;
  stun: number;
  breakAmount: number;
  breakDuration: number;
}

export type AttackSpec =
  /** One target; `priority: 'max_hp'` picks the sturdiest enemy instead of the oldest. */
  | { shape: 'single'; priority?: 'max_hp'; effect?: HitEffect }
  /** The target plus up to `targets - 1` of its nearest neighbours within `radius`; `effect` lands on everything hit. */
  | { shape: 'cleave'; radius: number; targets: number; effect?: HitEffect }
  /** Everything within `reach` px of path distance in front of and behind the target. */
  | { shape: 'line'; reach: number; effect: HitEffect }
  /** Everything within `radius` of the target; every Nth attack stomps everything in range. */
  | { shape: 'blast'; radius: number; stomp: StompSpec }
  /** `targets` different enemies, one projectile each. */
  | { shape: 'multi'; targets: number }
  /** The target and the next `targets` enemies behind it on the shot line; kills explode. */
  | { shape: 'pierce'; targets: number; width: number; blastRadius: number; blastPct: number }
  /** Area damage around the impact point plus a status on everything hit. */
  | { shape: 'splash'; radius: number; effect: HitEffect }
  /** `targets` hits in total, each jump at most `reach` away and `falloff` times the previous; every enemy hit is shocked (stunned) for `stun` seconds. */
  | { shape: 'chain'; targets: number; reach: number; falloff: number; stun: number }
  /** Blizzard: damage + slow every `tick`, sometimes a short freeze. */
  | { shape: 'frost'; radius: number; duration: number; tick: number; tickPct: number; slow: number; freezeChance: number; freezeTime: number }
  /** Black hole: drags enemies back along the path (`pull` px per second; see `PULL_IMMUNE_AFTER` for who is dragged), then explodes for the full damage. */
  | { shape: 'void'; radius: number; duration: number; pull: number }
  /** Potion cloud: enemies inside take more damage and are poisoned. */
  | { shape: 'brew'; radius: number; duration: number; vulnerable: number; poisonPct: number };

/**
 * Passive abilities of the trickster line. Values are fractions unless noted. The cats a team effect reaches are the ones
 * within `reach` cells of the helper (1 = the 8 cells around it, diagonals included; see `auraCells`).
 */
export interface UnitAura {
  /** The cats around it are marked as covered (`UnitState.shielded`, the dashed dome): a wet or zap cell may miss them, see `dodge`. */
  shieldNeighbours?: boolean;
  /** Chance that a wet or zap cell misses the helper and the cats around it; the helper's level scales it (`auraScale`), the strongest one counts. */
  dodge?: number;
  /** Attack speed bonus given to the cats around it (the largest one counts, they do not add up). */
  neighbourSpeed?: number;
  /** Damage bonus given to the cats around it (the largest one counts). */
  neighbourDamage?: number;
  /** How far the effects above reach, in cells (default 1). */
  reach?: number;
  /** Attack speed bonus given to every cat on the board (does not stack). */
  boardSpeed?: number;
  /** +1 fish for kills within range, at most `cap` per wave across the whole board. */
  chef?: { cap: number };
  /** Every `every` seconds: `pct` of damage to every enemy plus a slow. */
  coinRain?: { every: number; pct: number; slow: number; slowDuration: number };
}

export type PerkKey =
  | 'range' | 'damage' | 'speed' | 'crit' | 'critMult' | 'radius' | 'targets' | 'duration' | 'effect' | 'reach' | 'aura';

export interface PerkSpec extends UnitPerk {
  level: 4 | 7 | 10;
  key: PerkKey;
  /** Fraction for range / damage / speed / crit / critMult (crit damage) / radius / effect / aura, absolute for the rest. */
  value: number;
}

export interface UnitSpec extends UnitDef {
  attack: AttackSpec;
  aura: UnitAura;
  perks: PerkSpec[];
  /** Named numbers for the skill sentence (`unit.<id>.skill`), built from the data above. */
  skillArgs: Record<string, number>;
}

export type EnemyHazardPulse = { kind: HazardKind; every: number; duration: number; cells: number };

export interface EnemySpec extends EnemyDef {
  /** Elite pulse: soak cells now and then (spray). */
  hazardPulse?: EnemyHazardPulse;
  /** Weaken the strongest cat every `every` seconds for `duration` (dryer). */
  weakenPulse?: { every: number; duration: number };
  /** Aura around the enemy. */
  aura?: { kind: 'haste' | 'heal'; radius: number; value: number };
  /** Absorb shield as a fraction of max health. */
  shield?: number;
  split?: { into: EnemyId; count: number };
  /** On death: nearby enemies get faster for a moment (firecracker). */
  deathBurst?: { radius: number; haste: number; duration: number };
}

export type BossSpec =
  | { id: 'enrage'; maxBonus: number }
  | { id: 'inhale'; cooldown: number; duration: number; damageTaken: number }
  | { id: 'whirl'; cooldown: number; duration: number; speed: number }
  | { id: 'splash'; spawnEvery: number; spawnCount: number; spawn: EnemyId; soakEvery: number; soakCells: number; soakDuration: number }
  | { id: 'lightning'; cooldown: number; duration: number }
  | { id: 'vaccinate'; cooldown: number; duration: number; regen: number };

export type BossSpecById<K extends BossAbilityId> = Extract<BossSpec, { id: K }>;

/** The flat sum of everything the held relics grant. Missing fields count as 0. */
export interface RelicFx {
  speedWarriorRanger?: number;
  damageMagic?: number;
  damagePhysical?: number;
  costCut?: number;
  killFish?: number;
  rangeAll?: number;
  defenceCut?: number;
  crit?: number;
  topRowRange?: number;
  topRowDamage?: number;
  sameClassNeighbourDamage?: number;
  /** Waves between two visits of the tunnel's cat (1 = at the start of every wave, 3 = of waves 3, 6, 9...: the wave number divides by it). */
  tunnel?: number;
  slowBoost?: number;
  slowedDamage?: number;
  laserDuration?: number;
  laserCooldownCut?: number;
  jumpChance?: number;
  waveFish?: number;
  edgeSpeed?: number;
  actPurr?: number;
  critMult?: number;
  feederEvery?: number;
  feederFish?: number;
  areaScale?: number;
  enemySlow?: number;
  /** Extra damage every enemy takes from every source (0.12: 12% more), physical and magic, direct hits and damage over time; one factor of the vulnerability product, under its cap (sim/enemies.ts `damageEnemy`). */
  enemyDamageTaken?: number;
  twinChance?: number;
  bossPurr?: number;
  instantFish?: number;
  costCapCut?: number;
  /** Special cells the toy adds, and what it adds to the bonus of the chapter's special cell (+0.1: ten points of its stat, or 0.1 fish a second). */
  sunCells?: number;
  sunSpeed?: number;
  rescue?: number;
  starEvery?: number;
  starTargets?: number;
  starHp?: number;
  synergyScale?: number;
  royalDamage?: number;
  bossTime?: number;
  spawnSlow?: number;
}

export type RelicFxKey = keyof RelicFx;

export interface RelicSpec {
  id: RelicId;
  fx: RelicFx;
  /** Values for the `{a}` / `{b}` placeholders of `relic.<id>.desc`, in display units. */
  args: { a?: number; b?: number };
}

/**
 * The numbers of one synergy step. `damage` reaches the cats of the class only; every other number is a side effect
 * that reaches EVERY cat on the board (v1.4): the warriors' armour ignore, the rangers' crit chance and crit damage, the
 * mages' status duration, the tricksters' attack speed and wave reward.
 */
export interface SynergyTier {
  damage: number;
  armorIgnore: number;
  crit: number;
  critMult: number;
  statusMult: number;
  speed: number;
  rewardMult: number;
}

/** What a class's third synergy step (all four kinds, the guardian among them) adds besides its numbers: one ability per class. */
export type SynergySpecial =
  /** Warriors: every `every` seconds each warrior roars; enemies in its range are stunned and lose armour. */
  | { kind: 'cry'; every: number; stun: number; breakAmount: number; breakDuration: number }
  /** Rangers: an arrow that hits an enemy bounces to the nearest other enemy within `reach` px of it and hurts it for `pct` of the hit. */
  | { kind: 'ricochet'; pct: number; reach: number }
  /** Mages: an enemy that falls with a magic status on it bursts; enemies within `radius` take `pct` of its maximum health (elites and bosses do not burst). */
  | { kind: 'shatter'; radius: number; pct: number }
  /** Tricksters: while the laser pointer is on, every cat attacks `speed` faster. */
  | { kind: 'party'; speed: number };

export interface ModifierSpec {
  id: DailyModifierId;
  fishMult?: number;
  enemyCap?: number;
  countMult?: number;
  hpMult?: number;
  epicBonus?: number;
  summonCostMult?: number;
  normalWaveTime?: number;
  damageBonus?: number;
  banClass?: ClassId;
  relicPicks?: number;
  sunCells?: number;
  laserCooldown?: number;
  /** Values for the `{a}` / `{b}` placeholders of `modifier.<id>.desc`. */
  args: { a?: number; b?: number };
}

export interface StakeRules {
  enemyCapCut: number;
  actPurr: number;
  summonCostMult: number;
  bossTimeCut: number;
  relicChoices: number;
  /** Free toy rerolls per run. */
  freeRerolls: number;
  /** Multiplier on the health of every elite and boss. */
  specialHpMult: number;
  /** The most one slow can be on an elite or a boss, before its own `slowResist` (butler levels lower it step by step). */
  specialSlowCap: number;
  /** The share of a stun or freeze an elite feels (bosses feel none); butler levels lower it step by step. */
  eliteCcFactor: number;
}

export interface TrainingDef {
  id: string;
  nameKey: string;
  descKey: string;
  maxLevel: number;
  /** Size of one level's effect (fish, fraction, seconds or cells depending on the entry). */
  perLevel: number;
  /** Text of one level's effect in the current language. */
  effectText(level: number): string;
  /** Gold cost to go from `level - 1` to `level` (1-based). */
  cost(level: number): number;
}
