/**
 * The numbers the guide's words quote, read from the game's own data tables when a text is built (never typed
 * into a string): changing a balance constant changes every bubble, card and page that mentions it.
 */
import { t } from '@/core/i18n';
import type { ClassId, EnemyId, RarityId, SpecialCellId, UnitId } from '@/game';
import {
  ACT_LENGTH, ACT_PURR, AWAKEN_COST, AWAKEN_MIN_TIER, BASE_FISH_PER_SECOND, BOSS_FISH, BOSS_LIMITS, BOSS_PURR, CALL_FISH_MAX, CALL_FISH_PER_SECOND, CHAPTER_ACTS,
  CHAPTER_WAVES, CLASS_UPGRADE_BONUS, CLASS_UPGRADE_COSTS, DAILY_UNIT_LEVEL, DAILY_WAVES, DANGER_ALARM, DANGER_CAUTION,
  ELITE_FISH, ELITE_LIMITS, ELITE_PURR, ENDLESS_GROWTH, ENEMY_CAP, FREE_REROLLS, HAZARD_WARNING, LASER_COOLDOWN, LASER_DURATION,
  LASER_VULNERABLE, LEVEL_DAMAGE_STEP, MOLT_COSTS, MOLT_LIMIT, OFFER_EVERY, OFFER_OPTIONS, OVERFLOW_GRACE, PITY_LIMIT, PITY_MAX, PITY_STEP,
  RELIC_RARITY_WEIGHTS, REVIVE_BOSS_HP_CUT, REVIVE_BOSS_TIME, REVIVE_CAP_FRACTION, SELL_FISH, SELL_PURR, START_FISH, SUMMON_BASE,
  SUMMON_CAP, SUMMON_GRADE_COSTS, SUMMON_ODDS, SUMMON_STEP, SUN_CELLS, SYNERGY_TIER_AT,
} from '@/game/data/balance';
import { specialCellName, specialCellText } from '@/game/data/cells';
import { classDef } from '@/game/data/classes';
import { BOSS_SPECS, ENEMY_SPECS } from '@/game/data/enemies';
import { MODIFIER_IDS } from '@/game/data/modifiers';
import { waveKindOf } from '@/game/data/waves';
import { CHAPTERS, RARITIES, UNIT_GRID } from '@/game/data/roster';
import { MAX_STAKE } from '@/game/data/roster';
import { stakeText } from '@/game/data/stakes';
import {
  CARD_BASE, CHEST_GEM_PRICE, DAILY_MISSION_CHEST_POINTS, FREE_CHEST_MS, MAX_LEVEL, OFFERS, PATROL_CAP_MS, PATROL_CAP_PASS_MS, PATROL_GOLD_PER_HOUR, PATROL_MIN_MS, STAKE_STEP,
  SWEEP_PAYOUT, TICKET_STOCK, TICKETS_PER_DAY,
} from '@/meta/data/economy';
import {
  CALENDAR, CALENDAR_DAYS, CUP_TIERS, DAILY_CHEST_REWARD, DAILY_MISSIONS, DAILY_FIRST_CLEAR, ENDLESS_TIERS, FEATURE_RULES, PASS_TIERS, PASS_XP_PER_TIER, SEASON_DAYS, WEEKLY_MISSIONS,
} from '@/meta/data/schedule';
import { DUNGEON_ENTRY_GEMS, DUNGEON_FREE_ENTRIES, DUNGEON_VICTORY_MULT } from '@/meta/data/dungeon';
import { GOLD_DUNGEON_WAVES } from '@/game/data/goldDungeon';
import { ODDS, WILD_SHARE } from '@/meta/odds';
import { REVIVE_MIN_WAVES, speedSteps } from '@/view/hud/policy';
import type { TopicId } from './topics';

export type Facts = Record<string, string | number>;

const pct = (v: number): number => Math.round(v * 100);
const list = (v: readonly (string | number)[]): string => v.join(' · ');
const hours = (ms: number): number => Math.round(ms / 3_600_000);
const unitName = (id: UnitId): string => t(`unit.${id}.name`);
const rarityName = (r: RarityId): string => t(`rarity.${r}`);
const lineOf = (c: ClassId): string => UNIT_GRID[c].map(unitName).join(' → ');
const oddsText = (row: readonly number[]): string =>
  row
    .map((p, i) => [p, i] as const)
    .filter(([p]) => p > 0)
    .map(([p, i]) => `${rarityName(RARITIES[i] as RarityId)} ${Math.round(p * 10) / 10}%`)
    .join(' · ');
