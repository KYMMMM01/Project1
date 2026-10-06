import { BitmapFont, BitmapText } from 'pixi.js';
import { labelStyle } from './text';
import { Color } from './theme';

/**
 * Counters repaint every frame while they roll up. A canvas-backed Text would re-rasterise on each
 * change; a BitmapText only rewrites a few quads, so numbers use pre-baked glyph atlases (one per
 * size). The atlas is rendered from labelStyle(), so it matches every other label in the game.
 */
const CHARS = '0123456789 ,.+-x×/%:KMBTQai만억조';
const installed = new Set<string>();

function fontName(size: number, onArt: boolean): string {
  return (onArt ? 'UiNumArt' : 'UiNum') + size;
}

/**
 * A BitmapText for digits and number suffixes. Colour via `tint`: the atlas is white and bare, so a
 * number is dark ink on paper by default; `onArt` bakes a brown stroke into the glyphs for numbers
 * that sit on artwork (tint those light).
 */
export function numberText(size: number, color: number = Color.ink, text = '', onArt = false): BitmapText {
  const s = Math.max(20, Math.round(size));
  const name = fontName(s, onArt);
  if (!installed.has(name)) {
    installed.add(name);
    BitmapFont.install({
      name,
      style: labelStyle({ size: s, color: 0xffffff, onArt }),
      chars: CHARS,
      resolution: 2,
      padding: 4,
    });
  }
  const t = new BitmapText({ text, style: { fontFamily: name, fontSize: s } });
  t.anchor.set(0.5);
  t.tint = color;
  return t;
}
