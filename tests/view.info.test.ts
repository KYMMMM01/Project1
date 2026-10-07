import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Container } from 'pixi.js';
import { info, INFO_FOR, InfoRule, type InfoContent, type InfoView } from '@/view/info';

describe('the rule of an information bubble', () => {
  it('opens on a tap on its source, closes on a second tap on the same source', () => {
    const r = new InfoRule();
    expect(r.tap('enemy:cucumber')).toBe('open');
    expect(r.isOpen).toBe(true);
    expect(r.tap('enemy:cucumber')).toBe('close');
    expect(r.isOpen).toBe(false);
  });

  it('replaces the bubble of another source instead of stacking a second one', () => {
    const r = new InfoRule();
    r.tap('enemy:cucumber');
    expect(r.tap('toy:fan')).toBe('open');
    expect(r.key).toBe('toy:fan');
    // The first source is a stranger now: tapping it opens it again, it does not close anything.
    expect(r.tap('enemy:cucumber')).toBe('open');
  });

  it('closes on a tap elsewhere', () => {
    const r = new InfoRule();
    r.tap('a');
    expect(r.elsewhere(r.gen)).toBe(true);
    expect(r.isOpen).toBe(false);
    expect(r.elsewhere(r.gen)).toBe(false);
  });

  it('leaves alone a bubble that the very tap overtook (a source opened, replaced or closed one on the way)', () => {
    const r = new InfoRule();
    r.tap('a');
    const since = r.gen;
    r.tap('b');
    expect(r.elsewhere(since)).toBe(false);
    expect(r.key).toBe('b');
    const again = r.gen;
    r.tap('b');
    expect(r.elsewhere(again)).toBe(false);
    expect(r.isOpen).toBe(false);
  });

  it('closes by itself after its time and not before', () => {
    const r = new InfoRule();
    r.tap('a', 3);
    expect(r.update(2.9)).toBe(false);
    expect(r.isOpen).toBe(true);
    expect(r.update(0.2)).toBe(true);
    expect(r.isOpen).toBe(false);
    expect(r.update(10)).toBe(false);
  });

  it('a lesson line is sticky: a tap elsewhere and the clock leave it alone, only its owner closes it', () => {
    const r = new InfoRule();
    r.open('guide', 0, true);
    expect(r.elsewhere(r.gen)).toBe(false);
    expect(r.update(100)).toBe(false);
    expect(r.isOpen).toBe(true);
    expect(r.close()).toBe(true);
  });

  it('a bubble the player asked for stays a few seconds, not for ever', () => {
    expect(INFO_FOR).toBeGreaterThanOrEqual(3);
    expect(INFO_FOR).toBeLessThanOrEqual(8);
  });
});

/** A bubble view that only writes down what it was told. */
class Recorder implements InfoView {
  shown: Array<{ text: string; prefer: string; sticky: boolean }> = [];
  hidden = 0;
  show(_target: Container, content: InfoContent, prefer: 'above' | 'below', sticky: boolean): void {
    this.shown.push({ text: content.text, prefer, sticky });
  }
  hide(): void {
    this.hidden++;
  }
}

describe('the bubbles of the battle, as the HUD, the field and the lessons ask for them', () => {
  let down: (() => void) | null = null;
  const target = {} as Container;
  let view: Recorder;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: () => void) => {
        if (type === 'pointerdown') down = fn;
      },
      removeEventListener: () => {
        down = null;
      },
    });
    view = new Recorder();
    info.bind(view);
  });

  afterEach(() => {
    info.canOpen = null;
    info.bind(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A finger lands: the page's capture listener sees it first, then `source` (if the tap is on one) gets it, then the timer runs. */
  const touch = (source?: () => void): void => {
    down?.();
    source?.();
    vi.runAllTimers();
  };

  it('a tap on an enemy card opens its bubble, the same card again closes it', () => {
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    expect(info.visible).toBe(true);
    expect(view.shown).toHaveLength(1);
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    expect(info.visible).toBe(false);
    expect(view.shown).toHaveLength(1);
    expect(view.hidden).toBe(1);
  });

  it('a tap anywhere else closes it, and a second tap elsewhere closes nothing more', () => {
    touch(() => info.tap('toy:fan', target, { text: 'a' }));
    touch();
    expect(info.visible).toBe(false);
    expect(view.hidden).toBe(1);
    touch();
    expect(view.hidden).toBe(1);
  });

  it('opening a second source replaces the first and the tap is not also "elsewhere" for it', () => {
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    touch(() => info.tap('enemy:dust', target, { text: 'b' }));
    expect(info.visible).toBe(true);
    expect(info.key).toBe('enemy:dust');
    expect(view.shown.map((s) => s.text)).toEqual(['a', 'b']);
  });

  it('a lesson note up has the space: no bubble opens over it', () => {
    info.canOpen = () => false;
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    expect(info.visible).toBe(false);
    expect(view.shown).toHaveLength(0);
  });

  it('closes by itself when its seconds are over (the HUD runs the clock)', () => {
    touch(() => info.tap('sun:3', target, { text: 'a' }));
    info.update(INFO_FOR - 0.5);
    expect(info.visible).toBe(true);
    info.update(1);
    expect(info.visible).toBe(false);
  });

  it('a popup, a lesson or a banner closes it, but not a lesson\'s own sticky line', () => {
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    info.close();
    expect(info.visible).toBe(false);
    info.show('guide', target, { text: 'tap here' }, { sticky: true });
    info.close();
    expect(info.visible).toBe(true);
    touch();
    expect(info.visible).toBe(true);
    info.close(true, 'guide');
    expect(info.visible).toBe(false);
  });

  it('a refusal opens a bubble that a tap anywhere closes, and shows again on the next refusal', () => {
    info.show('summon', target, { text: 'no fish' }, { seconds: 2.6 });
    expect(info.visible).toBe(true);
    touch();
    expect(info.visible).toBe(false);
    info.show('summon', target, { text: 'no fish' }, { seconds: 2.6 });
    info.show('summon', target, { text: 'no fish' }, { seconds: 2.6 });
    expect(view.shown).toHaveLength(3);
  });

  it('unbinding the view closes what is open and stops listening', () => {
    touch(() => info.tap('enemy:cucumber', target, { text: 'a' }));
    info.bind(null);
    expect(info.visible).toBe(false);
    expect(down).toBeNull();
  });
});
