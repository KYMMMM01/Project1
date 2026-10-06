import type { Container } from 'pixi.js';
import { Ease } from '@/core/tween';
import { TweenBag, motion } from '@/ui';

/** How far a bobbing piece lifts, how long one lift takes, and its tilt at the extremes (radians). */
const LIFT_PX = 7;
const LIFT_SECONDS = 1.25;
const TILT = 0.014;

/**
 * The main call-to-action lifts and settles like a piece of paper in a draught, with a slight tilt that
 * follows. Moves `node` around its own origin until `stopBob`; the tween lives in `bag`.
 */
export function startBob(bag: TweenBag, node: Container): void {
  if (motion.reduced) return;
  bag.runKeyed(node, {
    duration: LIFT_SECONDS,
    ease: Ease.sineInOut,
    yoyo: true,
    repeat: -1,
    onUpdate: (k) => {
      node.y = -LIFT_PX * k;
      node.rotation = (k - 0.5) * TILT;
    },
  });
}

export function stopBob(bag: TweenBag, node: Container): void {
  bag.killKeyed(node);
  node.position.set(0, 0);
  node.rotation = 0;
}
