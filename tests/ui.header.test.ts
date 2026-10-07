import { describe, expect, it } from 'vitest';
import { HEADER, HEADER_H, headerLayout } from '@/ui/headerMath';
import { dashRuns, fitDash } from '@/ui/paperMath';

const WIDTHS = [328, 480, 674];

describe('card header layout', () => {
  it.each(WIDTHS)('shares one centre line between the disc, the title and the control (width %i)', (w) => {
    const h = headerLayout(w);
    expect(h.disc.y + h.disc.d / 2).toBe(h.cy);
    expect(h.icon.y).toBe(h.cy);
    expect(h.control.y).toBe(h.cy);
    // The title's own line sits within a pixel of it (the glyphs' optical centre).
    expect(Math.abs(h.title.y - h.cy)).toBeLessThanOrEqual(1);
  });

  it.each(WIDTHS)('keeps the separator a fixed distance under the row and its ends on the same margins (width %i)', (w) => {
    const h = headerLayout(w);
    expect(h.sep.y - (h.disc.y + h.disc.d)).toBe(HEADER.below);
    // The disc's flat shadow (3 px) and its rim never reach the line: 8 px of paper stay between them.
    expect(h.sep.y - (h.disc.y + h.disc.d) - 3).toBeGreaterThanOrEqual(8);
    expect(h.sep.x0).toBe(HEADER.padX);
    expect(w - h.sep.x1).toBe(HEADER.padX);
    expect(h.disc.x).toBe(h.sep.x0);
    expect(w - (h.control.x + h.control.d / 2)).toBe(HEADER.padX);
    expect(h.contentTop - h.sep.y).toBe(HEADER.after);
  });

  it('puts the icon at 60 to 70 percent of its disc, centred', () => {
    const h = headerLayout(500);
    expect(h.icon.size / h.disc.d).toBeGreaterThanOrEqual(0.6);
    expect(h.icon.size / h.disc.d).toBeLessThanOrEqual(0.7);
    expect(h.icon.x).toBe(h.disc.cx);
  });

  it('keeps the title clear of the disc and of the control', () => {
    for (const w of WIDTHS) {
      for (const reserve of w < 480 ? [undefined] : [undefined, 150, 170]) {
        const h = headerLayout(w, { reserve });
        expect(h.title.x - (h.disc.x + h.disc.d)).toBe(HEADER.gap);
        const right = w - HEADER.padX - (reserve ?? HEADER.disc);
        expect(h.title.x + h.title.maxW).toBeLessThanOrEqual(right - HEADER.gap + 1e-9);
        expect(h.title.maxW).toBeGreaterThan(80);
      }
    }
  });

  it('has the same height on every card, and drops below a rim as one block', () => {
    expect(headerLayout(328).contentTop).toBe(HEADER_H);
    expect(headerLayout(674).contentTop).toBe(HEADER_H);
    const rimmed = headerLayout(674, { rim: 9 });
    expect(rimmed.contentTop).toBe(HEADER_H + 9);
    expect(rimmed.cy).toBe(headerLayout(674).cy + 9);
    expect(rimmed.sep.y - rimmed.disc.y).toBe(headerLayout(674).sep.y - headerLayout(674).disc.y);
  });

  it('lets the tape lie between the disc and the control without touching either', () => {
    for (const w of WIDTHS) {
      const h = headerLayout(w);
      expect(h.tapeSpan.max).toBeGreaterThanOrEqual(h.tapeSpan.min);
      expect(h.tapeSpan.min - 84 / 2).toBeGreaterThanOrEqual(h.disc.x + h.disc.d + 8);
      expect(h.tapeSpan.max + 84 / 2).toBeLessThanOrEqual(h.control.x - h.control.d / 2 - 8 + 1e-9);
    }
  });

  it('keeps the touch size: a control as big as the disc is still tappable through Button\'s own 88 px hit area', () => {
    expect(HEADER.disc).toBeLessThanOrEqual(88);
  });
});

describe('fitDash', () => {
  it.each([[632, 16, 11], [280, 16, 11], [100, 16, 11], [18, 16, 11]])('makes a line of %i px start and end with a whole dash', (len, dash, gap) => {
    const f = fitDash(len, dash, gap);
    const runs = dashRuns([0, 0, len, 0], false, f.dash, f.gap);
    const first = runs[0] as number[];
    const last = runs[runs.length - 1] as number[];
    expect(first[0]).toBeCloseTo(0, 6);
    expect(last[last.length - 2]).toBeCloseTo(len, 4);
    // Every dash has the same length, the last one included.
    const lens = runs.map((r) => Math.abs((r[r.length - 2] as number) - (r[0] as number)));
    for (const l of lens) expect(l).toBeCloseTo(lens[0] as number, 3);
  });

  it('changes the lengths by at most a sixth when it can', () => {
    const f = fitDash(632, 16, 11);
    expect(f.dash / 16).toBeGreaterThan(0.84);
    expect(f.dash / 16).toBeLessThan(1.16);
    expect(f.gap).toBe(11);
  });
});
