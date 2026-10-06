/**
 * The bottom panel: a drawn plate holding the class chips, the currency row, the action row, the
 * selection sheet (which takes over the upper rows) and the sell strip.
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { Ease } from '@/core/tween';
import type { ClassId } from '@/game';
import { drawIcon, drawShadow, glossGradient, motion, refreshCache, TweenBag, vGradient, Color, shade } from '@/ui';
import type { BattleLayout } from '../context';
import { ActionRow } from './ActionRow';
import { ClassRow } from './ClassRow';
import { CurrencyRow } from './CurrencyRow';
import type { HudEnv } from './env';
import { bottomRects, HUD_W } from './layoutMath';
import { ClassSheet } from './popups/ClassSheet';
import { OddsPopup } from './popups/OddsPopup';
import { SelectionSheet } from './SelectionSheet';
import { SellStrip } from './SellStrip';

export class BottomPanel {
  readonly root = new Container();
  readonly classes: ClassRow;
  readonly currency: CurrencyRow;
  readonly actions: ActionRow;
  readonly sheet: SelectionSheet;
  private readonly sell: SellStrip;
  private readonly bg = new Graphics();
  private readonly deco = new Container();
  private readonly plate = new Container();
  private readonly upper = new Container();
  private readonly bag = new TweenBag();

  constructor(private readonly env: HudEnv) {
    this.classes = new ClassRow(env, (id) => this.openClass(id));
    this.currency = new CurrencyRow(env, () => this.openOdds());
    this.actions = new ActionRow(env);
    this.sheet = new SelectionSheet(env);
    this.sell = new SellStrip(env);
    this.upper.addChild(this.classes.root, this.currency.root);
    this.plate.addChild(this.bg, this.deco);
    this.root.addChild(this.plate, this.upper, this.actions.root, this.sheet.root, this.sell.root);

    env.on(env.ctx.events, 'select', ({ cell }) => this.onSelect(cell));
    if (env.ctx.selected !== null) this.onSelect(env.ctx.selected);
    this.layout(env.layout());
  }

  private openClass(id: ClassId): void {
    void this.env.modal(new ClassSheet(this.env, id));
  }

  private openOdds(): void {
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
    const g = this.bg;
    g.clear();
    drawShadow(g, 0, 0, HUD_W, h, 40, { alpha: 0.5, spread: 18, offsetY: -8 });
    g.roundRect(0, 0, HUD_W, h + 60, 40).fill(vGradient(shade(Color.panelLight, 0.1), Color.bg)).stroke({ width: 6, color: Color.outline, alignment: 1 });
    g.roundRect(8, 8, HUD_W - 16, h + 60, 34).stroke({ width: 3, color: Color.neutral, alpha: 0.55, alignment: 1 });
    g.roundRect(14, 12, HUD_W - 28, 56, 26).fill(glossGradient(0.16, 0));
    // The plate swallows taps so nothing behind the panel (the field's laser, a cell) reacts to a miss.
    this.plate.eventMode = 'static';
    this.plate.hitArea = new Rectangle(0, 0, HUD_W, h);
    this.paintDeco(h);
    refreshCache(this.plate);
    this.classes.layout(r.chipsY);
    this.currency.layout(r.currencyY);
    this.actions.layout(r.summonY, r.utilY);
    this.sheet.layout(r.sheet);
    this.sell.layout(r.sell);
  }

  /** Faint paw prints on the plate so the panel is never a flat slab (it is nearly empty in the first run). */
  private paintDeco(h: number): void {
    for (const c of this.deco.removeChildren()) c.destroy({ children: true });
    const spots: ReadonlyArray<readonly [number, number, number, number]> = [
      [58, 118, 44, -0.4], [668, 96, 38, 0.5], [352, 150, 36, 0.1], [120, 236, 40, 0.3], [610, 252, 46, -0.2],
      [250, 300, 34, -0.5], [470, 330, 38, 0.4], [60, 400, 42, 0.2], [680, 410, 36, -0.3],
    ];
    for (const [x, y, size, rot] of spots) {
      if (y > h - 20) continue;
      const paw = drawIcon('paw', size, Color.textDim);
      paw.alpha = 0.07;
      paw.position.set(x, y);
      paw.rotation = rot;
      this.deco.addChild(paw);
    }
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
