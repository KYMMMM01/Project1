/**
 * HUD decisions with no display objects in them: which parts are visible on which run, how the gauge
 * reads, what the summon button says, which offers may be shown. Pure so they can be unit tested.
 */
import type { ClassId, EnemyTrait, Fail, PityInfo, RarityId, UnitId } from '@/game';

// ───────────────────────────── staged reveal (GDD 9.1) ─────────────────────────────

export interface Reveal {
  classUpgrade: boolean;
  speed: boolean;
  preview: boolean;
  tracker: boolean;
  laser: boolean;
  callWave: boolean;
  purr: boolean;
  molt: boolean;
  odds: boolean;
  gradeUpgrade: boolean;
  awaken: boolean;
  sellHint: boolean;
}

/** Run 0 shows only summon, fish, wave timer, enemy gauge and pause; the rest arrives over the next three runs. */
export function revealFlags(runsPlayed: number): Reveal {
  const r2 = runsPlayed >= 1;
  const r3 = runsPlayed >= 2;
  const r4 = runsPlayed >= 3;
  return {
    classUpgrade: r2,
    speed: r2,
    preview: r2,
    tracker: r2,
    laser: r2,
    callWave: r2,
    purr: r3,
    molt: r3,
    odds: r3,
    gradeUpgrade: r4,
    awaken: r4,
    sellHint: r4,
  };
}

// ───────────────────────────── speed ─────────────────────────────

/** 1x and 2x for everyone, 3x for Butler Pass owners; sandbox runs allow every step. */
export function speedSteps(butler: boolean, sandbox: boolean): readonly number[] {
  return butler || sandbox ? [1, 2, 3] : [1, 2];
}

export function nextSpeed(current: number, steps: readonly number[]): number {
  const i = steps.indexOf(current);
  return steps[(i + 1) % steps.length] ?? 1;
}

// ───────────────────────────── enemy gauge ─────────────────────────────

/** 0 calm, 1 caution (>= 2/3 of the cap), 2 danger (>= 5/6): the same thresholds the simulation reports. */
export function gaugeLevel(count: number, cap: number): 0 | 1 | 2 {
  if (cap <= 0) return 0;
  if (count * 6 >= cap * 5) return 2;
  if (count * 3 >= cap * 2) return 1;
  return 0;
}

/** Seconds left of the overflow grace, or 0 when the field is within the cap. */
export function overflowLeft(overflowTime: number, limit: number): number {
  if (overflowTime <= 0) return 0;
  return Math.max(0, limit - overflowTime);
}

// ───────────────────────────── summon button ─────────────────────────────

export type SummonKind = 'ready' | 'short' | 'full';

export interface SummonView {
  kind: SummonKind;
  /** Fish still missing for 'short'. */
  missing: number;
}

export function summonView(emptyCells: number, cost: number, fish: number): SummonView {
  if (emptyCells <= 0) return { kind: 'full', missing: 0 };
  if (fish < cost) return { kind: 'short', missing: cost - fish };
  return { kind: 'ready', missing: 0 };
}

/** The soft-pity chip appears only once nine of the twelve dry summons have passed. */
export const PITY_SHOW_FROM = 9;

export function pityVisible(p: PityInfo): boolean {
  return p.epicDry >= PITY_SHOW_FROM;
}

/** Hold-to-repeat summoning: first repeat after 350 ms, then every 140 ms. */
export const HOLD_FIRST = 0.35;
export const HOLD_EVERY = 0.14;

/** Counts the repeat summons that are due while a finger stays on the button. */
export class HoldRepeater {
  active = false;
  private held = 0;
  private fired = 0;

  start(): void {
    this.active = true;
    this.held = 0;
    this.fired = 0;
  }

  stop(): void {
    this.active = false;
  }

  /** Repeats due after `dt` more seconds (0 until HOLD_FIRST has passed). */
  tick(dt: number): number {
    if (!this.active) return 0;
    this.held += dt;
    if (this.held < HOLD_FIRST) return 0;
    const due = Math.floor((this.held - HOLD_FIRST) / HOLD_EVERY) + 1;
    const n = due - this.fired;
    this.fired = due;
    return n;
  }
}

// ───────────────────────────── refused commands ─────────────────────────────

/**
 * i18n keys that may explain a refusal, most specific first: `hud.fail.<command>.<fail>` then
 * `hud.fail.<fail>`. The caller takes the first one that exists.
 */
export function failKeys(command: string, fail: Fail): readonly string[] {
  return [`hud.fail.${command}.${fail}`, `hud.fail.${fail}`];
}

/** Every refusal the simulation can report (kept next to the strings test so a new code cannot slip through). */
export const ALL_FAILS: readonly Fail[] = [
  'not_enough_fish', 'not_enough_purr', 'board_full', 'choice_pending', 'not_in_battle', 'invalid_cell', 'empty_cell',
  'max_level', 'not_legendary', 'synergy_too_low', 'molt_limit', 'on_cooldown', 'not_available', 'already_used', 'nothing_to_do',
];

// ───────────────────────────── offers (GDD 8.2) ─────────────────────────────

