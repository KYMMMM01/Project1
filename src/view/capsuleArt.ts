/**
 * The lucky cat's capsules (docs/design_skills_v2.md 3.12 and 3.12.10), painted in code on first use (no image file, design decision 20). A
 * capsule is two halves of one ball so that the lid can fly off: a lid per KIND (its colour AND its mark, so no kind is told apart by hue
 * alone: plain pink for fish, pink with a heart for purr, mint with two paw prints for the partner, pink with a smaller capsule on it for One
 * More!, gold with a star for the toy, four rainbow bands for the guardian) and one shared base, plus the inside of the base (`mouth`), the
 * second shell that peeks out of a One More! capsule (`peek`) and three little glyphs for the capsules that open empty (a question mark, a
 * sleepy zigzag, a hollow star).
 *
 * THE PARTNER'S COLOUR. The design made the partner capsule sky blue, and the ninja's clones are already sky blue (pale, see-through, on the
 * same tiles). It is MINT GREEN here: apart from the clones' blue, the toy's gold and the pinks, and still a cool, fresh colour. The data row
 * (`SP_ROWS.capsule.marks`) says `'mint'`.
 *
 * No word on any of them. Every colour is a kit token or a mix of two, with the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { TAU, darken, mixColor } from '@/core/math';
import { SP_CAPSULE_KINDS, SP_ROWS, type SpCapsuleKind } from '@/game';
import { Hue } from '@/fx/palette';
import { Color, TapeColors } from '@/ui/theme';

const RES = 3;

/** The radius of a capsule in design px, and the picture's room round it. */
export const CAPSULE_R = 34;
const PAD = 5;
const HALF_W = CAPSULE_R * 2 + PAD * 2;
const HALF_H = CAPSULE_R + PAD * 2;
/** Where the equator stands in each half's picture (the join of the two halves) and so where its anchor is. */
export const LID_ANCHOR = { x: 0.5, y: (HALF_H - PAD) / HALF_H } as const;
export const BASE_ANCHOR = { x: 0.5, y: PAD / HALF_H } as const;
const MOUTH_W = 72;
const MOUTH_H = 18;
const PEEK_W = 62;
const PEEK_H = 34;
const GLYPH = 48;

export type CapsuleColorId = 'pink' | 'mint' | 'gold' | 'rainbow';
export type CapsuleMarkId = 'none' | 'heart' | 'paws' | 'smallCapsule' | 'star' | 'bands';

const INK = Color.inkDeep;
const CREAM = Color.paperLight;
/** The colours of the four capsule colour ids: the pink is the berry paper pulled toward cream so it stays a candy pink on the warm floor. */
export const CAPSULE_COLOR: Readonly<Record<CapsuleColorId, number>> = {
  pink: mixColor(Color.berry, Color.paperLight, 0.36),
  mint: mixColor(Color.leaf, Color.paperLight, 0.2),
  gold: Color.mustard,
  rainbow: Color.coral,
};
/** The four bands of the rainbow capsule (no purple in this game's paper world). */
export const RAINBOW: readonly number[] = [Color.coral, Color.mustard, Color.leaf, TapeColors.sky.base];
const BASE_FILL = mixColor(CREAM, Color.kraft, 0.08);

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

// ── the marks (painted on the lid, centred at mx, my) ──

