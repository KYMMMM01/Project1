import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Color, TweenBag, cacheStatic, drawPaper, fitWidth, motion, paperSeed, punch, uiLabel } from '@/ui';
import { xpFraction } from './layoutMath';

export const BADGE_R = 50;
const R_RING = 40;
const RING_W = 9;
const NUMBER_MAX_W = 2 * R_RING - 22;

/**
 * The account level as a round paper sticker; a painted ring around its edge fills with the XP earned
 * toward the next level. Origin = centre.
 */
export class LevelBadge extends Container {
  private readonly ring = new Graphics();
  private readonly numberT: Text;
  private readonly bag = new TweenBag();
  private level = -1;
  private fraction = 0;

  constructor() {
    super();
    const base = new Graphics();
    drawPaper(base, -BADGE_R, -BADGE_R, { w: BADGE_R * 2, h: BADGE_R * 2, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, grain: false, seed: paperSeed() });
    base.circle(0, 0, R_RING).stroke({ width: RING_W, color: Color.track });
    cacheStatic(base);
    const lv = uiLabel(t('shell.lv'), { size: 20, color: Color.inkSoft });
    lv.position.set(0, -20);
    this.numberT = uiLabel('1', { size: 34 });
    this.numberT.position.set(0, 8);
    this.addChild(base, this.ring, lv, this.numberT);
  }

  /** Show `level` and the share of the next level already earned. Animates the ring and punches on a level up. */
  set(level: number, into: number, need: number, animate = true): void {
    const target = xpFraction(into, need);
    const leveled = this.level >= 0 && level > this.level;
    if (level !== this.level) {
      this.level = level;
      this.numberT.text = String(level);
      fitWidth(this.numberT, NUMBER_MAX_W);
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
      g.circle(0, 0, R_RING).stroke({ width: RING_W, color: Color.teal });
      return;
    }
    const start = -Math.PI / 2;
    g.arc(0, 0, R_RING, start, start + fraction * Math.PI * 2).stroke({ width: RING_W, color: Color.teal, cap: 'round' });
  }
}
