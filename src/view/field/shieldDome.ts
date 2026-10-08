/**
 * An enemy's shield, drawn as what it is: a glass dome round the enemy's body that moves with it, in front of it. It is painted steel
 * glass with a hexagon pattern and a bright rim, a colour no friendly area wears (the blizzard is ice and the ground, this is steel and
 * stands up); it breathes a little; a hit on it flashes the glass and the point that was struck, cracks show as it weakens (two
 * stages), and when it breaks the dome is gone in a frame and `Fx.shieldBreak` throws its pieces. Pooled with its enemy view: built once,
 * the first time the view wears a shield, then reused.
 */
import { Container, Sprite } from 'pixi.js';
import { clamp01, damp } from '@/core/math';
import { Light } from '@/fx/light';
import { paint } from '@/fx/paint';
import { fxSettings } from '@/fx/settings';
import { fxTexture, type Fx } from '@/fx';

/** The dome is this much wider than the body's picture. */
const SPREAD = 1.34;
/** Shield left (share of the full shield) below which each stage of cracks shows. */
export const CRACK_ONE = 0.66;
export const CRACK_TWO = 0.33;
/** Seconds a hit's flash takes to go. */
const FLASH = 0.2;

/** Which stage of cracks a shield at `share` of its full strength shows: 0 none, 1 light, 2 heavy. */
export function crackStage(share: number): 0 | 1 | 2 {
  return share < CRACK_TWO ? 2 : share < CRACK_ONE ? 1 : 0;
}

export class ShieldDome {
  readonly root = new Container();
  private readonly glass = new Sprite(paint('shield_dome'));
  private readonly crackA = new Sprite(paint('shield_crack1'));
  private readonly crackB = new Sprite(paint('shield_crack2'));
  private width = 60;
  private on = false;
  /** How far the dome has grown in (0..1): it opens like a bubble when the enemy arrives. */
  private grown = 0;
  private flash = 0;
  private stage: 0 | 1 | 2 = 0;
  private share = 1;

  constructor() {
    this.root.eventMode = 'none';
    this.root.visible = false;
    for (const s of [this.glass, this.crackA, this.crackB]) {
      s.anchor.set(0.5);
      s.eventMode = 'none';
      this.root.addChild(s);
    }
    this.crackA.visible = false;
    this.crackB.visible = false;
  }

  /** Wear a shield round a body whose picture is `size` px across. */
  raise(size: number): void {
    this.width = size * SPREAD;
    this.on = true;
    this.grown = 0;
    this.flash = 0;
    this.stage = 0;
    this.share = 1;
    this.crackA.visible = false;
    this.crackB.visible = false;
    this.root.visible = true;
    this.apply(0);
  }

  get raised(): boolean {
    return this.on;
  }

  /** The shield is gone (broken, or the enemy died): the dome vanishes at once. */
  drop(): void {
    this.on = false;
    this.root.visible = false;
  }

  /** The shield took a blow from the direction `angle` (towards the attacker): the glass flashes, a ring runs out from the point struck. */
  hit(fx: Fx, cx: number, cy: number, angle: number, strong: boolean): void {
    if (!this.on) return;
    this.flash = 1;
    if (fxSettings.reducedMotion) return;
    const r = this.width * 0.46;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r * 0.9;
    const k = strong ? 1.4 : 1;
    fx.fleck(fxTexture('glow'), x, y, { life: 0.2, size: 46 * k, sizeEnd: 20, color: Light.shieldRim, alpha: 0.95, add: true, fadeAt: 0.1 });
    fx.fleck(paint('burst_ring'), x, y, { life: 0.3, size: 24 * k, sizeEnd: 96 * k, color: Light.shieldRim, alpha: 0.9, add: true, fadeAt: 0.2 });
    fx.fleck(paint('burst_glint'), x, y, { life: 0.2, size: 40 * k, sizeEnd: 14, rot: angle, color: Light.shieldHit, add: true, fadeAt: 0.2 });
  }

  /** Per frame: grows in, breathes, settles after a flash, and shows the cracks of the shield's strength (`share` 0..1). */
  update(dt: number, time: number, share: number): void {
    if (!this.on) return;
    this.share = share;
    this.grown = damp(this.grown, 1, 0.07, dt);
    this.flash = Math.max(0, this.flash - dt / FLASH);
    this.apply(time);
  }

  private apply(time: number): void {
    const calm = fxSettings.reducedMotion;
    const wake = calm ? 1 : this.grown * (1 + 0.1 * (1 - this.grown));
    const breathe = calm ? 0 : 0.018 * Math.sin(time * 2.6);
    const punch = this.flash * (calm ? 0 : 0.07);
    const px = this.width * (wake + breathe + punch);
    this.glass.scale.set(px / Math.max(1, this.glass.texture.width));
    // A weaker shield is fainter; a fresh hit lights it up.
    this.glass.alpha = clamp01((0.62 + 0.3 * this.share + (calm ? 0 : 0.05 * Math.sin(time * 2.6 + 1)) + 0.3 * this.flash) * clamp01(this.grown * 2));
    const stage = crackStage(this.share);
    if (stage !== this.stage) {
      this.stage = stage;
      this.crackA.visible = stage === 1;
      this.crackB.visible = stage === 2;
    }
    for (const c of [this.crackA, this.crackB]) {
      c.scale.set((px * 0.98) / Math.max(1, c.texture.width));
      c.alpha = clamp01(0.9 + 0.1 * this.flash);
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
