/**
 * The endless-mode section of the balance report (`SIM_ONLY=endless`, see tests/simreport.sim.ts). `playEndless` plays one run the way
 * `playRun` (src/game/sim/runner.ts) does, decision for decision, and keeps what that runner does not: the time at which each wave
 * began, the field and the board's surplus wave by wave, and what the board was doing when the run ended. A run stops at `maxWave`
 * (a board that is still alive there counts as having survived), so a strong board cannot keep the report busy for ever.
 */
import { appendFileSync } from 'node:fs';
import type { BattleApi, BattleInit, WaveKind } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { createBot, type BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import { firepower } from '@/game/sim/runner';
import { Sim } from '@/game/sim/sim';
import { median, pct, printTable } from './simReportKit';

/** What one wave looked like at its end (or when the run ended in it). */
export interface EndlessWave {
  wave: number;
  kind: WaveKind;
  /** Seconds into the run at which the wave began. */
  start: number;
  /** Board firepower at the last decision of the wave, and the firepower the wave's health needs over a normal wave's length. */
  firepower: number;
  need: number;
  /** Most enemies on the field at one decision of the wave. */
  peak: number;
}

export interface EndlessRun {
  /** Waves cleared (what the weekly tiers count). */
  cleared: number;
  /** Wave in progress when the run ended. */
  endWave: number;
  endKind: WaveKind;
  /** 'survived' = still alive when wave `maxWave` ended. */
  end: 'overrun' | 'boss_timeout' | 'survived';
  time: number;
  waves: EndlessWave[];
  /** Used time as a share of the limit, for every elite / boss kill. */
  bossRatios: { wave: number; ratio: number }[];
  /** When the run ended on an elite / boss wave: the share of its health still standing, and the damage per second it takes to kill it in the limit. */
  bossLeft: number | null;
  /** Seconds the run needed to begin wave `n` (null: never). */
  startOf(n: number): number | null;
}

export function playEndless(init: BattleInit, policy: BotPolicy, maxWave: number): EndlessRun {
  const b: BattleApi = createBattle(init);
  if (!(b instanceof Sim)) throw new Error('simEndlessKit: not a Sim');
  const sim: Sim = b;
  const bot = createBot(policy, init.seed + 7);
  const every = Math.max(1, Math.round(0.25 / TICK));
  const waves: EndlessWave[] = [];
  const bossRatios: { wave: number; ratio: number }[] = [];
  let cur: EndlessWave | null = null;
  let bossSeen = false;
  let guard = 0;
  let survived = false;
  for (let tick = 0; b.phase !== 'won' && b.phase !== 'lost'; tick++) {
    if (b.phase === 'choice') {
      bot.choose(b);
      if (b.phase === 'choice' && ++guard > 8) {
        if (b.pending?.kind === 'summon') b.pickSummon(0);
        else b.pickRelic(0);
        guard = 0;
      }
      continue;
    }
    guard = 0;
    if (tick % every === 0) {
      if (b.wave > maxWave) {
        survived = true;
        break;
      }
      if (!cur || cur.wave !== b.wave) {
        cur = { wave: b.wave, kind: b.waveKind, start: b.time, firepower: 0, need: sim.waveHealth(b.wave) / sim.normalWaveTime, peak: 0 };
        waves.push(cur);
        bossSeen = false;
      }
      bot.act(b);
      cur.firepower = firepower(b.units);
      if (b.enemyCount > cur.peak) cur.peak = b.enemyCount;
      if (b.boss) bossSeen = true;
      else if (bossSeen && b.waveKind !== 'normal') {
        bossRatios.push({ wave: b.wave, ratio: b.waveTime / b.waveDuration });
        bossSeen = false;
      }
    }
    b.step(TICK);
  }
  let bossLeft: number | null = null;
  if (b.phase === 'lost' && b.boss) bossLeft = b.boss.hp / b.boss.maxHp;
  const stats = b.getStats();
  const end = survived ? 'survived' : sim.lossReason === 'boss_timeout' ? 'boss_timeout' : 'overrun';
  return {
    cleared: stats.wavesCleared, endWave: b.wave, endKind: b.waveKind, end, time: b.time, waves, bossRatios, bossLeft,
    startOf: (n) => waves.find((w) => w.wave === n)?.start ?? null,
  };
}

// ───────────────────────────── the report section ─────────────────────────────

export interface EndlessCase {
  chapter: number;
  level: number;
  label: string;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number;
}

const minutes = (seconds: number): string => (seconds / 60).toFixed(1);

/**
 * Prints, for each case and bot: the distribution of waves cleared (median / top 10% / best), the run length, what ended the runs,
 * the share reaching a few waves, and the minutes to reach wave 50 and the median wave at 1x (the 2x time is half). `make` builds
 * the init of one run from a seed.
 */
export function endlessReport(
  cases: readonly EndlessCase[], bots: readonly BotPolicy[], runs: number, maxWave: number, reachAt: readonly number[],
  make: (c: EndlessCase, seed: number) => BattleInit,
): void {
  const dist: (string | number)[][] = [];
  const reach: (string | number)[][] = [];
  const ends: (string | number)[][] = [];
  const pace: (string | number)[][] = [];
  const deepWaves: (string | number)[][] = [];
  const bosses: (string | number)[][] = [];
  for (const c of cases) {
    for (const bot of bots) {
      const list: EndlessRun[] = [];
      for (let i = 0; i < runs; i++) list.push(playEndless(make(c, 10_007 + i * 7919), bot, maxWave));
      const label = `${c.label} ${bot}`;
      const cleared = list.map((r) => r.cleared).sort((a, z) => a - z);
      const medianWave = median(cleared);
      // The mode's own range: of the runs that got through wave 24 (the chapter's length), how far they went.
      const deep = cleared.filter((v) => v >= 24);
      dist.push([
        label, runs, quantile(cleared, 0.1), quantile(cleared, 0.25), medianWave, quantile(cleared, 0.75), quantile(cleared, 0.9), cleared[cleared.length - 1] as number,
        (cleared.reduce((a, v) => a + v, 0) / runs).toFixed(1), minutes(median(list.map((r) => r.time))),
        deep.length, median(deep), quantile(deep, 0.25), quantile(deep, 0.75), quantile(deep, 0.9),
      ]);
      const dump = process.env.SIM_ENDLESS_DUMP;
      if (dump) {
        for (let i = 0; i < list.length; i++) {
          const r = list[i] as EndlessRun;
          const row = { case: c.label, bot, seed: 10_007 + i * 7919, cleared: r.cleared, endWave: r.endWave, kind: r.endKind, end: r.end, time: r.time, bossLeft: r.bossLeft, waves: r.waves.map((x) => [x.wave, Math.round(x.start), Math.round(x.firepower), Math.round(x.need), x.peak]) };
          appendFileSync(dump, `${JSON.stringify(row)}
`);
        }
      }
      reach.push([label, ...reachAt.map((n) => pct(list.filter((r) => r.cleared >= n).length / runs))]);
      const count = (f: (r: EndlessRun) => boolean): number => list.filter(f).length;
      const lost = list.filter((r) => r.end !== 'survived');
      const lateLost = lost.filter((r) => r.cleared >= 40);
      ends.push([
        label, pct(count((r) => r.end === 'overrun') / runs), pct(count((r) => r.end === 'boss_timeout') / runs), pct(count((r) => r.end === 'survived') / runs),
        lost.length > 0 ? pct(lost.filter((r) => r.endKind === 'normal').length / lost.length) : '-',
        lost.length > 0 ? pct(lost.filter((r) => r.endKind === 'elite').length / lost.length) : '-',
        lost.length > 0 ? pct(lost.filter((r) => r.endKind === 'boss').length / lost.length) : '-',
        lateLost.length,
        lateLost.length > 0 ? pct(lateLost.filter((r) => r.end === 'boss_timeout').length / lateLost.length) : '-',
        lateLost.length > 0 ? pct(lateLost.filter((r) => r.endKind !== 'normal').length / lateLost.length) : '-',
      ]);
      // Pace: minutes at 1x to begin wave 50, to begin the median wave, and the mean seconds a wave takes between waves 25 and 60.
      const startsAt50 = list.map((r) => r.startOf(50)).filter((v): v is number => v !== null);
      const startsAtMedian = list.map((r) => r.startOf(medianWave + 1)).filter((v): v is number => v !== null);
      const perWave: number[] = [];
      for (const r of list) {
        const a = r.startOf(25);
        const z = r.startOf(60);
        if (a !== null && z !== null) perWave.push((z - a) / 35);
      }
      pace.push([
        label, startsAt50.length, startsAt50.length > 0 ? minutes(median(startsAt50)) : '-', startsAtMedian.length, startsAtMedian.length > 0 ? minutes(median(startsAtMedian)) : '-',
        perWave.length > 0 ? median(perWave).toFixed(1) : '-',
      ]);
      // Deep waves: what the board and the field look like wave by wave past 24, over the runs still alive there.
      for (const w of [24, 30, 36, 40, 48, 56, 64, 72, 80]) {
        const here = list.map((r) => r.waves.find((x) => x.wave === w)).filter((x): x is EndlessWave => x !== undefined);
        if (here.length < 10 || w % 4 === 0) continue;
        deepWaves.push([
          label, w, here.length, median(here.map((x) => x.firepower / x.need)).toFixed(2), median(here.map((x) => x.peak)).toFixed(0), median(here.map((x) => x.firepower)).toFixed(0),
        ]);
      }
      for (const w of [8, 16, 24, 32, 40, 48, 56, 64, 72, 80]) {
        const kills = list.flatMap((r) => r.bossRatios.filter((x) => x.wave === w).map((x) => x.ratio));
        const began = list.filter((r) => r.waves.some((x) => x.wave === w)).length;
        if (began < 10) continue;
        bosses.push([label, w, began, kills.length, kills.length > 0 ? pct(median(kills)) : '-', pct(kills.length / began)]);
      }
    }
  }
  printTable(
    `Endless mode, waves cleared (${runs} runs per row, ceiling wave ${maxWave}; a board alive at the ceiling counts as ${maxWave}); minutes are simulated time at 1x; the last five columns count only the runs that cleared 24 or more waves`,
    ['case', 'runs', 'p10', 'p25', 'median', 'p75', 'top 10%', 'best', 'mean', 'min/run', 'n(24+)', 'med(24+)', 'p25(24+)', 'p75(24+)', 'top10(24+)'], dist,
  );
  printTable(`Share of runs that cleared at least this many waves`, ['case', ...reachAt.map((n) => `>=${n}`)], reach);
  printTable(
    'What ended the runs: the share of all runs by cause, the wave kind it ended on (of the lost runs), and of the lost runs that cleared 40 or more waves: how many, how many by boss timeout, how many on an elite / boss wave',
    ['case', 'overrun', 'boss time', 'survived', 'on normal', 'on elite', 'on boss', 'n(40+)', 'timeout(40+)', 'elite/boss(40+)'], ends,
  );
  printTable(
    'Pace at 1x (a run at 2x takes half): minutes to begin wave 50 (n runs that got there), to begin the wave after the median, and seconds per wave between waves 25 and 60',
    ['case', 'n(50)', 'min to w50', 'n(med)', 'min to med+1', 's/wave 25-60'], pace,
  );
  printTable(
    'The board against the wave, normal waves only, runs still alive there: firepower / (wave health over 15 s), peak enemies on the field, firepower',
    ['case', 'wave', 'runs', 'surplus', 'peak enemies', 'firepower'], deepWaves,
  );
  printTable(
    'Boss waves (8, 16, ...): runs that began the wave, runs that killed it, the median time used as a share of the limit, the share killed',
    ['case', 'wave', 'began', 'killed', 'median time/limit', 'killed/began'], bosses,
  );
}
