import { describe, expect, it } from 'vitest';
import { FIELD_W, LANE_WIDTH, PATH_BOTTOM, PATH_LEFT, PATH_RIGHT, PATH_TOP } from '@/game/geometry';
import { overlapArea, type Weighted } from '@/view/hud/bubbleMath';
import { cheerSpot, STICKER_WALL, topKeep } from '@/view/hud/cheerMath';
import { chipColumn } from '@/view/hud/chipMath';
import { bottomRects, topRects, type Rect } from '@/view/hud/layoutMath';
import { computeBattleLayout } from '@/view/layout';

/** The sticker box a spot has to leave free: the settled sticker with its margin and lift-off (LessonFx), for the longest Korean and English words. */
const BOX = { w: 172, h: 112 };

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });

/** What the HUD hands the sticker to keep off, from the layout: the same rectangles `Hud.avoidList` and `topKeep` build, and the chips' column. */
function keepFor(h: number, speedShown: boolean, cats: readonly Rect[]): { keep: Weighted[]; l: ReturnType<typeof computeBattleLayout>; column: Rect } {
  const l = computeBattleLayout(720, h, 0, 0);
  const rows = bottomRects(l);
  const top = topRects(l);
  const half = LANE_WIDTH / 2;
  const column = chipColumn(rows.top + rows.summonY - 112, 360);
  // The same weights as `Hud.avoidList(true)`: a control or a line of writing is a wall, a cat costs a little, the enemy lane least.
  const keep: Weighted[] = [
    { ...top.preview, weight: STICKER_WALL },
    { ...top.wave, weight: STICKER_WALL },
    { x: 20, y: rows.top + rows.chipsY - 44, w: 680, h: 88, weight: STICKER_WALL },
    { x: 232, y: rows.top + rows.currencyY - 38, w: 240, h: 76, weight: STICKER_WALL },
    { x: 210, y: rows.top + rows.summonY - 70, w: 300, h: 140, weight: STICKER_WALL },
    { x: 20, y: rows.top + rows.summonY - 60, w: 200, h: 130, weight: STICKER_WALL },
    { x: 24, y: rows.top + rows.utilY - 44, w: 676, h: 88, weight: STICKER_WALL },
    ...cats.map((c) => ({ ...c, weight: 1.2 })),
    { x: l.fieldX, y: l.fieldY + PATH_TOP - half, w: FIELD_W, h: LANE_WIDTH, weight: 0.4 },
    { x: l.fieldX, y: l.fieldY + PATH_BOTTOM - half, w: FIELD_W, h: LANE_WIDTH, weight: 0.4 },
    { x: l.fieldX + PATH_LEFT - half, y: l.fieldY + PATH_TOP, w: LANE_WIDTH, h: PATH_BOTTOM - PATH_TOP, weight: 0.4 },
    { x: l.fieldX + PATH_RIGHT - half, y: l.fieldY + PATH_TOP, w: LANE_WIDTH, h: PATH_BOTTOM - PATH_TOP, weight: 0.4 },
    ...topKeep(l, { speed: speedShown, skip: true, toys: true }),
    { ...column, weight: STICKER_WALL },
  ];
  return { keep, l, column };
}

