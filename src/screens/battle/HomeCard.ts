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
  HEADER,
  HEADER_H,
  headerLayout,
  paperSeed,
  tapeStrip,
  toast,
  uiLabel,
  type HeaderLayout,
  type IconName,
  type TapeName,
} from '@/ui';

const PAD = HEADER.padX;
const RADIUS = 30;
/** Width of the mustard backing of a featured card. */
const RIM = 9;
/** The header is this much taller than the 72 px title row it replaced: every card adds it to its own height, so the body keeps its spacing. */
export const HEAD_GROW = HEADER_H - 72;
/** Extra height a featured card needs: its header sits below the rim. */
export const RIM_GROW = RIM;
/** The paper disc under a card's icon. */
const discPaper = (seed: number) => ({ w: HEADER.disc, h: HEADER.disc, kind: 'circle', fill: Color.paperDim, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 2 }) as const;

interface CardOpts {
  /** The one piece of washi tape this card carries. */
  tape: TapeName;
  /** A card the shop wants noticed: cream paper on a mustard backing. */
  featured?: boolean;
  /** Width the control at the right end of the header row needs (default: a round button as big as the disc). */
  reserve?: number;
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
  /** Where the header's parts sit (see headerLayout): subclasses put their right-hand control on `head.control`. */
  protected readonly head: HeaderLayout;
  private readonly featured: boolean;

  protected constructor(w: number, h: number, private readonly title: string, private readonly iconName: IconName, opts: CardOpts) {
    super();
    this.cardW = w;
    this.cardH = h;
    this.featured = opts.featured === true;
    this.head = headerLayout(w, { rim: this.featured ? RIM : 0, reserve: opts.reserve });

    const art = new Container();
    const sheet = new Graphics();
    if (opts.featured) {
      drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.mustard, edge: Color.mustardDark, seed: this.seed });
      drawPaper(sheet, RIM, RIM, { w: w - RIM * 2, h: h - RIM * 2, radius: RADIUS - 8, fill: Color.paper, seed: this.seed + 1, shadow: false });
    } else {
      drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.paper, seed: this.seed });
    }
    const { sep, disc: d, tapeSpan } = this.head;
    drawDashedLine(sheet, sep.x0, sep.y, sep.x1, sep.y, { seed: this.seed });
    const disc = new Graphics();
    drawPaper(disc, d.x, d.y, discPaper(this.seed));
    const tape = tapeStrip({ name: opts.tape, pattern: this.seed % 2 === 0 ? 'dots' : 'gingham', w: 84, h: 26, angle: (this.seed % 5) - 2, seed: this.seed });
    // The tape lies across the top edge, between the disc and the control: it never covers either of them.
    tape.position.set(tapeSpan.min + (((this.seed >>> 4) % 100) / 100) * Math.max(0, tapeSpan.max - tapeSpan.min), this.featured ? 3 : 0);
    art.addChild(sheet, disc, tape);
    cacheStatic(art);

    this.addChild(art, this.titleRow(), this.body, this.veil);
  }

  get locked(): boolean {
    return this.lockHint !== null;
  }

  /** The icon and the title on the card's title row; the locked veil draws its own copy, so a closed card still says what it is. */
  private titleRow(): Container {
    const row = new Container();
    const { icon, title } = this.head;
    const ic = drawIcon(this.iconName, icon.size);
    ic.position.set(icon.x, icon.y);
    const head = uiLabel(this.title, { size: 32, anchorX: 0 });
    head.position.set(title.x, title.y);
    fitLabel(head, title.maxW, 32);
    row.addChild(ic, head);
    return row;
  }

  /** Bottom edge of the title row: where the card's own content may start. */
  protected get contentTop(): number {
    return this.head.contentTop;
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
    const { sep, disc: d } = this.head;
    drawPaper(sheet, 0, 0, { w, h, radius: RADIUS, fill: Color.kraft, edge: Color.kraftDark, seed: this.seed });
    drawDashedLine(sheet, sep.x0, sep.y, sep.x1, sep.y, { seed: this.seed, color: Color.kraftDark });
    drawPaper(sheet, d.x, d.y, discPaper(this.seed));
    // The dashed slot holds what is closed: it starts under the header, so no disc or title ever sits on its line; equal margins on the sides and below.
    const well = { x: PAD, y: sep.y + 16, w: w - PAD * 2, h: h - (sep.y + 16) - PAD };
    drawDashedRect(sheet, well.x, well.y, well.w, well.h, { radius: 20, color: Color.kraftDark, seed: this.seed });
    cacheStatic(sheet);
    sheet.eventMode = 'static';
    // The lock and the hint sit in the middle of the slot.
    const mid = well.y + well.h / 2;
    const lock = drawIcon('lock', 64);
    lock.position.set(w / 2, mid - 28);
    const text = uiLabel(hint, { size: 26, wrap: w - 72 });
    text.position.set(w / 2, mid + 44);
    this.veil.addChild(sheet, this.titleRow(), lock, text);
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
