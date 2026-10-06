/**
 * Progression report: a free player doing 3 runs and 3 rewarded ads a day, simulated through the real
 * profile commands. It prints; it never fails on a number. The battle itself is a model (see
 * `winChance`), so the curve is only as honest as that model: docs/handoff/meta.md says how.
 */
import { describe, expect, it } from 'vitest';
import type { RunStats } from '@/game/api';
import { Rng } from '@/core/rng';
import { CHAPTER_WAVES } from '@/meta/data/economy';
import { canPlayStake, sweepPayout } from '@/meta/rewards';
import { createTestProfile, at } from '@/meta/testing';
import type { Profile } from '@/meta/profile';
import { CHEST_KINDS, CHEST_RARITIES, TRAINING_IDS, type ChestRarity, type Reason } from '@/meta/types';
import { UNITS_BY_RARITY, totalCardsTo } from '@/meta/units';

/** Two visits a day: one run and one ad in the morning, two runs and two ads in the evening. */
const SESSIONS = [{ hour: 8, runs: 1, treats: [0] }, { hour: 20, runs: 2, treats: [1, 2] }];
const RUNS_PER_DAY = 3;
const REPORT_DAYS = [1, 3, 7, 14, 30, 60];

/** The level a stage is recommended for: a player at exactly this power wins half the time (GDD 7.2: chapter 5 = 4 .. 8). */
function recommended(chapter: number, stake: number): number {
  return 1 + 0.75 * (chapter - 1) + 0.7 * stake;
}

function power(profile: Profile): number {
  const d = profile.data;
  const levels = Object.values(d.levels);
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  const trained = TRAINING_IDS.reduce((a, id) => a + d.training[id], 0);
  return mean + 0.03 * trained;
}

function winChance(profile: Profile, chapter: number, stake: number): number {
  return 1 / (1 + Math.exp(-(power(profile) - recommended(chapter, stake)) / 0.7));
}

function synthStats(profile: Profile, mode: RunStats['mode'], chapter: number, stake: number, rng: Rng): RunStats {
  const p = mode === 'daily' ? 0.35 : winChance(profile, chapter, stake);
  const total = mode === 'daily' ? 20 : CHAPTER_WAVES;
  const victory = rng.chance(p);
  const waves = victory ? total : Math.max(1, Math.min(total - 1, Math.round(total * (0.25 + 0.55 * p) * rng.range(0.8, 1.15))));
  return {
    mode, chapter, stake, seed: rng.int(1, 1e9), victory, wavesCleared: waves, totalWaves: total, kills: waves * 12,
    bossesKilled: Math.floor(waves / 6) + (victory ? 1 : 0), summons: waves * 2, merges: Math.round(waves * 1.1), molts: 0,
    awakenings: 0, relics: Array.from({ length: Math.min(8, Math.floor(waves / 3) + 1) }, () => 'yarn_ball' as const),
    bestRarity: 'epic', peakEnemies: 20, duration: waves * 20, revived: false, summonLuck: 0.5, damageByUnit: {},
  };
}

/**
 * A completionist: always the easiest stage not cleared yet that the player wins about half the time
 * (so no first-clear reward is skipped); when none is in reach, the best-paying stage that is still
 * a likely win.
 */
function pickStage(profile: Profile): { chapter: number; stake: number } {
  const cleared = profile.data.cleared;
  let first: { chapter: number; stake: number; rec: number } | null = null;
  let farm = { chapter: 1, stake: 0, score: -1 };
  for (let chapter = 1; chapter <= 5; chapter++) {
    for (let stake = 0; stake <= 5; stake++) {
      if (!canPlayStake(cleared, chapter, stake)) continue;
      const p = winChance(profile, chapter, stake);
      const rec = recommended(chapter, stake);
      if (stake === (cleared[chapter - 1] ?? 0) && p >= 0.5 && (first === null || rec < first.rec)) first = { chapter, stake, rec };
      const score = p >= 0.45 ? 100 + (1 + 0.3 * (chapter - 1)) * (1 + 0.15 * stake) : p;
      if (score > farm.score) farm = { chapter, stake, score };
    }
  }
  return first ?? farm;
}

async function openAll(profile: Profile): Promise<void> {
  for (const kind of CHEST_KINDS) while (profile.data.chests[kind] > 0) await profile.openChest(kind);
}

