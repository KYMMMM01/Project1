import { describe, expect, it } from 'vitest';
import {
  FRAME_IDS,
  ICON_IDS,
  LOOK_DEFAULTS,
  LOOK_MAX_LEVEL,
  PLATE_IDS,
  RANK_IDS,
  cleanLook,
  grantedItems,
  readLook,
} from '../functions/src/looks';
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
    const grants = { weeks: { a: { rank: 1, items: ['frame_rank_1', 'plate_rank_1'] }, b: { rank: 5, items: ['frame_rank_10'] } } };
    expect([...grantedItems(grants)].sort()).toEqual(['frame_rank_1', 'frame_rank_10', 'plate_rank_1']);
  });
  it('survives malformed input', () => {
    for (const bad of [undefined, null, 5, 'x', [], {}, { weeks: null }, { weeks: 'x' }, { weeks: { a: null } }, { weeks: { a: { items: 'x' } } }]) {
      expect(grantedItems(bad).size).toBe(0);
    }
    expect([...grantedItems({ weeks: { a: { items: ['frame_rank_3', 7, null] } } })]).toEqual(['frame_rank_3']);
  });
});
