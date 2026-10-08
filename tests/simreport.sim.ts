/**
 * Balance report (`npm run sim`). Plays bot runs and prints compact tables; it never fails on a
 * balance number. Environment: SIM_RUNS (runs per cell, default 500), SIM_FULL=1 (every chapter x stake
 * x level), SIM_ONLY=ch1|stakes|chapters|damage|units|focus|reach|control|calibrate to run one section, SIM_CHAPTERS=1,2
 * and SIM_STAKES=1,2 to limit the chapters and the chapter-1 stakes of `units` and `focus`; SIM_CHAPTER_STAKE=3 plays
 * the `focus` chapters at that stake instead of 0.
 */
import { describe, it } from 'vitest';
import { CLASS_IDS, UNIT_IDS } from '@/game/api';
import { RECOMMENDED_LEVEL, hpIndex } from '@/game/data/balance';
import type { BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import type { Sim } from '@/game/sim/sim';
import { CELL_COUNT, cellCenterX, cellCenterY, isEdgeCell, PATH_LENGTH, pathPoint } from '@/game/geometry';
import { unitSpec } from '@/game/data/units';
import { enemySpec } from '@/game/data/enemies';
import { batch, controlRow, loadoutInit, median, pct, printTable, unitRows, type BatchSummary, type UnitRow } from './simReportKit';

const RUNS = Number(process.env.SIM_RUNS ?? 500);
const ONLY = process.env.SIM_ONLY ?? '';
const FULL = process.env.SIM_FULL === '1';
const POLICIES: BotPolicy[] = ['random', 'merge', 'synergy'];
const list = (name: string, fallback: string): number[] => (process.env[name] ?? fallback).split(',').filter(Boolean).map(Number);
const CHAPTERS = list('SIM_CHAPTERS', '1,2,3,4,5');
const STAKES = list('SIM_STAKES', '1,2,3,4,5');
const CHAPTER_STAKE = Number(process.env.SIM_CHAPTER_STAKE ?? 0);

function unitLine(r: UnitRow): (string | number)[] {
  return [r.label, pct(r.share), r.boardMin.toFixed(1), r.kills.toFixed(0), pct(r.uptime), r.hitsPerAttack.toFixed(1), (r.perCe / 1000).toFixed(2)];
}

const UNIT_HEAD = ['unit', 'damage', 'board min', 'kills', 'uptime', 'hits/atk', 'kdmg/CE-min'];

function row(label: string, s: BatchSummary): (string | number)[] {
  return [
    label, pct(s.winRate), s.meanWave.toFixed(1), s.firstLegendary.toFixed(1), s.firstMythic.toFixed(1), pct(s.mythicRate),
    pct(s.cautionRate), s.surplus.toFixed(2), pct(s.bossRatio), s.lengthWin.toFixed(1), s.merges.toFixed(0), s.molts.toFixed(2), s.simMs.toFixed(0),
  ];
}

const HEAD = ['case', 'win', 'wave', '1stLeg', '1stMyth', 'myth%', 'caution', 'surplus', 'boss%', 'min', 'merges', 'molts', 'ms'];

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

  it('per class and unit, synergy bot', () => {
    if (!wanted('units')) return;
    for (const chapter of CHAPTERS) {
      const level = RECOMMENDED_LEVEL[chapter - 1] as number;
      const b = batch(RUNS, 'synergy', (seed) => loadoutInit(seed, chapter, 0, level), { tally: true });
      const all = unitRows(b.results);
      const won = unitRows(b.results.filter((r) => r.victory));
      const rows = all.classes.map((c, i) => [...unitLine(c), pct((won.classes[i] as UnitRow).share)]);
      printTable(`Classes, chapter ${chapter} level ${level}, synergy bot, ${RUNS} runs (win ${pct(b.winRate)}); last column: damage share in winning runs`, [...UNIT_HEAD, 'share won'], rows);
      const units = all.units.filter((u) => u.boardMin > 0).map((u) => [...unitLine(u), pct((won.units.find((x) => x.label === u.label) as UnitRow).share)]);
      printTable(`Units, chapter ${chapter}`, [...UNIT_HEAD, 'share won'], units);
    }
  });

  it('lane coverage by cell', () => {
    if (!wanted('reach')) return;
    const radius = enemySpec('cucumber').radius;
    const lane: { x: number; y: number }[] = [];
    for (let d = 0; d < PATH_LENGTH; d += 5) lane.push({ x: pathPoint(d).x, y: pathPoint(d).y });
    const coverage = (cell: number, range: number): number => {
      const cx = cellCenterX(cell);
      const cy = cellCenterY(cell);
      const reach = (range + radius) ** 2;
      return lane.filter((p) => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= reach).length / lane.length;
    };
    const rows = UNIT_IDS.map((id) => {
      const range = unitSpec(id).base.range;
      const cells = Array.from({ length: CELL_COUNT }, (_, c) => c);
      const mean = (list: number[]): number => list.reduce((a, c) => a + coverage(c, range), 0) / (list.length || 1);
      return [id, range, pct(Math.max(...cells.map((c) => coverage(c, range)))), pct(mean(cells.filter(isEdgeCell))), pct(mean(cells.filter((c) => !isEdgeCell(c))))];
    });
    printTable('Share of the walkway one cat reaches (best cell / mean of the 14 edge cells / mean of the 6 inner cells)', ['unit', 'range', 'best', 'edge', 'inner'], rows);
  });

  it('control effects and swing size, one pinned class at a time', () => {
    if (!wanted('control')) return;
    const rows: (string | number)[][] = [];
    for (const focus of CLASS_IDS) {
      const b = batch(RUNS, 'synergy', (seed) => loadoutInit(seed, 1, 0, 1), { focus, tally: true });
      const c = controlRow(b.results);
      rows.push([focus, pct(b.winRate), pct(c.slowed), pct(c.frozen), pct(c.stunned), pct(c.armorBroken), c.pulledPerMin.toFixed(0)]);
    }
    printTable(`Enemy field time under each effect, synergy bot pinned to a class, chapter 1 (${RUNS} runs)`, ['pinned', 'win', 'slowed', 'frozen', 'stunned', 'armour broken', 'px pulled/min'], rows);
  });

  it('class-focus bots', () => {
    if (!wanted('focus')) return;
    const cells: { label: string; chapter: number; stake: number }[] = [];
    for (const chapter of CHAPTERS) cells.push({ label: `ch${chapter} s${CHAPTER_STAKE}`, chapter, stake: CHAPTER_STAKE });
    for (const stake of STAKES) cells.push({ label: `ch1 s${stake}`, chapter: 1, stake });
    const rows = cells.map((cell) => {
      const level = RECOMMENDED_LEVEL[cell.chapter - 1] as number;
      const make = (seed: number) => loadoutInit(seed, cell.chapter, cell.stake, level);
      return [
        cell.label, pct(batch(RUNS, 'synergy', make).winRate),
        ...CLASS_IDS.map((focus) => pct(batch(RUNS, 'synergy', make, { focus }).winRate)),
      ];
    });
    printTable(`Win rate of the synergy bot free / pinned to one class line (${RUNS} runs per cell)`, ['case', 'free', ...CLASS_IDS], rows);
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
