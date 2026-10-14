/**
 * Surprise Clones (ninja, Alley Boss; docs/design_skills_v2.md 3.4 with 3.4.1 to 3.4.4, 4.4, 4.5): two pale clones stand on the nearest
 * empty tiles (stacked on the ninja's own tile when the board has none) and echo the ninja's volley, one shuriken each, four times.
 *
 * A clone is NOT a unit. It is a few numbers hung on its ninja (`SimUnit.clone`, the public `CloneState`), so nothing that walks the
 * board (summoning, merging, selling, synergies, auras, toys, the bots, the save) ever sees one, and no tile is ever taken by one.
 *
 *  - Seats, taken at the cast: the empty tiles nearest to the ninja's tile by distance between centres, ties to the lower tile number
 *    (`emptyCellsNear`), skipping a tile another ninja's clone already stands on. Fewer than two empty tiles: the clone that finds none is
 *    stacked on the ninja's tile (`CloneState.cell` -1) and goes where the ninja goes. A standing clone never moves by itself.
 *  - Stepping aside (`vacateSeat`): whenever a cat takes a tile (`placeUnit`: summon, twin, tunnel, gift, partner capsule; a cat or the
 *    ninja itself dropped on an empty tile) the clone standing there hops back to the ninja's tile and stays stacked. It keeps its throws.
 *  - Throws (`followVolley`, called at the end of the ninja's own volley in `combat.ts`): from `readyAt` (the cast plus `arrive`) on, every
 *    volley the ninja throws, each clone with a throw left throws ONE shuriken (`copyTargetsPerk` false: the level 7 extra star is not
 *    copied) at an enemy the volley is not on and no earlier clone of the volley is on (`spread`), chosen like the ninja chooses
 *    (the laser's dot first: an elite or boss in it, then the nearest to the dot; else the one that has travelled farthest, then the
 *    lower `uid`) among the enemies in the ninja's range measured from the CLONE's tile centre (the clone's own tile; the ninja's tile
 *    when stacked). Clones go in tile order, ties by index. With nobody to aim at the volley is not a throw: nothing is spent.
 *  - The shuriken is the ninja's own: its damage as of the throw, its crit and ricochet rolled at the landing like any shuriken of the
 *    ninja (same `combat` stream), the ninja credited with the damage and the kill. It leaves from the clone's tile centre (`launch` with
 *    `ghost` true) and is announced by `cloneThrow`, never by `attack`. A clone takes no cell bonus, aura or toy: it has no numbers of its
 *    own, it reads the ninja's.
 *  - A clone goes at its last throw ('done'), `maxLife` seconds after the cast ('timeout'), when its ninja casts again ('replaced'), is
 *    merged ('merged'), sold ('sold'), molted ('molted') or otherwise gone ('gone'), at the end of a stage ('stage') and of the battle
 *    ('end'). Each is one `cloneEnd`. The list of ninjas that have clones is `Sim.cloners`; `stepClones` (the skills' pass) is the safety net
 *    for a time-out and for a ninja that left the board by a path that did not call `endClones`.
 *  - Ready: at least `readyMinEnemies` enemies in the ninja's own range (the pass already holds a blocked ninja back).
 */
