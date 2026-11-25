import { describe, expect, it } from 'vitest';
import {
  FRAME_IDS,
  ICON_IDS,
  LOOK_DEFAULTS,
  LOOK_MAX_LEVEL,
  PLATE_IDS,
  GRANT_WEEKS_KEPT,
  RANK_IDS,
  RANK_REWARDS,
  cleanLook,
  grantWeeks,
  grantedItems,
  rankTier,
  readLook,
  weeksToSettle,
  type RankTier,
} from '../functions/src/looks';
import { seoulWeekKey } from '../functions/src/rules';
import { COSMETICS, COSMETIC_DEFAULTS } from '../src/meta/data/catalog';

const ids = (kind: string): string[] => COSMETICS.filter((c) => c.kind === kind).map((c) => c.id);
const GOOD = { icon: 'icon_r_ninja', frame: 'frame_wood', plate: 'plate_dots', level: 12 };
const NONE: ReadonlySet<string> = new Set();

describe('the server id lists match the game catalogue', () => {
  it('icons, frames and plates are the same sets', () => {
    expect([...ICON_IDS].sort()).toEqual(ids('icon').sort());
    expect([...FRAME_IDS].sort()).toEqual(ids('frame').sort());
    expect([...PLATE_IDS].sort()).toEqual(ids('plate').sort());
  });
  it('rank ids are the catalogue items whose source is a rank', () => {
    const ranks = COSMETICS.filter((c) => c.source.type === 'rank').map((c) => c.id);
    expect([...RANK_IDS].sort()).toEqual(ranks.sort());
  });
  it('defaults equal the catalogue defaults', () => {
    expect(LOOK_DEFAULTS).toEqual({ i: COSMETIC_DEFAULTS.icon, f: COSMETIC_DEFAULTS.frame, p: COSMETIC_DEFAULTS.plate });
  });
});

describe('cleanLook', () => {
  it('accepts a good look', () => {
    expect(cleanLook(GOOD, NONE)).toEqual({ i: 'icon_r_ninja', f: 'frame_wood', p: 'plate_dots', lv: 12 });
  });
  it('rejects non-objects, unknown ids and ids of the wrong kind', () => {
    expect(cleanLook(null, NONE)).toBeNull();
    expect(cleanLook('x', NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, icon: 'icon_nope' }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, icon: 'frame_wood' }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, plate: undefined }, NONE)).toBeNull();
  });
  it('takes only integer levels 1 to 99', () => {
    expect(cleanLook({ ...GOOD, level: 0 }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, level: 100 }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, level: 1.5 }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, level: '3' }, NONE)).toBeNull();
    expect(cleanLook({ ...GOOD, level: 1 }, NONE)?.lv).toBe(1);
    expect(cleanLook({ ...GOOD, level: LOOK_MAX_LEVEL }, NONE)?.lv).toBe(LOOK_MAX_LEVEL);
  });
  it('turns a rank item that was not granted into the default, and keeps a granted one', () => {
    const ask = { ...GOOD, frame: 'frame_rank_1', plate: 'plate_rank_10' };
    expect(cleanLook(ask, NONE)).toMatchObject({ f: 'frame_default', p: 'plate_default' });
    expect(cleanLook(ask, new Set(['frame_rank_1']))).toMatchObject({ f: 'frame_rank_1', p: 'plate_default' });
    expect(cleanLook(ask, new Set(['frame_rank_1', 'plate_rank_10']))).toMatchObject({ f: 'frame_rank_1', p: 'plate_rank_10' });
  });
});

describe('readLook', () => {
  it('reads a good stored look as it is', () => {
    expect(readLook({ i: 'icon_r_ninja', f: 'frame_wood', p: 'plate_dots', lv: 12 })).toEqual({ i: 'icon_r_ninja', f: 'frame_wood', p: 'plate_dots', lv: 12 });
  });
  it('draws an unknown id as the default of its part', () => {
    expect(readLook({ i: 'icon_future', f: 'plate_dots', p: 5, lv: 3 })).toEqual({ ...LOOK_DEFAULTS, lv: 3 });
  });
  it('clamps the level', () => {
    expect(readLook({ lv: 500 })?.lv).toBe(LOOK_MAX_LEVEL);
    expect(readLook({ lv: -4 })?.lv).toBe(1);
    expect(readLook({ lv: 7.9 })?.lv).toBe(7);
    expect(readLook({ lv: 'x' })?.lv).toBe(1);
    expect(readLook({ lv: NaN })?.lv).toBe(1);
  });
  it('is null when there is no look', () => {
    expect(readLook(undefined)).toBeNull();
    expect(readLook(null)).toBeNull();
    expect(readLook('look')).toBeNull();
  });
});

