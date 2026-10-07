import { describe, expect, it } from 'vitest';
import { HAND_ROOM, handAbove, pointerRect, type PointRect } from '@/screens/shell/pointerMath';

const box = (x: number, y: number, w: number, h: number): PointRect => ({ x, y, w, h });

describe('home pointer geometry', () => {
  it('stands the window off the target and rounds it to whole pixels', () => {
    const out = box(0, 0, 0, 0);
    pointerRect(out, box(100.4, 300.6, 200.2, 80.2), 720, 1280);
    expect(out).toEqual({ x: 90, y: 291, w: 221, h: 100 });
  });

  it('keeps the window on the screen, whatever the target does', () => {
    const out = box(0, 0, 0, 0);
    pointerRect(out, box(-30, -20, 800, 1400), 720, 1280);
    expect(out).toEqual({ x: 6, y: 6, w: 708, h: 1268 });
    pointerRect(out, box(700, 1270, 40, 40), 720, 1280);
    expect(out.x + out.w).toBeLessThanOrEqual(714);
    expect(out.y + out.h).toBeLessThanOrEqual(1274);
    expect(out.w).toBeGreaterThanOrEqual(0);
    expect(out.h).toBeGreaterThanOrEqual(0);
  });

  it('brings the hand down from above only when there is room for it under the bar', () => {
    expect(handAbove(box(40, 400, 200, 100), 200)).toBe(true);
    expect(handAbove(box(40, 200 + HAND_ROOM, 200, 100), 200)).toBe(true);
    expect(handAbove(box(40, 200 + HAND_ROOM - 1, 200, 100), 200)).toBe(false);
    expect(handAbove(box(40, 210, 200, 100), 200)).toBe(false);
  });
});
