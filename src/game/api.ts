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
  'clock', 'pill', 'cone', 'dryer', 'coin', 'spray', 'firecracker',
  'boss_cucumber', 'boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle', 'boss_treasure',
] as const;
// `coin` and `boss_treasure` are the gold dungeon's own pair (game/data/goldDungeon.ts), listed with their rank: they never walk in a chapter,
// the daily challenge or endless mode.
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

/**
 * The per-cat skills (docs/design_skills_v2.md): one for each cat from the third rank up (Alley Boss, King, Guardian). All twelve names
 * are reserved here; `UnitDef.spSkill` exists only for a cat whose skill is built (`game/data/spSkills.ts`, the row's `built` flag).
 */
export const SP_SKILL_IDS = [
  'shove', 'cut', 'charge', 'clones', 'wanted', 'lap', 'cloud', 'knock', 'meteor', 'jam', 'fish', 'capsule',
] as const;
export type SpSkillId = (typeof SP_SKILL_IDS)[number];

/** The rank of a cat with a skill: 3 = epic (Alley Boss), 4 = legendary (King), 5 = mythic (Guardian). It sets the cooldown (18 / 24 / 34 s). */
export type SpRank = 3 | 4 | 5;

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

export type StatusKind =
  | 'slow' | 'stun' | 'freeze' | 'burn' | 'poison' | 'bleed' | 'armor_break' | 'vulnerable'
  /** The alchemist's transmutation of an elite or a boss (Turn Into Fish!): walks at a quarter of its speed for a few seconds. NOT a slow: it is not `EnemyState.slow`. */
  | 'fish';

export type BossAbilityId =
  | 'enrage' // boss_cucumber: faster as health drops
  | 'inhale' // boss_vacuum: all units weakened, boss takes less damage
  | 'whirl' // boss_blender: every enemy speeds up
  | 'splash' // boss_bath: spawns drops and soaks cells
  | 'lightning' // boss_cloud: zaps a 2x2 block of cells
  | 'vaccinate' // boss_needle: enemies ignore slows, boss heals
  | 'spill'; // boss_treasure (the gold dungeon's chest): coins pop out of it as it is hit, which is more gold for the player

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

/** A cat's skill as the view needs it: which one, how long its gauge takes to fill, and the key of its name. */
export interface SpSkillDef {
  id: SpSkillId;
  rank: SpRank;
  /** Seconds of simulation time the gauge takes to go from 0 to 1 (a gauge that is blocked or waiting for its condition does not count). */
  cooldown: number;
  /** i18n key of the skill's name (`sp.<id>.name`), shown in the bubble over the cat the first time it casts. */
  nameKey: string;
}

export interface UnitDef {
  id: UnitId;
  classId: ClassId;
  rarity: RarityId;
  /** The cat's skill. Absent for the cats that have none, and for the cats whose skill is not built yet (so a ring is never shown for nothing). */
  spSkill?: SpSkillDef;
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
  /**
   * The cats' skills. Absent = on (so the tests exercise them); `false` switches the whole pass off and the battle then plays exactly as it
   * did before the skills existed. The app decides it in one place (`core/skillSwitch.ts`) and a saved run keeps the value it started with.
   */
  sp?: boolean;
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
  /**
   * The skill gauge, 0 (just cast) .. 1 (full: it casts the moment the skill's own condition holds, so a full gauge can wait). Fills by
   * simulation time only. Always 0 for a cat without a skill (`UnitDef.spSkill`), and for every cat while `BattleApi.spOn` is false
   * (nothing fills a gauge then; a ring should be gated on `spOn` all the same).
   */
  sp: number;
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
  /**
   * The ninja's clones that are standing right now (Surprise Clones, `SpClonesData`): empty for every other cat, for a ninja that has cast
   * none, and in a battle played without skills. Owned by the simulation: read it, never write it. A clone is not a cat: it is not in
   * `BattleApi.units`, takes no tile and counts for nothing, it is a few numbers hung on its ninja.
   */
  clone: CloneState[];
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
  /**
   * True while the alchemist's big flask keeps this elite or boss a fish (Turn Into Fish!, `SpFishData.big`): it walks at a quarter of its
   * speed and keeps everything else (health, abilities, the damage cap). It is not `slow` and not a stun. It turns false by itself, and the
   * event `fishEnd` says so at that moment.
   */
  fish: boolean;
  /** Seconds since spawn (drives walk animation phase). */
  age: number;
}

