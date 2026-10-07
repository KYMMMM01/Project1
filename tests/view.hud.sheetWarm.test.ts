import { Container, Graphics, Text } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WarmQueue } from '@/fx/warm';

const drawn = vi.hoisted(() => ({ parts: [] as unknown[] }));
const queue = vi.hoisted(() => ({ q: null as unknown as WarmQueue }));
vi.mock('@/fx', () => ({
  get warm() {
    return queue.q;
  },
  renderOnce: (c: unknown) => void drawn.parts.push(c),
}));

import { partsOf, warmSheets, type SheetMaker } from '@/view/hud/sheetWarm';

/** A container of `n` small containers, each holding one Graphics: 2n + 1 display objects. */
function tree(n: number): Container {
  const root = new Container();
  for (let i = 0; i < n; i++) {
    const row = new Container();
    row.addChild(new Graphics());
    root.addChild(row);
  }
  return root;
}

describe('the parts a sheet is drawn in', () => {
  it('keeps a small tree, a single drawing and an empty container whole', () => {
    const small = tree(3);
    expect(partsOf(small)).toEqual([small]);
    const g = new Graphics();
    expect(partsOf(g)).toEqual([g]);
    const empty = new Container();
    expect(partsOf(empty)).toEqual([empty]);
  });

  it('splits a big tree into its children, in order, and a big child again', () => {
    const root = new Container();
    const a = tree(3);
    const b = tree(12);
    const c = tree(2);
    root.addChild(a, b, c);
    const parts = partsOf(root);
    expect(parts[0]).toBe(a);
    expect(parts.at(-1)).toBe(c);
    // b holds 25 objects: it is split into its rows.
    expect(parts).toHaveLength(2 + 12);
    expect(parts.slice(1, 13)).toEqual(b.children);
  });

  it('never splits a text or a sprite-like drawing from its own children, however many it has', () => {
    const t = new Text({ text: 'x' });
    for (let i = 0; i < 20; i++) t.addChild(new Container());
    expect(partsOf(t)).toEqual([t]);
  });

  it('keeps what holds an object and its mask in one piece, and splits what only holds both somewhere below', () => {
    // A card: the portrait window and the mask that cuts it are siblings, so the card goes whole.
    const card = new Container();
    const window = tree(10);
    const mask = new Graphics();
    window.mask = mask;
    card.addChild(window, mask);
    const root = new Container();
    const other = tree(10);
    root.addChild(other, card);
    const parts = partsOf(root, 8);
    expect(parts).toContain(card);
    expect(parts).not.toContain(window);
    expect(parts).not.toContain(root);
    expect(parts.filter((p) => other.children.includes(p))).toHaveLength(10);
  });

  it('may split what is masked by something outside the tree', () => {
    const root = tree(10);
    root.children[3]!.mask = new Graphics();
    expect(partsOf(root, 8)).toHaveLength(10);
  });

  it('covers every leaf exactly once', () => {
    const root = tree(30);
    const seen = new Set<unknown>();
    const walk = (c: Container): void => {
      seen.add(c);
      c.children.forEach((k) => walk(k as Container));
    };
    const covered = new Set<unknown>();
    for (const p of partsOf(root)) {
      const before = covered.size;
      (function add(c: Container): void {
        covered.add(c);
        c.children.forEach((k) => add(k as Container));
      })(p);
      expect(covered.size).toBeGreaterThan(before);
    }
    walk(root);
    // Everything except the split containers themselves is drawn.
    expect(covered.size).toBe(seen.size - 1);
  });
});

function sheet(parts: number): { popup: SheetMaker['make']; destroyed: () => number } {
  let destroyed = 0;
  return {
    popup: () =>
      ({
        body: tree(parts),
        destroy: () => {
          destroyed++;
        },
      }) as unknown as ReturnType<SheetMaker['make']>,
    destroyed: () => destroyed,
  };
}

function drain(q: WarmQueue, max = 500): void {
  for (let i = 0; i < max && q.pending > 0; i++) q.update(1 / 60);
}

describe('opening the sheets ahead of time', () => {
  beforeEach(() => {
    queue.q = new WarmQueue();
    queue.q.now = () => 0;
    drawn.parts.length = 0;
  });

  it('builds a sheet, draws it part by part, destroys it, and only then builds the next', () => {
    const a = sheet(20);
    const b = sheet(3);
    const order: string[] = [];
    warmSheets('s1', [{ name: 'a', make: () => (order.push('make a'), a.popup()) }, { name: 'b', make: () => (order.push('make b'), b.popup()) }], 3, () => true);
    // Nothing exists before the queue runs.
    expect(order).toEqual([]);
    queue.q.update(1 / 60);
    expect(order).toEqual(['make a']);
    expect(a.destroyed()).toBe(0);
    drain(queue.q);
    expect(order).toEqual(['make a', 'make b']);
    expect(a.destroyed()).toBe(1);
    expect(b.destroyed()).toBe(1);
    expect(drawn.parts.length).toBeGreaterThan(1);
  });

  it('draws each part once and keeps to the queue: no part is drawn before its sheet is built', () => {
    const a = sheet(30);
    warmSheets('s2', [{ name: 'a', make: a.popup }], 3, () => true);
    expect(drawn.parts).toHaveLength(0);
    drain(queue.q);
    expect(new Set(drawn.parts).size).toBe(drawn.parts.length);
    expect(drawn.parts.length).toBe(partsOf(a.popup().body).length);
  });

  it('stops quietly when the battle is gone: nothing is built, and a built sheet is still taken down', () => {
    let alive = true;
    const a = sheet(5);
    const b = sheet(5);
    const made: string[] = [];
    warmSheets('s3', [{ name: 'a', make: () => (made.push('a'), a.popup()) }, { name: 'b', make: () => (made.push('b'), b.popup()) }], 3, () => alive);
    queue.q.update(1 / 60);
    alive = false;
    drain(queue.q);
    expect(made).toEqual(['a']);
    expect(drawn.parts).toHaveLength(0);
    expect(a.destroyed()).toBe(1);
    expect(b.destroyed()).toBe(0);
  });

  it('goes on with the next sheet when one cannot be built', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const b = sheet(4);
    warmSheets(
      's4',
      [
        {
          name: 'broken',
          make: () => {
            throw new Error('no env');
          },
        },
        { name: 'b', make: b.popup },
      ],
      3,
      () => true,
    );
    drain(queue.q);
    expect(b.destroyed()).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('asks again for nothing: a battle has each sheet once', () => {
    const a = sheet(4);
    warmSheets('s5', [{ name: 'a', make: a.popup }], 3, () => true);
    drain(queue.q);
    const parts = drawn.parts.length;
    warmSheets('s5', [{ name: 'a', make: a.popup }], 3, () => true);
    drain(queue.q);
    expect(drawn.parts).toHaveLength(parts);
    expect(a.destroyed()).toBe(1);
  });
});
