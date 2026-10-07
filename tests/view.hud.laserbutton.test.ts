import { describe, expect, it } from 'vitest';
import { bestRimPose, FROM_BELOW, iconSpots, pawBounds, pawCovers, placePaw, rimSpots, tipSpot } from '@/view/hud/handMath';
import {
  bottomRects,
  INFO_R,
  LASER_FACE,
  LASER_GLYPH,
  LASER_INFO,
  LASER_MOAT,
  LASER_RING,
  LASER_RING_TH,
  LASER_SECONDS_Y,
  LASER_SPOT,
  LASER_X,
  laserFace,
  spotRadius,
  spotWindow,
} from '@/view/hud/layoutMath';

const SCREEN = { w: 720, h: 1280 };
const PANEL_H = 452;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('the laser button: face, moat, ring and glyph on one centre', () => {
  it('has the glyph at 60 to 70 % of the face with at least 12 px of face round it, and a moat of at least 6 px before the ring', () => {
    expect(LASER_GLYPH / LASER_FACE).toBeGreaterThanOrEqual(0.6);
    expect(LASER_GLYPH / LASER_FACE).toBeLessThanOrEqual(0.7);
    expect((LASER_FACE - LASER_GLYPH) / 2).toBeGreaterThanOrEqual(12);
    expect(LASER_MOAT).toBeGreaterThanOrEqual(6);
    // the active button breathes by 4 % and still leaves most of the moat
    expect(LASER_MOAT - (LASER_FACE / 2) * 0.04).toBeGreaterThanOrEqual(4);
    expect(LASER_RING_TH).toBeGreaterThanOrEqual(8);
  });

  it('keeps the face at the 88 px touch size and the ring inside the footprint the old face had', () => {
    expect(LASER_FACE).toBeGreaterThanOrEqual(88);
    expect(LASER_RING).toBeLessThanOrEqual(58);
  });

  it('puts the "i" plate 8 px or more clear of the ring and 5 px or more outside the lesson\'s window, inside the panel with room to spare', () => {
    const centre = { x: LASER_X, y: bottomRects({ w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 0, topH: 168, bottomH: PANEL_H }).summonY };
    const plate = { x: centre.x + LASER_INFO.x, y: centre.y + LASER_INFO.y };
    expect(dist(centre, plate) - INFO_R - LASER_RING).toBeGreaterThanOrEqual(8);
    expect(dist(centre, plate) - INFO_R - (LASER_RING + LASER_SPOT)).toBeGreaterThanOrEqual(5);
    expect(plate.x + INFO_R).toBeLessThanOrEqual(SCREEN.w - 8);
    expect(plate.y + INFO_R).toBeLessThanOrEqual(PANEL_H - 8);
  });

  it('puts the seconds under the ring, 8 px above the panel\'s end, clear of the "i" plate, and the ring 8 px under the call button', () => {
    const summonY = bottomRects({ w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 0, topH: 168, bottomH: PANEL_H }).summonY;
    const cy = summonY;
    // a 26 px line is about 30 px tall, its digits about 19: 7 px of paper between the ring and them
    expect(LASER_SECONDS_Y - 10 - LASER_RING).toBeGreaterThanOrEqual(6);
    expect(cy + LASER_SECONDS_Y + 15).toBeLessThanOrEqual(PANEL_H - 8);
    // "99초" is about 60 px wide
    expect(LASER_X + 30).toBeLessThanOrEqual(LASER_X + LASER_INFO.x - INFO_R - 8);
    // the call button is 84 tall and centred 6 px under the utility row, which lies 126 px above the summon row
    const callBottom = summonY - 126 + 6 + 42;
    expect(cy - LASER_RING - callBottom).toBeGreaterThanOrEqual(8);
  });

  it('cuts the paw rim spots from the band between the glyph and the face edge, whatever the pop-in scale', () => {
    for (const k of [1, 0.6, 1.04]) {
      const ring = { x: 100, y: 200, w: 2 * LASER_RING * k, h: 2 * LASER_RING * k };
      const f = laserFace(ring);
      const spots = rimSpots(f.centre, f.faceR, f.glyphR);
      expect(spots.tips).toHaveLength(4);
      for (const tip of spots.tips) {
        const d = dist(tip, f.centre) / k;
        expect(d).toBeGreaterThanOrEqual(LASER_GLYPH / 2 + 4);
        expect(d).toBeLessThanOrEqual(LASER_FACE / 2 - 4);
      }
      // the first spot is the upper right
      expect(spots.tips[0]?.x).toBeGreaterThan(f.centre.x);
      expect(spots.tips[0]?.y).toBeLessThan(f.centre.y);
      expect(spots.glyph.w / k).toBeCloseTo(LASER_GLYPH, 6);
    }
  });

  it('keeps the guide paw off the glyph and the "i" mark and on the screen, on the laser button at both heights', () => {
    for (const h of [1280, 1600]) {
      const l = { w: 720, h, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 168, topH: 168, bottomH: PANEL_H };
      const r = bottomRects(l);
      const centre = { x: LASER_X, y: r.top + r.summonY };
      const ring = { x: centre.x - LASER_RING, y: centre.y - LASER_RING, w: 2 * LASER_RING, h: 2 * LASER_RING };
      const f = laserFace(ring);
      const info = { x: centre.x + LASER_INFO.x - INFO_R, y: centre.y + LASER_INFO.y - INFO_R, w: INFO_R * 2, h: INFO_R * 2 };
      const spots = rimSpots(f.centre, f.faceR, f.glyphR);
      const { tip, pose } = bestRimPose(spots, { bounds: pawBounds(l), keep: [{ ...info, weight: 6 }], prefer: FROM_BELOW });
      // The pad is 78 px wide and the band 16 px: it cannot clear the glyph altogether, but it lies on less of it than with the tip on the glyph, as before.
      const was = tipSpot(ring).tip;
      const old = placePaw({ tips: [was], bounds: pawBounds(l), keep: [{ ...info, weight: 6 }], labels: [spots.glyph], prefer: FROM_BELOW });
      expect(pawCovers(tip, pose.rotation, spots.glyph)).toBeLessThan(old.covered);
      expect(pose.box.x).toBeGreaterThanOrEqual(14 - 1);
      expect(pose.box.x + pose.box.w).toBeLessThanOrEqual(720 - 14 + 1);
      expect(pose.box.y + pose.box.h).toBeLessThanOrEqual(h - 14 + 1);
    }
  });

  it('does the same for any other round icon button: the speed button in the top right corner', () => {
    const r = { x: 668 - 36, y: 44 - 36, w: 72, h: 78 };
    const spots = iconSpots(r);
    for (const tip of spots.tips) {
      const d = dist(tip, { x: 668, y: 44 });
      expect(d).toBeGreaterThan((72 * 0.62) / 2 + 4);
      expect(d).toBeLessThan(36 - 4);
    }
    const l = { w: 720, h: 1280, safeTop: 0, safeBottom: 0 };
    const { tip, pose } = bestRimPose(spots, { bounds: pawBounds(l), keep: [], prefer: FROM_BELOW });
    const old = placePaw({ tips: [tipSpot(r).tip], bounds: pawBounds(l), keep: [], labels: [spots.glyph], prefer: FROM_BELOW });
    expect(pawCovers(tip, pose.rotation, spots.glyph)).toBeLessThan(old.covered);
  });
});

