import { Container, NineSliceSprite, Sprite, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { clamp, clamp01, damp, mixColor } from '@/core/math';
import type { Tweener } from '@/core/tween';
import { Color, TapeColors, paintTexture } from '@/ui';
import { popIn } from '@/fx';
import { enemyDef } from '@/game';
import type { EnemyId, EnemyState } from '@/game/api';
import { FIELD_W } from '@/game/geometry';
import type { FieldArt, StatusSticker } from './art';
import { barSegments, type BarSegments } from './policy';
import { deathScale, stepRate, walkBob, walkTilt } from './motion';

/** Longest side of the sprite is the radius times this: a cucumber (18) reads about 56 px, a boss (38) about 115. */
const SIZE_PER_RADIUS = 3.05;
const BOSS_SIZE_PER_RADIUS = 3.0;

/** Flat tints multiplied into the sprite while a status lasts; each also has its own sticker above the bar. */
const ICY = mixColor(Color.white, TapeColors.sky.base, 0.85);
const COOL = mixColor(Color.white, Color.teal, 0.55);
const SCORCH = mixColor(Color.white, Color.coral, 0.5);
const TOXIC = mixColor(Color.white, Color.leaf, 0.6);
const RAGE = mixColor(Color.white, Color.berry, 0.6);
const BAR_H = 6;
/** Gap kept between a drawn sprite and the screen edge: a boss on the outer lane would otherwise be cut by it. */
const EDGE_GAP = 6;

/** Texture key of an enemy: bosses use their own id, the small balloon borrows the big one's art. */
export function enemyTextureKey(id: EnemyId): string {
  const key = id.startsWith('boss_') ? id : 'enemy_' + id;
  if (hasTex(key)) return key;
  return key.replace(/_small$/, '');
}

/**
 * One enemy. Layers, outside in: `root` (positioned at the enemy; the director may use it), `lean`
 * (this class's own walk bob and waddle), `body` (left to juice helpers: spawn pop, hit squash and
 * knock), and the `sprite`. A flat shadow lies under it; elite and boss add a dashed ground ring and
 * a small sticker, and the health bar is a kraft strip with a painted fill.
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
  private readonly barBack: NineSliceSprite;
  private readonly barHp: NineSliceSprite;
  private readonly barShield: NineSliceSprite;
  private readonly bar = new Container();
  private readonly badge: Sprite;
  private readonly sticker: Sprite;
  private readonly seg: BarSegments = { hp: 0, shield: 0 };
  private sickness: StatusSticker | null = null;
  private size = 56;
  private barW = 44;
  private spriteScale = 0.2;
  private rate = 2;
  private facing = 1;
  private statusColor: number = Color.white;
  private statusAmt = 0;
  private lastTint: number = Color.white;
  private barShown = false;
  private barAlpha = 0;

  constructor(private readonly art: FieldArt) {
    this.root.label = 'enemy';
    this.body.label = 'body';
    this.sprite.label = 'sprite';
    this.sprite.anchor.set(0.5);
    this.shadow = this.makeSprite(art.shadow);
    this.aura = this.makeSprite(art.groundRing);
    this.ring = this.makeSprite(art.ring);
    this.ring.tint = Color.berry;
    this.ring.visible = false;
    this.stun = this.makeSprite(art.star);
    this.stun.visible = false;
    const fillTex = paintTexture(Color.white, BAR_H);
    const slice = (texture: Texture, caps: number): NineSliceSprite =>
      new NineSliceSprite({ texture, leftWidth: caps, rightWidth: caps, topHeight: 2, bottomHeight: 2 });
    this.barBack = slice(art.barTrack, 7);
    this.barHp = slice(fillTex, BAR_H / 2);
    this.barShield = slice(fillTex, BAR_H / 2);
    this.barShield.tint = TapeColors.sky.base;
    this.barBack.height = BAR_H + 6;
    this.barHp.height = BAR_H;
    this.barShield.height = BAR_H;
    this.badge = this.makeSprite(art.mark.elite);
    this.badge.visible = false;
    this.sticker = this.makeSprite(art.status.slow);
    this.sticker.visible = false;
    this.bar.addChild(this.barBack, this.barHp, this.barShield);
    this.bar.visible = false;
    this.body.addChild(this.sprite);
    this.lean.addChild(this.body);
    this.root.addChild(this.shadow, this.aura, this.lean, this.ring, this.stun, this.badge, this.bar, this.sticker);
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
    this.shadow.width = this.size * (heavy ? 1.0 : 0.85);
    this.shadow.height = this.size * (heavy ? 0.3 : 0.26);
    this.shadow.alpha = heavy ? 0.4 : 0.32;
    this.shadow.position.y = this.size * 0.36;
    // Elite and boss stand inside a dashed ground ring and carry a small sticker above the head.
    this.aura.visible = heavy;
    this.aura.tint = this.isBoss ? Color.berry : Color.mustardDark;
    this.aura.width = this.size * 1.5;
    this.aura.height = this.size * 0.62;
    this.aura.position.y = this.size * 0.34;
    this.badge.visible = heavy;
    this.badge.texture = this.isBoss ? this.art.mark.boss : this.art.mark.elite;
    this.badge.position.set(-this.size * 0.42, -this.size * 0.5);
    this.ring.width = this.ring.height = this.size * 1.22;
    this.ring.visible = false;
    this.stun.width = this.stun.height = Math.max(20, this.size * 0.36);
    this.stun.position.y = -this.size * 0.62;
    this.stun.visible = false;
    this.barW = clamp(this.size * 0.8, 40, 70);
    this.barBack.position.set(-this.barW / 2 - 3, -3);
    this.barBack.width = this.barW + 6;
    this.barHp.position.set(-this.barW / 2, 0);
    this.barShield.position.set(-this.barW / 2, 0);
    this.bar.position.set(0, -this.size * 0.56 - 10);
    this.sticker.position.set(this.barW / 2 + 8, -this.size * 0.56 - 12);
    this.sticker.visible = false;
    this.sickness = null;
    this.bar.visible = false;
    this.barShown = false;
    this.barAlpha = 0;
    this.statusAmt = 0;
    this.statusColor = Color.white;
    this.lastTint = Color.white;
    this.sprite.tint = Color.white;
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
    this.root.position.set(this.drawX(), this.y);
    this.root.zIndex = this.y + this.size * 0.3;
  }

  /** The sprite's x: the simulation's, pulled in just far enough that a big body stays on the screen. */
  private drawX(): number {
    const half = this.size / 2 + EDGE_GAP;
    return clamp(this.x, half, FIELD_W - half);
  }

  appear(tweens: Tweener): void {
    popIn(tweens, this.body, { ms: 230, overshoot: 1.6 });
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
    this.root.position.set(this.drawX(), this.y);
    this.root.zIndex = this.y + this.size * 0.3;
    this.sprite.scale.x = this.spriteScale * this.facing;
    this.aura.alpha = this.aura.visible ? 0.8 + 0.12 * Math.sin(time * 3.2) : 0;
    if (this.dying) {
      const s = deathScale(this.deathK);
      this.root.scale.set(Math.max(0, s));
      this.root.alpha = this.isBoss ? 1 : 1 - this.deathK * this.deathK;
    }
  }

  private updateStatus(dt: number, time: number, e: EnemyState): void {
    let color: number = Color.white;
    let amt = 0;
    let sick: StatusSticker | null = null;
    if (e.frozen) {
      color = ICY;
      amt = 0.85;
      sick = 'freeze';
    } else if (e.slow > 0.05) {
      color = COOL;
      amt = 0.6;
      sick = 'slow';
    } else if (e.burning) {
      color = SCORCH;
      amt = 0.55;
      sick = 'burn';
    } else if (e.poisoned) {
      color = TOXIC;
      amt = 0.55;
      sick = 'poison';
    }
    if (e.enraged) {
      color = RAGE;
      amt = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(time * 7));
      sick = 'rage';
    }
    if (sick !== this.sickness) {
      this.sickness = sick;
      this.sticker.visible = sick !== null;
      if (sick) this.sticker.texture = this.art.status[sick];
    }
    if (amt > 0) this.statusColor = color;
    this.statusAmt = damp(this.statusAmt, amt, 0.06, dt);
    const tint = this.statusAmt < 0.01 ? Color.white : mixColor(Color.white, this.statusColor, this.statusAmt);
    if (tint !== this.lastTint) {
      this.lastTint = tint;
      this.sprite.tint = tint;
    }
    this.ring.visible = e.focused;
    if (e.focused) {
      this.ring.alpha = 0.8 + 0.2 * Math.sin(time * 9);
      this.ring.rotation = time * 1.5;
    }
    this.stun.visible = e.stunned;
    if (e.stunned) {
      this.stun.rotation = time * 5;
      this.stun.alpha = 1;
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
    this.barHp.tint = hpFrac > 0.6 ? Color.leaf : hpFrac > 0.3 ? Color.mustard : Color.coral;
    this.barHp.width = this.seg.hp > 0 ? Math.max(BAR_H, this.barW * this.seg.hp) : 0;
    this.barShield.x = -this.barW / 2 + this.barW * this.seg.hp;
    this.barShield.width = this.seg.shield > 0 ? Math.max(BAR_H, this.barW * this.seg.shield) : 0;
  }

  /** The enemy died: start the collapse (a bar that shows nothing now is hidden). */
  die(): void {
    this.dying = true;
    this.bar.visible = false;
    this.ring.visible = false;
    this.stun.visible = false;
    this.sticker.visible = false;
    this.sickness = null;
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
