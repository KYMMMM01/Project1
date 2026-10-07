import { Container, Particle, ParticleContainer, Point, RenderTexture } from 'pixi.js';
import { game } from '@/core/game';
import { TAU } from '@/core/math';
import { Color } from '@/ui/theme';
import { ParticleBudget, scaleCount } from './budget';
import { ColorRamp, Ease, fadeEnvelope, pick, type EaseFn, type Range } from './curves';
import { countScale, fxSettings, tierScale } from './settings';
import { fxTex, fxTexture, type FxTexId } from './textures';

/*
 * Why ParticleContainer + Particle (and not Container + Sprite): the particle layer is ONE
 * ParticleContainer, which uploads a flat vertex buffer for every particle and issues exactly one
 * draw call regardless of the live count. Nothing blends additively: cut paper has no light. A Sprite per particle
 * would go through the full scene-graph transform pass and the batcher every frame. All particle
 * textures come from a single atlas source, which is the one hard requirement of ParticleContainer.
 * Every property is flagged dynamic because pooled particles change texture, scale and colour each
 * frame; position/rotation/colour/uv/vertex streams are rewritten in place with no allocation.
 */

export type Shape =
  | { type: 'point' }
  | { type: 'circle'; r: number }
  | { type: 'ring'; r: number; width?: number }
  | { type: 'rect'; w: number; h: number }
  | { type: 'cone'; angle: number; spread: number };

export interface EmitDef {
  tex: FxTexId;
  /** 0 ambient .. 3 critical; decides who is dropped when the pool is crowded. Default 1. */
  prio?: 0 | 1 | 2 | 3;
  /** Particles per burst (ignored by continuous emitters). */
  count?: number;
  /** Seconds before the particle appears; staggers a burst without timers. */
  delay?: Range;
  life: Range;
  shape?: Shape;
  /** Radians, or 'out' (away from the spawn point's offset) / 'in'. Default 'out'. */
  dir?: number | 'out' | 'in';
  /** Half-angle of random deviation from `dir`, radians. Default 0.25. */
  spread?: number;
  /** px/s. */
  speed?: Range;
  gravity?: number;
  gravityX?: number;
  /** Exponential velocity damping per second. */
  drag?: number;
  /** rad/s. */
  spin?: Range;
  /** Initial rotation (or the offset from the velocity heading when alignVel). */
  rot?: Range;
  /** Rotate to face the direction of travel every frame (sparks, streaks). */
  alignVel?: boolean;
  /** Extra length per px/s of speed: 0.002 doubles a streak at 500 px/s. */
  stretch?: number;
  /** Width in design px at birth / death. Height follows the texture aspect times `aspect`. */
  size: Range;
  sizeEnd?: Range;
  /** Independent height in design px (overrides aspect following). */
  sizeY?: Range;
  sizeYEnd?: Range;
  aspect?: number;
  sizeEase?: EaseFn;
  /** Peak alpha. */
  alpha?: number;
  /** Fractions of life spent fading in / out. Defaults 0.05 / 0.4. */
  fadeIn?: number;
  fadeOut?: number;
  /** 1..3 colour stops over life. */
  colors: readonly number[];
  colorMid?: number;
  /** Each particle picks one of these as a solid colour instead of `colors`. */
  palette?: readonly number[];
  /** Local x-scale flutter in rad/s (coins and confetti tumbling). */
  flip?: Range;
  /** Fly from the spawn offset into the emitter origin, easing along the way, bulging by `swirl` px. */
  converge?: { swirl?: number; ease?: EaseFn };
  /** Override the texture's natural anchor (0..1). */
  anchorX?: number;
  anchorY?: number;
  /** Sideways sine wobble that does not affect the particle's travel (hearts, snow, motes): amplitude px, frequency Hz. */
  sway?: { amp: Range; freq: Range };
}

