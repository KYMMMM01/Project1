/** Small display helpers shared by the HUD components: portraits, photo frames, icons, hit areas, class colours. */
import { Container, Graphics, Rectangle, Sprite, type DestroyOptions } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';
import { mixColor } from '@/core/math';
import type { ClassId, EnemyId, RarityId, RelicId, UnitId } from '@/game';
import {
  bindPress,
  cacheStatic,
  Color,
  drawDashedRect,
  drawIcon,
  drawPaper,
  drawPaperFace,
  paperSeed,
  Rarity,
  shade,
  tapeStrip,
  type IconName,
  type PressBinding,
  type TapeName,
} from '@/ui';

export const CLASS_ICON: Record<ClassId, IconName> = {
  warrior: 'class_warrior',
  ranger: 'class_ranger',
  mage: 'class_mage',
  trickster: 'class_trickster',
};

/**
 * One craft paper per class, the colour of that class's cats' clothes (red, green, blue, yellow): lit
 * synergy steps, the owned ranks of a ladder. The mage blue is borrowed from the rare rarity mat, the
 * only blue in the palette.
 */
export const CLASS_ACCENT: Record<ClassId, number> = {
  warrior: Color.coral,
  ranger: Color.leaf,
  mage: Rarity.rare.color,
  trickster: Color.mustard,
};

/** The washi tape that goes with each class: its chip, its selection sheet. */
export const CLASS_TAPE: Record<ClassId, TapeName> = {
  warrior: 'pink',
  ranger: 'green',
  mage: 'sky',
  trickster: 'yellow',
};

/** Stand-in icon for a toy without art: one glyph per rarity so a toy is never a blank square. */
const RELIC_FALLBACK: Record<Exclude<RarityId, 'mythic'>, IconName> = {
  common: 'paw',
  rare: 'heart',
  epic: 'star',
  legendary: 'crown',
};

/** A texture scaled to fit `box` x `box` and centred on the origin, or null when the art is not loaded. */
export function fitSprite(key: string, box: number): Sprite | null {
  if (!hasTex(key)) return null;
  const s = new Sprite(tex(key));
  s.anchor.set(0.5);
  const k = box / Math.max(s.texture.width, s.texture.height, 1);
  s.scale.set(k);
  return s;
}

/** Unit portrait about `h` tall, origin = centre. */
export function unitPortrait(id: UnitId, h: number): Container {
  const c = new Container();
  const s = fitSprite(`unit_${id}`, h);
  if (s) c.addChild(s);
  else c.addChild(drawIcon('paw', h * 0.8));
  return c;
}

/** Enemy portrait; small balloons borrow the big balloon's art, and anything unknown becomes a paper disc. */
export function enemyPortrait(id: EnemyId, size: number): Container {
  const c = new Container();
  const key = id.startsWith('boss_') ? id : `enemy_${id}`;
  const s = fitSprite(key, size) ?? fitSprite(key.replace('_small', ''), size * 0.75);
  if (s) c.addChild(s);
  else {
    const g = new Graphics();
    drawPaper(g, -size * 0.38, -size * 0.38, { w: size * 0.76, h: size * 0.76, kind: 'circle', fill: Color.paperDim, shadow: 3, grain: false });
    cacheStatic(g);
    c.addChild(g, drawIcon('skull', size * 0.5));
  }
  return c;
}

/** Toy icon: the art when it exists, otherwise a paper medallion in the rarity's mat colour with a glyph. */
export function relicIcon(id: RelicId, size: number, rarity: Exclude<RarityId, 'mythic'>): Container {
  const c = new Container();
  const s = fitSprite(`relic_${id}`, size);
  if (s) {
    c.addChild(s);
    return c;
  }
  const r = Rarity[rarity];
  const g = new Graphics();
  drawPaper(g, -size * 0.46, -size * 0.46, { w: size * 0.92, h: size * 0.92, kind: 'circle', fill: r.color, edge: r.dark, shadow: 3, grain: false });
  cacheStatic(g);
  c.addChild(g, drawIcon(RELIC_FALLBACK[rarity], size * 0.5));
  return c;
}

export { balanceWrap } from '@/ui';

export interface PhotoOpts {
  /** Side of the cream frame. */
  size: number;
  rarity: RarityId;
  /** The cat in the window; null = an empty paper slot with a dashed outline. */
  unit: UnitId | null;
  /** One strip of tape across the top-left corner. */
  tape?: TapeName;
  seed?: number;
}

