/** What the battle's enemy bubble says: the flavour line, every trait with its explanation, and the link to the enemy's codex page. */
import { t } from '@/core/i18n';
import { enemyDef, type EnemyId } from '@/game';
import '@/codex/strings';
import './strings';
import type { InfoContent } from '../info';
import { traitOrder } from './policy';

/** "Armour 35% · Ward 10%": the share of physical and of magic damage the enemy shrugs off, before any armour break. */
export function defenceLine(id: EnemyId): string {
  const def = enemyDef(id);
  return t('hud.boss.def', { armor: Math.round(def.armor * 100), ward: Math.round(def.ward * 100) });
}

/** "Slow resistance 30%": the share of every slow that does not land on the enemy (only built for enemies that have some). */
export function slowResistLine(id: EnemyId): string {
  return t('hud.enemy.slowResist', { n: Math.round(enemyDef(id).slowResist * 100) });
}

export function enemyInfo(id: EnemyId, openCodex: (id: EnemyId) => void): InfoContent {
  const def = enemyDef(id);
  const lines = [t(def.descKey)];
  if (def.armor > 0 || def.ward > 0) lines.push(defenceLine(id));
  if (def.slowResist > 0) lines.push(slowResistLine(id));
  for (const tr of traitOrder(def.traits)) lines.push(`${t(`trait.${tr}.name`)}: ${t(`trait.${tr}.desc`)}`);
  return { title: t(def.nameKey), text: lines.join('\n'), link: { label: t('codex.link'), run: () => openCodex(id) } };
}
