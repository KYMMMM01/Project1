import { describe, expect, it } from 'vitest';
import { CHAPTER_COUNT } from '@/game/data/balance';
import { MAX_STAKE } from '@/game/data/roster';
import { CELL_COUNT, COLS, ROWS } from '@/game/geometry';
import { Hit } from '@/ui/theme';
import { DESIGN_W } from '@/core/game';
import { allCells, cellBox, cellForWidth, diagramSize } from '@/codex/diagramMath';
import { PAD } from '@/codex/parts';

describe('codex board diagrams', () => {
  it('lays the cells out on a grid that fills the size it reports, with no two cells touching', () => {
    const { cell, gap } = cellForWidth(280);
    const size = diagramSize(cell, gap);
    expect(size.w).toBeCloseTo(280, 9);
    expect(size.h).toBeCloseTo(ROWS * cell + (ROWS - 1) * gap, 9);
    const boxes = allCells().map((c) => cellBox(c, cell, gap));
    expect(boxes).toHaveLength(CELL_COUNT);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(size.w + 1e-9);
      expect(b.y + b.h).toBeLessThanOrEqual(size.h + 1e-9);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as ReturnType<typeof cellBox>;
        const b = boxes[j] as ReturnType<typeof cellBox>;
        const apart = a.x + a.w <= b.x - gap / 2 || b.x + b.w <= a.x - gap / 2 || a.y + a.h <= b.y - gap / 2 || b.y + b.h <= a.y - gap / 2;
        expect(apart, `${i} and ${j}`).toBe(true);
      }
    }
    expect(boxes[COLS]?.y).toBeGreaterThan(boxes[0]?.y ?? 0);
  });
});

describe('codex selector', () => {
  it('gives every chapter tab and every butler-level tab the width of a touch target', () => {
    // The segmented control spaces its tabs over its width minus 12 px; the selector's tabs span the sheet's inside.
    const inside = DESIGN_W - 24 * 2 - PAD * 2;
    expect((inside - 12) / CHAPTER_COUNT).toBeGreaterThanOrEqual(Hit.min);
    expect((inside - 12) / (MAX_STAKE + 1)).toBeGreaterThanOrEqual(Hit.min);
  });
});
