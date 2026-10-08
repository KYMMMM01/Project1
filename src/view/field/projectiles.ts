import { Container, Sprite, type Texture } from 'pixi.js';
import { Pool } from '@/core/pool';
import { TAU, clamp01, rand } from '@/core/math';
import { Ease } from '@/core/tween';
import { FLECK_CAP, Light, fxSettings, fxTexture, paint, type Fx } from '@/fx';
import type { BattleEvents, ProjectileState, UnitId } from '@/game/api';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import type { FieldArt } from './art';
import type { FieldEnv } from './env';
import { castLook, castSeconds, projectileLook, rankSize, rankTrail, type ProjectileLook } from './projectileLooks';

const SPIN_FLIP_RATE = 14;
/** Seconds a shot takes to settle from its stretched launch shape. */
const LAUNCH = 0.08;
/** Seconds between two puffs of what a shot sheds, by tier. */
const SHED_EVERY = { high: 0.032, mid: 0.05, low: 0.09 } as const;
/** Particles that are not part of a hit stop being made once the flecks are this full: a crowd of shots must not starve the shield shards. */
const SHED_ROOM = 0.55;

/** Where each cell's cat stands: the cells never move, so their centres are looked up once. */
const CENTRES = Array.from({ length: CELL_COUNT }, (_, c) => ({ x: cellCenterX(c), y: cellCenterY(c) }));

/** The containers every shot's sprites live in, back to front: shadows on the ground, the flat streaks, and the pictures. */
interface ShotLayers {
  readonly shadows: Container;
  readonly streaks: Container;
  readonly bodies: Container;
}

/**
 * One shot in flight: its picture, a flat tapered streak behind it, the ground shadow running along the straight line for a thrown
 * one, and whatever it sheds as it goes. Its path is drawn in world space: a lobbed shot is lifted straight up the screen over the
 * stretch it has to cover, and a turning picture follows the tangent of what it drew.
 */
class ShotView {
  private readonly shadow = new Sprite();
  private readonly body = new Sprite();
  private readonly streak = new Sprite(fxTexture('tail'));
  private look: ProjectileLook | null = null;
  uid = 0;
  mark = 0;
  /** The cat type that threw it (its rank sets the size and the streak). */
  unitId: UnitId = 'w_paw';
  private phase = 0;
  private born = 0;
  private bodyW = 40;
  private rank = 1;
  private trail = 1;
  /** Where the shot was first seen: the arc is drawn over the stretch from here to the target. */
  private x0 = 0;
  private y0 = 0;
  private lastX = 0;
  private lastY = 0;
  private heading = 0;
  private shedAt = 0;

  constructor(
    shadow: FieldArt['shadow'],
    layers: ShotLayers,
  ) {
    this.shadow.texture = shadow;
    this.shadow.anchor.set(0.5);
    this.body.anchor.set(0.5);
    // The streak's full end sits just ahead of the picture's middle, and the picture covers it.
    this.streak.anchor.set(0.85, 0.5);
    for (const s of [this.shadow, this.body, this.streak]) {
      s.eventMode = 'none';
      s.visible = false;
    }
    layers.shadows.addChild(this.shadow);
    layers.streaks.addChild(this.streak);
    layers.bodies.addChild(this.body);
  }

  configure(uid: number, unitId: UnitId, look: ProjectileLook, x: number, y: number, angle: number, time: number): void {
    this.uid = uid;
    this.unitId = unitId;
    this.look = look;
    this.phase = (uid * 2.17) % TAU;
    this.born = time;
    this.x0 = x;
    this.y0 = y;
    this.lastX = x;
    this.lastY = y;
    this.heading = angle;
    this.shedAt = time;
    this.rank = rankSize(unitId);
    this.trail = rankTrail(unitId);
    const texture = paint(look.paint);
    this.body.texture = texture;
    this.bodyW = look.size * this.rank;
    this.body.visible = true;
    this.shadow.visible = look.lob > 0;
    this.shadow.alpha = 0.3;
    this.shadow.scale.set(0.4);
    const s = look.streak;
    this.streak.visible = s !== null;
    if (s) {
      this.streak.tint = s.color;
      const t = this.streak.texture;
      this.streak.scale.set((s.length * this.rank) / Math.max(1, t.width), (s.width * this.rank) / Math.max(1, t.height));
    }
  }

