/**
 * The profile facade the UI talks to: runs and sweeps, purchases, backup codes. The other commands
 * are inherited (core.ts -> economy.ts -> routines.ts). Pure rules are in the sibling modules.
 */
import type { BattleInit, BattleMode, BattleSnapshot, DailyModifierId, RunStats } from '@/game/api';
import { GOLD_DUNGEON_WAVES } from '@/game/data/goldDungeon';
import { randomSeed } from '@/core/rng';
import { mergeLedgers, normalizeLedger, type GrantSource } from '@/platform/iapService';
import { encodeBackup, decodeBackup } from './backup';
import type { MetaDeps } from './core';
import { GEM_PASS_DAYS, iapSpec } from './data/catalog';
import { DUNGEON_AD_PLACEMENT, DUNGEON_ENTRY_GEMS, DUNGEON_FREE_ENTRIES, DUNGEON_TIERS } from './data/dungeon';
import { PIGGY_PER_RUN, SNACK_FISH, SNACK_PURR, type SnackId } from './data/economy';
import { cupScore, dailySetup } from './daily';
import { dungeonCanBuy, dungeonEntriesLeft, dungeonFirstClearGold, dungeonMaxGold, dungeonTierOpen, dungeonTopTier } from './dungeon';
import type { PayVia } from './economy';
import { runMissionDelta } from './missions';
import { addPassXp, seasonOf } from './pass';
import { createProfileStore, sanitizeProfile } from './profileData';
import { canPlayStake, chaptersCleared, computeRunPayout, sweepPayout } from './rewards';
import { RoutineProfile } from './routines';
import { dateKey, type ClockSource } from './time';
import { accountProgress, buildLoadout } from './units';
import {
  fail,
  ok,
  type AppliedOrder,
  type Bundle,
  type ChestKind,
  type CurrencyId,
  type DungeonBest,
  type PendingRun,
  type ProfileData,
  type Result,
  type RunReward,
} from './types';

const DAY_MS = 86_400_000;
/** Extra gems for a second season pass bought while the first is still active (the premium row is already open). */
const SEASON_DUPLICATE_GEMS = 600;
export const CUP_BOARD_ID = 'weekly_cup';
/** The most a single test grant hands out. */
const TEST_GRANT_MAX = 100_000;

export interface RunOptions {
  mode: BattleMode;
  /** Chapter mode and endless; the tier of the gold dungeon; ignored for the tutorial and the daily challenge. */
  chapter?: number;
  stake?: number;
  /** Pre-run snack: pay with an ad or gems. Not offered in the tutorial, the daily challenge or the gold dungeon. */
  snack?: { id: SnackId; via: PayVia };
}

export interface BackupPreview {
  gold: number;
  gems: number;
  accountLevel: number;
  chaptersCleared: number;
  savedAt: number;
}

export interface SweepResult {
  gold: number;
  xp: number;
}

export interface DungeonTierRow {
  tier: number;
  open: boolean;
  /** The most a run of this tier pays (every wave cleared, every enemy killed; the first-victory bonus is on top). */
  maxGold: number;
  /** The bonus the day's first victory adds on this tier. */
  bonus: number;
  best: DungeonBest;
}

export interface DungeonView {
  unlocked: boolean;
  waves: number;
  tiers: DungeonTierRow[];
  /** The highest open tier, 0 while none is. */
  top: number;
  freeEntries: number;
  used: number;
  bought: number;
  entriesLeft: number;
  /** An extra entry can still be bought today (a rewarded ad or gems). */
  canBuy: boolean;
  entryGems: number;
  /** The day's first-victory bonus is still to be won. */
  firstClearOpen: boolean;
}

function snackFields(id: SnackId): Pick<BattleInit, 'bonusFish' | 'bonusPurr' | 'firstSummonRarePlus'> {
  if (id === 'fish') return { bonusFish: SNACK_FISH };
  if (id === 'purr') return { bonusPurr: SNACK_PURR };
  return { firstSummonRarePlus: true };
}

