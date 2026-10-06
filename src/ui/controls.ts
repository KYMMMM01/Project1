import { Container, Graphics, NineSliceSprite, Point, Rectangle, type DestroyOptions, type FederatedPointerEvent, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { clamp, clamp01, lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon } from './icons';
import { IconButton } from './IconButton';
import type { Box } from './layoutMath';
import { backOut, motion, TweenBag } from './motion';
import { drawPaper, drawPaperFace, paperSeed } from './paper';
import { cacheStatic, paintTexture } from './shapes';
import { uiLabel } from './text';
import { Color, Hit } from './theme';

/* ------------------------------------------------------------------- toggle */

export interface ToggleOpts {
  value?: boolean;
  onChange?: (value: boolean) => void;
}

const TW = 116;
const TH = 62;

/**
 * On/off switch. The state is never colour-only: the knob carries a check mark when on. Origin =
 * centre; the touch target is at least 88 tall.
 */
export class Toggle extends Container {
  readonly uiBox: Box = { x: -TW / 2, y: -TH / 2, w: TW, h: TH + 6 };
  private readonly onLayer = new Graphics();
  private readonly knob = new Container();
  private readonly check: Graphics;
  private readonly bag = new TweenBag();
  private state: boolean;
  private changeFn: ((v: boolean) => void) | null;
  private pos = 0;
  private pressed = false;

  constructor(opts: ToggleOpts = {}) {
    super();
    this.state = opts.value ?? false;
    this.changeFn = opts.onChange ?? null;

    const seed = paperSeed();
    const off = new Graphics();
    drawPaper(off, -TW / 2, -TH / 2, { w: TW, h: TH, kind: 'pill', fill: Color.track, edge: Color.kraftDark, shadow: 4, grain: false, seed });
    drawPaperFace(this.onLayer, -TW / 2, -TH / 2, { w: TW, h: TH, kind: 'pill', fill: Color.leaf, edge: Color.leafDark, grain: false, seed });

    const k = new Graphics();
    drawPaper(k, -26, -26, { w: 52, h: 52, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 1 });
    this.check = drawIcon('check', 24, Color.leafDark);
    this.check.position.y = 1;
    this.knob.addChild(k, this.check);
    cacheStatic(off);
    cacheStatic(this.onLayer);
    cacheStatic(k);
    this.addChild(off, this.onLayer, this.knob);

    this.pos = this.state ? 1 : 0;
    this.render();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-Math.max(TW, Hit.min) / 2, -Hit.min / 2, Math.max(TW, Hit.min), Hit.min);
    this.on('pointerdown', this.onDown);
    this.on('pointerup', this.onUp);
    this.on('pointerupoutside', this.cancel, this);
    this.on('pointerleave', this.cancel, this);
  }

  get value(): boolean {
    return this.state;
  }

  onChange(fn: ((v: boolean) => void) | null): this {
    this.changeFn = fn;
    return this;
  }

  /** Set without firing onChange. */
  setValue(v: boolean, animate = true): void {
    if (v === this.state) return;
    this.state = v;
    this.slide(animate);
  }

  /** The knob squashes on the pointerdown frame so the switch answers instantly. */
  private onDown = (): void => {
    this.pressed = true;
    this.knob.scale.set(1.12, 0.94);
  };

  private onUp = (): void => {
    if (!this.pressed) return;
    this.pressed = false;
    this.knob.scale.set(1);
    this.flip();
  };

  private cancel(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.knob.scale.set(1);
  }

  private flip(): void {
    this.state = !this.state;
    audio.play('ui_toggle');
    haptic('light');
    this.slide(true);
    this.changeFn?.(this.state);
  }

  private slide(animate: boolean): void {
    const to = this.state ? 1 : 0;
    this.bag.killAll();
    if (!animate || motion.reduced) {
      this.pos = to;
      this.render();
      return;
    }
    const from = this.pos;
    this.bag.run({
      duration: 0.2,
      ease: backOut(2.2),
      onUpdate: (k) => {
        this.pos = lerp(from, to, k);
        this.render();
      },
      onComplete: () => {
        this.pos = to;
        this.render();
      },
    });
  }

  private render(): void {
    const p = this.pos;
    const travel = (TW - TH) / 2;
    this.knob.x = lerp(-travel, travel, p);
    this.onLayer.alpha = clamp01(p);
    this.check.alpha = clamp01(p);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.changeFn = null;
    super.destroy(options);
  }
}

/* ------------------------------------------------------------------- slider */

export interface SliderOpts {
  width?: number;
  value?: number;
  /** Snap to multiples of this (0..1 scale), e.g. 0.1. */
  step?: number;
  onChange?: (value: number) => void;
  /** Fired once when the finger lifts. */
  onCommit?: (value: number) => void;
}

