/**
 * Plays whole runs with a bot, headlessly, and measures what the balance report needs. Used by the
 * `npm run sim` report and by the tests; the game itself never imports it.
 */
import type { BattleApi, BattleInit, ClassId, RunStats, UnitId, UnitState } from '../api';
import { CELL_COUNT, cellCenterX, cellCenterY } from '../geometry';
import { TICK } from '../data/balance';
import { enemySpec } from '../data/enemies';
import { unitSpec } from '../data/units';
import type { AttackSpec } from '../data/types';
import { unitRarityIndex } from '../data/roster';
import { createBot, type BotPolicy } from './bots';
import { createBattle } from './create';
import { Sim } from './sim';

export interface WaveSample {
  wave: number;
  /** Board firepower when the wave ended (nominal damage per second, area attacks counted for several targets). */
  firepower: number;
  /** Health of the wave divided by its length: the firepower needed to just keep up. */
  need: number;
  maxEnemies: number;
}

/** What one unit type did during a run (see `RunOptions.tally`). */
export interface UnitTally {
  /** Seconds the cat stood on the board during a wave, and the same weighted by common-equivalents (1, 2, 4, 8, 16 by rarity). */
  boardSec: number;
  ceSec: number;
  /** Of the board seconds in which the field held an enemy (`fieldSec`), those with an enemy inside the cat's reach. */
  fieldSec: number;
  reachSec: number;
  kills: number;
  /** Attacks fired and damage hits landed (zone ticks included, damage over time not): hits per attack is how many enemies a swing hurts. */
  attacks: number;
  hits: number;
}

/** How much of the enemies' time on the field the board's control effects covered (see `RunOptions.tally`). */
export interface ControlTally {
  enemySec: number;
  slowed: number;
  frozen: number;
  stunned: number;
  armorBroken: number;
  /** Path distance enemies were dragged back by black holes, px. */
  pulled: number;
}

export interface RunResult {
  victory: boolean;
  /** Wave in progress when the run ended. */
  wave: number;
  time: number;
  stats: RunStats;
  /** Wave at which the first legendary / mythic stood on the board (0 = never). */
  firstLegendary: number;
  firstMythic: number;
  /** True when the field ever reached the caution level. */
  caution: boolean;
  samples: WaveSample[];
  /** For every elite / boss kill: time used as a fraction of its limit. */
  bossRatios: number[];
  /** Why the run was lost, or null for a win (or an abandoned run). */
  lossReason: 'overrun' | 'boss_timeout' | null;
  /** Milliseconds spent inside `step()` only. */
  simMs: number;
  /** Per unit type; empty unless `RunOptions.tally` was set. */
  units: Partial<Record<UnitId, UnitTally>>;
  control: ControlTally;
}

export interface RunOptions {
  botSeed?: number;
  /** Seconds between bot decisions. */
  decision?: number;
  /** Stop after this many simulated seconds (safety net). */
  maxSeconds?: number;
  /** Synergy bot only: build this class line from the first cat instead of the heaviest one. */
  focus?: ClassId;
  /** Measure board time, uptime and kills per unit type (subscribes to `enemyDie`, a little slower). */
  tally?: boolean;
}

/** How many enemies an attack typically hurts at once, to turn single-target damage into firepower. */
function areaFactor(a: AttackSpec): number {
  switch (a.shape) {
    case 'single': return 1;
    case 'cleave': return 1 + 0.6 * (a.targets - 1);
    case 'line': return 2;
    case 'blast': return 2.5;
    case 'multi': return a.targets;
    case 'pierce': return 1 + 0.7 * a.targets;
    case 'splash': return 2;
    case 'chain': return 1 + 0.7 * (a.targets - 1);
    case 'frost': return 0.6 * ((a.duration / a.tick) * a.tickPct) * 2;
    case 'void': return 2.5;
    case 'brew': return 1.5;
  }
}

export function firepower(units: ReadonlyArray<UnitState | null>): number {
  let sum = 0;
  for (const u of units) {
    if (!u) continue;
    const s = u.stats;
    sum += ((s.damage * (1 + s.crit * (s.critMult - 1))) / s.interval) * areaFactor(unitSpec(u.id).attack);
  }
  return sum;
}

function simOf(b: BattleApi): Sim {
  if (!(b instanceof Sim)) throw new Error('runner: not a Sim');
  return b;
}

