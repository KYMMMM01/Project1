import type { Sim } from '../sim';
import type { SimUnit } from '../types';

/**
 * What a skill is to the simulation. Two functions; the gauge, the waiting, the order of several full gauges and the gap between rank 5
 * casts belong to `sim/spSkills.ts` and are none of the skill's business.
 *
 * A handler lives in its own file under `sim/sp/`, is exported once and listed in `sim/sp/registry.ts`; its row in `data/spSkills.ts`
 * says `built: true` last. Nothing in a handler may use `Math.random`; the only random stream a skill may draw from is `combat`, and
 * only where `docs/design_skills_v2.md` says so. Skills never roll crits.
 */
export interface SpHandler {
  /**
   * Is there something for the skill to do right now? Asked the tick the gauge fills and then every `SP_RECHECK` (0.2 s) while it waits
   * full, never every tick. It must not change anything. Reach: a rank 3 or 4 skill looks inside the cat's own range, a rank 5 skill at the
   * whole field (`collectInReach`, `inReach` in `./target`); targets come in `skillOrder` (`skillBefore`).
   */
  ready(s: Sim, u: SimUnit): boolean;
  /**
   * Does it, in the same tick `ready` said yes. Order of work: do the effect's bookkeeping, announce the cast with `announceCast` (so the
   * view starts the scene before the damage numbers), then deal the damage through `damageEnemy` (no crit). Returns false only if it found
   * nothing to do after all: the gauge then stays full and the cast does not count as the first.
   */
  cast(s: Sim, u: SimUnit): boolean;
}
