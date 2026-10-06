import { describe, expect, it } from 'vitest';
import '@/view/hud/strings';
import { hasString } from '@/core/i18n';
import {
  ALL_FAILS, HOLD_EVERY, HOLD_FIRST, HoldRepeater, failKeys, gaugeLevel, luckLine, nextSpeed, offerRoute, overflowLeft,
  pityVisible, recommendPick, revealFlags, rewardTiles, soCloseWaves, speedSteps, summonView, traitOrder,
} from '@/view/hud/policy';

describe('staged reveal', () => {
  it('shows only the five basics in run 0', () => {
    const r = revealFlags(0);
    expect(Object.values(r).every((v) => v === false)).toBe(true);
  });

  it('adds speed, preview, tracker, laser, call wave and class upgrades in run 1', () => {
    const r = revealFlags(1);
    expect(r).toMatchObject({ classUpgrade: true, speed: true, preview: true, tracker: true, laser: true, callWave: true });
    expect(r.purr).toBe(false);
    expect(r.gradeUpgrade).toBe(false);
  });

  it('adds purr, molt and odds in run 2 and grade, awaken and sell hints in run 3', () => {
    expect(revealFlags(2)).toMatchObject({ purr: true, molt: true, odds: true, gradeUpgrade: false, awaken: false });
    expect(revealFlags(3)).toMatchObject({ gradeUpgrade: true, awaken: true, sellHint: true });
    expect(revealFlags(40).gradeUpgrade).toBe(true);
  });
});

describe('speed', () => {
  it('offers 3x only to Butler Pass owners and sandbox runs', () => {
    expect(speedSteps(false, false)).toEqual([1, 2]);
    expect(speedSteps(true, false)).toEqual([1, 2, 3]);
    expect(speedSteps(false, true)).toEqual([1, 2, 3]);
  });

  it('cycles and wraps', () => {
    expect(nextSpeed(1, [1, 2])).toBe(2);
    expect(nextSpeed(2, [1, 2])).toBe(1);
    expect(nextSpeed(3, [1, 2, 3])).toBe(1);
    expect(nextSpeed(3, [1, 2])).toBe(1);
  });
});

describe('enemy gauge', () => {
  it('turns amber at two thirds and red at five sixths of the cap', () => {
    expect(gaugeLevel(39, 60)).toBe(0);
    expect(gaugeLevel(40, 60)).toBe(1);
    expect(gaugeLevel(49, 60)).toBe(1);
    expect(gaugeLevel(50, 60)).toBe(2);
    expect(gaugeLevel(61, 60)).toBe(2);
    expect(gaugeLevel(5, 0)).toBe(0);
  });

  it('counts the overflow grace down', () => {
    expect(overflowLeft(0, 2)).toBe(0);
    expect(overflowLeft(0.5, 2)).toBeCloseTo(1.5);
    expect(overflowLeft(2.5, 2)).toBe(0);
  });
});

describe('summon button', () => {
  it('prefers "no space" over "short", and reports the missing fish', () => {
    expect(summonView(0, 20, 5)).toEqual({ kind: 'full', missing: 0 });
    expect(summonView(3, 20, 5)).toEqual({ kind: 'short', missing: 15 });
    expect(summonView(3, 20, 20)).toEqual({ kind: 'ready', missing: 0 });
    expect(summonView(3, 0, 0).kind).toBe('ready');
  });

  it('shows the pity chip from the ninth dry summon', () => {
    expect(pityVisible({ epicDry: 8, epicDryLimit: 12, epicBonus: 0 })).toBe(false);
    expect(pityVisible({ epicDry: 9, epicDryLimit: 12, epicBonus: 0 })).toBe(true);
  });

  it('repeats after 350 ms and then every 140 ms', () => {
    const h = new HoldRepeater();
    expect(h.tick(1)).toBe(0);
    h.start();
    expect(h.tick(HOLD_FIRST - 0.01)).toBe(0);
    expect(h.tick(0.02)).toBe(1);
    expect(h.tick(HOLD_EVERY - 0.02)).toBe(0);
    expect(h.tick(0.04)).toBe(1);
    // a long frame owes several repeats at once
    expect(h.tick(HOLD_EVERY * 3 + 0.001)).toBe(3);
    h.stop();
    expect(h.tick(5)).toBe(0);
    h.start();
    expect(h.tick(0.1)).toBe(0);
  });
});

