import { Graphics } from 'pixi.js';
import { Color } from './theme';
import { shade } from './colors';
import { cacheStatic, vGradient } from './shapes';

export const ICON_NAMES = [
  'close', 'back', 'settings', 'sound_on', 'sound_off', 'music', 'lock', 'check', 'plus', 'minus',
  'play', 'pause', 'fast_forward', 'info', 'question', 'home', 'cards', 'shop', 'trophy', 'mission',
  'gift', 'star', 'crown', 'paw', 'heart', 'clock', 'ad', 'coin', 'gem', 'energy',
  'arrow_up', 'swords', 'shield', 'reroll', 'sell', 'skull', 'chest', 'fish', 'lucky_clover', 'dice', 'warning',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

type Fill = number | readonly [top: number, bottom: number];

const PI = Math.PI;

/** Two-tone ramp for a flat colour: lit top, slightly deeper (and a touch violet) bottom. */
function tone(c: number): readonly [number, number] {
  return [shade(c, 0.28), shade(c, -0.2)];
}

/**
 * Drawing context for one icon. Icons are authored in a 100-unit box centred on the origin and the
 * pen scales every coordinate to the requested pixel size, so shapes are tessellated at their final
 * size (rotating/scaling a pre-built Graphics would leave polygonal curves).
 */
class Pen {
  private cos = 1;
  private sin = 0;
  private ox = 0;
  private oy = 0;
  private rot = 0;
  private sc = 1;

  constructor(
    readonly g: Graphics,
    readonly u: number,
  ) {}

  /** Move/rotate/scale the local frame (sword, tilted card). Pass nothing to reset. */
  at(x = 0, y = 0, rot = 0, scale = 1): this {
    this.ox = x;
    this.oy = y;
    this.rot = rot;
    this.sc = scale;
    this.cos = Math.cos(rot);
    this.sin = Math.sin(rot);
    return this;
  }

  private tx(x: number, y: number): number {
    return ((x * this.cos - y * this.sin) * this.sc + this.ox) * this.u;
  }

  private ty(x: number, y: number): number {
    return ((x * this.sin + y * this.cos) * this.sc + this.oy) * this.u;
  }

  private get framed(): boolean {
    return this.rot !== 0 || this.sc !== 1;
  }

  circle(x: number, y: number, r: number): this {
    this.g.circle(this.tx(x, y), this.ty(x, y), r * this.sc * this.u);
    return this;
  }

  ellipse(x: number, y: number, rx: number, ry: number, rot = 0): this {
    if (!this.framed && rot === 0) {
      this.g.ellipse(this.tx(x, y), this.ty(x, y), rx * this.u, ry * this.u);
      return this;
    }
    const n = 28;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * PI * 2;
      const lx = Math.cos(a) * rx;
      const ly = Math.sin(a) * ry;
      const px = x + lx * c - ly * s;
      const py = y + lx * s + ly * c;
      pts.push(this.tx(px, py), this.ty(px, py));
    }
    this.g.poly(pts);
    return this;
  }

  poly(pts: readonly number[]): this {
    const out: number[] = [];
    for (let i = 0; i < pts.length; i += 2) out.push(this.tx(pts[i] as number, pts[i + 1] as number), this.ty(pts[i] as number, pts[i + 1] as number));
    this.g.poly(out);
    return this;
  }

  /** Polygon with rounded corners (quadratic through each vertex). */
  rpoly(pts: readonly number[], r: number): this {
    const n = pts.length / 2;
    const px: number[] = [];
    const py: number[] = [];
    for (let i = 0; i < n; i++) {
      px.push(this.tx(pts[i * 2] as number, pts[i * 2 + 1] as number));
      py.push(this.ty(pts[i * 2] as number, pts[i * 2 + 1] as number));
    }
    const g = this.g;
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n;
      const q = (i + 1) % n;
      const d1x = (px[p] as number) - (px[i] as number);
      const d1y = (py[p] as number) - (py[i] as number);
      const d2x = (px[q] as number) - (px[i] as number);
      const d2y = (py[q] as number) - (py[i] as number);
      const l1 = Math.hypot(d1x, d1y);
      const l2 = Math.hypot(d2x, d2y);
      const rr = Math.min(r * this.sc * this.u, l1 / 2, l2 / 2);
      const ax = (px[i] as number) + (d1x / l1) * rr;
      const ay = (py[i] as number) + (d1y / l1) * rr;
      const bx = (px[i] as number) + (d2x / l2) * rr;
      const by = (py[i] as number) + (d2y / l2) * rr;
      if (i === 0) g.moveTo(ax, ay);
      else g.lineTo(ax, ay);
      g.quadraticCurveTo(px[i] as number, py[i] as number, bx, by);
    }
    g.closePath();
    return this;
  }

  rect(x: number, y: number, w: number, h: number): this {
    return this.poly([x, y, x + w, y, x + w, y + h, x, y + h]);
  }

  rrect(x: number, y: number, w: number, h: number, r: number): this {
    if (!this.framed) {
      this.g.roundRect(this.tx(x, y), this.ty(x, y), w * this.u, h * this.u, r * this.u);
      return this;
    }
    return this.rpoly([x, y, x + w, y, x + w, y + h, x, y + h], r);
  }

  /** Thick bar between two points, rounded at its corners. */
  bar(x1: number, y1: number, x2: number, y2: number, th: number): this {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (th / 2);
    const ny = (dx / l) * (th / 2);
    return this.rpoly([x1 + nx, y1 + ny, x2 + nx, y2 + ny, x2 - nx, y2 - ny, x1 - nx, y1 - ny], th * 0.42);
  }

  star(x: number, y: number, outer: number, inner: number, points: number, round = 0): this {
    const pts: number[] = [];
    for (let i = 0; i < points * 2; i++) {
      const a = -PI / 2 + (i * PI) / points;
      const r = i % 2 === 0 ? outer : inner;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    return round > 0 ? this.rpoly(pts, round) : this.poly(pts);
  }

  m(x: number, y: number): this {
    this.g.moveTo(this.tx(x, y), this.ty(x, y));
    return this;
  }

  l(x: number, y: number): this {
    this.g.lineTo(this.tx(x, y), this.ty(x, y));
    return this;
  }

  /** Cubic bezier to (x, y). */
  c(x1: number, y1: number, x2: number, y2: number, x: number, y: number): this {
    this.g.bezierCurveTo(this.tx(x1, y1), this.ty(x1, y1), this.tx(x2, y2), this.ty(x2, y2), this.tx(x, y), this.ty(x, y));
    return this;
  }

  /** Arc around (cx, cy); starts a new sub-path at the arc start. */
  arc(cx: number, cy: number, r: number, a0: number, a1: number): this {
    this.g.moveTo(this.tx(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r), this.ty(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r));
    this.g.arc(this.tx(cx, cy), this.ty(cx, cy), r * this.sc * this.u, a0 + this.rot, a1 + this.rot);
    return this;
  }

  close(): this {
    this.g.closePath();
    return this;
  }
}

