import { describe, expect, it } from 'vitest';
import { overlapArea } from '@/view/hud/bubbleMath';
import { dragPrefer, FROM_BELOW, pawBounds, pawBox, PAW_LENGTH, pawRotation, placePaw, soften, tipSpot, type PawFrom } from '@/view/hud/handMath';
import type { Rect } from '@/view/hud/layoutMath';

const SCREEN = { w: 720, h: 1280, safeTop: 0, safeBottom: 0 };
const BOUNDS = pawBounds(SCREEN);

/** Which way the arm trails from the tip (unit vector), read off the rotation: the tip points along (sin, -cos). */
function arm(rotation: number): { x: number; y: number } {
  return { x: -Math.sin(rotation), y: Math.cos(rotation) };
}

describe('the paw art, turned', () => {
  it('trails away to the side its name says, 15 to 35 degrees off the vertical', () => {
    for (const from of ['lowerRight', 'lowerLeft', 'upperRight', 'upperLeft'] as PawFrom[]) {
      for (const tilt of [0.26, 0.44, 0.61]) {
        const a = arm(pawRotation(from, tilt));
        expect(a.y > 0).toBe(from.startsWith('lower'));
        expect(a.x > 0).toBe(from.endsWith('Right'));
        // Degrees off the vertical.
        const deg = (Math.atan2(Math.abs(a.x), Math.abs(a.y)) * 180) / Math.PI;
        expect(deg).toBeGreaterThanOrEqual(14);
        expect(deg).toBeLessThanOrEqual(36);
      }
    }
  });

  it('is about 140 px long, the tip at the box end it points to', () => {
    expect(PAW_LENGTH).toBeGreaterThanOrEqual(130);
    expect(PAW_LENGTH).toBeLessThanOrEqual(150);
    const tip = { x: 300, y: 400 };
    // Not turned, the paw points up: the tip is the top of the box and the arm hangs below it.
    const up = pawBox(tip, 0);
    expect(up.y).toBeCloseTo(400);
    expect(up.y + up.h).toBeCloseTo(400 + PAW_LENGTH);
    // Turned half way round it points down, the arm above.
    const down = pawBox(tip, Math.PI);
    expect(down.y).toBeCloseTo(400 - PAW_LENGTH);
    expect(down.y + down.h).toBeCloseTo(400);
  });
});

describe('where the paw comes in', () => {
  it('comes from the lower right, tilted, when there is room', () => {
    const tip = { x: 300, y: 500 };
    const pose = placePaw({ tips: [tip], bounds: BOUNDS, keep: [], prefer: FROM_BELOW });
    expect(pose.from).toBe('lowerRight');
    const a = arm(pose.rotation);
    expect(a.y).toBeGreaterThan(0);
    expect(a.x).toBeGreaterThan(0);
  });

  it('is never cut by the screen, whatever the spot', () => {
    for (const x of [60, 120, 360, 600, 660]) {
      for (const y of [8, 60, 640, 1180, 1272]) {
        const pose = placePaw({ tips: [{ x, y }], bounds: BOUNDS, keep: [], prefer: FROM_BELOW });
        const box = pawBox({ x, y }, pose.rotation);
        // The box is the corners' bounding box: the rounded tip of the art stays inside it, so a few px of its corner may pass the edge.
        expect(overlapArea(box, { x: 0, y: 0, w: 720, h: 1280 })).toBeGreaterThan(box.w * box.h * 0.95);
      }
    }
  });

  it('comes down from above onto a button at the bottom edge of the screen (no room below it)', () => {
    const tip = { x: 450, y: 1210 };
    const pose = placePaw({ tips: [tip], bounds: BOUNDS, keep: [], prefer: FROM_BELOW });
    expect(pose.from.startsWith('upper')).toBe(true);
    expect(pose.box.y + pose.box.h).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.h + 20);
  });

  it('leans away from a screen edge it would be cut by', () => {
    const pose = placePaw({ tips: [{ x: 690, y: 400 }], bounds: BOUNDS, keep: [], prefer: FROM_BELOW });
    expect(pose.from).toBe('lowerLeft');
  });

  it('keeps off a label it can keep off, and off a lesson card', () => {
    const label: Rect = { x: 300, y: 560, w: 120, h: 120 };
    const tip = { x: 300, y: 500 };
    const free = placePaw({ tips: [tip], bounds: BOUNDS, keep: [], prefer: FROM_BELOW });
    expect(overlapArea(free.box, label)).toBeGreaterThan(0);
    const careful = placePaw({ tips: [tip], bounds: BOUNDS, keep: [{ ...label, weight: 3 }], prefer: FROM_BELOW });
    expect(overlapArea(pawBox(tip, careful.rotation), label)).toBeLessThan(overlapArea(pawBox(tip, free.rotation), label));
  });

  it('a drag keeps one turn for the whole way: the paw fits the screen at both ends', () => {
    const a = { x: 100, y: 700 };
    const b = { x: 620, y: 1000 };
    const pose = placePaw({ tips: [a, b], bounds: BOUNDS, keep: [], prefer: dragPrefer(a, b) });
    for (const tip of [a, b]) expect(overlapArea(pawBox(tip, pose.rotation), BOUNDS)).toBeGreaterThan(0.95 * pawBox(tip, pose.rotation).w * pawBox(tip, pose.rotation).h);
  });

  it('a drag to the right trails the arm behind it, to the left', () => {
    expect(dragPrefer({ x: 100, y: 500 }, { x: 400, y: 500 })[0]).toBe('lowerLeft');
    expect(dragPrefer({ x: 400, y: 500 }, { x: 100, y: 500 })[0]).toBe('lowerRight');
    expect(dragPrefer({ x: 300, y: 800 }, { x: 300, y: 500 })[0]).toBe('lowerRight');
    expect(dragPrefer({ x: 300, y: 500 }, { x: 300, y: 800 })[0].startsWith('upper')).toBe(true);
  });

  it('what the HUD lists to keep readable counts for less than a label does', () => {
    expect(soften([{ x: 0, y: 0, w: 1, h: 1, weight: 3 }])[0]?.weight).toBeLessThan(3);
  });

  it('a safe-area screen narrows the area', () => {
    const b = pawBounds({ w: 720, h: 1280, safeTop: 60, safeBottom: 40 });
    expect(b.y).toBeGreaterThan(60);
    expect(b.y + b.h).toBeLessThan(1240);
  });
});

describe('the spot of a control the tip lands on', () => {
  it('is off the label of a wide button and inside it, the upper right of a small one', () => {
    const wide: Rect = { x: 210, y: 1000, w: 300, h: 140 };
    const w = tipSpot(wide);
    expect(w.tip.x).toBeGreaterThan(wide.x + wide.w * 0.7);
    expect(w.tip.x).toBeLessThan(wide.x + wide.w);
    expect(w.tip.y).toBeGreaterThan(wide.y);
    expect(w.tip.y).toBeLessThan(wide.y + wide.h / 2);
    const icon: Rect = { x: 600, y: 40, w: 88, h: 88 };
    const spot = tipSpot(icon).tip;
    expect(spot.x).toBeGreaterThan(icon.x + icon.w / 2);
    expect(spot.x).toBeLessThan(icon.x + icon.w);
    expect(spot.y).toBeGreaterThan(icon.y);
    expect(spot.y).toBeLessThan(icon.y + icon.h / 2 + 1);
  });
});
