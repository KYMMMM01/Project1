import { describe, expect, it } from 'vitest';
import { Bodies, Boxes, Pending, crossed, findSpot, outranks, regionOf, type Area, type PlaceIn, type Spot } from '@/fx/numberPlan';

/** The playfield as the battle sets it up: HUD edge at y = -18, side margins, the board with its cats in the middle. */
const AREA: Area = { minX: 8, maxX: 712, minY: -18, maxY: 642, keepX0: 96, keepY0: 94, keepX1: 624, keepY1: 530 };
const NO_BOARD: Area = { ...AREA, keepX1: 0 };

/** An enemy of drawn size 55 (a cucumber): the box is 61 wide, 44 above its centre (the top of its bar) and 28 below it. */
const BODY = { hw: 30, top: 44, bottom: 28 };

/** The outward direction on each stretch of the lane (clockwise: right on the top, down on the right, left on the bottom, up on the left). */
const STRETCH = {
  top: { x: 360, y: 44, nx: 0 },
  right: { x: 675, y: 300, nx: 1 },
  bottom: { x: 360, y: 580, nx: 0 },
  left: { x: 45, y: 300, nx: -1 },
} as const;

function ask(at: { x: number; y: number; nx: number }, o: Partial<PlaceIn> = {}): PlaceIn {
  return { x: at.x, y: at.y, ...BODY, nx: at.nx, w: 17, h: 11, rise: 14, out: 10, vx: 0, vy: 0, horizon: 0.35, rows: 2, cols: 3, uid: 1, ...o };
}

const spot = (): Spot => ({ ox: 0, oy: 0, dx: 0, dy: 0 });
const empty = new Boxes(4);

function crowd(...at: [uid: number, x: number, y: number][]): Bodies {
  const b = new Bodies();
  for (const [uid, x, y] of at) b.add(uid, x, y, BODY.hw, BODY.top, BODY.bottom);
  b.settle(1 / 60);
  return b;
}

/** The two boxes of a placed number, start and end of its drift, in field space. */
function boxesOf(p: PlaceIn, s: Spot): { x0: number; y0: number; x1: number; y1: number }[] {
  const sx = p.x + s.ox;
  const sy = p.y + s.oy;
  return [
    { x0: sx - p.w, y0: sy - p.h, x1: sx + p.w, y1: sy + p.h },
    { x0: sx + s.dx - p.w, y0: sy + s.dy - p.h, x1: sx + s.dx + p.w, y1: sy + s.dy + p.h },
  ];
}

const cut = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

describe('where a number starts', () => {
  it('above the health bar of its enemy, straight above, when that is free', () => {
    const p = ask(STRETCH.left, { y: 300 });
    const s = spot();
    expect(findSpot(p, AREA, crowd([1, p.x, p.y]), empty, false, s)).toBe(true);
    expect(s.ox).toBe(0);
    // Its lower edge is a few px above the bar (the bar's top is `top` above the centre).
    expect(s.oy + p.h).toBeLessThan(-BODY.top);
    expect(s.oy + p.h).toBeGreaterThan(-BODY.top - 6);
  });

  it('drifts up and outward: away from the lane centre line on the sides, only up along the top', () => {
    const out = (at: (typeof STRETCH)[keyof typeof STRETCH]): Spot => {
      const s = spot();
      expect(findSpot(ask(at), NO_BOARD, crowd([1, at.x, at.y]), empty, false, s)).toBe(true);
      return s;
    };
    const left = out(STRETCH.left);
    const right = out(STRETCH.right);
    expect(left.dx).toBeLessThan(0);
    expect(right.dx).toBeGreaterThan(0);
    expect(left.dy).toBeLessThan(0);
    expect(right.dy).toBeLessThan(0);
    // Along the top the HUD is above: whatever room is left, it never moves sideways.
    expect(out(STRETCH.top).dx).toBe(0);
  });

  it('on the top stretch it does not run under the HUD: a number that does not fit above the bar is not shown above it', () => {
    // A cucumber's bar top is at y = 0 and the HUD edge at -18: 18 px of room, an ink 22 px high does not fit.
    const p = ask(STRETCH.top, { h: 11 });
    const s = spot();
    if (findSpot(p, AREA, crowd([1, p.x, p.y]), empty, false, s)) for (const b of boxesOf(p, s)) expect(b.y0).toBeGreaterThanOrEqual(AREA.minY);
    // A smaller one does fit.
    const small = ask(STRETCH.top, { h: 8 });
    expect(findSpot(small, AREA, crowd([1, small.x, small.y]), empty, false, s)).toBe(true);
    expect(boxesOf(small, s)[0]?.y0).toBeGreaterThanOrEqual(AREA.minY);
  });

  it('on the bottom stretch the place above the bar is the board: it goes below the feet, away from the cats', () => {
    const p = ask(STRETCH.bottom);
    const s = spot();
    expect(findSpot(p, AREA, crowd([1, p.x, p.y]), empty, false, s)).toBe(true);
    expect(s.oy).toBeGreaterThan(0);
    expect(s.dy).toBeGreaterThan(0);
  });

  it('never inside its own body, another body, another number, the board or off the screen, wherever the lane is', () => {
    const seeds = [3, 7, 11, 19, 23, 29];
    for (const seed of seeds) {
      let r = seed;
      const rnd = (): number => {
        r = (r * 16807) % 2147483647;
        return r / 2147483647;
      };
      for (let trial = 0; trial < 60; trial++) {
        const stretch = Object.values(STRETCH)[Math.floor(rnd() * 4)] as (typeof STRETCH)[keyof typeof STRETCH];
        const horizontal = stretch.nx === 0;
        const along = (): number => (horizontal ? 60 + rnd() * 600 : 70 + rnd() * 460);
        const own = horizontal ? { x: along(), y: stretch.y } : { x: stretch.x, y: along() };
        const others: [number, number, number][] = [];
        for (let k = 0; k < 14; k++) others.push([10 + k, horizontal ? along() : stretch.x, horizontal ? stretch.y : along()]);
        const bodies = crowd([1, own.x, own.y], ...others);
        const live = new Boxes(2);
        live.count = 1;
        live.set(0, own.x + 40, own.y - 60, 20, 11, 0, 0);
        const p = ask({ ...stretch, ...own }, { w: 12 + rnd() * 30, h: 9 + rnd() * 8, rows: 3, cols: 5 });
        const s = spot();
        if (!findSpot(p, AREA, bodies, live, false, s)) continue;
        for (const b of boxesOf(p, s)) {
          expect(b.x0).toBeGreaterThanOrEqual(AREA.minX - 1e-3);
          expect(b.x1).toBeLessThanOrEqual(AREA.maxX + 1e-3);
          expect(b.y0).toBeGreaterThanOrEqual(AREA.minY - 1e-3);
          expect(b.y1).toBeLessThanOrEqual(AREA.maxY + 1e-3);
          expect(cut(b, { x0: AREA.keepX0, y0: AREA.keepY0, x1: AREA.keepX1, y1: AREA.keepY1 })).toBe(false);
          for (let i = 0; i < bodies.count; i++) {
            const box = { x0: (bodies.x[i] as number) - BODY.hw, y0: (bodies.y[i] as number) - BODY.top, x1: (bodies.x[i] as number) + BODY.hw, y1: (bodies.y[i] as number) + BODY.bottom };
            expect(cut(b, box), `body ${bodies.uid[i]}`).toBe(false);
          }
          expect(cut(b, { x0: own.x + 40 - 20, y0: own.y - 60 - 11, x1: own.x + 40 + 20, y1: own.y - 60 + 11 })).toBe(false);
        }
      }
    }
  });
});

