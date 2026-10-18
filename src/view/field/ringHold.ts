/**
 * The gauge a skill ring SHOWS in place of the cat's own, while a scene holds it. The simulation writes a skill's gauge at the cast tick
 * (a fish capsule's half refund, a bard's note), long before the picture that explains it has finished; a scene that wants the ring to keep
 * showing the old value until its picture lands (the ring then springs to the real one) holds it here and lets go. Pure state, no display
 * objects: the field's rings ask `ringHeld(uid)` each frame (`SpRings.tick`), the director's scenes `holdRing` / `releaseRing`.
 *
 * With nothing held (always, with skills off) the question costs one `size` check.
 */
const held = new Map<number, number>();

/** Show `value` (0..1) on the ring of the cat `uid` until `releaseRing`. */
export function holdRing(uid: number, value: number): void {
  held.set(uid, value);
}

/** Let the ring of `uid` show the cat's own gauge again. */
export function releaseRing(uid: number): void {
  held.delete(uid);
}

/** The held value for `uid`, or undefined when its ring shows the real gauge. */
export function ringHeld(uid: number): number | undefined {
  return held.size === 0 ? undefined : held.get(uid);
}

/** Drop every hold (a battle is over; the next one starts clean). */
export function clearRingHolds(): void {
  held.clear();
}

/** How many rings are held (QA and tests). */
export function ringHolds(): number {
  return held.size;
}
