/**
 * What the cat screen says about a cat's skill (step 3, docs/qa/directive_2026-10-13_skills_build.md decisions 29 and 30). Pure: the screen draws what this
 * returns, and a test holds it to the rows.
 *
 *  - A cat that has a skill gets a card of its own: the name, the one line (every figure from the skill's row), how often it casts, and the rank it comes with.
 *  - A cat below the first rank with a skill (kitten, street) gets one line that says when it will: "골목대장부터 스킬이 생겨요", shown under its ability line.
 *  - With skills off (`on` false: the app's one switch, `skillsOn()`) there is nothing at all, so the screen is exactly today's.
 */
import type { RarityId, UnitId } from '@/game/api';
import { spLaterText, spTextsOfUnit, type SpTexts } from '@/game/data/spTexts';
import { unitDef } from '@/game/data/units';

export type SkillCard =
  | { kind: 'skill'; texts: SpTexts; /** The rank the cat itself has (the skill comes with it): the colour of the chip. */ rarity: RarityId }
  | { kind: 'later'; text: string };

/** The skill card of `unit`, or null when skills are off. */
export function skillCardOf(unit: UnitId, on: boolean): SkillCard | null {
  if (!on) return null;
  const texts = spTextsOfUnit(unit);
  if (texts) return { kind: 'skill', texts, rarity: unitDef(unit).rarity };
  return { kind: 'later', text: spLaterText() };
}
