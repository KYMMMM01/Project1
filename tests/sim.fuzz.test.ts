import { describe, expect, it } from 'vitest';
import { CLASS_IDS, RELIC_IDS, type BattleApi, type BattleInit, type Fail, type UnitId } from '@/game/api';
import { Rng } from '@/core/rng';
import { CELL_COUNT } from '@/game/geometry';
import { MODIFIER_IDS } from '@/game/data/modifiers';
import { BASE_UNIT_IDS } from '@/game/data/roster';
import { TICK } from '@/game/data/balance';
import { createBattle } from '@/game/sim/create';
import { playRun } from '@/game/sim/runner';
import { initOf, newSim, put, record } from './simHelpers';

const MODES = ['chapter', 'tutorial', 'daily', 'endless'] as const;

function randomInit(rng: Rng): BattleInit {
  const mode = rng.pick(MODES);
  const levels = Object.fromEntries(BASE_UNIT_IDS.map((id) => [id, rng.int(1, 10)]));
  const pool = RELIC_IDS.filter(() => rng.chance(0.8));
  const modifiers = mode === 'daily' ? MODIFIER_IDS.filter(() => rng.chance(0.25)) : undefined;
  return {
    seed: rng.int(1, 2 ** 31),
    mode,
    chapter: rng.int(1, 5),
    stake: rng.int(0, 5),
    loadout: {
      unitLevels: levels,
      training: { start_fish: rng.int(0, 10), damage: rng.int(0, 10), enemy_cap: rng.int(0, 10), laser_cd: rng.int(0, 10), boss_time: rng.int(0, 5) },
      relicPool: pool,
    },
    modifiers,
    bonusFish: rng.chance(0.3) ? rng.int(0, 500) : undefined,
    bonusPurr: rng.chance(0.3) ? rng.int(0, 6) : undefined,
    firstSummonRarePlus: rng.chance(0.5),
  };
}

const FAILS: ReadonlySet<Fail> = new Set<Fail>([
  'not_enough_fish', 'not_enough_purr', 'board_full', 'choice_pending', 'not_in_battle', 'invalid_cell', 'empty_cell', 'max_level',
  'not_legendary', 'synergy_too_low', 'molt_limit', 'on_cooldown', 'not_available', 'already_used', 'nothing_to_do',
]);