/** Stats for a run that ended without the battle reporting (the app was killed): a defeat at that wave. */
function interruptedStats(init: BattleInit, wavesCleared: number): RunStats {
  return {
    mode: init.mode, chapter: init.chapter, stake: init.stake, seed: init.seed, victory: false,
    wavesCleared, totalWaves: 0, kills: 0, bossesKilled: 0, summons: 0, merges: 0, molts: 0, awakenings: 0,
    relics: [], bestRarity: 'common', peakEnemies: 0, duration: 0, revived: false, summonLuck: 0.5, damageByUnit: {},
  };
}

/** Whether a refunded season order was holding the stored season's premium row: one of that season, with no other paid order of it left. */
function closesPremiumRow(refunded: AppliedOrder, orders: Record<string, AppliedOrder>, stored: number): boolean {
  const season = seasonOf(dateKey(refunded.t));
  if (season !== stored) return false;
  return !Object.values(orders).some((o) => !o.revoked && iapSpec(o.p)?.grant === 'season' && seasonOf(dateKey(o.t)) === season);
}

/** True when the ledger holds Butler Pass orders and every one was refunded: the flag must not come back from another device. */
function butlerRefunded(orders: Record<string, AppliedOrder>): boolean {
  const passes = Object.values(orders).filter((o) => iapSpec(o.p)?.grant === 'butler');
  return passes.length > 0 && passes.every((o) => o.revoked);
}

function previewOf(data: ProfileData, savedAt: number): BackupPreview {
  return {
    gold: data.gold,
    gems: data.gems,
    accountLevel: accountProgress(data.accountXp).level,
    chaptersCleared: chaptersCleared(data.cleared),
    savedAt,
  };
}

export class Profile extends RoutineProfile {
  // ───────────────────────────── runs ─────────────────────────────

  /** A run was started and has not been settled: after a crash this is the "continue?" prompt. */
  get pendingRun(): PendingRun | null {
    return this.data.pending;
  }

  /**
   * Everything a battle needs, decided here: seed, loadout from the profile, daily setup, snack. The
   * run is recorded as pending (and flushed) so a killed app can offer to continue it.
   */
  async prepareRun(o: RunOptions): Promise<Result<BattleInit>> {
    const d = this.data;
    if (d.pending) return fail('run_active');
    let chapter = o.chapter ?? 1;
    let stake = o.stake ?? 0;
    let seed = this.deps.seed() >>> 0;
    let modifiers: DailyModifierId[] | undefined;
    switch (o.mode) {
      case 'tutorial':
        chapter = 1;
        stake = 0;
        break;
      case 'chapter':
        if (!canPlayStake(d.cleared, chapter, stake)) return fail('locked');
        break;
      case 'daily': {
        if (!this.featureUnlocked('daily')) return fail('locked');
        const setup = dailySetup(this.today());
        chapter = setup.chapter;
        stake = 0;
        seed = setup.seed;
        modifiers = setup.modifiers;
        break;
      }
      case 'endless': {
        if (!this.featureUnlocked('endless')) return fail('locked');
        const top = chaptersCleared(d.cleared);
        chapter = Math.min(top, Math.max(1, o.chapter ?? top));
        stake = 0;
        break;
      }
      case 'gold': {
        if (!this.featureUnlocked('dungeon')) return fail('locked');
        this.refresh(); // the entries belong to the day the battle opens in
        chapter = Math.round(o.chapter ?? 1);
        stake = 0;
        if (!dungeonTierOpen(d.cleared, chapter)) return fail('locked');
        if (dungeonEntriesLeft(d.day.dungeon) <= 0) return fail('limit_reached');
        break;
      }
    }
    if (o.snack && (o.mode === 'daily' || o.mode === 'tutorial' || o.mode === 'gold')) return fail('locked');
    if (o.snack) {
      const paid = await this.pay('start_snack', o.snack.via);
      if (!paid.ok) return paid;
      if (this.data.pending) return fail('run_active');
    }
    this.deps.ads.beginRun();
    // The entry is taken when the run starts and saved with it: closing the app does not give it back, and reopening it does not give another.
    if (o.mode === 'gold') d.day.dungeon.used++;
    const init: BattleInit = {
      seed, mode: o.mode, chapter, stake,
      loadout: buildLoadout(d.levels, d.training, o.mode === 'daily'),
      ...(modifiers ? { modifiers } : {}),
      ...(o.snack ? snackFields(o.snack.id) : {}),
    };
    this.data.pending = { init, snapshot: null, startedAt: this.now() };
    this.deps.analytics.track('run_start', { mode: o.mode, chapter, stake });
    this.commit();
    await this.flush();
    return ok(init);
  }

