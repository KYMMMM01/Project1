import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { tex } from '@/core/assets';
import { damp } from '@/core/math';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Color, drawPaper, label, paperSeed } from '@/ui';

const W = 188;
const H = 54;

/** The price tag that follows a dragged unit while it is over the sell zone: a paper tag with a "Sell" cue, the fish icon and the amount. */
export class SellTag {
  readonly view = new Container();
  private readonly text: Text;
  private readonly cue: Text;
  private readonly icon: Sprite;
  private alphaNow = 0;
  private show = false;
  private sig = '';

  constructor(private readonly layer: Container) {
    this.view.label = 'sell-tag';
    this.view.eventMode = 'none';
    const bg = new Graphics();
    drawPaper(bg, -W / 2, -H / 2, { w: W, h: H, kind: 'pill', fill: Color.paperLight, seed: paperSeed() });
    this.cue = label(t('view.sell'), { size: 26, color: Color.berryDark });
    this.cue.position.set(-W / 2 + 46, 0);
    this.icon = new Sprite(tex('icon_fish'));
    this.icon.anchor.set(0.5);
    this.icon.width = 38;
    this.icon.height = 27;
    this.icon.position.set(W / 2 - 78, 0);
    this.text = label('', { size: 28, anchorX: 0 });
    this.text.position.set(W / 2 - 58, 1);
    this.view.addChild(bg, this.cue, this.icon, this.text);
    this.view.visible = false;
    layer.addChild(this.view);
  }

  /** Show the tag at (x, y) for a sale worth `fish`; call hide() to fade it out. */
  place(x: number, y: number, fish: number): void {
    this.show = true;
    this.view.position.set(x, y);
    const sig = String(fish);
    if (sig !== this.sig) {
      this.sig = sig;
      this.text.text = '+' + fmt(fish);
    }
  }

  hide(): void {
    this.show = false;
  }

  update(dt: number): void {
    const target = this.show ? 1 : 0;
    if (this.alphaNow === target) return;
    this.alphaNow = damp(this.alphaNow, target, 0.04, dt);
    if (Math.abs(this.alphaNow - target) < 0.02) this.alphaNow = target;
    this.view.visible = this.alphaNow > 0;
    this.view.alpha = this.alphaNow;
    this.view.scale.set(0.8 + 0.2 * this.alphaNow);
  }

  destroy(): void {
    this.layer.removeChild(this.view);
    this.view.destroy({ children: true });
  }
}
