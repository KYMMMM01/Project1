import { afterEach, describe, expect, it } from 'vitest';
import { setStorageBackend, type StorageBackend } from '@/core/save';
import { badgeCount, closeVisit, hasSticker, openVisit, unseenKeys, type MarkSets } from '@/guide/codexMarks';
import { GuideProgress, type CodexKey } from '@/guide/progress';

function memory(): StorageBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => void store.set(key, value),
    remove: async (key) => void store.delete(key),
  };
}

const sets = (met: string[], looked: string[], visit: string[] | null = null): MarkSets => ({
  met: new Set(met),
  looked: new Set(looked),
  visit: visit ? new Set(visit) : null,
});

describe('the pure rules of the codex marks', () => {
  it('lists what is met and not seen, in the order it was met', () => {
    expect(unseenKeys(new Set(['foe:dust', 'toy:yarn_ball', 'foe:pill']), new Set(['toy:yarn_ball']))).toEqual(['foe:dust', 'foe:pill']);
    expect(unseenKeys(new Set(), new Set())).toEqual([]);
  });

  it('counts, outside a visit, every entry that is met and not seen', () => {
    expect(badgeCount(sets([], []))).toBe(0);
    expect(badgeCount(sets(['foe:dust', 'foe:pill', 'toy:yarn_ball'], ['foe:pill']))).toBe(2);
  });

  it('counts nothing at the moment a visit opens, and only what is met after that', () => {
    const met = ['foe:dust', 'foe:pill', 'toy:yarn_ball'];
    const visit = [...openVisit(new Set(met), new Set(['foe:pill']))];
    expect(visit).toEqual(['foe:dust', 'toy:yarn_ball']);
    expect(badgeCount(sets(met, ['foe:pill'], visit))).toBe(0);
    expect(badgeCount(sets([...met, 'foe:roomba'], ['foe:pill'], visit))).toBe(1);
  });

  it('puts the sticker on exactly the entries that were new when the visit opened, and on every unseen one outside a visit', () => {
    const met = ['foe:dust', 'foe:pill'];
    expect(hasSticker('foe:dust', sets(met, ['foe:pill']))).toBe(true);
    expect(hasSticker('foe:pill', sets(met, ['foe:pill']))).toBe(false);
    expect(hasSticker('foe:roomba', sets(met, []))).toBe(false);
    const inVisit = sets([...met, 'foe:roomba'], [], ['foe:dust', 'foe:pill']);
    expect(hasSticker('foe:dust', inVisit)).toBe(true);
    expect(hasSticker('foe:pill', inVisit)).toBe(true);
    // Met while the codex was open: it has no sticker now and is new again afterwards.
    expect(hasSticker('foe:roomba', inVisit)).toBe(false);
  });

  it('marks the whole visit seen on closing, and only what is still met and unseen', () => {
    const met = new Set(['foe:dust', 'foe:pill', 'toy:yarn_ball']);
    expect(closeVisit(new Set(['foe:dust', 'toy:yarn_ball']), met, new Set())).toEqual(['foe:dust', 'toy:yarn_ball']);
    expect(closeVisit(new Set(['foe:dust', 'toy:yarn_ball']), met, new Set(['foe:dust']))).toEqual(['toy:yarn_ball']);
    expect(closeVisit(new Set(['foe:roomba']), met, new Set())).toEqual([]);
  });
});

