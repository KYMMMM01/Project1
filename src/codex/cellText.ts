/** The words of a board-cell page: its name and its text with the numbers of cells.ts filled in. */
import { t } from '@/core/i18n';
import './strings';
import { cellFacts } from './cells';
import type { CellKind } from './boards';

export interface CellPage {
  kind: CellKind;
  name: string;
  text: string;
}

export function cellPage(kind: CellKind): CellPage {
  return { kind, name: t(`codex.cell.${kind}.name`), text: t(`codex.cell.${kind}.text`, cellFacts(kind)) };
}
