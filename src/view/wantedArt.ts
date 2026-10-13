/**
 * The little pictures of "Wanted: One Shot!" (docs/design_skills_v2.md 3.5), painted in code on first use (no image file, design decision 14):
 * the poster's paper, the two eggs of a pool (empty and filled), the "case closed" stamp and the hole a cork leaves. The director's scene
 * puts them on the target, the boss strip puts the eggs and the stamp on the boss's name tag, so they live here, beside neither.
 *
 * None of them carries a word: the game has no string for "wanted" or "case closed" yet, so the poster's lettering is blocks of ink and the
 * stamp is a seal with a tick. Every colour is a kit token or a mix of two, in the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { TAU, mixColor } from '@/core/math';
import { Color } from '@/ui/theme';

const RES = 3;

/** The size of each picture in design px. */
export const POSTER_W = 100;
export const POSTER_H = 132;
export const EGG_SIZE = 24;
export const STAMP_SIZE = 64;
export const HOLE_SIZE = 36;
/** The window of the poster the target's portrait is put in: its centre and its side (design px from the poster's top-left). */
export const PORTRAIT_AT = { x: 50, y: 65, side: 54 } as const;
/** Where the two eggs hang under the poster's lettering (design px from the poster's top-left). */
export const EGG_SLOTS = [{ x: 36, y: 118 }, { x: 64, y: 118 }] as const;

type Ctx = CanvasRenderingContext2D;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

export const PAPER_OLD = mixColor(Color.paper, Color.kraft, 0.4);
const TAPE = mixColor(Color.mustard, Color.paperLight, 0.4);
export const STAMP_RED = Color.berryDark;
/** What a target's portrait is tinted on the poster: a photograph gone brown. */
export const SEPIA = mixColor(Color.paper, Color.bronze, 0.7);

function make(w: number, h: number, label: string, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w * RES;
  canvas.height = h * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('wantedArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

function poly(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, dx = 0, dy = 0): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + dx, y + dy) : ctx.lineTo(x + dx, y + dy)));
  ctx.closePath();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** The outline of the paper: a rectangle with its corners cut and a nick or two along its edges, as if torn off a wall. */
const SHEET: ReadonlyArray<readonly [number, number]> = [
  [8, 3], [30, 4.2], [52, 2.6], [76, 4], [92, 3.2], [97, 9], [95.6, 40], [97.4, 78], [95.2, 114], [96.2, 124], [90, 129],
  [66, 127.6], [40, 129.4], [14, 127.8], [4, 129], [3, 120], [4.4, 90], [2.6, 58], [4, 24], [2.8, 10],
];

function paintPoster(ctx: Ctx): void {
  poly(ctx, SHEET, 2.2, 3.2);
  ctx.fillStyle = css(Color.shadow, 0.3);
  ctx.fill();
  poly(ctx, SHEET);
  ctx.fillStyle = css(PAPER_OLD);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(Color.ink);
  ctx.stroke();

  // The heading: a black band with blocks of cream for lettering.
  roundRect(ctx, 13, 11, 74, 17, 4);
  ctx.fillStyle = css(Color.ink);
  ctx.fill();
  ctx.fillStyle = css(Color.paperLight);
  for (let i = 0; i < 6; i++) {
    roundRect(ctx, 18.5 + i * 11.6, 15.5, 8, 8, 1.6);
    ctx.fill();
  }

  // The window for the portrait.
  const { x, y, side } = PORTRAIT_AT;
  roundRect(ctx, x - side / 2 - 3, y - side / 2 - 3, side + 6, side + 6, 3);
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = css(Color.ink);
  ctx.stroke();

  // The reward lines under it.
  ctx.fillStyle = css(Color.ink, 0.78);
  roundRect(ctx, 17, 99, 66, 5, 2.4);
  ctx.fill();
  ctx.fillStyle = css(Color.ink, 0.6);
  roundRect(ctx, 27, 107, 46, 4, 2);
  ctx.fill();

  // Two strips of tape across the top corners.
  for (const [cx, cy, rot] of [[14, 8, -0.62], [86, 8, 0.62]] as const) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    roundRect(ctx, -14, -5.6, 28, 11.2, 1.6);
    ctx.fillStyle = css(TAPE, 0.92);
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = css(Color.kraftDark, 0.9);
    ctx.stroke();
    ctx.restore();
  }
}

function paintEgg(ctx: Ctx, full: boolean): void {
  const cx = EGG_SIZE / 2;
  const cy = EGG_SIZE / 2 + 0.6;
  ctx.beginPath();
  ctx.ellipse(cx + 0.6, cy + 1.4, 7.4, 9.4, 0, 0, TAU);
  ctx.fillStyle = css(Color.shadow, 0.3);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 7.4, 9.4, 0, 0, TAU);
  ctx.fillStyle = css(full ? Color.mustard : Color.paperDim);
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = css(Color.ink);
  ctx.stroke();
  if (full) {
    ctx.beginPath();
    ctx.ellipse(cx - 2.4, cy - 3.2, 1.9, 2.8, -0.4, 0, TAU);
    ctx.fillStyle = css(Color.paperLight, 0.95);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 0.6, 3.4, 4.6, 0, 0, TAU);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([2, 2.4]);
    ctx.strokeStyle = css(Color.kraftDark, 0.8);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** The double ring of a seal, haloed in cream so that it reads on a dark portrait as well as on paper. */
