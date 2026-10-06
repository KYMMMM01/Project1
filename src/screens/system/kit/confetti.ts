/** A shower of paper confetti over everything, for the one moment per screen that earns it. */
import { game } from '@/core/game';
import { uiTweens, type Tween } from '@/core/tween';
import { Fx } from '@/fx';

/** How long the effects layer stays alive after the last burst: longer than the slowest piece falls. */
const LINGER = 4.5;

let fx: Fx | null = null;
let offUpdate: (() => void) | null = null;
let teardown: Tween | null = null;

/** Release the effects layer at once (the home scene is going away). */
export function stopConfetti(): void {
  teardown?.kill();
  teardown = null;
  offUpdate?.();
  offUpdate = null;
  fx?.destroy();
  fx = null;
}

/** Rain paper pieces from the top of the screen, `count` of them, centred on `x`. */
export function paperConfetti(count: number, x = game.w / 2): void {
  if (!fx) {
    const made = new Fx(game.overlayLayer, uiTweens);
    fx = made;
    offUpdate = game.onUpdate((dt) => made.update(dt));
  }
  fx.confettiRain({ count, x, y: -30, width: game.w });
  teardown?.kill();
  teardown = uiTweens.run({
    duration: LINGER,
    onComplete: () => {
      teardown = null;
      stopConfetti();
    },
  });
}
