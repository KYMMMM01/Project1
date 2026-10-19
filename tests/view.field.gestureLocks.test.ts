/**
 * Two gestures the tutorial keeps from the field (`BattleContext.locks`, set by the HUD): a tap on the road before the laser's button has been brought in must not
 * fire the laser, and a cat dropped on the sell strip while a lesson holds the clock must not be sold (it springs home with the head-shake of a refused drop).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';

vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/core/haptics', () => ({ haptic: () => undefined }));
vi.mock('@/view/field/rangeRing', () => ({
  RangeRing: class {
    show(): void {}
    hide(): void {}
    update(): void {}
    destroy(): void {}
  },
}));
vi.mock('@/view/field/sellTag', () => ({
  SellTag: class {
    place(): void {}
    hide(): void {}
    update(): void {}
    destroy(): void {}
  },
}));

import { game } from '@/core/game';
import { FIELD_H, FIELD_W, PATH_TOP } from '@/game/geometry';
import { FieldInput } from '@/view/field/input';

interface Inner {
  down(e: unknown): void;
  up(e: unknown): void;
  mode: string;
  pointerId: number;
  dragFrom: number | null;
  pressCell: number;
  view: unknown;
  finishDrag(x: number, y: number): void;
}

function rig() {
  const command = vi.fn(() => null);
  const select = vi.fn();
  const refuse = vi.fn();
  const cancelDrag = vi.fn();
  const locks = { laser: false, sell: false };
  const ctx = { paused: false, lessonHold: false, selected: null, select, command, locks, events: { emit: vi.fn() } };
  const battle = {
    pending: null as unknown,
    phase: 'wave',
    units: [null, null, null, { uid: 5, stats: { range: 1 } }] as unknown[],
    sellValue: () => ({ fish: 0, purr: 0 }),
    laser: { active: false },
    setLaser: vi.fn(() => null),
    sell: vi.fn(() => null),
    drop: vi.fn(() => null),
    dropAction: () => null,
  };
  const input = new FieldInput({ ctx, battle } as never, new Container(), new Container(), new Container(), { cancelDrag, atCell: () => null, refuse } as never, {} as never);
  return { input, inner: input as unknown as Inner, ctx, command, locks, battle, refuse, cancelDrag };
}

const press = (x: number, y: number): unknown => ({ pointerId: 1, global: { x, y } });

describe('the road before the laser button is out', () => {
  beforeEach(() => {
    (game as unknown as { app: unknown }).app = { stage: { on: () => undefined, off: () => undefined } };
  });

  it('fires the laser on a tap on the road when nothing keeps it', () => {
    const r = rig();
    r.inner.down(press(FIELD_W / 2, PATH_TOP));
    expect(r.inner.mode).toBe('laser');
    expect(r.command).toHaveBeenCalledWith('laser', expect.any(Function));
  });

  it('leaves the road alone while the laser has not been brought in: the tap is a tap on the floor, and the laser stays ready', () => {
    const r = rig();
    r.locks.laser = true;
    r.inner.down(press(FIELD_W / 2, PATH_TOP));
    expect(r.inner.mode).toBe('floor');
    expect(r.command).not.toHaveBeenCalled();
    r.inner.up(press(FIELD_W / 2, PATH_TOP));
    expect(r.command).not.toHaveBeenCalled();
    expect(r.ctx.select).toHaveBeenCalledWith(null);
  });
});

describe('the sell strip while a lesson holds the clock', () => {
  beforeEach(() => {
    (game as unknown as { app: unknown }).app = { stage: { on: () => undefined, off: () => undefined } };
  });

  /** A cat in the hand, released over the strip under the board. */
  function release(r: ReturnType<typeof rig>): void {
    r.inner.pointerId = 1;
    r.inner.dragFrom = 3;
    r.inner.view = { uid: 5, x: 0, y: 0, dragging: true, setPressed: vi.fn() };
    r.inner.finishDrag(FIELD_W / 2, FIELD_H + 40);
  }

  it('sells the cat when nothing keeps the strip', () => {
    const r = rig();
    release(r);
    expect(r.command).toHaveBeenCalledWith('sell', expect.any(Function), 3);
    expect(r.refuse).not.toHaveBeenCalled();
  });

  it('does not sell it while a lesson holds the clock: the cat shakes its head and springs home', () => {
    const r = rig();
    r.locks.sell = true;
    release(r);
    expect(r.command).not.toHaveBeenCalled();
    expect(r.refuse).toHaveBeenCalledWith(3);
    expect(r.cancelDrag).toHaveBeenCalled();
  });
});
