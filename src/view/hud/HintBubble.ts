/**
 * The HUD's own speech bubble for one-time hints and refusals. The kit tooltip always prefers the side
 * above its target, which lands on whatever sits there; this one weighs both sides (bubbleMath.ts) and
 * lives on the battle's overlay layer, below any popup, so a popup never has a bubble over its title.
 */
import { Container, Graphics, Point } from 'pixi.js';
import { Ease } from '@/core/tween';
import { drawSpeechBubble, motion, paperSeed, popIn, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import { BUBBLE_MARGIN, placeBubble, unionRect, type Weighted } from './bubbleMath';
import type { Rect } from './layoutMath';

const MAX_W = 460;
const PAD = 18;
const ARROW = 20;

export class HintBubble {
  private view: Container | null = null;
  private owner: Container | null = null;
  private readonly bag = new TweenBag();
  /** Bubbles on their way out: each shrinks and fades in a tenth of a second instead of blinking off. */
  private readonly exitBag = new TweenBag();
  private readonly leaving = new Set<Container>();
  private readonly tl = new Point();
  private readonly br = new Point();

  constructor(
    private readonly env: HudEnv,
    private readonly layer: Container,
  ) {}

  get visible(): boolean {
    return this.view !== null;
  }

  get target(): Container | null {
    return this.owner;
  }

  /** Scene-space rectangle of a display object. */
  boundsOf(c: Container): Rect {
    const b = c.getBounds();
    this.tl.set(b.x, b.y);
    this.br.set(b.x + b.width, b.y + b.height);
    const a = this.env.toHud(this.tl);
    const z = this.env.toHud(this.br);
    return { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y };
  }

  /** Show `text` on `target` (and `also`, when the bubble is about a pair). The tail tip is the container's origin, so the pop grows out of the target. */
  show(target: Container, text: string, avoid: readonly Weighted[], prefer: 'above' | 'below', also?: Container): void {
    this.hide();
    this.owner = target;
    let box = this.boundsOf(target);
    if (also) box = unionRect(box, this.boundsOf(also));
    const body = uiLabel(text, { size: 26, wrap: MAX_W - PAD * 2, lineHeight: 34 });
    const w = Math.min(MAX_W, body.width + PAD * 2);
    const h = PAD * 2 + body.height;
    const l = this.env.layout();
    const bounds: Rect = { x: 0, y: l.safeTop + BUBBLE_MARGIN, w: l.w, h: l.h - l.safeBottom - l.safeTop - BUBBLE_MARGIN * 2 };
    const fit = placeBubble({ target: box, w, h, bounds, arrow: ARROW, prefer, avoid });
    const g = new Graphics();
    const bodyY = fit.above ? -ARROW - h : ARROW;
    drawSpeechBubble(g, -fit.tailX, bodyY, w, h, {
      radius: 26,
      seed: paperSeed(),
      tail: { side: fit.above ? 'bottom' : 'top', x: fit.tailX, len: ARROW, half: 13 },
    });
    body.position.set(-fit.tailX + w / 2, bodyY + PAD + body.height / 2);
    const view = new Container();
    view.addChild(g, body);
    view.eventMode = 'none';
    view.position.set(fit.x + fit.tailX, fit.above ? fit.y + h + ARROW : fit.y - ARROW);
    this.layer.addChild(view);
    this.view = view;
    if (!motion.reduced) popIn(this.bag, view, { from: 0.6, duration: 0.16, overshoot: 2 });
  }

  hide(animate = true): void {
    const view = this.view;
    this.bag.killAll();
    this.view = null;
    this.owner = null;
    if (!view || view.destroyed) return;
    if (!animate || motion.reduced) {
      view.destroy({ children: true });
      return;
    }
    const s0 = view.scale.x;
    const a0 = view.alpha;
    this.leaving.add(view);
    this.exitBag.run({
      duration: 0.1,
      ease: Ease.quadIn,
      onUpdate: (k) => {
        view.scale.set(s0 * (1 - 0.2 * k));
        view.alpha = a0 * (1 - k);
      },
      onComplete: () => {
        this.leaving.delete(view);
        view.destroy({ children: true });
      },
    });
  }

  destroy(): void {
    this.hide(false);
    this.exitBag.killAll();
    for (const v of this.leaving) v.destroy({ children: true });
    this.leaving.clear();
  }
}
