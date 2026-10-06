/**
 * Profile commands about coming back: the free chest, patrol, calendar, comeback, missions, the
 * daily treat, the season pass, the daily challenge, the weekly cup, endless tiers and the gem pass.
 * Everything time-based refuses to run while the clock is frozen.
 */
import { EconomyProfile, type PayVia } from './economy';
import {
  CHEST_SKIPS_PER_DAY,
  DAILY_MISSION_CHEST_POINTS,
  FREE_CHEST_MS,
  OFFERS,
  PATROL_DOUBLES_PER_DAY,
  SNACK_CHESTS_PER_DAY,
  PLACEMENTS,
} from './data/economy';
import { GEM_PASS_DAILY } from './data/catalog';
import {
  CALENDAR,
  CUP_TIERS,
  DAILY_CHEST_REWARD,
  DAILY_MISSIONS,
  ENDLESS_TIERS,
  PASS_TIERS,
  PASS_XP_PER_TIER,
  TREAT_REWARDS,
  WEEKLY_CHEST_REWARD,
  WEEKLY_MISSIONS,
  type MissionDef,
  type MissionMetric,
} from './data/schedule';
import { calendarNext, canClaimCalendar, claimCalendar } from './calendar';
import { cupScore, dailySetup, type DailySetup } from './daily';
import { advanceMissions, allClaimed, claimMission, claimedPoints, missionComplete, type MetricDelta } from './missions';
import { claimPassTier, claimableTiers, passReward, passTier, seasonDaysLeft, type PassTrack } from './pass';
import { freeChestReady, freeChestWait, patrolCapMs, patrolRate, patrolStatus, type PatrolStatus } from './patrol';
import { chaptersCleared } from './rewards';
import { fail, ok, type Bundle, type MissionState, type Result } from './types';

export type MissionScope = 'daily' | 'weekly';

export interface FreeChestView {
  ready: boolean;
  waitMs: number;
  /** Ad skips left today (gems have no limit). */
  skipsLeft: number;
  skipGems: number;
}

export interface PatrolView extends PatrolStatus {
  rate: number;
  capMs: number;
  doublesLeft: number;
  /** The one-time 24 h cap after a comeback is waiting. */
  comebackBoost: boolean;
}

export interface CalendarView {
  next: number;
  canClaim: boolean;
  stamp: number;
  cycles: number;
  days: readonly Bundle[];
  comebackReady: boolean;
}

export interface MissionRow {
  id: string;
  metric: MissionMetric;
  target: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  points: number;
  reward: Bundle;
}

export interface DailyChestView {
  points: number;
  need: number;
  ready: boolean;
  claimed: boolean;
  reward: Bundle;
}

export interface PassRow {
  tier: number;
  reward: Bundle;
  reached: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface PassView {
  season: number;
  xp: number;
  tier: number;
  xpIntoTier: number;
  xpPerTier: number;
  premium: boolean;
  daysLeft: number;
  free: PassRow[];
  premiumRow: PassRow[];
}

export interface TierRow {
  /** Score or wave needed. */
  need: number;
  reward: Bundle;
  reached: boolean;
  claimed: boolean;
}

export interface CupView {
  week: string;
  score: number;
  todayBest: number;
  tiers: TierRow[];
}

export interface EndlessView {
  best: number;
  weekBest: number;
  tiers: TierRow[];
}

export interface DailyView {
  setup: DailySetup;
  unlocked: boolean;
  clearedToday: boolean;
  bestToday: number;
}

export class RoutineProfile extends EconomyProfile {
  /** Time used for accrual: it stops at the last trusted moment while the clock is frozen. */
  private accrualNow(): number {
    return this.frozen ? this.data.time.lastSeenAt : this.now();
  }

  // ───────────────────────────── free chest ─────────────────────────────

  freeChestView(): FreeChestView {
    const d = this.data;
    const now = this.accrualNow();
    return {
      ready: !this.frozen && freeChestReady(d.freeChest.readyAt, now),
      waitMs: freeChestWait(d.freeChest.readyAt, now),
      skipsLeft: Math.max(0, CHEST_SKIPS_PER_DAY - d.day.chestSkips),
      skipGems: OFFERS.chest_skip.gems,
    };
  }

  claimFreeChest(): Result<void> {
    if (this.frozen) return fail('clock_frozen');
    if (!this.freeChestView().ready) return fail('not_ready');
    this.addChest('wooden', 1);
    this.data.freeChest.readyAt = this.now() + FREE_CHEST_MS;
    this.commit();
    return ok(undefined);
  }