function fillOf(f: Fill): number | ReturnType<typeof vGradient> {
  return typeof f === 'number' ? f : vGradient(f[0], f[1]);
}

/** Painter: every shape is an outlined solid (silhouette pass, then fill pass) so overlapping parts merge cleanly. */
class Ink {
  readonly pen: Pen;
  /** Outline half-thickness in px. */
  readonly ow: number;

  constructor(
    readonly g: Graphics,
    size: number,
    private readonly outline: number,
  ) {
    this.pen = new Pen(g, size / 100);
    this.ow = Math.max(1.6, size * 0.062);
  }

  /** Outlined, filled shape(s). */
  solid(fill: Fill, build: (p: Pen) => void): this {
    build(this.pen);
    this.g.fill(this.outline).stroke({ width: this.ow * 2, color: this.outline, join: 'round', cap: 'round' });
    build(this.pen);
    this.g.fill(fillOf(fill));
    return this;
  }

  /** Fill only, drawn on top of solids (highlights, glyph marks). */
  detail(fill: Fill, build: (p: Pen) => void, alpha = 1): this {
    build(this.pen);
    const f = fillOf(fill);
    if (typeof f === 'number') this.g.fill({ color: f, alpha });
    else this.g.fill(f);
    return this;
  }

  /** Outlined stroked path. `hi` adds a lighter core line that gives round strokes a tube-like sheen. */
  line(color: number, width: number, build: (p: Pen) => void, opts: { outline?: boolean; hi?: boolean } = {}): this {
    const u = this.pen.u;
    if (opts.outline !== false) {
      build(this.pen);
      this.g.stroke({ width: width * u + this.ow * 2, color: this.outline, join: 'round', cap: 'round' });
    }
    build(this.pen);
    this.g.stroke({ width: width * u, color, join: 'round', cap: 'round' });
    if (opts.hi) {
      build(this.pen);
      this.g.stroke({ width: Math.max(1, width * u * 0.3), color: shade(color, 0.6), alpha: 0.75, join: 'round', cap: 'round' });
    }
    return this;
  }

