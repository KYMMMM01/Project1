import { Container, Sprite } from 'pixi.js';
import { damp } from '@/core/math';
import { Color } from '@/ui';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import type { FieldArt, CellGlyph } from './art';
import type { DropLook } from './policy';

/** `origin` is the empty slot a lifted cat leaves behind; `selected` is the cat that was tapped. */
export type CellLook = 'selected' | 'origin' | 'pick' | DropLook | null;

/** Opacities of the tint, the dashed outline and the sticker. */
type Levels = readonly [fill: number, ring: number, glyph: number];

interface LookStyle {
  color: number;
  glyph: CellGlyph | null;
  /** Shown on every cell in this state. */
  idle: Levels;
  /** Shown on the cell under the pointer. */
  hot: Levels;
}

/**
 * One dashed outline and one flat tint per state, in the kit's paper colours, each with its own sticker
 * as well so colour is never the only cue: teal = where it goes, leaf = merges, mustard = swaps, berry = refused.
 * Moves and swaps stay quiet until the pointer is over them; merges stay loud, because finding the
 * identical cats is the point of lifting one.
 */
const STYLE: Record<Exclude<CellLook, null>, LookStyle> = {
  selected: { color: Color.teal, glyph: null, idle: [0.16, 1, 0], hot: [0.16, 1, 0] },
  origin: { color: Color.kraftDark, glyph: null, idle: [0.2, 0.9, 0], hot: [0.2, 0.9, 0] },
  // A cat is selected: a tap on an empty cell moves it there, so those cells say so (a drag keeps its quiet look).
  pick: { color: Color.teal, glyph: 'move', idle: [0.1, 0.6, 0.8], hot: [0.16, 1, 0.9] },
  move: { color: Color.teal, glyph: 'move', idle: [0.05, 0.26, 0], hot: [0.16, 1, 0.9] },
  swap: { color: Color.mustardDark, glyph: 'swap', idle: [0.06, 0.32, 0], hot: [0.2, 1, 1] },
  merge: { color: Color.leaf, glyph: 'merge', idle: [0.22, 0.95, 1], hot: [0.3, 1, 1] },
  blocked: { color: Color.berry, glyph: 'blocked', idle: [0.1, 0, 0], hot: [0.22, 0.55, 0.85] },
};

interface Node {
  floor: Container;
  mark: Container;
  fill: Sprite;
  ring: Sprite;
  glyph: Sprite;
  look: CellLook;
  style: LookStyle | null;
  glyphKind: CellGlyph | null;
  fillA: number;
  ringA: number;
  glyphA: number;
  hover: number;
  hoverT: number;
  press: number;
}

const HALF_LIFE = 0.045;
const GLYPH_X = 35;
const GLYPH_Y = -40;

/**
 * Per-cell state looks, drawn from three shared sprites each (no per-frame redraw): a flat paper tint,
 * a dashed outline and a small sticker. The dashed outline of the merge look breathes so identical cats
 * stand out while one is held.
 */
export class CellLayer {
  private readonly nodes: Node[] = [];

  constructor(
    private readonly floor: Container,
    private readonly marks: Container,
    private readonly art: FieldArt,
  ) {
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const x = cellCenterX(cell);
      const y = cellCenterY(cell);
      const floorNode = new Container();
      floorNode.position.set(x, y);
      const fill = new Sprite(art.tileFill);
      fill.anchor.set(0.5);
      const ring = new Sprite(art.tileRing);
      ring.anchor.set(0.5);
      floorNode.addChild(fill, ring);
      const markNode = new Container();
      markNode.position.set(x, y);
      const glyph = new Sprite(art.glyph.move);
      glyph.anchor.set(0.5);
      glyph.position.x = GLYPH_X;
      markNode.addChild(glyph);
      floorNode.eventMode = 'none';
      markNode.eventMode = 'none';
      this.floor.addChild(floorNode);
      this.marks.addChild(markNode);
      fill.tint = Color.kraftDark;
      floorNode.visible = false;
      markNode.visible = false;
      this.nodes.push({
        floor: floorNode, mark: markNode, fill, ring, glyph, look: null, style: null, glyphKind: null,
        fillA: 0, ringA: 0, glyphA: 0, hover: 0, hoverT: 0, press: 0,
      });
    }
  }

  /** Set what one cell shows. `hover` marks the cell under the pointer, which stands out more. */
  set(cell: number, look: CellLook, hover: boolean): void {
    const n = this.nodes[cell];
    if (!n) return;
    n.hoverT = hover ? 1 : 0;
    if (n.look === look) return;
    n.look = look;
    n.style = look ? STYLE[look] : null;
    if (!n.style) {
      n.fill.tint = Color.kraftDark;
      return;
    }
    n.fill.tint = n.ring.tint = n.style.color;
    if (n.style.glyph && n.style.glyph !== n.glyphKind) {
      n.glyph.texture = this.art.glyph[n.style.glyph];
      n.glyphKind = n.style.glyph;
    }
  }

  /** Pointer went down on this cell: a quick dip of the paper, before anything else happens. */
  press(cell: number): void {
    const n = this.nodes[cell];
    if (n) n.press = 1;
  }

  update(dt: number, time: number): void {
    const k = Math.pow(0.5, dt / HALF_LIFE);
    for (const n of this.nodes) {
      n.hover = damp(n.hover, n.hoverT, 0.04, dt);
      if (n.press > 0) n.press = Math.max(0, n.press - dt * 5);
      const st = n.style;
      const h = n.hover;
      const fillT = st ? st.idle[0] + (st.hot[0] - st.idle[0]) * h : 0;
      const ringT = st ? st.idle[1] + (st.hot[1] - st.idle[1]) * h : 0;
      const glyphT = st ? st.idle[2] + (st.hot[2] - st.idle[2]) * h : 0;
      n.fillA = fillT + (n.fillA - fillT) * k;
      n.ringA = ringT + (n.ringA - ringT) * k;
      n.glyphA = glyphT + (n.glyphA - glyphT) * k;

      const visible = n.fillA > 0.004 || n.ringA > 0.004 || n.glyphA > 0.004 || n.press > 0;
      n.floor.visible = visible;
      n.mark.visible = visible;
      if (!visible) continue;

      const lit = n.press;
      const merge = n.look === 'merge';
      n.fill.alpha = Math.min(1, n.fillA) + 0.22 * lit;
      n.fill.scale.set(1 + 0.04 * h - 0.03 * lit);
      const beat = merge ? Math.sin(time * 7) : n.look === 'selected' ? Math.sin(time * 4) * 0.5 : 0;
      n.ring.alpha = Math.min(1, n.ringA * (merge ? 0.82 + 0.18 * beat : 1));
      n.ring.scale.set(1 + 0.05 * h - 0.03 * lit + 0.022 * beat);
      const bob = merge ? Math.sin(time * 8) * 3 : 0;
      n.glyph.alpha = n.glyphA;
      n.glyph.scale.set((n.look === 'swap' ? 0.9 : 0.8) * (1 + 0.28 * h));
      n.glyph.y = GLYPH_Y + bob;
    }
  }

  destroy(): void {
    for (const n of this.nodes) {
      this.floor.removeChild(n.floor);
      this.marks.removeChild(n.mark);
      n.floor.destroy({ children: true });
      n.mark.destroy({ children: true });
    }
    this.nodes.length = 0;
  }
}
