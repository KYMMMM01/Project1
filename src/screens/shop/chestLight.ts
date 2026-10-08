import { Container, Sprite } from 'pixi.js';
import { mixColor } from '@/core/math';
import { fxTex } from '@/fx';
import { CHEST_RARITIES } from '@/meta/types';
import { backOut, Color, Rarity } from '@/ui';

const RAYS = 14;

/** The two colours of the stage at a rank: what the sunburst, the paper bits and the light in the lid's crack are made of. */
export interface StageColors {
  core: number;
  edge: number;
}

/**
 * Rank 0 is plain cream paper (the quiet colour every opening starts on and the rank-0 chest keeps); every promotion changes it to
 * the colour of the rank it reaches, never to a darker one. Light is pale, paper white tinted with the rank, so it reads as light on the
 * wooden floor and not as a stain of the rank's own colour.
 */
const STAGE: readonly StageColors[] = CHEST_RARITIES.map((id, rank) => {
  const r = Rarity[id];
  return rank === 0 ? { core: Color.paperLight, edge: r.light } : { core: mixColor(Color.paperLight, r.light, 0.5), edge: mixColor(r.light, r.color, 0.65) };
});

export function stageColors(rank: number): StageColors {
  return STAGE[Math.min(STAGE.length - 1, Math.max(0, rank))] as StageColors;
}

export interface SunburstOpts {
  /** Rays all the way round (a second ring of a different count looks like a second layer). */
  rays?: number;
  /** Turning direction, 1 clockwise, -1 the other way. */
  dir?: 1 | -1;
}

/**
 * A flat paper sunburst: cut triangles in two tones fanning all the way round, turning slowly. Behind the closed chest it shows the
 * stage's colour and widens with every promotion (`setTint` flips the colour, `setLevel` widens it, `punch` is the kick of the flip). At
 * the pop it swells with an overshoot and spins up before it settles to a slow turn, then it follows the card on stage. Nothing glows and
 * nothing blends. Origin = the middle.
 */
export class Sunburst extends Container {
  private readonly pop = backOut(2);
  private readonly rays: Sprite[] = [];
  private readonly dir: number;
  private level = 0;
  private shownLevel = 0;
  /** The opacity before the pop it eases to, and where it is. */
  private body: number;
  private shownBody: number;
  private popAge = -1;
  private fadeAge = -1;
  private fadeFor = 0.4;
  private goal: number;
  private shown: number;
  /** A kick of a promotion or of the flourish of a card: 1 right after it, dying away. */
  private punched = 0;
  private spinMult = 1;
  private wanted = true;

  /** `windPeak` is the opacity before the pop (`setBody` changes it). `still` is the reduced-motion form: the same burst, no turning and no pop. */
  constructor(core: number, edge: number, radius: number, windPeak = 0.5, private readonly still = false, opts: SunburstOpts = {}) {
    super();
    this.eventMode = 'none';
    this.dir = opts.dir ?? 1;
    this.body = this.shownBody = windPeak;
    this.goal = this.shown = windPeak;
    const count = opts.rays ?? RAYS;
    const wedge = fxTex('wedge');
    for (let i = 0; i < count; i++) {
      const long = i % 2 === 0;
      const s = new Sprite(wedge.texture);
      s.anchor.set(wedge.ax, wedge.ay);
      const len = radius * (long ? 1 : 0.7);
      s.scale.set(len / wedge.w, (len * (long ? 0.24 : 0.17) * (RAYS / count)) / wedge.h);
      s.rotation = (i / count) * Math.PI * 2;
      this.addChild(s);
      this.rays.push(s);
    }
    this.setTint(core, edge);
    this.apply(0);
  }

  /** The stage's colour changes: the long rays take `edge`, the short ones `core`. */
  setTint(core: number, edge: number): void {
    for (let i = 0; i < this.rays.length; i++) (this.rays[i] as Sprite).tint = i % 2 === 0 ? edge : core;
  }

  /** How opaque the paper is before the pop (a better colour is bolder, or the pale paper would grey out on the wood); it eases there. */
  setBody(alpha: number): void {
    this.body = alpha;
  }

