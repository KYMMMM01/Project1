import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { clamp, damp } from '@/core/math';
import { Color, drawSpeechBubble, fitWidth, label, rarityName } from '@/ui';
import { mergeResultOf, unitRarity } from '@/game';
import type { DropAction, UnitId } from '@/game/api';
import { CELL_H, CELL_W, COLS, FIELD_W, ROWS, cellCenterX, cellCenterY, cellRow } from '@/game/geometry';
import type { FieldEnv } from './env';
import { previewBelow } from './policy';
import { FEET_DY, unitSpriteScale } from './unitView';

const PORTRAIT_H = 66;
const BUBBLE_H = 92;
const TAIL = { len: 14, half: 11 } as const;
const PAD = 16;
const MAX_TEXT_W = 190;
const GHOST_ALPHA = 0.4;

/**
 * What a held cat is about to do, shown quietly where it will happen. Over an identical cat: a paper
 * bubble with the portrait and name of the cat the merge makes (the line a build follows). Over an
 * empty cell: a ghost of the held cat. Over another cat: a ghost of that cat in the cell the held one
 * left. A refused target is told by its cell alone (see CellLayer).
 */
export class DragPreview {
  private readonly bubble = new Container();
  private readonly paper = new Graphics();
  private readonly portrait = new Sprite();
  private readonly sticker: Sprite;
  private readonly name: Text;
  private readonly rank: Text;
  private readonly ghostMove = new Sprite();
  private readonly ghostSwap = new Sprite();
  private result: UnitId | null = null;
  private bubbleW = 0;
  private flip = false;
  private tailX = 0;
  private drawnTailX = -1;
  private show = 0;
  private showTarget = 0;

  constructor(
    private readonly env: FieldEnv,
    floor: Container,
    top: Container,
  ) {
    this.name = label('', { size: 26, anchorX: 0 });
    this.rank = label('', { size: 24, anchorX: 0, color: Color.inkSoft });
    this.portrait.anchor.set(0.5, 1);
    this.sticker = new Sprite(env.art.glyph.merge);
    this.sticker.anchor.set(0.5);
    this.sticker.scale.set(0.85);
    this.bubble.addChild(this.paper, this.portrait, this.name, this.rank, this.sticker);
    this.bubble.visible = false;
    this.bubble.eventMode = 'none';
    top.addChild(this.bubble);
    for (const g of [this.ghostMove, this.ghostSwap]) {
      g.anchor.set(0.5, 1);
      g.alpha = GHOST_ALPHA;
      g.visible = false;
      g.eventMode = 'none';
      floor.addChild(g);
    }
  }

  /** Call once per frame. `from` is the cell of the held cat (-1 when nothing is held), `over` the cell under the finger and `action` what dropping there would do. */
  update(dt: number, from: number, over: number, action: DropAction | null): void {
    const { battle } = this.env;
    // Released: the bubble goes at once instead of fading over the merge flourish that follows.
    if (from < 0 && this.show > 0) {
      this.show = 0;
      this.bubble.visible = false;
    }
    const held = from >= 0 ? battle.units[from] : null;
    const target = from >= 0 && over >= 0 ? battle.units[over] : null;
    const act = held ? action : null;
    this.showTarget = act === 'merge' ? 1 : 0;
    this.ghost(this.ghostMove, act === 'move' && held ? held.id : null, over);
    this.ghost(this.ghostSwap, act === 'swap' && target ? target.id : null, from);
    if (this.showTarget && held) {
      const next = mergeResultOf(held.id);
      if (next && next !== this.result) this.build(next);
      if (next) this.place(over);
    }
    if (this.show === this.showTarget) return;
    this.show = damp(this.show, this.showTarget, 0.035, dt);
    if (Math.abs(this.show - this.showTarget) < 0.02) this.show = this.showTarget;
    this.bubble.visible = this.show > 0;
    this.bubble.alpha = clamp(this.show * 1.4, 0, 1);
    this.bubble.scale.set(0.8 + 0.2 * this.show);
  }

