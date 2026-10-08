/**
 * Pure staging policy: rate gates, pitch ladders, banner scheduling, flight
 * accounting and the music intensity maths. No Pixi, no audio, no clocks of its own: every method
 * takes `now` in seconds, so each rule can be unit-tested and none of them allocates in a fight.
 */
import { QUICK_REVEAL_WINDOW } from '../timing';

/** Minimum gap between two firings of the same small-integer id. */
export class GapGate {
  private readonly last: Float64Array;

  constructor(size: number) {
    this.last = new Float64Array(size).fill(-1e9);
  }

  /** True (and stamps the id) when at least `gap` seconds passed since the last accepted firing. */
  ready(id: number, now: number, gap: number): boolean {
    if (now - (this.last[id] as number) < gap) return false;
    this.last[id] = now;
    return true;
  }

  reset(): void {
    this.last.fill(-1e9);
  }
}

/** At most `max` firings inside any sliding `window` seconds. */
export class WindowLimiter {
  private readonly ring: Float64Array;
  private head = 0;
  private size = 0;

  constructor(
    readonly max: number,
    readonly window: number,
  ) {
    this.ring = new Float64Array(Math.max(1, max));
  }

  /** Number of firings still inside the window. */
  count(now: number): number {
    while (this.size > 0 && now - (this.ring[this.head] as number) >= this.window) {
      this.head = (this.head + 1) % this.ring.length;
      this.size--;
    }
    return this.size;
  }

  take(now: number): boolean {
    if (this.count(now) >= this.max) return false;
    this.ring[(this.head + this.size) % this.ring.length] = now;
    this.size++;
    return true;
  }

  reset(): void {
    this.head = 0;
    this.size = 0;
  }
}

/** A budget that refills every frame (death puffs, hit sparks): `take()` until empty, `refill()` per update. */
export class FrameBudget {
  private left: number;

  constructor(readonly perFrame: number) {
    this.left = perFrame;
  }

  take(): boolean {
    if (this.left <= 0) return false;
    this.left--;
    return true;
  }

  refill(): void {
    this.left = this.perFrame;
  }
}

/**
 * Gate keyed by an entity uid plus a sub-id below 16 (status kind, cue type). Slots are hashed, so a
 * collision can only ever suppress an extra cue, never allow a duplicate.
 */
export class KeyedGate {
  private readonly keys: Float64Array;
  private readonly at: Float64Array;

  constructor(private readonly slots = 256) {
    this.keys = new Float64Array(slots).fill(-1);
    this.at = new Float64Array(slots).fill(-1e9);
  }

  ready(uid: number, sub: number, now: number, gap: number): boolean {
    const key = uid * 16 + sub;
    const slot = (Math.imul(key | 0, 0x9e3779b1) >>> 0) % this.slots;
    if (this.keys[slot] === key && now - (this.at[slot] as number) < gap) return false;
    this.keys[slot] = key;
    this.at[slot] = now;
    return true;
  }

  reset(): void {
    this.keys.fill(-1);
    this.at.fill(-1e9);
  }
}

/**
 * Combo pitch for a stream of similar sounds (kills, merges, coin ticks): the scale step climbs by one
 * every `perStep` events while they keep coming within `window` seconds, then hovers under `cap` so a
 * long fight trills instead of sitting on the highest note. A quiet gap resets it.
 */
export class PitchLadder {
  private n = 0;
  private lastAt = -1e9;

  constructor(
    readonly window: number,
    readonly cap: number,
    readonly perStep = 1,
  ) {}

  next(now: number): number {
    if (now - this.lastAt > this.window) this.n = 0;
    this.lastAt = now;
    const raw = Math.floor(this.n / this.perStep);
    this.n++;
    if (raw <= this.cap) return raw;
    return (raw - this.cap) % 2 === 1 ? this.cap - 1 : this.cap;
  }

  /** Events counted in the current streak (0 once the window has lapsed). */
  streak(now: number): number {
    return now - this.lastAt > this.window ? 0 : this.n;
  }

  reset(): void {
    this.n = 0;
    this.lastAt = -1e9;
  }
}

/** Global hit-stop rationing (guide 2.0.1): one per `gap` seconds, at most `maxMs`, tiny under reduced motion. */
export class HitStopGate {
  private last = -1e9;

  constructor(
    readonly gap = 0.4,
    readonly maxMs = 200,
    readonly reducedMaxMs = 50,
  ) {}

  /** Milliseconds granted (0 = refused). `force` skips the spacing for the boss death set piece. */
  request(ms: number, now: number, reduced: boolean, force = false): number {
    const granted = Math.min(ms, reduced ? this.reducedMaxMs : this.maxMs);
    if (granted <= 0) return 0;
    if (!force && now - this.last < this.gap) return 0;
    this.last = now;
    return granted;
  }

