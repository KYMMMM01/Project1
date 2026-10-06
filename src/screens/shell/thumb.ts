/**
 * Smooth small copies of the cat pictures. The GPU reads a big picture shown at a tenth of its size
 * without averaging, which turns the art into salt-and-pepper noise on the small photos; here each
 * halving is an exact two-by-two average, so the last step to the shown size is a mild one.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { game } from '@/core/game';

const cache = new Map<string, Texture>();
/** Sizes are rounded up to this, so nearby screen sizes share one copy. */
const STEP = 16;

type Pixels = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

function isPixels(v: unknown): v is Pixels {
  return v instanceof ImageBitmap || v instanceof HTMLImageElement || v instanceof HTMLCanvasElement;
}

function redraw(from: Pixels, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  g.drawImage(from, 0, 0, w, h);
  return canvas;
}

/** The picture under `key` shrunk to `px` pixels on its long side (cached), or null when it cannot be read. */
function thumbTexture(key: string, px: number): Texture | null {
  const id = `${key}@${px}`;
  const hit = cache.get(id);
  if (hit) return hit;
  if (!hasTex(key)) return null;
  const source = tex(key).source;
  const pixels: unknown = source.resource;
  if (!isPixels(pixels)) return null;
  let w = source.pixelWidth;
  let h = source.pixelHeight;
  const k = px / Math.max(w, h);
  if (!(k > 0 && k < 1)) return null;
  const tw = Math.max(1, Math.round(w * k));
  const th = Math.max(1, Math.round(h * k));
  let from: Pixels = pixels;
  while (w > tw * 2 || h > th * 2) {
    const next = redraw(from, Math.max(tw, Math.ceil(w / 2)), Math.max(th, Math.ceil(h / 2)));
    if (!next) return null;
    from = next;
    w = next.width;
    h = next.height;
  }
  const last = redraw(from, tw, th);
  if (!last) return null;
  const thumb = Texture.from(last);
  cache.set(id, thumb);
  return thumb;
}

/**
 * Put a smooth copy of `key`'s picture into a kit photo frame (`unitPhoto`): the frame's window holds
 * one sprite, which keeps its size and gets the smaller picture. A frame built differently is left as it is.
 */
export function smoothPhoto(photo: Container, key: string): void {
  const portrait = photo.children[1];
  const sprite = portrait instanceof Container ? portrait.children[0] : undefined;
  if (!(sprite instanceof Sprite)) return;
  const box = Math.max(sprite.width, sprite.height);
  const physical = box * game.scale * game.app.renderer.resolution;
  const thumb = thumbTexture(key, Math.ceil(physical / STEP) * STEP);
  if (!thumb) return;
  sprite.texture = thumb;
  sprite.scale.set(box / Math.max(thumb.width, thumb.height));
}
