import { describe, expect, it } from 'vitest';
import { FIRST_SUN_CELLS, SUN_CELLS } from '@/game/data/balance';
import { modifierSpec } from '@/game/data/modifiers';
import { unitSpec } from '@/game/data/units';
import { UNIT_IDS, type UnitId } from '@/game/api';
import {
  BOARD_H,
  BOARD_W,
  BOARD_X,
  BOARD_Y,
  CELL_COUNT,
  CELL_H,
  CELL_W,
  COLS,
  FIELD_H,
  FIELD_W,
  LANE_WIDTH,
  PATH_BOTTOM,
  PATH_LEFT,
  PATH_LENGTH,
  PATH_RADIUS,
  PATH_RIGHT,
  PATH_TOP,
  ROWS,
  auraCells,
  cellAt,
  cellCenterX,
  cellCenterY,
  cellCol,
  cellIndex,
  cellRow,
  isEdgeCell,
  neighbors4,
  pathPoint,
} from '@/game/geometry';
import { createBot } from '@/game/sim/bots';
import { pickHazardBlock } from '@/game/sim/hazards';
import { parseSnapshot } from '@/game/sim/snapshot';
import { BOTTOM_PANEL_H, TOP_HUD_H, computeBattleLayout } from '@/view/layout';
import { CLASS_AT, FEET_DY, RANK_AT, unitSpriteScale } from '@/view/field/unitView';
import { advance, newSim, put } from './simHelpers';

describe('the board is 5 columns by 5 rows, from ROWS and COLS alone', () => {
  it('has 25 cells and a field that is the board plus the same floor margin on every side', () => {
    expect([COLS, ROWS, CELL_COUNT]).toEqual([5, 5, 25]);
    expect(BOARD_W).toBe(COLS * CELL_W);
    expect(BOARD_H).toBe(ROWS * CELL_H);
    expect(BOARD_X).toBe((FIELD_W - BOARD_W) / 2);
    expect(BOARD_Y).toBe(BOARD_X);
    expect(FIELD_H).toBe(BOARD_H + 2 * BOARD_Y);
    expect(FIELD_H).toBe(660);
  });

  it('fills the band between the two HUD blocks of a 1280 screen exactly, and spreads the spare height of a taller one', () => {
    const l = computeBattleLayout(720, 1280, 0, 0);
    expect(l.fieldY).toBe(TOP_HUD_H);
    expect(l.fieldY + FIELD_H).toBe(1280 - BOTTOM_PANEL_H);
    const tall = computeBattleLayout(720, 1600, 0, 0);
    expect(tall.fieldY - TOP_HUD_H).toBe(1600 - BOTTOM_PANEL_H - (tall.fieldY + FIELD_H));
    expect(tall.fieldY - TOP_HUD_H).toBe(160);
  });

  it('numbers the cells row by row and finds each one again from its middle, and from nowhere off the board', () => {
    for (let c = 0; c < CELL_COUNT; c++) {
      expect(cellIndex(cellCol(c), cellRow(c))).toBe(c);
      expect(cellAt(cellCenterX(c), cellCenterY(c))).toBe(c);
      expect(cellAt(cellCenterX(c) - CELL_W / 2 + 0.5, cellCenterY(c) - CELL_H / 2 + 0.5)).toBe(c);
    }
    expect(cellCenterY(CELL_COUNT - 1)).toBe(BOARD_Y + BOARD_H - CELL_H / 2);
    expect(cellAt(BOARD_X - 1, BOARD_Y + 10)).toBe(-1);
    expect(cellAt(BOARD_X + BOARD_W, BOARD_Y + 10)).toBe(-1);
    expect(cellAt(BOARD_X + 10, BOARD_Y - 1)).toBe(-1);
    expect(cellAt(BOARD_X + 10, BOARD_Y + BOARD_H)).toBe(-1);
  });

  it('has an outer ring of 16 cells and a middle of 9, and cells that touch 2, 3 or 4 others', () => {
    const ring = Array.from({ length: CELL_COUNT }, (_, c) => c).filter(isEdgeCell);
    expect(ring.length).toBe(16);
    expect(CELL_COUNT - ring.length).toBe(9);
    for (let c = 0; c < CELL_COUNT; c++) {
      const near = neighbors4(c, []);
      const corner = (cellCol(c) === 0 || cellCol(c) === COLS - 1) && (cellRow(c) === 0 || cellRow(c) === ROWS - 1);
      expect(near.length, `cell ${c}`).toBe(corner ? 2 : isEdgeCell(c) ? 3 : 4);
      for (const n of near) expect(neighbors4(n, [])).toContain(c);
    }
  });

  it('gives the effect of a bell or a bard to the cells `auraCells` lists, all of them on the board', () => {
    for (let c = 0; c < CELL_COUNT; c++) {
      const cells = auraCells(c, []);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells).not.toContain(c);
      for (const n of cells) expect(n >= 0 && n < CELL_COUNT).toBe(true);
    }
  });
});

