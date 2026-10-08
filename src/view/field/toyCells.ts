/**
 * Which cells of the board a toy boosts, as pure maths (no Pixi): the top row's tower, the outer ring's window perch and the pairs of
 * the kneading cushion. The field marks exactly these cells (`toyMarks.ts`) so the player can see where a toy works, not only read it.
 * A toy is positional when its effect is keyed to where a cat stands: that is read off the toy's own data (`fx.topRow*`, `fx.edgeSpeed`,
 * `fx.sameClassNeighbourDamage`), so a toy added to the data with one of those effects is marked without a line here. The sunny spot
 * has its own mark (the sunbeam cells) and is not one of these.
 */
import { relicSpec } from '@/game';
import type { RelicId } from '@/game/api';
import { CELL_COUNT, cellRow, isEdgeCell, neighbors4 } from '@/game/geometry';
import { Color } from '@/ui/theme';

/** Where the effect lies: a whole row, the outer ring of the board, or the cats that stand beside one of their own class. */
export type ToyShape = 'row' | 'ring' | 'pairs';

export const TOY_SHAPES: readonly ToyShape[] = ['row', 'ring', 'pairs'];

/** The most positional toys marked at once: the marks of more than this stack no further (the fourth would draw over the third). */
export const MAX_TOYS = 3;

/** Each toy's own colour: warm for the tower, violet for the perch, green for the cushion; none is the sun's mustard or the cell cues' teal. */
const COLOR: Readonly<Record<ToyShape, number>> = { row: Color.coral, ring: Color.violet, pairs: Color.leaf };

/** What the toy is, or null when its effect does not depend on where a cat stands. */
export function toyShape(id: RelicId): ToyShape | null {
  const fx = relicSpec(id).fx;
  if (fx.topRowDamage || fx.topRowRange) return 'row';
  if (fx.edgeSpeed) return 'ring';
  if (fx.sameClassNeighbourDamage) return 'pairs';
  return null;
}

/** The colour of the marks of a toy of this shape. */
export function toyColor(shape: ToyShape): number {
  return COLOR[shape];
}

/** The positional toys among `relics`, each once, in the order they were picked, at most `MAX_TOYS`. */
export function positionalToys(relics: ReadonlyArray<RelicId>, out: RelicId[]): RelicId[] {
  out.length = 0;
  for (const id of relics) {
    if (out.length >= MAX_TOYS) break;
    if (toyShape(id) !== null && !out.includes(id)) out.push(id);
  }
  return out;
}

const near: number[] = [];

/**
 * Whether the toy of `shape` boosts `cell` now. `classAt(cell)` is the class of the cat standing in a cell, or -1 for an empty one: a row
 * and the ring are marked whether or not a cat stands there (the player is told where to put one), the pairs only where a cat does.
 */
export function boosts(shape: ToyShape, cell: number, classAt: (cell: number) => number): boolean {
  switch (shape) {
    case 'row':
      return cellRow(cell) === 0;
    case 'ring':
      return isEdgeCell(cell);
    case 'pairs': {
      const mine = classAt(cell);
      if (mine < 0) return false;
      neighbors4(cell, near);
      for (const n of near) if (classAt(n) === mine) return true;
      return false;
    }
  }
}

/** The cells a toy boosts, in board order, appended to `out` (cleared first). */
export function toyCells(id: RelicId, classAt: (cell: number) => number, out: number[]): number[] {
  out.length = 0;
  const shape = toyShape(id);
  if (shape === null) return out;
  for (let c = 0; c < CELL_COUNT; c++) if (boosts(shape, c, classAt)) out.push(c);
  return out;
}

/**
 * Fill `cover` (`CELL_COUNT * MAX_TOYS` flags) with which of `toys` boost which cell: `cover[cell * MAX_TOYS + k]` is 1 when toy `k` does.
 * Returns how many cells at least one toy boosts.
 */
export function coverage(toys: readonly RelicId[], classAt: (cell: number) => number, cover: Uint8Array): number {
  cover.fill(0);
  let cells = 0;
  for (let c = 0; c < CELL_COUNT; c++) {
    let any = false;
    for (let k = 0; k < toys.length; k++) {
      const shape = toyShape(toys[k] as RelicId);
      if (shape !== null && boosts(shape, c, classAt)) {
        cover[c * MAX_TOYS + k] = 1;
        any = true;
      }
    }
    if (any) cells++;
  }
  return cells;
}

/** How many of the toys before `k` also boost `cell`: the depth its frame is drawn at (0 outermost), so toys on one cell nest in the order they were picked. */
export function depthOf(cover: Uint8Array, cell: number, k: number): number {
  let depth = 0;
  for (let j = 0; j < k; j++) depth += cover[cell * MAX_TOYS + j] as number;
  return depth;
}
