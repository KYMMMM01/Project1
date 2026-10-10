/**
 * Public contract of the battle simulation. Rules: docs/명세_전투규칙.md.
 *
 * The simulation (src/game/sim) is pure logic: no rendering, no audio, no DOM, no Math.random.
 * Everything it does is driven by `step(dt)` and by the command methods below, and everything the
 * presentation layer needs is either readable state on the Battle object or an event on
 * `battle.events`. The renderer never mutates simulation state directly.
 *
 * Coordinates are field-space pixels (see ./geometry.ts). Time is in simulated seconds.
 */
import type { Emitter } from '@/core/events';
import type { RarityId } from '@/ui/theme';

export type { RarityId };

// ───────────────────────────── identifiers ─────────────────────────────

export const CLASS_IDS = ['warrior', 'ranger', 'mage', 'trickster'] as const;
export type ClassId = (typeof CLASS_IDS)[number];

/**
 * 4 classes x 5 rarities. Order inside each class is common -> mythic, except the tricksters' first two: v1.4 swapped the ranks of the
 * bell kitten and the chef (the chef is the kitten now, `UNIT_GRID` is the line), and this list kept its order so no per-cat table moved.
 */
export const UNIT_IDS = [
  'w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger',
  'r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star',
  'm_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo',
  't_bell', 't_chef', 't_bard', 't_alch', 't_lucky',
] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export const ENEMY_IDS = [
  'cucumber', 'dust', 'drop', 'roomba', 'tangerine', 'balloon', 'balloon_small',
  'clock', 'pill', 'cone', 'dryer', 'spray', 'firecracker',
  'boss_cucumber', 'boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle',
] as const;
export type EnemyId = (typeof ENEMY_IDS)[number];

export const RELIC_IDS = [
  // common
  'yarn_ball', 'glitter_ball', 'mouse_toy', 'cardboard_box', 'bell_collar', 'fishing_rod', 'scratcher', 'feather_wand',
  // rare
  'cat_tower', 'kneading_cushion', 'batteries', 'snack_stick', 'tuna_cans', 'window_perch', 'glass_marble', 'nap_blanket',
  // epic
  'cat_tunnel', 'heating_pad', 'twin_bells', 'silvervine', 'auto_feeder', 'sardine_crate', 'purr_pillow', 'lucky_coin',
  // legendary
  'sunny_spot', 'nine_lives', 'shooting_star', 'golden_catnip', 'royal_crown', 'hourglass',
] as const;
export type RelicId = (typeof RELIC_IDS)[number];

export type DamageType = 'physical' | 'magic';

export type EnemyTrait =
  | 'armored' // takes reduced physical damage
  | 'warded' // takes reduced magic damage
  | 'fast'
  | 'swarm'
  | 'split' // spawns smaller enemies on death
  | 'haste_aura' // speeds up nearby enemies
  | 'heal_aura' // heals nearby enemies and makes them immune to slows
  | 'shield' // absorbs damage before health
  | 'weaken' // periodically halves the attack speed of the strongest unit
  | 'elite'
  | 'boss';

export type StatusKind = 'slow' | 'stun' | 'freeze' | 'burn' | 'poison' | 'bleed' | 'armor_break' | 'vulnerable';

export type BossAbilityId =
  | 'enrage' // boss_cucumber: faster as health drops
  | 'inhale' // boss_vacuum: all units weakened, boss takes less damage
  | 'whirl' // boss_blender: every enemy speeds up
  | 'splash' // boss_bath: spawns drops and soaks cells
  | 'lightning' // boss_cloud: zaps a 2x2 block of cells
  | 'vaccinate'; // boss_needle: enemies ignore slows, boss heals

/** A cell hazard: units standing on the cell cannot attack until it ends or they are moved away. */
export type HazardKind = 'wet' | 'zap';