describe('the loop round the board', () => {
  it('runs along the middle of the floor margin on every side, with the walkway inside the field', () => {
    expect([PATH_LEFT, FIELD_W - PATH_RIGHT]).toEqual([BOARD_X / 2, BOARD_X / 2]);
    expect([PATH_TOP, FIELD_H - PATH_BOTTOM]).toEqual([BOARD_Y / 2, BOARD_Y / 2]);
    for (const edge of [PATH_LEFT, PATH_TOP, FIELD_W - PATH_RIGHT, FIELD_H - PATH_BOTTOM]) expect(edge - LANE_WIDTH / 2).toBeGreaterThanOrEqual(0);
    // The walkway does not run under the cells.
    expect(PATH_LEFT + LANE_WIDTH / 2).toBeLessThanOrEqual(BOARD_X);
    expect(PATH_TOP + LANE_WIDTH / 2).toBeLessThanOrEqual(BOARD_Y);
  });

  it('is 2338 px long, 68 px more than it was round the 5 x 4 board, and comes back to where it started', () => {
    const straightH = PATH_RIGHT - PATH_LEFT - 2 * PATH_RADIUS;
    const straightV = PATH_BOTTOM - PATH_TOP - 2 * PATH_RADIUS;
    expect(PATH_LENGTH).toBeCloseTo(2 * straightH + 2 * straightV + 2 * Math.PI * PATH_RADIUS, 9);
    expect(PATH_LENGTH).toBeCloseTo(2338.19, 2);
    expect(PATH_LENGTH - 2270.19).toBeCloseTo(68, 1);
    const start = pathPoint(0);
    const end = pathPoint(PATH_LENGTH);
    expect(end.x).toBeCloseTo(start.x, 6);
    expect(end.y).toBeCloseTo(start.y, 6);
    for (let s = 0; s < PATH_LENGTH; s += 7) {
      const p = pathPoint(s);
      expect(p.x).toBeGreaterThanOrEqual(PATH_LEFT - 1e-9);
      expect(p.x).toBeLessThanOrEqual(PATH_RIGHT + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(PATH_TOP - 1e-9);
      expect(p.y).toBeLessThanOrEqual(PATH_BOTTOM + 1e-9);
    }
  });
});

describe('the sunbeams on a board of 25', () => {
  it('are a fifth of the board, as they were, and the first ones are a plus on the middle cell', () => {
    expect(SUN_CELLS / CELL_COUNT).toBeCloseTo(0.2, 9);
    expect(FIRST_SUN_CELLS.length).toBe(SUN_CELLS);
    expect(new Set(FIRST_SUN_CELLS).size).toBe(SUN_CELLS);
    const middle = cellIndex(2, 2);
    expect([...FIRST_SUN_CELLS].sort((a, b) => a - b)).toEqual([middle, ...neighbors4(middle, [])].sort((a, b) => a - b));
  });

  it('are twice as many on a sunny day, the same share of the board as before', () => {
    expect(modifierSpec('sunny_day').sunCells).toBe(2 * SUN_CELLS);
    expect(modifierSpec('sunny_day').args.a).toBe(2 * SUN_CELLS);
  });
});

describe('a hazard block of 2 x 2', () => {
  it('is four cells of the board that cover the cat it was drawn for, in every corner and on every edge', () => {
    const spots = [0, COLS - 1, CELL_COUNT - COLS, CELL_COUNT - 1, 2, 12, 22, 10, 14];
    for (const spot of spots) {
      const sim = newSim();
      put(sim, spot, 'w_paw');
      for (let i = 0; i < 40; i++) {
        const block = pickHazardBlock(sim);
        expect(block.length, `spot ${spot}`).toBe(4);
        expect(block).toContain(spot);
        for (const c of block) expect(c >= 0 && c < CELL_COUNT).toBe(true);
        expect(new Set(block.map(cellCol)).size).toBe(2);
        expect(new Set(block.map(cellRow)).size).toBe(2);
      }
    }
  });
});

describe('a saved run of the 5 x 4 board', () => {
  it('is not taken for a run of this one', () => {
    const sim = newSim();
    advance(sim, 3.05 + 15 * 2 + 0.2);
    const snap = sim.snapshot();
    expect(snap).not.toBeNull();
    const data = JSON.parse((snap as { data: string }).data) as { units: unknown[] };
    expect(data.units.length).toBe(CELL_COUNT);
    expect(parseSnapshot(snap as never)).not.toBeNull();
    const old = { ...(snap as { simVersion: number; wave: number; data: string }), data: JSON.stringify({ ...data, units: data.units.slice(0, 20) }) };
    expect(parseSnapshot(old)).toBeNull();
  });
});

describe('the bots count the board by its size', () => {
  it('count ten cats as ten and upgrade their class, which a count taken from 20 cells would have called five', () => {
    // Kings and guardians never merge: the bot's own merging cannot thin the crowd out before it counts it.
    const unmergeable: UnitId[] = UNIT_IDS.filter((id) => unitSpec(id).rarity === 'legendary' || unitSpec(id).rarity === 'mythic');
    const sim = newSim();
    for (let c = 0; c < 10; c++) put(sim, c, unmergeable[c % unmergeable.length] as UnitId);
    sim.fish = 1_000_000;
    sim.purr = 0;
    const levels = (): number => (['warrior', 'ranger', 'mage', 'trickster'] as const).reduce((n, id) => n + sim.classUpgradeLevel(id), 0);
    const before = levels();
    createBot('synergy', 3).act(sim);
    expect(levels()).toBeGreaterThan(before);
  });
});

describe('a cat and its stickers fit a 96 px cell', () => {
  it('stands with its rank tag inside the cell, and the tallest cat reaches no more than 16 px above it', () => {
    expect(FEET_DY + RANK_AT + 13).toBeLessThanOrEqual(CELL_H / 2);
    for (const id of UNIT_IDS) {
      const height = unitSpriteScale(id, 100) * 100;
      expect(FEET_DY - height, id).toBeGreaterThanOrEqual(-(CELL_H / 2) - 16);
      expect(height, id).toBeGreaterThan(CELL_H * 0.78);
    }
  });

  it('keeps its class sticker above the rank tag, on its left', () => {
    expect(CLASS_AT.x).toBeLessThan(0);
    expect(CLASS_AT.y + 16).toBeLessThanOrEqual(RANK_AT - 13 + 10);
  });
});
