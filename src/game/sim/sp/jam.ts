/**
 * Jam Session! (bard, Alley Boss; docs/design_skills_v2.md 3.10, directive decision 23): the lute is strummed and four golden notes fly to four
 * different cats at once. A note either makes a skill cat's gauge jump (`fill`, 20%) or, when there is no skill cat left to take it, makes the
 * nearest cat that has no skill attack once at once.
 *
 *  - Gauge notes. The skill cats other than the bard (`Sim.spCats`, which holds every cat with a BUILT skill, the lucky cat among them: the
 *    row's knob `capsule.bardTargetsCapsule` can switch that off) whose gauge is below `skip` (80%), the lowest gauges first, ties to the lower
 *    tile; at most `targets` (4). Each gauge gains `fill`, never above 1. A gauge at 80% or more is passed over, so a note never fills a
 *    gauge to the top by itself and never wastes itself on a skill that is about to cast.
 *  - Leftover notes (`targets` minus the gauge notes). The cats with no skill (a cat whose skill is not built counts as one), nearest to the
 *    bard first (tile-centre distance, ties to the lower tile), that can attack right now: not blocked, an enemy inside their range, and no
 *    full attack gauge already in hand. Each gets `leftoverCharge` (1) added to its attack gauge and its "nothing in range" cache cleared, so
 *    the next tick it attacks its own target the ordinary way (`updateUnits`), once, for nothing. Its charge is not slowed or sped up.
 *  - One note a cat, and the bard takes none. Ready when at least one note can land anywhere; otherwise the gauge waits full.
 *  - Nothing here touches an enemy: no damage, no random draw, no crit. The `attack` that follows a leftover note is the cat's own.
 */
import type { SpJamNote } from '../../api';
import { SP_ROWS } from '../../data/spSkills';
import { CELL_COUNT } from '../../geometry';
import type { Sim } from '../sim';
import type { SimUnit } from '../types';
import { announceCast, castListened } from './cast';
import { cellDist2, inRangeOf } from './near';
import type { SpHandler } from './types';

const ROW = SP_ROWS.jam;

/** The cats the notes go to this time (module scratch: a cast allocates nothing unless somebody listens). */
const gaugeCats: SimUnit[] = [];
const attackCats: SimUnit[] = [];

/** Is the skill cat out of the bard's reach (the lucky cat when the knob that lets the bard fill it is off)? */
function aside(c: SimUnit): boolean {
  return c.spec.spSkill?.id === 'capsule' && !SP_ROWS.capsule.bardTargetsCapsule;
}

/** Does an enemy stand inside the cat's range right now (the test an attack uses)? */
function hasTarget(s: Sim, c: SimUnit): boolean {
  for (const e of s.enemies) if (!e.dead && inRangeOf(c.cell, c.stats.range, e)) return true;
  return false;
}

/**
 * Works out who gets the notes: `gaugeCats` (lowest gauge first) and `attackCats` (nearest first). Changes nothing in the battle.
 * Returns the number of notes that can land.
 */
function plan(s: Sim, bard: SimUnit): number {
  gaugeCats.length = 0;
  attackCats.length = 0;
  const limit = ROW.targets;
  if (limit <= 0) return 0;
  const cats = s.spCats;
  for (let i = 0; i < cats.length; i++) {
    const c = cats[i] as SimUnit;
    // The cats come in tile order, so an equal gauge goes behind the earlier tile: ties to the lower tile.
    if (c === bard || c.sp >= ROW.skip - 1e-9 || aside(c)) continue;
    let at = gaugeCats.length;
    if (at < limit) gaugeCats.push(c);
    else if (c.sp < (gaugeCats[limit - 1] as SimUnit).sp) at = limit - 1;
    else continue;
    while (at > 0 && c.sp < (gaugeCats[at - 1] as SimUnit).sp) {
      gaugeCats[at] = gaugeCats[at - 1] as SimUnit;
      at--;
    }
    gaugeCats[at] = c;
  }
  const left = limit - gaugeCats.length;
  if (left > 0) {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const c = s.units[cell];
      if (!c || c.spec.spSkill || c.blocked || c.charge >= 1 || !hasTarget(s, c)) continue;
      const d = cellDist2(bard.cell, cell);
      let at = attackCats.length;
      if (at < left) attackCats.push(c);
      else if (d < cellDist2(bard.cell, (attackCats[left - 1] as SimUnit).cell)) at = left - 1;
      else continue;
      while (at > 0 && d < cellDist2(bard.cell, (attackCats[at - 1] as SimUnit).cell)) {
        attackCats[at] = attackCats[at - 1] as SimUnit;
        at--;
      }
      attackCats[at] = c;
    }
  }
  return gaugeCats.length + attackCats.length;
}

export const jam: SpHandler = {
  ready(s, u) {
    return plan(s, u) > 0;
  },

  cast(s, u) {
    if (plan(s, u) === 0) return false;
    const notes: SpJamNote[] | null = castListened(s) ? [] : null;
    // Everything is decided before anything is written: the gauges a note raises do not change who the next note goes to.
    if (notes) {
      for (const c of gaugeCats) notes.push({ uid: c.uid, cell: c.cell, kind: 'gauge', before: c.sp, after: Math.min(1, c.sp + ROW.fill) });
      for (const c of attackCats) notes.push({ uid: c.uid, cell: c.cell, kind: 'attack', before: 0, after: 0 });
    }
    for (const c of gaugeCats) {
      c.sp = Math.min(1, c.sp + ROW.fill);
      // A gauge that (with a different `skip`) a note fills to the top casts as soon as its skill's own condition holds, not after a wait.
      if (c.sp >= 1 - 1e-9) c.spCheckAt = 0;
    }
    for (const c of attackCats) {
      c.charge += ROW.leftoverCharge;
      c.searchAfter = 0;
    }
    // Announced after the writes (there is no damage to come first): `UnitState.sp` and `charge` of every cat that got a note already show
    // the new value when the event arrives, as `SpJamNote.after` says.
    announceCast(s, u, { skill: 'jam', data: { notes: notes ?? [], fill: ROW.fill } });
    return true;
  },
};
