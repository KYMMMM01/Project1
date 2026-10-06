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
  private live: Container | null = null;
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

  /** Ask for a bubble on `target`; ignored when the player has seen it or it is already waiting. */
  request(id: HintId, target: Container): void {
    if (this.seen.has(id) || this.queue.some((q) => q.id === id)) return;
    this.queue.push({ id, target });
  }

  /** Drop everything still waiting (the target is gone, the screen changed). */
  clear(): void {
    this.queue.length = 0;
  }

  update(dt: number, allowed: boolean): void {
    if (this.live) {
      this.liveFor += dt;
      if (this.liveFor >= SHOW_FOR || this.live.destroyed || tooltip.target !== this.live) this.finish();
    }
    if (this.quiet > 0) this.quiet -= dt;
    if (!allowed || !this.loaded || this.live || this.quiet > 0 || tooltip.visible) return;
    const next = this.queue.shift();
    if (!next) return;
    // A bubble must point at something the player can see (a part not revealed yet is silently dropped).
    if (!onScreen(next.target) || this.seen.has(next.id)) return;
    this.seen.add(next.id);
    if (this.store) {
      this.store.data.seen = [...this.seen];
      this.store.save();
    }
    tooltip.show(next.target, { text: t(`hud.hint.${next.id}`) }, SHOW_FOR);
    this.live = next.target;
    this.liveFor = 0;
  }

  private finish(): void {
    if (this.live && tooltip.target === this.live) tooltip.hide();
    this.live = null;
    this.quiet = GAP;
  }

  destroy(): void {
    this.queue.length = 0;
    if (this.live && tooltip.target === this.live) tooltip.hide();
    this.live = null;
    void this.store?.flush();
  }
}
