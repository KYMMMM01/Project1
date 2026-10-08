/**
 * Peeking at the board from a choice the battle forces on the player (the pick of three, the toy choice): the choice folds into a small
 * "go back" button so the cats, the class chips and the pairs can be read, and unfolds exactly as it was. Pure: where the way back sits,
 * how the fold interpolates, and the rules of the toggle (what takes taps in each state, what keeps the toggle off).
 */
import type { BattleLayout } from '../context';
import { bottomRects, HUD_W, SIDE, type Point, type Rect } from './layoutMath';

/** The way back's paper; its touch target is taller (the kit never goes under 88). */
export const PEEK_BACK = { w: 236, h: 68, drop: 4 } as const;
/** How far the way back's paper rises while it bobs (the shadow stays, so the gap shows the height). */
export const PEEK_BOB = 6;
/** The size the choice has shrunk to when it is folded into the way back. */
export const PEEK_FOLD_SCALE = 0.1;
/** What is left of the popup's dim while peeking: the board reads at full colour, a trace says the battle is on hold. */
export const PEEK_DIM = 0.1;
/** Seconds the fold takes each way. */
export const PEEK_FOLD_TIME = 0.24;

/**
 * Where the way back sits: on the bottom panel's tracker row (a few px lower, clear of the odds button above), against the right margin. That row holds only the pick tracker on its left
 * (and the call-wave button, which a choice makes unreachable anyway); the board, the class chips and the currency pills above it stay in view.
 */
export function peekBackRect(l: BattleLayout): Rect {
  const { top, utilY } = bottomRects(l);
  return { x: HUD_W - SIDE - PEEK_BACK.w, y: top + utilY + PEEK_BACK.drop - PEEK_BACK.h / 2, w: PEEK_BACK.w, h: PEEK_BACK.h };
}

export function peekBackCentre(l: BattleLayout): Point {
  const r = peekBackRect(l);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export interface FoldPose {
  x: number;
  y: number;
  scale: number;
  alpha: number;
  /** Multiplier of the popup's dim. */
  dim: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The choice `k` of the way (0 in place, 1 folded) from its centre `from` into the button at `to`: it shrinks into it and fades out over the last half. */
export function foldPose(k: number, from: Point, to: Point): FoldPose {
  const e = clamp01(k);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    scale: 1 + (PEEK_FOLD_SCALE - 1) * e,
    alpha: 1 - clamp01((e - 0.45) / 0.55),
    dim: 1 + (PEEK_DIM - 1) * e,
  };
}

/** Why the toggle is off: the lesson that teaches the choice, a choice that is already being answered, a popup still opening. */
export type PeekLock = 'lesson' | 'deciding' | 'opening';

/** What takes taps: the choice's own controls, or the way back. Never the board: the dim's shield stays up the whole time the choice is pending. */
export type PeekSurface = 'sheet' | 'back';

/**
 * The toggle of one pending choice. The choice itself is not in here (it stays pending in the simulation however often this flips);
 * this says which surface is live, and keeps the player from folding the choice away when that would derail something.
 *
 * Invariants (tested over random sequences): exactly one surface is live; peeking implies the way back is live; a lock never leaves the
 * choice folded (it brings it back first), so the player always has a way forward or a way back.
 */
export class PeekState {
  private open = false;
  private readonly locks = new Set<PeekLock>();

  get peeking(): boolean {
    return this.open;
  }

  /** The toggle may be used: a tap on it folds the choice. */
  get allowed(): boolean {
    return this.locks.size === 0;
  }

  /** The toggle is drawn: only the lesson hides it; a choice that is opening or being answered keeps it in place, inert. */
  get shown(): boolean {
    return !this.locks.has('lesson');
  }

  get surface(): PeekSurface {
    return this.open ? 'back' : 'sheet';
  }

  /** Fold the choice away; refused while locked. True when the state changed. */
  peek(): boolean {
    if (this.open || !this.allowed) return false;
    this.open = true;
    return true;
  }

  /** Bring the choice back. Always possible. True when the state changed. */
  back(): boolean {
    if (!this.open) return false;
    this.open = false;
    return true;
  }

  /** Switch the toggle off for `reason`. A choice that is folded comes back first: a lock must never leave it hidden. True when it came back. */
  lock(reason: PeekLock): boolean {
    this.locks.add(reason);
    return this.back();
  }

  unlock(reason: PeekLock): void {
    this.locks.delete(reason);
  }

  /** Set a lock on or off. */
  setLock(reason: PeekLock, on: boolean): boolean {
    if (on) return this.lock(reason);
    this.unlock(reason);
    return false;
  }

  /** The choice may be answered (a card tapped, a reroll bought): only while its own surface is the live one. */
  get answerable(): boolean {
    return this.surface === 'sheet';
  }
}
