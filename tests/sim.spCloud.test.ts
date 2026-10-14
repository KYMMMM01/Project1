/**
 * The storm cat's skill, Tagalong Cloud (docs/design_skills_v2.md 3.7, 4.4, 4.5, directive decisions 1, 2, 11, 12): a grumpy cloud sticks to the
 * lead enemy in the cat's reach, follows it wherever it walks, drops a bolt on it every 0.4 s for 3.2 s (0.3 D on the host, 0.15 D on the
 * others within 60 px, no shock) and hops to a near enemy when the host falls. The frame it stands on is tested in `sim.spSkills.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, EnemyId } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { SP_ROWS } from '@/game/data/spSkills';
import { unitDef } from '@/game/data/units';
import { cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import { openSummonOffer } from '@/game/sim/board';
import { createBattle } from '@/game/sim/create';
import { damageEnemy, removeEnemy } from '@/game/sim/enemies';
import { lose, startWave } from '@/game/sim/flow';
import { cloud } from '@/game/sim/sp/cloud';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { inReach } from '@/game/sim/sp/target';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave, slay } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.cloud;

/** A battle in its first wave with the scripted spawns cancelled: a test controls the field. */
function arena(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  if (sim.mode === 'tutorial') sim.summonedUnits = 1;
  quietWave(sim);
  return sim;
}

/** A storm cat with a full skill gauge, whose own attack is switched off (its chain lightning would stun and hurt the same enemies). */
function stormCat(sim: Sim, cell = 0): SimUnit {
  const u = put(sim, cell, 'm_storm', 0);
  u.charge = -1e6;
  u.sp = 1;
  return u;
}

/** An enemy standing still `travelled` px along the road (the flag only: statuses are not involved). */
function hold(sim: Sim, id: EnemyId, travelled: number, hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** Puts a held enemy at another place on the road at once. */
function place(e: SimEnemy, travelled: number): void {
  const p = pathPoint(travelled);
  e.travelled = travelled;
  e.x = p.x;
  e.y = p.y;
  e.angle = p.angle;
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

const CLOUD_EVENTS: Array<keyof BattleEvents> = ['spCast', 'cloudBolt', 'cloudHop', 'cloudEnd'];

/** The ticks between the cast (the tick `fire` ran) and each event of a type. */
function ticksOf(log: ReturnType<typeof tape>, type: string, castTime: number): number[] {
  return log.filter((x) => x.type === type).map((x) => Math.round((x.time - castTime) / TICK));
}

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length > 0) (restores.pop() as () => void)();
  vi.restoreAllMocks();
});

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Tagalong Cloud, the data', () => {
  it('has the design appendix\'s cells and is built: the storm cat carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'cloud', unit: 'm_storm', rank: 3, cooldown: 18, life: 3.2, every: 0.4, host: 0.3, splash: { power: 0.15, radius: 60 }, hop: 150, cap: 6,
      built: true,
    });
    expect(unitDef('m_storm').spSkill).toEqual({ id: 'cloud', rank: 3, cooldown: 18, nameKey: 'sp.cloud.name' });
    expect(SP_HANDLERS.cloud).toBe(cloud);
  });

  it('fills the storm cat\'s gauge in 18 s, from the 50% a cat starts at in 9 s', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_storm');
    expect(u.sp).toBe(0.5);
    u.charge = -1e6;
    advance(sim, 8.8);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── ready and the host ─────────────────────────────

describe('when the cloud is cast and who it sticks to', () => {
  it('waits for an enemy inside the cat\'s own range: none, only a far one, or only a dead one is no reason to cast', () => {
    const sim = arena();
    const u = stormCat(sim);
    expect(cloud.ready(sim, u)).toBe(false);
    const far = hold(sim, 'cucumber', 900);
    expect(inReach(u, far)).toBe(false);
    expect(cloud.ready(sim, u)).toBe(false);
    fire(sim, u);
    // Not cast: the gauge waits full and looks again in 0.2 s.
    expect(u.sp).toBe(1);
    expect(sim.clouds).toHaveLength(0);
    const near = hold(sim, 'cucumber', 200);
    expect(inReach(u, near)).toBe(true);
    expect(cloud.ready(sim, u)).toBe(true);
    damageEnemy(sim, near, 1e12, 'magic', null, false, null);
    expect(near.dead).toBe(true);
    expect(cloud.ready(sim, u)).toBe(false);
  });

  it('casts in the tick it can: the gauge goes to 0, the cloud exists and the cat is not blocked from its own attack', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    const log = tape(sim, CLOUD_EVENTS);
    fire(sim, u);
    expect(u.sp).toBe(0);
    expect(sim.clouds).toHaveLength(1);
    expect(log.map((x) => x.type)).toEqual(['spCast']);
    expect(sim.clouds[0]!.id).toBe(1);
  });

  it('sticks to the first enemy in skill order inside the range: an elite or a boss before the others, then the one that has gone farthest, then the lower uid', () => {
    const sim = arena();
    const u = stormCat(sim);
    const rear = hold(sim, 'cucumber', 120);
    const lead = hold(sim, 'cucumber', 300);
    const twin = hold(sim, 'cucumber', 300);
    expect([rear, lead, twin].every((e) => inReach(u, e))).toBe(true);
    expect(cloud.cast(sim, u)).toBe(true);
    expect(sim.clouds[0]!.host).toBe(lead);
    expect(lead.uid).toBeLessThan(twin.uid);

    const sim2 = arena();
    const u2 = stormCat(sim2);
    hold(sim2, 'cucumber', 330);
    const elite = hold(sim2, 'spray', 150);
    expect(inReach(u2, elite)).toBe(true);
    cloud.cast(sim2, u2);
    expect(sim2.clouds[0]!.host).toBe(elite);
  });

  it('prefers the enemy under the laser\'s dot, an enemy out of reach is never the host, and a lead enemy out of reach does not matter', () => {
    const sim = arena();
    const u = stormCat(sim);
    const ahead = hold(sim, 'cucumber', 900);
    const lead = hold(sim, 'cucumber', 350);
    const rear = hold(sim, 'cucumber', 100);
    rear.focused = true;
    cloud.cast(sim, u);
    expect(sim.clouds[0]!.host).toBe(rear);
    rear.focused = false;
    sim.clouds.length = 0;
    cloud.cast(sim, u);
    expect(sim.clouds[0]!.host).toBe(lead);
    expect(sim.clouds[0]!.host).not.toBe(ahead);
  });

  it('announces the cast with the cloud\'s numbers and the cat\'s tile as the anchor, before any damage', () => {
    const sim = arena();
    const u = stormCat(sim, 6);
    const host = hold(sim, 'cucumber', 200);
    const log = tape(sim, ['spCast', 'cloudBolt', 'hit']);
    fire(sim, u);
    const cast = log[0]!;
    expect(cast.type).toBe('spCast');
    expect(cast.payload).toMatchObject({ skill: 'cloud', first: true, x: cellCenterX(6), y: cellCenterY(6) });
    const data = cast.payload.data as Record<string, number>;
    expect(data).toMatchObject({
      cloudId: 1, hostUid: host.uid, hostX: host.x, hostY: host.y, at: sim.time, life: 3.2, every: 0.4, bolts: 8, splashRadius: 60, hopRadius: 150,
    });
    // The cast itself does no damage: the first bolt falls 0.4 s later.
    expect(log).toHaveLength(1);
    expect(host.hp).toBe(1e9);
  });

  it('marks the first cast of the skill in the run and no later one', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    const log = tape(sim, ['spCast']);
    fire(sim, u);
    advance(sim, 3.4);
    fire(sim, u);
    expect(log.map((x) => x.payload.first)).toEqual([true, false]);
  });
});

