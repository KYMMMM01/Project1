import { describe, expect, it } from 'vitest';
import { FIELD_H } from '@/game/geometry';
import { CLASS_CHIP_H } from '@/ui/classChipMath';
import type { BattleLayout } from '@/view/context';
import { bottomRects, HUD_W, SIDE, type Rect } from '@/view/hud/layoutMath';
import { foldPose, PEEK_BACK, PEEK_BOB, PEEK_DIM, PEEK_FOLD_SCALE, peekBackCentre, peekBackRect, PeekState, type PeekLock } from '@/view/hud/peekMath';
import { computeBattleLayout } from '@/view/layout';

/** The screens the battle runs on: the design size, a tall phone, and a phone with both insets. */
const SCREENS: Array<[string, BattleLayout]> = [
  ['1280', computeBattleLayout(720, 1280, 0, 0)],
  ['1600', computeBattleLayout(720, 1600, 0, 0)],
  ['1280 with insets', computeBattleLayout(720, 1280, 44, 34)],
  ['1600 with insets', computeBattleLayout(720, 1600, 44, 34)],
];

/** What the way back must keep out of: rows of the bottom panel that carry information, as rectangles. */
function panelRows(l: BattleLayout): Record<string, Rect> {
  const b = bottomRects(l);
  const row = (centre: number, h: number): Rect => ({ x: 0, y: b.top + centre - h / 2, w: HUD_W, h });
  return {
    chips: row(b.chipsY, CLASS_CHIP_H),
    // The currency pills and the 84 px odds button share this row.
    currency: row(b.currencyY, 84),
    // The summon button's paper (300 x 140, centred on x 360); its tape stands 12 px above it but only over x 300..390, left of the way back.
    summon: row(b.summonY, 140),
  };
}

const gapBetween = (above: Rect, below: Rect): number => below.y - (above.y + above.h);

describe('where the way back sits', () => {
  for (const [name, l] of SCREENS) {
    it(`is on the tracker row against the right margin, ${name}`, () => {
      const r = peekBackRect(l);
      expect(r.x + r.w).toBe(HUD_W - SIDE);
      expect(r.x).toBeGreaterThanOrEqual(0);
      const b = bottomRects(l);
      expect(Math.abs(peekBackCentre(l).y - (b.top + b.utilY))).toBeLessThanOrEqual(PEEK_BACK.drop);
      expect(r.w).toBe(PEEK_BACK.w);
      expect(r.h).toBe(PEEK_BACK.h);
    });

    it(`keeps the board, the class chips and the currency pills in view, ${name}`, () => {
      const r = peekBackRect(l);
      const rows = panelRows(l);
      // The paper's lip hangs a few px under it, and it rises PEEK_BOB while it bobs.
      const lip = 6;
      const paper: Rect = { x: r.x, y: r.y - PEEK_BOB, w: r.w, h: r.h + PEEK_BOB + lip };
      expect(gapBetween(rows.chips as Rect, paper)).toBeGreaterThanOrEqual(8);
      expect(gapBetween(rows.currency as Rect, paper)).toBeGreaterThanOrEqual(8);
      expect(gapBetween({ x: 0, y: l.fieldY, w: HUD_W, h: FIELD_H }, paper)).toBeGreaterThanOrEqual(8);
      expect(paper.y).toBeGreaterThan(l.safeTop + l.topH);
      expect(gapBetween(paper, rows.summon as Rect)).toBeGreaterThanOrEqual(8);
      expect(r.y + r.h + lip).toBeLessThanOrEqual(l.h - l.safeBottom);
    });
  }
});

describe('the fold', () => {
  const from = { x: 360, y: 640 };
  const to = { x: 586, y: 1060 };

  it('starts as the choice in place: full size, full opacity, the whole dim', () => {
    expect(foldPose(0, from, to)).toEqual({ x: from.x, y: from.y, scale: 1, alpha: 1, dim: 1 });
  });

  it('ends with the choice shrunk into the button, invisible, and the dim lifted to a trace', () => {
    const p = foldPose(1, from, to);
    expect(p.x).toBe(to.x);
    expect(p.y).toBe(to.y);
    expect(p.scale).toBeCloseTo(PEEK_FOLD_SCALE, 10);
    expect(p.alpha).toBe(0);
    expect(p.dim).toBeCloseTo(PEEK_DIM, 10);
  });

  it('moves one way only: it never grows, brightens or re-darkens on the way in', () => {
    let last = foldPose(0, from, to);
    for (let i = 1; i <= 20; i++) {
      const p = foldPose(i / 20, from, to);
      expect(p.scale).toBeLessThanOrEqual(last.scale);
      expect(p.alpha).toBeLessThanOrEqual(last.alpha);
      expect(p.dim).toBeLessThanOrEqual(last.dim);
      expect(p.y).toBeGreaterThanOrEqual(last.y);
      last = p;
    }
  });

  it('stays opaque for the first half, so the sheet is seen travelling and not just gone', () => {
    expect(foldPose(0.4, from, to).alpha).toBe(1);
  });

  it('clamps a tween that overshoots', () => {
    expect(foldPose(-0.2, from, to)).toEqual(foldPose(0, from, to));
    expect(foldPose(1.3, from, to)).toEqual(foldPose(1, from, to));
  });

  it('lifts the dim enough for the board to read at full colour', () => {
    expect(PEEK_DIM).toBeLessThanOrEqual(0.15);
    expect(PEEK_DIM).toBeGreaterThan(0);
  });
});

