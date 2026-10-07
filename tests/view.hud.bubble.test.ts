import { describe, expect, it } from 'vitest';
import { FIELD_H } from '@/game/geometry';
import type { BattleLayout } from '@/view/context';
import { BUBBLE_MARGIN, overlapArea, placeBubble, placeCard, settleBubble, type BubbleFit } from '@/view/hud/bubbleMath';
import { bottomRects, type Rect } from '@/view/hud/layoutMath';

const W = 720;
const ARROW = 20;

function layout(h: number, safeTop: number, safeBottom: number): BattleLayout {
  const slack = Math.round((h - 168 - 452 - 624) / 2);
  return { w: W, h, safeTop, safeBottom, fieldX: 0, fieldY: 168 + slack, topH: 168, bottomH: 452 };
}

function boundsOf(l: BattleLayout): Rect {
  return { x: 0, y: l.safeTop + BUBBLE_MARGIN, w: l.w, h: l.h - l.safeBottom - l.safeTop - BUBBLE_MARGIN * 2 };
}

/** Every rule of "on the screen": the body inside the bounds, the tail inside the body, the tail's tip on the target's width and clear of the body. */
function expectSettled(fit: BubbleFit, w: number, h: number, bounds: Rect, target: Rect): void {
  expect(fit.x).toBeGreaterThanOrEqual(bounds.x + BUBBLE_MARGIN - 1e-6);
  expect(fit.x + w).toBeLessThanOrEqual(bounds.x + bounds.w - BUBBLE_MARGIN + 1e-6);
  expect(fit.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
  expect(fit.y + h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-6);
  expect(fit.tailX).toBeGreaterThanOrEqual(0);
  expect(fit.tailX).toBeLessThanOrEqual(w);
  expect(fit.tail).toBeGreaterThanOrEqual(ARROW - 1e-6);
  const tipX = fit.x + fit.tailX;
  expect(tipX).toBeGreaterThanOrEqual(target.x - 1e-6);
  expect(tipX).toBeLessThanOrEqual(target.x + target.w + 1e-6);
  // The tail ends on the target's edge (or, for a lesson, on the point it was asked to), and the body never lies on the target.
  expect(overlapArea({ x: fit.x, y: fit.y, w, h }, target)).toBe(0);
}

describe('one placement for every bubble: it never leaves the screen', () => {
  const screens: Array<[string, BattleLayout]> = [
    ['1280', layout(1280, 0, 0)],
    ['1600', layout(1600, 0, 0)],
    ['1280 with a notch and a home bar', layout(1280, 60, 40)],
  ];
  for (const [name, l] of screens) {
    const bounds = boundsOf(l);
    const t = 88;
    const corners: Array<[string, Rect]> = [
      ['top left', { x: 0, y: l.safeTop, w: t, h: t }],
      ['top right', { x: W - t, y: l.safeTop, w: t, h: t }],
      ['bottom left', { x: 0, y: l.h - l.safeBottom - t, w: t, h: t }],
      ['bottom right', { x: W - t, y: l.h - l.safeBottom - t, w: t, h: t }],
      ['middle of the top edge', { x: W / 2 - t / 2, y: l.safeTop, w: t, h: t }],
      ['middle of the bottom edge', { x: W / 2 - t / 2, y: l.h - l.safeBottom - t, w: t, h: t }],
      ['middle of the screen', { x: W / 2 - t / 2, y: l.h / 2 - t / 2, w: t, h: t }],
    ];
    for (const [where, target] of corners) {
      for (const [w, h] of [[460, 120], [460, 460], [300, 520]] as const) {
        for (const prefer of ['above', 'below'] as const) {
          it(`${name}: a ${w} x ${h} bubble on a target at the ${where}, preferring ${prefer}`, () => {
            const fit = placeBubble({ target, w, h, bounds, arrow: ARROW, prefer, avoid: [] });
            expectSettled(fit, w, h, bounds, target);
          });
        }
      }
    }

    it(`${name}: the root keeps a bubble taller than the room between its tip and the edge on the screen, with a longer tail`, () => {
      // A tip right under the top edge and a tall body: it cannot lie above, so it lies below, on the screen.
      const fit = settleBubble(360, l.safeTop + 30, true, 460, 300, bounds, ARROW);
      expect(fit.ok).toBe(false);
      const below = settleBubble(360, l.safeTop + 30, false, 460, 300, bounds, ARROW);
      expect(below.ok).toBe(true);
      expect(below.y).toBeGreaterThanOrEqual(bounds.y);
    });
  }
});

describe('the lesson and first-encounter cards never leave the screen either', () => {
  const CARD_W = 640;
  for (const [screen, safeTop, safeBottom] of [[1280, 0, 0], [1600, 0, 0], [1280, 60, 40]] as const) {
    const l = layout(screen, safeTop, safeBottom);
    const bounds = boundsOf(l);
    const panelTop = bottomRects(l).top;
    const t = 88;
    const targets: Array<[string, Rect]> = [
      ['the top left corner', { x: 0, y: l.safeTop, w: t, h: t }],
      ['the top right corner', { x: W - t, y: l.safeTop, w: t, h: t }],
      ['the enemy lane under the strip', { x: 150, y: l.safeTop + 4, w: 440, h: 58 }],
      ['the cats on the board', { x: 24, y: l.fieldY + 200, w: 400, h: 150 }],
      ['the sunny cells', { x: 300, y: l.fieldY + 40, w: 300, h: 300 }],
      ['the class chips', { x: 16, y: panelTop + 6, w: 688, h: 96 }],
      ['the summon button', { x: 210, y: panelTop + 284, w: 300, h: 140 }],
      ['the bottom right corner', { x: W - t, y: l.h - l.safeBottom - t, w: t, h: t }],
      ['the bottom left corner', { x: 0, y: l.h - l.safeBottom - t, w: t, h: t }],
    ];
    for (const [name, target] of targets) {
      for (const h of [190, 280, 420]) {
        it(`${screen} (${safeTop}/${safeBottom}): a ${h} px card about ${name} stays inside the screen`, () => {
          const fit = placeCard({ target, w: CARD_W, h, bounds, arrow: 22, panelTop, boardBottom: l.fieldY + FIELD_H });
          expect(fit.x).toBeGreaterThanOrEqual(BUBBLE_MARGIN - 1e-6);
          expect(fit.x + CARD_W).toBeLessThanOrEqual(W - BUBBLE_MARGIN + 1e-6);
          expect(fit.y).toBeGreaterThanOrEqual(bounds.y - 1e-6);
          expect(fit.y + h).toBeLessThanOrEqual(bounds.y + bounds.h + 1e-6);
          expect(fit.tail).toBeGreaterThan(0);
          expect(fit.tailX).toBeLessThanOrEqual(CARD_W);
        });
      }
    }
  }
});
