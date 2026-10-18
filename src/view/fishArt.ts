/**
 * The little pictures of "Turn Into Fish!" (docs/design_skills_v2.md 3.11), painted in code on first use (no image file, design decision 20) or
 * made from art the game already has: the boss's round face that goes on the fish's head (the enemy's own picture, cut round and rimmed), and the
 * round status chip an enemy wears for as long as it is a fish (a pink disc with a white fish and a ring that shrinks with the time left) and for as long
 * as it cannot be turned again (a cream disc with a fish bone crossed out, the ring now counting the lock down). The fish itself is the game's own
 * painted `icon_fish`. The director's scene puts them on the field, the boss strip wears the same chip.
 *
 * No word on any of them. Every colour is a kit token or a mix of two, in the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { mixColor } from '@/core/math';
import { Color } from '@/ui/theme';

const RES = 3;
const TAU = Math.PI * 2;

/** The chip's size in design px (disc and ring together) and the ring's radius to the middle of its line. */
export const CHIP_SIZE = 34;
const CHIP_DISC = 12.4;
const RING_R = 15.2;
const RING_W = 3.2;
/** The ring is redrawn when the share of time left crosses one of this many steps. */
const RING_STEPS = 36;

/** The pink of the alchemist's smoke and of everything that says "fish" (the same pink `STATUS_COLOR.fish` has). */
export const FISH_PINK = mixColor(Color.berry, Color.paperLight, 0.5);
export const FISH_PINK_DEEP = Color.berryDark;
export const FISH_PINK_LIGHT = mixColor(Color.berry, Color.paperLight, 0.78);

type Ctx = CanvasRenderingContext2D;
const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
const INK = Color.inkDeep;

