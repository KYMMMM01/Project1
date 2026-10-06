/** Shared setup for the simulation tests: small builders and a direct line to the Sim internals. */
import { RELIC_IDS, type BattleEvents, type BattleInit, type EnemyId, type UnitId } from '@/game/api';
import { makeUnit, refresh } from '@/game/sim/board';
import { createBattle } from '@/game/sim/create';
import { damageEnemy, removeEnemy, spawnEnemy } from '@/game/sim/enemies';
import { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { BASE_UNIT_IDS } from '@/game/data/roster';
import { TICK } from '@/game/data/balance';

export function initOf(over: Partial<BattleInit> = {}, level = 1): BattleInit {
  return {
    seed: 12345,
    mode: 'chapter',
    chapter: 1,
    stake: 0,
    loadout: {
      unitLevels: Object.fromEntries(BASE_UNIT_IDS.map((id) => [id, level])),
      training: {},
      relicPool: [...RELIC_IDS],
    },
    ...over,
  };
}

export function newSim(over: Partial<BattleInit> = {}, level = 1): Sim {
  const b = createBattle(initOf(over, level));
  if (!(b instanceof Sim)) throw new Error('not a Sim');
  return b;
}

/** Advances `seconds` of simulated time in single ticks. */
export function advance(sim: Sim, seconds: number): void {
  const ticks = Math.round(seconds / TICK);
  for (let i = 0; i < ticks; i++) sim.step(TICK);
}

/** Skips the preparation time and cancels the wave's scripted spawns so a test controls the field. */
export function quietWave(sim: Sim): void {
  advance(sim, 3.05);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  sim.spawnIdx = 0;
}

export function put(sim: Sim, cell: number, id: UnitId, charge = 0.5): SimUnit {
  const u = makeUnit(sim, id, cell, charge);
  sim.units[cell] = u;
  refresh(sim);
  return u;
}

/** An enemy with the given health, `travelled` px along the loop. */
export function foe(sim: Sim, id: EnemyId, travelled = 0, hp = 1e9): SimEnemy {
  return spawnEnemy(sim, id, travelled, hp / 1, false, hp);
}

export function clearEnemies(sim: Sim): void {
  for (const e of sim.enemies.slice()) removeEnemy(sim, e);
}

/** Collects every payload of one event type. */
export function record<K extends keyof BattleEvents>(sim: Sim, type: K): BattleEvents[K][] {
  const out: BattleEvents[K][] = [];
  sim.events.on(type, (p) => {
    out.push(p);
  });
  return out;
}

/** Gives the run plenty of fish so cost never gets in the way. */
export function rich(sim: Sim, fish = 1_000_000, purr = 20): void {
  sim.fish = fish;
  sim.purr = purr;
}

/** Kills an elite or boss outright: its damage allowance would otherwise soak up the blow. */
export function slay(sim: Sim, e: SimEnemy | null = sim.boss): void {
  if (!e) throw new Error('nothing to slay');
  e.capTokens = Infinity;
  damageEnemy(sim, e, 1e12, 'magic', null, false, null);
}
