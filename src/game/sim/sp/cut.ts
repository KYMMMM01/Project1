/**
 * Already Cut (samurai, King; docs/design_skills_v2.md 3.2, 4.4, 4.5): a white afterimage crosses a stretch of road, thin lines are drawn on
 * up to `max` enemies in it, and `fuse` seconds later every line opens at once and cuts `power` x D. Nothing happens at the cast but the
 * marking (no bleed: bleeding is the passive's); everything happens when the lines open.
 *
 *  - Reach: the anchor is the first enemy in skill order (the laser's dot, elites and bosses, the farthest along, the lower `uid`) among
 *    the enemies inside the samurai's own range (rank 4). The stretch is measured along the road, `half` px either side of the anchor
 *    (`pathGap`, the same measure the passive's line uses), and takes in every enemy of it, in reach or not.
 *  - Marks: up to `max` of the stretch's enemies, the closest to the anchor first (the anchor first of all; equal gaps in skill order).
 *    Two samurai (or one that casts again inside the fuse) may mark the same enemy: each cast is its own, each line cuts.
 *  - Ready: at least `minEnemies` enemies in the stretch, or an elite or a boss inside the samurai's range.
 *  - Opening, all at the same instant: a line whose enemy is alive cuts it. A line whose enemy died meanwhile moves to the nearest living
 *    enemy whose body is within `reaim` px of the dead one's last place and that carries no line (of any cast still waiting) and was not
 *    cut by another line at this same instant; with no such enemy the line goes out. Every line is settled first, then the event goes out,
 *    then the cuts are dealt in the order of the marks, so a cut that kills does not change which lines moved.
 *  - Damage: `power` x D (D = the samurai's `stats.damage` at the CAST), through `damageEnemy` (armour, ward, the vulnerability cap, the
 *    elite / boss allowance), no crit, no random numbers. The cut belongs to the cast, not to the cat: it opens even if the samurai was
 *    sold, merged, molted or awakened meanwhile (the damage is credited to it all the same).
 *  - It rides the delayed list (`later.ts`), so it stands still with a choice popup, goes at 2x and 3x speed with the simulation, runs
 *    through a wave or stage change, and, since nothing runs in `prep`, a cut that falls due there opens in the first tick of the next
 *    wave. Nothing is saved.
 */
import { SP_ROWS } from '../../data/spSkills';
import { pathGap, wrapPath } from '../../geometry';
import type { SpCutLine, SpCutMark } from '../../api';
import { damageEnemy } from '../enemies';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { later, registerLater, type LaterItem } from './later';
import { nearestEnemyAround } from './near';
import { collectInReach, skillBefore } from './target';
import type { SpHandler } from './types';

const ROW = SP_ROWS.cut;

/** A cast waiting for its lines to open. */
interface Waiting {
  id: number;
  unit: SimUnit;
  at: number;
  marks: SimEnemy[];
  /** Damage of one cut, worked out at the cast. */
  damage: number;
}

/** What is waiting in one battle (the simulation holds no field for it; nothing is saved). */
interface Book {
  seq: number;
  waiting: Waiting[];
  /** The enemies cut so far at the instant `openedAt` (a moved line must not pile onto one of them). */
  opened: SimEnemy[];
  openedAt: number;
}

const books = new WeakMap<Sim, Book>();

function bookOf(s: Sim): Book {
  let b = books.get(s);
  if (!b) {
    b = { seq: 0, waiting: [], opened: [], openedAt: -1 };
    books.set(s, b);
  }
  return b;
}

const reach: SimEnemy[] = [];
/** The stretch the plan found (before `max`), the anchor's index in `reach` is always 0. */
const stretch: SimEnemy[] = [];

/** True when the enemy carries a line of a cast that has not opened yet. */
function carriesLine(book: Book, e: SimEnemy): boolean {
  for (const w of book.waiting) if (w.marks.includes(e)) return true;
  return false;
}

/**
 * Works out the cast for cat `u` into `reach` (the enemies inside its range, in skill order) and `stretch` (the enemies of the stretch,
 * the closest to the anchor first). Returns the anchor, or null when the skill has nothing to do now. Changes nothing in the battle.
 */
