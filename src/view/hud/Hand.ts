/** The tutorial's pointer: a cat's paw sticker reaching up. Its origin is the paw tip; it taps in place or drags between two points. */
import { Container, Graphics, Sprite, type DestroyOptions } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { Ease } from '@/core/tween';
import { Color, motion, TweenBag } from '@/ui';

/** Drawn height of the paw sticker in design pixels. */
const PAW_H = 124;
/** The tip sits just inside the sticker's white border, this far down the image. */
const PAW_TIP = 0.05;

export class Hand extends Container {
  private readonly bag = new TweenBag();
  private readonly art = new Container();
  private readonly ring = new Graphics();

  constructor() {
    super();
    if (hasTex('icon_hand')) {
      const paw = new Sprite(tex('icon_hand'));
      paw.anchor.set(0.5, PAW_TIP);
      paw.scale.set(PAW_H / paw.texture.height);
      this.art.addChild(paw);
    } else {
      // Fallback without the image: a paper mitten with the same origin and reach.
      const g = new Graphics();
      const line = { width: 5, color: Color.ink, join: 'round' as const };
      g.roundRect(-26, 44, 52, 70, 20).fill(Color.mustard).stroke(line);
      g.circle(0, 30, 32).fill(Color.paperLight).stroke(line);
      this.art.addChild(g);
    }
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
          this.ring.circle(0, 0, 14 + r * 40).stroke({ width: 5, color: Color.teal, alpha: 0.9 * (1 - r) });
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