  /** Move to where the simulation says (x, y) is, drawn `time` seconds after the field started; (tx, ty) is where it is headed. */
  place(x: number, y: number, angle: number, time: number, tx: number, ty: number, fx: Fx): void {
    const look = this.look as ProjectileLook;
    const calm = fxSettings.reducedMotion;
    let arc = 0;
    if (look.lob > 0) {
      // A lobbed shot rises and falls over the stretch it has to cover (the target keeps walking, so the span follows it).
      const span = Math.max(40, Math.hypot(tx - this.x0, ty - this.y0));
      arc = Math.sin(Math.PI * Math.min(1, Math.hypot(x - this.x0, y - this.y0) / span));
    }
    const bx = x;
    const by = y - look.lob * arc;
    // The picture turns along the path it really took (the tangent of the arc), not the simulation's straight line.
    if (Math.hypot(bx - this.lastX, by - this.lastY) > 0.6) this.heading = Math.atan2(by - this.lastY, bx - this.lastX);
    else if (this.lastX === this.x0 && this.lastY === this.y0) this.heading = angle;
    this.lastX = bx;
    this.lastY = by;

    const t = time + this.phase;
    const age = time - this.born;
    const settle = calm ? 1 : clamp01(age / LAUNCH);
    const base = this.bodyW / Math.max(1, this.body.texture.width);
    // A small stretch at the launch: long and thin for a shot that points along its path, a pop for one that spins.
    const swell = 1 + 0.22 * arc;
    let sx = base * swell;
    let sy = base * swell;
    if (look.oriented) {
      sx *= 1 + 0.45 * (1 - settle);
      sy *= 1 - 0.2 * (1 - settle);
    } else {
      const pop = 0.65 + 0.35 * Ease.backOut(settle);
      sx *= pop;
      sy *= pop;
    }
    this.body.position.set(bx, by);
    if (look.oriented) this.body.rotation = this.heading;
    else if (look.spin !== 0) this.body.rotation = calm ? 0 : t * look.spin;
    else this.body.rotation = calm ? 0 : Math.sin(t * 9) * 0.12;
    if (look.flip) sx *= calm ? 1 : Math.cos(t * SPIN_FLIP_RATE);
    this.body.scale.set(sx, sy);

    if (look.lob > 0) {
      this.shadow.position.set(x, y + 10);
      this.shadow.scale.set(0.42 * (1 - 0.3 * arc));
      this.shadow.alpha = 0.3 * (1 - 0.35 * arc);
    }
    const s = look.streak;
    if (s) {
      this.streak.position.set(bx, by);
      this.streak.rotation = this.heading;
      this.streak.alpha = Math.min(1, s.alpha * this.trail) * clamp01(age / 0.05);
    }
    if (!calm && time >= this.shedAt && look.shed) {
      this.shedAt = time + SHED_EVERY[fxSettings.tier];
      shed(fx, look, bx, by, this.heading, this.bodyW, this.rank);
    }
  }

  reset(): void {
    this.body.visible = false;
    this.shadow.visible = false;
    this.streak.visible = false;
  }

  destroy(): void {
    for (const s of [this.shadow, this.body, this.streak]) s.destroy();
  }
}

/** A puff of what a shot is made of, left behind it. Nothing is made when the flecks are already crowded. */
function shed(fx: Fx, look: ProjectileLook, x: number, y: number, heading: number, w: number, rank: number): void {
  if (fx.flecks.count >= FLECK_CAP[fxSettings.tier] * SHED_ROOM) return;
  const back = heading + Math.PI;
  const bx = x + Math.cos(back) * w * 0.25;
  const by = y + Math.sin(back) * w * 0.25;
  const k = rank;
  const kind = look.shed;
  if (!kind) return;
  const color = kind.color;
  switch (kind.kind) {
    case 'dust':
      fx.fleck(paint('burst_puff'), bx, by, { life: 0.35, size: 14 * k, sizeEnd: 28 * k, rot: rand(0, TAU), color, alpha: 0.8, vx: rand(-14, 14), vy: rand(-18, 4), fadeAt: 0.3 });
      break;
    case 'snow':
      fx.fleck(fxTexture('crystal'), bx + rand(-6, 6), by + rand(-6, 6), { life: 0.55, size: 15 * k, sizeEnd: 7, rot: rand(0, TAU), spin: rand(-4, 4), color, alpha: 0.95, vx: rand(-20, 20), vy: rand(10, 40), gravity: 80, fadeAt: 0.4 });
      break;
    case 'ember':
      fx.fleck(fxTexture('spark'), bx + rand(-5, 5), by + rand(-5, 5), { life: 0.36, size: 17 * k, sizeEnd: 5, rot: back + rand(-0.6, 0.6), color: Math.random() < 0.5 ? color : Light.gold, alpha: 0.95, vx: Math.cos(back) * 70, vy: Math.sin(back) * 70 - 30, drag: 3, fadeAt: 0.3 });
      break;
    case 'glint':
      fx.fleck(paint('burst_glint'), bx + rand(-4, 4), by + rand(-4, 4), { life: 0.24, size: 22 * k, sizeEnd: 8, rot: rand(0, 1.5), color, alpha: 0.95, fadeAt: 0.3 });
      break;
    case 'sparkle':
      fx.fleck(fxTexture('sparkle'), bx + rand(-8, 8), by + rand(-8, 8), { life: 0.4, size: 15 * k, sizeEnd: 4, rot: rand(0, 1.5), spin: rand(-3, 3), color, alpha: 0.95, vx: rand(-18, 18), vy: rand(-18, 18), fadeAt: 0.4 });
      break;
    case 'steam':
      fx.fleck(paint('burst_puff'), bx, by - 6, { life: 0.5, size: 12 * k, sizeEnd: 24 * k, rot: rand(0, TAU), color, alpha: 0.7, vy: -34, vx: rand(-8, 8), fadeAt: 0.3 });
      break;
    case 'puff':
      fx.fleck(paint('burst_puff'), bx, by, { life: 0.42, size: 14 * k, sizeEnd: 32 * k, rot: rand(0, TAU), color, alpha: 0.8, vx: rand(-10, 10), vy: rand(-22, -4), fadeAt: 0.3 });
      break;
    case 'bubble':
      fx.fleck(fxTexture('bubble'), bx + rand(-8, 8), by + rand(-8, 8), { life: 0.5, size: 8 * k, sizeEnd: 20 * k, color, alpha: 0.9, vx: rand(-8, 8), vy: rand(-40, -14), fadeAt: 0.4 });
      break;
  }
}

