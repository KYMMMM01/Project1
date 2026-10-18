/**
 * The pictures of the ninja's clones: the owner's painted clone (art/skills_v1, round 3, 2026-10-18: the lilac-indigo ninja, darkened so that a
 * clone that is only 55 per cent opaque still reads) and the pair of them for a full board (two clones shoulder to shoulder, the rear one fainter),
 * `fx_clone` and `fx_clone_pair`; `tools/process_art.py` scales both by the same factor, so a figure is the same size in either. Both stand on the
 * bottom edge of their picture (anchor 0.5, 1) like every cat. The clone's leaf on its head is in the picture.
 *
 * Still painted in code: the leaf the ninja puts on its own head at the cast and the leaf a clone leaves behind when it goes (the owner's set has
 * no leaf of its own), made on first use and kept for the page's life (`autoGarbageCollect: false`), the way the shove's shield is.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU } from '@/core/math';
import { Color } from '@/ui/theme';
import { unitSpriteScale } from '../../field/unitView';

export const CLONE_KEY = 'fx_clone';
export const CLONE_PAIR_KEY = 'fx_clone_pair';

const LEAF_PX = 28;
const LEAF_RES = 3;

export interface CloneArt {
  /** One clone, anchored at the feet (0.5, 1) like every cat. */
  body: Texture;
  /** Two clones shoulder to shoulder (the stacked pair of a full board), anchored the same way, at the same scale as `body`. */
  pair: Texture;
  /** The drawn height of a clone, design px (a ninja's), and the scale that puts the texture at it (the pair uses the same one). */
  height: number;
  scale: number;
  /** The leaf, anchored at its stem. */
  leaf: Texture;
  leafTinted: boolean;
}

let made: CloneArt | null = null;

/** The leaf: a green cartoon leaf with the brown ink line and a darker midrib, its stem at the lower left. Painted once. */
function leafTexture(): { texture: Texture; tinted: boolean } {
  if (typeof document === 'undefined') return { texture: Texture.WHITE, tinted: true };
  const canvas = document.createElement('canvas');
  canvas.width = LEAF_PX * LEAF_RES;
  canvas.height = LEAF_PX * LEAF_RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { texture: Texture.WHITE, tinted: true };
  ctx.scale(LEAF_RES, LEAF_RES);
  const css = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(5, 23);
  ctx.bezierCurveTo(3, 12, 12, 3, 25, 3.5);
  ctx.bezierCurveTo(26, 15, 17, 25, 5, 23);
  ctx.closePath();
  ctx.fillStyle = css(Color.leaf);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(Color.ink);
  ctx.stroke();
  // The midrib and a small paler patch of light on the upper half.
  ctx.beginPath();
  ctx.moveTo(5.5, 22.5);
  ctx.quadraticCurveTo(13, 14, 21, 7);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(Color.leafDark);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(14.5, 8.6, 2.2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  // The stem.
  ctx.beginPath();
  ctx.moveTo(5, 23);
  ctx.lineTo(2, 26.3);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(Color.ink);
  ctx.stroke();
  return { texture: new Texture({ source: new CanvasSource({ resource: canvas, resolution: LEAF_RES, autoGarbageCollect: false }), label: 'sp_clone_leaf' }), tinted: false };
}

/** The clone's pictures (found on the first call). */
export function cloneArt(): CloneArt {
  if (made) return made;
  const ninja = tex('unit_r_ninja');
  const body = tex(CLONE_KEY);
  const pair = tex(CLONE_PAIR_KEY);
  const height = unitSpriteScale('r_ninja', Math.max(1, ninja.height)) * Math.max(1, ninja.height);
  const leaf = leafTexture();
  made = { body, pair, height, scale: height / Math.max(1, body.height), leaf: leaf.texture, leafTinted: leaf.tinted };
  return made;
}

/** Forget the made pictures (a test that swaps the stand-in art). */
export function resetCloneArt(): void {
  made = null;
}
