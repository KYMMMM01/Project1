/**
 * Plays whole runs with a bot, headlessly, and measures what the balance report needs. Used by the
 * `npm run sim` report and by the tests; the game itself never imports it.
 */
import type { BattleApi, BattleInit, RunStats, UnitState } from '../api';
import { CELL_COUNT } from '../geometry';
import { TICK } from '../data/balance';
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
}

export interface RunOptions {
  botSeed?: number;
  /** Seconds between bot decisions. */
  decision?: number;
  /** Stop after this many simulated seconds (safety net). */
  maxSeconds?: number;
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

export function playRun(init: BattleInit, policy: BotPolicy, options: RunOptions = {}): RunResult {
  const b = createBattle(init);
  const sim = simOf(b);
  const bot = createBot(policy, options.botSeed ?? init.seed + 7);
  const every = Math.max(1, Math.round((options.decision ?? 0.25) / TICK));
  const maxTicks = Math.round((options.maxSeconds ?? 1500) / TICK);
  const result: RunResult = {
    victory: false, wave: 0, time: 0, stats: b.getStats(), firstLegendary: 0, firstMythic: 0, caution: false,
    samples: [], bossRatios: [], lossReason: null, simMs: 0,
  };
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
