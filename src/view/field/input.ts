import { Container, Point, Rectangle, type FederatedPointerEvent } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { FIELD_H, FIELD_W, cellAt } from '@/game/geometry';
import { punchScale } from '@/fx';
import type { BattleContext } from '../context';
import type { FieldEnv } from './env';
import { RangeRing } from './rangeRing';
import { SellTag } from './sellTag';
import { classifyPoint, decideRelease, decideTap, isDrag, isSellZone, type FieldArea } from './policy';
import type { CellLayer } from './cells';
import type { UnitViews } from './units';
import type { UnitView } from './unitView';

const LASER_STEP = 3;

type PressMode = 'none' | 'unit' | 'cell' | 'laser' | 'floor';

/**
 * Pointer handling for the field. A press on a cat peeks its range at once; moving it more than
 * the drag threshold lifts it, releasing without moving selects it (or, with another cat selected,
 * performs the drop: tap-tap). A press on the walkway aims the laser on pointer-down and follows
 * the finger. Everything visual happens on pointer-down; only the tap decision waits for release,
 * because a press that turns into a drag must not have acted yet.
 */
export class FieldInput {
  /** The cell being dragged, or null. */
  dragFrom: number | null = null;
  /** Cell under the pointer while dragging (-1 off the board). */
  hover = -1;
  /** True while the dragged unit is held over the sell zone. */
  selling = false;
  /** A tap on an empty cell that nothing else claims (the field uses it to explain a special cell). */
  onEmptyTap: ((cell: number) => void) | null = null;
  /** Asked first with a press's field position: true when something small drawn over the board (a toy's chip) takes it. */
  onPress: ((x: number, y: number) => boolean) | null = null;

  private readonly hit = new Container();
  private readonly local = new Point();
  private mode: PressMode = 'none';
  private pointerId = -1;
  private downX = 0;
  private downY = 0;
  private lastLaserX = -999;
  private lastLaserY = -999;
  private grabX = 0;
  private grabY = 0;
  private pressCell = -1;
  private view: UnitView | null = null;
  private readonly ring: RangeRing;
  private readonly sellTag: SellTag;
  private readonly onDown = (e: FederatedPointerEvent): void => this.down(e);
  private readonly onMove = (e: FederatedPointerEvent): void => this.move(e);
  private readonly onUp = (e: FederatedPointerEvent): void => this.up(e);
  private readonly onCancel = (e: FederatedPointerEvent): void => {
    if (e.pointerId === this.pointerId) this.abort();
  };

  constructor(
    private readonly env: FieldEnv,
    private readonly fieldRoot: Container,
    ringLayer: Container,
    markLayer: Container,
    private readonly units: UnitViews,
    private readonly cells: CellLayer,
  ) {
    this.hit.label = 'field-input';
    this.hit.eventMode = 'static';
    this.hit.hitArea = new Rectangle(0, 0, FIELD_W, FIELD_H);
    this.hit.cursor = 'pointer';
    fieldRoot.addChild(this.hit);
    this.hit.on('pointerdown', this.onDown);
    this.ring = new RangeRing(ringLayer);
    this.sellTag = new SellTag(markLayer);
  }

  private get ctx(): BattleContext {
    return this.env.ctx;
  }

  /** Taps are ignored while anything else owns the screen (a lesson that holds the clock for the player's gesture does not own it). */
  private blocked(): boolean {
    const { battle } = this.env;
    return (this.ctx.paused && !this.ctx.lessonHold) || battle.pending !== null || battle.phase === 'won' || battle.phase === 'lost' || battle.phase === 'choice';
  }

  private toField(e: FederatedPointerEvent): void {
    this.fieldRoot.toLocal(e.global, undefined, this.local);
  }

