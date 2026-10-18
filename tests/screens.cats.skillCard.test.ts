import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLang, setLang } from '@/core/i18n';
import { UNIT_IDS } from '@/game/api';
import { SP_ROWS } from '@/game/data/spSkills';
import { spTexts } from '@/game/data/spTexts';
import { unitDef } from '@/game/data/units';
import { skillCardOf } from '@/screens/cats/skillCard';
import '@/game/data/strings';

/**
 * Step 3, the cat screen at home: one card for the skill of a cat that has one (name, line, how often, the rank it comes with), one line for a cat that
 * will have one at a higher rank, and nothing at all while skills are off (decision 30).
 */

const original = getLang();
const LANGS = ['ko', 'en'] as const;

beforeAll(() => {
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});
afterAll(() => setLang(original));

describe('the cat screen\'s card for a skill', () => {
  it('does not exist with skills off, for any of the twenty cats', () => {
    expect(UNIT_IDS).toHaveLength(20);
    for (const id of UNIT_IDS) expect(skillCardOf(id, false), id).toBeNull();
  });

  it('is a card with the name, the line, the cooldown and the rank for each cat that has a skill', () => {
    const cats = UNIT_IDS.filter((id) => unitDef(id).spSkill);
    expect(cats).toHaveLength(12);
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of cats) {
        const card = skillCardOf(id, true);
        expect(card?.kind, `${lang} ${id}`).toBe('skill');
        if (card?.kind !== 'skill') continue;
        const skill = unitDef(id).spSkill;
        const texts = spTexts(skill?.id as never);
        expect(card.texts, `${lang} ${id}`).toEqual(texts);
        expect(card.rarity, id).toBe(unitDef(id).rarity);
        expect(texts.name.length, id).toBeGreaterThan(0);
        expect(texts.desc.length, id).toBeGreaterThan(20);
        expect(texts.meta, `${lang} ${id}`).toContain(String(SP_ROWS[skill?.id as keyof typeof SP_ROWS].cooldown));
        expect(texts.rank, `${lang} ${id}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('says which rank brings the skill, in the game\'s own rank words, on the card of a cat that has one', () => {
    setLang('ko');
    const rank = (id: Parameters<typeof skillCardOf>[0]): string => {
      const card = skillCardOf(id, true);
      return card?.kind === 'skill' ? card.texts.rank : '';
    };
    expect(rank('w_viking')).toBe('골목대장 스킬');
    expect(rank('w_samurai')).toBe('대왕 스킬');
    expect(rank('w_tiger')).toBe('수호신 스킬');
    setLang('en');
    expect(rank('w_viking')).toBe('Alley Boss skill');
    expect(rank('w_samurai')).toBe('King skill');
    expect(rank('w_tiger')).toBe('Guardian skill');
  });

  it('is one line "gets a skill at Alley Boss" for the cats below that rank (eight of them), and no card', () => {
    const plain = UNIT_IDS.filter((id) => !unitDef(id).spSkill);
    expect(plain).toHaveLength(8);
    setLang('ko');
    for (const id of plain) expect(skillCardOf(id, true), id).toEqual({ kind: 'later', text: '골목대장부터 스킬이 생겨요' });
    setLang('en');
    for (const id of plain) expect(skillCardOf(id, true), id).toEqual({ kind: 'later', text: 'Gets a skill at Alley Boss' });
  });

  it('follows the row: a retuned cooldown is the number on the card', () => {
    const old = SP_ROWS.cloud.cooldown;
    SP_ROWS.cloud.cooldown = 16;
    try {
      setLang('ko');
      const card = skillCardOf('m_storm', true);
      expect(card?.kind === 'skill' ? card.texts.meta : '').toBe('16초마다 · 저절로 써요');
      setLang('en');
      const en = skillCardOf('m_storm', true);
      expect(en?.kind === 'skill' ? en.texts.meta : '').toBe('every 16 s · casts itself');
    } finally {
      SP_ROWS.cloud.cooldown = old;
    }
  });
});
