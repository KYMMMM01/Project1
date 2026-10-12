import { describe, expect, it } from 'vitest';
import {
  buttonPad,
  buttonWidthFor,
  planStrip,
  splitButtons,
  STRIP_BAR_H,
  STRIP_BORDER,
  STRIP_BOTTOM,
  STRIP_CLAIM_SHARE,
  STRIP_GAP_BAR,
  STRIP_GAP_X,
  STRIP_GAP_Y,
  STRIP_PLATE,
  STRIP_SIDE,
  STRIP_TOP,
  type Rect,
  type StripMeasure,
} from '@/screens/missions/stripLayout';

const W = 672;
const INNER = W - STRIP_SIDE * 2;
const BTN_BOX_H = 93;

/** A strip as measured: widths of the pieces the way the font draws them in Korean and in English. */
function measure(over: Partial<StripMeasure> = {}): StripMeasure {
  return { w: W, titleW: 198, titleH: 62, timerW: 310, timerH: 52, rewardW: 206, rewardH: 52, claimW: 203, oddsW: 190, buttonH: BTN_BOX_H, ...over };
}

type Part = 'title' | 'timer' | 'bar' | 'plate' | 'reward' | 'claim' | 'odds';
const PARTS: readonly Part[] = ['title', 'timer', 'bar', 'plate', 'reward', 'claim', 'odds'];

/** Clear distance between two rects along the axis that separates them (negative when they overlap). */
function gap(a: Rect, b: Rect): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

/** The parts that really exist on the card (a card without a timer has no timer rect to speak of). */
function present(m: StripMeasure): Part[] {
  return PARTS.filter((n) => n !== 'timer' || m.timerW > 0);
}

/** Widths seen in the two languages and in rewards from one chip to a row too long for the card. */
const TITLES = [90, 198, 262, 400];
const TIMERS = [0, 310];
const REWARDS = [92, 206, 346, 464, 465, 560, 608, 700, 1200];
const CLAIMS = [150, 203, 260, 420];
const ODDS = [130, 190, 240, 330];

function* grid(): Generator<StripMeasure> {
  for (const titleW of TITLES) {
    for (const timerW of TIMERS) {
      for (const rewardW of REWARDS) {
        for (const claimW of CLAIMS) {
          for (const oddsW of ODDS) {
            yield measure({ titleW, titleH: 62, timerW, timerH: timerW > 0 ? 52 : 0, rewardW, claimW, oddsW });
          }
        }
      }
    }
  }
}

describe('chest card layout: parts never touch', () => {
  it('keeps every pair of parts at least the bar-to-reward gap apart, for every width in the grid', () => {
    let n = 0;
    for (const m of grid()) {
      const p = planStrip(m);
      const names = present(m);
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = p[names[i] as Part] as Rect;
          const b = p[names[j] as Part] as Rect;
          expect(gap(a, b), `${names[i]} / ${names[j]} for ${JSON.stringify(m)}`).toBeGreaterThanOrEqual(STRIP_GAP_BAR - 1e-6);
        }
      }
      n++;
    }
    expect(n).toBe(TITLES.length * TIMERS.length * REWARDS.length * CLAIMS.length * ODDS.length);
  });

  it('keeps every part inside the card gutters and above the bottom border', () => {
    for (const m of grid()) {
      const p = planStrip(m);
      for (const name of present(m)) {
        const r = p[name] as Rect;
        expect(r.x, `${name} left`).toBeGreaterThanOrEqual(STRIP_SIDE - 1e-6);
        // A reward row wider than the card is scaled down to the room it has, so even that one stays inside.
        expect(r.x + r.w, `${name} right`).toBeLessThanOrEqual(W - STRIP_SIDE + 1e-6);
        expect(r.y, `${name} top`).toBeGreaterThanOrEqual(STRIP_TOP - 1e-6);
        expect(r.y + r.h + STRIP_BORDER + STRIP_BOTTOM, `${name} bottom`).toBeLessThanOrEqual(p.h + 1e-6);
      }
    }
  });

  it('puts the title at the left and the timer at the right edge of the same row', () => {
    const p = planStrip(measure());
    expect(p.title.x).toBe(STRIP_SIDE);
    expect(p.timer.x + p.timer.w).toBe(W - STRIP_SIDE);
    expect(p.title.y + p.title.h / 2).toBeCloseTo(p.timer.y + p.timer.h / 2, 6);
    expect(p.title.y).toBeGreaterThanOrEqual(STRIP_TOP);
  });

  it('squeezes a title that is too long into what the timer leaves, and lets it run when there is no timer', () => {
    const long = planStrip(measure({ titleW: 500 }));
    expect(long.title.w).toBe(INNER - 310 - STRIP_GAP_X);
    expect(long.title.x + long.title.w + STRIP_GAP_X).toBeLessThanOrEqual(long.timer.x + 1e-6);
    const free = planStrip(measure({ titleW: 500, timerW: 0, timerH: 0 }));
    expect(free.title.w).toBe(500);
    expect(planStrip(measure({ titleW: 800, timerW: 0, timerH: 0 })).title.w).toBe(INNER);
  });
});

