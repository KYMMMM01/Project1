import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { errorKey, type Result } from '@/meta';
import { Button, Color, Panel, TweenBag, drawIcon, fitLabel, toast, uiLabel, type IconName, type PanelVariant } from '@/ui';

const PAD = 24;
const TITLE_H = 64;

/**
 * Base of every card on the battle tab: a panel with an icon and a title, a body the subclass fills,
 * and a locked state (dimmed, padlock and the unlock hint) used when the feature is not open yet.
 * Origin = top-left of the card.
 */
export abstract class HomeCard extends Container {
  readonly cardW: number;
  readonly cardH: number;
  protected readonly bag = new TweenBag();
  /** Add widgets here; origin = top-left of the card. */
  protected readonly body: Container;
  private readonly panel: Panel;
  private readonly veil = new Container();
  private isLocked = false;
  private working = false;

  protected constructor(w: number, h: number, title: string, icon: IconName, variant: PanelVariant = 'default') {
    super();
    this.cardW = w;
    this.cardH = h;
    this.panel = new Panel({ width: w, height: h, variant, blockInput: false });
    this.panel.position.set(w / 2, h / 2);
    this.body = this.panel.content;
    this.addChild(this.panel, this.veil);
    const ic = drawIcon(icon, 44);
    ic.position.set(PAD + 22, TITLE_H / 2 + 6);
    const head = uiLabel(title, { size: 32, anchorX: 0 });
    head.position.set(PAD + 56, TITLE_H / 2 + 6);
    fitLabel(head, w - PAD * 2 - 56, 32);
    this.body.addChild(ic, head);
  }

  get locked(): boolean {
    return this.isLocked;
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
    const locked = hint !== null;
    this.panel.content.interactiveChildren = !locked;
    this.veil.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.isLocked = locked;
    if (!locked) {
      this.veil.visible = false;
      return;
    }
    this.veil.visible = true;
    const dim = new Graphics().roundRect(0, 0, this.cardW, this.cardH, 36).fill({ color: Color.bgDeep, alpha: 0.78 });
    dim.eventMode = 'static';
    const lock = drawIcon('lock', 64);
    lock.position.set(this.cardW / 2, this.cardH / 2 - 26);
    const text = uiLabel(hint, { size: 26, wrap: this.cardW - 64, color: Color.textDim, strokeWidth: 4 });
    text.position.set(this.cardW / 2, this.cardH / 2 + 44);
    this.veil.addChild(dim, lock, text);
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

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

export const CARD_PAD = PAD;
