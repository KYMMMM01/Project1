/**
 * Public contract of the battle simulation.
 *
 * The simulation (src/game/sim) is pure logic: no rendering, no audio, no DOM, no Math.random.
 * Everything it does is driven by `step(dt)` and by the command methods below, and everything the
 * presentation layer needs is either readable state on the Battle object or an event on
 * `battle.events`. The renderer never mutates simulation state directly.
 *
 * Coordinates are field-space pixels (see ./geometry.ts). Time is in seconds.
 */
import type { Emitter } from '@/core/events';
import type { RarityId } from '@/ui/theme';

export type { RarityId };

// ───────────────────────────── identifiers ─────────────────────────────

export const CLASS_IDS = ['warrior', 'ranger', 'mage', 'trickster'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/** 4 classes x 5 rarities. Order inside each class is common -> mythic. */
export const UNIT_IDS = [
  'w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger',
  'r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star',
  'm_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo',
  't_bell', 't_chef', 't_bard', 't_alch', 't_lucky',
] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export const ENEMY_IDS = [
  'cucumber', 'dust', 'drop', 'roomba', 'tangerine', 'balloon', 'balloon_small',
  'clock', 'pill', 'cone', 'flea', 'spray', 'firecracker',
  'boss_cucumber', 'boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle',
] as const;
export type EnemyId = (typeof ENEMY_IDS)[number];

export const RELIC_IDS = [
  // common
  'yarn_ball', 'laser_pointer', 'cardboard_box', 'bell_collar', 'fishing_rod', 'scratcher', 'mouse_toy', 'feather_wand',
  // rare
  'cat_tower', 'kneading_cushion', 'cat_tunnel', 'heating_pad', 'piggy_bank', 'snack_stick', 'tuna_cans', 'window_perch',
  // epic
  'clover_pot', 'silvervine', 'auto_feeder', 'glass_marble', 'nap_blanket', 'twin_bells', 'lucky_coin', 'sardine_crate',
  // legendary
  'maneki_bank', 'nine_lives', 'shooting_star', 'golden_catnip', 'royal_crown', 'hourglass',
] as const;
export type RelicId = (typeof RELIC_IDS)[number];

export type DamageType = 'physical' | 'magic';
export type TargetMode = 'first' | 'strong' | 'near';

export type EnemyTrait =
  | 'armored' // takes reduced physical damage
  | 'warded' // takes reduced magic damage
  | 'fast'
  | 'swarm'
  | 'split' // spawns smaller enemies on death
  | 'haste_aura' // speeds up nearby enemies
  | 'heal_aura' // heals nearby enemies
  | 'shield' // ignores the first N hits
  | 'evasive' // chance to dodge single-target hits
  | 'elite'
  | 'boss';

export type StatusKind = 'slow' | 'stun' | 'freeze' | 'burn' | 'poison' | 'bleed' | 'armor_break' | 'vulnerable';

export type BossAbilityId =
  | 'enrage' // boss_cucumber: faster as health drops
  | 'inhale' // boss_vacuum: all units attack slower, boss gains a shield
  | 'whirl' // boss_blender: every enemy speeds up
  | 'splash' // boss_bath: spawns drops and soaks cells
  | 'lightning' // boss_cloud: stuns a 2x2 block of cells
  | 'vaccinate'; // boss_needle: enemies ignore slows, boss heals

export type WaveKind = 'normal' | 'elite' | 'boss';

export type BattleMode = 'tutorial' | 'chapter' | 'daily' | 'endless';

export type DailyModifierId = 'rich' | 'swarm' | 'giants' | 'lucky_day' | 'rush' | 'glass_cannon' | 'no_rangers' | 'toy_box';

// ───────────────────────────── static data shapes ─────────────────────────────

export interface UnitStats {
  /** Damage of one hit before crit and before the target's defences. */
  damage: number;
  /** Seconds between attacks. */
  interval: number;
  /** Reach in pixels, measured from the unit's cell centre to the enemy's position. */
  range: number;
  /** Crit chance 0..1. */
  crit: number;
  /** Crit damage multiplier. */
  critMult: number;
}

/** A permanent bonus a unit gains from its collection level (levels 4, 7 and 10). */
export interface UnitPerk {
  level: number;
  /** i18n key describing the perk in one line. */
  textKey: string;
}

export interface UnitDef {
  id: UnitId;
  classId: ClassId;
  rarity: RarityId;
  damageType: DamageType;
  /** i18n keys: `unit.<id>.name`, `unit.<id>.desc` (one line), `unit.<id>.skill` (what makes it special). */
  nameKey: string;
  descKey: string;
  skillKey: string;
  /** Level-1 stats before any modifier. */
  base: UnitStats;
  /** True when the unit never attacks by itself (pure aura). */
  passiveOnly: boolean;
  /** Projectile flight speed in px/s, or 0 for attacks that land instantly. */
  projectileSpeed: number;
  perks: UnitPerk[];
}

export interface EnemyDef {
  id: EnemyId;
  nameKey: string;
  descKey: string;
  traits: EnemyTrait[];
  /** Health as a multiple of the wave's base health. */
  hpMult: number;
  /** Walk speed in px/s before modifiers. */
  speed: number;
  /** Fraction of physical damage ignored (0..0.9). */
  armor: number;
  /** Fraction of magic damage ignored (0..0.9). */
  ward: number;
  /** Collision / visual radius in px. */
  radius: number;
  /** Fish paid on death. */
  bounty: number;
  ability?: BossAbilityId;
}

export interface RelicDef {
  id: RelicId;
  rarity: Exclude<RarityId, 'mythic'>;
  nameKey: string;
  descKey: string;
}

export interface SynergyTierDef {
  /** Units of the class needed on the board. */
  need: number;
  /** i18n key of the bonus description for this tier. */
  textKey: string;
}

export interface ClassDef {
  id: ClassId;
  nameKey: string;
  roleKey: string;
  tiers: [SynergyTierDef, SynergyTierDef, SynergyTierDef];
}

// ───────────────────────────── run setup ─────────────────────────────

/** What the player brings into a run from the meta game. */
export interface Loadout {
  /** Collection level 1..10 per unit. Missing entries count as level 1. */
  unitLevels: Partial<Record<UnitId, number>>;
  /** Training-ground levels by id (see game/data/training). Missing = 0. */
  training: Record<string, number>;
  /** Mythic units the player may awaken into. */
  unlockedMythics: UnitId[];
  /** Relics that may be offered this run. */
  relicPool: RelicId[];
}

export interface BattleInit {
  seed: number;
  mode: BattleMode;
  /** 1-based chapter number. */
  chapter: number;
  /** 0 normal, 1 hard, 2 nightmare. */
  difficulty: number;
  loadout: Loadout;
  modifiers?: DailyModifierId[];
  /** Pre-run boosts (rewarded-ad start bonus). */
  bonusFish?: number;
  bonusClover?: number;
}

// ───────────────────────────── live state ─────────────────────────────

export interface UnitState {
  readonly uid: number;
  readonly id: UnitId;
  cell: number;
  /** Progress toward the next attack, 0 (just fired) .. 1 (ready). */
  charge: number;
  /** Seconds this unit remains unable to act (soaked / stunned by a boss). 0 when active. */
  disabled: number;
  targetMode: TargetMode;
  /** Final stats after level, synergies, relics, upgrades and aura buffs. Refreshed by the sim. */
  stats: UnitStats;
  /** Sum of adjacency/aura attack-speed and damage bonuses currently received (for buff icons). */
  buffAttackSpeed: number;
  buffDamage: number;
  kills: number;
  damageDealt: number;
}

export interface EnemyState {
  readonly uid: number;
  readonly id: EnemyId;
  /** Distance travelled along the loop since spawn (keeps growing; position uses it modulo lap). */
  travelled: number;
  x: number;
  y: number;
  /** Direction of travel in radians. */
  angle: number;
  hp: number;
  maxHp: number;
  /** Hits the shield will still absorb (0 = no shield). */
  shield: number;
  /** Current movement slow, 0..1. */
  slow: number;
  /** Flags for status visuals. */
  stunned: boolean;
  frozen: boolean;
  burning: boolean;
  poisoned: boolean;
  bleeding: boolean;
  armorBroken: boolean;
  vulnerable: boolean;
  hasted: boolean;
  /** Seconds since spawn (drives walk animation phase). */
  age: number;
}

export interface ProjectileState {
  readonly uid: number;
  /** Which unit type fired it — the renderer picks the sprite/trail from this. */
  readonly unitId: UnitId;
  x: number;
  y: number;
  angle: number;
  targetUid: number;
}

/** A lingering area effect on the path (blizzard, potion cloud, black hole). */
export interface ZoneState {
  readonly uid: number;
  readonly unitId: UnitId;
  x: number;
  y: number;
  radius: number;
  /** Seconds remaining / total. */
  timeLeft: number;
  duration: number;
}

export type BattlePhase = 'prep' | 'wave' | 'choice' | 'won' | 'lost';

export type PendingChoice =
  | { kind: 'summon'; options: UnitId[] }
  | { kind: 'relic'; options: RelicId[]; freeRerolls: number; adRerollUsed: boolean };

export type CapsuleOutcome = 'fish' | 'rare' | 'epic' | 'legendary' | 'jackpot';

export interface OddsRow<K extends string> {
  key: K;
  /** Probability 0..1. All rows of a table sum to 1. */
  p: number;
}

export interface PityInfo {
  /** Consecutive commons so far / how many trigger the guarantee. */
  commonStreak: number;
  commonLimit: number;
  /** Summons since the last epic-or-better / threshold after which the bonus starts growing. */
  epicDry: number;
  epicDryLimit: number;
  /** Extra epic-or-better chance currently added by the soft pity (0..1). */
  epicBonus: number;
}

export interface WavePreviewEntry {
  enemy: EnemyId;
  count: number;
}

export interface RunStats {
  mode: BattleMode;
  chapter: number;
  difficulty: number;
  seed: number;
  victory: boolean;
  /** Highest wave fully cleared. */
  wavesCleared: number;
  totalWaves: number;
  kills: number;
  bossesKilled: number;
  summons: number;
  merges: number;
  awakenings: number;
  relics: RelicId[];
  /** Highest rarity the player owned at any point. */
  bestRarity: RarityId;
  peakEnemies: number;
  /** Simulated seconds played. */
  duration: number;
  revived: boolean;
  /** Damage dealt per unit type over the run. */
  damageByUnit: Partial<Record<UnitId, number>>;
}

/** Why a command was refused. `null` from a command means it succeeded. */
export type Fail =
  | 'not_enough_fish'
  | 'not_enough_clover'
  | 'board_full'
  | 'choice_pending'
  | 'not_in_battle'
  | 'invalid_cell'
  | 'empty_cell'
  | 'max_level'
  | 'not_legendary'
  | 'synergy_too_low'
  | 'mythic_locked'
  | 'already_used'
  | 'nothing_to_do';

/** What dropping the unit from `from` onto `to` would do. */
export type DropAction = 'move' | 'swap' | 'merge' | 'none';

// ───────────────────────────── events ─────────────────────────────

export type SummonSource = 'button' | 'choice' | 'capsule' | 'relic' | 'twin' | 'script';

export type CurrencyReason =
  | 'start' | 'kill' | 'wave' | 'act' | 'boss' | 'sell' | 'relic' | 'capsule' | 'interest' | 'unit'
  | 'summon' | 'upgrade' | 'awaken';

export interface StrikePoint {
  x: number;
  y: number;
  /** Enemy hit at this point, or 0 when the point is only a visual waypoint. */
  uid: number;
}

export interface BattleEvents {
  /** A unit appeared on the board. */
  summon: { unit: UnitState; source: SummonSource };
  /** The every-Nth summon offer opened; the sim is paused until pickSummon(). */
  summonOffer: { options: UnitId[] };
  move: { unit: UnitState; from: number; to: number };
  swap: { a: UnitState; b: UnitState };
  /** `consumed` were removed; `result` now stands in `cell`. `jumped` = skipped a rarity (snack stick). */
  merge: { consumed: [UnitState, UnitState]; result: UnitState; cell: number; fromCell: number; jumped: boolean };
  awaken: { from: UnitState; result: UnitState; cell: number };
  sell: { unit: UnitState; cell: number; fish: number; clover: number };

  /** A unit started an attack. `projectile` is set for travelling shots. */
  attack: { unit: UnitState; targetUid: number; tx: number; ty: number; projectile: ProjectileState | null };
  /**
   * An instant multi-target effect to draw (cleave arc, chain lightning, piercing line, roar,
   * explosion, meteor...). `unitId` tells the renderer which visual to use; damage arrives as
   * separate `hit` events.
   */
  strike: { unitId: UnitId | null; relic: RelicId | null; x: number; y: number; radius: number; points: StrikePoint[] };
  projectileEnd: { projectile: ProjectileState; x: number; y: number; hit: boolean };
  zoneStart: { zone: ZoneState };
  zoneEnd: { zone: ZoneState };

  hit: {
    enemy: EnemyState;
    amount: number;
    crit: boolean;
    type: DamageType;
    /** Unit type that caused it, or null for relic / damage-over-time ticks. */
    unitId: UnitId | null;
    dot: StatusKind | null;
    killed: boolean;
  };
  status: { enemy: EnemyState; kind: StatusKind; duration: number };
  /** Enemy was dragged backwards along the path by `distance` px. */
  pull: { enemy: EnemyState; distance: number };
  shieldHit: { enemy: EnemyState; left: number };
  evade: { enemy: EnemyState };
  heal: { enemy: EnemyState; amount: number };

  enemySpawn: { enemy: EnemyState };
  enemyDie: { enemy: EnemyState; x: number; y: number; fish: number; clover: number; killer: UnitState | null };
  bossAbility: { enemy: EnemyState; ability: BossAbilityId; cells: number[]; duration: number };
  /** A unit was soaked/stunned (boss ability or elite) or recovered (`duration` 0). */
  unitDisabled: { unit: UnitState; duration: number };

  waveStart: { wave: number; act: number; kind: WaveKind; duration: number };
  waveEnd: { wave: number; fish: number };
  actClear: { act: number; clover: number; fish: number };
  relicOffer: { options: RelicId[]; freeRerolls: number };
  relicGain: { relic: RelicId };

  fish: { total: number; delta: number; reason: CurrencyReason; x?: number; y?: number };
  clover: { total: number; delta: number; reason: CurrencyReason; x?: number; y?: number };
  synergy: { classId: ClassId; tier: number; previous: number; count: number };
  upgrade: { kind: 'class' | 'luck'; classId: ClassId | null; level: number };
  capsule: { outcome: CapsuleOutcome; unit: UnitState | null; fish: number; clover: number };
  pity: PityInfo;
  /** 0 calm, 1 caution, 2 danger — thresholds on the enemy count. */
  danger: { level: number; count: number; cap: number };
  defeat: { reason: 'overrun' | 'boss_timeout' };
  revive: { removed: number };
  victory: { stats: RunStats };
}

// ───────────────────────────── the simulation object ─────────────────────────────

export interface BattleApi {
  readonly init: BattleInit;
  readonly events: Emitter<BattleEvents>;

  // ── state the renderer reads every frame ──
  readonly phase: BattlePhase;
  readonly pending: PendingChoice | null;
  /** One slot per board cell (length CELL_COUNT); null = empty. */
  readonly units: ReadonlyArray<UnitState | null>;
  readonly enemies: ReadonlyArray<EnemyState>;
  readonly projectiles: ReadonlyArray<ProjectileState>;
  readonly zones: ReadonlyArray<ZoneState>;
  readonly relics: ReadonlyArray<RelicId>;

  readonly fish: number;
  readonly clover: number;
  /** 1-based current wave (0 during prep before wave 1). */
  readonly wave: number;
  readonly totalWaves: number;
  /** 1-based act of the current wave. */
  readonly act: number;
  readonly waveKind: WaveKind;
  /** Seconds elapsed in / total length of the current wave (boss waves: the time limit). */
  readonly waveTime: number;
  readonly waveDuration: number;
  /** Seconds left before the first wave starts (prep phase). */
  readonly prepTime: number;
  readonly enemyCount: number;
  readonly enemyCap: number;
  /** Simulated seconds since the run started. */
  readonly time: number;

  // ── driving ──
  /** Advance by real `dt` seconds (already multiplied by game speed). No-op while a choice is pending or the run is over. */
  step(dt: number): void;

  // ── commands: return null on success, a reason on refusal ──
  summon(): Fail | null;
  pickSummon(index: number): Fail | null;
  /** Drag-drop: moves, swaps or merges depending on what is in `to` (see dropAction). */
  drop(from: number, to: number): Fail | null;
  sell(cell: number): Fail | null;
  awaken(cell: number): Fail | null;
  setTargetMode(cell: number, mode: TargetMode): Fail | null;
  upgradeClass(classId: ClassId): Fail | null;
  upgradeLuck(): Fail | null;
  spinCapsule(): Fail | null;
  pickRelic(index: number): Fail | null;
  /** `paid` = the player watched a rewarded ad for it (allowed once per run). */
  rerollRelics(paid: boolean): Fail | null;
  /** Rewarded-ad revive after a defeat: clears half the enemies and resumes. Once per run. */
  revive(): Fail | null;
  /** End the run now (quit from pause). Emits `defeat`-less result: stats via getStats(). */
  abandon(): void;

  // ── queries for HUD and popups ──
  dropAction(from: number, to: number): DropAction;
  summonCost(): number;
  /** Current summon odds by rarity (common..legendary) after luck upgrades, relics and soft pity. */
  summonOdds(): OddsRow<RarityId>[];
  pity(): PityInfo;
  /** Summons made toward the next pick-1-of-3 offer / how many are needed. */
  summonOfferProgress(): { count: number; every: number };
  classCount(classId: ClassId): number;
  /** 0 = none, 1..3 = active synergy tier. */
  synergyTier(classId: ClassId): number;
  /** Head-count needed for tiers 1..3 this run (relics can lower it). */
  synergyNeeds(classId: ClassId): [number, number, number];
  classUpgradeLevel(classId: ClassId): number;
  /** Cost of the next class upgrade, or -1 at max level. */
  classUpgradeCost(classId: ClassId): number;
  luckLevel(): number;
  luckCost(): number;
  capsuleCost(): number;
  capsuleOdds(): OddsRow<CapsuleOutcome>[];
  /** Capsule spins since the last epic-or-better / spins that trigger the guarantee. */
  capsulePity(): { dry: number; limit: number };
  awakenCost(): number;
  /** null when the unit in `cell` can awaken now, otherwise why not. */
  canAwaken(cell: number): Fail | null;
  /** What `cell`'s unit would become when awakened, or null. */
  awakenResult(cell: number): UnitId | null;
  sellValue(cell: number): { fish: number; clover: number };
  /** Enemies of the given wave (default: the next one) for the preview strip. */
  previewWave(wave?: number): WavePreviewEntry[];
  canRevive(): boolean;
  getStats(): RunStats;
}
