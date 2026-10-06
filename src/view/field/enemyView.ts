import { Container, Sprite, Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { clamp, clamp01, damp, mixColor } from '@/core/math';
import type { Tweener } from '@/core/tween';
import { fxTexture, popIn } from '@/fx';
import { enemyDef } from '@/game';
import type { EnemyId, EnemyState } from '@/game/api';
import { barSegments, type BarSegments } from './policy';
import { deathScale, stepRate, walkBob, walkTilt } from './motion';

/** Longest side of the sprite is the radius times this: a cucumber (18) reads about 56 px, a boss (38) about 115. */
const SIZE_PER_RADIUS = 3.05;
const BOSS_SIZE_PER_RADIUS = 3.0;

const ICY = 0xaee4ff;
const COOL = 0x9ec4ff;
const SCORCH = 0xffb27a;
const TOXIC = 0xa8e08c;
const RAGE = 0xff6a5a;

/** Texture key of an enemy: bosses use their own id, the small balloon borrows the big one's art. */
export function enemyTextureKey(id: EnemyId): string {
  const key = id.startsWith('boss_') ? id : 'enemy_' + id;
  if (hasTex(key)) return key;
  return key.replace(/_small$/, '');
}

/**
 * One enemy. Layers, outside in: `root` (positioned at the enemy; the director may use it), `lean`
 * (this class's own walk bob and waddle), `body` (left to juice helpers: spawn pop, hit squash and
 * knock), and the `sprite`.
 */
export class EnemyView {
  readonly root = new Container();
  readonly body = new Container();
  readonly sprite = new Sprite();
  token = 0;
  uid = 0;
  id: EnemyId = 'cucumber';
  x = 0;
  y = 0;
  /** Frame stamp of the last reconcile that matched this view to a live enemy. */
  mark = 0;
  /** A dead boss stays standing until this time unless the director hides it first (0 = not held). */
  holdUntil = 0;
  dying = false;
  isBoss = false;
  isElite = false;
  /** Death progress 0..1 while the collapse plays. */
  deathK = 0;

  private readonly lean = new Container();
  private readonly shadow: Sprite;
  private readonly aura: Sprite;
  private readonly ring: Sprite;
  private readonly stun: Sprite;
  private readonly barBack: Sprite;
  private readonly barHp: Sprite;
  private readonly barShield: Sprite;
  private readonly bar = new Container();
  private readonly seg: BarSegments = { hp: 0, shield: 0 };
  private size = 56;
  private barW = 44;
  private spriteScale = 0.2;
  private rate = 2;
  private facing = 1;
  private statusColor = 0xffffff;
  private statusAmt = 0;
  private lastTint = 0xffffff;
  private barShown = false;
  private barAlpha = 0;

  constructor() {
    this.root.label = 'enemy';
    this.body.label = 'body';
    this.sprite.label = 'sprite';
    this.sprite.anchor.set(0.5);
    this.shadow = this.makeSprite(fxTexture('glow'));
    this.shadow.tint = 0x000000;
    this.aura = this.makeSprite(fxTexture('glow'));
    this.aura.blendMode = 'add';
    this.ring = this.makeSprite(fxTexture('ring'));
    this.ring.tint = 0xff4d5e;
    this.ring.visible = false;
    this.stun = this.makeSprite(fxTexture('star'));
    this.stun.tint = 0xffe14d;
    this.stun.visible = false;
    this.barBack = new Sprite(Texture.WHITE);
    this.barHp = new Sprite(Texture.WHITE);
    this.barShield = new Sprite(Texture.WHITE);
    this.barBack.tint = 0x140a2e;
    this.barBack.alpha = 0.75;
    this.barShield.tint = 0x4ee3ff;
    this.bar.addChild(this.barBack, this.barHp, this.barShield);
    this.bar.visible = false;
    this.body.addChild(this.sprite);
    this.lean.addChild(this.body);
    this.root.addChild(this.shadow, this.aura, this.lean, this.ring, this.stun, this.bar);
    this.root.eventMode = 'none';
  }

  private makeSprite(texture: Texture): Sprite {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.eventMode = 'none';
    return s;
  }

  /** Make this view show `enemy`. Resets every transient look so a recycled view starts clean. */
  assign(enemy: EnemyState): void {
    const def = enemyDef(enemy.id);
    this.uid = enemy.uid;
    this.id = enemy.id;
    this.isBoss = def.traits.includes('boss');
    this.isElite = def.traits.includes('elite');
    this.dying = false;
    this.deathK = 0;
    this.holdUntil = 0;
    const texture = tex(enemyTextureKey(enemy.id));
    this.sprite.texture = texture;
    this.size = def.radius * (this.isBoss ? BOSS_SIZE_PER_RADIUS : SIZE_PER_RADIUS);
    this.spriteScale = this.size / Math.max(texture.width, texture.height, 1);
    this.rate = stepRate(def.speed);
    this.facing = Math.cos(enemy.angle) < 0 ? -1 : 1;
    const heavy = this.isBoss || this.isElite;
    this.shadow.width = this.size * (heavy ? 1.15 : 0.95);
    this.shadow.height = this.size * (heavy ? 0.4 : 0.32);
    this.shadow.alpha = heavy ? 0.55 : 0.4;
    this.shadow.position.y = this.size * 0.36;
    this.aura.visible = heavy;
    this.aura.tint = this.isBoss ? 0xff4d7a : 0xffb347;
    this.aura.width = this.size * 1.5;
    this.aura.height = this.size * 0.7;
    this.aura.position.y = this.size * 0.34;
    this.ring.width = this.ring.height = this.size * 1.22;
    this.ring.visible = false;
    this.stun.width = this.stun.height = Math.max(18, this.size * 0.34);
    this.stun.position.y = -this.size * 0.62;
    this.stun.visible = false;
    this.barW = clamp(this.size * 0.8, 36, 70);
    this.barBack.position.set(-this.barW / 2 - 1.5, -2);
    this.barBack.width = this.barW + 3;
    this.barBack.height = 8;
    this.barHp.position.set(-this.barW / 2, 0);
    this.barHp.height = 4;
    this.barShield.height = 4;
    this.bar.position.set(0, -this.size * 0.56 - 8);
    this.bar.visible = false;
    this.barShown = false;
    this.barAlpha = 0;
    this.statusAmt = 0;
    this.statusColor = 0xffffff;
    this.lastTint = 0xffffff;
    this.sprite.tint = 0xffffff;
    this.sprite.alpha = 1;
    this.sprite.scale.set(this.spriteScale * this.facing, this.spriteScale);
    this.root.alpha = 1;
    this.root.scale.set(1);
    this.root.visible = true;
    this.body.scale.set(1);
    this.body.alpha = 1;
    this.lean.position.set(0, 0);
    this.lean.rotation = 0;
    this.x = enemy.x;
    this.y = enemy.y;
    this.root.position.set(this.x, this.y);
    this.root.zIndex = this.y + this.size * 0.3;
  }

  appear(tweens: Tweener): void {
    popIn(tweens, this.body, { ms: 230, overshoot: 2.0 });
  }

  /** Per-frame upkeep. `enemy` is null for a dead view that is still playing out. */
  step(dt: number, time: number, enemy: EnemyState | null): void {
    if (enemy) {
      this.x = enemy.x;
      this.y = enemy.y;
      const cos = Math.cos(enemy.angle);
      // Turn only on a clear left/right heading, so the straight vertical runs keep the last facing.
      const want = cos > 0.2 ? 1 : cos < -0.2 ? -1 : this.facing >= 0 ? 1 : -1;
      this.facing = Math.abs(this.facing - want) > 0.01 ? damp(this.facing, want, 0.04, dt) : want;

      const still = enemy.frozen || enemy.stunned;
      const amp = still ? 0 : (this.size * 0.07) * (1 - 0.5 * enemy.slow);
      this.lean.y = -walkBob(enemy.age, this.rate, amp);
      this.lean.rotation = enemy.stunned ? Math.sin(time * 14) * 0.1 : walkTilt(enemy.age, this.rate, still ? 0 : 0.09);
      this.updateStatus(dt, time, enemy);
      this.updateBar(dt, enemy);
    }
    this.root.position.set(this.x, this.y);
    this.root.zIndex = this.y + this.size * 0.3;
    this.sprite.scale.x = this.spriteScale * this.facing;
    this.aura.alpha = this.aura.visible ? 0.3 + 0.12 * Math.sin(time * 3.2) : 0;
    if (this.dying) {
      const s = deathScale(this.deathK);
      this.root.scale.set(Math.max(0, s));
      this.root.alpha = this.isBoss ? 1 : 1 - this.deathK * this.deathK;
    }
  }

  private updateStatus(dt: number, time: number, e: EnemyState): void {
    let color = 0xffffff;
    let amt = 0;
    if (e.frozen) {
      color = ICY;
      amt = 0.85;
    } else if (e.slow > 0.05) {
      color = COOL;
      amt = 0.6;
    } else if (e.burning) {
      color = SCORCH;
      amt = 0.55;
    } else if (e.poisoned) {
      color = TOXIC;
      amt = 0.55;
    }
    if (e.enraged) {
      color = RAGE;
      amt = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 7));
    }
    if (amt > 0) this.statusColor = color;
    this.statusAmt = damp(this.statusAmt, amt, 0.06, dt);
    const tint = this.statusAmt < 0.01 ? 0xffffff : mixColor(0xffffff, this.statusColor, this.statusAmt);
    if (tint !== this.lastTint) {
      this.lastTint = tint;
      this.sprite.tint = tint;
    }
    this.ring.visible = e.focused;
    if (e.focused) {
      this.ring.alpha = 0.7 + 0.25 * Math.sin(time * 9);
      this.ring.rotation = time * 1.5;
    }
    this.stun.visible = e.stunned;
    if (e.stunned) {
      this.stun.rotation = time * 5;
      this.stun.alpha = 0.9;
    }
  }

  private updateBar(dt: number, e: EnemyState): void {
    const damaged = e.hp < e.maxHp - 0.01 || (e.maxShield > 0 && e.shield < e.maxShield - 0.01);
    // Bosses wear the HUD's big bar instead.
    if (damaged && !this.isBoss) this.barShown = true;
    this.barAlpha = damp(this.barAlpha, this.barShown ? 1 : 0, 0.05, dt);
    this.bar.visible = this.barAlpha > 0.02;
    if (!this.bar.visible) return;
    this.bar.alpha = this.barAlpha;
    barSegments(e.hp, e.maxHp, e.shield, e.maxShield, this.seg);
    const hpFrac = e.maxHp > 0 ? e.hp / e.maxHp : 0;
    this.barHp.tint = hpFrac > 0.6 ? 0x5ee06a : hpFrac > 0.3 ? 0xffd23f : 0xff5a5a;
    this.barHp.width = this.barW * this.seg.hp;
    this.barShield.x = -this.barW / 2 + this.barW * this.seg.hp;
    this.barShield.width = this.barW * this.seg.shield;
  }

  /** The enemy died: start the collapse (a bar that shows nothing now is hidden). */
  die(): void {
    this.dying = true;
    this.bar.visible = false;
    this.ring.visible = false;
    this.stun.visible = false;
  }

  retire(): void {
    this.token++;
    this.dying = false;
    this.holdUntil = 0;
    this.root.visible = false;
  }

  /** Progress of the death collapse, driven by the manager's tween. */
  setDeath(k: number): void {
    this.deathK = clamp01(k);
  }
}
