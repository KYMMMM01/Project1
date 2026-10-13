/**
 * The gunner's skill, Wanted: One Shot! (docs/design_skills_v2.md 3.5 and 4.4.2, directive decisions 2 and 4): a bite of 6% of an elite's or
 * boss's MAXIMUM health outside its damage allowance, 12% in all per target for every gunner together, a small shot at the sturdiest plain
 * enemy when there is no elite or boss, and holding fire in the wave before one. The frame it stands on is tested in `sim.spSkills.test.ts`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BattleEvents, BattleInit, EnemyId } from '@/game/api';
import { CHAPTER_HP_MULT, CLEAR_DELAY, TICK, specialHp } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { GOLD_DUNGEON_BOSS_HP } from '@/game/data/goldDungeon';
import { SP_ROWS } from '@/game/data/spSkills';
import { stakeRules } from '@/game/data/stakes';
import { unitDef } from '@/game/data/units';
import { cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import { applyStatus, damageEnemy } from '@/game/sim/enemies';
import { startWave } from '@/game/sim/flow';
import { SP_HANDLERS } from '@/game/sim/sp/registry';
import { inReach } from '@/game/sim/sp/target';
import { holdingFire, poolLeft, wanted } from '@/game/sim/sp/wanted';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { DamageWindow } from '@/view/hud/killEstimate';
import { advance, foe, initOf, newSim, put, quietWave, record, slay } from './simHelpers';
import { fingerprintRun } from './spHelpers';

// ───────────────────────────── helpers ─────────────────────────────

const ROW = SP_ROWS.wanted;
const MAX_POOL = 0.12;

/** The wave's elite or boss has walked in (one second after the wave began) in a battle whose scripted spawns are cancelled; it stands still. */
function specialArena(wave: number, over: Partial<BattleInit> = {}): { sim: Sim; boss: SimEnemy } {
  const sim = newSim(over);
  quietWave(sim);
  startWave(sim, wave);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  sim.spawnIdx = 0;
  advance(sim, 1.05);
  const boss = sim.boss as SimEnemy;
  boss.frozen = true;
  return { sim, boss };
}

/** A battle in an ordinary wave (`wave` is entered with its spawns cancelled): a test controls the field. */
function plainArena(wave = 5, over: Partial<BattleInit> = {}): Sim {
  const sim = newSim(over);
  quietWave(sim);
  startWave(sim, wave);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  sim.spawnIdx = 0;
  return sim;
}

/** A gunner in `cell` with a full gauge (its attack gauge empty, so it does not shoot in the same tick). */
function gunner(sim: Sim, cell = 0): SimUnit {
  const u = put(sim, cell, 'r_gunner', 0);
  u.sp = 1;
  return u;
}

/** An enemy of any kind standing still where the road is `travelled` px along. */
function stand(sim: Sim, id: EnemyId, travelled: number, hp = 1e9): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  return e;
}

/** Puts an enemy at a place on the road at once (a frozen enemy does not recompute it). */
function place(e: SimEnemy, travelled: number): void {
  const p = pathPoint(travelled);
  e.travelled = travelled;
  e.x = p.x;
  e.y = p.y;
  e.angle = p.angle;
}

/** The far corner of the road from cell 0: out of the reach of a gunner there (distance about 687 against 620 + the enemy's radius). */
const FAR = 1169;

/** Casts through the handler (what the gauge pass does when the gauge is full), asserting that the skill said it was ready. */
function shoot(sim: Sim, u: SimUnit): void {
  expect(wanted.ready(sim, u)).toBe(true);
  expect(wanted.cast(sim, u)).toBe(true);
  // What the gauge pass does after a cast; without it the pass would cast the same full gauge again in the next tick of the test.
  u.sp = 0;
}

/** Lets the real gauge pass cast: the gauge is full, the skill's own check is due, one tick. */
function fire(sim: Sim, u: SimUnit): void {
  u.sp = 1;
  u.spCheckAt = 0;
  sim.step(TICK);
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
});

/** The wave's real elite or boss health, from the tables: base x the chapter's multiple x the butler level's. */
function specialMaxHp(chapter: number, wave: number, stake: number): number {
  return specialHp(wave % 8 === 4 ? 'elite' : 'boss', Math.floor((wave - 1) / 8)) * (CHAPTER_HP_MULT[chapter - 1] as number) * stakeRules(stake).specialHpMult;
}

// ───────────────────────────── the data and the registration ─────────────────────────────

describe('Wanted: One Shot, the data', () => {
  it('has the design appendix\'s cells and is built: the gunner carries the skill and its handler is registered', () => {
    expect(ROW).toMatchObject({
      id: 'wanted', unit: 'r_gunner', rank: 4, cooldown: 24, bite: 0.06, pool: MAX_POOL, ignoreCap: true, ignoreDefence: true, small: 0.2,
      hold: 'nextWaveSpecial', built: true,
    });
    expect(unitDef('r_gunner').spSkill).toEqual({ id: 'wanted', rank: 4, cooldown: 24, nameKey: 'sp.wanted.name' });
    expect(SP_HANDLERS.wanted).toBe(wanted);
  });

  it('fills the gunner\'s gauge in 24 s, from the 50% a cat starts at in 12 s', () => {
    const sim = plainArena();
    const u = put(sim, 0, 'r_gunner');
    expect(u.sp).toBe(0.5);
    advance(sim, 11.8);
    expect(u.sp).toBeLessThan(1);
    advance(sim, 0.4);
    expect(u.sp).toBeGreaterThanOrEqual(1 - 1e-9);
  });
});

// ───────────────────────────── the bite ─────────────────────────────