// ───────────────────────────── the bolts ─────────────────────────────

describe('the bolts', () => {
  it('drops eight, the first 0.4 s after the cast and the last at 3.2 s, and the cloud goes in the tick of the last one', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    const log = tape(sim, CLOUD_EVENTS);
    fire(sim, u);
    const castTime = sim.time;
    advance(sim, 23 * TICK);
    expect(ticksOf(log, 'cloudBolt', castTime)).toEqual([]);
    advance(sim, TICK);
    expect(ticksOf(log, 'cloudBolt', castTime)).toEqual([24]);
    advance(sim, 4);
    expect(ticksOf(log, 'cloudBolt', castTime)).toEqual([24, 48, 72, 96, 120, 144, 168, 192]);
    expect(log.filter((x) => x.type === 'cloudBolt').map((x) => x.payload.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(log.filter((x) => x.type === 'cloudEnd')).toHaveLength(1);
    const end = log.find((x) => x.type === 'cloudEnd')!;
    expect(Math.round((end.time - castTime) / TICK)).toBe(192);
    expect(end.payload).toMatchObject({ cloudId: 1, reason: 'time', bolts: 8 });
    expect(sim.clouds).toHaveLength(0);
    // The last bolt comes before the end in the log.
    expect(log.slice(-2).map((x) => x.type)).toEqual(['cloudBolt', 'cloudEnd']);
  });

  it('hurts the host 0.3 D and the others within 60 px of it 0.15 D (their bodies count), with the cat\'s D at the cast and no crit', () => {
    const sim = arena();
    const u = stormCat(sim);
    // The host is the lead enemy in the cat's reach (380 px along the road is just inside it).
    const host = hold(sim, 'cucumber', 380);
    // The cucumber is 18 px wide: a body 78 px away touches the 60 px circle, one 80 px away does not.
    const inside = hold(sim, 'cucumber', 310);
    const edge = hold(sim, 'cucumber', 302);
    const outside = hold(sim, 'cucumber', 300);
    const behind = hold(sim, 'cucumber', 240);
    // An enemy ahead of the host and already out of the cat's reach is still hurt by the splash (it is the host's neighbours, not the cat's range).
    const ahead = hold(sim, 'cucumber', 430);
    expect(inReach(u, host)).toBe(true);
    expect(inReach(u, ahead)).toBe(false);
    const hits = new Map<number, number[]>();
    sim.events.on('hit', (h) => {
      const list = hits.get(h.enemy.uid) ?? [];
      list.push(h.amount);
      hits.set(h.enemy.uid, list);
      expect(h.crit).toBe(false);
      expect(h.unitId).toBe('m_storm');
    });
    const d = u.stats.damage;
    fire(sim, u);
    advance(sim, 0.4);
    expect(hits.get(host.uid)).toHaveLength(1);
    expect(hits.get(host.uid)![0]).toBeCloseTo(0.3 * d, 9);
    for (const e of [inside, edge, ahead]) expect(hits.get(e.uid)?.[0], `enemy at ${e.travelled}`).toBeCloseTo(0.15 * d, 9);
    expect(hits.get(outside.uid)).toBeUndefined();
    expect(hits.get(behind.uid)).toBeUndefined();
    advance(sim, 3.2);
    // Eight bolts each.
    expect(hits.get(host.uid)).toHaveLength(8);
    expect(hits.get(inside.uid)).toHaveLength(8);
    expect(hits.get(ahead.uid)).toHaveLength(8);
    expect(hits.get(outside.uid)).toBeUndefined();
  });

  it('does not shock: nothing is stunned, no status is applied, and the enemies keep their health apart from the bolts', () => {
    const sim = arena();
    const u = stormCat(sim);
    // They walk (their flag is not set): a shock would show as a status and as a standstill.
    const host = foe(sim, 'cucumber', 240, 1e9);
    const mate = foe(sim, 'cucumber', 200, 1e9);
    const statuses: string[] = [];
    sim.events.on('status', (st) => statuses.push(st.kind));
    fire(sim, u);
    advance(sim, 3.4);
    expect(statuses).toEqual([]);
    expect(host.stunned).toBe(false);
    expect(mate.stunned).toBe(false);
    expect(host.slow).toBe(0);
    expect(host.hp).toBeLessThan(1e9);
  });

  it('keeps the D of the cast: the cat getting stronger or weaker meanwhile does not change the cloud', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 200);
    const d0 = u.stats.damage;
    const amounts: number[] = [];
    sim.events.on('hit', (h) => amounts.push(h.amount));
    fire(sim, u);
    u.stats.damage = d0 * 5;
    advance(sim, 0.4);
    u.stats.damage = d0 / 5;
    advance(sim, 0.4);
    expect(amounts).toHaveLength(2);
    for (const a of amounts) expect(a).toBeCloseTo(0.3 * d0, 9);
    expect(host.hp).toBeCloseTo(1e9 - 0.6 * d0, 3);
  });

  it('goes through armour and the damage rules like any skill damage: a warded enemy takes less from the magic bolt, an elite\'s allowance caps it', () => {
    const sim = arena();
    const u = stormCat(sim);
    const warded = hold(sim, 'tangerine', 200);
    const amounts: number[] = [];
    sim.events.on('hit', (h) => amounts.push(h.amount));
    fire(sim, u);
    advance(sim, 0.4);
    expect(amounts).toHaveLength(1);
    expect(amounts[0]).toBeCloseTo(0.3 * u.stats.damage * (1 - 0.35), 9);
    expect(warded.hp).toBeLessThan(1e9);

    // The wave's real elite: its allowance (a few seconds' worth, refilled slowly) eats what is beyond it.
    const sim2 = arena();
    startWave(sim2, 4);
    sim2.spawnIds.length = 0;
    sim2.spawnTimes.length = 0;
    advance(sim2, 1.05);
    const boss = sim2.boss as SimEnemy;
    boss.frozen = true;
    place(boss, 200);
    boss.capTokens = 0.1;
    boss.capRate = 0;
    // The cat comes after the elite stands there: with a full gauge it would have cast in the tick the elite walked in.
    const u2 = stormCat(sim2);
    const taken: number[] = [];
    sim2.events.on('hit', (h) => taken.push(h.amount));
    fire(sim2, u2);
    advance(sim2, 0.4);
    expect(taken).toHaveLength(1);
    expect(taken[0]).toBeCloseTo(0.1, 9);
  });

  it('follows the host along the road, also out of every cat\'s range, and each bolt falls where the host is', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = foe(sim, 'cucumber', 330, 1e9);
    const where: Array<{ x: number; y: number; hx: number; hy: number; hostUid: number; inRange: boolean }> = [];
    sim.events.on('cloudBolt', (b) => where.push({ x: b.x, y: b.y, hx: host.x, hy: host.y, hostUid: b.hostUid, inRange: inReach(u, host) }));
    fire(sim, u);
    advance(sim, 3.4);
    expect(where).toHaveLength(8);
    for (const w of where) {
      expect(w.x).toBe(w.hx);
      expect(w.y).toBe(w.hy);
      expect(w.hostUid).toBe(host.uid);
    }
    // It walked about 225 px in 3.2 s and ended up out of the cat's reach, still being struck.
    expect(where[7]!.x - where[0]!.x).toBeGreaterThan(190);
    expect(where[0]!.inRange).toBe(true);
    expect(where[7]!.inRange).toBe(false);
    expect(host.hp).toBeLessThan(1e9);
  });

  it('sticks to an elite or a boss for the whole 3.2 s', () => {
    const sim = arena();
    startWave(sim, 4);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    advance(sim, 1.05);
    const boss = sim.boss as SimEnemy;
    boss.frozen = true;
    place(boss, 200);
    hold(sim, 'cucumber', 330);
    const u = stormCat(sim);
    const log = tape(sim, ['cloudBolt']);
    fire(sim, u);
    advance(sim, 3.4);
    expect(log).toHaveLength(8);
    expect(new Set(log.map((x) => x.payload.hostUid))).toEqual(new Set([boss.uid]));
  });

  it('reports the splash victims by position and uid, in skill order, not the host; the event comes before the bolt\'s hits', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 300);
    const a = hold(sim, 'cucumber', 270);
    const b = hold(sim, 'cucumber', 250);
    const log = tape(sim, ['cloudBolt', 'hit']);
    fire(sim, u);
    advance(sim, 0.4);
    expect(log.map((x) => x.type)).toEqual(['cloudBolt', 'hit', 'hit', 'hit']);
    const bolt = log[0]!.payload as unknown as BattleEvents['cloudBolt'];
    expect(bolt).toMatchObject({ cloudId: 1, hostUid: host.uid, x: host.x, y: host.y, index: 1, bolts: 8 });
    expect(bolt.unit.id).toBe('m_storm');
    expect(bolt.points).toEqual([{ x: a.x, y: a.y, uid: a.uid }, { x: b.x, y: b.y, uid: b.uid }]);
    const order = log.slice(1).map((x) => (x.payload as unknown as BattleEvents['hit']).enemy.uid);
    expect(order).toEqual([host.uid, a.uid, b.uid]);
  });
});

