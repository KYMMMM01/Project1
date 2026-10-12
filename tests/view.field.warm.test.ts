import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENEMY_IDS, chapterWaves, waveEntries } from '@/game';
import { goldDungeonScript } from '@/game/data/goldDungeon';
import { auraAreaOf, enemyArtKey, SPARE_MAX, SPARE_MIN, spareFor, waveNeeds } from '@/view/field/warmPlan';

const HAS = new Set(['enemy_cucumber', 'enemy_balloon', 'enemy_clock', 'enemy_pill', 'enemy_firecracker', 'boss_vacuum']);
const has = (k: string): boolean => HAS.has(k);

describe('what a wave needs on screen', () => {
  it('names the picture of an enemy, a boss and a split piece that borrows its parent', () => {
    expect(enemyArtKey('cucumber', has)).toBe('enemy_cucumber');
    expect(enemyArtKey('boss_vacuum', has)).toBe('boss_vacuum');
    expect(enemyArtKey('balloon_small', has)).toBe('enemy_balloon');
  });

  it('puts a stand-in under the gold dungeon coin and chest while their pictures are missing, and uses the pictures once they are there', () => {
    expect(enemyArtKey('coin', has)).toBe('icon_gold');
    expect(enemyArtKey('boss_treasure', has)).toBe('icon_chest_gold');
    const withArt = (k: string): boolean => has(k) || k === 'enemy_coin' || k === 'boss_treasure';
    expect(enemyArtKey('coin', withArt)).toBe('enemy_coin');
    expect(enemyArtKey('boss_treasure', withArt)).toBe('boss_treasure');
    // Nobody else has one: a missing picture of any other enemy is still named by its own key.
    expect(enemyArtKey('dryer', has)).toBe('enemy_dryer');
    expect(enemyArtKey('boss_cloud', has)).toBe('boss_cloud');
  });

  it('has a picture file in the art folder for every enemy (the small balloon borrows the big one)', () => {
    for (const id of ENEMY_IDS) {
      if (id === 'balloon_small') continue;
      const key = enemyArtKey(id, () => true);
      expect(existsSync(`src/assets/img/${key}.webp`), key).toBe(true);
    }
  });

  it('asks for the coin picture and the chest picture in the last dungeon wave, and for no area', () => {
    const needs = waveNeeds(waveEntries(goldDungeonScript(8)), () => true);
    expect(needs.images).toEqual(['boss_treasure', 'enemy_coin']);
    expect(needs.areas).toEqual([]);
    expect(waveNeeds(waveEntries(goldDungeonScript(3)), () => true).images).toEqual(['enemy_coin']);
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
