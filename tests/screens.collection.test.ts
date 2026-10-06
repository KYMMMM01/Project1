import { describe, expect, it } from 'vitest';
import { UNIT_IDS } from '@/game/api';
import { unitSpec } from '@/game/data/units';
import { createTestProfile } from '@/meta/testing';
import { BASE_UNITS } from '@/meta/types';
import { CLASS_GROUPS, cardProgress, isUpgradeReady, upgradeReadyCount, visibleGroups } from '../src/screens/cats/collection';
import { deltaText, isImprovement, isUnitId, levelSource, perkRows, statText, unitStatsAt } from '../src/screens/cats/unitStats';

describe('collection groups', () => {
  it('lists four classes of four cats plus the guardian, covering all 20 cats once', () => {
    const ids = CLASS_GROUPS.flatMap((g) => [...g.base, g.guardian]);
    expect(ids).toHaveLength(20);
    expect(new Set(ids)).toEqual(new Set(UNIT_IDS));
    for (const g of CLASS_GROUPS) expect(levelSource(g.guardian)).toBe(g.base[3]);
  });

  it('filters by class', () => {
    expect(visibleGroups('all')).toHaveLength(4);
    expect(visibleGroups('mage').map((g) => g.classId)).toEqual(['mage']);
  });
});

describe('upgrade-ready and progress', () => {
  it('counts only cats with enough cards and gold, wild cards included', async () => {
    const { profile } = await createTestProfile();
    expect(upgradeReadyCount(profile.units())).toBe(0);
    profile.data.gold = 1000;
    profile.data.cards.w_paw = 2;
    expect(upgradeReadyCount(profile.units())).toBe(1);
    profile.data.cards.r_sling = 1;
    profile.data.wild.common = 1;
    const sling = profile.unitView('r_sling');
    expect(isUpgradeReady(sling)).toBe(true);
    profile.data.gold = 0;
    expect(upgradeReadyCount(profile.units())).toBe(0);
  });

  it('caps the card bar at what the level needs and shows a full bar for a maxed cat', async () => {
    const { profile } = await createTestProfile();
    profile.data.cards.w_paw = 50;
    const v = profile.unitView('w_paw');
    expect(cardProgress(v)).toEqual({ have: 2, needed: 2, maxed: false });
    profile.data.levels.w_paw = 10;
    expect(cardProgress(profile.unitView('w_paw')).maxed).toBe(true);
  });
});

describe('unit stats', () => {
  it('level 1 is the base row and each level adds ten percent damage', () => {
    for (const id of UNIT_IDS) {
      const b = unitSpec(id).base;
      const s = unitStatsAt(id, 1);
      expect(s.damage).toBeCloseTo(b.damage, 6);
      expect(s.interval).toBeCloseTo(b.interval, 6);
      expect(s.range).toBeCloseTo(b.range, 6);
      expect(s.crit).toBeCloseTo(b.crit, 6);
    }
    const lv3 = unitStatsAt('w_viking', 3);
    expect(lv3.damage).toBeCloseTo(130 * 1.2, 6);
  });

  it('applies perks at levels 4, 7 and 10 and never leaves the 1..10 range', () => {
    const paw1 = unitStatsAt('w_paw', 1);
    const paw4 = unitStatsAt('w_paw', 4);
    expect(paw4.interval).toBeLessThan(paw1.interval * 0.99);
    expect(unitStatsAt('w_paw', 0)).toEqual(paw1);
    expect(unitStatsAt('w_paw', 99)).toEqual(unitStatsAt('w_paw', 10));
    const rows = perkRows('w_paw', 7);
    expect(rows.map((r) => r.unlocked)).toEqual([true, true, false]);
    expect(rows.map((r) => r.level)).toEqual([4, 7, 10]);
  });

  it('formats numbers and differences', () => {
    expect(statText('damage', 6.5)).toBe('6.5');
    expect(statText('damage', 130)).toBe('130');
    expect(statText('interval', 0.55)).toBe('0.55');
    expect(statText('crit', 0.05)).toBe('5%');
    expect(deltaText('damage', 6.5, 7.15)).toBe('+0.7');
    expect(deltaText('crit', 0.05, 0.1)).toBe('+5%p');
    expect(deltaText('interval', 0.55, 0.5)).toBe('-0.05');
    expect(deltaText('range', 165, 165)).toBe('');
    expect(isImprovement('interval', -0.05)).toBe(true);
    expect(isImprovement('damage', -1)).toBe(false);
  });

  it('only accepts real unit ids', () => {
    expect(isUnitId('w_tiger')).toBe(true);
    expect(isUnitId('nope')).toBe(false);
    expect(BASE_UNITS).toHaveLength(16);
  });
});
