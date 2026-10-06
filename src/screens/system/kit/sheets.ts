/** Paper pieces the routine screens share: baked sheets, die-cut sticker discs, the kraft "locked" note. */
import { Container, Graphics, Rectangle, Sprite, type Texture } from 'pixi.js';
import { game } from '@/core/game';
import {
  bakeResolution,
  cacheStatic,
  Color,
  drawDashedRect,
  drawIcon,
  drawPaper,
  drawPaperFace,
  edgeTone,
  paperSeed,
  tapeStrip,
  uiLabel,
  type PaperOpts,
  type TapeName,
  type TapePattern,
  type TornSides,
} from '@/ui';
import { hash32 } from '@/ui/paperMath';
import { stickerTilt } from './parts';

export interface SheetTape {
  name: TapeName;
  /** Where along the top edge the strip sits, as a share of the width (default 0.5). */
  at?: number;
  pattern?: TapePattern;
}

export interface SheetOpts {
  /** Paper colour (default cream). */
  fill?: number;
  radius?: number;
  torn?: TornSides;
  /** Wobble seed; take one `paperSeed()` per component and reuse it. */
  seed?: number;
  /** A teal cut line this many px inside the edge. */
  dash?: number;
  dashColor?: number;
  /** A mustard backing sheet under the cream one: a featured card. */
  featured?: boolean;
  /** One strip of washi tape across the top edge. */
  tape?: SheetTape;
  shadow?: boolean;
  /** Bake into one texture (default). Turn off for a sheet taller than the screen: it is cheaper as geometry. */
  bake?: boolean;
}

const FEATURED_BORDER = 9;

function paintSheet(host: Container, w: number, h: number, o: SheetOpts): void {
  const radius = o.radius ?? 28;
  const seed = o.seed ?? paperSeed();
  const g = new Graphics();
  const base: PaperOpts = { w, h, radius, fill: o.fill ?? Color.paper, torn: o.torn, seed, shadow: o.shadow === false ? false : 5 };
  if (o.featured) {
    drawPaper(g, 0, 0, { ...base, fill: Color.mustard, edge: Color.mustardDark, grain: false, torn: undefined });
    drawPaperFace(g, FEATURED_BORDER, FEATURED_BORDER, { ...base, w: w - FEATURED_BORDER * 2, h: h - FEATURED_BORDER * 2, radius: Math.max(8, radius - FEATURED_BORDER + 4), seed: seed + 7 });
  } else {
    drawPaper(g, 0, 0, base);
  }
  if (o.dash !== undefined) {
    const d = o.dash;
    drawDashedRect(g, d, d, w - d * 2, h - d * 2, { radius: Math.max(8, radius - d + 4), color: o.dashColor ?? Color.teal, seed });
  }
  host.addChild(g);
  if (o.tape) {
    const t = o.tape;
    const strip = tapeStrip({ name: t.name, pattern: t.pattern ?? 'dots', w: 96, h: 28, angle: (seed % 5) - 2.5, seed });
    strip.position.set(w * (t.at ?? 0.5), 3);
    host.addChild(strip);
  }
}

/** A baked sheet with its top-left corner at the origin. One texture per instance: for a handful of big pieces. */
export function paperSheet(w: number, h: number, o: SheetOpts = {}): Container {
  const c = new Container();
  paintSheet(c, w, h, o);
  if (o.bake !== false) cacheStatic(c);
  return c;
}

const textures = new Map<string, Texture>();
/** Room around a baked piece for its flat shadow and the wobble of its cut. */
const BAKE_PAD = 12;

function bakedKey(kind: string, w: number, h: number, o: SheetOpts): string {
  const tornKey = o.torn === undefined ? '' : Array.isArray(o.torn) ? o.torn.join('+') : String(o.torn);
  const tape = o.tape ? `${o.tape.name}${o.tape.at ?? 0.5}${o.tape.pattern ?? ''}` : '';
  return [kind, w, h, o.fill ?? 0, o.radius ?? 0, tornKey, o.seed ?? 0, o.dash ?? '', o.featured ? 1 : 0, tape, o.shadow === false ? 0 : 1].join(':');
}

function bake(key: string, w: number, h: number, paint: (host: Container) => void): Texture {
  let tx = textures.get(key);
  if (tx) return tx;
  const c = new Container();
  paint(c);
  tx = game.app.renderer.generateTexture({
    target: c,
    frame: new Rectangle(-BAKE_PAD, -BAKE_PAD, w + BAKE_PAD * 2, h + BAKE_PAD * 2),
    resolution: bakeResolution(),
    antialias: true,
  });
  c.destroy({ children: true });
  textures.set(key, tx);
  return tx;
}

/**
 * A sheet whose texture is shared by every piece of the same size and look (a list of 30 rows would
 * otherwise bake 30 textures). Pass one of a few fixed `seed`s so the cut still varies down the list.
 * Top-left origin.
 */
export function sharedSheet(w: number, h: number, o: SheetOpts = {}): Sprite {
  const seeded = { ...o, seed: o.seed ?? hash32(Math.round(w), Math.round(h), 0x5ee7) };
  const sprite = new Sprite(bake(bakedKey('sheet', w, h, seeded), w, h, (host) => paintSheet(host, w, h, seeded)));
  sprite.position.set(-BAKE_PAD, -BAKE_PAD);
  return sprite;
}

/** Wobble seeds a list cycles through. */
export const SHEET_SEEDS: readonly number[] = [0x1a2b, 0x3c4d, 0x5e6f, 0x7081];

/**
 * A die-cut sticker: an ivory disc with a thin edge and a flat shadow, origin = centre, one shared
 * texture per size and seed. The art goes on top of it.
 */
export function stickerDisc(size: number, seed = 0, fill: number = Color.paperLight): Sprite {
  const key = `disc:${size}:${seed}:${fill}`;
  const tx = bake(key, size, size, (host) => {
    const g = new Graphics();
    drawPaper(g, 0, 0, { w: size, h: size, kind: 'circle', fill, seed: 0x57c0 + seed, shadow: 3, edge: edgeTone(fill), edgeWidth: 2.5, edgeAlpha: 0.7, grain: false });
    host.addChild(g);
  });
  const s = new Sprite(tx);
  // The baked frame is the disc plus equal padding on every side: its centre is the disc's centre.
  s.anchor.set(0.5);
  return s;
}

/**
 * A recessed kraft note that says a feature is locked and how to open it: a pinned scrap with a
 * padlock sticker and the hint in ink. Top-left origin; `height` is fixed.
 */
export function lockedNote(w: number, hint: string, height = 168): Container {
  const c = new Container();
  const seed = paperSeed();
  c.addChild(paperSheet(w, height, { fill: Color.kraft, radius: 26, seed, dash: 14, dashColor: Color.kraftDark, tape: { name: 'yellow', at: 0.82, pattern: 'gingham' } }));
  const disc = stickerDisc(92, seed % 4);
  disc.position.set(78, height / 2);
  disc.rotation = stickerTilt(seed);
  const lock = drawIcon('lock', 54);
  lock.position.copyFrom(disc.position);
  const text = uiLabel(hint, { size: 28, wrap: w - 220, align: 'left', anchorX: 0, lineHeight: 38 });
  text.position.set(150, height / 2 + 2);
  c.addChild(disc, lock, text);
  return c;
}
