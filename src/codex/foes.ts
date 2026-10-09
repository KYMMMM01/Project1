/**
 * The numbers behind the codex's monster pages, all read from the game's own tables when asked (never copied): health at a
 * chapter and butler level, the elites' and bosses' time limits, their resistance to control, the damage allowance that keeps
 * them from being melted, their abilities and the tips that follow from those numbers. Pure: no Pixi, no text (foeText.ts words them).
 */
import { ENEMY_IDS, UNIT_IDS, type ClassId, type DamageType, type EnemyId, type UnitId, type WaveKind } from '@/game/api';
import {
  BOSS_CAP_BURST, BOSS_FISH, BOSS_MIN_KILL, BOSS_PURR, CHAPTER_COUNT, CHAPTER_HP_MULT, CHAPTER_WAVES, ELITE_CC_FACTOR, ELITE_FISH, ELITE_PURR, ENRAGE_COOLDOWN_MULT,
  ENRAGE_HP_FRACTION, HAZARD_BLOCK_SIDE, LASER_DURATION, LASER_VULNERABLE, PULL_BOSS_FACTOR, PULL_ELITE_FACTOR, SLOW_CAP, SLOW_CAP_BOSS, hpIndex, specialHp,
  specialLimit,
} from '@/game/data/balance';
import { BOSS_SPECS, ENEMY_SPECS } from '@/game/data/enemies';
import { MAX_STAKE, unitClass } from '@/game/data/roster';
import { stakeRules } from '@/game/data/stakes';
import { unitSpec } from '@/game/data/units';
import { chapterWaves, waveKindOf } from '@/game/data/waves';
import { relicSpec } from '@/game/data/relics';

/** The chapter and butler level a page's numbers are for. */
export interface Level {
  chapter: number;
  stake: number;
}

export const DEFAULT_LEVEL: Level = { chapter: 1, stake: 0 };

export function clampLevel(level: Level): Level {
  return {
    chapter: Math.min(CHAPTER_COUNT, Math.max(1, Math.floor(level.chapter))),
    stake: Math.min(MAX_STAKE, Math.max(0, Math.floor(level.stake))),
  };
}

export type FoeRank = 'normal' | 'elite' | 'boss';

/** An enemy's rank is its own trait: the elites are the ones that end an elite wave, the bosses end a boss wave. */
export function foeRank(id: EnemyId): FoeRank {
  const traits = ENEMY_SPECS[id].traits;
  return traits.includes('boss') ? 'boss' : traits.includes('elite') ? 'elite' : 'normal';
}

/** Every enemy in the order of the data: ordinary ones first, then the elites, then the bosses. */
export const FOE_IDS: readonly EnemyId[] = ENEMY_IDS;

/** The wave kind a rank ends: an elite ends an elite wave, a boss a boss wave. */
function targetKind(rank: FoeRank): 'elite' | 'boss' | null {
  return rank === 'normal' ? null : rank;
}

/** Elite and boss health and limits come in three steps, one per eight waves. */
function ordinalOf(wave: number): number {
  return Math.floor((wave - 1) / 8);
}

export function chapterMult(chapter: number): number {
  return CHAPTER_HP_MULT[Math.min(CHAPTER_COUNT, Math.max(1, chapter)) - 1] as number;
}

/** Health of one cucumber of `wave` in `chapter`: the unit every ordinary enemy's multiple counts. */
function cucumberHealth(chapter: number, wave: number): number {
  return hpIndex(wave) * chapterMult(chapter);
}

// ───────────────────────────── where an enemy appears ─────────────────────────────

export interface Slot {
  wave: number;
  kind: WaveKind;
  /** The enemy whose defeat ends the wave (an elite or a boss), as opposed to one of the wave's ordinary members. */
  target: boolean;
}

/** The enemy that pops into this one when it falls (a mini balloon comes from a balloon), or null. */
export function splitParent(id: EnemyId): EnemyId | null {
  for (const other of ENEMY_IDS) if (ENEMY_SPECS[other].split?.into === id) return other;
  return null;
}

/** The waves of `chapter` an enemy walks in; a split child counts the waves of the enemy it comes from. */
export function slotsIn(id: EnemyId, chapter: number): Slot[] {
  const via = splitParent(id) ?? id;
  const out: Slot[] = [];
  for (const script of chapterWaves(chapter)) {
    if (script.boss === id) out.push({ wave: script.wave, kind: script.kind, target: true });
    else if (script.groups.some((g) => g.enemy === via)) out.push({ wave: script.wave, kind: script.kind, target: false });
  }
  return out;
}