  /** Get the chest now instead of waiting: one ad (4 a day, none for Butler Pass owners) or gems. */
  async skipFreeChest(via: PayVia): Promise<Result<void>> {
    if (this.frozen) return fail('clock_frozen');
    if (this.freeChestView().ready) return this.claimFreeChest();
    if (via === 'ad' && this.data.day.chestSkips >= CHEST_SKIPS_PER_DAY) return fail('limit_reached');
    const paid = await this.pay('chest_skip', via);
    if (!paid.ok) return paid;
    if (via === 'ad') this.data.day.chestSkips++;
    this.addChest('wooden', 1);
    this.data.freeChest.readyAt = this.now() + FREE_CHEST_MS;
    this.commit();
    return ok(undefined);
  }

  // ───────────────────────────── patrol ─────────────────────────────

  patrolView(): PatrolView {
    const d = this.data;
    const rate = patrolRate(chaptersCleared(d.cleared));
    const capMs = patrolCapMs(d.owned.butler, d.comeback.patrolBoost);
    return {
      ...patrolStatus(d.patrol.since, this.accrualNow(), capMs, rate),
      rate,
      capMs,
      doublesLeft: Math.max(0, PATROL_DOUBLES_PER_DAY - d.day.patrolDoubles),
      comebackBoost: d.comeback.patrolBoost,
    };
  }

  /** Collect patrol gold. `double` doubles it for one ad (three a day, free with the Butler Pass). */
  async claimPatrol(double: boolean): Promise<Result<number>> {
    if (this.frozen) return fail('clock_frozen');
    if (!this.patrolView().collectable) return fail('not_ready');
    if (double) {
      if (this.patrolView().doublesLeft <= 0) return fail('limit_reached');
      const paid = await this.watchAd(PLACEMENTS.patrolDouble);
      if (!paid.ok) return paid;
    }
    const d = this.data;
    const v = this.patrolView();
    if (!v.collectable || this.frozen) return fail('not_ready');
    const gold = v.gold * (double ? 2 : 1);
    d.patrol.since = this.now();
    d.comeback.patrolBoost = false;
    if (double) d.day.patrolDoubles++;
    this.grant('gold', gold, double ? 'patrol_double' : 'patrol');
    this.commit();
    return ok(gold);
  }

  // ───────────────────────────── calendar and comeback ─────────────────────────────

  calendarView(): CalendarView {
    const d = this.data;
    return {
      next: calendarNext(d.calendar),
      canClaim: !this.frozen && canClaimCalendar(d.calendar, this.today()),
      stamp: d.calendar.stamp,
      cycles: d.calendar.cycles,
      days: CALENDAR,
      comebackReady: d.comeback.pending && !d.comeback.chestClaimed,
    };
  }

  /** Open today's box. A missed day is simply not counted: the next box is still the next box. */
  claimCalendar(): Result<{ day: number; reward: Bundle }> {
    if (this.frozen) return fail('clock_frozen');
    const r = claimCalendar(this.data.calendar, this.today());
    if (!r) return fail('already_claimed');
    this.data.calendar = r.cal;
    this.applyBundle(r.reward, 'calendar');
    this.commit();
    return ok({ day: r.day, reward: r.reward });
  }

  /** The silver chest for coming back after 3 or more days. (The longer patrol cap applies on its own.) */
  claimComeback(): Result<void> {
    const c = this.data.comeback;
    if (!c.pending || c.chestClaimed) return fail('nothing_to_claim');
    if (this.frozen) return fail('clock_frozen');
    c.pending = false;
    c.chestClaimed = true;
    this.addChest('silver', 1);
    this.commit();
    return ok(undefined);
  }

  // ───────────────────────────── missions ─────────────────────────────

  private missionState(scope: MissionScope): MissionState {
    return scope === 'daily' ? this.data.day.missions : this.data.week.missions;
  }

  private missionDefs(scope: MissionScope): readonly MissionDef[] {
    return scope === 'daily' ? DAILY_MISSIONS : WEEKLY_MISSIONS;
  }

  /** Count run results toward today's and this week's missions. */
  protected advanceMissionMetrics(delta: MetricDelta): void {
    const d = this.data;
    d.day.missions = advanceMissions(d.day.missions, DAILY_MISSIONS, delta);
    d.week.missions = advanceMissions(d.week.missions, WEEKLY_MISSIONS, delta);
  }