import type { CloneEndReason, CloneState, SpCloneSeat } from '../../api';
import { SP_ROWS } from '../../data/spSkills';
import { cellCenterX, cellCenterY } from '../../geometry';
import type { Sim } from '../sim';
import type { SimEnemy, SimProjectile, SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { emptyCellsNear, inRangeOf } from './near';
import { inReach } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.clones;
const EPS = 1e-9;

/** How the volley throws a clone's shuriken: `launch` in `combat.ts` (passed in so that this file does not import combat). */
export type ClonePitch = (s: Sim, u: SimUnit, target: SimEnemy, cell: number, ghost: boolean) => SimProjectile;

/** The tile a clone is on: its own, or its ninja's when it is stacked. */
function tileOf(u: SimUnit, c: CloneState): number {
  return c.cell >= 0 ? c.cell : u.cell;
}

function forget(s: Sim, u: SimUnit): void {
  const i = s.cloners.indexOf(u);
  if (i >= 0) s.cloners.splice(i, 1);
}

// ───────────────────────────── going ─────────────────────────────

function endClone(s: Sim, u: SimUnit, c: CloneState, reason: CloneEndReason): void {
  const i = u.clone.indexOf(c);
  if (i < 0) return;
  u.clone.splice(i, 1);
  if (u.clone.length === 0) forget(s, u);
  if (!s.ev.has('cloneEnd')) return;
  const tile = tileOf(u, c);
  s.ev.emit('cloneEnd', { unit: u, index: c.index, cell: c.cell, x: cellCenterX(tile), y: cellCenterY(tile), reason });
}

/** Sends every clone of the ninja away (index order), one `cloneEnd` each. Nothing happens for a cat that has none. */
export function endClones(s: Sim, u: SimUnit, reason: CloneEndReason): void {
  while (u.clone.length > 0) endClone(s, u, u.clone[0] as CloneState, reason);
}

/** Sends every clone on the board away (the end of a stage or of the battle). */
export function endAllClones(s: Sim, reason: CloneEndReason): void {
  while (s.cloners.length > 0) endClones(s, s.cloners[0] as SimUnit, reason);
}

/**
 * A cat is about to take tile `cell` (`placeUnit`, a cat dropped on the empty tile): a clone standing there hops back to its ninja's tile
 * and stays stacked, one `cloneStep` each, before the event of the cat that took the tile. Called AFTER a moved ninja's own cell was
 * written, so a ninja dropped on its own clone's tile reads as that clone becoming stacked on the same tile.
 */
export function vacateSeat(s: Sim, cell: number): void {
  if (s.cloners.length === 0) return;
  for (const u of s.cloners) {
    for (const c of u.clone) {
      if (c.cell !== cell) continue;
      c.cell = -1;
      if (s.ev.has('cloneStep')) s.ev.emit('cloneStep', { unit: u, index: c.index, from: cell, to: u.cell, x: cellCenterX(cell), y: cellCenterY(cell) });
    }
  }
}

/**
 * The skills' pass, before the gauges: a clone whose time is up leaves, and so do the clones of a ninja that is no longer a cat on the board
 * (merged, sold and molted ninjas were sent away at once by the board; this catches any other way a cat can leave).
 */
export function stepClones(s: Sim): void {
  const list = s.cloners;
  for (let i = list.length - 1; i >= 0; i--) {
    const u = list[i] as SimUnit;
    if (u.removed) {
      endClones(s, u, 'gone');
      continue;
    }
    for (let k = 0; k < u.clone.length; ) {
      const c = u.clone[k] as CloneState;
      if (s.time >= c.until - EPS) endClone(s, u, c, 'timeout');
      else k++;
    }
  }
}

// ───────────────────────────── the throws ─────────────────────────────

/** Enemies the next clone must not aim at: the volley's own and the earlier clones' picks. */
const skip: SimEnemy[] = [];
const turn: CloneState[] = [];

/**
 * The enemy a clone on `cell` aims at: among the living enemies in `range` of that tile's centre that are not in `skip`, the one in the
 * laser's dot (an elite or boss before any other, then the nearest to the dot), else the one that has travelled farthest (lower `uid` on a
 * tie). The same order the ninja's own volley uses.
 */
function aimFrom(s: Sim, cell: number, range: number): SimEnemy | null {
  const laser = s.laser;
  const laserR2 = laser.radius * laser.radius;
  let best: SimEnemy | null = null;
  let focus: SimEnemy | null = null;
  let focusD2 = Infinity;
  let focusSpecial = false;
  for (const e of s.enemies) {
    if (e.dead || !inRangeOf(cell, range, e) || skip.includes(e)) continue;
    if (best === null || e.travelled > best.travelled || (e.travelled === best.travelled && e.uid < best.uid)) best = e;
    if (!laser.active) continue;
    const dx = e.x - laser.x;
    const dy = e.y - laser.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > laserR2) continue;
    const special = e.isBoss || e.isElite;
    if (focus === null || (special !== focusSpecial ? special : d2 < focusD2 || (d2 === focusD2 && e.uid < focus.uid))) {
      focus = e;
      focusD2 = d2;
      focusSpecial = special;
    }
  }
  return focus ?? best;
}

