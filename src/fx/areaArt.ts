import { Rectangle, type Graphics, type Texture } from 'pixi.js';
import { game } from '@/core/game';
import { clamp } from '@/core/math';

/**
 * Bake a drawing into one texture covering `w` x `h` design px centred on the origin, and give the drawing back to the pool of
 * things to forget. A ground area is a cut-out that never changes shape, so it is tessellated once per kind and every area of that
 * kind is a sprite of the same texture: dozens of them then share a batch, where the same outlines as Graphics would each cost
 * their own draw call.
 */
export function bakeArea(draw: Graphics, w: number, h: number): Texture {
  const { renderer } = game.app;
  // About one texel per device pixel at the size the area is usually shown (a little above its drawn radius), never blurrier than 1.5.
  const resolution = clamp(renderer.resolution * game.scale * 1.5, 1.5, 2.5);
  const frame = new Rectangle(-Math.ceil(w / 2), -Math.ceil(h / 2), Math.ceil(w), Math.ceil(h));
  const texture = renderer.generateTexture({ target: draw, frame, resolution, antialias: true });
  draw.destroy();
  return texture;
}
