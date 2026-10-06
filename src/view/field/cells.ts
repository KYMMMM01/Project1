import { Container, Sprite } from 'pixi.js';
import { fxTexture } from '@/fx';
import { damp } from '@/core/math';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import type { FieldArt, CellGlyph } from './art';
import type { DropLook } from './policy';

export type CellLook = 'selected' | DropLook | null;

/** Colour-blind-safe palette (blue / orange / yellow / grey), each also told apart by its glyph. */
const LOOK_COLOR = { selected: 0xffe066, move: 0x56b4e9, swap: 0xe69f00, blocked: 0x151024 } as const;

interface Node {
  floor: Container;
  mark: Container;
  fill: Sprite;
  frame: Sprite;
  brackets: Sprite;
  glow: Sprite;
  glyph: Sprite;
  look: CellLook;
  glyphKind: CellGlyph | null;
  color: number;
  fillA: number;
  frameA: number;
  bracketsA: number;
  glowA: number;
  glyphA: number;
  fillT: number;
  frameT: number;
  bracketsT: number;
  glowT: number;
  glyphT: number;
  hover: number;
  hoverT: number;
  press: number;
}

const HALF_LIFE = 0.045;

/**
 * Per-cell state looks, drawn from a handful of shared sprites each (no per-frame redraw). Every
 * look has its own glyph or shape as well as its colour: move = target ring, swap = double arrow,
 * merge = rarity glow + up arrow, blocked = dimmed + cross, selected = corner brackets.
 */
export class CellLayer {
  private readonly nodes: Node[] = [];
  private readonly glowTex = fxTexture('glow');

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
      const glow = new Sprite(this.glowTex);
      glow.anchor.set(0.5);
      glow.blendMode = 'add';
      glow.width = 190;
      glow.height = 190;
      const fill = new Sprite(art.tileFill);
      fill.anchor.set(0.5);
      const frame = new Sprite(art.tileFrame);
      frame.anchor.set(0.5);
      const brackets = new Sprite(art.brackets);
      brackets.anchor.set(0.5);
      floorNode.addChild(glow, fill, frame, brackets);
      const markNode = new Container();
      markNode.position.set(x, y);
      const glyph = new Sprite(art.glyph.move);
      glyph.anchor.set(0.5);
      markNode.addChild(glyph);
      floorNode.eventMode = 'none';
      markNode.eventMode = 'none';
      this.floor.addChild(floorNode);
      this.marks.addChild(markNode);
      const node: Node = {
        floor: floorNode, mark: markNode, fill, frame, brackets, glow, glyph, look: null, glyphKind: null, color: 0xffffff,
        fillA: 0, frameA: 0, bracketsA: 0, glowA: 0, glyphA: 0, fillT: 0, frameT: 0, bracketsT: 0, glowT: 0, glyphT: 0,
        hover: 0, hoverT: 0, press: 0,
      };
      floorNode.visible = false;
      markNode.visible = false;
      this.nodes.push(node);
    }
  }

  /**
   * Set what one cell shows. `color` is the merge glow (the result's rarity colour); `hover` marks
   * the cell under the pointer, which stands out more.
   */
  set(cell: number, look: CellLook, occupied: boolean, color: number, hover: boolean): void {
    const n = this.nodes[cell];
    if (!n) return;
    n.hoverT = hover ? 1 : 0;
    if (n.look === look && n.color === color) return;
    n.look = look;
    n.color = color;
    n.fillT = n.frameT = n.bracketsT = n.glowT = n.glyphT = 0;
    let glyph: CellGlyph | null = null;
    switch (look) {
      case 'selected':
        n.fill.tint = n.frame.tint = n.brackets.tint = LOOK_COLOR.selected;
        n.fillT = 0.14;
        n.frameT = 0.55;
        n.bracketsT = 1;
        break;
      case 'move':
        n.fill.tint = n.frame.tint = LOOK_COLOR.move;
        n.fillT = 0.15;
        n.frameT = 0.6;
        if (!occupied) glyph = 'move';
        n.glyph.tint = 0xcfeeff;
        n.glyphT = 0.8;
        break;
      case 'swap':
        n.fill.tint = n.frame.tint = LOOK_COLOR.swap;
        n.fillT = 0.2;
        n.frameT = 0.95;
        glyph = 'swap';
        n.glyph.tint = 0xffc34d;
        n.glyphT = 1;
        break;
      case 'merge':
        n.fill.tint = n.frame.tint = n.glow.tint = color;
        n.fillT = 0.24;
        n.frameT = 1;
        n.glowT = 0.95;
        glyph = 'arrowUp';
        n.glyph.tint = color;
        n.glyphT = 1;
        break;
      case 'blocked':
        n.fill.tint = LOOK_COLOR.blocked;
        n.fillT = 0.4;
        glyph = 'blocked';
        n.glyph.tint = 0xe3e6f4;
        n.glyphT = 0.9;
        break;
      case null:
        n.fill.tint = 0xffffff;
        break;
    }
    if (glyph && glyph !== n.glyphKind) {
      n.glyph.texture = this.art.glyph[glyph];
      n.glyphKind = glyph;
    }
    if (!glyph) n.glyphT = 0;
    // Glyphs sit in the cell's top-right corner beside the unit's head; a target ring sits in the middle of an empty cell.
    n.glyph.x = glyph === 'move' ? 0 : 33;
  }

  /** Pointer went down on this cell: a quick light flash and dip, before anything else happens. */
  press(cell: number): void {
    const n = this.nodes[cell];
    if (n) n.press = 1;
  }

  update(dt: number, time: number): void {
    for (const n of this.nodes) {
      const k = Math.pow(0.5, dt / HALF_LIFE);
      n.fillA = n.fillT + (n.fillA - n.fillT) * k;
      n.frameA = n.frameT + (n.frameA - n.frameT) * k;
      n.bracketsA = n.bracketsT + (n.bracketsA - n.bracketsT) * k;
      n.glowA = n.glowT + (n.glowA - n.glowT) * k;
      n.glyphA = n.glyphT + (n.glyphA - n.glyphT) * k;
      n.hover = damp(n.hover, n.hoverT, 0.04, dt);
      if (n.press > 0) n.press = Math.max(0, n.press - dt * 5);

      const visible = n.fillA > 0.004 || n.frameA > 0.004 || n.glowA > 0.004 || n.glyphA > 0.004 || n.bracketsA > 0.004 || n.press > 0;
      n.floor.visible = visible;
      n.mark.visible = visible;
      if (!visible) continue;

      const h = n.hover;
      const lit = n.press;
      n.fill.alpha = Math.min(1, n.fillA * (1 + 0.8 * h)) + 0.2 * lit;
      n.frame.alpha = Math.min(1, n.frameA * (0.8 + 0.4 * h));
      n.frame.scale.set(1 + 0.05 * h - 0.03 * lit);
      n.fill.scale.set(1 + 0.04 * h - 0.03 * lit);
      n.brackets.alpha = n.bracketsA;
      n.brackets.scale.set(1 + 0.03 * Math.sin(time * 6));
      n.glow.alpha = n.glowA * (0.7 + 0.3 * Math.sin(time * 5.2) + 0.3 * h);
      const bob = n.look === 'merge' ? Math.sin(time * 8) * 3.5 : 0;
      n.glyph.alpha = n.glyphA;
      n.glyph.scale.set((n.look === 'swap' ? 0.85 : n.look === 'move' ? 0.62 : 0.8) * (1 + 0.28 * h) + (n.look === 'move' ? 0.06 * Math.sin(time * 6) : 0));
      n.glyph.y = (n.glyphKind === 'move' ? 4 : -42) + bob;
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
