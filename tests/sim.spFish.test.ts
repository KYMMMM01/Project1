/**
 * The alchemist's skill, Turn Into Fish! (docs/design_skills_v2.md 3.11, 4.4.1, 7 questions 5, 11 and 12): a big flask turns an elite or a boss
 * into a fish (walks at a quarter of its speed for 4 s / 2.5 s, then cannot be turned again for 8 s / 5 s, whatever the slow caps, the
 * resistances and the immunities say), small flasks turn the weakest ordinary enemies into fish for good (removed by a path of their own, no
 * split, no burst, double fish). The frame it stands on is tested in `sim.spSkills.test.ts`.
 *
 * The cats around the alchemist are the ones whose skills exist whatever the other step-2 agents have built: the viking, the tiger, the
 * gunner, the star archer and the bard are skill cats; the paw, the sling, the sword and the chef have none.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, EnemyId, SpCastEvent } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { BOSS_SPECS } from '@/game/data/enemies';
import { SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { applyStatus, damageEnemy, hasteEnemy, pullEnemy, removeEnemy, spawnEnemy, transmuteEnemy, transmuteSpecial } from '@/game/sim/enemies';
import { startWave } from '@/game/sim/flow';
import { fish, reachCount } from '@/game/sim/sp/fish';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import type { Sim } from '@/game/sim/sim';
import { ST_FISH, ST_SLOW, type SimEnemy, type SimUnit, type SimZone } from '@/game/sim/types';
import { advance, foe, newSim, put, quietWave, slay } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.fish;
type FishCast = Extract<SpCastEvent, { skill: 'fish' }>;

/** A battle in a wave whose scripted spawns are cancelled: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}): Sim {
  const sim = newSim(over);
  quietWave(sim);
  return sim;
}

/** A battle in the wave `wave`, whose elite or boss has walked in (one second after the wave began); the scripted spawns are cancelled. */
function specialArena(wave: number, over: Parameters<typeof newSim>[0] = {}): { sim: Sim; boss: SimEnemy } {
  const sim = newSim(over);
  quietWave(sim);
  startWave(sim, wave);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  sim.spawnIdx = 0;
  advance(sim, 1.05);
  return { sim, boss: sim.boss as SimEnemy };
}

/**
 * An enemy held in place on the top edge of the road, at (381, 45) when `travelled` is 300. From there the alchemist at tile 7 (190 px; range
 * 340) reaches it, and so does the paw at tile 2 (95 px; range 200 + the enemy's radius) and the sling at tile 12 (286 px; range 420), while the
 * sword at tile 17 (381 px; range 210), the snowball at 17 (range 290) and the sling at tile 22 (477 px) do not.
 */
function standing(sim: Sim, id: EnemyId, travelled = 300, hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** A weak ordinary enemy: a cucumber of a wave whose cucumber has 100 health, with `hp` left, held on the top edge of the road. */
function weakling(sim: Sim, hp: number, travelled = 300, id: EnemyId = 'cucumber'): SimEnemy {
  const e = spawnEnemy(sim, id, travelled, 100, false, hp);
  e.frozen = true;
  return e;
}

/** An alchemist in `cell` with a full gauge. */
function alchemist(sim: Sim, cell = 7, sp = 1): SimUnit {
  const u = put(sim, cell, 't_alch', 0);
  u.sp = sp;
  return u;
}

/** The alchemist at tile 7 and the two cats that make it three on a target standing at 300: a paw at 2 and a sling at 12. */
function crew(sim: Sim): { alch: SimUnit; paw: SimUnit; sling: SimUnit } {
  return { alch: alchemist(sim), paw: put(sim, 2, 'w_paw', 0), sling: put(sim, 12, 'r_sling', 0) };
}

/** Throws the flasks through the handler (what the gauge pass does when the gauge is full) after asserting that the skill said it was ready. */
function throwFlasks(sim: Sim, u: SimUnit): void {
  expect(fish.ready(sim, u)).toBe(true);
  expect(fish.cast(sim, u)).toBe(true);
  // What the gauge pass does after a cast; without it the next tick would cast the same full gauge again.
  u.sp = 0;
}

/** The `spCast` events of the alchemist's skill, collected as they come. */
function fishCasts(sim: Sim): FishCast[] {
  const out: FishCast[] = [];
  sim.events.on('spCast', (e) => {
    if (e.skill === 'fish') out.push(e);
  });
  return out;
}

/** Every event of the listed types, in the order they were emitted, with the simulation time. */
function tape(sim: Sim, types: Array<keyof BattleEvents>): Array<{ type: string; time: number; payload: unknown }> {
  const out: Array<{ type: string; time: number; payload: unknown }> = [];
  for (const type of types) sim.events.on(type, (payload) => out.push({ type, time: sim.time, payload }));
  return out;
}

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

/** How far the enemy has walked since `from`. */
const walked = (e: SimEnemy, from: number): number => e.travelled - from;

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Turn Into Fish, the data', () => {
  it('has the design appendix\'s cells and is built: the alchemist carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'fish', unit: 't_alch', rank: 4, cooldown: 24, flasks: 5, big: 1, smallTargets: { withBig: 4, withoutBig: 5 }, maxHp: 0.6, bounty: 2,
      fishSpeed: 0.25, fishTime: { boss: 4, elite: 2.5 }, fishLock: { boss: 8, elite: 5 }, reachMin: 3, minTargets: 2, inReachOnly: true, built: true,
    });
    expect(unitDef('t_alch').spSkill).toEqual({ id: 'fish', rank: 4, cooldown: 24, nameKey: 'sp.fish.name' });
    expect(SP_HANDLERS.fish).toBe(fish);
    // The design's arithmetic: the fish plus its lock costs 12 s / 7.5 s of which 3 s / 1.875 s of walking is lost: an average of -25% both times.
    for (const kind of ['boss', 'elite'] as const) {
      const lost = ROW.fishTime[kind] * (1 - ROW.fishSpeed);
      expect(lost / (ROW.fishTime[kind] + ROW.fishLock[kind])).toBeCloseTo(0.25, 9);
    }
  });

  it('fills the alchemist\'s gauge in 24 s, from the 50% a cat starts at in 12 s', () => {
    const sim = arena();
    const u = put(sim, 7, 't_alch');
    expect(u.sp).toBe(0.5);
    advance(sim, 11.8);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('gives every enemy the new fields: no fish, no lock', () => {
    const sim = arena();
    const e = foe(sim, 'cucumber', 0);
    expect([e.fish, e.fishUntil, e.fishLockUntil, e.mask & ST_FISH]).toEqual([false, 0, 0, 0]);
  });
});

