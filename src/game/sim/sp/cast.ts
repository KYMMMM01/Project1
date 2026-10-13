import type { SpPayload } from '../../api';
import { cellCenterX, cellCenterY } from '../../geometry';
import type { Sim } from '../sim';
import type { SimUnit } from '../types';

/**
 * True when somebody listens to `spCast`. Build the payload of the cast (lists of enemies and the like) only if so, the way every other
 * event is: a headless run (the bots, the balance report) allocates nothing for it.
 */
export function castListened(s: Sim): boolean {
  return s.ev.has('spCast');
}

/**
 * Announces the cast that is in progress. Call it once per cast, after the effect's bookkeeping and BEFORE the damage, so the view starts
 * the scene and the `hit` numbers pop up on it. `x`, `y` default to the cat's tile centre. The `first` flag was worked out by the pass.
 */
export function announceCast(s: Sim, u: SimUnit, payload: SpPayload, x = cellCenterX(u.cell), y = cellCenterY(u.cell)): void {
  if (!s.ev.has('spCast')) return;
  s.ev.emit('spCast', { unit: u, first: s.spFirst, x, y, ...payload });
}
