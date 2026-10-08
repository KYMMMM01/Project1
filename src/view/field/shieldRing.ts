/**
 * An enemy's shield, small and simple: a thin round outline that hugs the body (the body's size and a few pixels), drawn like the rest of
 * the game, a dark-brown line with a cobalt line inside it, and a very faint cobalt tint. Cobalt blue is the shield's colour and no
 * friendly effect wears it, so the ring still reads in a crowd of forty. A hit makes it flash pale and bump; when the shield is nearly
 * gone the ring turns dashed; when it breaks the ring is gone and `Fx.shieldBreak` pops a few flat shards. No pattern, no fill to
 * speak of, no glow, no pulsing. Pooled with its enemy view: built once, the first time the view wears a shield, then reused.
 *
 * The rings are baked once at a few sizes (a ring is a sprite, so forty of them are one batch) and the sprite is scaled by at most a
 * few per cent to the body's size, which keeps the line the same thickness on a cucumber and on a boss.
 */
import { Sprite, type Texture } from 'pixi.js';
import { clamp01, damp } from '@/core/math';
import { fxSettings } from '@/fx/settings';
import type { FieldArt } from './art';

/** Ring diameters the art is baked at, px: the nearest one to a body is used. */
export const RING_SIZES: readonly number[] = [44, 56, 68, 84, 104, 132, 170];
/** The look of a ring: whole, dashed (the shield is nearly gone) and lit (a hit has just landed). */
export type RingLook = 'whole' | 'dashed' | 'lit';
export const RING_LOOKS: readonly RingLook[] = ['whole', 'dashed', 'lit'];
/** The ring is as wide as the body (a picture has some empty room round the creature) and a few pixels. */
const FIT = 0.92;
const MARGIN = 4;
/** Share of the full shield below which the ring turns dashed. */
export const NEARLY_GONE = 0.25;
/** Seconds a hit's flash and bump take to go, and the least time between two flashes (a crowd of hits is not a strobe). */
const FLASH = 0.16;
const FLASH_GAP = 0.1;
/** How far a hit bumps the ring (a strong one bumps more), as a share of its size. */
const BUMP = 0.08;
const BUMP_STRONG = 0.14;

/** Whether a shield at `share` of its full strength shows as dashed. */
export function nearlyGone(share: number): boolean {
  return share < NEARLY_GONE;
}

/** Diameter of the ring round a body whose picture is `size` px across. */
export function ringWidth(size: number): number {
  return size * FIT + MARGIN;
}

/** The index of the baked size nearest to a ring round a body whose picture is `size` px across. */
export function ringBucket(size: number): number {
  const want = ringWidth(size);
  let best = 0;
  for (let i = 1; i < RING_SIZES.length; i++) {
    if (Math.abs((RING_SIZES[i] as number) - want) < Math.abs((RING_SIZES[best] as number) - want)) best = i;
  }
  return best;
}

export class ShieldRing {
  readonly sprite = new Sprite();
  private bucket = 0;
  private look: RingLook = 'whole';
  private on = false;
  /** How far the ring has opened (0..1): it pops in when the enemy arrives. */
  private grown = 0;
  /** 1 right after a hit, running down to 0. */
  private flash = 0;
  private bump = 0;
  private strong = false;
  /** The ring's size at rest, as a multiple of its baked size. */
  private fit = 1;
  private share = 1;

  constructor(private readonly art: FieldArt['shieldRing']) {
    this.sprite.anchor.set(0.5);
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
  }

  /** Wear a shield round a body whose picture is `size` px across. */
  raise(size: number): void {
    this.bucket = ringBucket(size);
    this.fit = ringWidth(size) / (RING_SIZES[this.bucket] as number);
    this.on = true;
    this.grown = fxSettings.reducedMotion ? 1 : 0;
    this.flash = 0;
    this.bump = 0;
    this.share = 1;
    this.look = 'whole';
    this.sprite.visible = true;
    this.apply();
  }

  get raised(): boolean {
    return this.on;
  }

  /** The look the ring wears now. */
  get showing(): RingLook {
    return this.look;
  }

  /** The shield is gone (broken, or the enemy died): the ring vanishes at once. */
  drop(): void {
    this.on = false;
    this.sprite.visible = false;
  }

  /** The shield took a blow: the ring flashes pale and bumps. A second blow inside a tenth of a second changes nothing more. */
  hit(strong: boolean): void {
    if (!this.on || this.flash > 1 - FLASH_GAP / FLASH) return;
    this.flash = 1;
    this.strong = strong;
    this.apply();
  }

  /** Per frame: opens, settles after a hit, and turns dashed as the shield runs low (`share` 0..1 of the full shield). */
  update(dt: number, share: number): void {
    if (!this.on) return;
    this.share = share;
    this.grown = damp(this.grown, 1, 0.06, dt);
    this.flash = Math.max(0, this.flash - dt / FLASH);
    this.bump = this.flash * (this.strong ? BUMP_STRONG : BUMP);
    this.apply();
  }

  private apply(): void {
    const calm = fxSettings.reducedMotion;
    const look: RingLook = this.flash > 0.45 ? 'lit' : nearlyGone(this.share) ? 'dashed' : 'whole';
    this.look = look;
    const texture = this.texture(look);
    if (this.sprite.texture !== texture) this.sprite.texture = texture;
    // It opens with a small overshoot; under reduced motion it is simply there, and a hit only lights it.
    const open = calm ? 1 : this.grown * (1 + 0.12 * (1 - this.grown));
    this.sprite.scale.set(this.fit * (open + (calm ? 0 : this.bump)));
    this.sprite.alpha = clamp01(this.grown * 2);
  }

  private texture(look: RingLook): Texture {
    return this.art[look][this.bucket] as Texture;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
