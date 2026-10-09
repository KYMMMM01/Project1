/**
 * The abilities of the third synergy step (rules v1.4): the warriors' roar and the mages' burst live here. The rangers' sure crit is
 * decided where a crit is rolled (`combat.ts`) and the tricksters' play time where the speed of a cat is worked out (`board.ts`).
 */
import type { StrikePoint } from '../api';
import { CELL_COUNT, cellCenterX, cellCenterY } from '../geometry';
import { SYNERGY_SPECIAL } from '../data/classes';
import { applyStatus, damageEnemy } from './enemies';
import type { Sim } from './sim';
import type { SimEnemy } from './types';

const WARRIOR = 0;
const CRY = SYNERGY_SPECIAL.warrior;
const BURST = SYNERGY_SPECIAL.mage;

/** Scratch list of the enemies one roar or one burst touches. */
const touched: SimEnemy[] = [];

function emit(s: Sim, classId: 'warrior' | 'mage', kind: 'cry' | 'shatter', x: number, y: number, radius: number): void {
  if (!s.ev.has('special')) return;
  const points: StrikePoint[] = [];
  for (const e of touched) points.push({ x: e.x, y: e.y, uid: e.uid });
  s.ev.emit('special', { classId, kind, x, y, radius, points });
}

/** An enemy that fell with a magic status on it bursts at the end of the tick (not in the middle of the hit that killed it). */
export function queueShatter(s: Sim, e: SimEnemy): void {
  s.shatterQueue.push(e.x, e.y, e.maxHp * BURST.pct);
}

/** The warriors roar every few seconds while enemies stand in a warrior's range; the mages' queued bursts go off. */
export function updateSpecials(s: Sim): void {
  if (s.special[WARRIOR] === 1 && s.time >= s.cryAt) roar(s);
  if (s.shatterQueue.length > 0) burst(s);
}

function roar(s: Sim): void {
  let roared = false;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u || u.classIndex !== WARRIOR || u.blocked) continue;
    const cx = cellCenterX(c);
    const cy = cellCenterY(c);
    touched.length = 0;
    for (const e of s.enemies) {
      const dx = e.x - cx;
      const dy = e.y - cy;
      const reach = u.stats.range + e.spec.radius;
      if (dx * dx + dy * dy <= reach * reach) touched.push(e);
    }
    if (touched.length === 0) continue;
    roared = true;
    emit(s, 'warrior', 'cry', cx, cy, u.stats.range);
    for (const e of touched) {
      applyStatus(s, e, 'stun', 1, CRY.stun, u);
      applyStatus(s, e, 'armor_break', CRY.breakAmount, CRY.breakDuration, u);
    }
  }
  // With nobody to roar at the ability stays ready and goes off the moment an enemy is in range.
  if (roared) s.cryAt = s.time + CRY.every;
}

function burst(s: Sim): void {
  const queue = s.shatterQueue;
  s.shattering = true;
  for (let i = 0; i < queue.length; i += 3) {
    const x = queue[i] as number;
    const y = queue[i + 1] as number;
    const damage = queue[i + 2] as number;
    touched.length = 0;
    for (const e of s.enemies) {
      const dx = e.x - x;
      const dy = e.y - y;
      const reach = BURST.radius + e.spec.radius;
      if (dx * dx + dy * dy <= reach * reach) touched.push(e);
    }
    emit(s, 'mage', 'shatter', x, y, BURST.radius);
    for (const e of touched) if (!e.dead) damageEnemy(s, e, damage, 'magic', null, false, null);
  }
  queue.length = 0;
  s.shattering = false;
}