  /** Store the wave-start snapshot of the battle in progress (call at every wave start). */
  async saveSnapshot(snapshot: BattleSnapshot | null): Promise<void> {
    const p = this.data.pending;
    if (!p) return;
    p.snapshot = snapshot;
    this.commit();
    await this.flush();
  }

  /** Throw the interrupted run away without any reward. */
  async discardPendingRun(): Promise<void> {
    if (!this.data.pending) return;
    this.data.pending = null;
    this.deps.ads.endRun('abandon');
    this.commit();
    await this.flush();
  }

  /** Pay the interrupted run as a defeat at its last stored wave. */
  async settlePendingRun(): Promise<Result<RunReward>> {
    const p = this.data.pending;
    if (!p) return fail('nothing_to_claim');
    return this.finishRun(interruptedStats(p.init, Math.max(0, (p.snapshot?.wave ?? 1) - 1)));
  }

  /**
   * Settle a finished run. `abandoned` = the player quit from the pause menu: the rewards are the
   * same, but the ad policy does not count it as a completed run.
   */
  async finishRun(stats: RunStats, opts: { abandoned?: boolean } = {}): Promise<Result<RunReward>> {
    // A dungeon run pays once, for the entry that started it: no pending run, nothing to settle.
    if (stats.mode === 'gold' && this.data.pending?.init.mode !== 'gold') return fail('nothing_to_claim');
    this.refresh(); // a run that ends after midnight belongs to the new day, week and season
    const d = this.data;
    const date = this.today();
    const payout = computeRunPayout(stats, { cleared: d.cleared, dailyAlreadyCleared: d.day.challengeCleared, dungeonFirstDone: d.day.dungeon.firstClear });
    let newBest = false;

    d.stats.runs++;
    if (stats.victory) d.stats.wins++;
    d.stats.merges += stats.merges;
    d.stats.kills += stats.kills;
    d.stats.bosses += stats.bossesKilled;
    if (payout.firstClear) d.cleared[stats.chapter - 1] = stats.stake + 1;

    if (stats.mode === 'daily') {
      if (payout.dailyFirstClear) d.day.challengeCleared = true;
      if (stats.wavesCleared > (d.cup.days[date] ?? 0)) {
        d.cup.days[date] = stats.wavesCleared;
        newBest = true;
        this.deps.submitScore?.(CUP_BOARD_ID, cupScore(d.cup.days, d.cup.week));
      }
    } else if (stats.mode === 'endless') {
      if (stats.wavesCleared > d.endless.best) {
        d.endless.best = stats.wavesCleared;
        newBest = true;
      }
      d.endless.weekBest = Math.max(d.endless.weekBest, stats.wavesCleared);
    } else if (stats.mode === 'gold') {
      const bonus = payout.dungeonBonus ?? 0;
      if (bonus > 0) d.day.dungeon.firstClear = true;
      const best = d.dungeon.best[stats.chapter - 1];
      // The bonus is a gift of the day, not part of the record.
      if (best && payout.gold - bonus > best.gold) {
        d.dungeon.best[stats.chapter - 1] = { waves: stats.wavesCleared, kills: stats.kills, gold: payout.gold - bonus };
        newBest = true;
      }
    }

    this.grant('gold', payout.gold, stats.mode === 'gold' ? 'dungeon' : 'run_reward');
    this.applyBundle(payout.bundle, payout.firstClear ? 'first_clear' : payout.dailyFirstClear ? 'daily_clear' : 'consolation');
    this.addAccountXp(payout.xp);
    d.pass = addPassXp(d.pass, payout.xp);
    if (stats.mode !== 'tutorial') this.addPiggy(PIGGY_PER_RUN);
    // The tutorial teaches; it is not a day's play, so it advances no daily or weekly mission (a win in it must not tick "win once").
    this.advanceMissionMetrics(runMissionDelta(stats));

    const reward: RunReward = {
      id: d.nextRunId++,
      mode: stats.mode, chapter: stats.chapter, stake: stats.stake, victory: stats.victory, wavesCleared: stats.wavesCleared,
      gold: payout.gold, xp: payout.xp, bundle: payout.bundle, firstClear: payout.firstClear, doubled: false, newBest,
      ...(stats.mode === 'gold' ? { kills: stats.kills, bonus: payout.dungeonBonus ?? 0 } : {}),
    };
    d.lastRun = reward;
    d.pending = null;
    this.deps.ads.endRun(opts.abandoned ? 'abandon' : stats.victory ? 'victory' : 'defeat');
    this.deps.analytics.track('run_end', {
      mode: stats.mode, chapter: stats.chapter, stake: stats.stake, result: stats.victory ? 'victory' : 'defeat',
      waves: stats.wavesCleared, seconds: Math.round(stats.duration),
    });
    this.events.emit('run', reward);
    this.commit();
    await this.flush();
    return ok(reward);
  }

