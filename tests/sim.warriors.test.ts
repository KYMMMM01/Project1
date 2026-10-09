import { describe, expect, it } from 'vitest';
import { CLASS_IDS, type EnemyId, type UnitId } from '@/game/api';
import { RECOMMENDED_LEVEL } from '@/game/data/balance';
import { enemySpec } from '@/game/data/enemies';
import { UNIT_GRID, unitClass } from '@/game/data/roster';
import type { AttackSpec } from '@/game/data/types';
import { unitSpec } from '@/game/data/units';
import { CELL_COUNT, cellCenterX, cellCenterY, isEdgeCell, pathPoint } from '@/game/geometry';
import { createBot, worksWalkway } from '@/game/sim/bots';
import { playRun } from '@/game/sim/runner';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave, record } from './simHelpers';

const WARRIORS = UNIT_GRID.warrior;
/** A wave of 24 cucumbers walks out over 9 s at 70 px/s: one enemy every ~26 px of walkway. */
const FILE_GAP = 26;
/** The eight cells around the middle of the 5 x 5 board (the middle cell itself is 285 px from every stretch of the walkway). */
const INNER_CELLS = [6, 7, 8, 11, 13, 16, 17, 18];

/** Enemies of that dense file one swing of the cat can hurt. */
function swingHits(attack: AttackSpec): number {
  switch (attack.shape) {
    case 'cleave': return Math.min(attack.targets, 1 + Math.floor((2 * attack.radius) / FILE_GAP));
    case 'line': return 1 + Math.floor((2 * attack.reach) / FILE_GAP);
    case 'blast': return 1 + Math.floor((2 * attack.radius) / FILE_GAP);
    default: return 1;
  }
}

/** A frozen enemy standing at a chosen spot. */
function at(sim: Sim, id: EnemyId, x: number, y: number, hp = 1e9, travelled = 100): SimEnemy {
  const e = foe(sim, id, travelled, hp);
  e.frozen = true;
  e.x = x;
  e.y = y;
  return e;
}

describe('the warrior line', () => {
  it('reaches farther, hits harder and out-works the cat before it on every step', () => {
    let previous = null as UnitId | null;
    for (const id of WARRIORS) {
      const now = unitSpec(id);
      if (previous) {
        const before = unitSpec(previous);
        expect(now.base.range, `${id} range`).toBeGreaterThan(before.base.range);
        // v1.4 trimmed the samurai's hit to 130 (the viking hits for 135 but swings more slowly): each step still out-works the last one.
        expect(now.base.damage / now.base.interval, `${id} damage per second on one target`).toBeGreaterThan(before.base.damage / before.base.interval);
        const power = (u: typeof now): number => (u.base.damage * swingHits(u.attack)) / u.base.interval;
        expect(power(now), `${id} damage per second against a dense file`).toBeGreaterThan(power(before) * 1.5);
        expect(swingHits(now.attack), `${id} targets`).toBeGreaterThanOrEqual(Math.min(2, swingHits(before.attack)));
      }
      previous = id;
    }
  });

  it('reaches farther than the other classes\' commons and the old 165-220 px, and the top two work from the inner block', () => {
    for (const id of WARRIORS) expect(unitSpec(id).base.range, id).toBeGreaterThan(195);
    for (const cell of INNER_CELLS) {
      expect(worksWalkway(unitSpec('w_samurai').base.range, cell), `samurai in ${cell}`).toBe(true);
      expect(worksWalkway(unitSpec('w_tiger').base.range, cell), `tiger in ${cell}`).toBe(true);
      expect(worksWalkway(unitSpec('w_paw').base.range, cell), `paw in ${cell}`).toBe(false);
    }
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (isEdgeCell(cell)) for (const id of WARRIORS) expect(worksWalkway(unitSpec(id).base.range, cell), `${id} in ${cell}`).toBe(true);
    }
  });

  it('lets the tiger hit the walkway from the middle of the board where a paw cannot', () => {
    const sim = newSim();
    quietWave(sim);
    put(sim, 12, 'w_tiger');
    put(sim, 11, 'w_paw');
    const top = pathPoint(279);
    const radius = enemySpec('cucumber').radius;
    const gapTiger = Math.hypot(top.x - cellCenterX(12), top.y - cellCenterY(12));
    expect(gapTiger).toBeLessThan(unitSpec('w_tiger').base.range + radius);
    expect(Math.hypot(top.x - cellCenterX(11), top.y - cellCenterY(11))).toBeGreaterThan(unitSpec('w_paw').base.range + radius);
    at(sim, 'cucumber', top.x, top.y);
    const attacks = record(sim, 'attack');
    advance(sim, 2);
    expect(attacks.length).toBeGreaterThan(0);
    expect(attacks.every((a) => a.unit.id === 'w_tiger')).toBe(true);
  });

  it('swings the axe at the target and its nearest neighbour only, breaking the armour of both', () => {
    const sim = newSim();
    quietWave(sim);
    put(sim, 0, 'w_viking');
    const spec = unitSpec('w_viking').attack;
    if (spec.shape !== 'cleave' || !spec.effect) throw new Error('the viking cleaves and breaks armour');
    const x = cellCenterX(0);
    const y = cellCenterY(0);
    const target = at(sim, 'roomba', x + 120, y, 1e9, 900);
    const neighbour = at(sim, 'roomba', x + 120 + spec.radius * 0.5, y, 1e9, 880);
    const spare = at(sim, 'roomba', x + 120 + spec.radius * 0.7, y + 5, 1e9, 860);
    const far = at(sim, 'roomba', x + 120 + spec.radius * 3, y, 1e9, 400);
    const hits = record(sim, 'hit');
    advance(sim, 1);
    expect(hits.map((h) => h.enemy.uid).sort()).toEqual([target.uid, neighbour.uid].sort());
    expect(target.armorBroken && neighbour.armorBroken).toBe(true);
    expect(target.breakAmount).toBeCloseTo(spec.effect.amount, 9);
    expect(spare.armorBroken || far.armorBroken).toBe(false);
  });

  it('adds the seventh-level target to the axe, one more neighbour per swing', () => {
    const sim = newSim({}, 7);
    quietWave(sim);
    put(sim, 0, 'w_viking');
    const x = cellCenterX(0);
    const y = cellCenterY(0);
    for (let i = 0; i < 5; i++) at(sim, 'cucumber', x + 110 + i * 20, y, 1e9, 900 - i * 10);
    const hits = record(sim, 'hit');
    advance(sim, 1);
    expect(hits).toHaveLength(3);
  });
});