/** One random player command. Every result must be null or a documented failure reason. */
function randomCommand(b: BattleApi, rng: Rng): void {
  const cell = (): number => rng.int(-2, CELL_COUNT + 1);
  const pickOf = <T,>(list: readonly T[]): T => list[rng.int(0, list.length - 1)] as T;
  let result: Fail | null = null;
  switch (rng.int(0, 15)) {
    case 0:
    case 1:
    case 2: result = b.summon(); break;
    case 3:
    case 4: result = b.drop(cell(), cell()); break;
    case 5: result = b.sell(cell()); break;
    case 6: result = b.molt(cell(), pickOf(CLASS_IDS)); break;
    case 7: result = b.awaken(cell()); break;
    case 8: result = b.upgradeClass(pickOf(CLASS_IDS)); break;
    case 9: result = b.upgradeSummon(); break;
    case 10: result = b.setLaser(rng.range(-50, 800), rng.range(-50, 700)); break;
    case 11: result = b.callNextWave(); break;
    case 12: result = b.pickSummon(rng.int(-1, 3)); break;
    case 13: result = b.pickRelic(rng.int(-1, 3)); break;
    case 14: result = b.rerollRelics(rng.chance(0.5)); break;
    default: result = rng.chance(0.2) ? b.revive() : null;
  }
  if (result !== null) expect(FAILS.has(result), String(result)).toBe(true);
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function ok(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

/** Everything that must hold after any step (plain checks: this runs millions of times). */
function checkInvariants(b: BattleApi): void {
  ok(b.fish >= 0 && Number.isInteger(b.fish), `fish ${b.fish}`);
  ok(b.purr >= 0 && Number.isInteger(b.purr), `purr ${b.purr}`);
  ok(b.units.length === CELL_COUNT, 'board size');
  const seen = new Set<number>();
  b.units.forEach((u, cell) => {
    if (!u) return;
    ok(u.cell === cell, 'unit cell');
    ok(!seen.has(u.uid), 'unit uid');
    seen.add(u.uid);
    for (const v of [u.charge, u.weakened, u.stats.damage, u.stats.interval, u.stats.range, u.stats.crit, u.stats.critMult]) ok(finite(v), 'unit NaN');
    ok(u.stats.interval > 0 && u.charge >= 0, 'unit gauge');
  });
  ok(b.enemies.length === b.enemyCount, 'enemy count');
  const uids = new Set<number>();
  for (const e of b.enemies) {
    ok(!uids.has(e.uid), 'enemy uid');
    uids.add(e.uid);
    for (const v of [e.x, e.y, e.hp, e.maxHp, e.shield, e.slow, e.travelled, e.angle]) ok(finite(v), 'enemy NaN');
    ok(e.hp > 0, 'dead enemy on the field');
    ok(e.slow <= 0.5 + 1e-9, 'slow cap');
  }
  for (const p of b.projectiles) for (const v of [p.x, p.y, p.angle]) ok(finite(v), 'projectile NaN');
  for (const z of b.zones) for (const v of [z.x, z.y, z.radius, z.timeLeft]) ok(finite(v), 'zone NaN');
  ok(b.sunbeams.length >= 4 && new Set(b.sunbeams).size === b.sunbeams.length, 'sunbeams');
  ok((b.phase === 'choice') === (b.pending !== null), 'pending / phase');
  ok(b.overflowTime >= 0 && b.laser.cooldown >= 0 && finite(b.time), 'timers');
  ok(b.boss === null || b.enemies.includes(b.boss), 'boss reference');
  if (b.phase === 'won' || b.phase === 'lost') ok(b.pending === null, 'pending after the end');
}

/** A compact fingerprint of the full visible state. */
function fingerprint(b: BattleApi): string {
  let h = 0;
  for (const e of b.enemies) h += e.x * 3 + e.y * 5 + e.hp + e.travelled;
  for (const u of b.units) if (u) h += u.charge * 7 + u.stats.damage + u.kills;
  return JSON.stringify({ t: b.time, f: b.fish, p: b.purr, w: b.wave, n: b.enemyCount, ph: b.phase, h: Math.round(h * 1e6), s: b.getStats() });
}

describe('invariants under random command fuzzing', () => {
  it('holds over 1,000 random runs', { timeout: 300_000 }, () => {
    const meta = new Rng(2024);
    for (let run = 0; run < 1000; run++) {
      const rng = new Rng(meta.int(1, 2 ** 30));
      const b = createBattle(randomInit(rng));
      const length = rng.range(20, 100);
      let nextCommand = 0;
      let steps = 0;
      while (b.time < length && b.phase !== 'won' && b.phase !== 'lost') {
        if (b.time >= nextCommand) {
          const burst = rng.int(1, 3);
          for (let k = 0; k < burst; k++) randomCommand(b, rng);
          nextCommand = b.time + rng.range(0.05, 1.2);
        }
        b.step(rng.chance(0.2) ? rng.range(0.001, 0.2) : TICK);
        if (b.phase === 'choice') {
          randomCommand(b, rng);
          if (b.pending?.kind === 'summon') b.pickSummon(rng.int(0, 2));
          else if (b.pending?.kind === 'relic') b.pickRelic(rng.int(0, b.pending.options.length - 1));
        }
        if (++steps % 5 === 0) checkInvariants(b);
      }
      checkInvariants(b);
      const stats = b.getStats();
      for (const v of [stats.kills, stats.duration, stats.peakEnemies, stats.summonLuck]) expect(finite(v)).toBe(true);
      expect(stats.summonLuck).toBeGreaterThanOrEqual(0);
      expect(stats.summonLuck).toBeLessThanOrEqual(1);
    }
  });
});

describe('determinism', () => {
  interface Scripted {
    init: BattleInit;
    /** [time of the command, seed for the command] */
    commands: [number, number][];
    steps: number[];
  }

  function script(seed: number): Scripted {
    const rng = new Rng(seed);
    const init = randomInit(rng);
    const commands: [number, number][] = [];
    let t = 0;
    while (t < 80) {
      t += rng.range(0.05, 1);
      commands.push([t, rng.int(1, 2 ** 30)]);
    }
    return { init, commands, steps: Array.from({ length: 4000 }, () => (rng.chance(0.2) ? rng.range(0.001, 0.2) : TICK)) };
  }

  function play(s: Scripted): string {
    const b = createBattle(s.init);
    let next = 0;
    let i = 0;
    for (const dt of s.steps) {
      if (b.phase === 'won' || b.phase === 'lost') break;
      while (next < s.commands.length && (s.commands[next] as [number, number])[0] <= b.time) {
        randomCommand(b, new Rng((s.commands[next] as [number, number])[1]));
        next++;
      }
      b.step(dt);
      if (b.phase === 'choice') {
        if (b.pending?.kind === 'summon') b.pickSummon(i++ % 3);
        else if (b.pending?.kind === 'relic') b.pickRelic(0);
      }
    }
    return fingerprint(b);
  }

  it('gives the same result for the same init and the same command list, 60 times over', { timeout: 120_000 }, () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = script(seed * 17);
      expect(play(s)).toBe(play(s));
    }
  });

  it('differs for another seed', () => {
    const s = script(3);
    const other = { ...s, init: { ...s.init, seed: s.init.seed + 1 } };
    expect(play(s)).not.toBe(play(other));
  });

  it('gives the same run through bots and the runner', () => {
    const init = initOf({ seed: 99 });
    const a = playRun(init, 'synergy');
    const b = playRun(init, 'synergy');
    expect({ ...a, simMs: 0 }).toEqual({ ...b, simMs: 0 });
  });
});

