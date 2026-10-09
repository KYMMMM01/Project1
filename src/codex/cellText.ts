/** The words of a board-cell page: its name and its text with the numbers of cells.ts filled in. */
import { t } from '@/core/i18n';
import './strings';
import { SPECIAL_CELL_IDS, type SpecialCellId } from '@/game/api';
import { specialCellName } from '@/game/data/cells';
import { cellFacts } from './cells';
import type { CellKind } from './boards';

export interface CellPage {
  kind: CellKind;
  name: string;
  text: string;
}

export const isSpecialCell = (kind: CellKind): kind is SpecialCellId => (SPECIAL_CELL_IDS as readonly string[]).includes(kind);

/** The text key of a kind: the five chapter cells share one sentence (their names and numbers come from the cell data). */
export function cellTextKey(kind: CellKind): string {
  return isSpecialCell(kind) ? 'codex.cell.special.text' : `codex.cell.${kind}.text`;
}

export function cellPage(kind: CellKind): CellPage {
  return { kind, name: isSpecialCell(kind) ? specialCellName(kind) : t(`codex.cell.${kind}.name`), text: t(cellTextKey(kind), cellFacts(kind)) };
}
