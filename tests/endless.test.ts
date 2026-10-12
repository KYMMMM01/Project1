/** Endless mode (2026-10-12): the Korean name is "무한 모드" everywhere a player reads it, and past wave 24 health grows 7% a wave. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { allStrings, setLang, t } from '@/core/i18n';
// Every table the game registers (the list of tests/core.font.test.ts), so the "no old name anywhere" check covers them all.
import '@/codex/strings';
import '@/game/data/strings';
import '@/game/data/stringsGame';
import '@/guide/strings';
import '@/meta/strings';
import '@/platform/adapters/devOverlay';
import '@/screens/battle/strings';
import '@/screens/cats/strings';
import '@/screens/missions/strings';
import '@/screens/pass/strings';
import '@/screens/shell/strings';
import '@/screens/shop/strings';
import '@/screens/system/strings';
import '@/ui/strings';
import '@/view/director/strings';
import '@/view/hud/strings';
import '@/view/strings';
import {
  BOSS_HP, BOSS_LIMITS, CHAPTER_WAVES, ELITE_HP, ELITE_LIMITS, ENDLESS_GROWTH, HP_INDEX, hpIndex, specialHp, specialLimit,
} from '@/game/data/balance';
import { topicFull, topicTeach, topicTitle } from '@/guide/text';
import { ENDLESS_TIERS } from '@/meta/data/schedule';

/** Mode-name strings, one per place the player meets the mode. */
const NAME_KEYS = ['meta.feature.endless', 'rt.mis.endless.title', 'battle.endless.title', 'shell.pre.mode.endless'] as const;

describe('endless mode: the name', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('is 무한 모드 in Korean on the battle card, the pre-run screen, the missions tab, the unlock texts and the guidebook', () => {
    setLang('ko');
    for (const key of NAME_KEYS) expect(t(key), key).toBe('무한 모드');
    expect(topicTitle('endless')).toBe('무한 모드');
  });

  it('stays Endless mode in English', () => {
    setLang('en');
    for (const key of NAME_KEYS) expect(t(key), key).toMatch(/^Endless [Mm]ode$/);
    expect(topicTitle('endless')).toBe('Endless mode');
    setLang('ko');
  });

  it('is not called 끝없는 모드 in any string of any table the game registers', () => {
    expect(allStrings().filter((s) => /끝없는\s*모드/.test(s))).toEqual([]);
  });

  it('quotes the growth, the wave it starts after and the tier waves from the data in the guidebook page, in both languages', () => {
    const growth = `${Math.round((ENDLESS_GROWTH - 1) * 100)}%`;
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      const page = topicFull('endless').join(' ');
      expect(page, lang).toContain(growth);
      expect(page, lang).toContain(String(CHAPTER_WAVES));
      for (const tier of ENDLESS_TIERS) expect(page, lang).toContain(String(tier.wave));
      expect(page, lang).not.toMatch(/\{\w+\}|undefined|NaN/);
      expect(topicTeach('endless'), lang).toBeTruthy();
    }
    setLang('ko');
  });
});

describe('endless mode: the curve past wave 24', () => {
  it('grows the health of an ordinary enemy by 7% a wave (it was 14%)', () => {
    expect(ENDLESS_GROWTH).toBe(1.07);
    const last = HP_INDEX[HP_INDEX.length - 1] as number;
    expect(hpIndex(HP_INDEX.length)).toBeCloseTo(last * 1.07, 9);
    // Wave 50 is about 5.8 times wave 24 (the old rate made it about 30 times).
    expect(hpIndex(50) / hpIndex(24)).toBeCloseTo(1.07 ** 26, 6);
    expect(hpIndex(50) / hpIndex(24)).toBeGreaterThan(5.7);
    expect(hpIndex(50) / hpIndex(24)).toBeLessThan(5.9);
  });

  it('grows the elites and the bosses at the same rate, eight waves at a time, and keeps their time limits at the last value', () => {
    for (let k = 3; k < 12; k++) {
      expect(specialHp('boss', k) / specialHp('boss', k - 1), `boss ${k}`).toBeCloseTo(1.07 ** 8, 9);
      expect(specialHp('elite', k) / specialHp('elite', k - 1), `elite ${k}`).toBeCloseTo(1.07 ** 8, 9);
    }
    // The boss of wave 40 and the elite of wave 36 are the fifth (ordinal 4): two steps of eight waves past the last table value.
    expect(specialHp('boss', 4)).toBeCloseTo((BOSS_HP[2] as number) * 1.07 ** 16, 6);
    expect(specialHp('elite', 4)).toBeCloseTo((ELITE_HP[2] as number) * 1.07 ** 16, 6);
    // The boss of wave 56 (ordinal 6) and the cucumber of wave 56 grew by the same factor since wave 24.
    expect(specialHp('boss', 6) / (BOSS_HP[2] as number)).toBeCloseTo(hpIndex(24 + 32) / hpIndex(24), 6);
    expect(specialLimit('boss', 12)).toBe(BOSS_LIMITS[BOSS_LIMITS.length - 1]);
    expect(specialLimit('elite', 12)).toBe(ELITE_LIMITS[ELITE_LIMITS.length - 1]);
  });

  it('leaves waves 1 to 24 and the first three elites and bosses as they were', () => {
    expect(HP_INDEX[24]).toBe(2183);
    expect([...BOSS_HP]).toEqual([1431, 3658, 12965]);
    expect([...ELITE_HP]).toEqual([1055, 3848, 10080]);
  });
});
