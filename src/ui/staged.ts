import { motion, TweenBag } from './motion';

/**
 * Builds a heavy screen over a few frames. A screen's first draw is made of what it holds: tens of paper pieces and texts built and drawn in
 * one frame take 40 ms, the same pieces over three frames take 14 each, and the entrance animation that is already running hides the ones
 * that come later. The caller builds what the entrance needs (the frame, the header, the close button) itself and hands the rest in as
 * `stages`: `start()` runs the first one on the screen's second frame (the first draws what the caller built), each next one a frame after
 * that. Without motion there is no entrance to hide behind, so everything is built at once. `finish()` runs what is left now (the warm-up
 * draws the whole screen; a test); `destroy()` drops it.
 */
export class Staged {
  private next = 0;
  private readonly bag = new TweenBag();

  constructor(private readonly stages: readonly (() => void)[]) {}

  get done(): boolean {
    return this.next >= this.stages.length;
  }

  start(): void {
    if (motion.reduced) this.finish();
    // A screen is opened between two frames: the next tick is its first frame, which belongs to what the caller built.
    else this.wait(1);
  }

  finish(): void {
    this.bag.killAll();
    while (!this.done) this.step();
  }

  destroy(): void {
    this.bag.killAll();
    this.next = this.stages.length;
  }

  /** Lets `frames` ticks pass, then builds a stage and waits one tick for the next. */
  private wait(frames: number): void {
    if (this.done) return;
    this.bag.call(0, () => {
      if (frames > 0) {
        this.wait(frames - 1);
        return;
      }
      this.step();
      this.wait(0);
    });
  }

  private step(): void {
    (this.stages[this.next++] as () => void)();
  }
}
