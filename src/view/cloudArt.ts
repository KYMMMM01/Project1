/**
 * The little black cloud of "Tagalong Cloud" (docs/design_skills_v2.md 3.7), painted in code on first use (no image file, design decision 20):
 * one cloud body and five faces for it, the moods the scene shows (grumpy while it trots along, a squeezed-eyes zap when a bolt falls, startled
 * in the air between two hosts, a sigh at the end of its time, and a sad one when it lost its host with nobody near). The face is a separate
 * picture laid on the body, so a mood changes one texture and nothing is painted per frame.
 *
 * No word on any of them. Every colour is a kit token or a mix of two, in the same thick brown ink as the rest of the art.
 */
import { CanvasSource, Texture } from 'pixi.js';
import { TAU, darken, lighten, mixColor } from '@/core/math';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

const RES = 3;

/** The size of the cloud (and of each face) in design px, and the middle of the face (from the picture's top-left). */
export const CLOUD_W = 72;
export const CLOUD_H = 52;
export const FACE_AT = { x: 36, y: 33 } as const;

export type CloudMood = 'grumpy' | 'zap' | 'startled' | 'sigh' | 'sad';
export const CLOUD_MOODS: readonly CloudMood[] = ['grumpy', 'zap', 'startled', 'sigh', 'sad'];

type Ctx = CanvasRenderingContext2D;

const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

const INK = Color.inkDeep;
/** A storm cloud's slate: the ice blue of the game, pulled almost to ink, so it is dark on the warm floor and still has a hue. */
export const CLOUD_BODY = mixColor(Hue.ice, Color.inkDeep, 0.74);
const CLOUD_HIGH = lighten(CLOUD_BODY, 0.34);
const CLOUD_BELLY = darken(CLOUD_BODY, 0.3);
const TEAR = Hue.ice;

function make(label: string, draw: (ctx: Ctx) => void): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = CLOUD_W * RES;
  canvas.height = CLOUD_H * RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('cloudArt: 2D canvas unavailable');
  ctx.scale(RES, RES);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: RES, autoGarbageCollect: false }), label });
}

/** The cloud's outline, as one path: three lobes and a flat, round-cornered belly. */
function silhouette(ctx: Ctx): void {
  ctx.beginPath();
  ctx.arc(20, 31, 13, 0, TAU);
  ctx.moveTo(53 + 14, 30);
  ctx.arc(53, 30, 14, 0, TAU);
  ctx.moveTo(36 + 17, 22);
  ctx.arc(36, 22, 17, 0, TAU);
  ctx.roundRect(11, 30, 50, 14, 7);
}

function paintBody(ctx: Ctx): void {
  // Ink first, under the fill: the union of the shapes grows a line round the whole cloud.
  silhouette(ctx);
  ctx.lineWidth = 7;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.fillStyle = css(CLOUD_BODY);
  ctx.fill();
  ctx.save();
  silhouette(ctx);
  ctx.clip();
  // The belly: a darker band under the face.
  ctx.beginPath();
  ctx.ellipse(36, 47, 31, 11, 0, 0, TAU);
  ctx.fillStyle = css(CLOUD_BELLY);
  ctx.fill();
  ctx.restore();
  // Two highlights on the top lobes.
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(CLOUD_HIGH, 0.95);
  ctx.beginPath();
  ctx.arc(36, 22, 11.6, Math.PI * 1.08, Math.PI * 1.46);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(20, 31, 7.6, Math.PI * 1.02, Math.PI * 1.4);
  ctx.stroke();
}

function eye(ctx: Ctx, x: number, y: number, rx: number, ry: number, px: number, py: number, pr: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = css(Color.paperLight);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = css(INK);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + px, y + py, pr, 0, TAU);
  ctx.fillStyle = css(INK);
  ctx.fill();
}

function line(ctx: Ctx, pts: ReadonlyArray<readonly [number, number]>, width: number, color: number): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.lineWidth = width;
  ctx.strokeStyle = css(color);
  ctx.stroke();
}

