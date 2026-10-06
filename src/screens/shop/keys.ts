/** Image keys and icon names derived from ids. No rendering imports, so pure logic and tests can use them. */
import type { ClassId, UnitId } from '@/game/api';
import type { ChestKind } from '@/meta/types';
import type { IconName } from '@/ui/icons';

export function classIcon(c: ClassId): IconName {
  return ('class_' + c) as IconName;
}

export function unitKey(id: UnitId): string {
  return 'unit_' + id;
}

export function chestKey(kind: ChestKind): string {
  return 'icon_chest_' + (kind === 'wooden' ? 'wood' : kind);
}
