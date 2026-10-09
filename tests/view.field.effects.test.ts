import { describe, expect, it, vi } from 'vitest';
import { CELL_ARRIVE_GAP } from '@/fx';
import type { SpecialCellId } from '@/game/api';
import type { EnemyViews } from '@/view/field/enemies';
import { FieldEffects } from '@/view/field/effects';
import type { FieldEnv } from '@/view/field/env';
import type { Projectiles } from '@/view/field/projectiles';

interface Handle {
  alive: boolean;
  stop: () => void;
}

function make(): { fx: FieldEffects; beams: number[]; kind: { id: SpecialCellId }; calls: Array<{ kind: SpecialCellId; delay: number | undefined; cellX: number }>; handles: Handle[] } {
  const beams: number[] = [];
  const kind = { id: 'sun' as SpecialCellId };
  const calls: Array<{ kind: SpecialCellId; delay: number | undefined; cellX: number }> = [];
  const handles: Handle[] = [];
  const env = {
    battle: {
      events: { on: () => () => undefined },
      get sunbeams() {
        return beams;
      },
      get specialCell() {
        return kind.id;
      },
      hazards: [],
      zones: [],
      enemies: [],
      laser: { active: false },
    },
    ctx: { speed: 1, fx: {} },
    ground: {
      specialCell: (rect: { x: number }, id: SpecialCellId, o?: { delay?: number }) => {
        calls.push({ kind: id, delay: o?.delay, cellX: rect.x });
        const h: Handle = { alive: true, stop: vi.fn(() => void (h.alive = false)) };
        handles.push(h);
        return h;
      },
    },
  } as unknown as FieldEnv;
  const fx = new FieldEffects(env, {} as EnemyViews, { castWait: () => 0 } as unknown as Projectiles);
  return { fx, beams, kind, calls, handles };
}

describe('the special cells the field draws', () => {
  it('draws one cell for each the simulation lists, of the chapter\'s kind, the middle of the plus first and the others after it', () => {
    const t = make();
    t.kind.id = 'treat';
    t.beams.push(12, 7, 11, 13, 17);
    t.fx.update(1 / 60);
    expect(t.calls).toHaveLength(5);
    expect(t.calls.every((c) => c.kind === 'treat')).toBe(true);
    expect(t.calls.map((c) => c.delay)).toEqual([0, 1, 2, 3, 4].map((i) => i * CELL_ARRIVE_GAP));
    // The first cell drawn is cell 12, the middle (in the same column as 7 and right of 11, left of 13).
    expect(t.calls[0]?.cellX).toBe(t.calls[1]?.cellX);
    expect(t.calls[0]?.cellX).toBeGreaterThan(t.calls[2]?.cellX ?? 0);
    expect(t.calls[0]?.cellX).toBeLessThan(t.calls[3]?.cellX ?? 0);
  });

  it('leaves cells that stay between two acts alone, lets the old ones go and drops the new ones in from the start of the order', () => {
    const t = make();
    t.beams.push(12, 7, 11, 13, 17);
    t.fx.update(1 / 60);
    const first = [...t.handles];
    t.calls.length = 0;
    t.fx.update(1 / 60);
    expect(t.calls).toHaveLength(0);
    t.beams.length = 0;
    t.beams.push(12, 6, 8, 16, 18);
    t.fx.update(1 / 60);
    expect(first[0]?.alive).toBe(true);
    for (const gone of [1, 2, 3, 4]) expect(first[gone]?.alive).toBe(false);
    expect(t.calls).toHaveLength(4);
    expect(t.calls.map((c) => c.delay)).toEqual([0, 1, 2, 3].map((i) => i * CELL_ARRIVE_GAP));
  });

  it('stops every cell when the field ends', () => {
    const t = make();
    t.beams.push(12, 7);
    t.fx.update(1 / 60);
    t.fx.destroy();
    expect(t.handles.every((h) => !h.alive)).toBe(true);
  });
});