describe('stream independence', () => {
  /** Summons `count` times, selling each unit; `noise` sprinkles other commands at other times. */
  function summons(seed: number, noise: boolean, count: number): { units: UnitId[]; offers: UnitId[][]; merges: string[] } {
    const sim = newSim({ seed });
    sim.fish = 1_000_000;
    sim.purr = 50;
    const units: UnitId[] = [];
    const offers: UnitId[][] = [];
    const merges: string[] = [];
    sim.events.on('summon', (e) => {
      if (e.source === 'button' || e.source === 'choice') units.push(e.unit.id);
    });
    sim.events.on('summonOffer', (e) => offers.push(e.options));
    sim.events.on('merge', (e) => merges.push(e.result.id[0] as string));
    const noiseRng = new Rng(seed + 5);
    for (let n = 0; n < count; n++) {
      if (noise) {
        sim.step(noiseRng.range(0, 0.5));
        sim.upgradeClass(noiseRng.pick(CLASS_IDS));
        sim.setLaser(noiseRng.range(0, 700), noiseRng.range(0, 600));
        sim.step(noiseRng.range(0, 1));
        sim.callNextWave();
      }
      expect(sim.summon()).toBeNull();
      if (sim.pending) sim.pickSummon(0);
      const cell = sim.units.findIndex((u) => u !== null);
      if (noise && cell >= 0) {
        const other = sim.units.findIndex((u, c) => u === null && c !== cell);
        sim.drop(cell, other);
      }
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
    }
    return { units, offers, merges };
  }

  it('keeps the n-th summon result and the k-th three-pick whatever else the player does', () => {
    for (const seed of [1, 7, 42, 1234, 99999]) {
      const quiet = summons(seed, false, 40);
      const busy = summons(seed, true, 40);
      expect(busy.units).toEqual(quiet.units);
      expect(busy.offers).toEqual(quiet.offers);
      expect(quiet.units.length).toBeGreaterThan(30);
      expect(quiet.offers.length).toBe(6);
    }
  });

  it('keeps the merge results of the j-th merge', () => {
    const run = (extra: boolean): string[] => {
      const sim = newSim({ seed: 8 });
      const out: string[] = [];
      sim.events.on('merge', (e) => out.push(e.result.id[0] as string));
      sim.fish = 1e6;
      for (let j = 0; j < 12; j++) {
        if (extra) {
          sim.step(0.3);
          sim.upgradeClass('mage');
          sim.summon();
          if (sim.pending) sim.pickSummon(0);
        }
        for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
        put(sim, 0, 'w_paw');
        put(sim, 1, 'w_paw');
        sim.drop(0, 1);
      }
      return out;
    };
    const quiet = run(false);
    expect(quiet).toHaveLength(12);
    expect(run(true)).toEqual(quiet);
  });
});

describe('summon luck', () => {
  it('reports 0.5 before any summon and moves with the results', () => {
    const sim = newSim();
    expect(sim.getStats().summonLuck).toBe(0.5);
    const lucky = record(sim, 'summon');
    sim.fish = 1e6;
    for (let i = 0; i < 30; i++) {
      sim.summon();
      if (sim.pending) sim.pickSummon(0);
      for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
    }
    expect(lucky.length).toBeGreaterThanOrEqual(30);
    const luck = sim.getStats().summonLuck;
    expect(luck).toBeGreaterThan(0);
    expect(luck).toBeLessThan(1);
  });

  it('averages near one half over many runs', () => {
    let sum = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const sim = newSim({ seed: seed * 31 });
      sim.fish = 1e6;
      for (let i = 0; i < 25; i++) {
        sim.summon();
        if (sim.pending) sim.pickSummon(0);
        for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c]) sim.sell(c);
      }
      sum += sim.getStats().summonLuck;
    }
    expect(sum / n).toBeGreaterThan(0.43);
    expect(sum / n).toBeLessThan(0.57);
  });
});

