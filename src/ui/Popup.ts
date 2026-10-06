import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { Ease } from '@/core/tween';
import { backOut, motion, TweenBag } from './motion';
import { Dim } from './theme';

export interface PopupOpts<R> {
  /** Result delivered when the popup is dismissed by a backdrop tap, Escape or Back. */
  dismissResult: R;
  /** Tapping the dimmed area closes the popup (default true). Turn off for destructive or reward popups. */
  backdropClose?: boolean;
  /** Escape / Android Back closes the popup (default true). */
  backClose?: boolean;
  /** Queue order for enqueue(): higher opens first (system 3, purchase 2, reward 1, promo 0). */
  priority?: number;
  /** Backdrop darkness multiplier. */
  dim?: number;
}

/**
 * A modal. The subclass builds its look inside `body` (origin = screen centre); the manager adds the
 * dimmed, input-blocking backdrop, animates open/close and resolves the promise returned by
 * popups.open(). Never construct-and-forget: always hand it to `popups`.
 */
export abstract class Popup<R = void> extends Container {
  readonly backdrop = new Graphics();
  /** Animated root (open / close pop), centred on screen. Subclasses never touch it: build in `body`. */
  readonly shell = new Container();
  /** Where the subclass builds its look; origin = screen centre. Scaled down by layout() when it would not fit. */
  readonly body = new Container();
  readonly priority: number;
  readonly dismissResult: R;
  readonly backdropClose: boolean;
  readonly backClose: boolean;
  private readonly dimScale: number;
  private w = 0;
  private h = 0;
  private contentW = 0;
  private contentH = 0;

  constructor(opts: PopupOpts<R>) {
    super();
    this.dismissResult = opts.dismissResult;
    this.backdropClose = opts.backdropClose ?? true;
    this.backClose = opts.backClose ?? true;
    this.priority = opts.priority ?? 0;
    this.dimScale = opts.dim ?? 1;
    this.backdrop.eventMode = 'static';
    this.backdrop.on('pointertap', () => {
      if (this.backdropClose && popups.top === this) this.close();
    });
    this.shell.addChild(this.body);
    this.addChild(this.backdrop, this.shell);
  }

  /** Close with a result; without one the dismissResult is used. */
  close(result?: R): void {
    popups.close(this, result);
  }

  /**
   * Declare the footprint of the popup's artwork (centred on the body origin, title label and tape
   * included) so layout() can shrink it to fit a short screen or a long message.
   */
  protected setContentSize(w: number, h: number): void {
    this.contentW = w;
    this.contentH = h;
  }

  /** Re-fit to the screen. Subclasses may override to move things, but should call super. */
  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.backdrop.clear().rect(0, 0, w, h).fill({ color: Dim.backdrop, alpha: Dim.backdropAlpha * this.dimScale });
    this.shell.position.set(w / 2, h / 2);
    const fitW = this.contentW > 0 ? (w - 16) / this.contentW : 1;
    const fitH = this.contentH > 0 ? (h - 48) / this.contentH : 1;
    this.body.scale.set(Math.min(1, fitW, fitH));
  }

  /** Called once the open animation has started and the popup is on screen. */
  onOpened(): void {}

  get screenW(): number {
    return this.w;
  }

  get screenH(): number {
    return this.h;
  }
}

interface Entry {
  popup: Popup<unknown>;
  resolve: (v: unknown) => void;
  closing: boolean;
}

interface Queued {
  popup: Popup<unknown>;
  resolve: (v: unknown) => void;
  priority: number;
}

const OPEN_TIME = 0.18;
const CLOSE_TIME = 0.12;
const QUEUE_GAP = 0.15;

/** Singleton modal stack on game.popupLayer. */
export class PopupManager {
  private stack: Entry[] = [];
  private queue: Queued[] = [];
  private readonly bag = new TweenBag();
  private attached = false;
  private pumping = false;

