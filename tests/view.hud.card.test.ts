import { describe, expect, it } from 'vitest';
import { FIELD_H } from '@/game/geometry';
import type { BattleLayout } from '@/view/context';
import { overlapArea, placeCard } from '@/view/hud/bubbleMath';
import { bottomRects, topRects, type Rect } from '@/view/hud/layoutMath';

function layout(h: number): BattleLayout {
  const slack = Math.round((h - 168 - 452 - FIELD_H) / 2);
  return { w: 720, h, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 168 + slack, topH: 168, bottomH: 452 };
}

const CARD_W = 640;
const ARROW = 22;

function place(l: BattleLayout, target: Rect, h: number) {
  const panelTop = bottomRects(l).top;
  const bounds: Rect = { x: 0, y: 14, w: l.w, h: l.h - 28 };
  const fit = placeCard({ target, w: CARD_W, h, bounds, arrow: ARROW, panelTop, boardBottom: l.fieldY + FIELD_H });
  return { fit, body: { x: fit.x, y: fit.y, w: CARD_W, h } };
}

describe('where a lesson card goes', () => {
  for (const screen of [1280, 1600]) {
    const l = layout(screen);
    const panelTop = bottomRects(l).top;
    const top = topRects(l);
    const targets: Array<[string, Rect]> = [
      ['a control of the bottom panel (summon)', { x: 210, y: panelTop + 284, w: 300, h: 140 }],
      ['the class chips', { x: 16, y: panelTop + 6, w: 688, h: 96 }],
      ['the laser button', { x: 20, y: panelTop + 190, w: 88, h: 88 }],
      ['the cats on the board', { x: 24, y: l.fieldY + 200, w: 400, h: 150 }],
      ['the sunny cells', { x: 300, y: l.fieldY + 40, w: 300, h: 300 }],
      ['the enemy strip at the top', { x: top.gauge.x, y: top.gauge.y, w: top.gauge.w, h: top.gauge.h }],
      ['the speed button', { x: top.speed.x - 44, y: top.speed.y - 44, w: 88, h: 88 }],
    ];
    for (const [name, target] of targets) {
      it(`${screen}: ${name}: the card never covers what it explains`, () => {
        for (const h of [190, 280]) {
          const { body } = place(l, target, h);
          expect(overlapArea(body, target)).toBe(0);
        }
      });
    }

    it(`${screen}: a lesson about a bottom control lies over the board with its tail down, above the panel`, () => {
      const { fit, body } = place(l, { x: 210, y: panelTop + 284, w: 300, h: 140 }, 280);
      expect(fit.above).toBe(true);
      expect(body.y + body.h + ARROW).toBeLessThanOrEqual(panelTop);
    });

    it(`${screen}: a lesson about the board or the top lies over the sheet, tail up, and leaves the whole board clear`, () => {
      for (const target of [targets[3], targets[4], targets[5], targets[6]] as Array<[string, Rect]>) {
        const { fit, body } = place(l, target[1], 280);
        expect(fit.above).toBe(false);
        // The board's own area is free; only the tail may reach a few px into it.
        expect(body.y).toBeGreaterThanOrEqual(l.fieldY + FIELD_H);
        expect(overlapArea(body, { x: 0, y: l.fieldY, w: l.w, h: FIELD_H })).toBe(0);
      }
    });

    it(`${screen}: a card over the sheet leaves the summon button's top edge alone and stays on the screen`, () => {
      for (const h of [190, 280]) {
        const { body } = place(l, targets[3]![1], h);
        expect(body.y + body.h).toBeLessThanOrEqual(panelTop + 284);
        expect(body.y + body.h).toBeLessThanOrEqual(l.h);
      }
    });

    it(`${screen}: the tail points the way of the target, inside the card`, () => {
      const { fit } = place(l, { x: 560, y: l.fieldY + 10, w: 100, h: 100 }, 280);
      expect(fit.tailX).toBeGreaterThan(CARD_W / 2);
      expect(fit.tailX).toBeLessThanOrEqual(CARD_W - 34);
    });
  }
});
