import { BitmapFont, BitmapText } from 'pixi.js';
import { labelStyle } from './text';

/**
 * Counters repaint every frame while they roll up. A canvas-backed Text would re-rasterise on each
 * change; a BitmapText only rewrites a few quads, so numbers use pre-baked glyph atlases (one per
 * size). The atlas is rendered from labelStyle(), so it matches every other label in the game.
 */
const CHARS = '0123456789 ,.+-x×/%:KMBTQai';
const installed = new Set<number>();

function fontName(size: number): string {
  return 'UiNum' + size;
}

/** A BitmapText for digits and number suffixes. Colour via `tint` (the atlas is white with a dark outline). */
export function numberText(size: number, color = 0xffffff, text = ''): BitmapText {
  const s = Math.max(20, Math.round(size));
  if (!installed.has(s)) {
    installed.add(s);
    BitmapFont.install({
      name: fontName(s),
      style: labelStyle({ size: s }),
      chars: CHARS,
      resolution: 2,
      padding: 4,
    });
  }
  const t = new BitmapText({ text, style: { fontFamily: fontName(s), fontSize: s } });
  t.anchor.set(0.5);
  t.tint = color;
  return t;
}
