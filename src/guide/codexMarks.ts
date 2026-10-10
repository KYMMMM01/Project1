/**
 * The codex's "new" marks as pure rules over the stored lists (met, looked). An entry is new from the moment it is met in a run.
 * Two things show it: the count on the buttons that open the codex, and the "새로 만남" sticker on the entry inside.
 *
 *   - Opening the codex takes the count away at once: every entry that is new at that moment is carried into the visit.
 *   - Inside the visit those entries keep their sticker, so the player can see what is new; nothing has to be opened one by one.
 *   - Closing the codex marks all of them seen. Entries met after the visit began are not part of it: they are new again afterwards.
 *
 * The stored format is untouched: `looked` is still the list of entries that were seen, a visit is only memory.
 */

/** The three lists the marks are read from. `visit` is null while no codex is open. */
export interface MarkSets {
  met: ReadonlySet<string>;
  looked: ReadonlySet<string>;
  visit: ReadonlySet<string> | null;
}

/** Met and not yet seen, in the order they were met. */
export function unseenKeys(met: ReadonlySet<string>, looked: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const key of met) if (!looked.has(key)) out.push(key);
  return out;
}

/** The count printed on the buttons that open the codex: what is new and not already taken into the open visit. */
export function badgeCount(s: MarkSets): number {
  let n = 0;
  for (const key of s.met) if (!s.looked.has(key) && !s.visit?.has(key)) n++;
  return n;
}

/** The sticker on one entry inside the codex: in a visit, exactly the entries that were new when it opened; outside one, every unseen entry. */
export function hasSticker(key: string, s: MarkSets): boolean {
  return s.visit ? s.visit.has(key) : s.met.has(key) && !s.looked.has(key);
}

/** Opening: the entries that are new right now. */
export function openVisit(met: ReadonlySet<string>, looked: ReadonlySet<string>): Set<string> {
  return new Set(unseenKeys(met, looked));
}

/** Closing: what the visit marks seen (an entry that cannot have been met any more is left out). */
export function closeVisit(visit: ReadonlySet<string>, met: ReadonlySet<string>, looked: ReadonlySet<string>): string[] {
  return [...visit].filter((key) => met.has(key) && !looked.has(key));
}