describe('the bite on an elite or a boss', () => {
  it('takes 6% of the maximum health, twice, and a third bite never lands (every chapter, wave and butler level 0 and 5)', () => {
    let cases = 0;
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (const stake of [0, 5]) {
        for (const wave of [4, 8, 12, 16, 20, 24]) {
          const { sim, boss } = specialArena(wave, { chapter, stake });
          const max = specialMaxHp(chapter, wave, stake);
          expect(boss.maxHp, `ch${chapter} stake${stake} wave${wave}`).toBeCloseTo(max, 6);
          const u = gunner(sim);
          const cap = boss.capTokens;
          shoot(sim, u);
          expect(boss.hp).toBeCloseTo(max * 0.94, 6);
          expect(boss.bountyTaken).toBeCloseTo(max * 0.06, 6);
          shoot(sim, u);
          expect(boss.hp).toBeCloseTo(max * 0.88, 6);
          expect(boss.bountyTaken).toBe(MAX_POOL * boss.maxHp);
          // The third finds nothing to bite; nothing else is on the field, so it is not ready and does nothing.
          expect(wanted.ready(sim, u)).toBe(false);
          expect(wanted.cast(sim, u)).toBe(false);
          expect(boss.hp).toBeCloseTo(max * 0.88, 6);
          // The allowance was neither spent nor filled by any of it.
          expect(boss.capTokens).toBe(cap);
          cases++;
        }
      }
    }
    expect(cases).toBe(60);
  });

  it('is worth the design\'s figures against real health: elite 5,387 and boss 5,121 and 21,263, and the butler level 5 ones (7,170 and 1,743)', () => {
    const rows: Array<[chapter: number, wave: number, stake: number, health: number, bite: number]> = [
      [3, 12, 0, 5387, 323], [3, 16, 0, 5121, 307], [5, 24, 0, 21263, 1276], [3, 16, 5, 7170, 430], [1, 4, 5, 1743, 105],
    ];
    for (const [chapter, wave, stake, health, bite] of rows) {
      const { sim, boss } = specialArena(wave, { chapter, stake });
      expect(Math.round(boss.maxHp), `ch${chapter} wave${wave} stake${stake}`).toBe(health);
      const u = gunner(sim);
      shoot(sim, u);
      expect(Math.round(boss.maxHp - boss.hp)).toBe(bite);
    }
  });

  it('is exactly the same bite whatever armour, ward, vulnerability, the laser, a blanket or the vacuum\'s inhale would have done to a hit', () => {
    const { sim, boss } = specialArena(8);
    expect(boss.id).toBe('boss_vacuum');
    expect(boss.spec.armor).toBeGreaterThan(0.3);
    expect(boss.spec.ward).toBeGreaterThan(0);
    const u = gunner(sim);
    const max = boss.maxHp;
    // Everything that would change a hit: a broken armour, a vulnerable mark, the laser's dot, the nap blanket, the vacuum inhaling.
    applyStatus(sim, boss, 'armor_break', 0.5, 10, null);
    applyStatus(sim, boss, 'vulnerable', 0.5, 10, null);
    boss.focused = true;
    sim.fx.enemyDamageTaken = 0.5;
    sim.inhaleUntil = sim.time + 10;
    sim.inhaleTaken = 0.5;
    u.armorIgnore = 0.3;
    // A control: the same raw number as an ordinary hit comes out quite different (and is held by the allowance).
    boss.capTokens = Infinity;
    const control = record(sim, 'hit');
    damageEnemy(sim, boss, 1000, 'physical', u, false, null);
    expect(control[0]?.amount).not.toBeCloseTo(1000, 0);
    boss.hp = max;
    shoot(sim, u);
    expect(boss.hp).toBeCloseTo(max * 0.94, 6);
  });

  it('does not touch the damage allowance and leaves it to hold everything else: before, between and after the bites', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    boss.capTokens = 100;
    const hits = record(sim, 'hit');
    shoot(sim, u);
    expect(boss.capTokens).toBe(100);
    boss.capTokens = 0;
    shoot(sim, u);
    expect(boss.capTokens).toBe(0);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.88, 6);
    // Ordinary damage is still cut to the allowance, for the same boss, with the pool spent.
    boss.capTokens = 40;
    damageEnemy(sim, boss, 1e6, 'magic', null, false, null);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.amount).toBe(40);
    expect(boss.capTokens).toBe(0);
    // The cell `ignoreCap` is live: turned off the bite goes through the allowance like any hit (and is announced as one).
    ROW.ignoreCap = false;
    restores.push(() => { ROW.ignoreCap = true; });
    const fresh = specialArena(8);
    const v = gunner(fresh.sim);
    fresh.boss.capTokens = 10;
    const freshHits = record(fresh.sim, 'hit');
    shoot(fresh.sim, v);
    expect(freshHits).toHaveLength(1);
    expect(freshHits[0]?.amount).toBeLessThanOrEqual(10 * 1.0001);
    expect(fresh.boss.hp).toBeGreaterThan(fresh.boss.maxHp * 0.99);
  });

  it('gives the skill\'s cast event, then the damage, then a `bite` event of its own: never a `hit`', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const log = tape(sim, ['spCast', 'hit', 'bite', 'enemyDie']);
    shoot(sim, u);
    expect(log.map((x) => x.type)).toEqual(['spCast', 'bite']);
    const cast = log[0]?.payload as BattleEvents['spCast'];
    expect(cast.skill).toBe('wanted');
    expect(cast.unit).toBe(u);
    if (cast.skill !== 'wanted') throw new Error('not a wanted cast');
    expect(cast.data).toMatchObject({
      mode: 'bite', targetUid: boss.uid, x: boss.x, y: boss.y, pool: MAX_POOL, closed: false,
    });
    expect(cast.data.share).toBeCloseTo(0.06, 12);
    expect(cast.data.taken).toBeCloseTo(0.06, 12);
    expect(cast.data.amount).toBeCloseTo(boss.maxHp * 0.06, 6);
    const bite = log[1]?.payload as BattleEvents['bite'];
    expect(bite).toMatchObject({ unit: u, enemy: boss, pool: MAX_POOL, killed: false });
    expect(bite.amount).toBeCloseTo(boss.maxHp * 0.06, 6);
    expect(bite.share).toBeCloseTo(0.06, 12);
    expect(bite.taken).toBeCloseTo(0.06, 12);
    // The second bite closes the case: the cast says so and the taken share is the whole pool.
    shoot(sim, u);
    const second = log.filter((x) => x.type === 'spCast')[1]?.payload as BattleEvents['spCast'];
    if (second.skill !== 'wanted') throw new Error('not a wanted cast');
    expect(second.data.closed).toBe(true);
    expect(second.data.taken).toBe(MAX_POOL);
    expect(log.filter((x) => x.type === 'hit')).toHaveLength(0);
  });

  it('takes only what is left of the pool when that is less than a bite, and closes the case on the exact figure', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    boss.bountyTaken = 0.09 * boss.maxHp;
    expect(poolLeft(boss)).toBeCloseTo(0.03 * boss.maxHp, 6);
    const bites = record(sim, 'bite');
    shoot(sim, u);
    expect(bites[0]?.amount).toBeCloseTo(0.03 * boss.maxHp, 6);
    expect(bites[0]?.share).toBeCloseTo(0.03, 12);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.97, 6);
    expect(boss.bountyTaken).toBe(MAX_POOL * boss.maxHp);
    expect(wanted.ready(sim, u)).toBe(false);
  });

  it('can only be asked, not told: `ready` changes nothing', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    stand(sim, 'cucumber', 100, 500);
    const before = JSON.stringify([boss.hp, boss.bountyTaken, boss.capTokens, u.sp, u.spCheckAt, sim.enemies.map((e) => e.hp), sim.time]);
    const events = tape(sim, ['spCast', 'bite', 'hit']);
    for (let i = 0; i < 5; i++) expect(wanted.ready(sim, u)).toBe(true);
    expect(JSON.stringify([boss.hp, boss.bountyTaken, boss.capTokens, u.sp, u.spCheckAt, sim.enemies.map((e) => e.hp), sim.time])).toBe(before);
    expect(events).toHaveLength(0);
  });

  it('goes through the shield first, and counts the whole bite against the pool', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const bite = boss.maxHp * 0.06;
    boss.shield = 100;
    boss.maxShield = 100;
    const broke = record(sim, 'shieldBreak');
    shoot(sim, u);
    expect(boss.shield).toBe(0);
    expect(broke).toHaveLength(1);
    expect(boss.hp).toBeCloseTo(boss.maxHp - (bite - 100), 6);
    expect(boss.bountyTaken).toBeCloseTo(bite, 6);
    // A shield that takes the whole bite leaves the health alone.
    const second = specialArena(8);
    const v = gunner(second.sim);
    second.boss.shield = second.boss.maxHp;
    shoot(second.sim, v);
    expect(second.boss.hp).toBe(second.boss.maxHp);
    expect(second.boss.shield).toBeCloseTo(second.boss.maxHp * 0.94, 6);
    expect(second.boss.bountyTaken).toBeCloseTo(second.boss.maxHp * 0.06, 6);
  });

  it('kills a target that has less health than a bite, for the gunner (kills, damage, the event\'s order), and ends the wave as a kill does', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    boss.hp = boss.maxHp * 0.04;
    const log = tape(sim, ['spCast', 'enemyDie', 'bite', 'hit', 'waveEnd']);
    const kills = u.kills;
    shoot(sim, u);
    expect(boss.dead).toBe(true);
    expect(sim.boss).toBeNull();
    expect(sim.stage).toBe('clearing');
    expect(u.kills).toBe(kills + 1);
    expect(sim.getStats().bossesKilled).toBe(1);
    expect(sim.getStats().damageByUnit.r_gunner).toBeCloseTo(boss.maxHp * 0.04, 6);
    expect(log.map((x) => x.type)).toEqual(['spCast', 'enemyDie', 'waveEnd', 'bite']);
    expect((log[1]?.payload as BattleEvents['enemyDie']).killer).toBe(u);
    expect((log[3]?.payload as BattleEvents['bite']).killed).toBe(true);
  });

  it('counts the bite as the gunner\'s damage in the run\'s statistics', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    shoot(sim, u);
    expect(u.damageDealt).toBeCloseTo(boss.maxHp * 0.06, 6);
    expect(sim.getStats().damageByUnit.r_gunner).toBeCloseTo(boss.maxHp * 0.06, 6);
  });

  it('lights the rage when it takes the boss under half health, and not before', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const rages = record(sim, 'enrage');
    // 60% -> 54%: still above half, no rage.
    boss.hp = boss.maxHp * 0.6;
    shoot(sim, u);
    expect(boss.hp).toBeCloseTo(boss.maxHp * 0.54, 6);
    expect(boss.enraged).toBe(false);
    expect(rages).toHaveLength(0);
    // 53% -> 47%: the bite is what takes it under half, and the rage comes on once, as it does for an ordinary hit.
    boss.hp = boss.maxHp * 0.53;
    shoot(sim, u);
    expect(boss.hp).toBeLessThan(boss.maxHp * 0.5);
    expect(boss.enraged).toBe(true);
    expect(rages).toHaveLength(1);
    // The elite of the first act (the cucumber with the rage ability) feels the same: its speed follows its health.
    const elite = specialArena(4);
    expect(elite.boss.id).toBe('boss_cucumber');
    expect(elite.boss.spec.ability).toBe('enrage');
    const v = gunner(elite.sim);
    elite.boss.hp = elite.boss.maxHp * 0.52;
    shoot(elite.sim, v);
    expect(elite.boss.enraged).toBe(true);
  });

  it('keeps its pool through a revive: the revive cuts the current health by its own share, the pool is still 12% in all', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const max = boss.maxHp;
    shoot(sim, u);
    // The limit runs out; the run is revived, which takes 35% off what is left of the boss.
    sim.waveClock = sim.waveDuration + 3;
    advance(sim, TICK * 2);
    expect(sim.phase).toBe('lost');
    expect(sim.revive()).toBeNull();
    expect(boss.hp).toBeCloseTo(max * 0.94 * 0.65, 6);
    expect(boss.bountyTaken).toBeCloseTo(max * 0.06, 6);
    shoot(sim, u);
    expect(boss.hp).toBeCloseTo(max * 0.94 * 0.65 - max * 0.06, 6);
    expect(boss.bountyTaken).toBe(MAX_POOL * max);
    expect(wanted.ready(sim, u)).toBe(false);
  });

  it('does not feed the boss bar: its firepower figure and so its estimated time to kill do not jump', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const window = new DamageWindow();
    window.reset(sim.time);
    sim.events.on('hit', ({ amount }) => window.record(sim.time, amount));
    boss.capTokens = Infinity;
    for (let i = 0; i < 4 * 60; i++) {
      if (i % 12 === 0) damageEnemy(sim, boss, 20, 'magic', null, false, null);
      sim.step(TICK);
    }
    const rate = window.rate(sim.time);
    expect(rate).toBeGreaterThan(0);
    const remaining = boss.hp + boss.shield;
    const estimate = window.estimate(sim.time, remaining);
    shoot(sim, u);
    // The firepower is untouched; the estimate only falls by the time the bitten health was worth, no more.
    expect(window.rate(sim.time)).toBe(rate);
    const after = window.estimate(sim.time, boss.hp + boss.shield);
    expect(after).toBeCloseTo(estimate - (boss.maxHp * 0.06) / rate, 6);
  });
});