const tmpPoint = new Point();

/** Horizontal 0..1 slider (volume). Dragging anywhere on the bar works; the knob grows while held. */
export class Slider extends Container {
  readonly uiBox: Box;
  private readonly trackW: number;
  private readonly fill: NineSliceSprite;
  private readonly knob = new Container();
  private readonly bag = new TweenBag();
  private readonly step: number;
  private val: number;
  private changeFn: ((v: number) => void) | null;
  private commitFn: ((v: number) => void) | null;
  private dragging = false;
  private lastStep = -1;

  constructor(opts: SliderOpts = {}) {
    super();
    const w = opts.width ?? 420;
    this.trackW = w - 56;
    this.step = opts.step ?? 0;
    this.val = clamp01(opts.value ?? 0.5);
    this.changeFn = opts.onChange ?? null;
    this.commitFn = opts.onCommit ?? null;
    this.uiBox = { x: -w / 2, y: -Hit.comfy / 2, w, h: Hit.comfy };

    const seed = paperSeed();
    const track = new Graphics();
    drawPaper(track, -this.trackW / 2, -14, { w: this.trackW, h: 28, kind: 'pill', fill: Color.track, edge: Color.kraftDark, shadow: 3, grain: false, seed });
    this.fill = new NineSliceSprite({ texture: paintTexture(Color.mustard, 18), leftWidth: 9, rightWidth: 9, topHeight: 2, bottomHeight: 2 });
    this.fill.height = 18;
    this.fill.position.set(-this.trackW / 2 + 5, -9);

    const k = new Graphics();
    drawPaper(k, -28, -28, { w: 56, h: 56, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, shadow: 4, grain: false, seed: seed + 1 });
    k.circle(0, 0, 8).fill(Color.mustard);
    cacheStatic(track);
    cacheStatic(k);
    this.knob.addChild(k);
    this.addChild(track, this.fill, this.knob);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-w / 2, -Hit.comfy / 2, w, Hit.comfy);
    this.on('pointerdown', this.onDown);
    this.render();
  }

  get value(): number {
    return this.val;
  }

  onChange(fn: ((v: number) => void) | null): this {
    this.changeFn = fn;
    return this;
  }

  onCommit(fn: ((v: number) => void) | null): this {
    this.commitFn = fn;
    return this;
  }

  /** Set without firing callbacks. */
  setValue(v: number): void {
    this.val = this.snap(Number.isFinite(v) ? clamp01(v) : 0);
    this.render();
  }

  private snap(v: number): number {
    return this.step > 0 ? clamp01(Math.round(v / this.step) * this.step) : v;
  }

  private readPointer(e: FederatedPointerEvent): void {
    this.toLocal(e.global, undefined, tmpPoint);
    const v = this.snap(clamp01((tmpPoint.x + this.trackW / 2) / this.trackW));
    if (v === this.val) return;
    this.val = v;
    this.render();
    if (this.step > 0) {
      const idx = Math.round(v / this.step);
      if (idx !== this.lastStep) {
        this.lastStep = idx;
        audio.play('ui_toggle', { volume: 0.35, pitch: 0.9 + v * 0.5 });
        haptic('tap');
      }
    }
    this.changeFn?.(v);
  }

  private onDown = (e: FederatedPointerEvent): void => {
    this.dragging = true;
    this.lastStep = -1;
    const stage = game.app.stage;
    stage.on('pointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);
    stage.on('pointercancel', this.onUp);
    this.bag.runKeyed(this.knob, {
      duration: 0.12,
      ease: Ease.quadOut,
      onUpdate: (k) => this.knob.scale.set(1 + 0.14 * k),
    });
    this.readPointer(e);
  };

  private onMove = (e: FederatedPointerEvent): void => {
    if (this.dragging) this.readPointer(e);
  };

  private onUp = (): void => {
    if (!this.dragging) return;
    this.dragging = false;
    this.unlisten();
    this.bag.runKeyed(this.knob, {
      duration: 0.16,
      ease: backOut(2),
      onUpdate: (k) => this.knob.scale.set(1.14 - 0.14 * k),
      onComplete: () => this.knob.scale.set(1),
    });
    this.commitFn?.(this.val);
  };

  private unlisten(): void {
    const stage = game.app.stage;
    stage.off('pointermove', this.onMove);
    stage.off('pointerup', this.onUp);
    stage.off('pointerupoutside', this.onUp);
    stage.off('pointercancel', this.onUp);
  }

  private render(): void {
    const x = -this.trackW / 2 + this.val * this.trackW;
    this.knob.x = x;
    const w = x + this.trackW / 2 - 5;
    this.fill.visible = w > 4;
    this.fill.width = Math.max(w, 18);
  }

  override destroy(options?: DestroyOptions): void {
    this.unlisten();
    this.bag.killAll();
    this.changeFn = null;
    this.commitFn = null;
    super.destroy(options);
  }
}