/** The waves of every chapter the enemy walks in (a chapter without it is left out). */
export function appearances(id: EnemyId): Array<{ chapter: number; waves: number[] }> {
  const out: Array<{ chapter: number; waves: number[] }> = [];
  for (let chapter = 1; chapter <= CHAPTER_COUNT; chapter++) {
    const waves = slotsIn(id, chapter).map((s) => s.wave);
    if (waves.length > 0) out.push({ chapter, waves });
  }
  return out;
}

// ───────────────────────────── health ─────────────────────────────

export interface HealthPoint {
  wave: number;
  hp: number;
}

/** An ordinary enemy's health at its first and last wave of the chapter, or null when it does not come in that chapter. */
export function healthSpan(id: EnemyId, level: Level): { first: HealthPoint; last: HealthPoint } | null {
  const slots = slotsIn(id, level.chapter);
  if (slots.length === 0) return null;
  const mult = ENEMY_SPECS[id].hpMult;
  const at = (wave: number): HealthPoint => ({ wave, hp: cucumberHealth(level.chapter, wave) * mult });
  return { first: at((slots[0] as Slot).wave), last: at((slots[slots.length - 1] as Slot).wave) };
}

/** What the damage allowance of a time-limited enemy comes to (BOSS_MIN_KILL, BOSS_CAP_BURST). */
export interface CapRule {
  /** The most damage that can go in per second. */
  perSecond: number;
  /** The same as a share of the enemy's health, percent. */
  percent: number;
  /** The shortest time any board needs, seconds. */
  minSeconds: number;
  /** How many seconds' worth of allowance can be spent at once, and how much that is. */
  burstSeconds: number;
  burst: number;
}

export function capRule(hp: number, limit: number): CapRule {
  const perSecond = hp / (BOSS_MIN_KILL * limit);
  return { perSecond, percent: 100 / (BOSS_MIN_KILL * limit), minSeconds: BOSS_MIN_KILL * limit, burstSeconds: BOSS_CAP_BURST, burst: perSecond * BOSS_CAP_BURST };
}

export interface TargetRow {
  wave: number;
  kind: 'elite' | 'boss';
  ordinal: number;
  /** True when the enemy does not walk this wave of the chapter: the row says what it would have. */
  imagined: boolean;
  hp: number;
  /** The same as a multiple of the wave's cucumber. */
  times: number;
  /** The time limit with the butler level's cut taken off, the limit before the cut, and the cut. */
  limit: number;
  limitBase: number;
  cut: number;
  cap: CapRule;
}

/** The waves of a kind: elites come at 4, 12, 20, bosses at 8, 16, 24. */
function waveSlotsOf(kind: 'elite' | 'boss'): number[] {
  const waves: number[] = [];
  for (let w = 1; w <= CHAPTER_WAVES; w++) if (waveKindOf(w) === kind) waves.push(w);
  return waves;
}

/** One row for each wave of the chapter this elite or boss ends; if it comes in none, the three waves of its kind as they would be. */
export function targetRows(id: EnemyId, level: Level): TargetRow[] {
  const kind = targetKind(foeRank(id));
  if (!kind) return [];
  const rules = stakeRules(level.stake);
  const real = slotsIn(id, level.chapter).filter((s) => s.target);
  const waves = real.length > 0 ? real.map((s) => s.wave) : waveSlotsOf(kind);
  return waves.map((wave) => {
    const ordinal = ordinalOf(wave);
    const hp = specialHp(kind, ordinal) * chapterMult(level.chapter) * rules.specialHpMult;
    const limitBase = specialLimit(kind, ordinal);
    const limit = limitBase - rules.bossTimeCut;
    return {
      wave, kind, ordinal, imagined: real.length === 0, hp, times: hp / cucumberHealth(level.chapter, wave),
      limit, limitBase, cut: rules.bossTimeCut, cap: capRule(hp, limit),
    };
  });
}

/** Seconds a toy adds to every elite and boss limit (the hourglass). */
export function limitToy(): { toy: 'hourglass'; seconds: number } {
  return { toy: 'hourglass', seconds: relicSpec('hourglass').fx.bossTime ?? 0 };
}

// ───────────────────────────── stats and resistance ─────────────────────────────

export interface FoeStats {
  hpMult: number;
  speed: number;
  /** An ordinary cucumber's speed, for comparison. */
  baseSpeed: number;
  armorPct: number;
  wardPct: number;
  /** The share of every slow that does not land on it (the slow that lands is cap x (1 - this)), percent. */
  slowResistPct: number;
  /** Fish paid for the kill and purr with it (an elite or a boss pays the wave-kind amount, not its own bounty). */
  fish: number;
  purr: number;
}