// ───────────────────────────── the pool, shared ─────────────────────────────

describe('the pool of 12% per target, shared by every gunner', () => {
  it('lets three gunners in the same tick bite twice in cell order, and the third is left full', () => {
    const { sim, boss } = specialArena(8);
    const a = gunner(sim, 0);
    const b = gunner(sim, 1);
    const c = gunner(sim, 5);
    for (const u of [a, b, c]) expect(inReach(u, boss)).toBe(true);
    const bites = record(sim, 'bite');
    const casts = record(sim, 'spCast');
    sim.step(TICK);
    expect(bites.map((x) => x.unit)).toEqual([a, b]);
    expect(casts.map((x) => x.unit)).toEqual([a, b]);
    expect(bites.map((x) => x.taken)).toEqual([0.06, 0.12]);
    expect(boss.bountyTaken).toBe(MAX_POOL * boss.maxHp);
    expect(a.sp).toBe(0);
    expect(b.sp).toBe(0);
    expect(c.sp).toBe(1);
    // Later ticks: the third keeps waiting full and bites nothing.
    advance(sim, 1);
    expect(bites).toHaveLength(2);
    expect(c.sp).toBe(1);
  });

  it('keeps what a gunner took when it is sold: nobody can take the 12% a second time', () => {
    const { sim, boss } = specialArena(8);
    const a = gunner(sim, 0);
    const b = gunner(sim, 1);
    b.sp = 0;
    fire(sim, a);
    expect(boss.bountyTaken).toBeCloseTo(boss.maxHp * 0.06, 6);
    expect(sim.sell(0)).toBeNull();
    fire(sim, b);
    expect(boss.bountyTaken).toBe(MAX_POOL * boss.maxHp);
    const fresh = put(sim, 6, 'r_gunner', 0);
    fresh.sp = 1;
    advance(sim, 2);
    expect(fresh.sp).toBe(1);
    expect(boss.hp).toBeGreaterThan(boss.maxHp * 0.7);
  });

  it('keeps one pool per target, and a gunner with no pool left on the target shoots a plain enemy instead (the target has come out)', () => {
    const { sim, boss } = specialArena(8);
    const a = gunner(sim, 0);
    const b = gunner(sim, 1);
    const c = gunner(sim, 5);
    const plain = stand(sim, 'cucumber', 200, 10_000);
    const casts = record(sim, 'spCast');
    const hits = record(sim, 'hit');
    sim.step(TICK);
    expect(casts.map((x) => x.unit)).toEqual([a, b, c]);
    expect(casts.map((x) => (x.skill === 'wanted' ? x.data.mode : ''))).toEqual(['bite', 'bite', 'small']);
    // The small shot is an ordinary hit on the plain enemy: 20% of its health, no crit.
    const small = hits.filter((h) => h.enemy === plain);
    expect(small).toHaveLength(1);
    expect(small[0]?.amount).toBeCloseTo(2000, 6);
    expect(small[0]?.crit).toBe(false);
    expect(boss.bountyTaken).toBe(MAX_POOL * boss.maxHp);
    expect(plain.bountyTaken).toBe(0);
  });

  it('keeps a pool for every elite or boss on the field: two targets give 12% each', () => {
    const sim = plainArena(5);
    const a = gunner(sim, 0);
    const b = gunner(sim, 1);
    const c = gunner(sim, 2);
    const d = gunner(sim, 3);
    const x = stand(sim, 'spray', 150, 5000);
    const y = stand(sim, 'firecracker', 100, 7000);
    for (const u of [a, b, c, d]) {
      expect(inReach(u, x)).toBe(true);
      expect(inReach(u, y)).toBe(true);
    }
    const bites = record(sim, 'bite');
    sim.step(TICK);
    // The farther along is bitten first (skill order), twice per target by the four gunners.
    expect(bites.map((e) => e.enemy)).toEqual([x, x, y, y]);
    expect(x.bountyTaken).toBe(MAX_POOL * 5000);
    expect(y.bountyTaken).toBe(MAX_POOL * 7000);
  });
});

