/**
 * The lucky cat's capsules (docs/design_skills_v2.md 3.12 and 3.12.10). Six shells, one per KIND, painted by the owner's choice (art/skills_v1,
 * set B of the first round, 2026-10-18): plain pink for fish, pink with a heart for purr, mint with two paw prints for the partner, pink with a
 * smaller capsule peeking out of it for One More!, gold with a star for the toy, four rainbow bands for the guardian; every kind is told apart
 * by colour AND mark. A shell is two halves of one ball so that the lid can fly off: `tools/process_art.py` cuts each picture along its brown
 * band into `fx_capsule_<kind>_lid` and `fx_capsule_<kind>_base` (the same canvas, the seam's middle at the middle of the file, the inside of
 * the bowl already painted on the base under the lid).
 *
 * Still painted in code: the three little glyphs of the capsules that open empty (a question mark, a sleepy zigzag, a hollow star), which the
 * pictures do not have.
 *
 * THE PARTNER'S COLOUR. The design made the partner capsule sky blue, and the ninja's clones are sky blue (the pale shuriken still is). It is MINT
 * GREEN: apart from the blue, the toy's gold and the pinks. The data row (`SP_ROWS.capsule.marks`) says `'mint'`.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU } from '@/core/math';
import { SP_CAPSULE_KINDS, SP_ROWS, type SpCapsuleKind } from '@/game';
import { Hue } from '@/fx/palette';
import { Color, TapeColors } from '@/ui/theme';

const RES = 3;
const GLYPH = 48;

/** Design px per pixel of a shell's picture: the bowl (the lower half, white edge and all) is 180 px across in the file and 72 design px on the board. */
export const SHELL_K = 0.4;
/** The seam's middle is the middle of both halves' files, so one anchor does for every kind. */
export const SHELL_ANCHOR = 0.5;

export type CapsuleColorId = 'pink' | 'mint' | 'gold' | 'rainbow';
export type CapsuleMarkId = 'none' | 'heart' | 'paws' | 'smallCapsule' | 'star' | 'bands';

const INK = Color.inkDeep;
const CREAM = Color.paperLight;
/** The colours of the four capsule colour ids, read off the pictures (what the bits of shell, the glints and the beams wear). */
export const CAPSULE_COLOR: Readonly<Record<CapsuleColorId, number>> = {
  pink: 0xf48697,
  mint: 0x82d5ac,
  gold: 0xf2b232,
  rainbow: Color.coral,
};
/** The four bands of the rainbow capsule (no purple in this game's paper world). */
export const RAINBOW: readonly number[] = [Color.coral, Color.mustard, Color.leaf, TapeColors.sky.base];

type Ctx = CanvasRenderingContext2D;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function make(label: string, w: number, h: number, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w * RES;
  canvas.height = h * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('capsuleArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

/** What the data row says a kind looks like. */
export function capsuleLook(kind: SpCapsuleKind): { color: CapsuleColorId; mark: CapsuleMarkId; hue: number } {
  const m = SP_ROWS.capsule.marks[kind];
  return { color: m.color, mark: m.mark, hue: CAPSULE_COLOR[m.color] };
}

/** The image keys of a kind's two halves. */
export function capsuleKeys(kind: SpCapsuleKind): { lid: string; base: string } {
  return { lid: `fx_capsule_${kind}_lid`, base: `fx_capsule_${kind}_base` };
}

// ── the glyphs of the capsules that open empty ──

function star(ctx: Ctx, mx: number, my: number, r: number, fill: string, edge: string, lw = 1.8): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.46;
    if (i === 0) ctx.moveTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
    else ctx.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.lineWidth = lw;
  ctx.strokeStyle = edge;
  ctx.stroke();
  if (fill !== '') {
    ctx.fillStyle = fill;
    ctx.fill();
  }
}

function paintQuestion(ctx: Ctx): void {
  const path = (): void => {
    ctx.beginPath();
    ctx.arc(24, 17, 9.5, Math.PI * 1.05, Math.PI * 2.5);
    ctx.lineTo(24, 31);
  };
  path();
  ctx.lineWidth = 8;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(24, 40, 4, 0, TAU);
  ctx.fillStyle = css(INK);
  ctx.fill();
  path();
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(CREAM);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(24, 40, 2.1, 0, TAU);
  ctx.fillStyle = css(CREAM);
  ctx.fill();
}

function zig(ctx: Ctx, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x + s, y + s);
}

function paintZzz(ctx: Ctx): void {
  for (const [lw, color] of [[8, css(INK)], [4, css(Hue.iceLight)]] as const) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;
    zig(ctx, 8, 24, 18);
    ctx.stroke();
    zig(ctx, 28, 8, 11);
    ctx.stroke();
  }
}

function paintHollowStar(ctx: Ctx): void {
  star(ctx, 24, 25, 18, '', css(INK), 7);
  star(ctx, 24, 25, 18, '', css(CREAM), 3.4);
}

/** Everything a capsule scene paints with. */
export interface CapsuleArt {
  /** The lid and the base of each kind (the painted pictures; they are the image store's, not ours to free). */
  readonly lids: Readonly<Record<SpCapsuleKind, Texture>>;
  readonly bases: Readonly<Record<SpCapsuleKind, Texture>>;
  /** The glyphs, painted in code. */
  readonly question: Texture;
  readonly zzz: Texture;
  readonly hollowStar: Texture;
}

let cached: CapsuleArt | null = null;

export function capsuleArt(): CapsuleArt {
  if (cached) return cached;
  const lids = {} as Record<SpCapsuleKind, Texture>;
  const bases = {} as Record<SpCapsuleKind, Texture>;
  for (const kind of SP_CAPSULE_KINDS) {
    const k = capsuleKeys(kind);
    lids[kind] = tex(k.lid);
    bases[kind] = tex(k.base);
  }
  cached = {
    lids,
    bases,
    question: make('capsule_question', GLYPH, GLYPH, paintQuestion),
    zzz: make('capsule_zzz', GLYPH, GLYPH, paintZzz),
    hollowStar: make('capsule_hollow_star', GLYPH, GLYPH, paintHollowStar),
  };
  return cached;
}

/** Free the glyphs and forget the pictures (a test that paints with a stand-in canvas starts clean). */
export function resetCapsuleArt(): void {
  if (!cached) return;
  for (const t of [cached.question, cached.zzz, cached.hollowStar]) t.destroy(true);
  cached = null;
}
