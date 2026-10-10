/**
 * Balance report (`npm run sim`). Plays bot runs and prints compact tables; it never fails on a
 * balance number. Environment: SIM_RUNS (runs per cell, default 500), SIM_FULL=1 (every chapter x stake
 * x level), SIM_ONLY=ch1|stakes|chapters|damage|units|focus|reach|control|income|toys|calibrate to run one section, SIM_CHAPTERS=1,2
 * and SIM_STAKES=1,2 to limit the chapters (of `chapters`, `units`, `focus` and `income`) and the chapter-1 stakes of `units` and
 * `focus`; SIM_CHAPTER_STAKE=3 plays the `focus` chapters at that stake instead of 0; SIM_FOCUS=warrior,mage limits the pinned classes of `focus`.
 * The `toys` section (only when asked for with SIM_ONLY=toys) hands one toy at a time to the merge and the synergy bot in chapters 1 and 3 at stake 0
 * and prints the change against the same seeds without it. SIM_TOYS=cat_tunnel,nap_blanket limits the toys; SIM_TOY_WAVE=5 hands them out before
 * that wave (default 5: as the first toy, at the offer after act 1; `start` = before wave 1; `rank` = at the earliest offer that can hold the
 * toy's rank: 5 / 5 / 13 / 21).
 */
