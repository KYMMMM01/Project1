/** Shared by the lucky cat's capsule tests (`sim.spCapsule*.test.ts`): a quiet arena, forced rolls, a tape of the events that matter, board builders. */
import { vi } from 'vitest';
import type { BattleEvents, SpCapsuleKind, UnitId } from '@/game/api';
import { CELL_COUNT } from '@/game/geometry';
import { capsule } from '@/game/sim/sp/capsule';
import type { Sim } from '@/game/sim/sim';
import type { SimUnit } from '@/game/sim/types';
import { startWave } from '@/game/sim/flow';
import { advance, newSim, put, quietWave, slay } from './simHelpers';

/** A battle in its first wave with the scripted spawns cancelled and the wave made endless: a test controls the field. */
export function arena(over: Parameters<typeof newSim>[0] = {}, level = 1): Sim {
  const sim = newSim(over, level);
  quietWave(sim);
  sim.waveDuration = 1e6;
  return sim;
}

/** A lucky cat in `cell` with a full gauge and its attack gauge empty. */
export function lucky(sim: Sim, cell = 12, sp = 1): SimUnit {
  const u = put(sim, cell, 't_lucky', 0);
  u.sp = sp;
  return u;
}

/** A value of the `combat` stream's `next()` that lands in the middle of each kind's band of the odds row (30 / 25 / 25 / 10 / 7 / 3). */
export const BAND: Readonly<Record<SpCapsuleKind, number>> = { fish: 0.15, purr: 0.42, partner: 0.67, more: 0.85, toy: 0.935, guardian: 0.985 };
/** The same for the small capsule inside a `more` one (25 : 7 : 3 out of 35). */
export const INNER_BAND = { partner: 0.35, toy: 0.82, guardian: 0.97 } as const;

/** Makes the next roll(s) of the `combat` stream come out as `kind` (and, for `more`, `inner`). Undone by `vi.restoreAllMocks()`. */
export function force(sim: Sim, kind: SpCapsuleKind, inner: keyof typeof INNER_BAND = 'partner'): void {
  const spy = vi.spyOn(sim.rng.combat, 'next');
  spy.mockReturnValueOnce(BAND[kind]);
  if (kind === 'more') spy.mockReturnValueOnce(INNER_BAND[inner]);
}

/** Casts through the handler the way the gauge pass does, after asserting that the skill said it was ready. Returns the cat's gauge after. */
export function castNow(sim: Sim, u: SimUnit): number {
  if (!capsule.ready(sim, u)) throw new Error('not ready');
  u.sp = 0; // what the gauge pass does before it calls the handler
  if (!capsule.cast(sim, u)) throw new Error('cast refused');
  return u.sp;
}

/** Lets a capsule that was just cast open (`openDelay`, 72 ticks). */
export function openIt(sim: Sim): void {
  advance(sim, 1.2);
}

export interface Tape {
  /** Every event of the types below, as `type` or `type:detail`, in the order they came. */
  log: string[];
  casts: BattleEvents['spCast'][];
  opens: BattleEvents['capsuleOpen'][];
  fish: BattleEvents['fish'][];
  purr: BattleEvents['purr'][];
  summons: BattleEvents['summon'][];
  promotes: BattleEvents['promote'][];
  awakens: BattleEvents['awaken'][];
  offers: BattleEvents['relicOffer'][];
}

export function tape(sim: Sim): Tape {
  const t: Tape = { log: [], casts: [], opens: [], fish: [], purr: [], summons: [], promotes: [], awakens: [], offers: [] };
  sim.events.on('spCast', (e) => {
    if (e.skill !== 'capsule') return;
    t.casts.push(e);
    t.log.push('cast');
  });
  sim.events.on('capsuleOpen', (e) => {
    t.opens.push(e);
    t.log.push(`open:${e.kind}${e.small ? ':small' : ''}:${e.result}`);
  });
  sim.events.on('fish', (e) => {
    if (e.reason !== 'skill') return;
    t.fish.push(e);
    t.log.push('fish');
  });
  sim.events.on('purr', (e) => {
    if (e.reason !== 'skill') return;
    t.purr.push(e);
    t.log.push('purr');
  });
  sim.events.on('summon', (e) => {
    if (e.source !== 'skill') return;
    t.summons.push(e);
    t.log.push('summon');
  });
  sim.events.on('promote', (e) => {
    t.promotes.push(e);
    t.log.push('promote');
  });
  sim.events.on('awaken', (e) => {
    t.awakens.push(e);
    t.log.push(e.free ? 'awaken:free' : 'awaken');
  });
  sim.events.on('relicOffer', (e) => {
    t.offers.push(e);
    t.log.push(e.source === 'capsule' ? 'offer:capsule' : 'offer');
  });
  return t;
}

/** Puts the cats on the board: `{ cell: id }`. Every other cell is left as it is. */
export function board(sim: Sim, cats: Readonly<Record<number, UnitId>>): void {
  for (const [cell, id] of Object.entries(cats)) put(sim, Number(cell), id, 0);
}

/** Empties the whole board (the lucky cat's own tile too). */
export function clearBoard(sim: Sim): void {
  for (let c = 0; c < CELL_COUNT; c++) sim.units[c] = null;
}

/** Fills every empty cell with `id` (a full board). */
export function fillRest(sim: Sim, id: UnitId = 'w_paw'): void {
  for (let c = 0; c < CELL_COUNT; c++) if (sim.units[c] === null) put(sim, c, id, 0);
}

/** Jumps straight into `wave` with an empty field and the scripted spawns cancelled (the way the flow tests do). */
export function enter(sim: Sim, wave: number): void {
  startWave(sim, wave);
  sim.spawnIds.length = 0;
  sim.spawnTimes.length = 0;
  sim.spawnIdx = 0;
}

/** Plays an elite or boss wave (4 is the first) up to the moment the target is killed: the 1.2 s clearing delay is running. */
export function targetDown(sim: Sim, wave = 4): void {
  enter(sim, wave);
  advance(sim, 1.1);
  slay(sim);
}
