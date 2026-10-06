import { afterEach, describe, expect, it, vi } from 'vitest';
import { noopLifecycle } from '@/platform/fallback';
import { domPageSource, wireLifecycle, type PageSource } from '@/platform/lifecycle';
import { lifecycleSignals, platform } from '@/platform/registry';
import type { PlatformAdapter } from '@/platform/types';
import { Signal } from '@/platform/util';
import { fakeAdapter, makePauser } from './platformHelpers';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A page whose visibility the test flips. */
function fakePage(hidden = false) {
  const subs = new Set<(hidden: boolean) => void>();
  const page: PageSource = {
    isHidden: () => hidden,
    onChange: (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
  };
  return {
    page,
    set(next: boolean) {
      hidden = next;
      for (const cb of [...subs]) cb(next);
    },
  };
}

/** An adapter with its own pause/resume signal (YouTube, GD, Capacitor) when `own`, silent like Toss otherwise. */
function adapterWith(usesPageVisibility: boolean, own = false) {
  const f = fakeAdapter({ usesPageVisibility });
  const own$ = { pause: new Signal(), resume: new Signal() };
  const adapter: PlatformAdapter = own
    ? { ...f.adapter, lifecycle: { ...noopLifecycle(), onPause: (cb) => own$.pause.on(cb), onResume: (cb) => own$.resume.on(cb) } }
    : f.adapter;
  return { adapter, platformPause: () => own$.pause.emit(), platformResume: () => own$.resume.emit() };
}

function rig(adapter: PlatformAdapter, page: PageSource | null) {
  const p = makePauser();
  const signals = { pause: new Signal(), resume: new Signal() };
  const seen: string[] = [];
  signals.pause.on(() => seen.push('pause'));
  signals.resume.on(() => seen.push('resume'));
  let resumed = 0;
  wireLifecycle(adapter, { pauser: p.pauser, signals, onResumed: () => (resumed += 1), page });
  return { p, seen, resumed: () => resumed };
}

describe('wireLifecycle: platforms that only have the Page Visibility API', () => {
  it('hiding the page pauses, mutes and signals; coming back resumes, signals and recovers pending orders', () => {
    const { adapter } = adapterWith(true); // Toss, CrazyGames, Poki, itch, dev: no own pause/resume
    const page = fakePage();
    const t = rig(adapter, page.page);
    expect(t.seen).toEqual([]);
    page.set(true);
    expect(t.seen).toEqual(['pause']);
    expect(t.p.calls).toEqual(['pause:true', 'mute:true']);
    expect(t.resumed()).toBe(0);
    page.set(false);
    expect(t.seen).toEqual(['pause', 'resume']);
    expect(t.p.calls).toEqual(['pause:true', 'mute:true', 'mute:false', 'pause:false']);
    expect(t.resumed()).toBe(1);
    expect(t.p.depth).toMatchObject({ paused: 0, muted: 0 });
  });

  it('repeated hidden or visible events (visibilitychange then pagehide) count once', () => {
    const page = fakePage();
    const t = rig(adapterWith(true).adapter, page.page);
    page.set(true);
    page.set(true);
    page.set(false);
    page.set(false);
    expect(t.seen).toEqual(['pause', 'resume']);
    expect(t.p.depth).toMatchObject({ paused: 0, muted: 0 });
    expect(t.resumed()).toBe(1);
  });

  it('a page that is already hidden when the platform boots still resumes when it comes back', () => {
    const page = fakePage(true);
    const t = rig(adapterWith(true).adapter, page.page);
    expect(t.seen).toEqual(['pause']);
    page.set(false);
    expect(t.seen).toEqual(['pause', 'resume']);
  });

  it('the page does not matter where the platform forbids the Page Visibility API (YouTube)', () => {
    const page = fakePage();
    const yt = adapterWith(false, true);
    const t = rig(yt.adapter, page.page);
    page.set(true);
    expect(t.seen).toEqual([]);
    yt.platformPause();
    expect(t.seen).toEqual(['pause']);
    page.set(false);
    expect(t.seen).toEqual(['pause']); // only the SDK's onResume resumes
    yt.platformResume();
    expect(t.seen).toEqual(['pause', 'resume']);
    expect(t.resumed()).toBe(1);
  });

  it('the platform signal and the page both hold the pause: the game resumes when the last one lets go', () => {
    const page = fakePage();
    const gd = adapterWith(true, true);
    const t = rig(gd.adapter, page.page);
    gd.platformPause();
    page.set(true);
    gd.platformResume();
    expect(t.seen).toEqual(['pause']); // still hidden
    expect(t.p.depth).toMatchObject({ paused: 1, muted: 1 });
    page.set(false);
    expect(t.seen).toEqual(['pause', 'resume']);
    expect(t.p.depth).toMatchObject({ paused: 0, muted: 0 });
    // a resume nobody paused for is ignored, as before
    gd.platformResume();
    expect(t.seen).toEqual(['pause', 'resume']);
    expect(t.resumed()).toBe(1);
  });

  it('works without a page (node, workers) and survives a page source that throws', () => {
    const { adapter } = adapterWith(true);
    expect(() => rig(adapter, null)).not.toThrow();
    const angry: PageSource = {
      isHidden: () => {
        throw new Error('no document');
      },
      onChange: () => {
        throw new Error('no document');
      },
    };
    expect(() => rig(adapter, angry)).not.toThrow();
  });

  it("reaches what the meta layer subscribes to: platform.lifecycle.onPause / onResume", () => {
    const page = fakePage();
    const p = makePauser();
    const seen: string[] = [];
    const offs = [platform.lifecycle.onPause(() => seen.push('flush')), platform.lifecycle.onResume(() => seen.push('re-anchor clock'))];
    wireLifecycle(adapterWith(true).adapter, { pauser: p.pauser, signals: lifecycleSignals, onResumed: () => undefined, page: page.page });
    page.set(true);
    page.set(false);
    for (const off of offs) off();
    expect(seen).toEqual(['flush', 're-anchor clock']);
  });
});

describe('domPageSource', () => {
  it('is null where there is no document', () => {
    expect(typeof document).toBe('undefined');
    expect(domPageSource()).toBeNull();
  });

  it('maps visibilitychange, pagehide and pageshow to hidden / shown and unsubscribes', () => {
    const listeners = new Map<string, Set<() => void>>();
    const target = {
      addEventListener: (type: string, cb: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(cb);
      },
      removeEventListener: (type: string, cb: () => void) => {
        listeners.get(type)?.delete(cb);
      },
    };
    const doc = { ...target, visibilityState: 'visible' };
    vi.stubGlobal('document', doc);
    vi.stubGlobal('window', { ...target });
    const fire = (type: string): void => listeners.get(type)?.forEach((cb) => cb());

    const src = domPageSource();
    expect(src?.isHidden()).toBe(false);
    const seen: boolean[] = [];
    const off = src?.onChange((hidden) => seen.push(hidden));
    doc.visibilityState = 'hidden';
    expect(src?.isHidden()).toBe(true);
    fire('visibilitychange');
    doc.visibilityState = 'visible';
    fire('visibilitychange');
    fire('pagehide'); // visibilityState can still read 'visible' while pagehide runs
    doc.visibilityState = 'visible';
    fire('pageshow');
    expect(seen).toEqual([true, false, true, false]);
    off?.();
    fire('visibilitychange');
    fire('pagehide');
    expect(seen).toHaveLength(4);
  });
});
