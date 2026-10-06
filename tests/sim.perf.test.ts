import v8 from 'node:v8';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { TICK } from '@/game/data/balance';
import { createBot } from '@/game/sim/bots';
import { playRun } from '@/game/sim/runner';
import { foe, initOf, newSim } from './simHelpers';

/** A forced garbage collection, so a test measures its own work and not the garbage of what ran before it. */
const collect = ((): (() => void) => {
  v8.setFlagsFromString('--expose_gc');
  return vm.runInNewContext('gc') as () => void;
})();

// Kept in a file of its own: every test file gets a fresh JIT, so these numbers are not polluted by the
// thousands of odd runs of the fuzz tests.
describe('performance', () => {
  it('simulates a full 24-wave run headlessly in under 150 ms', { timeout: 60_000 }, () => {
    let init = initOf({ seed: 5 });
    for (let seed = 5; seed < 40; seed++) {
      init = initOf({ seed });
      if (playRun(init, 'synergy').victory) break;
    }
    const probe = playRun(init, 'synergy');
    expect(probe.victory).toBe(true);
    expect(probe.stats.wavesCleared).toBe(24);
    let best = Infinity;
    for (let i = 0; i < 6; i++) {
      collect();
      best = Math.min(best, playRun(init, 'synergy').simMs);
    }
    expect(best).toBeLessThan(150);
  });

  it('does not allocate on the heap while a steady field plays on', () => {
    const sim = newSim({ seed: 3 });
    sim.fish = 1e6;
    const bot = createBot('merge', 3);
    for (let i = 0; i < 60; i++) {
      if (sim.phase === 'choice') bot.choose(sim);
      bot.act(sim);
      sim.step(0.5);
    }
    expect(sim.phase).toBe('wave');
    sim.waveDuration = 1e9;
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    for (const e of sim.enemies.slice()) e.hp = e.maxHp = 1e15;
    for (let i = 0; i < 30; i++) foe(sim, 'cucumber', i * 75, 1e15);
    for (let i = 0; i < 20; i++) sim.step(0.2);
    collect();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 3000; i++) sim.step(TICK);
    collect();
    const grown = process.memoryUsage().heapUsed - before;
    expect(sim.enemyCount).toBeGreaterThan(25);
    expect(grown).toBeLessThan(400_000);
  });
});