async function spendAll(profile: Profile): Promise<void> {
  for (let round = 0; round < 6; round++) {
    let acted = false;
    for (;;) {
      const options = profile.units().filter((u) => u.quote.enoughCards && u.quote.enoughGold);
      if (options.length === 0) break;
      // The strongest cats first: highest rarity, then the lowest level.
      const rank = (r: ChestRarity): number => ({ epic: 0, legendary: 1, rare: 2, common: 3 })[r];
      options.sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.level - b.level);
      profile.levelUp(options[0]!.id);
      acted = true;
    }
    // Lots in the daily shop, when the gold is plentiful.
    for (const o of profile.shopView().offers.slice().reverse()) {
      if (o.price.gold !== undefined && !profile.shopView().bought[o.slot] && profile.data.gold >= o.price.gold * 3) {
        if (profile.buyShop(o.slot).ok) acted = true;
      }
    }
    // Training: the cheapest level, whenever it costs at most 15% of the gold in hand.
    const rows = profile.trainingRows().filter((r) => r.cost !== null).sort((a, b) => a.cost! - b.cost!);
    if (rows[0] && profile.data.gold * 0.15 >= rows[0].cost! && profile.train(rows[0].id).ok) acted = true;
    // Gems: the cosmetics first (visible things), then silver chests as soon as 150 are in hand.
    const wanted = profile.cosmetics().find((c) => !c.owned && c.source.type === 'gems');
    if (wanted && wanted.source.type === 'gems' && profile.data.gems >= wanted.source.price && profile.buyCosmetic(wanted.id).ok) acted = true;
    if (!wanted && profile.data.gems >= 150 && profile.buyChest('silver').ok) {
      await openAll(profile);
      acted = true;
    }
    if (!acted) break;
  }
}

interface Row {
  day: number;
  levels: Record<ChestRarity, number>;
  trainingLevels: number;
  gems: number;
  gold: number;
  power: number;
  clearedStakes: number;
  cleared: number[];
  gemsEarnedTotal: number;
  cards: Record<ChestRarity, number>;
}

interface Trace {
  rows: Row[];
  gemIncomeByReason: Record<string, number>;
  /** Gold income by source over days 1-60, and chests opened by kind over the whole run. */
  goldIncomeByReason: Record<string, number>;
  chestsOpened: Record<string, number>;
  /** Epic and legendary cards the chests dealt, by chest kind (pity cards included). */
  highCards: Record<string, number>;
  reached: { epic8: number | null; legendary8: number | null; all10: number | null };
}

