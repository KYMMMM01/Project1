/**
 * A topic's small picture, built from the game's own stickers and kit pieces: a cream paper tile with the cats,
 * enemy, toy, chest, board cell or glyph of the topic on it. Origin = centre; the art is baked once, so build
 * one per use rather than per frame.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import { cacheStatic, Color, currencyIcon, drawDashedInset, drawIcon, paperSeed, paperShape, Rarity, type IconName } from '@/ui';
import { relicDef, type UnitId } from '@/game';
import { enemyPortrait, relicIcon } from '@/view/hud/kit';
import type { Art } from './topics';

/** A texture scaled to fit `box` and centred on the origin, or null when the art is not loaded. */
function sticker(key: string, box: number): Sprite | null {
  if (!hasTex(key)) return null;
  const s = new Sprite(tex(key));
  s.anchor.set(0.5);
  s.scale.set(box / Math.max(s.texture.width, s.texture.height, 1));
  return s;
}

/** A craft-paper disc with a glyph on it: the stand-in for anything without a sticker. */
function disc(box: number, fill: number, icon: IconName): Container {
  const c = new Container();
  const g = new Graphics();
  g.circle(0, 0, box * 0.42).fill(fill);
  g.circle(0, 0, box * 0.42).stroke({ color: mixColor(fill, Color.ink, 0.35), width: 3 });
  cacheStatic(g);
  c.addChild(g, drawIcon(icon, box * 0.5));
  return c;
}

const ICON_PAPER: Partial<Record<IconName, number>> = {
  skull: Color.berry,
  warning: Color.berry,
  sell: Color.berry,
  clock: Color.mustard,
  fish: Color.teal,
  lucky_clover: Color.leaf,
  purr: Color.mustard,
  molt: Color.teal,
  target: Color.coral,
  wave_call: Color.leaf,
  crown: Color.mustard,
  trophy: Color.mustard,
  star: Color.mustard,
  play: Color.leaf,
};

/** A flat paper sun for a sunny cell: rays and a disc (no glow). */
export function sunArt(box: number): Graphics {
  const g = new Graphics();
  const r0 = box * 0.2;
  const r1 = box * 0.4;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const half = 0.17;
    g.poly([Math.cos(a - half) * r0, Math.sin(a - half) * r0, Math.cos(a) * r1, Math.sin(a) * r1, Math.cos(a + half) * r0, Math.sin(a + half) * r0]).fill(Color.mustard);
  }
  g.circle(0, 0, r0).fill(mixColor(Color.mustard, Color.paperLight, 0.35));
  return g;
}

/** A paper lightning bolt for a zapped cell. */
export function boltArt(box: number): Graphics {
  const g = new Graphics();
  const s = box * 0.4;
  g.poly([s * 0.15, -s, -s * 0.55, s * 0.1, -s * 0.05, s * 0.1, -s * 0.2, s, s * 0.55, -s * 0.2, s * 0.05, -s * 0.2]).fill(Color.mustard);
  g.poly([s * 0.15, -s, -s * 0.55, s * 0.1, -s * 0.05, s * 0.1, -s * 0.2, s, s * 0.55, -s * 0.2, s * 0.05, -s * 0.2]).stroke({ color: Color.mustardDark, width: 3 });
  return g;
}

/** A paper puddle for a wet cell. */
export function puddleArt(box: number): Graphics {
  const g = new Graphics();
  g.ellipse(-box * 0.1, box * 0.04, box * 0.3, box * 0.18).fill(Color.teal);
  g.ellipse(box * 0.2, -box * 0.12, box * 0.16, box * 0.1).fill(Color.teal);
  g.ellipse(-box * 0.18, box * 0.16, box * 0.12, box * 0.07).fill(mixColor(Color.teal, Color.paperLight, 0.4));
  return g;
}

