import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { Color } from '@/ui';
import { info } from '../info';
import type { FieldEnv } from './env';
import { sunBonusPercent } from './sunMath';

/** The paper note that says what a lit cell does, with the real number, when the player taps an empty one. */
export class SunNote {
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

  /** True when `cell` is lit, so a tap on it should be answered with the note. */
  lit(cell: number): boolean {
    return this.env.battle.sunbeams.includes(cell);
  }

  /** A tap on a lit cell: its note opens, the same cell again closes it, another cell's replaces it (src/view/info.ts). */
  show(cell: number): void {
    this.anchor.position.set(cellCenterX(cell), cellCenterY(cell));
    info.tap(`sun:${cell}`, this.anchor, { text: t('view.sun.tap', { n: sunBonusPercent(this.env.battle.relics) }) });
  }

  destroy(): void {
    this.anchor.destroy();
  }
}