describe('the lesson\'s spotlight window', () => {
  it('has equal insets left and right, top and bottom, whatever the grid rounds to', () => {
    const r = { x: 557, y: 1120.5, w: 116, h: 116 };
    for (const grid of [2, 12]) {
      const w = spotWindow(r, 8, grid, SCREEN);
      expect(r.x - w.x).toBeCloseTo(w.x + w.w - (r.x + r.w), 6);
      expect(r.y - w.y).toBeCloseTo(w.y + w.h - (r.y + r.h), 6);
      expect(r.x - w.x).toBeGreaterThanOrEqual(8);
    }
  });

  it('is a circle for a round button and the usual corner for a wide control', () => {
    const w = spotWindow({ x: 557, y: 1120, w: 116, h: 116 }, LASER_SPOT, 2, SCREEN);
    expect(w.w).toBe(w.h);
    expect(w.w).toBe(2 * (LASER_RING + LASER_SPOT));
    expect(spotRadius(w, 40)).toBe(w.w / 2);
    expect(spotRadius({ x: 0, y: 0, w: 336, h: 176 }, 32)).toBe(32);
  });

  it('keeps the window on the screen, cutting both sides alike so it stays about the centre', () => {
    const w = spotWindow({ x: 600, y: 10, w: 100, h: 100 }, 30, 12, SCREEN);
    expect(w.x + w.w).toBeLessThanOrEqual(SCREEN.w);
    expect(w.y).toBeGreaterThanOrEqual(0);
    expect(650 - w.x).toBeCloseTo(w.x + w.w - 650, 6);
    expect(60 - w.y).toBeCloseTo(w.y + w.h - 60, 6);
  });
});
