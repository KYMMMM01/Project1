/**
 * The HUD's speech bubble for everything the player asks about (an enemy card, a toy, a cat's skill, a lit cell, a refused command, the
 * laser's state) and for a lesson's own line: the view behind `info` (src/view/info.ts, which owns the rule of when it opens and closes).
 * The kit tooltip always prefers the side above its target, which lands on whatever sits there; this one weighs both sides and keeps the
 * body on the screen (bubbleMath.ts), and lives on the battle's overlay layer, below any popup, so a popup never has a bubble over its title.
 */
import { Container, Graphics, Point, Rectangle, type Text } from 'pixi.js';
import { mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Color, drawIcon, drawPaper, drawSpeechBubble, motion, paperSeed, popIn, TweenBag, uiLabel } from '@/ui';
import { info, type InfoContent, type InfoView } from '../info';
import type { HudEnv } from './env';
import { BUBBLE_MARGIN, placeBubble, type Weighted } from './bubbleMath';
import { balanceWrap } from './kit';
import type { Rect } from './layoutMath';

const MAX_W = 460;
const PAD = 20;
const ARROW = 20;
/** The link row of a bubble is a full touch target; its paper is a little smaller than the row. */
const LINK_H = 88;
const LINK_PAPER = 64;
const LINK_GAP = 8;

export class HintBubble implements InfoView {
  private view: Container | null = null;
  private readonly bag = new TweenBag();
  /** Bubbles on their way out: each shrinks and fades in a tenth of a second instead of blinking off. */
  private readonly exitBag = new TweenBag();
  private readonly leaving = new Set<Container>();
  private readonly tl = new Point();
  private readonly br = new Point();

  constructor(
    private readonly env: HudEnv,
    private readonly layer: Container,
    /** What a bubble should not cover (the cats, the summon button, the lane ...), weighed when it picks a side. */
    private readonly avoid: () => Weighted[],
  ) {}

  /** Scene-space rectangle of a display object. */
  boundsOf(c: Container): Rect {
    const b = c.getBounds();
    this.tl.set(b.x, b.y);
    this.br.set(b.x + b.width, b.y + b.height);
    const a = this.env.toHud(this.tl);
    const z = this.env.toHud(this.br);
    return { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y };
  }

  /** Where a bubble with `content` would lie on a target rectangle (scene space), without showing it: for the QA hooks. */
  probe(target: Rect, content: InfoContent, prefer: 'above' | 'below'): Rect & { tail: number; above: boolean } {
    const m = this.measure(content);
    const fit = placeBubble({ target, w: m.w, h: m.h, bounds: this.bounds(), arrow: ARROW, prefer, avoid: this.avoid() });
    m.title?.destroy();
    m.body.destroy();
    m.link?.destroy();
    return { x: fit.x, y: fit.y, w: m.w, h: m.h, tail: fit.tail, above: fit.above };
  }

  private bounds(): Rect {
    const l = this.env.layout();
    return { x: 0, y: l.safeTop + BUBBLE_MARGIN, w: l.w, h: l.h - l.safeBottom - l.safeTop - BUBBLE_MARGIN * 2 };
  }

  private measure(content: InfoContent): { title: Text | null; body: Text; link: Text | null; w: number; h: number } {
    const title = content.title ? uiLabel(content.title, { size: 30, color: Color.coralDark }) : null;
    const body = uiLabel(content.text, { size: 26, wrap: MAX_W - PAD * 2, lineHeight: 34 });
    balanceWrap(body, MAX_W - PAD * 2);
    const link = content.link ? uiLabel(content.link.label, { size: 28, color: Color.inkDeep }) : null;
    const inner = Math.max(title?.width ?? 0, body.width, link ? link.width + 96 : 0);
    return {
      title, body, link, w: Math.min(MAX_W, inner + PAD * 2),
      h: PAD * 2 + body.height + (title ? title.height + 4 : 0) + (link ? LINK_GAP + LINK_H - PAD / 2 : 0),
    };
  }

  /** The tail tip is the container's origin, so the pop grows out of the target. A sticky bubble is a lesson's line: it never takes a tap. */
  show(target: Container, content: InfoContent, prefer: 'above' | 'below', sticky: boolean): void {
    this.hide(false);
    const box = this.boundsOf(target);
    const { title, body, link, w, h } = this.measure(content);
    const fit = placeBubble({ target: box, w, h, bounds: this.bounds(), arrow: ARROW, prefer, avoid: this.avoid() });
    const g = new Graphics();
    const bodyY = fit.above ? -fit.tail - h : fit.tail;
    drawSpeechBubble(g, -fit.tailX, bodyY, w, h, {
      radius: 26,
      seed: paperSeed(),
      tail: { side: fit.above ? 'bottom' : 'top', x: fit.tailX, len: fit.tail, half: 13 },
    });
    const view = new Container();
    view.addChild(g);
    let ty = bodyY + PAD;
    if (title) {
      title.position.set(-fit.tailX + w / 2, ty + title.height / 2);
      view.addChild(title);
      ty += title.height + 4;
    }
    body.position.set(-fit.tailX + w / 2, ty + body.height / 2);
    view.addChild(body);
    if (link && content.link) view.addChild(this.linkRow(link, content.link.run, w, -fit.tailX + w / 2, ty + body.height + LINK_GAP + LINK_H / 2));
    // A bubble the player asked for is theirs to dismiss: a tap on it closes it and goes no further.
    if (sticky) {
      view.eventMode = 'none';
    } else {
      view.eventMode = 'static';
      view.on('pointerdown', () => info.close());
    }
    view.position.set(fit.x + fit.tailX, fit.above ? fit.y + h + fit.tail : fit.y - fit.tail);
    this.layer.addChild(view);
    this.view = view;
    if (!motion.reduced) popIn(this.bag, view, { from: 0.6, duration: 0.16, overshoot: 2 });
  }

  /** The tappable line under the text: a teal paper with a book and the label, a whole touch target tall. It acts on the press, before the bubble's own close. */
  private linkRow(label: Text, run: () => void, bubbleW: number, cx: number, cy: number): Container {
    const w = bubbleW - PAD * 2;
    const row = new Container();
    row.position.set(cx, cy);
    const paper = new Graphics();
    drawPaper(paper, -w / 2, -LINK_PAPER / 2, { w, h: LINK_PAPER, radius: 20, fill: mixColor(Color.teal, Color.paperLight, 0.4), seed: paperSeed(), grain: false });
    const book = drawIcon('book', 34);
    const gap = 12;
    const total = book.width + gap + label.width;
    book.position.set(-total / 2 + book.width / 2, 0);
    label.position.set(-total / 2 + book.width + gap + label.width / 2, 1);
    row.addChild(paper, book, label);
    row.hitArea = new Rectangle(-w / 2, -LINK_H / 2, w, LINK_H);
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.on('pointerdown', (e) => {
      e.stopPropagation();
      run();
    });
    return row;
  }

  hide(animate = true): void {
    const view = this.view;
    this.bag.killAll();
    this.view = null;
    if (!view || view.destroyed) return;
    view.eventMode = 'none';
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
        if (view.destroyed) return;
        view.scale.set(s0 * (1 - 0.2 * k));
        view.alpha = a0 * (1 - k);
      },
      onComplete: () => {
        this.leaving.delete(view);
        if (!view.destroyed) view.destroy({ children: true });
      },
    });
  }

  destroy(): void {
    this.hide(false);
    this.exitBag.killAll();
    for (const v of this.leaving) if (!v.destroyed) v.destroy({ children: true });
    this.leaving.clear();
  }
}
