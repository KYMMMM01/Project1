/**
 * The gold dungeon's wave script: eight short waves of gold coins and, at the end of the last one, a treasure chest. It is a pay day, not
 * a test (2026-10-12): the coins are few and thin, the chest is slow and has no trick that hurts, and a board of any kind is meant to win.
 * Waves 1 to 7 are normal waves that end on the wave clock (15 s); the fourth closes the first stage on the clock (see `endNormalWave`).
 * Wave 8 is a boss wave: the chest walks in at once with a few coins as its escort, the wave ends when it falls, and that is the victory.
 * Only `coin` and `boss_treasure` appear here, and they appear nowhere else. What the run pays is the meta layer's business
 * (docs/명세_메타.md section 13).
 */
import { BOSS_SPECS, budgetMult, enemySpec } from './enemies';
import { actOf, waveEntries, type WaveScript } from './waves';

/** Two stages of four waves; the chest at the end of the second is the victory. */
export const GOLD_DUNGEON_WAVES = 8;

/**
 * The chest's health at tier 1; a tier multiplies it by its chapter's health multiple like any other enemy (`CHAPTER_HP_MULT`). For
 * scale: a tier-1 cucumber of the last wave has 209, and the chapter-1 boss has 1,431 x 1.18 = 1,688 at the same wave, with a clock of 50 s.
 */
export const GOLD_DUNGEON_BOSS_HP = 600;
/**
 * The chest's time limit, seconds: generous, the longest a boss has (BOSS_LIMITS goes 50 / 55 / 60). A boss cannot be melted in less than
 * `BOSS_MIN_KILL` of its limit (balance.ts: 27 s of these 60), so the limit is also what keeps the chest on the field long enough to be a moment.
 */
export const GOLD_DUNGEON_BOSS_LIMIT = 60;

/** Coins in waves 1 to 7, then the chest's escort in wave 8 (the chest itself is not in this list). */
const COINS: readonly number[] = [10, 12, 13, 14, 15, 16, 17, 24];

/** The script of `wave` (1..GOLD_DUNGEON_WAVES; anything else is clamped). */
export function goldDungeonScript(wave: number): WaveScript {
  const n = Math.min(Math.max(Math.floor(wave), 1), GOLD_DUNGEON_WAVES);
  const last = n === GOLD_DUNGEON_WAVES;
  return {
    wave: n, act: actOf(n), kind: last ? 'boss' : 'normal', boss: last ? 'boss_treasure' : null,
    groups: [{ enemy: 'coin', weight: 1 }], budget: (COINS[n - 1] as number) * budgetMult('coin'),
  };
}

/**
 * Enemies a whole run spawns: the coins of the waves, the chest, and the coins it spills. This is the most kills a run can have, and
 * what the payout table (`dungeonMaxGold`) and the codex count on.
 */
export function goldDungeonSpawns(): number {
  let n = 0;
  for (let wave = 1; wave <= GOLD_DUNGEON_WAVES; wave++) {
    for (const e of waveEntries(goldDungeonScript(wave))) n += e.count * (1 + (enemySpec(e.enemy).split?.count ?? 0));
  }
  const spill = BOSS_SPECS.spill;
  return n + spill.at.length * spill.count;
}