// ───────────────────────────── the fish status ─────────────────────────────

describe('the fish status on an elite or a boss', () => {
  it('walks at a quarter of its speed for the fish time and then at its own again (boss 4 s, elite 2.5 s)', () => {
    for (const [id, seconds] of [['boss_vacuum', 4], ['spray', 2.5], ['boss_cucumber', 2.5]] as const) {
      const sim = arena();
      const e = foe(sim, id, 100);
      const control = foe(sim, id, 100);
      const started = tape(sim, ['status', 'fishEnd']);
      expect(transmuteSpecial(sim, e, seconds, 8)).toBe(true);
      expect(e.fish).toBe(true);
      expect(e.mask & ST_FISH).toBe(ST_FISH);
      advance(sim, seconds - 0.1);
      expect(e.fish, id).toBe(true);
      expect(walked(e, 100) / walked(control, 100), id).toBeCloseTo(0.25, 6);
      advance(sim, 0.2);
      expect(e.fish, id).toBe(false);
      expect(e.mask & ST_FISH).toBe(0);
      const before = [walked(e, 100), walked(control, 100)];
      advance(sim, 1);
      // Back to its own speed: a second of the control's steps and the same of the enemy's.
      expect(walked(e, 100) - (before[0] as number)).toBeCloseTo(walked(control, 100) - (before[1] as number), 6);
      expect(started.map((t) => t.type), id).toEqual(['status', 'fishEnd']);
      expect(started[0]!.payload).toMatchObject({ kind: 'fish', duration: seconds });
      expect(started[1]!.time - started[0]!.time).toBeGreaterThan(seconds - TICK - 1e-6);
      expect(started[1]!.time - started[0]!.time).toBeLessThan(seconds + TICK + 1e-6);
      expect(started[1]!.payload).toMatchObject({ lock: expect.closeTo(8, 1) });
    }
  });

  it('is not a slow: nothing that asks whether the enemy is slowed sees it, and a real slow on top multiplies', () => {
    const sim = arena();
    sim.fx.slowedDamage = 0.15;
    const e = foe(sim, 'boss_vacuum', 100);
    const plain = foe(sim, 'boss_vacuum', 100);
    const slowed = foe(sim, 'boss_vacuum', 100);
    transmuteSpecial(sim, e, 4, 8);
    applyStatus(sim, slowed, 'slow', 0.5, 4, null);
    expect(e.slow).toBe(0);
    expect(e.mask & ST_SLOW).toBe(0);
    // The toy that hits slowed enemies harder (+15%) hits the slowed one and not the fish.
    const taken = (x: SimEnemy): number => {
      const before = x.hp;
      damageEnemy(sim, x, 1000, 'magic', null, false, null);
      return before - x.hp;
    };
    expect(taken(e)).toBe(taken(plain));
    expect(taken(slowed)).toBeGreaterThan(taken(plain) * 1.1);
    // A slow laid over the fish: both factors walk.
    applyStatus(sim, e, 'slow', 0.5, 4, null);
    const cap = sim.rules.specialSlowCap;
    advance(sim, 1);
    expect(walked(e, 100) / walked(plain, 100)).toBeCloseTo(0.25 * (1 - cap), 6);
  });

  it('goes past every cap, resistance and immunity of the slow, at every butler level', () => {
    for (const stake of [0, 1, 5]) {
      const sim = arena({ stake });
      const e = foe(sim, 'boss_blender', 100);
      const control = foe(sim, 'boss_blender', 100);
      // What stops a slow cold: the pills' and the vaccine's immunity, and the stun / freeze window.
      e.slowImmuneUntil = Infinity;
      e.ccImmuneUntil = Infinity;
      sim.vaccinateUntil = sim.time + 1000;
      applyStatus(sim, e, 'slow', 0.5, 4, null);
      expect(e.slow, `stake ${stake}`).toBe(0);
      expect(transmuteSpecial(sim, e, 4, 8)).toBe(true);
      advance(sim, 3);
      expect(walked(e, 100) / walked(control, 100), `stake ${stake}`).toBeCloseTo(0.25, 6);
    }
    // The slow of a boss is capped at 25% at level 0 and at 15% at level 5; the fish is 75% at both.
    expect(arena({ stake: 5 }).rules.specialSlowCap).toBeLessThan(arena({ stake: 0 }).rules.specialSlowCap);
  });

  it('keeps every other factor: the rage, the whirl, the nap blanket and a haste multiply with it', () => {
    const sim = arena();
    const e = foe(sim, 'boss_cucumber', 100, 1000);
    const control = foe(sim, 'boss_cucumber', 100, 1000);
    for (const x of [e, control]) x.hp = 400;
    sim.whirlUntil = sim.time + 1000;
    sim.whirlSpeed = 0.2;
    sim.fx.enemySlow = 0.1;
    hasteEnemy(sim, e, 0.1, 100);
    hasteEnemy(sim, control, 0.1, 100);
    transmuteSpecial(sim, e, 4, 8);
    const from = [e.travelled, control.travelled];
    sim.step(TICK);
    const rage = BOSS_SPECS.enrage.maxBonus * (1 - 400 / 1000);
    const haste = Math.max(0.1, 0.2, rage);
    const expected = e.spec.speed * (1 + haste) * 0.9 * TICK;
    expect(control.travelled - (from[1] as number)).toBeCloseTo(expected, 9);
    expect(e.travelled - (from[0] as number)).toBeCloseTo(expected * 0.25, 9);
  });

  it('is only for elites and bosses, and only when it is neither a fish nor locked; a second flask does not lengthen it', () => {
    const sim = arena();
    expect(transmuteSpecial(sim, foe(sim, 'cucumber', 100), 4, 8)).toBe(false);
    expect(transmuteSpecial(sim, foe(sim, 'roomba', 100), 4, 8)).toBe(false);
    const events = tape(sim, ['status']);
    const boss = foe(sim, 'boss_vacuum', 100);
    expect(transmuteSpecial(sim, boss, 4, 8)).toBe(true);
    const until = boss.fishUntil;
    advance(sim, 2);
    // During the fish: nothing, and not a second `status` either.
    expect(transmuteSpecial(sim, boss, 4, 8)).toBe(false);
    expect(boss.fishUntil).toBe(until);
    expect(events).toHaveLength(1);
    // After it: locked for 8 s from the end (4 s of fish + 8 s of lock = 12 s from the start).
    advance(sim, 2.2);
    expect(boss.fish).toBe(false);
    advance(sim, 7.5);
    expect(transmuteSpecial(sim, boss, 4, 8)).toBe(false);
    advance(sim, 0.6);
    expect(transmuteSpecial(sim, boss, 4, 8)).toBe(true);
    expect(events).toHaveLength(2);
    // A dead one cannot be turned.
    const gone = foe(sim, 'boss_vacuum', 100);
    removeEnemy(sim, gone);
    expect(transmuteSpecial(sim, gone, 4, 8)).toBe(false);
  });

  it('keeps the elite\'s lock at 5 s and a lock of 0 never makes it negative', () => {
    const sim = arena();
    const elite = foe(sim, 'spray', 100);
    expect(transmuteSpecial(sim, elite, 2.5, 5)).toBe(true);
    advance(sim, 2.6);
    expect(elite.fish).toBe(false);
    advance(sim, 4.7);
    expect(transmuteSpecial(sim, elite, 2.5, 5)).toBe(false);
    advance(sim, 0.4);
    expect(transmuteSpecial(sim, elite, 2.5, 5)).toBe(true);
    const free = foe(sim, 'boss_vacuum', 100);
    expect(transmuteSpecial(sim, free, 1, -3)).toBe(true);
    expect(free.fishLockUntil).toBe(free.fishUntil);
  });

  it('does not touch the stun or freeze window and does not read it: a stunned fish stands still, an elite\'s stun share is unchanged', () => {
    const sim = arena();
    const e = foe(sim, 'spray', 100);
    const control = foe(sim, 'spray', 100);
    transmuteSpecial(sim, e, 2.5, 5);
    expect(e.ccImmuneUntil).toBe(0);
    applyStatus(sim, e, 'stun', 0, 1, null);
    applyStatus(sim, control, 'stun', 0, 1, null);
    expect(e.stunUntil).toBe(control.stunUntil);
    const from = e.travelled;
    advance(sim, 0.5);
    expect(e.travelled).toBe(from);
  });

  it('keeps taking damage as before: the same hits take the same health and the same allowance, fish or not', () => {
    const play = (fishy: boolean): number[] => {
      const { sim, boss } = specialArena(8);
      if (fishy) transmuteSpecial(sim, boss, 30, 8);
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        damageEnemy(sim, boss, 1500, 'physical', null, false, null);
        out.push(boss.hp, boss.capTokens);
        advance(sim, 0.5);
      }
      return out;
    };
    const a = play(false);
    const b = play(true);
    expect(b).toEqual(a);
    expect(new Set(a).size).toBeGreaterThan(5);
  });

  it('runs the boss\'s abilities on schedule while it is a fish (the vacuum inhales at the same moments)', () => {
    const play = (fishy: boolean): number[] => {
      const { sim, boss } = specialArena(8);
      const times: number[] = [];
      sim.events.on('bossAbility', () => times.push(Math.round(sim.time * 1000) / 1000));
      if (fishy) transmuteSpecial(sim, boss, 30, 8);
      advance(sim, 26);
      return times;
    };
    const control = play(false);
    expect(control.length).toBeGreaterThanOrEqual(2);
    expect(play(true)).toEqual(control);
  });

  it('keeps the spray\'s wet pulse and the black hole\'s pull, and a wave\'s target that dies as a fish is a normal kill', () => {
    const sim = arena();
    const spray = foe(sim, 'spray', 300);
    transmuteSpecial(sim, spray, 2.5, 5);
    // Its own pulse (a wet cell every 6 s) runs on its own clock, fish or not.
    const pulseAt = spray.pulseAt;
    advance(sim, 6.5);
    expect(sim.time).toBeGreaterThan(pulseAt);
    expect(spray.pulseAt).toBeCloseTo(pulseAt + 6, 9);
    // The black hole drags a boss by 20% of the pull, fish or not.
    const boss = foe(sim, 'boss_vacuum', 600);
    transmuteSpecial(sim, boss, 4, 8);
    const zone = { uid: 99, timeLeft: 2 } as SimZone;
    expect(pullEnemy(sim, boss, 100, zone)).toBeCloseTo(20, 9);

    const { sim: wave, boss: target } = specialArena(8);
    transmuteSpecial(wave, target, 30, 8);
    const log = tape(wave, ['enemyDie', 'fishEnd', 'waveEnd']);
    slay(wave, target);
    expect(log.map((l) => l.type)).toEqual(['enemyDie', 'waveEnd']);
    expect('transmuted' in (log[0]!.payload as object)).toBe(false);
    expect(wave.bossesKilled).toBe(1);
    expect(wave.stage).toBe('clearing');
  });
});

