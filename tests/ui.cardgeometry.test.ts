import { describe, expect, it } from 'vitest';
import {
  barBox,
  CARD_SPECS,
  cardGeometry,
  levelBadgeBox,
  plateBadgeBox,
  plateGeometry,
  ringRuns,
  nameCentre,
  pipsPillBox,
  starBox,
  tapeBox,
  type CardBox,
  type CardSizeId,
} from '@/ui/cardMath';
import { cachedPaperPath, cornerCap, cutBelow, insetPolygon, wobbleAmp } from '@/ui/paperMath';

const SIZES: CardSizeId[] = ['small', 'medium', 'large'];

/** Distance from (px, py) to the nearest edge of a closed polygon. */
function edgeDistance(pts: readonly number[], px: number, py: number): number {
  const n = pts.length / 2;
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = pts[i * 2] as number;
    const ay = pts[i * 2 + 1] as number;
    const bx = pts[j * 2] as number;
    const by = pts[j * 2 + 1] as number;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (ax + dx * t), py - (ay + dy * t)));
  }
  return best;
}

function inside(pts: readonly number[], px: number, py: number): boolean {
  let hit = false;
  const n = pts.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2] as number;
    const yi = pts[i * 2 + 1] as number;
    const xj = pts[j * 2] as number;
    const yj = pts[j * 2 + 1] as number;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function spread(pts: readonly number[], to: readonly number[], skip: (x: number, y: number) => boolean = () => false): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] as number;
    const y = pts[i + 1] as number;
    if (skip(x, y)) continue;
    const d = edgeDistance(to, x, y);
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  return { min, max };
}