function paintSealRing(ctx: Ctx): void {
  const c = STAMP_SIZE / 2;
  const ring = (r: number, w: number, color: number, a = 1): void => {
    ctx.beginPath();
    ctx.arc(c, c, r, 0, TAU);
    ctx.lineWidth = w;
    ctx.strokeStyle = css(color, a);
    ctx.stroke();
  };
  ctx.beginPath();
  ctx.arc(c, c, 27, 0, TAU);
  ctx.fillStyle = css(Color.paperLight, 0.55);
  ctx.fill();
  ring(27, 8, Color.paperLight);
  ring(21, 5, Color.paperLight);
  ring(27, 4.2, STAMP_RED);
  ring(21, 2, STAMP_RED);
}

/** The poster's seal: a double ring with a tick in it. */
function paintStamp(ctx: Ctx): void {
  const c = STAMP_SIZE / 2;
  const tick = (): void => {
    ctx.beginPath();
    ctx.moveTo(c - 13, c + 1);
    ctx.lineTo(c - 4, c + 11);
    ctx.lineTo(c + 14, c - 11);
  };
  paintSealRing(ctx);
  tick();
  ctx.lineWidth = 12.5;
  ctx.strokeStyle = css(Color.paperLight);
  ctx.stroke();
  tick();
  ctx.lineWidth = 7.5;
  ctx.strokeStyle = css(STAMP_RED);
  ctx.stroke();
}

/**
 * The boss strip's seal: the same double ring with a PADLOCK in it. The strip already has a green tick (the estimate: "you will make it"); a red
 * tick on the boss's face meant the opposite with the same glyph, so the seal that is stamped on the strip is a lock: the case is shut.
 */
function paintLock(ctx: Ctx): void {
  const c = STAMP_SIZE / 2;
  paintSealRing(ctx);
  const shackle = (): void => {
    ctx.beginPath();
    ctx.arc(c, c - 3, 8.5, Math.PI, 0);
    ctx.lineTo(c + 8.5, c + 2);
    ctx.moveTo(c - 8.5, c - 3);
    ctx.lineTo(c - 8.5, c + 2);
  };
  shackle();
  ctx.lineWidth = 11;
  ctx.strokeStyle = css(Color.paperLight);
  ctx.stroke();
  shackle();
  ctx.lineWidth = 5.4;
  ctx.strokeStyle = css(STAMP_RED);
  ctx.stroke();
  roundRect(ctx, c - 14, c - 1, 28, 21, 4.5);
  ctx.fillStyle = css(STAMP_RED);
  ctx.fill();
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = css(Color.paperLight);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(c, c + 8, 3.2, 0, TAU);
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  ctx.fillRect(c - 1.3, c + 9, 2.6, 6);
}

/** A hole torn through paper: a ragged cream lip round a dark middle. */
function paintHole(ctx: Ctx): void {
  const c = HOLE_SIZE / 2;
  const ragged = (r: number, jag: number, n: number, turn: number): void => {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = turn + (i * Math.PI) / n;
      const rr = i % 2 === 0 ? r : r - jag * (0.6 + 0.4 * ((i * 7) % 5) / 4);
      const x = c + Math.cos(a) * rr;
      const y = c + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  ragged(16.5, 5.5, 7, 0.3);
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = css(Color.ink, 0.9);
  ctx.stroke();
  ragged(11, 3, 6, 0.9);
  ctx.fillStyle = css(Color.inkDeep);
  ctx.fill();
}

export interface WantedArt {
  poster: Texture;
  eggEmpty: Texture;
  eggFull: Texture;
  stamp: Texture;
  /** The seal of the boss strip (a padlock in the same ring). */
  lock: Texture;
  hole: Texture;
}

let art: WantedArt | null = null;

/** All the pictures, painted the first time they are asked for. */
export function wantedArt(): WantedArt {
  art ??= {
    poster: make(POSTER_W, POSTER_H, 'sp_wanted_poster', paintPoster),
    eggEmpty: make(EGG_SIZE, EGG_SIZE, 'sp_wanted_egg0', (ctx) => paintEgg(ctx, false)),
    eggFull: make(EGG_SIZE, EGG_SIZE, 'sp_wanted_egg1', (ctx) => paintEgg(ctx, true)),
    stamp: make(STAMP_SIZE, STAMP_SIZE, 'sp_wanted_stamp', paintStamp),
    lock: make(STAMP_SIZE, STAMP_SIZE, 'sp_wanted_lock', paintLock),
    hole: make(HOLE_SIZE, HOLE_SIZE, 'sp_wanted_hole', paintHole),
  };
  return art;
}