describe('a crowded lane', () => {
  it('a row of enemies side by side leaves no place beside or above them: no number, not a number on a body', () => {
    // Enemies 34 px apart on the left stretch, the number's own enemy in the middle.
    const list: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) list.push([i + 1, 45, 120 + i * 34]);
    const bodies = crowd(...list);
    const mid = list[6] as [number, number, number];
    const p = ask({ x: mid[1], y: mid[2], nx: -1 }, { uid: mid[0] });
    expect(findSpot(p, AREA, bodies, empty, false, spot())).toBe(false);
  });

  it('the same enemy alone has its place, and so does one at the end of the row', () => {
    const bodies = crowd([1, 45, 300], [2, 45, 334], [3, 45, 368]);
    const front = ask({ x: 45, y: 300, nx: -1 }, { uid: 1 });
    expect(findSpot(front, AREA, bodies, empty, false, spot())).toBe(true);
    const middle = ask({ x: 45, y: 334, nx: -1 }, { uid: 2 });
    expect(findSpot(middle, AREA, bodies, empty, false, spot())).toBe(false);
  });

  it('a place that an enemy is about to walk into is not a place: the others are looked at as they will be', () => {
    const asked = ask({ x: 300, y: 300, nx: 0 });
    const at = (walk: number): Bodies => {
      // Two frames: the second enemy moves `walk` px in the second one.
      const b = crowd([1, 300, 300], [2, 200 - walk, 230]);
      b.reset();
      b.add(1, 300, 300, BODY.hw, BODY.top, BODY.bottom);
      b.add(2, 200, 230, BODY.hw, BODY.top, BODY.bottom);
      b.settle(1 / 60);
      return b;
    };
    const standing = spot();
    expect(findSpot(asked, NO_BOARD, at(0), empty, false, standing)).toBe(true);
    expect(standing.ox).toBe(0);
    // 255 px/s (a dust at speed 3): within the number's life it reaches the place straight above the head, so the number takes another.
    const walking = spot();
    const found = findSpot(asked, NO_BOARD, at(255 / 60), empty, false, walking);
    expect(!found || walking.ox !== 0 || walking.oy !== standing.oy).toBe(true);
  });

  it('a number that goes with its enemy only fears the others relative to it', () => {
    const bodies = new Bodies();
    bodies.add(1, 300, 300, BODY.hw, BODY.top, BODY.bottom);
    bodies.add(2, 140, 300, BODY.hw, BODY.top, BODY.bottom);
    bodies.settle(1 / 60);
    bodies.reset();
    bodies.add(1, 300 + 4, 300, BODY.hw, BODY.top, BODY.bottom);
    bodies.add(2, 140 + 4, 300, BODY.hw, BODY.top, BODY.bottom);
    bodies.settle(1 / 60);
    expect(bodies.vx[0]).toBeCloseTo(240, 0);
    expect(bodies.vx[1]).toBeCloseTo(240, 0);
    // Both walk at the same speed: the one behind never catches up, the number may stand above its enemy.
    const p = ask({ x: 304, y: 300, nx: 0 }, { vx: 240, vy: 0 });
    const s = spot();
    expect(findSpot(p, NO_BOARD, bodies, empty, false, s)).toBe(true);
    expect(s.ox).toBe(0);
  });

  it('a boss settles for a place that is only clear of itself, the HUD and the board', () => {
    const list: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) list.push([i + 1, 45, 120 + i * 34]);
    const bodies = crowd(...list);
    const mid = list[6] as [number, number, number];
    const p = ask({ x: mid[1], y: mid[2], nx: -1 }, { uid: mid[0] });
    const s = spot();
    expect(findSpot(p, AREA, bodies, empty, false, s)).toBe(false);
    expect(findSpot(p, AREA, bodies, empty, true, s)).toBe(true);
    for (const b of boxesOf(p, s)) expect(cut(b, { x0: p.x - BODY.hw, y0: p.y - BODY.top, x1: p.x + BODY.hw, y1: p.y + BODY.bottom })).toBe(false);
  });
});

