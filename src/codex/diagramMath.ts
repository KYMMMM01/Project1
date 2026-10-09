/** Where the cells of a board diagram lie: a grid of `cell` px squares `gap` px apart, origin at the top-left cell's corner. */
import { CELL_COUNT, COLS, ROWS, cellCol, cellRow } from '@/game/geometry';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function diagramSize(cell: number, gap: number): { w: number; h: number } {
  return { w: COLS * cell + (COLS - 1) * gap, h: ROWS * cell + (ROWS - 1) * gap };
}

export function cellBox(index: number, cell: number, gap: number): Box {
  return { x: cellCol(index) * (cell + gap), y: cellRow(index) * (cell + gap), w: cell, h: cell };
}

/** The cell size that makes a diagram `width` px wide (the cells' gaps are a tenth of a cell). */
export function cellForWidth(width: number): { cell: number; gap: number } {
  const unit = width / (COLS + (COLS - 1) / 10);
  return { cell: unit, gap: unit / 10 };
}

export function allCells(): number[] {
  return Array.from({ length: CELL_COUNT }, (_, i) => i);
}
