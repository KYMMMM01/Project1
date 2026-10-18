/**
 * The frost queen's skill, Knock It Off! (docs/design_skills_v2.md 3.8, 4.4, design rule 5, directive decisions 1, 2, 11, 12): the glass breaks
 * where the slowed and frozen enemies are thickest, a shard hurts every chilled enemy near it (3 D slowed, 5 D frozen) and the chill is SPENT.
 * The frame it stands on is tested in `sim.spSkills.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, EnemyId } from '@/game/api';
import { CC_IMMUNE_AFTER, TICK } from '@/game/data/balance';
import { SP_ROWS } from '@/game/data/spSkills';
import { enemySpec } from '@/game/data/enemies';
import { unitDef } from '@/game/data/units';
import { cellCenterX, cellCenterY } from '@/game/geometry';
import { openSummonOffer } from '@/game/sim/board';
import { createBattle } from '@/game/sim/create';
import { applyStatus } from '@/game/sim/enemies';
import { startWave } from '@/game/sim/flow';
import { consumeChill, isChilled, knock } from '@/game/sim/sp/knock';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { inReach } from '@/game/sim/sp/target';
import type { Sim } from '@/game/sim/sim';
import { ST_FREEZE, ST_SLOW, type SimEnemy, type SimUnit } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.knock;

/** A battle in its first wave with the scripted spawns cancelled: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  if (sim.mode === 'tutorial') sim.summonedUnits = 1;
  quietWave(sim);
  return sim;
}

/** A frost queen with a full skill gauge, whose own attack is switched off (its blizzard would slow and hurt the same enemies). */
function queen(sim: Sim, cell = 0): SimUnit {
  const u = put(sim, cell, 'm_frost', 0);
  u.charge = -1e6;
  u.sp = 1;
  return u;
}

/** An enemy standing still (speed 0, so that a slow or a freeze on it is the only thing that is real about it) `travelled` px along the road. */
function stand(sim: Sim, id: EnemyId, travelled: number, hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.speed = 0;
  return e;
}

/** A standing enemy that is slowed (long enough for the whole test). */
function slowed(sim: Sim, travelled: number, id: EnemyId = 'cucumber', hp = 1e9): SimEnemy {
  const e = stand(sim, id, travelled, hp);
  applyStatus(sim, e, 'slow', 0.4, 1000, null);
  expect(e.mask & ST_SLOW).toBe(ST_SLOW);
  return e;
}

/** A standing enemy that is frozen (long enough for the whole test). Bosses never freeze. */
function frozen(sim: Sim, travelled: number, id: EnemyId = 'cucumber', hp = 1e9): SimEnemy {
  const e = stand(sim, id, travelled, hp);
  applyStatus(sim, e, 'freeze', 1, 1000, null);
  expect(e.mask & ST_FREEZE).toBe(ST_FREEZE);
  return e;
}

/** Lets the real gauge pass cast: the gauge is full, the skill's own check is due, one tick. */
function fire(sim: Sim, u: SimUnit): void {
  u.sp = 1;
  u.spCheckAt = 0;
  sim.step(TICK);
}

/** Every event of the listed types, in the order they were emitted, with the simulation time. */
function tape(sim: Sim, types: Array<keyof BattleEvents>): Array<{ type: string; time: number; payload: Record<string, unknown> }> {
  const out: Array<{ type: string; time: number; payload: Record<string, unknown> }> = [];
  for (const type of types) {
    sim.events.on(type, (payload) => out.push({ type, time: sim.time, payload: payload as unknown as Record<string, unknown> }));
  }
  return out;
}

/** The damage of each `hit` by enemy uid. */
function hitsOf(sim: Sim): Map<number, number[]> {
  const hits = new Map<number, number[]>();
  sim.events.on('hit', (h) => {
    const list = hits.get(h.enemy.uid) ?? [];
    list.push(h.amount);
    hits.set(h.enemy.uid, list);
  });
  return hits;
}

