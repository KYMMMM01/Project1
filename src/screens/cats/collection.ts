/** Pure structure of the cats tab: the four class lines, filtering, upgrade-ready counts, card progress and what a cat becomes. */
import { CLASS_IDS, type ClassId, type UnitId } from '@/game/api';
import { mergeResultOf, mythicOf, UNIT_GRID, unitClass } from '@/game/data/roster';
import type { UnitView } from '@/meta/economy';
import type { BaseUnitId } from '@/meta/types';

export type ClassFilter = 'all' | ClassId;

export interface ClassGroup {
  classId: ClassId;
  /** The four collectable cats, common to legendary. */
  base: readonly [BaseUnitId, BaseUnitId, BaseUnitId, BaseUnitId];
  /** The awakened form of the legendary. Shares its level. */
  guardian: UnitId;
}

export const CLASS_GROUPS: readonly ClassGroup[] = CLASS_IDS.map((classId) => {
  const row = UNIT_GRID[classId];
  return {
    classId,
    base: [row[0], row[1], row[2], row[3]] as unknown as ClassGroup['base'],
    guardian: row[4],
  };
});

export function visibleGroups(filter: ClassFilter): readonly ClassGroup[] {
  return filter === 'all' ? CLASS_GROUPS : CLASS_GROUPS.filter((g) => g.classId === filter);
}

/** The five cats of a class in line order: kitten, ..., king, guardian. */
export function lineOf(classId: ClassId): readonly UnitId[] {
  return UNIT_GRID[classId];
}

export interface LineStep {
  kind: 'merge' | 'awaken';
  from: UnitId;
  to: UnitId;
}

/** What a cat becomes next in its line (two merge into the next rank, a king awakens), or null at the end of the line. */
export function stepFrom(id: UnitId): LineStep | null {
  const merged = mergeResultOf(id);
  if (merged) return { kind: 'merge', from: id, to: merged };
  const awakened = mythicOf(id);
  return awakened ? { kind: 'awaken', from: id, to: awakened } : null;
}

export type LineSentenceKey = 'cats.line.merge' | 'cats.line.awaken' | 'cats.line.guardian';

/**
 * The plain-words sentence of the unit screen as a string key and two cats: `merge` = two `a` make `b`,
 * `awaken` = a king `a` becomes the guardian `b`, `guardian` = the guardian `b` comes from awakening the king `a`.
 */
export function lineSentence(id: UnitId): { key: LineSentenceKey; a: UnitId; b: UnitId } {
  const step = stepFrom(id);
  if (step) return { key: step.kind === 'merge' ? 'cats.line.merge' : 'cats.line.awaken', a: step.from, b: step.to };
  const line = lineOf(unitClass(id));
  return { key: 'cats.line.guardian', a: line[3] as UnitId, b: id };
}

export function isUpgradeReady(v: UnitView): boolean {
  return !v.quote.maxed && v.quote.enoughCards && v.quote.enoughGold;
}

/** Number of cats that can be levelled up right now (the tab badge). */
export function upgradeReadyCount(views: readonly UnitView[]): number {
  let n = 0;
  for (const v of views) if (isUpgradeReady(v)) n++;
  return n;
}

export interface CardProgress {
  /** Own cards plus the wild cards that would be spent, capped at what the level needs. */
  have: number;
  needed: number;
  maxed: boolean;
}

export function cardProgress(v: UnitView): CardProgress {
  if (v.quote.maxed) return { have: 1, needed: 1, maxed: true };
  const needed = v.quote.cards;
  return { have: Math.min(needed, v.cards + v.wild), needed, maxed: false };
}

/** Widest a photo frame gets, and the heights of the two frame kinds: a card also carries the progress bar. */
export const FRAME_W = 108;
export const FRAME_H = { card: 150, mini: 114 } as const;
/** Height of the band above a card row where the merge / awaken words sit over the gaps. */
export const RAIL_H = 34;
/** One line of a cat's name under its plate, and the room kept above and below the lines. */
export const NAME_LINE = 26;
export const NAME_PAD = 18;
/** How far an arrow tag reaches onto each neighbouring plate: its cream border only, never the picture window (11 px in). */
export const TAG_OVERLAP = 5;

/**
 * How a line of five cats shares a row `width` wide: every cat gets an equal cell, the plate takes about four
 * fifths of it (never wider than `FRAME_W`) and the rest is the gap an arrow tag is stuck over.
 */
export function lineMetrics(width: number, count = 5): { pitch: number; plateW: number; gap: number } {
  const pitch = width / count;
  const plateW = Math.min(FRAME_W, Math.round(pitch * 0.78));
  return { pitch, plateW, gap: pitch - plateW };
}

/** Width of the arrow tag over a gap: the gap plus a little onto each border, so it can never cover a picture. */
export function arrowWidth(gap: number): number {
  return Math.round(gap + TAG_OVERLAP * 2);
}
