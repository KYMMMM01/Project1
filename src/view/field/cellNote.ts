import { Container, Graphics } from 'pixi.js';
import { CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { Color } from '@/ui';
import { info } from '../info';
import { cellNoteContent } from './cellMath';
import type { FieldEnv } from './env';

/** The paper note that says what a special cell does, with the real number, when the player taps an empty one. */
export class CellNote {
  private readonly anchor = new Graphics();

  constructor(
    private readonly env: FieldEnv,
    layer: Container,
  ) {
    // The kit's bubble needs something with a size to point at: a cell-sized invisible patch laid on the tapped cell.
    this.anchor.rect(-CELL_W / 2, -CELL_H / 2, CELL_W, CELL_H).fill({ color: Color.paper, alpha: 0.01 });
    this.anchor.eventMode = 'none';
    layer.addChild(this.anchor);
  }

  /** True when `cell` is one of this act's special cells, so a tap on it should be answered with the note. */
  lit(cell: number): boolean {
    return this.env.battle.sunbeams.includes(cell);
  }

  /** A tap on a special cell: its note opens, the same cell again closes it, another cell's replaces it (src/view/info.ts). */
  show(cell: number): void {
    this.anchor.position.set(cellCenterX(cell), cellCenterY(cell));
    info.tap(`cell:${cell}`, this.anchor, cellNoteContent(this.env.battle.specialCell, this.env.battle.relics));
  }

  destroy(): void {
    this.anchor.destroy();
  }
}
