/**
 * The skill ring's maths: which of its 24 frames a gauge shows, where the ring stands on a cat, how long its moments last, which full rings
 * may pulse, and which small mark a ring wears. Pure (no rendering; the gunner's mark rule in `spHolster.ts` reads the wave data): the pictures are in `spRing.ts`, the bookkeeping in
 * `spRings.ts`, and `tests/view.field.spRing.test.ts` holds this file to its numbers. Design: docs/design_skills_v1.md 2.3 and 2.4.
 *
 * Every measure is in design px from a cat's feet (the origin of a `UnitView`), like `CLASS_AT` and `RANK_AT` in `unitView.ts`.
 */
import type { BattleApi, SpSkillId, UnitState } from '@/game/api';
import { holsterMark } from './spHolster';

/** The arc has this many steps (a gauge of 1 / 24 draws one) and the closed ring is the frame after the last arc. */
export const RING_STEPS = 24;
export const RING_FULL = RING_STEPS;

/** Where the ring stands, from the cat's feet. The class sticker moves here with it: it sits above the rank tag's rounded left end and inside the cell's paper. */
export const RING_AT = { x: -30, y: -27 } as const;
/** The ring's radius to the middle of its line, the line's width and the cream rim round it, design px. */
export const RING_R = 15.2;
export const RING_W = 4;
export const RING_RIM = 0.9;
/** Radius of the whole ring, rim included. */
export const RING_OUTER = RING_R + RING_W / 2 + RING_RIM;
/** How much a pulsing ring swells (a share of its size), and how far its flash grows. Both stay inside the cell and clear of the rank tag. */
export const PULSE_SCALE = 0.07;
export const FLASH_GROW = 1.12;

/** At most this many full rings pulse at once, the ones that became full first; the rest stand still. */
export const PULSE_MAX = 4;
/** One pulse takes this many seconds of the battle clock, which may run at most `PULSE_FASTEST` times as fast as the real one (3 pulses a second: nothing flickers at 3x). */
export const PULSE_PERIOD = 0.5;
export const PULSE_FASTEST = 1.5;
/** Battle seconds of the white flash after a cast and of the cat's shrug. */
export const FLASH_SECONDS = 0.4;
export const SHRUG_SECONDS = 0.36;
/** The shrug: the cat swells by this share and rises by this many px at its highest. */
export const SHRUG_SCALE = 0.12;
export const SHRUG_RISE = 4;

/** The frame a gauge shows: 0 is the bare track, 1 to 23 the arc (clockwise from 12 o'clock), 24 the closed ring of a full gauge. */
export function ringFrame(gauge: number): number {
  if (!(gauge > 0)) return 0;
  if (gauge >= 1) return RING_FULL;
  return Math.min(RING_STEPS - 1, Math.floor(gauge * RING_STEPS));
}

/** How far a ring's circle (centre `RING_AT`, radius `scale` x `RING_OUTER`) reaches from the cell's centre, given where the feet stand: left, right, top and bottom edges. */
export function ringExtent(feetDy: number, scale = 1): { left: number; right: number; top: number; bottom: number } {
  const r = RING_OUTER * scale;
  return { left: RING_AT.x - r, right: RING_AT.x + r, top: RING_AT.y + feetDy - r, bottom: RING_AT.y + feetDy + r };
}

/** The distance from the ring's centre to the rank tag's nearest point (the tag is a stadium of `pips` pips, its middle line at `rankAt`, radius 13), minus the ring's radius: negative = they touch. */
export function ringClearance(pips: number, rankAt: number, scale = 1): number {
  const half = (24 + 13 * pips) / 2 - 13;
  const dx = Math.max(Math.abs(RING_AT.x) - half, 0);
  const d = Math.hypot(dx, RING_AT.y - rankAt) - 13;
  return d - RING_OUTER * scale;
}

/** Progress 0..1 of a one-shot that began at `at`, `seconds` long, on the battle clock; -1 when it has not begun or is over. */
export function momentK(now: number, at: number, seconds: number): number {
  const k = (now - at) / seconds;
  return k < 0 || k >= 1 ? -1 : k;
}

/** The shrug's curve over its progress: 0 at the ends, 1 at the middle. */
export function shrugCurve(k: number): number {
  return k < 0 || k > 1 ? 0 : Math.sin(Math.PI * k);
}

/** The pulse's wave over the pulse clock (seconds): 0 at rest, 1 at the full swell. */
export function pulseWave(clock: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * clock) / PULSE_PERIOD);
}