  /** How wide the burst has grown behind the closed chest, 0..1. It only ever grows, and eases to the new size. */
  setLevel(level: number): void {
    this.level = Math.min(1, Math.max(this.level, level));
  }

  /** Hidden until it is wanted (the second ring of the top rank's show). */
  setOn(on: boolean): void {
    this.wanted = on;
  }

  /** How much faster than usual it turns before the pop (the top rank's show), or how much slower (the late promotion's stall). */
  setSpin(mult: number): void {
    this.spinMult = mult;
  }

  /** The chest pops: the burst swells and spins up, and settles at `peak` opacity. */
  burst(peak: number): void {
    if (this.popAge >= 0) return;
    this.popAge = 0;
    this.goal = this.shown = peak;
  }

  /** A kick: the burst swells and spins up once more (a promotion, the big flourish of the best card). */
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
    this.shownLevel = this.still ? this.level : this.shownLevel + (this.level - this.shownLevel) * Math.min(1, dt * 7);
    this.shownBody = this.still ? this.body : this.shownBody + (this.body - this.shownBody) * Math.min(1, dt * 7);
    this.punched = Math.max(0, this.punched - dt * 2.2);
    const popped = this.popAge >= 0;
    const lv = this.shownLevel;
    // Without motion a kick is no swell.
    const kick = this.still ? 0 : this.punched;
    let a = popped ? this.shown : this.shownBody;
    if (this.fadeAge >= 0) a *= Math.max(0, 1 - this.fadeAge / this.fadeFor);
    const s = (popped ? 0.9 + 0.4 * this.pop(Math.min(1, this.popAge / 0.45)) : 0.3 + 0.6 * lv) * (1 + 0.25 * kick);
    this.apply(a, s, ((popped ? 0.3 + 2.4 * Math.exp(-4 * this.popAge) : 0.12 + 0.5 * lv) * this.spinMult + 2.5 * kick) * this.dir, dt);
  }

  private apply(alpha: number, scale = 0.3, spin = 0, dt = 0): void {
    this.alpha = alpha;
    this.visible = this.wanted && alpha > 0.002;
    if (this.still) {
      this.scale.set(this.popAge >= 0 ? 1.15 : scale);
      return;
    }
    this.scale.set(scale);
    this.rotation += spin * dt;
  }
}

const CRACK_RAYS = 7;
/** Spread of the light fanning out of the chest's lid, radians each side of straight up. */
const CRACK_SPREAD = 0.85;

/**
 * Light leaking out of the lid's crack: a fan of flat paper wedges pointing up from inside the chest, drawn behind its picture so only
 * what lies beyond the picture's edge shows, whatever the picture is. It takes the stage's colour and its strength follows the hop.
 */
export class CrackLight extends Container {
  private readonly rays: Sprite[] = [];

  constructor(radius: number) {
    super();
    this.eventMode = 'none';
    const wedge = fxTex('wedge');
    for (let i = 0; i < CRACK_RAYS; i++) {
      const long = i % 2 === 0;
      const s = new Sprite(wedge.texture);
      s.anchor.set(wedge.ax, wedge.ay);
      const len = radius * (long ? 1 : 0.72);
      s.scale.set(len / wedge.w, (len * (long ? 0.2 : 0.15)) / wedge.h);
      s.rotation = -Math.PI / 2 + (i / (CRACK_RAYS - 1) - 0.5) * 2 * CRACK_SPREAD;
      this.addChild(s);
      this.rays.push(s);
    }
    this.setGlow(0);
  }

  setTint(core: number, edge: number): void {
    for (let i = 0; i < this.rays.length; i++) (this.rays[i] as Sprite).tint = i % 2 === 0 ? edge : core;
  }

  /** 0 (dark) to 1 (the lid is up and the light is out). */
  setGlow(glow: number): void {
    this.visible = glow > 0.01;
    this.alpha = Math.min(1, glow * 1.4);
    this.scale.set(0.5 + 0.5 * glow);
  }
}