  reset(): void {
    this.last = -1e9;
  }
}

// ───────────────────────────── currency flights ─────────────────────────────

/** Icons a reward of `total` should launch, before the in-flight cap. */
export function iconsFor(reason: string, total: number): number {
  const n = Math.max(1, Math.round(total));
  switch (reason) {
    case 'kill':
      return Math.min(3, Math.max(1, Math.ceil(n / 2)));
    case 'unit':
      return 1;
    case 'sell':
      return Math.min(5, n);
    default:
      return Math.min(12, Math.max(1, Math.ceil(n / 3)));
  }
}

/** The part of `total` carried by icon `i` of `n`: shares differ by at most one and add up exactly. */
export function shareOf(total: number, n: number, i: number): number {
  const base = Math.floor(total / n);
  return base + (i < total - base * n ? 1 : 0);
}

/** Counts icons in the air: a new flight gets what room is left, so the sky never holds more than `cap`. */
export class FlightLedger {
  inFlight = 0;

  constructor(readonly cap = 12) {}

  grant(want: number): number {
    const n = Math.max(0, Math.min(want, this.cap - this.inFlight));
    this.inFlight += n;
    return n;
  }

  land(n = 1): void {
    this.inFlight = Math.max(0, this.inFlight - n);
  }

  reset(): void {
    this.inFlight = 0;
  }
}

// ───────────────────────────── banners ─────────────────────────────

export interface BannerItem<T> {
  /** Items with the same key replace each other instead of queueing twice. */
  key: string;
  /** Higher priority cuts a running lower one short. */
  priority: number;
  /** Seconds of entrance, hold and exit. */
  inS: number;
  holdS: number;
  outS: number;
  payload: T;
}

export type BannerPhase = 'idle' | 'in' | 'hold' | 'out';

/**
 * One lane of banners. Never blocks play: it only decides which banner is on screen and how far into
 * its entrance / hold / exit it is. A stale low-priority banner that waited too long is dropped.
 */
export class BannerQueue<T> {
  private cur: BannerItem<T> | null = null;
  private age = 0;
  private readonly pending: { item: BannerItem<T>; waited: number }[] = [];
  /** Pending low-priority banners older than this are dropped (their moment has passed). */
  staleS = 1.6;
  /** Raised each time a banner becomes the active one. */
  onStart: ((item: BannerItem<T>) => void) | null = null;

  constructor(readonly maxPending = 3) {}

  get active(): BannerItem<T> | null {
    return this.cur;
  }

  get phase(): BannerPhase {
    const c = this.cur;
    if (!c) return 'idle';
    if (this.age < c.inS) return 'in';
    return this.age < c.inS + c.holdS ? 'hold' : 'out';
  }

  /** 0..1 progress inside the current phase. */
  get progress(): number {
    const c = this.cur;
    if (!c) return 0;
    if (this.age < c.inS) return c.inS > 0 ? this.age / c.inS : 1;
    const h = this.age - c.inS;
    if (h < c.holdS) return c.holdS > 0 ? h / c.holdS : 1;
    const o = h - c.holdS;
    return c.outS > 0 ? Math.min(1, o / c.outS) : 1;
  }

  get length(): number {
    return this.pending.length + (this.cur ? 1 : 0);
  }

  push(item: BannerItem<T>): void {
    const c = this.cur;
    if (c && c.key === item.key) {
      this.cur = item;
      // Same banner again: keep it up, restart the hold instead of replaying the entrance.
      this.age = Math.min(this.age, item.inS);
      this.onStart?.(item);
      return;
    }
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i] as { item: BannerItem<T>; waited: number };
      if (p.item.key === item.key) {
        p.item = item;
        p.waited = 0;
        return;
      }
    }
    if (c && item.priority > c.priority && this.phase !== 'out') {
      // Cut the running banner to the start of its exit; the newcomer follows straight away.
      this.age = Math.max(this.age, c.inS + c.holdS);
      this.pending.unshift({ item, waited: 0 });
    } else {
      let at = this.pending.length;
      while (at > 0 && (this.pending[at - 1] as { item: BannerItem<T> }).item.priority < item.priority) at--;
      this.pending.splice(at, 0, { item, waited: 0 });
    }
    while (this.pending.length > this.maxPending) this.pending.pop();
  }

  update(dt: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i] as { item: BannerItem<T>; waited: number };
      p.waited += dt;
      if (p.waited > this.staleS && p.item.priority <= 1) this.pending.splice(i, 1);
    }
    const c = this.cur;
    if (c) {
      this.age += dt;
      if (this.age >= c.inS + c.holdS + c.outS) {
        this.cur = null;
        this.age = 0;
      }
    }
    if (!this.cur && this.pending.length > 0) {
      const next = (this.pending.shift() as { item: BannerItem<T> }).item;
      this.cur = next;
      this.age = 0;
      this.onStart?.(next);
    }
  }

  clear(): void {
    this.cur = null;
    this.age = 0;
    this.pending.length = 0;
  }
}

