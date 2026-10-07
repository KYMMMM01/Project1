/**
 * First-encounter lessons: the card that explains a thing the first time the player meets it in a real run. A card is shown at
 * most once per player (taught when it is dismissed, or when the player does the thing it is about), never while a popup, a drag,
 * a staged banner or a tutorial lesson is going on, never two at once, and it holds the battle still while the player reads.
 * The same bubble machinery also explains a refused command next to the control that was pressed.
 */
import type { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import type { GuideProgress } from '@/guide';
import { topicTeach, topicTitle } from '@/guide';
import { tooltip } from '@/ui';
import type { Weighted } from './bubbleMath';
import { unionRect } from './bubbleMath';
import type { HintBubble } from './HintBubble';
import type { LessonBubble } from './LessonBubble';
import type { Rect } from './layoutMath';
import type { HintId } from './policy';

/** A refusal is a sentence, not a lesson: it leaves sooner. */
export const EXPLAIN_FOR = 2.6;
/** Quiet time between two cards so they never pile up at the start of a run. */
const GAP = 7;
const CARD_W = 640;
const CARD_TILE = 120;

interface Pending {
  id: HintId;
  target: Container;
  /** A second thing the card is about (the other cat of a pair): the card points at both and keeps off neither. */
  also: Container | null;
  /** Points at a button of the selection bar: shown only while a cat is selected (every other card waits for the selection to close). */
  onSelection: boolean;
}

/** What the HUD lends the lessons: the bubbles to draw with and the rectangles they should keep clear of. */
export interface HintHost {
  bubble: HintBubble;
  card: LessonBubble;
  avoid(): Weighted[];
  /** Holds the battle still until the returned function is called. */
  hold(): () => void;
  /** Open the guidebook on a topic (the card's "more" button). */
  openGuide(id: HintId): void;
}

/** True when the container and every ancestor are shown and it has something to point at. */
export function onScreen(c: Container): boolean {
  if (c.destroyed) return false;
  for (let p: Container | null = c; p; p = p.parent) if (!p.visible || p.alpha <= 0) return false;
  const b = c.getLocalBounds();
  return b.width > 0 && b.height > 0;
}

export class Hints {
  private readonly queue: Pending[] = [];
  private host: HintHost | null = null;
  private quiet = 0;
  private holdoff = 0;
  private live: Pending | null = null;
  private release: (() => void) | null = null;
  /** Seconds left of a refusal bubble (it takes the place of any card while it is up). */
  private saying = 0;
  /** While set, only these topics may ask for a card (the tutorial run teaches the rest itself). */
  only: ReadonlySet<HintId> | null = null;

  constructor(private readonly progress: GuideProgress) {}

  has(id: HintId): boolean {
    return this.progress.isSeen(id);
  }

  /** A card is on screen (and holding the battle still). */
  get holding(): boolean {
    return this.live !== null;
  }

  /** The topic of the card on screen, or null. */
  get liveId(): HintId | null {
    return this.live?.id ?? null;
  }

  /** The HUD (re)built its parts: draw with these bubbles from now on, or with none (null) while they are gone. */
  bind(host: HintHost | null): void {
    this.interrupt();
    this.endSaying();
    this.host = host;
  }

  /**
   * Ask for a card on `target`; ignored when the player has been taught it or it is already waiting. `first`
   * puts it at the front of the queue and sends a card that is up right now back to wait its turn.
   */
  request(id: HintId, target: Container, onSelection = false, first = false, also: Container | null = null): void {
    if (this.only && !this.only.has(id)) return;
    if (this.progress.isSeen(id) || this.queue.some((q) => q.id === id) || this.live?.id === id) return;
    if (!first) {
      this.queue.push({ id, target, also, onSelection });
      return;
    }
    if (this.live && !this.live.onSelection) this.interrupt();
    this.queue.unshift({ id, target, also, onSelection });
  }

  /** The player did what the lesson is about: it is done for good, on screen or waiting. */
  used(id: HintId): void {
    const at = this.queue.findIndex((q) => q.id === id);
    if (at >= 0) this.queue.splice(at, 1);
    if (this.live?.id === id) this.close();
    this.progress.markTaught(id);
  }

  /** A banner or caption is about to take the top of the screen: no card comes up (or stays) for `seconds`. */
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
      // A kit tooltip (an enemy card the player pressed) is the answer to a tap: the lesson steps aside for it.
      if (!allowed || tooltip.visible || this.live.onSelection !== selecting || this.live.target.destroyed) this.interrupt();
      return;
    }
    if (this.quiet > 0) this.quiet -= dt;
    if (!allowed || !this.progress.ready || this.quiet > 0 || this.holdoff > 0 || tooltip.visible || !this.host) return;
    const at = this.queue.findIndex((q) => q.onSelection === selecting);
    const next = at >= 0 ? this.queue.splice(at, 1)[0] : undefined;
    if (!next) return;
    // A card must point at something the player can see (a part not revealed yet is silently dropped).
    if (!onScreen(next.target) || this.progress.isSeen(next.id)) return;
    this.open(this.host, next);
  }

  private open(host: HintHost, hint: Pending): void {
    let box: Rect = host.bubble.boundsOf(hint.target);
    if (hint.also) box = unionRect(box, host.bubble.boundsOf(hint.also));
    host.card.show(
      {
        topic: hint.id,
        title: topicTitle(hint.id),
        text: topicTeach(hint.id),
        target: box,
        width: CARD_W,
        tile: CARD_TILE,
        buttons: [
          { label: t('guide.card.got'), style: 'primary', width: 220 },
          { label: t('guide.card.more'), style: 'neutral', width: 0 },
        ],
      },
      (i) => {
        const more = i === 1;
        this.progress.markTaught(hint.id);
        this.close();
        if (more) host.openGuide(hint.id);
      },
    );
    this.release = host.hold();
    this.live = hint;
  }

  private endSaying(): void {
    if (this.saying === 0) return;
    this.saying = 0;
    this.host?.bubble.hide();
  }

  /** The card is done with: it goes, the battle runs on, and the next one waits a moment. */
  private close(): void {
    this.host?.card.hide();
    this.release?.();
    this.release = null;
    this.live = null;
    this.quiet = GAP;
  }

  /** A popup, drag or result screen took over: the card goes away and comes back later, unseen. */
  private interrupt(): void {
    const hint = this.live;
    if (!hint) return;
    this.host?.card.hide();
    this.release?.();
    this.release = null;
    this.live = null;
    this.quiet = 1;
    if (!hint.target.destroyed) this.queue.unshift(hint);
  }

  destroy(): void {
    this.queue.length = 0;
    this.host?.bubble.hide();
    this.host?.card.hide(false);
    this.release?.();
    this.release = null;
    this.host = null;
    this.live = null;
    void this.progress.flush();
  }
}