/** A cat that makes an area throws something first: it flies from the cat to where the area will open and opens it there. */
interface Flight {
  view: ShotView;
  unitId: UnitId;
  zoneUid: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  born: number;
  seconds: number;
}

/** Projectiles follow the simulation's list each frame; the pool grows to the peak count and stays there. */
export class Projectiles {
  private readonly byUid = new Map<number, ShotView>();
  private readonly live: ShotView[] = [];
  private readonly flights: Flight[] = [];
  private readonly pool: Pool<ShotView>;
  private readonly layers: ShotLayers;
  private readonly offs: Array<() => void> = [];
  /** Where each cat type last attacked from (a cast leaves its cat's cell). */
  private readonly from = new Map<UnitId, { x: number; y: number }>();
  private frame = 0;
  private readonly target = { x: 0, y: 0 };

  constructor(
    private readonly env: FieldEnv,
    layer: Container,
  ) {
    this.layers = { shadows: new Container(), streaks: new Container(), bodies: new Container() };
    const stack = [this.layers.shadows, this.layers.streaks, this.layers.bodies];
    for (const c of stack) c.eventMode = 'none';
    layer.addChild(...stack);
    this.pool = new Pool<ShotView>(
      () => new ShotView(env.art.shadow, this.layers),
      (v) => v.reset(),
    );
    const ev = env.battle.events;
    this.offs.push(
      ev.on('attack', (e) => this.onAttack(e)),
      ev.on('zoneStart', (e) => this.onZoneStart(e)),
    );
  }

  /** Where the shot's target stands now, or the shot's own place when it has gone (the arc then simply ends where it is). */
  private aim(p: ProjectileState, out: { x: number; y: number }): void {
    const view = this.env.ctx.enemyView(p.targetUid);
    out.x = view ? view.x : p.x;
    out.y = view ? view.y : p.y;
  }

  private onAttack(e: BattleEvents['attack']): void {
    const c = CENTRES[e.unit.cell];
    if (c) this.from.set(e.unit.id, c);
  }

  /** The area of a zone-making cat is about to open: throw its shard, orb or flask there first. */
  private onZoneStart(e: BattleEvents['zoneStart']): void {
    const z = e.zone;
    const origin = this.from.get(z.unitId);
    if (origin) this.cast(z.unitId, z.uid, origin.x, origin.y - 12, z.x, z.y);
  }

  /**
   * Throw what `unitId` throws before its area opens (zone `zoneUid`) from (x0, y0) to (x1, y1). Returns the seconds it takes: 0 for a cat that
   * throws nothing, and under reduced motion, where the area simply appears.
   */
  cast(unitId: UnitId, zoneUid: number, x0: number, y0: number, x1: number, y1: number): number {
    const look = castLook(unitId);
    if (!look || fxSettings.reducedMotion) return 0;
    const speed = Math.max(1, this.env.ctx.speed);
    const seconds = castSeconds(unitId, Math.hypot(x1 - x0, y1 - y0)) / speed;
    const view = this.pool.get();
    const time = this.env.time;
    view.configure(-zoneUid, unitId, look.look, x0, y0, Math.atan2(y1 - y0, x1 - x0), time);
    this.flights.push({ view, unitId, zoneUid, x0, y0, x1, y1, born: time, seconds });
    return seconds;
  }

