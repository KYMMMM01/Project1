/** Cell hazards (wet, zap), the dryer's weakening and the pulses of elites (rules §10). */
import type { HazardKind, HazardState } from '../api';
import { CELL_COUNT, COLS, ROWS, cellCol, cellIndex, cellRow } from '../geometry';
import { ENRAGE_COOLDOWN_MULT, HAZARD_WARNING } from '../data/balance';
import { recomputeStats } from './board';
import type { Sim } from './sim';
import type { HazardBatch, SimEnemy, SimUnit } from './types';

const eligible: number[] = [];

/** Cells a hazard may hit: every occupied one (a cat a bell kitten covers may dodge it when it lands, see `activate`). */
function collectEligible(s: Sim): number[] {
  eligible.length = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (s.units[c]) eligible.push(c);
  return eligible;
}

/** `count` different eligible cells drawn from the combat stream (fewer when the board offers fewer). */
export function pickHazardCells(s: Sim, count: number): number[] {
  const pool = collectEligible(s);
  const out: number[] = [];
  for (let k = 0; k < count && k < pool.length; k++) {
    const j = k + Math.floor(s.rng.combat.next() * (pool.length - k));
    const tmp = pool[k] as number;
    pool[k] = pool[j] as number;
    pool[j] = tmp;
    out.push(pool[k] as number);
  }
  return out;
}

/** A 2x2 block of cells that covers a random unit. */
export function pickHazardBlock(s: Sim): number[] {
  const pool = collectEligible(s);
  if (pool.length === 0) return [];
  const anchor = pool[Math.floor(s.rng.combat.next() * pool.length)] as number;
  const col = Math.min(Math.max(cellCol(anchor) - (s.rng.combat.next() < 0.5 ? 1 : 0), 0), COLS - 2);
  const row = Math.min(Math.max(cellRow(anchor) - (s.rng.combat.next() < 0.5 ? 1 : 0), 0), ROWS - 2);
  const out: number[] = [];
  for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) out.push(cellIndex(col + dc, row + dr));
  return out;
}

/** Announces a hazard now; the cells become hazardous after the warning delay. */
export function scheduleHazard(s: Sim, kind: HazardKind, cells: number[], duration: number): void {
  if (cells.length === 0) return;
  const startAt = s.time + HAZARD_WARNING;
  s.hazardBatches.push({ kind, cells, states: [], startAt, endAt: startAt + duration, duration, active: false });
  if (s.ev.has('hazardWarn')) s.ev.emit('hazardWarn', { cells, kind, delay: HAZARD_WARNING });
}

/**
 * The warning is over: the cells become hazardous. A cat a bell kitten covers (or the bell itself) rolls its dodge chance once per
 * cell; a dodged cell stays dry and is announced with a `dodge` event, so the batch ends up holding only the cells that were hit.
 */
function activate(s: Sim, b: HazardBatch): void {
  b.active = true;
  const wet: number[] = [];
  for (const cell of b.cells) {
    const unit = s.units[cell];
    if (unit && unit.dodge > 0 && s.rng.combat.next() < unit.dodge) {
      if (s.ev.has('dodge')) s.ev.emit('dodge', { unit, hazard: b.kind });
      continue;
    }
    const state: HazardState = { cell, kind: b.kind, timeLeft: b.duration, duration: b.duration };
    b.states.push(state);
    s.hazards.push(state);
    s.hazardCount[cell] = (s.hazardCount[cell] as number) + 1;
    wet.push(cell);
  }
  b.cells = wet;
  if (wet.length > 0 && s.ev.has('hazard')) s.ev.emit('hazard', { cells: wet, kind: b.kind, duration: b.duration });
}

function end(s: Sim, b: HazardBatch): void {
  for (const state of b.states) {
    const i = s.hazards.indexOf(state);
    if (i >= 0) s.hazards.splice(i, 1);
    s.hazardCount[state.cell] = (s.hazardCount[state.cell] as number) - 1;
  }
  if (b.cells.length > 0 && s.ev.has('hazardEnd')) s.ev.emit('hazardEnd', { cells: b.cells, kind: b.kind });
}

export function updateHazards(s: Sim): void {
  const batches = s.hazardBatches;
  const now = s.time;
  for (let i = batches.length - 1; i >= 0; i--) {
    const b = batches[i] as HazardBatch;
    if (!b.active) {
      if (now >= b.startAt) activate(s, b);
      else continue;
    }
    if (now >= b.endAt) {
      end(s, b);
      batches.splice(i, 1);
      continue;
    }
    const left = b.endAt - now;
    for (const state of b.states) state.timeLeft = left;
  }
}

/** Halves the attack speed of `unit` for `duration` seconds. */
export function weakenUnit(s: Sim, unit: SimUnit, duration: number, by: SimEnemy | null): void {
  if (duration > unit.weakened) unit.weakened = duration;
  if (s.ev.has('weaken')) s.ev.emit('weaken', { unit, duration, by });
}

/** The dryer targets the cat with the highest damage that is not already weakened. */
function weakenStrongest(s: Sim, duration: number, by: SimEnemy): void {
  let best: SimUnit | null = null;
  let fallback: SimUnit | null = null;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u) continue;
    if (!fallback || u.stats.damage > fallback.stats.damage) fallback = u;
    if (u.weakened <= 0 && (!best || u.stats.damage > best.stats.damage)) best = u;
  }
  const unit = best ?? fallback;
  if (!unit) return;
  weakenUnit(s, unit, duration, by);
  recomputeStats(s);
}

/** Weakens every cat (the vacuum boss). */
export function weakenAll(s: Sim, duration: number, by: SimEnemy): void {
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (u) weakenUnit(s, u, duration, by);
  }
  recomputeStats(s);
}

/** An enemy's own periodic ability: spray soaks a cell, dryer weakens a cat. */
export function pulseEnemy(s: Sim, e: SimEnemy): void {
  const rage = e.enraged ? ENRAGE_COOLDOWN_MULT : 1;
  const wet = e.spec.hazardPulse;
  const dry = e.spec.weakenPulse;
  if (wet) {
    scheduleHazard(s, wet.kind, pickHazardCells(s, wet.cells), wet.duration);
    e.pulseAt += wet.every * rage;
  } else if (dry) {
    weakenStrongest(s, dry.duration, e);
    e.pulseAt += dry.every * rage;
  }
}
