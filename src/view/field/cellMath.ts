import { relicSpec, specialCellName, specialCellText } from '@/game';
import type { RelicId, SpecialCellId } from '@/game/api';

/** What the toys on the shelf add to a special cell's bonus (the prime spot toy adds the same to every kind). */
export function cellExtra(relics: ReadonlyArray<RelicId>): number {
  let extra = 0;
  for (const id of relics) extra += relicSpec(id).fx.sunSpeed ?? 0;
  return extra;
}

/** The words of the note on a tapped special cell: its name over what it does, with the number the cats really get (toys included). */
export function cellNoteContent(kind: SpecialCellId, relics: ReadonlyArray<RelicId>): { title: string; text: string } {
  return { title: specialCellName(kind), text: specialCellText(kind, cellExtra(relics)) };
}
