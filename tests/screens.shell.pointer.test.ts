import { describe, expect, it } from 'vitest';
import { shellLayout } from '@/screens/shell/layoutMath';
import { pawFor, pointerRect, visiblePart, type PointRect } from '@/screens/shell/pointerMath';
import { overlapArea } from '@/view/hud/bubbleMath';
import { PAW_LENGTH, pawBox } from '@/view/hud/handMath';

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
});

describe('the paw on the home page', () => {
  const rooms = [shellLayout(720, 1280, 0, 0).area, shellLayout(720, 1600, 44, 34).area];
  const inside = (r: PointRect, room: PointRect): boolean => r.x >= room.x - 0.5 && r.y >= room.y - 0.5 && r.x + r.w <= room.x + room.w + 0.5 && r.y + r.h <= room.y + room.h + 0.5;
  const targets = (room: PointRect): Record<string, { target: PointRect; texts: PointRect[] }> => {
    const top = room.y;
    const bottom = room.y + room.h;
    return {
      icon: { target: box(600, top + 20, 88, 88), texts: [] },
      card: { target: box(40, top + 300, 640, 200), texts: [box(80, top + 330, 300, 40), box(80, top + 390, 360, 30)] },
      lowCard: { target: box(40, bottom - 220, 640, 200), texts: [box(80, bottom - 190, 300, 40)] },
      edgeIcon: { target: box(620, top + 400, 88, 88), texts: [] },
      cornerIcon: { target: box(12, bottom - 100, 88, 88), texts: [] },
      tall: { target: box(40, top + 100, 640, 700), texts: [box(80, top + 130, 400, 40)] },
    };
  };

  it('is as long as the art says and touches the target with its tip', () => {
    expect(PAW_LENGTH).toBeGreaterThanOrEqual(130);
    expect(PAW_LENGTH).toBeLessThanOrEqual(150);
    for (const room of rooms) {
      for (const [name, { target, texts }] of Object.entries(targets(room))) {
        const paw = pawFor(target, room, texts);
        const seen = visiblePart(target, room);
        expect(paw.x, name).toBeGreaterThanOrEqual(seen.x);
        expect(paw.x, name).toBeLessThanOrEqual(seen.x + seen.w);
        expect(paw.y, name).toBeGreaterThanOrEqual(seen.y);
        expect(paw.y, name).toBeLessThanOrEqual(seen.y + seen.h);
      }
    }
  });

  it('never leaves the page: not the screen edge, not the bars', () => {
    for (const room of rooms) {
      for (const [name, { target, texts }] of Object.entries(targets(room))) {
        const paw = pawFor(target, room, texts);
        expect(inside(pawBox(paw, paw.rotation), room), `${name} in ${room.h}`).toBe(true);
      }
    }
  });

  it('comes in from below at a slant when there is room, never lying flat or upside down', () => {
    for (const room of rooms) {
      for (const name of ['icon', 'card', 'edgeIcon', 'tall']) {
        const { target, texts } = targets(room)[name] as { target: PointRect; texts: PointRect[] };
        const { rotation } = pawFor(target, room, texts);
        expect(Math.cos(rotation), name).toBeGreaterThan(0.8);
        expect(Math.abs(rotation), name).toBeGreaterThan(0.2);
      }
    }
  });

  it('keeps off the writing on the target, tip included', () => {
    for (const room of rooms) {
      for (const name of ['card', 'lowCard', 'tall']) {
        const { target, texts } = targets(room)[name] as { target: PointRect; texts: PointRect[] };
        const paw = pawFor(target, room, texts);
        const body = pawBox(paw, paw.rotation);
        for (const t of texts) expect(overlapArea(body, t), name).toBe(0);
      }
    }
  });

  it('points at the part of a card the page shows when the rest is scrolled out', () => {
    const room = rooms[0] as PointRect;
    const half = box(40, room.y - 120, 640, 300);
    const seen = visiblePart(half, room);
    expect(seen).toEqual({ x: 40, y: room.y, w: 640, h: 180 });
    const paw = pawFor(half, room, []);
    expect(paw.y).toBeGreaterThanOrEqual(room.y);
    expect(inside(pawBox(paw, paw.rotation), room)).toBe(true);
  });

  it('a target that is out of the page altogether is pointed at where the page meets it', () => {
    const room = rooms[0] as PointRect;
    expect(visiblePart(box(40, room.y + room.h + 200, 100, 100), room)).toEqual({ x: 90, y: room.y + room.h, w: 0, h: 0 });
  });
});
