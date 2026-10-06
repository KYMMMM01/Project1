/**
 * The system Back gesture (Android back button and swipe, the installed app's back, a desktop mouse's
 * back button). A page has no idea what Back means unless it keeps a history entry for it: without one
 * the browser leaves the page, or closes the installed app, while a popup is still open.
 *
 * While anything Back can dismiss is open (a popup, a full-screen page) the page sits on one extra
 * history entry of its own. Back pops that entry; the handlers run (popups first, then pages) and, if
 * something is still open afterwards, the entry is pushed again so the next Back works too. When the
 * last overlay is closed by a button instead, the spare entry is popped quietly so the first Back from
 * the home screen means "leave", as the player expects.
 */

/** What the controller needs from the browser: small enough to fake in a unit test. */
export interface HistoryPort {
  /** Add the spare entry. False when the page may not touch its history (a sandboxed frame). */
  push(): boolean;
  /** Drop the spare entry. Its popstate is reported through the listener like any other. */
  back(): void;
  listen(onPop: () => void): void;
  /** Run `fn` after `ms`, once. */
  later(fn: () => void, ms: number): void;
}

/** A handler returns true when it dealt with the Back (closed something, or refused on purpose). */
export type BackHandler = () => boolean;

/** How long after the last overlay closed the spare entry is dropped: a queued popup opens within this. */
const SETTLE_MS = 80;
/** A popstate that never answers our own history.back() must not freeze the controller. */
const POP_TIMEOUT_MS = 600;

export class BackGesture {
  private readonly handlers: BackHandler[] = [];
  private holds = 0;
  /** Our spare entry is the current history entry. */
  private armed = false;
  /** We called history.back() and its popstate has not arrived. */
  private dropping = false;
  /** Tells a stale timeout from the current drop's. */
  private dropId = 0;
  private settleQueued = false;
  private listening = false;

  constructor(private readonly port: HistoryPort) {}

  /** Register a consumer. Handlers run in registration order until one returns true. */
  onBack(fn: BackHandler): void {
    this.handlers.push(fn);
  }

  /** Something Back can dismiss is now open. Call the returned function when it is gone. */
  hold(): () => void {
    this.holds++;
    this.sync();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
      this.sync();
    };
  }

  /** True while the spare entry is on the history stack. */
  get active(): boolean {
    return this.armed;
  }

  private sync(): void {
    if (this.holds > 0) {
      if (this.armed || this.dropping) return;
      if (!this.listening) {
        this.listening = true;
        this.port.listen(() => this.onPop());
      }
      this.armed = this.port.push();
      return;
    }
    if (!this.armed || this.settleQueued) return;
    this.settleQueued = true;
    this.port.later(() => {
      this.settleQueued = false;
      if (this.holds > 0 || !this.armed) return;
      this.armed = false;
      this.dropping = true;
      const id = ++this.dropId;
      this.port.back();
      this.port.later(() => {
        if (this.dropId === id) this.dropDone();
      }, POP_TIMEOUT_MS);
    }, SETTLE_MS);
  }

  private dropDone(): void {
    if (!this.dropping) return;
    this.dropping = false;
    this.sync();
  }

  private onPop(): void {
    if (this.dropping) {
      // The echo of our own history.back(): nothing to dismiss.
      this.dropDone();
      return;
    }
    this.armed = false;
    for (const fn of this.handlers) if (fn()) break;
    this.sync();
  }
}

function browserPort(): HistoryPort {
  return {
    push: () => {
      try {
        window.history.pushState({ meowBack: true }, '');
        return true;
      } catch {
        return false;
      }
    },
    back: () => {
      try {
        window.history.back();
      } catch {
        /* a sandboxed frame: the next popstate never comes, the timeout releases us */
      }
    },
    listen: (onPop) => window.addEventListener('popstate', onPop),
    later: (fn, ms) => void setTimeout(fn, ms),
  };
}

let shared: BackGesture | null = null;

/** The page's one controller, created on first use (nothing touches `window` at import time). */
export function backGesture(): BackGesture {
  shared ??= new BackGesture(browserPort());
  return shared;
}
