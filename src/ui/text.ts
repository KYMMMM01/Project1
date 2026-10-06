import { Text, type TextStyleOptions } from 'pixi.js';
import { Color, FONT_FAMILY } from './theme';

export interface LabelOpts {
  size?: number;
  color?: number;
  /** Outline colour, or false for none. Default: dark outline (the standard game-UI look). */
  stroke?: number | false;
  strokeWidth?: number;
  /** Hard drop shadow under the glyphs. Default true when stroked. */
  shadow?: boolean;
  align?: 'left' | 'center' | 'right';
  /** Wrap width in design px; enables word wrap. */
  wrap?: number;
  lineHeight?: number;
  letterSpacing?: number;
  /** Anchor; default 0.5 (centred). */
  anchorX?: number;
  anchorY?: number;
}

export function labelStyle(o: LabelOpts = {}): TextStyleOptions {
  const size = o.size ?? 28;
  const stroke = o.stroke === undefined ? Color.outline : o.stroke;
  const strokeWidth = o.strokeWidth ?? Math.max(3, Math.round(size * 0.16));
  const shadow = o.shadow ?? stroke !== false;
  const style: TextStyleOptions = {
    fontFamily: FONT_FAMILY,
    fontSize: size,
    fill: o.color ?? Color.text,
    align: o.align ?? 'center',
    letterSpacing: o.letterSpacing ?? 0,
    padding: Math.ceil(strokeWidth + 4),
  };
  if (stroke !== false) style.stroke = { color: stroke, width: strokeWidth, join: 'round' };
  if (shadow) {
    style.dropShadow = {
      color: Color.outline,
      alpha: 0.9,
      blur: 0,
      angle: Math.PI / 2,
      distance: Math.max(2, Math.round(size * 0.09)),
    };
  }
  if (o.wrap) {
    style.wordWrap = true;
    style.wordWrapWidth = o.wrap;
    // Korean has no spaces inside phrases; allow breaking between any two characters.
    style.breakWords = true;
  }
  if (o.lineHeight) style.lineHeight = o.lineHeight;
  return style;
}

/** Standard outlined game text. Prefer this over constructing Text directly so the look stays uniform. */
export function label(text: string | number, o: LabelOpts = {}): Text {
  const tx = new Text({ text: String(text), style: labelStyle(o) });
  tx.anchor.set(o.anchorX ?? 0.5, o.anchorY ?? 0.5);
  return tx;
}

/** Shrink `tx` uniformly until it fits `maxWidth` (never grows). Call after changing its text. */
export function fitWidth(tx: Text, maxWidth: number, baseScale = 1): void {
  tx.scale.set(baseScale);
  if (tx.width > maxWidth) tx.scale.set((baseScale * maxWidth) / tx.width);
}