async function simulate(days: number, seed: number): Promise<Trace> {
  const rng = new Rng(seed);
  const rig = await createTestProfile({ start: at(2026, 10, 6, 7), seed: () => rng.int(1, 0x7fffffff) });
  const { profile, clock } = rig;
  if (process.env.RICH) profile.data.gold = 100_000_000;
  const rows: Row[] = [];
  const gemIncomeByReason: Record<string, number> = {};
  const goldIncomeByReason: Record<string, number> = {};
  const chestsOpened: Record<string, number> = {};
  const highCards: Record<string, number> = {};
  let gemsEarned = 0;
  let day = 1;
  profile.events.on('chest', (c) => {
    chestsOpened[c.kind] = (chestsOpened[c.kind] ?? 0) + 1;
    for (const card of c.cards) {
      if (card.rarity === 'epic' || card.rarity === 'legendary') highCards[`${card.rarity} ${c.kind}`] = (highCards[`${card.rarity} ${c.kind}`] ?? 0) + 1;
    }
    if (c.pity.cards > 0) highCards['legendary pity'] = (highCards['legendary pity'] ?? 0) + c.pity.cards;
  });
  profile.events.on('currency', (e) => {
    if (e.delta <= 0) return;
    if (e.currency === 'gold' && day <= 60) goldIncomeByReason[e.reason] = (goldIncomeByReason[e.reason] ?? 0) + e.delta;
    if (e.currency !== 'gems') return;
    gemsEarned += e.delta;
    if (day <= 30) gemIncomeByReason[e.reason] = (gemIncomeByReason[e.reason] ?? 0) + e.delta;
  });
  const reached: Trace['reached'] = { epic8: null, legendary8: null, all10: null };

  for (day = 1; day <= days; day++) {
    for (let s = 0; s < SESSIONS.length; s++) {
      const visit = SESSIONS[s]!;
      const target = at(2026, 10, 5 + day, visit.hour);
      if (target > clock.wall()) clock.advance(target - clock.wall());
      profile.refresh();
      if (s === 0) {
        profile.claimCalendar();
        profile.claimComeback();
        profile.claimGemPass();
      }
      profile.claimFreeChest();
      await profile.claimPatrol(false);

      for (let r = 0; r < visit.runs; r++) {
        if (s === 0 && r === 0 && profile.featureUnlocked('daily')) {
          const init = await profile.prepareRun({ mode: 'daily' });
          if (init.ok) await profile.finishRun(synthStats(profile, 'daily', init.value.chapter, 0, rng));
        } else {
          const stage = pickStage(profile);
          const init = await profile.prepareRun({ mode: 'chapter', chapter: stage.chapter, stake: stage.stake });
          if (init.ok) await profile.finishRun(synthStats(profile, 'chapter', stage.chapter, stage.stake, rng));
        }
        await openAll(profile);
      }
      if (profile.featureUnlocked('treat')) for (const slot of visit.treats) await profile.claimTreat(slot);
      await openAll(profile);
      await spendAll(profile);
    }

    // Late evening: sweeps on the best cleared stage, every claim, then spend again.
    if (profile.featureUnlocked('sweep')) {
      let top = { chapter: 1, stake: 0, gold: 0 };
      for (let chapter = 1; chapter <= 5; chapter++) {
        for (let stake = 0; stake < (profile.data.cleared[chapter - 1] ?? 0); stake++) {
          const g = sweepPayout(chapter, stake).gold;
          if (g > top.gold) top = { chapter, stake, gold: g };
        }
      }
      while (profile.data.tickets > 0 && top.gold > 0) profile.sweep(top.chapter, top.stake);
    }
    if (profile.featureUnlocked('missions')) {
      for (let i = 0; i < 5; i++) {
        profile.claimMission('daily', i);
        profile.claimMission('weekly', i);
      }
      profile.claimDailyChest();
      profile.claimWeeklyChest();
    }
    if (profile.featureUnlocked('pass')) profile.claimAllPass('free');
    if (profile.featureUnlocked('cup')) for (let i = 0; i < 3; i++) profile.claimCup(i);
    profile.breakPiggyFree();
    await openAll(profile);
    await spendAll(profile);

    const d = profile.data;
    const levels = {} as Record<ChestRarity, number>;
    const cards = {} as Record<ChestRarity, number>;
    for (const r of CHEST_RARITIES) {
      const units = UNITS_BY_RARITY[r];
      levels[r] = units.reduce((a, u) => a + d.levels[u], 0) / units.length;
      cards[r] = units.reduce((a, u) => a + totalCardsTo(r, d.levels[u]) + d.cards[u], 0) + d.wild[r];
    }
    if (reached.epic8 === null && levels.epic >= 8) reached.epic8 = day;
    if (reached.legendary8 === null && levels.legendary >= 8) reached.legendary8 = day;
    if (reached.all10 === null && Object.values(d.levels).every((l) => l >= 10)) reached.all10 = day;
    rows.push({
      day, levels, trainingLevels: TRAINING_IDS.reduce((a, id) => a + d.training[id], 0), gems: d.gems, gold: d.gold,
      power: power(profile), clearedStakes: d.cleared.reduce((a, b) => a + b, 0), cleared: d.cleared.slice(), gemsEarnedTotal: gemsEarned, cards,
    });
  }
  return { rows, gemIncomeByReason, goldIncomeByReason, chestsOpened, highCards, reached };
}