const afterEachs: Array<() => void> = [];
afterEach(() => {
  while (afterEachs.length > 0) (afterEachs.pop() as () => void)();
  vi.restoreAllMocks();
});

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Knock It Off, the data', () => {
  it('has the design appendix\'s cells and is built: the frost queen carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'knock', unit: 'm_frost', rank: 4, cooldown: 20, radius: 260, knot: 130, slowed: 3.0, frozen: 5.0, minChilled: 2, built: true,
    });
    expect(unitDef('m_frost').spSkill).toEqual({ id: 'knock', rank: 4, cooldown: 20, nameKey: 'sp.knock.name' });
    expect(SP_HANDLERS.knock).toBe(knock);
  });

  it('fills the frost queen\'s gauge in its own cooldown (20 s, the owner\'s value), from the 50% a cat starts at in half of it', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_frost');
    expect(u.sp).toBe(0.5);
    u.charge = -1e6;
    advance(sim, ROW.cooldown / 2 - 0.2);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── ready ─────────────────────────────

describe('when the glass falls', () => {
  it('waits for two chilled enemies inside the queen\'s own range: none, one, or only unchilled ones are no reason', () => {
    const sim = arena();
    const u = queen(sim);
    expect(knock.ready(sim, u)).toBe(false);
    stand(sim, 'cucumber', 150);
    stand(sim, 'cucumber', 200);
    expect(knock.ready(sim, u)).toBe(false);
    const a = slowed(sim, 250);
    expect(knock.ready(sim, u)).toBe(false);
    const b = frozen(sim, 300);
    expect(knock.ready(sim, u)).toBe(true);
    expect(isChilled(a) && isChilled(b)).toBe(true);
  });

  it('counts slowed with slowed, frozen with frozen, and one of each', () => {
    for (const kinds of [['slow', 'slow'], ['freeze', 'freeze'], ['slow', 'freeze']] as const) {
      const sim = arena();
      const u = queen(sim);
      kinds.forEach((k, i) => (k === 'slow' ? slowed(sim, 200 + i * 40) : frozen(sim, 200 + i * 40)));
      expect(knock.ready(sim, u), kinds.join()).toBe(true);
    }
  });

  it('does not count a stunned enemy, a dead one, or a chilled one out of the queen\'s range', () => {
    const sim = arena();
    const u = queen(sim);
    const one = slowed(sim, 200);
    const stunned = stand(sim, 'cucumber', 240);
    applyStatus(sim, stunned, 'stun', 1, 1000, null);
    expect(stunned.stunned).toBe(true);
    const out = slowed(sim, 900);
    expect(inReach(u, out)).toBe(false);
    expect(knock.ready(sim, u)).toBe(false);
    const dead = slowed(sim, 260);
    dead.hp = 0;
    expect(knock.ready(sim, u)).toBe(true);
    sim.enemies.splice(sim.enemies.indexOf(dead), 1);
    dead.dead = true;
    sim.enemies.forEach((e, i) => (e.index = i));
    expect(knock.ready(sim, u)).toBe(false);
    expect(one.dead).toBe(false);
  });

  it('counts an elite or a boss that is slowed: its slow cap does not make it unchilled', () => {
    const sim = arena();
    const u = queen(sim);
    const elite = slowed(sim, 200, 'spray');
    expect(elite.slow).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(elite.slow).toBeGreaterThan(0);
    slowed(sim, 240);
    expect(knock.ready(sim, u)).toBe(true);
  });

  it('casts in the tick the gauge is full and the chill is there, takes the gauge to 0, and has no gap rule (rank 4)', () => {
    const sim = arena();
    const u = queen(sim);
    slowed(sim, 200);
    slowed(sim, 240);
    const log = tape(sim, ['spCast']);
    sim.step(TICK);
    expect(log).toHaveLength(1);
    expect(u.sp).toBe(0);
    expect(log[0]!.payload).toMatchObject({ skill: 'knock', first: true, x: cellCenterX(0), y: cellCenterY(0) });
  });

  it('waits full, looks again only every 0.2 s, and casts within 0.2 s of the chill appearing', () => {
    const sim = arena();
    const u = queen(sim);
    const ready = vi.spyOn(knock, 'ready');
    advance(sim, 1);
    // One look in the tick it filled and one every 0.2 s after: about six in a second, not sixty.
    expect(ready.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(ready.mock.calls.length).toBeLessThanOrEqual(7);
    expect(u.sp).toBe(1);
    slowed(sim, 200);
    slowed(sim, 240);
    const log = tape(sim, ['spCast']);
    advance(sim, 0.25);
    expect(log).toHaveLength(1);
    // Back at 0 at the cast: it cannot have refilled by more than the time that has passed.
    expect(u.sp).toBeLessThan(0.25 / ROW.cooldown + 1e-9);
  });
});

// ───────────────────────────── the impact ─────────────────────────────

describe('where the glass lands', () => {
  function landing(sim: Sim, u: SimUnit): { impactX: number; impactY: number; shards: Array<{ uid: number; x: number; y: number; frozen: boolean }> } {
    const log = tape(sim, ['spCast']);
    expect(knock.cast(sim, u)).toBe(true);
    return log[0]!.payload.data as never;
  }

  it('lands on the chilled enemy with the most chilled enemies of its own kind within 130 px of it', () => {
    const sim = arena();
    const u = queen(sim);
    // A pack of three at the front and a pair behind.
    const pack = [slowed(sim, 330), slowed(sim, 310), slowed(sim, 290)];
    slowed(sim, 130);
    slowed(sim, 110);
    const data = landing(sim, u);
    // All three of the pack have a knot of 3: the one first in skill order (the farthest along) is it.
    expect(data.impactX).toBe(pack[0]!.x);
    expect(data.impactY).toBe(pack[0]!.y);
  });

  it('counts only its own kind: frozen with frozen, slowed with slowed', () => {
    const sim = arena();
    const u = queen(sim);
    // Five within 130 px of each other. Mixed up they would all count five and the foremost, a frozen one, would win; by kind the three
    // slowed ones beat the two frozen ones.
    const f1 = frozen(sim, 300);
    frozen(sim, 280);
    const s1 = slowed(sim, 250);
    slowed(sim, 240);
    slowed(sim, 230);
    const data = landing(sim, u);
    expect(data.impactX).toBe(s1.x);
    expect(data.impactX).not.toBe(f1.x);
  });

  it('measures the knot by the distance between centres: 130 px counts, 131 does not (and then the foremost wins the tie)', () => {
    const near = arena();
    const uNear = queen(near);
    slowed(near, 380);
    const a = slowed(near, 250);
    const b = slowed(near, 120);
    expect(landing(near, uNear).impactX).toBe(a.x);
    // 250 and 120 are 130 apart: each knot is 2, the rest is the order of the skill: the foremost of the pair, not the 380 one (a knot of 1).
    expect(b.x).toBeLessThan(a.x);

    const wide = arena();
    const uWide = queen(wide);
    const front = slowed(wide, 380);
    slowed(wide, 250);
    slowed(wide, 119);
    // 250 and 119 are 131 apart: every knot is 1 and the foremost wins.
    expect(landing(wide, uWide).impactX).toBe(front.x);
  });

  it('goes to the enemy under the laser\'s dot first, then the biggest knot among those', () => {
    const sim = arena();
    const u = queen(sim);
    slowed(sim, 330);
    slowed(sim, 320);
    slowed(sim, 310);
    const lone = slowed(sim, 120);
    slowed(sim, 110);
    const data1 = landing(sim, u);
    expect(data1.impactX).not.toBe(lone.x);
    const sim2 = arena();
    const u2 = queen(sim2);
    slowed(sim2, 330);
    slowed(sim2, 320);
    slowed(sim2, 310);
    const dot = slowed(sim2, 120);
    slowed(sim2, 110);
    dot.focused = true;
    expect(landing(sim2, u2).impactX).toBe(dot.x);
  });

  it('breaks a tie of knots by skill order: an elite or boss, then the one farthest along, then the lower uid', () => {
    const sim = arena();
    const u = queen(sim);
    const a = slowed(sim, 300);
    slowed(sim, 270);
    const b = slowed(sim, 130);
    slowed(sim, 100);
    // Two pairs, 140 px between them: equal knots; the pair with the foremost enemy wins, and within it the foremost.
    expect(landing(sim, u).impactX).toBe(a.x);
    expect(a.travelled).toBeGreaterThan(b.travelled);
  });

  it('is only ever an enemy inside the queen\'s range, and its knot is counted among the chilled enemies inside it too', () => {
    const sim = arena();
    const u = queen(sim);
    // At the front: one enemy in reach with three chilled neighbours that are out of reach. Further back: a pair, both in reach.
    const front = slowed(sim, 400);
    const outside = [slowed(sim, 470), slowed(sim, 490), slowed(sim, 510)];
    const pair = [slowed(sim, 90), slowed(sim, 80)];
    expect(inReach(u, front)).toBe(true);
    expect(outside.every((e) => !inReach(u, e))).toBe(true);
    expect(pair.every((e) => inReach(u, e))).toBe(true);
    const data = landing(sim, u);
    // Counting the enemies out of reach too, the one at the front would have the biggest knot (4). Counted among those in reach it has 1, the pair 2.
    expect(data.impactX).toBe(pair[0]!.x);
    // And no enemy out of reach is ever the glass's target, whatever its knot: with the pair gone the front one is.
    const sim2 = arena();
    const u2 = queen(sim2);
    const front2 = slowed(sim2, 400);
    slowed(sim2, 395);
    [slowed(sim2, 470), slowed(sim2, 490), slowed(sim2, 510), slowed(sim2, 480)].forEach((e) => expect(inReach(u2, e)).toBe(false));
    expect(landing(sim2, u2).impactX).toBe(front2.x);
  });
});

// ───────────────────────────── the shards and the damage ─────────────────────────────

describe('the shards', () => {
  it('hit every chilled enemy whose body touches the 260 px circle round the impact, in skill order, and nothing else', () => {
    const sim = arena();
    const u = queen(sim);
    const hits = hitsOf(sim);
    // The impact: the biggest knot of slowed enemies (three), at the front of the queen's range.
    const impact = slowed(sim, 400);
    const mates = [slowed(sim, 395), slowed(sim, 390)];
    // Cucumbers are 18 px wide: a body 278 px from the impact touches the circle, one 280 px away does not. The two are frozen, a pair of
    // the other kind: a knot of 2 against the impact's 3.
    const edge = frozen(sim, 400 - 278);
    const beyond = frozen(sim, 400 - 280);
    // Inside the circle but not chilled: a plain one and a stunned one.
    const plain = stand(sim, 'cucumber', 330);
    const stunned = stand(sim, 'cucumber', 320);
    applyStatus(sim, stunned, 'stun', 1, 1000, null);
    // Inside the circle, chilled, and out of the queen's range.
    const ice = frozen(sim, 350);
    const outOfReach = slowed(sim, 470);
    expect(inReach(u, outOfReach)).toBe(false);
    expect(inReach(u, beyond)).toBe(true);
    const log = tape(sim, ['spCast']);
    expect(knock.cast(sim, u)).toBe(true);
    const data = log[0]!.payload.data as { impactX: number; shards: Array<{ uid: number; frozen: boolean }> };
    expect(data.impactX).toBe(impact.x);
    expect(data.shards.map((s) => s.uid)).toEqual([outOfReach, impact, ...mates, ice, edge].sort((a, b) => b.travelled - a.travelled).map((e) => e.uid));
    expect(hits.get(beyond.uid)).toBeUndefined();
    expect(hits.get(plain.uid)).toBeUndefined();
    expect(hits.get(stunned.uid)).toBeUndefined();
    expect(data.shards.filter((s) => s.frozen).map((s) => s.uid)).toEqual([ice.uid, edge.uid]);
    expect(beyond.frozen).toBe(true);
  });

  it('hurt a slowed enemy 3 D and a frozen one 5 D (a frozen one that is also slowed counts as frozen), with no crit and D of the cast', () => {
    const sim = arena();
    const u = queen(sim);
    const d = u.stats.damage;
    const a = slowed(sim, 330);
    const b = frozen(sim, 300);
    const both = frozen(sim, 270);
    applyStatus(sim, both, 'slow', 0.3, 1000, null);
    const crits: boolean[] = [];
    sim.events.on('hit', (h) => crits.push(h.crit));
    const hits = hitsOf(sim);
    knock.cast(sim, u);
    expect(hits.get(a.uid)![0]).toBeCloseTo(3.0 * d, 9);
    expect(hits.get(b.uid)![0]).toBeCloseTo(5.0 * d, 9);
    expect(hits.get(both.uid)![0]).toBeCloseTo(5.0 * d, 9);
    expect(crits.every((c) => !c)).toBe(true);
    expect(hits.get(a.uid)).toHaveLength(1);
  });

  it('goes through ward like any magic damage: a warded slowed enemy takes 35% less', () => {
    const sim = arena();
    const u = queen(sim);
    const warded = slowed(sim, 300, 'tangerine');
    slowed(sim, 270);
    const hits = hitsOf(sim);
    knock.cast(sim, u);
    expect(hits.get(warded.uid)![0]).toBeCloseTo(3.0 * u.stats.damage * (1 - 0.35), 9);
  });

  it('pays the electric blanket\'s bonus for slowed enemies (the chill is still on when the damage lands) and not for frozen ones', () => {
    const sim = arena();
    sim.fx.slowedDamage = 0.15;
    const u = queen(sim);
    const d = u.stats.damage;
    const s = slowed(sim, 330);
    const f = frozen(sim, 300);
    const hits = hitsOf(sim);
    knock.cast(sim, u);
    expect(hits.get(s.uid)![0]).toBeCloseTo(3.0 * d * 1.15, 9);
    expect(hits.get(f.uid)![0]).toBeCloseTo(5.0 * d, 9);
  });

  it('takes the 5 D to a frozen elite, with its ward, and only the slow (3 D) of a boss, which never freezes', () => {
    const sim = arena();
    const u = queen(sim);
    const elite = frozen(sim, 300, 'spray', 1e9);
    expect(elite.frozen).toBe(true);
    const boss = stand(sim, 'boss_vacuum', 260, 1e9);
    applyStatus(sim, boss, 'freeze', 1, 1000, null);
    expect(boss.frozen).toBe(false);
    applyStatus(sim, boss, 'slow', 0.4, 1000, null);
    expect(boss.slow).toBeGreaterThan(0);
    const hits = hitsOf(sim);
    const log = tape(sim, ['spCast']);
    knock.cast(sim, u);
    const shards = (log[0]!.payload.data as { shards: Array<{ uid: number; frozen: boolean }> }).shards;
    expect(shards.find((s) => s.uid === elite.uid)!.frozen).toBe(true);
    expect(shards.find((s) => s.uid === boss.uid)!.frozen).toBe(false);
    expect(hits.get(elite.uid)![0]).toBeCloseTo(5.0 * u.stats.damage * (1 - enemySpec('spray').ward), 9);
    expect(hits.get(boss.uid)![0]).toBeCloseTo(3.0 * u.stats.damage * (1 - enemySpec('boss_vacuum').ward), 9);
    expect(boss.slow).toBe(0);
    expect(elite.frozen).toBe(false);
  });

  it('is cut by the damage allowance of the wave\'s elite and boss like any damage, and they still lose their chill', () => {
    for (const wave of [4, 8]) {
      const sim = arena();
      startWave(sim, wave);
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      advance(sim, 1.05);
      const target = sim.boss as SimEnemy;
      expect(target.target).toBe(true);
      target.speed = 0;
      target.travelled = 300;
      target.capTokens = 0.5;
      target.capRate = 0;
      applyStatus(sim, target, 'slow', 0.5, 1000, null);
      expect(target.slow).toBeGreaterThan(0);
      expect(target.slow).toBeLessThanOrEqual(0.25 + 1e-9);
      const u = queen(sim);
      slowed(sim, 260);
      const hits = hitsOf(sim);
      knock.cast(sim, u);
      expect(hits.get(target.uid), 'wave ' + wave).toHaveLength(1);
      expect(hits.get(target.uid)![0], 'wave ' + wave).toBeCloseTo(0.5, 9);
      expect(target.slow).toBe(0);
    }
  });
});

// ───────────────────────────── the chill is spent ─────────────────────────────

describe('the chill is spent', () => {
  it('takes the slow and the freeze off the survivors in the cast\'s own tick, and puts a freezing\'s four seconds of immunity on the frozen ones only', () => {
    const sim = arena();
    const u = queen(sim);
    const s = slowed(sim, 330);
    const f = frozen(sim, 300);
    const both = frozen(sim, 270);
    applyStatus(sim, both, 'slow', 0.3, 1000, null);
    knock.cast(sim, u);
    for (const e of [s, f, both]) {
      expect(e.slow, `slow ${e.uid}`).toBe(0);
      expect(e.frozen, `frozen ${e.uid}`).toBe(false);
      expect(e.mask & (ST_SLOW | ST_FREEZE)).toBe(0);
      expect(isChilled(e)).toBe(false);
    }
    expect(s.ccImmuneUntil).toBe(0);
    expect(f.ccImmuneUntil).toBeCloseTo(sim.time + CC_IMMUNE_AFTER, 9);
    expect(both.ccImmuneUntil).toBeCloseTo(sim.time + CC_IMMUNE_AFTER, 9);
    // The thaw is the normal one: no freezing for four seconds, a slow at once.
    applyStatus(sim, f, 'freeze', 1, 5, null);
    expect(f.frozen).toBe(false);
    applyStatus(sim, f, 'slow', 0.3, 5, null);
    expect(f.slow).toBeGreaterThan(0);
    // A slowed one may be frozen at once.
    applyStatus(sim, s, 'freeze', 1, 5, null);
    expect(s.frozen).toBe(true);
    advance(sim, CC_IMMUNE_AFTER + 0.1);
    const f2 = f;
    applyStatus(sim, f2, 'freeze', 1, 5, null);
    expect(f2.frozen).toBe(true);
  });

  it('leaves a clean enemy: a status applied after it behaves as on any fresh enemy, and an expired stamp does not matter', () => {
    const sim = arena();
    const e = slowed(sim, 300);
    consumeChill(sim, e);
    expect(e.slowUntil).toBe(0);
    applyStatus(sim, e, 'slow', 0.2, 3, null);
    expect(e.slow).toBeCloseTo(0.2, 9);
    advance(sim, 3.1);
    expect(e.slow).toBe(0);
    expect(e.mask & ST_SLOW).toBe(0);
  });

  it('deals the damage first: an enemy a shard fells leaves with its chill on (the mages\' burst looks at it) and a survivor with none', () => {
    const sim = arena();
    const u = queen(sim);
    // The mages' third step (set after the board is built: the board works it out from the cats on it).
    sim.special[2] = 1;
    const d = u.stats.damage;
    const dying = slowed(sim, 300, 'cucumber', 1);
    const survivor = slowed(sim, 270, 'cucumber', 100 * d);
    const seen: Array<{ slow: number; frozen: boolean; mask: number }> = [];
    sim.events.on('enemyDie', (e) => {
      const s = e.enemy as unknown as SimEnemy;
      seen.push({ slow: s.slow, frozen: s.frozen, mask: s.mask });
    });
    const specials = tape(sim, ['special']);
    knock.cast(sim, u);
    expect(dying.dead).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.slow).toBeGreaterThan(0);
    expect(seen[0]!.mask & ST_SLOW).toBe(ST_SLOW);
    expect(survivor.slow).toBe(0);
    // The burst of the mages\' third step goes off at the end of the tick.
    sim.step(TICK);
    expect(specials.filter((x) => x.payload.kind === 'shatter')).toHaveLength(1);
  });

  it('applies nothing new: no slow, freeze or stun comes out of the cast, and no status event', () => {
    const sim = arena();
    const u = queen(sim);
    const a = slowed(sim, 330);
    const b = frozen(sim, 300);
    const plain = stand(sim, 'cucumber', 280);
    const statuses: string[] = [];
    sim.events.on('status', (st) => statuses.push(st.kind));
    knock.cast(sim, u);
    advance(sim, 1);
    expect(statuses).toEqual([]);
    for (const e of [a, b, plain]) {
      expect(e.slow).toBe(0);
      expect(e.frozen).toBe(false);
      expect(e.stunned).toBe(false);
    }
  });

  it('takes a second queen\'s cast away in the same tick when the first took all the chill, and leaves her gauge full', () => {
    const sim = arena();
    const a = queen(sim, 0);
    const b = queen(sim, 1);
    slowed(sim, 330);
    slowed(sim, 300);
    frozen(sim, 270);
    const log = tape(sim, ['spCast']);
    sim.step(TICK);
    expect(log).toHaveLength(1);
    expect(a.sp).toBe(0);
    expect(b.sp).toBe(1);
    // New chill appears: the second queen casts within 0.2 s.
    slowed(sim, 200);
    slowed(sim, 210);
    advance(sim, 0.25);
    expect(log).toHaveLength(2);
    expect(b.sp).toBeLessThan(1);
  });

  it('lets two queens break two glasses in the same tick when their enemies are apart', () => {
    const sim = arena();
    const a = queen(sim, 0);
    const b = queen(sim, 4);
    const left = [slowed(sim, 100), slowed(sim, 120)];
    const right = [slowed(sim, 470), slowed(sim, 490)];
    expect(left.every((e) => inReach(a, e) && !inReach(b, e))).toBe(true);
    expect(right.every((e) => inReach(b, e) && !inReach(a, e))).toBe(true);
    const log = tape(sim, ['spCast']);
    sim.step(TICK);
    expect(log).toHaveLength(2);
    expect(a.sp).toBe(0);
    expect(b.sp).toBe(0);
    expect(left.concat(right).every((e) => e.slow === 0)).toBe(true);
  });
});

// ───────────────────────────── the announcement ─────────────────────────────

describe('what the view is told', () => {
  it('announces the cast before any damage, with the impact, the radius and the shards as they stood', () => {
    const sim = arena();
    const u = queen(sim, 6);
    const a = slowed(sim, 330);
    const b = frozen(sim, 300);
    const log = tape(sim, ['spCast', 'hit']);
    const stood = [a, b].map((e) => ({ uid: e.uid, x: e.x, y: e.y }));
    fire(sim, u);
    expect(log.map((x) => x.type)).toEqual(['spCast', 'hit', 'hit']);
    const cast = log[0]!.payload as unknown as BattleEvents['spCast'] & { skill: 'knock' };
    expect(cast).toMatchObject({ skill: 'knock', first: true, x: cellCenterX(6), y: cellCenterY(6) });
    expect(cast.data.radius).toBe(260);
    expect(cast.data.impactX).toBe(a.x);
    expect(cast.data.impactY).toBe(a.y);
    expect(cast.data.shards).toEqual([
      { uid: a.uid, x: stood[0]!.x, y: stood[0]!.y, frozen: false },
      { uid: b.uid, x: stood[1]!.x, y: stood[1]!.y, frozen: true },
    ]);
    // The hits follow in the shards' order.
    expect(log.slice(1).map((x) => (x.payload as unknown as BattleEvents['hit']).enemy.uid)).toEqual([a.uid, b.uid]);
  });

  it('delivers the cast while the shard enemies are still on the field and still chilled (the view draws their ice from that state; the damage and the spending follow)', () => {
    const sim = arena();
    const u = queen(sim, 6);
    const a = slowed(sim, 330);
    const b = frozen(sim, 300);
    const during: Array<{ listed: boolean; chilled: boolean }> = [];
    sim.events.on('spCast', (e) => {
      if (e.skill !== 'knock') return;
      for (const x of [a, b]) during.push({ listed: sim.enemies.includes(x), chilled: isChilled(x) });
    });
    fire(sim, u);
    expect(during).toEqual([{ listed: true, chilled: true }, { listed: true, chilled: true }]);
    // ...and by the end of the tick the chill is spent.
    expect(isChilled(a)).toBe(false);
    expect(isChilled(b)).toBe(false);
  });

  it('marks only the first cast of the skill in the run', () => {
    const sim = arena();
    const u = queen(sim);
    const log = tape(sim, ['spCast']);
    slowed(sim, 330);
    slowed(sim, 300);
    fire(sim, u);
    slowed(sim, 330);
    slowed(sim, 300);
    advance(sim, 0.1);
    fire(sim, u);
    expect(log.map((x) => x.payload.first)).toEqual([true, false]);
  });
});

// ───────────────────────────── the battle goes on ─────────────────────────────

describe('what happens around the cast', () => {
  it('works with the queen\'s own blizzard: the chill her zone makes is spent, and the next tick of the zone makes it again', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_frost', 1);
    u.sp = 0.99;
    const enemies = [stand(sim, 'cucumber', 150), stand(sim, 'cucumber', 175), stand(sim, 'cucumber', 200)];
    const log = tape(sim, ['spCast']);
    for (let i = 0; i < 20 * 60 && log.length === 0; i++) sim.step(TICK);
    expect(log).toHaveLength(1);
    const data = log[0]!.payload.data as { shards: unknown[] };
    expect(data.shards.length).toBeGreaterThanOrEqual(2);
    expect(enemies.some((e) => e.slow === 0)).toBe(true);
    // The zone is still there: it slows them again at its next tick (0.5 s apart).
    advance(sim, 0.6);
    expect(enemies.some((e) => e.slow > 0)).toBe(true);
  });

  it('is cast by a queen that was moved, with the gauge it carried; a queen sold the tick after the cast changes nothing that happened', () => {
    const sim = arena();
    const u = queen(sim, 6);
    u.sp = 0.5;
    slowed(sim, 330);
    slowed(sim, 300);
    expect(sim.drop(6, 7)).toBeNull();
    expect(u.cell).toBe(7);
    expect(u.sp).toBe(0.5);
    const log = tape(sim, ['spCast']);
    advance(sim, ROW.cooldown / 2 + 0.1);
    expect(log).toHaveLength(1);
    expect(u.sp).toBeLessThan(0.01);
    expect(sim.enemies.every((e) => e.slow === 0)).toBe(true);
    expect(sim.sell(7)).toBeNull();
    expect(sim.enemies.every((e) => e.slow === 0)).toBe(true);
  });

  it('keeps the gauge\'s ratio when the queen is molted into another cat with a skill', () => {
    const sim = arena();
    sim.fish = 1e6;
    sim.purr = 100;
    const u = put(sim, 6, 'm_frost', 0);
    u.charge = -1e6;
    u.sp = 0.75;
    expect(sim.molt(6, 'ranger')).toBeNull();
    const result = sim.units[6]!;
    expect(result.id).not.toBe('m_frost');
    expect(result.spec.spSkill).toBeDefined();
    expect(result.sp).toBe(0.75);
  });

  it('does not fill its gauge during a choice popup and goes on after it', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_frost');
    u.charge = -1e6;
    u.sp = 0.5;
    advance(sim, 3);
    const before = u.sp;
    openSummonOffer(sim, false);
    expect(sim.phase).toBe('choice');
    sim.step(30);
    expect(u.sp).toBe(before);
    expect(sim.pickSummon(0)).toBeNull();
    advance(sim, 1);
    expect(u.sp).toBeGreaterThan(before);
  });

  it('gives the same result at 1x, 2x and 3x speed: only simulation time counts', () => {
    const play = (chunk: number): string => {
      const sim = arena();
      const u = queen(sim);
      [330, 310, 290, 150, 130].forEach((p, i) => (i % 2 === 0 ? slowed(sim, p) : frozen(sim, p)));
      const log = tape(sim, ['spCast', 'hit']);
      u.sp = 1;
      u.spCheckAt = 0;
      const ticks = Math.round(2 / TICK);
      for (let i = 0; i < ticks; i += chunk) sim.step(TICK * chunk);
      return JSON.stringify(log.map((x) => [x.type, Math.round(x.time * 1000), JSON.stringify(x.payload, (_k, v) => (typeof v === 'object' && v !== null && 'uid' in v ? `${v.uid}:${v.id}` : v))]));
    };
    const one = play(1);
    expect(JSON.parse(one).length).toBeGreaterThan(3);
    expect(play(2)).toBe(one);
    expect(play(3)).toBe(one);
  });

  it('goes on through a wave change: the chill and the gauge belong to the field', () => {
    const sim = arena();
    const u = queen(sim);
    u.sp = 0.9;
    const a = slowed(sim, 330);
    const b = slowed(sim, 300);
    startWave(sim, 2);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    advance(sim, 3);
    expect(u.sp).toBeLessThan(0.1);
    expect(a.slow + b.slow).toBe(0);
  });
});