  /** Seconds before the area of zone `uid` may open: its shard, orb or flask is still in the air. 0 once it has landed or when nothing was thrown. */
  castWait(uid: number): number {
    for (const f of this.flights) if (f.zoneUid === uid) return Math.max(0.001, f.born + f.seconds - this.env.time);
    return 0;
  }

  update(): void {
    const list = this.env.battle.projectiles;
    const time = this.env.time;
    const fx = this.env.ctx.fx;
    this.frame++;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] as ProjectileState;
      let v = this.byUid.get(p.uid);
      this.aim(p, this.target);
      if (!v) {
        v = this.pool.get();
        v.configure(p.uid, p.unitId, projectileLook(p.unitId), p.x, p.y, p.angle, time);
        this.byUid.set(p.uid, v);
        this.live.push(v);
      }
      v.mark = this.frame;
      v.place(p.x, p.y, p.angle, time, this.target.x, this.target.y, fx);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const v = this.live[i] as ShotView;
      if (v.mark === this.frame) continue;
      this.byUid.delete(v.uid);
      this.live[i] = this.live[this.live.length - 1] as ShotView;
      this.live.pop();
      this.pool.release(v);
    }
    for (let i = this.flights.length - 1; i >= 0; i--) {
      const f = this.flights[i] as Flight;
      const k = clamp01((time - f.born) / f.seconds);
      if (k >= 1) {
        landing(fx, f.unitId, f.x1, f.y1);
        this.flights[i] = this.flights[this.flights.length - 1] as Flight;
        this.flights.pop();
        this.pool.release(f.view);
        continue;
      }
      // A thrown orb gathers speed; a shard and a flask fly the same pace all the way.
      const e = f.unitId === 'm_cosmo' ? k * k : k;
      f.view.place(f.x0 + (f.x1 - f.x0) * e, f.y0 + (f.y1 - f.y0) * e, Math.atan2(f.y1 - f.y0, f.x1 - f.x0), time, f.x1, f.y1, fx);
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const v of this.live) v.destroy();
    for (const f of this.flights) f.view.destroy();
    this.live.length = 0;
    this.flights.length = 0;
    this.byUid.clear();
    this.pool.drain((v) => v.destroy());
    for (const c of [this.layers.shadows, this.layers.streaks, this.layers.bodies]) c.destroy({ children: true });
  }
}

/** Where a cast lands: the area opens here, and the thing that was thrown bursts. */
function landing(fx: Fx, id: UnitId, x: number, y: number): void {
  const flash = (tex: Texture, size: number, end: number, color: number, life: number): void => {
    fx.fleck(tex, x, y, { life, size, sizeEnd: end, color, alpha: 0.95, rot: rand(0, TAU), fadeAt: 0.35 });
  };
  if (id === 'm_frost') {
    flash(paint('burst_star'), 60, 120, Light.ice, 0.22);
    flash(paint('burst_ring'), 40, 150, Light.iceEdge, 0.4);
    for (let i = 0; i < 5; i++) {
      const dir = (i / 5) * TAU + rand(-0.3, 0.3);
      fx.fleck(fxTexture('crystal'), x, y, { life: 0.6, size: 18, sizeEnd: 8, rot: dir, spin: rand(-6, 6), color: Light.iceWhite, vx: Math.cos(dir) * 150, vy: Math.sin(dir) * 150 - 40, gravity: 260, drag: 1.2, fadeAt: 0.5 });
    }
  } else if (id === 'm_cosmo') {
    flash(paint('burst_ring'), 30, 170, Light.voidRim, 0.45);
    flash(paint('burst_glint'), 60, 30, Light.voidRim, 0.3);
  } else if (id === 't_alch') {
    fx.fleck(paint('burst_puff'), x, y, { life: 0.5, size: 40, sizeEnd: 100, color: Light.lime, alpha: 0.85, rot: rand(0, TAU), fadeAt: 0.4 });
    flash(paint('burst_ring'), 30, 140, Light.lime, 0.35);
    for (let i = 0; i < 6; i++) {
      const dir = (i / 6) * TAU + rand(-0.3, 0.3);
      fx.fleck(fxTexture('droplet'), x, y, { life: 0.5, size: 13, sizeEnd: 8, rot: dir + Math.PI / 2, color: Light.lime, vx: Math.cos(dir) * 140, vy: Math.sin(dir) * 120 - 120, gravity: 620, fadeAt: 0.6 });
    }
  }
}
