/**
 * The pictures of the ninja's clones, made from what the game already has (decision 20, no new image file): the ninja's own art washed pale
 * and sky-blue, its outline as a thin bright line, and the leaf, a small cartoon leaf painted in code (the ninja's "leaf on the head" and the
 * leaf a clone leaves behind). Made on first use, kept for the page's life (`autoGarbageCollect: false`), the way the shove's shield is.
 *
 * What real art would want for these (for the candidate sheet the owner will see): a hand-painted clone sheet (the ninja drawn in two pale
 * blues with a "smoky" bottom edge instead of feet, one with the leaf upside down), a smoke ring "poof" of three frames, a leaf of two shapes
 * (the head leaf and a falling one), and a small "oops" puff for the step aside.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU } from '@/core/math';
import { Color } from '@/ui/theme';
import { paleCopy, rimOf } from '../../field/ghosts';
import { unitSpriteScale } from '../../field/unitView';

/** The width of the line round a clone, in the original art's pixels (the art is drawn at about 0.25, so this is about 3 design px: 1.9 px on a 450 px screen; at 1 design px it vanished on a busy board and at 2.2 a stacked pair was still hard to see at 360 px). */
const RIM_WIDTH = 12;
const BAKE_SCALE = 0.6;
/** The sky the body is washed toward: the kit's sky tape pushed bluer: a dark cat turns blue (tried paler washes: on the sun tile they went green, on paper they vanished). */
const BODY_SKY = 0x64aaeb;

const LEAF_PX = 28;
const LEAF_RES = 3;

export interface CloneArt {
  /** The clone's body: the ninja's art, pale. Anchored at the feet (0.5, 1) like every cat. */
  body: Texture;
  /** The body could not be baked (no canvas: a test): `body` is the plain art and must be tinted. */
  bodyTinted: boolean;
  /** The line round the body (centre it on the body's middle), or null. */
  rim: Texture | null;
  /** The drawn height of the body, design px, and the scale that puts the texture at it. */
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

/** The clone's pictures (made on the first call). */
export function cloneArt(): CloneArt {
  if (made) return made;
  const src = tex('unit_r_ninja');
  const pale = paleCopy(src, 'clone_body', { fill: BODY_SKY, strength: 0.85, keep: 0.2, lift: 0, scale: BAKE_SCALE });
  const rim = rimOf(src, 'clone_rim', RIM_WIDTH * BAKE_SCALE, BAKE_SCALE);
  const body = pale ?? src;
  const height = unitSpriteScale('r_ninja', Math.max(1, src.height)) * Math.max(1, src.height);
  const leaf = leafTexture();
  made = {
    body,
    bodyTinted: pale === null,
    rim: rim ? rim.texture : null,
    height,
    scale: height / Math.max(1, body.height),
    leaf: leaf.texture,
    leafTinted: leaf.tinted,
  };
  return made;
}

/** Forget the made pictures (a test that swaps the stand-in art). */
export function resetCloneArt(): void {
  made = null;
}