/** A board cell (a wooden tile) with the sun on it, a puddle or a lightning strike, and optionally the cat standing there. */
function cellArt(art: Extract<Art, { k: 'cell' }>, box: number): Container {
  const c = new Container();
  const side = box * 0.78;
  const tile = new Graphics();
  tile.roundRect(-side / 2, -side / 2, side, side, side * 0.14).fill(Color.woodLight);
  tile.roundRect(-side / 2, -side / 2, side, side, side * 0.14).stroke({ color: Color.woodDark, width: 3 });
  const fx = art.cell === 'sun' ? sunArt(box) : art.cell === 'zap' ? boltArt(box) : puddleArt(box);
  cacheStatic(tile);
  c.addChild(tile, fx);
  if (art.cat) {
    const cat = sticker(`unit_${art.cat}`, box * 0.52);
    if (cat) {
      cat.position.set(0, box * 0.05);
      c.addChild(cat);
    }
  }
  return c;
}

/** One to four cat portraits in a row, with a small arrow between them when `arrows` says they lead somewhere. */
function catsArt(art: Extract<Art, { k: 'cats' }>, box: number, small: boolean): Container {
  const c = new Container();
  // On a small tile a long line shows where it starts and where it leads instead of a row of specks.
  const ids = small && art.ids.length > 2 && art.arrows ? [art.ids[0] as UnitId, art.ids[art.ids.length - 1] as UnitId] : art.ids;
  const n = ids.length;
  const gap = art.arrows ? box * 0.1 : box * 0.04;
  const each = Math.min(box * 0.62, (box * 0.94 - gap * (n - 1)) / n);
  const total = n * each + (n - 1) * gap;
  ids.forEach((id, i) => {
    const x = -total / 2 + each / 2 + i * (each + gap);
    const photo = new Container();
    const frame = new Graphics();
    const rar = Rarity[i === n - 1 && n > 1 ? 'rare' : 'common'];
    frame.roundRect(-each / 2, -each / 2, each, each, each * 0.18).fill(mixColor(rar.light, Color.paper, 0.5));
    frame.roundRect(-each / 2, -each / 2, each, each, each * 0.18).stroke({ color: Color.kraftDark, width: 2.5 });
    cacheStatic(frame);
    photo.addChild(frame);
    const s = sticker(`unit_${id}`, each * 0.92);
    photo.addChild(s ?? drawIcon('paw', each * 0.6));
    photo.position.set(x, 0);
    c.addChild(photo);
    if (art.arrows && i < n - 1) {
      const arrow = drawIcon('play', Math.max(14, gap * 1.5), Color.kraftDark);
      arrow.position.set(x + each / 2 + gap / 2, 0);
      c.addChild(arrow);
    }
  });
  return c;
}

/** Builds the picture of a topic on a paper tile of `size` x `size`. */
export function illustration(art: Art, size: number): Container {
  const root = new Container();
  const seed = paperSeed();
  const paper = { w: size, h: size, radius: size * 0.16, fill: Color.paperLight, seed, grain: false } as const;
  root.addChild(paperShape(paper));
  const line = new Graphics();
  drawDashedInset(line, -size / 2, -size / 2, paper, 4, { color: Color.teal, width: 2.5, dash: 9, gap: 7, alpha: 0.7, seed });
  cacheStatic(line);
  root.addChild(line);
  // The picture lives inside the dashed line, 6 px clear of it on every side: never on it.
  const inner = size - 24;
  switch (art.k) {
    case 'icon':
      root.addChild(disc(inner, ICON_PAPER[art.name] ?? mixColor(Color.teal, Color.paper, 0.35), art.name));
      break;
    case 'cats':
      root.addChild(catsArt(art, inner, size < 160));
      break;
    case 'foe':
      root.addChild(enemyPortrait(art.id, inner * 0.8));
      break;
    case 'toy':
      root.addChild(relicIcon(art.id, inner * 0.74, relicDef(art.id).rarity));
      break;
    case 'cell':
      root.addChild(cellArt(art, inner));
      break;
    case 'chest':
      root.addChild(currencyIcon(`chest_${art.chest}`, inner * 0.78));
      break;
  }
  return root;
}