// ───────────────────────────── modes ─────────────────────────────

describe('in every mode', () => {
  const MODES: Array<[string, Partial<ReturnType<typeof initOf>>]> = [
    ['chapter', {}],
    ['chapter at butler level 5', { stake: 5 }],
    ['daily', { mode: 'daily' }],
    ['daily with rules', { mode: 'daily', modifiers: ['swarm', 'long_laser', 'rush'] }],
    ['endless', { mode: 'endless' }],
    ['gold dungeon', { mode: 'gold' }],
    ['tutorial', { mode: 'tutorial' }],
  ];
  for (const [name, over] of MODES) {
    it(`breaks the glass and spends the chill in the ${name}`, () => {
      const sim = arena(over);
      const u = queen(sim);
      const a = slowed(sim, 330);
      const b = frozen(sim, 300);
      const log = tape(sim, ['spCast', 'hit']);
      fire(sim, u);
      expect(log.map((x) => x.type)).toEqual(['spCast', 'hit', 'hit']);
      expect(a.slow + (b.frozen ? 1 : 0)).toBe(0);
    });
  }
});

// ───────────────────────────── determinism, sp off, whole runs ─────────────────────────────

describe('determinism and the switch', () => {
  it('draws no random numbers and touches no random stream, and gives the same result whether or not anybody listens', () => {
    const spy = vi.spyOn(Math, 'random');
    let before = '';
    let after = '';
    const play = (listen: boolean): string => {
      const sim = arena();
      const u = queen(sim);
      const set = [slowed(sim, 330, 'cucumber', 1e4), frozen(sim, 310, 'balloon', 1e4), slowed(sim, 290), frozen(sim, 150)];
      if (listen) tape(sim, ['spCast', 'hit', 'enemyDie']);
      before = JSON.stringify(sim.rng.states());
      u.sp = 1;
      u.spCheckAt = 0;
      expect(knock.cast(sim, u)).toBe(true);
      after = JSON.stringify(sim.rng.states());
      advance(sim, 1);
      return JSON.stringify([set.map((e) => [e.hp, e.slow, e.frozen, e.dead]), sim.kills]);
    };
    const quiet = play(false);
    expect(after).toBe(before);
    expect(play(true)).toBe(quiet);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing in a battle played without skills: the gauge stays 0 and the chill stays', () => {
    const sim = arena({ sp: false });
    const u = put(sim, 0, 'm_frost', 0);
    expect(u.sp).toBe(0);
    u.charge = -1e6;
    const a = slowed(sim, 330);
    slowed(sim, 300);
    const log = tape(sim, ['spCast']);
    advance(sim, 30);
    expect(u.sp).toBe(0);
    expect(log).toHaveLength(0);
    expect(a.slow).toBeGreaterThan(0);
  });

  it('is not saved: nothing about it is in a wave-start save, and a restored battle plays on', () => {
    const sim = arena();
    const u = queen(sim);
    slowed(sim, 330);
    slowed(sim, 300);
    fire(sim, u);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    expect(JSON.stringify(snap)).not.toContain('knock');
    const restored = createBattle(sim.init, snap!) as Sim;
    advance(restored, 1);
    expect(restored.phase === 'wave' || restored.phase === 'prep').toBe(true);
  });

  it('breaks glass in a real bot run with two frost queens on the board, and the run is the same twice', () => {
    let casts = 0;
    let shards = 0;
    const play = (seed: number): { hash: string; end: string; casts: number; shards: number } => {
      let c = 0;
      let sh = 0;
      const p = fingerprintRun(initOf({ seed }, 3), 'synergy', {
        setup: (s) => {
          put(s, 0, 'm_frost');
          put(s, 4, 'm_frost');
          put(s, 12, 'm_snow');
          s.events.on('spCast', (e) => {
            if (e.skill === 'knock') {
              c++;
              sh += e.data.shards.length;
            }
          });
        },
      });
      return { hash: p.hash, end: p.end, casts: c, shards: sh };
    };
    for (const seed of [51, 52, 53]) {
      const one = play(seed);
      const two = play(seed);
      expect(two).toEqual(one);
      casts += one.casts;
      shards += one.shards;
    }
    expect(casts).toBeGreaterThan(0);
    expect(shards).toBeGreaterThanOrEqual(casts * ROW.minChilled);
  });
});