function heart(ctx: Ctx, mx: number, my: number, s: number, fill: string, edge: string): void {
  ctx.beginPath();
  ctx.moveTo(mx, my + s * 0.95);
  ctx.bezierCurveTo(mx - s * 1.6, my - s * 0.1, mx - s * 0.8, my - s * 1.35, mx, my - s * 0.45);
  ctx.bezierCurveTo(mx + s * 0.8, my - s * 1.35, mx + s * 1.6, my - s * 0.1, mx, my + s * 0.95);
  ctx.closePath();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

function paw(ctx: Ctx, mx: number, my: number, turn: number, fill: string, edge: string): void {
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(turn);
  ctx.beginPath();
  ctx.ellipse(0, 3, 6.6, 5.4, 0, 0, TAU);
  for (const [dx, dy] of [[-7.4, -3.4], [-2.7, -8.2], [2.7, -8.2], [7.4, -3.4]] as const) {
    ctx.moveTo(dx + 2.9, dy);
    ctx.arc(dx, dy, 2.9, 0, TAU);
  }
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = edge;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.restore();
}

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

/**
 * A smaller capsule laid on the lid of the One More! capsule, tilted, on a round cream sticker: big enough to read as a capsule at lane size (it was a
 * 21 px half-disc that looked like a flaw on a lid that is the same pink as the plain fish capsule's; the player-eye review of step 2).
 */
const TINY_R = 14.5;
function tinyCapsule(ctx: Ctx, mx: number, my: number, top: number): void {
  const r = TINY_R;
  ctx.save();
  ctx.translate(mx, my);
  // The sticker under it: a cream disc with a thin ink edge, so the mark stands out of the pink instead of melting into it.
  ctx.beginPath();
  ctx.arc(0, 0, r + 4.2, 0, TAU);
  ctx.fillStyle = css(CREAM, 0.92);
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = css(INK, 0.7);
  ctx.stroke();
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.lineWidth = 3.8;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI, TAU);
  ctx.closePath();
  ctx.fillStyle = css(top);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = css(CREAM);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.lineTo(r, 0);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.restore();
}

const HALF_CX = HALF_W / 2;
const LID_CY = HALF_H - PAD;
const BASE_CY = PAD;

/** The lid of one kind: the upper half of the ball in the kind's colour, its mark, a seam at the join, a highlight and a shade. */
function paintLid(ctx: Ctx, color: CapsuleColorId, mark: CapsuleMarkId): void {
  const fill = CAPSULE_COLOR[color];
  const R = CAPSULE_R;
  const cx = HALF_CX;
  const cy = LID_CY;
  const dome = (): void => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, Math.PI, TAU);
    ctx.closePath();
  };
  dome();
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  dome();
  ctx.fillStyle = css(fill);
  ctx.fill();
  ctx.save();
  dome();
  ctx.clip();
  if (mark === 'bands') {
    ctx.translate(cx, cy);
    ctx.rotate(-0.42);
    RAINBOW.forEach((c, i) => {
      ctx.fillStyle = css(c);
      ctx.fillRect(-60, -56 + i * 14, 120, 14.5);
    });
    ctx.rotate(0.42);
    ctx.translate(-cx, -cy);
  }
  // The shade: the part of the dome that a lamp up on the left does not reach.
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, TAU);
  ctx.arc(cx - 7, cy - 6, R + 1, 0, TAU, true);
  ctx.fillStyle = css(darken(fill, 0.3), 0.32);
  ctx.fill('evenodd');
  ctx.restore();
  const mx = cx;
  const my = cy - 17;
  const edge = css(darken(fill, 0.38));
  if (mark === 'heart') heart(ctx, mx, my + 1, 10.5, css(CREAM), edge);
  else if (mark === 'paws') {
    paw(ctx, mx - 11.5, my + 3, -0.3, css(CREAM), edge);
    paw(ctx, mx + 11.5, my + 1, 0.3, css(CREAM), edge);
  } else if (mark === 'star') star(ctx, mx, my + 1, 13.5, css(CREAM), css(darken(fill, 0.42)), 2.2);
  else if (mark === 'smallCapsule') tinyCapsule(ctx, mx, my + 1, mixColor(Color.berry, Color.berryDark, 0.6));
  // The seam, a thin ink line along the join, and the highlight.
  ctx.beginPath();
  ctx.moveTo(cx - R + 1, cy - 1);
  ctx.lineTo(cx + R - 1, cy - 1);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, R - 7, Math.PI * 1.1, Math.PI * 1.42);
  ctx.lineWidth = 4.2;
  ctx.strokeStyle = css(CREAM, 0.8);
  ctx.stroke();
}

