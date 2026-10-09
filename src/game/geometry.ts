/**
 * Battlefield geometry shared by the simulation and the renderer. Pure maths, no rendering imports.
 *
 * Field space: origin at the field's top-left corner, x right, y down, in design pixels. The board
 * (the rug) sits in the middle; enemies walk a clockwise rounded-rectangle loop on the floor around
 * it and keep circling until killed. `COLS`, `ROWS` and the cell size are the only numbers that
 * decide the size of the board and of the field: everything else (cell count, margins, the loop) follows.
 */
export const COLS = 5;
export const ROWS = 5;
export const CELL_COUNT = COLS * ROWS;
export const CELL_W = 108;
export const CELL_H = 96;

export const BOARD_W = COLS * CELL_W; // 540
export const BOARD_H = ROWS * CELL_H; // 480

/** The field is as wide as the screen's design width; the same floor margin runs round the board on every side. */
export const FIELD_W = 720;
export const BOARD_X = (FIELD_W - BOARD_W) / 2; // 90
export const BOARD_Y = BOARD_X; // 90
export const FIELD_H = BOARD_H + 2 * BOARD_Y; // 660: exactly the band between the HUD blocks on a 1280 screen

/** Centre line of the enemy loop: the middle of the floor margin. */
export const PATH_LEFT = BOARD_X / 2;
export const PATH_RIGHT = FIELD_W - PATH_LEFT;
export const PATH_TOP = BOARD_Y / 2;
export const PATH_BOTTOM = FIELD_H - PATH_TOP;
export const PATH_RADIUS = 36;
/** Visual width of the walkway the enemies use. */
export const LANE_WIDTH = 82;

const STRAIGHT_H = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS;
const STRAIGHT_V = PATH_BOTTOM - PATH_TOP - 2 * PATH_RADIUS;
const ARC = (Math.PI / 2) * PATH_RADIUS;

/** Total length of one lap in pixels. */
export const PATH_LENGTH = 2 * STRAIGHT_H + 2 * STRAIGHT_V + 4 * ARC;

export interface PathPoint {
  x: number;
  y: number;
  /** Direction of travel in radians (0 = +x, PI/2 = +y / down the screen). */
  angle: number;
}

/** Wrap any distance (including negative, e.g. after a pull-back) into [0, PATH_LENGTH). */
export function wrapPath(s: number): number {
  const m = s % PATH_LENGTH;
  return m < 0 ? m + PATH_LENGTH : m;
}

/**
 * Position on the loop at distance `s` from the spawn point. s = 0 is the start of the top edge
 * (just right of the top-left corner); travel is clockwise: right along the top, down the right
 * side, left along the bottom, up the left side. Writes into `out` when given (no allocation).
 */
export function pathPoint(s: number, out?: PathPoint): PathPoint {
  const p = out ?? { x: 0, y: 0, angle: 0 };
  let d = wrapPath(s);
  const r = PATH_RADIUS;

  // top edge, heading right
  if (d < STRAIGHT_H) {
    p.x = PATH_LEFT + r + d;
    p.y = PATH_TOP;
    p.angle = 0;
    return p;
  }
  d -= STRAIGHT_H;
  // top-right corner
  if (d < ARC) {
    const a = -Math.PI / 2 + d / r;
    p.x = PATH_RIGHT - r + Math.cos(a) * r;
    p.y = PATH_TOP + r + Math.sin(a) * r;
    p.angle = a + Math.PI / 2;
    return p;
  }
  d -= ARC;
  // right edge, heading down
  if (d < STRAIGHT_V) {
    p.x = PATH_RIGHT;
    p.y = PATH_TOP + r + d;
    p.angle = Math.PI / 2;
    return p;
  }
  d -= STRAIGHT_V;
  // bottom-right corner
  if (d < ARC) {
    const a = d / r;
    p.x = PATH_RIGHT - r + Math.cos(a) * r;
    p.y = PATH_BOTTOM - r + Math.sin(a) * r;
    p.angle = a + Math.PI / 2;
    return p;
  }
  d -= ARC;
  // bottom edge, heading left
  if (d < STRAIGHT_H) {
    p.x = PATH_RIGHT - r - d;
    p.y = PATH_BOTTOM;
    p.angle = Math.PI;
    return p;
  }
  d -= STRAIGHT_H;
  // bottom-left corner
  if (d < ARC) {
    const a = Math.PI / 2 + d / r;
    p.x = PATH_LEFT + r + Math.cos(a) * r;
    p.y = PATH_BOTTOM - r + Math.sin(a) * r;
    p.angle = a + Math.PI / 2;
    return p;
  }
  d -= ARC;
  // left edge, heading up
  if (d < STRAIGHT_V) {
    p.x = PATH_LEFT;
    p.y = PATH_BOTTOM - r - d;
    p.angle = -Math.PI / 2;
    return p;
  }
  d -= STRAIGHT_V;
  // top-left corner
  const a = Math.PI + d / r;
  p.x = PATH_LEFT + r + Math.cos(a) * r;
  p.y = PATH_TOP + r + Math.sin(a) * r;
  p.angle = a + Math.PI / 2;
  return p;
}

