/**
 * The machinery under the profile: the store, the trusted clock, the one grant/spend path with its
 * event and analytics call, bundle application and the date rollovers. Commands are in profile.ts.
 */
import { Emitter } from '@/core/events';
import type { SaveStore } from '@/core/save';
import type { Analytics } from '@/platform/analytics';
import type { RewardedOutcome } from '@/platform/adService';
import type { RunResult } from '@/platform/types';
import { bundleParts } from './bundle';
import { comebackDue } from './calendar';
import {
  ACCOUNT_LEVEL_GEMS,
  DUPLICATE_COSMETIC_GEMS,
  MAX_LEVEL,
  OVERFLOW_GOLD,
  TICKETS_PASS_EXTRA,
  TICKETS_PER_DAY,
  TICKET_HARD_CAP,
  TICKET_STOCK,
  TICKET_STOCK_PASS,
} from './data/economy';
import { SHOP_SLOTS } from './data/catalog';
import { FEATURES, type FeatureId } from './data/schedule';
import { isFeatureUnlocked } from './features';
import { freshDay, rollWeek } from './missions';
import { claimableTiers, passReward, rollPass, type PassTrack } from './pass';
import { normalizeProfile } from './profileData';
import { chaptersCleared } from './rewards';
import { SessionClock, dateKey, nextLastSeen, weekKey, type ClockSource } from './time';
import { RARITY_OF, UNITS_BY_RARITY, accountProgress } from './units';
import {
  type BaseUnitId,
  type Bundle,
  type ChestKind,
  type ChestRarity,
  type CurrencyId,
  type PassSlice,
  type ProfileData,
  type ProfileEvents,
  type Reason,
} from './types';

const SEASON_TRACKS: readonly PassTrack[] = ['free', 'premium'];

/** The slice of AdService the meta layer drives. */
export interface AdsPort {
  showRewarded(placement: string): Promise<RewardedOutcome>;
  beginRun(): void;
  endRun(result: RunResult): void;
}

export interface MetaDeps {
  store: SaveStore<ProfileData>;
  clock: ClockSource;
  /** Seed source for chest rolls and the profile's shop seed. */
  seed(): number;
  analytics: Pick<Analytics, 'track'>;
  ads: AdsPort;
  /** Weekly cup score for a platform leaderboard (Toss, YouTube). */
  submitScore?: (board: string, score: number) => void;
}

export class ProfileCore {
  readonly events = new Emitter<ProfileEvents>();
  protected clock: SessionClock;

  constructor(protected readonly deps: MetaDeps) {
    this.clock = new SessionClock(deps.clock, 0);
  }