const overlap = (a: CardBox, b: CardBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const within = (a: CardBox, outer: CardBox, slack = 0): boolean => a.x >= outer.x - slack && a.y >= outer.y - slack && a.x + a.w <= outer.x + outer.w + slack && a.y + a.h <= outer.y + outer.h + slack;

describe('insetPolygon', () => {
  const wobbly = cachedPaperPath(220, 292, 26, 77, wobbleAmp(220, 292, 1)).pts;

  it('keeps every point the asked distance from the original edge, however it wobbles', () => {
    for (const d of [4, 8, 14]) {
      const { min, max } = spread(insetPolygon(wobbly, d), wobbly);
      expect(min).toBeGreaterThan(d - 0.3);
      expect(max).toBeLessThan(d + 0.3);
    }
  });

  it('puts the result inside the original', () => {
    const moved = insetPolygon(wobbly, 10);
    for (let i = 0; i < moved.length; i += 2) expect(inside(wobbly, moved[i] as number, moved[i + 1] as number)).toBe(true);
  });
});

describe('cutBelow and cornerCap', () => {
  const outline = insetPolygon(cachedPaperPath(220, 292, 26, 5, 1.2).pts, 8);

  it('ends in a straight bottom edge with rounded corners, and never reaches below it', () => {
    const cut = cutBelow(outline, 200, 16);
    let low = -Infinity;
    for (let i = 1; i < cut.length; i += 2) low = Math.max(low, cut[i] as number);
    expect(low).toBeCloseTo(200, 5);
    // The straight part: more than one point sits exactly on the bottom line, and the corners are arcs, not a point at the box corner.
    const onLine = cut.filter((v, i) => i % 2 === 1 && Math.abs(v - 200) < 1e-6).length;
    expect(onLine).toBeGreaterThanOrEqual(2);
    const bottomRow = cut.filter((v, i) => i % 2 === 1 && v > 200 - 16 + 1);
    expect(bottomRow.length).toBeGreaterThan(4);
  });

  it('cuts a photo corner out of the outline itself: every point on it, none outside', () => {
    const mat = cutBelow(outline, 200, 16);
    const cap = cornerCap(mat, 8, 8, 30);
    expect(cap.length).toBeGreaterThanOrEqual(8);
    for (let i = 0; i < cap.length; i += 2) {
      const x = cap[i] as number;
      const y = cap[i + 1] as number;
      // A vertex of the outline, or one of the two ends on a segment of it: all within a hair of its edge.
      expect(edgeDistance(mat, x, y)).toBeLessThan(0.05);
    }
  });
});

describe.each(SIZES)('card geometry, %s', (size) => {
  const spec = CARD_SPECS[size];
  const geo = cardGeometry(size);

  it('keeps the dashed line one distance inside the cut edge all the way round', () => {
    const { min, max } = spread(geo.dash, geo.outer);
    expect(min).toBeGreaterThan(spec.dash - 0.3);
    expect(max).toBeLessThan(spec.dash + 0.3);
  });

  it('keeps the mat the border width inside the cut edge on the top and both sides, with a ruled bottom', () => {
    const { min, max } = spread(geo.mat, geo.outer, (_x, y) => y > geo.matBottom - geo.matRadius - 1);
    expect(min).toBeGreaterThan(spec.border - 0.3);
    expect(max).toBeLessThan(spec.border + 0.3);
    let low = -Infinity;
    for (let i = 1; i < geo.mat.length; i += 2) low = Math.max(low, geo.mat[i] as number);
    expect(low).toBeCloseTo(geo.matBottom, 5);
  });

  it('keeps the window the frame width inside the mat on all four sides', () => {
    const { min, max } = spread(geo.window, geo.mat);
    expect(min).toBeGreaterThan(spec.frame - 0.3);
    expect(max).toBeLessThan(spec.frame + 0.3);
  });

  it('never lets a layer reach the layer outside it', () => {
    for (const [inner, outer] of [[geo.dash, geo.outer], [geo.mat, geo.dash], [geo.window, geo.mat]] as const) {
      for (let i = 0; i < inner.length; i += 2) {
        expect(inside(outer, inner[i] as number, inner[i + 1] as number)).toBe(true);
      }
    }
  });

  it('keeps the dashed line clear of the mat by a visible gap', () => {
    const { min } = spread(geo.dash, geo.mat);
    expect(min).toBeGreaterThanOrEqual(spec.border - spec.dash - 0.4);
    // Two lines two pixels apart read as one smear: at least 3 px between the dashes and the mat edge.
    expect(min).toBeGreaterThanOrEqual(3);
  });

  it('puts the nominal window symmetrically on the card and inside the real one', () => {
    const wr = geo.windowRect;
    expect(wr.x + wr.w / 2).toBeCloseTo(0, 6);
    expect(wr.y + wr.h).toBeCloseTo(geo.matBottom - spec.frame, 6);
    // The wobble may move the real window edge by amp: the nominal rectangle is never more than that off it.
    for (const [x, y] of [[wr.x, wr.y], [wr.x + wr.w, wr.y], [wr.x, wr.y + wr.h], [wr.x + wr.w, wr.y + wr.h]] as const) {
      expect(edgeDistance(geo.window, x, y)).toBeLessThan(geo.spec.radius);
    }
    const mid = wr.y + wr.h / 2;
    expect(inside(geo.window, wr.x + wr.w / 2, mid)).toBe(true);
  });

  it('sticks four photo corners onto the mat that stay on it and reach into the window less than a third of its width', () => {
    expect(geo.caps).toHaveLength(4);
    for (const cap of geo.caps) {
      for (let i = 0; i < cap.length; i += 2) {
        expect(edgeDistance(geo.mat, cap[i] as number, cap[i + 1] as number)).toBeLessThan(0.05);
      }
      const xs = cap.filter((_, i) => i % 2 === 0);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(geo.windowRect.w / 3);
    }
  });

  it('lays the plate out: bar and name inside the cut edge, equal insets left and right, name between mat and bar', () => {
    const bar = barBox(spec, geo);
    expect(bar.x + bar.w / 2).toBeCloseTo(0, 6);
    expect(within(bar, geo.nominal)).toBe(true);
    expect(geo.nominal.x + geo.nominal.w - (bar.x + bar.w)).toBeCloseTo(bar.x - geo.nominal.x, 6);
    // The bar's inset from the cut edge below equals its inset on the sides.
    expect(geo.nominal.y + geo.nominal.h - (bar.y + bar.h)).toBeCloseTo(bar.x - geo.nominal.x, 6);
    // The bar is a capsule: its whole rim stays 6 px or more from the dashed line (the line is 2 px wide, the bar has a rim of its own).
    const rim: number[] = [];
    const r = bar.h / 2;
    for (let k = 0; k <= 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const cx = Math.cos(a) >= 0 ? bar.x + bar.w - r : bar.x + r;
      rim.push(cx + Math.cos(a) * r, bar.y + r + Math.sin(a) * r);
    }
    expect(spread(rim, geo.dash).min).toBeGreaterThanOrEqual(6);
    const withBar = nameCentre(spec, geo, true);
    const without = nameCentre(spec, geo, false);
    expect(withBar - spec.name / 2 - 3).toBeGreaterThan(geo.matBottom);
    expect(withBar + spec.name / 2).toBeLessThan(bar.y);
    expect(without).toBeGreaterThan(withBar);
    expect(without + spec.name / 2).toBeLessThan(geo.nominal.y + geo.nominal.h);
  });

  it('places the level badge on the window beside the top-left photo corner, never on it', () => {
    const box = levelBadgeBox(spec, geo, 84, spec.level * 1.5);
    expect(box.y - geo.windowRect.y).toBeCloseTo(spec.pad, 6);
    const cap = geo.caps[0] as number[];
    let right = -Infinity;
    for (let i = 0; i < cap.length; i += 2) right = Math.max(right, cap[i] as number);
    expect(box.x - right).toBeGreaterThanOrEqual(spec.pad - 1e-6);
    expect(within(box, geo.windowRect)).toBe(true);
    // No corner of the badge lies inside any photo corner.
    for (const c of geo.caps) {
      for (const [x, y] of [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]] as const) {
        expect(inside(c, x, y)).toBe(false);
      }
    }
  });

  it('seats the pips pill centred, `pad` above the window edge and clear of the bottom photo corners', () => {
    const pill = pipsPillBox(spec, geo, 104);
    expect(pill.x + pill.w / 2).toBeCloseTo(0, 6);
    expect(geo.windowRect.y + geo.windowRect.h - (pill.y + pill.h)).toBeCloseTo(spec.pad, 6);
    expect(within(pill, geo.windowRect)).toBe(true);
    for (const c of [geo.caps[2], geo.caps[3]] as number[][]) {
      for (let i = 0; i < c.length; i += 2) {
        const x = c[i] as number;
        const y = c[i + 1] as number;
        expect(x < pill.x || x > pill.x + pill.w || y < pill.y || y > pill.y + pill.h).toBe(true);
      }
    }
  });

  it('straddles the top edge with the tape and puts the star on it: neither reaches the window, the badge or the box', () => {
    const tape = tapeBox(spec);
    const star = starBox(spec);
    const reachAbove = -spec.h / 2 - Math.min(tape.y, star.y);
    expect(reachAbove).toBeGreaterThan(0);
    expect(reachAbove).toBeLessThanOrEqual(spec.crest);
    // The tilted strip's lower corner (a 3 degree turn about its centre) stays above the window's top edge.
    const sway = (tape.w / 2) * Math.sin((3 * Math.PI) / 180);
    expect(tape.y + tape.h + sway).toBeLessThanOrEqual(geo.windowRect.y + 0.8);
    expect(star.y + star.h).toBeLessThanOrEqual(geo.windowRect.y + 1);
    expect(star.x + star.w / 2).toBeCloseTo(0, 6);
    expect(overlap(star, levelBadgeBox(spec, geo, 84, spec.level * 1.5))).toBe(false);
  });
});