// ───────────────────────────── the small flask's path ─────────────────────────────

describe('an ordinary enemy turned into a fish', () => {
  it('is removed without a hit, counts as a kill of the alchemist, pays its fish twice from where it stood, and says it was transmuted', () => {
    const sim = arena();
    const alch = alchemist(sim);
    const e = weakling(sim, 30);
    const log = tape(sim, ['hit', 'enemyDie', 'fish', 'purr']);
    const kills = sim.kills;
    const damage = alch.damageDealt;
    const x = e.x;
    const y = e.y;
    expect(transmuteEnemy(sim, e, alch, 2)).toBe(true);
    expect(e.dead).toBe(true);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.kills).toBe(kills + 1);
    expect(alch.kills).toBe(1);
    expect(alch.damageDealt).toBe(damage);
    expect(log.map((l) => l.type)).toEqual(['fish', 'enemyDie']);
    expect(log[0]!.payload).toMatchObject({ delta: 4, reason: 'kill', x, y });
    expect(log[1]!.payload).toEqual({ enemy: e, x, y, fish: 4, purr: 0, killer: alch, transmuted: true });
    // A second time on the same enemy does nothing.
    expect(transmuteEnemy(sim, e, alch, 2)).toBe(false);
    expect(log).toHaveLength(2);
  });

  it('pays as the kills do: the daily rule that doubles fish, a kill-fish bonus, and the dust\'s one fish', () => {
    const rich = newSim({ mode: 'daily', modifiers: ['rich'] });
    quietWave(rich);
    const a = alchemist(rich);
    const log = tape(rich, ['fish']);
    transmuteEnemy(rich, weakling(rich, 30), a, 2);
    expect(rich.fishMult).toBe(2);
    expect(log[0]!.payload).toMatchObject({ delta: 8 });

    const sim = arena();
    const b = alchemist(sim);
    const log2 = tape(sim, ['fish']);
    sim.fx.killFish = 0.5;
    transmuteEnemy(sim, weakling(sim, 30), b, 2);
    expect(log2[0]!.payload).toMatchObject({ delta: 6 });
    sim.fx.killFish = 0;
    transmuteEnemy(sim, weakling(sim, 30, 300, 'dust'), b, 2);
    expect(log2[1]!.payload).toMatchObject({ delta: 2 });
    transmuteEnemy(sim, weakling(sim, 30, 300, 'tangerine'), b, 2);
    expect(log2[2]!.payload).toMatchObject({ delta: 6 });
  });

  it('is not a death in the passive\'s sense: a balloon does not split, a chef does not harvest, a mage burst is not queued', () => {
    const run = (how: 'kill' | 'fish'): { enemies: number; chef: number; queue: number; fishEvents: string[] } => {
      const sim = arena();
      const alch = alchemist(sim);
      put(sim, 6, 't_chef', 0);
      sim.special[2] = 1;
      const e = weakling(sim, 30, 300, 'balloon');
      applyStatus(sim, e, 'slow', 0.3, 5, null);
      const log = tape(sim, ['fish']);
      if (how === 'kill') damageEnemy(sim, e, 1e6, 'physical', alch, false, null);
      else transmuteEnemy(sim, e, alch, 2);
      return { enemies: sim.enemies.length, chef: sim.chefFish, queue: sim.shatterQueue.length, fishEvents: log.map((l) => (l.payload as { reason: string }).reason) };
    };
    // The control proves the setup is one where a kill does all three.
    const killed = run('kill');
    expect(killed.enemies).toBe(2);
    expect(killed.chef).toBe(1);
    expect(killed.queue).toBeGreaterThan(0);
    expect(killed.fishEvents).toEqual(['kill', 'unit']);
    const turned = run('fish');
    expect(turned).toEqual({ enemies: 0, chef: 0, queue: 0, fishEvents: ['kill'] });
  });

  it('never takes an elite, a boss, or the wave\'s target', () => {
    const sim = arena();
    const alch = alchemist(sim);
    const target = weakling(sim, 5);
    target.target = true;
    expect(transmuteEnemy(sim, target, alch, 2)).toBe(false);
    expect(transmuteEnemy(sim, foe(sim, 'spray', 300), alch, 2)).toBe(false);
    expect(transmuteEnemy(sim, foe(sim, 'boss_vacuum', 300), alch, 2)).toBe(false);
    expect(sim.enemies).toHaveLength(3);
  });

  it('may be done by a sold cat\'s skill or with no cat at all (no killer to credit)', () => {
    const sim = arena();
    const log = tape(sim, ['enemyDie']);
    expect(transmuteEnemy(sim, weakling(sim, 30), null, 2)).toBe(true);
    expect((log[0]!.payload as { killer: unknown }).killer).toBeNull();
  });
});

