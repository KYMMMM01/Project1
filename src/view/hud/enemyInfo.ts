/** What the battle's enemy bubble says: the flavour line, every trait with its explanation, and the link to the enemy's codex page. */
import { t } from '@/core/i18n';
import { enemyDef, type EnemyId } from '@/game';
import '@/codex/strings';
import type { InfoContent } from '../info';
import { traitOrder } from './policy';

export function enemyInfo(id: EnemyId, openCodex: (id: EnemyId) => void): InfoContent {
  const def = enemyDef(id);
  const lines = [t(def.descKey)];
  for (const tr of traitOrder(def.traits)) lines.push(`${t(`trait.${tr}.name`)}: ${t(`trait.${tr}.desc`)}`);
  return { title: t(def.nameKey), text: lines.join('\n'), link: { label: t('codex.link'), run: () => openCodex(id) } };
}
