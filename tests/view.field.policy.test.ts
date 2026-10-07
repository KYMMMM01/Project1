import { describe, expect, it } from 'vitest';
import { FIELD_H, PATH_LENGTH, cellCenterX, cellCenterY, pathPoint } from '@/game/geometry';
import {
  DRAG_THRESHOLD,
  barSegments,
  classifyPoint,
  decideRelease,
  decideTap,
  dropLook,
  isDrag,
  isSellZone,
  LIFT_EDGE,
  liftsAboveHud,
  pathDistance,
  unitTint,
  depthFrame,
  depthKey,
} from '@/view/field/policy';

describe('drag threshold', () => {
  it('treats small jitter as a tap and a real move as a drag', () => {
    expect(isDrag(3, 4)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD + 1, 0)).toBe(true);
    expect(isDrag(8, 8)).toBe(true);
  });

  it('sells only below the field edge', () => {
    expect(isSellZone(FIELD_H)).toBe(false);
    expect(isSellZone(FIELD_H + 1)).toBe(true);
  });
});

describe('field areas', () => {
  it('measures zero distance on the enemy loop', () => {
    for (let s = 0; s < PATH_LENGTH; s += 37) {
      const p = pathPoint(s);
      expect(pathDistance(p.x, p.y)).toBeLessThan(0.01);
    }
  });

  it('grows with the offset from the loop, inside and outside', () => {
    const p = pathPoint(300);
    expect(pathDistance(p.x, p.y + 20)).toBeCloseTo(20, 4);
    expect(pathDistance(p.x, p.y - 20)).toBeCloseTo(20, 4);
  });

  it('classifies board, walkway, floor and outside', () => {
    expect(classifyPoint(cellCenterX(7), cellCenterY(7))).toBe('board');
    const lane = pathPoint(500);
    expect(classifyPoint(lane.x, lane.y)).toBe('walkway');
    expect(classifyPoint(2, 2)).toBe('floor');
    expect(classifyPoint(300, FIELD_H + 40)).toBe('outside');
    expect(classifyPoint(-5, 100)).toBe('outside');
  });
});

describe('tap decisions', () => {
  it('selects an occupied cell when nothing is selected and ignores an empty one', () => {
    expect(decideTap(null, 3, true, null)).toEqual({ kind: 'select', cell: 3 });
    expect(decideTap(null, 3, false, null)).toEqual({ kind: 'none' });
  });

  it('deselects when the selected cell is tapped again', () => {
    expect(decideTap(4, 4, true, null)).toEqual({ kind: 'deselect' });
  });

  it('finishes a move or a merge with a tap', () => {
    expect(decideTap(4, 9, false, 'move')).toEqual({ kind: 'drop', from: 4, to: 9 });
    expect(decideTap(4, 9, true, 'merge')).toEqual({ kind: 'drop', from: 4, to: 9 });
  });

  it('never swaps on a tap: another cat is selected so its sheet can be read', () => {
    expect(decideTap(4, 9, true, 'swap')).toEqual({ kind: 'select', cell: 9 });
  });

  it('moves the selection to another unit when the drop would do nothing, else deselects', () => {
    expect(decideTap(4, 9, true, 'none')).toEqual({ kind: 'select', cell: 9 });
    expect(decideTap(4, 9, false, 'none')).toEqual({ kind: 'deselect' });
  });
});

describe('cats above the HUD', () => {
  it('lifts a held, a sold and a below-the-field cat, and nothing on the board', () => {
    expect(liftsAboveHud(true, false, 200)).toBe(true);
    expect(liftsAboveHud(false, true, 200)).toBe(true);
    expect(liftsAboveHud(false, false, FIELD_H + 60)).toBe(true);
    expect(liftsAboveHud(false, false, FIELD_H - LIFT_EDGE + 1)).toBe(true);
    expect(liftsAboveHud(false, false, 480)).toBe(false);
  });
});

describe('release decisions', () => {
  it('sells over the sell zone regardless of the cell', () => {
    expect(decideRelease(2, 7, true, 'move')).toEqual({ kind: 'sell' });
  });

  it('drops onto a valid cell and cancels everywhere else', () => {
    expect(decideRelease(2, 7, false, 'merge')).toEqual({ kind: 'drop', to: 7 });
    expect(decideRelease(2, 2, false, null)).toEqual({ kind: 'cancel' });
    expect(decideRelease(2, -1, false, null)).toEqual({ kind: 'cancel' });
    expect(decideRelease(2, 7, false, 'none')).toEqual({ kind: 'cancel' });
  });
});

describe('cell looks and tints', () => {
  it('maps drop actions to looks with a distinct blocked state', () => {
    expect(dropLook('move')).toBe('move');
    expect(dropLook('swap')).toBe('swap');
    expect(dropLook('merge')).toBe('merge');
    expect(dropLook('none')).toBe('blocked');
  });

  it('leaves a rested unit untinted and darkens a blocked one', () => {
    expect(unitTint(0, 0, 0)).toBe(0xffffff);
    expect(unitTint(1, 0, 0)).not.toBe(0xffffff);
    // A fully blocked unit reads as slumped whatever else applies.
    expect(unitTint(1, 1, 1)).toBe(unitTint(1, 0, 0));
  });

  it('warms a sunlit cat, mutes a blocked one and cools a weakened one, never to a neon tone', () => {
    const channels = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const [sr, , sb] = channels(unitTint(0, 0, 1));
    expect(sr).toBeGreaterThan(sb);
    const [wr, , wb] = channels(unitTint(0, 1, 0));
    expect(wb).toBeGreaterThan(wr);
    const slump = channels(unitTint(1, 0, 0));
    for (const ch of slump) expect(ch).toBeLessThan(250);
    // Every tint is multiplied into the art, so none may crush it to near black.
    for (const t of [unitTint(0, 0, 1), unitTint(0, 1, 0), unitTint(1, 0, 0)]) for (const ch of channels(t)) expect(ch).toBeGreaterThan(120);
  });

  it('splits the bar between health and shield', () => {
    const out = { hp: 0, shield: 0 };
    barSegments(50, 100, 20, 40, out);
    expect(out.hp).toBeCloseTo(50 / 140);
    expect(out.shield).toBeCloseTo(20 / 140);
    barSegments(0, 0, 0, 0, out);
    expect(out.hp + out.shield).toBe(0);
  });
});

describe('enemy depth order', () => {
  it('a body that creeps a pixel or two keeps its place: the key changes only every few pixels', () => {
    const keys = new Set<number>();
    for (let y = 300; y < 304; y += 0.5) keys.add(depthKey(y, 56));
    expect(keys.size).toBeLessThanOrEqual(2);
    expect(depthKey(400, 56)).toBeGreaterThan(depthKey(300, 56));
  });

  it('a lower body is in front of a higher one, and a bigger one stands a little further forward at the same y', () => {
    expect(depthKey(500, 40)).toBeGreaterThan(depthKey(420, 40));
    expect(depthKey(500, 115)).toBeGreaterThan(depthKey(500, 40));
  });

  it('the layer may be re-sorted on one frame in four, never on all of them', () => {
    let n = 0;
    for (let f = 1; f <= 60; f++) if (depthFrame(f)) n++;
    expect(n).toBe(15);
    expect(depthFrame(1)).toBe(false);
  });
});
