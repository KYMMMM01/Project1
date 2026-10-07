import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/core/i18n';
import '@/game/data/strings';
import { BAR_H_NEXT, BAR_H_PLAIN, MIN_TARGET, nextKind, nextText, resultBar, type BarBox } from '@/view/nextOffer';

const WIDTH = 672;

function overlap(a: BarBox, b: BarBox): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

describe('the result page buttons', () => {
  it('keeps today\'s row of Home and Retry when nothing is offered', () => {
    const bar = resultBar(false, WIDTH);
    expect(bar.next).toBeNull();
    expect(bar.height).toBe(BAR_H_PLAIN);
    expect(bar.home.x).toBeLessThan(bar.retry.x);
    expect(bar.home.y).toBe(0);
    expect(bar.retry.y).toBe(0);
    expect(bar.retry.w).toBeGreaterThan(bar.home.w);
  });

  it('puts a wide primary over two smaller buttons, every target at least 88 px and inside the bar', () => {
    const bar = resultBar(true, WIDTH);
    const next = bar.next as BarBox;
    expect(next).not.toBeNull();
    expect(bar.height).toBe(BAR_H_NEXT);
    for (const b of [next, bar.home, bar.retry]) {
      expect(b.h).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(b.w).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(-WIDTH / 2);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(WIDTH / 2);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(-bar.height / 2);
      // A button's flat shadow hangs a few px under its face.
      expect(b.y + b.h / 2 + 10).toBeLessThanOrEqual(bar.height / 2);
    }
    expect(next.y).toBeLessThan(bar.home.y);
    expect(next.w).toBeGreaterThan(bar.home.w);
    expect(overlap(next, bar.home)).toBe(false);
    expect(overlap(next, bar.retry)).toBe(false);
    expect(overlap(bar.home, bar.retry)).toBe(false);
  });

  it('shrinks to a narrow screen without the buttons touching', () => {
    const bar = resultBar(true, 520);
    const next = bar.next as BarBox;
    expect(next.w).toBeLessThanOrEqual(520);
    expect(overlap(bar.home, bar.retry)).toBe(false);
  });
});

describe('the wording of the offer', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    setLang('ko');
  });
  afterAll(() => vi.unstubAllGlobals());

  it('tells a chapter step from a butler step', () => {
    expect(nextKind({ chapter: 1 }, { chapter: 2 })).toBe('chapter');
    expect(nextKind({ chapter: 5 }, { chapter: 5 })).toBe('butler');
  });

  it('names the chapter and, above level 0, the butler level', () => {
    expect(nextText({ chapter: 1 }, { chapter: 2, stake: 0 })).toEqual({ label: '다음: 챕터 2 주방', sub: '' });
    expect(nextText({ chapter: 1 }, { chapter: 2, stake: 2 })).toEqual({ label: '다음: 챕터 2 주방', sub: '집사 2단계' });
  });

  it('says the butler level when the chapter stays, with the chapter under it', () => {
    expect(nextText({ chapter: 5 }, { chapter: 5, stake: 1 })).toEqual({ label: '다음: 집사 1단계', sub: '챕터 5 동물병원' });
  });

  it('has an English wording of the same shape', () => {
    setLang('en');
    const chapter = nextText({ chapter: 1 }, { chapter: 3, stake: 0 });
    expect(chapter.label.startsWith('Next: Chapter 3 ')).toBe(true);
    expect(nextText({ chapter: 5 }, { chapter: 5, stake: 2 }).label).toBe('Next: Butler 2');
    setLang('ko');
  });
});
