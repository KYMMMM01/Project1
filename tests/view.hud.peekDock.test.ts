import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the dock asks of the kit, faked just far enough to drive it by hand: tweens are held until the test finishes them. */
const kit = vi.hoisted(() => ({
  reduced: false,
  tweens: new Map<object, { onUpdate?: (e: number) => void; onComplete?: () => void; repeat?: number }>(),
  plays: [] as string[],
}));

vi.mock('@/audio', () => ({ audio: { play: (id: string) => void kit.plays.push(id) } }));
vi.mock('@/core/i18n', () => ({ t: (k: string) => k }));
vi.mock('@/ui', async () => {
  const { Container } = await import('pixi.js');
  class Button extends Container {
    tap: (() => void) | null = null;
    lift = 0;
    shines = 0;
    readonly boxW: number;
    constructor(readonly opts: { label: string; icon: string; width: number }) {
      super();
      this.boxW = opts.width;
    }
    onTap(fn: () => void): this {
      this.tap = fn;
      return this;
    }
    setLift(px: number): this {
      this.lift = px;
      return this;
    }
    shine(): this {
      this.shines++;
      return this;
    }
  }
  class TweenBag {
    runKeyed(key: object, opts: { onUpdate?: (e: number) => void; onComplete?: () => void; repeat?: number }): void {
      kit.tweens.set(key, opts);
    }
    killKeyed(key: object): void {
      kit.tweens.delete(key);
    }
    killAll(): void {
      kit.tweens.clear();
    }
  }
  return {
    Button,
    TweenBag,
    uiLabel: () => ({ width: 90, destroy: () => undefined }),
    motion: {
      get reduced(): boolean {
        return kit.reduced;
      },
    },
  };
});

import { PeekDock, type PeekHost } from '../src/view/hud/PeekDock';
import { peekBackCentre } from '../src/view/hud/peekMath';
import { computeBattleLayout } from '../src/view/layout';

interface FakeButton extends Container {
  tap: () => void;
  lift: number;
  shines: number;
}

function setup(): { dock: PeekDock; calls: Array<{ k: number; to: { x: number; y: number } }>; live: boolean[]; layout: { l: ReturnType<typeof computeBattleLayout> } } {
  const layout = { l: computeBattleLayout(720, 1280, 0, 0) };
  const calls: Array<{ k: number; to: { x: number; y: number } }> = [];
  const live: boolean[] = [];
  const host: PeekHost = {
    layout: () => layout.l,
    fold: (k, to) => void calls.push({ k, to }),
    live: (on) => void live.push(on),
  };
  return { dock: new PeekDock(host), calls, live, layout };
}

/** Run the fold's tween to its end, in `steps` equal steps (an eased value per step). */
function finish(dock: PeekDock, steps = 4): void {
  const tw = kit.tweens.get(dock);
  if (!tw) return;
  for (let i = 1; i <= steps; i++) tw.onUpdate?.(i / steps);
  tw.onComplete?.();
  kit.tweens.delete(dock);
}

const toggleOf = (dock: PeekDock): FakeButton => dock.toggle() as unknown as FakeButton;
const way = (dock: PeekDock): FakeButton => dock.layer.children[1] as FakeButton;
const shield = (dock: PeekDock): Container => dock.layer.children[0] as Container;