// ───────────────────────────── the choice of target ─────────────────────────────

describe('who it shoots at', () => {
  it('bites the elite or boss the laser holds first, then the one farthest along, then the lower uid', () => {
    const sim = plainArena(5);
    const u = gunner(sim);
    const near = stand(sim, 'spray', 150, 5000);
    const far = stand(sim, 'firecracker', 300, 5000);
    const bites = record(sim, 'bite');
    shoot(sim, u);
    expect(bites[0]?.enemy).toBe(far);
    near.focused = true;
    shoot(sim, u);
    expect(bites[1]?.enemy).toBe(near);
    // Equal progress: the lower uid.
    near.focused = false;
    far.travelled = near.travelled;
    shoot(sim, u);
    expect(bites[2]?.enemy).toBe(near);
  });

  it('bites what is in its reach and waits for what is not: an elite out of reach is not bitten and is not walked to', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim, 0);
    place(boss, FAR);
    expect(inReach(u, boss)).toBe(false);
    expect(wanted.ready(sim, u)).toBe(false);
    expect(wanted.cast(sim, u)).toBe(false);
    place(boss, 100);
    expect(wanted.ready(sim, u)).toBe(true);
  });

  it('shoots the plain enemy with the most CURRENT health in reach for the small shot, the laser\'s dot first, then farthest along, then lower uid', () => {
    const sim = plainArena(5);
    const u = gunner(sim);
    const hits = record(sim, 'hit');
    const roomba = stand(sim, 'roomba', 100, 1000);
    roomba.maxHp = 5000;
    const wounded = stand(sim, 'roomba', 120, 5000);
    wounded.hp = 400;
    const cucumber = stand(sim, 'cucumber', 140, 700);
    const out = stand(sim, 'tangerine', FAR, 1e6);
    expect(inReach(u, out)).toBe(false);
    shoot(sim, u);
    // 20% of 1000, the armour (0.35) skipped.
    expect(hits).toHaveLength(1);
    expect(hits[0]?.enemy).toBe(roomba);
    expect(hits[0]?.amount).toBeCloseTo(200, 9);
    expect(roomba.hp).toBeCloseTo(800, 9);
    // The tie goes to the one farther along, then to the lower uid.
    const a = stand(sim, 'cucumber', 150, 900);
    const b = stand(sim, 'cucumber', 160, 900);
    roomba.hp = 100;
    shoot(sim, u);
    expect(hits[1]?.enemy).toBe(b);
    a.hp = 900;
    b.hp = 900;
    a.travelled = b.travelled;
    shoot(sim, u);
    expect(hits[2]?.enemy).toBe(a);
    // The laser's dot beats the health: 20% of 700, times the laser's +15%.
    cucumber.focused = true;
    shoot(sim, u);
    expect(hits[3]?.enemy).toBe(cucumber);
    expect(hits[3]?.amount).toBeCloseTo(700 * 0.2 * 1.15, 9);
  });
});