  private down(e: FederatedPointerEvent): void {
    if (this.pointerId !== -1) {
      // A second finger is ignored; a new press by the same pointer means its release was lost, so start over.
      if (e.pointerId !== this.pointerId) return;
      this.abort();
    }
    if (this.blocked()) return;
    this.toField(e);
    const x = this.local.x;
    const y = this.local.y;
    if (this.onPress?.(x, y)) return;
    this.pointerId = e.pointerId;
    this.downX = x;
    this.downY = y;
    this.mode = 'none';
    this.pressCell = -1;
    this.view = null;
    const area: FieldArea = classifyPoint(x, y);
    if (area === 'board') {
      this.pressCell = cellAt(x, y);
      this.cells.press(this.pressCell);
      const pressed = this.units.atCell(this.pressCell);
      // A summon's cat is unseen until its reveal lands (up to 0.4 s for the top ranks): it cannot be picked up before it shows.
      this.view = pressed?.root.visible ? pressed : null;
      if (this.view) {
        this.mode = 'unit';
        this.view.setPressed(true);
        this.peek(this.pressCell);
        haptic('tap');
      } else {
        this.mode = 'cell';
      }
    } else if (area === 'walkway') {
      this.mode = 'laser';
      this.aim(x, y, true);
    } else {
      this.mode = 'floor';
    }
    const stage = game.app.stage;
    stage.on('pointermove', this.onMove);
    stage.on('pointerup', this.onUp);
    stage.on('pointerupoutside', this.onUp);
    stage.on('pointercancel', this.onCancel);
  }

  private move(e: FederatedPointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.toField(e);
    const x = this.local.x;
    const y = this.local.y;
    if (this.mode === 'unit') {
      if (this.dragFrom === null && isDrag(x - this.downX, y - this.downY)) this.beginDrag(x, y);
      if (this.dragFrom !== null) this.dragTo(x, y);
    } else if (this.mode === 'laser') {
      this.aim(x, y, false);
    }
  }

  private up(e: FederatedPointerEvent): void {
    if (e.pointerId !== this.pointerId) return;
    this.toField(e);
    const x = this.local.x;
    const y = this.local.y;
    const mode = this.mode;
    const view = this.view;
    this.unlisten();
    view?.setPressed(false);
    this.pointerId = -1;
    this.mode = 'none';
    if (mode === 'unit' && this.dragFrom !== null) {
      this.finishDrag(x, y);
    } else if (mode === 'unit' || mode === 'cell') {
      this.tap(this.pressCell);
    } else if (mode === 'floor') {
      this.ctx.select(null);
    }
    this.view = null;
  }

  private unlisten(): void {
    const stage = game.app.stage;
    stage.off('pointermove', this.onMove);
    stage.off('pointerup', this.onUp);
    stage.off('pointerupoutside', this.onUp);
    stage.off('pointercancel', this.onCancel);
  }

  /** Aim (or move) the laser. `first` presses always send; drags send once the finger moved enough. */
  private aim(x: number, y: number, first: boolean): void {
    if (!first && (!this.env.battle.laser.active || Math.hypot(x - this.lastLaserX, y - this.lastLaserY) < LASER_STEP)) return;
    this.lastLaserX = x;
    this.lastLaserY = y;
    const { battle } = this.env;
    const fail = this.ctx.command('laser', () => battle.setLaser(x, y));
    if (fail === null && first) haptic('light');
  }

  /** Show the range ring of the unit in `cell`. */
  private peek(cell: number): void {
    const u = this.env.battle.units[cell];
    if (u) this.ring.show(cell, u.stats.range);
  }

  private beginDrag(x: number, y: number): void {
    const view = this.view;
    if (!view) return;
    this.dragFrom = this.pressCell;
    this.grabX = view.x - this.downX;
    this.grabY = view.y - this.downY;
    if (this.ctx.selected !== null) this.ctx.select(null);
    this.units.beginDrag(view, x + this.grabX, y + this.grabY);
    view.setPressed(false);
    this.hover = this.pressCell;
    audio.play('pickup');
    haptic('light');
    this.ctx.events.emit('drag', { from: this.dragFrom, over: this.hover, sell: false });
  }

