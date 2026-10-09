/** Pure rules of the gold dungeon card: which tier it shows and what its button row offers. No rendering. */

/** What the card offers right now: enter, buy an extra entry, or wait for tomorrow. */
export type DungeonOffer = 'enter' | 'buy' | 'spent';

export function dungeonOffer(v: { entriesLeft: number; canBuy: boolean }): DungeonOffer {
  if (v.entriesLeft > 0) return 'enter';
  return v.canBuy ? 'buy' : 'spent';
}

/** The tier the card shows: the one the player picked while it is still open, else the highest open one (0 when none is). */
export function shownTier(top: number, picked: number): number {
  if (top <= 0) return 0;
  return picked >= 1 && picked <= top ? picked : top;
}

/** One step of the tier stepper, held inside 1..top. */
export function stepTier(top: number, tier: number, dir: -1 | 1): number {
  return Math.min(Math.max(1, top), Math.max(1, tier + dir));
}

/** "2/2" while the free entries last; a bought one makes it "1/3". */
export function entriesText(entriesLeft: number, freeEntries: number, bought: number): string {
  return `${entriesLeft}/${freeEntries + bought}`;
}
