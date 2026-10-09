import { describe, expect, it, vi } from 'vitest';
import '@/screens/missions/strings';
import '@/screens/pass/strings';
import { fmtDuration } from '@/core/format';
import { at, createTestProfile, type TestRig } from '@/meta/testing';
import { CLAIM_ALL_MIN, claimAllReading, missionBadges, tierFill, tierMarks, waitingMissions, waitingTiers, weekDays } from '@/screens/missions/model';
import { tn } from '@/meta/plural';
import { getLang, setLang, t } from '@/core/i18n';
import {
  focusTier, passBadgeCount, passClaimable, PASS_ROW_GAP, PASS_ROW_H, retroactiveCount, scrollTargetFor, seasonEndWarning, seasonNameKey, xpFill,
} from '@/screens/pass/model';
import { calendarCellState, calendarPage, isBigDay } from '@/screens/system/calendarModel';
import { pictureOfPart } from '@/screens/partPicture';
import { currencyOnly, currencyTotals, flightCount, partsOf, stickerTilt } from '@/screens/system/kit/parts';
import { countdownText, daysUntil, msUntilNextMidnight, msUntilNextMonday } from '@/screens/system/kit/time';
import { qualityPatch, savedAtText } from '@/screens/system/settingsModel';

const HOUR = 3_600_000;
const MIN = 60_000;

/** A profile that has played enough for missions, the pass and the cup to be open. */
async function advanced(): Promise<TestRig> {
  const rig = await createTestProfile({ start: at(2026, 10, 7, 9) });
  const d = rig.profile.data;
  d.stats.runs = 5;
  d.accountXp = 100_000;
  d.cleared = d.cleared.map(() => 2);
  rig.profile.refresh();
  return rig;
}

describe('reset countdowns', () => {
  it('counts to the next local midnight', () => {
    expect(msUntilNextMidnight(at(2026, 10, 6, 23, 30))).toBe(30 * MIN);
    expect(msUntilNextMidnight(at(2026, 10, 6, 0, 0))).toBe(24 * HOUR);
    expect(msUntilNextMidnight(at(2026, 12, 31, 18, 0))).toBe(6 * HOUR);
  });

  it('counts to the next Monday 00:00 (weeks start on Monday)', () => {
    // 2026-10-05 is a Monday.
    expect(msUntilNextMonday(at(2026, 10, 5, 0, 0))).toBe(7 * 24 * HOUR);
    expect(msUntilNextMonday(at(2026, 10, 6, 12, 0))).toBe(5 * 24 * HOUR + 12 * HOUR);
    expect(msUntilNextMonday(at(2026, 10, 11, 23, 0))).toBe(HOUR);
  });

  it('rounds the label up so it never shows zero before the reset', () => {
    expect(countdownText(0)).toBe(fmtDuration(0));
    expect(countdownText(1)).toBe(fmtDuration(1));
    expect(countdownText(3 * HOUR + 2 * MIN + 5000)).toBe('3:02:05');
    expect(countdownText(-50)).toBe(fmtDuration(0));
  });

  it('counts whole days left on a timed pass', () => {
    const now = at(2026, 10, 6, 12);
    expect(daysUntil(now + 3 * 24 * HOUR - 1, now)).toBe(3);
    expect(daysUntil(now + 1, now)).toBe(1);
    expect(daysUntil(now, now)).toBe(0);
    expect(daysUntil(now - HOUR, now)).toBe(0);
  });
});

describe('reward parts', () => {
  it('tells plain currencies from rewards that need the popup', () => {
    expect(currencyOnly(partsOf({ gold: 150 }))).toBe(true);
    expect(currencyOnly(partsOf({ gold: 150, gems: 20 }))).toBe(true);
    expect(currencyOnly(partsOf({ chests: { silver: 1 }, gems: 20 }))).toBe(false);
    expect(currencyOnly([])).toBe(false);
    expect(currencyTotals(partsOf({ gold: 150, gems: 20, chests: { wooden: 1 } }))).toEqual({ gold: 150, gems: 20, tickets: 0 });
  });

  it('maps every currency and chest part to a kit picture and leaves cats and cosmetics to their own drawings', () => {
    expect(pictureOfPart({ kind: 'gold', n: 1 })).toBe('gold');
    expect(pictureOfPart({ kind: 'tickets', n: 2 })).toBe('tickets');
    expect(pictureOfPart({ kind: 'chest', chest: 'wooden', n: 1 })).toBe('chest_wooden');
    expect(pictureOfPart({ kind: 'chest', chest: 'gold', n: 1 })).toBe('chest_gold');
    expect(pictureOfPart({ kind: 'wild', rarity: 'epic', n: 2 })).toBe('wild');
    expect(pictureOfPart({ kind: 'cosmetic', id: 'x', n: 1 })).toBeNull();
  });

  it('flies a few icons for small sums and never more than a dozen', () => {
    expect(flightCount(0)).toBe(0);
    expect(flightCount(1)).toBe(3);
    expect(flightCount(150)).toBe(12);
    expect(flightCount(1_000_000)).toBe(12);
  });
});

