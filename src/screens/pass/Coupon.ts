/** The premium purchase as a coupon: mustard paper with a cut line, a perforated stub with the crown, the offer and its price. */
import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import { Ease } from '@/core/tween';
import {
  bindPress,
  cacheStatic,
  Color,
  drawDashedLine,
  drawDashedInset,
  drawIcon,
  drawPaperFace,
  drawPaperShadow,
  fitLabel,
  LoadingSpinner,
  motion,
  paperSeed,
  TweenBag,
  uiLabel,
  type PressBinding,
} from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { inScrollHost } from '@/ui/press';
import { stickerDisc } from '../system/kit/sheets';

const STUB_W = 86;

/** Origin = centre. The whole coupon is the touch target; it presses onto its flat shadow like every paper button. */
export class Coupon extends Container {
  readonly uiBox: Box;
  private readonly bag = new TweenBag();
  private readonly face = new Container();
  private readonly crown = new Container();
  private readonly press: PressBinding;
  private spinner: LoadingSpinner | null = null;
  private busy = false;

  constructor(
    w: number,
    h: number,
    title: string,
    price: string,
    onTap: () => void,
  ) {
    super();
    this.uiBox = { x: -w / 2, y: -h / 2, w, h: h + 5 };
    const seed = paperSeed();
    const piece = { w, h, radius: 18, fill: Color.mustard, edge: Color.mustardDark, edgeWidth: 2.5, edgeAlpha: 0.8, seed, grain: false } as const;
    const shadow = new Graphics();
    drawPaperShadow(shadow, -w / 2, -h / 2, piece);
    cacheStatic(shadow);
    const paper = new Graphics();
    drawPaperFace(paper, -w / 2, -h / 2, piece);
    drawDashedInset(paper, -w / 2, -h / 2, piece, 7, { color: Color.inkDeep, alpha: 0.5, width: 2.5, dash: 10, gap: 7, seed });
    drawDashedLine(paper, -w / 2 + STUB_W, -h / 2 + 12, -w / 2 + STUB_W, h / 2 - 12, { color: Color.inkDeep, alpha: 0.5, width: 2.5, dash: 7, gap: 7, seed });
    cacheStatic(paper);

    this.crown.position.set(-w / 2 + STUB_W / 2 + 2, 0);
    this.crown.addChild(stickerDisc(62, seed % 4), drawIcon('crown', 40));
    this.crown.rotation = -0.08;

    const left = -w / 2 + STUB_W + 18;
    const room = w / 2 - 20 - left;
    const name = uiLabel(title, { size: 30, color: Color.inkDeep, anchorX: 0 });
    fitLabel(name, room, 30);
    name.position.set(left, -h * 0.17);
    const cost = uiLabel(price, { size: 28, color: Color.inkDeep, anchorX: 0 });
    fitLabel(cost, room, 28);
    cost.position.set(left, h * 0.2);
    this.face.addChild(paper, this.crown, name, cost);
    this.addChild(shadow, this.face);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(-w / 2, -h / 2, w, h + 5);
    this.press = bindPress(this, {
      down: () => {
        if (this.busy) return;
        this.face.position.y = 3;
        this.face.scale.set(0.97);
        if (!inScrollHost(this)) audio.play('ui_click');
      },
      up: (fire) => {
        this.face.position.y = 0;
        this.face.scale.set(1);
        if (fire && !this.busy) {
          haptic('tap');
          onTap();
        }
      },
    });
  }

  /** While a purchase is pending: a spinner on the stub and no taps. */
  setBusy(busy: boolean): void {
    if (busy === this.busy) return;
    this.busy = busy;
    this.face.alpha = busy ? 0.75 : 1;
    this.crown.visible = !busy;
    if (busy) {
      this.spinner = new LoadingSpinner({ size: 54 });
      this.spinner.position.copyFrom(this.crown.position);
      this.face.addChild(this.spinner);
    } else {
      this.spinner?.destroy();
      this.spinner = null;
    }
  }

  /** A small rock: "this is what unlocks it". */
  nudge(): void {
    if (motion.reduced) return;
    this.bag.runKeyed(this, {
      duration: 0.5,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.rotation = Math.sin(k * Math.PI * 4) * 0.035 * (1 - k);
      },
      onComplete: () => {
        this.rotation = 0;
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.press.dispose();
    super.destroy(options);
  }
}
