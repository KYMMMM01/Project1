import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import { UNIT_IDS } from '@/game/api';
import { mergeResultOf } from '@/game/data/roster';
import { unitSpec } from '@/game/data/units';
import { createTestProfile } from '@/meta/testing';
import { BASE_UNITS } from '@/meta/types';
import '@/meta/strings';
import '../src/screens/cats/strings';
import { arrowWidth, CLASS_GROUPS, cardProgress, FRAME_W, isUpgradeReady, lineMetrics, lineOf, lineSentence, stepFrom, TAG_OVERLAP, upgradeReadyCount, visibleGroups } from '../src/screens/cats/collection';
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
    expect(lv3.damage).toBeCloseTo(unitSpec('w_viking').base.damage * 1.2, 6);
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
    // The difference is taken between the numbers as they are shown: 14 -> 15 reads +1, never +1.4.
    expect(deltaText('damage', 14, 15.4)).toBe('+1');
    expect(deltaText('damage', 22, 28.9)).toBe('+7');
    expect(deltaText('damage', 14.6, 14.9)).toBe('');
    expect(isImprovement('damage', -1)).toBe(false);
  });

  it('never shows a difference that does not match the two numbers beside it', () => {
    for (const id of BASE_UNITS) {
      for (let level = 1; level < 10; level++) {
        const from = unitStatsAt(id, level);
        const to = unitStatsAt(id, level + 1);
        for (const key of ['damage', 'interval', 'range', 'crit'] as const) {
          const text = deltaText(key, from[key], to[key]);
          const a = parseFloat(statText(key, from[key]));
          const b = parseFloat(statText(key, to[key]));
          expect(text === '' ? 0 : parseFloat(text)).toBeCloseTo(b - a, 6);
        }
      }
    }
  });

  it('only accepts real unit ids', () => {
    expect(isUnitId('w_tiger')).toBe(true);
    expect(isUnitId('nope')).toBe(false);
    expect(BASE_UNITS).toHaveLength(16);
  });
});

describe('class lines', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('chains merge, merge, merge, awaken from the kitten to the guardian of every class', () => {
    for (const g of CLASS_GROUPS) {
      const line = lineOf(g.classId);
      expect(line).toHaveLength(5);
      const steps = line.slice(0, 4).map((id) => stepFrom(id));
      expect(steps.map((s) => s?.kind)).toEqual(['merge', 'merge', 'merge', 'awaken']);
      steps.forEach((s, i) => expect(s?.to).toBe(line[i + 1]));
      expect(stepFrom(line[4] as (typeof line)[number])).toBeNull();
      for (const id of line.slice(0, 3)) expect(stepFrom(id)?.to).toBe(mergeResultOf(id));
    }
  });

  it('says in plain words what a cat becomes, with the right Korean particles', () => {
    setLang('ko');
    const say = (id: Parameters<typeof lineSentence>[0]) => {
      const s = lineSentence(id);
      return t(s.key, { a: t(`unit.${s.a}.name`), b: t(`unit.${s.b}.name`) });
    };
    expect(say('w_sword')).toBe('검사냥 둘을 합치면 바이킹냥이 돼요.');
    expect(say('w_samurai')).toBe('사무라이냥은 각성하면 호랑이 장군이 돼요.');
    expect(say('w_tiger')).toBe('사무라이냥을 각성하면 호랑이 장군이 돼요.');
    expect(say('r_gunner')).toBe('총잡이냥은 각성하면 별빛 사수가 돼요.');
    vi.stubGlobal('document', { documentElement: {} });
    setLang('en');
    const s = lineSentence('m_snow');
    expect(t(s.key, { a: t(`unit.${s.a}.name`), b: t(`unit.${s.b}.name`) })).toBe('Two Snowball Kittens merge into one Fire Mage.');
    setLang('ko');
  });

  it('fits five photo frames and four arrow tags in the width of a class page', () => {
    for (const width of [660, 672, 696]) {
      const m = lineMetrics(width);
      expect(m.plateW).toBeLessThanOrEqual(FRAME_W);
      expect(m.plateW).toBeGreaterThanOrEqual(88);
      expect(m.gap).toBeGreaterThanOrEqual(24);
      expect(m.plateW * 5 + m.gap * 4).toBeLessThanOrEqual(width + 0.001);
      // An arrow tag over a gap reaches only the cream border of each plate (the picture window starts 11 px in).
      expect(arrowWidth(m.gap)).toBe(Math.round(m.gap + TAG_OVERLAP * 2));
      expect(TAG_OVERLAP).toBeLessThan(11);
    }
  });
});
