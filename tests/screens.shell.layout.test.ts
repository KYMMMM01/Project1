import { describe, expect, it } from 'vitest';
import { TAB_BAR_H, TOP_BAR_CONTENT_H, captionRooms, classLineSlots, coverCrop, pillRow, shellLayout, xpFraction } from '@/screens/shell/layoutMath';
import { planRun } from '@/screens/shell/runPlan';

describe('shell layout', () => {
  it('stacks the top bar, the content and the tab bar to fill the screen', () => {
    for (const h of [1280, 1500, 1600]) {
      const r = shellLayout(720, h, 0, 0);
      expect(r.topBarH).toBe(TOP_BAR_CONTENT_H);
      expect(r.tabBarH).toBe(TAB_BAR_H);
      expect(r.area.y).toBe(r.topBarH);
      expect(r.area.y + r.area.h + r.tabBarH).toBe(h);
    }
  });

  it('pushes the bars out by the safe-area insets and keeps the content between them', () => {
    const r = shellLayout(720, 1400, 48, 34);
    expect(r.topBarH).toBe(TOP_BAR_CONTENT_H + 48);
    expect(r.tabBarH).toBe(TAB_BAR_H + 34);
    expect(r.area.h).toBe(1400 - r.topBarH - r.tabBarH);
  });

  it('never returns a negative content height on a tiny screen', () => {
    expect(shellLayout(720, 200, 40, 40).area.h).toBe(0);
  });

  it('gives the content area enough room for the start button on the smallest design size', () => {
    expect(shellLayout(720, 1280, 0, 0).area.h).toBeGreaterThan(900);
  });

  it('lays the currency pills out with the same gutter on both sides', () => {
    const { pw, x0 } = pillRow(720, 24, 28, 21, 3);
    expect(x0 - 21).toBe(24);
    expect(x0 + pw * 3 + 28 * 2).toBeCloseTo(720 - 24, 6);
    expect(pillRow(2000, 24, 28, 21, 3).pw).toBe(260);
  });

  it('turns xp into a safe 0..1 ring fraction', () => {
    expect(xpFraction(0, 120)).toBe(0);
    expect(xpFraction(60, 120)).toBe(0.5);
    expect(xpFraction(500, 120)).toBe(1);
    expect(xpFraction(-5, 120)).toBe(0);
    expect(xpFraction(10, 0)).toBe(0);
    expect(xpFraction(Number.NaN, 120)).toBe(0);
  });
});

describe('photo crop', () => {
  it('fills a wide box from a tall picture without distortion', () => {
    const c = coverCrop(720, 1287, 600, 300, 0.5);
    expect(c.w).toBe(720);
    expect(c.w / c.h).toBeCloseTo(2, 5);
    expect(c.x).toBe(0);
    expect(c.y).toBeCloseTo((1287 - c.h) / 2, 5);
  });

  it('moves the window with the focus and keeps it inside the picture', () => {
    const top = coverCrop(720, 1287, 600, 300, 0);
    const bottom = coverCrop(720, 1287, 600, 300, 1);
    expect(top.y).toBe(0);
    expect(bottom.y + bottom.h).toBeCloseTo(1287, 5);
    expect(coverCrop(720, 1287, 600, 300, -4).y).toBe(0);
    expect(coverCrop(720, 1287, 600, 300, 9).y).toBeCloseTo(bottom.y, 5);
  });

  it('crops the sides when the picture is wider than the box', () => {
    const c = coverCrop(1000, 500, 300, 300);
    expect(c.h).toBe(500);
    expect(c.w).toBe(500);
    expect(c.x).toBe(250);
  });

  it('falls back to the whole picture for a degenerate box', () => {
    expect(coverCrop(720, 1287, 0, 300)).toEqual({ x: 0, y: 0, w: 720, h: 1287 });
  });
});