function throwAt(s: Sim, u: SimUnit, c: CloneState, tile: number, target: SimEnemy, pitch: ClonePitch): void {
  skip.push(target);
  const p = pitch(s, u, target, tile, true);
  if (s.ev.has('cloneThrow')) {
    s.ev.emit('cloneThrow', {
      unit: u, index: c.index, cell: tile, stacked: c.cell < 0, x: cellCenterX(tile), y: cellCenterY(tile), targetUid: target.uid, left: c.left, projectile: p,
    });
  }
}

/**
 * The ninja threw a volley at `volley`: every clone that has landed and has a throw left throws along with it. Called by `fireMulti` for a
 * ninja that has clones; `pitch` is `launch`. See the file header for who a clone aims at.
 */
export function followVolley(s: Sim, u: SimUnit, volley: readonly SimEnemy[], pitch: ClonePitch): void {
  const now = s.time;
  // The clones that follow this volley, in tile order, ties by index (two stacked clones share the ninja's tile).
  turn.length = 0;
  for (const c of u.clone) {
    if (c.left <= 0 || now < c.readyAt - EPS) continue;
    let i = turn.length;
    turn.push(c);
    while (i > 0) {
      const o = turn[i - 1] as CloneState;
      const ot = tileOf(u, o);
      const ct = tileOf(u, c);
      if (ot < ct || (ot === ct && o.index < c.index)) break;
      turn[i] = o;
      i--;
    }
    turn[i] = c;
  }
  if (turn.length === 0) return;
  skip.length = 0;
  if (ROW.spread) for (const e of volley) skip.push(e);
  const range = u.stats.range;
  const shots = ROW.copyTargetsPerk ? 1 + u.perk.targets : 1;
  for (const c of turn) {
    const tile = tileOf(u, c);
    if (!ROW.spread) skip.length = 0;
    const first = aimFrom(s, tile, range);
    // Nobody to aim at: this volley is not one of the clone's throws, nothing is spent.
    if (first === null) continue;
    c.left--;
    throwAt(s, u, c, tile, first, pitch);
    for (let k = 1; k < shots; k++) {
      const more = aimFrom(s, tile, range);
      if (more === null) break;
      throwAt(s, u, c, tile, more, pitch);
    }
    if (c.left <= 0) endClone(s, u, c, 'done');
  }
}

// ───────────────────────────── the skill ─────────────────────────────

/** Is a clone of any ninja standing on this tile? (The casting ninja's own old clones were sent away before the seats are chosen.) */
function standingOn(s: Sim, cell: number): boolean {
  for (const o of s.cloners) for (const c of o.clone) if (c.cell === cell) return true;
  return false;
}

const seatTiles: number[] = [];

export const clones: SpHandler = {
  ready(s, u) {
    let n = 0;
    for (const e of s.enemies) if (!e.dead && inReach(u, e) && ++n >= ROW.readyMinEnemies) return true;
    return false;
  },

  cast(s, u) {
    // A cast that finds the ninja's old clones still there (the bard's jam session pulled the gauge forward) sends them away first.
    endClones(s, u, 'replaced');
    const now = s.time;
    emptyCellsNear(s, u.cell, seatTiles, (c) => standingOn(s, c));
    const seats: SpCloneSeat[] | null = castListened(s) ? [] : null;
    for (let i = 0; i < ROW.clones; i++) {
      const tile = i < seatTiles.length ? (seatTiles[i] as number) : -1;
      u.clone.push({ index: i, cell: tile, left: ROW.throws, readyAt: now + ROW.arrive, until: now + ROW.maxLife });
      if (seats) {
        const at = tile >= 0 ? tile : u.cell;
        seats.push({ cell: at, stacked: tile < 0, x: cellCenterX(at), y: cellCenterY(at) });
      }
    }
    s.cloners.push(u);
    announceCast(s, u, { skill: 'clones', data: { seats: seats ?? [], throws: ROW.throws, arrive: ROW.arrive, at: now, life: ROW.maxLife } });
    return true;
  },
};
