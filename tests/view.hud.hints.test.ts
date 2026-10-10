import { Container, Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuideProgress } from '@/guide';
import { info, type InfoView } from '@/view/info';
import { bubbleInTheWay, Hints, type HintHost } from '@/view/hud/hints';
import type { HintBubble } from '@/view/hud/HintBubble';
import type { LessonBubble } from '@/view/hud/LessonBubble';

/** The first-encounter scheduler against a recording host: which card is up, and what holds the battle. */
function setup(): { hints: Hints; target: Container; shown: string[]; holds: { n: number }; skip: () => void } {
  const taught = new Set<string>();
  const progress = {
    ready: true,
    skipped: false,
    isSeen: (id: string) => taught.has(id),
    markTaught: (id: string) => void taught.add(id),
    flush: () => Promise.resolve(),
  } as unknown as GuideProgress;
  const shown: string[] = [];
  const holds = { n: 0 };
  const host: HintHost = {
    bubble: { boundsOf: () => ({ x: 0, y: 0, w: 100, h: 40 }) } as unknown as HintBubble,
    card: {
      show: (spec: { topic: string }) => void shown.push(spec.topic),
      hide: () => void shown.push('-'),
    } as unknown as LessonBubble,
    hold: () => {
      holds.n++;
      return () => void holds.n--;
    },
    openGuide: () => undefined,
  };
  const hints = new Hints(progress);
  hints.bind(host);
  // a thing with a size to point at, on screen
  const target = new Container();
  target.addChild(new Graphics().rect(0, 0, 80, 30).fill(0xffffff));
  return { hints, target, shown, holds, skip: () => void ((progress as { skipped: boolean }).skipped = true) };
}

const view: InfoView = { show: () => undefined, hide: () => undefined };

describe('the first-encounter card and the bubbles on screen', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener: () => undefined, removeEventListener: () => undefined });
    info.bind(view);
  });
  afterEach(() => {
    info.bind(null);
    vi.unstubAllGlobals();
  });

  it('knows which bubble is in a card\'s way: the player\'s own, never a lesson\'s sticky line', () => {
    expect(bubbleInTheWay(false, false)).toBe(false);
    expect(bubbleInTheWay(true, false)).toBe(true);
    expect(bubbleInTheWay(true, true)).toBe(false);
  });

  it('opens at once when nothing is on screen, and holds the battle while it is up', () => {
    const { hints, target, shown, holds } = setup();
    hints.request('elite', target, false, true);
    hints.update(0.1, true, false);
    expect(shown).toEqual(['elite']);
    expect(holds.n).toBe(1);
    expect(hints.liveId).toBe('elite');
  });

  it('opens over a lesson\'s sticky line (the laser guide waits for the player for as long as it takes, and used to starve every card)', () => {
    const { hints, target, shown } = setup();
    info.show('laser-guide', target, { text: 'press the button' }, { sticky: true });
    expect(info.visible).toBe(true);
    expect(info.sticky).toBe(true);
    hints.request('boss', target, false, true);
    hints.update(0.1, true, false);
    expect(shown).toEqual(['boss']);
    // and a sticky line that arrives while the card is up does not send it away and back
    info.show('laser-guide', target, { text: 'press the button' }, { sticky: true });
    hints.update(0.1, true, false);
    hints.update(0.1, true, false);
    expect(shown).toEqual(['boss']);
    expect(hints.liveId).toBe('boss');
  });

  it('waits for a bubble the player opened, and comes as soon as it is gone', () => {
    const { hints, target, shown } = setup();
    info.show('enemy:cucumber', target, { text: 'a cucumber' }, { seconds: 5 });
    expect(info.sticky).toBe(false);
    hints.request('elite', target, false, true);
    hints.update(0.1, true, false);
    expect(shown).toEqual([]);
    info.close();
    hints.update(0.1, true, false);
    expect(shown).toEqual(['elite']);
  });

  it('is sent back to the queue, once, when the player opens a bubble over it (and not again until that bubble is gone)', () => {
    const { hints, target, shown, holds } = setup();
    hints.request('elite', target, false, true);
    hints.update(0.1, true, false);
    info.show('toy:fan', target, { text: 'a toy' }, { seconds: 5 });
    hints.update(0.1, true, false);
    expect(shown).toEqual(['elite', '-']);
    expect(holds.n).toBe(0);
    for (let i = 0; i < 20; i++) hints.update(0.1, true, false);
    expect(shown).toEqual(['elite', '-']);
  });

  it('leaves the cards to the tutorial\'s lessons, except the one it has none for, until the lessons are skipped (then every card comes, in that same run)', () => {
    const { hints, target, shown, skip } = setup();
    hints.only = new Set(['awaken']);
    hints.request('elite', target, false, true);
    hints.update(0.1, true, false);
    expect(shown).toEqual([]);
    hints.request('awaken', target, false, true);
    hints.update(0.1, true, false);
    expect(shown).toEqual(['awaken']);
    hints.used('awaken');
    // the player skips the lessons: the filter is over without anyone clearing it
    skip();
    hints.request('elite', target, false, true);
    hints.update(30, true, false);
    expect(shown).toEqual(['awaken', '-', 'elite']);
  });

  it('is asked for once: a card that is up is not asked for again, and does not blink', () => {
    const { hints, target, shown } = setup();
    hints.request('elite', target, false, true);
    hints.update(0.1, true, false);
    for (let i = 0; i < 5; i++) {
      hints.request('elite', target, false, true);
      hints.update(0.1, true, false);
    }
    expect(shown).toEqual(['elite']);
  });
});
