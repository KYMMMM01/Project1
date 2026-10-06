/** Shared by the balance report: batches of bot runs and their summary statistics. */
import { RELIC_IDS, type BattleInit } from '@/game/api';
import { BASE_UNIT_IDS } from '@/game/data/roster';
import type { BotPolicy } from '@/game/sim/bots';
import { playRun, type RunResult } from '@/game/sim/runner';

export function loadoutInit(seed: number, chapter: number, stake: number, level: number, mode: BattleInit['mode'] = 'chapter'): BattleInit {
  const unitLevels = Object.fromEntries(BASE_UNIT_IDS.map((id) => [id, level]));
  return { seed, mode, chapter, stake, loadout: { unitLevels, training: {}, relicPool: [...RELIC_IDS] } };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const v = values.slice().sort((a, b) => a - b);
  const m = v.length >> 1;
  return v.length % 2 ? (v[m] as number) : ((v[m - 1] as number) + (v[m] as number)) / 2;
}

export interface BatchSummary {
  runs: number;
  winRate: number;
  meanWave: number;
  firstLegendary: number;
  firstMythic: number;
  mythicRate: number;
  cautionRate: number;
  surplus: number;
  bossRatio: number;
  lengthWin: number;
  /** Mean molts and merges per run. */
  molts: number;
  merges: number;
  simMs: number;
  results: RunResult[];
}

export function batch(runs: number, policy: BotPolicy, make: (seed: number) => BattleInit): BatchSummary {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) results.push(playRun(make(10_007 + i * 7919), policy));
  const wins = results.filter((r) => r.victory);
  const legendary = results.filter((r) => r.firstLegendary > 0).map((r) => r.firstLegendary);
  const mythic = results.filter((r) => r.firstMythic > 0).map((r) => r.firstMythic);
  const surplus: number[] = [];
  for (const r of results) for (const s of r.samples) if (s.need > 0 && s.wave % 4 !== 0) surplus.push(s.firepower / s.need);
  return {
    runs,
    winRate: wins.length / runs,
    meanWave: results.reduce((a, r) => a + r.wave, 0) / runs,
    firstLegendary: median(legendary),
    firstMythic: median(mythic),
    mythicRate: mythic.length / runs,
    cautionRate: results.filter((r) => r.caution).length / runs,
    surplus: median(surplus),
    bossRatio: median(results.flatMap((r) => r.bossRatios)),
    lengthWin: median(wins.map((r) => r.time / 60)),
    molts: results.reduce((a, r) => a + r.stats.molts, 0) / runs,
    merges: results.reduce((a, r) => a + r.stats.merges, 0) / runs,
    simMs: results.reduce((a, r) => a + r.simMs, 0) / runs,
    results,
  };
}

export function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

/** Plain aligned table for the console. */
export function printTable(title: string, head: string[], rows: (string | number)[][]): void {
  const cells = [head, ...rows.map((r) => r.map(String))];
  const widths = head.map((_, c) => Math.max(...cells.map((r) => (r[c] as string).length)));
  const line = (r: string[]): string => r.map((v, c) => v.padEnd(widths[c] as number)).join('  ');
  const out = [`\n== ${title} ==`, line(head), ...rows.map((r) => line(r.map(String)))];
  process.stdout.write(`${out.join('\n')}\n`);
}
