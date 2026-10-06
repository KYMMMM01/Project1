import { Container, Point, type Sprite } from 'pixi.js';
import type { Pool } from '@/core/pool';
import type { Tween, TweenOpts } from '@/core/tween';
import { damp } from '@/core/math';
import { Color } from '@/ui/theme';
import { smoothstep01 } from './curves';
import type { FxHandle } from './handles';
import type { BurstMods, EmitDef, EmitterHandle, ParticleSystem } from './particles';
import { fxTex, type FxTexId } from './textures';

/** A board cell or any rectangle, top-left based, in the Fx root's coordinates (design px). */
export interface FxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A looping or timed effect: stop() fades it out, `done` settles when it is gone for any reason. */
export interface ZoneHandle extends FxHandle {
  readonly done: Promise<void>;
}

/** The slice of an Fx that the preset modules need; keeps them independent of the facade class. */
export interface FxEnv {
  readonly ps: ParticleSystem;
  /** Layer under the particles where looping sprites live. */
  readonly ground: Container;
  readonly sprites: Pool<Sprite>;
  /** A tween on the scene clock that Fx.clear() cancels. */
  run(opts: TweenOpts): Tween;
  burst(def: EmitDef, x: number, y: number, mods?: BurstMods): void;
  /** Hand a loop to the Fx, which updates it every frame and disposes it on clear()/destroy(). */
  add(loop: Loop): void;
}

export interface LoopOpts {
  /** Seconds to fade in. Default 0.25. */
  fadeIn?: number;
  /** Seconds to fade out after stop(). Default 0.3. */
  fadeOut?: number;
  /** Stops itself after this many seconds; omit to loop until stop(). */
  life?: number;
  /** Display object whose position the loop tracks (units that move or get dragged). */
  follow?: Container;
  /** Half-life in seconds of the ease towards a moveTo() target; 0 snaps. */
  halfLife?: number;
}

/** Animates the loop's sprites for its age in seconds. */
export type LoopStep = (age: number) => void;

const tmpGlobal = new Point();
const tmpLocal = new Point();

/** Deterministic noise in [0,1) from a number: variety per cycle without any Math.random in the frame. */
export function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * One looping or timed effect made of a few pooled sprites (animated analytically by `step`) and any
 * number of particle emitters that ride along with it. Owns everything it creates: stop() fades the
 * sprites and ends the emitters, dispose() returns every sprite to the pool.
 */
export class Loop implements ZoneHandle {
  alive = true;
  readonly container = new Container();
  readonly done: Promise<void>;
  /** Per-frame animation of the loop's sprites; set by the preset. The container's alpha already carries the fade in and out. */
  step: LoopStep | null = null;
  x: number;
  y: number;
  private tx: number;
  private ty: number;
  private resolveDone!: () => void;
  private readonly sprites: Sprite[] = [];
  private readonly emitters: EmitterHandle[] = [];
  private readonly extras: Container[] = [];
  private age = 0;
  private leaving = false;
  private leaveAge = 0;
  private readonly fadeIn: number;
  private readonly fadeOut: number;
  private readonly life: number;
  private readonly halfLife: number;
  private target: Container | null;

  constructor(
    private readonly env: FxEnv,
    x: number,
    y: number,
    o: LoopOpts = {},
  ) {
    this.x = this.tx = x;
    this.y = this.ty = y;
    this.fadeIn = o.fadeIn ?? 0.25;
    this.fadeOut = o.fadeOut ?? 0.3;
    this.life = o.life ?? Infinity;
    this.halfLife = o.halfLife ?? 0;
    this.target = o.follow ?? null;
    this.done = new Promise<void>((res) => {
      this.resolveDone = res;
    });
    this.container.eventMode = 'none';
    this.container.alpha = 0;
    this.container.position.set(x, y);
    env.ground.addChild(this.container);
    env.add(this);
  }

  /** A pooled sprite from the atlas, added to this loop at its origin. Size it with fit(). */
  sprite(id: FxTexId, tint: number = Color.white): Sprite {
    const info = fxTex(id);
    const s = this.env.sprites.get();
    s.texture = info.texture;
    s.anchor.set(info.ax, info.ay);
    s.tint = tint;
    s.alpha = 1;
    s.rotation = 0;
    s.position.set(0, 0);
    s.visible = true;
    this.container.addChild(s);
    this.sprites.push(s);
    this.fit(s, id, info.w, info.h);
    return s;
  }

  /** Scale `s` (showing atlas shape `id`) to w x h design px. */
  fit(s: Sprite, id: FxTexId, w: number, h: number): void {
    const info = fxTex(id);
    s.scale.set(w / info.w, h / info.h);
  }

  /** A display object that is not pooled (a Graphics outline); destroyed with the loop. */
  own(c: Container): void {
    this.container.addChild(c);
    this.extras.push(c);
  }

  /**
   * A particle emitter at an offset from the loop origin (or from `anchor`, a child container the
   * preset moves itself); it follows that container and ends with the loop.
   */
  emit(def: EmitDef, rate: number, ox = 0, oy = 0, mods?: BurstMods, anchor: Container = this.container): EmitterHandle {
    const h = this.env.ps.emit(def, this.x + ox, this.y + oy, rate, { follow: anchor, offsetX: ox, offsetY: oy, mods });
    this.emitters.push(h);
    return h;
  }

  /** Detach from any followed object and glide to a fixed point. */
  moveTo(x: number, y: number): void {
    // Callers keep calling this every frame on a handle that may have expired meanwhile.
    if (!this.alive) return;
    this.target = null;
    this.tx = x;
    this.ty = y;
    if (this.halfLife <= 0) {
      this.x = x;
      this.y = y;
      this.container.position.set(x, y);
    }
  }

  stop(): void {
    if (!this.alive || this.leaving) return;
    this.leaving = true;
    this.leaveAge = 0;
    for (const e of this.emitters) e.stop();
  }

  update(dt: number): void {
    if (!this.alive) return;
    this.age += dt;
    if (this.target) {
      if (this.target.destroyed) {
        this.target = null;
        this.stop();
      } else {
        this.target.getGlobalPosition(tmpGlobal);
        const parent = this.container.parent;
        if (parent) {
          parent.toLocal(tmpGlobal, undefined, tmpLocal);
          this.x = this.tx = tmpLocal.x;
          this.y = this.ty = tmpLocal.y;
        }
      }
    } else if (this.halfLife > 0) {
      this.x = damp(this.x, this.tx, this.halfLife, dt);
      this.y = damp(this.y, this.ty, this.halfLife, dt);
    }
    this.container.position.set(this.x, this.y);

    let fade: number;
    if (this.leaving) {
      this.leaveAge += dt;
      if (this.leaveAge >= this.fadeOut) {
        this.dispose();
        return;
      }
      fade = 1 - smoothstep01(this.leaveAge / this.fadeOut);
    } else {
      fade = this.fadeIn > 0 ? smoothstep01(this.age / this.fadeIn) : 1;
      if (this.age >= this.life) this.stop();
    }
    this.container.alpha = fade;
    this.step?.(this.age);
  }

  /** Remove everything now (clear/destroy, or the end of the fade). Safe to call twice. */
  dispose(): void {
    if (!this.alive) return;
    this.alive = false;
    for (const e of this.emitters) e.stop();
    this.emitters.length = 0;
    for (const s of this.sprites) this.env.sprites.release(s);
    this.sprites.length = 0;
    for (const c of this.extras) c.destroy();
    this.extras.length = 0;
    this.container.parent?.removeChild(this.container);
    this.container.destroy();
    this.resolveDone();
  }
}