/** The lower half of the ball: warm white with a shade and the ink. */
function paintBase(ctx: Ctx): void {
  const R = CAPSULE_R;
  const cx = HALF_CX;
  const cy = BASE_CY;
  const bowl = (): void => {
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI);
    ctx.closePath();
  };
  bowl();
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  bowl();
  ctx.fillStyle = css(BASE_FILL);
  ctx.fill();
  ctx.save();
  bowl();
  ctx.clip();
  ctx.beginPath();
  ctx.arc(cx, cy, R + 3, 0, TAU);
  ctx.arc(cx - 8, cy - 7, R + 1, 0, TAU, true);
  ctx.fillStyle = css(mixColor(Color.kraft, Color.kraftDark, 0.5), 0.34);
  ctx.fill('evenodd');
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(cx - R + 1, cy + 1);
  ctx.lineTo(cx + R - 1, cy + 1);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
}

/** The inside of the base seen from just above: a darker oval with the ink round it. */
function paintMouth(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(MOUTH_W / 2, MOUTH_H / 2, MOUTH_W / 2 - 4, MOUTH_H / 2 - 3, 0, 0, TAU);
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(mixColor(BASE_FILL, Color.kraft, 0.42));
  ctx.fill();
}

/** The second, deeper-pink shell a One More! capsule has inside: a dome that shows through the gap between lid and base. */
function paintPeek(ctx: Ctx): void {
  const c = mixColor(CAPSULE_COLOR.pink, Color.berryDark, 0.45);
  ctx.beginPath();
  ctx.arc(PEEK_W / 2, PEEK_H - 3, PEEK_W / 2 - 5, Math.PI, TAU);
  ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(c);
  ctx.fill();
}

// ── the glyphs of the capsules that open empty ──

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

/** Everything a capsule scene paints with, made once. */
export interface CapsuleArt {
  /** The lid of each kind. */
  readonly lids: Readonly<Record<SpCapsuleKind, Texture>>;
  readonly base: Texture;
  readonly mouth: Texture;
  readonly peek: Texture;
  readonly question: Texture;
  readonly zzz: Texture;
  readonly hollowStar: Texture;
}

let cached: CapsuleArt | null = null;

export function capsuleArt(): CapsuleArt {
  if (cached) return cached;
  const lids = {} as Record<SpCapsuleKind, Texture>;
  const byLook = new Map<string, Texture>();
  for (const kind of SP_CAPSULE_KINDS) {
    const look = capsuleLook(kind);
    const key = `${look.color}/${look.mark}`;
    let t = byLook.get(key);
    if (!t) {
      t = make(`capsule_lid_${key}`, HALF_W, HALF_H, (ctx) => paintLid(ctx, look.color, look.mark));
      byLook.set(key, t);
    }
    lids[kind] = t;
  }
  cached = {
    lids,
    base: make('capsule_base', HALF_W, HALF_H, paintBase),
    mouth: make('capsule_mouth', MOUTH_W, MOUTH_H, paintMouth),
    peek: make('capsule_peek', PEEK_W, PEEK_H, paintPeek),
    question: make('capsule_question', GLYPH, GLYPH, paintQuestion),
    zzz: make('capsule_zzz', GLYPH, GLYPH, paintZzz),
    hollowStar: make('capsule_hollow_star', GLYPH, GLYPH, paintHollowStar),
  };
  return cached;
}

/** Free the textures (a test that paints with a stand-in canvas starts clean). */
export function resetCapsuleArt(): void {
  if (!cached) return;
  const seen = new Set<Texture>();
  for (const t of [...Object.values(cached.lids), cached.base, cached.mouth, cached.peek, cached.question, cached.zzz, cached.hollowStar]) {
    if (seen.has(t)) continue;
    seen.add(t);
    t.destroy(true);
  }
  cached = null;
}

/** Sizes the scene lays the pictures out with (design px). */
export const CAPSULE_PICS = { lidW: HALF_W, lidH: HALF_H, baseW: HALF_W, baseH: HALF_H, mouthW: MOUTH_W, mouthH: MOUTH_H, peekW: PEEK_W, peekH: PEEK_H, glyph: GLYPH } as const;
