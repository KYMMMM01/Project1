import { Container, Sprite } from 'pixi.js';
import { Pool } from '@/core/pool';
import { fxTex, fxTexture } from '@/fx';
import type { ProjectileState } from '@/game/api';
import type { FieldArt } from './art';
import type { FieldEnv } from './env';
import { projectileLook, type ProjectileLook } from './projectileLooks';

const SPIN_FLIP_RATE = 14;

/** One shot in flight: a flat paper streak behind a baked sticker shape, and, for a thrown one, its shadow running along the ground. */
class ShotView {
  readonly root = new Container();
  /** Under the shot, on the straight line the simulation moves it along: the ground the lobbed shot flies over. */
  readonly ground = new Sprite();
  private readonly flight = new Container();
  private readonly trail = new Sprite(fxTexture('streak'));
  private readonly core = new Sprite();
  private look: ProjectileLook | null = null;
  uid = 0;
  mark = 0;
  private phase = 0;
  /** Where the shot was first seen: the arc is drawn over the stretch from here to the target. */
  private x0 = 0;
  private y0 = 0;

  constructor(shadow: FieldArt['shadow']) {
    const streak = fxTex('streak');
    this.trail.anchor.set(1, streak.ay);
    this.core.anchor.set(0.5);
    this.ground.texture = shadow;
    this.ground.anchor.set(0.5);
    this.flight.addChild(this.trail, this.core);
    this.root.addChild(this.ground, this.flight);
    this.root.eventMode = 'none';
  }

  configure(uid: number, look: ProjectileLook, texture: Sprite['texture'], p: ProjectileState): void {
    this.uid = uid;
    this.look = look;
    this.phase = (uid * 2.17) % (Math.PI * 2);
    this.x0 = p.x;
    this.y0 = p.y;
    this.flight.position.set(0, 0);
    this.flight.scale.set(1);
    this.ground.position.set(0, 0);
    this.ground.visible = look.lob > 0;
    this.ground.alpha = 0.3;
    this.ground.scale.set(0.4);
    this.core.texture = texture;
    this.core.scale.set(look.scale);
    this.core.rotation = 0;
    this.trail.visible = look.trail !== 0;
    this.trail.tint = look.trail;
    this.trail.width = look.trailLength;
    this.trail.height = 9 + Math.min(8, look.size * 0.2);
    this.trail.alpha = 0.8;
    this.root.visible = true;
  }

  place(p: ProjectileState, time: number, tx: number, ty: number): void {
    const look = this.look as ProjectileLook;
    this.root.position.set(p.x, p.y);
    this.root.rotation = p.angle;
    // A lobbed shot rises and falls over the stretch it has to cover (the target keeps walking, so the span follows it) and swells at the top.
    if (look.lob > 0) {
      const span = Math.max(40, Math.hypot(tx - this.x0, ty - this.y0));
      const k = Math.min(1, Math.hypot(p.x - this.x0, p.y - this.y0) / span);
      const arc = Math.sin(Math.PI * k);
      const lift = look.lob * arc;
      // The arc lifts the shot straight up the screen, whatever way it flies: the root is turned, so lift along the opposite turn.
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      this.flight.x = -s * lift;
      this.flight.y = -c * lift;
      this.flight.scale.set(1 + 0.22 * arc);
      this.ground.rotation = -p.angle;
      this.ground.scale.set(0.42 * (1 - 0.3 * arc));
      this.ground.alpha = 0.3 * (1 - 0.35 * arc);
    }
    const t = time + this.phase;
    if (look.oriented) {
      this.core.rotation = 0;
    } else if (look.spin !== 0) {
      this.core.rotation = t * look.spin;
    } else {
      // Upright shapes (bell, note, star) keep level however the shot turns, with a small sway.
      this.core.rotation = -p.angle + Math.sin(t * 9) * 0.12;
    }
    if (look.flip) this.core.scale.x = Math.cos(t * SPIN_FLIP_RATE) * look.scale;
  }

  reset(): void {
    this.root.visible = false;
    this.root.parent?.removeChild(this.root);
  }
}

/** Projectiles follow the simulation's list each frame; the pool grows to the peak count and stays there. */
export class Projectiles {
  private readonly byUid = new Map<number, ShotView>();
  private readonly live: ShotView[] = [];
  private readonly pool: Pool<ShotView>;
  private frame = 0;
  private readonly target = { x: 0, y: 0 };

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
  ) {
    this.pool = new Pool<ShotView>(
      () => new ShotView(env.art.shadow),
      (v) => v.reset(),
    );
  }

  /** Where the shot's target stands now, or the shot's own place when it has gone (the arc then simply ends where it is). */
  private aim(p: ProjectileState, out: { x: number; y: number }): void {
    const view = this.env.ctx.enemyView(p.targetUid);
    out.x = view ? view.x : p.x;
    out.y = view ? view.y : p.y;
  }

  update(): void {
    const list = this.env.battle.projectiles;
    const time = this.env.time;
    this.frame++;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] as ProjectileState;
      let v = this.byUid.get(p.uid);
      this.aim(p, this.target);
      if (!v) {
        v = this.pool.get();
        const look = projectileLook(p.unitId);
        v.configure(p.uid, look, this.env.art.projectile[look.shape], p);
        this.layer.addChild(v.root);
        this.byUid.set(p.uid, v);
        this.live.push(v);
      }
      v.mark = this.frame;
      v.place(p, time, this.target.x, this.target.y);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const v = this.live[i] as ShotView;
      if (v.mark === this.frame) continue;
      this.byUid.delete(v.uid);
      this.live[i] = this.live[this.live.length - 1] as ShotView;
      this.live.pop();
      this.pool.release(v);
    }
  }

  destroy(): void {
    for (const v of this.live) v.root.destroy({ children: true });
    this.live.length = 0;
    this.byUid.clear();
    this.pool.drain((v) => v.root.destroy({ children: true }));
  }
}
