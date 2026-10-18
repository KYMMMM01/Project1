import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLang, setLang } from '@/core/i18n';
import { UNIT_IDS } from '@/game/api';
import { SP_ROWS } from '@/game/data/spSkills';
import { spTexts } from '@/game/data/spTexts';
import { unitDef } from '@/game/data/units';
import { hasSkillText, withSkillText } from '@/view/hud/spTell';
import '@/game/data/strings';

/**
 * Step 3: the words the selection sheet's "i" bubble and the 3-pick popup's hold-tooltip add after a cat's ordinary ability line. They come only when the
 * battle has skills, only for a cat that has one, and every figure is the skill's own row (docs/qa/directive_2026-10-13_skills_build.md decisions 29 to 31).
 */

const original = getLang();
const LANGS = ['ko', 'en'] as const;

beforeAll(() => {
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});
afterAll(() => setLang(original));

const SKILL_CATS = UNIT_IDS.filter((id) => unitDef(id).spSkill);
const PLAIN_CATS = UNIT_IDS.filter((id) => !unitDef(id).spSkill);

describe('what follows the ability line', () => {
  it('is nothing at all with skills off, for every cat: the line comes back as it was', () => {
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of UNIT_IDS) {
        const line = unitDef(id).skillText();
        expect(withSkillText(id, line, false), `${lang} ${id}`).toBe(line);
        expect(hasSkillText(id, false), `${lang} ${id}`).toBe(false);
      }
    }
  });

  it('is nothing for a cat without a skill even with skills on (kitten and street rank)', () => {
    expect(PLAIN_CATS).toHaveLength(8);
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of PLAIN_CATS) {
        const line = unitDef(id).skillText();
        expect(withSkillText(id, line, true), `${lang} ${id}`).toBe(line);
        expect(hasSkillText(id, true), `${lang} ${id}`).toBe(false);
      }
    }
  });

  it('is the skill block after a blank line for each of the twelve cats with a skill, in both languages', () => {
    expect(SKILL_CATS).toHaveLength(12);
    for (const lang of LANGS) {
      setLang(lang);
      for (const id of SKILL_CATS) {
        const line = unitDef(id).skillText();
        const skill = unitDef(id).spSkill;
        const text = withSkillText(id, line, true);
        expect(hasSkillText(id, true), `${lang} ${id}`).toBe(true);
        expect(text.startsWith(`${line}\n\n`), `${lang} ${id}`).toBe(true);
        expect(text, `${lang} ${id}`).toBe(`${line}\n\n${spTexts(skill?.id as never).bubble}`);
        expect(text, `${lang} ${id}`).not.toMatch(/[{}]|undefined|NaN/);
      }
    }
  });

  it('shows the skill by its name and its cooldown, taken from the row (the numbers are never typed)', () => {
    setLang('ko');
    expect(withSkillText('w_viking', 'x', true)).toContain('스킬 · 방패 밀치기\n12초마다 · 저절로 써요\n');
    expect(withSkillText('r_star', 'x', true)).toContain('\n26초마다 · ');
    expect(withSkillText('w_samurai', 'x', true)).toContain('\n20초마다 · ');
    setLang('en');
    expect(withSkillText('w_viking', 'x', true)).toContain('Skill · Shield Shove\nevery 12 s · casts itself\n');
    for (const id of SKILL_CATS) {
      const skill = unitDef(id).spSkill;
      expect(withSkillText(id, 'x', true), id).toContain(`every ${SP_ROWS[skill?.id as keyof typeof SP_ROWS].cooldown} s`);
    }
  });

  it('follows a retuned row: another cooldown, another number in the bubble, in both languages', () => {
    const old = SP_ROWS.shove.cooldown;
    SP_ROWS.shove.cooldown = 21;
    try {
      setLang('ko');
      expect(withSkillText('w_viking', 'x', true)).toContain('\n21초마다 · ');
      setLang('en');
      expect(withSkillText('w_viking', 'x', true)).toContain('\nevery 21 s · ');
    } finally {
      SP_ROWS.shove.cooldown = old;
    }
    setLang('ko');
    expect(withSkillText('w_viking', 'x', true)).toContain('\n12초마다 · ');
  });
});
