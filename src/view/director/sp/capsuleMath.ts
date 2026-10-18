/**
 * The lucky cat's capsule, as numbers (pure, no display objects; `capsule.ts` draws from them and the tests hold them). Everything is a
 * function of the BATTLE's clock: where a falling capsule is at battle time `t` after the cast, how the lid and the base leave when the
 * capsule opens, how the small capsule of a One More! rolls out, the curve the ring springs back with, which cap-open event belongs to
 * which cast, and which line pops up for which prize.
 */
import type { SpCapsuleKind, SpCapsuleResult } from '@/game';

/** Design px: where a falling capsule starts above its resting place, and how far above the tile's centre the resting capsule's middle is. */
export const FALL_FROM = 330;
export const REST_UP = 68;

/** The shape of one kind's fall, in shares of the seconds from the cast to the opening (1.2 s). */
export interface Beat {
  /** When the capsule first touches the cat's head. */
  land: number;
  /** The two bounces after it: how long each takes (a share) and how high it goes (px). */
  hop1: readonly [number, number];
  hop2: readonly [number, number];
  /** How far (radians) it rocks while it rests before the lid goes. */
  rock: number;
  /** A rattle: how far (px) it shakes sideways while it rests (the second shell moves inside a One More!). */
  rattle: number;
  /** The whistle of its fall, as a pitch. */
  whistle: number;
  /** The pitch of its two landings. */
  thud: number;
}

/**
 * The beats. The pink three are told apart by more than their marks (the design asks for it, 3.12.10): the purr capsule is light and quick,
 * the One More! heavy and rattling, the fish capsule plain; the toy falls from higher with a high whistle and bounces further; the
 * guardian glides down slowly and hardly bounces.
 */
export const BEATS: Readonly<Record<SpCapsuleKind, Beat>> = {
  fish: { land: 0.47, hop1: [0.2, 40], hop2: [0.15, 16], rock: 0.12, rattle: 0, whistle: 1.9, thud: 1 },
  purr: { land: 0.45, hop1: [0.19, 48], hop2: [0.13, 22], rock: 0.1, rattle: 0, whistle: 2.1, thud: 1.12 },
  partner: { land: 0.47, hop1: [0.2, 40], hop2: [0.15, 16], rock: 0.12, rattle: 0, whistle: 1.9, thud: 1.25 },
  more: { land: 0.5, hop1: [0.17, 26], hop2: [0.12, 10], rock: 0.2, rattle: 2.4, whistle: 1.6, thud: 0.8 },
  toy: { land: 0.43, hop1: [0.22, 56], hop2: [0.16, 24], rock: 0.12, rattle: 0, whistle: 2.5, thud: 1.4 },
  guardian: { land: 0.56, hop1: [0.16, 22], hop2: [0.11, 9], rock: 0.08, rattle: 0, whistle: 1.4, thud: 0.9 },
};

/** Where a capsule is drawn, relative to its resting place (px), how it is squashed and tilted. */
export interface Pose {
  dx: number;
  dy: number;
  sx: number;
  sy: number;
  rot: number;
}

export function newPose(): Pose {
  return { dx: 0, dy: 0, sx: 1, sy: 1, rot: 0 };
}

/** How long a landing's squash lasts (a share of the fall), and the squash at its deepest. */
const SQUASH_LEN = 0.05;

function squashAt(k: number, t0: number): number {
  const d = k - t0;
  return d < 0 || d > SQUASH_LEN ? 0 : Math.sin((Math.PI * d) / SQUASH_LEN);
}

/**
 * The pose of a falling capsule `k` of the way through its fall (`k` = battle seconds since the cast over the seconds to the opening; it may
 * pass 1 while the opening waits). It drops from `FALL_FROM` px above, accelerating, lands, bounces twice and rests rocking.
 */