  /** The topmost popup that is not already closing. */
  get top(): Popup<unknown> | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const e = this.stack[i] as Entry;
      if (!e.closing) return e.popup;
    }
    return null;
  }

  get count(): number {
    return this.stack.length;
  }

  get queued(): number {
    return this.queue.length;
  }

  /** Show a popup right now, on top of whatever is open. Resolves when it closes. */
  open<R>(popup: Popup<R>): Promise<R> {
    const entry = { popup: popup as Popup<unknown>, closing: false } as Entry;
    const done = new Promise<R>((resolve) => {
      entry.resolve = resolve as (v: unknown) => void;
    });
    this.stack.push(entry);
    this.attach();
    game.popupLayer.addChild(popup);
    popup.layout(game.w, game.h);
    audio.play('ui_popup_open');
    this.animateOpen(popup);
    popup.onOpened();
    return done;
  }

  /** Show after the current popups (and earlier queued ones of >= priority) have closed. */
  enqueue<R>(popup: Popup<R>, priority = popup.priority): Promise<R> {
    const done = new Promise<R>((resolve) => {
      const item: Queued = { popup: popup as Popup<unknown>, resolve: resolve as (v: unknown) => void, priority };
      // stable insert: after every item of equal or higher priority
      let i = this.queue.length;
      while (i > 0 && (this.queue[i - 1] as Queued).priority < priority) i--;
      this.queue.splice(i, 0, item);
    });
    this.pump();
    return done;
  }

  close<R>(popup: Popup<R>, result?: R): void {
    const entry = this.stack.find((e) => e.popup === (popup as Popup<unknown>));
    if (!entry || entry.closing) return;
    entry.closing = true;
    // While it fades out the popup itself keeps swallowing taps, so nothing underneath can be hit.
    popup.interactiveChildren = false;
    popup.eventMode = 'static';
    popup.hitArea = new Rectangle(0, 0, popup.screenW, popup.screenH);
    const value = result === undefined ? popup.dismissResult : result;
    audio.play('ui_popup_close');
    this.animateClose(popup, () => {
      const i = this.stack.indexOf(entry);
      if (i >= 0) this.stack.splice(i, 1);
      if (!popup.destroyed) {
        game.popupLayer.removeChild(popup);
        popup.destroy({ children: true });
      }
      entry.resolve(value);
      if (this.stack.length === 0) this.detach();
      this.pump();
    });
  }

  /** Close the topmost popup with its dismiss result. */
  closeTop(): boolean {
    const t = this.top;
    if (!t) return false;
    t.close();
    return true;
  }

  closeAll(): void {
    for (const e of this.stack.slice()) if (!e.closing) e.popup.close();
    for (const q of this.queue.splice(0)) {
      q.popup.destroy({ children: true });
      q.resolve(q.popup.dismissResult);
    }
  }

  /**
   * Back / Escape handler. Returns true when a popup took the event (closed, or deliberately
   * refused), so the caller must not also navigate away. Wire window "popstate" to this.
   */
  handleBack(): boolean {
    const t = this.top;
    if (!t) return false;
    if (t.backClose) t.close();
    return true;
  }

  /* ------------------------------------------------------------ internals */

  private pump(): void {
    if (this.pumping || this.stack.length > 0 || this.queue.length === 0) return;
    this.pumping = true;
    this.bag.call(QUEUE_GAP, () => {
      this.pumping = false;
      if (this.stack.length > 0) return;
      const next = this.queue.shift();
      if (!next) return;
      void this.open(next.popup).then(next.resolve);
    });
  }

  private animateOpen(popup: Popup<unknown>): void {
    if (motion.reduced) return;
    popup.backdrop.alpha = 0;
    popup.shell.alpha = 0;
    popup.shell.scale.set(0.82);
    this.bag.runKeyed(popup.backdrop, {
      duration: OPEN_TIME,
      ease: Ease.linear,
      onUpdate: (k) => {
        popup.backdrop.alpha = k;
      },
      onComplete: () => {
        popup.backdrop.alpha = 1;
      },
    });
    const pop = backOut(1.70158);
    this.bag.runKeyed(popup.shell, {
      duration: OPEN_TIME,
      ease: Ease.linear,
      onUpdate: (k) => {
        popup.shell.scale.set(0.82 + 0.18 * pop(k));
        popup.shell.alpha = Math.min(1, k * 3);
      },
      onComplete: () => {
        popup.shell.scale.set(1);
        popup.shell.alpha = 1;
      },
    });
  }

  private animateClose(popup: Popup<unknown>, done: () => void): void {
    if (motion.reduced) {
      done();
      return;
    }
    const a0 = popup.backdrop.alpha;
    const b0 = popup.shell.alpha;
    const s0 = popup.shell.scale.x;
    this.bag.runKeyed(popup.backdrop, {
      duration: CLOSE_TIME,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        popup.backdrop.alpha = a0 * (1 - k);
      },
    });
    this.bag.runKeyed(popup.shell, {
      duration: CLOSE_TIME,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        popup.shell.alpha = b0 * (1 - k);
        popup.shell.scale.set(s0 * (1 - 0.08 * k));
      },
      onComplete: done,
    });
  }

  private onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'BrowserBack') {
      if (this.handleBack()) e.preventDefault();
    }
  };

  private onResize = ({ w, h }: { w: number; h: number }): void => {
    for (const e of this.stack) e.popup.layout(w, h);
  };

  private offResize: (() => void) | null = null;

  private attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKey);
    this.offResize = game.events.on('resize', this.onResize);
  }

  private detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKey);
    this.offResize?.();
    this.offResize = null;
  }
}

export const popups = new PopupManager();
