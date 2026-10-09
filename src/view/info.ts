/**
 * The battle's information bubbles (an enemy card, a toy, a lit sunbeam cell, a cat's skill line, a refused command, the laser button's
 * state) under ONE rule: tapping the same source again closes the bubble; tapping anywhere else closes it and the tap still does what it
 * would have done (only a tap on the bubble itself is its own); opening another replaces it; it closes by itself after a few seconds; and it
 * closes when a popup, a lesson or a banner needs the space. `InfoRule` is that rule with nothing drawn (unit tested); `info` is the one
 * place the HUD, the field and the lessons ask for a bubble, drawn by whatever view the HUD binds (HintBubble.ts).
 */
import type { Container } from 'pixi.js';

/** What a bubble says. */
export interface InfoContent {
  title?: string;
  text: string;
  /** A tappable line under the text (the enemy bubble's "see in the codex"): `run` is called on the press, and the caller closes the bubble. */
  link?: { label: string; run: () => void };
}

export interface InfoOpts {
  /** Seconds until it closes by itself; 0 stays until it is closed. */
  seconds?: number;
  /** A lesson's own line: a tap elsewhere and the clock leave it alone; only its owner closes it. */
  sticky?: boolean;
  /** Which side of the source it prefers when both have room. */
  prefer?: 'above' | 'below';
}

/** How long a bubble the player asked for stays up. */
export const INFO_FOR = 5;

/** The rule: who owns the open bubble, how long it has left, and what closes it. */
export class InfoRule {
  /** Who the open bubble belongs to; null when none is open. */
  key: unknown = null;
  /** Counts every opening and closing, so a decision made before something else happened in the same tap can tell it was overtaken. */
  gen = 0;
  sticky = false;
  private left = 0;

  get isOpen(): boolean {
    return this.key !== null;
  }

  /** A tap on a source: its own bubble closes, anyone else's is replaced. Returns what the view has to do. */
  tap(key: unknown, seconds = INFO_FOR): 'open' | 'close' {
    if (this.key === key) {
      this.close();
      return 'close';
    }
    this.open(key, seconds, false);
    return 'open';
  }

  open(key: unknown, seconds: number, sticky: boolean): void {
    this.key = key;
    this.left = seconds;
    this.sticky = sticky;
    this.gen++;
  }

  close(): boolean {
    if (this.key === null) return false;
    this.key = null;
    this.left = 0;
    this.sticky = false;
    this.gen++;
    return true;
  }

  /**
   * A tap that landed on something else. `since` is the generation when the tap began: the thing it landed on may have opened, replaced or
   * closed a bubble itself, and then this tap has nothing left to close.
   */
  elsewhere(since: number): boolean {
    return this.gen === since && !this.sticky && this.close();
  }

  /** Time passes; true when the bubble ran out (and closed). */
  update(dt: number): boolean {
    if (this.key === null || this.left <= 0) return false;
    this.left -= dt;
    return this.left <= 0 && this.close();
  }
}

/** What draws the bubble: the HUD's own bubble on the battle's overlay layer. */
export interface InfoView {
  /** Show `content` on `target`, a display object (an invisible marker when the thing is drawn by someone else). */
  show(target: Container, content: InfoContent, prefer: 'above' | 'below', sticky: boolean): void;
  hide(animate: boolean): void;
}

class InfoBubbles {
  private view: InfoView | null = null;
  private readonly rule = new InfoRule();
  /** Asked before a player's tap opens a bubble: a lesson card on screen has the space. */
  canOpen: (() => boolean) | null = null;
  private readonly listeners = new Set<(key: unknown) => void>();

  private readonly onDown = (): void => {
    if (!this.rule.isOpen) return;
    const since = this.rule.gen;
    // The tap goes on to whatever is under it first (a source may open, close or replace a bubble on this very tap); what is left
    // of it afterwards is a tap elsewhere.
    setTimeout(() => {
      if (this.rule.elsewhere(since)) this.view?.hide(true);
    }, 0);
  };

  /** The HUD gives the bubble its view for as long as it lives; null takes it away (and closes what is open). */
  bind(view: InfoView | null): void {
    if (this.view) {
      window.removeEventListener('pointerdown', this.onDown, true);
      if (this.rule.close()) this.view.hide(false);
    }
    this.view = view;
    if (view) window.addEventListener('pointerdown', this.onDown, true);
  }

  /** `fn` is told the key of every bubble that opens (a toy's, a cell's...): the field lights what a bubble is about. Returns the way to stop listening. */
  listen(fn: (key: unknown) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private opened(key: unknown): void {
    for (const fn of this.listeners) fn(key);
  }

  /** The rule's state, for the lessons that wait for a bubble to go and for the debug hooks. */
  get visible(): boolean {
    return this.rule.isOpen;
  }

  get key(): unknown {
    return this.rule.key;
  }

  get generation(): number {
    return this.rule.gen;
  }

  /** A tap on a source: opens its bubble, closes it when it was already the one open, replaces another's. Returns whether one is open now. */
  tap(key: unknown, target: Container, content: InfoContent, opts: InfoOpts = {}): boolean {
    if (!this.view) return false;
    if (this.rule.key !== key && this.canOpen && !this.canOpen()) return false;
    if (this.rule.tap(key, opts.seconds ?? INFO_FOR) === 'close') {
      this.view.hide(true);
      return false;
    }
    this.view.show(target, content, opts.prefer ?? 'above', false);
    this.opened(key);
    return true;
  }

  /** Open (or replace) a bubble that is not a toggle: a refused command's reason, a lesson's line. */
  show(key: unknown, target: Container, content: InfoContent, opts: InfoOpts = {}): boolean {
    if (!this.view) return false;
    const sticky = opts.sticky ?? false;
    this.rule.open(key, sticky ? 0 : (opts.seconds ?? INFO_FOR), sticky);
    this.view.show(target, content, opts.prefer ?? 'above', sticky);
    this.opened(key);
    return true;
  }

  /**
   * Close the bubble that is open because a popup, a lesson or a banner needs the space (a lesson's own sticky line stays), or, given
   * its `key`, that one bubble whoever it belongs to: only its owner may close a sticky one.
   */
  close(animate = true, key?: unknown): void {
    if (key === undefined ? this.rule.sticky : this.rule.key !== key) return;
    if (this.rule.close()) this.view?.hide(animate);
  }

  update(dt: number): void {
    if (this.rule.update(dt)) this.view?.hide(true);
  }
}

export const info = new InfoBubbles();
