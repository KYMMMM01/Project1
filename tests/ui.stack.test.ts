import { Graphics } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackGesture, type HistoryPort } from '@/ui/backGesture';
import { mutedPalette, ButtonPalettes, Color, MIN_FONT } from '@/ui/theme';
import { tintToward } from '@/ui/colors';

function relLuma(c: number): number {
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((c >> 16) & 0xff) + 0.7152 * ch((c >> 8) & 0xff) + 0.0722 * ch(c & 0xff);
}

function contrast(a: number, b: number): number {
  const [hi, lo] = relLuma(a) > relLuma(b) ? [a, b] : [b, a];
  return (relLuma(hi) + 0.05) / (relLuma(lo) + 0.05);
}

describe('type floor', () => {
  it('no kit label may be smaller than the 24 px body-text bar', () => {
    expect(MIN_FONT).toBeGreaterThanOrEqual(24);
  });
});

describe('disabled paper', () => {
  it('keeps the label and the price readable (AA) on every muted button palette', () => {
    for (const [id, p] of Object.entries(ButtonPalettes)) {
      const m = mutedPalette(p);
      expect(contrast(m.ink, m.base), id).toBeGreaterThan(4.5);
      expect(contrast(m.ink, m.top), id).toBeGreaterThan(4.5);
      expect(contrast(m.ink, m.bottom), id).toBeGreaterThan(4.5);
    }
  });

  it('is drained of colour: the muted face is greyer than the live one', () => {
    const spread = (c: number): number => Math.max((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff) - Math.min((c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff);
    for (const p of Object.values(ButtonPalettes)) expect(spread(mutedPalette(p).base)).toBeLessThanOrEqual(spread(p.base));
  });
});

describe('tintToward', () => {
  it('takes text filled in the resting ink to full ink by multiplication', () => {
    const tint = tintToward(Color.inkMid, Color.ink);
    const mul = (c: number, t: number, s: number): number => Math.round((((c >> s) & 0xff) * ((t >> s) & 0xff)) / 255);
    for (const s of [16, 8, 0]) expect(Math.abs(mul(Color.inkMid, tint, s) - ((Color.ink >> s) & 0xff))).toBeLessThanOrEqual(1);
  });

  it('never brightens: a lighter target leaves the channel alone', () => {
    expect(tintToward(0x102030, 0xffffff)).toBe(0xffffff);
  });
});

/** A browser history that records what the controller does to it. */
function fakePort(): HistoryPort & { stack: number; pop(): void; flush(): void; log: string[]; allow: boolean } {
  const timers: { fn: () => void; at: number }[] = [];
  let now = 0;
  let onPop: () => void = () => {};
  const port = {
    stack: 0,
    log: [] as string[],
    allow: true,
    push(): boolean {
      if (!port.allow) return false;
      port.stack++;
      port.log.push('push');
      return true;
    },
    back(): void {
      port.log.push('back');
      // History traversal is asynchronous in a browser: the echo arrives after the call returns.
      timers.push({ fn: () => port.stack > 0 && (port.stack--, onPop()), at: now + 1 });
    },
    listen(fn: () => void): void {
      onPop = fn;
    },
    later(fn: () => void, ms: number): void {
      timers.push({ fn, at: now + ms });
    },
    /** The player presses the system Back button: the browser pops our entry and tells us. */
    pop(): void {
      if (port.stack > 0) {
        port.stack--;
        port.log.push('pop');
        onPop();
      }
    },
    /** Run every pending timer in time order. */
    flush(): void {
      for (let guard = 0; guard < 50 && timers.length > 0; guard++) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers.shift();
        if (!next) break;
        now = Math.max(now, next.at);
        next.fn();
      }
    },
  };
  return port;
}

describe('system Back gesture', () => {
  it('keeps one spare history entry while something is open, and none otherwise', () => {
    const port = fakePort();
    const back = new BackGesture(port);
    expect(port.stack).toBe(0);
    const a = back.hold();
    const b = back.hold();
    expect(port.stack).toBe(1);
    a();
    port.flush();
    expect(port.stack).toBe(1);
    b();
    port.flush();
    expect(port.stack).toBe(0);
    expect(back.active).toBe(false);
  });

  it('runs the handlers in order and stops at the first that takes it', () => {
    const port = fakePort();
    const back = new BackGesture(port);
    const calls: string[] = [];
    let popupOpen = true;
    back.onBack(() => {
      calls.push('popups');
      const had = popupOpen;
      popupOpen = false;
      return had;
    });
    back.onBack(() => {
      calls.push('page');
      return true;
    });
    back.hold();
    port.pop();
    expect(calls).toEqual(['popups']);
    port.pop();
    // The popup refuses a second time (nothing left to close), so the page gets the Back.
    expect(calls).toEqual(['popups', 'popups', 'page']);
  });

  it('pushes the entry again when something is still open after a Back, so the next Back works too', () => {
    const port = fakePort();
    const back = new BackGesture(port);
    back.onBack(() => true);
    back.hold();
    for (let i = 0; i < 4; i++) {
      port.pop();
      expect(port.stack, `after Back ${i + 1}`).toBe(1);
    }
    expect(back.active).toBe(true);
  });

  it('does not treat the echo of its own history.back() as a gesture', () => {
    const port = fakePort();
    const back = new BackGesture(port);
    const handler = vi.fn(() => true);
    back.onBack(handler);
    const release = back.hold();
    release();
    port.flush();
    expect(port.log.filter((l) => l === 'back')).toHaveLength(1);
    expect(handler).not.toHaveBeenCalled();
    expect(port.stack).toBe(0);
  });

  it('waits for a queued popup: closing one and opening the next does not touch the history', () => {
    const port = fakePort();
    const back = new BackGesture(port);
    const first = back.hold();
    first();
    const second = back.hold();
    port.flush();
    expect(port.log).toEqual(['push']);
    expect(port.stack).toBe(1);
    second();
  });

  it('survives a page that may not use its history (a sandboxed frame)', () => {
    const port = fakePort();
    port.allow = false;
    const back = new BackGesture(port);
    const release = back.hold();
    expect(back.active).toBe(false);
    release();
    port.flush();
    expect(port.log).toEqual([]);
  });
});

describe('popup stack', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {}, history: { pushState: () => {}, back: () => {} } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws only the topmost popup and brings the one below back when it closes', async () => {
    const { Popup, popups } = await import('@/ui/Popup');
    const { motion } = await import('@/ui/motion');
    motion.reduced = true;
    class Sheet extends Popup<string> {
      constructor() {
        super({ dismissResult: 'x' });
      }
    }
    const a = new Sheet();
    const b = new Sheet();
    const c = new Sheet();
    void popups.open(a);
    expect(a.visible).toBe(true);
    void popups.open(b);
    expect(a.visible).toBe(false);
    expect(b.visible).toBe(true);
    void popups.open(c);
    expect(b.visible).toBe(false);
    c.close();
    expect(b.visible).toBe(true);
    expect(a.visible).toBe(false);
    b.close();
    expect(a.visible).toBe(true);
    a.close();
    expect(popups.count).toBe(0);
  });

  it('does not shrink a popup that is only padded wide: its 24 px text must stay 24 px', async () => {
    const { Popup, popups } = await import('@/ui/Popup');
    const { motion } = await import('@/ui/motion');
    const { game } = await import('@/core/game');
    motion.reduced = true;
    class Sheet extends Popup<string> {
      constructor(drawnW: number, declaredW: number) {
        super({ dismissResult: 'x' });
        this.body.addChild(new Graphics().rect(-drawnW / 2, -200, drawnW, 400).fill(0xffffff));
        this.setContentSize(declaredW, 500);
      }
    }
    // 680 drawn, declared 760 (the usual "+80" for tape and a close button): fits 720 without scaling.
    const padded = new Sheet(680, 760);
    void popups.open(padded);
    expect(padded.body.scale.x).toBe(1);
    padded.close();
    // Really 800 wide: it has to shrink to the screen, minus the 16 px margin.
    const wide = new Sheet(800, 800);
    void popups.open(wide);
    expect(wide.body.scale.x).toBeCloseTo((game.w - 16) / 800, 5);
    wide.close();
  });
});