  /** The result-screen offer: gold and XP of the last run once more, for an ad or 20 gems. */
  async doubleResult(via: PayVia): Promise<Result<RunReward>> {
    const last = this.data.lastRun;
    if (!last || last.doubled) return fail('already_claimed');
    const paid = await this.pay('result_double', via);
    if (!paid.ok) return paid;
    this.refresh();
    const d = this.data;
    if (!d.lastRun || d.lastRun.doubled) return fail('already_claimed');
    d.lastRun.doubled = true;
    this.grant('gold', d.lastRun.gold, 'run_double');
    this.addAccountXp(d.lastRun.xp);
    d.pass = addPassXp(d.pass, d.lastRun.xp);
    this.commit();
    return ok(d.lastRun);
  }

  /** Use a ticket on a chapter and stake that is already cleared: 60% of a win's gold and XP. Missions need real play, so a sweep counts for none. */
  sweep(chapter: number, stake: number): Result<SweepResult> {
    if (!this.featureUnlocked('sweep')) return fail('locked');
    this.refresh();
    const d = this.data;
    if (stake < 0 || stake >= (d.cleared[chapter - 1] ?? 0)) return fail('not_cleared');
    if (d.pending) return fail('run_active');
    if (!this.spend('tickets', 1, 'sweep')) return fail('not_enough_tickets');
    const pay = sweepPayout(chapter, stake);
    this.grant('gold', pay.gold, 'sweep');
    this.addAccountXp(pay.xp);
    d.pass = addPassXp(d.pass, pay.xp);
    d.stats.sweeps++;
    this.commit();
    return ok(pay);
  }

  // ───────────────────────────── gold dungeon ─────────────────────────────

  dungeonView(): DungeonView {
    const d = this.data;
    const day = d.day.dungeon;
    return {
      unlocked: this.featureUnlocked('dungeon'),
      waves: GOLD_DUNGEON_WAVES,
      tiers: Array.from({ length: DUNGEON_TIERS }, (_, i) => ({
        tier: i + 1,
        open: dungeonTierOpen(d.cleared, i + 1),
        maxGold: dungeonMaxGold(i + 1),
        bonus: dungeonFirstClearGold(i + 1),
        best: { ...(d.dungeon.best[i] as DungeonBest) },
      })),
      top: dungeonTopTier(d.cleared),
      freeEntries: DUNGEON_FREE_ENTRIES,
      used: day.used,
      bought: day.bought,
      entriesLeft: dungeonEntriesLeft(day),
      canBuy: dungeonCanBuy(day),
      entryGems: DUNGEON_ENTRY_GEMS,
      firstClearOpen: !day.firstClear,
    };
  }

  /**
   * The day's extra entry, for a rewarded ad or gems. It is only paid for here; the run takes it when it starts.
   * One a day: a second purchase is refused before anything is charged.
   */
  async buyDungeonEntry(via: PayVia): Promise<Result<DungeonView>> {
    if (!this.featureUnlocked('dungeon')) return fail('locked');
    this.refresh();
    if (!dungeonCanBuy(this.data.day.dungeon)) return fail('limit_reached');
    if (via === 'gems') {
      if (!this.spend('gems', DUNGEON_ENTRY_GEMS, 'offer_dungeon')) return fail('not_enough_gems');
    } else {
      const watched = await this.watchAd(DUNGEON_AD_PLACEMENT);
      if (!watched.ok) return watched;
      this.refresh();
      if (!dungeonCanBuy(this.data.day.dungeon)) return fail('limit_reached');
    }
    this.data.day.dungeon.bought++;
    this.commit();
    return ok(this.dungeonView());
  }

