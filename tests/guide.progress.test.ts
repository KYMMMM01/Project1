import { describe, expect, it } from 'vitest';
import { GuideProgress, migrateHints } from '@/guide/progress';
import { TOPIC_IDS } from '@/guide/topics';

describe('guide progress', () => {
  it('starts with every topic new and counts the unread ones down as they are taught or read', () => {
    const p = new GuideProgress(false);
    expect(p.unread()).toHaveLength(TOPIC_IDS.length);
    p.markTaught('merge');
    p.markRead('laser');
    expect(p.isTaught('merge')).toBe(true);
    expect(p.isRead('merge')).toBe(false);
    expect(p.isSeen('merge')).toBe(true);
    expect(p.isSeen('laser')).toBe(true);
    expect(p.isTaught('laser')).toBe(false);
    expect(p.unread()).toHaveLength(TOPIC_IDS.length - 2);
    expect(p.unread()).not.toContain('merge');
  });

  it('tells its listeners what changed, once per topic', () => {
    const p = new GuideProgress(false);
    const seen: Array<string | null> = [];
    p.events.on('change', ({ id }) => seen.push(id));
    p.markTaught('sun');
    p.markTaught('sun');
    p.markRead('sun');
    p.markSkipped();
    p.markSkipped();
    expect(seen).toEqual(['sun', 'sun', null]);
    expect(p.skipped).toBe(true);
  });

  it('forgets what was taught and the skip but keeps what was read, so the tutorial can teach it all again', () => {
    const p = new GuideProgress(false);
    p.markTaught('merge');
    p.markTaught('sun');
    p.markRead('sun');
    p.markRead('laser');
    p.markSkipped();
    const seen: Array<string | null> = [];
    p.events.on('change', ({ id }) => seen.push(id));
    p.resetTaught();
    expect(p.isTaught('merge')).toBe(false);
    expect(p.isTaught('sun')).toBe(false);
    expect(p.skipped).toBe(false);
    expect(p.isRead('sun')).toBe(true);
    expect(p.isRead('laser')).toBe(true);
    expect(p.isSeen('merge')).toBe(false);
    expect(p.unread()).toHaveLength(TOPIC_IDS.length - 2);
    expect(seen).toEqual([null]);
    // Nothing left to forget: no second announcement.
    p.resetTaught();
    expect(seen).toEqual([null]);
  });

  it('is ready at once in memory and needs a load from storage otherwise', () => {
    expect(new GuideProgress(false).ready).toBe(true);
    expect(new GuideProgress(true).ready).toBe(false);
  });

  it('turns the one-time hints of the first version into the topics that now cover them', () => {
    const migrated = migrateHints({ seen: ['twins', 'chips', 'callWave', 'odds', 'grade', 'nonsense'] });
    expect(migrated.taught.sort()).toEqual(['call_wave', 'classes', 'merge', 'summon_grade']);
    expect(migrated.read).toEqual([]);
    expect(migrated.skipped).toBe(false);
    expect(migrateHints(null).taught).toEqual([]);
    expect(migrateHints({ seen: 'x' }).taught).toEqual([]);
  });
});
