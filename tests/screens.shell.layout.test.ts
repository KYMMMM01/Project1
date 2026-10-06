import { describe, expect, it } from 'vitest';
import { TAB_BAR_H, TOP_BAR_CONTENT_H, pillWidth, shellLayout, xpFraction } from '@/screens/shell/layoutMath';
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

  it('splits the width into equal currency pills that fit the margins', () => {
    const w = pillWidth(720, 24, 24, 3);
    expect(w).toBe(208);
    expect(w * 3 + 24 * 2 + 24 * 2).toBeLessThanOrEqual(720);
    expect(pillWidth(2000, 24, 24, 3)).toBe(260);
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