// ───────────────────────────── the small shot ─────────────────────────────

describe('the small shot when there is no elite or boss', () => {
  it('takes 20% of the current health of the sturdiest plain enemy, ignoring armour and ward, and nothing else', () => {
    const sim = plainArena(5);
    const u = gunner(sim);
    const roomba = stand(sim, 'roomba', 100, 1000);
    const orange = stand(sim, 'tangerine', 130, 800);
    const hits = record(sim, 'hit');
    const casts = record(sim, 'spCast');
    const bites = record(sim, 'bite');
    // The control: a plain hit of the same size is cut by armour.
    damageEnemy(sim, roomba, 200, 'physical', u, false, null);
    expect(hits[0]?.amount).toBeCloseTo(130, 9);
    roomba.hp = 1000;
    hits.length = 0;
    shoot(sim, u);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ enemy: roomba, crit: false, type: 'physical', unitId: 'r_gunner', killed: false });
    expect(hits[0]?.amount).toBeCloseTo(200, 9);
    expect(orange.hp).toBe(800);
    expect(bites).toHaveLength(0);
    const cast = casts[0];
    if (!cast || cast.skill !== 'wanted') throw new Error('no wanted cast');
    expect(cast.data).toMatchObject({ mode: 'small', targetUid: roomba.uid, share: 0.2, taken: 0, pool: 0, closed: false });
    expect(cast.data.amount).toBeCloseTo(200, 9);
    expect(roomba.bountyTaken).toBe(0);
  });

  it('rolls no crit and draws no random number, and a fifth of what is left, even doubled by the vulnerability cap, never kills', () => {
    const sim = plainArena(5);
    const u = gunner(sim);
    const e = stand(sim, 'cucumber', 100, 1000);
    e.hp = 5;
    const states = sim.rng.states().join(',');
    const log = tape(sim, ['hit', 'enemyDie']);
    shoot(sim, u);
    expect(e.hp).toBeCloseTo(4, 9);
    // Marked as vulnerable beyond the cap (x2) it takes 40% of what is left, no more.
    applyStatus(sim, e, 'vulnerable', 5, 10, null);
    shoot(sim, u);
    expect(e.hp).toBeCloseTo(4 * 0.6, 9);
    expect(e.dead).toBe(false);
    expect(log.map((x) => x.type)).toEqual(['hit', 'hit']);
    expect(log.map((x) => (x.payload as BattleEvents['hit']).crit)).toEqual([false, false]);
    expect(sim.rng.states().join(',')).toBe(states);
  });

  it('leaves no pool on a plain enemy, however sturdy: no bite is ever taken from it', () => {
    const sim = plainArena(5);
    const u = gunner(sim);
    const big = stand(sim, 'roomba', 100, 1e6);
    const bites = record(sim, 'bite');
    shoot(sim, u);
    expect(bites).toHaveLength(0);
    expect(big.bountyTaken).toBe(0);
    expect(big.hp).toBeCloseTo(1e6 * 0.8, 3);
  });

  it('waits for the target to come into reach instead of firing the small shot, and goes back to it when the pool is empty or the target is dead', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim, 0);
    const plain = stand(sim, 'cucumber', 300, 1000);
    place(boss, FAR);
    expect(inReach(u, boss)).toBe(false);
    expect(inReach(u, plain)).toBe(true);
    // An elite or boss with a pool is on the road, out of reach: the gauge waits full.
    expect(wanted.ready(sim, u)).toBe(false);
    fire(sim, u);
    advance(sim, 1);
    expect(u.sp).toBe(1);
    expect(plain.hp).toBe(1000);
    // It walks into reach: the bite, not the small shot.
    place(boss, 150);
    const bites = record(sim, 'bite');
    advance(sim, 0.25);
    expect(bites).toHaveLength(1);
    expect(plain.hp).toBe(1000);
    // The pool empty (and out of reach again): the small shot is back.
    boss.bountyTaken = MAX_POOL * boss.maxHp;
    place(boss, FAR);
    u.sp = 1;
    u.spCheckAt = 0;
    expect(wanted.ready(sim, u)).toBe(true);
    sim.step(TICK);
    expect(plain.hp).toBeCloseTo(800, 9);
    // And a dead target is no reason to wait.
    boss.bountyTaken = 0;
    expect(wanted.ready(sim, u)).toBe(false);
    slay(sim, boss);
    expect(wanted.ready(sim, u)).toBe(true);
  });
});

// ───────────────────────────── holding fire ─────────────────────────────