describe('missions model', () => {
  it('counts claimable things per sub-tab and is zero while locked', async () => {
    const fresh = await createTestProfile();
    expect(missionBadges(fresh.profile)).toEqual({ daily: 0, weekly: 0, total: 0 });

    const { profile } = await advanced();
    expect(missionBadges(profile).total).toBe(0);
    profile.data.day.missions.progress = [3, 20, 0, 0, 1];
    expect(missionBadges(profile)).toMatchObject({ daily: 3, weekly: 0 });
    expect(profile.claimMission('daily', 0).ok).toBe(true);
    expect(missionBadges(profile).daily).toBe(2);
    profile.data.week.missions.progress = [21, 0, 0, 0, 0];
    profile.data.cup.days = { '2026-10-07': 90 };
    profile.data.endless.weekBest = 61;
    // one weekly mission + cup tiers 40 and 85 + endless tiers 40 and 60
    expect(missionBadges(profile).weekly).toBe(1 + 2 + 2);
  });

  it('counts the daily chest once the points are in, and the weekly chest once every weekly mission is claimed', async () => {
    const { profile } = await advanced();
    profile.data.day.missions.progress = [3, 20, 4, 5, 1];
    for (let i = 0; i < 5; i++) expect(profile.claimMission('daily', i).ok).toBe(true);
    expect(profile.dailyChestView().ready).toBe(true);
    expect(missionBadges(profile).daily).toBe(1);
    profile.data.week.missions.progress = [21, 300, 35, 15, 5];
    for (let i = 0; i < 5; i++) profile.claimMission('weekly', i);
    expect(missionBadges(profile).weekly).toBe(1);
    expect(profile.claimWeeklyChest().ok).toBe(true);
    expect(missionBadges(profile).weekly).toBe(0);
  });

  it('opens "claim all" from two waiting rewards, and counts what waits in a list or a tier card', async () => {
    expect(CLAIM_ALL_MIN).toBe(2);
    expect([0, 1, 2, 5].map((n) => claimAllReading(n).enabled)).toEqual([false, false, true, true]);
    expect([0, 1, 2].map((n) => claimAllReading(n).noteKey)).toEqual(['rt.mis.all.none', 'rt.mis.all.count', 'rt.mis.all.count']);
    const { profile } = await advanced();
    profile.data.day.missions.progress = [3, 20, 0, 0, 1];
    expect(waitingMissions(profile.missionsView('daily'))).toBe(3);
    expect(profile.claimMission('daily', 0).ok).toBe(true);
    expect(waitingMissions(profile.missionsView('daily'))).toBe(2);
    expect(waitingMissions(profile.missionsView('weekly'))).toBe(0);
    profile.data.cup.days = { '2026-10-07': 90 };
    profile.data.endless.weekBest = 61;
    expect(waitingTiers(profile.cupView().tiers)).toBe(2);
    expect(waitingTiers(profile.endlessView().tiers)).toBe(2);
    expect(profile.claimCup(0).ok).toBe(true);
    expect(waitingTiers(profile.cupView().tiers)).toBe(1);
    // The button and the badge stay in step with the tab badges: what the count says is what a claim-all would take.
    const daily = waitingMissions(profile.missionsView('daily'));
    const taken = profile.claimAllMissions('daily');
    expect(taken.ok && taken.value.count).toBe(daily);
    expect(waitingMissions(profile.missionsView('daily'))).toBe(0);
  });

  it('writes the note beside the button in both languages, with the English singular', () => {
    const lang = getLang();
    vi.stubGlobal('document', { documentElement: { lang: '' } });
    try {
      setLang('ko');
      expect(t('rt.mis.all')).toBe('모두 받기');
      expect(tn('rt.mis.all.count', 3)).toBe('받을 보상 3개');
      expect(t('rt.mis.all.none')).toBe('받을 보상이 없어요');
      setLang('en');
      expect(t('rt.mis.all')).toBe('Claim all');
      expect(tn('rt.mis.all.count', 1)).toBe('1 reward waiting');
      expect(tn('rt.mis.all.count', 4)).toBe('4 rewards waiting');
      expect(t('rt.mis.all.few', { n: CLAIM_ALL_MIN })).toBe('Claim all works once 2 or more rewards are waiting.');
    } finally {
      setLang(lang);
      vi.unstubAllGlobals();
    }
  });

  it('clamps the tier fill and places the tier marks along the bar', () => {
    expect(tierFill(30, 40)).toBe(0.75);
    expect(tierFill(99, 40)).toBe(1);
    expect(tierFill(-3, 40)).toBe(0);
    expect(tierFill(5, 0)).toBe(0);
    expect(tierMarks([40, 85, 125])).toEqual([40 / 125, 85 / 125, 1]);
  });
});