  /**
   * Stroked arcs and filled shapes merged under one outline (a refresh arrow: the arc runs straight
   * into its head with no seam).
   */
  merged(fill: Fill, width: number, paths: (p: Pen) => void, shapes: (p: Pen) => void): this {
    const u = this.pen.u;
    paths(this.pen);
    this.g.stroke({ width: width * u + this.ow * 2, color: this.outline, join: 'round', cap: 'round' });
    shapes(this.pen);
    this.g.fill(this.outline).stroke({ width: this.ow * 2, color: this.outline, join: 'round', cap: 'round' });
    paths(this.pen);
    const f = fillOf(fill);
    this.g.stroke(typeof f === 'number' ? { width: width * u, color: f, join: 'round', cap: 'round' } : { width: width * u, fill: f, join: 'round', cap: 'round' });
    shapes(this.pen);
    this.g.fill(f);
    return this;
  }

  /** Thin stroked path without outline. */
  stroke(color: number, width: number, build: (p: Pen) => void, alpha = 1): this {
    build(this.pen);
    this.g.stroke({ width: width * this.pen.u, color, alpha, join: 'round', cap: 'round' });
    return this;
  }
}

type IconDraw = (k: Ink, c: number) => void;

interface IconDef {
  /** Default main colour. */
  color: number;
  draw: IconDraw;
}

const WHITE = 0xffffff;
const GOLD: Fill = [0xffe48a, 0xf2a41c];
const SHEEN = 0.55;

function gloss(k: Ink, build: (p: Pen) => void): void {
  k.detail(WHITE, build, SHEEN);
}

function shieldPath(p: Pen, s: number): void {
  p.m(-34 * s, -34 * s)
    .l(34 * s, -34 * s)
    .l(34 * s, 4 * s)
    .c(34 * s, 24 * s, 16 * s, 36 * s, 0, 44 * s)
    .c(-16 * s, 36 * s, -34 * s, 24 * s, -34 * s, 4 * s)
    .close();
}

function leafPath(p: Pen): void {
  p.m(0, -3)
    .c(-8, -8, -20, -14, -20, -26)
    .c(-20, -36, -8, -40, 0, -30)
    .c(8, -40, 20, -36, 20, -26)
    .c(20, -14, 8, -8, 0, -3)
    .close();
}

function speaker(k: Ink, c: number): void {
  k.solid(tone(c), (p) => p.rpoly([-40, -12, -26, -12, -6, -30, -6, 30, -26, 12, -40, 12], 4));
}

function sword(k: Ink, rot: number, blade: number): void {
  const p = k.pen;
  p.at(0, 0, rot, 1.22);
  k.solid(tone(blade), (q) => q.rpoly([0, -47, 8, -37, 8, 10, -8, 10, -8, -37], 2.5));
  k.detail(WHITE, (q) => q.rrect(-3.5, -36, 3, 40, 1.5), 0.6);
  k.solid([0xffe27a, 0xd98a0a], (q) => q.rrect(-18, 7, 36, 10, 4));
  k.solid([0xb06a32, 0x6e3a14], (q) => q.rrect(-4.5, 15, 9, 18, 3));
  k.solid([0xffe27a, 0xd98a0a], (q) => q.circle(0, 36, 6.5));
  p.at();
}

