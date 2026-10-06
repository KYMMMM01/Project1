import { Container, Sprite } from 'pixi.js';
import { Pool } from '@/core/pool';
import { fxTex, fxTexture } from '@/fx';
import type { ProjectileState } from '@/game/api';
import type { FieldEnv } from './env';
import { projectileLook, type ProjectileLook } from './projectileLooks';

const SPIN_FLIP_RATE = 14;

/** One shot in flight: an additive trail and glow behind a baked shape. */
class ShotView {
  readonly root = new Container();
  private readonly trail = new Sprite(fxTexture('streak'));
  private readonly glow = new Sprite(fxTexture('glow'));
  private readonly core = new Sprite();
  private look: ProjectileLook | null = null;
  uid = 0;
  mark = 0;
  private phase = 0;

  constructor() {
    const streak = fxTex('streak');
    this.trail.anchor.set(1, streak.ay);
    this.trail.blendMode = 'add';
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.core.anchor.set(0.5);
    this.root.addChild(this.trail, this.glow, this.core);
    this.root.eventMode = 'none';
  }

  configure(uid: number, look: ProjectileLook, texture: Sprite['texture']): void {
    this.uid = uid;
    this.look = look;
    this.phase = (uid * 2.17) % (Math.PI * 2);
    this.core.texture = texture;
    this.core.scale.set(1);
    this.core.rotation = 0;
    this.trail.visible = look.trail !== 0;
    this.trail.tint = look.trail;
    this.trail.width = look.trailLength;
    this.trail.height = 9 + Math.min(8, look.size * 0.2);
    this.trail.alpha = 0.7;
    this.glow.visible = look.glow !== 0;
    this.glow.tint = look.glow;
    this.glow.width = this.glow.height = look.size * 2.4;
    this.glow.alpha = 0.55;
    this.root.visible = true;
  }

  place(p: ProjectileState, time: number): void {
    const look = this.look as ProjectileLook;
    this.root.position.set(p.x, p.y);
    this.root.rotation = p.angle;
    const t = time + this.phase;
    if (look.oriented) {
      this.core.rotation = 0;
    } else if (look.spin !== 0) {
      this.core.rotation = t * look.spin;
    } else {
      // Upright shapes (bell, note, star) keep level however the shot turns, with a small sway.
      this.core.rotation = -p.angle + Math.sin(t * 9) * 0.12;
    }
    if (look.flip) this.core.scale.x = Math.cos(t * SPIN_FLIP_RATE);
    this.glow.alpha = look.glow !== 0 ? 0.5 + 0.12 * Math.sin(t * 22) : 0;
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
  private readonly pool = new Pool<ShotView>(
    () => new ShotView(),
    (v) => v.reset(),
  );
  private frame = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
  ) {}

  update(): void {
    const list = this.env.battle.projectiles;
    const time = this.env.time;
    this.frame++;
    for (let i = 0; i < list.length; i++) {
      const p = list[i] as ProjectileState;
      let v = this.byUid.get(p.uid);
      if (!v) {
        v = this.pool.get();
        const look = projectileLook(p.unitId);
        v.configure(p.uid, look, this.env.art.projectile[look.shape]);
        this.layer.addChild(v.root);
        this.byUid.set(p.uid, v);
        this.live.push(v);
      }
      v.mark = this.frame;
      v.place(p, time);
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