/**
 * The special board cells, one kind per chapter (rules v1.5, section 6): the living room's sunbeam, the kitchen's food bowl, the
 * bathroom's bubbles, the garden's stump and the vet's treat jar. Each gives the cat standing on it ONE bonus (`game/data/cells.ts`).
 * The names `sunbeams` and `sunlit` below are the first kind's, kept for every kind.
 */
export const SPECIAL_CELL_IDS = ['sun', 'bowl', 'bubble', 'stump', 'treat'] as const;
export type SpecialCellId = (typeof SPECIAL_CELL_IDS)[number];

export type WaveKind = 'normal' | 'elite' | 'boss';

/** `gold` is the gold dungeon: eight normal waves with their own script (game/data/goldDungeon.ts); `chapter` is its tier. */
export type BattleMode = 'tutorial' | 'chapter' | 'daily' | 'endless' | 'gold';

export type DailyModifierId =
  | 'rich' | 'swarm' | 'giants' | 'lucky_day' | 'rush' | 'glass_cannon' | 'no_rangers' | 'toy_box' | 'sunny_day' | 'long_laser';

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
  /** Ready-to-show one-line description in the current language (built from data values). */
  text(): string;
}

export interface UnitDef {
  id: UnitId;
  classId: ClassId;
  rarity: RarityId;
  damageType: DamageType;
  /** i18n keys: `unit.<id>.name`, `unit.<id>.desc` (flavour line). */
  nameKey: string;
  descKey: string;
  /** What makes the unit special, in the current language, with its real numbers. */
  skillText(): string;
  /** True for the cats whose attack breaks armour: with an elite or a boss in reach they aim at it before any ordinary enemy. */
  targetsElitesFirst: boolean;
  /** Level-1 stats before any modifier. */
  base: UnitStats;
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
  /** Share of every slow STATUS that does not land (0..1): the slow that lands is `min(amount x (1 + toy boost), cap) x (1 - slowResist)`. */
  slowResist: number;
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
  /** Description in the current language with the real numbers filled in. */
  descText(): string;
}

export interface ClassDef {
  id: ClassId;
  nameKey: string;
  roleKey: string;
  /** Bonus description for synergy tiers 1..3 in the current language (the numbers of the step; tier 3's ability is `specialText`). */
  tierText(tier: 1 | 2 | 3): string;
  /** i18n key of the name of the ability the third synergy step adds, and its sentence with the real numbers. */
  specialNameKey: string;
  specialText(): string;
}

// ───────────────────────────── run setup ─────────────────────────────

/** What the player brings into a run from the meta game. */
export interface Loadout {
  /** Collection level 1..10 per base unit. Missing entries count as level 1. Mythics use their class legendary's level. */
  unitLevels: Partial<Record<UnitId, number>>;
  /** Training-ground levels by id (see game/data/training). Missing = 0. */
  training: Record<string, number>;
  /** Relics that may be offered this run. */
  relicPool: RelicId[];
}

export interface BattleInit {
  seed: number;
  mode: BattleMode;
  /** 1-based chapter number. */
  chapter: number;
  /** 0..5 — cumulative difficulty rules ("stakes"). */
  stake: number;
  loadout: Loadout;
  modifiers?: DailyModifierId[];
  /** Pre-run snack: extra starting fish / purr, or a guaranteed rare-or-better first summon. */
  bonusFish?: number;
  bonusPurr?: number;
  firstSummonRarePlus?: boolean;
}

/** Opaque wave-start save produced by `snapshot()` and accepted by `createBattle(init, snapshot)`. */
export interface BattleSnapshot {
  simVersion: number;
  wave: number;
  data: string;
}

// ───────────────────────────── live state ─────────────────────────────

