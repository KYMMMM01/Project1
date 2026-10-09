import { describe, expect, it } from 'vitest';
import {
  barX,
  CHIP_BARS,
  CHIP_DISC,
  CHIP_PIPS,
  CLASS_CHIP_BORDER_MAX,
  CLASS_CHIP_H,
  CLASS_CHIP_PAD,
  CLASS_CHIP_RING_INSET,
  CLASS_CHIP_SELECT_OUTSET,
  CLASS_CHIP_W,
  classChipParts,
  classChipTape,
  inContent,
  tapeCorners,
  type Pt,
} from '@/ui/classChipMath';
import { wobbleAmp } from '@/ui/paperMath';
import { FIELD_H } from '@/game/geometry';
import type { BattleLayout } from '@/view/context';
import { bottomRects, FACE, fitScale, gaugeWidth, PICK, pickCardX, pickHand, SKIP_FACE, SKIP_H, SKIP_W, skipRect, topRects } from '@/view/hud/layoutMath';

function layout(h: number, safeTop = 0, safeBottom = 0): BattleLayout {
  const slack = Math.round((h - safeTop - safeBottom - 168 - 452 - FIELD_H) / 2);
  return { w: 720, h, safeTop, safeBottom, fieldX: 0, fieldY: safeTop + 168 + slack, topH: 168, bottomH: 452 };
}

describe('the skip button in the top row', () => {
  for (const speedShown of [false, true]) {
    it(`never touches the enemy strip, the pause button or the speed button (speed ${speedShown ? 'out' : 'not yet out'})`, () => {
      for (const h of [1280, 1600]) {
        const r = topRects(layout(h, 40));
        const skip = skipRect(r, speedShown);
        const strip = { x: r.gauge.x, w: gaugeWidth(r, skip) };
        expect(skip.w).toBe(SKIP_W);
        expect(skip.h).toBe(SKIP_H);
        // The strip ends at least a button-gap short of the skip button, and the skull sticker still has its room on the left.
        expect(skip.x - (strip.x + strip.w)).toBeGreaterThanOrEqual(12);
        // Beside the speed button once it is out (its slot is 88 wide), else in its slot; never past the screen's side margin.
        if (speedShown) expect(r.speed.x - 44 - (skip.x + skip.w)).toBeGreaterThanOrEqual(12);
        expect(skip.x + skip.w).toBeLessThanOrEqual(720 - 16);
        expect(skip.x).toBeGreaterThan(r.pause.x + FACE / 2);
        // It stays in the first row: the second row's strips are free of it.
        expect(skip.y).toBeGreaterThanOrEqual(r.area.y);
        expect(skip.y + (skip.h + SKIP_FACE) / 2).toBeLessThanOrEqual(r.wave.y - 8);
      }
    });
  }

  it('leaves the strip room for its count: at least 300 px even beside the speed button', () => {
    const r = topRects(layout(1280));
    expect(gaugeWidth(r, skipRect(r, true))).toBeGreaterThanOrEqual(300);
    expect(gaugeWidth(r, skipRect(r, false))).toBeGreaterThan(gaugeWidth(r, skipRect(r, true)));
  });

  it('gives the whole strip back when the button is gone', () => {
    const r = topRects(layout(1280));
    expect(gaugeWidth(r, null)).toBe(r.gauge.w);
  });
});

describe('bottom panel', () => {
  it('anchors on the SUMMON button and stacks every row above it', () => {
    const r = bottomRects(layout(1280));
    expect(r.summonY).toBe(354);
    expect(r.chipsY).toBeLessThan(r.currencyY);
    expect(r.currencyY).toBeLessThan(r.utilY);
    expect(r.utilY).toBeLessThan(r.summonY);
    // the 140 px button plus its lip stays inside the panel
    expect(r.summonY + 70 + 15).toBeLessThanOrEqual(452);
  });

  it('respects the home-indicator inset and extends the plate to the screen edge', () => {
    const l = layout(1600, 0, 62);
    const r = bottomRects(l);
    expect(r.top).toBe(1600 - 62 - 452);
    expect(r.panel.y + r.panel.h).toBe(1600);
    expect(r.top + r.summonY + 85).toBeLessThanOrEqual(1600 - 62);
  });

  it('gives the selection sheet room above the SUMMON button', () => {
    const r = bottomRects(layout(1280));
    expect(r.sheet.y + r.sheet.h).toBeLessThanOrEqual(r.summonY - 70);
    expect(r.sheet.h).toBeGreaterThanOrEqual(262);
  });

  it('keeps chips, currency and utility rows at least 86 apart so touch targets barely overlap', () => {
    const r = bottomRects(layout(1280));
    expect(r.currencyY - r.chipsY).toBeGreaterThanOrEqual(86);
    expect(r.utilY - r.currencyY).toBeGreaterThanOrEqual(86);
  });
});

