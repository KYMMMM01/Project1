/**
 * Lightning that jumps between targets: a flat yellow zig-zag with a brown outline stretched from one point to the next, and a flat
 * star where it lands. It flickers between the six drawn bolts for a fifth of a second and is gone; nothing flies. Pooled: a chain of
 * five targets is five arcs, and a crowd of storm cats never allocates in the frame.
 */
import { Container, Sprite } from 'pixi.js';
import { clamp01 } from '@/core/math';
import type { FleckLayer } from './flecks';
import { Light } from './light';
import { BOLT_IDS, paint, type PaintId } from './paint';
import { fxSettings } from './settings';

export interface ArcOpts {
  /** Size multiplier of the bolt and its flash. */
  scale?: number;
  /** Seconds before it shows (the next hop of a chain). */
  delay?: number;
  /** Tint of the bolt, default none (the drawn yellow). */
  color?: number;
}

const LIFE = 0.22;
/** Seconds between one painted bolt and the next while it flickers. */
const FLICKER = 0.055;
const POOL = 10;

class Arc {
  readonly main = new Sprite();
  active = false;
  /** The flash where it lands has been made. */
  flashed = false;
  age = 0;
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  scale = 1;
  color = 0xffffff;
  /** Which of the six bolts it starts with. */
  seed = 0;

  constructor() {
    this.main.anchor.set(0, 0.5);
    this.main.eventMode = 'none';
    this.main.visible = false;
  }
}

export class ArcLayer {
  readonly root = new Container();
  private readonly arcs: Arc[] = [];
  private seq = 0;

  constructor(
    parent: Container,
    private readonly flecks: FleckLayer,
  ) {
    this.root.label = 'arcs';
    this.root.eventMode = 'none';
    for (let i = 0; i < POOL; i++) {
      const a = new Arc();
      this.root.addChild(a.main);
      this.arcs.push(a);
    }
    parent.addChild(this.root);
  }

  /** Arcs showing or waiting to show. */
  get count(): number {
    let n = 0;
    for (const a of this.arcs) if (a.active) n++;
    return n;
  }

  strike(x0: number, y0: number, x1: number, y1: number, o: ArcOpts = {}): void {
    const a = this.arcs.find((v) => !v.active);
    if (!a) return;
    a.active = true;
    a.flashed = false;
    a.age = -(o.delay ?? 0);
    a.x0 = x0;
    a.y0 = y0;
    a.x1 = x1;
    a.y1 = y1;
    a.scale = o.scale ?? 1;
    a.color = o.color ?? 0xffffff;
    a.seed = this.seq++;
    a.main.visible = false;
  }

  update(dt: number): void {
    const calm = fxSettings.reducedMotion;
    for (const a of this.arcs) {
      if (!a.active) continue;
      a.age += dt;
      if (a.age < 0) continue;
      if (a.age >= LIFE) {
        a.active = false;
        a.main.visible = false;
        continue;
      }
      if (!a.flashed) {
        a.flashed = true;
        this.flash(a);
      }
      const dx = a.x1 - a.x0;
      const dy = a.y1 - a.y0;
      const len = Math.max(8, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      const step = calm ? 0 : Math.floor(a.age / FLICKER);
      const t = clamp01(a.age / LIFE);
      const fade = 1 - clamp01((t - 0.45) / 0.55);
      const h = Math.min(64, Math.max(26, len * 0.32)) * a.scale;
      this.dress(a, len * 1.05, h, angle, BOLT_IDS[(a.seed + step) % BOLT_IDS.length] as PaintId, fade);
    }
  }

  private dress(a: Arc, w: number, h: number, angle: number, id: PaintId, alpha: number): void {
    const s = a.main;
    const texture = paint(id);
    s.texture = texture;
    s.position.set(a.x0, a.y0);
    s.rotation = angle;
    s.scale.set(w / Math.max(1, texture.width), h / Math.max(1, texture.height));
    s.alpha = alpha;
    s.tint = a.color;
    s.visible = true;
  }

  /** The flat star where the bolt lands, once, as the arc appears. */
  private flash(a: Arc): void {
    const k = a.scale;
    const color = a.color === 0xffffff ? Light.zapFlash : a.color;
    this.flecks.spawn(paint('burst_star'), a.x1, a.y1, { life: 0.2, size: 40 * k, sizeEnd: 72 * k, rot: a.seed, color, fadeAt: 0.4 });
  }

  clear(): void {
    for (const a of this.arcs) {
      a.active = false;
      a.main.visible = false;
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.arcs.length = 0;
  }
}