describe('the codex visit on the player progress', () => {
  afterEach(() => setStorageBackend(memory()));

  it('takes the count away the moment the codex opens, with every sticker still there', () => {
    const p = new GuideProgress(false);
    p.markMet('foe:roomba');
    p.markMet('foe:cucumber');
    p.markMet('toy:cat_tower');
    expect(p.freshCount()).toBe(3);
    p.beginCodexVisit();
    expect(p.freshCount()).toBe(0);
    for (const key of ['foe:roomba', 'foe:cucumber', 'toy:cat_tower'] as const) expect(p.isFresh(key)).toBe(true);
    expect(p.isFresh('foe:dust')).toBe(false);
  });

  it('does not need an entry to be opened: closing the codex marks every one seen', () => {
    const p = new GuideProgress(false);
    p.markMet('foe:roomba');
    p.markMet('toy:cat_tower');
    p.beginCodexVisit();
    p.endCodexVisit();
    expect(p.freshCount()).toBe(0);
    expect(p.isFresh('foe:roomba')).toBe(false);
    expect(p.isFresh('toy:cat_tower')).toBe(false);
    expect(p.isLooked('foe:roomba')).toBe(true);
    expect(p.isMet('foe:roomba')).toBe(true);
  });

  it('keeps the stickers through the whole visit, however the player moves about', () => {
    const p = new GuideProgress(false);
    p.markMet('foe:roomba');
    p.beginCodexVisit();
    // The old way of clearing one: looking at it (a page opened, a list left) must not take its sticker in the same visit.
    p.markLooked('foe:roomba');
    expect(p.isFresh('foe:roomba')).toBe(true);
    p.endCodexVisit();
    expect(p.isFresh('foe:roomba')).toBe(false);
  });

  it('makes what is met after the visit new again, and shows it the next time', () => {
    const p = new GuideProgress(false);
    p.markMet('foe:roomba');
    p.beginCodexVisit();
    p.markMet('toy:cat_tower');
    expect(p.isFresh('toy:cat_tower')).toBe(false);
    expect(p.freshCount()).toBe(1);
    p.endCodexVisit();
    expect(p.freshCount()).toBe(1);
    expect(p.isFresh('toy:cat_tower')).toBe(true);
    p.beginCodexVisit();
    expect(p.freshCount()).toBe(0);
    expect(p.isFresh('toy:cat_tower')).toBe(true);
    expect(p.isFresh('foe:roomba')).toBe(false);
    p.endCodexVisit();
    expect(p.freshCount()).toBe(0);
  });

  it('opening twice or closing without opening changes nothing', () => {
    const p = new GuideProgress(false);
    p.markMet('foe:roomba');
    p.endCodexVisit();
    expect(p.freshCount()).toBe(1);
    p.beginCodexVisit();
    p.markMet('toy:cat_tower');
    p.beginCodexVisit();
    expect(p.isFresh('toy:cat_tower')).toBe(false);
    expect(p.freshCount()).toBe(1);
  });

  it('tells its listeners when the count goes and when the visit ends, and stays quiet when nothing was new', () => {
    const p = new GuideProgress(false);
    let n = 0;
    p.events.on('change', () => n++);
    p.beginCodexVisit();
    p.endCodexVisit();
    expect(n).toBe(1);
    p.markMet('foe:dust');
    n = 0;
    p.beginCodexVisit();
    expect(n).toBe(1);
    p.endCodexVisit();
    expect(n).toBe(2);
  });

  it('saves the seen entries when the codex closes, in the format that was there before', async () => {
    const backend = memory();
    setStorageBackend(backend);
    const p = new GuideProgress(true);
    await p.load();
    p.markMet('foe:pill');
    p.markMet('toy:hourglass');
    p.beginCodexVisit();
    await p.flush();
    const mid = JSON.parse(backend.store.get('meowguard.hints') as string) as { v: number; data: { met: string[]; looked: string[] } };
    // Nothing is written for a visit that is still open: an app killed inside the codex shows the count again.
    expect(mid.data.looked).toEqual([]);
    p.endCodexVisit();
    await p.flush();
    const saved = JSON.parse(backend.store.get('meowguard.hints') as string) as { v: number; data: { met: string[]; looked: string[]; taught: string[] } };
    expect(saved.v).toBe(3);
    expect(Object.keys(saved.data).sort()).toEqual(['looked', 'met', 'read', 'skipped', 'taught']);
    expect(saved.data.met.sort()).toEqual(['foe:pill', 'toy:hourglass']);
    expect(saved.data.looked.sort()).toEqual(['foe:pill', 'toy:hourglass']);
    const again = new GuideProgress(true);
    await again.load();
    expect(again.freshCount()).toBe(0);
    again.markMet('foe:dust');
    expect(again.freshCount()).toBe(1);
  });

  it('reads a save of the earlier rule, where some entries were looked at one by one', async () => {
    const backend = memory();
    setStorageBackend(backend);
    backend.store.set('meowguard.hints', JSON.stringify({
      v: 3, t: 1, data: { taught: ['merge'], read: [], skipped: false, met: ['foe:pill', 'foe:dust', 'toy:hourglass'], looked: ['foe:pill'] },
    }));
    const p = new GuideProgress(true);
    await p.load();
    expect(p.freshCount()).toBe(2);
    const keys: CodexKey[] = ['foe:pill', 'foe:dust', 'toy:hourglass'];
    expect(keys.filter((k) => p.isFresh(k))).toEqual(['foe:dust', 'toy:hourglass']);
    p.beginCodexVisit();
    expect(p.freshCount()).toBe(0);
    expect(keys.filter((k) => p.isFresh(k))).toEqual(['foe:dust', 'toy:hourglass']);
    p.endCodexVisit();
    expect(keys.filter((k) => p.isFresh(k))).toEqual([]);
  });
});
