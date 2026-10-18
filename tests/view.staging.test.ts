import { beforeEach, describe, expect, it } from 'vitest';
import { game } from '@/core/game';
import { CAPSULE_TOY_WAIT, capsuleToyWait, holdStage, relicOfferWait, stageHeldFor } from '@/view/staging';

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

describe('how long a toy screen waits before it comes up', () => {
  beforeEach(() => {
    game.time += 1000;
  });

  it('a stage pick waits for the boss banner and a free stage waits for nothing', () => {
    expect(relicOfferWait()).toBe(0);
    holdStage(1.5);
    expect(relicOfferWait()).toBeCloseTo(1.5, 6);
    game.time += 1;
    expect(relicOfferWait()).toBeCloseTo(0.5, 6);
  });

  it('a lucky cat toy waits for the skills banners and then for its own lid, so that the lid is seen', () => {
    game.time += 100;
    expect(relicOfferWait('capsule')).toBeCloseTo(CAPSULE_TOY_WAIT, 6);
    holdStage(1.2);
    expect(relicOfferWait('capsule')).toBeCloseTo(1.2 + CAPSULE_TOY_WAIT, 6);
    expect(capsuleToyWait()).toBe(relicOfferWait('capsule'));
    expect(stageHeldFor()).toBeCloseTo(1.2, 6);
    game.time += 2;
    expect(relicOfferWait('capsule')).toBeCloseTo(CAPSULE_TOY_WAIT, 6);
  });
});
