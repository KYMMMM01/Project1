/**
 * The delayed list (`Sim.later`): things that happen some seconds after they were decided, processed in tick order. The samurai's cut,
 * the meteor and the lucky cat's capsule (step 2) wait on it. It lives only inside the simulation object: a saved run holds nothing of it
 * (a resumed run starts with an empty list), so an item may point at units and enemies directly.
 *
 * Items run in order of due time, then of the order they were put in. They run at the start of the tick in which `time >= at`
 * (`Sim.tick`, after the cats attacked), also while the skills are switched off (the list is simply empty then). An item put in while the
 * list runs and already due runs in the same pass. A runner must check that what it points at still exists (`unit.removed`,
 * `enemy.dead`): the cat may have been sold and the enemy killed in the meantime.
 */
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';

/** The kinds of delayed things. The first three are the step-2 skills' (reserved); `probe` is for tests. */
export type LaterKind = 'cut' | 'meteor' | 'capsule' | 'probe';

export interface LaterItem {
  /** Simulation time it is due. */
  at: number;
  /** Order of insertion: ties in `at` run in this order. */
  seq: number;
  kind: LaterKind;
  unit: SimUnit | null;
  enemy: SimEnemy | null;
  x: number;
  y: number;
  a: number;
  b: number;
}

export type LaterRunner = (s: Sim, item: LaterItem) => void;

const RUNNERS: Partial<Record<LaterKind, LaterRunner>> = {};

/** Says what to do when an item of `kind` is due. One runner per kind; registering again replaces it. */
export function registerLater(kind: LaterKind, run: LaterRunner): void {
  RUNNERS[kind] = run;
}

/** The most items one pass runs: a runner that keeps putting in items that are already due would otherwise never let the tick end. */
const PASS_LIMIT = 10_000;

/** Puts an item on the list to run `delay` seconds from now (`delay` 0: in this tick's pass). Returns it. */
export function later(
  s: Sim, delay: number, kind: LaterKind, fields: Partial<Pick<LaterItem, 'unit' | 'enemy' | 'x' | 'y' | 'a' | 'b'>> = {},
): LaterItem {
  const item: LaterItem = {
    at: s.time + delay, seq: ++s.laterSeq, kind,
    unit: fields.unit ?? null, enemy: fields.enemy ?? null, x: fields.x ?? 0, y: fields.y ?? 0, a: fields.a ?? 0, b: fields.b ?? 0,
  };
  const list = s.later;
  let i = list.length;
  while (i > 0 && (list[i - 1] as LaterItem).at > item.at) i--;
  list.splice(i, 0, item);
  return item;
}

/** Runs every item that is due, in order. Returns how many ran. Kinds with no runner are dropped. */
export function runLater(s: Sim): number {
  const list = s.later;
  const limit = s.time + 1e-9;
  let n = 0;
  while (list.length > 0 && n < PASS_LIMIT && (list[0] as LaterItem).at <= limit) {
    const item = list.shift() as LaterItem;
    n++;
    RUNNERS[item.kind]?.(s, item);
  }
  return n;
}
