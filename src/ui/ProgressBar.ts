import { Container, Graphics, MeshSimple, NineSliceSprite, Texture, type DestroyOptions, type Text } from 'pixi.js';
import { game } from '@/core/game';
import { clamp01, lerp, TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { motion, TweenBag } from './motion';
import { bakeResolution, gradient, glossGradient, vGradient } from './shapes';
import { fitLabel, uiLabel } from './text';
import { Color } from './theme';

export type BarColor = 'gold' | 'green' | 'red' | 'blue' | 'purple' | 'cyan';

interface BarPalette {
  top: number;
  bottom: number;
}

const BAR_COLORS: Record<BarColor, BarPalette> = {
  gold: { top: 0xffe27a, bottom: 0xff9f1c },
  green: { top: 0xa6f58a, bottom: 0x2fbf50 },
  red: { top: 0xff9aa2, bottom: 0xe02a46 },
  blue: { top: 0x9fd5ff, bottom: 0x2a80ea },
  purple: { top: 0xd5acff, bottom: 0x8345ea },
  cyan: { top: 0xaaf4ff, bottom: 0x1ec0e6 },
};

const texCache = new Map<string, Texture>();

/**
 * A pill baked once into a texture (gradient + gloss) and stretched by a 9-slice: the caps keep their
 * roundness at any fill width, and resizing a NineSliceSprite rewrites its vertices in place, so a
 * bar can animate every frame without redrawing a Graphics.
 */
function pillTexture(top: number, bottom: number, h: number, glossy: boolean): Texture {
  const key = `${top}:${bottom}:${h}:${glossy}`;
  let tex = texCache.get(key);
  if (tex) return tex;
  const w = Math.max(h * 3, 24);
  const c = new Container();
  const g = new Graphics();
  g.roundRect(0, 0, w, h, h / 2).fill(vGradient(top, bottom));
  if (glossy) {
    g.roundRect(h * 0.18, h * 0.1, w - h * 0.36, h * 0.4, h * 0.2).fill(glossGradient(0.5, 0.06));
    g.roundRect(h * 0.3, h * 0.78, w - h * 0.6, h * 0.1, h * 0.05).fill({ color: 0x000000, alpha: 0.12 });
  }
  c.addChild(g);
  tex = game.app.renderer.generateTexture({ target: c, resolution: Math.max(2, bakeResolution()), antialias: true });
  c.destroy({ children: true });
  texCache.set(key, tex);
  return tex;
}

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
  /** A soft highlight that glides across the fill every couple of seconds. */
  shine?: boolean;
  /** Trailing white bar that catches up after damage (boss HP). */
  ghost?: boolean;
  /** Round icon sitting on the left end of the bar. */
  icon?: IconName;
}

/**
 * Chunky capsule bar. Origin = centre. setValue() tweens the fill; with `ghost`, a pale trailing bar
 * waits 0.4 s after a drop and then drains to the new value, so damage is readable at a glance.
 */
export class ProgressBar extends Container {
  readonly uiBox: Box;
  private readonly barW: number;
  private readonly barH: number;
  private readonly innerW: number;
  private readonly innerH: number;
  private readonly left: number;
  private readonly capMin: number;

  private readonly fill: NineSliceSprite;
  private readonly ghostBar: NineSliceSprite | null;
  private readonly bag = new TweenBag();
  private readonly fx = new TweenBag();
  private readonly format: ((v: number) => string) | undefined;
  private labelT: Text | null = null;
  private shineMask: Graphics | null = null;

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
    this.barH = h;
    this.format = opts.format;
    this.colorKey = opts.color ?? 'gold';
    this.ticks = opts.ticks ?? 0;
    const pad = 5;
    this.innerH = h - pad * 2;
    this.innerW = w - pad * 2;
    this.left = -w / 2 + pad;
    this.capMin = this.innerH;
    this.uiBox = { x: -w / 2, y: -h / 2, w, h };