describe('chest card layout: the reward', () => {
  it('sits under the bar, beside the chest plate, while it fits there', () => {
    const colW = INNER - STRIP_PLATE - STRIP_GAP_X;
    const p = planStrip(measure({ rewardW: colW }));
    expect(p.rewardBeside).toBe(true);
    expect(p.reward.x).toBe(STRIP_SIDE);
    expect(p.reward.y).toBeGreaterThanOrEqual(p.bar.y + p.bar.h + STRIP_GAP_BAR - 1e-6);
    expect(p.reward.x + p.reward.w + STRIP_GAP_X).toBeLessThanOrEqual(p.plate.x + 1e-6);
    expect(p.bar.w).toBe(colW);
    expect(p.rewardScale).toBe(1);
  });

  it('drops to a row of its own under the bar and the plate when it is too wide to sit beside the plate', () => {
    const colW = INNER - STRIP_PLATE - STRIP_GAP_X;
    const p = planStrip(measure({ rewardW: colW + 1 }));
    expect(p.rewardBeside).toBe(false);
    expect(p.reward.y).toBeGreaterThanOrEqual(p.plate.y + p.plate.h + STRIP_GAP_BAR - 1e-6);
    expect(p.rewardScale).toBe(1);
    // The bar keeps its place at the plate's side and is centred on it.
    expect(p.bar.y + p.bar.h / 2).toBeCloseTo(p.plate.y + p.plate.h / 2, 6);
  });

  it('scales a row wider than the card down to the card, and not otherwise', () => {
    expect(planStrip(measure({ rewardW: INNER })).rewardScale).toBe(1);
    const p = planStrip(measure({ rewardW: INNER * 2, rewardH: 60 }));
    expect(p.rewardScale).toBeCloseTo(0.5, 6);
    expect(p.reward.w).toBeCloseTo(INNER, 6);
    expect(p.reward.h).toBeCloseTo(30, 6);
  });

  it('grows the card only when the reward leaves the plate side', () => {
    const base = planStrip(measure({ rewardW: 92 })).h;
    expect(planStrip(measure({ rewardW: 464 })).h).toBe(base);
    const wide = planStrip(measure({ rewardW: 465 })).h;
    expect(wide).toBeGreaterThan(base);
    expect(planStrip(measure({ rewardW: 560 })).h).toBe(wide);
  });

  it('holds three chips of the largest amounts the chests pay beside the plate', () => {
    // sticker 52 + 8 + an amount of up to 5 digits and a comma at 26 px (about 84), three of them 16 apart.
    const chip = 52 + 8 + 84;
    const three = chip * 3 + STRIP_GAP_X * 2;
    expect(planStrip(measure({ rewardW: three })).rewardBeside).toBe(true);
  });
});