function tallyOf(result: RunResult, id: UnitId): UnitTally {
  return (result.units[id] ??= { boardSec: 0, ceSec: 0, fieldSec: 0, reachSec: 0, kills: 0, attacks: 0, hits: 0 });
}

/** Adds `dt` seconds of every cat on the board to the tallies. */
function sampleUnits(b: BattleApi, result: RunResult, dt: number): void {
  const field = b.enemies.length > 0;
  const control = result.control;
  for (const e of b.enemies) {
    control.enemySec += dt;
    if (e.slow > 0) control.slowed += dt;
    if (e.frozen) control.frozen += dt;
    if (e.stunned) control.stunned += dt;
    if (e.armorBroken) control.armorBroken += dt;
  }
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = b.units[c];
    if (!u) continue;
    const t = tallyOf(result, u.id);
    t.boardSec += dt;
    t.ceSec += dt * (1 << unitRarityIndex(u.id));
    if (!field) continue;
    t.fieldSec += dt;
    const cx = cellCenterX(c);
    const cy = cellCenterY(c);
    for (const e of b.enemies) {
      const dx = e.x - cx;
      const dy = e.y - cy;
      const reach = u.stats.range + enemySpec(e.id).radius;
      if (dx * dx + dy * dy <= reach * reach) {
        t.reachSec += dt;
        break;
      }
    }
  }
}

export function playRun(init: BattleInit, policy: BotPolicy, options: RunOptions = {}): RunResult {
  const b = createBattle(init);
  const sim = simOf(b);
  const bot = createBot(policy, options.botSeed ?? init.seed + 7, options.focus);
  const every = Math.max(1, Math.round((options.decision ?? 0.25) / TICK));
  const maxTicks = Math.round((options.maxSeconds ?? 1500) / TICK);
  const result: RunResult = {
    victory: false, wave: 0, time: 0, stats: b.getStats(), firstLegendary: 0, firstMythic: 0, caution: false,
    samples: [], bossRatios: [], lossReason: null, simMs: 0, units: {},
    control: { enemySec: 0, slowed: 0, frozen: 0, stunned: 0, armorBroken: 0, pulled: 0 },
  };
  const dt = every * TICK;
  if (options.tally) {
    b.events.on('enemyDie', (e) => {
      if (e.killer) tallyOf(result, e.killer.id).kills++;
    });
    b.events.on('attack', (e) => {
      tallyOf(result, e.unit.id).attacks++;
    });
    b.events.on('hit', (e) => {
      if (e.unitId && !e.dot) tallyOf(result, e.unitId).hits++;
    });
    b.events.on('pull', (e) => {
      result.control.pulled += e.distance;
    });
  }
  let lastWave = 0;
  let maxEnemies = 0;
  let bossSeen = false;
  let guard = 0;
  for (let tick = 0; tick < maxTicks && b.phase !== 'won' && b.phase !== 'lost'; tick++) {
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
      if (b.wave !== lastWave) {
        if (lastWave > 0) {
          result.samples.push({
            wave: lastWave, firepower: firepower(b.units), need: sim.waveHealth(lastWave) / sim.normalWaveTime, maxEnemies,
          });
        }
        lastWave = b.wave;
        maxEnemies = 0;
        bossSeen = false;
      }
      bot.act(b);
      if (b.enemyCount > maxEnemies) maxEnemies = b.enemyCount;
      if (b.enemyCount >= b.enemyCap * (2 / 3)) result.caution = true;
      if (b.boss) bossSeen = true;
      else if (bossSeen && b.waveKind !== 'normal') {
        result.bossRatios.push(b.waveTime / b.waveDuration);
        bossSeen = false;
      }
      for (let c = 0; c < CELL_COUNT; c++) {
        const u = b.units[c];
        if (!u) continue;
        const r = unitRarityIndex(u.id);
        if (r >= 3 && result.firstLegendary === 0) result.firstLegendary = b.wave;
        if (r >= 4 && result.firstMythic === 0) result.firstMythic = b.wave;
      }
      if (options.tally && b.phase === 'wave') sampleUnits(b, result, dt);
    }
    const t0 = performance.now();
    b.step(TICK);
    result.simMs += performance.now() - t0;
  }
  result.victory = b.phase === 'won';
  result.lossReason = sim.lossReason;
  result.wave = b.wave;
  result.time = b.time;
  result.stats = b.getStats();
  return result;
}
