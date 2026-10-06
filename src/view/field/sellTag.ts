import { Container, Graphics, Sprite, type Text } from 'pixi.js';
import { tex } from '@/core/assets';
import { damp } from '@/core/math';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Color, drawIcon, drawPaper, label, paperSeed } from '@/ui';

const W = 188;
/** A cat that also pays purr gets a longer tag: the sell strip says both amounts, so the tag does too. */
const W_PURR = 290;
const H = 54;

/** The price tag that follows a dragged unit while it is over the sell zone: a paper tag with a "Sell" cue, the fish icon and the amount, and the purr it pays. */
export class SellTag {
  readonly view = new Container();
  private readonly text: Text;
  private readonly cue: Text;
  private readonly icon: Sprite;
  private readonly plain = new Graphics();
  private readonly wide = new Graphics();
  private readonly purrIcon: Container;
  private readonly purrText: Text;
  private alphaNow = 0;
  private show = false;
  private sig = '';

  constructor(private readonly layer: Container) {
    this.view.label = 'sell-tag';
    this.view.eventMode = 'none';
    const seed = paperSeed();
    drawPaper(this.plain, -W / 2, -H / 2, { w: W, h: H, kind: 'pill', fill: Color.paperLight, seed });
    drawPaper(this.wide, -W_PURR / 2, -H / 2, { w: W_PURR, h: H, kind: 'pill', fill: Color.paperLight, seed });
    this.cue = label(t('view.sell'), { size: 26, color: Color.berryDark });
    this.icon = new Sprite(tex('icon_fish'));
    this.icon.anchor.set(0.5);
    this.icon.width = 38;
    this.icon.height = 27;
    this.text = label('', { size: 28, anchorX: 0 });
    this.purrIcon = drawIcon('purr', 30);
    this.purrText = label('', { size: 28, anchorX: 0 });
    this.arrange(false);
    this.view.addChild(this.plain, this.wide, this.cue, this.icon, this.text, this.purrIcon, this.purrText);
    this.view.visible = false;
    layer.addChild(this.view);
  }

  /** Lay the parts out for the short or the long tag. */
  private arrange(withPurr: boolean): void {
    const w = withPurr ? W_PURR : W;
    this.plain.visible = !withPurr;
    this.wide.visible = withPurr;
    this.purrIcon.visible = this.purrText.visible = withPurr;
    this.cue.position.set(-w / 2 + 46, 0);
    this.icon.position.set(withPurr ? -35 : w / 2 - 78, 0);
    this.text.position.set(withPurr ? -15 : w / 2 - 58, 1);
    this.purrIcon.position.set(60, 0);
    this.purrText.position.set(80, 1);
  }

  /** Show the tag at (x, y) for a sale worth `fish` (and `purr`); call hide() to fade it out. */
  place(x: number, y: number, fish: number, purr: number): void {
    this.show = true;
    this.view.position.set(x, y);
    const sig = fish + '|' + purr;
    if (sig !== this.sig) {
      this.sig = sig;
      this.text.text = '+' + fmt(fish);
      this.purrText.text = '+' + fmt(purr);
      this.arrange(purr > 0);
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