// ───────────────────────────── the host falls ─────────────────────────────

describe('when the host falls', () => {
  it('hops to the nearest enemy within 150 px of where it fell, at once, and the beat of the bolts does not move', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 330);
    const near = hold(sim, 'cucumber', 210);
    const nearer = hold(sim, 'cucumber', 270);
    const far = hold(sim, 'cucumber', 130);
    const log = tape(sim, CLOUD_EVENTS);
    fire(sim, u);
    const castTime = sim.time;
    advance(sim, 0.5);
    damageEnemy(sim, host, 1e12, 'magic', null, false, null);
    expect(host.dead).toBe(true);
    sim.step(TICK);
    const hop = log.find((x) => x.type === 'cloudHop')!;
    expect(hop.payload).toMatchObject({ cloudId: 1, fromUid: host.uid, fromX: host.x, fromY: host.y, toUid: nearer.uid, toX: nearer.x, toY: nearer.y });
    expect(near.dead || far.dead).toBe(false);
    advance(sim, 1);
    // The second bolt falls on the new host at its time (tick 48), the third at 72: the hop did not shift them.
    const onNew = log.filter((x) => x.type === 'cloudBolt' && x.payload.hostUid === nearer.uid);
    expect(onNew.map((x) => Math.round((x.time - castTime) / TICK))).toEqual([48, 72]);
    expect(sim.clouds[0]!.host).toBe(nearer);
  });

  it('measures the hop as the fallen host\'s body to the circle of 150 px: 168 px away still counts for a cucumber, 174 does not', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 330);
    const edge = hold(sim, 'cucumber', 162);
    fire(sim, u);
    damageEnemy(sim, host, 1e12, 'magic', null, false, null);
    sim.step(TICK);
    expect(sim.clouds[0]!.host).toBe(edge);

    const sim2 = arena();
    const u2 = stormCat(sim2);
    const host2 = hold(sim2, 'cucumber', 330);
    hold(sim2, 'cucumber', 156);
    const log = tape(sim2, CLOUD_EVENTS);
    fire(sim2, u2);
    damageEnemy(sim2, host2, 1e12, 'magic', null, false, null);
    sim2.step(TICK);
    expect(log.map((x) => x.type)).toEqual(['spCast', 'cloudEnd']);
    expect(sim2.clouds).toHaveLength(0);
  });

  it('goes with an end of its own when nobody is near, in the tick it noticed, and the cat can cast another once the gauge is full again', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 330);
    const log = tape(sim, CLOUD_EVENTS);
    fire(sim, u);
    advance(sim, 0.9);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(2);
    damageEnemy(sim, host, 1e12, 'magic', null, false, null);
    sim.step(TICK);
    const end = log.find((x) => x.type === 'cloudEnd')!;
    expect(end.payload).toMatchObject({ cloudId: 1, reason: 'lost', hostUid: host.uid, x: host.x, y: host.y, bolts: 2 });
    expect(sim.clouds).toHaveLength(0);
    advance(sim, 3);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(2);
  });

  it('treats an enemy chased off the field like a fallen one', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 330);
    const mate = hold(sim, 'cucumber', 270);
    fire(sim, u);
    removeEnemy(sim, host);
    const log = tape(sim, CLOUD_EVENTS);
    sim.step(TICK);
    expect(log.map((x) => x.type)).toEqual(['cloudHop']);
    expect(sim.clouds[0]!.host).toBe(mate);
  });

  it('hops in the tick a bolt of its own fells the host, after the hits: cloudBolt, hit, enemyDie, the splash\'s hit, cloudHop', () => {
    const sim = arena();
    const u = stormCat(sim);
    const d = u.stats.damage;
    // Dies to the second bolt: 0.45 D of health against 0.3 D a bolt.
    const host = hold(sim, 'cucumber', 330, 0.45 * d);
    const mate = hold(sim, 'cucumber', 280);
    const log = tape(sim, ['cloudBolt', 'hit', 'enemyDie', 'cloudHop', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 0.8);
    expect(host.dead).toBe(true);
    expect(log.map((x) => x.type)).toEqual(['cloudBolt', 'hit', 'hit', 'cloudBolt', 'hit', 'enemyDie', 'hit', 'cloudHop']);
    const hop = log[log.length - 1]!.payload as unknown as BattleEvents['cloudHop'];
    expect(hop.toUid).toBe(mate.uid);
    expect(sim.clouds[0]!.host).toBe(mate);
  });

  it('does not splash the children of a host that bursts apart in the bolt that fells it, and hops to one of them (the one further along)', () => {
    const sim = arena();
    const u = stormCat(sim);
    const d = u.stats.damage;
    const host = hold(sim, 'balloon', 330, 0.2 * d);
    const log = tape(sim, ['cloudBolt', 'hit', 'enemyDie', 'enemySpawn', 'cloudHop']);
    fire(sim, u);
    advance(sim, 0.4);
    expect(host.dead).toBe(true);
    // The bolt, the host's hit, its death, two children, the hop: no hit on a child.
    expect(log.map((x) => x.type)).toEqual(['cloudBolt', 'hit', 'enemyDie', 'enemySpawn', 'enemySpawn', 'cloudHop']);
    const children = sim.enemies.filter((e) => e.id === 'balloon_small');
    expect(children).toHaveLength(2);
    expect(children.every((c) => c.hp === c.maxHp)).toBe(true);
    const ahead = children[0]!.travelled > children[1]!.travelled ? children[0]! : children[1]!;
    expect(sim.clouds[0]!.host).toBe(ahead);
  });

  it('ends with the last bolt whatever happened to the host: no hop after the eighth bolt kills it', () => {
    const sim = arena();
    const u = stormCat(sim);
    const d = u.stats.damage;
    // Eight bolts of 0.3 D take 2.4 D; the host has 2.35 D.
    const host = hold(sim, 'cucumber', 330, 2.35 * d);
    hold(sim, 'cucumber', 290);
    const log = tape(sim, ['cloudBolt', 'cloudHop', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 3.4);
    expect(host.dead).toBe(true);
    expect(log.filter((x) => x.type === 'cloudHop')).toHaveLength(0);
    const last = log.slice(-2).map((x) => x.type);
    expect(last).toEqual(['cloudBolt', 'cloudEnd']);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(8);
  });

  it('hops again and again: a chain of hosts that each fall to the clouds own second bolt, with the beat kept and every bolt landing', () => {
    const sim = arena();
    const u = stormCat(sim);
    const d = u.stats.damage;
    // Four hosts 100 px apart (beyond the 78 px a splash reaches, within the 168 px a hop reaches), each good for two bolts.
    const hosts = [380, 280, 180, 80].map((p) => hold(sim, 'cucumber', p, 0.45 * d));
    const log = tape(sim, ['cloudBolt', 'cloudHop', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 3.5);
    expect(log.filter((x) => x.type === 'cloudBolt').map((x) => x.payload.hostUid)).toEqual(
      [hosts[0], hosts[0], hosts[1], hosts[1], hosts[2], hosts[2], hosts[3], hosts[3]].map((h) => h!.uid),
    );
    expect(log.filter((x) => x.type === 'cloudHop').map((x) => x.payload.toUid)).toEqual([hosts[1]!.uid, hosts[2]!.uid, hosts[3]!.uid]);
    // The last host falls to the eighth bolt: the cloud ends with its time, not for want of a host.
    expect(log.filter((x) => x.type === 'cloudEnd').map((x) => x.payload.reason)).toEqual(['time']);
    expect(hosts.every((h) => h.dead)).toBe(true);
  });
});

// ───────────────────────────── several clouds, the cap ─────────────────────────────

describe('several clouds', () => {
  it('lets two storm cats put two clouds on the same host: their bolts fall together, in the order they were cast', () => {
    const sim = arena();
    const a = stormCat(sim, 0);
    const b = stormCat(sim, 1);
    const host = hold(sim, 'cucumber', 200);
    const log = tape(sim, ['spCast', 'cloudBolt']);
    sim.step(TICK);
    expect(sim.clouds.map((c) => c.id)).toEqual([1, 2]);
    expect(sim.clouds.map((c) => c.owner)).toEqual([a, b]);
    advance(sim, 0.4);
    const bolts = log.filter((x) => x.type === 'cloudBolt');
    expect(bolts.map((x) => x.payload.cloudId)).toEqual([1, 2]);
    expect(bolts.map((x) => x.payload.hostUid)).toEqual([host.uid, host.uid]);
    expect(bolts[0]!.time).toBe(bolts[1]!.time);
    // Only the first of the two is the skill\'s first cast.
    expect(log.filter((x) => x.type === 'spCast').map((x) => x.payload.first)).toEqual([true, false]);
  });

  it('keeps at most six clouds on the field: the seventh cat waits with a full gauge until a cloud is gone, then casts', () => {
    const sim = arena();
    const cats = [0, 1, 2, 3, 4, 5, 6].map((c) => stormCat(sim, c));
    hold(sim, 'cucumber', 200);
    sim.step(TICK);
    expect(sim.clouds).toHaveLength(6);
    expect(sim.clouds.map((c) => c.owner)).toEqual(cats.slice(0, 6));
    expect(cats[6]!.sp).toBe(1);
    expect(cloud.ready(sim, cats[6]!)).toBe(false);
    advance(sim, 1);
    expect(sim.clouds).toHaveLength(6);
    expect(cats[6]!.sp).toBe(1);
    // The six clouds go 3.2 s after the cast; the seventh cat casts within the 0.2 s look after that.
    advance(sim, 2.3);
    expect(sim.clouds.map((c) => c.id)).toContain(7);
    expect(cats[6]!.sp).toBeLessThan(1);
    expect(sim.cloudSeq).toBe(7);
  });

  it('counts the cap in clouds, not in casts: a long run of casts is not limited', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    let casts = 0;
    sim.events.on('spCast', () => casts++);
    for (let i = 0; i < 8; i++) {
      fire(sim, u);
      advance(sim, 3.4);
    }
    expect(casts).toBe(8);
    expect(sim.cloudSeq).toBe(8);
  });
});

