import type { Container } from 'pixi.js';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { mixColor } from '@/core/math';
import { Color } from '@/ui';
import { kickObject, punchScale, rattleObject, squash, wobbleRotation } from '@/fx';
import { Hue } from '@/fx/palette';
import { Light } from '@/fx/light';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import type { BattleEvents, EnemyState, UnitId } from '@/game/api';
import type { ZoneMark } from './art';
import type { FieldEnv } from './env';
import { EnemyView } from './enemyView';
import { depthFrame } from './policy';
import { materialOf, reactionOf } from './reactions';
import { weaponStyle } from '../weapons';

/** A recycled view rests this long before reuse so a juice tween that is still finishing cannot touch its next owner. */
const COOLDOWN = 0.45;
const DEATH_SECONDS = 0.17;
/** A body answers a blow at most this often (seconds): sixteen hits a second are one long shudder, not sixteen overlapping ones. */
const REACT_GAP = 0.07;
/** A hit with no cat behind it (a toy) tints the body like this. */
const PLAIN_TINT = mixColor(Color.coral, Hue.cream, 0.3);
/** Where each cell's cat stands, looked up once. */
const CELL_AT = Array.from({ length: CELL_COUNT }, (_, c) => ({ x: cellCenterX(c), y: cellCenterY(c) }));
/** A blow on a shield with no cat behind it (a toy, a tick) lands on the top of the dome. */
const FROM_ABOVE = -Math.PI / 2;
/** How long a dead boss stays standing for the director's death sequence before the field clears it. */
const BOSS_HOLD = 2.6;

/**
 * Every enemy on screen. Views follow the simulation's enemy list each frame (a new enemy pops in
 * at the doorway); events add the reactions: hit flash, knock and squash, shield break, enrage,
 * and the collapse on death. Enemies are depth-sorted by their y.
 */
