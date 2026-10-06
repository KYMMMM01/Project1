import { Ease, type EaseFn } from '@/core/tween';

/** A fixed number or an inclusive [lo, hi] range sampled uniformly per particle. */
export type Range = number | readonly [number, number];

export function pick(r: Range, rnd: number = Math.random()): number {
  return typeof r === 'number' ? r : r[0] + (r[1] - r[0]) * rnd;
}

export function smoothstep01(x: number): number {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}

/**
 * Alpha envelope over normalised life: fade in over the first `fadeIn` fraction, out over the last
 * `fadeOut` fraction, both smoothstepped so particles never pop on or off.
 */
export function fadeEnvelope(t: number, fadeIn: number, fadeOut: number): number {
  const a = fadeIn > 0 ? smoothstep01(t / fadeIn) : 1;
  const b = fadeOut > 0 ? smoothstep01((1 - t) / fadeOut) : 1;
  return a * b;
}

/**
 * Colour over life with 1..3 stops, interpolated per channel without allocating. `mid` is where the
 * middle stop sits (0..1). Output is packed in either channel order so the same ramp feeds Pixi
 * Particle.color (0xBBGGRR) and plain tints (0xRRGGBB).
 */
export class ColorRamp {
  private r0 = 255;
  private g0 = 255;
  private b0 = 255;
  private r1 = 255;
  private g1 = 255;
  private b1 = 255;
  private r2 = 255;
  private g2 = 255;
  private b2 = 255;
  private n = 1;
  private mid = 0.5;

  set(stops: readonly number[], mid = 0.5): this {
    const n = stops.length > 3 ? 3 : stops.length < 1 ? 1 : stops.length;
    const c0 = stops[0] ?? 0xffffff;
    const c1 = n > 1 ? (stops[1] as number) : c0;
    const c2 = n > 2 ? (stops[2] as number) : c1;
    this.r0 = (c0 >> 16) & 255;
    this.g0 = (c0 >> 8) & 255;
    this.b0 = c0 & 255;
    this.r1 = (c1 >> 16) & 255;
    this.g1 = (c1 >> 8) & 255;
    this.b1 = c1 & 255;
    this.r2 = (c2 >> 16) & 255;
    this.g2 = (c2 >> 8) & 255;
    this.b2 = c2 & 255;
    this.n = n;
    this.mid = mid < 0.05 ? 0.05 : mid > 0.95 ? 0.95 : mid;
    return this;
  }

  /** Same colour for the whole life. */
  setSolid(c: number): this {
    this.r0 = this.r1 = this.r2 = (c >> 16) & 255;
    this.g0 = this.g1 = this.g2 = (c >> 8) & 255;
    this.b0 = this.b1 = this.b2 = c & 255;
    this.n = 1;
    return this;
  }

  /** Packed 0xBBGGRR (Pixi particle byte order) at life fraction t. */
  bgr(t: number): number {
    let r: number;
    let g: number;
    let b: number;
    if (this.n === 1) {
      r = this.r0;
      g = this.g0;
      b = this.b0;
    } else {
      const k = t < 0 ? 0 : t > 1 ? 1 : t;
      if (this.n === 2) {
        r = this.r0 + (this.r1 - this.r0) * k;
        g = this.g0 + (this.g1 - this.g0) * k;
        b = this.b0 + (this.b1 - this.b0) * k;
      } else if (k < this.mid) {
        const u = k / this.mid;
        r = this.r0 + (this.r1 - this.r0) * u;
        g = this.g0 + (this.g1 - this.g0) * u;
        b = this.b0 + (this.b1 - this.b0) * u;
      } else {
        const u = (k - this.mid) / (1 - this.mid);
        r = this.r1 + (this.r2 - this.r1) * u;
        g = this.g1 + (this.g2 - this.g1) * u;
        b = this.b1 + (this.b2 - this.b1) * u;
      }
    }
    return ((b + 0.5) << 16) | ((g + 0.5) << 8) | ((r + 0.5) | 0);
  }

  /** Packed 0xRRGGBB at life fraction t. */
  rgb(t: number): number {
    const c = this.bgr(t);
    return ((c & 255) << 16) | (c & 0xff00) | ((c >> 16) & 255);
  }
}

/**
 * Full-screen flashes in saturated red are the dangerous kind under WCAG 2.3.1 (red share of the
 * colour >= 0.8): wash those toward white and leave every other colour alone.
 */
export function safeFlashColor(c: number): number {
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  const sum = r + g + b;
  if (sum === 0 || r / sum < 0.8) return c;
  const k = 0.55;
  return (
    (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k)
  );
}

/** 0 -> from -> peak -> to. Drives pop-ins whose overshoot settles at `to`. */
export function popCurve(t: number, from: number, peak: number, to: number, split = 0.6): number {
  if (t <= 0) return from;
  if (t >= 1) return to;
  if (t < split) return from + (peak - from) * Ease.cubicOut(t / split);
  return peak + (to - peak) * Ease.quadOut((t - split) / (1 - split));
}

/** Damped spring A·e^(-k·t)·cos(2π·f·t); the guide's "juice_up" wobble. */
export function springWobble(t: number, amp: number, freq: number, decay: number): number {
  return amp * Math.exp(-decay * t) * Math.cos(Math.PI * 2 * freq * t);
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Point on a quadratic bezier, written into `out`. */
export function quadBezier(
  out: Vec2,
  x0: number,
  y0: number,
  cx: number,
  cy: number,
  x1: number,
  y1: number,
  t: number,
): Vec2 {
  const u = 1 - t;
  const a = u * u;
  const b = 2 * u * t;
  const c = t * t;
  out.x = a * x0 + b * cx + c * x1;
  out.y = a * y0 + b * cy + c * y1;
  return out;
}

/**
 * Control point for a flight from (x0,y0) to (x1,y1): the chord midpoint pushed `bulge` px along the
 * chord's perpendicular. A positive bulge curves to the left of the travel direction.
 */
export function bezierControl(out: Vec2, x0: number, y0: number, x1: number, y1: number, bulge: number): Vec2 {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  out.x = (x0 + x1) / 2 + (dy / len) * bulge;
  out.y = (y0 + y1) / 2 - (dx / len) * bulge;
  return out;
}

export { Ease };
export type { EaseFn };
