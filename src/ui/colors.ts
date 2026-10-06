import { clamp01, mixColor } from '@/core/math';

/** Rec.601 luma of a 0xRRGGBB colour, 0..255. */
export function luma(c: number): number {
  return 0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff);
}

/** Pull a colour toward its own grey. `amount` 0 = unchanged, 1 = fully grey. */
export function desaturate(c: number, amount: number): number {
  const y = Math.round(luma(c));
  return mixColor(c, (y << 16) | (y << 8) | y, clamp01(amount));
}

/** Positive `t` lightens toward white, negative darkens toward black. */
export function shade(c: number, t: number): number {
  return t >= 0 ? mixColor(c, 0xffffff, t) : mixColor(c, 0x000000, -t);
}

/** h in turns (wraps), s and v in 0..1. Allocation-free so animated rainbows can call it every frame. */
export function hsvToColor(h: number, s: number, v: number): number {
  const hh = (h - Math.floor(h)) * 6;
  const i = Math.floor(hh);
  const f = hh - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r: number;
  let g: number;
  let b: number;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
  }
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

/** Multiply each channel; used to dim a whole palette without changing its hue. */
export function scaleColor(c: number, k: number): number {
  const r = Math.min(255, Math.round(((c >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((c & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

/** Three-stop colour ramp, t in 0..1. */
export function ramp3(a: number, b: number, c: number, t: number): number {
  return t < 0.5 ? mixColor(a, b, t * 2) : mixColor(b, c, (t - 0.5) * 2);
}

/** "rgba()" string for a gradient stop that needs alpha (FillGradient stops are colour strings). */
export function rgba(c: number, alpha: number): string {
  return `rgba(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff},${alpha})`;
}