function canvasTexture(w: number, h: number, label: string, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w * RES;
  canvas.height = h * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('fishArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

function disc(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A sticker: a flat shadow, a cream border and a face. */
function sticker(ctx: Ctx, cx: number, cy: number, face: number): void {
  disc(ctx, cx + 0.5, cy + 1.3, CHIP_DISC + 0.6, css(Color.shadow, 0.3));
  disc(ctx, cx, cy, CHIP_DISC + 0.6, css(Color.paperLight));
  disc(ctx, cx, cy, CHIP_DISC - 0.8, css(face));
}

/** A white fish with an ink outline: an oval body, a forked tail, a dot for an eye. It swims to the right. */
function fishGlyph(ctx: Ctx, cx: number, cy: number, k: number): void {
  const body = (): void => {
    ctx.beginPath();
    ctx.ellipse(cx + 1.2 * k, cy, 6.6 * k, 4.2 * k, 0, 0, TAU);
    ctx.moveTo(cx - 5 * k, cy);
    ctx.lineTo(cx - 10.4 * k, cy - 4.6 * k);
    ctx.lineTo(cx - 9 * k, cy);
    ctx.lineTo(cx - 10.4 * k, cy + 4.6 * k);
    ctx.closePath();
  };
  body();
  ctx.lineWidth = 3 * k;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  body();
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  disc(ctx, cx + 4.4 * k, cy - 0.9 * k, 1.1 * k, css(INK));
}

/** A fish's bones: a head, a spine with three ribs, a forked tail. It points to the right. */
function boneGlyph(ctx: Ctx, cx: number, cy: number): void {
  const draw = (width: number, color: string): void => {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 6.4, cy);
    ctx.lineTo(cx + 3, cy);
    for (const dx of [-3.4, -0.2, 3]) {
      ctx.moveTo(cx + dx, cy - 3.9);
      ctx.lineTo(cx + dx, cy + 3.9);
    }
    ctx.moveTo(cx - 6.4, cy);
    ctx.lineTo(cx - 9.6, cy - 3.6);
    ctx.moveTo(cx - 6.4, cy);
    ctx.lineTo(cx - 9.6, cy + 3.6);
    ctx.stroke();
  };
  draw(3.4, css(INK));
  draw(1.6, css(Color.paperLight));
  ctx.beginPath();
  ctx.arc(cx + 6.4, cy, 3.6, 0, TAU);
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  disc(ctx, cx + 7.4, cy - 0.7, 0.9, css(INK));
}

export type ChipKind = 'fish' | 'lock';

function paintChip(ctx: Ctx, kind: ChipKind): void {
  const c = CHIP_SIZE / 2;
  if (kind === 'fish') {
    sticker(ctx, c, c, FISH_PINK);
    fishGlyph(ctx, c, c + 0.4, 1);
    return;
  }
  sticker(ctx, c, c, Color.paperDim);
  boneGlyph(ctx, c, c);
  // The crossing-out: one fat slash from the upper left to the lower right, with a cream edge so it reads on both the cream disc and the paper under it.
  const slash = (width: number, color: string): void => {
    ctx.beginPath();
    ctx.moveTo(c - 8.6, c - 8.6);
    ctx.lineTo(c + 8.6, c + 8.6);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };
  slash(5.4, css(Color.paperLight));
  slash(3.2, css(FISH_PINK_DEEP));
}

const chipArt = new Map<ChipKind, Texture>();

/** The disc of a chip, painted the first time it is worn. */
export function chipTexture(kind: ChipKind): Texture {
  let t = chipArt.get(kind);
  if (!t) {
    t = canvasTexture(CHIP_SIZE, CHIP_SIZE, `sp_fish_chip_${kind}`, (ctx) => paintChip(ctx, kind));
    chipArt.set(kind, t);
  }
  return t;
}

/**
 * The status chip: the disc and a ring round it that shrinks as the time runs out. It is `eventMode: 'none'`, a few display objects, and the ring is
 * redrawn only when it crosses a step of 1/36 of a turn (nothing per frame). Pink for the fish, grey-and-crossed for the lock.
 */
export class FishChip {
  readonly root = new Container();
  private readonly disc = new Sprite();
  private readonly ring = new Graphics();
  private kind: ChipKind | null = null;
  private steps = -1;

  constructor() {
    this.root.label = 'sp-fish-chip';
    this.root.eventMode = 'none';
    this.disc.anchor.set(0.5);
    this.root.addChild(this.ring, this.disc);
    this.root.visible = false;
  }

  /** Show the chip as `kind` with `frac` (0..1) of its time left. */
  set(kind: ChipKind, frac: number): void {
    if (kind !== this.kind) {
      this.kind = kind;
      this.disc.texture = chipTexture(kind);
      this.steps = -1;
    }
    const n = Math.max(0, Math.min(RING_STEPS, Math.ceil(frac * RING_STEPS - 1e-9)));
    if (n === this.steps) return;
    this.steps = n;
    const g = this.ring;
    g.clear();
    g.circle(0, 0, RING_R).stroke({ width: RING_W + 2, color: Color.paperLight, alpha: 0.9 });
    g.circle(0, 0, RING_R).stroke({ width: RING_W, color: Color.inkDeep, alpha: 0.3 });
    if (n <= 0) return;
    const color = kind === 'fish' ? FISH_PINK_DEEP : Color.inkSoft;
    if (n >= RING_STEPS) g.circle(0, 0, RING_R).stroke({ width: RING_W, color });
    else g.arc(0, 0, RING_R, -Math.PI / 2, -Math.PI / 2 + (n / RING_STEPS) * TAU).stroke({ width: RING_W, color, cap: 'round' });
  }

  /** The ring's step now (QA and tests): 0 empty .. 36 full. */
  get filled(): number {
    return this.steps;
  }

  /** Which picture the chip wears (QA and tests). */
  get shows(): ChipKind | null {
    return this.kind;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

// ── the boss's face ──

/** The face is baked at this many design px across; it is shown smaller than that on the fish. */
const FACE_SIZE = 64;
const faces = new Map<string, Texture | null>();

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

/**
 * The face of a fish: the enemy's whole picture shrunk into a round badge (a cream disc, the picture inside it, an ink ring and a cream ring round
 * that), baked once per picture under `key`. Null where it cannot be baked (a test, a bitmap that was closed): the caller shows the plain picture.
 */
export function faceDisc(src: Texture, key: string): Texture | null {
  if (faces.has(key)) return faces.get(key) ?? null;
  let out: Texture | null = null;
  try {
    const img = drawable(src);
    if (img && src.width > 1 && src.height > 1 && typeof document !== 'undefined') {
      out = canvasTexture(FACE_SIZE, FACE_SIZE, `sp_fish_face_${key}`, (ctx) => {
        const c = FACE_SIZE / 2;
        const r = c - 3.4;
        disc(ctx, c, c, c - 0.6, css(Color.paperLight));
        ctx.save();
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        ctx.clip();
        disc(ctx, c, c, r, css(Color.paperDim));
        const res = (src.source as { resolution?: number }).resolution || 1;
        const k = (r * 2 * 0.98) / Math.max(src.width, src.height);
        const w = src.width * k;
        const h = src.height * k;
        ctx.drawImage(img, src.frame.x * res, src.frame.y * res, src.frame.width * res, src.frame.height * res, c - w / 2, c - h / 2 + r * 0.04, w, h);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(c, c, r, 0, TAU);
        ctx.lineWidth = 3;
        ctx.strokeStyle = css(INK);
        ctx.stroke();
      });
    }
  } catch {
    out = null;
  }
  faces.set(key, out);
  return out;
}

/** Forget the baked faces (a test; the page keeps them for its life by design). */
export function forgetFaces(): void {
  faces.clear();
}

export const FACE_BAKED_SIZE = FACE_SIZE;
