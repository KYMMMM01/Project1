import { Container, Graphics, Point } from 'pixi.js';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { clamp } from '@/core/math';
import { backOut, motion, TweenBag } from './motion';
import { drawSpeechBubble, paperSeed } from './paper';
import { uiLabel } from './text';
import { Color } from './theme';

export interface TooltipContent {
  title?: string;
  /** Already-translated body text. */
  text: string;
}

export interface TooltipOpts {
  /** Hold time before the bubble appears, seconds (default HOLD_DELAY). */
  delay?: number;
}

/** How long a press must be held before the bubble appears; a hold this long is not a tap. */
export const HOLD_DELAY = 0.35;

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

    const title = content.title ? uiLabel(content.title, { size: 30, color: Color.coralDark }) : null;
    const body = uiLabel(content.text, { size: 26, wrap: MAX_W - PAD * 2, lineHeight: 34 });
    const w = Math.min(MAX_W, Math.max(title?.width ?? 0, body.width) + PAD * 2);
    const h = PAD * 2 + body.height + (title ? title.height + 4 : 0);

    // Prefer above the target; flip below when the notch/top bar would clip it.
    const above = topLeft.y - ARROW - h >= game.safeTop + MARGIN;
    const x = clamp(cx - w / 2, MARGIN, game.w - MARGIN - w);
    const arrowX = clamp(cx - x, 34, w - 34);
    // Local frame: origin at the arrow tip so the pop animation grows out of the target.
    const bodyY = above ? -ARROW - h : ARROW;
    const g = new Graphics();
    // Cream paper, a hand-drawn brown line and a small tail whose tip is the local origin.
    drawSpeechBubble(g, -arrowX, bodyY, w, h, {
      radius: 26,
      seed: paperSeed(),
      tail: { side: above ? 'bottom' : 'top', x: arrowX, len: ARROW, half: 13 },
    });

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
    const delay = opts.delay ?? HOLD_DELAY;
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
