import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import type { UnitId } from '@/game/api';
import { unitRarity } from '@/game/data/roster';
import { unitPortrait } from '../shop/art';
import {
  backOut, bindPress, CardFrame, Color, drawGlow, drawIcon, motion, ProgressBar, TweenBag, vGradient,
  type PressBinding,
} from '@/ui';
import type { CardProgress } from './collection';

/** Footprint of a medium card plate; the card is scaled from it. */
export const CARD_W = 220;
export const CARD_H = 292;
/** Space the crest / wings add above the plate, and the gap kept under a row. */
export const CARD_CREST = 30;

export interface CatCardState {
  level: number;
  /** Null for a guardian: it has no cards of its own. */
  progress: CardProgress | null;
  ready: boolean;
}

/**
 * One collection card: frame, portrait, level, card progress and the "ready to upgrade" badge.
 * Built once; `setState` updates it in place. Origin = centre of the plate.
 */
export class CatCard extends Container {
  readonly unit: UnitId;
  private readonly bag = new TweenBag();
  private readonly pivotBody = new Container();
  private readonly frame: CardFrame;
  private readonly maxBar: ProgressBar;
  private readonly readyBadge = new Container();
  private readonly press: PressBinding;
  private readonly baseScale: number;
  private tapFn: ((unit: UnitId) => void) | null = null;
  private ready = false;
  private shown = false;

  constructor(unit: UnitId, scale: number, guardian = false) {
    super();
    this.unit = unit;
    this.baseScale = scale;
    const rarity = unitRarity(unit);
    this.frame = new CardFrame({
      rarity,
      size: 'medium',
      portrait: unitPortrait(unit, rarity, 220),
      name: t(`unit.${unit}.name`),
      levelText: t('cats.lv', { n: 1 }),
      owned: guardian ? undefined : 0,
      needed: guardian ? undefined : 1,
    });
    this.maxBar = new ProgressBar({ width: CARD_W - 30, height: 28, color: 'gold', value: 1, label: t('cats.max') });
    this.maxBar.position.set(0, CARD_H / 2 - 14 - 14 - 2);
    this.maxBar.visible = false;

    const badge = new Graphics();
    badge.circle(0, 0, 30).fill(vGradient(Color.success, Color.successDark)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    drawGlow(badge, 0, 0, 44, Color.success, 0.45);
    this.readyBadge.addChild(badge, drawIcon('arrow_up', 38, Color.white));
    this.readyBadge.position.set(CARD_W / 2 - 38, -CARD_H / 2 + 52);
    this.readyBadge.visible = false;

    this.pivotBody.addChild(this.frame, this.maxBar, this.readyBadge);
    this.addChild(this.pivotBody);
    this.scale.set(scale);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-CARD_W / 2, -CARD_H / 2 - CARD_CREST, CARD_W, CARD_H + CARD_CREST);
    this.press = bindPress(this, {
      down: () => {
        this.bag.killOf(this.pivotBody);
        this.pivotBody.scale.set(0.95);
      },
      up: (fire) => {
        this.bag.to(this.pivotBody.scale, { x: 1, y: 1 }, { duration: motion.reduced ? 0 : 0.16, ease: backOut(1.6) });
        if (fire) {
          audio.play('ui_click');
          this.tapFn?.(this.unit);
        }
      },
    });
  }

  onTap(fn: ((unit: UnitId) => void) | null): this {
    this.tapFn = fn;
    return this;
  }

  get size(): { w: number; h: number } {
    return { w: CARD_W * this.baseScale, h: CARD_H * this.baseScale };
  }

  setState(s: CatCardState): void {
    this.frame.setLevel(t('cats.lv', { n: s.level }));
    if (s.progress) {
      this.frame.setProgress(s.progress.have, s.progress.needed);
      this.maxBar.visible = s.progress.maxed;
    } else {
      this.maxBar.visible = false;
    }
    if (s.ready === this.ready && this.shown) return;
    const wasReady = this.ready;
    this.ready = s.ready;
    this.shown = true;
    this.readyBadge.visible = s.ready;
    if (s.ready && !wasReady && !motion.reduced) {
      this.readyBadge.scale.set(0);
      this.bag.to(this.readyBadge.scale, { x: 1, y: 1 }, { duration: 0.3, ease: backOut(2.6) });
      this.bag.run({
        delay: 0.4, duration: 0.9, repeat: 2, yoyo: true,
        onUpdate: (k) => this.readyBadge.scale.set(1 + 0.12 * k),
        onComplete: () => this.readyBadge.scale.set(1),
      });
    } else {
      this.readyBadge.scale.set(1);
    }
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.press.dispose();
    this.tapFn = null;
    super.destroy(options);
  }
}
