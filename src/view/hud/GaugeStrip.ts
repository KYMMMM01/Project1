/**
 * The enemy gauge: a long torn cream strip with the skull sticker over its left end, the count in ink
 * and a painted fill that grows with the enemies on the field (leaf, mustard, coral as it gets
 * dangerous). Origin = centre of the strip.
 */
import { Container, NineSliceSprite, type DestroyOptions, type Text } from 'pixi.js';
import { lerp } from '@/core/math';
import { Ease } from '@/core/tween';
import { Color, cacheStatic, drawIcon, fitLabel, motion, paintTexture, paperShape, paperSeed, TweenBag, uiLabel } from '@/ui';

export const GAUGE_H = 58;
/** The skull sticker's icon size: it is drawn 63 x 69 (layoutMath SKULL_REACH / SKULL_HALF), taller than the strip and centred on its left end. */
const SKULL_SIZE = 76;
/** Painted fill: inset from the strip's edges so the skull keeps its end and the torn teeth keep theirs. */
const FILL_H = 40;
const FILL_LEFT = 44;
const FILL_RIGHT = 26;

/** 0 calm, 1 caution, 2 danger: the paint of the fill. */
export type GaugeLevel = 0 | 1 | 2;

const PAINT: Record<GaugeLevel, number> = { 0: Color.leaf, 1: Color.mustard, 2: Color.coral };

export class GaugeStrip extends Container {
  private readonly bag = new TweenBag();
  private readonly fill: NineSliceSprite;
  private readonly text: Text;
  private readonly skull: Container;
  private readonly seed = paperSeed();
  private strip: Container;
  private stripW: number;
  private innerW: number;
  private shown = 0;
  private level: GaugeLevel = 0;

  constructor(width: number) {
    super();
    this.stripW = width;
    this.innerW = width - FILL_LEFT - FILL_RIGHT;
    this.strip = this.cut(width);
    this.fill = new NineSliceSprite({ texture: paintTexture(PAINT[0], FILL_H), leftWidth: FILL_H / 2, rightWidth: FILL_H / 2, topHeight: 2, bottomHeight: 2 });
    this.fill.height = FILL_H;
    this.fill.visible = false;
    this.text = uiLabel('', { size: 34 });
    this.skull = drawIcon('skull', SKULL_SIZE);
    this.addChild(this.strip, this.fill, this.text, this.skull);
    this.place();
  }

  /** The torn strip at width `w`; the same seed every time, so a narrower strip is the same piece of paper cut shorter. */
  private cut(w: number): Container {
    const strip = paperShape({ w, h: GAUGE_H, radius: 10, fill: Color.paper, torn: ['right'], seed: this.seed, grain: false });
    cacheStatic(strip);
    return strip;
  }

  /** Everything hangs from the strip's left end, so a change of width only moves what is measured from the right. */
  private place(): void {
    this.fill.position.set(-this.stripW / 2 + FILL_LEFT, -FILL_H / 2);
    this.text.position.set((FILL_LEFT - FILL_RIGHT) / 2 + 2, 0);
    this.skull.position.set(-this.stripW / 2 + 2, 0);
  }

  /** Cut the strip to `w` wide (its left end stays put): the tutorial's skip button takes the top row's right end for a while. */
  setWidth(w: number): void {
    if (Math.abs(w - this.stripW) < 0.5) return;
    this.stripW = w;
    this.innerW = w - FILL_LEFT - FILL_RIGHT;
    const old = this.strip;
    this.strip = this.cut(w);
    this.addChildAt(this.strip, 0);
    old.destroy({ children: true });
    this.place();
    this.apply(this.shown);
    this.fitText();
  }

  setLabel(text: string): void {
    this.text.text = text;
    this.fitText();
  }

  private fitText(): void {
    fitLabel(this.text, this.innerW - 60, 34, 0.7);
  }

  setLevel(level: GaugeLevel): void {
    if (level === this.level) return;
    this.level = level;
    this.fill.texture = paintTexture(PAINT[level], FILL_H);
  }

  /** Fill to `v` (0..1); an animated change eases over a fifth of a second. */
  setValue(v: number, animate = true): void {
    const next = Math.min(1, Math.max(0, v));
    this.bag.killAll();
    const from = this.shown;
    if (!animate || motion.reduced || from === next) {
      this.apply(next);
      return;
    }
    this.bag.run({ duration: 0.22, ease: Ease.cubicOut, onUpdate: (k) => this.apply(lerp(from, next, k)), onComplete: () => this.apply(next) });
  }

  private apply(v: number): void {
    this.shown = v;
    const w = v <= 0 ? 0 : Math.max(FILL_H, v * this.innerW);
    this.fill.visible = w > 0;
    this.fill.width = Math.max(1, w);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}