describe('bodies', () => {
  it('knows how fast each one moved since the last frame, and zero for one that was not there', () => {
    const b = new Bodies();
    b.add(5, 100, 100, 30, 44, 28);
    b.add(6, 200, 100, 30, 44, 28);
    b.settle(1 / 60);
    expect(b.vx[0]).toBe(0);
    b.reset();
    b.add(6, 204, 100, 30, 44, 28);
    b.add(5, 100, 103, 30, 44, 28);
    b.add(7, 50, 50, 30, 44, 28);
    b.settle(1 / 60);
    expect(b.vx[0]).toBeCloseTo(240, 0);
    expect(b.vy[1]).toBeCloseTo(180, 0);
    expect(b.vx[2]).toBe(0);
    expect(b.find(5)).toBe(1);
    expect(b.find(99)).toBe(-1);
  });

  it('is a list of a fixed size: the bodies past it are not obstacles, nothing is thrown', () => {
    const b = new Bodies();
    for (let i = 0; i < 400; i++) b.add(i, i, 0, 1, 1, 1);
    expect(b.count).toBeLessThan(400);
  });
});

describe('a number that an enemy stands in', () => {
  it('is crossed when a body reaches into it, not when it only brushes it', () => {
    const b = crowd([1, 100, 100]);
    // The body's box is 70..130 across, 56..128 down.
    expect(crossed(b, 9, 100, 40, 17, 11)).toBe(false);
    expect(crossed(b, 9, 100, 56, 17, 11)).toBe(true);
    expect(crossed(b, 9, 100, 45, 17, 11)).toBe(false);
    expect(crossed(b, 9, 100, 48, 17, 11)).toBe(false);
    expect(crossed(b, 9, 100, 49, 17, 11)).toBe(true);
    expect(crossed(b, 9, 150, 100, 17, 11)).toBe(false);
    // Its own body is skipped.
    expect(crossed(b, 1, 100, 100, 17, 11)).toBe(false);
  });
});

describe('merging', () => {
  it('sums the hits of one window and starts a new one when the window has run out', () => {
    const p = new Pending();
    expect(p.add(4, 10, 0, 0.3)).toBe(10);
    expect(p.add(4, 15, 0.1, 0.3)).toBe(25);
    expect(p.add(9, 7, 0.1, 0.3)).toBe(7);
    // The window runs from its first hit.
    expect(p.add(4, 5, 0.29, 0.3)).toBe(30);
    expect(p.add(4, 5, 0.31, 0.3)).toBe(5);
  });

  it('forgets what got its number', () => {
    const p = new Pending();
    p.add(4, 10, 0, 0.3);
    p.drop(4);
    expect(p.add(4, 3, 0.05, 0.3)).toBe(3);
    p.clear();
    expect(p.add(4, 2, 0.06, 0.3)).toBe(2);
  });
});

describe('the crowd rule helpers', () => {
  it('cuts the field into regions that follow the lane around', () => {
    expect(regionOf(10, 10)).toBe(0);
    expect(regionOf(700, 10)).toBe(3);
    expect(regionOf(10, 600)).toBe(12);
    expect(regionOf(700, 600)).toBe(15);
    expect(regionOf(-50, -50)).toBe(0);
    expect(regionOf(900, 900)).toBe(15);
    expect(regionOf(200, 10)).not.toBe(regionOf(100, 10));
  });

  it('ranks by priority first and then by the larger figure', () => {
    expect(outranks(2, 5, 1, 5000)).toBe(true);
    expect(outranks(1, 5000, 2, 5)).toBe(false);
    expect(outranks(1, 50, 1, 5)).toBe(true);
    expect(outranks(1, 5, 1, 5)).toBe(false);
  });
});
