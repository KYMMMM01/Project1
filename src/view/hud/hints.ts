/**
 * One-time speech bubbles for things that appear after the tutorial's three forced steps. A hint is
 * shown at most once per player (remembered in storage; sandbox runs only for the session), never
 * while a popup, a drag or a forced tutorial step is going on, and never two at once.
 */
import type { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import { SaveStore } from '@/core/save';
import { tooltip } from '@/ui';
import type { HintId } from './policy';

const SHOW_FOR = 5;
/** Quiet time between two bubbles so they never pile up at the start of a run. */
const GAP = 7;

interface Saved {
  seen: string[];
}

interface Pending {
  id: HintId;
  target: Container;
  /** Points at a button of the selection bar: shown only while a cat is selected (every other bubble waits for the selection to close). */
  onSelection: boolean;
}

/** True when the container and every ancestor are shown and it has something to point at. */
function onScreen(c: Container): boolean {
  if (c.destroyed) return false;
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.alpha <= 0) return false;
  const b = c.getLocalBounds();
  return b.width > 0 && b.height > 0;
}

export class Hints {
  private readonly seen = new Set<string>();
  private readonly queue: Pending[] = [];
  private readonly store: SaveStore<Saved> | null;
  private loaded: boolean;
  private quiet = 0;
  private live: Pending | null = null;
  private liveFor = 0;

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

  /**
   * Ask for a bubble on `target`; ignored when the player has seen it or it is already waiting. `first`
   * puts it at the front of the queue and sends a bubble that is up right now back to wait its turn.
   */
  request(id: HintId, target: Container, onSelection = false, first = false): void {
    if (this.seen.has(id) || this.queue.some((q) => q.id === id)) return;
    if (!first) {
      this.queue.push({ id, target, onSelection });
      return;
    }
    if (this.live && !this.live.onSelection) this.interrupt();
    this.queue.unshift({ id, target, onSelection });
  }

  /** Drop everything still waiting (the target is gone, the screen changed). */
  clear(): void {
    this.queue.length = 0;
  }

  update(dt: number, allowed: boolean, selecting: boolean): void {
    if (this.live) {
      this.liveFor += dt;
      if (!allowed || this.live.onSelection !== selecting) this.interrupt();
      else if (this.liveFor >= SHOW_FOR || this.live.target.destroyed || tooltip.target !== this.live.target) this.finish();
    }
    if (this.quiet > 0) this.quiet -= dt;
    if (!allowed || !this.loaded || this.live || this.quiet > 0 || tooltip.visible) return;
    const at = this.queue.findIndex((q) => q.onSelection === selecting);
    const next = at >= 0 ? this.queue.splice(at, 1)[0] : undefined;
    if (!next) return;
    // A bubble must point at something the player can see (a part not revealed yet is silently dropped).
    if (!onScreen(next.target) || this.seen.has(next.id)) return;
    this.remember(next.id, true);
    tooltip.show(next.target, { text: t(`hud.hint.${next.id}`) }, SHOW_FOR);
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

  private finish(): void {
    if (this.live && tooltip.target === this.live.target) tooltip.hide();
    this.live = null;
    this.quiet = GAP;
  }

  /** A popup, drag or result screen took over: the bubble goes away and comes back later, unseen. */
  private interrupt(): void {
    const hint = this.live;
    if (!hint) return;
    if (tooltip.target === hint.target) tooltip.hide();
    this.live = null;
    this.quiet = 1;
    if (!hint.target.destroyed) {
      this.remember(hint.id, false);
      this.queue.unshift(hint);
    }
  }

  destroy(): void {
    this.queue.length = 0;
    if (this.live && tooltip.target === this.live.target) tooltip.hide();
    this.live = null;
    void this.store?.flush();
  }
}
