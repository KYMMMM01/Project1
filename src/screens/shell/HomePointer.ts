/**
 * The guidebook's "try it" on the home screen: after the tab is open, a soft spotlight with a dashed window round the control or
 * card the topic is about and the tutorial's paper hand tapping at it. It does not block anything: the first tap anywhere sends it
 * away (and still reaches the control under it). One pointer at a time; a new one replaces the old.
 */
import { Bounds, Container, Graphics, Point, Text } from 'pixi.js';
import { game } from '@/core/game';
import { Color, Dim, drawDashedRect, fadeTo, motion, paperSeed, TweenBag } from '@/ui';
import { Hand } from '@/view/hud/Hand';
import { shell } from './controller';
import { pawFor, pointerRect, type PointRect } from './pointerMath';

/** What the pointer shows: a control or card, or several that make up one (the butler-level tags). It answers anew each time, since blocks rebuild. */
export type PointTarget = Container | readonly Container[];
export type PointResolver = () => PointTarget | null;
/** The part of the screen the paw may cover: the page of the home screen by default, the body of a full-screen sheet otherwise. */
export type PointRoom = () => PointRect;

const homeRoom: PointRoom = () => shell.area;
/** Seconds between two measurements of where the target is. */
const MEASURE_EVERY = 0.1;
/** The spotlight is softer than the tutorial's: the page stays easy to read around the window. */
const SOFT = 0.5;
const FADE = 0.18;

const shown = (c: Container): boolean => {
  for (let n: Container | null = c; n; n = n.parent) if (!n.visible || n.destroyed) return false;
  return true;
};

class Pointer extends Container {
  private readonly dim = new Graphics();
  private readonly ring = new Graphics();
  private readonly hand = new Hand();
  private readonly bag = new TweenBag();
  private readonly seed = paperSeed();
  private readonly bounds = new Bounds();
  private readonly from = new Point();
  private readonly to = new Point();
  private readonly found: PointRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly part: PointRect = { x: 0, y: 0, w: 0, h: 0 };
  private readonly window: PointRect = { x: 0, y: 0, w: 0, h: 0 };
  private clock = 0;
  private drawnW = 0;
  private drawnH = 0;
  private pulsing = false;
  private tapping = false;
  private leaving = false;
  private readonly offFrame: () => void;

  constructor(
    private readonly resolve: PointResolver,
    private readonly room: PointRoom,
    private readonly onGone: () => void,
  ) {
    super();
    this.eventMode = 'none';
    this.addChild(this.dim, this.ring, this.hand);
    this.offFrame = game.onUpdate((dt) => this.update(dt));
    // The stage hears every press nothing stopped. The pointer is not in the way (eventMode 'none'), so the press reaches the control too.
    game.app.stage.on('pointerdown', this.leave, this);
    if (motion.reduced) return;
    this.alpha = 0;
    fadeTo(this.bag, this, 1, { duration: FADE });
  }

  /** `c`'s bounds in this layer's space, written to `out`. */
  private rectOf(c: Container, out: PointRect): PointRect {
    const b = c.getBounds(false, this.bounds);
    this.toLocal(this.from.set(b.minX, b.minY), undefined, this.to);
    out.x = this.to.x;
    out.y = this.to.y;
    this.toLocal(this.from.set(b.maxX, b.maxY), undefined, this.to);
    out.w = this.to.x - out.x;
    out.h = this.to.y - out.y;
    return out;
  }

  /** The lines of writing on the target, which the paw keeps off. */
  private writing(): PointRect[] {
    const out: PointRect[] = [];
    const walk = (c: Container): void => {
      for (const child of c.children) {
        if (!child.visible) continue;
        if (child instanceof Text) {
          if (child.text) out.push(this.rectOf(child, { x: 0, y: 0, w: 0, h: 0 }));
        } else walk(child);
      }
    };
    const target = this.resolve();
    if (target) for (const c of target instanceof Container ? [target] : target) walk(c);
    return out;
  }