export interface BurstMods {
  /** Scales size, speed, shape dimensions and gravity together (effect size). */
  scale?: number;
  /** Multiplies the particle count. */
  count?: number;
  life?: number;
  alpha?: number;
  colors?: readonly number[];
  /** Replaces a numeric `dir`. */
  dir?: number;
  spread?: number;
  /** Seconds added to every particle's delay. */
  delay?: number;
  /** Extra speed multiplier on top of `scale`. */
  speed?: number;
}

/** One pooled particle: simulation state plus its Pixi render object. */
export class Fp {
  readonly render = new Particle(fxTexture('dot'));
  readonly ramp = new ColorRamp();
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  gx = 0;
  gy = 0;
  drag = 0;
  rot = 0;
  spin = 0;
  flip = 0;
  flipPhase = 0;
  age = 0;
  life = 1;
  sx0 = 1;
  sx1 = 1;
  sy0 = 1;
  sy1 = 1;
  sizeEase: EaseFn = Ease.linear;
  alpha = 1;
  fadeIn = 0;
  fadeOut = 0.4;
  stretch = 0;
  alignVel = false;
  homing = false;
  hx0 = 0;
  hy0 = 0;
  hx1 = 0;
  hy1 = 0;
  hpx = 0;
  hpy = 0;
  swirl = 0;
  homeEase: EaseFn = Ease.cubicIn;
  swayAmp = 0;
  swayFreq = 0;
  swayPhase = 0;
  prio = 1;
  layer: Layer | null = null;
}

/** The one kind of container every particle layer is (the warm-up draws a scratch one made the same way, so the shader it links is the one the layer uses). */
function newParticleContainer(): ParticleContainer {
  return new ParticleContainer({
    texture: fxTexture('dot'),
    dynamicProperties: { vertex: true, position: true, rotation: true, uvs: true, color: true },
    // Rounding vertices to device pixels makes slow particles visibly stair-step.
    roundPixels: false,
    blendMode: 'normal',
  });
}

class Layer {
  readonly live: Fp[] = [];
  readonly container = newParticleContainer();
  constructor() {
    this.container.label = 'fx-flat';
  }
}

/**
 * Draw one particle into a 4 x 4 target now: the particle shader is linked (25 to 70 ms on a phone, the largest single first-use
 * cost of a battle) and the effect sheet goes to the graphics card, in a calm frame instead of at the first hit of the first wave.
 */
export function warmParticles(): void {
  const { renderer } = game.app;
  const scratch = newParticleContainer();
  scratch.addParticle(new Particle(fxTexture('dot')));
  const target = RenderTexture.create({ width: 4, height: 4 });
  renderer.render({ container: scratch, target });
  target.destroy(true);
  scratch.destroy();
}

export interface EmitterOpts {
  /** Seconds to emit for; omit to run until stop(). */
  duration?: number;
  mods?: BurstMods;
  /** Display object whose world position the emitter tracks (plus the offset). */
  follow?: Container;
  offsetX?: number;
  offsetY?: number;
}

/** Handle to a continuous emitter. */
export class EmitterHandle {
  alive = true;
  x = 0;
  y = 0;
  /** @internal */
  lastX = 0;
  /** @internal */
  lastY = 0;
  /** @internal */
  accum = 0;
  /** @internal */
  remaining = Infinity;
  /** @internal */
  target: Container | null = null;
  /** @internal */
  ox = 0;
  /** @internal */
  oy = 0;
  /** @internal */
  fresh = true;
  /** Particles per second, before the quality multiplier. */
  rate: number;

  constructor(
    /** @internal */ readonly def: EmitDef,
    /** @internal */ readonly mods: BurstMods | undefined,
    rate: number,
  ) {
    this.rate = rate;
  }

  /** Stop emitting; particles already in flight finish their lives. */
  stop(): void {
    this.alive = false;
  }

  moveTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.target = null;
  }

  follow(target: Container | null, ox = 0, oy = 0): void {
    this.target = target;
    this.ox = ox;
    this.oy = oy;
  }
}

const tmpGlobal = new Point();
const tmpLocal = new Point();

export class ParticleSystem {
  readonly budget: ParticleBudget;
  readonly root = new Container();
  /** Particle objects ever allocated: must plateau at the budget in steady state. */
  created = 0;
  emitted = 0;

  private readonly flat = new Layer();
  private readonly pool: Fp[] = [];
  private readonly emitters: EmitterHandle[] = [];

  constructor(parent: Container, cap = 700) {
    this.budget = new ParticleBudget(cap);
    this.root.label = 'fx-particles';
    this.root.addChild(this.flat.container);
    parent.addChild(this.root);
  }

  get liveCount(): number {
    return this.flat.live.length;
  }

  get emitterCount(): number {
    return this.emitters.length;
  }

  /**
   * One-shot burst at (x,y). Returns how many particles were actually created after quality scaling
   * and budget limits (0 is normal under load; it never throws).
   */
  burst(def: EmitDef, x: number, y: number, mods?: BurstMods): number {
    const prio = def.prio ?? 1;
    const want = scaleCount((def.count ?? 1) * (mods?.count ?? 1), countScale(prio), prio);
    const n = this.reserve(want, prio);
    for (let i = 0; i < n; i++) this.spawn(def, x, y, mods);
    return n;
  }

  /** Continuous emitter at (x,y), `rate` particles per second. */
  emit(def: EmitDef, x: number, y: number, rate: number, o: EmitterOpts = {}): EmitterHandle {
    const h = new EmitterHandle(def, o.mods, rate);
    h.x = x;
    h.y = y;
    h.remaining = o.duration ?? Infinity;
    if (o.follow) h.follow(o.follow, o.offsetX ?? 0, o.offsetY ?? 0);
    this.emitters.push(h);
    return h;
  }

  /**
   * Hand-built particle for effects that need exact placement (lightning segments, slash marks).
   * Returns null when the budget refuses; the caller must fill every field it relies on and then
   * call `commit(p)`.
   */
  alloc(id: FxTexId, prio: 0 | 1 | 2 | 3): Fp | null {
    if (this.reserve(1, prio) === 0) return null;
    const p = this.pool.pop() ?? this.make();
    const info = fxTex(id);
    p.layer = this.flat;
    p.prio = prio;
    p.render.texture = info.texture;
    p.render.anchorX = info.ax;
    p.render.anchorY = info.ay;
    p.x = p.y = p.vx = p.vy = p.gx = p.gy = p.drag = p.rot = p.spin = p.flip = 0;
    p.flipPhase = 0;
    p.age = 0;
    p.life = 1;
    p.sx0 = p.sx1 = p.sy0 = p.sy1 = 1;
    p.sizeEase = Ease.linear;
    p.alpha = 1;
    p.fadeIn = 0;
    p.fadeOut = 0.4;
    p.stretch = 0;
    p.alignVel = false;
    p.homing = false;
    p.swayAmp = 0;
    p.ramp.setSolid(Color.white);
    return p;
  }

  /** Publish a particle returned by alloc(): shows it from its current pose. */
  commit(p: Fp): void {
    const layer = p.layer as Layer;
    layer.live.push(p);
    layer.container.particleChildren.push(p.render);
    this.emitted++;
    if (p.age >= 0) this.pose(p, 0);
    else p.render.color = 0;
  }

  update(dt: number): void {
    if (dt <= 0) return;
    if (this.emitters.length > 0) this.stepEmitters(dt);
    this.stepLayer(this.flat, dt);
  }

  /** Remove everything immediately (scene exit, restart). */
  clear(): void {
    this.drain(this.flat);
    for (const e of this.emitters) e.alive = false;
    this.emitters.length = 0;
    this.budget.reset();
  }