// ───────────────────────────── the cast ─────────────────────────────

describe('the big flask', () => {
  it('goes to a boss that at least three cats can hit (the alchemist counts), and not to one that only two can', () => {
    const sim = arena();
    const boss = standing(sim, 'boss_vacuum');
    const alch = alchemist(sim);
    expect(reachCount(sim, boss)).toBe(1);
    expect(fish.ready(sim, alch)).toBe(false);
    const paw = put(sim, 2, 'w_paw', 0);
    expect(reachCount(sim, boss)).toBe(2);
    expect(fish.ready(sim, alch)).toBe(false);
    expect(fish.cast(sim, alch)).toBe(false);
    expect(boss.fish).toBe(false);
    const sling = put(sim, 12, 'r_sling', 0);
    expect(reachCount(sim, boss)).toBe(3);
    // Out of range or stopped by a hazard: they do not count.
    const snow = put(sim, 17, 'm_snow', 0);
    expect(reachCount(sim, boss)).toBe(3);
    sling.blocked = true;
    expect(reachCount(sim, boss)).toBe(2);
    expect(fish.ready(sim, alch)).toBe(false);
    sling.blocked = false;
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(boss.fish).toBe(true);
    expect(casts).toHaveLength(1);
    expect(casts[0]!.data.big).toEqual({ uid: boss.uid, x: boss.x, y: boss.y, boss: true, seconds: 4, lock: 8, cats: 3 });
    expect(casts[0]!.data.small).toEqual([]);
    expect([paw.sp, snow.sp]).toEqual([0, 0]);
  });

  it('turns an elite into a 2.5 s fish with a 5 s lock and a boss into a 4 s fish with an 8 s lock', () => {
    for (const [id, boss, seconds, lock] of [['spray', false, 2.5, 5], ['firecracker', false, 2.5, 5], ['boss_cucumber', false, 2.5, 5], ['boss_cloud', true, 4, 8], ['boss_needle', true, 4, 8]] as const) {
      const sim = arena();
      const e = standing(sim, id);
      const { alch } = crew(sim);
      const casts = fishCasts(sim);
      throwFlasks(sim, alch);
      expect(casts[0]!.data.big, id).toMatchObject({ uid: e.uid, boss, seconds, lock });
      expect(e.fishUntil - sim.time, id).toBeCloseTo(seconds, 9);
      expect(e.fishLockUntil - e.fishUntil, id).toBeCloseTo(lock, 9);
    }
  });

  it('chooses by skill order among the ones it may take: the laser\'s dot, then the farthest travelled; a locked or fish one is passed over', () => {
    const sim = arena();
    const near = standing(sim, 'boss_vacuum', 260);
    const far = standing(sim, 'spray', 340);
    const { alch } = crew(sim);
    expect(reachCount(sim, near)).toBeGreaterThanOrEqual(3);
    expect(reachCount(sim, far)).toBeGreaterThanOrEqual(3);
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(casts[0]!.data.big!.uid).toBe(far.uid);
    // The next flask takes the other one (the first is a fish now), then there is nothing.
    alch.sp = 1;
    throwFlasks(sim, alch);
    expect(casts[1]!.data.big!.uid).toBe(near.uid);
    alch.sp = 1;
    expect(fish.ready(sim, alch)).toBe(false);
    // The laser's dot beats the road: a fresh pair, the nearer one inside the dot.
    const lit = arena();
    const a = standing(lit, 'boss_vacuum', 260);
    const b = standing(lit, 'spray', 340);
    const c = crew(lit);
    a.focused = true;
    const litCasts = fishCasts(lit);
    throwFlasks(lit, c.alch);
    expect(litCasts[0]!.data.big!.uid).toBe(a.uid);
    expect(b.fish).toBe(false);
  });

  it('is not thrown at an enemy out of the alchemist\'s reach, and a locked one is not a reason to cast', () => {
    const sim = arena();
    const { alch, paw } = crew(sim);
    // The road's bottom edge is 384 px from the alchemist (range 340 + 36) and out of the paws' reach.
    sim.units[12] = null;
    put(sim, 3, 'w_paw', 0);
    const far = standing(sim, 'boss_vacuum', 1500);
    const dust = weakling(sim, 5, 1500, 'dust');
    const nearDust = weakling(sim, 5);
    expect(reachCount(sim, far)).toBe(0);
    expect(paw.cell).toBe(2);
    expect(fish.ready(sim, alch)).toBe(false);
    // One weak enemy in reach is not enough for the small flasks (two are needed without a big one).
    expect(nearDust.dead).toBe(false);
    expect(dust.dead).toBe(false);
    const boss = standing(sim, 'boss_cloud');
    sim.units[3] = null;
    put(sim, 12, 'r_sling', 0);
    expect(transmuteSpecial(sim, boss, 0.1, 8)).toBe(true);
    advance(sim, 0.3);
    // Locked: three cats can hit it and the gauge still has no flask for it.
    expect(reachCount(sim, boss)).toBe(3);
    expect(fish.ready(sim, alch)).toBe(false);
    expect(far.fish).toBe(false);
  });
});

