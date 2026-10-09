/**
 * A small picture of the board: the 5 x 5 cells on a kraft mat, the cells a diagram marks in their colour (a sun, a puddle or a bolt
 * on the three that have one) and the example cats standing on it. Origin = the middle of the mat; static art is baked once.
 */
import { Container, Graphics } from 'pixi.js';
import { mixColor } from '@/core/math';
import { unitClass } from '@/game/data/roster';
import { boltArt, puddleArt, sunArt } from '@/guide/Illustration';
import { cacheStatic, Color, paperSeed, paperShape } from '@/ui';
import { CLASS_ACCENT, fitSprite } from '@/view/hud/kit';
import type { BoardDiagram, Tone } from './boards';
import { cellBox, cellForWidth, diagramSize } from './diagramMath';
import { CELL_COUNT } from '@/game/geometry';

const wash = (colour: number, k = 0.5): number => mixColor(colour, Color.paperLight, k);

/** The fill and the edge of each tone; colours follow the battle's own marks (coral row, violet ring, green pairs, mustard sun). */
const TONE_COLOR: Readonly<Record<Tone, { fill: number; edge: number }>> = {
  sun: { fill: wash(Color.mustard, 0.4), edge: Color.mustardDark },
  wet: { fill: wash(Color.teal, 0.4), edge: Color.tealDark },
  zap: { fill: wash(Color.mustard, 0.4), edge: Color.mustardDark },
  row: { fill: wash(Color.coral, 0.45), edge: Color.coralDark },
  ring: { fill: wash(Color.violet, 0.45), edge: Color.violetDark },
  pair: { fill: wash(Color.leaf, 0.45), edge: Color.leafDark },
  aura: { fill: wash(Color.teal, 0.5), edge: Color.tealDark },
  self: { fill: wash(Color.coral, 0.4), edge: Color.coralDark },
};

const PAD_K = 0.5;

/** How the example cats are drawn: their stickers, or (on a diagram too small to tell neighbours apart) a disc in the colour of their class. */
export type CatStyle = 'sticker' | 'dot';

export class BoardView extends Container {
  /** Width and height of the mat, for the caller's layout. */
  readonly size: { w: number; h: number };

  /** `width` is the width of the cells' grid; the mat is a little wider on every side. */
  constructor(diagram: BoardDiagram, width: number, cats: CatStyle = 'sticker') {
    super();
    const { cell, gap } = cellForWidth(width);
    const grid = diagramSize(cell, gap);
    const pad = cell * PAD_K;
    this.size = { w: grid.w + pad * 2, h: grid.h + pad * 2 };
    this.addChild(paperShape({ w: this.size.w, h: this.size.h, radius: cell * 0.5, fill: Color.kraft, seed: paperSeed(), grain: false }));

    const floor = new Container();
    floor.position.set(-grid.w / 2, -grid.h / 2);
    const g = new Graphics();
    const radius = cell * 0.18;
    for (let c = 0; c < CELL_COUNT; c++) {
      const b = cellBox(c, cell, gap);
      const tone = diagram.tones[c] ?? null;
      const colour = tone ? TONE_COLOR[tone] : null;
      g.roundRect(b.x, b.y, b.w, b.h, radius).fill(colour?.fill ?? Color.paperLight);
      g.roundRect(b.x, b.y, b.w, b.h, radius).stroke({ color: colour?.edge ?? Color.kraftDark, width: colour ? 2.5 : 1.5, alpha: colour ? 1 : 0.6 });
    }
    cacheStatic(g);
    floor.addChild(g);
    for (let c = 0; c < CELL_COUNT; c++) {
      const glyph = diagram.tones[c] === 'sun' ? sunArt(cell) : diagram.tones[c] === 'wet' ? puddleArt(cell) : diagram.tones[c] === 'zap' ? boltArt(cell) : null;
      if (!glyph) continue;
      const b = cellBox(c, cell, gap);
      glyph.position.set(b.x + cell / 2, b.y + cell / 2);
      cacheStatic(glyph);
      floor.addChild(glyph);
    }
    for (const cat of diagram.cats) {
      const b = cellBox(cat.cell, cell, gap);
      if (cats === 'dot') {
        const dot = new Graphics().circle(0, 0, cell * 0.34).fill(CLASS_ACCENT[unitClass(cat.unit)]).circle(0, 0, cell * 0.34).stroke({ color: Color.ink, width: 2 });
        dot.position.set(b.x + cell / 2, b.y + cell / 2);
        floor.addChild(dot);
        continue;
      }
      const sprite = fitSprite(`unit_${cat.unit}`, cell * 1.15);
      if (!sprite) continue;
      sprite.position.set(b.x + cell / 2, b.y + cell * 0.46);
      floor.addChild(sprite);
    }
    this.addChild(floor);
  }
}
