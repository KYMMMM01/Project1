/**
 * What a battle screen adds to a cat's ordinary ability line when the cats have skills (step 3, docs/qa/directive_2026-10-13_skills_build.md
 * decisions 29 and 30). One pure place, so the selection sheet's "i" bubble and the 3-pick popup's hold-tooltip say the same words and both
 * stay silent when skills are off.
 *
 * The words are `spTexts` (src/game/data/spTexts.ts): the skill's name, its cooldown, and its one line with every figure read from the skill's row.
 * `on` is the battle's own setting (`BattleApi.spOn`: a saved run keeps the one it started with), never the page's switch.
 */
import { spTextsOfUnit, type UnitId } from '@/game';

/**
 * The ability line `passive` of cat `unit`, and after it (a blank line) the skill block when `on` and the cat has a skill:
 * "스킬 · 방패 밀치기 (12초마다)" and the skill's line. With skills off, or for a cat without a skill, `passive` comes back unchanged.
 */
export function withSkillText(unit: UnitId, passive: string, on: boolean): string {
  if (!on) return passive;
  const skill = spTextsOfUnit(unit);
  return skill ? `${passive}\n\n${skill.bubble}` : passive;
}

/** Whether `unit` has a skill block to show on a battle screen (skills on and the cat has one). */
export function hasSkillText(unit: UnitId, on: boolean): boolean {
  return on && spTextsOfUnit(unit) !== null;
}
