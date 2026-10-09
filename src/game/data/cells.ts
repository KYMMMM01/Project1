/**
 * The special board cells (rules v1.5, section 6). Every chapter plays with one kind: five cells on the board that give the cat standing
 * on them ONE bonus of about the same worth (+20% of attack speed, damage, crit chance or range, or a trickle of 0.15 fish a second for each
 * cat: the bot runs of chapter 1 at stake 3 measured it as worth the same as the sunbeam, see docs/handoff/sim.md). The living room keeps
 * the sunbeam; the kitchen, the bathroom, the garden and the vet each have their own. Daily, endless and gold runs use the kind of the
 * chapter they play.
 */
import { SPECIAL_CELL_IDS, type SpecialCellId } from '../api';
import { t } from '@/core/i18n';
import { CHAPTERS } from './roster';
import './strings';

/** What a special cell gives the cat on it: attack speed, damage, crit chance (points), range, or fish per second for the cat itself. */
export type SpecialCellStat = 'speed' | 'damage' | 'crit' | 'range' | 'fish';

export interface SpecialCellSpec {
  id: SpecialCellId;
  /** i18n keys `cell.<id>.name` and `cell.<id>.desc` (the sentence holds the number). */
  nameKey: string;
  descKey: string;
  stat: SpecialCellStat;
  /** A fraction for speed, damage, crit and range (0.2 = +20%); fish per second and cat for the treat cell (0.15). */
  value: number;
}

function cell(id: SpecialCellId, stat: SpecialCellStat, value: number): SpecialCellSpec {
  return { id, nameKey: `cell.${id}.name`, descKey: `cell.${id}.desc`, stat, value };
}

export const SPECIAL_CELLS: Readonly<Record<SpecialCellId, SpecialCellSpec>> = {
  sun: cell('sun', 'speed', 0.2),
  bowl: cell('bowl', 'damage', 0.2),
  bubble: cell('bubble', 'crit', 0.2),
  stump: cell('stump', 'range', 0.2),
  treat: cell('treat', 'fish', 0.15),
};

export function specialCellSpec(id: SpecialCellId): SpecialCellSpec {
  return SPECIAL_CELLS[id];
}

export function allSpecialCells(): SpecialCellSpec[] {
  return SPECIAL_CELL_IDS.map((id) => SPECIAL_CELLS[id]);
}

/** The special cell of chapter 1..5 (anything else is clamped). */
export function specialCellOf(chapter: number): SpecialCellSpec {
  const info = CHAPTERS[Math.min(Math.max(Math.floor(chapter) || 1, 1), CHAPTERS.length) - 1];
  return SPECIAL_CELLS[(info as (typeof CHAPTERS)[number]).cell];
}

/** The number a cell's sentence shows for `value`: percent (or points) for the stats, fish per second with two decimals for the trickle. */
export function cellShown(spec: SpecialCellSpec, value: number = spec.value): number {
  return spec.stat === 'fish' ? Math.round(value * 100) / 100 : Math.round(value * 100);
}

export function specialCellName(id: SpecialCellId): string {
  return t(SPECIAL_CELLS[id].nameKey);
}

/** What the cell does in words, with its real number; `extra` is what toys add to it (the prime spot toy). */
export function specialCellText(id: SpecialCellId, extra = 0): string {
  const spec = SPECIAL_CELLS[id];
  return t(spec.descKey, { a: cellShown(spec, spec.value + extra) });
}
