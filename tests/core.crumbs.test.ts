import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  END_MEMORY_MS,
  appendCrumb,
  crumb,
  currentTrail,
  endedUnderPlayer,
  endsWithin,
  previousEnds,
  readStore,
  startCrumbs,
  startTrail,
  whereOf,
  type Crumb,
  type CrumbStore,
} from '@/core/crumbs';

const T = 1_700_000_000_000;
const trail = (...kinds: Array<[string, string?]>): Crumb[] => kinds.map(([k, d], i) => (d === undefined ? { t: T + i * 1000, k } : { t: T + i * 1000, k, d }));

describe('judging a trail', () => {
  it('knows the last scene a trail names, or boot when it names none', () => {
    expect(whereOf(trail(['boot'], ['scene', 'HomeScene'], ['wave', '3'], ['scene', 'BattleScene'], ['wave', '4']))).toBe('BattleScene');
    expect(whereOf(trail(['boot']))).toBe('boot');
    expect(whereOf([])).toBe('boot');
  });

  it('calls a trail closed under the player unless its last mark is a leaving', () => {
    expect(endedUnderPlayer(trail(['boot'], ['scene', 'BattleScene'], ['wave', '4']))).toBe(true);
    expect(endedUnderPlayer(trail(['boot'], ['scene', 'BattleScene'], ['hidden']))).toBe(false);
    expect(endedUnderPlayer(trail(['boot'], ['hidden'], ['visible']))).toBe(true);
    expect(endedUnderPlayer(trail(['boot'], ['unload']))).toBe(false);
    expect(endedUnderPlayer([])).toBe(false);
  });
});

describe('starting the next page', () => {
  it('records an end for a trail that was closed under the player, with its place and time', () => {
    const before: CrumbStore = { crumbs: trail(['boot'], ['scene', 'HomeScene'], ['scene', 'BattleScene'], ['wave', '5']), ends: [] };
    const next = startTrail(before, T + 60_000);
    expect(next.ends).toEqual([{ t: T + 3000, where: 'BattleScene' }]);
    expect(next.crumbs).toEqual([{ t: T + 60_000, k: 'boot' }]);
  });

  it('records nothing for a first start, or for a page the player left', () => {
    expect(startTrail(null, T).ends).toEqual([]);
    const left: CrumbStore = { crumbs: trail(['boot'], ['scene', 'HomeScene'], ['hidden']), ends: [] };
    expect(startTrail(left, T + 5).ends).toEqual([]);
  });

  it('forgets ends older than two weeks and keeps a dozen at most', () => {
    const old = { t: T - END_MEMORY_MS - 1, where: 'HomeScene' };
    const many = Array.from({ length: 15 }, (_, i) => ({ t: T - i * 1000, where: 'BattleScene' }));
    const next = startTrail({ crumbs: [], ends: [old, ...many] }, T);
    expect(next.ends).toHaveLength(12);
    expect(next.ends.some((e) => e.where === 'HomeScene')).toBe(false);
  });

  it('keeps only the latest marks of a long trail', () => {
    let s: CrumbStore = { crumbs: [], ends: [] };
    for (let i = 0; i < 40; i++) s = appendCrumb(s, { t: T + i, k: 'wave', d: String(i) });
    expect(s.crumbs).toHaveLength(24);
    expect(s.crumbs[0]?.d).toBe('16');
    expect(s.crumbs[23]?.d).toBe('39');
  });

  it('counts the ends of a window and names the place of the latest', () => {
    const s: CrumbStore = { crumbs: [], ends: [{ t: T - 5 * 86400_000, where: 'HomeScene' }, { t: T - 3600_000, where: 'BattleScene' }, { t: T - 1000, where: 'BattleScene' }] };
    expect(endsWithin(s, T, 86400_000)).toEqual({ count: 2, where: 'BattleScene' });
    expect(endsWithin(s, T, 10 * 86400_000).count).toBe(3);
    expect(endsWithin({ crumbs: [], ends: [] }, T, 1000)).toEqual({ count: 0, where: null });
  });
});

describe('the stored trail', () => {
  const m = new Map<string, string>();
  beforeEach(() => {
    m.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('carries the end of one page to the next through storage', () => {
    startCrumbs(T);
    crumb('scene', 'BattleScene', T + 1000);
    crumb('wave', '3', T + 2000);
    // The page is gone without a word; the next one starts.
    startCrumbs(T + 90_000);
    expect(currentTrail()).toEqual([{ t: T + 90_000, k: 'boot' }]);
    expect(previousEnds(7 * 86400_000, T + 90_000)).toEqual({ count: 1, where: 'BattleScene' });
    expect(readStore().ends).toHaveLength(1);
    // That page leaves properly: no new end.
    crumb('scene', 'HomeScene', T + 91_000);
    crumb('hidden', undefined, T + 92_000);
    startCrumbs(T + 200_000);
    expect(readStore().ends).toHaveLength(1);
  });

  it('survives storage that is broken or full', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('full');
      },
    });
    expect(() => {
      startCrumbs(T);
      crumb('scene', 'HomeScene', T + 1);
    }).not.toThrow();
    expect(currentTrail().map((c) => c.k)).toEqual(['boot', 'scene']);
    expect(readStore()).toEqual({ crumbs: [], ends: [] });
  });

  it('starts clean from a store that holds nonsense', () => {
    m.set('meowguard.crumbs', '{"crumbs":"x","ends":3}');
    startCrumbs(T);
    expect(previousEnds(1e12, T).count).toBe(0);
    m.set('meowguard.crumbs', 'not json');
    expect(() => startCrumbs(T + 1)).not.toThrow();
  });
});
