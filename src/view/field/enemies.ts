import type { Container } from 'pixi.js';
import { Pool } from '@/core/pool';
import { Ease } from '@/core/tween';
import { hitFlash, kickObject, punchScale, squash } from '@/fx';
import type { BattleEvents, EnemyState } from '@/game/api';
import type { FieldEnv } from './env';
import { EnemyView } from './enemyView';

/** A recycled view rests this long before reuse so a juice tween that is still finishing cannot touch its next owner. */
const COOLDOWN = 0.45;
const DEATH_SECONDS = 0.17;
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
  private readonly pool = new Pool<EnemyView>(() => new EnemyView());
  private readonly offs: Array<() => void> = [];
  private frame = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
  ) {
    this.layer.sortableChildren = true;
    const ev = env.battle.events;
    this.offs.push(
      ev.on('hit', (e) => this.onHit(e)),
      ev.on('enemyDie', (e) => this.onDie(e)),
      ev.on('shieldBreak', (e) => this.flash(e.enemy.uid, 0x4ee3ff, 90)),
      ev.on('enrage', (e) => this.onEnrage(e)),
    );
  }

  get(uid: number): EnemyView | null {
    return this.byUid.get(uid) ?? null;
  }

  update(dt: number): void {
    const { battle } = this.env;
    const time = this.env.time;
    this.frame++;
    const list = battle.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i] as EnemyState;
      let v = this.byUid.get(e.uid);
      if (!v) v = this.create(e);
      v.mark = this.frame;
      v.step(dt, time, e);
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
      v.step(dt, time, null);
    }
  }

  private create(e: EnemyState): EnemyView {
    const v = this.pool.get();
    v.assign(e);
    v.mark = this.frame;
    this.layer.addChild(v.root);
    this.byUid.set(e.uid, v);
    this.live.push(v);
    v.appear(this.env.ctx.tweens);
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
    if (v && !v.dying) hitFlash(this.env.ctx.tweens, v.sprite, { ms, color, peak: 0.8 });
  }

  private onHit(e: BattleEvents['hit']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (!v || v.dying || e.killed) return;
    // Damage-over-time ticks tint nothing: only a real strike flashes, knocks and squashes.
    if (e.dot) return;
    const { tweens } = this.env.ctx;
    hitFlash(tweens, v.sprite, { ms: e.crit ? 66 : 50 });
    const a = e.enemy.angle;
    kickObject(tweens, v.body, -Math.cos(a) * 3, -Math.sin(a) * 3, 100);
    squash(tweens, v.body, 1.12, 0.9, 120);
  }

  private onDie(e: BattleEvents['enemyDie']): void {
    const v = this.byUid.get(e.enemy.uid);
    if (!v) return;
    hitFlash(this.env.ctx.tweens, v.sprite, { ms: 50 });
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
    this.flash(e.enemy.uid, 0xff4d5e, 120);
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