const weightText = (row: readonly number[]): string =>
  row
    .map((w, i) => [w, i] as const)
    .filter(([w]) => w > 0)
    .map(([w, i]) => `${rarityName(RARITIES[i] as RarityId)} ${w}%`)
    .join(' · ');
const chestOdds = (kind: 'wooden' | 'silver' | 'gold'): string =>
  ODDS[kind].rows.filter((r) => r.p > 0).map((r) => `${t(`rarity.${r.key}`)} ${pct(r.p)}%`).join(' · ');
const tierLines = (c: ClassId): string => ([1, 2, 3] as const).map((n) => classDef(c).tierText(n)).join(' / ');
const abilityLine = (c: ClassId): string => `${t(classDef(c).specialNameKey)}: ${classDef(c).specialText()}`;
const enemyName = (id: EnemyId): string => t(`enemy.${id}.name`);
/** The first wave of a kind and how many waves apart they come (read from the wave table's own rule). */
function waveRhythm(kind: 'elite' | 'boss'): { first: number; gap: number } {
  const waves: number[] = [];
  for (let w = 1; w <= CHAPTER_WAVES && waves.length < 2; w++) if (waveKindOf(w) === kind) waves.push(w);
  return { first: waves[0] as number, gap: (waves[1] as number) - (waves[0] as number) };
}
const secs = (v: number): number => Math.round(v * 10) / 10;

/** The special cell of the battle being played, which the lesson cards name; the guidebook outside a battle names the first kind. */
let focus: SpecialCellId = 'sun';
export function setGuideCell(id: SpecialCellId): void {
  focus = id;
}
/** Every chapter's special cell, one line each: where it is, what it is called and what it does with the real number. */
const cellLines = (): string => CHAPTERS.map((c) => `${t(`chapter.${c.id}.name`)} · ${specialCellName(c.cell)}: ${specialCellText(c.cell)}`).join('\n');
/** What each rank pays to molt, with the rank's name: "Kitten 1 · Street 1 · Alley Boss 2 · King 3" (a guardian cannot molt). */
const moltPrices = (): string => MOLT_COSTS.map((cost, i) => `${rarityName(RARITIES[i] as RarityId)} ${cost}`).join(' · ');

type Spec<K extends keyof typeof BOSS_SPECS> = (typeof BOSS_SPECS)[K];
const boss = <K extends keyof typeof BOSS_SPECS>(k: K): Spec<K> => BOSS_SPECS[k];
const foe = (id: EnemyId) => ENEMY_SPECS[id];

