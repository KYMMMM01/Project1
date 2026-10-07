import { Container, Sprite } from 'pixi.js';
import { fxTex } from '@/fx';
import { backOut } from '@/ui';

const RAYS = 14;

/**
 * A flat paper sunburst: cut triangles in two tones fanning all the way round, turning slowly. Behind the closed chest it is the
 * tell: it grows a step with every burst in the colour of the best rarity inside. At the pop it swells with an overshoot and spins up
 * before it settles to a slow turn, then it follows the card on stage. Nothing glows and nothing blends. Origin = the middle.
 */
export class Sunburst extends Container {
  private readonly pop = backOut(2);
  private level = 0;
  private popAge = -1;
  private fadeAge = -1;
  private fadeFor = 0.4;
  private goal: number;
  private shown: number;
  /** A kick of the flourish of a card: 1 right after it, dying away. */
  private punched = 0;

  /** `windPeak` is the opacity at full growth before the pop. `still` is the reduced-motion form: the same burst, no turning and no pop. */
  constructor(core: number, edge: number, radius: number, private readonly windPeak = 0.5, private readonly still = false) {
    super();
    this.eventMode = 'none';
    this.goal = this.shown = windPeak;
    const wedge = fxTex('wedge');
    for (let i = 0; i < RAYS; i++) {
      const long = i % 2 === 0;
      const s = new Sprite(wedge.texture);
      s.anchor.set(wedge.ax, wedge.ay);
      s.tint = long ? edge : core;
      const len = radius * (long ? 1 : 0.7);
      s.scale.set(len / wedge.w, (len * (long ? 0.24 : 0.17)) / wedge.h);
      s.rotation = (i / RAYS) * Math.PI * 2;
      this.addChild(s);
    }
    this.apply(0);
  }

  /** How far the burst has grown behind the closed chest, 0..1. */
  setLevel(level: number): void {
    this.level = Math.min(1, Math.max(this.level, level));
  }

  /** The chest pops: the burst swells and spins up, and settles at `peak` opacity. */
  burst(peak: number): void {
    if (this.popAge >= 0) return;
    this.popAge = 0;
    this.goal = this.shown = peak;
  }

  /** The big flourish of the best card: the burst swells and spins up once more. */
  punch(): void {
    this.punched = 1;
  }

  /** The opacity it settles at after the pop (the card on stage asks for more as the ranks rise). */
  setPeak(peak: number): void {
    this.goal = peak;
  }

  /** Fade out and leave (it stays in the tree until the reveal is destroyed). */
  stop(seconds = 0.4): void {
    if (this.fadeAge >= 0) return;
    this.fadeAge = 0;
    this.fadeFor = Math.max(0.01, seconds);
  }

  update(dt: number): void {
    if (this.popAge >= 0) this.popAge += dt;
    if (this.fadeAge >= 0) this.fadeAge += dt;
    this.shown += (this.goal - this.shown) * Math.min(1, dt * 6);
    this.punched = Math.max(0, this.punched - dt * 2.2);
    const popped = this.popAge >= 0;
    let a = popped ? this.shown : (0.25 + 0.75 * this.level) * this.windPeak;
    if (this.fadeAge >= 0) a *= Math.max(0, 1 - this.fadeAge / this.fadeFor);
    const s = (popped ? 0.9 + 0.4 * this.pop(Math.min(1, this.popAge / 0.45)) : 0.3 + 0.6 * this.level) * (1 + 0.25 * this.punched);
    this.apply(a, s, (popped ? 0.3 + 2.4 * Math.exp(-4 * this.popAge) : 0.12 + 0.5 * this.level) + 2.5 * this.punched, dt);
  }

  private apply(alpha: number, scale = 0.3, spin = 0, dt = 0): void {
    this.alpha = alpha;
    this.visible = alpha > 0.002;
    if (this.still) {
      this.scale.set(this.popAge >= 0 ? 1.15 : scale);
      return;
    }
    this.scale.set(scale);
    this.rotation += spin * dt;
  }
}
