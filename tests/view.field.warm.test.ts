import { describe, expect, it } from 'vitest';
import { chapterWaves, waveEntries } from '@/game';
import { auraAreaOf, enemyArtKey, SPARE_MAX, SPARE_MIN, spareFor, waveNeeds } from '@/view/field/warmPlan';

const HAS = new Set(['enemy_cucumber', 'enemy_balloon', 'enemy_clock', 'enemy_pill', 'enemy_firecracker', 'boss_vacuum']);
const has = (k: string): boolean => HAS.has(k);

describe('what a wave needs on screen', () => {
  it('names the picture of an enemy, a boss and a split piece that borrows its parent', () => {
    expect(enemyArtKey('cucumber', has)).toBe('enemy_cucumber');
    expect(enemyArtKey('boss_vacuum', has)).toBe('boss_vacuum');
    expect(enemyArtKey('balloon_small', has)).toBe('enemy_balloon');
  });

  it('knows which enemies draw a ground area', () => {
    expect(auraAreaOf('clock')).toBe('haste');
    expect(auraAreaOf('pill')).toBe('heal');
    expect(auraAreaOf('cucumber')).toBeNull();
    expect(auraAreaOf('boss_vacuum')).toBeNull();
  });

  it('lists each picture once, the aura areas once, and counts the bodies', () => {
    const needs = waveNeeds(
      [
        { enemy: 'clock', count: 3 },
        { enemy: 'cucumber', count: 2 },
        { enemy: 'clock', count: 1 },
        { enemy: 'pill', count: 1 },
      ],
      has,
    );
    expect(needs.images).toEqual(['enemy_clock', 'enemy_cucumber', 'enemy_pill']);
    expect(needs.areas).toEqual(['haste', 'heal']);
    expect(needs.count).toBe(7);
  });

  it('has nothing to ask for when there is no wave', () => {
    expect(waveNeeds([], has)).toEqual({ images: [], areas: [], count: 0 });
  });

  it('reads the real scripts: the boss wave of chapter 1 brings the boss and its escort and no area', () => {
    const script = chapterWaves(1)[7];
    expect(script?.boss).toBe('boss_vacuum');
    const needs = waveNeeds(waveEntries(script as NonNullable<typeof script>), (k) => k.length > 0);
    expect(needs.images[0]).toBe('boss_vacuum');
    expect(needs.images).toContain('enemy_cucumber');
    expect(needs.areas).toEqual([]);
  });

  it('every wave of every chapter has a picture to ask for, and only areas the field can draw', () => {
    for (let chapter = 1; chapter <= 5; chapter++) {
      for (const script of chapterWaves(chapter)) {
        const needs = waveNeeds(waveEntries(script), () => true);
        expect(needs.images.length).toBeGreaterThan(0);
        for (const area of needs.areas) expect(['haste', 'heal']).toContain(area);
      }
    }
  });

  it('keeps between a handful and a dozen bodies ready', () => {
    expect(spareFor(0)).toBe(SPARE_MIN);
    expect(spareFor(7)).toBe(7);
    expect(spareFor(40)).toBe(SPARE_MAX);
  });
});
