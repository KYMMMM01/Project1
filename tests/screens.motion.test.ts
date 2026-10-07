import { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { uiTweens } from '@/core/tween';
import { motion } from '@/ui';
import { justRefused, refusalCue } from '@/ui/press';
import { SubCard } from '@/screens/shop/blockKit';
import { StampMark, stampPending } from '@/screens/system/kit/marks';

function run(seconds: number): void {
  for (let t = 0; t < seconds; t += 1 / 60) uiTweens.update(1 / 60);
}

describe('motion of the screens', () => {
  let was = false;
  beforeEach(() => {
    was = motion.reduced;
    motion.reduced = false;
  });
  afterEach(() => {
    motion.reduced = was;
  });

  it('a dealt card waits for its turn, lands in place and rests untouched', () => {
    const parent = new Container();
    const card = new SubCard(200, 300);
    card.position.set(100, 150);
    parent.addChild(card);
    card.deal(3);
    expect(card.alpha).toBe(0);
    expect(card.y).toBeGreaterThan(150);
    run(0.1);
    expect(card.alpha).toBe(0);
    run(1);
    expect(card.alpha).toBe(1);
    expect(card.y).toBe(150);
    expect(card.rotation).toBe(0);
    expect(card.scale.x).toBe(1);
    card.destroy();
  });

  it('a destroyed card leaves no tween behind', () => {
    const card = new SubCard(200, 300);
    card.deal(0);
    card.destroy();
    expect(() => run(1)).not.toThrow();
  });

  it('a slammed stamp tells a claim to wait for it, and only in the same moment', () => {
    expect(stampPending()).toBeNull();
    const stamp = new StampMark();
    stamp.slam();
    expect(stampPending()).toBeCloseTo(0.3, 5);
    stamp.destroy();
  });

  it('under reduced motion the stamp has already landed', () => {
    motion.reduced = true;
    const stamp = new StampMark();
    stamp.slam();
    expect(stampPending()).toBe(0);
    stamp.destroy();
  });

  it('a refusal cue keeps the toast quiet', () => {
    refusalCue();
    expect(justRefused()).toBe(true);
  });
});