// ───────────────────────────── the cat and the battle go on ─────────────────────────────

describe('what happens to the cat and to the battle meanwhile', () => {
  it('carries on when the cat is sold: the bolts keep their numbers, the damage stays on the sold cat\'s account and a kill is nobody\'s', () => {
    const sim = arena();
    const u = stormCat(sim, 6);
    const host = hold(sim, 'cucumber', 200, 1e9);
    const d = u.stats.damage;
    const amounts: number[] = [];
    sim.events.on('hit', (h) => amounts.push(h.amount));
    fire(sim, u);
    advance(sim, 0.5);
    expect(sim.sell(6)).toBeNull();
    expect(u.removed).toBe(true);
    advance(sim, 3);
    expect(amounts).toHaveLength(8);
    for (const a of amounts) expect(a).toBeCloseTo(0.3 * d, 9);
    expect(u.damageDealt).toBeCloseTo(8 * 0.3 * d, 6);
    expect(sim.clouds).toHaveLength(0);
    expect(host.hp).toBeCloseTo(1e9 - 8 * 0.3 * d, 3);
    // A kill by the sold cat's cloud is not credited to anybody.
    const sim2 = arena();
    const u2 = stormCat(sim2, 6);
    const frail = hold(sim2, 'cucumber', 200, 0.1);
    fire(sim2, u2);
    expect(sim2.sell(6)).toBeNull();
    advance(sim2, 0.5);
    expect(frail.dead).toBe(true);
    expect(u2.kills).toBe(0);
  });

  it('carries on when the cat is merged away, molted, awakened or moved', () => {
    const sim = arena();
    sim.fish = 1e6;
    sim.purr = 100;
    const a = stormCat(sim, 6);
    const b = put(sim, 7, 'm_storm', 0);
    b.charge = -1e6;
    hold(sim, 'cucumber', 200);
    const count = (): number => sim.clouds.length;
    fire(sim, a);
    expect(count()).toBe(1);
    advance(sim, 0.5);
    // Merge the two storm cats: both are gone, a frost queen stands in the second one's place.
    expect(sim.drop(6, 7)).toBeNull();
    expect(a.removed).toBe(true);
    expect(count()).toBe(1);
    advance(sim, 1);
    const queen = sim.units[7]!;
    queen.charge = -1e6;
    // Moving the new cat does not touch the cloud either.
    expect(sim.drop(7, 8)).toBeNull();
    expect(count()).toBe(1);
    advance(sim, 2);
    expect(count()).toBe(0);
  });

  it('works with a gauge the pass fills by itself: a storm cat on a board casts about every 18 s while enemies are near', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_storm', 0);
    u.charge = -1e6;
    hold(sim, 'cucumber', 200);
    const times: number[] = [];
    sim.events.on('spCast', () => times.push(sim.time));
    advance(sim, 9.3);
    expect(times).toHaveLength(1);
    advance(sim, 18);
    expect(times).toHaveLength(2);
    expect(times[1]! - times[0]!).toBeCloseTo(18, 1);
  });

  it('is blocked like any gauge: a cat standing in a hazard does not fill its gauge', () => {
    const sim = arena();
    const u = put(sim, 0, 'm_storm', 0);
    u.charge = -1e6;
    u.sp = 0.5;
    sim.hazardCount[0] = 1;
    hold(sim, 'cucumber', 200);
    advance(sim, 12);
    expect(u.sp).toBe(0.5);
    expect(sim.clouds).toHaveLength(0);
  });

  it('goes on through wave and stage changes: the field is not the wave\'s', () => {
    const sim = arena();
    const u = stormCat(sim);
    const host = hold(sim, 'cucumber', 200);
    const log = tape(sim, ['cloudBolt', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 1.0);
    startWave(sim, 2);
    sim.spawnIds.length = 0;
    sim.spawnTimes.length = 0;
    expect(host.dead).toBe(false);
    advance(sim, 2.5);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(8);
    expect(log.filter((x) => x.type === 'cloudEnd')).toHaveLength(1);
  });

  it('stands still with a choice popup and goes on after it', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    const log = tape(sim, ['cloudBolt', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 1.0);
    const before = log.filter((x) => x.type === 'cloudBolt').length;
    expect(before).toBe(2);
    openSummonOffer(sim, false);
    expect(sim.phase).toBe('choice');
    const state = JSON.stringify([sim.time, sim.clouds[0]!.done, log.length]);
    sim.step(5);
    expect(JSON.stringify([sim.time, sim.clouds[0]!.done, log.length])).toBe(state);
    expect(sim.pickSummon(0)).toBeNull();
    advance(sim, 2.5);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(8);
    expect(log.filter((x) => x.type === 'cloudEnd')).toHaveLength(1);
  });

  it('freezes with a defeat and goes on after a revive; no end is announced for a cloud that did not end', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    const log = tape(sim, ['cloudBolt', 'cloudEnd']);
    fire(sim, u);
    advance(sim, 1.0);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(2);
    lose(sim, 'boss_timeout');
    expect(sim.phase).toBe('lost');
    advance(sim, 4);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(2);
    expect(log.filter((x) => x.type === 'cloudEnd')).toHaveLength(0);
    expect(sim.clouds).toHaveLength(1);
    expect(sim.revive()).toBeNull();
    advance(sim, 2.5);
    expect(log.filter((x) => x.type === 'cloudBolt')).toHaveLength(8);
    expect(log.filter((x) => x.type === 'cloudEnd')).toHaveLength(1);
  });

  it('is not saved: a battle restored from a wave-start save has no cloud', () => {
    const sim = arena();
    const u = stormCat(sim);
    hold(sim, 'cucumber', 200);
    fire(sim, u);
    expect(sim.clouds).toHaveLength(1);
    expect(sim.cloudSeq).toBe(1);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const restored = createBattle(sim.init, snap!) as Sim;
    expect(restored.clouds).toHaveLength(0);
    expect(restored.cloudSeq).toBe(0);
    // Nothing of the old battle's cloud carries over: a restored battle plays on without it.
    const log = tape(restored, ['cloudBolt', 'cloudEnd']);
    advance(restored, 6);
    expect(log).toHaveLength(0);
  });

  it('gives the same result at 1x, 2x and 3x speed: only simulation time counts', () => {
    const play = (chunk: number): string => {
      const sim = arena();
      const u = stormCat(sim);
      [150, 180, 215, 240, 300].forEach((p) => foe(sim, 'cucumber', p, 1e9));
      const log = tape(sim, ['spCast', 'cloudBolt', 'cloudHop', 'cloudEnd', 'hit']);
      u.sp = 1;
      u.spCheckAt = 0;
      const ticks = Math.round(4 / TICK);
      for (let i = 0; i < ticks; i += chunk) sim.step(TICK * chunk);
      return JSON.stringify(log.map((x) => [x.type, Math.round(x.time * 1000), JSON.stringify(x.payload, (_k, v) => (typeof v === 'object' && v !== null && 'uid' in v ? `${v.uid}:${v.id}` : v))]));
    };
    const one = play(1);
    expect(JSON.parse(one).length).toBeGreaterThan(20);
    expect(play(2)).toBe(one);
    expect(play(3)).toBe(one);
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
    it(`casts and drops all eight bolts in the ${name}`, () => {
      const sim = arena(over);
      const u = stormCat(sim);
      hold(sim, 'cucumber', 200);
      const log = tape(sim, ['spCast', 'cloudBolt', 'cloudEnd']);
      fire(sim, u);
      advance(sim, 3.5);
      expect(log.map((x) => x.type)).toEqual(['spCast', ...Array<string>(8).fill('cloudBolt'), 'cloudEnd']);
    });
  }
});