/**
 * The pulse's own clock: it follows the battle's (standing still while a popup holds the game, a hit-stop freezes it) but never runs more
 * than `PULSE_FASTEST` times as fast as real time, so the swell stays under 3 a second at 3x speed.
 */
export class PulseClock {
  seconds = 0;
  advance(battleDt: number, realDt: number): void {
    this.seconds += Math.max(0, Math.min(battleDt, PULSE_FASTEST * realDt));
  }
}

/**
 * Which full rings pulse: the first `PULSE_MAX` in the order they became full (ties in the order they were shown to it, which is cell
 * order). A ring that stops being full (it cast, or its cat left) gives its place to the next one waiting. Call `begin`, `see` for every cat, `end`.
 */
export class PulseRoster {
  private seq = 0;
  /** uid -> the number it was given when it became full: the order of the roster. */
  private readonly since = new Map<number, number>();
  private readonly seen = new Set<number>();
  private readonly pulsing = new Set<number>();
  private readonly list: Array<[number, number]> = [];
  /** The set of full rings changed since the pulsing ones were worked out. */
  private dirty = false;

  begin(): void {
    this.seen.clear();
  }

  /** `eligible`: the cat's ring is full and the cat is free to cast (a stopped cat's ring does not pulse). */
  see(uid: number, eligible: boolean): void {
    if (!eligible) return;
    this.seen.add(uid);
    if (!this.since.has(uid)) {
      this.since.set(uid, ++this.seq);
      this.dirty = true;
    }
  }

  end(): void {
    for (const uid of this.since.keys()) {
      if (this.seen.has(uid)) continue;
      this.since.delete(uid);
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.list.length = 0;
    for (const [uid, at] of this.since) this.list.push([at, uid]);
    this.list.sort((a, b) => a[0] - b[0]);
    this.pulsing.clear();
    for (let i = 0; i < this.list.length && i < PULSE_MAX; i++) this.pulsing.add((this.list[i] as [number, number])[1]);
  }

  pulses(uid: number): boolean {
    return this.pulsing.has(uid);
  }

  /** The place of a pulsing ring among the pulsing ones, in the order they became full (0 for the first, up to `PULSE_MAX - 1`); 0 for any other. */
  slot(uid: number): number {
    if (!this.pulsing.has(uid)) return 0;
    let n = 0;
    for (const [, id] of this.list) {
      if (id === uid) return n;
      if (this.pulsing.has(id)) n++;
    }
    return 0;
  }

  /** The cats that pulse right now, in the order they became full. */
  order(): number[] {
    const out: number[] = [];
    for (const [, uid] of this.list) if (this.pulsing.has(uid)) out.push(uid);
    return out;
  }

  /** How many rings are full and ready (pulsing or standing still). */
  get full(): number {
    return this.since.size;
  }

  clear(): void {
    this.since.clear();
    this.seen.clear();
    this.pulsing.clear();
    this.list.length = 0;
    this.dirty = false;
  }
}

// ── marks: the small sticker a ring can wear ──

/**
 * The marks a ring can wear. 'stopped' (two bars: the cat stands on a hazard cell and its gauge does not move) and 'ready' (a star: a
 * full ring under reduced motion, where nothing pulses) are this file's own. A skill adds its own in three places: its id here, its
 * drawing in `MARK_DRAW` (`spRing.ts`) and its rule in `RING_MARK_RULES` below (the gunner's "holstered" look is the next one).
 */
export type RingMarkId = 'stopped' | 'ready' | 'holstered';

/** What a skill's ring wears besides the common marks: asked once a frame for each cat with that skill (keep it cheap, allocate nothing). */
export type RingMarkRule = (unit: UnitState, battle: BattleApi) => RingMarkId | null;

/** One rule per skill that has a look of its own. The gunner's `wanted` wears the holster while it is saving its shot for the coming elite or boss. */
export const RING_MARK_RULES: Partial<Record<SpSkillId, RingMarkRule>> = {
  wanted: holsterMark,
};

/** The mark a ring wears now: a stopped cat's first, then the skill's own, then (under reduced motion) the still star of a full ring. */
export function ringMarkOf(skill: SpSkillId, unit: UnitState, battle: BattleApi, calm: boolean): RingMarkId | null {
  if (unit.blocked) return 'stopped';
  const own = RING_MARK_RULES[skill]?.(unit, battle) ?? null;
  if (own) return own;
  return calm && unit.sp >= 1 ? 'ready' : null;
}