function plan(s: Sim, u: SimUnit): SimEnemy | null {
  collectInReach(s, u, reach);
  const anchor = reach[0];
  if (!anchor) return null;
  stretch.length = 0;
  for (const e of s.enemies) if (!e.dead && pathGap(e.travelled, anchor.travelled) <= ROW.half) stretch.push(e);
  // Closest to the anchor first, a tie in skill order (insertion sort: a stretch holds a few dozen enemies at most).
  for (let i = 1; i < stretch.length; i++) {
    const e = stretch[i] as SimEnemy;
    const g = pathGap(e.travelled, anchor.travelled);
    let j = i - 1;
    while (j >= 0) {
      const o = stretch[j] as SimEnemy;
      const og = pathGap(o.travelled, anchor.travelled);
      if (og < g || (og === g && skillBefore(o, e))) break;
      stretch[j + 1] = o;
      j--;
    }
    stretch[j + 1] = e;
  }
  if (stretch.length >= ROW.minEnemies) return anchor;
  for (const e of reach) if (e.isElite || e.isBoss) return anchor;
  return null;
}

/** The enemies the lines of the cast being opened cut (in the order of the marks), and the lines for the event. */
const targets: SimEnemy[] = [];
const lines: SpCutLine[] = [];

/** The lines of one cast open. */
function open(s: Sim, book: Book, w: Waiting): void {
  if (book.openedAt !== s.time) {
    book.opened.length = 0;
    book.openedAt = s.time;
  }
  const listened = s.ev.has('cutOpen');
  lines.length = 0;
  targets.length = 0;
  // 1. Settle every line against the field as it is now (nobody is hurt yet).
  const skip = (e: SimEnemy): boolean => carriesLine(book, e) || book.opened.includes(e) || targets.includes(e);
  for (const host of w.marks) {
    let to: SimEnemy | null = null;
    if (!host.dead) to = host;
    else to = nearestEnemyAround(s, host.x, host.y, ROW.reaim, skip);
    if (to) targets.push(to);
    if (listened) {
      lines.push({
        uid: host.uid, kind: to === null ? 'lost' : to === host ? 'cut' : 'moved', to: to ? to.uid : 0,
        x: host.x, y: host.y, toX: to ? to.x : host.x, toY: to ? to.y : host.y,
      });
    }
  }
  const i = book.waiting.indexOf(w);
  if (i >= 0) book.waiting.splice(i, 1);
  for (const e of targets) book.opened.push(e);
  // 2. The event, then 3. the cuts in the order of the marks.
  if (listened) s.ev.emit('cutOpen', { cutId: w.id, unit: w.unit, at: w.at, lines: lines.slice() });
  const cuts = targets.slice();
  for (const e of cuts) if (!e.dead) damageEnemy(s, e, w.damage, w.unit.spec.damageType, w.unit, false, null);
}

registerLater('cut', (s: Sim, item: LaterItem) => {
  const book = books.get(s);
  if (!book) return;
  const w = book.waiting.find((x) => x.id === item.a);
  if (w) open(s, book, w);
});

export const cut: SpHandler = {
  ready(s, u) {
    return plan(s, u) !== null;
  },

  cast(s, u) {
    const anchor = plan(s, u);
    if (!anchor) return false;
    const book = bookOf(s);
    const marks = stretch.slice(0, ROW.max);
    const w: Waiting = { id: ++book.seq, unit: u, at: s.time, marks, damage: ROW.power * u.stats.damage };
    book.waiting.push(w);
    later(s, ROW.fuse, 'cut', { unit: u, a: w.id });
    if (castListened(s)) {
      const list: SpCutMark[] = [];
      for (const e of marks) list.push({ uid: e.uid, x: e.x, y: e.y });
      announceCast(s, u, {
        skill: 'cut',
        data: {
          cutId: w.id, anchorUid: anchor.uid, anchorPath: wrapPath(anchor.travelled), fromPath: wrapPath(anchor.travelled - ROW.half),
          toPath: wrapPath(anchor.travelled + ROW.half), at: s.time, fuse: ROW.fuse, marks: list,
        },
      });
    }
    return true;
  },
};
