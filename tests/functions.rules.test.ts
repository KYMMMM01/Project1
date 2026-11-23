import { describe, expect, it } from 'vitest';
import {
  MAX_WAVES,
  MAX_WAVE_SECONDS,
  MIN_WAVE_SECONDS,
  SUBMIT_COOLDOWN_MS,
  boardId,
  cleanName,
  defaultName,
  endlessWaveKind,
  minRunSeconds,
  seoulWeekKey,
  validateRun,
} from '../functions/src/rules';
import {
  BOSS_APPEAR,
  BOSS_CAP_BURST,
  BOSS_LIMITS,
  BOSS_MIN_KILL,
  CHAPTER_COUNT,
  CLEAR_DELAY,
  ELITE_LIMITS,
  NEXT_WAVE_DELAY,
  SPAWN_START,
  SPAWN_WINDOW,
} from '../src/game/data/balance';
import { SP_ROWS } from '../src/game/data/spSkills';
import { scriptFor } from '../src/game/data/waves';

const NOW = Date.UTC(2026, 10, 12, 3, 0, 0);
const okRun = (waves: number) => ({ waves, seconds: minRunSeconds(waves) + 1 });

describe('validateRun', () => {
  it('accepts a plausible run, the record being its waves', () => {
    expect(validateRun(okRun(20), NOW, null)).toBeNull();
    expect(validateRun(okRun(1), NOW, null)).toBeNull();
    expect(validateRun(okRun(MAX_WAVES), NOW, null)).toBeNull();
  });

  it('rejects malformed runs, a run with no wave cleared and one past the cap', () => {
    expect(validateRun(null, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: 1.5, seconds: 99 }, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: 1, seconds: NaN }, NOW, null)).toBe('bad-run');
    expect(validateRun({ waves: '5', seconds: 99 }, NOW, null)).toBe('bad-run');
    expect(validateRun(okRun(0), NOW, null)).toBe('bad-run');
    expect(validateRun(okRun(MAX_WAVES + 1), NOW, null)).toBe('bad-run');
    // A forged record with time to match: past the cap it is refused whatever seconds it claims.
    expect(validateRun({ waves: 10000, seconds: 10_000_000 }, NOW, null)).toBe('bad-run');
  });

  it('rejects runs faster than the floor of their waves, and ones claiming more time than waves can take', () => {
    // 8 waves: 6 normal, the elite of wave 4 and the boss of wave 8.
    expect(minRunSeconds(8)).toBe(6 * MIN_WAVE_SECONDS.normal + MIN_WAVE_SECONDS.elite + MIN_WAVE_SECONDS.boss);
    expect(validateRun({ waves: 8, seconds: minRunSeconds(8) }, NOW, null)).toBeNull();
    expect(validateRun({ waves: 8, seconds: minRunSeconds(8) - 1 }, NOW, null)).toBe('too-fast');
    expect(validateRun({ waves: 100, seconds: 300 }, NOW, null)).toBe('too-fast');
    expect(validateRun({ waves: 3, seconds: 4 * MAX_WAVE_SECONDS }, NOW, null)).toBeNull();
    expect(validateRun({ waves: 3, seconds: 4 * MAX_WAVE_SECONDS + 1 }, NOW, null)).toBe('bad-run');
  });

  it('keeps the elite and boss rhythm of the real wave scripts, in every chapter and past wave 24', () => {
    for (let c = 1; c <= CHAPTER_COUNT; c++) {
      for (let w = 1; w <= MAX_WAVES; w++) expect(endlessWaveKind(w), `chapter ${c} wave ${w}`).toBe(scriptFor(c, w).kind);
    }
  });

  it('stays at least 20% under the floor the battle rules set, so no honest run is refused', () => {
    // Normal: the next wave can be called only once spawning ends.
    const normal = SPAWN_START + SPAWN_WINDOW;
    // Elite and boss: the damage allowance with its burst, less what skips it (the gunner's bounty pool), from the target's entrance, plus
    // the clear and next-wave delays. Endless runs at butler level 0, so the shortest limit of each table applies.
    const skipped = Math.max(0, ...Object.values(SP_ROWS).map((r) => ('ignoreCap' in r && r.ignoreCap && 'pool' in r ? (r.pool as number) : 0)));
    const special = (limit: number): number =>
      BOSS_APPEAR + (1 - skipped) * BOSS_MIN_KILL * limit - BOSS_CAP_BURST + CLEAR_DELAY + NEXT_WAVE_DELAY;
    const floor = { normal, elite: special(Math.min(...ELITE_LIMITS)), boss: special(Math.min(...BOSS_LIMITS)) };
    for (const kind of ['normal', 'elite', 'boss'] as const) {
      expect(MIN_WAVE_SECONDS[kind], kind).toBeLessThanOrEqual(floor[kind] * 0.8);
      expect(MIN_WAVE_SECONDS[kind], kind).toBeGreaterThan(floor[kind] * 0.6);
    }
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