  /** Where the target is now in this layer's space, as the window round it; false when it is gone or hidden. */
  private measure(): boolean {
    const target = this.resolve();
    if (!target) return false;
    const list: readonly Container[] = target instanceof Container ? [target] : target;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i] as Container;
      if (!shown(c)) return false;
      const r = this.rectOf(c, this.part);
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.w);
      maxY = Math.max(maxY, r.y + r.h);
    }
    if (!(maxX > minX && maxY > minY)) return false;
    this.found.x = minX;
    this.found.y = minY;
    this.found.w = maxX - minX;
    this.found.h = maxY - minY;
    return true;
  }

  /** Measure and, when the window is not where it was drawn (or the screen changed size), draw it again. False when the target is gone. */
  private follow(): boolean {
    if (!this.measure()) return false;
    const was = this.window;
    const x = was.x;
    const y = was.y;
    const w = was.w;
    const h = was.h;
    pointerRect(was, this.found, game.w, game.h);
    if (x !== was.x || y !== was.y || w !== was.w || h !== was.h || this.drawnW !== game.w || this.drawnH !== game.h) this.paint();
    return true;
  }

  private paint(): void {
    const { x, y, w, h } = this.window;
    this.drawnW = game.w;
    this.drawnH = game.h;
    const radius = Math.min(32, h / 2);
    this.dim.clear().rect(0, 0, game.w, game.h).fill({ color: Dim.backdrop, alpha: Dim.backdropAlpha * SOFT });
    this.dim.roundRect(x, y, w, h, radius).cut();
    this.ring.clear();
    drawDashedRect(this.ring, x, y, w, h, { radius, color: Color.paper, width: 5, seed: this.seed });
    if (!this.pulsing && !motion.reduced) {
      this.pulsing = true;
      this.bag.runKeyed(this.ring, { duration: 0.6, yoyo: true, repeat: -1, onUpdate: (k) => (this.ring.alpha = 0.55 + 0.45 * k) });
    }
    // The paw reaches in from below at a slant, its tip on the target, and stays on the page and off the target's writing.
    const paw = pawFor(this.found, this.room(), this.writing());
    this.hand.place(paw.x, paw.y, paw.rotation);
    // Patting goes on across repaints; only the first one starts it.
    if (!this.tapping) {
      this.tapping = true;
      this.hand.tap();
    }
  }

  private update(dt: number): void {
    if (this.leaving) return;
    this.clock += dt;
    if (this.clock < MEASURE_EVERY) return;
    this.clock = 0;
    if (!this.follow()) this.leave();
  }

  /** The first measurement, so the window is there on the first frame. */
  start(): boolean {
    return this.follow();
  }

  leave(): void {
    if (this.leaving || this.destroyed) return;
    this.leaving = true;
    game.app.stage.off('pointerdown', this.leave, this);
    this.offFrame();
    const gone = (): void => {
      this.onGone();
      this.destroy({ children: true });
    };
    if (motion.reduced) {
      gone();
      return;
    }
    fadeTo(this.bag, this, 0, { duration: FADE, onDone: gone });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    game.app.stage.off('pointerdown', this.leave, this);
    this.offFrame();
    this.bag.killAll();
    super.destroy(options);
  }
}

let active: Pointer | null = null;

/** Show the pointer over `parent` (a scene or the popup layer), on top of what is there. False when the target is not on screen. */
export function showPointer(parent: Container, resolve: PointResolver, room: PointRoom = homeRoom): boolean {
  clearPointer();
  const p: Pointer = new Pointer(resolve, room, () => {
    if (active === p) active = null;
  });
  parent.addChild(p);
  if (!p.start()) {
    p.destroy({ children: true });
    return false;
  }
  active = p;
  return true;
}

/** Take the pointer away at once (the scene or sheet it belongs to is going). */
export function clearPointer(): void {
  const p = active;
  active = null;
  if (p && !p.destroyed) p.destroy({ children: true });
}
