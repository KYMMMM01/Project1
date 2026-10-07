import type { Container } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TweenBag, motion, type Button } from '@/ui';

/** How far a bobbing piece lifts, how long one lift takes, and its tilt at the extremes (radians). */
const LIFT_PX = 9;
const LIFT_SECONDS = 1.25;
const TILT = 0.014;

/**
 * The main call-to-action lifts and settles like a piece of paper in a draught, with a slight tilt that
 * follows. With `button` only the paper rises and its shadow stays on the floor, so the gap shows the
 * height; without it `node` moves as a whole. The tween lives in `bag`; stopBob puts everything back.
 */
export function startBob(bag: TweenBag, node: Container, button?: Button): void {
  if (motion.reduced) return;
  bag.runKeyed(node, {
    duration: LIFT_SECONDS,
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: -1,
    onUpdate: (k) => {
      if (button) button.setLift(LIFT_PX * k);
      else node.y = -LIFT_PX * k;
      node.rotation = (k - 0.5) * TILT;
    },
  });
}

export function stopBob(bag: TweenBag, node: Container, button?: Button): void {
  bag.killKeyed(node);
  button?.setLift(0);
  node.position.set(0, 0);
  node.rotation = 0;
}