describe('refusal text', () => {
  it('has an explanation for every fail code', () => {
    for (const fail of ALL_FAILS) {
      const keys = failKeys('anything', fail);
      expect(keys.some((k) => hasString(k))).toBe(true);
    }
  });

  it('puts the command-specific key first', () => {
    expect(failKeys('molt', 'not_enough_purr')).toEqual(['hud.fail.molt.not_enough_purr', 'hud.fail.not_enough_purr']);
  });
});

describe('offers', () => {
  it('hides every offer in sandbox runs and the first run', () => {
    expect(offerRoute('ok', true)).toBe('none');
    expect(offerRoute('first_run', false)).toBe('none');
  });

  it('uses an ad when one may play, gems when it cannot right now, nothing when capped', () => {
    expect(offerRoute('ok', false)).toBe('ad');
    expect(offerRoute('unavailable', false)).toBe('gems');
    expect(offerRoute('gap', false)).toBe('gems');
    expect(offerRoute('offer_cap', false)).toBe('gems');
    expect(offerRoute('run_cap', false)).toBe('none');
    expect(offerRoute('daily_cap', false)).toBe('none');
  });
});

describe('result screen', () => {
  it('reads summon luck as top n % or bottom n %', () => {
    expect(luckLine(0.9)).toEqual({ kind: 'top', n: 10 });
    expect(luckLine(0.995)).toEqual({ kind: 'top', n: 1 });
    expect(luckLine(0.5)).toEqual({ kind: 'avg', n: 50 });
    expect(luckLine(0.2)).toEqual({ kind: 'low', n: 20 });
    expect(luckLine(0)).toEqual({ kind: 'low', n: 1 });
  });

  it('says "so close" only for a defeat within three waves of the end', () => {
    expect(soCloseWaves(21, 24, false)).toBe(3);
    expect(soCloseWaves(23, 24, false)).toBe(1);
    expect(soCloseWaves(20, 24, false)).toBe(0);
    expect(soCloseWaves(24, 24, true)).toBe(0);
    expect(soCloseWaves(5, 0, false)).toBe(0);
  });

  it('lists rewards in reveal order and skips zeros', () => {
    const tiles = rewardTiles(120, 40, {
      gems: 12, chests: { wooden: 1, silver: 0 }, cards: { w_paw: 2 }, wild: { rare: 1 }, cosmetics: ['rug_x'],
    });
    expect(tiles.map((t) => `${t.kind}:${t.id}:${t.count}`)).toEqual([
      'gold:gold:120', 'xp:xp:40', 'gems:gems:12', 'chest:wooden:1', 'card:w_paw:2', 'wild:rare:1', 'cosmetic:rug_x:1',
    ]);
    expect(rewardTiles(0, 0, {})).toEqual([]);
  });
});

describe('choices', () => {
  const classOf = (id: string): 'warrior' | 'ranger' => (id.startsWith('w_') ? 'warrior' : 'ranger');

  it('prefers a new kind of a class already on the board over a plain rarity lead', () => {
    const options = [
      { id: 'w_paw' as const, classId: 'warrior' as const, rarity: 'epic' as const },
      { id: 'w_sword' as const, classId: 'warrior' as const, rarity: 'epic' as const },
      { id: 'r_ninja' as const, classId: 'ranger' as const, rarity: 'epic' as const },
    ];
    expect(recommendPick(options, ['w_paw'], classOf)).toBe(1);
  });

  it('falls back to rarity, then to the first card', () => {
    const rare = { id: 'w_paw' as const, classId: 'warrior' as const, rarity: 'rare' as const };
    const epic = { id: 'r_ninja' as const, classId: 'ranger' as const, rarity: 'epic' as const };
    expect(recommendPick([rare, epic], [], classOf)).toBe(1);
    expect(recommendPick([rare, rare], [], classOf)).toBe(0);
  });

  it('orders boss and elite traits first', () => {
    expect(traitOrder(['armored', 'boss', 'fast', 'elite'])).toEqual(['boss', 'elite', 'armored', 'fast']);
  });
});
