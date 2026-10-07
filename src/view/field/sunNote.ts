import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { Color, tooltip } from '@/ui';
import type { FieldEnv } from './env';
import { sunBonusPercent } from './sunMath';

/** How long the explanation of a sunbeam cell stays up. */
const SHOWN_FOR = 3.2;

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

  show(cell: number): void {
    this.anchor.position.set(cellCenterX(cell), cellCenterY(cell));
    tooltip.show(this.anchor, { text: t('view.sun.tap', { n: sunBonusPercent(this.env.battle.relics) }) }, SHOWN_FOR);
  }

  destroy(): void {
    if (tooltip.target === this.anchor) tooltip.hide();
    this.anchor.destroy();
  }
}