/**
 * A cat as a small paper photo: cream frame, a mat in the rarity's colour, the sticker in the window.
 * The empty variant is the slot of a rank the player does not have. Origin = centre; static art is
 * baked once, so build one per change, not per frame.
 */
export function unitPhoto(o: PhotoOpts): Container {
  const s = o.size;
  const seed = o.seed ?? paperSeed();
  const c = new Container();
  const art = new Graphics();
  if (o.unit === null) {
    drawPaperFace(art, -s / 2, -s / 2, { w: s, h: s, radius: s * 0.2, fill: Color.paperDim, edge: Color.kraftDark, edgeAlpha: 0.35, grain: false, seed });
    drawDashedRect(art, -s / 2 + 5, -s / 2 + 5, s - 10, s - 10, { radius: s * 0.16, color: Color.kraftDark, width: 2.5, dash: 9, gap: 7, alpha: 0.7, seed });
    cacheStatic(art);
    c.addChild(art);
    return c;
  }
  const rar = Rarity[o.rarity];
  const m = Math.max(4, s * 0.06);
  drawPaper(art, -s / 2, -s / 2, { w: s, h: s, radius: s * 0.2, fill: Color.paperLight, edge: Color.kraftDark, shadow: 4, grain: false, seed });
  drawPaperFace(art, -s / 2 + m, -s / 2 + m, { w: s - m * 2, h: s - m * 2, radius: s * 0.15, fill: rar.color, edge: rar.dark, grain: false, seed: seed + 1, wobble: 0.7 });
  const inset = m + Math.max(3, s * 0.05);
  drawPaperFace(art, -s / 2 + inset, -s / 2 + inset, { w: s - inset * 2, h: s - inset * 2, radius: s * 0.11, fill: mixColor(rar.light, Color.paper, 0.62), edge: rar.dark, grain: false, seed: seed + 2, wobble: 0.6 });
  cacheStatic(art);
  c.addChild(art, unitPortrait(o.unit, s - inset * 2 - 2));
  if (o.tape) {
    const tape = tapeStrip({ name: o.tape, w: s * 0.48, h: Math.max(16, s * 0.17), angle: -24, pattern: 'dots', seed });
    tape.position.set(-s / 2 + s * 0.14, -s / 2 + 4);
    c.addChild(tape);
  }
  return c;
}

/** Make `c` a touch target covering the rectangle (in its own coordinates). */
export function tapArea(c: Container, x: number, y: number, w: number, h: number): void {
  c.eventMode = 'static';
  c.cursor = 'pointer';
  c.hitArea = new Rectangle(x, y, w, h);
}

export interface PressCardOpts {
  /** Fire on pointerdown (gameplay choices) instead of on release. */
  onDown?: boolean;
  /** A hold at least this long (tooltip time) is not a tap. */
  holdLimit?: number;
}

/**
 * A tappable card: the press dips and darkens it on the pointerdown frame, the release springs back.
 * `fire` runs on release inside the card (or on the down frame with `onDown`).
 */
export class PressCard extends Container {
  private readonly press: PressBinding;
  private downAt = 0;
  private enabledFlag = true;
  private dipped = false;

  constructor(w: number, h: number, private fire: (() => void) | null, opts: PressCardOpts = {}) {
    super();
    tapArea(this, -w / 2, -h / 2, w, h);
    const limit = opts.holdLimit ?? Infinity;
    this.press = bindPress(this, {
      down: () => {
        if (!this.enabledFlag) return;
        this.dipped = true;
        this.scale.set(this.scale.x * 0.96);
        this.tint = shade(Color.white, -0.15);
        this.downAt = game.time;
        if (opts.onDown) this.fire?.();
      },
      up: (released) => {
        if (this.dipped) {
          this.dipped = false;
          this.tint = Color.white;
          this.scale.set(this.scale.x / 0.96);
        }
        if (!this.enabledFlag || opts.onDown) return;
        if (released && game.time - this.downAt < limit) this.fire?.();
      },
    });
  }

  setEnabled(v: boolean): void {
    this.enabledFlag = v;
  }

  setFire(fn: (() => void) | null): void {
    this.fire = fn;
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    this.fire = null;
    super.destroy(options);
  }
}

/** Event subscriptions of a popup or screen: released together when it is destroyed. */
export class Subs {
  private offs: Array<() => void> = [];

  add(off: () => void): void {
    this.offs.push(off);
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
  }
}