export class EnemyViews {
  private readonly byUid = new Map<number, EnemyView>();
  private readonly live: EnemyView[] = [];
  private readonly pool: Pool<EnemyView>;
  private readonly offs: Array<() => void> = [];
  /** Where each cat type last attacked from: the direction a blow on a shield came from. */
  private readonly from = new Map<UnitId, { x: number; y: number }>();
  private frame = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
  ) {
    this.layer.sortableChildren = true;
    this.pool = new Pool<EnemyView>(() => new EnemyView(env.art));
    const ev = env.battle.events;
    this.offs.push(
      ev.on('hit', (e) => this.onHit(e)),
      ev.on('enemyDie', (e) => this.onDie(e)),
      ev.on('attack', (e) => {
        const at = CELL_AT[e.unit.cell];
        if (at) this.from.set(e.unit.id, at);
      }),
      ev.on('shieldBreak', (e) => this.onShieldBreak(e)),
      ev.on('enrage', (e) => this.onEnrage(e)),
    );
  }

  get(uid: number): EnemyView | null {
    return this.byUid.get(uid) ?? null;
  }

  /**
   * Make one more view for the pool if fewer than `n` rest in it, so a wave's first crowd does not build its bodies on the frame it walks in.
   * @returns true when `n` views are ready
   */
  spare(n: number): boolean {
    if (this.pool.idle >= n) return true;
    this.pool.release(new EnemyView(this.env.art));
    return this.pool.idle >= n;
  }

  update(dt: number): void {
    const { battle } = this.env;
    const time = this.env.time;
    this.frame++;
    const reorder = depthFrame(this.frame);
    const list = battle.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i] as EnemyState;
      let v = this.byUid.get(e.uid);
      if (!v) v = this.create(e);
      v.mark = this.frame;
      v.step(dt, time, e, reorder);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const v = this.live[i] as EnemyView;
      if (v.mark === this.frame) continue;
      if (v.holdUntil) {
        if (time > v.holdUntil || !v.root.visible || v.root.alpha <= 0.01) {
          v.holdUntil = 0;
          this.release(v);
          continue;
        }
      } else if (!v.dying) {
        // Removed without an event (a revive clearing the field): collapse like a death, quietly.
        this.collapse(v);
      }
      v.step(dt, time, null, reorder);
    }
  }

  /** An area is acting on enemy `uid` this frame: its tag shows beside the health bar. */
  zoneTouch(uid: number, kind: ZoneMark): void {
    this.byUid.get(uid)?.zoneTouch(kind);
  }

  private create(e: EnemyState): EnemyView {
    const v = this.pool.get();
    v.assign(e);
    v.mark = this.frame;
    this.layer.addChild(v.root);
    this.byUid.set(e.uid, v);
    this.live.push(v);
    v.appear(this.env.ctx.tweens, this.env.ctx.ui);
    return v;
  }

  private release(v: EnemyView): void {
    this.byUid.delete(v.uid);
    const i = this.live.indexOf(v);
    if (i >= 0) {
      this.live[i] = this.live[this.live.length - 1] as EnemyView;
      this.live.pop();
    }
    v.retire();
    this.layer.removeChild(v.root);
    this.env.ctx.tweens.call(COOLDOWN, () => this.pool.release(v));
  }

  private collapse(v: EnemyView): void {
    v.die();
    const token = v.token;
    this.env.ctx.tweens.run({
      duration: DEATH_SECONDS,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (v.token === token) v.setDeath(k);
      },
      onComplete: () => {
        if (v.token === token) this.release(v);
      },
    });
  }

  private flash(uid: number, color: number, ms: number): void {
    const v = this.byUid.get(uid);
    if (v && !v.dying) v.flash(color, ms, 0.8);
  }

  /** The shield is gone: the dome vanishes, the body flinches in the shield's colour, and the pieces fly (the director's `Fx.shieldBreak`). */
  private onShieldBreak(e: BattleEvents['shieldBreak']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (!v || v.dying) return;
    v.shieldGone();
    v.flash(Light.shieldRim, 110, 0.8);
    punchScale(this.env.ctx.tweens, v.body, 0.2, 220);
  }

  private onHit(e: BattleEvents['hit']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (v && !v.dying && e.absorbed > 0) {
      const from = e.unitId ? this.from.get(e.unitId) : undefined;
      const angle = from ? Math.atan2(from.y - e.enemy.y, from.x - e.enemy.x) : FROM_ABOVE;
      v.shieldHit(this.env.ctx.fx, angle, e.crit || e.absorbed >= e.enemy.maxShield * 0.2);
    }
    if (!v || v.dying || e.killed) return;
    // Damage-over-time ticks tint nothing: only a real strike flashes, knocks and squashes.
    if (e.dot) return;
    const time = this.env.time;
    if (time - v.reactAt < REACT_GAP) return;
    v.reactAt = time;
    const { tweens } = this.env.ctx;
    // The enemy answers in the voice of what it is made of and the weapon that hit it: a tint in the weapon's colour (never a white
    // flash), then a squash and a wobble for soft things or a rigid knock and a rattle for hard ones; a heavy weapon moves it more.
    const style = e.unitId ? weaponStyle(e.unitId) : null;
    const r = reactionOf(materialOf(e.enemy.id));
    const w = (style ? style.weight : 0.8) * (e.crit ? 1.25 : 1);
    v.flash(style ? mixColor(style.tint, Hue.cream, 0.2) : PLAIN_TINT, e.crit ? 70 : 55, 0.7);
    const a = e.enemy.angle;
    kickObject(tweens, v.body, -Math.cos(a) * r.knock * w, -Math.sin(a) * r.knock * w, 100);
    squash(tweens, v.body, 1 + (r.sx - 1) * w, 1 + (r.sy - 1) * w, r.ms);
    if (r.wobble > 0) wobbleRotation(tweens, v.body, r.wobble * w, 420, 11, 7);
    if (r.rattle > 0) rattleObject(tweens, v.body, { ms: 170, amplitude: r.rattle * w, degrees: 2, from: 24, to: 32 });
  }

  private onDie(e: BattleEvents['enemyDie']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (!v) return;
    v.flash(Color.white, 50, 0.9);
    if (v.isBoss) {
      // The director's boss sequence flickers and blows up this view; it is hidden when that ends.
      v.die();
      v.holdUntil = this.env.time + BOSS_HOLD;
      v.mark = this.frame;
      return;
    }
    this.collapse(v);
  }

  private onEnrage(e: BattleEvents['enrage']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (!v) return;
    punchScale(this.env.ctx.tweens, v.body, 0.22, 220);
    this.flash(e.enemy.uid, Color.coral, 120);
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const v of this.live) v.root.destroy({ children: true });
    this.live.length = 0;
    this.byUid.clear();
    this.pool.drain((v) => v.root.destroy({ children: true }));
  }
}
