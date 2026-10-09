import { Container, Sprite } from 'pixi.js';
import { damp } from '@/core/math';
import { Hue } from '@/fx/palette';
import { enemyDef } from '@/game';
import { motion } from '@/ui';
import type { FieldArt } from './art';
import type { FieldEnv } from './env';
import { LOCK_FADE, LOCK_SNAP, lockAlpha, lockDiameter, lockPing, lockScale } from './lockMath';
import { bodySize } from './policy';

/** The ring is drawn for a 112 px circle and the brackets for a 108 px square (`art.ring`, `art.lockBrackets`). */
const RING_PX = 112;
const BRACKETS_PX = 108;

/**
 * The laser's lock on an elite or a boss: while the dot sits on one, a ring of dashes and four corner brackets in the laser's red close in on
 * its body (it snaps on in a fifth of a second, with a ping leaving it), turn slowly and follow it wherever it walks, until the enemy
 * dies, the dot is moved away or the laser ends. Reduced motion draws the same marker still. Everything is a pooled sprite: nothing is
 * allocated while it follows.
 */
export class LockMarker {
  readonly root = new Container();
  private readonly ring: Sprite;
  private readonly brackets: Sprite;
  private readonly ping: Sprite;
  private uid = 0;
  private age = 0;
  private diameter = 0;
  /** 0..1, how visible the marker is; it falls when the lock ends. */
  private shown = 0;

  constructor(
    private readonly env: FieldEnv,
    layer: Container,
  ) {
    const art: FieldArt = env.art;
    this.ring = new Sprite(art.ring);
    this.ring.anchor.set(0.5);
    this.ring.tint = Hue.alarm;
    this.brackets = new Sprite(art.lockBrackets);
    this.brackets.anchor.set(0.5);
    this.ping = new Sprite(art.ring);
    this.ping.anchor.set(0.5);
    this.ping.tint = Hue.cream;
    this.root.addChild(this.ping, this.ring, this.brackets);
    this.root.visible = false;
    this.root.eventMode = 'none';
    layer.addChild(this.root);
  }

  /** True while the marker is on screen (locked, or still fading). */
  get visible(): boolean {
    return this.root.visible;
  }

  /** The uid it is locked on (0 = none). */
  get locked(): number {
    return this.uid;
  }

  update(dt: number, time: number): void {
    const b = this.env.battle;
    const want = b.laser.active ? b.laser.lockUid : 0;
    if (want !== this.uid) {
      this.uid = want;
      // A lock that ends does not snap again while the marker fades: only a new lock starts the closing-in.
      this.age = want === 0 ? 1 : 0;
      if (want !== 0) {
        const foe = b.enemies.find((e) => e.uid === want);
        if (foe) {
          const def = enemyDef(foe.id);
          this.diameter = lockDiameter(bodySize(def.radius, def.traits.includes('boss')));
        }
      }
    }
    const view = this.uid !== 0 ? this.env.ctx.enemyView(this.uid) : null;
    this.shown = view ? 1 : motion.reduced ? 0 : damp(this.shown, 0, LOCK_FADE / 4, dt);
    this.root.visible = this.shown > 0.02;
    if (!this.root.visible) return;
    if (view) this.root.position.set(view.x, view.y);
    this.age += dt;
    const reduced = motion.reduced;
    const scale = lockScale(this.age, time, reduced);
    const a = lockAlpha(this.age, reduced) * this.shown;
    this.ring.scale.set((this.diameter / RING_PX) * scale);
    this.ring.rotation = reduced ? 0 : time * 0.9;
    this.ring.alpha = a;
    this.brackets.scale.set((this.diameter / BRACKETS_PX) * scale * 0.98);
    this.brackets.rotation = reduced ? 0 : -time * 0.5;
    this.brackets.alpha = a;
    const pong = reduced || !view ? null : lockPing(this.age - LOCK_SNAP * 0.6);
    this.ping.visible = pong !== null;
    if (pong) {
      this.ping.scale.set((this.diameter / RING_PX) * pong[0]);
      this.ping.alpha = pong[1];
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
