/** Shared by the balance report: batches of bot runs and their summary statistics. */
import { RELIC_IDS, UNIT_IDS, type BattleInit, type ClassId, type UnitId } from '@/game/api';
import { BASE_UNIT_IDS, unitClass } from '@/game/data/roster';
import type { BotPolicy } from '@/game/sim/bots';
import { playRun, type RunOptions, type RunResult } from '@/game/sim/runner';

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

export function batch(runs: number, policy: BotPolicy, make: (seed: number) => BattleInit, options: RunOptions = {}): BatchSummary {
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i++) results.push(playRun(make(10_007 + i * 7919), policy, options));
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

/** What a set of runs says about one unit type or one class (see `unitRows`). */
export interface UnitRow {
  label: string;
  /** Share of all damage dealt, in the runs given. */
  share: number;
  /** Mean cats of this type on the board per second of waves, times the run count: how often the type is played. */
  boardMin: number;
  kills: number;
  /** Of the board time with an enemy on the field, the share with an enemy in reach. */
  uptime: number;
  /** Damage hits per attack: how many enemies one attack hurts (a zone's ticks count as hits). */
  hitsPerAttack: number;
  /** Damage per common-equivalent minute: a common-equivalent costs one summon whatever its class, so this is damage per fish. */
  perCe: number;
}

/** Share of the enemies' field time under each control effect, and px dragged back per minute, from runs played with `tally: true`. */
export function controlRow(results: RunResult[]): { slowed: number; frozen: number; stunned: number; armorBroken: number; pulledPerMin: number } {
  let enemy = 0;
  let slowed = 0;
  let frozen = 0;
  let stunned = 0;
  let broken = 0;
  let pulled = 0;
  let minutes = 0;
  for (const r of results) {
    const c = r.control;
    enemy += c.enemySec;
    slowed += c.slowed;
    frozen += c.frozen;
    stunned += c.stunned;
    broken += c.armorBroken;
    pulled += c.pulled;
    minutes += r.time / 60;
  }
  const d = enemy || 1;
  return { slowed: slowed / d, frozen: frozen / d, stunned: stunned / d, armorBroken: broken / d, pulledPerMin: pulled / (minutes || 1) };
}

/** Per unit type and per class, from runs played with `tally: true`. */
export function unitRows(results: RunResult[]): { units: UnitRow[]; classes: UnitRow[] } {
  const damage: Partial<Record<UnitId, number>> = {};
  for (const r of results) for (const [id, v] of Object.entries(r.stats.damageByUnit)) damage[id as UnitId] = (damage[id as UnitId] ?? 0) + (v as number);
  const total = Object.values(damage).reduce((a, v) => a + (v as number), 0) || 1;
  const make = (label: string, ids: readonly UnitId[]): UnitRow => {
    let dmg = 0;
    let board = 0;
    let ce = 0;
    let field = 0;
    let reach = 0;
    let kills = 0;
    let attacks = 0;
    let hits = 0;
    for (const id of ids) {
      dmg += damage[id] ?? 0;
      for (const r of results) {
        const t = r.units[id];
        if (!t) continue;
        board += t.boardSec;
        ce += t.ceSec;
        field += t.fieldSec;
        reach += t.reachSec;
        kills += t.kills;
        attacks += t.attacks;
        hits += t.hits;
      }
    }
    return {
      label, share: dmg / total, boardMin: board / 60 / results.length, kills: kills / results.length,
      uptime: field > 0 ? reach / field : 0, hitsPerAttack: attacks > 0 ? hits / attacks : 0, perCe: ce > 0 ? dmg / (ce / 60) : 0,
    };
  };
  const classes = (['warrior', 'ranger', 'mage', 'trickster'] as ClassId[]).map((c) => make(c, UNIT_IDS.filter((id) => unitClass(id) === c)));
  return { units: UNIT_IDS.map((id) => make(id, [id])), classes };
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