  // ───────────────────────────── test grants ─────────────────────────────

  /**
   * The settings sheet's test buttons (development platform only, see MetaDeps.testGrants): a currency
   * through the one money path. Returns what really arrived (tickets stop at their cap).
   */
  grantTest(currency: CurrencyId, amount: number): Result<number> {
    if (!this.deps.testGrants) return fail('unavailable');
    const n = Math.floor(amount);
    if (!(n > 0) || n > TEST_GRANT_MAX) return fail('invalid');
    const before = this.data[currency];
    this.grant(currency, n, 'test');
    const gained = this.data[currency] - before;
    if (gained <= 0) return fail('limit_reached');
    this.commit();
    return ok(gained);
  }

  // ───────────────────────────── purchases ─────────────────────────────

  /** False when the shop should hide the product (a one-time pack or pass already owned). */
  isPurchasable(productId: string): boolean {
    const spec = iapSpec(productId);
    if (!spec) return false;
    const d = this.data;
    if (spec.grant === 'butler') return !d.owned.butler;
    if (spec.grant === 'season') return !d.pass.premium;
    if (spec.grant === 'piggy') return d.piggy.gems > 0;
    return !(spec.once && d.owned.once.includes(spec.id));
  }

  /**
   * The grant handler for the IAP service. Idempotent on `orderId`: the order is recorded in the
   * same save as everything it gave, so a crash replays it to either nothing or the whole grant.
   * Throws for an unknown product so the order stays pending on the platform. A consumable order
   * that only comes back through a restore (a new device) was paid out on the old one: it is
   * recorded as done and gives nothing; permanent entitlements (Butler Pass) are restored.
   */
  async grantOrder(productId: string, orderId: string, source: GrantSource = 'purchase'): Promise<void> {
    const d = this.data;
    if (d.orders[orderId]) return;
    const spec = iapSpec(productId);
    if (!spec) throw new Error('unknown product ' + productId);
    this.refresh(); // the pass row and the other slices it writes must be today's, or the next rollover wipes them
    const now = this.now();
    if (source === 'restore' && spec.type === 'consumable') {
      d.orders[orderId] = { p: productId, t: now, revoked: false, gems: 0, gold: 0, chests: {} };
      this.commit();
      await this.flush();
      return;
    }
    const bundle: Bundle = { ...spec.bundle };
    switch (spec.grant) {
      case 'butler':
        d.owned.butler = true;
        break;
      case 'season':
        if (d.pass.premium) bundle.gems = (bundle.gems ?? 0) + SEASON_DUPLICATE_GEMS;
        else d.pass.premium = true;
        break;
      case 'gem_pass':
        // gemPassView() judges the pass from the last trusted moment while the clock is frozen: count from there too.
        d.gemPass.until = Math.max(this.frozen ? d.time.lastSeenAt : now, d.gemPass.until) + GEM_PASS_DAYS * DAY_MS;
        break;
      case 'piggy':
        bundle.gems = d.piggy.gems;
        d.piggy = { gems: 0, since: 0 };
        break;
      case 'bundle':
        break;
    }
    if (spec.once && spec.grant === 'bundle' && !d.owned.once.includes(spec.id)) d.owned.once.push(spec.id);
    const applied: AppliedOrder = { p: productId, t: now, revoked: false, gems: bundle.gems ?? 0, gold: bundle.gold ?? 0, chests: { ...bundle.chests } };
    this.applyBundle(bundle, 'iap');
    d.orders[orderId] = applied;
    this.commit();
    await this.flush();
  }

  /**
   * Take back a refunded order: ownership flags go, and gold, gems and unopened chests it added are
   * removed as far as the player still has them (a balance never goes negative). Safe to call twice,
   * and safe to call before the grant ever arrived: the order id is then blocked.
   */
  async revokeOrder(orderId: string, productId = ''): Promise<void> {
    const d = this.data;
    const o = d.orders[orderId];
    if (o?.revoked) return;
    if (!o) {
      d.orders[orderId] = { p: productId, t: this.now(), revoked: true, gems: 0, gold: 0, chests: {} };
      this.commit();
      await this.flush();
      return;
    }
    this.takeBack(o);
    this.commit();
    await this.flush();
  }

