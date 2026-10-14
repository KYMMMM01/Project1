/**
 * The skill gauges (docs/design_skills_v1.md 2.1 and 2.2 as amended by v2 section 0 and 3.0).
 *
 * Every cat whose definition has a skill (`UnitDef.spSkill`, only for built skills) owns a gauge `sp` (0..1) that fills by simulation time
 * only: `TICK / cooldown` a tick, standing still while the cat is blocked (a wet or zap cell, then the 0.3 s of recovery: `u.blocked`,
 * worked out by `updateUnits` just before) exactly like the attack gauge. Attack speed, weakening and the special cells do not touch it.
 * Moving or swapping a cat keeps its gauge (it is the same object), a merge result starts at `SP_START_MERGE`, a molt or an awakening keeps
 * the ratio (`board.ts`), a restored run puts every cat at `SP_START_RESTORE`, selling a cat ends its gauge with it.
 *
 * A full gauge casts in the tick it fills if the skill's `ready` says so, and the gauge goes back to 0. Otherwise it waits full and asks
 * again every `SP_RECHECK` seconds, not every tick. Several full gauges in one tick cast in cell order. Rank 5 skills cast at least
 * `SP_RANK5_GAP` seconds apart: the later cat waits with its gauge full until the gap is over. A blocked cat does not cast (a full gauge
 * waits for the end of the hazard, like a full attack gauge).
 *
 * The whole pass is skipped when the battle was started with `sp: false`: the simulation then plays exactly as it did without skills.
 */
import { TICK } from '../data/balance';
import { SP_RANK5_GAP, SP_RECHECK } from '../data/spSkills';
import { SP_SKILL_IDS } from '../api';
import type { Sim } from './sim';
import { stepClones } from './sp/clones';
import { stepClouds } from './sp/cloud';
import { SP_HANDLERS } from './sp/registry';
import { stepRunners } from './sp/run';
import type { SimUnit } from './types';

const SKILL_BIT: Readonly<Record<string, number>> = Object.fromEntries(SP_SKILL_IDS.map((id, i) => [id, 1 << i]));

/** Tries to cast the skill of `u`, whose gauge is full. Returns true when it cast. */
function tryCast(s: Sim, u: SimUnit): boolean {
  const def = u.spec.spSkill;
  if (!def) return false;
  const handler = SP_HANDLERS[def.id];
  const now = s.time;
  if (!handler) {
    u.spCheckAt = now + SP_RECHECK;
    return false;
  }
  if (def.rank === 5 && now < s.spRank5Until - 1e-9) {
    // Not the skill's own condition: the gap between two rank 5 casts. The later cat looks again the moment it is over.
    u.spCheckAt = s.spRank5Until;
    return false;
  }
  if (!handler.ready(s, u)) {
    u.spCheckAt = now + SP_RECHECK;
    return false;
  }
  const bit = SKILL_BIT[def.id] as number;
  const first = (s.spSeen & bit) === 0;
  const gapBefore = s.spRank5Until;
  s.spFirst = first;
  s.spSeen |= bit;
  u.sp = 0;
  u.spCheckAt = 0;
  if (def.rank === 5) s.spRank5Until = now + SP_RANK5_GAP;
  if (handler.cast(s, u)) return true;
  // It found nothing to do after all: the cast did not happen.
  u.sp = 1;
  u.spCheckAt = now + SP_RECHECK;
  s.spRank5Until = gapBefore;
  if (first) s.spSeen &= ~bit;
  return false;
}

/** One tick of every skill gauge, in cell order. */
export function updateSpSkills(s: Sim): void {
  // The running bodies of earlier casts first: a cast of this tick starts to move in the next one.
  if (s.runners.length > 0) stepRunners(s);
  // The ninja's clones: those whose time is up (or whose ninja is gone) leave. Their throws happen in the ninja's volleys (`updateUnits`).
  if (s.cloners.length > 0) stepClones(s);
  // The storm cat's clouds: they follow their hosts and drop their bolts whether or not the cat is still there.
  if (s.clouds.length > 0) stepClouds(s);
  // Only the cats that have a skill (a short list in cell order, kept by `refresh`), not all 25 cells.
  const cats = s.spCats;
  for (let i = 0; i < cats.length; i++) {
    const u = cats[i] as SimUnit;
    const def = u.spec.spSkill;
    if (!def || u.blocked) continue;
    if (u.sp < 1) {
      u.sp += TICK / def.cooldown;
      if (u.sp < 1 - 1e-9) continue;
      u.sp = 1;
    }
    if (s.time < u.spCheckAt - 1e-9) continue;
    tryCast(s, u);
  }
}