export function fallPose(beat: Beat, k: number, out: Pose): Pose {
  out.dx = 0;
  out.dy = 0;
  out.sx = 1;
  out.sy = 1;
  out.rot = 0;
  const h1 = beat.land + beat.hop1[0];
  const h2 = h1 + beat.hop2[0];
  if (k < beat.land) {
    const u = Math.max(0, k) / beat.land;
    out.dy = -FALL_FROM * (1 - u * u);
    out.sy = 1 + 0.13 * u;
    out.sx = 1 - 0.07 * u;
    out.rot = 0.5 * (1 - u);
    return out;
  }
  if (k < h1) {
    const u = (k - beat.land) / beat.hop1[0];
    out.dy = -beat.hop1[1] * 4 * u * (1 - u);
    out.rot = -0.1 * Math.sin(Math.PI * u);
  } else if (k < h2) {
    const u = (k - h1) / beat.hop2[0];
    out.dy = -beat.hop2[1] * 4 * u * (1 - u);
    out.rot = 0.07 * Math.sin(Math.PI * u);
  } else {
    // At rest it rocks, a little more every swing, and a heavy one shakes.
    const span = Math.max(1e-6, 1 - h2);
    const r = Math.min(1, (k - h2) / span);
    out.rot = beat.rock * Math.sin(r * Math.PI * 4) * (0.35 + 0.65 * r);
    out.dx = beat.rattle * Math.sin(k * 190) * r;
  }
  const q = Math.max(squashAt(k, beat.land), squashAt(k, h1) * 0.6, squashAt(k, h2) * 0.35);
  out.sy *= 1 - 0.2 * q;
  out.sx *= 1 + 0.15 * q;
  return out;
}

/** The moments at which a falling capsule's landings are heard, as shares of the fall. */
export function landings(beat: Beat): readonly [number, number] {
  const h1 = beat.land + beat.hop1[0];
  return [beat.land, h1];
}

/** The lid when the capsule opens: it springs up and away to one side, spinning, and fades (k 0..1). `side` is -1 or 1. */
export function lidPose(k: number, side: number, out: Pose): Pose {
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  out.dx = side * 54 * (1 - (1 - u) * (1 - u));
  out.dy = -86 * Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.5) + 112 * u * u;
  out.rot = side * 2.3 * u;
  out.sx = out.sy = 1 + 0.12 * Math.sin(Math.PI * u);
  return out;
}

/** Opacity of the lid over its flight and of the base over its. */
export function lidAlpha(k: number): number {
  return k < 0.5 ? 1 : Math.max(0, 1 - (k - 0.5) / 0.5);
}

export function baseAlpha(k: number): number {
  return k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45);
}

/** The base squashes a little as the lid leaves (k 0..1). */
export function basePose(k: number, out: Pose): Pose {
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  const bump = Math.sin(Math.min(1, u * 3) * Math.PI);
  out.dx = 0;
  out.dy = 5 * bump;
  out.sx = 1 + 0.1 * bump;
  out.sy = 1 - 0.1 * bump;
  out.rot = 0;
  return out;
}

/** The small capsule that rolls out of a One More!: how far it goes sideways, and how big it is next to the big one. */
export const ROLL_DIST = 62;
export const SMALL_SCALE = 0.62;

/** Where the small capsule is `k` (0..1) of the way through its roll (relative to the big one's place) and how it turns; it starts small and grows to `SMALL_SCALE`. */
export function rollPose(k: number, dir: number, out: Pose): Pose {
  const u = k < 0 ? 0 : k > 1 ? 1 : k;
  const e = 1 - Math.pow(1 - u, 3);
  out.dx = dir * ROLL_DIST * e;
  out.dy = -16 * Math.sin(Math.PI * u) * (1 - u * 0.5) + 14 * e;
  out.rot = dir * Math.PI * 2.5 * e;
  out.sx = out.sy = 0.5 + 0.5 * Math.min(1, u * 2.2);
  return out;
}

/** The wobble of the small capsule while it waits to open (`age` battle seconds since it stopped; it grows toward the opening, `of` seconds away). */
export function waitRock(age: number, of: number): number {
  const r = Math.min(1, Math.max(0, age / Math.max(1e-6, of)));
  return 0.16 * Math.sin(age * 26) * (0.25 + 0.75 * r);
}

