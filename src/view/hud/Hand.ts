/** The tutorial's pointing hand. Its origin is the fingertip; it taps in place or drags between two points. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { Ease } from '@/core/tween';
import { Color, motion, TweenBag } from '@/ui';

export class Hand extends Container {
  private readonly bag = new TweenBag();
  private readonly art = new Container();
  private readonly ring = new Graphics();

  constructor() {
    super();
    const g = new Graphics();
    const skin = Color.white;
    const line = { width: 5, color: Color.outline, join: 'round' as const };
    // Curled fingers, palm, thumb, then the pointing finger on top: the fingertip sits at (0, 0).
    g.roundRect(-4, 38, 66, 70, 26).fill(skin).stroke(line);
    for (let i = 0; i < 3; i++) g.roundRect(12 + i * 15, 30 - i * 2, 18, 34, 9).fill(skin).stroke({ ...line, width: 4 });
    g.roundRect(-36, 54, 24, 48, 12).fill(skin).stroke({ ...line, width: 4 });
    g.roundRect(-9, 0, 24, 74, 12).fill(skin).stroke(line);
    g.roundRect(-3, 6, 7, 40, 3.5).fill({ color: Color.white, alpha: 0.7 });
    this.art.addChild(g);
    this.ring.alpha = 0;
    this.addChild(this.ring, this.art);
    this.eventMode = 'none';
  }

  /** Tap in place, forever. */
  tap(): void {
    this.bag.killAll();
    this.art.position.set(0, 0);
    if (motion.reduced) return;
    this.bag.run({
      duration: 1.1,
      repeat: -1,
      ease: Ease.linear,
      onUpdate: (k) => {
        const press = k < 0.25 ? Ease.cubicOut(k / 0.25) : k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.25);
        this.art.position.set(0, 4 + 16 * press);
        // Ripple under the fingertip when the finger lands.
        const r = k > 0.26 && k < 0.7 ? (k - 0.26) / 0.44 : -1;
        this.ring.clear();
        if (r >= 0) {
          this.ring.circle(0, 0, 14 + r * 40).stroke({ width: 5, color: Color.white, alpha: 0.9 * (1 - r) });
          this.ring.alpha = 1;
        }
      },
    });
  }

  /** Drag from (ax, ay) to (bx, by) and back to the start, forever. Coordinates are in the parent's space. */
  drag(ax: number, ay: number, bx: number, by: number): void {
    this.bag.killAll();
    this.position.set(ax, ay);
    this.art.position.set(0, 0);
    if (motion.reduced) return;
    this.bag.run({
      duration: 2.2,
      repeat: -1,
      ease: Ease.linear,
      onUpdate: (k) => {
        // 0-.15 press, .15-.65 travel, .65-.8 hold, .8-.9 lift, rest: reset
        let t = 0;
        let down = 0;
        if (k < 0.15) down = Ease.cubicOut(k / 0.15);
        else if (k < 0.65) {
          down = 1;
          t = Ease.cubicInOut((k - 0.15) / 0.5);
        } else if (k < 0.8) {
          down = 1;
          t = 1;
        } else if (k < 0.9) {
          t = 1;
          down = 1 - (k - 0.8) / 0.1;
        }
        this.position.set(ax + (bx - ax) * t, ay + (by - ay) * t);
        this.art.position.set(0, 4 + 14 * down);
        this.alpha = k > 0.9 ? Math.max(0, 1 - (k - 0.9) / 0.05) : k < 0.04 ? k / 0.04 : 1;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
