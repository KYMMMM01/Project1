/**
 * The paper speech bubble of the lessons: the topic's picture on a small tile, its words, and up to two buttons. The tutorial
 * uses it as a short note (two lines and, for a read-only lesson, "got it"); the first-encounter lessons use it as a card (title,
 * teaching text, "got it" and "more in the guidebook"). It sits on the side of its target where it hides less (bubbleMath.ts).
 */
import { Container, Graphics } from 'pixi.js';
import { Ease } from '@/core/tween';
import { illustration, topicDef, type TopicId } from '@/guide';
import { Button, drawSpeechBubble, motion, paperSeed, popIn, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import { BUBBLE_MARGIN, placeBubble, type Weighted } from './bubbleMath';
import type { Rect } from './layoutMath';

const PAD = 20;
const ARROW = 22;

export interface BubbleButton {
  label: string;
  style: 'primary' | 'neutral';
  /** Width in px; 0 takes what the row has left. */
  width: number;
}

export interface BubbleSpec {
  topic: TopicId;
  /** A heading above the words (the cards have one, the tutorial notes do not). */
  title: string | null;
  text: string;
  target: Rect;
  avoid: readonly Weighted[];
  prefer: 'above' | 'below';
  width: number;
  /** Side of the picture's tile. */
  tile: number;
  buttons: readonly BubbleButton[];
}

export class LessonBubble {
  private view: Container | null = null;
  private readonly bag = new TweenBag();
  private readonly exitBag = new TweenBag();
  private readonly leaving = new Set<Container>();

  constructor(
    private readonly env: HudEnv,
    private readonly layer: Container,
  ) {}

  get visible(): boolean {
    return this.view !== null;
  }

  show(spec: BubbleSpec, onButton: (index: number) => void): void {
    this.hide(false);
    const { width: W, tile } = spec;
    const textX = PAD + tile + 18;
    const textW = W - textX - PAD;
    const title = spec.title ? uiLabel(spec.title, { size: 32, anchorX: 0, anchorY: 0, wrap: textW, align: 'left', lineHeight: 38 }) : null;
    const body = uiLabel(spec.text, { size: 26, anchorX: 0, anchorY: 0, wrap: textW, align: 'left', lineHeight: 34 });
    const textH = (title ? title.height + 6 : 0) + body.height;
    const contentH = Math.max(tile, textH);
    const rowH = spec.buttons.length > 0 ? 88 : 0;
    const h = PAD * 2 + contentH + (rowH > 0 ? 18 + rowH : 0);
    const l = this.env.layout();
    const bounds: Rect = { x: 0, y: l.safeTop + BUBBLE_MARGIN, w: l.w, h: l.h - l.safeBottom - l.safeTop - BUBBLE_MARGIN * 2 };
    const fit = placeBubble({ target: spec.target, w: W, h, bounds, arrow: ARROW, prefer: spec.prefer, avoid: spec.avoid });
    const bodyY = fit.above ? -ARROW - h : ARROW;
    const g = new Graphics();
    drawSpeechBubble(g, -fit.tailX, bodyY, W, h, {
      radius: 28,
      seed: paperSeed(),
      tail: { side: fit.above ? 'bottom' : 'top', x: fit.tailX, len: ARROW, half: 14 },
    });
    const view = new Container();
    view.eventMode = 'passive';
    view.addChild(g);

    const pic = illustration(topicDef(spec.topic).art, tile);
    pic.position.set(-fit.tailX + PAD + tile / 2, bodyY + PAD + tile / 2);
    view.addChild(pic);
    let y = bodyY + PAD + (contentH - textH) / 2;
    if (title) {
      title.position.set(-fit.tailX + textX, y);
      y += title.height + 6;
      view.addChild(title);
    }
    body.position.set(-fit.tailX + textX, y);
    view.addChild(body);

    if (rowH > 0) {
      const inner = W - PAD * 2;
      const gap = 14;
      const fixed = spec.buttons.reduce((sum, b) => sum + b.width, 0);
      const flex = spec.buttons.filter((b) => b.width === 0).length;
      const rest = Math.max(160, (inner - fixed - gap * (spec.buttons.length - 1)) / Math.max(1, flex));
      let x = -fit.tailX + PAD;
      spec.buttons.forEach((b, i) => {
        const bw = b.width > 0 ? b.width : rest;
        const btn = new Button({ label: b.label, style: b.style, width: bw, height: rowH, fontSize: 28 });
        btn.position.set(x + bw / 2, bodyY + h - PAD - rowH / 2);
        btn.onTap(() => onButton(i));
        view.addChild(btn);
        x += bw + gap;
      });
    }

    view.position.set(fit.x + fit.tailX, fit.above ? fit.y + h + ARROW : fit.y - ARROW);
    this.layer.addChild(view);
    this.view = view;
    if (!motion.reduced) popIn(this.bag, view, { from: 0.7, duration: 0.18, overshoot: 2 });
  }

  hide(animate = true): void {
    const view = this.view;
    this.bag.killAll();
    this.view = null;
    if (!view || view.destroyed) return;
    if (!animate || motion.reduced) {
      view.destroy({ children: true });
      return;
    }
    const s0 = view.scale.x;
    const a0 = view.alpha;
    view.interactiveChildren = false;
    this.leaving.add(view);
    this.exitBag.run({
      duration: 0.12,
      ease: Ease.quadIn,
      onUpdate: (k) => {
        view.scale.set(s0 * (1 - 0.15 * k));
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
