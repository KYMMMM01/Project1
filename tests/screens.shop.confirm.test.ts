import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang } from '@/core/i18n';
import '@/meta/strings';
import '../src/screens/shop/strings';
import { confirmChestBuy } from '../src/screens/shop/ChestConfirm';
import { CONFIRM_ARM_S } from '../src/screens/shop/shopLogic';

/**
 * The "buy this chest?" popup is a Pixi view and cannot be drawn in this node environment, so the UI kit is replaced by thin
 * stand-ins that record what ChestConfirm asks of them (which button, enabled or not, what a tap does, which timers it sets)
 * and the game clock is a number the tests move by hand. What is checked is the real ChestConfirm.ts.
 */
interface FakeButton {
  opts: { label?: string; style?: string; sublabel?: string; enabled?: boolean; disabledMark?: string };
  enabled: boolean;
  destroyed: boolean;
  tap: (() => void) | null;
  /** What a finger does: a greyed-out button swallows the tap. */
  press(): void;
}
interface FakePopup {
  closed: unknown[];
  onOpened(): void;
  destroy(): void;
}

const h = vi.hoisted(() => ({
  clock: { time: 0 },
  buttons: [] as unknown[],
  titles: [] as string[],
  timers: [] as { at: number; fn: () => void }[],
  popup: null as unknown,
}));

vi.mock('@/core/game', () => ({ game: h.clock }));

vi.mock('@/meta', async () => {
  const { ODDS, oddsView } = await import('@/meta/odds');
  return {
    profile: {
      data: { goldOpened: 0 },
      oddsOf: (kind: 'wooden' | 'silver' | 'gold') => oddsView(ODDS[kind], { goldOpened: 0, target: null }),
    },
  };
});

vi.mock('@/ui', () => {
  class Button {
    opts: FakeButton['opts'];
    enabled: boolean;
    destroyed = false;
    tap: (() => void) | null = null;
    position = { set: (): void => {} };
    constructor(opts: FakeButton['opts']) {
      this.opts = opts;
      this.enabled = opts.enabled !== false;
      h.buttons.push(this);
    }
    onTap(fn: (() => void) | null): this {
      this.tap = fn;
      return this;
    }
    setEnabled(v: boolean): this {
      this.enabled = v;
      return this;
    }
    press(): void {
      if (this.enabled) this.tap?.();
    }
  }
  class Popup {
    body = { addChild: (): void => {} };
    closed: unknown[] = [];
    close(result?: unknown): void {
      this.closed.push(result);
    }
    setContentSize(): void {}
    destroy(): void {}
  }
  class Panel {
    content = { addChild: (): void => {} };
    constructor(opts: { title: string }) {
      h.titles.push(opts.title);
    }
  }
  class TweenBag {
    call(seconds: number, fn: () => void): void {
      h.timers.push({ at: h.clock.time + seconds, fn });
    }
    killAll(): void {
      h.timers.length = 0;
    }
  }
  return {
    Button,
    Color: { ink: 0, inkSoft: 1 },
    Panel,
    Popup,
    TweenBag,
    uiLabel: () => ({ position: { set: (): void => {} }, height: 30 }),
    popups: {
      open: (p: unknown): Promise<boolean> => {
        h.popup = p;
        (p as FakePopup).onOpened();
        return new Promise(() => {});
      },
    },
  };
});

/** Move the game clock; the timers that came due run in order, as the ticker would run them. */
function advance(seconds: number): void {
  h.clock.time += seconds;
  for (;;) {
    const due = h.timers.find((x) => x.at <= h.clock.time);
    if (!due) return;
    h.timers.splice(h.timers.indexOf(due), 1);
    due.fn();
  }
}

/** Open the popup the way the shop does and hand back its two buttons. */
function open(kind: 'silver' | 'gold', count: number): { popup: FakePopup; buy: FakeButton; cancel: FakeButton; title: string } {
  h.buttons.length = 0;
  h.titles.length = 0;
  h.timers.length = 0;
  void confirmChestBuy(kind, count);
  const popup = h.popup as FakePopup;
  const buttons = h.buttons as FakeButton[];
  const buy = buttons.find((b) => b.opts.style === 'primary');
  const cancel = buttons.find((b) => b.opts.style === 'neutral');
  if (!buy || !cancel) throw new Error('the popup has a buy and a cancel button');
  return { popup, buy, cancel, title: h.titles[0] ?? '' };
}

beforeEach(() => {
  h.clock.time = 1234.5;
  setLang('ko');
});

afterEach(() => {
  h.buttons.length = 0;
  h.timers.length = 0;
});

describe('the confirmation popup: the buy button is inert for the first moments', () => {
  it('opens with a greyed-out buy button that wears no padlock, the price of the whole purchase on it and the count in the title', () => {
    const { popup, buy, title } = open('gold', 10);
    expect(buy.enabled).toBe(false);
    expect(buy.opts.disabledMark).toBe('none');
    expect(buy.opts.label).toBe('사기');
    expect(buy.opts.sublabel).toBe('5,000');
    expect(title).toBe('금 상자 10개를 살까요?');
    expect(popup.closed).toEqual([]);
  });

  it('does not buy on a repeat tap: a double tap, a tap because the popup was slow to show, any tap before the delay is over', () => {
    const { popup, buy } = open('gold', 10);
    // Seconds after the popup opened: the same instant, a fast double tap, a slow one, and a repeat half a second or more later.
    for (const at of [0, 0.05, 0.12, 0.25, 0.5, 0.65, CONFIRM_ARM_S - 0.01]) {
      advance(1234.5 + at - h.clock.time);
      buy.press();
      expect(buy.enabled).toBe(false);
    }
    expect(popup.closed).toEqual([]);
  });

  it('also ignores a tap that gets through to the handler before the popup is armed', () => {
    const { popup, buy } = open('silver', 10);
    advance(0.2);
    // Even a button that was somehow live (a theme that does not grey it, a future change) does not buy early.
    buy.enabled = true;
    buy.tap?.();
    expect(popup.closed).toEqual([]);
  });

  it('wakes the button when the delay is over, and then a tap buys exactly once', () => {
    const { popup, buy } = open('gold', 10);
    advance(CONFIRM_ARM_S - 0.01);
    expect(buy.enabled).toBe(false);
    advance(0.02);
    expect(buy.enabled).toBe(true);
    buy.press();
    expect(popup.closed).toEqual([true]);
  });

  it('works the same for a single chest', () => {
    const { popup, buy } = open('silver', 1);
    expect(buy.enabled).toBe(false);
    advance(0.3);
    buy.press();
    expect(popup.closed).toEqual([]);
    advance(0.5);
    buy.press();
    expect(popup.closed).toEqual([true]);
  });

  it('lets the player cancel at once, and a popup that is closed before the delay never wakes a destroyed button', () => {
    const { popup, buy, cancel } = open('gold', 10);
    cancel.press();
    expect(popup.closed).toEqual([false]);
    popup.destroy();
    advance(5);
    expect(buy.enabled).toBe(false);
    expect(h.timers).toEqual([]);
  });
});