export interface UnitState {
  readonly uid: number;
  readonly id: UnitId;
  cell: number;
  /** Collection level 1..10 the cat plays at (its perks of levels 4, 7 and 10 apply). */
  readonly level: number;
  /** Progress toward the next attack, 0 (just fired) .. 1 (ready). */
  charge: number;
  /** True while the unit stands on a hazard cell and cannot attack. */
  blocked: boolean;
  /** Seconds of "weakened" (half attack speed) left; 0 when normal. */
  weakened: number;
  /** True while the unit stands on one of the chapter's special cells (the sunbeam in the living room, see `SpecialCellId`). */
  sunlit: boolean;
  /** Final stats after level, synergies, relics, upgrades and aura buffs. Refreshed by the sim. */
  stats: UnitStats;
  /** Aura bonuses currently received from neighbours (for buff icons), as fractions. */
  buffAttackSpeed: number;
  buffDamage: number;
  /** True when a bell kitten next to this cat covers it (the dashed dome); see `dodge` for what that is worth. */
  shielded: boolean;
  /** Chance 0..1 that a wet or zap cell misses this cat: the bell kitten and the cats around it have one, the others 0. */
  dodge: number;
  kills: number;
  damageDealt: number;
}

export interface EnemyState {
  readonly uid: number;
  readonly id: EnemyId;
  /** Distance travelled along the loop since spawn (position uses it modulo one lap). */
  travelled: number;
  x: number;
  y: number;
  /** Direction of travel in radians. */
  angle: number;
  hp: number;
  maxHp: number;
  /** Remaining / initial absorb shield (0 = none). */
  shield: number;
  maxShield: number;
  /** Current movement slow, 0..1. */
  slow: number;
  stunned: boolean;
  frozen: boolean;
  burning: boolean;
  poisoned: boolean;
  bleeding: boolean;
  armorBroken: boolean;
  vulnerable: boolean;
  hasted: boolean;
  /** True while within the laser pointer's focus radius. */
  focused: boolean;
  /** Bosses/elites: true once below half health. */
  enraged: boolean;
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
  timeLeft: number;
  duration: number;
}

export interface HazardState {
  cell: number;
  kind: HazardKind;
  timeLeft: number;
  duration: number;
}

export interface LaserState {
  active: boolean;
  x: number;
  y: number;
  /** Seconds of focus left while active. */
  timeLeft: number;
  duration: number;
  /** Seconds until it can be used again (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
  /** Radius within which enemies count as focused. */
  radius: number;
  /**
   * Uid of the elite or boss the dot is locked onto (0 = none). Placed on or near one, the dot moves onto it and follows it until the
   * laser ends, it dies or the dot is moved away: `x` and `y` are its position every tick.
   */
  lockUid: number;
}

export type BattlePhase = 'prep' | 'wave' | 'choice' | 'won' | 'lost';

export type PendingChoice =
  | { kind: 'summon'; options: UnitId[] }
  | { kind: 'relic'; options: RelicId[]; freeRerolls: number; paidRerollUsed: boolean; picksLeft: number };

export interface OddsRow<K extends string> {
  key: K;
  /** Probability 0..1. All rows of a table sum to 1. */
  p: number;
}

export interface PityInfo {
  /** Summons since the last epic-or-better / the count at which the bonus starts growing. */
  epicDry: number;
  epicDryLimit: number;
  /** Extra epic-or-better chance currently added (0..1). */
  epicBonus: number;
}

export interface WavePreviewEntry {
  enemy: EnemyId;
  count: number;
}

export interface RunStats {
  mode: BattleMode;
  chapter: number;
  stake: number;
  seed: number;
  victory: boolean;
  /** Highest wave fully cleared. */
  wavesCleared: number;
  totalWaves: number;
  kills: number;
  bossesKilled: number;
  summons: number;
  merges: number;
  molts: number;
  awakenings: number;
  relics: RelicId[];
  /** Highest rarity the player owned at any point. */
  bestRarity: RarityId;
  peakEnemies: number;
  /** Simulated seconds played. */
  duration: number;
  revived: boolean;
  /**
   * How lucky the paid summons were, 0..1: the share of equally long summon sequences that would
   * have rolled worse (0.5 = average). Shown on the result screen so bad luck reads as luck.
   */
  summonLuck: number;
  /** Damage dealt per unit type over the run. */
  damageByUnit: Partial<Record<UnitId, number>>;
}

