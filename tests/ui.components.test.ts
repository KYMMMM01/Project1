import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { addStrings, setLang } from '@/core/i18n';
import { buttonRows, scaffoldLayout } from '@/ui/layoutMath';
import { formatOdds, oddsBarWidth, oddsTotal } from '@/ui/oddsMath';
import { rarityName } from '@/ui/rarity';
import { ButtonPalettes, Color, Dim, Rarity, RARITY_ORDER, rarityIndex } from '@/ui/theme';
import { luma } from '@/ui/colors';

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

/** WCAG relative luminance of a 0xRRGGBB colour. */
function relLuma(c: number): number {
  const ch = (v: number): number => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((c >> 16) & 0xff) + 0.7152 * ch((c >> 8) & 0xff) + 0.0722 * ch(c & 0xff);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = relLuma(a) > relLuma(b) ? [a, b] : [b, a];
  return (relLuma(hi) + 0.05) / (relLuma(lo) + 0.05);
}

describe('paper theme', () => {
  it('ink is dark and reads on every paper surface', () => {
    expect(luma(Color.ink)).toBeLessThan(70);
    for (const paper of [Color.paper, Color.paperLight, Color.paperDim, Color.kraft]) {
      expect(contrast(Color.ink, paper)).toBeGreaterThan(4.5);
    }
    // Soft ink is the secondary text on cream sheets.
    expect(contrast(Color.inkSoft, Color.paper)).toBeGreaterThan(4.5);
  });

  it('every button palette carries an ink that reads on its paper', () => {
    for (const [id, p] of Object.entries(ButtonPalettes)) {
      expect(contrast(p.ink, p.base), id).toBeGreaterThan(3.5);
    }
  });

  it('legacy tokens keep their names but are now light surfaces with dark text', () => {
    expect(luma(Color.panel)).toBeGreaterThan(220);
    expect(luma(Color.panelDark)).toBeGreaterThan(200);
    expect(Color.text).toBe(Color.ink);
    expect(Color.textDim).toBe(Color.inkSoft);
    expect(Color.outline).toBe(Color.ink);
  });

  it('the dim behind popups is a warm brown, not black or purple', () => {
    const r = (Dim.backdrop >> 16) & 0xff;
    const b = Dim.backdrop & 0xff;
    expect(r).toBeGreaterThan(b);
    expect(Dim.backdropAlpha).toBeGreaterThanOrEqual(0.55);
    expect(Dim.backdropAlpha).toBeLessThanOrEqual(0.6);
  });

  it('the five rarity hues are all different and readable as marks on cream', () => {
    const colors = RARITY_ORDER.map((id) => Rarity[id].color);
    expect(new Set(colors).size).toBe(5);
    for (const id of RARITY_ORDER) expect(contrast(Rarity[id].dark, Color.paper), id).toBeGreaterThan(2.5);
    expect(rarityIndex('mythic')).toBe(4);
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

describe('buttonRows', () => {
  it('gives the first row the height of the icon when it is taller than the label line, so the sublabel starts under it', () => {
    // The guidebook button: a 40 px label with a 52 px icon and a 24 px sublabel.
    const { row1, row2 } = buttonRows(40, 52, 24, true, true);
    expect(row1).toBe(52);
    expect(row2).toBeCloseTo(26.4, 5);
  });

  it('keeps the label line when the icon is smaller, and has no second row without a sublabel', () => {
    expect(buttonRows(30, 20, 24, true, false)).toEqual({ row1: 30 * 1.08, row2: 0 });
    expect(buttonRows(30, 20, 24, false, false)).toEqual({ row1: 20, row2: 0 });
  });
});
