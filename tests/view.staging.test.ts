import { beforeEach, describe, expect, it } from 'vitest';
import { game } from '@/core/game';
import { holdStage, stageHeldFor } from '@/view/staging';

describe('stage hold', () => {
  beforeEach(() => {
    game.time += 1000;
  });

  it('is free until a moment holds it, then counts down in real time', () => {
    expect(stageHeldFor()).toBe(0);
    holdStage(2);
    expect(stageHeldFor()).toBeCloseTo(2, 5);
    game.time += 1.5;
    expect(stageHeldFor()).toBeCloseTo(0.5, 5);
    game.time += 1;
    expect(stageHeldFor()).toBe(0);
  });

  it('keeps the longest hold when two moments ask', () => {
    holdStage(3);
    holdStage(1);
    expect(stageHeldFor()).toBeCloseTo(3, 5);
  });
});