  missionsView(scope: MissionScope): MissionRow[] {
    const state = this.missionState(scope);
    return this.missionDefs(scope).map((def, i) => ({
      id: def.id,
      metric: def.metric,
      target: def.target,
      progress: state.progress[i] ?? 0,
      complete: missionComplete(state, this.missionDefs(scope), i),
      claimed: state.claimed[i] === true,
      points: def.points,
      reward: def.reward,
    }));
  }

  claimMission(scope: MissionScope, index: number): Result<Bundle> {
    if (!this.featureUnlocked('missions')) return fail('locked');
    const defs = this.missionDefs(scope);
    const state = this.missionState(scope);
    const r = claimMission(state, defs, index);
    if (!r) return fail(state.claimed[index] ? 'already_claimed' : 'not_ready');
    if (scope === 'daily') this.data.day.missions = r.state;
    else this.data.week.missions = r.state;
    this.applyBundle(r.reward, scope === 'daily' ? 'mission' : 'weekly_mission');
    this.deps.analytics.track('mission_claim', { scope, id: defs[index]?.id });
    this.commit();
    return ok(r.reward);
  }

  dailyChestView(): DailyChestView {
    const d = this.data;
    const points = claimedPoints(d.day.missions, DAILY_MISSIONS);
    return {
      points,
      need: DAILY_MISSION_CHEST_POINTS,
      ready: points >= DAILY_MISSION_CHEST_POINTS && !d.day.chestClaimed,
      claimed: d.day.chestClaimed,
      reward: DAILY_CHEST_REWARD,
    };
  }

  /** 100 points: silver chest + 20 gems. Also counts toward the weekly "daily chests" mission. */
  claimDailyChest(): Result<Bundle> {
    const v = this.dailyChestView();
    if (v.claimed) return fail('already_claimed');
    if (!v.ready) return fail('not_ready');
    this.data.day.chestClaimed = true;
    this.applyBundle(DAILY_CHEST_REWARD, 'mission_chest');
    this.data.week.missions = advanceMissions(this.data.week.missions, WEEKLY_MISSIONS, { dailyChests: 1 });
    this.commit();
    return ok(DAILY_CHEST_REWARD);
  }

  weeklyChestReady(): boolean {
    const w = this.data.week;
    return allClaimed(w.missions) && !w.chestClaimed;
  }

  claimWeeklyChest(): Result<Bundle> {
    if (this.data.week.chestClaimed) return fail('already_claimed');
    if (!this.weeklyChestReady()) return fail('not_ready');
    this.data.week.chestClaimed = true;
    this.applyBundle(WEEKLY_CHEST_REWARD, 'weekly_mission');
    this.commit();
    return ok(WEEKLY_CHEST_REWARD);
  }

  // ───────────────────────────── daily treat and snack chest ─────────────────────────────

  treatView(): { reward: Bundle; claimed: boolean }[] {
    return TREAT_REWARDS.map((reward, i) => ({ reward, claimed: this.data.day.treat[i] === true }));
  }

  /** Slot `slot` of today's treat, one rewarded ad each. */
  async claimTreat(slot: number): Promise<Result<Bundle>> {
    if (!this.featureUnlocked('treat')) return fail('locked');
    const reward = TREAT_REWARDS[slot];
    if (!reward) return fail('invalid');
    if (this.data.day.treat[slot]) return fail('already_claimed');
    const paid = await this.watchAd(PLACEMENTS.treat);
    if (!paid.ok) return paid;
    if (this.data.day.treat[slot]) return fail('already_claimed');
    this.data.day.treat[slot] = true;
    this.applyBundle(reward, 'treat');
    this.commit();
    return ok(reward);
  }

  snackChestsLeft(): number {
    return Math.max(0, SNACK_CHESTS_PER_DAY - this.data.day.snackChests);
  }

  /** A wooden chest from the result screen for one ad, three a day. */
  async claimSnackChest(): Promise<Result<void>> {
    if (this.snackChestsLeft() <= 0) return fail('limit_reached');
    const paid = await this.watchAd(PLACEMENTS.snackChest);
    if (!paid.ok) return paid;
    if (this.snackChestsLeft() <= 0) return fail('limit_reached');
    this.data.day.snackChests++;
    this.addChest('wooden', 1);
    this.commit();
    return ok(undefined);
  }

  // ───────────────────────────── season pass ─────────────────────────────

