/**
 * The little pictures of "Jam Session!" (docs/design_skills_v2.md 3.10), painted in code on first use (no image file, design decision 20): the
 * golden note the bard's chord sends out (the game's own painted `shot_note` is the PINK note of the bard's ordinary shot, and a tint cannot turn
 * pink into gold) and the gold crescent a strum sweeps over the lute. The director's scene puts them on the field.
 *
 * No word on any of them. Every colour is a kit token or a mix of two, in the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { lighten, mixColor } from '@/core/math';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

const RES = 3;

/** The note's picture, design px. Its head is at the bottom left, so the picture's middle is a little above the head. */
export const NOTE_W = 44;
export const NOTE_H = 60;
export const STRUM_W = 72;
export const STRUM_H = 56;

type Ctx = CanvasRenderingContext2D;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const INK = Color.inkDeep;
/** The gold of the note: warmer and a touch deeper than the sun so it still reads on the cream paper and on the sunbeam tile. */
export const NOTE_GOLD = mixColor(Color.mustard, Hue.sun, 0.35);
const GOLD_DEEP = Color.mustardDark;
const GOLD_LIGHT = lighten(NOTE_GOLD, 0.55);

function make(w: number, h: number, label: string, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w * RES;
  canvas.height = h * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('jamArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

/** A golden eighth note: a round head, a stem and a flag, a dark outline all round, a white glint on the head and a deeper gold along its underside. */
function paintNote(ctx: Ctx): void {
  const hx = 14.5;
  const hy = 45;
  const stemX = 24.2;
  const top = 7;
  // The outline of the whole figure first (one dark shape), then the gold laid over it, so the outline is even all round.
  ctx.fillStyle = css(INK);
  ctx.strokeStyle = css(INK);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 12.4, 9.4, -0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8.6;
  ctx.beginPath();
  ctx.moveTo(stemX, hy - 6);
  ctx.lineTo(stemX, top + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(stemX, top + 2);
  ctx.bezierCurveTo(stemX + 11, top + 4, stemX + 15, top + 14, stemX + 9, top + 25);
  ctx.stroke();

  ctx.fillStyle = css(NOTE_GOLD);
  ctx.strokeStyle = css(NOTE_GOLD);
  ctx.beginPath();
  ctx.ellipse(hx, hy, 9.8, 6.9, -0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(stemX, hy - 6);
  ctx.lineTo(stemX, top + 3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(stemX, top + 2);
  ctx.bezierCurveTo(stemX + 11, top + 4, stemX + 15, top + 14, stemX + 9, top + 25);
  ctx.stroke();
  // The deeper gold along the underside of the head and the flag's inner edge, and a glint.
  ctx.strokeStyle = css(GOLD_DEEP, 0.85);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 8.2, 5.4, -0.42, 0.35, 2.15);
  ctx.stroke();
  ctx.strokeStyle = css(GOLD_LIGHT, 0.95);
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.ellipse(hx, hy, 7.4, 4.8, -0.42, 3.6, 4.5);
  ctx.stroke();
  ctx.fillStyle = css(Color.paperLight, 0.9);
  ctx.beginPath();
  ctx.ellipse(hx - 3.4, hy - 2.6, 2.4, 1.5, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

/** The crescent of a strum: a fat gold arc with a cream edge, thick in the middle and thin at both ends, opening toward the bottom right. */
function paintStrum(ctx: Ctx): void {
  const cx = STRUM_W * 0.62;
  const cy = STRUM_H * 0.62;
  const rOut = 26;
  const rIn = 17;
  const a0 = Math.PI * 1.05;
  const a1 = Math.PI * 1.95;
  const shape = (grow: number): void => {
    ctx.beginPath();
    ctx.arc(cx, cy, rOut + grow, a0 - 0.04, a1 + 0.04);
    ctx.arc(cx + 5, cy + 5, rIn - grow, a1 + 0.04, a0 - 0.04, true);
    ctx.closePath();
  };
  shape(2.2);
  ctx.fillStyle = css(INK);
  ctx.fill();
  shape(0);
  ctx.fillStyle = css(NOTE_GOLD);
  ctx.fill();
  ctx.save();
  shape(0);
  ctx.clip();
  ctx.strokeStyle = css(GOLD_LIGHT, 0.95);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, rOut - 3.4, a0 + 0.1, a1 - 0.1);
  ctx.stroke();
  ctx.restore();
}

export interface JamArt {
  note: Texture;
  strum: Texture;
}

let art: JamArt | null = null;

/** The pictures, painted on first use (a battle without a bard never paints them). */
export function jamArt(): JamArt {
  art ??= {
    note: make(NOTE_W, NOTE_H, 'sp_jam_note', paintNote),
    strum: make(STRUM_W, STRUM_H, 'sp_jam_strum', paintStrum),
  };
  return art;
}
