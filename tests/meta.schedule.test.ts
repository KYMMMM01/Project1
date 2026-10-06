import { describe, expect, it } from 'vitest';
import {
  CALENDAR_DAYS, DAILY_MISSIONS, PASS_TIERS, PASS_XP_PER_TIER, WEEKLY_MISSIONS,
} from '@/meta/data/schedule';
import { PATROL_CAP_COMEBACK_MS, PATROL_CAP_MS, PATROL_CAP_PASS_MS, PATROL_MIN_MS } from '@/meta/data/economy';
import { calendarNext, canClaimCalendar, claimCalendar, comebackDue } from '@/meta/calendar';
import {
  advanceMissions, allClaimed, claimMission, claimedPoints, emptyMissions, freshDay, freshWeek, missionComplete,
  rollDay, rollWeek,
} from '@/meta/missions';
import {
  addPassXp, claimPassTier, claimableTiers, freshPass, passTier, rollPass, seasonDaysLeft, seasonOf,
} from '@/meta/pass';
import { patrolCapMs, patrolRate, patrolStatus } from '@/meta/patrol';
import { SessionClock, nextLastSeen } from '@/meta/time';
import { FakeClock, at, createTestProfile, type TestRig } from '@/meta/testing';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const HALF_HOUR = HOUR / 2;