describe('sell strip', () => {
  it('reaches up toward the field sell line and ends 112 px into the panel', () => {
    const tall = layout(1600);
    const r = bottomRects(tall);
    // tall screens: the strip reaches at most 120 px above the panel, the field's bottom edge is farther
    expect(tall.fieldY + FIELD_H).toBeLessThan(r.top - 120);
    expect(r.sell.y).toBe(-120);
    expect(r.sell.y + r.sell.h).toBe(112);
    const tight = layout(1280);
    const t = bottomRects(tight);
    expect(t.sell.y + t.top).toBe(tight.fieldY + FIELD_H);
    expect(t.sell.y + t.sell.h).toBe(112);
  });
});

describe('boss strip', () => {
  it('replaces the preview and toy area of the second row and never reaches the field', () => {
    for (const h of [1280, 1600]) {
      const l = layout(h);
      const r = topRects(l);
      expect(r.boss.x).toBeGreaterThanOrEqual(r.wave.x + r.wave.w);
      expect(r.boss.x + r.boss.w).toBeLessThanOrEqual(720);
      expect(r.boss.y + r.boss.h).toBeLessThanOrEqual(l.safeTop + l.topH);
      expect(r.timer.x + r.timer.w).toBeLessThanOrEqual(r.boss.x);
      // the boss sticker overhangs the strip's left end by about 34 px and must not land on the countdown bar
      expect(r.timer.x + r.timer.w + 8).toBeLessThanOrEqual(r.boss.x - 34);
    }
  });
});

describe('helpers', () => {
  it('fits popups to short screens and never enlarges them', () => {
    expect(fitScale(700, 1400, 720, 1280)).toBeLessThan(1);
    expect(fitScale(400, 400, 720, 1280)).toBe(1);
    expect(fitScale(700, 1400, 720, 1280) * 1400).toBeLessThanOrEqual(1280 - 48);
  });
});

describe('the pointing hand of the pick of three', () => {
  for (const n of [3, 2]) {
    for (let i = 0; i < n; i++) {
      it(`on card ${i + 1} of ${n} covers no card text and no part of the sub line`, () => {
        const { tip, body } = pickHand(i, n);
        // The fingertip is on the recommended card's photo, inside its own width.
        const cx = pickCardX(i, n);
        expect(Math.abs(tip.x - cx)).toBeLessThan((220 * PICK.scale) / 2);
        expect(tip.y).toBeGreaterThan(PICK.cardY - PICK.frameHalf);
        // Every card's name, class line and "merges into" lines sit below its photo frame: the hand ends at the fingertip, above them.
        const textTop = PICK.cardY + PICK.frameHalf - 60;
        expect(body.y + body.h).toBeLessThanOrEqual(textTop);
        // The sub line above the cards is clear of the hand's body, whatever its width.
        const subBottom = PICK.subY + PICK.subHalf;
        expect(body.y).toBeGreaterThan(subBottom);
        const subLeft = PICK.w / 2 - PICK.subW / 2;
        const subRight = PICK.w / 2 + PICK.subW / 2;
        const overlapsSubColumns = body.x < subRight && body.x + body.w > subLeft;
        if (overlapsSubColumns) expect(body.y).toBeGreaterThan(subBottom);
        // And it stays inside the sheet.
        expect(body.x).toBeGreaterThanOrEqual(0);
        expect(body.x + body.w).toBeLessThanOrEqual(PICK.w);
      });
    }
  }
});