describe('the small flasks', () => {
  /** Eleven enemies on the top edge of the road (all inside the alchemist's range) with the health in the list, a cucumber of the wave having 100. */
  function field(sim: Sim, hps: number[]): SimEnemy[] {
    return hps.map((hp, i) => weakling(sim, hp, 160 + i * 25));
  }

  it('go to the weakest ones by current health, four with a big flask and five without, and only to those at 60% of a cucumber or less', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const list = field(sim, [100, 61, 60, 59, 10, 50, 30, 20, 40, 70]);
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(casts[0]!.data.big).toBeNull();
    const got = casts[0]!.data.small.map((t) => list.find((e) => e.uid === t.uid)!.maxHp);
    expect(got).toEqual([10, 20, 30, 40, 50]);
    expect(list.filter((e) => e.dead).map((e) => e.maxHp).sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50]);
    expect(sim.enemies.map((e) => e.maxHp).sort((a, b) => a - b)).toEqual([59, 60, 61, 70, 100]);

    // With a big flask in the throw: four.
    const withBig = arena();
    const c2 = crew(withBig);
    standing(withBig, 'boss_vacuum');
    const list2 = field(withBig, [100, 61, 60, 59, 10, 50, 30, 20, 40, 70]);
    const casts2 = fishCasts(withBig);
    throwFlasks(withBig, c2.alch);
    expect(casts2[0]!.data.big).not.toBeNull();
    expect(casts2[0]!.data.small.map((t) => list2.find((e) => e.uid === t.uid)!.maxHp)).toEqual([10, 20, 30, 40]);
  });

  it('take an enemy at exactly 60% (a coin), look at the health left and not the health it had, and read the cucumber of the wave it was born in', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const coin = spawnEnemy(sim, 'coin', 300, 737.5, false);
    coin.frozen = true;
    expect(coin.hp).toBe(0.6 * coin.baseHp);
    const hurt = weakling(sim, 100);
    hurt.hp = 59.9;
    const big = weakling(sim, 100);
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(casts[0]!.data.small.map((t) => t.uid).sort()).toEqual([coin.uid, hurt.uid].sort());
    expect(big.dead).toBe(false);
  });

  it('break a tie by skill order (the farthest travelled first) and keep the order of the flasks in the payload', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const a = weakling(sim, 20, 200);
    const b = weakling(sim, 20, 400);
    const c = weakling(sim, 20, 300);
    const d = weakling(sim, 10, 250);
    const e = weakling(sim, 20, 350);
    const f = weakling(sim, 20, 150);
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(casts[0]!.data.small.map((t) => t.uid)).toEqual([d.uid, b.uid, e.uid, c.uid, a.uid]);
    expect(f.dead).toBe(false);
  });

  it('wait for two when there is no big flask, and go with one or none when there is', () => {
    const sim = arena();
    const { alch } = crew(sim);
    weakling(sim, 20);
    expect(fish.ready(sim, alch)).toBe(false);
    expect(fish.cast(sim, alch)).toBe(false);
    expect(sim.enemies).toHaveLength(1);
    weakling(sim, 30);
    expect(fish.ready(sim, alch)).toBe(true);
    const withBig = arena();
    const c2 = crew(withBig);
    const boss = standing(withBig, 'boss_cloud');
    expect(fish.ready(withBig, c2.alch)).toBe(true);
    const casts = fishCasts(withBig);
    throwFlasks(withBig, c2.alch);
    expect(boss.fish).toBe(true);
    expect(casts[0]!.data.small).toEqual([]);
  });

  it('never take an elite, a boss or the target, and only what is inside the alchemist\'s reach', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const elite = standing(sim, 'spray');
    elite.hp = 1;
    const target = weakling(sim, 5);
    target.target = true;
    const out = weakling(sim, 5, 1500);
    const a = weakling(sim, 20);
    const b = weakling(sim, 30);
    const casts = fishCasts(sim);
    throwFlasks(sim, alch);
    expect(casts[0]!.data.small.map((t) => t.uid).sort()).toEqual([a.uid, b.uid].sort());
    expect([elite.dead, target.dead, out.dead]).toEqual([false, false, false]);
  });

  it('tell where every enemy stood at the cast, and take the fish in the order of the flasks, after the big one\'s status', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const boss = standing(sim, 'boss_vacuum');
    const a = weakling(sim, 20, 200);
    const b = weakling(sim, 30, 250);
    const log = tape(sim, ['spCast', 'status', 'hit', 'fish', 'enemyDie']);
    throwFlasks(sim, alch);
    expect(log.map((l) => l.type)).toEqual(['spCast', 'status', 'fish', 'enemyDie', 'fish', 'enemyDie']);
    const cast = log[0]!.payload as FishCast;
    expect(cast.data.small).toEqual([{ uid: a.uid, x: a.x, y: a.y }, { uid: b.uid, x: b.x, y: b.y }]);
    expect(cast.data.big).toMatchObject({ uid: boss.uid, x: boss.x, y: boss.y });
    expect(log[1]!.payload).toMatchObject({ kind: 'fish', duration: 4, enemy: { uid: boss.uid } });
    expect(log.filter((l) => l.type === 'enemyDie').map((l) => (l.payload as { enemy: { uid: number } }).enemy.uid)).toEqual([a.uid, b.uid]);
    // A cucumber pays 2 fish when it falls; turned into a fish by the flask it pays twice that (the row's `bounty`).
    expect(log.filter((l) => l.type === 'enemyDie').map((l) => (l.payload as { fish: number }).fish)).toEqual([4, 4]);
    expect(log.filter((l) => l.type === 'fish').map((l) => (l.payload as { delta: number; reason: string }).delta)).toEqual([4, 4]);
  });

  it('are in the alchemist\'s reach only when that is what the row says (the knob for the whole field)', () => {
    const sim = arena();
    const { alch } = crew(sim);
    const out = weakling(sim, 5, 1500);
    const near = weakling(sim, 20);
    expect(fish.ready(sim, alch)).toBe(false);
    const before = ROW.inReachOnly;
    ROW.inReachOnly = false;
    restores.push(() => {
      ROW.inReachOnly = before;
    });
    expect(fish.ready(sim, alch)).toBe(true);
    throwFlasks(sim, alch);
    expect([out.dead, near.dead]).toEqual([true, true]);
  });
});