describe('the toggle state', () => {
  it('starts with the choice up: its own controls are live, the toggle is shown and usable', () => {
    const s = new PeekState();
    expect(s.peeking).toBe(false);
    expect(s.surface).toBe('sheet');
    expect(s.answerable).toBe(true);
    expect(s.allowed).toBe(true);
    expect(s.shown).toBe(true);
  });

  it('peeking hands the taps to the way back and takes them from the choice', () => {
    const s = new PeekState();
    expect(s.peek()).toBe(true);
    expect(s.peeking).toBe(true);
    expect(s.surface).toBe('back');
    expect(s.answerable).toBe(false);
  });

  it('going back restores the choice exactly as the live surface', () => {
    const s = new PeekState();
    s.peek();
    expect(s.back()).toBe(true);
    expect(s.surface).toBe('sheet');
    expect(s.answerable).toBe(true);
  });

  it('peeking twice, or going back twice, changes nothing the second time', () => {
    const s = new PeekState();
    expect(s.back()).toBe(false);
    s.peek();
    expect(s.peek()).toBe(false);
    s.back();
    expect(s.back()).toBe(false);
  });

  it('a lock refuses the fold; the lesson also hides the toggle, the others keep it in place', () => {
    for (const reason of ['lesson', 'deciding', 'opening'] as PeekLock[]) {
      const s = new PeekState();
      s.lock(reason);
      expect(s.peek()).toBe(false);
      expect(s.peeking).toBe(false);
      expect(s.allowed).toBe(false);
      expect(s.shown).toBe(reason !== 'lesson');
      s.unlock(reason);
      expect(s.peek()).toBe(true);
    }
  });

  it('a lock that arrives while the choice is folded unfolds it first: a lock never leaves it hidden', () => {
    const s = new PeekState();
    s.peek();
    expect(s.lock('deciding')).toBe(true);
    expect(s.peeking).toBe(false);
    expect(s.surface).toBe('sheet');
  });

  it('locks nest: the toggle works again only when every reason is gone', () => {
    const s = new PeekState();
    s.lock('opening');
    s.lock('lesson');
    s.unlock('opening');
    expect(s.allowed).toBe(false);
    s.unlock('lesson');
    expect(s.allowed).toBe(true);
  });

  it('setLock is lock and unlock in one call', () => {
    const s = new PeekState();
    s.peek();
    expect(s.setLock('lesson', true)).toBe(true);
    expect(s.peeking).toBe(false);
    expect(s.setLock('lesson', false)).toBe(false);
    expect(s.allowed).toBe(true);
  });

  it('whatever the order of events, exactly one surface is live and a folded choice always has its way back', () => {
    // A small deterministic generator, so a failure names its sequence.
    let seed = 20261009;
    const next = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const reasons: PeekLock[] = ['lesson', 'deciding', 'opening'];
    for (let run = 0; run < 200; run++) {
      const s = new PeekState();
      const log: string[] = [];
      for (let i = 0; i < 40; i++) {
        const r = next();
        const reason = reasons[Math.floor(next() * reasons.length)] as PeekLock;
        if (r < 0.3) {
          s.peek();
          log.push('peek');
        } else if (r < 0.55) {
          s.back();
          log.push('back');
        } else if (r < 0.8) {
          s.lock(reason);
          log.push(`lock ${reason}`);
        } else {
          s.unlock(reason);
          log.push(`unlock ${reason}`);
        }
        const why = log.join(', ');
        // One live surface: the choice's own controls or the way back, never both and never neither.
        expect([s.answerable, s.surface === 'back'].filter(Boolean), why).toHaveLength(1);
        expect(s.peeking, why).toBe(s.surface === 'back');
        // A folded choice is never locked: a lock unfolds it, and a locked state cannot fold.
        if (s.peeking) expect(s.allowed, why).toBe(true);
        // A way forward always exists: from any state one `back()` leaves the choice answerable.
        const probe = new PeekState();
        if (s.peeking) probe.peek();
        probe.back();
        expect(probe.answerable, why).toBe(true);
      }
    }
  });
});