function reroll(k: Ink, c: number): void {
  const r = 27;
  const arcs = [-3.0, -3.0 + PI];
  const span = 2.55;
  k.merged(
    tone(c),
    11,
    (p) => {
      for (const a0 of arcs) p.arc(0, 0, r, a0, a0 + span);
    },
    (p) => {
      for (const a0 of arcs) {
        const a1 = a0 + span;
        const px = Math.cos(a1) * r;
        const py = Math.sin(a1) * r;
        const tx = -Math.sin(a1);
        const ty = Math.cos(a1);
        const nx = Math.cos(a1);
        const ny = Math.sin(a1);
        p.rpoly([px + tx * 24, py + ty * 24, px + nx * 17, py + ny * 17, px - nx * 17, py - ny * 17], 4);
      }
    },
  );
}

const ICONS: Record<IconName, IconDef> = {
  close: {
    color: WHITE,
    draw: (k, c) =>
      k.solid(tone(c), (p) => {
        p.bar(-22, -22, 22, 22, 18);
        p.bar(22, -22, -22, 22, 18);
      }),
  },
  back: {
    color: WHITE,
    draw: (k, c) => k.solid(tone(c), (p) => p.rpoly([-36, 0, -6, -32, -6, -15, 36, -15, 36, 15, -6, 15, -6, 32], 5)),
  },
  settings: {
    color: 0xe4eafa,
    draw: (k, c) => {
      const pts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i * PI) / 4;
        const d = (deg: number) => a + (deg * PI) / 180;
        pts.push(
          Math.cos(d(-15)) * 31, Math.sin(d(-15)) * 31,
          Math.cos(d(-9)) * 42, Math.sin(d(-9)) * 42,
          Math.cos(d(9)) * 42, Math.sin(d(9)) * 42,
          Math.cos(d(15)) * 31, Math.sin(d(15)) * 31,
        );
      }
      k.solid(tone(c), (p) => p.rpoly(pts, 3.2));
      k.solid(Color.outline, (p) => p.circle(0, 0, 14));
      k.detail(0x4a3a80, (p) => p.circle(0, 0, 9));
    },
  },
  sound_on: {
    color: WHITE,
    draw: (k, c) => {
      speaker(k, c);
      k.line(c, 8, (p) => p.arc(-6, 0, 21, -0.75, 0.75));
      k.line(c, 8, (p) => p.arc(-6, 0, 36, -0.7, 0.7));
    },
  },
  sound_off: {
    color: WHITE,
    draw: (k, c) => {
      speaker(k, c);
      k.solid([0xff8a96, 0xe0304a], (p) => {
        p.bar(14, -13, 38, 13, 11);
        p.bar(38, -13, 14, 13, 11);
      });
    },
  },
  music: {
    color: WHITE,
    draw: (k, c) =>
      k.solid(tone(c), (p) => {
        p.ellipse(-19, 27, 13, 10, -0.35);
        p.ellipse(25, 17, 13, 10, -0.35);
        p.rrect(-9, -30, 9, 58, 2);
        p.rrect(35, -42, 9, 58, 2);
        p.poly([-9, -30, 44, -42, 44, -26, -9, -14]);
      }),
  },
  lock: {
    color: 0xffc83a,
    draw: (k, c) => {
      k.line(0xd5dded, 11, (p) => p.m(-15, 6).l(-15, -12).arc(0, -12, 15, PI, 2 * PI).l(15, 6), { hi: true });
      k.solid(tone(c), (p) => p.rrect(-28, -3, 56, 45, 10));
      gloss(k, (p) => p.rrect(-22, 2, 44, 9, 4.5));
      k.detail(Color.outline, (p) => {
        p.circle(0, 16, 6.5);
        p.rrect(-3.6, 18, 7.2, 13, 3);
      });
    },
  },
  check: {
    color: WHITE,
    draw: (k, c) => k.line(c, 17, (p) => p.m(-27, 2).l(-9, 21).l(28, -21), { hi: true }),
  },
  plus: {
    color: WHITE,
    draw: (k, c) =>
      k.solid(tone(c), (p) => {
        p.bar(-25, 0, 25, 0, 17);
        p.bar(0, -25, 0, 25, 17);
      }),
  },
  minus: {
    color: WHITE,
    draw: (k, c) => k.solid(tone(c), (p) => p.bar(-25, 0, 25, 0, 17)),
  },
  play: {
    color: WHITE,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([-20, -34, -20, 34, 36, 0], 7));
      gloss(k, (p) => p.rpoly([-14, -22, -14, -4, 8, -14], 2));
    },
  },
  pause: {
    color: WHITE,
    draw: (k, c) =>
      k.solid(tone(c), (p) => {
        p.rrect(-29, -32, 21, 64, 7);
        p.rrect(8, -32, 21, 64, 7);
      }),
  },
  fast_forward: {
    color: WHITE,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([-40, -28, -40, 28, -2, 0], 5));
      k.solid(tone(c), (p) => p.rpoly([-4, -28, -4, 28, 36, 0], 5));
    },
  },
  info: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.circle(0, 0, 41));
      gloss(k, (p) => p.ellipse(-10, -24, 20, 8, -0.3));
      k.detail(WHITE, (p) => {
        p.circle(0, -19, 7);
        p.rrect(-6, -7, 12, 30, 4);
      });
    },
  },
  question: {
    color: 0xa767ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.circle(0, 0, 41));
      gloss(k, (p) => p.ellipse(-10, -24, 20, 8, -0.3));
      k.line(WHITE, 11, (p) => p.m(-13, -14).c(-13, -32, 15, -32, 15, -15).c(15, -4, 0, -4, 0, 9), { outline: false });
      k.detail(WHITE, (p) => p.circle(0, 26, 6.5));
    },
  },
  home: {
    color: 0xff6b4a,
    draw: (k, c) => {
      k.solid([0xfff6dc, 0xf0cf94], (p) => p.rrect(-29, -8, 58, 48, 7));
      k.solid(tone(c), (p) => p.rpoly([-44, -3, 0, -42, 44, -3], 7));
      k.solid([0xb86b30, 0x7a3e16], (p) => p.rrect(-9, 14, 18, 26, 4));
    },
  },
  cards: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.pen.at(-9, 3, -0.26);
      k.solid(tone(c), (p) => p.rrect(-25, -35, 50, 70, 8));
      k.pen.at(10, 0, 0.2);
      k.solid([0xffffff, 0xddd5f0], (p) => p.rrect(-25, -35, 50, 70, 8));
      k.detail([0xffd25a, 0xf0a21e], (p) => p.star(0, 0, 15, 7, 5, 1.5));
      k.pen.at();
    },
  },
  shop: {
    color: 0xff7a55,
    draw: (k, c) => {
      k.line(0xfff0e0, 8, (p) => p.m(-14, 0).l(-14, -14).arc(0, -14, 14, PI, 2 * PI).l(14, 0));
      k.solid(tone(c), (p) => p.rrect(-33, -12, 66, 54, 11));
      gloss(k, (p) => p.rrect(-27, -7, 54, 9, 4.5));
      k.detail(WHITE, (p) => p.star(0, 18, 13, 6, 5, 1.5));
    },
  },
  trophy: {
    color: 0xffcd3a,
    draw: (k, c) => {
      k.line(0xf0a81f, 8, (p) => p.m(-27, -26).c(-50, -26, -48, 4, -22, 6), { hi: true });
      k.line(0xf0a81f, 8, (p) => p.m(27, -26).c(50, -26, 48, 4, 22, 6), { hi: true });
      k.solid([0xffd25a, 0xd98a0a], (p) => p.rrect(-7, 2, 14, 18, 3));
      k.solid([0xffd25a, 0xc97a08], (p) => p.rrect(-23, 18, 46, 15, 5));
      k.solid(tone(c), (p) =>
        p.m(-30, -38).l(30, -38).c(30, -12, 18, 8, 0, 8).c(-18, 8, -30, -12, -30, -38).close(),
      );
      gloss(k, (p) => p.rrect(-23, -33, 9, 22, 4));
      k.detail(WHITE, (p) => p.star(4, -19, 10, 4.6, 5, 1), 0.92);
    },
  },
  mission: {
    color: 0xfff1d0,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rrect(-29, -37, 58, 79, 9));
      k.solid([0xd7deef, 0x8f9bbb], (p) => p.rrect(-15, -46, 30, 17, 6));
      for (const y of [-14, 5, 24]) {
        k.line(0x38c957, 6, (p) => p.m(-21, y).l(-16, y + 5).l(-8, y - 6), { outline: false });
        k.detail(0x9a86b6, (p) => p.rrect(0, y - 4, 22, 8, 4));
      }
    },
  },
  gift: {
    color: 0xff5a78,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rrect(-30, 0, 60, 41, 7));
      k.solid(tone(shade(c, 0.1)), (p) => p.rrect(-37, -20, 74, 24, 7));
      k.solid([0xffe58a, 0xf5a81c], (p) => p.rrect(-8, -20, 16, 61, 3));
      k.solid([0xffe58a, 0xf5a81c], (p) => {
        p.ellipse(-15, -29, 14, 9, -0.5);
        p.ellipse(15, -29, 14, 9, 0.5);
      });
      k.solid([0xffd25a, 0xe08c10], (p) => p.circle(0, -24, 7));
    },
  },
  star: {
    color: 0xffd23f,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.star(0, 3, 44, 20, 5, 6));
      gloss(k, (p) => p.ellipse(-13, -10, 8, 4.2, -0.8));
    },
  },
  crown: {
    color: 0xffc93a,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([-38, 24, -43, -22, -20, -5, 0, -36, 20, -5, 43, -22, 38, 24], 5));
      k.solid([0xffd25a, 0xd98a0a], (p) => p.rrect(-38, 14, 76, 20, 6));
      k.solid(WHITE, (p) => {
        p.circle(-43, -24, 6);
        p.circle(0, -38, 6);
        p.circle(43, -24, 6);
      });
      k.detail([0xff7a8a, 0xe0243f], (p) => p.circle(0, 24, 5.5));
      k.detail([0x7cd4ff, 0x2a82ec], (p) => {
        p.circle(-22, 24, 4.5);
        p.circle(22, 24, 4.5);
      });
    },
  },
  paw: {
    color: 0xffc94a,
    draw: (k, c) => {
      k.solid(tone(c), (p) => {
        p.ellipse(0, 15, 25, 20);
        p.ellipse(-31, -5, 9.5, 12.5, -0.5);
        p.ellipse(-12, -26, 10, 13, -0.15);
        p.ellipse(12, -26, 10, 13, 0.15);
        p.ellipse(31, -5, 9.5, 12.5, 0.5);
      });
      gloss(k, (p) => p.ellipse(-9, 8, 9, 5, -0.5));
    },
  },
  heart: {
    color: 0xff4d6a,
    draw: (k, c) => {
      k.solid(tone(c), (p) =>
        p
          .m(0, 38)
          .c(-12, 30, -42, 12, -42, -12)
          .c(-42, -31, -13, -39, 0, -19)
          .c(13, -39, 42, -31, 42, -12)
          .c(42, 12, 12, 30, 0, 38)
          .close(),
      );
      gloss(k, (p) => p.ellipse(-23, -19, 9, 5, -0.75));
    },
  },
  clock: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.circle(0, 0, 41));
      k.solid([0xffffff, 0xe4defa], (p) => p.circle(0, 0, 30));
      k.detail(0x7d6aa8, (p) => {
        p.circle(0, -22, 2.6);
        p.circle(22, 0, 2.6);
        p.circle(0, 22, 2.6);
        p.circle(-22, 0, 2.6);
      });
      k.line(0x2a1746, 7, (p) => p.m(0, 0).l(0, -19), { outline: false });
      k.line(0x2a1746, 7, (p) => p.m(0, 0).l(14, 9), { outline: false });
      k.detail(0xff4d5e, (p) => p.circle(0, 0, 5));
    },
  },
  ad: {
    color: 0xa767ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rrect(-43, -34, 86, 60, 13));
      k.solid([0x2b1b5e, 0x432a8c], (p) => p.rrect(-35, -27, 70, 45, 8));
      k.solid(tone(c), (p) => p.rrect(-20, 28, 40, 9, 4));
      k.detail(WHITE, (p) => p.rpoly([-9, -17, -9, 8, 15, -4.5], 3));
      gloss(k, (p) => p.rrect(-33, -25, 30, 5, 2.5));
    },
  },
  coin: {
    color: 0xffc93a,
    draw: (k, c) => {
      k.solid([shade(c, 0.45), c], (p) => p.circle(0, 0, 41));
      k.detail(shade(c, -0.12), (p) => p.circle(0, 0, 31));
      k.stroke(shade(c, 0.55), 3, (p) => p.arc(0, 0, 36, PI * 0.95, PI * 1.55), 0.9);
      k.detail([shade(c, 0.5), shade(c, 0.2)], (p) => {
        p.ellipse(0, 7, 11, 9);
        p.ellipse(-13, -8, 5, 6.5, -0.5);
        p.ellipse(-4.5, -15, 5, 6.5, -0.15);
        p.ellipse(4.5, -15, 5, 6.5, 0.15);
        p.ellipse(13, -8, 5, 6.5, 0.5);
      });
    },
  },
  gem: {
    color: 0x4ee3ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([-36, -12, -19, -34, 19, -34, 36, -12, 0, 40], 5));
      k.detail(WHITE, (p) => p.poly([-19, -34, 19, -34, 11, -12, -11, -12]), 0.42);
      k.detail(WHITE, (p) => p.poly([-36, -12, -19, -34, -11, -12]), 0.22);
      k.detail(0x000000, (p) => p.poly([36, -12, 19, -34, 11, -12]), 0.08);
      k.detail(WHITE, (p) => p.poly([-36, -12, -11, -12, 0, 40]), 0.16);
      k.detail(0x000000, (p) => p.poly([36, -12, 11, -12, 0, 40]), 0.16);
      k.detail(WHITE, (p) => p.poly([-28, -22, -22, -28, -17, -20, -23, -15]), 0.85);
    },
  },
  energy: {
    color: 0x7dff6b,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([9, -44, -28, 6, -5, 6, -13, 44, 28, -12, 4, -12], 4));
      gloss(k, (p) => p.poly([5, -34, -13, -4, -3, -4, 2, -22]));
    },
  },
  arrow_up: {
    color: 0x4cd964,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([0, -42, 34, -6, 16, -6, 16, 38, -16, 38, -16, -6, -34, -6], 6));
      gloss(k, (p) => p.rrect(-10, -4, 6, 36, 3));
    },
  },
  swords: {
    color: 0xe9eefb,
    draw: (k, c) => {
      sword(k, -PI / 4, c);
      sword(k, PI / 4, c);
    },
  },
  shield: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid(tone(c), (p) => shieldPath(p, 1));
      k.detail([shade(c, 0.3), shade(c, -0.1)], (p) => shieldPath(p, 0.78));
      k.detail([0xffe27a, 0xf0a21e], (p) => p.star(0, -2, 17, 8, 5, 2));
      gloss(k, (p) => p.rrect(-26, -28, 8, 26, 4));
    },
  },
  reroll: { color: WHITE, draw: reroll },
  sell: {
    color: 0x4cd964,
    draw: (k, c) => {
      k.pen.at(-4, -2, -0.5);
      k.solid(tone(c), (p) => p.rpoly([-30, -17, 12, -17, 36, 0, 12, 17, -30, 17], 7));
      k.detail(Color.outline, (p) => p.circle(-16, 0, 6.5));
      gloss(k, (p) => p.rrect(-4, -12, 20, 5, 2.5));
      k.pen.at();
      k.solid([0xffe48a, 0xf2a41c], (p) => p.circle(24, 26, 15));
      k.detail(0xd98a0a, (p) => p.circle(24, 26, 8));
    },
  },
  skull: {
    color: 0xf3eefc,
    draw: (k, c) => {
      k.solid(tone(c), (p) => {
        p.ellipse(0, -7, 35, 32);
        p.rrect(-20, 12, 40, 28, 9);
      });
      k.detail(Color.outline, (p) => {
        p.ellipse(-14, -5, 9, 11, 0.1);
        p.ellipse(14, -5, 9, 11, -0.1);
        p.rpoly([0, 8, -6, 18, 6, 18], 2);
      });
      k.detail(Color.outline, (p) => {
        p.rrect(-8, 27, 3, 12, 1.5);
        p.rrect(-1.5, 27, 3, 12, 1.5);
        p.rrect(5, 27, 3, 12, 1.5);
      }, 0.8);
    },
  },
  chest: {
    color: 0xc47a3a,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rrect(-42, -2, 84, 42, 7));
      k.detail(0x000000, (p) => p.rect(-42, 17, 84, 3), 0.18);
      k.solid(tone(shade(c, 0.12)), (p) => p.m(-42, -2).l(-42, -14).c(-42, -40, 42, -40, 42, -14).l(42, -2).close());
      k.solid(GOLD, (p) => p.rrect(-10, -34, 20, 74, 4));
      k.solid(GOLD, (p) => p.rrect(-14, -7, 28, 25, 6));
      k.detail(Color.outline, (p) => {
        p.circle(0, 5, 3.6);
        p.rrect(-2, 6, 4, 8, 1.5);
      });
      gloss(k, (p) => p.rrect(-34, -24, 16, 6, 3));
    },
  },
  fish: {
    color: 0xff8a5c,
    draw: (k, c) => {
      k.solid(tone(shade(c, -0.05)), (p) => p.rpoly([20, 0, 45, -20, 40, 0, 45, 20], 5));
      k.solid(tone(shade(c, -0.05)), (p) => p.rpoly([-8, -15, 6, -32, 15, -14], 4));
      k.solid(tone(c), (p) => p.ellipse(-4, 0, 32, 21));
      k.detail(WHITE, (p) => p.ellipse(-6, 9, 22, 8), 0.4);
      k.stroke(Color.outline, 3.2, (p) => p.arc(-4, 0, 17, -0.8, 0.8), 0.45);
      k.solid(WHITE, (p) => p.circle(-20, -5, 6.8));
      k.detail(Color.outline, (p) => p.circle(-19, -5, 3.4));
      gloss(k, (p) => p.ellipse(-8, -13, 12, 3.6, -0.15));
    },
  },
  lucky_clover: {
    color: 0x4cd964,
    draw: (k, c) => {
      k.line(0x2f9e44, 9, (p) => p.m(1, 6).c(4, 20, 2, 32, -8, 42));
      for (const a of [-PI / 4, PI / 4, (3 * PI) / 4, (5 * PI) / 4]) {
        k.pen.at(0, 0, a);
        k.solid([shade(c, 0.35), shade(c, -0.12)], leafPath);
      }
      for (const a of [-PI / 4, PI / 4, (3 * PI) / 4, (5 * PI) / 4]) {
        k.pen.at(0, 0, a);
        k.stroke(shade(c, -0.35), 2.6, (p) => p.m(0, -6).l(0, -28), 0.7);
      }
      k.pen.at(0, 0, -PI / 4);
      gloss(k, (p) => p.ellipse(-8, -27, 5, 3, -0.4));
      k.pen.at();
    },
  },
  warning: {
    color: 0xffc83a,
    draw: (k, c) => {
      k.solid(tone(c), (p) => p.rpoly([0, -40, 42, 34, -42, 34], 9));
      gloss(k, (p) => p.rpoly([0, -28, 9, -12, -9, -12], 3));
      k.detail(Color.outline, (p) => {
        p.rrect(-4.5, -9, 9, 26, 4.5);
        p.circle(0, 25, 5);
      });
    },
  },
  dice: {
    color: WHITE,
    draw: (k, c) => {
      k.pen.at(0, 0, -0.22);
      k.solid(tone(c), (p) => p.rrect(-31, -31, 62, 62, 13));
      k.detail(0x6a5d9c, (p) => p.rrect(-27, 20, 54, 7, 3.5), 0.22);
      k.detail([0xff7a8a, 0xe0243f], (p) => {
        p.circle(-15, -15, 6.5);
        p.circle(15, -15, 6.5);
        p.circle(0, 0, 6.5);
        p.circle(-15, 15, 6.5);
        p.circle(15, 15, 6.5);
      });
      k.pen.at();
    },
  },
};

export interface IconOpts {
  /** Outline colour (default: the shared dark purple). */
  outline?: number;
  /** Bake the vector drawing into a texture (default true): icons are static and numerous. */
  cache?: boolean;
}

/**
 * A crisp vector icon, centred on the origin and `size` px square. `color` replaces the icon's main
 * body colour (e.g. tint a star grey for "unearned"); accents keep their own colours.
 */
export function drawIcon(name: IconName, size: number, color?: number, opts: IconOpts = {}): Graphics {
  const g = new Graphics();
  const def = ICONS[name];
  const ink = new Ink(g, size, opts.outline ?? Color.outline);
  def.draw(ink, color ?? def.color);
  if (opts.cache ?? true) cacheStatic(g);
  return g;
}