/** Shortest distance along the loop between two path positions (always >= 0, <= half a lap). */
export function pathGap(a: number, b: number): number {
  const d = Math.abs(wrapPath(a) - wrapPath(b));
  return d > PATH_LENGTH / 2 ? PATH_LENGTH - d : d;
}

export function cellIndex(col: number, row: number): number {
  return row * COLS + col;
}

export function cellCol(cell: number): number {
  return cell % COLS;
}

export function cellRow(cell: number): number {
  return Math.floor(cell / COLS);
}

export function cellCenterX(cell: number): number {
  return BOARD_X + (cellCol(cell) + 0.5) * CELL_W;
}

export function cellCenterY(cell: number): number {
  return BOARD_Y + (cellRow(cell) + 0.5) * CELL_H;
}

/** Cell under a field-space point, or -1 when the point is off the board. */
export function cellAt(x: number, y: number): number {
  if (x < BOARD_X || y < BOARD_Y || x >= BOARD_X + BOARD_W || y >= BOARD_Y + BOARD_H) return -1;
  const col = Math.floor((x - BOARD_X) / CELL_W);
  const row = Math.floor((y - BOARD_Y) / CELL_H);
  return cellIndex(col, row);
}

/** True for cells on the outer ring of the board (they touch the walkway). */
export function isEdgeCell(cell: number): boolean {
  const c = cellCol(cell);
  const r = cellRow(cell);
  return c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
}

/**
 * The cells a team effect (a bell kitten's attack speed and ward, a bard's damage) reaches from `cell`: every other cell within `reach`
 * cells in both directions, so reach 1 (the default, and what the cats' data asks for) is the 8 cells around it, diagonals included.
 * The simulation and the board's buff markers both read this one function, so changing the shape of those effects changes both.
 */
export function auraCells(cell: number, out: number[] = [], reach = 1): number[] {
  out.length = 0;
  const c = cellCol(cell);
  const r = cellRow(cell);
  for (let row = Math.max(0, r - reach); row <= Math.min(ROWS - 1, r + reach); row++) {
    for (let col = Math.max(0, c - reach); col <= Math.min(COLS - 1, c + reach); col++) {
      if (row !== r || col !== c) out.push(cellIndex(col, row));
    }
  }
  return out;
}

/** Up / down / left / right neighbours. Appends into `out` when given and returns it. */
export function neighbors4(cell: number, out: number[] = []): number[] {
  out.length = 0;
  const c = cellCol(cell);
  const r = cellRow(cell);
  if (r > 0) out.push(cell - COLS);
  if (r < ROWS - 1) out.push(cell + COLS);
  if (c > 0) out.push(cell - 1);
  if (c < COLS - 1) out.push(cell + 1);
  return out;
}
