import { describe, expect, it } from 'vitest';
import { BUBBLE_MARGIN, placeBubble, unionRect } from '@/view/hud/bubbleMath';
import { canOpenPause, unspentFish, wavesReached } from '@/view/hud/policy';
import { NUDGE_AFTER, NUDGE_CATS, NUDGE_MAX, nudgeDue } from '@/view/hud/tutorialFlow';
import { previewBelow } from '@/view/field/policy';

describe('the pause menu', () => {
  it('opens only while the run is still going, so a quit cannot file a won run as defeated', () => {
    expect(canOpenPause('wave', false)).toBe(true);
    expect(canOpenPause('prep', false)).toBe(true);
    expect(canOpenPause('won', false)).toBe(false);
    expect(canOpenPause('lost', false)).toBe(false);
    expect(canOpenPause('wave', true)).toBe(false);
  });
});

describe('the result of a lost run', () => {
  it('names the unspent fish only when they could have bought cats', () => {
    expect(unspentFish(false, false, 197, 12, 14)).toBe(197);
    expect(unspentFish(false, false, 20, 12, 14)).toBe(0);
    expect(unspentFish(false, false, 197, 12, 0)).toBe(0);
    expect(unspentFish(true, false, 197, 12, 14)).toBe(0);
    expect(unspentFish(false, true, 197, 12, 14)).toBe(0);
  });

  it('says the wave the HUD showed, never fewer than the waves cleared nor past the last', () => {
    expect(wavesReached(8, 7, 24)).toBe(8);
    expect(wavesReached(7, 7, 24)).toBe(7);
    expect(wavesReached(30, 29, 24)).toBe(24);
    expect(wavesReached(5, 6, 0)).toBe(6);
  });
});

describe('the tutorial nudge', () => {
  it('waits for the fish to sit unspent, then keeps coming back until the board has real cats', () => {
    expect(nudgeDue(NUDGE_AFTER - 1, 0, 3)).toBe(false);
    expect(nudgeDue(NUDGE_AFTER, 0, 3)).toBe(true);
    expect(nudgeDue(NUDGE_AFTER, NUDGE_MAX, NUDGE_CATS - 1)).toBe(true);
    expect(nudgeDue(NUDGE_AFTER, NUDGE_MAX, NUDGE_CATS)).toBe(false);
  });
});

describe('where a hint bubble goes', () => {
  const bounds = { x: 0, y: 0, w: 720, h: 1280 };
  const target = { x: 300, y: 600, w: 100, h: 100 };
  const spec = { target, w: 400, h: 100, bounds, arrow: 20, prefer: 'above' as const };

  it('takes the preferred side when both are free', () => {
    expect(placeBubble({ ...spec, avoid: [] }).above).toBe(true);
    expect(placeBubble({ ...spec, prefer: 'below', avoid: [] }).above).toBe(false);
  });

  it('takes the other side when the preferred one would cover something that matters', () => {
    const cat = { x: 250, y: 480, w: 200, h: 100, weight: 3 };
    expect(placeBubble({ ...spec, avoid: [cat] }).above).toBe(false);
  });

  it('never leaves the screen, and never counts the target itself as a cost', () => {
    const top = placeBubble({ ...spec, target: { x: 300, y: 10, w: 100, h: 60 }, avoid: [{ x: 300, y: 10, w: 100, h: 60, weight: 3 }] });
    expect(top.above).toBe(false);
    const edge = placeBubble({ ...spec, target: { x: 0, y: 600, w: 40, h: 40 }, avoid: [] });
    expect(edge.x).toBe(BUBBLE_MARGIN);
  });

  it('points at both cats of a pair', () => {
    const pair = unionRect({ x: 100, y: 200, w: 100, h: 100 }, { x: 300, y: 250, w: 100, h: 100 });
    expect(pair).toEqual({ x: 100, y: 200, w: 300, h: 150 });
  });
});

describe('the drag result bubble', () => {
  it('takes the cat-free side of the top and bottom rows while it fits there, the other side when it does not', () => {
    expect(previewBelow(0, 4, 0, 5, true, true)).toBe(false);
    expect(previewBelow(0, 4, 0, 5, false, true)).toBe(true);
    expect(previewBelow(3, 4, 5, 0, true, true)).toBe(true);
    expect(previewBelow(3, 4, 5, 0, true, false)).toBe(false);
  });

  it('takes the side that hides fewer cats between the rows', () => {
    expect(previewBelow(1, 4, 2, 0, true, true)).toBe(true);
    expect(previewBelow(2, 4, 0, 2, true, true)).toBe(false);
  });
});
