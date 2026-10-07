/**
 * The sheets a battle opens on a tap (the pause menu, a class sheet, the pick of three) cost 50 to 110 ms the first time (their glyphs, paper and
 * shaders are made on the spot) and a third of that the second time. The warm-up queue (src/fx/warm.ts) opens each of them once ahead of time, out
 * of sight: it builds the sheet, draws it part by part into a target nobody sees (a part is a few display objects, so a piece is a few ms) and
 * destroys it. The sheet that the player opens then finds everything cached.
 */
import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { renderOnce, warm } from '@/fx';
import type { Popup } from '@/ui';

/** Display objects one drawn part may hold. */
const PART_OBJECTS = 14;
/** What the pieces cost, as the queue is told (ms): building a sheet, drawing a part of it, taking it down. */
const BUILD_MS = 8;
const PART_MS = 4;
const END_MS = 1;

function count(c: Container): number {
  let n = 1;
  for (const k of c.children) n += count(k);
  return n;
}

/** Every object at or under `c` that a mask hides. */
function maskedIn(c: Container, out: Container[] = []): Container[] {
  if (c.mask) out.push(c);
  for (const k of c.children) maskedIn(k, out);
  return out;
}

/** Whether `node` is `root` or lies under it. */
function within(root: Container, node: Container): boolean {
  for (let p: Container | null = node; p; p = p.parent) if (p === root) return true;
  return false;
}

/** Whether drawing the children of `c` one by one would part an object from its mask (a mask is drawn with what it hides, or not at all). */
function partsMask(c: Container): boolean {
  for (const child of c.children) {
    for (const hidden of maskedIn(child)) {
      const mask = hidden.mask;
      if (mask instanceof Container && within(c, mask) && !within(child, mask)) return true;
    }
  }
  return false;
}

/**
 * The parts a display tree is drawn in, in tree order: a container goes in one piece when it holds few objects (or is itself one drawing, or holds
 * whose children could not be drawn apart from their masks), otherwise each of its children is looked at in turn.
 */
export function partsOf(root: Container, limit = PART_OBJECTS): Container[] {
  const out: Container[] = [];
  const walk = (c: Container): void => {
    const one = c instanceof Graphics || c instanceof Text || c instanceof Sprite;
    if (c.children.length === 0 || one || count(c) <= limit || partsMask(c)) out.push(c);
    else for (const k of c.children) walk(k);
  };
  walk(root);
  return out;
}

export interface SheetMaker {
  /** Names the sheet in the queue's keys. */
  name: string;
  make: () => Popup<unknown>;
}

/**
 * Open each sheet once, out of sight, one after the other: its pieces are asked for when its predecessor is gone, so at most one sheet exists
 * ahead of time. `key` tells one battle's pieces from another's (the queue remembers what has run), `alive` says whether the battle still wants them.
 */
export function warmSheets(key: string, makers: readonly SheetMaker[], prio: number, alive: () => boolean): void {
  const step = (i: number): void => {
    const maker = makers[i];
    if (!maker) return;
    const base = `${key}:${maker.name}`;
    let sheet: Popup<unknown> | null = null;
    warm.request(`${base}:build`, prio, BUILD_MS, () => {
      if (!alive()) return;
      try {
        sheet = maker.make();
      } catch (err) {
        console.warn(`[warm] sheet "${maker.name}" could not be built`, err);
        step(i + 1);
        return;
      }
      partsOf(sheet.body).forEach((part, n) =>
        warm.request(`${base}:${n}`, prio, PART_MS, () => {
          if (alive() && !part.destroyed) renderOnce(part);
        }),
      );
      // Behind the parts asked for just now, whatever else waits at this priority.
      warm.request(`${base}:end`, prio, END_MS, () => {
        sheet?.destroy({ children: true });
        sheet = null;
        step(i + 1);
      });
    });
  };
  step(0);
}