  get data(): ProfileData {
    return this.deps.store.data;
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  async load(): Promise<void> {
    await this.deps.store.load();
    normalizeProfile(this.data);
    this.clock = new SessionClock(this.deps.clock, this.data.time.lastSeenAt);
    this.refresh();
    await this.flush();
  }

  /** Call when the app returns from the background: the monotonic clock may have paused meanwhile. */
  resume(): void {
    this.clock.anchor(this.data.time.lastSeenAt);
    this.refresh();
  }

  flush(): Promise<void> {
    return this.deps.store.flush();
  }

  /** Mark the profile dirty for a debounced save (state kept outside the commands, such as ad counters). */
  persist(): void {
    this.deps.store.save();
  }

  /** Write now: for state another service must be able to rely on surviving a crash. */
  persistNow(): Promise<void> {
    this.deps.store.save();
    return this.deps.store.flush();
  }

  subscribe(fn: () => void): () => void {
    return this.events.on('change', fn);
  }

  /** Call after every command that changed state: unlock check, a debounced save, one `change` event. */
  protected commit(): void {
    this.checkUnlocks();
    this.deps.store.save();
    this.events.emit('change', null);
  }

  // ───────────────────────────── time ─────────────────────────────

  /** True when time-based rewards must not progress (the clock was moved this session). */
  get frozen(): boolean {
    return this.clock.frozen;
  }

  now(): number {
    return this.clock.now();
  }

  /** Today's date key. While frozen it stays on the last date the profile rolled over to. */
  today(): string {
    return this.frozen ? this.data.day.date || dateKey(this.now()) : dateKey(this.now());
  }

  /** Roll the dates forward and re-check unlocks. Cheap; call when a screen opens or once a minute. */
  refresh(): void {
    const d = this.data;
    const frozen = this.clock.frozen;
    const now = this.clock.now();
    d.time.lastSeenAt = nextLastSeen(d.time.lastSeenAt, now, frozen);
    if (!frozen) this.rollover(dateKey(now));
    this.commit();
  }

  private rollover(today: string): void {
    const d = this.data;
    if (today > d.day.date) {
      const comeback = comebackDue(d.time.lastActiveDate, today);
      d.day = freshDay(today);
      d.time.lastActiveDate = today;
      if (comeback) d.comeback = { pending: true, chestClaimed: false, patrolBoost: true };
      const cap = d.owned.butler ? TICKET_STOCK_PASS : TICKET_STOCK;
      const daily = TICKETS_PER_DAY + (d.owned.butler ? TICKETS_PASS_EXTRA : 0);
      const room = Math.max(0, cap - d.tickets);
      if (room > 0) this.grant('tickets', Math.min(daily, room), 'ticket_daily');
    }
    const wk = weekKey(today);
    d.week = rollWeek(d.week, wk);
    if (wk > d.cup.week) d.cup = { week: wk, days: {}, claimed: [] };
    if (wk > d.endless.week) d.endless = { ...d.endless, week: wk, weekBest: 0, claimed: [] };
    const pass = rollPass(d.pass, today);
    if (pass !== d.pass) this.settleSeason(d.pass);
    d.pass = pass;
    if (today > d.shop.date) d.shop = { date: today, salt: 0, bought: Array.from({ length: SHOP_SLOTS }, () => false) };
  }

  /**
   * A season's wipe must not eat what was already earned: every reached tier the player never took is
   * paid as the season ends (the premium row only for an owner), whether or not the pass tab was opened.
   */
  private settleSeason(pass: PassSlice): void {
    for (const track of SEASON_TRACKS) {
      for (const tier of claimableTiers(pass, track)) {
        this.applyBundle(passReward(track, tier), track === 'free' ? 'pass_free' : 'pass_premium');
      }
    }
  }

  // ───────────────────────────── unlocks ─────────────────────────────

  featureUnlocked(f: FeatureId): boolean {
    const d = this.data;
    return isFeatureUnlocked(f, {
      runs: d.stats.runs,
      accountLevel: accountProgress(d.accountXp).level,
      chaptersCleared: chaptersCleared(d.cleared),
      butler: d.owned.butler,
    });
  }

  protected checkUnlocks(): void {
    const d = this.data;
    for (const f of FEATURES) {
      if (d.unlocked.includes(f) || !this.featureUnlocked(f)) continue;
      d.unlocked.push(f);
      this.deps.analytics.track('feature_unlock', { feature: f });
      this.events.emit('unlock', { feature: f });
    }
  }

  // ───────────────────────────── the one money path ─────────────────────────────

  balance(c: CurrencyId): number {
    return this.data[c];
  }

  /** Add currency. Every gain in the game ends up here. */
  grant(c: CurrencyId, amount: number, reason: Reason): void {
    const n = Math.floor(amount);
    if (n <= 0) return;
    const d = this.data;
    d[c] = Math.min(c === 'tickets' ? TICKET_HARD_CAP : 2_000_000_000, d[c] + n);
    this.report(c, n, reason);
  }

  /** Remove currency, or change nothing and return false when the balance is too low. */
  spend(c: CurrencyId, amount: number, reason: Reason): boolean {
    const n = Math.floor(amount);
    if (n < 0 || this.data[c] < n) return false;
    if (n === 0) return true;
    this.data[c] -= n;
    this.report(c, -n, reason);
    return true;
  }

  /** Take back up to `amount` (refunds): never goes below zero. Returns what was taken. */
  clawback(c: CurrencyId, amount: number, reason: Reason): number {
    const n = Math.min(this.data[c], Math.max(0, Math.floor(amount)));
    if (n > 0) {
      this.data[c] -= n;
      this.report(c, -n, reason);
    }
    return n;
  }

  private report(c: CurrencyId, delta: number, reason: Reason): void {
    const total = this.data[c];
    this.deps.analytics.track('currency', { currency: c, delta, total, reason });
    this.events.emit('currency', { currency: c, delta, total, reason });
  }

  // ───────────────────────────── cards, chests, cosmetics ─────────────────────────────

  private rarityMaxed(r: ChestRarity): boolean {
    return UNITS_BY_RARITY[r].every((u) => this.data.levels[u] >= MAX_LEVEL);
  }

  /** Credit cards of a unit. A unit at level 10 turns them into gold. Returns that gold. */
  addCards(unit: BaseUnitId, n: number, reason: Reason): number {
    if (n <= 0) return 0;
    const d = this.data;
    if (d.levels[unit] >= MAX_LEVEL) return this.overflow(RARITY_OF[unit], n, reason);
    d.cards[unit] += n;
    return 0;
  }

  /** Credit wild cards. When every unit of that rarity is at level 10 they turn into gold. */
  addWild(r: ChestRarity, n: number, reason: Reason): number {
    if (n <= 0) return 0;
    if (this.rarityMaxed(r)) return this.overflow(r, n, reason);
    this.data.wild[r] += n;
    return 0;
  }

  /**
   * A unit just reached level 10: its leftover cards, and the wild cards of its rarity when no unit
   * of that rarity can use them any more, turn into gold.
   */
  settleMaxed(unit: BaseUnitId): void {
    const d = this.data;
    const r = RARITY_OF[unit];
    const left = d.cards[unit];
    d.cards[unit] = 0;
    this.overflow(r, left, 'chest_overflow');
    if (this.rarityMaxed(r)) {
      const wild = d.wild[r];
      d.wild[r] = 0;
      this.overflow(r, wild, 'chest_overflow');
    }
  }

  private overflow(r: ChestRarity, n: number, reason: Reason): number {
    if (n <= 0) return 0;
    const gold = n * OVERFLOW_GOLD[r];
    this.grant('gold', gold, reason);
    return gold;
  }

  addChest(kind: ChestKind, n: number): void {
    if (n > 0) this.data.chests[kind] += n;
  }

  addCosmetic(id: string, reason: Reason): boolean {
    const owned = this.data.cosmetics.owned;
    if (owned.includes(id)) {
      this.grant('gems', DUPLICATE_COSMETIC_GEMS, reason);
      return false;
    }
    owned.push(id);
    return true;
  }

  /** Apply every part of a bundle. Overflow gold from maxed units is paid on top. */
  applyBundle(b: Bundle, reason: Reason): void {
    for (const p of bundleParts(b)) {
      switch (p.kind) {
        case 'gold':
        case 'gems':
        case 'tickets':
          this.grant(p.kind, p.n, reason);
          break;
        case 'chest':
          this.addChest(p.chest, p.n);
          break;
        case 'wild':
          this.addWild(p.rarity, p.n, reason);
          break;
        case 'card':
          this.addCards(p.unit, p.n, reason);
          break;
        case 'cosmetic':
          this.addCosmetic(p.id, reason);
          break;
      }
    }
  }

  // ───────────────────────────── account XP ─────────────────────────────

  /** Add account XP; every level gained pays gems. */
  addAccountXp(xp: number): void {
    const d = this.data;
    const before = accountProgress(d.accountXp).level;
    d.accountXp += Math.max(0, Math.floor(xp));
    const after = accountProgress(d.accountXp).level;
    for (let lv = before + 1; lv <= after; lv++) {
      this.grant('gems', ACCOUNT_LEVEL_GEMS, 'account_level');
      this.events.emit('accountLevel', { level: lv });
    }
  }
}