  destroy(): void {
    this.clear();
    this.root.destroy({ children: true });
  }

  stats(): {
    live: number;
    peak: number;
    cap: number;
    dropped: number;
    emitted: number;
    created: number;
    idle: number;
    emitters: number;
  } {
    return {
      live: this.liveCount,
      peak: this.budget.peak,
      cap: this.budget.cap,
      dropped: this.budget.dropped,
      emitted: this.emitted,
      created: this.created,
      idle: this.pool.length,
      emitters: this.emitters.length,
    };
  }

  private make(): Fp {
    this.created++;
    return new Fp();
  }

  /** Reserve up to `want` slots; higher priorities may evict lower-priority live particles. */
  private reserve(want: number, prio: number): number {
    if (want <= 0) return 0;
    const b = this.budget;
    let n = Math.min(want, b.room(prio));
    if (n < want && prio >= 2) {
      const freed = this.reclaim(want - n, prio);
      if (freed > 0) n = Math.min(want, b.room(prio));
    }
    b.note(want, n);
    b.add(n);
    return n;
  }

  /** Kill up to `n` live particles of strictly lower priority than `prio`, least important and oldest first. */
  private reclaim(n: number, prio: number): number {
    let freed = 0;
    for (let pass = 0; pass < prio && freed < n; pass++) {
      freed += this.reclaimLayer(this.flat, pass, n - freed);
    }
    return freed;
  }

  private reclaimLayer(layer: Layer, prio: number, max: number): number {
    const live = layer.live;
    const kids = layer.container.particleChildren;
    let w = 0;
    let freed = 0;
    for (let r = 0; r < live.length; r++) {
      const p = live[r] as Fp;
      if (freed < max && p.prio === prio) {
        this.release(p);
        freed++;
        continue;
      }
      live[w] = p;
      kids[w] = p.render;
      w++;
    }
    live.length = w;
    kids.length = w;
    return freed;
  }

  private release(p: Fp): void {
    this.budget.remove(1);
    p.render.color = 0;
    p.layer = null;
    this.pool.push(p);
  }

  private drain(layer: Layer): void {
    for (const p of layer.live) this.release(p);
    layer.live.length = 0;
    layer.container.particleChildren.length = 0;
  }