const FACES: Record<CloudMood, (ctx: Ctx) => void> = {
  // Cross: two cream eyes with small pupils, thick brows slanting down toward the nose, a frown.
  grumpy(ctx) {
    eye(ctx, 27.5, 31.5, 4.6, 5.2, 0.8, 1.2, 2.3);
    eye(ctx, 44.5, 31.5, 4.6, 5.2, -0.8, 1.2, 2.3);
    line(ctx, [[21.5, 24.2], [31, 28]], 3.2, INK);
    line(ctx, [[50.5, 24.2], [41, 28]], 3.2, INK);
    ctx.beginPath();
    ctx.arc(36, 45.5, 6, Math.PI * 1.18, Math.PI * 1.82);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = css(INK);
    ctx.stroke();
  },
  // A bolt is falling: eyes squeezed into chevrons, a wide open mouth.
  zap(ctx) {
    line(ctx, [[23.5, 27.5], [30.5, 31.5], [23.5, 35.5]], 2.8, INK);
    line(ctx, [[48.5, 27.5], [41.5, 31.5], [48.5, 35.5]], 2.8, INK);
    ctx.beginPath();
    ctx.ellipse(36, 41.4, 6.4, 4.6, 0, 0, TAU);
    ctx.fillStyle = css(INK);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(36, 43.2, 3.6, 2, 0, 0, TAU);
    ctx.fillStyle = css(Color.coral);
    ctx.fill();
    line(ctx, [[22, 21.5], [29.5, 24]], 2.8, INK);
    line(ctx, [[50, 21.5], [42.5, 24]], 2.8, INK);
  },
  // Caught in the air: round eyes with pin-prick pupils, brows up, a small round mouth.
  startled(ctx) {
    eye(ctx, 27.5, 31, 5.4, 6, 0, 0, 1.5);
    eye(ctx, 44.5, 31, 5.4, 6, 0, 0, 1.5);
    ctx.beginPath();
    ctx.arc(27.5, 21.4, 5.4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = css(INK);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(44.5, 21.4, 5.4, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(36, 43, 3, 3.8, 0, 0, TAU);
    ctx.fillStyle = css(INK);
    ctx.fill();
  },
  // Out of puff: half-lidded eyes looking down, brows slanting up and out, a small round mouth blowing to the side.
  sigh(ctx) {
    for (const x of [27.5, 44.5]) {
      ctx.beginPath();
      ctx.ellipse(x, 32.4, 4.6, 4.4, 0, 0, Math.PI);
      ctx.fillStyle = css(Color.paperLight);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + 0.5, 33.4, 2.1, 0, TAU);
      ctx.fillStyle = css(INK);
      ctx.fill();
      line(ctx, [[x - 5.4, 31.4], [x + 5.4, 31.4]], 2.8, INK);
    }
    line(ctx, [[21.5, 26.6], [31.5, 24.2]], 2.6, INK);
    line(ctx, [[50.5, 26.6], [40.5, 24.2]], 2.6, INK);
    ctx.beginPath();
    ctx.ellipse(41, 43.4, 2.6, 3, 0, 0, TAU);
    ctx.fillStyle = css(INK);
    ctx.fill();
  },
  // Lost its host: big wet eyes, brows slanting up toward the nose, a wobbly frown and one tear.
  sad(ctx) {
    eye(ctx, 27.5, 32, 5, 5.6, 0, 1.4, 2.8);
    eye(ctx, 44.5, 32, 5, 5.6, 0, 1.4, 2.8);
    for (const x of [26.4, 43.4]) {
      ctx.beginPath();
      ctx.arc(x, 30.6, 1.2, 0, TAU);
      ctx.fillStyle = css(Color.paperLight);
      ctx.fill();
    }
    line(ctx, [[21.5, 25.8], [31, 22.6]], 2.8, INK);
    line(ctx, [[50.5, 25.8], [41, 22.6]], 2.8, INK);
    line(ctx, [[30.5, 44], [33.2, 42.2], [36, 44], [38.8, 42.2], [41.5, 44]], 2.4, INK);
    ctx.beginPath();
    ctx.ellipse(23.4, 40.6, 2.2, 3.2, 0, 0, TAU);
    ctx.fillStyle = css(TEAR);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = css(INK);
    ctx.stroke();
  },
};

export interface CloudArt {
  body: Texture;
  faces: Record<CloudMood, Texture>;
}

let art: CloudArt | null = null;

/** The cloud's pictures, painted the first time a cloud is cast (never when skills are off). */
export function cloudArt(): CloudArt {
  if (art) return art;
  const faces = {} as Record<CloudMood, Texture>;
  for (const m of CLOUD_MOODS) faces[m] = make(`sp_cloud_${m}`, FACES[m]);
  art = { body: make('sp_cloud_body', paintBody), faces };
  return art;
}

/** Drop the painted pictures (tests, a restart of the whole page's art). */
export function resetCloudArt(): void {
  if (!art) return;
  art.body.destroy(true);
  for (const m of CLOUD_MOODS) art.faces[m].destroy(true);
  art = null;
}
