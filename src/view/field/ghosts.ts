/**
 * What the ninja's clones (docs/design_skills_v2.md 3.4) share between the field and the director. The clone's own body is the owner's painted
 * picture now (`director/sp/cloneArt.ts`); what is left here is the clones' shuriken:
 *
 *  - `paleCopy` bakes a pale, sky-blue copy of an existing picture on a 2D canvas, once: the steel shuriken washed toward the sky. A multiply tint
 *    cannot make a dark picture pale; the bake can.
 *  - the launch offsets of a clone's shuriken: the simulation starts every shuriken at the CENTRE of its tile; a clone that is stacked on its
 *    ninja is drawn a few px to one side, so its shuriken is drawn starting there and settling onto the simulation's line in the first frames
 *    (the picture only; `cloneThrow` tells the director, the projectile layer reads it).
 *
 * Everything here is pure view: no state of the battle, nothing is saved. When a canvas or the picture's pixels are not available (a test, a
 * closed bitmap) the bakes return null and the caller falls back to a tint of the original.
 */
import { CanvasSource, Texture } from 'pixi.js';

/** The sky of the paper kit's sky washi tape (`TapeColors.sky`): what a clone is washed toward. */
export const GHOST_SKY = 0x9acbea;
/** The brighter sky of the same tape's mark: the clone's shuriken's streak. */
export const GHOST_SKY_LIGHT = 0xeaf6ff;

const css = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const baked = new Map<string, Texture>();

/** A picture the canvas can draw (a loaded image, a bitmap or another canvas), or null (a test, a bitmap that was closed). */
function drawable(t: Texture): CanvasImageSource | null {
  const r = (t.source as { resource?: unknown } | undefined)?.resource;
  if (!r) return null;
  const is = (name: string): boolean => {
    const g = (globalThis as Record<string, unknown>)[name];
    return typeof g === 'function' && r instanceof (g as new () => object);
  };
  return is('ImageBitmap') || is('HTMLImageElement') || is('HTMLCanvasElement') || is('OffscreenCanvas') ? (r as CanvasImageSource) : null;
}

/** Draw all of `t` (its frame) onto `ctx` at (`dx`, `dy`) as `w` x `h` px. */
function drawAll(ctx: CanvasRenderingContext2D, img: CanvasImageSource, t: Texture, dx: number, dy: number, w: number, h: number): void {
  const rs = (t.source as { resolution?: number }).resolution || 1;
  ctx.drawImage(img, t.frame.x * rs, t.frame.y * rs, t.frame.width * rs, t.frame.height * rs, dx, dy, w, h);
}

function canvasOf(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  return ctx ? { canvas, ctx } : null;
}

/**
 * The baked canvas as a texture. Resolution 1 on purpose: the texture measures what the canvas does, and a caller that wants it at the
 * original's size scales the sprite (a fractional resolution makes the source think the canvas is the wrong size, and it resets, which clears it).
 */
function textureOf(canvas: HTMLCanvasElement, label: string): Texture {
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: 1, autoGarbageCollect: false }), label });
}

export interface PaleOpts {
  /** The colour the picture is washed toward, and how strongly (0..1). */
  fill: number;
  strength: number;
  /** How much of the original shading comes back over the wash (0..1): the face and the folds stay readable. */
  keep: number;
  /** Extra white laid on top (0..1): the pale of it. */
  lift: number;
  /** Baked at this share of the original's size (the texture is that many px: scale the sprite by the inverse to draw it at the original's size). */
  scale: number;
}

/** The pale copy of `src`, baked once under `key`; null where it cannot be baked. */
export function paleCopy(src: Texture, key: string, o: PaleOpts): Texture | null {
  const have = baked.get(key);
  if (have) return have;
  try {
    const img = drawable(src);
    if (!img || src.width < 2 || src.height < 2) return null;
    const w = Math.max(2, Math.round(src.width * o.scale));
    const h = Math.max(2, Math.round(src.height * o.scale));
    const c = canvasOf(w, h);
    if (!c) return null;
    const { canvas, ctx } = c;
    drawAll(ctx, img, src, 0, 0, w, h);
    // Everything after this only touches the pixels the picture has (its own shape stays).
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(o.fill, o.strength);
    ctx.fillRect(0, 0, w, h);
    if (o.keep > 0) {
      ctx.globalAlpha = o.keep;
      drawAll(ctx, img, src, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (o.lift > 0) {
      ctx.fillStyle = css(0xffffff, o.lift);
      ctx.fillRect(0, 0, w, h);
    }
    const t = textureOf(canvas, `ghost_${key}`);
    baked.set(key, t);
    return t;
  } catch {
    // A bitmap that was closed, a canvas the browser refuses: the caller tints the original instead.
    return null;
  }
}

/** The pale-blue copy of a shuriken's picture (the clone's): lighter than the ninja's steel one, a pale sky with the same brown line. */
export function ghostShuriken(src: Texture): Texture | null {
  return paleCopy(src, `shuriken:${src.label ?? ''}`, { fill: GHOST_SKY, strength: 0.62, keep: 0.3, lift: 0.1, scale: 0.5 });
}

// ───────────────────────────── where a clone's shuriken starts ─────────────────────────────

/** A shuriken's picture starts this far (px) from the simulation's tile centre, and slides onto the line over the launch. */
export interface GhostStart {
  dx: number;
  dy: number;
}

const starts = new Map<number, GhostStart>();
/** More than this many unclaimed starts (a shuriken that hit before a frame drew it) and the oldest are forgotten. */
const STARTS_MAX = 32;

/** The director: the shuriken `uid` that a clone has just thrown is drawn starting `dx, dy` px from where the simulation starts it. */
export function noteGhostStart(uid: number, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  if (starts.size >= STARTS_MAX) starts.delete(starts.keys().next().value as number);
  starts.set(uid, { dx, dy });
}

/** The projectile layer: the offset of shuriken `uid`, once (null: it starts where the simulation says). */
export function takeGhostStart(uid: number): GhostStart | null {
  const s = starts.get(uid);
  if (!s) return null;
  starts.delete(uid);
  return s;
}

/** Forget every unclaimed start (the scene is cleared). */
export function clearGhostStarts(): void {
  starts.clear();
}

/** How many starts nobody has taken yet (tests). */
export function ghostStartsPending(): number {
  return starts.size;
}