// ───────────────────────────── summon staging ─────────────────────────────

/** Counts summons in a sliding window: rapid tapping thins out the extra layers of cheap reveals. */
export class SummonRate {
  private readonly limiter: WindowLimiter;

  constructor(
    window = 1,
    readonly rapidAt = 4,
  ) {
    this.limiter = new WindowLimiter(16, window);
  }

  /** Register a summon; true when it is part of a rapid burst. */
  note(now: number): boolean {
    this.limiter.take(now);
    return this.limiter.count(now) >= this.rapidAt;
  }

  reset(): void {
    this.limiter.reset();
  }
}

export interface SummonPlan {
  /** Play only the base pop sound (no chime / whoosh layers). */
  popOnly: boolean;
  /** Draw the common recipe (in the rarity's colour) instead of the full one. */
  thin: boolean;
  /** Ask the reveal for its short version. */
  quick: boolean;
}

/** `tier` 0..4, `rapid` from SummonRate, `sinceBig` seconds since the last legendary-or-better reveal. */
export function summonPlan(tier: number, rapid: boolean, sinceBig: number): SummonPlan {
  const cheap = tier <= 1;
  return {
    popOnly: cheap && rapid,
    thin: cheap && rapid,
    quick: tier >= 3 && sinceBig < QUICK_REVEAL_WINDOW,
  };
}

/** The guide's duck depths (dB -> linear fraction of the music removed) for each rarity tier of a reveal. */
export const DUCK_BY_TIER: readonly { depth: number; seconds: number }[] = [
  { depth: 0, seconds: 0 },
  { depth: 0, seconds: 0 },
  { depth: 0.2, seconds: 0.3 },
  { depth: 0.35, seconds: 0.5 },
  { depth: 0.7, seconds: 1.2 },
];

// ───────────────────────────── music / danger ─────────────────────────────

/** Target music intensity 0..1 from how full the field is, how far into the run we are, and the boss. */
export function intensityTarget(count: number, cap: number, wave: number, totalWaves: number, bossActive: boolean): number {
  const fill = cap > 0 ? Math.min(1, count / (cap * 0.9)) : 0;
  const progress = totalWaves > 0 ? Math.min(1, wave / totalWaves) : 0;
  const v = 0.12 + 0.18 * progress + 0.62 * fill;
  return Math.min(1, bossActive ? Math.max(v, 0.75) : v);
}

/** Exponential smoothing: rises fast, falls slowly, frame-rate independent. */
export class IntensityMeter {
  value = 0.15;

  constructor(
    readonly riseHalfLife = 0.35,
    readonly fallHalfLife = 1.4,
  ) {}

  update(target: number, dt: number): number {
    const half = target > this.value ? this.riseHalfLife : this.fallHalfLife;
    this.value = target + (this.value - target) * Math.pow(0.5, dt / half);
    return this.value;
  }
}

/** Edge-vignette strength 0..1 for the sim's danger level, stronger while the overflow clock runs. */
export function dangerStrength(level: number, overflowing: boolean): number {
  if (overflowing) return 1;
  return level >= 2 ? 0.8 : level === 1 ? 0.35 : 0;
}

/** Seconds between heartbeat thuds (guide D-01: 70 bpm rising to 110 bpm), or 0 for no heartbeat. */
export function heartbeatInterval(level: number, overflowing: boolean): number {
  if (overflowing) return 60 / 110;
  return level >= 2 ? 60 / 70 : 0;
}

/** Whole seconds left on the overflow clock, never below 1 while it still runs. */
export function overflowSeconds(time: number, limit: number): number {
  if (time <= 0) return 0;
  return Math.max(1, Math.ceil(limit - time - 1e-6));
}

/**
 * Admission rule for one family of sounds: a minimum gap between starts and at most `max` starts in
 * any `window` seconds (the guide's "retrigger >= 45 ms, at most 4 at once" style limits).
 */
export class SoundRule {
  private last = -1e9;
  private readonly lim: WindowLimiter | null;

  /** @param pool a budget shared by every rule that points at it: busy fights cannot starve the big moments of voices. */
  constructor(
    readonly gap: number,
    max = 0,
    window = 0.12,
    private readonly pool: WindowLimiter | null = null,
  ) {
    this.lim = max > 0 ? new WindowLimiter(max, window) : null;
  }

  allow(now: number): boolean {
    if (now - this.last < this.gap) return false;
    if (this.lim && !this.lim.take(now)) return false;
    if (this.pool && !this.pool.take(now)) return false;
    this.last = now;
    return true;
  }

  reset(): void {
    this.last = -1e9;
    this.lim?.reset();
  }
}