describe('the class chip', () => {
  const parts = classChipParts();
  const box = (names: (n: string) => boolean): { x0: number; x1: number; y0: number; y1: number } => {
    const pts = parts.filter((p) => names(p.name)).flatMap((p) => p.pts);
    return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), y1: Math.max(...pts.map((p) => p.y)) };
  };

  it('holds the well, the five pips with the star and the three bars, each in its content box', () => {
    expect(parts.map((p) => p.name)).toEqual(['disc', 'pip0', 'pip1', 'pip2', 'pip3', 'star', 'bar0', 'bar1', 'bar2']);
    for (const part of parts) {
      for (const p of part.pts) expect(inContent(p.x, p.y), `${part.name} at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`).toBe(true);
    }
  });

  it('keeps the content box at least 8 px from the border, the tier-3 ring and the hand-cut wobble apart from it', () => {
    const wobble = wobbleAmp(CLASS_CHIP_W, CLASS_CHIP_H);
    expect(CLASS_CHIP_PAD).toBeGreaterThanOrEqual(8 + wobble);
    // Border (inside the cut), then the ring (2.5 px wide, centred on its inset), then at least 2 px of paper before the content, wobble included.
    expect(CLASS_CHIP_RING_INSET - 2.5 / 2).toBeGreaterThan(CLASS_CHIP_BORDER_MAX);
    expect(CLASS_CHIP_PAD - (CLASS_CHIP_RING_INSET + 2.5 / 2) - wobble).toBeGreaterThanOrEqual(2);
    // The selected chip's line runs outside the cut edge, never inside the content.
    expect(CLASS_CHIP_SELECT_OUTSET).toBeGreaterThan(0);
  });

  it('pads the well evenly: as far from the left edge as the pad, centred between the top and bottom', () => {
    expect(CHIP_DISC.cx - CHIP_DISC.r + CLASS_CHIP_W / 2).toBeCloseTo(CLASS_CHIP_PAD, 5);
    const top = CHIP_DISC.cy - CHIP_DISC.r + CLASS_CHIP_H / 2;
    const bottom = CLASS_CHIP_H / 2 - (CHIP_DISC.cy + CHIP_DISC.r + CHIP_DISC.shadow);
    expect(top).toBeGreaterThanOrEqual(CLASS_CHIP_PAD);
    expect(bottom).toBeGreaterThanOrEqual(CLASS_CHIP_PAD);
    expect(Math.abs(top - bottom)).toBeLessThanOrEqual(CHIP_DISC.shadow);
  });

  it('sets the pip row on the content box top and the bars on its bottom, the well clear of both', () => {
    const pips = box((n) => n.startsWith('pip') || n === 'star');
    const bars = box((n) => n.startsWith('bar'));
    const disc = box((n) => n === 'disc');
    expect(Math.abs(pips.y0 - -(CLASS_CHIP_H / 2 - CLASS_CHIP_PAD))).toBeLessThanOrEqual(1);
    expect(Math.abs(bars.y1 - (CLASS_CHIP_H / 2 - CLASS_CHIP_PAD))).toBeLessThanOrEqual(1.5);
    expect(pips.y1 + 6).toBeLessThanOrEqual(bars.y0);
    expect(disc.x1 + 6).toBeLessThanOrEqual(Math.min(pips.x0, bars.x0));
    // Pips and bars share one centre line.
    expect(CHIP_PIPS.x).toBe(CHIP_BARS.x);
    expect(barX(0) + (CHIP_BARS.w * 3 + CHIP_BARS.gap * 2) / 2).toBeCloseTo(CHIP_BARS.x, 5);
  });

  for (const variant of [0, 1]) {
    it(`lays tape ${variant} over the top-left corner and over none of the content`, () => {
      const spot = classChipTape(variant);
      const quad = tapeCorners(spot);
      const edges: Pt[] = [];
      for (let i = 0; i < 4; i++) {
        const a = quad[i] as Pt;
        const b = quad[(i + 1) % 4] as Pt;
        for (let k = 0; k <= 40; k++) edges.push({ x: a.x + ((b.x - a.x) * k) / 40, y: a.y + ((b.y - a.y) * k) / 40 });
      }
      for (const p of edges) expect(inContent(p.x, p.y)).toBe(false);
      // Nothing of the content lies under it either (the content's centre and the well's rim).
      for (const part of parts) for (const p of part.pts) expect(insideQuad(quad, p)).toBe(false);
      // It sits on the corner, and sticks out of the chip's left side by no more than a thumb of paper (the first chip is 12 px from the screen).
      expect(Math.min(...quad.map((p) => p.x))).toBeGreaterThanOrEqual(-CLASS_CHIP_W / 2 - 10);
      expect(Math.min(...quad.map((p) => p.y))).toBeGreaterThanOrEqual(-CLASS_CHIP_H / 2 - 16);
    });
  }
});

function insideQuad(q: readonly Pt[], p: Pt): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i] as Pt;
    const b = q[(i + 1) % 4] as Pt;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}