describe('chest card layout: the buttons', () => {
  it('sits Claim and "See odds" side by side on a row of their own that spans the card', () => {
    const p = planStrip(measure());
    expect(p.claim.x).toBe(STRIP_SIDE);
    expect(p.odds.x).toBeCloseTo(p.claim.x + p.claim.w + STRIP_GAP_X, 6);
    expect(p.odds.x + p.odds.w).toBeCloseTo(W - STRIP_SIDE, 6);
    expect(p.claim.y).toBe(p.odds.y);
    expect(p.claim.y).toBeGreaterThanOrEqual(p.reward.y + p.reward.h + STRIP_GAP_Y - 1e-6);
    expect(p.claim.y).toBeGreaterThanOrEqual(p.plate.y + p.plate.h + STRIP_GAP_Y - 1e-6);
  });

  it('ends the card a border and an even margin under the lowest button', () => {
    const p = planStrip(measure());
    expect(p.h).toBe(p.claim.y + BTN_BOX_H + STRIP_BORDER + STRIP_BOTTOM);
  });

  it('gives Claim the larger share when both labels are short, and each button at least its own label', () => {
    const r = splitButtons(INNER, STRIP_GAP_X, 160, 160);
    expect(r.claim + r.odds + STRIP_GAP_X).toBeCloseTo(INNER, 6);
    expect(r.claim / (INNER - STRIP_GAP_X)).toBeCloseTo(STRIP_CLAIM_SHARE, 6);
    expect(r.claim).toBeGreaterThan(r.odds);
  });

  it('lets a long label take what it needs from the other button, which keeps its own minimum', () => {
    const longOdds = splitButtons(INNER, STRIP_GAP_X, 160, 400);
    expect(longOdds.odds).toBe(400);
    expect(longOdds.claim).toBeCloseTo(INNER - STRIP_GAP_X - 400, 6);
    const longClaim = splitButtons(INNER, STRIP_GAP_X, 420, 160);
    expect(longClaim.claim).toBe(420);
    expect(longClaim.odds).toBeCloseTo(INNER - STRIP_GAP_X - 420, 6);
  });

  it('shrinks both together, in proportion, when even the natural widths do not fit', () => {
    const r = splitButtons(INNER, STRIP_GAP_X, 500, 250);
    expect(r.claim + r.odds + STRIP_GAP_X).toBeCloseTo(INNER, 6);
    expect(r.claim / r.odds).toBeCloseTo(2, 6);
    expect(splitButtons(10, STRIP_GAP_X, 100, 100)).toEqual({ claim: 0, odds: 0 });
  });

  it('never makes a button narrower than the plan was given when there is room (Korean and English labels)', () => {
    for (const [claimW, oddsW] of [[180, 190], [203, 190], [260, 240]] as const) {
      const p = planStrip(measure({ claimW, oddsW }));
      expect(p.claim.w).toBeGreaterThanOrEqual(claimW);
      expect(p.odds.w).toBeGreaterThanOrEqual(oddsW);
    }
  });
});

describe('chest card layout: the card', () => {
  it('stacks the title row, the body and the buttons with the same air between them', () => {
    const p = planStrip(measure());
    const head = Math.max(p.title.y + p.title.h, p.timer.y + p.timer.h);
    expect(Math.min(p.bar.y, p.plate.y) - head).toBeGreaterThanOrEqual(STRIP_GAP_Y - 1e-6);
    const body = Math.max(p.plate.y + p.plate.h, p.reward.y + p.reward.h);
    expect(p.claim.y - body).toBeCloseTo(STRIP_GAP_Y, 6);
  });

  it('centres the plate on the body and keeps the bar and reward column inside the plate height', () => {
    const p = planStrip(measure());
    expect(STRIP_BAR_H + STRIP_GAP_BAR + 52).toBeLessThanOrEqual(STRIP_PLATE);
    expect(p.plate.y + p.plate.h / 2).toBeCloseTo((p.bar.y + p.reward.y + p.reward.h) / 2, 6);
  });

  it('is the same height in both languages when only the label widths differ', () => {
    const ko = planStrip(measure({ claimW: 180, oddsW: 190, titleW: 150 }));
    const en = planStrip(measure({ claimW: 203, oddsW: 190, titleW: 215 }));
    expect(en.h).toBe(ko.h);
  });
});

describe('button width from its label', () => {
  it('mirrors the Button padding: 18 plus 0.35 of the corner radius, the corner being 0.3 of the height up to 36', () => {
    expect(buttonPad(88)).toBeCloseTo(18 + 26.4 * 0.35, 6);
    expect(buttonPad(200)).toBeCloseTo(18 + 36 * 0.35, 6);
  });

  it('is never below the minimum, and grows with the label', () => {
    expect(buttonWidthFor(40, 88, 180, false)).toBe(180);
    const wide = buttonWidthFor(300, 88, 180, false);
    expect(wide).toBe(Math.ceil(300 + buttonPad(88) * 2));
    expect(buttonWidthFor(310, 88, 180, false)).toBeGreaterThan(wide);
  });

  it('keeps the padlock of the disabled state clear of the glyphs', () => {
    const open = buttonWidthFor(120, 88, 100, false);
    const locked = buttonWidthFor(120, 88, 100, true);
    expect(locked).toBeGreaterThan(open);
    // The padlock reaches 46 px in from the face's left edge; the label's own left edge must lie beyond it.
    expect((locked - 120) / 2).toBeGreaterThanOrEqual(46);
  });
});