/* ------------------------------------------------------------------ stepper */

export interface StepperOpts {
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
  format?: (v: number) => string;
  onChange?: (value: number) => void;
}

/** [-] value [+] with hold-to-repeat that accelerates the longer a button is held. */
export class Stepper extends Container {
  readonly uiBox: Box;
  private readonly minus: IconButton;
  private readonly plus: IconButton;
  private readonly valueT: Text;
  private readonly bag = new TweenBag();
  private readonly min: number;
  private readonly max: number;
  private readonly step: number;
  private readonly format: (v: number) => string;
  private val: number;
  private changeFn: ((v: number) => void) | null;
  private holdDir = 0;
  private holdTime = 0;
  private nextRepeat = 0;
  private stopUpdate: (() => void) | null = null;

  constructor(opts: StepperOpts = {}) {
    super();
    const w = opts.width ?? 360;
    this.min = opts.min ?? 0;
    this.max = opts.max ?? 99;
    this.step = opts.step ?? 1;
    this.format = opts.format ?? ((v) => String(v));
    this.val = clamp(opts.value ?? this.min, this.min, this.max);
    this.changeFn = opts.onChange ?? null;
    this.uiBox = { x: -w / 2, y: -44, w, h: 88 };

    const well = new Graphics();
    drawPaperFace(well, -w / 2 + 50, -28, { w: w - 100, h: 56, kind: 'pill', fill: Color.paperDim, edge: Color.kraftDark, grain: false, seed: paperSeed() });
    this.valueT = uiLabel(this.format(this.val), { size: 36 });
    this.minus = new IconButton({ icon: 'minus', style: 'danger', size: 72, fireOnDown: true });
    this.plus = new IconButton({ icon: 'plus', style: 'success', size: 72, fireOnDown: true });
    this.minus.position.set(-w / 2 + 44, 0);
    this.plus.position.set(w / 2 - 44, 0);
    this.addChild(well, this.valueT, this.minus, this.plus);
    this.bindHold(this.minus, -1);
    this.bindHold(this.plus, 1);
    this.refreshButtons();
  }

  get value(): number {
    return this.val;
  }

  onChange(fn: ((v: number) => void) | null): this {
    this.changeFn = fn;
    return this;
  }

  /** Set without firing onChange. */
  setValue(v: number): void {
    this.val = clamp(v, this.min, this.max);
    this.valueT.text = this.format(this.val);
    this.refreshButtons();
  }

  private bindHold(btn: IconButton, dir: number): void {
    btn.onTap(() => {
      this.nudge(dir);
      this.holdDir = dir;
      this.holdTime = 0;
      this.nextRepeat = 0.42;
      this.stopUpdate ??= game.onUpdate((dt) => this.tickHold(dt));
    });
    const stop = (): void => this.endHold();
    btn.on('pointerup', stop);
    btn.on('pointerupoutside', stop);
    btn.on('pointerleave', stop);
    btn.on('pointercancel', stop);
  }

  private tickHold(dt: number): void {
    if (this.holdDir === 0) return;
    this.holdTime += dt;
    if (this.holdTime < this.nextRepeat) return;
    this.nudge(this.holdDir);
    // 0.14 s between repeats, tightening to 0.05 s after a second and a half.
    this.nextRepeat += Math.max(0.05, 0.14 - (this.holdTime - 0.42) * 0.06);
  }

  private endHold(): void {
    this.holdDir = 0;
    this.stopUpdate?.();
    this.stopUpdate = null;
  }

  private nudge(dir: number): void {
    const next = clamp(this.val + dir * this.step, this.min, this.max);
    if (next === this.val) return;
    this.val = next;
    this.valueT.text = this.format(next);
    this.valueT.scale.set(1.18);
    this.bag.runKeyed(this.valueT, {
      duration: 0.14,
      ease: Ease.quadOut,
      onUpdate: (k) => this.valueT.scale.set(1.18 - 0.18 * k),
      onComplete: () => this.valueT.scale.set(1),
    });
    this.refreshButtons();
    this.changeFn?.(next);
  }

  private refreshButtons(): void {
    this.minus.setEnabled(this.val > this.min);
    this.plus.setEnabled(this.val < this.max);
  }

  override destroy(options?: DestroyOptions): void {
    this.endHold();
    this.bag.killAll();
    this.changeFn = null;
    super.destroy(options);
  }
}
