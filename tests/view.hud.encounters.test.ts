import { describe, expect, it } from 'vitest';
import type { EnemyId } from '@/game';
import { chapterWaves } from '@/game/data/waves';
import { arrivalTopics, bossTopicOf, runTopic, traitTopic, traitTopicsOf } from '@/view/hud/encounters';

describe('first-encounter topics', () => {
  it('names a topic for each enemy trait that has one, and none for the elite and boss tags', () => {
    expect(traitTopic('armored')).toBe('trait_armored');
    expect(traitTopic('haste_aura')).toBe('trait_haste_aura');
    expect(traitTopic('elite')).toBeNull();
    expect(traitTopic('boss')).toBeNull();
  });

  it('lists the traits of a wave once each, in the order the enemies come', () => {
    expect(traitTopicsOf(['cucumber'])).toEqual([]);
    expect(traitTopicsOf(['roomba', 'dust', 'roomba', 'tangerine'] as EnemyId[])).toEqual(['trait_armored', 'trait_swarm', 'trait_warded']);
  });

  it('covers every trait a chapter-one enemy can show', () => {
    const seen = new Set<string>();
    for (const wave of chapterWaves(1)) for (const t of traitTopicsOf(wave.groups.map((g) => g.enemy))) seen.add(t);
    expect(seen.size).toBeGreaterThan(5);
  });

  it('gives each chapter boss its own topic and the elite none', () => {
    for (const id of ['boss_vacuum', 'boss_blender', 'boss_bath', 'boss_cloud', 'boss_needle'] as const) expect(bossTopicOf(id)).toBe(id);
    expect(bossTopicOf('boss_cucumber')).toBeNull();
    expect(bossTopicOf('spray')).toBeNull();
  });

  it('teaches the elite or boss rule first and the boss\'s own trick after it', () => {
    expect(arrivalTopics('boss_cucumber', 'elite')).toEqual(['elite']);
    expect(arrivalTopics('boss_vacuum', 'boss')).toEqual(['boss', 'boss_vacuum']);
    expect(arrivalTopics('spray', 'elite')).toEqual(['elite']);
    expect(arrivalTopics('cucumber', 'normal')).toEqual([]);
  });

  it('opens a run with the topic of its own rules', () => {
    expect(runTopic('daily', 0)).toBe('daily_challenge');
    expect(runTopic('endless', 0)).toBe('endless');
    expect(runTopic('chapter', 2)).toBe('stakes');
    expect(runTopic('chapter', 0)).toBeNull();
    expect(runTopic('tutorial', 0)).toBeNull();
  });
});
