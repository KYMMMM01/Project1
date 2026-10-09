/**
 * The small board diagrams of the codex, as pure data: which cells of the 5 x 5 board a toy, a chapter's special cell, a hazard or a cat's aura marks,
 * read from the same functions the simulation and the battle's own markers use (`toyCells`, `auraCells`, `isEdgeCell` ...), so a diagram
 * cannot disagree with the game. The lane diagram samples the real loop (`pathPoint`).
 */
import { CLASS_IDS, SPECIAL_CELL_IDS, type RelicId, type SpecialCellId, type UnitId } from '@/game/api';
import { FIRST_SUN_CELLS, HAZARD_BLOCK_SIDE } from '@/game/data/balance';
import { BOSS_SPECS } from '@/game/data/enemies';
import { unitClass } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import {
  BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT, COLS, FIELD_H, FIELD_W, LANE_WIDTH, PATH_LENGTH, ROWS, auraCells, cellIndex, pathPoint,
} from '@/game/geometry';
import { toyCells, toyShape } from '@/view/field/toyCells';

/** What a marked cell is: each tone has its own colour and, where it helps, its own glyph. */
export type Tone = 'cell' | 'wet' | 'zap' | 'row' | 'ring' | 'pair' | 'aura' | 'self';

export interface CatMark {
  cell: number;
  unit: UnitId;
}

export interface BoardDiagram {
  /** One entry per cell in board order: the tone of the mark on it, or null. */
  tones: ReadonlyArray<Tone | null>;
  /** Which chapter's special cell the `cell` tone is (its tile picture is drawn there). */
  cell?: SpecialCellId;
  /** The cats standing on the example board. */
  cats: ReadonlyArray<CatMark>;
}

function tonesOf(marks: ReadonlyArray<readonly [cells: readonly number[], tone: Tone]>): Tone[] {
  const out = new Array<Tone | null>(CELL_COUNT).fill(null) as Tone[];
  for (const [cells, tone] of marks) for (const c of cells) out[c] = tone;
  return out;
}

/** The middle cell: what an aura example is centred on. */
export const MIDDLE_CELL = cellIndex(Math.floor(COLS / 2), Math.floor(ROWS / 2));

/** The cats of the pair example: two warriors side by side (they boost each other), a ranger and a mage that stand beside no one of their class. */
const PAIR_CATS: ReadonlyArray<CatMark> = [
  { cell: cellIndex(1, 2), unit: 'w_paw' },
  { cell: cellIndex(2, 2), unit: 'w_sword' },
  { cell: cellIndex(3, 3), unit: 'r_archer' },
  { cell: cellIndex(1, 1), unit: 'm_snow' },
];

/** The class of the cat standing in a cell of an example, or -1: the shape `toyCells` asks for. */
function classAtOf(cats: ReadonlyArray<CatMark>): (cell: number) => number {
  const byCell = new Map(cats.map((c) => [c.cell, CLASS_IDS.indexOf(unitClass(c.unit))]));
  return (cell) => byCell.get(cell) ?? -1;
}

/** The cells of a toy's diagram: only a toy whose effect depends on where a cat stands has one. */
export function toyBoard(id: RelicId): BoardDiagram | null {
  const shape = toyShape(id);
  if (shape === null) return null;
  const cats = shape === 'pairs' ? PAIR_CATS : [];
  const cells: number[] = [];
  toyCells(id, classAtOf(cats), cells);
  return { tones: tonesOf([[cells, shape === 'row' ? 'row' : shape === 'ring' ? 'ring' : 'pair']]), cats };
}

/** The kinds of board cell the codex explains. */
export const CELL_KINDS = ['plain', ...SPECIAL_CELL_IDS, 'wet', 'zap', 'tower', 'perch', 'cushion', 'bard', 'bell', 'lane'] as const;
export type CellKind = (typeof CELL_KINDS)[number];

/** The toy whose cells a toy-boosted kind shows. */
const TOY_OF_CELL: Readonly<Partial<Record<CellKind, RelicId>>> = { tower: 'cat_tower', perch: 'window_perch', cushion: 'kneading_cushion' };