describe('where the "nice!" sticker lands', () => {
  it('lies beside its target when there is free paper there', () => {
    const target = rect(300, 400, 120, 100);
    const spot = cheerSpot({ target, home: { x: 360, y: 512 }, w: 160, h: 100, bounds: rect(0, 0, 720, 1280), keep: [] });
    // Above it first, touching nothing.
    expect(spot.y + 50).toBeLessThanOrEqual(400);
    expect(spot.x).toBe(360);
  });

  it('goes to the next free side when the first is taken, never onto what is there', () => {
    const target = rect(300, 400, 120, 100);
    const above: Weighted = { x: 200, y: 200, w: 320, h: 200, weight: 3 };
    const spot = cheerSpot({ target, home: { x: 360, y: 512 }, w: 160, h: 100, bounds: rect(0, 0, 720, 1280), keep: [above] });
    const box = rect(spot.x - 80, spot.y - 50, 160, 100);
    expect(overlapArea(box, above)).toBe(0);
    expect(overlapArea(box, target)).toBe(0);
  });

  it('stays inside the screen and covers as little as it must when every spot is taken', () => {
    const everything: Weighted[] = [{ x: 0, y: 0, w: 720, h: 1280, weight: 1 }, { x: 300, y: 600, w: 100, h: 100, weight: 5 }];
    const spot = cheerSpot({ target: rect(300, 600, 100, 100), home: { x: 360, y: 512 }, w: 160, h: 100, bounds: rect(0, 0, 720, 1280), keep: everything });
    expect(spot.x - 80).toBeGreaterThanOrEqual(0);
    expect(spot.x + 80).toBeLessThanOrEqual(720);
    expect(spot.y - 50).toBeGreaterThanOrEqual(0);
    expect(spot.y + 50).toBeLessThanOrEqual(1280);
    // The heavy rectangle (the target's own) is the one it keeps off.
    expect(overlapArea(rect(spot.x - 80, spot.y - 50, 160, 100), everything[1] as Rect)).toBe(0);
  });

  it('starts from home when the lesson has no control of its own', () => {
    const spot = cheerSpot({ target: null, home: { x: 360, y: 512 }, w: 160, h: 100, bounds: rect(0, 0, 720, 1280), keep: [] });
    expect(spot).toEqual({ x: 360, y: 512 });
  });

  it('lands on free paper for every target a lesson can point at, on a short and a tall screen, with and without the speed button', () => {
    for (const h of [1280, 1600]) {
      for (const speedShown of [false, true]) {
        const l = computeBattleLayout(720, h, 0, 0);
        const rows = bottomRects(l);
        const top = topRects(l);
        const cats = [rect(l.fieldX + 90, l.fieldY + 88, 108, 112), rect(l.fieldX + 198, l.fieldY + 88, 108, 112), rect(l.fieldX + 306, l.fieldY + 200, 108, 112)];
        const { keep, column } = keepFor(h, speedShown, cats);
        const targets: Record<string, Rect> = {
          summon: rect(210, rows.top + rows.summonY - 70, 300, 140),
          pair: rect(l.fieldX + 198, l.fieldY + 88, 216, 112),
          gauge: top.gauge,
          chips: rect(20, rows.top + rows.chipsY - 44, 680, 88),
          wave: rect(top.wave.x, top.wave.y, 430, top.wave.h),
          sun: rect(l.fieldX + 90, l.fieldY + 88, 330, 224),
          laser: rect(560, rows.top + rows.summonY - 50, 110, 110),
          purr: rect(480, rows.top + rows.currencyY - 38, 200, 76),
          cat: rect(l.fieldX + 90, l.fieldY + 88, 108, 112),
          grade: rect(40, rows.top + rows.summonY - 50, 170, 110),
          call: rect(500, rows.top + rows.utilY - 40, 200, 80),
          speed: rect(top.speed.x - 44, top.speed.y - 44, 88, 88),
          bossbar: rect(top.boss.x, top.boss.y, top.boss.w, top.boss.h),
        };
        for (const [name, target] of Object.entries(targets)) {
          const spot = cheerSpot({ target, home: { x: 360, y: h * 0.4 }, w: BOX.w, h: BOX.h, bounds: rect(0, 8, 720, h - 16), keep });
          const box = rect(spot.x - BOX.w / 2, spot.y - BOX.h / 2, BOX.w, BOX.h);
          // Inside the screen.
          expect(box.x, `${name} ${h}`).toBeGreaterThanOrEqual(0);
          expect(box.x + box.w, `${name} ${h}`).toBeLessThanOrEqual(720);
          expect(box.y, `${name} ${h}`).toBeGreaterThanOrEqual(0);
          expect(box.y + box.h, `${name} ${h}`).toBeLessThanOrEqual(h);
          // Off the chips' column, and off every control, cat and lane (the lesson's own target included).
          expect(overlapArea(box, column), `${name} ${h} column`).toBeLessThan(24);
          for (const k of keep) expect(overlapArea(box, k), `${name} ${h} ${JSON.stringify(k)}`).toBeLessThan(24);
        }
      }
    }
  });

  it('keeps off every control and line of writing even when the board is full of cats and the lane runs round it', () => {
    for (const h of [1280, 1600]) {
      const l = computeBattleLayout(720, h, 0, 0);
      const rows = bottomRects(l);
      const cats: Rect[] = [];
      for (let c = 0; c < 15; c++) cats.push(rect(l.fieldX + 90 + (c % 5) * 108, l.fieldY + 88 + Math.floor(c / 5) * 112, 108, 112));
      const { keep } = keepFor(h, true, cats);
      for (const target of [rect(210, rows.top + rows.summonY - 70, 300, 140), rect(l.fieldX + 90, l.fieldY + 88, 108, 112), rect(560, 20, 88, 88)]) {
        const spot = cheerSpot({ target, home: { x: 360, y: h * 0.4 }, w: BOX.w, h: BOX.h, bounds: rect(0, 8, 720, h - 16), keep });
        const box = rect(spot.x - BOX.w / 2, spot.y - BOX.h / 2, BOX.w, BOX.h);
        for (const k of keep) if (k.weight >= STICKER_WALL) expect(overlapArea(box, k), `${h} ${JSON.stringify(k)}`).toBeLessThan(24);
      }
    }
  });
});
