import { describe, expect, it } from 'vitest';
import { DamageWindow, killTone } from '@/view/hud/killEstimate';
import { shakeScaleOf, volumeStep } from '@/view/hud/settingsMath';
import { TUTORIAL_SUMMONS, TutorialFlow, findMergePair } from '@/view/hud/tutorialFlow';

describe('kill estimate', () => {
  it('waits for 1.5 s of observation before it shows a number', () => {
    const w = new DamageWindow();
    w.reset(10);
    w.record(10.5, 100);
    expect(w.estimate(11, 1000)).toBe(-1);
    expect(w.estimate(11.6, 1000)).toBeGreaterThan(0);
  });

  it('divides remaining health by the damage of the last five seconds', () => {
    const w = new DamageWindow();
    w.reset(0);
    for (let t = 0.25; t <= 5; t += 0.25) w.record(t, 100);
    // 2000 damage over about 5 s (the buckets cover 4.75 s here) = 400 to 421 per second; 800 health left = about 2 s
    expect(w.rate(5)).toBeCloseTo(410, -2);
    expect(w.estimate(5, 800)).toBeCloseTo(1.95, 0);
  });

  it('forgets damage older than five seconds', () => {
    const w = new DamageWindow();
    w.reset(0);
    w.record(1, 1000);
    expect(w.rate(2)).toBeGreaterThan(0);
    expect(w.rate(9)).toBe(0);
    expect(w.estimate(9, 500)).toBe(Infinity);
  });

  it('survives its ring wrapping around many times', () => {
    const w = new DamageWindow();
    w.reset(0);
    for (let t = 0; t < 60; t += 0.1) w.record(t, 10);
    expect(w.rate(60)).toBeCloseTo(100, -1);
  });

  it('colours by the share of the remaining time the kill needs: 2/3 and 11/12', () => {
    expect(killTone(10, 30)).toBe('green');
    expect(killTone(19, 30)).toBe('green');
    expect(killTone(21, 30)).toBe('amber');
    expect(killTone(27, 30)).toBe('amber');
    expect(killTone(28, 30)).toBe('red');
    expect(killTone(Infinity, 30)).toBe('red');
    expect(killTone(1, 0)).toBe('red');
  });
});

describe('tutorial flow', () => {
  it('walks summon x3, merge, pick', () => {
    const f = new TutorialFlow();
    expect(f.holding).toBe(true);
    for (let i = 0; i < TUTORIAL_SUMMONS - 1; i++) expect(f.onSummon()).toBe(false);
    expect(f.step).toBe('summon');
    expect(f.onSummon()).toBe(true);
    expect(f.step).toBe('merge');
    expect(f.onSummon()).toBe(false);
    expect(f.onMerge()).toBe(true);
    expect(f.step).toBe('free');
    expect(f.holding).toBe(false);
    expect(f.offered).toBe(false);
    expect(f.onOffer()).toBe(true);
    expect(f.offered).toBe(true);
    expect(f.step).toBe('pick');
    expect(f.holding).toBe(true);
    expect(f.onPicked()).toBe(true);
    expect(f.holding).toBe(false);
  });

  it('ignores steps that are not current', () => {
    const f = new TutorialFlow();
    expect(f.onMerge()).toBe(false);
    expect(f.onPicked()).toBe(false);
    expect(f.step).toBe('summon');
  });
});

describe('merge pair', () => {
  it('prefers the nearest of several pairs and returns null with no pair', () => {
    const board: Array<string | null> = new Array(20).fill(null);
    board[0] = 'a';
    board[4] = 'a';
    board[10] = 'b';
    board[11] = 'b';
    expect(findMergePair(board)).toEqual([10, 11]);
    expect(findMergePair(new Array(20).fill(null))).toBeNull();
    board[10] = 'c';
    board[0] = 'x';
    expect(findMergePair(board)).toBeNull();
  });

  it('finds the two kittens of the tutorial script wherever they stand', () => {
    const board: Array<string | null> = new Array(20).fill(null);
    board[3] = 'w_paw';
    board[17] = 'w_paw';
    board[9] = 'r_sling';
    expect(findMergePair(board)).toEqual([3, 17]);
  });
});

describe('settings maps', () => {
  it('maps shake modes to the guide multipliers', () => {
    expect(shakeScaleOf('full')).toBe(1);
    expect(shakeScaleOf('reduced')).toBe(0.35);
    expect(shakeScaleOf('off')).toBe(0);
  });

  it('snaps volumes to tenths', () => {
    expect(volumeStep(0.34)).toBe(0.3);
    expect(volumeStep(1.4)).toBe(1);
    expect(volumeStep(-1)).toBe(0);
  });
});
