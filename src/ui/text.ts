import { Text, type TextStyleOptions } from 'pixi.js';
import { game } from '@/core/game';
import { clamp } from '@/core/math';
import { Color, FONT_FAMILY, MIN_FONT } from './theme';

/**
 * Raster density for a Text: device pixels per design px with a little supersampling, capped at 2.
 * Pixi's automatic choice ignores the design-to-CSS scale, so phones (scale ~0.55) would rasterise
 * glyphs at roughly twice the needed density while a large desktop window would upscale them.
 */
export function textResolution(): number {
  const r = game.app?.renderer.resolution ?? 1;
  return clamp(r * game.scale * 1.25, 1, 2);
}

export interface LabelOpts {
  size?: number;
  /** Text colour. Default: ink (or the light on-art colour when `onArt` is set). */
  color?: number;
  /** Outline colour, or false for none. Default none: ink sits directly on paper. */
  stroke?: number | false;
  strokeWidth?: number;
  /** Hard drop shadow under the glyphs. Default false. */
  shadow?: boolean;
  /**
   * Text that sits directly on artwork or on a dark dim: light, with a brown stroke so it stays
   * readable on any picture. Everything that sits on paper uses the default dark ink instead.
   */
  onArt?: boolean;
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
  const onArt = o.onArt ?? false;
  const stroke = o.stroke === undefined ? (onArt ? Color.outline : false) : o.stroke;
  const strokeWidth = o.strokeWidth ?? Math.max(4, Math.round(size * 0.17));
  const shadow = o.shadow ?? false;
  const style: TextStyleOptions = {
    fontFamily: FONT_FAMILY,
    fontSize: size,
    fill: o.color ?? (onArt ? Color.onArt : Color.ink),
    align: o.align ?? 'center',
    letterSpacing: o.letterSpacing ?? 0,
    padding: Math.ceil((stroke === false ? 0 : strokeWidth) + 4 + (shadow ? 4 : 0)),
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

/** Standard game text: dark ink, no outline, no shadow. Prefer this over constructing Text directly so the look stays uniform. */
export function label(text: string | number, o: LabelOpts = {}): Text {
  const tx = new Text({ text: String(text), style: labelStyle(o), resolution: textResolution() });
  tx.anchor.set(o.anchorX ?? 0.5, o.anchorY ?? 0.5);
  return tx;
}

/** label() for text on artwork: light fill with a brown stroke. */
export function artLabel(text: string | number, o: LabelOpts = {}): Text {
  return label(text, { ...o, onArt: true });
}

/** Shrink `tx` uniformly until it fits `maxWidth` (never grows). Call after changing its text. */
export function fitWidth(tx: Text, maxWidth: number, baseScale = 1): void {
  tx.scale.set(baseScale);
  if (tx.width > maxWidth) tx.scale.set((baseScale * maxWidth) / tx.width);
}

/**
 * Like fitWidth, but never shrinks the glyphs below `minScale` (or below MIN_FONT): a label that is
 * still too wide at that floor is cut with an ellipsis instead of becoming unreadable.
 */
export function fitLabel(tx: Text, maxWidth: number, baseSize: number, minScale = 0.7): void {
  const floor = Math.min(1, Math.max(minScale, MIN_FONT / baseSize));
  fitWidth(tx, maxWidth);
  if (tx.scale.x >= floor) return;
  tx.scale.set(floor);
  const full = tx.text;
  for (let n = full.length - 1; n > 0 && tx.width > maxWidth; n--) {
    tx.text = full.slice(0, n).trimEnd() + '…';
  }
}

/** label() for UI components: the size is floored at MIN_FONT so no component can ship unreadable text. */
export function uiLabel(text: string | number, o: LabelOpts = {}): Text {
  return label(text, { ...o, size: Math.max(MIN_FONT, o.size ?? 28) });
}
