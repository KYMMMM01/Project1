/**
 * Painted flecks: short-lived pooled sprites of any texture (a shard of the shield, a glint, a puff of the burst sheet, a soft light) that
 * move under their own little physics. The paper particles of `particles.ts` all come from one atlas, so a painted picture cannot ride in
 * that layer; this one is a handful of sprites in two containers, one drawn normally and one with additive light, so the glows of a whole
 * crowd share one blend change. A fleck that does not fit under the tier's cap is simply not made: flecks are decoration.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { clamp01 } from '@/core/math';
import { fxSettings, type FxTier } from './settings';

export interface FleckOpts {
  /** Seconds it lives. */
  life: number;
  vx?: number;
  vy?: number;
  /** px/s^2 downward. */
  gravity?: number;
  /** Share of the speed lost per second. */
  drag?: number;
  /** Radians per second of spin, and the turn it starts with. */
  spin?: number;
  rot?: number;
  /** Display width in px at the start and at the end (the height follows the picture's shape). */
  size: number;
  sizeEnd?: number;
  /** Tint, default none. */
  color?: number;
  /** Peak opacity, default 1. */
  alpha?: number;
  /** Share of the life spent fading in. */
  fadeIn?: number;
  /** Share of the life after which it fades out, default 0.5. */
  fadeAt?: number;
  /** Drawn with additive light. */
  add?: boolean;
}

/** Most flecks alive at once, by tier. */
export const FLECK_CAP: Readonly<Record<FxTier, number>> = { high: 96, mid: 64, low: 32 };

class Fleck {
  readonly sprite = new Sprite();
  age = 0;
  life = 1;
  vx = 0;
  vy = 0;
  gravity = 0;
  drag = 0;
  spin = 0;
  w0 = 1;
  w1 = 1;
  peak = 1;
  fadeIn = 0;
  fadeAt = 0.5;
  /** Width of the picture in its own pixels (the display size is divided by it). */
  natural = 1;

  constructor() {
    this.sprite.anchor.set(0.5);
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
  }
}

export class FleckLayer {
  readonly root = new Container();
  private readonly normal = new Container();
  private readonly lights = new Container();
  private readonly live: Fleck[] = [];
  private readonly free: Fleck[] = [];

  constructor(parent: Container) {
    this.root.label = 'flecks';
    this.root.eventMode = 'none';
    this.lights.blendMode = 'add';
    this.root.addChild(this.normal, this.lights);
    parent.addChild(this.root);
  }

  get count(): number {
    return this.live.length;
  }

  /** Make a fleck of `texture` at (x, y); false when the tier's cap is reached. */
  spawn(texture: Texture, x: number, y: number, o: FleckOpts): boolean {
    if (this.live.length >= FLECK_CAP[fxSettings.tier]) return false;
    const f = this.free.pop() ?? new Fleck();
    const s = f.sprite;
    s.texture = texture;
    f.natural = Math.max(1, texture.width);
    f.age = 0;
    f.life = Math.max(0.01, o.life);
    f.vx = o.vx ?? 0;
    f.vy = o.vy ?? 0;
    f.gravity = o.gravity ?? 0;
    f.drag = o.drag ?? 0;
    f.spin = o.spin ?? 0;
    f.w0 = o.size;
    f.w1 = o.sizeEnd ?? o.size;
    f.peak = o.alpha ?? 1;
    f.fadeIn = o.fadeIn ?? 0;
    f.fadeAt = o.fadeAt ?? 0.5;
    const home = o.add ? this.lights : this.normal;
    if (s.parent !== home) home.addChild(s);
    s.tint = o.color ?? 0xffffff;
    s.position.set(x, y);
    s.rotation = o.rot ?? 0;
    s.visible = true;
    this.place(f, 0);
    this.live.push(f);
    return true;
  }

  private place(f: Fleck, t: number): void {
    const s = f.sprite;
    s.scale.set((f.w0 + (f.w1 - f.w0) * t) / f.natural);
    const rise = f.fadeIn > 0 ? clamp01(t / f.fadeIn) : 1;
    const fall = 1 - clamp01((t - f.fadeAt) / (1 - f.fadeAt));
    s.alpha = f.peak * rise * fall;
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i] as Fleck;
      f.age += dt;
      if (f.age >= f.life) {
        f.sprite.visible = false;
        this.live[i] = this.live[this.live.length - 1] as Fleck;
        this.live.pop();
        this.free.push(f);
        continue;
      }
      if (f.drag > 0) {
        const keep = 1 / (1 + f.drag * dt);
        f.vx *= keep;
        f.vy *= keep;
      }
      f.vy += f.gravity * dt;
      const s = f.sprite;
      s.x += f.vx * dt;
      s.y += f.vy * dt;
      s.rotation += f.spin * dt;
      this.place(f, f.age / f.life);
    }
  }

  clear(): void {
    for (const f of this.live) {
      f.sprite.visible = false;
      this.free.push(f);
    }
    this.live.length = 0;
  }

  destroy(): void {
    this.live.length = 0;
    this.free.length = 0;
    this.root.destroy({ children: true });
  }
}