  /** Mark an order refunded and take back what it gave. The caller saves. */
  private takeBack(o: AppliedOrder): void {
    const d = this.data;
    o.revoked = true;
    const spec = iapSpec(o.p);
    switch (spec?.grant) {
      case 'butler':
        d.owned.butler = false;
        break;
      case 'season':
        if (closesPremiumRow(o, d.orders, d.pass.season)) d.pass.premium = false;
        break;
      case 'gem_pass':
        d.gemPass.until = d.gemPass.until - GEM_PASS_DAYS * DAY_MS > this.now() ? d.gemPass.until - GEM_PASS_DAYS * DAY_MS : 0;
        break;
      case 'bundle':
        d.owned.once = d.owned.once.filter((id) => id !== o.p);
        break;
      default:
        break;
    }
    this.clawback('gems', o.gems, 'iap_revoke');
    this.clawback('gold', o.gold, 'iap_revoke');
    for (const [kind, n] of Object.entries(o.chests) as [ChestKind, number][]) {
      d.chests[kind] = Math.max(0, d.chests[kind] - n);
    }
    for (const id of spec?.bundle.cosmetics ?? []) {
      d.cosmetics.owned = d.cosmetics.owned.filter((c) => c !== id);
      if (d.cosmetics.rug === id) d.cosmetics.rug = 'rug_default';
    }
  }

  // ───────────────────────────── backup code ─────────────────────────────

  exportCode(): Promise<string> {
    return encodeBackup(this.data, this.now());
  }

  private async readCode(code: string): Promise<Result<{ data: ProfileData; savedAt: number }>> {
    const decoded = await decodeBackup(code);
    if (!decoded.ok) return decoded;
    const data = sanitizeProfile(decoded.value.data, this.now(), this.deps.seed());
    if (!data) return fail('invalid_code');
    return ok({ data, savedAt: decoded.value.savedAt });
  }

  /** What a code holds, for the confirmation dialog. Changes nothing. */
  async inspectCode(code: string): Promise<Result<BackupPreview>> {
    const r = await this.readCode(code);
    if (!r.ok) return r;
    return ok(previewOf(r.value.data, r.value.savedAt));
  }

  /**
   * Replace this profile with a code's. Orders and the purchase ledger of both devices are merged so
   * a replayed order is never granted twice, and a refund never comes back: an order this device took
   * back is taken back from the code's copy too. Ownership of the Butler Pass is kept if either has
   * it, unless every Butler Pass order in the merged ledger was refunded.
   */
  async importCode(code: string): Promise<Result<BackupPreview>> {
    const r = await this.readCode(code);
    if (!r.ok) return r;
    const cur = this.data;
    const next = r.value.data;
    next.pending = null;
    const refunded = Object.entries(next.orders).filter(([id, o]) => !o.revoked && cur.orders[id]?.revoked === true).map(([, o]) => o);
    next.orders = { ...cur.orders, ...next.orders };
    next.iapLedger = mergeLedgers(normalizeLedger(cur.iapLedger), normalizeLedger(next.iapLedger));
    next.time.lastSeenAt = Math.max(next.time.lastSeenAt, cur.time.lastSeenAt);
    this.deps.store.data = next;
    for (const o of refunded) this.takeBack(o);
    next.owned.butler = (next.owned.butler || cur.owned.butler) && !butlerRefunded(next.orders);
    this.clock.observe(next.time.lastSeenAt);
    this.refresh();
    await this.flush();
    return ok(previewOf(next, r.value.savedAt));
  }
}

export const systemClock: ClockSource = {
  wall: () => Date.now(),
  mono: () => (typeof performance === 'undefined' ? Date.now() : performance.now()),
};

/** A profile on the default store and clock. Pass `deps` pieces to replace them (tests do). */
export function createProfile(deps: Pick<MetaDeps, 'analytics' | 'ads'> & Partial<MetaDeps>): Profile {
  const clock = deps.clock ?? systemClock;
  const seed = deps.seed ?? randomSeed;
  return new Profile({
    store: deps.store ?? createProfileStore(() => clock.wall(), seed),
    clock,
    seed,
    analytics: deps.analytics,
    ads: deps.ads,
    submitScore: deps.submitScore,
    testGrants: deps.testGrants === true,
  });
}