describe('cup week', () => {
  it('lists the seven days from Monday with the best wave of each', () => {
    const days = weekDays('2026-10-05', { '2026-10-05': 31, '2026-10-07': 44, '2026-09-30': 99 }, '2026-10-07');
    expect(days.map((d) => d.key)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
    expect(days.map((d) => d.best)).toEqual([31, 0, 44, 0, 0, 0, 0]);
    expect(days.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
    expect(days.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
  });

  it('crosses a month boundary', () => {
    const days = weekDays('2026-10-26', {}, '2026-10-26');
    expect(days[6]?.key).toBe('2026-11-01');
    expect(days.filter((d) => d.future)).toHaveLength(6);
  });
});

describe('pass model', () => {
  it('counts claimable cells in both rows', async () => {
    const { profile } = await advanced();
    profile.data.pass.xp = 250;
    expect(passClaimable(profile.passView())).toBe(2);
    expect(passBadgeCount(profile)).toBe(2);
    await profile.grantOrder('season_pass', 'sp-1');
    expect(passBadgeCount(profile)).toBe(4);
    expect(profile.claimPass('free', 1).ok).toBe(true);
    expect(passBadgeCount(profile)).toBe(3);
  });

  it('shows no badge while the pass is locked', async () => {
    const { profile } = await createTestProfile();
    profile.data.pass.xp = 500;
    expect(passBadgeCount(profile)).toBe(0);
  });

  it('opens the premium row retroactively on purchase', async () => {
    const { profile } = await advanced();
    profile.data.pass.xp = 700;
    await profile.grantOrder('season_pass', 'sp-2');
    expect(retroactiveCount(profile.passView())).toBe(7);
    expect(profile.claimAllPass('premium')).toEqual({ ok: true, value: 7 });
    expect(retroactiveCount(profile.passView())).toBe(0);
  });

  it('warns once a day in the last days of a season while a tier can still be taken', async () => {
    const { profile } = await advanced();
    profile.data.pass.xp = 250;
    const v = profile.passView();
    expect(seasonEndWarning({ ...v, daysLeft: 9 }, '')).toBeNull();
    const today = seasonEndWarning({ ...v, daysLeft: 3 }, '');
    expect(today).toBe(`${v.season}:3`);
    expect(seasonEndWarning({ ...v, daysLeft: 3 }, today ?? '')).toBeNull();
    expect(seasonEndWarning({ ...v, daysLeft: 2 }, today ?? '')).toBe(`${v.season}:2`);
    // Nothing left to lose: nothing to say.
    expect(profile.claimAllPass('free').ok).toBe(true);
    expect(seasonEndWarning({ ...profile.passView(), daysLeft: 1 }, '')).toBeNull();
  });

  it('cycles season names and keeps the fill within 0..1', async () => {
    expect(seasonNameKey(0)).toBe('rt.pass.season.0');
    expect(seasonNameKey(4)).toBe('rt.pass.season.0');
    expect(seasonNameKey(7)).toBe('rt.pass.season.3');
    expect(seasonNameKey(-1)).toBe('rt.pass.season.3');
    const { profile } = await advanced();
    profile.data.pass.xp = 150;
    expect(xpFill(profile.passView())).toBeCloseTo(0.5, 5);
    profile.data.pass.xp = 3000;
    expect(xpFill(profile.passView())).toBe(1);
  });

  it('opens on the reached tier and clamps the scroll target to the list', async () => {
    const { profile } = await advanced();
    expect(focusTier(profile.passView())).toBe(1);
    profile.data.pass.xp = 1250;
    expect(focusTier(profile.passView())).toBe(12);
    const step = PASS_ROW_H + PASS_ROW_GAP;
    const contentH = 74 + 30 * step + 64;
    expect(scrollTargetFor(1, 600, contentH, 74)).toBe(0);
    const mid = scrollTargetFor(12, 600, contentH, 74);
    expect(mid).toBeGreaterThan(0);
    // The tier row lands inside the viewport.
    const rowTop = 74 + 11 * step - mid;
    expect(rowTop).toBeGreaterThanOrEqual(0);
    expect(rowTop + PASS_ROW_H).toBeLessThanOrEqual(600);
    expect(scrollTargetFor(30, 600, contentH, 74)).toBe(contentH - 600);
  });
});

describe('settings model', () => {
  it('maps the quality choice to the fx switches', () => {
    expect(qualityPatch('auto', 'low')).toEqual({ autoTier: true, tier: 'low' });
    expect(qualityPatch('high', 'low')).toEqual({ autoTier: false, tier: 'high' });
    expect(qualityPatch('mid', 'high')).toEqual({ autoTier: false, tier: 'mid' });
  });

  it('formats the saved-at time of a backup code', () => {
    expect(savedAtText(0)).toBe('');
    expect(savedAtText(Number.NaN)).toBe('');
    expect(savedAtText(at(2026, 3, 9, 7, 5))).toBe('2026-03-09 07:05');
  });
});

describe('calendar look', () => {
  it('stamps the days up to the stamp, circles the next one only when it can be claimed', () => {
    const view = { stamp: 3, next: 4, canClaim: true };
    expect([1, 3, 4, 5].map((d) => calendarCellState(d, view))).toEqual(['claimed', 'claimed', 'today', 'upcoming']);
    expect(calendarCellState(4, { stamp: 3, next: 4, canClaim: false })).toBe('upcoming');
  });

  it('gives days 7, 14, 21 and 28 the big stickers', () => {
    expect([...Array(28).keys()].map((i) => i + 1).filter(isBigDay)).toEqual([7, 14, 21, 28]);
  });

  it('keeps the page that day 28 completed on show, stamped to the end, until the next day can be claimed', () => {
    // The meta layer has already wrapped: stamp 0, one calendar finished, last claim today.
    const done = calendarPage({ stamp: 0, next: 1, cycles: 1, canClaim: false }, true, 28);
    expect(done).toEqual({ page: 1, stamp: 28, next: 1, canClaim: false });
    expect([1, 14, 28].map((d) => calendarCellState(d, done))).toEqual(['claimed', 'claimed', 'claimed']);
    // Tomorrow: the second page, empty, with day 1 up for the taking.
    const fresh = calendarPage({ stamp: 0, next: 1, cycles: 1, canClaim: true }, false, 28);
    expect(fresh).toEqual({ page: 2, stamp: 0, next: 1, canClaim: true });
    expect(calendarCellState(1, fresh)).toBe('today');
  });

  it('shows an ordinary page as the profile reports it', () => {
    expect(calendarPage({ stamp: 27, next: 28, cycles: 0, canClaim: true }, false, 28)).toEqual({ page: 1, stamp: 27, next: 28, canClaim: true });
    // A brand-new profile has stamp 0 and no finished page: nothing to hold.
    expect(calendarPage({ stamp: 0, next: 1, cycles: 0, canClaim: false }, true, 28).stamp).toBe(0);
    // A first claim today does not look like a finished page.
    expect(calendarPage({ stamp: 1, next: 2, cycles: 3, canClaim: false }, true, 28)).toEqual({ page: 4, stamp: 1, next: 2, canClaim: false });
  });
});

describe('stickers', () => {
  it('tilts a little either side of straight, whatever the number', () => {
    for (const n of [-9, -1, 0, 1, 6, 7, 1_000_003]) {
      expect(Math.abs(stickerTilt(n))).toBeLessThanOrEqual(0.05);
    }
    expect(stickerTilt(3)).toBe(0);
    expect(stickerTilt(-4)).toBe(stickerTilt(3));
  });
});
