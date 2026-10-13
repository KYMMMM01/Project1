/**
 * Who a skill looks at, in one order (docs/design_skills_v2.md 3.0): the enemies inside the laser's dot first, then elites and bosses, then
 * the ones that have travelled farthest, then the lower `uid`. Reach: a rank 3 or 4 skill sees the enemies inside its own cat's range
 * (measured from the tile centre to the enemy's centre, the enemy's radius added: the same test an attack uses), a rank 5 skill the whole
 * field.
 */
import { cellCenterX, cellCenterY } from '../../geometry';
import type { Sim } from '../sim';
import type { SimEnemy, SimUnit } from '../types';

/** True when `a` comes before `b` in skill order (a strict order: never true both ways, never true for the same enemy). */
export function skillBefore(a: SimEnemy, b: SimEnemy): boolean {
  if (a.focused !== b.focused) return a.focused;
  const sa = a.isBoss || a.isElite;
  const sb = b.isBoss || b.isElite;
  if (sa !== sb) return sa;
  if (a.travelled !== b.travelled) return a.travelled > b.travelled;
  return a.uid < b.uid;
}

/** Puts a list in skill order (insertion sort: the lists are at most one wave's enemies, and a cast happens a few times a minute). */
export function sortSkillOrder(list: SimEnemy[]): void {
  for (let i = 1; i < list.length; i++) {
    const e = list[i] as SimEnemy;
    let j = i - 1;
    while (j >= 0 && skillBefore(e, list[j] as SimEnemy)) {
      list[j + 1] = list[j] as SimEnemy;
      j--;
    }
    list[j + 1] = e;
  }
}

/** The rank of the cat's skill (0 for a cat without one). */
export function rankOf(u: SimUnit): number {
  return u.spec.spSkill ? u.spec.spSkill.rank : 0;
}

/** Is the enemy inside the skill's reach: the cat's range for ranks 3 and 4, anywhere for rank 5. */
export function inReach(u: SimUnit, e: SimEnemy): boolean {
  if (rankOf(u) >= 5) return true;
  const dx = e.x - cellCenterX(u.cell);
  const dy = e.y - cellCenterY(u.cell);
  const reach = u.stats.range + e.spec.radius;
  return dx * dx + dy * dy <= reach * reach;
}

/** Fills `out` with the enemies inside the skill's reach, in skill order, and returns it. */
export function collectInReach(s: Sim, u: SimUnit, out: SimEnemy[]): SimEnemy[] {
  out.length = 0;
  for (const e of s.enemies) if (!e.dead && inReach(u, e)) out.push(e);
  sortSkillOrder(out);
  return out;
}