describe('holding fire in the wave before an elite or a boss', () => {
  /** Whether the rule holds the gunners in `wave` of a battle, for an ordinary wave, and in an elite / boss wave before / after the target. */
  function hold(sim: Sim, wave: number, spawned = false): boolean {
    sim.wave = wave;
    sim.waveKind = sim.scriptOf(wave).kind;
    sim.bossSpawned = spawned;
    return holdingFire(sim);
  }

  it('holds in chapters in the waves 3, 7, 11, 15, 19 and 23, and in the elite and boss waves until the target is out', () => {
    const sim = newSim();
    const holding: number[] = [];
    const holdingPre: number[] = [];
    for (let wave = 1; wave <= 24; wave++) {
      if (hold(sim, wave)) holding.push(wave);
      if (sim.scriptOf(wave).kind !== 'normal') holdingPre.push(wave);
      if (sim.scriptOf(wave).kind !== 'normal') expect(hold(sim, wave, true), `wave ${wave} after the target came out`).toBe(false);
    }
    expect(holding).toEqual([3, 4, 7, 8, 11, 12, 15, 16, 19, 20, 23, 24]);
    expect(holdingPre).toEqual([4, 8, 12, 16, 20, 24]);
    // The last wave has no next one.
    expect(hold(sim, 24, true)).toBe(false);
  });

  it('holds in the daily challenge\'s 16 waves, the tutorial\'s 8, and the endless mode\'s repeating stages', () => {
    const daily = newSim({ mode: 'daily' });
    expect([...Array(16).keys()].map((i) => i + 1).filter((w) => hold(daily, w))).toEqual([3, 4, 7, 8, 11, 12, 15, 16]);
    expect(hold(daily, 16, true)).toBe(false);

    const tutorial = newSim({ mode: 'tutorial' });
    expect([...Array(8).keys()].map((i) => i + 1).filter((w) => hold(tutorial, w))).toEqual([3, 4, 7, 8]);
    expect(hold(tutorial, 8, true)).toBe(false);

    const endless = newSim({ mode: 'endless' });
    const waves = [...Array(64).keys()].map((i) => i + 1);
    expect(waves.filter((w) => hold(endless, w))).toEqual(waves.filter((w) => [3, 4, 7, 0].includes(w % 8)));
    // Past the 24th wave it still looks one wave ahead: 27 holds (28 is an elite), 25 does not, and a boss that is out is not held.
    expect(hold(endless, 27)).toBe(true);
    expect(hold(endless, 24, true)).toBe(false);
    expect(hold(endless, 25)).toBe(false);
    expect(hold(endless, 32, true)).toBe(false);
    expect(hold(endless, 32, false)).toBe(true);
    expect(hold(endless, 56, false)).toBe(true);
  });

  it('holds in the gold dungeon in wave 7 and in wave 8 until the chest has walked in, and in no other wave (its fourth wave is no elite)', () => {
    const gold = newSim({ mode: 'gold' });
    const waves = [...Array(8).keys()].map((i) => i + 1);
    expect(waves.filter((w) => hold(gold, w))).toEqual([7, 8]);
    expect(hold(gold, 8, true)).toBe(false);
    // The script past its end answers "boss" (it is clamped); the last wave of a run must not read that as a next wave.
    expect(gold.scriptOf(9).kind).toBe('boss');
    gold.wave = 8;
    gold.waveKind = 'normal';
    expect(holdingFire(gold)).toBe(false);
  });

  it('agrees with the real wave start in every mode: right after `startWave`, and one second later when the elite or boss has come out', () => {
    const plan: Array<[mode: BattleInit['mode'], waves: number, special: number[]]> = [
      ['chapter', 24, [4, 8, 12, 16, 20, 24]],
      ['daily', 16, [4, 8, 12, 16]],
      ['tutorial', 8, [4, 8]],
      ['gold', 8, [8]],
      ['endless', 40, [4, 8, 12, 16, 20, 24, 28, 32, 36, 40]],
    ];
    for (const [mode, waves, special] of plan) {
      const sim = newSim({ mode });
      for (let wave = 1; wave <= waves; wave++) {
        startWave(sim, wave);
        sim.spawnIds.length = 0;
        sim.spawnTimes.length = 0;
        sim.spawnIdx = 0;
        const isSpecial = special.includes(wave);
        expect(holdingFire(sim), `${mode} wave ${wave}`).toBe(isSpecial || special.includes(wave + 1));
        if (!isSpecial) continue;
        advance(sim, 1.05);
        expect(sim.bossSpawned, `${mode} wave ${wave}: the target has come out`).toBe(true);
        expect(holdingFire(sim), `${mode} wave ${wave} once the target is out`).toBe(false);
      }
    }
  });

  it('asks the script for the next wave once per wave and battle, not at every look of every waiting gunner (past wave 24 and in the gold dungeon the script is a fresh object each time)', () => {
    const endless = newSim({ mode: 'endless' });
    const gold = newSim({ mode: 'gold' });
    for (const sim of [endless, gold]) sim.waveKind = 'normal';
    endless.wave = 31;
    gold.wave = 7;
    const asked = [vi.spyOn(endless, 'scriptOf'), vi.spyOn(gold, 'scriptOf')];
    for (let i = 0; i < 100; i++) {
      expect(holdingFire(endless)).toBe(true);
      expect(holdingFire(gold)).toBe(true);
    }
    expect(asked[0]).toHaveBeenCalledTimes(1);
    expect(asked[1]).toHaveBeenCalledTimes(1);
    // A new wave asks again, and each battle keeps its own answer.
    endless.wave = 30;
    for (let i = 0; i < 100; i++) {
      expect(holdingFire(endless)).toBe(false);
      expect(holdingFire(gold)).toBe(true);
    }
    expect(asked[0]).toHaveBeenCalledTimes(2);
    expect(asked[1]).toHaveBeenCalledTimes(1);
    // The answer is the script's: the same as asking it directly, for every wave of an endless run.
    for (let wave = 25; wave <= 120; wave++) {
      endless.wave = wave;
      endless.waveKind = 'normal';
      expect(holdingFire(endless), `wave ${wave}`).toBe(endless.scriptOf(wave + 1).kind !== 'normal');
    }
  });

  it('holds when the cell says so and not when it does not', () => {
    const sim = newSim();
    expect(hold(sim, 3)).toBe(true);
    ROW.hold = 'none';
    restores.push(() => { ROW.hold = 'nextWaveSpecial'; });
    expect(hold(sim, 3)).toBe(false);
    expect(hold(sim, 4)).toBe(false);
  });

  it('keeps the gauge full and casts nothing at plain enemies through the wave before the elite and the second before it comes out, then bites the instant it can', () => {
    const sim = newSim();
    sim.events.on('waveStart', () => {
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      sim.spawnIdx = 0;
    });
    advance(sim, 3.05);
    startWave(sim, 3);
    const u = put(sim, 0, 'r_gunner', 0);
    u.sp = 0.9;
    const plain = stand(sim, 'cucumber', 250, 1e9);
    const log = tape(sim, ['spCast', 'bite', 'hit', 'enemySpawn', 'waveStart']);
    const cast = record(sim, 'spCast');
    // The rest of wave 3 (15 s) and the second of wave 4 before the elite walks in.
    const start = sim.time;
    advance(sim, 15 - 0.1);
    expect(sim.wave).toBe(3);
    expect(u.sp).toBe(1);
    advance(sim, 0.1 + 0.9);
    expect(sim.wave).toBe(4);
    expect(sim.bossSpawned).toBe(false);
    expect(u.sp).toBe(1);
    expect(cast).toHaveLength(0);
    // The elite comes out and the next look finds it within a fifth of a second.
    advance(sim, 0.35);
    expect(sim.bossSpawned).toBe(true);
    const spawned = log.find((x) => x.type === 'enemySpawn' && ((x.payload as BattleEvents['enemySpawn']).enemy as SimEnemy).isElite);
    const bite = log.find((x) => x.type === 'bite');
    expect(spawned).toBeDefined();
    expect(bite).toBeDefined();
    expect((bite?.time ?? 0) - (spawned?.time ?? 0)).toBeGreaterThanOrEqual(0);
    expect((bite?.time ?? 0) - (spawned?.time ?? 0)).toBeLessThan(0.25);
    expect(cast).toHaveLength(1);
    expect(cast[0]?.skill === 'wanted' && cast[0].data.mode).toBe('bite');
    expect(sim.time - start).toBeGreaterThan(16);
    // (The gunner's ordinary shots do hit the plain enemy; a small shot would have taken a fifth of it.)
    expect(plain.hp).toBeGreaterThan(1e9 - 1e6);
  });

  it('fires the small shot in the wave after the elite and in every wave that is not the one before an elite or boss', () => {
    for (const wave of [1, 2, 5, 6, 9, 10, 13, 14]) {
      const sim = plainArena(wave);
      const u = gunner(sim);
      const plain = stand(sim, 'cucumber', 200, 1000);
      advance(sim, TICK * 14);
      expect(holdingFire(sim), `wave ${wave}`).toBe(false);
      expect(u.sp, `wave ${wave}`).toBeLessThan(1);
      expect(plain.hp, `wave ${wave}`).toBeCloseTo(800, 9);
    }
    // And the held waves do not: the same board in wave 7 casts nothing.
    const held = plainArena(7);
    const g = gunner(held);
    const target = stand(held, 'cucumber', 200, 1000);
    advance(held, 2);
    expect(g.sp).toBe(1);
    expect(target.hp).toBe(1000);
  });

  it('holds before the gold dungeon\'s chest through wave 7 and the second before it walks in, then bites it', () => {
    const sim = newSim({ mode: 'gold' });
    sim.events.on('waveStart', () => {
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      sim.spawnIdx = 0;
    });
    advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
    sim.pickRelic(0);
    advance(sim, 1.0 + 15 * 2 + 0.1);
    expect(sim.wave).toBe(7);
    const u = put(sim, 0, 'r_gunner', 0);
    u.sp = 1;
    const coin = stand(sim, 'coin', 250, 1e9);
    const casts = record(sim, 'spCast');
    advance(sim, 15 - 0.1 + 0.9);
    expect(sim.wave).toBe(8);
    expect(sim.bossSpawned).toBe(false);
    expect(casts).toHaveLength(0);
    expect(coin.hp).toBeGreaterThan(1e9 - 1e6);
    advance(sim, 0.4);
    expect(sim.bossSpawned).toBe(true);
    expect(casts).toHaveLength(1);
    const cast = casts[0];
    expect(cast?.skill === 'wanted' && cast.data.mode).toBe('bite');
    expect(cast?.skill === 'wanted' && cast.data.targetUid).toBe(sim.boss?.uid);
  });
});

