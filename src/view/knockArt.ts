/**
 * The little pictures of "Knock It Off!" (docs/design_skills_v2.md 3.8), painted in code on first use (no image file, design decision 20):
 * the glass the queen pushes off the edge, her paw, the deadpan stare in a bubble, the ice a chilled enemy keeps wearing until its shard
 * lands (a block for a frozen one, a frost coat for a slowed one) and the crack the glass leaves where it lands. The director's scene puts
 * them on the field; the shards themselves are the game's own painted `shot_ice` and the flat crystals of the particle atlas.
 *
 * No word on any of them. Every colour is a kit token or a mix of two, in the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { TAU, lighten, mixColor } from '@/core/math';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

const RES = 3;

/** The size of each picture in design px. */
export const GLASS_W = 34;
export const GLASS_H = 44;
export const PAW_W = 34;
export const PAW_H = 30;
export const STARE_W = 52;
export const STARE_H = 44;
export const BLOCK_SIZE = 96;
export const CRACK_SIZE = 128;

type Ctx = CanvasRenderingContext2D;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const INK = Color.inkDeep;
const GLASS = lighten(Hue.ice, 0.62);
const WATER = mixColor(Hue.ice, Color.teal, 0.25);
const ICE = lighten(Hue.ice, 0.35);
const ICE_DEEP = mixColor(Hue.ice, Color.teal, 0.4);
const WHITE = Color.paperLight;
const PINK = mixColor(Color.berry, Color.paperLight, 0.35);

function make(w: number, h: number, label: string, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w * RES;
  canvas.height = h * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('knockArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

function line(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, width: number, color: number, alpha = 1): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = css(color, alpha);
  ctx.stroke();
}

/** A tumbler: wider at the rim, a thick base, a third full of water, a white glint down its side. Its middle is the picture's middle. */
function paintGlass(ctx: Ctx): void {
  const body = (): void => {
    ctx.beginPath();
    ctx.moveTo(4.5, 8);
    ctx.lineTo(29.5, 8);
    ctx.lineTo(26, 37);
    ctx.quadraticCurveTo(25.6, 40.4, 22, 40.4);
    ctx.lineTo(12, 40.4);
    ctx.quadraticCurveTo(8.4, 40.4, 8, 37);
    ctx.closePath();
  };
  body();
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(GLASS);
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  // The water, a wavy top.
  ctx.beginPath();
  ctx.moveTo(0, 24);
  ctx.quadraticCurveTo(8, 20.5, 17, 24);
  ctx.quadraticCurveTo(26, 27.5, 34, 24);
  ctx.lineTo(34, 44);
  ctx.lineTo(0, 44);
  ctx.closePath();
  ctx.fillStyle = css(WATER, 0.9);
  ctx.fill();
  // A thick base.
  ctx.fillStyle = css(Hue.ice, 0.85);
  ctx.fillRect(0, 35, 34, 10);
  ctx.restore();
  // The rim, seen from a little above, and a glint down the left side.
  ctx.beginPath();
  ctx.ellipse(17, 8, 12.5, 3.4, 0, 0, TAU);
  ctx.fillStyle = css(WHITE, 0.9);
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  line(ctx, [[9.4, 13], [11.4, 31]], 2.8, WHITE, 0.95);
  line(ctx, [[22, 31], [23.4, 36]], 1.6, WHITE, 0.8);
}

/** A cat's paw pushing toward the right: a cream blob, three toe beans and a pad. */
function paintPaw(ctx: Ctx): void {
  ctx.beginPath();
  ctx.ellipse(15, 15.5, 12.6, 10.6, 0, 0, TAU);
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  for (const [x, y] of [[26, 9], [28.5, 15.5], [26, 22]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 4.4, 0, TAU);
    ctx.lineWidth = 5;
    ctx.stroke();
  }
  ctx.fillStyle = css(WHITE);
  ctx.beginPath();
  ctx.ellipse(15, 15.5, 12.6, 10.6, 0, 0, TAU);
  ctx.fill();
  for (const [x, y] of [[26, 9], [28.5, 15.5], [26, 22]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 4.4, 0, TAU);
    ctx.fill();
  }
  // Toe beans and the big pad.
  ctx.fillStyle = css(PINK);
  for (const [x, y] of [[26.4, 9], [29, 15.5], [26.4, 22]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, TAU);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.ellipse(16.5, 15.5, 6.2, 5.6, 0, 0, TAU);
  ctx.fill();
}

/** A round bubble with a tail, and in it two deadpan eyes: half-lidded, pupils straight on. Its tip (the tail) is at the bottom middle. */
function paintStare(ctx: Ctx): void {
  const bubble = (): void => {
    ctx.beginPath();
    ctx.ellipse(26, 18, 23, 15.4, 0, 0, TAU);
    ctx.moveTo(21, 31);
    ctx.lineTo(26, 41.4);
    ctx.lineTo(31, 31);
  };
  bubble();
  ctx.lineWidth = 4.6;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(WHITE);
  ctx.fill();
  for (const x of [17.4, 34.6]) {
    ctx.beginPath();
    ctx.arc(x, 19, 7.2, 0, TAU);
    ctx.fillStyle = css(Color.white);
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = css(INK);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 20.6, 3.3, 0, TAU);
    ctx.fillStyle = css(INK);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.9, 19.6, 0.9, 0, TAU);
    ctx.fillStyle = css(Color.white);
    ctx.fill();
    // The lid: a flat cut across the top of the eye, in the bubble's own pale blue.
    ctx.beginPath();
    ctx.moveTo(x - 7.2, 18);
    ctx.arc(x, 19, 7.2, Math.PI, TAU);
    ctx.lineTo(x + 7.2, 18);
    ctx.closePath();
    ctx.fillStyle = css(lighten(Hue.ice, 0.5));
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = css(INK);
    ctx.stroke();
    line(ctx, [[x - 7.4, 17.6], [x + 7.4, 17.6]], 2.2, INK);
  }
}