const pct = (v: number): number => Math.round(v * 100);

export function foeStats(id: EnemyId): FoeStats {
  const spec = ENEMY_SPECS[id];
  const rank = foeRank(id);
  const fish = rank === 'boss' ? BOSS_FISH : rank === 'elite' ? ELITE_FISH : spec.bounty;
  const purr = rank === 'boss' ? BOSS_PURR : rank === 'elite' ? ELITE_PURR : 0;
  return { hpMult: spec.hpMult, speed: spec.speed, baseSpeed: ENEMY_SPECS.cucumber.speed, armorPct: pct(spec.armor), wardPct: pct(spec.ward), slowResistPct: pct(spec.slowResist), fish, purr };
}

export type StunRule = 'full' | 'half' | 'none';

export interface Resistance {
  /** The cap on one slow, percent, before the enemy's own slow resistance (`FoeStats.slowResistPct`) takes its share off what lands. */
  slowCapPct: number;
  /** How well stun and freeze work: all of it, the shortened share, or not at all. */
  stun: StunRule;
  stunPct: number;
  /** How much of a black hole's pull-back it feels, percent. */
  pullPct: number;
}

export function resistanceOf(id: EnemyId): Resistance {
  const rank = foeRank(id);
  const special = rank !== 'normal';
  return {
    slowCapPct: pct(special ? SLOW_CAP_BOSS : SLOW_CAP),
    stun: rank === 'boss' ? 'none' : rank === 'elite' ? 'half' : 'full',
    stunPct: pct(rank === 'elite' ? ELITE_CC_FACTOR : 1),
    pullPct: pct(rank === 'boss' ? PULL_BOSS_FACTOR : rank === 'elite' ? PULL_ELITE_FACTOR : 1),
  };
}

/** What happens at half health: the cooldowns of its abilities get shorter. */
export function enrageRule(): { hpPct: number; shorterPct: number } {
  return { hpPct: pct(ENRAGE_HP_FRACTION), shorterPct: pct(1 - ENRAGE_COOLDOWN_MULT) };
}

// ───────────────────────────── abilities ─────────────────────────────

/** A kind of ability a page can describe; each has `codex.ability.<kind>.name` and `.text` and the numbers in `vars`. */
export type AbilityKind =
  | 'enrage' | 'inhale' | 'whirl' | 'splash' | 'lightning' | 'vaccinate'
  | 'aura_haste' | 'aura_heal' | 'shield' | 'split' | 'weaken' | 'wet_pulse' | 'death_burst';

export interface Ability {
  kind: AbilityKind;
  /** Numbers to fill in; `name` entries are i18n keys of a name (the child of a split, what a boss spawns). */
  vars: Record<string, number>;
  names: Record<string, EnemyId>;
}

export function abilitiesOf(id: EnemyId): Ability[] {
  const spec = ENEMY_SPECS[id];
  const out: Ability[] = [];
  const add = (kind: AbilityKind, vars: Record<string, number>, names: Record<string, EnemyId> = {}): void => {
    out.push({ kind, vars, names });
  };
  if (spec.aura?.kind === 'haste') add('aura_haste', { radius: spec.aura.radius, pct: pct(spec.aura.value) });
  if (spec.aura?.kind === 'heal') add('aura_heal', { radius: spec.aura.radius, pct: pct(spec.aura.value) });
  if (spec.shield) add('shield', { pct: pct(spec.shield) });
  if (spec.split) add('split', { count: spec.split.count }, { into: spec.split.into });
  if (spec.weakenPulse) add('weaken', { every: spec.weakenPulse.every, dur: spec.weakenPulse.duration });
  if (spec.hazardPulse) add('wet_pulse', { every: spec.hazardPulse.every, dur: spec.hazardPulse.duration, cells: spec.hazardPulse.cells });
  if (spec.deathBurst) add('death_burst', { radius: spec.deathBurst.radius, pct: pct(spec.deathBurst.haste), dur: spec.deathBurst.duration });
  switch (spec.ability) {
    case 'enrage': add('enrage', { pct: pct(BOSS_SPECS.enrage.maxBonus) }); break;
    case 'inhale': add('inhale', { every: BOSS_SPECS.inhale.cooldown, dur: BOSS_SPECS.inhale.duration, pct: pct(1 - BOSS_SPECS.inhale.damageTaken) }); break;
    case 'whirl': add('whirl', { every: BOSS_SPECS.whirl.cooldown, dur: BOSS_SPECS.whirl.duration, pct: pct(BOSS_SPECS.whirl.speed) }); break;
    case 'splash': {
      const b = BOSS_SPECS.splash;
      add('splash', { every: b.spawnEvery, count: b.spawnCount, soakEvery: b.soakEvery, cells: b.soakCells, dur: b.soakDuration }, { spawn: b.spawn });
      break;
    }
    case 'lightning': add('lightning', { every: BOSS_SPECS.lightning.cooldown, dur: BOSS_SPECS.lightning.duration, side: HAZARD_BLOCK_SIDE }); break;
    case 'vaccinate': add('vaccinate', { every: BOSS_SPECS.vaccinate.cooldown, dur: BOSS_SPECS.vaccinate.duration, pct: pct(BOSS_SPECS.vaccinate.regen) }); break;
    default: break;
  }
  return out;
}