// ───────────────────────────── through the real gauge pass ─────────────────────────────

describe('Turn Into Fish in the battle', () => {
  it('casts the tick the gauge is full, with the event first, and the gauge goes back to 0 and the cast is marked as the first', () => {
    const sim = arena();
    const boss = standing(sim, 'boss_vacuum');
    const { alch } = crew(sim);
    const e = weakling(sim, 20);
    const f = weakling(sim, 30, 330);
    const log = tape(sim, ['spCast', 'status', 'enemyDie']);
    const casts = fishCasts(sim);
    sim.step(TICK);
    expect(casts).toHaveLength(1);
    expect(casts[0]).toMatchObject({ skill: 'fish', first: true, unit: { uid: alch.uid }, x: 360, y: 234 });
    expect(alch.sp).toBe(0);
    expect(boss.fish).toBe(true);
    expect([e.dead, f.dead]).toEqual([true, true]);
    expect(log.map((l) => l.type)).toEqual(['spCast', 'status', 'enemyDie', 'enemyDie']);
  });

  it('waits full when there is nothing to throw at, looks again every 0.2 s, and throws within one look of the moment there is', () => {
    const sim = arena();
    const { alch } = crew(sim);
    weakling(sim, 20);
    const casts = fishCasts(sim);
    advance(sim, 1);
    expect(casts).toHaveLength(0);
    expect(alch.sp).toBe(1);
    expect(alch.spCheckAt).toBeGreaterThan(sim.time - 1e-9);
    expect(alch.spCheckAt).toBeLessThanOrEqual(sim.time + 0.2 + 1e-9);
    weakling(sim, 30, 330);
    advance(sim, 0.25);
    expect(casts).toHaveLength(1);
    expect(casts[0]!.data.small).toHaveLength(2);
  });

  it('with two alchemists full at once, the second finds the big one locked and the weakest gone: no double fish, no double take', () => {
    const sim = arena();
    const boss = standing(sim, 'boss_vacuum');
    const first = alchemist(sim, 7);
    const second = alchemist(sim, 11);
    put(sim, 2, 'w_paw', 0);
    put(sim, 12, 'r_sling', 0);
    const list = [10, 20, 30, 40, 50, 55, 58, 59].map((hp, i) => weakling(sim, hp, 200 + i * 20));
    const log = tape(sim, ['status']);
    const casts = fishCasts(sim);
    sim.step(TICK);
    expect(casts).toHaveLength(2);
    expect(casts[0]!.unit.uid).toBe(first.uid);
    expect(casts[0]!.data.big).not.toBeNull();
    expect(casts[0]!.data.small.map((t) => t.uid)).toEqual(list.slice(0, 4).map((e) => e.uid));
    expect(casts[1]!.data.big).toBeNull();
    expect(casts[1]!.data.small.map((t) => t.uid)).toEqual(list.slice(4, 8).map((e) => e.uid));
    expect(log).toHaveLength(1);
    expect(boss.fish).toBe(true);
    expect(second.sp).toBe(0);
  });

  it('does not throw in a battle played without skills, and the gauge stays 0', () => {
    const sim = arena({ sp: false });
    const alch = put(sim, 7, 't_alch', 0);
    put(sim, 2, 'w_paw', 0);
    put(sim, 12, 'r_sling', 0);
    weakling(sim, 20);
    weakling(sim, 30, 330);
    const casts = fishCasts(sim);
    const deaths = tape(sim, ['enemyDie', 'status']);
    advance(sim, 8);
    expect(sim.spOn).toBe(false);
    expect(alch.sp).toBe(0);
    expect(casts).toHaveLength(0);
    // The cats shoot the two down in those seconds, as they always did: none of it is a fish.
    expect(deaths.filter((d) => d.type === 'enemyDie')).toHaveLength(2);
    expect(deaths.some((d) => 'transmuted' in (d.payload as object) || (d.payload as { kind?: string }).kind === 'fish')).toBe(false);
  });

  it('works in every mode (chapter, daily, endless, gold dungeon with its chest, tutorial)', () => {
    for (const mode of ['chapter', 'daily', 'endless', 'gold', 'tutorial'] as const) {
      const sim = newSim({ mode });
      sim.summonedUnits = 1;
      quietWave(sim);
      expect(sim.phase, mode).toBe('wave');
      const boss = standing(sim, mode === 'gold' ? 'boss_treasure' : 'boss_vacuum');
      const { alch } = crew(sim);
      const e = weakling(sim, 20, 330, mode === 'gold' ? 'coin' : 'cucumber');
      const casts = fishCasts(sim);
      sim.step(TICK);
      expect(casts, mode).toHaveLength(1);
      expect(boss.fish, mode).toBe(true);
      expect(e.dead, mode).toBe(true);
      expect(alch.sp, mode).toBe(0);
    }
  });

  it('keeps the fish and its end in simulation time: a choice popup stops both, 2x and 3x speed make no difference', () => {
    const play = (chunk: number, popup: boolean): string => {
      const sim = arena();
      const boss = foe(sim, 'boss_vacuum', 260);
      const control = foe(sim, 'boss_vacuum', 260);
      const { alch } = crew(sim);
      const log = tape(sim, ['status', 'fishEnd', 'enemyDie']);
      alch.sp = 0.99;
      let paused = false;
      for (let n = 0; n < (12 * 60) / chunk; n++) {
        if (popup && !paused && boss.fish && n * chunk > 2 * 60) {
          paused = true;
          const phase = sim.phase;
          const stamp = JSON.stringify([sim.time, boss.travelled, boss.fishUntil]);
          sim.phase = 'choice';
          sim.step(10);
          expect(JSON.stringify([sim.time, boss.travelled, boss.fishUntil])).toBe(stamp);
          sim.phase = phase;
        }
        sim.step(chunk * TICK);
      }
      return JSON.stringify([log.map((l) => [l.type, l.time.toFixed(4)]), boss.travelled.toFixed(6), control.travelled.toFixed(6)]);
    };
    const base = play(1, false);
    expect(base).toContain('fishEnd');
    expect(play(2, false)).toBe(base);
    expect(play(3, false)).toBe(base);
    expect(play(1, true)).toBe(base);
  });

  it('goes on across the change of a wave: the field is one, and the fish ends when its own time is up', () => {
    const sim = arena();
    const elite = foe(sim, 'spray', 100);
    const control = foe(sim, 'spray', 100);
    const log = tape(sim, ['waveStart', 'fishEnd']);
    transmuteSpecial(sim, elite, 2.5, 5);
    sim.waveClock = sim.waveDuration - 0.5;
    advance(sim, 3);
    expect(sim.wave).toBe(2);
    expect(log.map((l) => l.type)).toEqual(['waveStart', 'fishEnd']);
    expect(log[1]!.time - log[0]!.time).toBeGreaterThan(1.9);
    expect(elite.fish).toBe(false);
    // Two seconds and a half at a quarter of its speed and the rest at its own, across the change.
    expect(walked(control, 100) - walked(elite, 100)).toBeCloseTo(2.5 * 0.75 * 60, 0);
  });

  it('goes on after the alchemist is sold, moved, or leaves: the fish is the enemy\'s own and ends on time', () => {
    const sim = arena();
    const boss = standing(sim, 'boss_vacuum');
    const { alch } = crew(sim);
    throwFlasks(sim, alch);
    const log = tape(sim, ['fishEnd']);
    expect(sim.sell(7)).toBeNull();
    expect(alch.removed).toBe(true);
    expect(sim.later).toHaveLength(0);
    expect(sim.runners).toHaveLength(0);
    advance(sim, 3.8);
    expect(boss.fish).toBe(true);
    advance(sim, 0.4);
    expect(boss.fish).toBe(false);
    expect(log).toHaveLength(1);
  });

  it('is the same with or without a listener and draws no random number', () => {
    const random = vi.spyOn(Math, 'random');
    const play = (listen: boolean): string => {
      const sim = arena();
      standing(sim, 'boss_vacuum');
      const { alch } = crew(sim);
      for (const hp of [20, 30, 40, 50, 55]) weakling(sim, hp, 200 + hp * 3);
      if (listen) {
        sim.events.on('spCast', () => undefined);
        sim.events.on('status', () => undefined);
        sim.events.on('fishEnd', () => undefined);
        sim.events.on('enemyDie', () => undefined);
      }
      advance(sim, 8);
      return JSON.stringify([alch.sp, alch.kills, sim.kills, sim.fish, sim.fishFrac, sim.enemies.map((e) => [e.uid, e.travelled, e.fish]), sim.rng.states()]);
    };
    const a = play(true);
    expect(play(false)).toBe(a);
    // Five enemies were turned into fish by the alchemist and the boss was a fish for its four seconds (it is the one enemy left, a fish no more).
    expect(JSON.parse(a).slice(1, 3)).toEqual([5, 5]);
    expect(random).not.toHaveBeenCalled();
  });

  it('plays a whole bot run twice with the same result when an alchemist and two cats are on the board, and turns enemies into fish in it', () => {
    const init = { ...newSim().init, seed: 4244 };
    const counts: number[][] = [];
    const once = (): string => {
      let casts = 0;
      let small = 0;
      let big = 0;
      const print = fingerprintRun(init, 'synergy', {
        maxSeconds: 400,
        setup(s) {
          put(s, 12, 't_alch');
          put(s, 7, 'w_paw');
          put(s, 11, 'r_sling');
          s.events.on('spCast', (e) => {
            if (e.skill !== 'fish') return;
            casts++;
            small += e.data.small.length;
            if (e.data.big) big++;
          });
        },
      });
      counts.push([casts, small, big]);
      return `${print.hash}/${print.end}/${print.events}`;
    };
    expect(once()).toBe(once());
    expect(counts[0]).toEqual(counts[1]);
    expect(counts[0]![0]).toBeGreaterThan(0);
  });
});

describe('Turn Into Fish and the view\'s tables', () => {
  it('adds one status kind whose colour and gate key the director knows, and puts the flag on every enemy a scene is handed', async () => {
    const { STATUS_COLOR } = await import('@/view/director/palette');
    expect(STATUS_COLOR.fish).toBeTypeOf('number');
    const sim = arena();
    expect(Object.keys(foe(sim, 'cucumber', 0))).toContain('fish');
  });
});
