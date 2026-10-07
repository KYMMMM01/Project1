/**
 * Sell strip along the top edge of the bottom panel while a kitten is dragged: a strip of kraft paper
 * with a dashed berry line that turns into berry paper when the kitten is over it, and says what the
 * sale pays. It never takes input: the field part owns the drop.
 */
import { Container, Graphics } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Color, drawDashedRect, drawIcon, drawPaper, fitLabel, motion, paperSeed, TweenBag, uiLabel } from '@/ui';
import type { Text } from 'pixi.js';
import type { HudEnv } from './env';
import type { Rect } from './layoutMath';

export class SellStrip {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly plate = new Graphics();
  private readonly label: Text;
  private readonly icon = drawIcon('sell', 52);
  private readonly seed = paperSeed();
  private rect: Rect = { x: 0, y: 0, w: 720, h: 112 };
  private lit = false;
  private from: number | null = null;
  private shown = false;

  constructor(private readonly env: HudEnv) {
    this.label = uiLabel('', { size: 32 });
    this.root.addChild(this.plate, this.icon, this.label);
    this.root.visible = false;
    this.root.eventMode = 'none';
    env.on(env.ctx.events, 'drag', ({ from, sell }) => this.onDrag(from, sell));
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.root.position.set(rect.x, rect.y);
    this.paint();
  }

  private paint(): void {
    const { w, h } = this.rect;
    const g = this.plate;
    g.clear();
    drawPaper(g, 8, 4, {
      w: w - 16,
      h: h - 8,
      radius: 30,
      fill: this.lit ? Color.berry : Color.kraft,
      edge: this.lit ? Color.berryDark : Color.kraftDark,
      grain: false,
      seed: this.seed,
    });
    drawDashedRect(g, 22, 18, w - 44, h - 36, { radius: 20, color: this.lit ? Color.paper : Color.berry, width: 3.5, seed: this.seed });
    this.label.style.fill = this.lit ? Color.inkDeep : Color.ink;
    this.icon.position.set(w / 2 - 188, h / 2);
    this.label.position.set(w / 2 + 28, h / 2);
  }

  private text(): string {
    const b = this.env.battle;
    if (this.from === null) return '';
    const v = b.sellValue(this.from);
    const gain = v.purr > 0 ? t('hud.sell.both', { fish: fmt(v.fish), purr: v.purr }) : `+${fmt(v.fish)}`;
    return this.lit ? t('hud.sell.drop', { gain }) : t('hud.sell.drag', { gain });
  }

  private onDrag(from: number | null, sell: boolean): void {
    if (from === null) {
      this.hide();
      return;
    }
    const wasFrom = this.from;
    this.from = from;
    if (!this.shown) this.show();
    if (sell !== this.lit || wasFrom !== from) {
      const pulse = sell && !this.lit;
      this.lit = sell;
      this.paint();
      this.label.text = this.text();
      fitLabel(this.label, this.rect.w - 360, 32, 0.7);
      if (pulse && !motion.reduced) {
        this.bag.runKeyed(this.plate, {
          duration: 0.2,
          ease: Ease.linear,
          onUpdate: (k) => this.root.scale.set(1 + 0.03 * Math.sin(k * Math.PI)),
          onComplete: () => this.root.scale.set(1),
        });
      }
    }
  }

  private show(): void {
    this.shown = true;
    this.root.visible = true;
    if (motion.reduced) return;
    this.bag.runKeyed(this.root, {
      duration: 0.14,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.root.alpha = k;
        this.root.y = this.rect.y - 24 * (1 - k);
      },
      onComplete: () => {
        this.root.alpha = 1;
        this.root.y = this.rect.y;
      },
    });
  }

  private hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.lit = false;
    this.from = null;
    if (motion.reduced) {
      this.root.visible = false;
      return;
    }
    this.bag.runKeyed(this.root, {
      duration: 0.12,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        // The way it came in, reversed: lifted off the page.
        this.root.alpha = 1 - k;
        this.root.y = this.rect.y - 24 * k;
      },
      onComplete: () => {
        this.root.visible = this.shown;
        this.root.alpha = 1;
        this.root.y = this.rect.y;
      },
    });
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}
