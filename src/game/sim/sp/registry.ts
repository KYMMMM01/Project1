/**
 * The handlers of the built skills, by skill id. A skill file exports its handler and is listed here once, next to the `built: true` flag of
 * its row in `data/spSkills.ts` (a test holds the two together: a built row has a handler and a handler has a built row). A skill of step 2
 * adds its import and one line.
 */
import type { SpSkillId } from '../../api';
import { charge } from './charge';
import { lap } from './lap';
import { shove } from './shove';
import type { SpHandler } from './types';
import { wanted } from './wanted';

export const SP_HANDLERS: Readonly<Partial<Record<SpSkillId, SpHandler>>> = { shove, charge, lap, wanted };
