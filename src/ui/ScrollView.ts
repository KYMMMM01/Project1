import { Container, Graphics, Rectangle, type DestroyOptions, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import { game } from '@/core/game';
import { clamp, lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { TweenBag } from './motion';
import { cancelActivePress, type ScrollHost } from './press';
import { DRAG_THRESHOLD, ScrollAxis, VelocityTracker } from './scrollPhysics';

export interface ScrollViewOpts {
  width: number;
  height: number;
  /** Vertical scrolling (default true). */
  vertical?: boolean;
  horizontal?: boolean;
  /** Space kept around the content inside the view. */
  padding?: number;
  /** Extra space after the last row (home-indicator clearance); defaults to `padding`. */
  paddingBottom?: number;
  /** Thin scroll indicator that fades after a moment (default true). */
  indicator?: boolean;
  /** Rubber-band overscroll (default true). */
  elastic?: boolean;
}

/**
 * Masked, draggable scroll area with inertia, rubber-band overscroll and wheel support. Origin =
 * top-left of the view. Add children to `content`; its size is measured from them (refresh() after a
 * layout change, though adding/removing children re-measures automatically on the next frame).
 *
 * Drag vs tap: a press only becomes a drag after 8 px of travel. Below that, child buttons receive
 * the tap normally; once the threshold is crossed any pressed child button is cancelled (it releases
 * without firing) and the view takes over.
 */
export class ScrollView extends Container implements ScrollHost {
  readonly isScrollHost = true as const;
  readonly content = new Container();

  /** Carries the mask, so measuring `content` is never clipped by it. */
  private readonly clip = new Container();
  private viewW: number;
  private viewH: number;
  private readonly padding: number;
  private paddingBottom: number;
  private readonly vertical: boolean;
  private readonly horizontal: boolean;
  private readonly ay = new ScrollAxis();
  private readonly ax = new ScrollAxis();
  private readonly vy = new VelocityTracker();
  private readonly vx = new VelocityTracker();
  private readonly maskG = new Graphics();
  private readonly indicator: Graphics | null;
  private readonly bag = new TweenBag();
  private readonly scrollFns: ((x: number, y: number) => void)[] = [];

  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private lastX = 0;
  private lastY = 0;
  private pending = false;
  private dragging = false;
  private lock: 'x' | 'y' | null = null;
  private stopLoop: (() => void) | null = null;
  private dirty = false;
  private explicitW: number | undefined;
  private explicitH: number | undefined;

  constructor(opts: ScrollViewOpts) {
    super();
    this.viewW = opts.width;
    this.viewH = opts.height;
    this.padding = opts.padding ?? 0;
    this.paddingBottom = opts.paddingBottom ?? this.padding;
    this.vertical = opts.vertical ?? true;
    this.horizontal = opts.horizontal ?? false;
    this.ay.elastic = this.ax.elastic = opts.elastic ?? true;

    this.clip.addChild(this.content);
    this.addChild(this.clip, this.maskG);
    this.clip.mask = this.maskG;
    if (opts.indicator ?? true) {
      this.indicator = new Graphics();
      this.indicator.roundRect(0, 0, 6, 100, 3).fill({ color: 0xffffff, alpha: 0.5 });
      this.indicator.alpha = 0;
      this.addChild(this.indicator);
    } else {
      this.indicator = null;
    }

    this.eventMode = 'static';
    this.on('pointerdown', this.onDown);
    this.on('wheel', this.onWheel);
    this.content.on('childAdded', this.markDirty);
    this.content.on('childRemoved', this.markDirty);
    this.setViewSize(opts.width, opts.height);
  }

  get scrollX(): number {
    return this.ax.pos;
  }

  get scrollY(): number {
    return this.ay.pos;
  }

  get maxScrollY(): number {
    return this.ay.max;
  }

  get maxScrollX(): number {
    return this.ax.max;
  }

  /** True while a finger is actively dragging this view. */
  get isDragging(): boolean {
    return this.dragging;
  }

  get viewWidth(): number {
    return this.viewW;
  }

  get viewHeight(): number {
    return this.viewH;
  }

  /** Subscribe to scroll position changes. Returns an unsubscribe function. */
  onScroll(fn: (x: number, y: number) => void): () => void {
    this.scrollFns.push(fn);
    return () => {
      const i = this.scrollFns.indexOf(fn);
      if (i >= 0) this.scrollFns.splice(i, 1);
    };
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.maskG.clear().rect(0, 0, w, h).fill(0xffffff);
    this.hitArea = new Rectangle(0, 0, w, h);
    this.ay.viewport = h;
    this.ax.viewport = w;
    this.refresh();
  }

  /** Change the space after the last row (the safe-area inset can change on rotation). */
  setBottomPadding(v: number): void {
    if (v === this.paddingBottom) return;
    this.paddingBottom = v;
    this.refresh();
  }

  /** Force the scrollable size instead of measuring children (virtualised lists). */
  setContentSize(w?: number, h?: number): void {
    this.explicitW = w;
    this.explicitH = h;
    this.refresh();
  }

  /** Re-measure `content`. Call after changing child sizes or positions. */
  refresh(): void {
    this.dirty = false;
    let cw = this.explicitW;
    let ch = this.explicitH;
    if (cw === undefined || ch === undefined) {
      const b = this.content.getLocalBounds();
      cw ??= Math.max(0, b.maxX);
      ch ??= Math.max(0, b.maxY);
    }
    this.ax.setMax(this.horizontal ? cw + this.padding * 2 - this.viewW : 0);
    this.ay.setMax(this.vertical ? ch + this.padding + this.paddingBottom - this.viewH : 0);
    this.apply();
  }

  scrollToTop(animated = true): void {
    this.scrollTo(0, animated);
  }

  /** Scroll so that content offset `y` (and optionally `x`) sits at the top-left of the view. */
  scrollTo(y: number, animated = true, x?: number): void {
    if (this.dirty) this.refresh();
    this.stopMotion();
    const ty = clamp(y, 0, this.ay.max);
    const tx = x === undefined ? this.ax.pos : clamp(x, 0, this.ax.max);
    if (!animated) {
      this.ay.jump(ty);
      this.ax.jump(tx);
      this.apply();
      return;
    }
    const fy = this.ay.pos;
    const fx = this.ax.pos;
    const dist = Math.max(Math.abs(ty - fy), Math.abs(tx - fx));
    this.bag.runKeyed(this.ay, {
      duration: clamp(dist / 2200, 0.2, 0.55),
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.ay.pos = lerp(fy, ty, k);
        this.ax.pos = lerp(fx, tx, k);
        this.apply();
      },
      onComplete: () => {
        this.ay.jump(ty);
        this.ax.jump(tx);
        this.apply();
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    // Destroying the children fires childRemoved on `content`; without this the handler would
    // schedule a re-measure of a view that no longer exists.
    this.content.off('childAdded', this.markDirty);
    this.content.off('childRemoved', this.markDirty);
    this.releaseStage();
    this.stopLoop?.();
    this.stopLoop = null;
    this.bag.killAll();
    this.scrollFns.length = 0;
    super.destroy(options);
  }

  /* ---------------------------------------------------------------- input */

  private onDown = (e: FederatedPointerEvent): void => {
    if (this.pointerId !== -1) return;
    if (this.dirty) this.refresh();
    this.pointerId = e.pointerId;
    this.startX = this.lastX = e.global.x / game.scale;
    this.startY = this.lastY = e.global.y / game.scale;
    this.pending = true;
    this.dragging = false;
    this.lock = null;
    // A touch on a moving list stops it dead, like every native scroller.
    this.bag.killKeyed(this.ay);
    this.ay.vel = 0;
    this.ax.vel = 0;
    this.vy.reset();
    this.vx.reset();
    const stage = game.app.stage;
    stage.on('pointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);
    stage.on('pointercancel', this.onUp);
  };

  private onMove = (e: FederatedPointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    const px = e.global.x / game.scale;
    const py = e.global.y / game.scale;
    if (this.pending) {
      const dx = px - this.startX;
      const dy = py - this.startY;
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
      this.pending = false;
      this.dragging = true;
      if (this.vertical && this.horizontal) this.lock = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      else this.lock = this.horizontal ? 'x' : 'y';
      // From here the view owns the gesture: a button under the finger must not fire on release.
      cancelActivePress();
      this.ay.beginDrag();
      this.ax.beginDrag();
      this.showIndicator();
      // Start from the press point so the content does not jump by the threshold distance.
      this.lastX = this.startX;
      this.lastY = this.startY;
      this.vy.push(game.time, this.ay.pos);
      this.vx.push(game.time, this.ax.pos);
    }
    if (!this.dragging) return;
    if (this.lock === 'y') this.ay.dragBy(this.lastY - py);
    else this.ax.dragBy(this.lastX - px);
    this.lastX = px;
    this.lastY = py;
    this.vy.push(game.time, this.ay.pos);
    this.vx.push(game.time, this.ax.pos);
    this.apply();
  };

  private onUp = (e: FederatedPointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.releaseStage();
    this.pointerId = -1;
    this.pending = false;
    if (!this.dragging) return;
    this.dragging = false;
    this.ay.endDrag(this.lock === 'y' ? this.vy.velocity(game.time) : 0);
    this.ax.endDrag(this.lock === 'x' ? this.vx.velocity(game.time) : 0);
    this.startLoop();
  };

  private onWheel = (e: FederatedWheelEvent): void => {
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? this.viewH : 1;
    const horizontalIntent = this.horizontal && (!this.vertical || e.shiftKey);
    const d = (horizontalIntent && e.deltaX !== 0 ? e.deltaX : e.deltaY) * unit;
    const axis = horizontalIntent ? this.ax : this.ay;
    if (axis.max <= 0) return;
    e.preventDefault();
    this.stopMotion();
    const from = axis.pos;
    const to = clamp(from + d, 0, axis.max);
    this.showIndicator();
    this.bag.runKeyed(this.ay, {
      duration: 0.14,
      ease: Ease.quadOut,
      onUpdate: (k) => {
        axis.pos = lerp(from, to, k);
        this.apply();
      },
      onComplete: () => {
        axis.jump(to);
        this.apply();
        this.fadeIndicator();
      },
    });
  };

  private releaseStage(): void {
    const stage = game.app?.stage;
    if (!stage) return;
    stage.off('pointermove', this.onMove);
    stage.off('pointerup', this.onUp);
    stage.off('pointerupoutside', this.onUp);
    stage.off('pointercancel', this.onUp);
  }

  /* --------------------------------------------------------------- motion */

  private startLoop(): void {
    this.stopLoop ??= game.onUpdate((dt) => this.tick(dt));
  }

  private stopMotion(): void {
    this.bag.killKeyed(this.ay);
    this.ay.vel = 0;
    this.ax.vel = 0;
  }

  private tick(dt: number): void {
    const my = this.ay.update(dt);
    const mx = this.ax.update(dt);
    this.apply();
    if (!my && !mx) {
      this.stopLoop?.();
      this.stopLoop = null;
      this.fadeIndicator();
    }
  }

  private markDirty = (): void => {
    if (this.dirty || this.destroyed) return;
    this.dirty = true;
    this.bag.call(0, () => {
      if (this.dirty) this.refresh();
    });
  };

  private apply(): void {
    this.content.position.set(this.padding - this.ax.pos, this.padding - this.ay.pos);
    this.updateIndicator();
    for (let i = 0; i < this.scrollFns.length; i++) (this.scrollFns[i] as (x: number, y: number) => void)(this.ax.pos, this.ay.pos);
  }

  /* ------------------------------------------------------------ indicator */

  private updateIndicator(): void {
    const ind = this.indicator;
    if (!ind) return;
    if (this.ay.max <= 0) {
      ind.visible = false;
      return;
    }
    ind.visible = true;
    const track = this.viewH - 8;
    const len = clamp((track * this.viewH) / (this.ay.max + this.viewH), 44, track);
    // The bar shrinks while the list is rubber-banding so it never leaves its track.
    const l = Math.max(24, len - Math.abs(this.ay.overscroll) * 0.6);
    const t = clamp(this.ay.pos / this.ay.max, 0, 1);
    ind.scale.y = l / 100;
    ind.position.set(this.viewW - 10, 4 + (track - l) * t);
  }

  private showIndicator(): void {
    if (!this.indicator) return;
    this.bag.killKeyed(this.indicator);
    this.indicator.alpha = 1;
  }

  private fadeIndicator(): void {
    const ind = this.indicator;
    if (!ind || ind.alpha === 0) return;
    this.bag.runKeyed(ind, {
      duration: 0.4,
      delay: 0.6,
      ease: Ease.quadOut,
      onUpdate: (k) => {
        ind.alpha = 1 - k;
      },
    });
  }
}