// ───────────────────────────── the gold dungeon's chest ─────────────────────────────

describe('the gold dungeon\'s chest', () => {
  function chestRun(chapter = 1): Sim {
    const sim = newSim({ mode: 'gold', chapter });
    sim.events.on('waveStart', () => {
      sim.spawnIds.length = 0;
      sim.spawnTimes.length = 0;
      sim.spawnIdx = 0;
    });
    advance(sim, 3.05 + 15 * 4 + CLEAR_DELAY + 0.1);
    sim.pickRelic(0);
    advance(sim, 1.0 + 15 * 3 + 1.05);
    const chest = sim.boss as SimEnemy;
    chest.frozen = true;
    return sim;
  }

  it('is bitten like any boss: 6% of 600 times the tier\'s health multiple, 12% in all (42 to 59, and 85 to 118)', () => {
    let low = 0;
    let high = 0;
    for (let chapter = 1; chapter <= 5; chapter++) {
      const sim = chestRun(chapter);
      const chest = sim.boss as SimEnemy;
      expect(chest.id).toBe('boss_treasure');
      const max = GOLD_DUNGEON_BOSS_HP * (CHAPTER_HP_MULT[chapter - 1] as number);
      expect(chest.maxHp).toBeCloseTo(max, 6);
      const u = gunner(sim);
      shoot(sim, u);
      expect(chest.maxHp - chest.hp).toBeCloseTo(max * 0.06, 6);
      if (chapter === 1) low = max * 0.06;
      if (chapter === 5) high = max * 0.06;
      shoot(sim, u);
      expect(chest.bountyTaken).toBeCloseTo(max * 0.12, 6);
      expect(wanted.ready(sim, u)).toBe(false);
    }
    expect(Math.round(low)).toBe(42);
    expect(Math.round(high)).toBe(59);
  });

  it('never rages, and a bite that takes it past a share of its health still spills the coins, once', () => {
    const sim = chestRun();
    const chest = sim.boss as SimEnemy;
    const u = gunner(sim);
    const rages = record(sim, 'enrage');
    const abilities = record(sim, 'bossAbility');
    const spawns = record(sim, 'enemySpawn');
    chest.hp = chest.maxHp * 0.77;
    shoot(sim, u);
    expect(chest.hp).toBeLessThan(chest.maxHp * 0.75);
    advance(sim, 0.1);
    expect(abilities.filter((a) => a.ability === 'spill')).toHaveLength(1);
    expect(spawns.filter((s) => s.enemy.id === 'coin')).toHaveLength(3);
    chest.hp = chest.maxHp * 0.53;
    shoot(sim, u);
    expect(chest.hp).toBeLessThan(chest.maxHp * 0.5);
    advance(sim, 0.1);
    expect(spawns.filter((s) => s.enemy.id === 'coin')).toHaveLength(6);
    expect(rages).toHaveLength(0);
    expect(chest.enraged).toBe(false);
  });
});

