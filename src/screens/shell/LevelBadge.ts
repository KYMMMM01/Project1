import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { Ease } from '@/core/tween';
import { Color, TweenBag, cacheStatic, motion, punch, uiLabel, vGradient } from '@/ui';
import { xpFraction } from './layoutMath';

const R_DISC = 34;
const R_RING = 43;
const RING_W = 9;

/** Account level in a round badge; the ring around it fills with the XP earned toward the next level. Origin = centre. */
export class LevelBadge extends Container {
  private readonly ring = new Graphics();
  private readonly numberT: Text;
  private readonly bag = new TweenBag();
  private level = -1;
  private fraction = 0;

  constructor() {
    super();
    const base = new Graphics();
    base.circle(0, 5, R_RING + 4).fill({ color: Color.black, alpha: 0.3 });
    base.circle(0, 0, R_RING + 4).fill(Color.outline);
    base.circle(0, 0, R_RING).stroke({ width: RING_W, color: Color.panelDark });
    base.circle(0, 0, R_DISC).fill(vGradient(Color.panelLight, Color.panelDark)).stroke({ width: 4, color: Color.outline });
    cacheStatic(base);
    this.numberT = uiLabel('1', { size: 40, strokeWidth: 6 });
    this.addChild(base, this.ring, this.numberT);
  }

  /** Show `level` and the share of the next level already earned. Animates the ring and punches on a level up. */
  set(level: number, into: number, need: number, animate = true): void {
    const target = xpFraction(into, need);
    const leveled = this.level >= 0 && level > this.level;
    if (level !== this.level) {
      this.level = level;
      this.numberT.text = String(level);
      this.numberT.scale.set(this.numberT.width > 2 * R_DISC - 10 ? (2 * R_DISC - 10) / this.numberT.width : 1);
      if (leveled && animate && !motion.reduced) punch(this.bag, this, 0.18, 0.3);
    }
    const from = this.fraction;
    this.bag.killKeyed(this.ring);
    if (!animate || motion.reduced || from === target) {
      this.fraction = target;
      this.drawRing(target);
      return;
    }
    this.bag.runKeyed(this.ring, {
      duration: 0.5,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.fraction = from + (target - from) * k;
        this.drawRing(this.fraction);
      },
      onComplete: () => {
        this.fraction = target;
        this.drawRing(target);
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private drawRing(fraction: number): void {
    const g = this.ring;
    g.clear();
    if (fraction <= 0.001) return;
    if (fraction >= 0.999) {
      g.circle(0, 0, R_RING).stroke({ width: RING_W, color: Color.primary });
      return;
    }
    const start = -Math.PI / 2;
    g.arc(0, 0, R_RING, start, start + fraction * Math.PI * 2).stroke({ width: RING_W, color: Color.primary, cap: 'round' });
  }
}
