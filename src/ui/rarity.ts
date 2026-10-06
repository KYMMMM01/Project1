import { t } from '@/core/i18n';
import type { RarityId } from './theme';

/**
 * Themed display name of a rarity. The words live in the i18n tables (rarity.common ... rarity.mythic)
 * so a re-theme never touches component code; components must never spell a rarity out themselves.
 */
export function rarityName(r: RarityId): string {
  return t('rarity.' + r);
}