    const trough = new Graphics();
    trough.roundRect(-w / 2, -h / 2 + 3, w, h, h / 2).fill({ color: 0x07030f, alpha: 0.32 });
    trough
      .roundRect(-w / 2, -h / 2, w, h, h / 2)
      .fill(vGradient(0x1b1036, 0x2d1f5c))
      .stroke({ width: pad, color: Color.outline, alignment: 1 });
    trough.roundRect(-w / 2 + pad, -h / 2 + pad, w - pad * 2, h * 0.28, h * 0.14).fill({ color: 0x000000, alpha: 0.35 });
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
      this.ghostBar = slice(pillTexture(0xffffff, 0xffd9de, this.innerH, false));
      this.ghostBar.alpha = 0.9;
      this.addChild(this.ghostBar);
    } else {
      this.ghostBar = null;
    }
    const pal = BAR_COLORS[this.colorKey];
    this.fill = slice(pillTexture(pal.top, pal.bottom, this.innerH, true));
    this.addChild(this.fill);

    if (opts.shine) this.buildShine();
    if (this.ticks > 1) {
      const t = new Graphics();
      for (let i = 1; i < this.ticks; i++) {
        const x = this.left + (this.innerW * i) / this.ticks;
        t.roundRect(x - 2, -this.innerH / 2 + 2, 4, this.innerH - 4, 2).fill({ color: Color.outline, alpha: 0.55 });
        t.roundRect(x + 2, -this.innerH / 2 + 3, 2, this.innerH - 6, 1).fill({ color: 0xffffff, alpha: 0.15 });
      }
      this.addChild(t);
    }
    if (opts.icon) {
      const ic = drawIcon(opts.icon, h * 1.55);
      ic.position.set(-w / 2 + 2, 0);
      this.addChild(ic);
    }
    if (opts.label !== undefined || opts.format) {
      this.labelT = uiLabel(opts.label ?? '', { size: Math.max(20, Math.round(h * 0.56)), strokeWidth: 4, shadow: false });
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
    const pal = BAR_COLORS[color];
    this.fill.texture = pillTexture(pal.top, pal.bottom, this.innerH, true);
  }

  setLabel(text: string): void {
    if (!this.labelT) {
      this.labelT = uiLabel(text, { size: Math.max(20, Math.round(this.barH * 0.56)), strokeWidth: 4, shadow: false });
      this.addChild(this.labelT);
    }
    this.labelT.text = text;
    fitLabel(this.labelT, this.barW - 24, this.labelT.style.fontSize as number);
  }

  /** Move to `v` (0..1). Animated by default; pass animate=false to jump (initial layout, reset). */
  setValue(v: number, animate = true): void {
    const next = clamp01(v);
    const prev = this.target;
    this.target = next;
    if (this.format) this.setLabel(this.format(next));
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
        duration: 0.28,
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
    this.setFill(v);
    this.setGhost(v);
    if (this.format) this.setLabel(this.format(v));
  }

  private widthFor(v: number): number {
    return v <= 0 ? 0 : Math.max(this.capMin, v * this.innerW);
  }

  private setFill(v: number): void {
    this.shown = v;
    const w = this.widthFor(v);
    this.fill.visible = w > 0;
    this.fill.width = Math.max(w, 1);
    if (this.shineMask) {
      this.shineMask.scale.x = Math.max(0, w - this.innerH);
    }
  }

  private setGhost(v: number): void {
    this.ghostShown = v;
    if (!this.ghostBar) return;
    const w = this.widthFor(v);
    this.ghostBar.visible = w > 0;
    this.ghostBar.width = Math.max(w, 1);
  }

  private buildShine(): void {
    const h = this.innerH;
    const band = new Graphics();
    const bw = h * 1.4;
    band.poly([-bw / 2 + h * 0.3, -h / 2, bw / 2 + h * 0.3, -h / 2, bw / 2 - h * 0.3, h / 2, -bw / 2 - h * 0.3, h / 2]).fill(
      gradient(
        [
          [0, 'rgba(255,255,255,0)'],
          [0.5, 'rgba(255,255,255,0.55)'],
          [1, 'rgba(255,255,255,0)'],
        ],
        true,
      ),
    );
    const mask = new Graphics();
    mask.rect(0, -h / 2 + 3, 1, h - 6).fill(0xffffff);
    mask.position.x = this.left + h / 2;
    band.mask = mask;
    this.addChild(band, mask);
    this.shineMask = mask;
    if (motion.reduced) return;
    const travel = this.innerW;
    this.fx.runKeyed(band, {
      duration: 2.6,
      ease: Ease.linear,
      repeat: -1,
      onUpdate: (k) => {
        // A 0.9 s glide followed by a pause.
        const t = Math.min(1, k * (2.6 / 0.9));
        band.x = this.left + h / 2 + (travel + bw) * Ease.cubicInOut(t) - bw / 2;
        band.alpha = t >= 1 ? 0 : 1;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.fx.killAll();
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
    const color = opts.color ?? 0xffb629;

    const track = new Graphics();
    track.circle(0, 0, r + 4).fill(Color.outline);
    track.circle(0, 0, r).fill(opts.trackColor ?? 0x2d1f5c);
    track.circle(0, 0, r - th).fill(Color.outline);
    track.circle(0, 0, r - th - 3).fill(0x241748);
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
      this.labelT = uiLabel(text, { size: Math.max(20, Math.round(this.rInner * 0.8)), strokeWidth: 5 });
      this.addChild(this.labelT);
    }
    this.labelT.text = text;
  }

  /** 0 = empty, 1 = full circle. Allocation-free: rewrites the mesh's vertex array. */
  setProgress(p: number): void {
    this.progress = clamp01(p);
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