  private stepLayer(layer: Layer, dt: number): void {
    const live = layer.live;
    const n = live.length;
    if (n === 0) return;
    const kids = layer.container.particleChildren;
    let w = 0;
    for (let r = 0; r < n; r++) {
      const p = live[r] as Fp;
      p.age += dt;
      if (p.age >= p.life) {
        this.release(p);
        continue;
      }
      if (p.age >= 0) {
        if (!p.homing) {
          p.vx += p.gx * dt;
          p.vy += p.gy * dt;
          if (p.drag > 0) {
            const f = Math.exp(-p.drag * dt);
            p.vx *= f;
            p.vy *= f;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        p.rot += p.spin * dt;
        this.pose(p, dt);
      }
      live[w] = p;
      kids[w] = p.render;
      w++;
    }
    live.length = w;
    kids.length = w;
  }

  /** Write the particle's current state into its Pixi render object. */
  private pose(p: Fp, dt: number): void {
    const t = p.age / p.life;
    const r = p.render;
    const e = p.sizeEase(t);
    let sx = p.sx0 + (p.sx1 - p.sx0) * e;
    const sy = p.sy0 + (p.sy1 - p.sy0) * e;
    if (p.flip !== 0) sx *= 0.14 + 0.86 * Math.abs(Math.cos(p.flipPhase + p.flip * p.age));
    if (p.homing) {
      const h = p.homeEase(t);
      const bulge = p.swirl * Math.sin(Math.PI * h);
      const nx = p.hx0 + (p.hx1 - p.hx0) * h + p.hpx * bulge;
      const ny = p.hy0 + (p.hy1 - p.hy0) * h + p.hpy * bulge;
      // Homing particles have no integrated velocity; derive it so streaks can face their motion.
      if (dt > 0) {
        p.vx = (nx - p.x) / dt;
        p.vy = (ny - p.y) / dt;
      }
      p.x = nx;
      p.y = ny;
      r.x = nx;
      r.y = ny;
    } else {
      r.x = p.x;
      r.y = p.y;
    }
    if (p.swayAmp !== 0) r.x += p.swayAmp * Math.sin(p.swayPhase + p.swayFreq * p.age);
    if (p.alignVel) {
      r.rotation = Math.atan2(p.vy, p.vx) + p.rot;
      if (p.stretch !== 0) sx *= 1 + Math.hypot(p.vx, p.vy) * p.stretch;
    } else {
      r.rotation = p.rot;
    }
    r.scaleX = sx;
    r.scaleY = sy;
    const a = p.alpha * fadeEnvelope(t, p.fadeIn, p.fadeOut);
    r.color = p.ramp.bgr(t) + (((a * 255) | 0) << 24);
  }

  private stepEmitters(dt: number): void {
    let w = 0;
    for (let i = 0; i < this.emitters.length; i++) {
      const e = this.emitters[i] as EmitterHandle;
      if (e.alive && e.target) {
        if (e.target.destroyed) {
          e.alive = false;
        } else {
          e.target.getGlobalPosition(tmpGlobal);
          this.root.toLocal(tmpGlobal, undefined, tmpLocal);
          e.x = tmpLocal.x + e.ox;
          e.y = tmpLocal.y + e.oy;
        }
      }
      if (e.alive) {
        if (e.fresh) {
          e.lastX = e.x;
          e.lastY = e.y;
          e.fresh = false;
        }
        e.remaining -= dt;
        e.accum += e.rate * fxSettings.quality * tierScale() * dt;
        const prio = e.def.prio ?? 1;
        let n = Math.floor(e.accum);
        e.accum -= n;
        if (n > 0) {
          n = this.reserve(n, prio);
          for (let k = 0; k < n; k++) {
            // Spread spawns along the path travelled this frame so fast movers leave a continuous trail.
            const f = (k + 1) / n;
            this.spawn(e.def, e.lastX + (e.x - e.lastX) * f, e.lastY + (e.y - e.lastY) * f, e.mods);
          }
        }
        e.lastX = e.x;
        e.lastY = e.y;
        if (e.remaining <= 0) e.alive = false;
      }
      if (e.alive) this.emitters[w++] = e;
    }
    this.emitters.length = w;
  }

  /** Create one particle from a definition. The budget slot must already be reserved. */
  private spawn(def: EmitDef, x: number, y: number, mods: BurstMods | undefined): void {
    const p = this.pool.pop() ?? this.make();
    const info = fxTex(def.tex);
    const k = mods?.scale ?? 1;
    p.layer = this.flat;
    p.prio = def.prio ?? 1;

    let ox = 0;
    let oy = 0;
    const shape = def.shape;
    if (shape) {
      switch (shape.type) {
        case 'circle': {
          const a = Math.random() * TAU;
          const r = shape.r * k * Math.sqrt(Math.random());
          ox = Math.cos(a) * r;
          oy = Math.sin(a) * r;
          break;
        }
        case 'ring': {
          const a = Math.random() * TAU;
          const r = shape.r * k + (shape.width ? (Math.random() - 0.5) * shape.width * k : 0);
          ox = Math.cos(a) * r;
          oy = Math.sin(a) * r;
          break;
        }
        case 'rect':
          ox = (Math.random() - 0.5) * shape.w * k;
          oy = (Math.random() - 0.5) * shape.h * k;
          break;
        case 'point':
        case 'cone':
          break;
      }
    }

    const spread = mods?.spread ?? def.spread ?? 0.25;
    let ang: number;
    if (shape?.type === 'cone') {
      ang = shape.angle + (Math.random() * 2 - 1) * shape.spread;
    } else {
      const dir = mods?.dir ?? def.dir ?? 'out';
      if (typeof dir === 'number') ang = dir + (Math.random() * 2 - 1) * spread;
      else if (ox === 0 && oy === 0) ang = Math.random() * TAU;
      else ang = Math.atan2(dir === 'out' ? oy : -oy, dir === 'out' ? ox : -ox) + (Math.random() * 2 - 1) * spread;
    }
    const speed = pick(def.speed ?? 0) * k * (mods?.speed ?? 1);
    p.x = x + ox;
    p.y = y + oy;
    p.vx = Math.cos(ang) * speed;
    p.vy = Math.sin(ang) * speed;
    p.gx = (def.gravityX ?? 0) * k;
    p.gy = (def.gravity ?? 0) * k;
    p.drag = def.drag ?? 0;
    p.spin = pick(def.spin ?? 0);
    p.rot = pick(def.rot ?? 0);
    p.alignVel = def.alignVel === true;
    p.stretch = def.stretch ?? 0;
    p.flip = pick(def.flip ?? 0);
    p.flipPhase = Math.random() * TAU;
    const sway = def.sway;
    p.swayAmp = sway ? pick(sway.amp) * k : 0;
    p.swayFreq = sway ? pick(sway.freq) * TAU : 0;
    p.swayPhase = Math.random() * TAU;
    p.life = pick(def.life) * (mods?.life ?? 1);
    p.age = -(pick(def.delay ?? 0) + (mods?.delay ?? 0));

    // Start and end of a size range share one random draw so big particles stay big.
    const q = Math.random();
    const w0 = pick(def.size, q) * k;
    const w1 = def.sizeEnd !== undefined ? pick(def.sizeEnd, q) * k : w0;
    p.sx0 = w0 / info.w;
    p.sx1 = w1 / info.w;
    if (def.sizeY !== undefined) {
      p.sy0 = (pick(def.sizeY, q) * k) / info.h;
      p.sy1 = def.sizeYEnd !== undefined ? (pick(def.sizeYEnd, q) * k) / info.h : p.sy0;
    } else {
      const asp = def.aspect ?? 1;
      p.sy0 = p.sx0 * asp;
      p.sy1 = p.sx1 * asp;
    }
    p.sizeEase = def.sizeEase ?? Ease.linear;

    p.alpha = (def.alpha ?? 1) * (mods?.alpha ?? 1);
    p.fadeIn = def.fadeIn ?? 0.05;
    p.fadeOut = def.fadeOut ?? 0.4;
    if (def.palette) p.ramp.setSolid(def.palette[(Math.random() * def.palette.length) | 0] as number);
    else p.ramp.set(mods?.colors ?? def.colors, def.colorMid);

    const cv = def.converge;
    if (cv) {
      p.homing = true;
      p.hx0 = x + ox;
      p.hy0 = y + oy;
      p.hx1 = x;
      p.hy1 = y;
      const dx = p.hx1 - p.hx0;
      const dy = p.hy1 - p.hy0;
      const l = Math.hypot(dx, dy) || 1;
      p.hpx = dy / l;
      p.hpy = -dx / l;
      // Average heading, so a streak that is posed before its first step already faces its motion.
      p.vx = dx / p.life;
      p.vy = dy / p.life;
      p.swirl = (cv.swirl ?? 0) * k;
      p.homeEase = cv.ease ?? Ease.cubicIn;
    } else {
      p.homing = false;
    }

    const r = p.render;
    r.texture = info.texture;
    r.anchorX = def.anchorX ?? info.ax;
    r.anchorY = def.anchorY ?? info.ay;
    this.flat.live.push(p);
    this.flat.container.particleChildren.push(r);
    this.emitted++;
    if (p.age >= 0) this.pose(p, 0);
    else r.color = 0;
  }
}
