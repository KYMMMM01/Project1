import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addStrings, setLang } from '@/core/i18n';
import { chamferPoints, flamePoints, roundedPolyPath, wingPoints } from '@/ui/cardShapes';
import { scaffoldLayout } from '@/ui/layoutMath';
import { formatOdds, oddsBarWidth, oddsTotal } from '@/ui/oddsMath';
import { rarityName } from '@/ui/rarity';
import { RARITY_ORDER } from '@/ui/theme';

describe('formatOdds', () => {
  it('trims to at most two decimals without trailing zeros', () => {
    expect(formatOdds(0.6)).toBe('60%');
    expect(formatOdds(0.125)).toBe('12.5%');
    expect(formatOdds(0.0025)).toBe('0.25%');
    expect(formatOdds(0.027)).toBe('2.7%');
    expect(formatOdds(0.5)).toBe('50%');
  });

  it('never shows a real chance as 0% or 100%', () => {
    expect(formatOdds(0)).toBe('0%');
    expect(formatOdds(-1)).toBe('0%');
    expect(formatOdds(Number.NaN)).toBe('0%');
    expect(formatOdds(0.00001)).toBe('<0.01%');
    expect(formatOdds(0.9999999)).toBe('99.99%');
    expect(formatOdds(1)).toBe('100%');
  });

  it('keeps the drawable total honest', () => {
    expect(oddsTotal([0.6, 0.28, 0.09, 0.027, 0.003])).toBeCloseTo(1, 9);
    expect(oddsTotal([0.5, -0.2, 0.2])).toBeCloseTo(0.7, 9);
  });
});

describe('oddsBarWidth', () => {
  it('is proportional but always leaves a sliver for a real chance', () => {
    expect(oddsBarWidth(0.5, 400)).toBe(200);
    expect(oddsBarWidth(0.001, 400)).toBe(8);
    expect(oddsBarWidth(0, 400)).toBe(0);
    expect(oddsBarWidth(2, 400)).toBe(400);
  });

  it('never exceeds a track shorter than the minimum', () => {
    expect(oddsBarWidth(0.01, 5)).toBe(5);
  });
});

describe('scaffoldLayout', () => {
  it('puts the body between the header and the screen bottom when there is no action bar', () => {
    const r = scaffoldLayout(720, 1280, 40, 34, 104, 0);
    expect(r.titleBar).toEqual({ x: 0, y: 0, w: 720, h: 144 });
    expect(r.actionBar).toBeNull();
    expect(r.body).toEqual({ x: 0, y: 144, w: 720, h: 1136 });
    // Without a footer the content needs scroll slack to clear the home indicator.
    expect(r.bottomInset).toBe(34);
  });

  it('reserves the footer plus the bottom inset', () => {
    const r = scaffoldLayout(720, 1280, 0, 34, 104, 148);
    expect(r.actionBar).toEqual({ x: 0, y: 1098, w: 720, h: 182 });
    expect(r.body.y + r.body.h).toBe(r.actionBar?.y);
    expect(r.bottomInset).toBe(0);
  });

  it('survives a screen shorter than its chrome', () => {
    const r = scaffoldLayout(720, 200, 40, 34, 104, 148);
    expect(r.body.h).toBe(0);
  });
});

describe('card silhouettes', () => {
  it('chamfers the four corners', () => {
    const p = chamferPoints(0, 0, 100, 200, 10);
    expect(p).toHaveLength(16);
    expect(p.slice(0, 4)).toEqual([10, 0, 90, 0]);
    for (let i = 0; i < p.length; i += 2) {
      expect(p[i]).toBeGreaterThanOrEqual(0);
      expect(p[i]).toBeLessThanOrEqual(100);
      expect(p[i + 1]).toBeGreaterThanOrEqual(0);
      expect(p[i + 1]).toBeLessThanOrEqual(200);
    }
  });

  it('flame outline crests above the top edge and reaches out on both sides', () => {
    const p = flamePoints(0, 0, 100, 200, 10, 8);
    let minX = Infinity;
    let maxX = -Infinity;
    const crest: number[] = [];
    for (let i = 0; i < p.length; i += 2) {
      minX = Math.min(minX, p[i] as number);
      maxX = Math.max(maxX, p[i] as number);
      if ((p[i + 1] as number) < 0) crest.push(p[i + 1] as number);
    }
    expect(minX).toBe(-8);
    expect(maxX).toBe(108);
    expect(crest).toHaveLength(3);
    // The middle tip is the tallest.
    expect(Math.min(...crest)).toBe(-12);
    expect(crest[1]).toBe(-12);
  });

  it('mirrors a wing from the left edge to the right', () => {
    const r = wingPoints(1, 100, 80, 12, 1);
    const l = wingPoints(-1, 0, 80, 12, 1);
    expect(r).toHaveLength(14);
    for (let i = 0; i < r.length; i += 2) {
      expect((r[i] as number) - 100).toBeCloseTo(-(l[i] as number), 9);
      expect(r[i + 1]).toBe(l[i + 1]);
    }
  });

  it('rounds each corner with one curve and closes the path', () => {
    const calls: string[] = [];
    const g = {
      moveTo: () => calls.push('m'),
      lineTo: () => calls.push('l'),
      quadraticCurveTo: () => calls.push('q'),
      closePath: () => calls.push('c'),
    };
    roundedPolyPath(g as never, [0, 0, 10, 0, 10, 10, 0, 10], 3);
    expect(calls.filter((c) => c === 'q')).toHaveLength(4);
    expect(calls[0]).toBe('m');
    expect(calls[calls.length - 1]).toBe('c');
  });

  it('copes with a degenerate (zero-length) edge', () => {
    const g = { moveTo: vi.fn(), lineTo: vi.fn(), quadraticCurveTo: vi.fn(), closePath: vi.fn() };
    expect(() => roundedPolyPath(g as never, [0, 0, 0, 0, 10, 10], 4)).not.toThrow();
    const all = [...g.moveTo.mock.calls, ...g.lineTo.mock.calls, ...g.quadraticCurveTo.mock.calls];
    for (const c of all) for (const v of c) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('rarityName', () => {
  beforeAll(() => {
    // setLang writes <html lang>; the node environment has no document.
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    addStrings('ko', { 'rarity.common': '꼬마', 'rarity.mythic': '수호신' });
    addStrings('en', { 'rarity.common': 'Kitten', 'rarity.mythic': 'Guardian' });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('comes from the i18n tables, in the active language', () => {
    setLang('ko');
    expect(rarityName('common')).toBe('꼬마');
    setLang('en');
    expect(rarityName('mythic')).toBe('Guardian');
  });

  it('falls back to the visible key when a theme forgot a name', () => {
    expect(rarityName('rare')).toBe('rarity.rare');
  });

  it('is defined for all five rarities in order', () => {
    expect(RARITY_ORDER).toEqual(['common', 'rare', 'epic', 'legendary', 'mythic']);
  });
});
