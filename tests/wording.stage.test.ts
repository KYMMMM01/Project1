import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { allStrings, setLang, t } from '@/core/i18n';
import '@/codex/strings';
import '@/game/data/strings';
import '@/game/data/stringsGame';
import '@/guide/strings';
import '@/meta/strings';
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

/**
 * The block of four waves (`act` in the code) is called "스테이지" / "Stage" for the player (2026-10-10; the word "막" did not read as
 * what it is). Names in the code stay. These tests keep the old word from coming back through a new string.
 */

/** The strings that name the block or number it, with the placeholders they take. */
const STAGE_KEYS: Record<string, Record<string, number | string>> = {
  'guide.acts.title': {},
  'guide.acts.teach': { actLen: 4 },
  'guide.acts.full': { actLen: 4, acts: 6, waves: 24 },
  'guide.purr.full': { elite: 1, boss: 2, act: 2, molt: 1, awaken: 10 },
  'guide.sun.full': { cells: 5, kinds: 'x' },
  'guide.toys.full': { options: 3, early: 'a', mid: 'b', late: 'c' },
  'hud.wave': { act: 3, wave: 12, total: 24 },
  'hud.waveOpen': { act: 3, wave: 12 },
  'hud.pause.where': { act: 3, wave: 12, total: 24 },
  'hud.pause.whereOpen': { act: 3, wave: 12 },
  'hud.relic.cleared': { act: 3 },
  'hud.fail.not_enough_purr': {},
  'director.wave': { act: 3, wave: 12 },
  'director.actClear': { act: 3 },
  'relic.purr_pillow.desc': { a: 3 },
  'modifier.toy_box.desc': { a: 2 },
  'stake.2': { a: 1 },
};

/** How the old word was written next to a number, a particle or a quantifier ("3막", "한 막이", "막을 깰", "막마다", "뒷막"). */
const OLD_KO = /[0-9}]막|한 막|첫 막|다음 막|이른 막|중간 막|뒷막|막마다|막이 끝|막이 바뀔|막을 (깰|넘길|깨)|막 클리어/;

describe('the word for four waves is Stage', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('is 스테이지 in every Korean string that names the block, and Stage in English', () => {
    for (const [key, vars] of Object.entries(STAGE_KEYS)) {
      setLang('ko');
      const ko = t(key, vars);
      expect(ko, `ko ${key}`).not.toBe(key);
      expect(ko, `ko ${key}: ${ko}`).toContain('스테이지');
      expect(ko, `ko ${key}: ${ko}`).not.toMatch(OLD_KO);
      setLang('en');
      const en = t(key, vars);
      expect(en, `en ${key}`).not.toBe(key);
      expect(en, `en ${key}: ${en}`).toMatch(/[Ss]tage/);
    }
  });

  it('leaves no "막" in the sense of the block and no "act" in any string of either language', () => {
    for (const s of allStrings()) {
      expect(s, s).not.toMatch(OLD_KO);
      // {act}, {acts} and {actLen} are placeholders, not words.
      expect(s.replace(/\{\w+\}/g, ''), s).not.toMatch(/\b[Aa]cts?\b/);
    }
  });

  it('keeps "stage" for the block only: the sweep and first-clear lines say chapter and butler level', () => {
    setLang('en');
    for (const key of ['meta.err.not_cleared', 'shop.tickets.sub', 'hud.res.firstClear', 'rt.sys.feat.sweep']) {
      expect(t(key, { chapter: 1, stake: 1 }), key).not.toMatch(/[Ss]tage/);
    }
  });

  it('puts the stage number in the same shape everywhere: "스테이지 3" / "Stage 3", the word first', () => {
    for (const key of ['hud.wave', 'hud.waveOpen', 'hud.pause.where', 'hud.pause.whereOpen', 'hud.relic.cleared', 'director.wave', 'director.actClear']) {
      setLang('ko');
      expect(t(key, { act: 3, wave: 12, total: 24 }), key).toMatch(/^스테이지 3 /);
      setLang('en');
      expect(t(key, { act: 3, wave: 12, total: 24 }), key).toMatch(/^Stage 3 /);
    }
  });

  it('keeps the top bar label short: no "웨이브" / "Wave" next to the total (it does not fit 204 px of 24 px text)', () => {
    setLang('ko');
    expect(t('hud.wave', { act: 6, wave: 24, total: 24 })).toBe('스테이지 6 · 24/24');
    setLang('en');
    expect(t('hud.wave', { act: 6, wave: 24, total: 24 })).toBe('Stage 6 · 24/24');
  });
});