describe('the balance bots with the longer arms', () => {
  it('keeps a short-armed warrior to the cells it can work from and leaves a long-armed one where it is', () => {
    const sim = newSim();
    quietWave(sim);
    sim.fish = 0;
    put(sim, 7, 'w_paw');
    put(sim, 0, 'r_sling');
    put(sim, 8, 'w_tiger');
    createBot('merge', 1).act(sim);
    expect(sim.units[7]?.id).not.toBe('w_paw');
    expect(sim.units[0]?.id === 'w_paw' || sim.units.some((u, cell) => u?.id === 'w_paw' && isEdgeCell(cell))).toBe(true);
    expect(sim.units[8]?.id).toBe('w_tiger');
  });

  it('pins the synergy bot to one class line and molts only into it', () => {
    for (const focus of CLASS_IDS) {
      const r = playRun(initOf({ seed: 4242 }), 'synergy', { focus, maxSeconds: 260 });
      const share = (c: string): number =>
        Object.entries(r.stats.damageByUnit).reduce((a, [id, v]) => a + (unitClass(id as UnitId) === c ? (v as number) : 0), 0);
      const total = Object.values(r.stats.damageByUnit).reduce((a, v) => a + (v as number), 0);
      // Tricksters are support: their own share is the smallest, and armoured bosses trim it further.
      expect(share(focus) / total, `${focus} share`).toBeGreaterThan(0.15);
    }
  });

  it('plays a pinned run the same way every time', () => {
    const run = () => playRun(initOf({ seed: 99 }), 'synergy', { focus: 'warrior', maxSeconds: 200 });
    const a = run();
    const b = run();
    expect(b.stats.damageByUnit).toEqual(a.stats.damageByUnit);
    expect(b.stats.merges).toBe(a.stats.merges);
  });
});

describe('the run tally behind the balance report', () => {
  const level = RECOMMENDED_LEVEL[0] as number;
  const result = playRun(initOf({ seed: 7 }, level), 'synergy', { tally: true, maxSeconds: 240 });

  it('counts board time, uptime within 0..1, and kills that add up to at most the run\'s kills', () => {
    const tallies = Object.values(result.units);
    expect(tallies.length).toBeGreaterThan(3);
    let kills = 0;
    for (const t of tallies) {
      expect(t.boardSec).toBeGreaterThan(0);
      expect(t.ceSec).toBeGreaterThanOrEqual(t.boardSec);
      expect(t.reachSec).toBeLessThanOrEqual(t.fieldSec + 1e-9);
      expect(t.fieldSec).toBeLessThanOrEqual(t.boardSec + 1e-9);
      expect(t.hits).toBeGreaterThanOrEqual(0);
      kills += t.kills;
    }
    expect(kills).toBeGreaterThan(0);
    expect(kills).toBeLessThanOrEqual(result.stats.kills);
  });

  it('counts how long the enemies were under each control effect', () => {
    const c = result.control;
    expect(c.enemySec).toBeGreaterThan(0);
    for (const v of [c.slowed, c.frozen, c.stunned, c.armorBroken]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(c.enemySec);
    }
  });

  it('leaves everything empty when no tally was asked for', () => {
    const plain = playRun(initOf({ seed: 7 }, level), 'synergy', { maxSeconds: 60 });
    expect(plain.units).toEqual({});
    expect(plain.control.enemySec).toBe(0);
  });

  it('does not change what the run does', () => {
    const plain = playRun(initOf({ seed: 7 }, level), 'synergy', { maxSeconds: 240 });
    expect(plain.stats.damageByUnit).toEqual(result.stats.damageByUnit);
  });
});