function avg(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

/** Cards a free player collects per day by day 95 (set by the first test, read by the second). */
const freeSupply = { epic: 0, legendary: 0 };

describe('progression report (prints, never fails)', () => {
  it('a free player: 3 runs and 3 ads a day', async () => {
    const PLAYERS = 8;
    const DAYS = 260;
    const traces: Trace[] = [];
    for (let i = 0; i < PLAYERS; i++) traces.push(await simulate(DAYS, 1000 + i));

    const lines: string[] = [];
    const f = (n: number, d = 1): string => n.toFixed(d);
    lines.push(`free player, ${RUNS_PER_DAY} runs + 3 ads a day, mean of ${PLAYERS} simulated players`);
    lines.push('day | avg level common/rare/epic/legendary | training lv | gems held | gold held | stakes cleared | power');
    for (const day of REPORT_DAYS) {
      const rows = traces.map((t) => t.rows[day - 1]!);
      const lv = CHEST_RARITIES.map((r) => f(avg(rows.map((x) => x.levels[r])))).join('/');
      lines.push(
        `${String(day).padStart(3)} | ${lv.padEnd(26)} | ${f(avg(rows.map((x) => x.trainingLevels)), 0).padStart(4)} | ${f(avg(rows.map((x) => x.gems)), 0).padStart(6)} | ${f(avg(rows.map((x) => x.gold)), 0).padStart(8)} | ${f(avg(rows.map((x) => x.clearedStakes)), 1).padStart(5)} | ${f(avg(rows.map((x) => x.power)), 2)}`,
      );
    }
    for (const day of [30, 60]) {
      lines.push(`stakes cleared per chapter, day ${day}: ` + [0, 1, 2, 3, 4].map((c) => f(avg(traces.map((t) => t.rows[day - 1]!.cleared[c]!)), 1)).join(' / '));
    }
    const epic8 = traces.map((t) => t.reached.epic8);
    const leg8 = traces.map((t) => t.reached.legendary8);
    const all10 = traces.map((t) => t.reached.all10);
    const mean = (xs: (number | null)[]): string => {
      const hit = xs.filter((x): x is number => x !== null);
      return hit.length ? `${f(avg(hit), 0)} (range ${Math.min(...hit)}-${Math.max(...hit)}, ${hit.length}/${xs.length} players)` : 'not reached';
    };
    lines.push(`epic units reach level 8 on day ${mean(epic8)}; legendary level 8 on day ${mean(leg8)}; all 16 units level 10 on day ${mean(all10)}`);
    for (const day of [50, 95, 180, 260]) {
      const rows = traces.map((t) => t.rows[day - 1]!);
      lines.push(`day ${day}: avg level ${CHEST_RARITIES.map((r) => f(avg(rows.map((x) => x.levels[r])))).join('/')}, epic cards ${f(avg(rows.map((x) => x.cards.epic)), 0)}, legendary cards ${f(avg(rows.map((x) => x.cards.legendary)), 0)}`);
    }
    const income = traces.map((t) => t.rows[29]!.gemsEarnedTotal);
    lines.push(`free gem income, first 30 days: ${f(avg(income) / 30, 1)} a day`);
    const reasons: Record<string, number> = {};
    for (const t of traces) for (const [k, v] of Object.entries(t.gemIncomeByReason)) reasons[k] = (reasons[k] ?? 0) + v / PLAYERS / 30;
    lines.push('  by source (gems/day): ' + Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v)}`).join(', '));
    const gold: Record<string, number> = {};
    const opened: Record<string, number> = {};
    for (const t of traces) {
      for (const [k, v] of Object.entries(t.goldIncomeByReason)) gold[k] = (gold[k] ?? 0) + v / PLAYERS / 60;
      for (const [k, v] of Object.entries(t.chestsOpened)) opened[k] = (opened[k] ?? 0) + v / PLAYERS / DAYS;
    }
    lines.push(`gold income, first 60 days (per day): ${f(Object.values(gold).reduce((a, b) => a + b, 0), 0)} = ` + Object.entries(gold).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${f(v, 0)}`).join(', '));
    const high: Record<string, number> = {};
    for (const t of traces) for (const [k, v] of Object.entries(t.highCards)) high[k] = (high[k] ?? 0) + v / PLAYERS / DAYS;
    lines.push('epic/legendary cards per day by source (whole run): ' + Object.entries(high).sort().map(([k, v]) => `${k} ${f(v, 2)}`).join(', '));
    lines.push('chests opened per day: ' + Object.entries(opened).map(([k, v]) => `${k} ${f(v, 2)}`).join(', '));
    freeSupply.epic = avg(traces.map((t) => t.rows[94]!.cards.epic)) / 95;
    freeSupply.legendary = avg(traces.map((t) => t.rows[94]!.cards.legendary)) / 95;
    console.log('\n[meta progression]\n' + lines.join('\n'));
    expect(traces[0]?.rows).toHaveLength(DAYS);
  }, 120_000);

  it('what 33,000 KRW buys on day 1: 4,600 gems = nine gold chests', async () => {
    const rng = new Rng(7);
    const rig = await createTestProfile({ seed: () => rng.int(1, 0x7fffffff) });
    const { profile } = rig;
    await profile.grantOrder('gems_4600', 'big');
    const reasons: Reason[] = [];
    profile.events.on('currency', (e) => reasons.push(e.reason));
    let chests = 0;
    while (profile.data.gems >= 500) {
      profile.buyChest('gold');
      chests++;
    }
    await openAll(profile);
    const d = profile.data;
    const byRarity = {} as Record<ChestRarity, { units: number; wild: number }>;
    for (const r of CHEST_RARITIES) byRarity[r] = { units: UNITS_BY_RARITY[r].reduce((a, u) => a + d.cards[u], 0), wild: d.wild[r] };
    const lines = [`${chests} gold chests, ${d.gems} gems left, ${chests * 60} cards:`];
    for (const r of CHEST_RARITIES) lines.push(`  ${r}: ${byRarity[r].units} unit cards + ${byRarity[r].wild} wild`);
    const need = (r: ChestRarity, lv: number): number => 4 * totalCardsTo(r, lv);
    for (const r of ['epic', 'legendary'] as const) {
      const have = byRarity[r].units + byRarity[r].wild;
      const days = freeSupply[r] > 0 ? `, as many as a free player collects in ${(have / freeSupply[r]).toFixed(0)} days` : '';
      lines.push(`  ${r}: ${have} cards = ${f2(have / need(r, 8))} of what all four need for level 8, ${f2(have / need(r, 10))} for level 10${days}`);
    }
    console.log('\n[meta 33,000 KRW]\n' + lines.join('\n'));
    expect(chests).toBe(9);
  });
});

function f2(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}
