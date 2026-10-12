/**
 * The gold dungeon's balance report (`npx vitest run --config vitest.sim.config.ts tests/simreport.dungeon.sim.ts`, also part of `npm run sim`).
 * Plays the dungeon with the merge and the synergy bot at each tier's recommended unit level and prints, per tier: the win rate, the waves
 * got through, the enemies killed, the run's length, the share of the chest's time limit used, and the gold a bot run pays by the meta layer's
 * own formula. It never fails on a balance number. Environment: SIM_RUNS (runs per cell, default 300), SIM_TIERS=1,2 (default all five),
 * SIM_BOTS=merge,synergy,random (default merge,synergy), SIM_LEVEL=n (a unit level for every tier instead of the recommended one).
 */
import { describe, it } from 'vitest';
import { RECOMMENDED_LEVEL } from '@/game/data/balance';
import { GOLD_DUNGEON_WAVES, goldDungeonSpawns } from '@/game/data/goldDungeon';
import type { BotPolicy } from '@/game/sim/bots';
import { dungeonGold, dungeonMaxGold } from '@/meta/dungeon';
import { batch, loadoutInit, median, pct, printTable } from './simReportKit';

const RUNS = Number(process.env.SIM_RUNS ?? 300);
const list = (name: string, fallback: string): string[] => (process.env[name] ?? fallback).split(',').filter(Boolean);
const TIERS = list('SIM_TIERS', '1,2,3,4,5').map(Number);
const BOTS = list('SIM_BOTS', 'merge,synergy') as BotPolicy[];
const LEVEL = process.env.SIM_LEVEL ? Number(process.env.SIM_LEVEL) : 0;

describe('gold dungeon report', () => {
  it('win rate, length and pay per tier', () => {
    const rows: (string | number)[][] = [];
    for (const tier of TIERS) {
      const level = LEVEL || (RECOMMENDED_LEVEL[tier - 1] as number);
      for (const bot of BOTS) {
        const b = batch(RUNS, bot, (seed) => loadoutInit(seed, tier, 0, level, 'gold'));
        const rs = b.results;
        const mean = (f: (r: (typeof rs)[number]) => number): number => rs.reduce((a, r) => a + f(r), 0) / rs.length;
        const pay = rs.map((r) => dungeonGold({ tier, wavesCleared: r.stats.wavesCleared, kills: r.stats.kills, victory: r.victory }));
        const losses = rs.filter((r) => !r.victory);
        const why = (k: string): number => losses.filter((r) => r.lossReason === k).length;
        rows.push([
          `t${tier} L${level} ${bot}`, pct(b.winRate), mean((r) => r.stats.wavesCleared).toFixed(2), mean((r) => r.stats.kills).toFixed(0),
          mean((r) => r.time / 60).toFixed(2), pct(mean((r) => (r.caution ? 1 : 0))), b.bossRatio ? b.bossRatio.toFixed(2) : '-',
          Math.round(pay.reduce((a, v) => a + v, 0) / pay.length), Math.round(median(pay)), dungeonMaxGold(tier),
          `${why('overrun')}/${why('boss_timeout')}`,
        ]);
      }
    }
    printTable(
      `Gold dungeon, ${RUNS} runs per cell, ${GOLD_DUNGEON_WAVES} waves, the script spawns ${goldDungeonSpawns()} enemies`,
      ['case', 'win', 'waves', 'kills', 'min', 'caution', 'boss t/limit', 'pay mean', 'pay med', 'pay max', 'lost overrun/timeout'],
      rows,
    );
  });
});
