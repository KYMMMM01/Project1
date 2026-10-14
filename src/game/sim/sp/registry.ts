/**
 * The handlers of the skills, by skill id: all twelve are listed, in the order of `SP_SKILL_IDS`, and all twelve are built. The type still
 * allows `null` (no handler: the pass treats the gauge of such a cat as waiting full), so a skill can be taken out by setting its entry to
 * `null` and its row to `built: false`. A test holds the two together: a built row has a handler and a handler has a built row.
 * Importing the skill files here is also what runs their `registerLater(...)` lines, so a skill that waits on the delayed list needs no other
 * wiring.
 */
import type { SpSkillId } from '../../api';
import { capsule } from './capsule';
import { charge } from './charge';
import { clones } from './clones';
import { cloud } from './cloud';
import { cut } from './cut';
import { fish } from './fish';
import { jam } from './jam';
import { knock } from './knock';
import { lap } from './lap';
import { meteor } from './meteor';
import { shove } from './shove';
import type { SpHandler } from './types';
import { wanted } from './wanted';

export const SP_HANDLERS: Readonly<Record<SpSkillId, SpHandler | null>> = {
  shove, cut, charge, clones, wanted, lap, cloud, knock, meteor, jam, fish, capsule,
};
