import { describe, expect, it } from 'vitest';
import {
  MAX_SCORE,
  MIN_SECONDS_PER_WAVE,
  SUBMIT_COOLDOWN_MS,
  boardId,
  cleanName,
  defaultName,
  seoulWeekKey,
  validateRun,
} from '../functions/src/rules';

const NOW = Date.UTC(2026, 10, 12, 3, 0, 0);
const okRun = (waves: number) => ({ waves, seconds: waves * MIN_SECONDS_PER_WAVE + 1 });

describe('validateRun', () => {
  it('accepts a plausible run, the record being its waves', () => {
    expect(validateRun(okRun(20), NOW, null)).toBeNull();
    expect(validateRun(okRun(1), NOW, null)).toBeNull();
    expect(validateRun(okRun(MAX_SCORE), NOW, null)).toBeNull();
  });

  it('rejects malformed runs, a run with no wave cleared and one past the cap', () => {
    expect(validateRun(null, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: 1.5, seconds: 99 }, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: 1, seconds: NaN }, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: '5', seconds: 99 }, NOW, null)).toBe('bad-run');
    expect(validateRun(okRun(0), NOW, null)).toBe('bad-run');
    expect(validateRun(okRun(MAX_SCORE + 1), NOW, null)).toBe('bad-run');
  });

  it('rejects runs faster than the minimum seconds per wave', () => {
    const tooFast = { waves: 100, seconds: 100 * MIN_SECONDS_PER_WAVE - 1 };
    expect(validateRun(tooFast, NOW, null)).toBe('too-fast');
  });

  it('allows one submit per cooldown window', () => {
    expect(validateRun(okRun(5), NOW, NOW - SUBMIT_COOLDOWN_MS + 1)).toBe('too-soon');
    expect(validateRun(okRun(5), NOW, NOW - SUBMIT_COOLDOWN_MS)).toBeNull();
  });
});

describe('board ids', () => {
  it('uses the Monday of the week in Seoul time', () => {
    // Thu 2026-11-12 is in the week starting Mon 2026-11-09.
    expect(seoulWeekKey(NOW)).toBe('2026-11-09');
    // Sunday 23:30 Seoul is still the old week; one hour later it is Monday.
    expect(seoulWeekKey(Date.parse('2026-11-15T23:30:00+09:00'))).toBe('2026-11-09');
    expect(seoulWeekKey(Date.parse('2026-11-16T00:30:00+09:00'))).toBe('2026-11-16');
    // 15:30 UTC Sunday is already Monday 00:30 in Seoul.
    expect(seoulWeekKey(Date.parse('2026-11-15T15:30:00Z'))).toBe('2026-11-16');
  });

  it('builds board ids', () => {
    expect(boardId('endless', NOW)).toBe('endless');
    expect(boardId('week', NOW)).toBe('week-2026-11-09');
  });

  it('derives a stable default name', () => {
    expect(defaultName('abc')).toBe(defaultName('abc'));
    expect(defaultName('abc')).toMatch(/^집사 \d{4}$/);
  });
});

describe('cleanName', () => {
  it('keeps a name of 2 to 12 Hangul syllables, Latin letters or digits, tidying its spaces', () => {
    expect(cleanName('냥이')).toEqual({ name: '냥이' });
    expect(cleanName('  고양이   집사 7 ')).toEqual({ name: '고양이 집사 7' });
    expect(cleanName('Meow Boss 99')).toEqual({ name: 'Meow Boss 99' });
    expect(cleanName('이름' + String.fromCharCode(10) + '둘')).toEqual({ name: '이름 둘' });
    expect(cleanName('가나다라마바사아자차카타')).toEqual({ name: '가나다라마바사아자차카타' });
    // The default name is a valid one.
    expect('name' in cleanName(defaultName('uid-1'))).toBe(true);
  });

  it('refuses names of the wrong length or with other characters, lone jamo included', () => {
    for (const bad of ['냥', '', '   ', '가나다라마바사아자차카타파', 'ㅋㅋㅋ', '냥이!', '집사😺', 42, null]) {
      expect(cleanName(bad)).toEqual({ why: 'bad-name' });
    }
  });

  it('refuses blocked words, across spaces and letter case', () => {
    expect(cleanName('씨 발 냥')).toEqual({ why: 'blocked-name' });
    expect(cleanName('ADMIN cat')).toEqual({ why: 'blocked-name' });
    expect(cleanName('운영자냥')).toEqual({ why: 'blocked-name' });
  });

  it('is the same check for decomposed Hangul (normalised before the test)', () => {
    expect(cleanName('냥이'.normalize('NFD'))).toEqual({ name: '냥이' });
  });
});