import { describe, it } from 'vitest';
import { CLASS_IDS, RELIC_IDS, UNIT_IDS, type CurrencyReason, type RelicId } from '@/game/api';
import { RECOMMENDED_LEVEL, hpIndex } from '@/game/data/balance';
import type { BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import type { Sim } from '@/game/sim/sim';
import { CELL_COUNT, COLS, ROWS, cellCenterX, cellCenterY, cellCol, cellRow, PATH_LENGTH, pathPoint } from '@/game/geometry';
import { unitSpec } from '@/game/data/units';
import { enemySpec } from '@/game/data/enemies';
import { RELIC_RARITY } from '@/game/data/roster';
import {
  batch, controlRow, loadoutInit, median, pairedDelta, pct, printTable, signed, unitRows, type BatchSummary, type PairedDelta, type UnitRow,
} from './simReportKit';

const RUNS = Number(process.env.SIM_RUNS ?? 500);
const ONLY = process.env.SIM_ONLY ?? '';
const FULL = process.env.SIM_FULL === '1';
const POLICIES: BotPolicy[] = ['random', 'merge', 'synergy'];
const list = (name: string, fallback: string): number[] => (process.env[name] ?? fallback).split(',').filter(Boolean).map(Number);
const CHAPTERS = list('SIM_CHAPTERS', '1,2,3,4,5');
const STAKES = list('SIM_STAKES', '1,2,3,4,5');
const CHAPTER_STAKE = Number(process.env.SIM_CHAPTER_STAKE ?? 0);
const FOCUS_ONLY = (process.env.SIM_FOCUS ?? '').split(',').filter(Boolean);
const PINNED = FOCUS_ONLY.length > 0 ? CLASS_IDS.filter((c) => FOCUS_ONLY.includes(c)) : CLASS_IDS;
const TOY_ONLY = (process.env.SIM_TOYS ?? '').split(',').filter(Boolean);
const TOY_BOTS: BotPolicy[] = ['merge', 'synergy'];
const TOY_CHAPTERS = [1, 3];

/** The wave before which the `toys` section hands a toy out (see the header). */
function toyWave(id: RelicId): number {
  const mode = process.env.SIM_TOY_WAVE ?? '5';
  if (mode === 'start') return 1;
  if (mode === 'rank') return { common: 5, rare: 5, epic: 13, legendary: 21 }[RELIC_RARITY[id]];
  return Number(mode);
}

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
    for (const chapter of CHAPTERS.filter((c) => c >= 2)) {
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
    const cells = Array.from({ length: CELL_COUNT }, (_, c) => c);
    // Rings of the 5 x 5 board: 0 = the 16 outer cells, 1 = the 8 around the middle, 2 = the middle cell.
    const ring = (c: number): number => Math.min(cellCol(c), cellRow(c), COLS - 1 - cellCol(c), ROWS - 1 - cellRow(c));
    const rows = UNIT_IDS.map((id) => {
      const range = unitSpec(id).base.range;
      const mean = (list: number[]): number => list.reduce((a, c) => a + coverage(c, range), 0) / (list.length || 1);
      const of = (r: number): string => pct(mean(cells.filter((c) => ring(c) === r)));
      return [id, range, pct(Math.max(...cells.map((c) => coverage(c, range)))), of(0), of(1), of(2)];
    });
    printTable('Share of the walkway one cat reaches (best cell / mean of the 16 outer cells / of the 8 second-ring cells / the middle cell)', ['unit', 'range', 'best', 'outer', 'second', 'middle'], rows);
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

  it('fish income by source, synergy bot', () => {
    if (!wanted('income')) return;
    const SOURCES: CurrencyReason[] = ['kill', 'wave', 'boss', 'act', 'call', 'unit', 'relic', 'income', 'sell'];
    const rows: (string | number)[][] = [];
    for (const chapter of CHAPTERS) {
      const level = RECOMMENDED_LEVEL[chapter - 1] as number;
      const b = batch(RUNS, 'synergy', (seed) => loadoutInit(seed, chapter, 0, level), { tally: true });
      const mean = (r: CurrencyReason): number => b.results.reduce((a, x) => a + (x.victory ? (x.income[r] ?? 0) : 0), 0) / Math.max(1, b.results.filter((x) => x.victory).length);
      const total = SOURCES.reduce((a, r) => a + mean(r), 0);
      const earned = total - mean('sell');
      rows.push([`ch${chapter} L${level}`, ...SOURCES.map((r) => mean(r).toFixed(0)), total.toFixed(0), pct(mean('income') / total), pct(mean('income') / earned), pct(b.winRate)]);
    }
    printTable(
      'Fish that came in per winning run, by source (synergy bot, stake 0); the share of the steady income in all inflows and without the sales',
      ['case', ...SOURCES, 'total', 'income of all', 'income of earned', 'win'], rows,
    );
  });

  it('class-focus bots', () => {
    if (!wanted('focus')) return;
    const cells: { label: string; chapter: number; stake: number }[] = [];
    for (const chapter of CHAPTERS) cells.push({ label: `ch${chapter} s${CHAPTER_STAKE}`, chapter, stake: CHAPTER_STAKE });
    for (const stake of STAKES) cells.push({ label: `ch1 s${stake}`, chapter: 1, stake });
    const wins: (string | number)[][] = [];
    const bosses: (string | number)[][] = [];
    for (const cell of cells) {
      const level = RECOMMENDED_LEVEL[cell.chapter - 1] as number;
      const make = (seed: number) => loadoutInit(seed, cell.chapter, cell.stake, level);
      const batches = [batch(RUNS, 'synergy', make), ...PINNED.map((focus) => batch(RUNS, 'synergy', make, { focus }))];
      wins.push([cell.label, ...batches.map((b) => pct(b.winRate))]);
      bosses.push([cell.label, ...batches.map((b) => pct(b.bossRatio))]);
    }
    printTable(`Win rate of the synergy bot free / pinned to one class line (${RUNS} runs per cell)`, ['case', 'free', ...PINNED], wins);
    printTable(`Elite and boss kill time as a share of the time limit (median over the kills in those runs; lower is faster)`, ['case', 'free', ...PINNED], bosses);
  });

  it('toys: what holding one toy is worth, same seeds with and without', () => {
    if (ONLY !== 'toys') return;
    const level = (chapter: number): number => RECOMMENDED_LEVEL[chapter - 1] as number;
    const cells = TOY_BOTS.flatMap((policy) => TOY_CHAPTERS.map((chapter) => ({ policy, chapter, label: `${policy === 'merge' ? 'm' : 's'}${chapter}` })));
    const make = (chapter: number) => (seed: number) => loadoutInit(seed, chapter, 0, level(chapter));
    const base = cells.map((c) => batch(RUNS, c.policy, make(c.chapter)));
    printTable(
      `Toys, the base state without any toy handed out (stake 0, ${TOY_CHAPTERS.map((c) => `ch${c} L${level(c)}`).join(' / ')}, ${RUNS} runs per cell; the bots pick their own toys as usual)`,
      ['cell', 'win', 'wave', 'purr in', 'awakenings', 'ms'],
      cells.map((c, i) => {
        const b = base[i] as BatchSummary;
        const purr = b.results.reduce((a, r) => a + r.purrIn, 0) / b.runs;
        const awak = b.results.reduce((a, r) => a + r.stats.awakenings, 0) / b.runs;
        return [c.label, pct(b.winRate), b.meanWave.toFixed(2), purr.toFixed(1), awak.toFixed(2), b.simMs.toFixed(0)];
      }),
    );
    const ids = TOY_ONLY.length > 0 ? RELIC_IDS.filter((id) => TOY_ONLY.includes(id)) : RELIC_IDS;
    const rows: (string | number)[][] = [];
    for (const id of ids) {
      const wave = toyWave(id);
      const deltas = cells.map((c, i) => pairedDelta(base[i] as BatchSummary, batch(RUNS, c.policy, make(c.chapter), { toy: { id, wave } })));
      const mean = (pick: (d: PairedDelta) => number): number => deltas.reduce((a, d) => a + pick(d), 0) / deltas.length;
      const se = (pick: (d: PairedDelta) => number): number => Math.sqrt(deltas.reduce((a, d) => a + pick(d) ** 2, 0)) / deltas.length;
      rows.push([
        id, RELIC_RARITY[id], wave,
        ...deltas.flatMap((d) => [signed(d.win), signed(d.wave, 2)]),
        signed(mean((d) => d.win)), se((d) => d.winSe).toFixed(1), signed(mean((d) => d.wave), 2), se((d) => d.waveSe).toFixed(2),
        signed(mean((d) => d.purr)), signed(mean((d) => d.awakenings), 2),
      ]);
      process.stderr.write(`toy ${id} done\n`);
    }
    printTable(
      'Toys: change against the base state when handed out before the wave "from" (win in points, wave in waves; per cell, then the mean of the four cells with its standard error)',
      ['toy', 'rank', 'from', ...cells.flatMap((c) => [`${c.label} win`, `${c.label} wave`]), 'win', 'se', 'wave', 'se', 'purr', 'awaken'],
      rows,
    );
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