/** Abilities that come round on a cooldown: only they have anything to gain from the half-health rage. */
const PERIODIC: ReadonlySet<AbilityKind> = new Set<AbilityKind>(['inhale', 'whirl', 'splash', 'lightning', 'vaccinate', 'wet_pulse']);

/** True for an elite or boss whose abilities come on a cooldown, so that the rage at half health speeds them up. */
export function rageApplies(id: EnemyId): boolean {
  return foeRank(id) !== 'normal' && abilitiesOf(id).some((a) => PERIODIC.has(a.kind));
}

// ───────────────────────────── tips ─────────────────────────────

/** A defence at or above this share is worth a tip of its own. */
const TIP_DEFENCE_PCT = 25;

export type TipKind =
  | 'armor' | 'ward' | 'open' | 'time' | 'stun_none' | 'stun_half'
  | 'enrage' | 'inhale' | 'whirl' | 'splash' | 'lightning' | 'vaccinate' | 'wet_pulse' | 'death_burst';

export interface Tip {
  kind: TipKind;
  vars: Record<string, number>;
}

/** The cats that peel armour: a hit that breaks it (the viking's) or a stomp that does (the tiger's). */
export function armourBreakers(): UnitId[] {
  return UNIT_IDS.filter((id) => {
    const a = unitSpec(id).attack;
    if (a.shape === 'blast') return a.stomp.breakAmount > 0;
    return 'effect' in a && a.effect?.kind === 'armor_break';
  });
}

/** The classes whose cats deal this kind of damage. */
export function classesDealing(type: DamageType): ClassId[] {
  const out: ClassId[] = [];
  for (const id of UNIT_IDS) {
    const c = unitClass(id);
    if (unitSpec(id).damageType === type && !out.includes(c)) out.push(c);
  }
  return out;
}

/** The advice that follows from an enemy's own numbers: its defences, how it can be controlled, its ability and its clock. */
export function tipsOf(id: EnemyId, level: Level): Tip[] {
  const rank = foeRank(id);
  if (rank === 'normal') return [];
  const stats = foeStats(id);
  const tips: Tip[] = [];
  if (stats.armorPct >= TIP_DEFENCE_PCT) tips.push({ kind: 'armor', vars: { armor: stats.armorPct } });
  if (stats.wardPct >= TIP_DEFENCE_PCT) tips.push({ kind: 'ward', vars: { ward: stats.wardPct } });
  if (stats.armorPct < TIP_DEFENCE_PCT && stats.wardPct < TIP_DEFENCE_PCT) tips.push({ kind: 'open', vars: { armor: stats.armorPct, ward: stats.wardPct } });
  for (const a of abilitiesOf(id)) {
    if (a.kind === 'enrage' || a.kind === 'inhale' || a.kind === 'whirl' || a.kind === 'splash' || a.kind === 'lightning' || a.kind === 'vaccinate'
      || a.kind === 'wet_pulse' || a.kind === 'death_burst') tips.push({ kind: a.kind, vars: a.vars });
  }
  const res = resistanceOf(id);
  tips.push(res.stun === 'none' ? { kind: 'stun_none', vars: { slow: res.slowCapPct } } : { kind: 'stun_half', vars: { slow: res.slowCapPct, stun: res.stunPct } });
  const rows = targetRows(id, level);
  const row = rows[rows.length - 1];
  if (row) tips.push({ kind: 'time', vars: { limit: row.limit, min: row.cap.minSeconds, vuln: pct(LASER_VULNERABLE), dur: LASER_DURATION } });
  return tips;
}
