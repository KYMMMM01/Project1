import { Container, Sprite } from 'pixi.js';
import { Ease } from '@/core/tween';
import { fxTex } from '@/fx';
import { backOut } from '@/ui';

const RAYS = 9;

/**
 * The light of an opened chest: flat paper wedges fanning upward from the opening in two tones, swaying slowly from side to
 * side as it turns, popping in with a little overshoot and fading when told to. Nothing glows and nothing blends: they are cut
 * triangles. Built once per reveal; `update` only moves what exists. Origin = the opening.
 */
export class LightFan extends Container {
  private readonly rays: Sprite[] = [];
  private readonly pop = backOut(2);
  private age = 0;
  private fadeFrom = Infinity;
  private fading = 0.4;
  private still: boolean;

  /** `still` is the reduced-motion form: the same fan, no pop and no sway. */
  constructor(core: number, edge: number, radius: number, private readonly peak = 0.55, still = false) {
    super();
    this.still = still;
    this.eventMode = 'none';
    const wedge = fxTex('wedge');
    const span = Math.PI - 0.5;
    for (let i = 0; i < RAYS; i++) {
      const long = i % 2 === 0;
      const s = new Sprite(wedge.texture);
      s.anchor.set(wedge.ax, wedge.ay);
      s.tint = long ? edge : core;
      const len = radius * (long ? 1 : 0.66);
      s.scale.set(len / wedge.w, (len * (long ? 0.2 : 0.13)) / wedge.h);
      s.rotation = -Math.PI + 0.25 + (i / (RAYS - 1)) * span;
      this.rays.push(s);
      this.addChild(s);
    }
    this.alpha = still ? this.peak : 0;
    if (still) this.scale.set(1);
  }

  /** Fade out and leave (it stays in the tree until the reveal is destroyed). */
  stop(seconds = 0.4): void {
    if (this.fadeFrom !== Infinity) return;
    this.fadeFrom = this.age;
    this.fading = seconds;
  }

  update(dt: number): void {
    this.age += dt;
    let a = this.still ? 1 : Math.min(1, this.age / 0.3);
    if (this.age > this.fadeFrom) a *= Math.max(0, 1 - (this.age - this.fadeFrom) / this.fading);
    this.alpha = a * this.peak;
    this.visible = this.alpha > 0.002;
    if (this.still) return;
    const k = Ease.cubicOut(Math.min(1, this.age / 0.4));
    this.scale.set(0.35 + 0.65 * this.pop(k));
    this.rotation = Math.sin(this.age * 0.9) * 0.3;
  }
}