/** The continue offer starts once a run has cleared this many waves (GDD 8.2). */
export const REVIVE_MIN_WAVES = 10;

export type OfferRoute = 'ad' | 'gems' | 'none';

/**
 * How a rewarded offer is paid. The ad service answers `ok` when an ad may be shown; reasons that
 * mean "not now" fall back to gems, reasons that mean "never in this run / today" hide the offer.
 */
export function offerRoute(reason: string, sandbox: boolean): OfferRoute {
  if (sandbox) return 'none';
  if (reason === 'ok') return 'ad';
  if (reason === 'first_run' || reason === 'run_cap' || reason === 'daily_cap' || reason === 'unknown_placement') return 'none';
  return 'gems';
}

// ───────────────────────────── result screen ─────────────────────────────

export type LuckLine = { kind: 'top' | 'low' | 'avg'; n: number };

/** summonLuck is the share of equally long summon sequences that rolled worse: 0.9 = luckier than 90 %. */
export function luckLine(luck: number): LuckLine {
  const l = Math.min(1, Math.max(0, luck));
  if (l >= 0.45 && l <= 0.55) return { kind: 'avg', n: 50 };
  if (l > 0.55) return { kind: 'top', n: Math.max(1, Math.round((1 - l) * 100)) };
  return { kind: 'low', n: Math.max(1, Math.round(l * 100)) };
}

/** "So close" shows when the run ended within `near` waves of the finish line. */
export function soCloseWaves(cleared: number, total: number, victory: boolean, near = 3): number {
  if (victory || total <= 0) return 0;
  const left = total - cleared;
  return left >= 1 && left <= near ? left : 0;
}

export interface RewardTile {
  kind: 'gold' | 'xp' | 'gems' | 'tickets' | 'chest' | 'card' | 'wild' | 'cosmetic';
  /** Chest kind, unit id, rarity or cosmetic id. */
  id: string;
  count: number;
}

export interface BundleLike {
  gold?: number;
  gems?: number;
  tickets?: number;
  chests?: Partial<Record<string, number>>;
  wild?: Partial<Record<string, number>>;
  cards?: Partial<Record<string, number>>;
  cosmetics?: string[];
}

/** Flat list of what a run paid, in the order the screen reveals it: gold, XP, then everything else. */
export function rewardTiles(gold: number, xp: number, bundle: BundleLike): RewardTile[] {
  const out: RewardTile[] = [];
  if (gold > 0) out.push({ kind: 'gold', id: 'gold', count: gold });
  if (xp > 0) out.push({ kind: 'xp', id: 'xp', count: xp });
  if ((bundle.gold ?? 0) > 0) out.push({ kind: 'gold', id: 'bonus', count: bundle.gold as number });
  if ((bundle.gems ?? 0) > 0) out.push({ kind: 'gems', id: 'gems', count: bundle.gems as number });
  if ((bundle.tickets ?? 0) > 0) out.push({ kind: 'tickets', id: 'tickets', count: bundle.tickets as number });
  for (const [k, n] of Object.entries(bundle.chests ?? {})) if ((n ?? 0) > 0) out.push({ kind: 'chest', id: k, count: n as number });
  for (const [k, n] of Object.entries(bundle.cards ?? {})) if ((n ?? 0) > 0) out.push({ kind: 'card', id: k, count: n as number });
  for (const [k, n] of Object.entries(bundle.wild ?? {})) if ((n ?? 0) > 0) out.push({ kind: 'wild', id: k, count: n as number });
  for (const c of bundle.cosmetics ?? []) out.push({ kind: 'cosmetic', id: c, count: 1 });
  return out;
}

// ───────────────────────────── choices ─────────────────────────────

export interface PickInfo {
  id: UnitId;
  classId: ClassId;
  rarity: RarityId;
}

const RARITY_RANK: Record<RarityId, number> = { common: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };

/**
 * Which of three offered kittens to highlight: one that adds a new kind to a class already on the
 * board (a step toward the next synergy tier) beats a bare rarity lead. Index of the best option.
 */
export function recommendPick(options: readonly PickInfo[], board: readonly UnitId[], classOf: (id: UnitId) => ClassId): number {
  let best = 0;
  let bestScore = -1;
  options.forEach((o, i) => {
    const sameKind = board.includes(o.id);
    const classOnBoard = board.some((b) => classOf(b) === o.classId);
    const score = RARITY_RANK[o.rarity] * 2 + (classOnBoard && !sameKind ? 5 : 0) + (sameKind ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Trait ids in display order for a preview tooltip; boss and elite lead. */
export function traitOrder(traits: readonly EnemyTrait[]): EnemyTrait[] {
  const rank = (t: EnemyTrait): number => (t === 'boss' ? 0 : t === 'elite' ? 1 : 2);
  return traits.slice().sort((a, b) => rank(a) - rank(b));
}

/** First-time speech bubbles: ids in the order they may appear. */
export const HINT_IDS = [
  'chips', 'synergy', 'toys', 'sun', 'speed', 'preview', 'tracker', 'laser', 'callWave', 'purr', 'molt', 'odds',
  'grade', 'awaken', 'sell',
] as const;
export type HintId = (typeof HINT_IDS)[number];
