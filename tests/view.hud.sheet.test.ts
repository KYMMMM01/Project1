import { describe, expect, it } from 'vitest';
import type { Text } from 'pixi.js';
import { balanceWrap } from '@/view/hud/kit';
import { bottomRects, pickSheet, PICK, SHEET, sheetBoxes } from '@/view/hud/layoutMath';

const layout = { w: 720, h: 1280, safeTop: 0, safeBottom: 0, fieldX: 0, fieldY: 168, topH: 168, bottomH: 452 };

describe('the selection sheet sits on one content box', () => {
  const { w, h } = bottomRects(layout).sheet;
  const b = sheetBoxes(w, h);
  const inside = (r: { x: number; y: number; w: number; h: number }, o: { x: number; y: number; w: number; h: number }): boolean =>
    r.x >= o.x && r.y >= o.y && r.x + r.w <= o.x + o.w + 1e-9 && r.y + r.h <= o.y + o.h + 1e-9;

  it('keeps the dashed line 8 px inside the paper and 8 px of paper between that line and everything else', () => {
    expect(b.frame.x).toBe(SHEET.frame);
    expect(b.content.x - b.frame.x).toBe(SHEET.pad);
    expect(b.content.y - b.frame.y).toBe(SHEET.pad);
    expect(b.frame.x + b.frame.w - (b.content.x + b.content.w)).toBe(SHEET.pad);
    expect(b.frame.y + b.frame.h - (b.content.y + b.content.h)).toBe(SHEET.pad);
  });

  it('puts the photo, the close button, the well and the buttons inside the content box, the close button on the box\'s corner', () => {
    for (const r of [b.photo, b.close, b.well]) expect(inside(r, b.content)).toBe(true);
    expect(b.close.x + b.close.w).toBe(b.content.x + b.content.w);
    expect(b.close.y).toBe(b.content.y);
    expect(b.photo.x).toBe(b.content.x);
    expect(b.photo.y).toBe(b.content.y);
    // the buttons' faces and the lip under them end exactly on the box's bottom edge
    expect(b.buttonY + SHEET.button / 2 + SHEET.lip).toBe(b.content.y + b.content.h);
  });

  it('stacks header, well and buttons with 8 px between them and keeps the header\'s three rows inside the photo\'s height', () => {
    const buttonTop = b.buttonY - SHEET.button / 2;
    expect(buttonTop - (b.well.y + b.well.h)).toBe(SHEET.gap);
    expect(b.well.y - (b.photo.y + b.photo.h)).toBeGreaterThanOrEqual(SHEET.gap);
    // glyph heights: the name about 30, the stats 26, the skill line 22: 2 px or more between rows, the last no lower than the photo
    expect(SHEET.nameY + 15).toBeLessThanOrEqual(SHEET.statsY - 13 - 2);
    expect(SHEET.statsY + 13).toBeLessThanOrEqual(SHEET.skillY - 11 - 2);
    expect(SHEET.skillY + 11).toBeLessThanOrEqual(SHEET.photo);
  });

  it('keeps the header text left of the close button with 8 px to spare and the three buttons inside the box', () => {
    expect(b.close.x - b.textRight).toBe(SHEET.gap);
    expect(b.textX - (b.photo.x + b.photo.w)).toBe(12);
    const row = SHEET.molt + SHEET.awaken + SHEET.sell + SHEET.buttonGap * 2;
    expect(row).toBeLessThanOrEqual(b.content.w);
  });

  it('is cut from the 270 px the panel leaves it, which stops 8 px above the summon button\'s paper', () => {
    const r = bottomRects(layout);
    expect(r.sheet.y + r.sheet.h).toBeLessThanOrEqual(r.summonY - 70 - 8 + 1);
  });
});

describe('the pick of three', () => {
  it('has no empty band over the cards unless the pointing paw needs one', () => {
    const plain = pickSheet(false);
    const lesson = pickSheet(true);
    expect(lesson).toEqual({ cardY: PICK.cardY, h: PICK.h });
    // the cards start 20 px under the sub line's bottom, and the sheet is as much shorter as they moved up
    expect(plain.cardY - PICK.frameHalf - (PICK.subY + PICK.subHalf)).toBe(PICK.plainGap);
    expect(lesson.h - plain.h).toBe(lesson.cardY - plain.cardY);
    expect(plain.h).toBeLessThan(lesson.h);
    // the same room under the cards as before
    expect(plain.h - plain.cardY).toBe(lesson.h - lesson.cardY);
  });
});

describe('balanced wrapping', () => {
  // A stand-in for a Text: its width is the full line when wrapping is off and the wrap width (or less) when it is on.
  function fake(full: number, wrap: number): Text {
    const style = { wordWrap: true, wordWrapWidth: wrap };
    return {
      style,
      get width(): number {
        return style.wordWrap ? Math.min(full, style.wordWrapWidth) : full;
      },
    } as unknown as Text;
  }

  it('leaves a one-line text alone and splits a two-line text near its middle', () => {
    const one = fake(300, 540);
    balanceWrap(one, 540);
    expect(one.style.wordWrapWidth).toBe(540);
    const two = fake(590, 540);
    balanceWrap(two, 540);
    expect(two.style.wordWrapWidth).toBeLessThan(540);
    expect(two.style.wordWrapWidth).toBeGreaterThanOrEqual(590 / 2);
    expect(two.style.wordWrap).toBe(true);
  });

  it('never goes wider than the limit it was given, and keeps three lines three', () => {
    const three = fake(1500, 540);
    balanceWrap(three, 540);
    expect(three.style.wordWrapWidth).toBeLessThanOrEqual(540);
    expect(three.style.wordWrapWidth).toBeGreaterThanOrEqual(1500 / 3);
  });
});
