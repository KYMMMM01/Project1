import { Container, Graphics } from 'pixi.js';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { errorKey, type Result } from '@/meta';
import {
  Button,
  Color,
  cacheStatic,
  drawDashedLine,
  drawDashedRect,
  drawIcon,
  drawPaper,
  fitLabel,
  paperSeed,
  tapeStrip,
  toast,
  uiLabel,
  type IconName,
  type TapeName,
} from '@/ui';

const PAD = 24;
const TITLE_H = 64;
const RADIUS = 30;

interface CardOpts {
  /** The one piece of washi tape this card carries. */
  tape: TapeName;
  /** A card the shop wants noticed: cream paper on a mustard backing. */
  featured?: boolean;
}

/**
 * Base of every card on the battle tab: a cream sheet with a taped corner, an icon and a title above
 * a dashed rule, a body the subclass fills, and a locked state (kraft paper with the unlock hint)
 * for a feature that is not open yet. Origin = top-left of the card.
 */
export abstract class HomeCard extends Container {
  readonly cardW: number;
  readonly cardH: number;
  /** Add widgets here; origin = top-left of the card. */
  protected readonly body = new Container();
  private readonly veil = new Container();
  private readonly seed = paperSeed() >>> 0;
  /** The hint the veil is built for; null = the card is open. */
  private lockHint: string | null = null;
  private working = false;

  protected constructor(w: number, h: number, title: string, icon: IconName, opts: CardOpts) {
    super();
    this.cardW = w;
    this.cardH = h;

    const art = new Container();
    const sheet = new Graphics();
    if (opts.featured) {
      drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.mustard, edge: Color.mustardDark, seed: this.seed });
      drawPaper(sheet, 9, 9, { w: w - 18, h: h - 18, radius: RADIUS - 8, fill: Color.paper, seed: this.seed + 1, shadow: false });
    } else {
      drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.paper, seed: this.seed });
    }
    drawDashedLine(sheet, PAD, TITLE_H, w - PAD, TITLE_H, { seed: this.seed });
    const disc = new Graphics();
    drawPaper(disc, PAD, 10, { w: 52, h: 52, kind: 'circle', fill: Color.paperDim, edge: Color.kraftDark, shadow: 3, grain: false, seed: this.seed + 2 });
    const tape = tapeStrip({ name: opts.tape, pattern: this.seed % 2 === 0 ? 'dots' : 'gingham', w: 84, h: 26, angle: (this.seed % 5) - 2, seed: this.seed });
    tape.position.set(w * 0.5 + ((this.seed >>> 4) % 90) - 45, 3);
    art.addChild(sheet, disc, tape);
    cacheStatic(art);

    const ic = drawIcon(icon, 38);
    ic.position.set(PAD + 26, 36);
    const head = uiLabel(title, { size: 32, anchorX: 0 });
    head.position.set(PAD + 66, 37);
    fitLabel(head, w - PAD * 2 - 66, 32);
    this.addChild(art, ic, head, this.body, this.veil);
  }

  get locked(): boolean {
    return this.lockHint !== null;
  }

  /** Bottom edge of the title row: where the card's own content may start. */
  protected get contentTop(): number {
    return TITLE_H + 8;
  }

  /** Re-read the profile into the widgets. Cheap; called on show, on every profile change and when a countdown rolls over. */
  abstract sync(): void;

  /** Real-time tick while the tab is visible (countdowns). */
  tick(_dt: number): void {}

  /** Show the locked state with `hint`, or the live card with null. */
  setLocked(hint: string | null): void {
    if (hint === this.lockHint) return;
    this.lockHint = hint;
    const locked = hint !== null;
    this.body.interactiveChildren = !locked;
    for (const c of this.veil.removeChildren()) c.destroy({ children: true });
    this.veil.visible = locked;
    if (hint === null) return;
    const { cardW: w, cardH: h } = this;
    const sheet = new Graphics();
    drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.kraft, edge: Color.kraftDark, seed: this.seed });
    drawDashedRect(sheet, 14, 14, w - 28, h - 28, { radius: RADIUS - 8, color: Color.kraftDark, seed: this.seed });
    cacheStatic(sheet);
    sheet.eventMode = 'static';
    const lock = drawIcon('lock', 64);
    lock.position.set(w / 2, h / 2 - 28);
    const text = uiLabel(hint, { size: 26, wrap: w - 72 });
    text.position.set(w / 2, h / 2 + 44);
    this.veil.addChild(sheet, lock, text);
  }

  /**
   * Run a meta command behind a button: the button shows its spinner while the command (an ad, say)
   * is pending, a refusal becomes a toast with an error sound, and repeat taps are ignored. Returns the
   * result on success, null otherwise (also when the card was destroyed meanwhile).
   */
  protected async claim<T>(button: Button, work: () => Promise<Result<T>>): Promise<Extract<Result<T>, { ok: true }> | null> {
    if (this.working) return null;
    this.working = true;
    button.setBusy(true);
    const r = await work();
    this.working = false;
    if (this.destroyed) return null;
    button.setBusy(false);
    if (!r.ok) {
      toast(t(errorKey(r.error)), 'warning');
      audio.play('ui_error');
      haptic('error');
      return null;
    }
    return r;
  }

}

export const CARD_PAD = PAD;
