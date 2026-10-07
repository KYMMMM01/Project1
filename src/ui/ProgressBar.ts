import { Container, Graphics, MeshSimple, NineSliceSprite, Texture, type DestroyOptions, type Text } from 'pixi.js';
import { clamp01, lerp, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { motion, TweenBag } from './motion';
import { drawPaper, paperSeed } from './paper';
import { cacheStatic, paintTexture } from './shapes';
import { fitLabel, uiLabel } from './text';
import { Color, MIN_FONT } from './theme';

export type BarColor = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'cyan';

/** Flat craft-paper paints, one per bar colour. */
const BAR_COLORS: Record<BarColor, number> = {
  gold: Color.mustard,
  green: Color.leaf,
  red: Color.coral,
  blue: Color.teal,
  purple: Color.violet,
  cyan: Color.gem,
};

export interface ProgressBarOpts {
  width: number;
  height?: number;
  color?: BarColor;
  /** Initial value 0..1. */
  value?: number;
  /** Centred text; update it with setLabel or give `format` to derive it from the value. */
  label?: string;
  format?: (value: number) => string;
  /** Evenly spaced divider notches (e.g. 5 for a five-segment bar). */
  ticks?: number;
  /** Trailing pale bar that catches up after damage (boss HP). */
  ghost?: boolean;
  /** Round icon sitting on the left end of the bar. */
  icon?: IconName;
  /**
   * Label glyph size in design px (never below the 24 px floor). Default: 56 % of the bar height,
   * which a bar under 43 px tall cannot carry; pass 24 there and the text overlays the bar's edges.
   */
  labelSize?: number;
}

/**
 * Paper bar: a darker kraft strip with a brush-painted fill. Origin = centre. setValue() tweens the
 * fill; with `ghost`, a cream trailing bar waits 0.4 s after a drop and then drains to the new value,
 * so damage is readable at a glance.
 */
export class ProgressBar extends Container {
  readonly uiBox: Box;
  private readonly barW: number;
  private readonly innerW: number;
  private readonly innerH: number;
  private readonly left: number;
  private readonly capMin: number;
  private readonly labelPx: number;

  private readonly fill: NineSliceSprite;
  private readonly ghostBar: NineSliceSprite | null;
  private readonly bag = new TweenBag();
  private readonly format: ((v: number) => string) | undefined;
  private labelT: Text | null = null;

  private shown = 0;
  private target = 0;
  private ghostShown = 0;
  private colorKey: BarColor;
  private readonly ticks: number;

  constructor(opts: ProgressBarOpts) {
    super();
    const h = opts.height ?? 36;
    const w = opts.width;
    this.barW = w;
    this.format = opts.format;
    this.labelPx = Math.max(MIN_FONT, Math.round(opts.labelSize ?? h * 0.56));
    this.colorKey = opts.color ?? 'gold';
    this.ticks = opts.ticks ?? 0;
    const pad = 4;
    this.innerH = h - pad * 2;
    this.innerW = w - pad * 2;
    this.left = -w / 2 + pad;
    this.capMin = this.innerH;
    this.uiBox = { x: -w / 2, y: -h / 2, w, h };

    const trough = new Graphics();
    drawPaper(trough, -w / 2, -h / 2, { w, h, kind: 'pill', fill: Color.track, edge: Color.kraftDark, shadow: 3, grain: false, seed: paperSeed() });
    cacheStatic(trough);
    this.addChild(trough);

    const slice = (tex: Texture): NineSliceSprite => {
      const s = new NineSliceSprite({
        texture: tex,
        leftWidth: this.innerH / 2,
        rightWidth: this.innerH / 2,
        topHeight: 2,
        bottomHeight: 2,
      });
      s.height = this.innerH;
      s.position.set(this.left, -this.innerH / 2);
      return s;
    };

    if (opts.ghost) {
      this.ghostBar = slice(paintTexture(Color.paperLight, this.innerH));
      this.addChild(this.ghostBar);
    } else {
      this.ghostBar = null;
    }
    this.fill = slice(paintTexture(BAR_COLORS[this.colorKey], this.innerH));
    this.addChild(this.fill);

    if (this.ticks > 1) {
      const t = new Graphics();
      for (let i = 1; i < this.ticks; i++) {
        const x = this.left + (this.innerW * i) / this.ticks;
        t.roundRect(x - 1.5, -this.innerH / 2 + 3, 3, this.innerH - 6, 1.5).fill({ color: Color.ink, alpha: 0.3 });
      }
      this.addChild(t);
    }
    if (opts.icon) {
      const ic = drawIcon(opts.icon, h * 1.55);
      ic.position.set(-w / 2 + 2, 0);
      this.addChild(ic);
    }
    if (opts.label !== undefined || opts.format) {
      this.labelT = uiLabel(opts.label ?? '', { size: this.labelPx });
      this.addChild(this.labelT);
    }
    this.apply(opts.value ?? 0);
  }

  get value(): number {
    return this.target;
  }

  setColor(color: BarColor): void {
    if (color === this.colorKey) return;
    this.colorKey = color;
    this.fill.texture = paintTexture(BAR_COLORS[color], this.innerH);
  }

  setLabel(text: string): void {
    if (!this.labelT) {
      this.labelT = uiLabel(text, { size: this.labelPx });
      this.addChild(this.labelT);
    }
    this.labelT.text = text;
    fitLabel(this.labelT, this.barW - 24, this.labelT.style.fontSize as number);
  }

  /** Move to `v` (0..1). Animated by default; pass animate=false to jump (initial layout, reset). */
  setValue(v: number, animate = true): void {
    const next = Number.isFinite(v) ? clamp01(v) : 0;
    const prev = this.target;
    this.target = next;
    this.bag.killAll();
    if (!animate || motion.reduced) {
      this.apply(next);
      return;
    }
    const from = this.shown;
    const dropping = next < prev;
    if (dropping && this.ghostBar) {
      // Fill snaps down fast; the pale ghost lingers, then drains to the new value.
      this.bag.run({
        duration: 0.12,
        ease: Ease.cubicOut,
        onUpdate: (k) => this.setFill(lerp(from, next, k)),
        onComplete: () => this.setFill(next),
      });
      const gFrom = this.ghostShown;
      this.bag.run({
        duration: 0.25,
        delay: 0.4,
        ease: Ease.cubicOut,
        onUpdate: (k) => this.setGhost(lerp(gFrom, next, k)),
        onComplete: () => this.setGhost(next),
      });
    } else {
      this.bag.run({
        duration: Math.min(0.55, 0.22 + Math.abs(next - from) * 0.5),
        ease: Ease.cubicOut,
        onUpdate: (k) => {
          const v2 = lerp(from, next, k);
          this.setFill(v2);
          this.setGhost(v2);
        },
        onComplete: () => {
          this.setFill(next);
          this.setGhost(next);
        },
      });
    }
  }

  private apply(v: number): void {
    this.target = v;
    this.setFill(v);
    this.setGhost(v);
  }

  private widthFor(v: number): number {
    return v <= 0 ? 0 : Math.max(this.capMin, v * this.innerW);
  }

  private setFill(v: number): void {
    this.shown = v;
    // A derived label follows the painted edge instead of announcing the end value before the fill gets there.
    if (this.format) this.setLabel(this.format(v));
    const w = this.widthFor(v);
    this.fill.visible = w > 0;
    this.fill.width = Math.max(w, 1);
  }

  private setGhost(v: number): void {
    this.ghostShown = v;
    if (!this.ghostBar) return;
    const w = this.widthFor(v);
    this.ghostBar.visible = w > 0;
    this.ghostBar.width = Math.max(w, 1);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

export interface CooldownRingOpts {
  radius?: number;
  thickness?: number;
  color?: number;
  trackColor?: number;
  icon?: IconName;
  label?: string;
}

const SEGMENTS = 72;

/** Circular timer. Fills clockwise from 12 o'clock; the arc is a mesh whose vertices are rewritten in place. */
export class CooldownRing extends Container {
  readonly uiBox: Box;
  private readonly mesh: MeshSimple;
  private readonly cap: Graphics;
  private readonly rOuter: number;
  private readonly rInner: number;
  private readonly bag = new TweenBag();
  private labelT: Text | null = null;
  private progress = 0;

  constructor(opts: CooldownRingOpts = {}) {
    super();
    const r = opts.radius ?? 44;
    const th = opts.thickness ?? 12;
    this.rOuter = r;
    this.rInner = r - th;
    this.uiBox = { x: -r - 4, y: -r - 4, w: r * 2 + 8, h: r * 2 + 8 };
    const color = opts.color ?? Color.coral;

    const track = new Graphics();
    track.circle(0, 4, r).fill({ color: Color.shadow, alpha: 0.22 });
    track.circle(0, 0, r).fill(opts.trackColor ?? Color.track).stroke({ width: 2, color: Color.kraftDark, alpha: 0.6, alignment: 0 });
    track.circle(0, 0, r - th).fill(Color.paper).stroke({ width: 2, color: Color.kraftDark, alpha: 0.5, alignment: 1 });
    cacheStatic(track);
    this.addChild(track);

    const vertexCount = (SEGMENTS + 1) * 2;
    const indices = new Uint32Array(SEGMENTS * 6);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2;
      indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6);
    }
    this.mesh = new MeshSimple({
      texture: Texture.WHITE,
      vertices: new Float32Array(vertexCount * 2),
      uvs: new Float32Array(vertexCount * 2),
      indices,
    });
    this.mesh.tint = color;
    this.addChild(this.mesh);
    this.cap = new Graphics();
    this.cap.circle(0, 0, th / 2).fill(color);
    this.addChild(this.cap);

    if (opts.icon) this.addChild(drawIcon(opts.icon, (r - th) * 1.25));
    if (opts.label !== undefined) this.setLabel(opts.label);
    this.setProgress(0);
  }

  get value(): number {
    return this.progress;
  }

  setLabel(text: string): void {
    if (!this.labelT) {
      this.labelT = uiLabel(text, { size: Math.max(MIN_FONT, Math.round(this.rInner * 0.8)) });
      this.addChild(this.labelT);
    }
    this.labelT.text = text;
  }

  /** 0 = empty, 1 = full circle. Allocation-free: rewrites the mesh's vertex array. */
  setProgress(p: number): void {
    this.progress = Number.isFinite(p) ? clamp01(p) : 0;
    const v = this.mesh.vertices;
    for (let i = 0; i <= SEGMENTS; i++) {
      const t = Math.min(i / SEGMENTS, this.progress);
      const a = -Math.PI / 2 + t * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const o = i * 4;
      v[o] = c * this.rOuter - c * 1.5;
      v[o + 1] = s * this.rOuter - s * 1.5;
      v[o + 2] = c * (this.rInner + 1.5);
      v[o + 3] = s * (this.rInner + 1.5);
    }
    const mid = (this.rOuter + this.rInner) / 2;
    const end = -Math.PI / 2 + this.progress * TAU;
    this.cap.visible = this.progress > 0;
    this.cap.position.set(Math.cos(end) * mid, Math.sin(end) * mid);
    this.mesh.visible = this.progress > 0;
  }

  /** Fill 0 -> 1 over `seconds` (linear), then call `onDone`. */
  run(seconds: number, onDone?: () => void): void {
    this.bag.killAll();
    this.bag.run({
      duration: seconds,
      ease: Ease.linear,
      onUpdate: (k) => this.setProgress(k),
      onComplete: () => {
        this.setProgress(1);
        onDone?.();
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
