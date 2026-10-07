/**
 * The bottom panel: one cream paper sheet with a torn top edge rising from the bottom of the screen,
 * holding the class chips, the currency row, the action row, the selection sheet (which takes over the
 * upper rows) and the sell strip.
 */
import { Container, Rectangle } from 'pixi.js';
import { Ease } from '@/core/tween';
import type { ClassId } from '@/game';
import { Color, motion, paperSeed, paperShape, refreshCache, TweenBag } from '@/ui';
import type { BattleLayout } from '../context';
import { ActionRow } from './ActionRow';
import { ClassRow } from './ClassRow';
import { CurrencyRow } from './CurrencyRow';
import type { HudEnv } from './env';
import { bottomRects, HUD_W, type Rect } from './layoutMath';
import { ClassSheet } from './popups/ClassSheet';
import { OddsPopup } from './popups/OddsPopup';
import { SelectionSheet } from './SelectionSheet';
import { SellStrip } from './SellStrip';

/** Height of the class chips' row as the chips and the tutorial's paw measure it. */
const CLASS_ROW_H = 92;

export class BottomPanel {
  readonly root = new Container();
  readonly classes: ClassRow;
  readonly currency: CurrencyRow;
  readonly actions: ActionRow;
  readonly sheet: SelectionSheet;
  private readonly sell: SellStrip;
  private readonly plate = new Container();
  private readonly seed = paperSeed();
  private readonly upper = new Container();
  /** Where the class chips' row lies in scene space (one object, moved on layout). */
  private readonly classRow: Rect = { x: 0, y: 0, w: HUD_W, h: CLASS_ROW_H };
  private readonly bag = new TweenBag();

  constructor(private readonly env: HudEnv) {
    this.classes = new ClassRow(env, (id) => this.openClass(id));
    this.currency = new CurrencyRow(env, () => this.openOdds());
    this.actions = new ActionRow(env);
    this.sheet = new SelectionSheet(env);
    this.sell = new SellStrip(env);
    this.upper.addChild(this.classes.root, this.currency.root);
    this.root.addChild(this.plate, this.upper, this.actions.root, this.sheet.root, this.sell.root);

    env.on(env.ctx.events, 'select', ({ cell }) => this.onSelect(cell));
    if (env.ctx.selected !== null) this.onSelect(env.ctx.selected);
    this.layout(env.layout());
  }

  private openClass(id: ClassId): void {
    void this.env.modal(new ClassSheet(this.env, id)).then(() => this.env.note('sheetClose'));
  }

  private openOdds(): void {
    this.env.hints.used('summon_grade');
    void this.env.modal(new OddsPopup(this.env));
  }

  private onSelect(cell: number | null): void {
    this.sheet.select(cell);
    const open = this.sheet.shown;
    this.fadeUpper(!open);
    this.actions.util.visible = !open;
  }

  /** The chips and currency rows give way to the selection sheet (and come back with it closed). */
  private fadeUpper(show: boolean): void {
    if (motion.reduced) {
      this.upper.visible = show;
      this.upper.alpha = 1;
      return;
    }
    const from = this.upper.alpha;
    if (show) this.upper.visible = true;
    this.bag.runKeyed(this.upper, {
      duration: 0.14,
      ease: Ease.cubicOut,
      onUpdate: (k) => (this.upper.alpha = from + ((show ? 1 : 0) - from) * k),
      onComplete: () => {
        this.upper.visible = show;
        this.upper.alpha = show ? 1 : 0;
      },
    });
  }

  layout(l: BattleLayout): void {
    const r = bottomRects(l);
    this.root.position.set(0, r.top);
    const h = r.panel.h;
    // The sheet reaches past the screen edge on every side but the torn one, so no seam shows on any aspect ratio.
    for (const c of this.plate.removeChildren()) c.destroy({ children: true });
    // A strip of kraft peeks out above the cream sheet: two layers of paper torn at different places.
    const under = paperShape({ w: HUD_W + 60, h: h + 30, radius: 0, fill: Color.kraft, torn: 'top', seed: this.seed + 1, grain: false });
    under.position.set(HUD_W / 2, (h + 30) / 2 - 9);
    const sheet = paperShape({ w: HUD_W + 60, h: h + 30, radius: 0, fill: Color.paper, torn: 'top', seed: this.seed });
    sheet.position.set(HUD_W / 2, (h + 30) / 2);
    this.plate.addChild(under, sheet);
    // The plate swallows taps so nothing behind the panel (the field's laser, a cell) reacts to a miss.
    this.plate.eventMode = 'static';
    this.plate.hitArea = new Rectangle(0, 0, HUD_W, h);
    refreshCache(this.plate);
    this.classes.layout(r.chipsY);
    this.classRow.y = r.top + r.chipsY - CLASS_ROW_H / 2;
    this.currency.layout(r.currencyY);
    this.actions.layout(r.summonY, r.utilY, r.top);
    this.sheet.layout(r.sheet);
    this.sell.layout(r.sell);
  }

  /** The class chips' row in scene space while it is on screen (revealed, and not under the selection sheet), else null. */
  classRowRect(): Rect | null {
    return this.classes.root.visible && this.upper.visible ? this.classRow : null;
  }

  invalidate(): void {
    this.classes.invalidate();
    this.currency.invalidate();
    this.actions.invalidate();
    this.sheet.invalidate();
  }

  update(dt: number): void {
    this.classes.update();
    this.actions.update(dt);
    this.sheet.update();
  }

  destroy(): void {
    this.bag.killAll();
    this.classes.destroy();
    this.currency.destroy();
    this.actions.destroy();
    this.sheet.destroy();
    this.sell.destroy();
    this.root.destroy({ children: true });
  }
}
