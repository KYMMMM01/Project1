export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function remap(v: number, a0: number, a1: number, b0: number, b1: number): number {
  return lerp(b0, b1, clamp01(invLerp(a0, a1, v)));
}

/** Frame-rate independent exponential approach: moves `cur` toward `target`, `halfLife` in seconds. */
export function damp(cur: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (cur - target) * Math.pow(0.5, dt / halfLife);
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Non-deterministic helpers for purely cosmetic randomness (particles, wobble). Never use in the sim. */
export function rand(lo = 0, hi = 1): number {
  return lo + Math.random() * (hi - lo);
}

export function randInt(lo: number, hi: number): number {
  return Math.floor(lo + Math.random() * (hi - lo + 1));
}

export function randSign(): number {
  return Math.random() < 0.5 ? -1 : 1;
}

export function randPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

/** Blend two 0xRRGGBB colors. */
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

export function lighten(c: number, t: number): number {
  return mixColor(c, 0xffffff, t);
}

export function darken(c: number, t: number): number {
  return mixColor(c, 0x000000, t);
}

/** 1234 -> "1,234"; 12_345 -> "12.3K"; 1_234_567 -> "1.23M". Used for every currency and damage readout. */
export function formatNumber(n: number): string {
  const v = Math.floor(Math.abs(n));
  const sign = n < 0 ? '-' : '';
  if (v < 10_000) return sign + v.toLocaleString('en-US');
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let x = v;
  let u = -1;
  while (x >= 1000 && u < units.length - 1) {
    x /= 1000;
    u++;
  }
  const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
  // Truncate rather than round so the readout never shows more than the player actually has.
  const f = Math.pow(10, digits);
  return sign + (Math.floor(x * f) / f).toFixed(digits) + units[u];
}

export function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (x: number) => (x < 10 ? '0' + x : '' + x);
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
