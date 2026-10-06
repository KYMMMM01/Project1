/**
 * Sell strip along the top edge of the bottom panel while a kitten is dragged. It lights up when the
 * kitten is over it and says what the sale pays. It never takes input: the field part owns the drop.
 */
import { Container, Graphics } from 'pixi.js';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Color, drawIcon, fitLabel, motion, TweenBag, uiLabel, vGradient, shade } from '@/ui';
import type { Text } from 'pixi.js';
import type { HudEnv } from './env';
import type { Rect } from './layoutMath';

export class SellStrip {
  readonly root = new Container();
  private readonly bag = new TweenBag();
  private readonly plate = new Graphics();
  private readonly label: Text;
  private readonly icon = drawIcon('sell', 52);
  private rect: Rect = { x: 0, y: 0, w: 720, h: 112 };
  private lit = false;
  private from: number | null = null;
  private shown = false;

  constructor(private readonly env: HudEnv) {
    this.label = uiLabel('', { size: 32, strokeWidth: 6 });
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
    g.roundRect(8, 4, w - 16, h - 8, 34)
      .fill(this.lit ? vGradient(shade(Color.danger, 0.3), Color.dangerDark) : vGradient(shade(Color.danger, -0.45), shade(Color.dangerDark, -0.45)))
      .stroke({ width: 6, color: this.lit ? Color.white : Color.outline, alignment: 1 });
    g.roundRect(18, 14, w - 36, h - 28, 26).stroke({ width: 4, color: this.lit ? shade(Color.danger, 0.7) : shade(Color.danger, 0.3), alpha: this.lit ? 1 : 0.55, alignment: 1 });
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
      onUpdate: (k) => (this.root.alpha = 1 - k),
      onComplete: () => {
        this.root.visible = this.shown;
        this.root.alpha = 1;
      },
    });
  }

  destroy(): void {
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}
