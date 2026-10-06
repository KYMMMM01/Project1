import { Container, Sprite } from 'pixi.js';
import { Pool } from '@/core/pool';
import { TAU, rand } from '@/core/math';
import { smoothstep01 } from './curves';
import { fxSettings } from './settings';
import { fxTex } from './textures';

export interface RaysOpts {
  color?: number;
  /** Ray length in design px. Default 360. */
  radius?: number;
  /** Number of rays. Default 10 (scaled by quality, minimum 5). */
  count?: number;
  /** Rotation speed in rad/s. Default 0.35. */
  speed?: number;
  /** Peak alpha of the whole fan. Default 0.55. */
  alpha?: number;
  /** Seconds to fade in / out. */
  fade?: number;
  /** Seconds before it stops itself; omit to run until stop(). */
  duration?: number;
  /** Container to add the rays to (put them behind a showcased object). */
  parent?: Container;
}

/** A rotating fan of additive light wedges. Created through Fx.rays(); returned as its own handle. */
export class Rays {
  readonly container = new Container();
  alive = true;
  private readonly sprites: Sprite[] = [];
  private readonly phase: number[] = [];
  private age = 0;
  private readonly peak: number;
  private readonly fade: number;
  private readonly duration: number;
  private stopAt = Infinity;
  private fadeOutFrom = Infinity;
  private readonly speed: number;

  constructor(
    private readonly pool: Pool<Sprite>,
    x: number,
    y: number,
    parent: Container,
    o: RaysOpts,
  ) {
    const radius = o.radius ?? 360;
    const n = Math.max(5, Math.round((o.count ?? 10) * fxSettings.quality));
    this.peak = (o.alpha ?? 0.55) * (fxSettings.reducedMotion ? 0.7 : 1);
    this.fade = o.fade ?? 0.3;
    this.duration = o.duration ?? Infinity;
    this.speed = (o.speed ?? 0.35) * (fxSettings.reducedMotion ? 0.4 : 1);
    this.container.position.set(x, y);
    this.container.alpha = 0;
    this.container.eventMode = 'none';
    const info = fxTex('wedge');
    const color = o.color ?? 0xffe9a0;
    for (let i = 0; i < n; i++) {
      const s = this.pool.get();
      s.texture = info.texture;
      s.anchor.set(info.ax, info.ay);
      s.tint = color;
      s.visible = true;
      // Alternate long/short and wide/narrow rays so the fan has rhythm instead of a uniform sunburst.
      const long = i % 2 === 0;
      s.scale.set((radius * (long ? 1 : rand(0.62, 0.8))) / info.w, ((radius * (long ? 0.2 : 0.13)) / info.h) * rand(0.8, 1.15));
      s.rotation = (i / n) * TAU + rand(-0.08, 0.08);
      s.alpha = 1;
      s.blendMode = 'add';
      this.container.addChild(s);
      this.sprites.push(s);
      this.phase.push(rand(0, TAU));
    }
    parent.addChild(this.container);
    if (this.duration !== Infinity) {
      this.fadeOutFrom = Math.max(0, this.duration - this.fade);
      this.stopAt = this.duration;
    }
  }

  /** No-op once the rays have expired or been cleared, so owners can keep calling it from a loop. */
  moveTo(x: number, y: number): void {
    if (this.alive) this.container.position.set(x, y);
  }

  setColor(c: number): void {
    for (const s of this.sprites) s.tint = c;
  }

  /** Fade out over the configured fade time and release the sprites. */
  stop(): void {
    if (this.fadeOutFrom === Infinity || this.fadeOutFrom > this.age) {
      this.fadeOutFrom = this.age;
      this.stopAt = this.age + this.fade;
    }
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    if (this.age >= this.stopAt) {
      this.dispose();
      return;
    }
    this.container.rotation += this.speed * dt;
    let a = smoothstep01(this.age / this.fade);
    if (this.age > this.fadeOutFrom) a *= 1 - smoothstep01((this.age - this.fadeOutFrom) / this.fade);
    this.container.alpha = a * this.peak;
    // Each ray breathes on its own phase so the fan shimmers rather than strobing as one.
    const t = this.age * 1.7;
    for (let i = 0; i < this.sprites.length; i++) {
      (this.sprites[i] as Sprite).alpha = 0.72 + 0.28 * Math.sin(t + (this.phase[i] as number));
    }
  }

  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const s of this.sprites) this.pool.release(s);
    this.sprites.length = 0;
    this.container.parent?.removeChild(this.container);
    this.container.destroy();
  }
}

/** Shared sprite pool for ray wedges: removed from its parent on release. */
export function makeRayPool(): Pool<Sprite> {
  return new Pool<Sprite>(
    () => {
      const s = new Sprite();
      s.eventMode = 'none';
      return s;
    },
    (s) => {
      s.parent?.removeChild(s);
      s.visible = false;
    },
  );
}