/** The block of ice a frozen enemy keeps for the moment its shard is in the air: a rounded block, white glints, one crack. */
function paintBlock(ctx: Ctx): void {
  const s = BLOCK_SIZE;
  const block = (): void => {
    ctx.beginPath();
    ctx.roundRect(6, 8, s - 12, s - 14, 20);
  };
  block();
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(ICE);
  ctx.fill();
  ctx.save();
  block();
  ctx.clip();
  // Deeper ice low down, a lighter cap.
  ctx.fillStyle = css(ICE_DEEP, 0.7);
  ctx.fillRect(0, s * 0.62, s, s);
  ctx.fillStyle = css(WHITE, 0.55);
  ctx.fillRect(0, 0, s, s * 0.16);
  ctx.restore();
  // Glints on the top left, a crack down the middle.
  line(ctx, [[18, 30], [18, 50]], 5, WHITE, 0.95);
  line(ctx, [[18, 20], [26, 14]], 5, WHITE, 0.95);
  line(ctx, [[66, 26], [72, 32]], 4, WHITE, 0.9);
  line(ctx, [[52, 10], [48, 30], [57, 44], [50, 62], [58, 80]], 2.6, INK, 0.55);
}

/** The frost coat of a slowed enemy: a scalloped cap of white and pale blue round it, thin, so the enemy shows through. */
function paintFrost(ctx: Ctx): void {
  const s = BLOCK_SIZE;
  const c = s / 2;
  const scallop = (): void => {
    ctx.beginPath();
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      const r = i % 2 === 0 ? 42 : 36.5;
      const x = c + Math.cos(a) * r;
      const y = c + Math.sin(a) * r * 0.94;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  scallop();
  ctx.fillStyle = css(ICE, 0.42);
  ctx.fill();
  ctx.lineWidth = 3.4;
  ctx.strokeStyle = css(ICE_DEEP, 0.95);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c, 29, 0, TAU);
  ctx.lineWidth = 5;
  ctx.strokeStyle = css(WHITE, 0.5);
  ctx.stroke();
  for (const [x, y, r] of [[28, 30, 3.6], [67, 34, 3], [60, 70, 3.4], [34, 66, 2.6], [48, 18, 2.4]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = css(WHITE, 0.95);
    ctx.fill();
  }
}

/** Where the glass broke: a crack star lying on the floor, white lines inside ink ones, a few chips. */
function paintCrack(ctx: Ctx): void {
  const c = CRACK_SIZE / 2;
  const rays: ReadonlyArray<readonly [number, number]> = [
    [0.1, 54], [0.8, 38], [1.45, 58], [2.15, 40], [2.8, 56], [3.55, 36], [4.2, 60], [4.9, 40], [5.6, 52],
  ];
  for (const pass of [0, 1] as const) {
    for (const [a, len] of rays) {
      const mx = c + Math.cos(a + 0.12) * len * 0.5;
      const my = c + Math.sin(a + 0.12) * len * 0.5;
      const pts: Array<readonly [number, number]> = [[c, c], [mx, my], [c + Math.cos(a) * len, c + Math.sin(a) * len]];
      if (pass === 0) line(ctx, pts, 5.2, INK, 0.8);
      else line(ctx, pts, 2.4, WHITE, 0.95);
    }
  }
  ctx.beginPath();
  ctx.arc(c, c, 9, 0, TAU);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = css(INK, 0.8);
  ctx.stroke();
  ctx.fillStyle = css(ICE, 0.9);
  ctx.fill();
}

export interface KnockArt {
  glass: Texture;
  paw: Texture;
  stare: Texture;
  block: Texture;
  frost: Texture;
  crack: Texture;
}

let art: KnockArt | null = null;

/** The pictures of the knock, painted the first time a glass falls (never when skills are off). */
export function knockArt(): KnockArt {
  if (art) return art;
  art = {
    glass: make(GLASS_W, GLASS_H, 'sp_knock_glass', paintGlass),
    paw: make(PAW_W, PAW_H, 'sp_knock_paw', paintPaw),
    stare: make(STARE_W, STARE_H, 'sp_knock_stare', paintStare),
    block: make(BLOCK_SIZE, BLOCK_SIZE, 'sp_knock_block', paintBlock),
    frost: make(BLOCK_SIZE, BLOCK_SIZE, 'sp_knock_frost', paintFrost),
    crack: make(CRACK_SIZE, CRACK_SIZE, 'sp_knock_crack', paintCrack),
  };
  return art;
}

/** Drop the painted pictures (tests). */
export function resetKnockArt(): void {
  if (!art) return;
  for (const t of Object.values(art)) t.destroy(true);
  art = null;
}
