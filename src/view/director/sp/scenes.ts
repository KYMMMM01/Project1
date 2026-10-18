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
import { makeCut } from './cut';
import { makeMeteor } from './meteor';
import { makeClones } from './clones';
import { makeCloud } from './cloud';
import { makeKnock } from './knock';
import { makeJam } from './jam';
import { makeFish } from './fish';
import { makeCapsule } from './capsule';

export const SCENES: { [K in SpSkillName]?: SpSceneFactory<K> } = {
  shove: makeShove,
  charge: makeCharge, // TIGER (charge.ts): the leap, the 1.5x body on the road, stomps and paw prints, the roar, the walk back.
  lap: makeLap, // STAR ARCHER (lap.ts): the night, the arrow's lap, a star per spRunHit, a burst per spRunBurst.
  wanted: makeWanted,
  cut: makeCut, // SAMURAI (cut.ts): the afterimage, a thin line on each marked enemy, the sheath click and the gashes (cutOpen).
  meteor: makeMeteor, // COSMO CAT (meteor.ts): the dusk, the red circle, the falling fireball, the two rings, the crater (meteorLand, craterEnd).
  clones: makeClones, // NINJA (clones.ts): leaf and puff, two pale clones hop onto tiles, a pale shuriken per volley, they fade, "pop" and a leaf; they step aside for a cat.
  cloud: makeCloud, // STORM CAT (cloud.ts): the grumpy cloud pops out of the hat, rides its host, a bolt per cloudBolt, hops, fizzles.
  knock: makeKnock, // FROST QUEEN (knock.ts): the stare, the paw, the glass, the shards, the ice held until each shard lands (and its number, numberHold.ts).
  jam: makeJam, // BARD (jam.ts): the strum, four golden notes in a fan, a ring that holds its old gauge until its note lands and then climbs, a note sticker on a cat that attacks.
  fish: makeFish, // ALCHEMIST (fish.ts): the flasks, pink smoke, the big fish with the boss's face and its chip, small flasks that turn weak enemies into fish for the counter (fishHold.ts).
  capsule: makeCapsule, // LUCKY CAT (capsule.ts): the capsule falls wearing its colour and mark, bounces, splits open (capsuleOpen) into the prize; the ring springs back after a fish capsule.
};
