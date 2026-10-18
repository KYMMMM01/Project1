/**
 * A cat in the player's hand that is replaced where it stands (the lucky cat's partner capsule promoted it, or its guardian capsule awakened it)
 * is let go of at once: the finger must not go on carrying a view whose cat is gone (`field/input.ts`, `update`).
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
import { FieldInput } from '@/view/field/input';

interface Inner {
  pointerId: number;
  dragFrom: number | null;
  mode: string;
  view: { uid: number; x: number; y: number; setPressed: ReturnType<typeof vi.fn> } | null;
}

function rig() {
  const emit = vi.fn();
  const select = vi.fn();
  const cancelDrag = vi.fn();
  const ctx = { paused: false, lessonHold: false, selected: null, select, events: { emit } };
  const unit = (uid: number) => ({ uid, stats: { range: 1 } });
  const battle = { pending: null as unknown, phase: 'wave', units: [null, null, null, unit(5)] as Array<ReturnType<typeof unit> | null>, sellValue: () => ({ fish: 0, purr: 0 }), laser: { active: false } };
  const input = new FieldInput({ ctx, battle } as never, new Container(), new Container(), new Container(), { cancelDrag, atCell: () => null } as never, {} as never);
  const inner = input as unknown as Inner;
  const hold = (): void => {
    inner.pointerId = 1;
    inner.dragFrom = 3;
    inner.mode = 'unit';
    inner.view = { uid: 5, x: 0, y: 0, setPressed: vi.fn() };
  };
  return { input, inner, battle, unit, hold, cancelDrag, select, emit };
}

describe('a cat in the hand that was replaced where it stands', () => {
  beforeEach(() => {
    (game as unknown as { app: unknown }).app = { stage: { on: () => undefined, off: () => undefined } };
  });

  it('keeps the drag while the cat on the tile is still the one in the hand', () => {
    const r = rig();
    r.hold();
    r.input.update(1 / 60);
    expect(r.inner.dragFrom).toBe(3);
    expect(r.cancelDrag).not.toHaveBeenCalled();
  });

  it('lets go of the drag when a promotion or an awakening puts another cat (another uid) on the tile', () => {
    const r = rig();
    r.hold();
    r.battle.units[3] = r.unit(9);
    r.input.update(1 / 60);
    expect(r.inner.dragFrom).toBeNull();
    expect(r.inner.pointerId).toBe(-1);
    expect(r.inner.view).toBeNull();
    expect(r.cancelDrag).toHaveBeenCalledTimes(1);
    expect(r.select).toHaveBeenCalledWith(null);
    expect(r.emit).toHaveBeenCalledWith('drag', { from: null, over: -1, sell: false });
  });

  it('lets go when the tile is empty (sold) as well', () => {
    const r = rig();
    r.hold();
    r.battle.units[3] = null;
    r.input.update(1 / 60);
    expect(r.inner.dragFrom).toBeNull();
    expect(r.cancelDrag).toHaveBeenCalledTimes(1);
  });

  it('does not touch a press that has not lifted anything yet (no drag, so nothing to let go of)', () => {
    const r = rig();
    r.hold();
    r.inner.dragFrom = null;
    r.battle.units[3] = r.unit(9);
    r.input.update(1 / 60);
    expect(r.inner.pointerId).toBe(1);
    expect(r.cancelDrag).not.toHaveBeenCalled();
  });
});
