/**
 * THE REGISTRY OF SCENES: one entry per skill whose cast has a picture. A skill with no entry shows its ring flash and nothing else (and its
 * name bubble and cut-in on its first cast, which the dispatcher draws for every skill).
 *
 * To add a scene (hand-off `docs/handoff/skills1_view.md`, "How a scene is added"):
 *   1. write `src/view/director/sp/<name>.ts` exporting `make<Name>: SpSceneFactory<'<skill>'>` (see `shove.ts` for the shape);
 *   2. import it below and put it in `SCENES` under the skill's id;
 *   3. nothing else: the dispatcher already routes the cast, the stage rule, the run / bite follow-up events, `update` and `clear`.
 */
import type { SpSceneFactory, SpSkillName } from './types';
import { makeShove } from './shove';
import { makeCharge } from './charge';
import { makeLap } from './lap';
import { makeWanted } from './wanted';

export const SCENES: { [K in SpSkillName]?: SpSceneFactory<K> } = {
  shove: makeShove,
  charge: makeCharge, // TIGER (charge.ts): the leap, the 1.5x body on the road, stomps and paw prints, the roar, the walk back.
  lap: makeLap, // STAR ARCHER (lap.ts): the night, the arrow's lap, a star per spRunHit, a burst per spRunBurst.
  wanted: makeWanted,
};