  passView(): PassView {
    const d = this.data;
    const tier = passTier(d.pass);
    const rows = (track: PassTrack): PassRow[] => {
      const done = track === 'free' ? d.pass.claimedFree : d.pass.claimedPremium;
      const open = claimableTiers(d.pass, track);
      return Array.from({ length: PASS_TIERS }, (_, i) => ({
        tier: i + 1,
        reward: passReward(track, i + 1),
        reached: i + 1 <= tier,
        claimed: done.includes(i + 1),
        claimable: open.includes(i + 1),
      }));
    };
    return {
      season: d.pass.season,
      xp: d.pass.xp,
      tier,
      xpIntoTier: tier >= PASS_TIERS ? PASS_XP_PER_TIER : d.pass.xp % PASS_XP_PER_TIER,
      xpPerTier: PASS_XP_PER_TIER,
      premium: d.pass.premium,
      daysLeft: seasonDaysLeft(this.today()),
      free: rows('free'),
      premiumRow: rows('premium'),
    };
  }

  claimPass(track: PassTrack, tier: number): Result<Bundle> {
    if (!this.featureUnlocked('pass')) return fail('locked');
    const r = claimPassTier(this.data.pass, track, tier);
    if (!r) {
      if (track === 'premium' && !this.data.pass.premium) return fail('locked');
      return fail(tier > passTier(this.data.pass) ? 'not_ready' : 'already_claimed');
    }
    this.data.pass = r.pass;
    this.applyBundle(r.reward, track === 'free' ? 'pass_free' : 'pass_premium');
    this.commit();
    return ok(r.reward);
  }

  /** Take every open tier of a row. Returns how many tiers were claimed. */
  claimAllPass(track: PassTrack): Result<number> {
    if (!this.featureUnlocked('pass')) return fail('locked');
    const tiers = claimableTiers(this.data.pass, track);
    if (tiers.length === 0) return fail('nothing_to_claim');
    for (const tier of tiers) this.claimPass(track, tier);
    return ok(tiers.length);
  }

  // ───────────────────────────── daily challenge, cup, endless ─────────────────────────────

  dailyView(): DailyView {
    const d = this.data;
    const date = this.today();
    return {
      setup: dailySetup(date),
      unlocked: this.featureUnlocked('daily'),
      clearedToday: d.day.challengeCleared,
      bestToday: d.cup.days[date] ?? 0,
    };
  }

  cupView(): CupView {
    const d = this.data;
    const score = cupScore(d.cup.days, d.cup.week);
    return {
      week: d.cup.week,
      score,
      todayBest: d.cup.days[this.today()] ?? 0,
      tiers: CUP_TIERS.map((t, i) => ({ need: t.min, reward: t.reward, reached: score >= t.min, claimed: d.cup.claimed.includes(i) })),
    };
  }

  claimCup(tier: number): Result<Bundle> {
    if (!this.featureUnlocked('cup')) return fail('locked');
    const row = this.cupView().tiers[tier];
    if (!row) return fail('invalid');
    if (row.claimed) return fail('already_claimed');
    if (!row.reached) return fail('not_ready');
    this.data.cup.claimed.push(tier);
    this.applyBundle(row.reward, 'cup');
    this.commit();
    return ok(row.reward);
  }

  endlessView(): EndlessView {
    const e = this.data.endless;
    return {
      best: e.best,
      weekBest: e.weekBest,
      tiers: ENDLESS_TIERS.map((t, i) => ({ need: t.wave, reward: t.reward, reached: e.weekBest >= t.wave, claimed: e.claimed.includes(i) })),
    };
  }

  claimEndless(tier: number): Result<Bundle> {
    if (!this.featureUnlocked('endless')) return fail('locked');
    const row = this.endlessView().tiers[tier];
    if (!row) return fail('invalid');
    if (row.claimed) return fail('already_claimed');
    if (!row.reached) return fail('not_ready');
    this.data.endless.claimed.push(tier);
    this.applyBundle(row.reward, 'endless');
    this.commit();
    return ok(row.reward);
  }

  // ───────────────────────────── monthly gem pass ─────────────────────────────

  gemPassView(): { active: boolean; until: number; canClaim: boolean; daily: number } {
    const g = this.data.gemPass;
    const active = g.until > this.accrualNow();
    return { active, until: g.until, canClaim: active && !this.frozen && g.lastClaimDate < this.today(), daily: GEM_PASS_DAILY };
  }

  claimGemPass(): Result<number> {
    if (this.frozen) return fail('clock_frozen');
    if (!this.gemPassView().canClaim) return fail('nothing_to_claim');
    this.data.gemPass.lastClaimDate = this.today();
    this.grant('gems', GEM_PASS_DAILY, 'gem_pass');
    this.commit();
    return ok(GEM_PASS_DAILY);
  }
}