  private ghost(sprite: Sprite, id: UnitId | null, cell: number): void {
    if (id === null || cell < 0) {
      sprite.visible = false;
      return;
    }
    // The sprite's label remembers which cat it shows, so the texture is looked up only when that changes.
    if (sprite.label !== id) {
      sprite.label = id;
      const texture = tex('unit_' + id);
      sprite.texture = texture;
      sprite.scale.set(unitSpriteScale(id, texture.height));
    }
    sprite.position.set(cellCenterX(cell), cellCenterY(cell) + FEET_DY);
    sprite.visible = true;
  }

  /** Redraw the bubble for a new result. Runs when the result changes, never per frame. */
  private build(id: UnitId): void {
    this.result = id;
    const texture = tex('unit_' + id);
    this.portrait.texture = texture;
    this.portrait.scale.set(PORTRAIT_H / Math.max(1, texture.height));
    this.name.text = t(`unit.${id}.name`);
    this.rank.text = rarityName(unitRarity(id));
    fitWidth(this.name, MAX_TEXT_W);
    fitWidth(this.rank, MAX_TEXT_W);
    const textW = Math.max(this.name.width, this.rank.width);
    const portraitW = this.portrait.width;
    this.bubbleW = Math.round(PAD * 2 + portraitW + 12 + textW);
    this.portrait.position.set(PAD + portraitW / 2, BUBBLE_H - 14);
    this.name.position.set(PAD + portraitW + 12, BUBBLE_H / 2 - 17);
    this.rank.position.set(PAD + portraitW + 12, BUBBLE_H / 2 + 17);
    this.sticker.position.set(14, 8);
    this.draw();
  }

  private place(cell: number): void {
    const cx = cellCenterX(cell);
    const cy = cellCenterY(cell);
    const left = clamp(cx - this.bubbleW / 2, 8, FIELD_W - this.bubbleW - 8);
    const row = cellRow(cell);
    // The tail tip points at the cell's edge; the body sits clear of the cat inside it.
    const yAbove = cy - CELL_H / 2 + 8 - TAIL.len - BUBBLE_H;
    const yBelow = cy + CELL_H / 2 - 4 + TAIL.len;
    const l = this.env.ctx.layout;
    const roomAbove = l.fieldY + yAbove >= l.safeTop + l.topH;
    const roomBelow = l.fieldY + yBelow + BUBBLE_H <= l.h - l.safeBottom - l.bottomH;
    const flip = previewBelow(row, ROWS, this.hiddenIn(row - 1, left), this.hiddenIn(row + 1, left), roomAbove, roomBelow);
    if (flip !== this.flip) {
      this.flip = flip;
      this.draw();
    }
    const y = flip ? yBelow : yAbove;
    this.bubble.pivot.set(this.bubbleW / 2, BUBBLE_H / 2);
    this.bubble.position.set(left + this.bubbleW / 2, y + BUBBLE_H / 2);
    this.tailX = cx - left;
    if (this.drawnTailX !== Math.round(this.tailX)) this.draw();
  }

  /** Cats standing in `row` under the span the bubble would cover (0 for a row that does not exist). */
  private hiddenIn(row: number, left: number): number {
    if (row < 0 || row >= ROWS) return 0;
    const right = left + this.bubbleW;
    let n = 0;
    for (let col = 0; col < COLS; col++) {
      const cell = row * COLS + col;
      const x = cellCenterX(cell);
      if (x + CELL_W / 2 > left && x - CELL_W / 2 < right && this.env.battle.units[cell]) n++;
    }
    return n;
  }

  private draw(): void {
    this.drawnTailX = Math.round(this.tailX);
    this.paper.clear();
    drawSpeechBubble(this.paper, 0, 0, this.bubbleW, BUBBLE_H, {
      radius: 24,
      fill: Color.paperLight,
      tail: { side: this.flip ? 'top' : 'bottom', x: this.tailX, len: TAIL.len, half: TAIL.half },
    });
  }

  destroy(): void {
    for (const c of [this.bubble, this.ghostMove, this.ghostSwap]) {
      c.parent?.removeChild(c);
      c.destroy({ children: true });
    }
  }
}
