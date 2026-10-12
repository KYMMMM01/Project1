/** The gold dungeon's chest by name: short enough for the boss strip in English, and one noun in every line that mentions it. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { allStrings, setLang, t } from '@/core/i18n';
import { enemyDef } from '@/game/data/enemies';
import { topicFull } from '@/guide/text';
import '@/codex/strings';
import '@/game/data/strings';
import '@/game/data/stringsGame';
import '@/guide/strings';
import '@/meta/strings';
import '@/screens/battle/strings';
import '@/screens/shell/strings';
import '@/view/hud/strings';

describe('the gold dungeon chest: its names', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('is 보물상자 in Korean and a ten-character name in English, which is what the boss strip has room for beside the kill estimate', () => {
    setLang('ko');
    expect(t(enemyDef('boss_treasure').nameKey)).toBe('보물상자');
    setLang('en');
    const name = t(enemyDef('boss_treasure').nameKey);
    expect(name).toBe('Coin Chest');
    // The strip gives the name about 142 design px with "Est. ?" and about 110 with "Est. 99s+" (measured at 360 wide), the smallest allowed font
    // included: "Treasure Chest" (14 characters) was cut to "Treasure Ch…". "Gold Chest" is the shop's chest, so it is not an option.
    expect(name.length).toBeLessThanOrEqual(10);
  });

  it('is called by that one noun in the guidebook, the pre-run page, the card and the result, in both languages', () => {
    expect(allStrings().filter((s) => /treasure chest/i.test(s))).toEqual([]);
    setLang('en');
    expect(topicFull('gold_dungeon').join(' ')).toMatch(/coin chest/);
    expect(t('shell.pre.gold.rules.waves', { n: 8, s: 15 })).toMatch(/coin chest/);
    expect(t('shell.pre.gold.rules.chest', { n: 456 })).toMatch(/coin chest/);
    expect(t('hud.res.dungeonBonus', { n: 456 })).toMatch(/coin chest/);
    setLang('ko');
    for (const text of [topicFull('gold_dungeon').join(' '), t('shell.pre.gold.rules.waves', { n: 8, s: 15 }), t('shell.pre.gold.rules.chest', { n: 456 }), t('hud.res.dungeonBonus', { n: 456 })]) {
      expect(text).toContain('보물상자');
      expect(text).not.toMatch(/보물 상자/);
    }
  });
});