  private dragTo(x: number, y: number): void {
    const view = this.view;
    const from = this.dragFrom;
    if (!view || from === null) return;
    view.dragX = x + this.grabX;
    // Keep the lifted unit on screen when the finger runs below the field.
    view.dragY = Math.min(y + this.grabY, FIELD_H + 70);
    const over = cellAt(x, y);
    const sell = isSellZone(y);
    if (over !== this.hover || sell !== this.selling) {
      this.hover = over;
      this.selling = sell;
      this.ctx.events.emit('drag', { from, over, sell });
    }
  }

  private finishDrag(x: number, y: number): void {
    const view = this.view;
    const from = this.dragFrom;
    if (!view || from === null) return;
    const { battle } = this.env;
    const over = cellAt(x, y);
    const sell = isSellZone(y);
    const action = over >= 0 && over !== from ? battle.dropAction(from, over) : null;
    const decision = decideRelease(from, over, sell, action);
    this.endDragState();
    if (decision.kind === 'sell') {
      this.ctx.command('sell', () => battle.sell(from), from);
    } else if (decision.kind === 'drop') {
      this.ctx.command('drop', () => battle.drop(from, decision.to), from);
    } else if (over >= 0 && over !== from) {
      // Released on a cell that cannot take it: same head-shake as a refused command.
      this.units.refuse(from);
    }
    // A successful command already sent the view on its way; anything still held springs home.
    if (view.dragging) this.units.cancelDrag(view, false);
    this.ctx.select(null);
  }

  private tap(cell: number): void {
    if (cell < 0) return;
    const { battle } = this.env;
    const sel = this.ctx.selected;
    const action = sel !== null && sel !== cell ? battle.dropAction(sel, cell) : null;
    const decision = decideTap(sel, cell, (battle.units[cell] ?? null) !== null, action);
    switch (decision.kind) {
      case 'select': {
        this.ctx.select(decision.cell);
        const v = this.units.atCell(decision.cell);
        if (v) punchScale(this.ctx.tweens, v.body, 0.1, 140);
        break;
      }
      case 'deselect':
        this.ctx.select(null);
        audio.play('ui_back', { volume: 0.45 });
        break;
      case 'drop':
        this.ctx.command('drop', () => battle.drop(decision.from, decision.to), decision.from);
        this.ctx.select(null);
        break;
      case 'none':
        if (sel === null && (battle.units[cell] ?? null) === null) this.onEmptyTap?.(cell);
        break;
    }
  }

  /** The pointer was lost or something took over the screen: put everything back where it was. */
  private abort(): void {
    const view = this.view;
    this.unlisten();
    view?.setPressed(false);
    if (view && this.dragFrom !== null) {
      this.endDragState();
      this.units.cancelDrag(view, false);
      this.ctx.select(null);
    }
    this.pointerId = -1;
    this.mode = 'none';
    this.view = null;
  }

  private endDragState(): void {
    this.dragFrom = null;
    this.hover = -1;
    this.selling = false;
    this.sellTag.hide();
    this.ctx.events.emit('drag', { from: null, over: -1, sell: false });
  }

  /** Per frame: cancel a drag that a popup or choice interrupted, keep the sell tag and range ring in step. */
  update(dt: number): void {
    if (this.pointerId !== -1 && this.blocked()) this.abort();
    const { battle } = this.env;
    const selected = this.ctx.selected;
    // The ring follows what is held, else what is selected, else what a finger is pressing.
    const shown = this.dragFrom ?? selected ?? (this.pointerId !== -1 && this.mode === 'unit' ? this.pressCell : null);
    const u = shown !== null ? battle.units[shown] : null;
    if (shown !== null && u) {
      this.ring.show(shown, u.stats.range);
    } else {
      this.ring.hide();
    }
    const view = this.view;
    if (this.selling && view && this.dragFrom !== null) {
      const worth = battle.sellValue(this.dragFrom);
      this.sellTag.place(view.x, view.y - 128, worth.fish, worth.purr);
    } else {
      this.sellTag.hide();
    }
    this.ring.update(dt);
    this.sellTag.update(dt);
  }

  destroy(): void {
    this.abort();
    this.hit.off('pointerdown', this.onDown);
    this.fieldRoot.removeChild(this.hit);
    this.hit.destroy();
    this.ring.destroy();
    this.sellTag.destroy();
  }
}