/** The ring's gauge while it springs from 0 to `to` (k 0..1): it overshoots a little and settles, never past 1. */
export function springValue(k: number, to: number): number {
  if (k <= 0) return 0;
  if (k >= 1) return to;
  const c1 = 2.4;
  const c3 = c1 + 1;
  const u = k - 1;
  const e = 1 + c3 * u * u * u + c1 * u * u;
  return Math.min(1, Math.max(0, to * e));
}

// ── which opening belongs to which cast ──

/** What the scene remembers of a capsule between its cast and its opening. */
export interface Pending {
  kind: SpCapsuleKind;
  inner: SpCapsuleKind | null;
  /** Battle time of the cast and of its opening (cast + the seconds the cast said). */
  at: number;
  opens: number;
  /** `air`: falling, waiting for its opening. `inside`: opened as a One More!, its small capsule waits to open. `done`. */
  stage: 'air' | 'inside' | 'done';
}

/** Slack (battle seconds) in matching a time: three ticks of the simulation. */
export const MATCH_SLACK = 0.05;

/**
 * The cast an opening belongs to. The event carries no id, so it is matched by what it must be: an opening of a big capsule is the OLDEST
 * capsule still in the air of that kind whose time has come (a cast the stage rule dropped has no entry, and the capsule before it, if
 * it is ours, opened earlier: capsules open in the order they were cast); the opening of a small one is the oldest One More! whose small
 * capsule is of that kind. Null when no cast of ours fits (the cast was dropped: the opening shows nothing of ours).
 */
export function pairOpening<T extends Pending>(list: readonly T[], kind: SpCapsuleKind, small: boolean, now: number): T | null {
  let best: T | null = null;
  for (const p of list) {
    const fits = small ? p.stage === 'inside' && p.inner === kind : p.stage === 'air' && p.kind === kind && p.opens <= now + MATCH_SLACK;
    if (fits && (best === null || p.at < best.at)) best = p;
  }
  return best;
}

// ── what pops up ──

/** The lines of the wording table (`sp.capsule.<id>.a`, and `.b` where there is a second line). */
export const LINE_IDS = ['fish', 'purr', 'partner', 'partnerFull', 'partnerEmpty', 'more', 'toy', 'toyEmpty', 'guardian', 'guardianEmpty'] as const;
export type LineId = (typeof LINE_IDS)[number];

/** Which lines have a second line under the cry. */
export const LINE_HAS_B: Readonly<Record<LineId, boolean>> = {
  fish: true, purr: false, partner: true, partnerFull: true, partnerEmpty: true, more: false, toy: true, toyEmpty: true, guardian: true, guardianEmpty: true,
};

/** The line for what a capsule of `kind` did (`result`): a prize that fell back to purr says so in the voice of the kind that was promised. */
export function lineFor(result: SpCapsuleResult, kind: SpCapsuleKind): LineId {
  switch (result) {
    case 'fish': return 'fish';
    case 'purr': return 'purr';
    case 'seat': return 'partner';
    case 'promote': return 'partnerFull';
    case 'more': return 'more';
    case 'toy': return 'toy';
    case 'awaken': return 'guardian';
    default:
      return kind === 'partner' ? 'partnerEmpty' : kind === 'toy' ? 'toyEmpty' : kind === 'guardian' ? 'guardianEmpty' : 'purr';
  }
}

/** The toy pick's own screen says the toy line, so the lid shows it only to the lines that no screen repeats. */
export function lineShown(line: LineId): boolean {
  return line !== 'toy';
}

/** How many hearts a prize throws (0 for one that pays no purr), capped by the quality tier (low, mid, high). */
export function heartsFor(result: SpCapsuleResult, purr: number, detail: 0 | 1 | 2): number {
  if (purr <= 0) return 0;
  const n = result === 'purr' ? purr + 1 : purr;
  return Math.min(n, [4, 8, 12][detail] as number);
}

/** How many cats of the board join the purring chorus: all of them at the top tier, the nearest few below it. */
export function chorusSize(cats: number, detail: 0 | 1 | 2): number {
  return Math.min(cats, [6, 14, 25][detail] as number);
}
