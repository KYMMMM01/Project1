import { Container, Graphics, Point } from 'pixi.js';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { clamp } from '@/core/math';
import { backOut, motion, TweenBag } from './motion';
import { drawShadow, vGradient } from './shapes';
import { uiLabel } from './text';
import { Color } from './theme';

export interface TooltipContent {
  title?: string;
  /** Already-translated body text. */
  text: string;
}

export interface TooltipOpts {
  /** Hold time before the bubble appears, seconds. Default 0.35. */
  delay?: number;
}

const MAX_W = 460;
const PAD = 22;
const ARROW = 20;
const MARGIN = 14;

/**
 * Info bubble for a held-down element. One bubble at a time on game.overlayLayer; it points at the
 * target with an arrow and flips below it (and slides sideways) when there is no room above.
 */
class TooltipManager {
  private bubble: Container | null = null;
  private readonly bag = new TweenBag();
  private owner: Container | null = null;

  /** Show the bubble for `target` now. It stays until hide() (or `autoHide` seconds). */
  show(target: Container, content: TooltipContent, autoHide?: number): void {
    this.hide();
    this.owner = target;
    const b = target.getBounds();
    const topLeft = game.overlayLayer.toLocal(new Point(b.x, b.y));
    const botRight = game.overlayLayer.toLocal(new Point(b.x + b.width, b.y + b.height));
    const cx = (topLeft.x + botRight.x) / 2;

    const title = content.title ? uiLabel(content.title, { size: 30, color: 0xffd54a, strokeWidth: 5, shadow: false }) : null;
    const body = uiLabel(content.text, {
      size: 26,
      wrap: MAX_W - PAD * 2,
      lineHeight: 34,
      stroke: Color.outline,
      strokeWidth: 4,
      shadow: false,
    });
    const w = Math.min(MAX_W, Math.max(title?.width ?? 0, body.width) + PAD * 2);
    const h = PAD * 2 + body.height + (title ? title.height + 4 : 0);

    // Prefer above the target; flip below when the notch/top bar would clip it.
    const above = topLeft.y - ARROW - h >= game.safeTop + MARGIN;
    const x = clamp(cx - w / 2, MARGIN, game.w - MARGIN - w);
    const arrowX = clamp(cx - x, 34, w - 34);
    // Local frame: origin at the arrow tip so the pop animation grows out of the target.
    const bodyY = above ? -ARROW - h : ARROW;
    const g = new Graphics();
    drawShadow(g, -arrowX, bodyY, w, h, 26, { alpha: 0.4, spread: 10, offsetY: 6 });
    const dir = above ? -1 : 1;
    g.poly([0, 0, -ARROW * 0.9, dir * -ARROW, ARROW * 0.9, dir * -ARROW])
      .fill(vGradient(0x2d2060, 0x241a4a))
      .stroke({ width: 5, color: Color.outline, join: 'round' });
    g.roundRect(-arrowX, bodyY, w, h, 26)
      .fill(vGradient(0x35286f, 0x241a4a))
      .stroke({ width: 5, color: Color.outline, alignment: 1 });
    g.roundRect(-arrowX + 6, bodyY + 6, w - 12, h - 12, 20).stroke({ width: 2, color: 0x8f7bd8, alpha: 0.5, alignment: 1 });
    // cover the seam between arrow and body
    g.rect(-ARROW * 0.9 + 3, bodyY + (above ? h - 7 : 2), ARROW * 1.8 - 6, 5).fill(0x2a1f58);

    const bubble = new Container();
    bubble.addChild(g);
    let ty = bodyY + PAD;
    if (title) {
      title.position.set(-arrowX + w / 2, ty + title.height / 2);
      bubble.addChild(title);
      ty += title.height + 4;
    }
    body.position.set(-arrowX + w / 2, ty + body.height / 2);
    bubble.addChild(body);
    bubble.position.set(x + arrowX, above ? topLeft.y : botRight.y);
    bubble.eventMode = 'none';
    game.overlayLayer.addChild(bubble);
    this.bubble = bubble;
    haptic('light');

    if (!motion.reduced) {
      const pop = backOut(2);
      bubble.alpha = 0;
      this.bag.runKeyed(bubble, {
        duration: 0.16,
        onUpdate: (k) => {
          bubble.scale.set(0.6 + 0.4 * pop(k));
          bubble.alpha = Math.min(1, k * 3);
        },
        onComplete: () => {
          bubble.scale.set(1);
          bubble.alpha = 1;
        },
      });
    }
    if (autoHide) this.bag.call(autoHide, () => this.hide());
  }

  hide(): void {
    this.bag.killAll();
    if (this.bubble) {
      this.bubble.destroy({ children: true });
      this.bubble = null;
    }
    this.owner = null;
  }

  get visible(): boolean {
    return this.bubble !== null;
  }

  get target(): Container | null {
    return this.owner;
  }

  /**
   * Press-and-hold behaviour: hold `target` for `delay` seconds to show the bubble, release to hide.
   * `content` may be a function so the text can reflect live state. Returns a detach function.
   */
  attach(target: Container, content: TooltipContent | (() => TooltipContent), opts: TooltipOpts = {}): () => void {
    if (target.eventMode === 'none' || target.eventMode === 'passive' || target.eventMode === 'auto') {
      target.eventMode = 'static';
    }
    const delay = opts.delay ?? 0.35;
    let timer: ReturnType<TweenBag['call']> | null = null;
    const start = (): void => {
      timer?.kill();
      timer = this.bag.call(delay, () => this.show(target, typeof content === 'function' ? content() : content));
    };
    const stop = (): void => {
      timer?.kill();
      timer = null;
      if (this.owner === target) this.hide();
    };
    target.on('pointerdown', start);
    target.on('pointerup', stop);
    target.on('pointerupoutside', stop);
    target.on('pointerleave', stop);
    target.on('pointercancel', stop);
    return () => {
      stop();
      target.off('pointerdown', start);
      target.off('pointerup', stop);
      target.off('pointerupoutside', stop);
      target.off('pointerleave', stop);
      target.off('pointercancel', stop);
    };
  }
}

export const tooltip = new TooltipManager();

/** Shorthand for tooltip.attach. */
export function attachTooltip(
  target: Container,
  content: TooltipContent | (() => TooltipContent),
  opts?: TooltipOpts,
): () => void {
  return tooltip.attach(target, content, opts);
}