describe('grantedItems', () => {
  it('collects the items of every week', () => {
    const grants = { weeks: { 'week-2026-11-16': { rank: 1, items: ['frame_rank_1', 'plate_rank_1'] }, 'week-2026-11-23': { rank: 5, items: ['frame_rank_10'] } } };
    expect([...grantedItems(grants)].sort()).toEqual(['frame_rank_1', 'frame_rank_10', 'plate_rank_1']);
  });
  it('survives malformed input', () => {
    for (const bad of [undefined, null, 5, 'x', [], {}, { weeks: null }, { weeks: 'x' }, { weeks: { a: null } }, { weeks: { 'week-2026-11-23': { rank: 2, items: 'x' } } }, { weeks: { a: { rank: 2, items: ['frame_rank_3'] } } }]) {
      expect(grantedItems(bad).size).toBe(0);
    }
    expect([...grantedItems({ weeks: { 'week-2026-11-23': { rank: 2, items: ['frame_rank_3', 7, null] } } })]).toEqual(['frame_rank_3']);
  });
});

describe('rankTier', () => {
  it('maps places to the four bands', () => {
    expect([0, 1, 2, 3, 4, 10, 11, 100, 101].map(rankTier)).toEqual([null, 1, 3, 3, 10, 10, 100, 100, null]);
  });
  it('rejects a place that is not a whole number', () => {
    expect(rankTier(1.5)).toBeNull();
    expect(rankTier(NaN)).toBeNull();
  });
});

describe('RANK_REWARDS', () => {
  it('lists exactly the catalogue items of each tier', () => {
    for (const tier of [1, 3, 10, 100] as RankTier[]) {
      const own = COSMETICS.filter((c) => c.source.type === 'rank' && c.source.tier === tier).map((c) => c.id);
      expect([...RANK_REWARDS[tier]].sort()).toEqual(own.sort());
    }
  });
});

describe('weeksToSettle', () => {
  // 2026-11-23 is a Monday; Seoul is UTC+9, so Monday 00:00 Seoul is Sunday 15:00 UTC.
  const MON = Date.parse('2026-11-22T15:00:00Z');
  const at = (ms: number, last: string | null): string[] => weeksToSettle(last, ms, seoulWeekKey);
  it('settles only last week when nothing was settled yet', () => {
    expect(at(MON + 3 * 3_600_000, null)).toEqual(['week-2026-11-16']);
  });
  it('has nothing to do once last week is settled', () => {
    expect(at(MON + 3 * 3_600_000, 'week-2026-11-16')).toEqual([]);
  });
  it('catches up a gap oldest first', () => {
    expect(at(MON + 3 * 3_600_000, 'week-2026-10-26')).toEqual(['week-2026-11-02', 'week-2026-11-09', 'week-2026-11-16']);
  });
  it('keeps the newest 52 of a very old cursor', () => {
    const out = at(MON, 'week-2020-01-06');
    expect(out).toHaveLength(GRANT_WEEKS_KEPT);
    expect(out[out.length - 1]).toBe('week-2026-11-16');
    expect(out[0]).toBe('week-2025-11-24');
  });
  it('turns over at Monday 00:00 in Seoul', () => {
    expect(at(MON - 1, 'week-2026-11-02')).toEqual(['week-2026-11-09']);
    expect(at(MON, 'week-2026-11-02')).toEqual(['week-2026-11-09', 'week-2026-11-16']);
  });
  it('falls back to last week when the cursor is not a week id', () => {
    expect(at(MON, 'garbage')).toEqual(['week-2026-11-16']);
  });
});

describe('grantWeeks', () => {
  const g = (rank: number) => ({ rank, items: ['frame_rank_3'] });
  it('sorts oldest first', () => {
    const out = grantWeeks({ weeks: { 'week-2026-11-23': g(2), 'week-2026-11-09': g(3) } });
    expect(out.map((w) => w.week)).toEqual(['week-2026-11-09', 'week-2026-11-23']);
    expect(out[0]).toEqual({ week: 'week-2026-11-09', rank: 3, items: ['frame_rank_3'] });
  });
  it('drops bad week ids, non-integer ranks and a missing items list', () => {
    expect(grantWeeks({ weeks: { 'week-2026-11-9': g(2), '2026-11-09': g(2), 'week-2026-11-16': g(1.5), 'week-2026-11-23': { rank: 2 } } })).toEqual([]);
  });
  it('keeps only the string items', () => {
    expect(grantWeeks({ weeks: { 'week-2026-11-16': { rank: 2, items: ['frame_rank_3', 7] } } })[0]!.items).toEqual(['frame_rank_3']);
  });
  it('returns the newest 52 weeks', () => {
    const weeks: Record<string, unknown> = {};
    for (let i = 0; i < 60; i++) weeks['week-' + new Date(Date.UTC(2025, 0, 6 + 7 * i)).toISOString().slice(0, 10)] = g(2);
    const out = grantWeeks({ weeks });
    expect(out).toHaveLength(GRANT_WEEKS_KEPT);
    expect(out[out.length - 1]!.week).toBe('week-' + new Date(Date.UTC(2025, 0, 6 + 7 * 59)).toISOString().slice(0, 10));
  });
  it('is empty for no document or no weeks', () => {
    for (const bad of [undefined, null, 5, {}, { weeks: null }]) expect(grantWeeks(bad)).toEqual([]);
  });
});