describe('missions across date changes', () => {
  it('counts progress up to the target and pays each mission once', () => {
    let m = emptyMissions(DAILY_MISSIONS);
    m = advanceMissions(m, DAILY_MISSIONS, { runs: 2, merges: 25, wins: 1 });
    expect(m.progress).toEqual([2, 20, 0, 0, 1]);
    expect(missionComplete(m, DAILY_MISSIONS, 0)).toBe(false);
    expect(claimMission(m, DAILY_MISSIONS, 0)).toBeNull();
    m = advanceMissions(m, DAILY_MISSIONS, { runs: 1 });
    const c = claimMission(m, DAILY_MISSIONS, 0);
    expect(c?.points).toBe(30);
    expect(c?.reward).toEqual({ gold: 150 });
    expect(claimMission(c!.state, DAILY_MISSIONS, 0)).toBeNull();
    expect(claimedPoints(c!.state, DAILY_MISSIONS)).toBe(30);
    expect(allClaimed(c!.state)).toBe(false);
  });

  it('resets the day at the first later date and never on an earlier or equal one', () => {
    let day = freshDay('2026-10-06');
    day = { ...day, missions: advanceMissions(day.missions, DAILY_MISSIONS, { runs: 3 }), chestClaimed: true, snackChests: 2 };
    expect(rollDay(day, '2026-10-06')).toBe(day);
    expect(rollDay(day, '2026-10-05')).toBe(day);
    const next = rollDay(day, '2026-10-07');
    expect(next.date).toBe('2026-10-07');
    expect(next.missions.progress.every((n) => n === 0)).toBe(true);
    expect(next.chestClaimed).toBe(false);
    expect(next.snackChests).toBe(0);
    expect(rollDay(day, '2026-11-20').date).toBe('2026-11-20');
  });

  it('resets the week on Monday only', () => {
    const w = freshWeek('2026-10-05');
    const busy = { ...w, missions: advanceMissions(w.missions, WEEKLY_MISSIONS, { runs: 5 }) };
    expect(rollWeek(busy, '2026-10-05')).toBe(busy);
    expect(rollWeek(busy, '2026-09-28')).toBe(busy);
    expect(rollWeek(busy, '2026-10-12').missions.progress).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('calendar', () => {
  it('moves one box per date you show up on, and a missed day costs nothing', () => {
    let cal = { stamp: 0, lastDate: '', cycles: 0 };
    const days: number[] = [];
    for (const date of ['2026-10-06', '2026-10-07', '2026-10-12', '2026-10-30', '2026-11-20']) {
      const r = claimCalendar(cal, date);
      expect(r).not.toBeNull();
      days.push(r!.day);
      cal = r!.cal;
    }
    expect(days).toEqual([1, 2, 3, 4, 5]);
    expect(canClaimCalendar(cal, '2026-11-20')).toBe(false);
    expect(claimCalendar(cal, '2026-11-20')).toBeNull();
    expect(claimCalendar(cal, '2026-11-19')).toBeNull();
  });

  it('pays the gold chests of days 7/14/21 and the rug on day 28, then starts over', () => {
    let cal = { stamp: 0, lastDate: '', cycles: 0 };
    const rewards: Record<number, unknown> = {};
    for (let i = 0; i < CALENDAR_DAYS; i++) {
      const r = claimCalendar(cal, `2027-01-${String(i + 1).padStart(2, '0')}`)!;
      rewards[r.day] = r.reward;
      cal = r.cal;
    }
    for (const d of [7, 14, 21]) expect(rewards[d]).toEqual({ chests: { gold: 1 } });
    expect(rewards[28]).toMatchObject({ cosmetics: ['rug_calendar'] });
    expect(cal).toMatchObject({ stamp: 0, cycles: 1 });
    expect(calendarNext(cal)).toBe(1);
  });

  it('calls a return after 3 or more dates away a comeback', () => {
    expect(comebackDue('2026-10-06', '2026-10-08')).toBe(false);
    expect(comebackDue('2026-10-06', '2026-10-09')).toBe(true);
    expect(comebackDue('', '2026-10-09')).toBe(false);
  });
});

describe('season pass', () => {
  it('numbers 30-day seasons from the epoch and wipes progress on a new one', () => {
    expect(seasonOf('2026-09-01')).toBe(0);
    expect(seasonOf('2026-10-01')).toBe(0);
    expect(seasonOf('2026-10-30')).toBe(0);
    expect(seasonOf('2026-10-31')).toBe(1);
    expect(seasonDaysLeft('2026-10-30')).toBe(1);
    const p = { ...addPassXp(freshPass(0), 450), premium: true, claimedFree: [1] };
    expect(rollPass(p, '2026-10-30')).toBe(p);
    expect(rollPass(p, '2026-09-20')).toBe(p);
    expect(rollPass(p, '2026-10-31')).toEqual(freshPass(1));
  });

  it('opens a tier per 100 XP, caps at 30 and opens the premium row retroactively', () => {
    let p = addPassXp(freshPass(0), 3 * PASS_XP_PER_TIER + 40);
    expect(passTier(p)).toBe(3);
    expect(claimableTiers(p, 'free')).toEqual([1, 2, 3]);
    expect(claimableTiers(p, 'premium')).toEqual([]);
    expect(claimPassTier(p, 'premium', 1)).toBeNull();
    p = { ...p, premium: true };
    expect(claimableTiers(p, 'premium')).toEqual([1, 2, 3]);
    const c = claimPassTier(p, 'free', 2)!;
    expect(claimPassTier(c.pass, 'free', 2)).toBeNull();
    expect(claimableTiers(c.pass, 'free')).toEqual([1, 3]);
    expect(claimPassTier(p, 'free', 4)).toBeNull();
    expect(passTier(addPassXp(p, 10 ** 9))).toBe(PASS_TIERS);
  });
});

describe('patrol', () => {
  it('counts up to 8 hours, 12 with the pass, 24 once after a comeback', () => {
    expect(patrolCapMs(false, false)).toBe(PATROL_CAP_MS);
    expect(patrolCapMs(true, false)).toBe(PATROL_CAP_PASS_MS);
    expect(patrolCapMs(false, true)).toBe(PATROL_CAP_COMEBACK_MS);
    expect(patrolCapMs(true, true)).toBe(PATROL_CAP_COMEBACK_MS);
    const rate = 60;
    const s8 = patrolStatus(0, 20 * HOUR, PATROL_CAP_MS, rate);
    expect(s8).toMatchObject({ ms: 8 * HOUR, gold: 480, full: true, collectable: true });
    expect(patrolStatus(0, 20 * HOUR, PATROL_CAP_PASS_MS, rate).gold).toBe(720);
    expect(patrolStatus(0, 60 * HOUR, PATROL_CAP_COMEBACK_MS, rate).gold).toBe(1440);
  });

  it('needs 10 minutes before it can be collected and never counts backwards time', () => {
    expect(patrolStatus(0, PATROL_MIN_MS - 1, PATROL_CAP_MS, 60).collectable).toBe(false);
    expect(patrolStatus(0, PATROL_MIN_MS, PATROL_CAP_MS, 60).collectable).toBe(true);
    expect(patrolStatus(10 * HOUR, 2 * HOUR, PATROL_CAP_MS, 60)).toMatchObject({ ms: 0, gold: 0, collectable: false });
  });

  it('pays more as chapters are cleared', () => {
    expect(patrolRate(0)).toBeLessThan(patrolRate(2));
    expect(patrolRate(5)).toBe(patrolRate(4));
  });
});

describe('the clock guard', () => {
  it('freezes the session when the wall clock is earlier than the last seen time', () => {
    const clock = new FakeClock(at(2026, 10, 6));
    expect(new SessionClock(clock, at(2026, 10, 6) - HALF_HOUR).frozen).toBe(false);
    expect(new SessionClock(clock, at(2026, 10, 6) + 5 * 60_000 - 1).frozen).toBe(false);
    expect(new SessionClock(clock, at(2026, 10, 6) + 5 * 60_000 + 1).frozen).toBe(true);
    expect(new SessionClock(clock, at(2026, 10, 9)).frozen).toBe(true);
  });

  it('freezes on a jump during the session in either direction and keeps following real elapsed time', () => {
    for (const jump of [-2 * DAY, +2 * DAY]) {
      const clock = new FakeClock(at(2026, 10, 6));
      const sc = new SessionClock(clock, 0);
      clock.advance(HOUR);
      expect(sc.frozen).toBe(false);
      clock.setWall(clock.wall() + jump);
      expect(sc.frozen).toBe(true);
      expect(sc.now()).toBe(at(2026, 10, 6) + HOUR);
    }
  });

  it('ignores small drift', () => {
    const clock = new FakeClock(at(2026, 10, 6));
    const sc = new SessionClock(clock, 0);
    clock.advance(HOUR);
    clock.setWall(clock.wall() + 3 * 60_000);
    expect(sc.frozen).toBe(false);
  });

  it('never lets lastSeenAt go down or follow a frozen clock', () => {
    expect(nextLastSeen(100, 50, false)).toBe(100);
    expect(nextLastSeen(100, 150, false)).toBe(150);
    expect(nextLastSeen(100, 150, true)).toBe(100);
  });
});

async function rigWithRuns(): Promise<TestRig> {
  const rig = await createTestProfile();
  rig.profile.data.stats.runs = 3;
  rig.profile.refresh();
  return rig;
}

describe('rollovers in the profile', () => {
  it('resets dailies and the shop on a new date, weeklies on Monday, and grants 3 tickets a day up to the stock of 6', async () => {
    const { profile, clock } = await rigWithRuns();
    const d = profile.data;
    expect(d.day.date).toBe('2026-10-06');
    expect(d.tickets).toBe(3);
    d.day.snackChests = 2;
    d.day.treat[0] = true;
    d.day.missions.progress[0] = 2;
    d.week.missions.progress[0] = 7;
    d.shop.bought[1] = true;
    clock.advance(DAY);
    profile.refresh();
    expect(d.day.date).toBe('2026-10-07');
    expect(d.day).toMatchObject({ snackChests: 0, treat: [false, false, false] });
    expect(d.day.missions.progress[0]).toBe(0);
    expect(d.week.missions.progress[0]).toBe(7);
    expect(d.shop.bought).toEqual([false, false, false, false, false, false]);
    expect(d.tickets).toBe(6);
    clock.advance(DAY);
    profile.refresh();
    expect(d.tickets).toBe(6);
    clock.advance(5 * DAY);
    profile.refresh();
    expect(d.week.week).toBe('2026-10-12');
    expect(d.week.missions.progress[0]).toBe(0);
  });

  it('gives a Butler Pass owner 3 more tickets a day and a stock of 12', async () => {
    const { profile, clock } = await rigWithRuns();
    await profile.grantOrder('butler_pass', 'o1');
    clock.advance(DAY);
    profile.refresh();
    expect(profile.data.tickets).toBe(9);
    clock.advance(DAY);
    profile.refresh();
    expect(profile.data.tickets).toBe(12);
  });

  it('opens the calendar one box at a time and offers a comeback after 3 days away', async () => {
    const { profile, clock } = await rigWithRuns();
    expect(profile.claimCalendar()).toMatchObject({ ok: true, value: { day: 1 } });
    expect(profile.claimCalendar()).toEqual({ ok: false, error: 'already_claimed' });
    expect(profile.data.gold).toBe(300);
    clock.advance(2 * DAY);
    profile.refresh();
    expect(profile.calendarView().comebackReady).toBe(false);
    expect(profile.claimCalendar()).toMatchObject({ ok: true, value: { day: 2 } });
    clock.advance(4 * DAY);
    profile.refresh();
    expect(profile.calendarView().comebackReady).toBe(true);
    expect(profile.claimCalendar()).toMatchObject({ ok: true, value: { day: 3 } });
    expect(profile.claimComeback().ok).toBe(true);
    expect(profile.data.chests.silver).toBe(1);
    expect(profile.claimComeback()).toEqual({ ok: false, error: 'nothing_to_claim' });
  });

  it('lets the comeback patrol run 24 hours once, then back to 8', async () => {
    const { profile, clock } = await rigWithRuns();
    clock.advance(5 * DAY);
    profile.refresh();
    clock.advance(30 * HOUR);
    profile.refresh();
    const v = profile.patrolView();
    expect(v.comebackBoost).toBe(true);
    expect(v.ms).toBe(PATROL_CAP_COMEBACK_MS);
    const gold = await profile.claimPatrol(false);
    expect(gold).toEqual({ ok: true, value: Math.floor((24 * v.rate)) });
    clock.advance(30 * HOUR);
    profile.refresh();
    expect(profile.patrolView()).toMatchObject({ ms: PATROL_CAP_MS, comebackBoost: false });
  });
});

describe('time-based rewards and the free chest', () => {
  it('collects patrol after 10 minutes, caps at 8 hours and 12 with the pass, and doubles for an ad three times a day', async () => {
    const { profile, clock, ads } = await rigWithRuns();
    clock.advance(9 * 60_000);
    expect(await profile.claimPatrol(false)).toEqual({ ok: false, error: 'not_ready' });
    clock.advance(20 * HOUR);
    const rate = profile.patrolView().rate;
    expect(profile.patrolView().ms).toBe(PATROL_CAP_MS);
    const r = await profile.claimPatrol(true);
    expect(r).toEqual({ ok: true, value: 2 * 8 * rate });
    expect(ads.shown).toEqual(['patrol_double']);
    for (let i = 0; i < 2; i++) {
      clock.advance(9 * HOUR);
      expect((await profile.claimPatrol(true)).ok).toBe(true);
    }
    clock.advance(9 * HOUR);
    expect(await profile.claimPatrol(true)).toEqual({ ok: false, error: 'limit_reached' });
    expect((await profile.claimPatrol(false)).ok).toBe(true);
    await profile.grantOrder('butler_pass', 'bp');
    clock.advance(30 * HOUR);
    expect(profile.patrolView().ms).toBe(PATROL_CAP_PASS_MS);
  });

  it('pays nothing when the double-ad is not finished', async () => {
    const { profile, clock, ads } = await rigWithRuns();
    clock.advance(2 * HOUR);
    ads.outcome = 'dismissed';
    const gold = profile.data.gold;
    expect(await profile.claimPatrol(true)).toEqual({ ok: false, error: 'ad_failed' });
    expect(profile.data.gold).toBe(gold);
    expect(profile.patrolView().ms).toBe(2 * HOUR);
  });

  it('gives a wooden chest every 4 hours; the wait can be skipped for gems, or an ad four times a day', async () => {
    const { profile, clock, ads } = await rigWithRuns();
    expect(profile.claimFreeChest().ok).toBe(true);
    expect(profile.claimFreeChest()).toEqual({ ok: false, error: 'not_ready' });
    clock.advance(4 * HOUR - 1);
    expect(profile.freeChestView().ready).toBe(false);
    clock.advance(1);
    expect(profile.freeChestView().ready).toBe(true);
    expect(profile.claimFreeChest().ok).toBe(true);
    expect(profile.data.chests.wooden).toBe(2);

    expect(await profile.skipFreeChest('gems')).toEqual({ ok: false, error: 'not_enough_gems' });
    profile.grant('gems', 20, 'iap');
    expect((await profile.skipFreeChest('gems')).ok).toBe(true);
    expect(profile.data.gems).toBe(0);
    for (let i = 0; i < 4; i++) expect((await profile.skipFreeChest('ad')).ok).toBe(true);
    expect(ads.shown).toEqual(['free_chest', 'free_chest', 'free_chest', 'free_chest']);
    expect(await profile.skipFreeChest('ad')).toEqual({ ok: false, error: 'limit_reached' });
    expect(profile.data.chests.wooden).toBe(7);
  });
});

describe('moving the clock earns nothing', () => {
  it('after a restart with the clock set back: no calendar, patrol, free chest or reset', async () => {
    const a = await rigWithRuns();
    a.profile.claimCalendar();
    a.profile.claimFreeChest();
    a.clock.advance(3 * DAY);
    a.profile.refresh();
    a.profile.data.day.missions.progress[0] = 2;
    const seen = a.profile.data.time.lastSeenAt;
    await a.profile.flush();

    const b = await createTestProfile({ keepStorage: true, start: at(2026, 10, 7) });
    expect(b.profile.frozen).toBe(true);
    expect(b.profile.data.time.lastSeenAt).toBe(seen);
    expect(b.profile.data.day.missions.progress[0]).toBe(2);
    expect(b.profile.calendarView().canClaim).toBe(false);
    expect(b.profile.claimCalendar()).toEqual({ ok: false, error: 'clock_frozen' });
    expect(b.profile.claimFreeChest()).toEqual({ ok: false, error: 'clock_frozen' });
    expect(await b.profile.claimPatrol(false)).toEqual({ ok: false, error: 'clock_frozen' });
    expect(await b.profile.skipFreeChest('gems')).toEqual({ ok: false, error: 'clock_frozen' });
    b.clock.advance(10 * HOUR);
    b.profile.refresh();
    expect(b.profile.data.time.lastSeenAt).toBe(seen);
    expect(b.profile.data.day.date).toBe('2026-10-09');
    expect(b.profile.patrolView().ms).toBeLessThanOrEqual(seen - b.profile.data.patrol.since);

    const c = await createTestProfile({ keepStorage: true, start: seen + HOUR });
    expect(c.profile.frozen).toBe(false);
    expect(c.profile.calendarView().canClaim).toBe(true);
  });

  it('after a jump forward during the session: frozen, nothing forged into lastSeenAt', async () => {
    const { profile, clock } = await rigWithRuns();
    clock.advance(HOUR);
    profile.refresh();
    const seen = profile.data.time.lastSeenAt;
    const day = profile.data.day.date;
    clock.setWall(clock.wall() + 20 * DAY);
    profile.refresh();
    expect(profile.frozen).toBe(true);
    expect(profile.data.time.lastSeenAt).toBe(seen);
    expect(profile.data.day.date).toBe(day);
    expect(profile.patrolView().ms).toBeLessThanOrEqual(2 * HOUR);
    expect(profile.claimCalendar()).toEqual({ ok: false, error: 'clock_frozen' });
    clock.setWall(clock.wall() - 20 * DAY + 10);
    expect(profile.frozen).toBe(true);
  });

  it('resume() after a long sleep is not mistaken for tampering', async () => {
    const { profile, clock } = await rigWithRuns();
    clock.setWall(clock.wall() + 3 * HOUR);
    profile.resume();
    expect(profile.frozen).toBe(false);
    expect(profile.patrolView().ms).toBe(3 * HOUR);
  });

  it('a rolled-back date does not give back the daily limits', async () => {
    const { profile, clock, ads } = await rigWithRuns();
    for (let i = 0; i < 3; i++) await profile.claimSnackChest();
    expect(await profile.claimSnackChest()).toEqual({ ok: false, error: 'limit_reached' });
    clock.setWall(clock.wall() - 2 * DAY);
    profile.refresh();
    expect(await profile.claimSnackChest()).toEqual({ ok: false, error: 'limit_reached' });
    expect(ads.shown).toHaveLength(3);
  });
});

describe('missions, treat, shop, tickets in the profile', () => {
  it('claims missions, opens the day chest at 100 points and the weekly chest after all five', async () => {
    const { profile } = await rigWithRuns();
    const d = profile.data;
    d.day.missions.progress = DAILY_MISSIONS.map((m) => m.target);
    d.week.missions.progress = WEEKLY_MISSIONS.map((m) => m.target);
    expect(profile.claimDailyChest()).toEqual({ ok: false, error: 'not_ready' });
    for (let i = 0; i < 5; i++) expect(profile.claimMission('daily', i).ok).toBe(true);
    expect(profile.claimMission('daily', 0)).toEqual({ ok: false, error: 'already_claimed' });
    expect(d.gold).toBe(5 * 150);
    expect(profile.dailyChestView()).toMatchObject({ points: 100, ready: true });
    expect(profile.claimDailyChest().ok).toBe(true);
    expect(profile.claimDailyChest()).toEqual({ ok: false, error: 'already_claimed' });
    expect(d.chests.silver).toBe(1);
    expect(d.gems).toBe(20);
    expect(d.week.missions.progress[4]).toBe(WEEKLY_MISSIONS[4]!.target);
    expect(profile.weeklyChestReady()).toBe(false);
    for (let i = 0; i < 5; i++) profile.claimMission('weekly', i);
    expect(profile.claimWeeklyChest().ok).toBe(true);
    expect(d.chests.gold).toBe(1);
    expect(profile.claimWeeklyChest()).toEqual({ ok: false, error: 'already_claimed' });
  });

  it('serves the three daily treats once each, only when the ad completes', async () => {
    const { profile, ads } = await rigWithRuns();
    ads.outcome = 'dismissed';
    expect(await profile.claimTreat(0)).toEqual({ ok: false, error: 'ad_failed' });
    ads.outcome = 'rewarded';
    expect((await profile.claimTreat(0)).ok).toBe(true);
    expect((await profile.claimTreat(1)).ok).toBe(true);
    expect((await profile.claimTreat(2)).ok).toBe(true);
    expect(await profile.claimTreat(1)).toEqual({ ok: false, error: 'already_claimed' });
    expect(await profile.claimTreat(3)).toEqual({ ok: false, error: 'invalid' });
    expect(profile.data).toMatchObject({ gems: 8, gold: 300 });
    expect(profile.data.wild.rare).toBe(1);
    expect(ads.shown).toEqual(['daily_treat', 'daily_treat', 'daily_treat', 'daily_treat']);
  });

  it('keeps locked features locked until their run count', async () => {
    const rig = await createTestProfile();
    expect(await rig.profile.claimTreat(0)).toEqual({ ok: false, error: 'locked' });
    expect(rig.profile.buyShop(0)).toEqual({ ok: false, error: 'locked' });
    expect(rig.profile.claimMission('daily', 0)).toEqual({ ok: false, error: 'locked' });
    expect(rig.profile.sweep(1, 0)).toEqual({ ok: false, error: 'locked' });
  });

  it('sells the daily shop for gold and gems once per slot and refreshes it for an ad twice a day', async () => {
    const { profile, clock, ads } = await rigWithRuns();
    const view = profile.shopView();
    expect(view.offers).toHaveLength(6);
    expect(profile.buyShop(0)).toMatchObject({ ok: true });
    expect(profile.buyShop(0)).toEqual({ ok: false, error: 'already_claimed' });
    profile.data.gold = 0;
    expect(profile.buyShop(1)).toEqual({ ok: false, error: 'not_enough_gold' });
    profile.grant('gold', 10_000, 'iap');
    profile.grant('gems', 200, 'iap');
    for (const slot of [1, 2, 3, 4, 5]) expect(profile.buyShop(slot).ok).toBe(true);
    expect(profile.buyShop(9)).toEqual({ ok: false, error: 'invalid' });

    const before = profile.shopView().offers;
    ads.outcome = 'dismissed';
    expect((await profile.refreshShop()).ok).toBe(false);
    expect(profile.shopView().offers).toEqual(before);
    ads.outcome = 'rewarded';
    expect((await profile.refreshShop()).ok).toBe(true);
    expect(profile.shopView().offers).not.toEqual(before);
    expect(profile.shopView().bought.some(Boolean)).toBe(false);
    expect((await profile.refreshShop()).ok).toBe(true);
    expect(await profile.refreshShop()).toEqual({ ok: false, error: 'limit_reached' });
    clock.advance(DAY);
    profile.refresh();
    expect(profile.shopView().refreshesLeft).toBe(2);
  });

  it('sweeps cleared stages with tickets: 3 a day, stock 6, +2 per ad twice a day, 30 gems each', async () => {
    const { profile, ads } = await rigWithRuns();
    const d = profile.data;
    expect(profile.sweep(1, 0)).toEqual({ ok: false, error: 'locked' });
    d.cleared = [2, 0, 0, 0, 0];
    profile.refresh();
    expect(profile.sweep(1, 2)).toEqual({ ok: false, error: 'not_cleared' });
    expect(profile.sweep(2, 0)).toEqual({ ok: false, error: 'not_cleared' });
    const r = profile.sweep(1, 1);
    expect(r).toEqual({ ok: true, value: { gold: Math.floor(Math.round(376 * 1.15 * 1.25) * 0.6), xp: 34 } });
    expect(d.tickets).toBe(2);
    expect(d.stats.sweeps).toBe(1);
    expect(d.day.missions.progress.every((n) => n === 0)).toBe(true);

    expect((await profile.watchTicketAd()).ok).toBe(true);
    expect(d.tickets).toBe(4);
    expect((await profile.watchTicketAd()).ok).toBe(true);
    expect(d.tickets).toBe(6);
    expect(await profile.watchTicketAd()).toEqual({ ok: false, error: 'limit_reached' });
    expect(ads.shown).toEqual(['sweep_ticket', 'sweep_ticket']);
    expect(profile.buyTicket()).toEqual({ ok: false, error: 'not_enough_gems' });
    profile.grant('gems', 30, 'iap');
    expect(profile.buyTicket()).toEqual({ ok: true, value: 7 });
    d.tickets = 0;
    expect(profile.sweep(1, 0)).toEqual({ ok: false, error: 'not_enough_tickets' });
  });

  it('tiers: the weekly cup and the endless record pay once per tier', async () => {
    const { profile } = await rigWithRuns();
    const d = profile.data;
    d.cleared = [1, 1, 0, 0, 0];
    profile.refresh();
    expect(profile.claimCup(0)).toEqual({ ok: false, error: 'not_ready' });
    const week = d.cup.week;
    d.cup.days = { [week]: 15, '2026-10-06': 20, '2026-10-08': 18 };
    expect(profile.cupView().score).toBe(53);
    expect(profile.claimCup(0).ok).toBe(true);
    expect(profile.claimCup(0)).toEqual({ ok: false, error: 'already_claimed' });
    expect(profile.claimCup(1)).toEqual({ ok: false, error: 'not_ready' });
    d.cup.days['2026-10-09'] = 20;
    d.cup.days['2026-10-10'] = 20;
    expect(profile.claimCup(1).ok).toBe(true);
    expect(profile.claimCup(2)).toEqual({ ok: false, error: 'not_ready' });
    expect(d.chests).toMatchObject({ wooden: 1, silver: 1 });

    d.endless.weekBest = 61;
    expect(profile.claimEndless(0).ok).toBe(true);
    expect(profile.claimEndless(1).ok).toBe(true);
    expect(profile.claimEndless(2)).toEqual({ ok: false, error: 'not_ready' });
    expect(d.chests.gold).toBe(2);
    expect(d.gems).toBe(30);
  });

  it('walks the season pass: free tiers from XP, premium after purchase, a new season starts clean', async () => {
    const { profile, clock } = await rigWithRuns();
    const d = profile.data;
    d.accountXp = 10_000;
    profile.refresh();
    d.pass.xp = 5 * PASS_XP_PER_TIER;
    expect(profile.claimPass('premium', 1)).toEqual({ ok: false, error: 'locked' });
    expect(profile.claimAllPass('free')).toEqual({ ok: true, value: 5 });
    expect(d.gems).toBeGreaterThanOrEqual(25);
    expect(profile.claimPass('free', 1)).toEqual({ ok: false, error: 'already_claimed' });
    expect(profile.claimPass('free', 6)).toEqual({ ok: false, error: 'not_ready' });
    await profile.grantOrder('season_pass', 'sp1');
    const before = d.gems;
    expect(profile.claimAllPass('premium')).toEqual({ ok: true, value: 5 });
    expect(d.gems - before).toBe(5 * 40 + 0);
    expect(d.chests.silver).toBe(1);
    expect(profile.passView()).toMatchObject({ tier: 5, premium: true, season: 0 });
    clock.advance(30 * DAY);
    profile.refresh();
    expect(profile.passView()).toMatchObject({ tier: 0, premium: false, season: 1 });
  });

  it('keeps the gem pass: 200 at once, 30 a day for 30 days, one claim per date', async () => {
    const { profile, clock } = await rigWithRuns();
    expect(profile.claimGemPass()).toEqual({ ok: false, error: 'nothing_to_claim' });
    await profile.grantOrder('gem_pass', 'g1');
    expect(profile.data.gems).toBe(200);
    expect(profile.claimGemPass()).toEqual({ ok: true, value: 30 });
    expect(profile.claimGemPass()).toEqual({ ok: false, error: 'nothing_to_claim' });
    clock.advance(DAY);
    profile.refresh();
    expect(profile.claimGemPass().ok).toBe(true);
    clock.advance(31 * DAY);
    profile.refresh();
    expect(profile.gemPassView().active).toBe(false);
    expect(profile.claimGemPass()).toEqual({ ok: false, error: 'nothing_to_claim' });
    await profile.grantOrder('gem_pass', 'g2');
    expect(profile.gemPassView().active).toBe(true);
  });
});