// ───────────────────────────── the cast: when, how often, what it tells ─────────────────────────────

describe('through the gauge', () => {
  it('casts once a full gauge finds a target in reach, the gauge goes back to 0, and the first cast is marked once', () => {
    const { sim, boss } = specialArena(8);
    const u = gunner(sim);
    const casts = record(sim, 'spCast');
    fire(sim, u);
    expect(casts).toHaveLength(1);
    expect(casts[0]?.first).toBe(true);
    // The scene is anchored at the cat's tile; the target's place is in the data.
    expect(casts[0]?.x).toBe(cellCenterX(0));
    expect(casts[0]?.y).toBe(cellCenterY(0));
    expect(u.sp).toBe(0);
    expect(boss.bountyTaken).toBeCloseTo(boss.maxHp * 0.06, 6);
    fire(sim, u);
    expect(casts).toHaveLength(2);
    expect(casts[1]?.first).toBe(false);
    // The small shot is the same skill: still not the first.
    const plain = plainArena(5);
    const v = gunner(plain);
    stand(plain, 'cucumber', 200, 1000);
    const smalls = record(plain, 'spCast');
    fire(plain, v);
    expect(smalls[0]?.first).toBe(true);
  });

  it('does nothing with `sp: false`: the gauge does not move and the elite is untouched', () => {
    const { sim, boss } = specialArena(8, { sp: false });
    const u = gunner(sim);
    u.sp = 1;
    const bites = record(sim, 'bite');
    advance(sim, 3);
    expect(bites).toHaveLength(0);
    expect(boss.bountyTaken).toBe(0);
    expect(u.sp).toBe(1);
  });

  it('plays out the same whether or not anything listens to its events', () => {
    const run = (listen: boolean): string => {
      const { sim, boss } = specialArena(8);
      const u = gunner(sim, 0);
      gunner(sim, 1);
      stand(sim, 'cucumber', 250, 4000);
      if (listen) tape(sim, ['spCast', 'bite', 'hit']);
      u.sp = 1;
      advance(sim, 3);
      return JSON.stringify([boss.hp, boss.bountyTaken, boss.capTokens, sim.enemies.map((e) => [e.hp, e.bountyTaken]), sim.rng.states()]);
    };
    expect(run(true)).toBe(run(false));
  });

  it('is the same twice: the same seed gives the same bites at the same moments', () => {
    const run = (): string => {
      const sim = newSim({ seed: 99 });
      sim.events.on('waveStart', () => {
        sim.spawnIds.length = 0;
        sim.spawnTimes.length = 0;
        sim.spawnIdx = 0;
      });
      advance(sim, 3.05);
      startWave(sim, 3);
      const a = put(sim, 0, 'r_gunner', 0);
      const b = put(sim, 4, 'r_gunner', 0);
      a.sp = 0.7;
      b.sp = 0.2;
      stand(sim, 'cucumber', 250, 1e9);
      const log = tape(sim, ['spCast', 'bite', 'hit']);
      advance(sim, 15 + 1 + 24 + 12);
      return JSON.stringify(log.map((x) => [x.type, Math.round(x.time * 1000), JSON.stringify(x.payload, (_k, v) => (typeof v === 'object' && v !== null && 'uid' in v ? `${v.uid}:${v.id}` : v))]));
    };
    const first = run();
    expect(first.length).toBeGreaterThan(20);
    expect(run()).toBe(first);
  });
});

describe('in whole runs', () => {
  it('bites in a real bot run with two gunners on the board, and the run is the same twice', () => {
    let bites = 0;
    const play = (seed: number): { hash: string; end: string; bites: number } => {
      let count = 0;
      const p = fingerprintRun(initOf({ seed }, 3), 'synergy', {
        setup: (s) => {
          put(s, 0, 'r_gunner');
          put(s, 4, 'r_gunner');
          s.events.on('bite', () => {
            count++;
          });
        },
      });
      return { hash: p.hash, end: p.end, bites: count };
    };
    for (const seed of [11, 12, 13]) {
      const one = play(seed);
      const two = play(seed);
      expect(two).toEqual(one);
      bites += one.bites;
    }
    expect(bites).toBeGreaterThan(0);
  });

  it('keeps the boss from melting: bites alone can never take more than 12% of any elite or boss in a whole run', () => {
    let worst = 0;
    for (const seed of [21, 22, 23]) {
      const sim = newSim({ seed }, 3);
      const taken = new Map<number, number>();
      sim.events.on('bite', ({ enemy, share }) => taken.set(enemy.uid, (taken.get(enemy.uid) ?? 0) + share));
      put(sim, 0, 'r_gunner');
      put(sim, 1, 'r_gunner');
      put(sim, 5, 'r_gunner');
      put(sim, 6, 'r_gunner');
      advance(sim, 3.05);
      for (let wave = 4; wave <= 8; wave += 4) {
        startWave(sim, wave);
        advance(sim, 40);
      }
      for (const v of taken.values()) worst = Math.max(worst, v);
    }
    expect(worst).toBeGreaterThan(0.05);
    expect(worst).toBeLessThanOrEqual(MAX_POOL + 1e-9);
  });

  it('knows an elite or boss by its trait only: the plain enemies carry no pool', () => {
    for (const id of ['cucumber', 'roomba', 'coin'] as const) expect(enemySpec(id).traits.includes('boss') || enemySpec(id).traits.includes('elite')).toBe(false);
    for (const id of ['boss_cucumber', 'boss_vacuum', 'boss_treasure', 'spray', 'firecracker'] as const) {
      const t = enemySpec(id).traits;
      expect(t.includes('boss') || t.includes('elite'), id).toBe(true);
    }
  });
});