// ───────────────────────────── determinism, sp off, whole runs ─────────────────────────────

describe('determinism and the switch', () => {
  it('draws no random numbers and gives the same result whether or not anybody listens', () => {
    const spy = vi.spyOn(Math, 'random');
    const play = (listen: boolean): string => {
      const sim = arena();
      const u = stormCat(sim);
      const cats = [foe(sim, 'cucumber', 200), foe(sim, 'balloon', 240, 1e4), foe(sim, 'cucumber', 280, 1e4)];
      if (listen) tape(sim, ['spCast', 'cloudBolt', 'cloudHop', 'cloudEnd', 'hit', 'enemyDie']);
      fire(sim, u);
      advance(sim, 4);
      return JSON.stringify([cats.map((e) => [e.hp, e.travelled, e.dead]), sim.rng.states(), sim.kills, sim.time]);
    };
    const quiet = play(false);
    expect(play(true)).toBe(quiet);
    expect(spy).not.toHaveBeenCalled();
  });

  it('does nothing in a battle played without skills: the gauge stays 0 and no cloud ever appears', () => {
    const sim = arena({ sp: false });
    const u = put(sim, 0, 'm_storm', 0);
    expect(u.sp).toBe(0);
    u.charge = -1e6;
    hold(sim, 'cucumber', 200);
    const log = tape(sim, ['spCast', 'cloudBolt']);
    advance(sim, 25);
    expect(u.sp).toBe(0);
    expect(sim.clouds).toHaveLength(0);
    expect(log).toHaveLength(0);
  });

  it('casts clouds in a real bot run with three storm cats on the board, and the run is the same twice', () => {
    let bolts = 0;
    let casts = 0;
    const play = (seed: number): { hash: string; end: string; bolts: number; casts: number } => {
      let b = 0;
      let c = 0;
      const p = fingerprintRun(initOf({ seed }, 3), 'synergy', {
        setup: (s) => {
          put(s, 0, 'm_storm');
          put(s, 4, 'm_storm');
          put(s, 20, 'm_storm');
          s.events.on('cloudBolt', () => b++);
          s.events.on('spCast', (e) => {
            if (e.skill === 'cloud') c++;
          });
        },
      });
      return { hash: p.hash, end: p.end, bolts: b, casts: c };
    };
    for (const seed of [31, 32]) {
      const one = play(seed);
      const two = play(seed);
      expect(two).toEqual(one);
      bolts += one.bolts;
      casts += one.casts;
    }
    expect(casts).toBeGreaterThan(5);
    // A cloud whose host falls with nobody near it goes early, so the bolts per cast are fewer than eight, but there are bolts.
    expect(bolts).toBeGreaterThan(casts);
    expect(bolts).toBeLessThanOrEqual(casts * 8);
  });

  it('never has more than six clouds at once in a whole run with a board of storm cats', () => {
    const sim = newSim({ seed: 41 }, 3);
    for (let c = 0; c < 12; c++) put(sim, c, 'm_storm');
    advance(sim, 3.05);
    let most = 0;
    for (let wave = 2; wave <= 5; wave++) {
      startWave(sim, wave);
      for (let i = 0; i < 40 * 60; i++) {
        sim.step(TICK);
        if (sim.phase !== 'wave') break;
        if (sim.clouds.length > most) most = sim.clouds.length;
        for (const u of sim.units) if (u) u.charge = -1e6;
        if (sim.boss) slay(sim);
      }
    }
    expect(most).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(6);
  });
});