/** The cells of an aura's example: the cat in the middle and the cells its team effect reaches. */
export function auraBoard(unit: UnitId): BoardDiagram {
  const reach = unitSpec(unit).aura.reach ?? 1;
  const around = auraCells(MIDDLE_CELL, [], reach);
  const tones = tonesOf([[around, 'aura'], [[MIDDLE_CELL], 'self']]);
  return { tones, cats: [{ cell: MIDDLE_CELL, unit }] };
}

/** A block of `side` x `side` cells with its upper left corner at (col, row). */
function blockCells(col: number, row: number, side: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < side; r++) for (let c = 0; c < side; c++) out.push(cellIndex(col + c, row + r));
  return out;
}

/** The diagram of a cell kind (the lane has its own). */
export function cellBoard(kind: Exclude<CellKind, 'lane'>): BoardDiagram {
  switch (kind) {
    case 'plain':
      return { tones: tonesOf([]), cats: [{ cell: MIDDLE_CELL, unit: 'w_sword' }] };
    case 'sun':
    case 'bowl':
    case 'bubble':
    case 'stump':
    case 'treat':
      return { tones: tonesOf([[FIRST_SUN_CELLS, 'cell']]), cell: kind, cats: [{ cell: MIDDLE_CELL, unit: 'r_archer' }] };
    case 'wet': {
      const n = BOSS_SPECS.splash.soakCells;
      const cells = Array.from({ length: n }, (_, i) => cellIndex(1 + i, ROWS - 2));
      return { tones: tonesOf([[cells, 'wet']]), cats: cells.map((cell) => ({ cell, unit: 'r_archer' as const })) };
    }
    case 'zap': {
      const cells = blockCells(1, 1, HAZARD_BLOCK_SIDE);
      return { tones: tonesOf([[cells, 'zap']]), cats: [{ cell: cells[0] as number, unit: 'm_snow' }, { cell: cells[cells.length - 1] as number, unit: 'w_paw' }] };
    }
    case 'tower':
    case 'perch':
    case 'cushion':
      return toyBoard(TOY_OF_CELL[kind] as RelicId) as BoardDiagram;
    case 'bard':
      return auraBoard('t_bard');
    case 'bell':
      return auraBoard('t_bell');
  }
}

// ───────────────────────────── the lane ─────────────────────────────

export interface LaneDiagram {
  /** The field the lane lies in, and the board in its middle (field pixels). */
  field: { w: number; h: number };
  board: { x: number; y: number; w: number; h: number };
  /** The loop's centre line, flat [x0, y0, x1, y1, ...], closed. */
  loop: number[];
  laneWidth: number;
  /** Where an enemy enters (the start of the loop) and which way it faces. */
  entrance: { x: number; y: number; angle: number };
  /** Direction markers along the loop. */
  arrows: Array<{ x: number; y: number; angle: number }>;
  /** Where an example zone lies: on the lane, at the enemy that was aimed at, and how far it reaches (the blizzard's radius). */
  zone: { x: number; y: number; radius: number };
}

const LANE_SAMPLES = 96;

/** The reach of the mages' blizzard: the zone the lane diagram draws. */
function blizzardRadius(): number {
  const attack = unitSpec('m_frost').attack;
  return attack.shape === 'frost' ? attack.radius : 0;
}
const LANE_ARROWS = 8;

export function laneDiagram(): LaneDiagram {
  const loop: number[] = [];
  for (let i = 0; i < LANE_SAMPLES; i++) {
    const p = pathPoint((PATH_LENGTH * i) / LANE_SAMPLES);
    loop.push(p.x, p.y);
  }
  const start = pathPoint(0);
  const arrows = Array.from({ length: LANE_ARROWS }, (_, i) => {
    const p = pathPoint((PATH_LENGTH * (i + 0.5)) / LANE_ARROWS);
    return { x: p.x, y: p.y, angle: p.angle };
  });
  const z = pathPoint(PATH_LENGTH * 0.34);
  return {
    field: { w: FIELD_W, h: FIELD_H },
    board: { x: BOARD_X, y: BOARD_Y, w: BOARD_W, h: BOARD_H },
    loop,
    laneWidth: LANE_WIDTH,
    entrance: { x: start.x, y: start.y, angle: start.angle },
    arrows,
    zone: { x: z.x, y: z.y, radius: blizzardRadius() },
  };
}