describe('the peek dock', () => {
  beforeEach(() => {
    kit.reduced = false;
    kit.tweens.clear();
    kit.plays.length = 0;
  });

  it('is idle at the start: nothing on screen, the choice in place', () => {
    const { dock, calls } = setup();
    expect(dock.layer.visible).toBe(false);
    expect(way(dock).visible).toBe(false);
    expect(dock.peeking).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('builds the toggle with its eye and its words, shown unless a lesson is on', () => {
    const { dock } = setup();
    const btn = toggleOf(dock);
    expect(btn.visible).toBe(true);
    expect((btn as unknown as { opts: { label: string; icon: string } }).opts).toMatchObject({ label: 'hud.peek.look', icon: 'eye' });
    dock.setLock('lesson', true);
    expect(btn.visible).toBe(false);
    dock.setLock('lesson', false);
    expect(btn.visible).toBe(true);
  });

  it('folding: the way back appears at once, the choice stops taking taps, the fold runs to 1 and the way back bobs', () => {
    const { dock, calls, live } = setup();
    const btn = toggleOf(dock);
    btn.tap();
    expect(dock.peeking).toBe(true);
    expect(dock.layer.visible).toBe(true);
    expect(way(dock).visible).toBe(true);
    expect(live.at(-1)).toBe(false);
    expect(kit.plays).toEqual(['whoosh']);
    finish(dock);
    expect(calls.at(-1)?.k).toBe(1);
    expect(calls.map((c) => c.k)).toEqual([...calls.map((c) => c.k)].sort((a, b) => a - b));
    // The bob is a loop on the way back.
    expect(kit.tweens.get(way(dock))?.repeat).toBe(-1);
    expect(dock.layer.visible).toBe(true);
  });

  it('the choice is folded into the way-back button, wherever the screen puts it', () => {
    const { dock, calls, layout } = setup();
    toggleOf(dock).tap();
    finish(dock);
    expect(calls.at(-1)?.to).toEqual(peekBackCentre(layout.l));
    expect(way(dock).position.x).toBe(0);
    dock.layout();
    expect(way(dock).position.x).toBe(peekBackCentre(layout.l).x);
    expect(way(dock).position.y).toBe(peekBackCentre(layout.l).y);
  });

  it('the way back unfolds it: the choice is live again, nothing is left on screen, the bob is gone', () => {
    const { dock, calls, live } = setup();
    toggleOf(dock).tap();
    finish(dock);
    way(dock).tap();
    expect(dock.peeking).toBe(false);
    expect(way(dock).visible).toBe(false);
    expect(kit.tweens.get(way(dock))).toBeUndefined();
    finish(dock);
    expect(calls.at(-1)?.k).toBe(0);
    expect(live.at(-1)).toBe(true);
    expect(dock.layer.visible).toBe(false);
  });

  it('a tap on the board while folded is swallowed by the shield and nudges the way back', () => {
    const { dock } = setup();
    toggleOf(dock).tap();
    finish(dock);
    expect(shield(dock).eventMode).toBe('static');
    shield(dock).emit('pointertap', {} as never);
    expect(way(dock).shines).toBe(1);
  });

  it('the shield covers the whole screen, and follows a resize', () => {
    const { dock, layout } = setup();
    dock.layout();
    expect(shield(dock).hitArea).toMatchObject({ x: 0, y: 0, width: 720, height: 1280 });
    layout.l = computeBattleLayout(720, 1600, 0, 0);
    dock.layout();
    expect(shield(dock).hitArea).toMatchObject({ x: 0, y: 0, width: 720, height: 1600 });
  });

  it('a resize while folded re-folds at 1 into the way back at its new place; at rest it leaves the choice alone', () => {
    const { dock, calls, layout } = setup();
    dock.layout();
    expect(calls).toHaveLength(0);
    toggleOf(dock).tap();
    finish(dock);
    layout.l = computeBattleLayout(720, 1600, 0, 0);
    dock.layout();
    expect(calls.at(-1)).toEqual({ k: 1, to: peekBackCentre(layout.l) });
    expect(dock.peeking).toBe(true);
    expect(way(dock).visible).toBe(true);
  });

  it('a lesson that starts while the choice is folded brings it back', () => {
    const { dock, calls, live } = setup();
    toggleOf(dock).tap();
    finish(dock);
    dock.setLock('lesson', true);
    expect(dock.peeking).toBe(false);
    expect(way(dock).visible).toBe(false);
    finish(dock);
    expect(calls.at(-1)?.k).toBe(0);
    expect(live.at(-1)).toBe(true);
  });

  it('while locked the toggle does nothing (the lesson, an opening sheet, an answer on its way)', () => {
    for (const reason of ['lesson', 'opening', 'deciding'] as const) {
      const { dock, calls } = setup();
      const btn = toggleOf(dock);
      dock.setLock(reason, true);
      btn.tap();
      expect(dock.peeking).toBe(false);
      expect(dock.layer.visible).toBe(false);
      expect(calls).toHaveLength(0);
    }
  });

  it('reset, as the choice is answered from outside, puts everything at rest at once, even in the middle of a fold', () => {
    const { dock, calls, live } = setup();
    toggleOf(dock).tap();
    kit.tweens.get(dock)?.onUpdate?.(0.5);
    dock.reset();
    expect(dock.peeking).toBe(false);
    expect(kit.tweens.size).toBe(0);
    expect(calls.at(-1)?.k).toBe(0);
    expect(live.at(-1)).toBe(true);
    expect(dock.layer.visible).toBe(false);
    expect(way(dock).visible).toBe(false);
  });

  it('reset also lifts the locks of an answer that never came back, so the next offer can be folded', () => {
    const { dock } = setup();
    const btn = toggleOf(dock);
    dock.setLock('deciding', true);
    dock.setLock('opening', true);
    dock.setLock('lesson', true);
    dock.reset();
    dock.setLock('lesson', false);
    btn.tap();
    expect(dock.peeking).toBe(true);
  });

  it('with reduced motion the fold and the unfold are instant and the way back does not bob', () => {
    kit.reduced = true;
    const { dock, calls } = setup();
    toggleOf(dock).tap();
    expect(calls.at(-1)?.k).toBe(1);
    expect(kit.tweens.size).toBe(0);
    way(dock).tap();
    expect(calls.at(-1)?.k).toBe(0);
    expect(dock.layer.visible).toBe(false);
  });

  it('folding again right after unfolding starts from where the choice is, not from the rest pose', () => {
    const { dock, calls } = setup();
    const btn = toggleOf(dock);
    btn.tap();
    finish(dock);
    way(dock).tap();
    kit.tweens.get(dock)?.onUpdate?.(0.5);
    expect(calls.at(-1)?.k).toBeCloseTo(0.5, 5);
    btn.tap();
    kit.tweens.get(dock)?.onUpdate?.(0);
    expect(calls.at(-1)?.k).toBeCloseTo(0.5, 5);
    finish(dock);
    expect(calls.at(-1)?.k).toBe(1);
  });

  it('destroying it stops every tween and takes its layer out', () => {
    const { dock } = setup();
    toggleOf(dock).tap();
    dock.destroy();
    expect(kit.tweens.size).toBe(0);
    expect(dock.layer.destroyed).toBe(true);
  });
});
