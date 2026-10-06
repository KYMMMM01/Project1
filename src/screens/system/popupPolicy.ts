/**
 * Which automatic popup is due next, and where "see it now" leads. Pure: the facts come from the
 * profile and from the player's own record of what was already announced.
 */
import type { FeatureId } from '@/meta/data/schedule';
import type { TabId } from '../contract';

export type DuePopup =
  | { kind: 'comeback' }
  | { kind: 'gemPass' }
  | { kind: 'levelUp'; from: number; to: number }
  | { kind: 'unlock'; features: FeatureId[] };

export interface PopupFacts {
  comebackReady: boolean;
  gemPassReady: boolean;
  level: number;
  seenLevel: number;
  unlocked: readonly string[];
  seenUnlocked: readonly string[];
  /** Kinds already offered in this app session (a dismissed offer is not repeated until the next launch). */
  offered: ReadonlySet<'comeback' | 'gemPass'>;
}

/** Order of announcement and of the rows inside a combined "new unlocks" popup. */
export const UNLOCK_ORDER: readonly FeatureId[] = [
  'cats', 'missions', 'shop', 'pass', 'daily', 'cup', 'endless', 'sweep', 'patrol', 'treat', 'piggy', 'cosmetics',
  'speed2x', 'speed3x',
];

/** Rows shown in the combined unlock popup before the "and N more" line. */
export const UNLOCK_ROWS = 3;

/** Where the "take a look" button of a feature leads; null = nothing to jump to (a battle option). */
const JUMP: Readonly<Record<FeatureId, TabId | null>> = {
  cats: 'cats',
  missions: 'missions',
  cup: 'missions',
  shop: 'shop',
  piggy: 'shop',
  cosmetics: 'shop',
  pass: 'pass',
  patrol: 'battle',
  treat: 'battle',
  daily: 'battle',
  sweep: 'battle',
  endless: 'battle',
  speed2x: null,
  speed3x: null,
};

export function jumpTarget(feature: FeatureId): TabId | null {
  return JUMP[feature];
}

export function sortUnlocks(features: readonly FeatureId[]): FeatureId[] {
  return features.slice().sort((a, b) => UNLOCK_ORDER.indexOf(a) - UNLOCK_ORDER.indexOf(b));
}

/** The first feature of a batch that has somewhere to go, with its tab. */
export function primaryJump(features: readonly FeatureId[]): { feature: FeatureId; tab: TabId } | null {
  for (const f of sortUnlocks(features)) {
    const tab = jumpTarget(f);
    if (tab) return { feature: f, tab };
  }
  return null;
}

/** Features unlocked since the player last saw the list, in announcement order. */
export function newUnlocks(unlocked: readonly string[], seen: readonly string[]): FeatureId[] {
  const known = new Set(seen);
  return sortUnlocks(unlocked.filter((f): f is FeatureId => !known.has(f) && f in JUMP));
}

/** Keep the record consistent with the profile: a restored older save must not leave phantom entries. */
export function reconcileSeen(
  unlocked: readonly string[],
  seen: readonly string[],
  level: number,
  seenLevel: number,
): { seenUnlocked: string[]; seenLevel: number } {
  const have = new Set(unlocked);
  return { seenUnlocked: seen.filter((f) => have.has(f)), seenLevel: Math.min(seenLevel, level) };
}

/** The next popup to show, or null. Priority: welcome back, gem pass, level up, new unlocks. */
export function nextPopup(f: PopupFacts): DuePopup | null {
  if (f.comebackReady && !f.offered.has('comeback')) return { kind: 'comeback' };
  if (f.gemPassReady && !f.offered.has('gemPass')) return { kind: 'gemPass' };
  if (f.level > f.seenLevel) return { kind: 'levelUp', from: f.seenLevel, to: f.level };
  const fresh = newUnlocks(f.unlocked, f.seenUnlocked);
  if (fresh.length > 0) return { kind: 'unlock', features: fresh };
  return null;
}

export interface PopupGate {
  /** The home shell is alive (its clock is not killed): a battle or another scene is not running. */
  shellAlive: boolean;
  transitioning: boolean;
  /** Something modal (a popup, a full screen) is already above the home screen. */
  modalOpen: boolean;
  /** A claim or purchase of ours is in flight. */
  busy: boolean;
}

export function mayShowPopup(g: PopupGate): boolean {
  return g.shellAlive && !g.transitioning && !g.modalOpen && !g.busy;
}