export interface ProjectileState {
  /**
   * True for a shuriken thrown by one of the ninja's clones (Surprise Clones): paint it pale blue. It is the ninja's shuriken in every other
   * way (`unitId` is `r_ninja`, the damage and the kill are the ninja's) and it starts from the clone's tile centre. No `attack` event
   * announces it: the `cloneThrow` event does, with this very object.
   */
  readonly ghost?: boolean;
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
  /**
   * `source` says who opened the toy pick: the end of a stage (absent or 'stage': the shop, with its rerolls) or a lucky cat's toy capsule
   * ('capsule': opened in the middle of a wave, one pick, no reroll, no common toys; closing it lets the wave go on where it was).
   */
  | { kind: 'relic'; options: RelicId[]; freeRerolls: number; paidRerollUsed: boolean; picksLeft: number; source?: 'stage' | 'capsule' };

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

export type SummonSource =
  | 'button' | 'choice' | 'relic' | 'twin' | 'script'
  /** A cat a skill put on the board (the lucky cat's partner capsule). No sticker is tossed from the button; the arrival ring and the "NEW" tag are the same. */
  | 'skill';

export type CurrencyReason =
  | 'start' | 'kill' | 'wave' | 'call' | 'act' | 'boss' | 'sell' | 'relic' | 'unit'
  | 'summon' | 'upgrade' | 'awaken' | 'molt'
  /** The steady trickle of fish while a wave runs (`incomePerSecond()`): one whole fish at a time, with no place on the field. */
  | 'income'
  /** Fish or purr a skill paid out (the lucky cat's fish and purr capsules): an icon flies from where the capsule opened, like any other gain. */
  | 'skill';

export interface StrikePoint {
  x: number;
  y: number;
  /** Enemy hit at this point, or 0 when the point is only a visual waypoint. */
  uid: number;
}

// ───────────────────────────── skill casts ─────────────────────────────
//
// One event, `spCast`, announces every cast. Its payload is a union on `skill`: the view narrows on it and draws the scene of the design
// from the numbers alone, never from simulation internals. The damage of a cast arrives as ordinary `hit` events AFTER `spCast` (the scene
// starts first, the numbers pop up on it). Each skill's agent owns its member below and may add fields; renaming or removing one breaks
// the view.

/** One enemy the shield shove pushed: where it stood, where its slide ends, and how far it slides. */
export interface SpShoved {
  uid: number;
  /** Where it stood when the shield came down (the afterimage stays here) and which way it faced, in radians. */
  x: number;
  y: number;
  angle: number;
  /** Where the slide ends. The enemy itself moves there in the simulation over `SpShoveData.slide` seconds, back along the road. */
  toX: number;
  toY: number;
  /** px it slides back (the floor at the start of the road and the elite / boss factors are applied: 0 never appears, a boss gets 32). */
  distance: number;
}

/** Shield Shove (viking): the shield slam at the cat's cell, a wedge of dust over the road inside its reach, and every pushed enemy. */
export interface SpShoveData {
  /** The cat's reach in px: the wedge spreads over the stretch of road inside it. */
  range: number;
  /** Seconds the slide takes. */
  slide: number;
  /** Ordered like the casts' targets (laser dot first, elites and bosses, longest on the road). Empty never happens: the cast needs one. */
  pushed: SpShoved[];
}

/**
 * What the two running bodies (the tiger and the star archer's arrow) tell the view about their run, so it can draw the body without
 * reading the simulation. The body's place at simulation time `t` (`BattleApi.time`) is
 * `pathPoint(startPath + dir * min(dist, speed * max(0, t - at - delay)))`: it does not move before `at + delay` and is at the end of its
 * run from `at + delay + duration` on. Each enemy it touches arrives as an `spRunHit` (then a `hit`), a felled enemy of the lap bursts as an
 * `spRunBurst`, and `spRunEnd` closes the run. A run is not saved: a resumed battle starts with none.
 */
export interface SpRunData {
  /** Names the run in `spRunHit`, `spRunBurst` and `spRunEnd`; unique in the battle, counting up from 1. */
  runId: number;
  /** `BattleApi.time` of the cast. */
  at: number;
  /** Direction along the road: +1 with the flow of the enemies (the arrow), -1 against it (the tiger). */
  dir: 1 | -1;
  /** Seconds after `at` before the body starts to move along the road (the tiger's leap; 0 for the arrow). */
  delay: number;
  /** Seconds the body spends moving along the road: `dist / speed`. */
  duration: number;
}

/**
 * The Tiger Has Arrived: the tiger leaps to the front of the busiest stretch of road and runs against the flow. Each enemy it passes is
 * stomped once (`spRunHit`, then `hit`); the tile keeps attacking all the while.
 */
export interface SpChargeData extends SpRunData {
  /** Road coordinate (distance along the loop, in [0, PATH_LENGTH)) of the front of the stretch where the tiger lands, and that point in field px. */
  startPath: number;
  landX: number;
  landY: number;
  /** px the run covers against the flow, its speed in px/s and the seconds of the leap before the run starts (`delay` is the same number). */
  dist: number;
  speed: number;
  leap: number;
}

/**
 * Starlight Lap: a silver arrow comes down on the road at the point nearest the cat and runs once round it with the flow, a star flashing on
 * every enemy it passes (`spRunHit`, then `hit`); an enemy it fells bursts as the passive's does (`spRunBurst`).
 */
export interface SpLapData extends SpRunData {
  /** Road coordinate (in [0, PATH_LENGTH)) and field position of the point nearest the archer, where the arrow comes down. */
  startPath: number;
  startX: number;
  startY: number;
  /** px the arrow covers (one lap plus the extra) and its speed in px/s. */
  dist: number;
  speed: number;
}

/**
 * Wanted: One Shot (gunner): a poster is pasted on the target and a cork bullet takes a bite out of it. `bite` is an elite or a boss
 * losing a share of its maximum health outside its damage allowance (announced by a `bite` event of its own, not a `hit`); `small` is the
 * plain enemy that loses part of its current health when no elite or boss is there (its damage arrives as an ordinary `hit`).
 */
export interface SpWantedData {
  mode: 'bite' | 'small';
  targetUid: number;
  /** Where the target stands (the poster goes here; the cork bullet flies from the cat's tile, `SpCastEvent.unit`, to this point). */
  x: number;
  y: number;
  /** The share this shot took: of the target's maximum health for a bite (0.06; less when the pool had less left), of its current health for a small one (0.2). */
  share: number;
  /**
   * Bite only (0 for a small shot): the share of maximum health this target has given in all so far, including this shot, and its pool
   * (0.12). Two eggs (one per half of the pool) and the "case closed" stamp follow from it.
   */
  taken: number;
  pool: number;
  /** Health points the shot takes before multipliers: `share` x the target's maximum health (bite) or current health (small). */
  amount: number;
  /** Bite only: this shot emptied the target's pool, so the "case closed" stamp goes on its name tag. */
  closed: boolean;
}

// ── Step 2: the payloads of the eight skills built after the first four ──
//
// Each type below says what its skill's scene needs (who, where, when, how many) and what the simulation really knows; the table of every
// event is in docs/handoff/skills2_sim.md. The scenes are built from these shapes: renaming or removing a field breaks them. Times are
// `BattleApi.time` (simulation seconds), positions are field px.

/** One enemy a cut line was drawn on: who, and where it stood when the line was drawn. */
export interface SpCutMark {
  uid: number;
  x: number;
  y: number;
}

/**
 * Already Cut (samurai, 3.2): a white afterimage crosses `half` px of road either side of the anchor enemy, thin lines are drawn on up to
 * `max` enemies, and `fuse` seconds later every line opens at once (the `hit`s of the cut come then, at the enemy's place of that moment).
 */
export interface SpCutData {
  /**
   * Names the cast in its `cutOpen` (unique in the battle, counting up from 1). Two samurai of rank 4 may cast in the same tick (no gap), so
   * `at` alone does not tell their lines apart.
   */
  cutId: number;
  /** The enemy the stretch is measured from (first in skill order), and its road coordinate in [0, PATH_LENGTH). */
  anchorUid: number;
  anchorPath: number;
  /** Road coordinates of the two ends of the stretch (anchor -/+ `half`, wrapped into [0, PATH_LENGTH)): the afterimage crosses from `fromPath` to `toPath` along the flow. */
  fromPath: number;
  toPath: number;
  /** `BattleApi.time` of the cast, and the seconds until every line opens (the cut lands at `at + fuse`). */
  at: number;
  fuse: number;
  /**
   * The marked enemies, at most `max`, closest to the anchor along the road first (the anchor itself first of all). `x`, `y` is where each
   * stood at the cast; the line follows the enemy (read its public state by `uid`). Two samurai may name the same enemy: draw one line.
   */
  marks: SpCutMark[];
}

/**
 * One line of a cut as it opens (`cutOpen`). `uid` is the enemy the line was drawn on at the cast. `kind` says what the cut then did:
 * `cut` it cut that enemy, `moved` the enemy had died meanwhile and the line moved to `to`, the nearest living enemy within `reaim` px of
 * the dead one's last place that carried no line, `lost` the enemy had died and there was no such neighbour (`to` is 0, nothing is cut).
 */
export interface SpCutLine {
  uid: number;
  kind: 'cut' | 'moved' | 'lost';
  to: number;
  /** Where the line's own enemy stood as the lines opened (the place it died, for a dead one). */
  x: number;
  y: number;
  /** Where the cut lands: `x`, `y` for a `cut`, the receiving enemy's place for a `moved`, `x`, `y` again for a `lost` line. */
  toX: number;
  toY: number;
}

/**
 * One clone of a ninja that is standing now (`UnitState.clone`). `index` is the clone's number in the cast that made it (the position in
 * `SpClonesData.seats`, and the `index` of every follow-up event), so a clone that is gone from the list does not renumber the other.
 */
export interface CloneState {
  index: number;
  /**
   * The tile it stands on, or -1 when it is overlapped on its ninja's own tile: such a clone moves with the ninja (read `UnitState.cell`)
   * and is drawn behind it. A standing clone never moves by itself; it goes to -1 when a cat takes its tile (`cloneStep`).
   */
  cell: number;
  /** Throws it still has (the cast gives it `SpClonesData.throws`; it goes at 0). One is spent for every volley of the ninja it follows. */
  left: number;
  /** `BattleApi.time` from which it follows volleys (the cast plus `arrive`), and the latest `BattleApi.time` it stays. */
  readyAt: number;
  until: number;
}

/** Why a clone went: it threw its last shuriken, the time ran out, a new cast replaced it, or its ninja was merged / sold / molted / is gone, the stage or the battle ended. */
export type CloneEndReason = 'done' | 'timeout' | 'replaced' | 'merged' | 'sold' | 'molted' | 'gone' | 'stage' | 'end';

/** One seat of a clone: the tile it stands on (the ninja's own tile when `stacked`), and that tile's centre. */
export interface SpCloneSeat {
  cell: number;
  /** True when no empty tile was left: this clone stands overlapped on the ninja's tile. */
  stacked: boolean;
  x: number;
  y: number;
}

/**
 * Surprise Clones (ninja, 3.4): a puff, and `seats.length` pale blue clones leap to the nearest empty tiles (or stack on the ninja). Each
 * throws one shuriken along with every volley of the ninja, `throws` times, then goes with a second puff.
 */
export interface SpClonesData {
  /**
   * One entry per clone, in the order they were seated (nearest tile first); the position is the clone's `index`. A `stacked` seat is on the
   * ninja's own tile (`cell` is the ninja's): the clone puffs out of the ninja and settles behind it. The ninja's old clones, if it still
   * had any, were sent away with a `cloneEnd` (reason 'replaced') just before this event.
   */
  seats: SpCloneSeat[];
  /** Throws each clone has left at the cast. */
  throws: number;
  /** Seconds the leap to the seat takes; the first volley a clone follows is after it. */
  arrive: number;
  /** `BattleApi.time` of the cast: the clones land at `at + arrive` and stay until `at + life` at the latest. */
  at: number;
  /**
   * The longest a clone stays, seconds from the cast (it usually goes sooner, on its last throw). Time the picture by `BattleApi.time`:
   * it stands still under a choice popup, like the clones do.
   */
  life: number;
}

/**
 * Tagalong Cloud (storm cat, 3.7): a small black cloud pops out of the cat's hat, flies to `hostUid` and follows that enemy for `life`
 * seconds, dropping a bolt on it every `every` seconds (the first one `every` seconds after the cast). If the host dies it hops to a near
 * enemy, or goes. The follow-up events `cloudBolt`, `cloudHop` and `cloudEnd` carry `cloudId`; between them the cloud sits on the host
 * (`EnemyState` x, y of `hostUid`, the one the last hop named).
 */
export interface SpCloudData {
  /** Names the cloud in follow-up events (unique in the battle, counting up from 1). */
  cloudId: number;
  hostUid: number;
  /** Where the host stood at the cast (the cloud flies there from the cat's hat). */
  hostX: number;
  hostY: number;
  /** `BattleApi.time` of the cast, the seconds it lasts, the seconds between bolts and how many bolts that is. */
  at: number;
  life: number;
  every: number;
  bolts: number;
  /** Radius round the host a bolt's splash reaches, and how far from a fallen host the cloud may hop, px (for the picture). */
  splashRadius: number;
  hopRadius: number;
}

/** One enemy a shard of glass flies to: who, where it stood, and whether it was frozen (5 D) or only slowed (3 D). */
export interface SpKnockShard {
  uid: number;
  x: number;
  y: number;
  frozen: boolean;
}

/**
 * Knock It Off! (frost queen, 3.8): the glass falls where the chilled enemies are thickest (`impactX`, `impactY`), breaks, and a shard
 * flies into every slowed or frozen enemy within `radius`, whose chill is spent as the shard hits.
 */
export interface SpKnockData {
  /** The glass lands on the enemy the cast chose (where it stood at the cast); the cast's own `x`, `y` is the cat's tile, where it falls from. */
  impactX: number;
  impactY: number;
  /** Radius around the impact the shards reach, px. */
  radius: number;
  /**
   * One shard each, in skill order (the order the damage is dealt in); `x`, `y` is where the enemy stood at the cast and `frozen` whether it
   * was frozen then (5 D) or only slowed (3 D). The damage and the loss of the chill are done at the cast, in this same tick: the `hit`s follow
   * the `spCast` at once and an enemy that survived has `slow` 0 and `frozen` false from then on. The glass's fall (0.5 s in the design) is only
   * the picture's time: the view keeps the ice sticker on the shards' enemies and queues their numbers until the shard lands.
   */
  shards: SpKnockShard[];
}

/**
 * Meteor Drop (cosmo cat, 3.9): the field darkens and a red circle grows for `warn` seconds where the enemies will be, then the meteor
 * lands: the inner ring (`innerRadius`) at once, the outer one (`outerRadius`) `outerDelay` later, and a crater burns for `craterLife`.
 */
export interface SpMeteorData {
  /**
   * Names the meteor in its follow-up events `meteorLand` (both rings) and `craterEnd` (unique in the battle, counting up from 1). Two cosmo
   * cats' meteors can be alive together, and with the laser on both fall on the same dot, so the place alone does not tell them apart.
   */
  meteorId: number;
  /** Where it lands: the point where the enemies, a second on, weigh most; the laser's dot (as it is at the cast) when the laser is on. */
  impactX: number;
  impactY: number;
  /** True when the meteor was aimed at the laser's dot (the player's one control). */
  onLaser: boolean;
  /** `BattleApi.time` of the cast and the seconds of warning: the meteor lands at `at + warn`. */
  at: number;
  warn: number;
  innerRadius: number;
  outerRadius: number;
  outerDelay: number;
  craterRadius: number;
  craterLife: number;
}

/** One golden note: the cat it lands on, and what it does there. */
export interface SpJamNote {
  /** The cat's `UnitState.uid` and its tile. */
  uid: number;
  cell: number;
  /** `gauge`: the cat's skill ring jumps by `SpJamData.fill`. `attack`: the cat makes one ordinary attack at once (no skill of its own to fill). */
  kind: 'gauge' | 'attack';
  /**
   * The cat's skill gauge before the note and after it (`UnitState.sp` already shows `after` when the event arrives, so a ring that waits for
   * the note to land holds `before` until then). Both 0 for an `attack` note: that cat has no gauge.
   */
  before: number;
  after: number;
}

/**
 * Jam Session! (bard, 3.10): the lute is strummed and `notes.length` golden notes (at most four) fly to different cats at the same time.
 * `notes` are in the order the notes were handed out: the `gauge` notes first (lowest gauge first, ties to the lower tile), then the `attack`
 * notes (the nearest cat to the bard first). The bard itself never gets one. Everything is applied when the event is emitted; an `attack` note
 * has no event of its own: the cat's ordinary `attack` follows in the next tick (its attack gauge was topped up by one).
 */
export interface SpJamData {
  notes: SpJamNote[];
  /** Share of the gauge a `gauge` note adds (0.2). */
  fill: number;
}

/** One enemy a flask flies to. */
export interface SpFishTarget {
  uid: number;
  x: number;
  y: number;
}

/**
 * Turn Into Fish! (alchemist, 3.11): up to five flasks. The big one (when an elite or boss is in reach and at least three cats can hit it)
 * turns that enemy into a fish for `seconds` (boss 4, elite 2.5); the small ones turn the weakest ordinary enemies into fish that fly
 * to the counter (their `enemyDie` carries the reward).
 *
 * Order of one cast: `spCast`; then the big one's `status` (kind 'fish', duration = `seconds`) and, `seconds` later, its `fishEnd`; then,
 * for each small one in the order of `small`, `fish` (the reward, reason 'kill', at the enemy's place) and `enemyDie` (with `transmuted`
 * true and no `hit` before it). Positions are where the enemies stood at the cast (the flasks fly there).
 */
export interface SpFishData {
  /** The elite or boss the big flask turns into a fish, or null (no elite or boss that may be turned, or fewer than three cats can hit it). */
  big: (SpFishTarget & {
    boss: boolean;
    /** Seconds it stays a fish, and the seconds after that during which the same enemy cannot be turned again (the crossed-out fish bone). */
    seconds: number;
    lock: number;
    /** How many cats can hit it right now (the alchemist among them): at least `SP_ROWS.fish.reachMin`. */
    cats: number;
  }) | null;
  /** The weakest ordinary enemies, in the order the flasks fly (4 with a big flask, 5 without; fewer if the field has fewer to give). */
  small: SpFishTarget[];
}

/** The six kinds of a capsule, in the order the odds row rolls them: the colour of the capsule is its kind. */
export const SP_CAPSULE_KINDS = ['fish', 'purr', 'partner', 'more', 'toy', 'guardian'] as const;
export type SpCapsuleKind = (typeof SP_CAPSULE_KINDS)[number];

/**
 * Lucky Capsule! (lucky cat, 3.12): a capsule drops on the cat's head, bounces twice and opens `openDelay` seconds later. The kind is
 * rolled AT THE CAST, so the capsule's colour and mark are known while it falls. `more` opens a second, smaller capsule (`inner`: partner,
 * toy or guardian, never fish and never `more` again) `moreDelay` seconds after.
 */
export interface SpCapsuleData {
  kind: SpCapsuleKind;
  /** The small capsule inside a `more` capsule; null for every other kind. */
  inner: SpCapsuleKind | null;
  /** `BattleApi.time` of the cast, and the seconds until the capsule opens (the prize comes at `at + openDelay`). */
  at: number;
  openDelay: number;
  /** For a `more` capsule: the seconds from its opening to the opening of the small capsule inside (it opens at `at + openDelay + moreDelay`). Always present. */
  moreDelay: number;
  /**
   * True for a fish capsule: the cat's gauge went back to `fishRefund` (half) and not to 0 IN THE CAST TICK, so the ring (`UnitState.sp`, already
   * at the refunded value when this event arrives) should show a bounce back to half when the capsule opens.
   */
  refund: boolean;
}

/**
 * What an opened capsule did (`BattleEvents['capsuleOpen'].result`): `fish` a summon price of fish; `purr` its purr; `seat` a twin of one of the
 * player's cats now stands on a tile next to the original (`summon` event, source 'skill'); `promote` there was no empty tile and the original
 * grew one rank where it stands (`promote` event); `more` the small capsule inside opens a second later; `toy` the toy pick opens at the end of
 * this tick (`relicOffer` with `source: 'capsule'`); `awaken` a legendary awakened for free (`awaken` event with `free: true`); `fallback` the
 * capsule had nothing to give and paid purr instead (the partner's 3, the toy's 5, the guardian's 10, or the 1 of a fish capsule on a full board
 * when that knob is on): the picture shows the promise failing, with hearts instead.
 */
export type SpCapsuleResult = 'fish' | 'purr' | 'seat' | 'promote' | 'more' | 'toy' | 'awaken' | 'fallback';

/** What a cast tells the view, one member per skill. A member exists as soon as the skill's data type does; `SpSkillDef` says which skills are built. */
export type SpPayload =
  | { skill: 'shove'; data: SpShoveData }
  | { skill: 'cut'; data: SpCutData }
  | { skill: 'charge'; data: SpChargeData }
  | { skill: 'clones'; data: SpClonesData }
  | { skill: 'wanted'; data: SpWantedData }
  | { skill: 'lap'; data: SpLapData }
  | { skill: 'cloud'; data: SpCloudData }
  | { skill: 'knock'; data: SpKnockData }
  | { skill: 'meteor'; data: SpMeteorData }
  | { skill: 'jam'; data: SpJamData }
  | { skill: 'fish'; data: SpFishData }
  | { skill: 'capsule'; data: SpCapsuleData };

export interface SpCastCommon {
  /** The cat that cast (still on the board at this point; it may be sold during the scene). */
  unit: UnitState;
  /**
   * True the first time this skill is cast in the run, for any cat. The view shows the skill's name bubble on it and, for a rank 5 skill, the
   * cut-in. Nothing is saved: a resumed run shows them once more.
   */
  first: boolean;
  /** Where the scene is anchored in field px: the cat's cell centre unless the skill's data says otherwise. */
  x: number;
  y: number;
}

/** A skill was cast: `skill` tells which, `data` is its payload. */
export type SpCastEvent = SpCastCommon & SpPayload;

export interface BattleEvents {
  /** A skill was cast: the gauge went back to 0 (see `SpCastEvent`). */
  spCast: SpCastEvent;
  /**
   * A running body (the tiger, the star archer's arrow; `SpRunData`) touched an enemy. Once per enemy and run; the damage follows as an
   * ordinary `hit` of the cat (none when the lap's pool is spent, or kept for the enemies that stood on the field at the cast and an
   * enemy that appeared later is passed: then there is no `spRunHit` either, so draw a star from this event and never from the arrow's
   * place). `x`, `y` is where the enemy stood and `head` how many px of its run the body had covered.
   */
  spRunHit: { runId: number; skill: 'charge' | 'lap'; enemy: EnemyState; x: number; y: number; head: number };
  /**
   * An enemy the lap felled bursts like the passive's kill burst: a circle of `radius` at (`x`, `y`) hurting the enemies it touches
   * (`points`, in skill order; may be empty). Emitted before their `hit` events. A burst never sets off another.
   */
  spRunBurst: { runId: number; skill: 'lap'; x: number; y: number; radius: number; points: StrikePoint[] };
  /** The body reached the end of its run (not emitted if the battle ends first). `hits` = enemies it touched. */
  spRunEnd: { runId: number; skill: 'charge' | 'lap'; unit: UnitState; hits: number };
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
  /** `free` is present (true) only for the lucky cat's guardian capsule: no purr was spent, and the picture uses the short cut-in. The key is absent from the player's own awakenings. */
  awaken: { from: UnitState; result: UnitState; cell: number; free?: true };
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
  /**
   * The gunner's bite (Wanted: One Shot) took `amount` health from an elite or a boss OUTSIDE its damage allowance. It is emitted
   * AFTER the `spCast` of the shot and after the damage was done (`enemy.hp` is already lower; when `killed` the `enemyDie` came first),
   * and it is never a `hit`: the boss bar reads `hit` events as firepower for its estimated time to kill, so a bite must not be one.
   * `share` = `amount` / maximum health; `taken` = the share this target has given in all so far (including this bite), `pool` = the most
   * it can give (0.12, all gunners together).
   */
  bite: { unit: UnitState; enemy: EnemyState; amount: number; share: number; taken: number; pool: number; killed: boolean };
  // ── Step 2: follow-up events of the eight skills built after the first four (the cast itself is `spCast`): cut, clones, cloud, meteor, fish,
  // capsule. The frost queen's knock and the bard's jam need none: everything they do is in their cast.
  /**
   * The lines of a cut open, all at once, in the tick `SpCutData.at + fuse` (a tick later at most, and later still when the fall is due in a
   * wave pause: nothing runs in `prep`, so it opens in the first tick of the next wave). Emitted BEFORE the cut's `hit`s so the scene can
   * flash first. `lines` has one entry per mark of the cast, in the order of `SpCutData.marks`; a `moved` or `lost` line says so (a dead
   * enemy's line moves to a near one, or goes out). `unit` may have been sold: the cut opens anyway. `at` = the cast's time; `cutId` is the
   * `SpCutData.cutId` of the cast the lines belong to (pair them by it, not by `at`).
   */
  cutOpen: { cutId: number; unit: UnitState; at: number; lines: SpCutLine[] };
  /**
   * A clone of `unit` (the ninja; `CloneState.index` `index`) threw its shuriken along with the ninja's volley, aimed at `targetUid` (an
   * enemy the ninja is not aiming at). Emitted in the tick of the volley, after the ninja's own `attack` events. `projectile` is the
   * shuriken in flight (`ghost` true, `unitId` 'r_ninja', starting at the tile's centre). `cell` is the tile it was thrown from (the ninja's
   * own when the clone is `stacked`; then the picture starts the shuriken from the clone's drawn spot), (`x`, `y`) that tile's centre.
   * `left` is how many throws the clone has after this volley; at 0 it goes and a `cloneEnd` (reason 'done') follows at once. A volley with
   * nobody to aim at makes no event and spends nothing. No `attack` event is sent for a clone's throw (the ninja must not swing again).
   */
  cloneThrow: { unit: UnitState; index: number; cell: number; stacked: boolean; x: number; y: number; targetUid: number; left: number; projectile: ProjectileState };
  /**
   * A cat took the tile a clone stood on (a summon, a twin, a gift, a cat dropped onto the empty tile, a partner capsule), or the ninja
   * itself was dropped onto it: the clone hops back to its ninja's tile and stays there overlapped (`CloneState.cell` is -1 from now on).
   * `from` is the tile it left, (`x`, `y`) its centre; `to` is the ninja's tile. Emitted before the event of the cat that took the tile
   * (`summon`, `move`). Draw the hop in about 0.2 s of `BattleApi.time`; the clone keeps its throws.
   */
  cloneStep: { unit: UnitState; index: number; from: number; to: number; x: number; y: number };
  /**
   * A clone went (puff, and a leaf if the reason is 'done'). `cell` is the tile it stood on (-1: it was overlapped on the ninja), (`x`, `y`)
   * the centre of the tile the picture is on. `unit` may be a cat that was just merged, sold or molted (`removed`). Every clone ends with
   * exactly one `cloneEnd`, also when the stage or the battle ends (they are all sent away in the tick it
   * happens: reason 'stage' before `actClear`, and before `victory` when it was the last stage; reason 'end' before `defeat`). A cast that finds the ninja's old clones still there sends them away first (reason 'replaced').
   */
  cloneEnd: { unit: UnitState; index: number; cell: number; x: number; y: number; reason: CloneEndReason };
  /**
   * A bolt of a tagalong cloud (`SpCloudData.cloudId`) falls on its host `hostUid`, standing at (`x`, `y`). `index` counts from 1 up to
   * `bolts`. `points` are the OTHER enemies the splash reaches (within `splashRadius` of the host, in skill order, where they stand; may be
   * empty). Emitted before the bolt's `hit`s (the host's first, then the splash victims'); if the bolt fells the host, `enemyDie` comes
   * between, and a `cloudHop` or `cloudEnd` follows the last `hit`. `unit` may have been sold.
   */
  cloudBolt: { cloudId: number; unit: UnitState; hostUid: number; x: number; y: number; index: number; bolts: number; points: StrikePoint[] };
  /** The cloud's host fell (or left the field): the cloud moves from enemy `fromUid` (last seen at `fromX`, `fromY`) to the near enemy `toUid`. */
  cloudHop: { cloudId: number; fromUid: number; fromX: number; fromY: number; toUid: number; toX: number; toY: number };
  /**
   * The cloud goes: `time` = its life is over, `lost` = the host fell and no enemy was within `hopRadius`. (`hostUid`, `x`, `y`) is the last
   * host and where it was. `bolts` = how many bolts fell in all. Not emitted when the battle ends first. The cloud goes in the tick of its
   * last bolt, after that bolt's `hit`s.
   */
  cloudEnd: { cloudId: number; reason: 'time' | 'lost'; hostUid: number; x: number; y: number; bolts: number };
  /**
   * A ring of the meteor lands: `inner` at `SpMeteorData.at + warn` (the meteor itself comes down: flash, shake), `outer` `outerDelay`
   * seconds later (the shock ring). (`x`, `y`) is the impact, `radius` the ring's size in px (grown by the cat's area bonuses, equal to the
   * radii of the cast payload). `points` are the enemies the ring touches, where they stand, in skill order (may be empty). Emitted BEFORE the
   * ring's `hit`s. The inner landing also starts the crater (its first burn is applied in the same tick, after the inner ring's damage).
   * `meteorId` is the `SpMeteorData.meteorId` of the cast the ring belongs to.
   */
  meteorLand: { meteorId: number; unit: UnitState; ring: 'inner' | 'outer'; x: number; y: number; radius: number; points: StrikePoint[] };
  /**
   * The crater's `SpMeteorData.craterLife` seconds are over (4 s after the inner landing): the scorch fades. The burn already stopped
   * refreshing. `meteorId` names the meteor (and so its crater and its radius).
   */
  craterEnd: { meteorId: number; unit: UnitState; x: number; y: number; radius: number };
  /**
   * The alchemist's big flask wore off: this elite or boss is no fish any more (`EnemyState.fish` is false already) and is locked against
   * the flask for `lock` more seconds (the crossed-out fish bone). Emitted by the enemy's own status step, so it comes at the start of the
   * tick `SpFishData.big.seconds` after the cast (give or take a tick). Not emitted when the enemy dies as a fish: its `enemyDie` ends it.
   */
  fishEnd: { enemy: EnemyState; lock: number };
  /**
   * A lucky cat's capsule opens (`SpCapsuleData.openDelay` after the cast; the small capsule of a `more` capsule `moreDelay` after that, `small`
   * true). `kind` is what the capsule was promised to be (its colour and mark are `SP_ROWS.capsule.marks[kind]`), `result` what it did, decided
   * at this very moment. (`x`, `y`) is the opening spot: the lucky cat's tile centre when it cast (the cat may have moved or been sold since).
   * `inner` is the kind of the small capsule inside a `more` capsule (null otherwise). `purr` is the purr it pays itself (the `purr` result and
   * every `fallback`), 0 otherwise; the fish a `fish` capsule pays arrive as a `fish` event (reason 'skill'; a fraction of a fish waits for the next).
   * `cell` and `origin`: for `seat` the tile the twin takes and the tile of the original it is the twin of; for `promote` the tile of the cat
   * that grows (in both); for `awaken` the awakening cat's tile (in `cell`); -1 otherwise. Emitted BEFORE the events of the prize (`fish`, `purr`,
   * `summon`, `promote`, `awaken`, `relicOffer`), all in the same tick, so the picture can open the lid first and let the prize come out of it.
   */
  capsuleOpen: {
    kind: SpCapsuleKind; small: boolean; inner: SpCapsuleKind | null; x: number; y: number; result: SpCapsuleResult;
    cell: number; origin: number; purr: number;
  };
  /**
   * A cat grew one rank where it stands, with no merge (the partner capsule on a full board): `from` is removed, `result` stands in `cell`
   * (the next rank of the same line, `mergeResultOf`). Not a `merge`: nothing was consumed, `merges` does not go up. A player dragging the
   * cat should let go. The skill gauge's ratio is kept when both cats have a skill; the attack gauge starts at half like any new cat.
   */
  promote: { from: UnitState; result: UnitState; cell: number };

  enemySpawn: { enemy: EnemyState };
  /**
   * `transmuted` is present (true) only when an alchemist's small flask turned the enemy into a fish (Turn Into Fish!): it is NOT a kill in the
   * sense of the passive (no split, no burst, no harvest, no `hit` before it), so a scene should show smoke and a fish flying to the counter
   * (`fish` is the reward, doubled) and not the usual fall. The key is absent from every other death.
   */
  enemyDie: { enemy: EnemyState; x: number; y: number; fish: number; purr: number; killer: UnitState | null; transmuted?: true };
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
  /** `source` is present ('capsule') only when a lucky cat's toy capsule opened the pick in the middle of a wave (`BattleApi.pending.source` says the same). */
  relicOffer: { options: RelicId[]; freeRerolls: number; picksLeft: number; source?: 'capsule' };
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
  /** True when this battle plays with the cats' skills (`BattleInit.sp`, absent = true). When false no gauge moves and no skill casts: draw no rings. */
  readonly spOn: boolean;

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
