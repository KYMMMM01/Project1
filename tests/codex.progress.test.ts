import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import { RELIC_IDS } from '@/game/api';
import { setStorageBackend, type StorageBackend } from '@/core/save';
import '@/game/data/strings';
import { CODEX_KEYS, GuideProgress, isCodexKey } from '@/guide/progress';
import { enemyInfo } from '@/view/hud/enemyInfo';
import { watchCodex } from '@/view/hud/codexWatch';
import { Sim } from '@/game/sim/sim';
import { advance, newSim, quietWave } from './simHelpers';
import { startWave } from '@/game/sim/flow';

function memory(): StorageBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => void store.set(key, value),
    remove: async (key) => void store.delete(key),
  };
}

describe('codex progress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('knows every enemy and every toy by one key, and nothing else', () => {
    expect(CODEX_KEYS).toHaveLength(19 + RELIC_IDS.length);
    expect(isCodexKey('foe:boss_vacuum')).toBe(true);
    expect(isCodexKey('toy:yarn_ball')).toBe(true);
    expect(isCodexKey('foe:yarn_ball')).toBe(false);
    expect(isCodexKey('merge')).toBe(false);
  });

  it('marks an entry new once it is met and until it is looked at, and counts them', () => {
    const p = new GuideProgress(false);
    expect(p.freshCount()).toBe(0);
    p.markMet('foe:roomba');
    p.markMet('toy:cat_tower');
    expect(p.isMet('foe:roomba')).toBe(true);
    expect(p.isFresh('foe:roomba')).toBe(true);
    expect(p.isFresh('foe:cucumber')).toBe(false);
    expect(p.freshCount()).toBe(2);
    p.markLooked('foe:roomba');
    expect(p.isFresh('foe:roomba')).toBe(false);
    expect(p.freshCount()).toBe(1);
  });

  it('does not count a look at something not met yet: it is still new when it is met', () => {
    const p = new GuideProgress(false);
    p.markLooked('toy:silvervine');
    p.markMet('toy:silvervine');
    expect(p.isFresh('toy:silvervine')).toBe(true);
  });

  it('tells its listeners once per entry', () => {
    const p = new GuideProgress(false);
    let n = 0;
    p.events.on('change', () => n++);
    p.markMet('foe:dust');
    p.markMet('foe:dust');
    p.markLooked('foe:dust');
    p.markLooked('foe:dust');
    expect(n).toBe(2);
  });

  it('is saved with the guide progress and read back, and an old save without it loads with nothing met', async () => {
    const backend = memory();
    setStorageBackend(backend);
    backend.store.set('meowguard.hints', JSON.stringify({ v: 2, t: 1, data: { taught: ['merge'], read: ['sun'], skipped: true } }));
    const old = new GuideProgress(true);
    await old.load();
    expect(old.isTaught('merge')).toBe(true);
    expect(old.isRead('sun')).toBe(true);
    expect(old.skipped).toBe(true);
    expect(old.freshCount()).toBe(0);
    old.markMet('foe:pill');
    old.markMet('toy:hourglass');
    old.markLooked('foe:pill');
    await old.flush();
    const saved = JSON.parse(backend.store.get('meowguard.hints') as string) as { v: number; data: { met: string[]; looked: string[]; taught: string[] } };
    expect(saved.v).toBe(3);
    expect(saved.data.met.sort()).toEqual(['foe:pill', 'toy:hourglass']);
    expect(saved.data.looked).toEqual(['foe:pill']);
    expect(saved.data.taught).toEqual(['merge']);
    const again = new GuideProgress(true);
    await again.load();
    expect(again.isMet('toy:hourglass')).toBe(true);
    expect(again.isFresh('toy:hourglass')).toBe(true);
    expect(again.isFresh('foe:pill')).toBe(false);
    expect(again.isTaught('merge')).toBe(true);
  });
});

describe('codex watch in a battle', () => {
  function watched(sim: Sim, progress: GuideProgress): void {
    watchCodex({ battle: sim, progress, on: (emitter, type, fn) => void emitter.on(type, fn) });
  }

  it('marks every enemy that walks the field and every toy offered or won', () => {
    const sim = newSim();
    const progress = new GuideProgress(false);
    watched(sim, progress);
    quietWave(sim);
    startWave(sim, 4);
    advance(sim, 3);
    expect(progress.isMet('foe:boss_cucumber')).toBe(true);
    expect(progress.isMet('foe:roomba')).toBe(false);
    sim.events.emit('relicOffer', { options: ['yarn_ball', 'cat_tower'], freeRerolls: 1, picksLeft: 1 });
    expect(progress.isMet('toy:yarn_ball')).toBe(true);
    expect(progress.isMet('toy:cat_tower')).toBe(true);
    expect(progress.isMet('toy:silvervine')).toBe(false);
    sim.events.emit('relicGain', { relic: 'silvervine' });
    expect(progress.isMet('toy:silvervine')).toBe(true);
  });

  it('marks what a restored run already holds when the HUD is built', () => {
    const sim = newSim();
    quietWave(sim);
    startWave(sim, 4);
    advance(sim, 3);
    const progress = new GuideProgress(false);
    watched(sim, progress);
    expect(progress.isMet('foe:boss_cucumber')).toBe(true);
  });
});

describe('the enemy bubble', () => {
  beforeAll(() => {
    vi.stubGlobal('document', { documentElement: { lang: '' } });
  });
  afterAll(() => {
    setLang('ko');
    vi.unstubAllGlobals();
  });

  it('ends in the link to the codex page of that enemy and opens exactly it', () => {
    for (const lang of ['ko', 'en'] as const) {
      setLang(lang);
      let opened = '';
      const content = enemyInfo('boss_vacuum', (id) => (opened = id));
      expect(content.title).toBe(t('enemy.boss_vacuum.name'));
      expect(content.link?.label).toBe(t('codex.link'));
      expect(content.link?.label).not.toBe('codex.link');
      content.link?.run();
      expect(opened).toBe('boss_vacuum');
      expect(content.text).toContain(t('trait.boss.desc'));
    }
  });
});
