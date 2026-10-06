/**
 * One-time speech bubbles for things that appear after the tutorial's three forced steps. A hint is
 * shown at most once per player (remembered in storage; sandbox runs only for the session), never
 * while a popup, a drag, a staged banner or a forced tutorial step is going on, and never two at once.
 * The same bubble also explains a refused command next to the control that was pressed.
 */
import type { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { SaveStore } from '@/core/save';
import { tooltip } from '@/ui';
import type { Weighted } from './bubbleMath';
import type { HintBubble } from './HintBubble';
import type { HintId } from './policy';

export const SHOW_FOR = 5;
/** A refusal is a sentence, not a lesson: it leaves sooner. */
export const EXPLAIN_FOR = 2.6;
/** Quiet time between two bubbles so they never pile up at the start of a run. */
const GAP = 7;

interface Saved {
  seen: string[];
}

interface Pending {
  id: HintId;
  target: Container;
  /** A second thing the bubble is about (the other cat of a pair): the bubble points at both and keeps off neither. */
  also: Container | null;
  /** Points at a button of the selection bar: shown only while a cat is selected (every other bubble waits for the selection to close). */
  onSelection: boolean;
}

/** What the HUD lends the hints: the bubble to draw with and the rectangles it should keep clear of. */
export interface HintHost {
  bubble: HintBubble;
  avoid(): Weighted[];
}

/** True when the container and every ancestor are shown and it has something to point at. */
export function onScreen(c: Container): boolean {
  if (c.destroyed) return false;
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.alpha <= 0) return false;
  const b = c.getLocalBounds();
  return b.width > 0 && b.height > 0;
}

export class Hints {
  private readonly seen = new Set<string>();
  private readonly queue: Pending[] = [];
  private readonly store: SaveStore<Saved> | null;
  private host: HintHost | null = null;
  private loaded: boolean;
  private quiet = 0;
  private holdoff = 0;
  private live: Pending | null = null;
  private liveFor = 0;
  /** Seconds left of a refusal bubble (it takes the place of any hint while it is up). */
  private saying = 0;

  constructor(persist: boolean) {
    this.store = persist ? new SaveStore<Saved>({ key: 'meowguard.hints', version: 1, defaults: () => ({ seen: [] }) }) : null;
    this.loaded = this.store === null;
    void this.store?.load().then(() => {
      for (const id of this.store?.data.seen ?? []) this.seen.add(id);
      this.loaded = true;
    });
  }

  has(id: HintId): boolean {
    return this.seen.has(id);
  }

  /** The HUD (re)built its parts: draw with this bubble from now on, or with none (null) while they are gone. */
  bind(host: HintHost | null): void {
    this.interrupt();
    this.endSaying();
    this.host = host;
  }

  /**
   * Ask for a bubble on `target`; ignored when the player has seen it or it is already waiting. `first`
   * puts it at the front of the queue and sends a bubble that is up right now back to wait its turn.
   */
  request(id: HintId, target: Container, onSelection = false, first = false, also: Container | null = null): void {
    if (this.seen.has(id) || this.queue.some((q) => q.id === id)) return;
    if (!first) {
      this.queue.push({ id, target, also, onSelection });
      return;
    }
    if (this.live && !this.live.onSelection) this.interrupt();
    this.queue.unshift({ id, target, also, onSelection });
  }

  /** The player did what the hint is about: it is done for good, on screen or waiting. */
  used(id: HintId): void {
    const at = this.queue.findIndex((q) => q.id === id);
    if (at >= 0) this.queue.splice(at, 1);
    if (this.live?.id === id) this.finish();
    if (!this.seen.has(id)) this.remember(id, true);
  }

  /** A banner or caption is about to take the top of the screen: no bubble comes up (or stays) for `seconds`. */
  hold(seconds: number): void {
    this.holdoff = Math.max(this.holdoff, seconds);
    if (this.live && !this.live.onSelection) this.interrupt();
  }

  /** Tell the player why a command was refused, next to the control they pressed. False when there is no bubble to do it with. */
  explain(target: Container, text: string): boolean {
    const host = this.host;
    if (!host || !onScreen(target)) return false;
    if (this.live) this.interrupt();
    host.bubble.show(target, text, host.avoid(), 'above');
    this.saying = EXPLAIN_FOR;
    return true;
  }

  /** Drop everything still waiting (the target is gone, the screen changed). */
  clear(): void {
    this.queue.length = 0;
  }

  update(dt: number, allowed: boolean, selecting: boolean): void {
    if (this.saying > 0) {
      this.saying -= dt;
      if (this.saying <= 0 || !allowed) this.endSaying();
      return;
    }
    if (this.holdoff > 0) this.holdoff -= dt;
    if (this.live) {
      this.liveFor += dt;
      // A kit tooltip (an enemy card the player pressed) is the answer to a tap: the hint steps aside for it.
      if (!allowed || tooltip.visible || this.live.onSelection !== selecting) this.interrupt();
      else if (this.liveFor >= SHOW_FOR || this.live.target.destroyed || !this.host?.bubble.visible) this.finish();
    }
    if (this.quiet > 0) this.quiet -= dt;
    if (!allowed || !this.loaded || this.live || this.quiet > 0 || this.holdoff > 0 || tooltip.visible || !this.host) return;
    const at = this.queue.findIndex((q) => q.onSelection === selecting);
    const next = at >= 0 ? this.queue.splice(at, 1)[0] : undefined;
    if (!next) return;
    // A bubble must point at something the player can see (a part not revealed yet is silently dropped).
    if (!onScreen(next.target) || this.seen.has(next.id)) return;
    this.remember(next.id, true);
    this.host.bubble.show(next.target, t(`hud.hint.${next.id}`), this.host.avoid(), 'above', next.also ?? undefined);
    this.live = next;
    this.liveFor = 0;
  }

  private remember(id: HintId, seen: boolean): void {
    if (seen) this.seen.add(id);
    else this.seen.delete(id);
    if (this.store) {
      this.store.data.seen = [...this.seen];
      this.store.save();
    }
  }

  private endSaying(): void {
    if (this.saying === 0) return;
    this.saying = 0;
    this.host?.bubble.hide();
  }

  private finish(): void {
    this.host?.bubble.hide();
    this.live = null;
    this.quiet = GAP;
  }

  /** A popup, drag or result screen took over: the bubble goes away and comes back later, unseen. */
  private interrupt(): void {
    const hint = this.live;
    if (!hint) return;
    this.host?.bubble.hide();
    this.live = null;
    this.quiet = 1;
    if (!hint.target.destroyed) {
      this.remember(hint.id, false);
      this.queue.unshift(hint);
    }
  }

  destroy(): void {
    this.queue.length = 0;
    this.host?.bubble.hide();
    this.host = null;
    this.live = null;
    void this.store?.flush();
  }
}