describe('every size', () => {
  it('has one cut edge inset per layer in the same proportions, so a bigger card is the same card', () => {
    for (const size of SIZES) {
      const s = CARD_SPECS[size];
      expect(s.dash).toBeLessThan(s.border);
      expect(s.frame).toBeLessThanOrEqual(s.border);
      expect(s.radius - s.border - s.frame).toBeGreaterThan(4);
      expect(s.name).toBeGreaterThanOrEqual(24);
      expect(s.level).toBeGreaterThanOrEqual(24);
    }
  });
});

describe.each([
  ['cats card', 106, 150, 104],
  ['cats mini', 106, 114, 102],
  ['reveal', 116, 136, 112],
] as const)('compact plate, %s', (_name, w, h, matH) => {
  const geo = plateGeometry(w, h, matH);
  const spec = geo.spec;

  it('keeps the dashed line, the mat and the window parallel to the cut edge', () => {
    const dash = spread(geo.dash, geo.outer);
    expect(dash.min).toBeGreaterThan(spec.dash - 0.3);
    expect(dash.max).toBeLessThan(spec.dash + 0.3);
    const mat = spread(geo.mat, geo.outer, (_x, y) => y > geo.matBottom - geo.matRadius - 1);
    expect(mat.min).toBeGreaterThan(spec.border - 0.3);
    expect(mat.max).toBeLessThan(spec.border + 0.3);
    const win = spread(geo.window, geo.mat);
    expect(win.min).toBeGreaterThan(spec.frame - 0.3);
    expect(win.max).toBeLessThan(spec.frame + 0.3);
  });

  it('is as tall inside as the mat the caller asked for', () => {
    expect(geo.windowRect.h).toBeCloseTo(matH - 2 * spec.frame, 6);
  });

  it('keeps the top corners for the level pill: photo corners only on the bottom two', () => {
    expect(spec.topCaps).toBe(false);
  });

  it('puts the level pill inside the window, clear of the tape and star above it', () => {
    const pill = plateBadgeBox(geo, 80, 32);
    expect(within(pill, geo.windowRect)).toBe(true);
    const tape = tapeBox(spec);
    const sway = (tape.w / 2) * Math.sin((3 * Math.PI) / 180);
    expect(tape.y + tape.h + sway).toBeLessThanOrEqual(pill.y);
    expect(starBox(spec).y + starBox(spec).h).toBeLessThanOrEqual(pill.y + 0.01);
  });
});

describe('selection ring', () => {
  it('runs a fixed distance outside the cut edge, all the way round', () => {
    const geo = plateGeometry(106, 150, 104);
    const runs = ringRuns(geo, 8, 16, 11);
    expect(runs.length).toBeGreaterThan(6);
    for (const run of runs) {
      for (let i = 0; i < run.length; i += 2) {
        const x = run[i] as number;
        const y = run[i + 1] as number;
        expect(inside(geo.outer, x, y)).toBe(false);
        expect(edgeDistance(geo.outer, x, y)).toBeGreaterThan(7.6);
        expect(edgeDistance(geo.outer, x, y)).toBeLessThan(8.4);
      }
    }
  });
});