/** Why a command was refused. `null` from a command means it succeeded. */
export type Fail =
  | 'not_enough_fish'
  | 'not_enough_purr'
  | 'board_full'
  | 'choice_pending'
  | 'not_in_battle'
  | 'invalid_cell'
  | 'empty_cell'
  | 'max_level'
  | 'not_legendary'
  | 'synergy_too_low'
  | 'molt_limit'
  | 'on_cooldown'
  | 'not_available'
  | 'already_used'
  | 'nothing_to_do';

/** What dropping the unit from `from` onto `to` would do: `merge` = onto an identical common, rare or epic cat. */
export type DropAction = 'move' | 'swap' | 'merge' | 'none';

// ───────────────────────────── events ─────────────────────────────

export type SummonSource = 'button' | 'choice' | 'relic' | 'twin' | 'script';

export type CurrencyReason =
  | 'start' | 'kill' | 'wave' | 'call' | 'act' | 'boss' | 'sell' | 'relic' | 'unit'
  | 'summon' | 'upgrade' | 'awaken' | 'molt'
  /** The steady trickle of fish while a wave runs (`incomePerSecond()`): one whole fish at a time, with no place on the field. */
  | 'income';

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
  /**
   * Two identical cats merged: `consumed` were removed and `result` now stands in `cell`. The result is always the
   * next rarity of the SAME class (`mergeResultOf`); `jumped` = it skipped a rarity (snack stick, still the same class).
   */
  merge: { consumed: [UnitState, UnitState]; result: UnitState; cell: number; fromCell: number; jumped: boolean };
  /** A unit changed class at the same rarity. */
  molt: { from: UnitState; result: UnitState; cell: number };
  awaken: { from: UnitState; result: UnitState; cell: number };
  sell: { unit: UnitState; cell: number; fish: number; purr: number };

  /** A unit started an attack. `projectile` is set for travelling shots. */
  attack: { unit: UnitState; targetUid: number; tx: number; ty: number; projectile: ProjectileState | null };
  /**
   * An instant multi-target effect to draw (cleave arc, chain lightning, piercing line, roar,
   * explosion, coin rain, shooting star...). `unitId` / `relic` tell the renderer which visual to
   * use; damage arrives as separate `hit` events.
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
    /** Part of `amount` that was soaked by a shield. */
    absorbed: number;
    killed: boolean;
  };
  status: { enemy: EnemyState; kind: StatusKind; duration: number };
  /** Enemy was dragged backwards along the path by `distance` px. */
  pull: { enemy: EnemyState; distance: number };
  /** A cat covered by a bell kitten dodged a wet or zap cell (show a small "Dodged!" over it). */
  dodge: { unit: UnitState; hazard: HazardKind };
  /**
   * The third synergy step of a class set off an area effect to draw at (`x`, `y`): the warriors' roar (one per roaring warrior,
   * `radius` = its range) or the mages' burst (`radius` = the blast); `points` are the enemies it touches. The rangers' ricochet
   * has its own event (`ricochet`), the tricksters' play time shows as the faster attacks while the laser is on.
   */
  special: { classId: ClassId; kind: 'cry' | 'shatter'; x: number; y: number; radius: number; points: StrikePoint[] };
  /**
   * The rangers' third synergy step: an arrow that hit an enemy at (`x`, `y`) bounced off to another one at (`tx`, `ty`) (`targetUid`),
   * which takes part of the damage as an ordinary `hit` of `unit`. Draw a second arrow between the two points.
   */
  ricochet: { unit: UnitState; x: number; y: number; tx: number; ty: number; targetUid: number };
  shieldBreak: { enemy: EnemyState };
  heal: { enemy: EnemyState; amount: number };
  enrage: { enemy: EnemyState };

  enemySpawn: { enemy: EnemyState };
  enemyDie: { enemy: EnemyState; x: number; y: number; fish: number; purr: number; killer: UnitState | null };
  bossAbility: { enemy: EnemyState; ability: BossAbilityId; duration: number };
  /** Cells that will become hazardous after `delay` seconds (telegraph). */
  hazardWarn: { cells: number[]; kind: HazardKind; delay: number };
  hazard: { cells: number[]; kind: HazardKind; duration: number };
  hazardEnd: { cells: number[]; kind: HazardKind };
  /** A unit was weakened (half attack speed) for `duration` seconds. */
  weaken: { unit: UnitState; duration: number; by: EnemyState | null };
  /** The special cells moved (act change, relic). The event keeps the name of the first kind, the sunbeam. */
  sunbeams: { cells: number[] };
  laser: { state: LaserState };
  laserEnd: { state: LaserState };
  /** The laser's dot locked onto an elite or a boss (`enemy` set) or let go of it (`enemy` null: it died or the dot was moved away). */
  laserLock: { state: LaserState; enemy: EnemyState | null };

  waveStart: { wave: number; act: number; kind: WaveKind; duration: number };
  waveEnd: { wave: number; fish: number; called: boolean };
  actClear: { act: number; purr: number; fish: number };
  relicOffer: { options: RelicId[]; freeRerolls: number; picksLeft: number };
  relicGain: { relic: RelicId };

  fish: { total: number; delta: number; reason: CurrencyReason; x?: number; y?: number };
  purr: { total: number; delta: number; reason: CurrencyReason; x?: number; y?: number };
  /** `distinct` = number of different unit types of the class on the board, counted from the second rank up. */
  synergy: { classId: ClassId; tier: number; previous: number; distinct: number };
  upgrade: { kind: 'class' | 'summon'; classId: ClassId | null; level: number };
  pity: PityInfo;
  /** 0 calm, 1 caution, 2 danger — thresholds on the enemy count. */
  danger: { level: number; count: number; cap: number };
  /** The field is over the cap; defeat follows unless it drops back within `grace` seconds. `grace` 0 = recovered. */
  overflow: { grace: number };
  /** A relic saved the run once (nine lives). */
  rescued: { removed: number };
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
  readonly hazards: ReadonlyArray<HazardState>;
  /** The cells of the chapter's special kind right now (named for the sunbeam, the living room's kind; `specialCell` says which kind). */
  readonly sunbeams: ReadonlyArray<number>;
  /** Which special cell this battle plays with: its chapter's kind (`specialCellOf`), the same in every mode. */
  readonly specialCell: SpecialCellId;
  readonly laser: Readonly<LaserState>;
  readonly relics: ReadonlyArray<RelicId>;

  readonly fish: number;
  readonly purr: number;
  /** 1-based current wave (0 during prep before wave 1). */
  readonly wave: number;
  readonly totalWaves: number;
  /** 1-based act of the current wave. */
  readonly act: number;
  readonly waveKind: WaveKind;
  /** Seconds elapsed in / total length of the current wave (elite/boss waves: the time limit). */
  readonly waveTime: number;
  readonly waveDuration: number;
  /** Seconds left before the first wave starts (prep phase). */
  readonly prepTime: number;
  readonly enemyCount: number;
  readonly enemyCap: number;
  /** Seconds the field has been over the cap (0 when under) / seconds allowed. */
  readonly overflowTime: number;
  readonly overflowLimit: number;
  /** The living boss or elite of this wave, if any. */
  readonly boss: EnemyState | null;
  /** Simulated seconds since the run started. */
  readonly time: number;

  // ── driving ──
  /** Advance by `dt` seconds (already multiplied by game speed). No-op while a choice is pending or the run is over. */
  step(dt: number): void;

  // ── commands: return null on success, a reason on refusal ──
  summon(): Fail | null;
  pickSummon(index: number): Fail | null;
  /**
   * Drag-drop or tap-tap: moves, swaps or merges depending on what is in `to` (see dropAction). A merge joins two
   * identical cats (same class and rarity, common to epic) into one of the next rarity of the same class: every
   * class is a fixed line (warrior: paw, sword, viking, samurai, and the mythic by awakening). Only the snack stick
   * adds chance (a jump of two rarities); to change a cat's class, molt it.
   */
  drop(from: number, to: number): Fail | null;
  sell(cell: number): Fail | null;
  /** Change the unit in `cell` to the same rarity of another class (costs purr, limited per run): the only way to switch class lines. */
  molt(cell: number, classId: ClassId): Fail | null;
  awaken(cell: number): Fail | null;
  upgradeClass(classId: ClassId): Fail | null;
  /** Raise the summon grade (better rarity odds). */
  upgradeSummon(): Fail | null;
  /** Place / move the laser pointer dot (field coordinates). */
  setLaser(x: number, y: number): Fail | null;
  /** End a normal wave early for bonus fish. */
  callNextWave(): Fail | null;
  pickRelic(index: number): Fail | null;
  /** `paid` = the player paid (ad or gems) for it; allowed once per run. */
  rerollRelics(paid: boolean): Fail | null;
  /** Continue after a defeat. Once per run. */
  revive(): Fail | null;
  /** End the run now (quit from pause); `getStats()` then reports a defeat at the current wave. */
  abandon(): void;

  // ── queries for HUD and popups ──
  /** What `drop(from, to)` would do. For a `merge`, the cat it makes is `mergeResultOf(units[from].id)` (data/roster). */
  dropAction(from: number, to: number): DropAction;
  summonCost(): number;
  /** Odds of the NEXT summon by rarity (common..legendary), after grade, relics and soft pity. */
  summonOdds(): OddsRow<RarityId>[];
  pity(): PityInfo;
  /** Paid summons made toward the next pick-1-of-3 / how many are needed (0/0 when disabled). */
  summonOfferProgress(): { count: number; every: number };
  /** Number of different unit types of the class on the board that count toward its synergy (ranks 2 to 5; the kitten does not). */
  classDistinct(classId: ClassId): number;
  /** Which of the class's five rarities are present on the board (index = rarity order). */
  classOwned(classId: ClassId): boolean[];
  /** 0 = none, 1..3 = active synergy tier. */
  synergyTier(classId: ClassId): number;
  classUpgradeLevel(classId: ClassId): number;
  /** Cost of the next class upgrade, or -1 at max level. */
  classUpgradeCost(classId: ClassId): number;
  summonGrade(): number;
  /** Cost of the next summon-grade upgrade, or -1 at max. */
  summonGradeCost(): number;
  /** Purr the cheapest molt costs (the first rank's): a molt costs more the higher the cat's rank, see `moltCostOf`. */
  moltCost(): number;
  /** Purr a molt of the cat in `cell` costs (it rises with the cat's rank), or -1 for an empty cell or a guardian, which cannot molt. */
  moltCostOf(cell: number): number;
  moltsLeft(): number;
  awakenCost(): number;
  /**
   * Fish per second that flow in by themselves while a wave runs: the base income plus the treat cells' trickle, times the daily
   * rule's fish multiplier. They arrive as whole fish with the reason `income`.
   */
  incomePerSecond(): number;
  /** null when the unit in `cell` can awaken now, otherwise why not. */
  canAwaken(cell: number): Fail | null;
  sellValue(cell: number): { fish: number; purr: number };
  /** Bonus fish `callNextWave()` would pay right now, or -1 when it is not available. */
  callBonus(): number;
  /** Enemies of the given wave (default: the next one) for the preview strip. */
  previewWave(wave?: number): WavePreviewEntry[];
  canRevive(): boolean;
  getStats(): RunStats;
  /** Wave-start save for "continue after the app was closed", or null when not supported in this mode. */
  snapshot(): BattleSnapshot | null;
}