/** One builder per topic that quotes numbers; the rest quote none. */
const BUILDERS: Partial<Record<TopicId, () => Facts>> = {
  summon: () => ({ start: START_FISH, first: SUMMON_BASE, step: SUMMON_STEP, cap: SUMMON_CAP, rate: BASE_FISH_PER_SECOND }),
  summon_grade: () => ({
    costs: list(SUMMON_GRADE_COSTS),
    top: SUMMON_ODDS.length,
    odds1: oddsText(SUMMON_ODDS[0] as readonly number[]),
    oddsTop: oddsText(SUMMON_ODDS[SUMMON_ODDS.length - 1] as readonly number[]),
  }),
  pity: () => ({ limit: PITY_LIMIT, step: pct(PITY_STEP), max: pct(PITY_MAX) }),
  merge: () => ({ a: unitName('w_paw'), b: unitName('w_sword') }),
  class_lines: () => ({ warrior: lineOf('warrior'), ranger: lineOf('ranger'), mage: lineOf('mage'), trickster: lineOf('trickster') }),
  acts: () => ({ actLen: ACT_LENGTH, acts: CHAPTER_ACTS, waves: CHAPTER_WAVES }),
  lose_gauge: () => ({ cap: ENEMY_CAP, grace: OVERFLOW_GRACE, caution: Math.round(ENEMY_CAP * DANGER_CAUTION), alarm: Math.round(ENEMY_CAP * DANGER_ALARM) }),
  lose_boss: () => ({ elite: list(ELITE_LIMITS), boss: list(BOSS_LIMITS) }),
  continue: () => ({
    minWave: REVIVE_MIN_WAVES, gems: OFFERS.revive.gems, cap: pct(REVIVE_CAP_FRACTION), hp: pct(REVIVE_BOSS_HP_CUT), time: REVIVE_BOSS_TIME,
  }),
  classes: () => ({
    warrior: t('class.warrior.name'), warriorRole: t('class.warrior.role'),
    ranger: t('class.ranger.name'), rangerRole: t('class.ranger.role'),
    mage: t('class.mage.name'), mageRole: t('class.mage.role'),
    trickster: t('class.trickster.name'), tricksterRole: t('class.trickster.role'),
  }),
  synergy: () => ({
    a: SYNERGY_TIER_AT[0] as number, b: SYNERGY_TIER_AT[1] as number, c: SYNERGY_TIER_AT[2] as number,
    kitten: rarityName(RARITIES[0] as RarityId), guardian: rarityName(RARITIES[RARITIES.length - 1] as RarityId),
    warrior: tierLines('warrior'), ranger: tierLines('ranger'), mage: tierLines('mage'), trickster: tierLines('trickster'),
    warriorAbility: abilityLine('warrior'), rangerAbility: abilityLine('ranger'), mageAbility: abilityLine('mage'), tricksterAbility: abilityLine('trickster'),
  }),
  class_sheet: () => ({ a: SYNERGY_TIER_AT[0] as number, c: SYNERGY_TIER_AT[2] as number, kitten: rarityName(RARITIES[0] as RarityId) }),
  class_upgrade: () => ({ bonus: pct(CLASS_UPGRADE_BONUS), costs: list(CLASS_UPGRADE_COSTS), max: CLASS_UPGRADE_COSTS.length }),
  pick3: () => ({ every: OFFER_EVERY, options: OFFER_OPTIONS }),
  purr: () => ({ elite: ELITE_PURR, boss: BOSS_PURR, act: ACT_PURR, molt: moltPrices(), awaken: AWAKEN_COST }),
  molt: () => ({ prices: moltPrices(), limit: MOLT_LIMIT }),
  awaken: () => ({ tier: AWAKEN_MIN_TIER, kinds: SYNERGY_TIER_AT[AWAKEN_MIN_TIER - 1] as number, cost: AWAKEN_COST }),
  sell: () => ({
    f1: SELL_FISH[0] as number, f2: SELL_FISH[1] as number, f3: SELL_FISH[2] as number, f4: SELL_FISH[3] as number, f5: SELL_FISH[4] as number,
    purr: list(SELL_PURR.slice(2)),
  }),
  sun: () => ({ cells: SUN_CELLS, cell: specialCellName(focus), kinds: cellLines() }),
  hazards: () => ({
    warn: secs(HAZARD_WARNING), wet: foe('spray').hazardPulse?.duration ?? 0, zap: boss('lightning').duration,
  }),
  laser: () => ({ dur: LASER_DURATION, cd: LASER_COOLDOWN, vuln: pct(LASER_VULNERABLE) }),
  call_wave: () => ({ rate: CALL_FISH_PER_SECOND, max: CALL_FISH_MAX }),
  speed: () => ({ fast: speedSteps(false, false).at(-1) as number, faster: speedSteps(true, false).at(-1) as number }),
  toys: () => ({
    options: OFFER_OPTIONS,
    early: weightText(RELIC_RARITY_WEIGHTS[0] as readonly number[]),
    mid: weightText(RELIC_RARITY_WEIGHTS[1] as readonly number[]),
    late: weightText(RELIC_RARITY_WEIGHTS[2] as readonly number[]),
  }),
  toy_reroll: () => ({ free: FREE_REROLLS, gems: OFFERS.relic_reroll.gems }),
  stakes: () => ({
    max: MAX_STAKE, reward: pct(STAKE_STEP), s1: stakeText(1), s2: stakeText(2), s3: stakeText(3), s4: stakeText(4), s5: stakeText(5),
  }),
  elite: () => ({
    time: ELITE_LIMITS[0] as number, fish: ELITE_FISH, purr: ELITE_PURR, rage: pct(boss('enrage').maxBonus), ...waveRhythm('elite'),
  }),
  boss: () => ({ time: BOSS_LIMITS[0] as number, fish: BOSS_FISH, purr: BOSS_PURR, ...waveRhythm('boss') }),
  boss_vacuum: () => ({ name: enemyName('boss_vacuum'), every: boss('inhale').cooldown, dur: boss('inhale').duration, taken: pct(1 - boss('inhale').damageTaken) }),
  boss_blender: () => ({ name: enemyName('boss_blender'), every: boss('whirl').cooldown, dur: boss('whirl').duration, speed: pct(boss('whirl').speed) }),
  boss_bath: () => ({
    name: enemyName('boss_bath'), every: boss('splash').spawnEvery, count: boss('splash').spawnCount, soak: boss('splash').soakEvery, cells: boss('splash').soakCells,
    dur: boss('splash').soakDuration,
  }),
  boss_cloud: () => ({ name: enemyName('boss_cloud'), every: boss('lightning').cooldown, dur: boss('lightning').duration }),
  boss_needle: () => ({ name: enemyName('boss_needle'), every: boss('vaccinate').cooldown, dur: boss('vaccinate').duration, heal: pct(boss('vaccinate').regen) }),
  trait_armored: () => ({ name: t('trait.armored.name'), armor: pct(foe('roomba').armor) }),
  trait_warded: () => ({ name: t('trait.warded.name'), ward: pct(foe('tangerine').ward) }),
  trait_fast: () => ({ name: t('trait.fast.name'), speed: foe('drop').speed, normal: foe('cucumber').speed }),
  trait_swarm: () => ({ name: t('trait.swarm.name'), hp: pct(foe('dust').hpMult) }),
  trait_split: () => ({ name: t('trait.split.name'), count: foe('balloon').split?.count ?? 0 }),
  trait_haste_aura: () => ({ name: t('trait.haste_aura.name'), haste: pct(foe('clock').aura?.value ?? 0) }),
  trait_heal_aura: () => ({ name: t('trait.heal_aura.name'), heal: pct(foe('pill').aura?.value ?? 0) }),
  trait_shield: () => ({ name: t('trait.shield.name'), shield: pct(foe('cone').shield ?? 0) }),
  trait_weaken: () => ({ name: t('trait.weaken.name'), every: foe('dryer').weakenPulse?.every ?? 0, dur: foe('dryer').weakenPulse?.duration ?? 0 }),
  cards: () => ({ max: MAX_LEVEL, dmg: pct(LEVEL_DAMAGE_STEP), first: CARD_BASE[0] as number, last: CARD_BASE[CARD_BASE.length - 1] as number }),
  wild_cards: () => ({ share: pct(WILD_SHARE) }),
  chests: () => ({
    wood: chestOdds('wooden'), silver: chestOdds('silver'), gold: chestOdds('gold'),
    woodCards: ODDS.wooden.cards, silverCards: ODDS.silver.cards, goldCards: ODDS.gold.cards,
    every: ODDS.gold.pity?.every ?? 0, bonus: ODDS.gold.pity?.bonusCards ?? 0, silverGems: CHEST_GEM_PRICE.silver, goldGems: CHEST_GEM_PRICE.gold,
    silverGuarantee: ODDS.silver.guarantees[0]?.count ?? 0, goldGuarantee: ODDS.gold.guarantees[0]?.count ?? 0,
  }),
  free_chest: () => ({ hours: hours(FREE_CHEST_MS), skip: OFFERS.chest_skip.gems }),
  missions: () => ({ daily: DAILY_MISSIONS.length, weekly: WEEKLY_MISSIONS.length, runs: DAILY_MISSIONS[0]?.target ?? 0 }),
  daily_chest: () => ({ points: DAILY_MISSION_CHEST_POINTS, gems: DAILY_CHEST_REWARD.gems ?? 0 }),
  calendar: () => ({
    days: CALENDAR_DAYS,
    gold: list(CALENDAR.flatMap((b, i) => (b.chests?.gold ? [i + 1] : []))),
  }),
  pass: () => ({ tiers: PASS_TIERS, xp: PASS_XP_PER_TIER, days: SEASON_DAYS }),
  patrol: () => ({
    gold: PATROL_GOLD_PER_HOUR, cap: hours(PATROL_CAP_MS), capPass: hours(PATROL_CAP_PASS_MS), min: Math.round(PATROL_MIN_MS / 60_000),
  }),
  sweep: () => ({ tickets: TICKETS_PER_DAY, pay: pct(SWEEP_PAYOUT), stock: TICKET_STOCK }),
  daily_challenge: () => ({ waves: DAILY_WAVES, level: DAILY_UNIT_LEVEL, rules: MODIFIER_IDS.length, chest: DAILY_FIRST_CLEAR.chests?.silver ?? 0 }),
  weekly_cup: () => ({ best: 7 * DAILY_WAVES, t1: CUP_TIERS[0]?.min ?? 0, t2: CUP_TIERS[1]?.min ?? 0, t3: CUP_TIERS[2]?.min ?? 0 }),
  gold_dungeon: () => ({ waves: GOLD_DUNGEON_WAVES, free: DUNGEON_FREE_ENTRIES, gems: DUNGEON_ENTRY_GEMS, win: DUNGEON_VICTORY_MULT }),
  endless: () => ({
    chapter: FEATURE_RULES.endless.chapter ?? 0, w1: ENDLESS_TIERS[0]?.wave ?? 0, w2: ENDLESS_TIERS[1]?.wave ?? 0, w3: ENDLESS_TIERS[2]?.wave ?? 0,
    growth: pct(ENDLESS_GROWTH - 1),
  }),
};

/** The numbers topic `id` quotes, in the current language (names are translated). */
export function factsOf(id: TopicId): Facts {
  return BUILDERS[id]?.() ?? {};
}