describe('class line slots', () => {
  it('keeps the photos in order and gives the awaken gap the room the merge arrows do not use', () => {
    const s = classLineSlots(556, 5, 68, 40);
    expect(s.centres).toHaveLength(5);
    expect(s.arrows).toHaveLength(4);
    expect(s.centres[0]).toBe(34);
    expect(s.centres[4]).toBeCloseTo(556 - 34, 6);
    expect(s.lastGap).toBeCloseTo(556 - 5 * 68 - 3 * 40, 6);
    expect(s.lastGap).toBeGreaterThanOrEqual(88);
    expect((s.centres[1] as number) - (s.centres[0] as number)).toBe(68 + 40);
    expect(s.arrows[0]).toBeCloseTo((s.centres[0] as number) + 34 + 20, 6);
  });

  it('spreads the gaps evenly when the row is too short for a wide last gap', () => {
    const s = classLineSlots(400, 5, 68, 40);
    expect(s.lastGap).toBeCloseTo((400 - 340) / 4, 6);
    expect((s.centres[1] as number) - (s.centres[0] as number)).toBeCloseTo(68 + s.lastGap, 6);
  });
});

describe('class line captions', () => {
  const centres = [34, 142, 250, 358, 522];

  it('leaves every caption its natural width while the neighbours leave the room', () => {
    expect(captionRooms(centres, [70, 60, 118, 45, 82], 556, 6)).toEqual([70, 60, 118, 45, 82]);
  });

  it('squeezes a caption only as far as the neighbouring ones need', () => {
    const rooms = captionRooms(centres, [70, 100, 118, 45, 82], 556, 6);
    expect(rooms[1]).toBeLessThan(100);
    expect(rooms[1]).toBeGreaterThan(0);
    expect(rooms[2]).toBeLessThan(118);
    expect(rooms[0]).toBe(70);
    // Two touching captions never overlap once both use their room.
    const half = (rooms[1] as number) / 2 + (rooms[2] as number) / 2;
    expect(half).toBeLessThanOrEqual(250 - 142);
  });

  it('never gives a caption more than the row', () => {
    expect(captionRooms([50], [900], 120, 6)).toEqual([120]);
  });
});

describe('run plan', () => {
  const daily = { chapter: 3, modifiers: ['rush' as const] };

  it('forces the tutorial onto chapter 1 at the base level with no snack', () => {
    expect(planRun({ mode: 'tutorial', chapter: 4, stake: 3 }, { cleared: [0, 0, 0, 0, 0], daily })).toEqual({
      mode: 'tutorial', chapter: 1, stake: 0, modifiers: [], snackAllowed: false,
    });
  });

  it('takes the daily challenge setup and offers no snack', () => {
    const p = planRun({ mode: 'daily', chapter: 1, stake: 4 }, { cleared: [1, 0, 0, 0, 0], daily });
    expect(p.chapter).toBe(3);
    expect(p.stake).toBe(0);
    expect(p.modifiers).toEqual(['rush']);
    expect(p.snackAllowed).toBe(false);
  });

  it('keeps endless mode on a chapter the player has cleared', () => {
    const cleared = [1, 1, 0, 0, 0];
    expect(planRun({ mode: 'endless' }, { cleared, daily }).chapter).toBe(2);
    expect(planRun({ mode: 'endless', chapter: 1 }, { cleared, daily }).chapter).toBe(1);
    expect(planRun({ mode: 'endless', chapter: 5 }, { cleared, daily }).chapter).toBe(2);
    expect(planRun({ mode: 'endless' }, { cleared: [0, 0, 0, 0, 0], daily }).chapter).toBe(1);
  });

  it('clamps a chapter run into the existing chapters and stakes', () => {
    const p = planRun({ mode: 'chapter', chapter: 9, stake: 12 }, { cleared: [6, 6, 6, 6, 6], daily });
    expect(p.chapter).toBe(5);
    expect(p.stake).toBe(5);
    expect(p.snackAllowed).toBe(true);
    expect(planRun({ mode: 'chapter' }, { cleared: [0, 0, 0, 0, 0], daily })).toMatchObject({ chapter: 1, stake: 0 });
  });
});
