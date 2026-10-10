import { describe, expect, it } from 'vitest';
import { spotWindow, type Rect } from '@/view/hud/layoutMath';
import { LAY_AGAIN, MISSING_LIMIT, SETTLE_LIMIT, SETTLE_MEASURES, shift, SpotSettle, STILL, windowMoved, type SpotPlan } from '@/view/hud/spotMath';

const SCREEN = { w: 720, h: 1280 };
const NONE: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** The rectangle of a control of `w x h` centred on (cx, cy). */
const around = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h });

/** What a control that pops in measures as, one value per measure (0.1 s apart): the scale of the pop (0.32 s, overshoot) and the rest after it. */
const POP = [0.3, 0.72, 1.08, 1.03, 1, 1, 1, 1, 1, 1];
const popRects = (cx = 412, cy = 1290): Rect[] => POP.map((s) => around(cx, cy, 192 * s, 120 * s));

const plans = (settle: SpotSettle, rects: readonly Rect[]): SpotPlan[] => rects.map((r) => settle.step(r));

/**
 * What the lessons did before: the window kept still only while the control's centre moved no more than half a pixel and its size no more than
 * two grid steps, and the note and the paw were laid afresh at every change of the window (the key of the last paint).
 */
function oldLays(rects: readonly Rect[]): number {
  let hole: Rect = NONE;
  let key = '';
  let lays = 0;
  for (const r of rects) {
    const next = spotWindow(r, 18, 12, SCREEN);
    const still = hole.w > 0 && Math.abs(next.x + next.w / 2 - (hole.x + hole.w / 2)) <= 0.5 && Math.abs(next.y + next.h / 2 - (hole.y + hole.h / 2)) <= 0.5
      && Math.abs(next.w - hole.w) <= 24 && Math.abs(next.h - hole.h) <= 24;
    if (!still) hole = next;
    const k = `${hole.x}|${hole.y}|${hole.w}|${hole.h}`;
    if (k !== key) {
      key = k;
      lays++;
    }
  }
  return lays;
}

describe('how far a lit target has moved', () => {
  it('is the largest change of centre or size', () => {
    const a = around(100, 100, 80, 40);
    expect(shift(a, a)).toBe(0);
    expect(shift(a, around(130, 100, 80, 40))).toBeCloseTo(30);
    expect(shift(a, around(100, 100, 120, 40))).toBeCloseTo(40);
    expect(shift(a, around(104, 90, 80, 40))).toBeCloseTo(10);
  });

  it('draws the window again only for a move of half a pixel or more', () => {
    const a = around(100, 100, 80, 40);
    expect(windowMoved(a, around(100.2, 100, 80, 40))).toBe(false);
    expect(windowMoved(a, around(100.6, 100, 80, 40))).toBe(true);
  });
});

describe('when a lesson lays its note and its paw', () => {
  it('waits for a target that does not move for a few measures, then lays once and only follows after', () => {
    const settle = new SpotSettle();
    const r = around(360, 1000, 300, 120);
    const out = plans(settle, [r, r, r, r, r]);
    expect(out.slice(0, SETTLE_MEASURES)).toEqual(Array.from({ length: SETTLE_MEASURES }, () => 'wait'));
    expect(out.slice(SETTLE_MEASURES)).toEqual(['lay', 'follow', 'follow']);
    expect(settle.at).toEqual(r);
  });

  it('lays a control that pops in once, where it comes to rest (it used to be laid again and again while it grew)', () => {
    const rects = popRects();
    const settle = new SpotSettle();
    const out = plans(settle, rects);
    expect(out.filter((p) => p === 'lay')).toHaveLength(1);
    const at = out.indexOf('lay');
    // not while the pop was still going on
    expect(at).toBeGreaterThanOrEqual(POP.indexOf(1));
    expect(shift(settle.at as Rect, rects.at(-1) as Rect)).toBeLessThan(STILL);
    // before the fix the same measurements laid the note afresh at least three times
    expect(oldLays(rects)).toBeGreaterThanOrEqual(3);
  });

  it('lays a target that never rests after a few measures, once, and does not follow it with the note', () => {
    const settle = new SpotSettle();
    const rects: Rect[] = [];
    for (let i = 0; i < SETTLE_LIMIT + 6; i++) rects.push(around(360 + (i % 2 === 0 ? 0 : 6), 1000, 300, 120));
    const out = plans(settle, rects);
    expect(out.filter((p) => p === 'lay')).toHaveLength(1);
    expect(out.indexOf('lay')).toBe(SETTLE_LIMIT - 1);
    expect(out.slice(SETTLE_LIMIT).every((p) => p === 'follow')).toBe(true);
  });

  it('keeps the note where it is for a small move, and lays it again for a far one once the target rests', () => {
    const settle = new SpotSettle();
    const a = around(360, 1000, 300, 120);
    const near = around(360 + LAY_AGAIN - 10, 1000, 300, 120);
    const far = around(360 + LAY_AGAIN + 40, 1000, 300, 120);
    plans(settle, [a, a, a]);
    expect(plans(settle, [near, near, near])).toEqual(['follow', 'follow', 'follow']);
    // far: it follows while it is still moving, and is laid again after it has rested for the settling measures
    expect(plans(settle, [far, far, far, far])).toEqual(['follow', 'follow', 'lay', 'follow']);
    expect(settle.at).toEqual(far);
  });

  it('lays at the very next measure after the note was taken away for a moment, when the target has not moved', () => {
    const settle = new SpotSettle();
    const r = around(360, 1000, 300, 120);
    plans(settle, [r, r, r]);
    settle.suspend();
    expect(settle.at).toBeNull();
    expect(settle.step(r)).toBe('lay');
    // a lesson that has just begun has to settle first
    settle.reset();
    expect(plans(settle, [r, r, r])).toEqual(['wait', 'wait', 'lay']);
  });

  it('keeps everything for a blink of the target and sends the note away only when it is gone for good', () => {
    const settle = new SpotSettle();
    const r = around(360, 1000, 300, 120);
    plans(settle, [r, r, r]);
    const blink = plans(settle, [NONE, NONE, r, r]);
    expect(blink).toEqual(['keep', 'keep', 'follow', 'follow']);
    expect(settle.at).toEqual(r);
    const gone = plans(settle, Array.from({ length: MISSING_LIMIT }, () => NONE));
    expect(gone.slice(0, MISSING_LIMIT - 1).every((p) => p === 'keep')).toBe(true);
    expect(gone.at(-1)).toBe('clear');
    expect(settle.at).toBeNull();
    // and it settles afresh when the target comes back
    expect(plans(settle, [r, r, r])).toEqual(['wait', 'wait', 'lay']);
  });

  it('has nothing to clear while nothing was laid', () => {
    const settle = new SpotSettle();
    expect(settle.step(NONE)).toBe('clear');
  });
});
