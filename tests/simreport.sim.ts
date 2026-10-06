/**
 * Balance report (`npm run sim`). Plays bot runs and prints compact tables; it never fails on a
 * balance number. Environment: SIM_RUNS (runs per cell, default 500), SIM_FULL=1 (every chapter x stake
 * x level), SIM_ONLY=ch1|stakes|chapters|damage|calibrate to run one section.
 */
import { describe, it } from 'vitest';
import { RECOMMENDED_LEVEL, hpIndex } from '@/game/data/balance';
import type { BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import type { Sim } from '@/game/sim/sim';
import { batch, loadoutInit, median, pct, printTable, type BatchSummary } from './simReportKit';

const RUNS = Number(process.env.SIM_RUNS ?? 500);
const ONLY = process.env.SIM_ONLY ?? '';
const FULL = process.env.SIM_FULL === '1';
const POLICIES: BotPolicy[] = ['random', 'merge', 'synergy'];

function row(label: string, s: BatchSummary): (string | number)[] {
  return [
    label, pct(s.winRate), s.meanWave.toFixed(1), s.firstLegendary.toFixed(1), s.firstMythic.toFixed(1), pct(s.mythicRate),
    pct(s.cautionRate), s.surplus.toFixed(2), pct(s.bossRatio), s.lengthWin.toFixed(1), s.simMs.toFixed(0),
  ];
}

const HEAD = ['case', 'win', 'wave', '1stLeg', '1stMyth', 'myth%', 'caution', 'surplus', 'boss%', 'min', 'ms'];

function wanted(section: string): boolean {
  return ONLY === '' || ONLY === section;
}

describe('balance report', () => {
  it('chapter 1, unit level 1', () => {
    if (!wanted('ch1')) return;
    const rows = POLICIES.map((p) => row(p, batch(RUNS, p, (seed) => loadoutInit(seed, 1, 0, 1))));
    printTable(`Chapter 1, stake 0, level 1 (${RUNS} runs). Targets: win 20-40 / 60-75 / 85-92`, HEAD, rows);
  });

  it('stakes, synergy bot', () => {
    if (!wanted('stakes')) return;
    const rows: (string | number)[][] = [];
    for (let stake = 0; stake <= 5; stake++) rows.push(row(`stake ${stake}`, batch(RUNS, 'synergy', (seed) => loadoutInit(seed, 1, stake, 1))));
    printTable('Stakes, chapter 1, level 1, synergy bot. Target: 85% falling to 25%', HEAD, rows);
  });

  it('chapters at their recommended level', () => {
    if (!wanted('chapters')) return;
    const rows: (string | number)[][] = [];
    for (let chapter = 2; chapter <= 5; chapter++) {
      const level = RECOMMENDED_LEVEL[chapter - 1] as number;
      for (const p of POLICIES) rows.push(row(`ch${chapter} L${level} ${p}`, batch(RUNS, p, (seed) => loadoutInit(seed, chapter, 0, level))));
    }
    printTable(`Chapters 2-5 at the recommended unit level (${RUNS} runs)`, HEAD, rows);
  });

  it('damage share per unit', () => {
    if (!wanted('damage')) return;
    for (const p of POLICIES) {
      const b = batch(Math.min(RUNS, 100), p, (seed) => loadoutInit(seed, 1, 0, 1));
      const total: Record<string, number> = {};
      for (const r of b.results) for (const [id, v] of Object.entries(r.stats.damageByUnit)) total[id] = (total[id] ?? 0) + v;
      const sum = Object.values(total).reduce((a, v) => a + v, 0) || 1;
      const rows = Object.entries(total).sort((a, c) => c[1] - a[1]).map(([id, v]) => [id, pct(v / sum)]);
      printTable(`Damage share, ${p}`, ['unit', 'share'], rows);
    }
  });

  it('full matrix', () => {
    if (!FULL) return;
    const rows: (string | number)[][] = [];
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (let stake = 0; stake <= 5; stake++) {
        for (const level of [1, 3, 5, 8]) {
          rows.push(row(`ch${chapter} s${stake} L${level}`, batch(RUNS, 'synergy', (seed) => loadoutInit(seed, chapter, stake, level))));
        }
      }
    }
    printTable('Full matrix, synergy bot', HEAD, rows);
  });

  it('calibration: median firepower and suggested health table', () => {
    if (!wanted('calibrate')) return;
    const runs = Math.min(RUNS, 200);
    const sim = createBattle(loadoutInit(1, 1, 0, 1)) as Sim;
    const byBot = POLICIES.map((p) => batch(runs, p, (seed) => loadoutInit(seed, 1, 0, 1)));
    const fpOf = (b: BatchSummary, w: number): number =>
      median(b.results.flatMap((r) => r.samples.filter((x) => x.wave === w).map((x) => x.firepower)));
    const target = 1.35;
    const suggested: number[] = [0];
    const rows: (string | number)[][] = [];
    for (let w = 1; w <= 24; w++) {
      const fp = fpOf(byBot[2] as BatchSummary, w);
      const perIndex = sim.waveHealth(w) / hpIndex(w);
      const hp = w % 4 === 0 ? 0 : ((fp / target) * 15) / perIndex;
      suggested.push(hp);
      rows.push([
        w, fpOf(byBot[0] as BatchSummary, w).toFixed(0), fpOf(byBot[1] as BatchSummary, w).toFixed(0), fp.toFixed(0),
        hpIndex(w).toFixed(1), hp > 0 ? hp.toFixed(1) : '-',
        byBot.map((b) => b.results.filter((r) => r.wave >= w).length).join('/'),
      ]);
    }
    for (let w = 4; w <= 24; w += 4) {
      const lo = suggested[w - 1] as number;
      const hi = w < 24 ? (suggested[w + 1] as number) : lo * 1.16;
      suggested[w] = Math.sqrt(lo * hi);
    }
    printTable(
      'Median firepower per wave (chapter 1) for random / merge / synergy; suggested health index = synergy surplus 1.35',
      ['wave', 'random', 'merge', 'synergy', 'HP_INDEX now', 'suggested', 'runs reaching'], rows,
    );
    process.stdout.write(`\nsuggested HP_INDEX = [0, ${suggested.slice(1).map((v) => v.toFixed(1)).join(', ')}]\n`);
  });
});
