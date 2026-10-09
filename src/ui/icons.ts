import { Container, Graphics, Sprite } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { mixColor } from '@/core/math';
import { Color } from './theme';
import { luma, shade } from './colors';
import { GLYPH_PICTURE, PICTURES, type PictureDef, type PictureGlyph, type PictureId } from './pictures';
import { cacheStatic } from './shapes';

export const ICON_NAMES = [
  'close', 'back', 'settings', 'sound_on', 'sound_off', 'music', 'lock', 'check', 'plus', 'minus',
  'play', 'pause', 'fast_forward', 'info', 'question', 'home', 'cards', 'shop', 'trophy', 'mission',
  'gift', 'star', 'crown', 'paw', 'heart', 'clock', 'ad', 'coin', 'gem', 'xp', 'energy',
  'arrow_up', 'swords', 'shield', 'reroll', 'sell', 'skull', 'chest', 'fish', 'lucky_clover', 'dice', 'warning',
  'purr', 'laser', 'sun', 'molt', 'wave_call', 'class_warrior', 'class_ranger', 'class_mage', 'class_trickster',
  'target', 'sweep', 'ticket', 'calendar', 'wardrobe', 'share', 'code', 'speed_1', 'speed_2', 'speed_3', 'eye', 'book',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

type Fill = number | readonly [top: number, bottom: number];

const PI = Math.PI;

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

/** Hot candy hues the old kit used, and what they become in paper: blue to teal, purple to muted violet, and so on. */
const REMAP = new Map<number, number>([
  [0x4da6ff, Color.teal],
  [0x2a82ec, Color.tealDark],
  [0x7cd4ff, 0x8fd3e6],
  [0xa767ff, Color.violet],
  [0x2b1b5e, 0x5b4333],
  [0x432a8c, 0x6e5440],
  [0x4a3a80, 0x6e5440],
  [0x6a5d9c, 0x8a6a50],
  [0x7d6aa8, 0x9c7a56],
  [0x9a86b6, 0xb08f6a],
  [0x8f9bbb, 0xb8a58c],
  [0x9aa6c0, 0xb8a58c],
  [0xd5dded, 0xcdbb9f],
  [0xd7deef, 0xe0d2b8],
  [0xe4eafa, 0xf1e8d4],
  [0xe9eefb, 0xf1e8d4],
  [0xe4defa, 0xf1e8d4],
  [0xddd5f0, 0xe6dcc6],
  [0xf2f6ff, 0xf6efe0],
  [0xf3eefc, 0xf6efe0],
  [0x2a1746, Color.ink],
  [0xff4d5e, Color.berry],
  [0xe0243f, Color.berryDark],
  [0xd02a50, Color.berryDark],
  [0xe0304a, Color.berryDark],
  [0xff7a8a, 0xe88a98],
  [0xff6b8a, 0xe88a98],
  [0xff8a96, 0xe88a98],
  [0xff5a78, 0xe56a7c],
  [0xff4d6a, 0xe85a6e],
  [0xff6fae, 0xe9809b],
  [0xff3b4a, 0xe8574f],
  [0xff6b4a, Color.coral],
  [0xff7a55, Color.coral],
  [0x4cd964, Color.leaf],
  [0x7dff6b, Color.energy],
  [0x38c957, Color.leafDark],
  [0x1f9d3e, Color.leafDark],
  [0x2f9e44, Color.leafDark],
  [0x7aea8a, 0xa9d68c],
  [0xffffff, Color.paperLight],
]);

/** Candy colour to matte paper colour: known hot hues are re-mapped, light colours are pulled a little toward warm brown. */
function matte(c: number): number {
  const m = REMAP.get(c);
  if (m !== undefined) return m;
  return luma(c) < 90 ? c : mixColor(c, 0xb09878, 0.1);
}

/** Matte icons are flat: a two-tone ramp becomes its middle colour. */
function fillOf(f: Fill): number {
  return matte(typeof f === 'number' ? f : mixColor(f[0], f[1], 0.5));
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
    this.g.fill({ color: fillOf(fill), alpha });
    return this;
  }

  /** Outlined stroked path. */
  line(color: number, width: number, build: (p: Pen) => void, opts: { outline?: boolean } = {}): this {
    const u = this.pen.u;
    if (opts.outline !== false) {
      build(this.pen);
      this.g.stroke({ width: width * u + this.ow * 2, color: this.outline, join: 'round', cap: 'round' });
    }
    build(this.pen);
    this.g.stroke({ width: width * u, color: matte(color), join: 'round', cap: 'round' });
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
    this.g.stroke({ width: width * u, color: f, join: 'round', cap: 'round' });
    shapes(this.pen);
    this.g.fill(f);
    return this;
  }

  /** Thin stroked path without outline. */
  stroke(color: number, width: number, build: (p: Pen) => void, alpha = 1): this {
    build(this.pen);
    this.g.stroke({ width: width * this.pen.u, color: matte(color), alpha, join: 'round', cap: 'round' });
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

function heartPath(p: Pen): void {
  p.m(0, 38)
    .c(-12, 30, -42, 12, -42, -12)
    .c(-42, -31, -13, -39, 0, -19)
    .c(13, -39, 42, -31, 42, -12)
    .c(42, 12, 12, 30, 0, 38)
    .close();
}

/** The cat paw print: one pad and four toes. */
function pawShape(p: Pen): void {
  p.ellipse(0, 15, 25, 20);
  p.ellipse(-31, -5, 9.5, 12.5, -0.5);
  p.ellipse(-12, -26, 10, 13, -0.15);
  p.ellipse(12, -26, 10, 13, 0.15);
  p.ellipse(31, -5, 9.5, 12.5, 0.5);
}

/** Ticket outline: a rectangle with a half-circle bitten out of each short side. */
function ticketPoints(): number[] {
  const pts: number[] = [-44, -28, 44, -28, 44, -9];
  const steps = 8;
  for (let i = 1; i < steps; i++) {
    const a = -PI / 2 - (i / steps) * PI;
    pts.push(44 + Math.cos(a) * 9, Math.sin(a) * 9);
  }
  pts.push(44, 9, 44, 28, -44, 28, -44, 9);
  for (let i = 1; i < steps; i++) {
    const a = PI / 2 - (i / steps) * PI;
    pts.push(-44 + Math.cos(a) * 9, Math.sin(a) * 9);
  }
  pts.push(-44, -9);
  return pts;
}

/** Right-pointing chevrons merged under one outline; more chevrons = faster. */
function chevrons(n: number): IconDraw {
  return (k, c) => {
    const step = 23;
    const x0 = -((n - 1) * step) / 2;
    k.line(
      c,
      13,
      (p) => {
        for (let i = 0; i < n; i++) {
          const x = x0 + i * step;
          p.m(x - 11, -29).l(x + 11, 0).l(x - 11, 29);
        }
      },
    );
  };
}

function speaker(k: Ink, c: number): void {
  k.solid(c, (p) => p.rpoly([-40, -12, -26, -12, -6, -30, -6, 30, -26, 12, -40, 12], 4));
}

function sword(k: Ink, rot: number, blade: number): void {
  const p = k.pen;
  p.at(0, 0, rot, 1.22);
  k.solid(blade, (q) => q.rpoly([0, -47, 8, -37, 8, 10, -8, 10, -8, -37], 2.5));
  k.solid([0xffe27a, 0xd98a0a], (q) => q.rrect(-18, 7, 36, 10, 4));
  k.solid([0xb06a32, 0x6e3a14], (q) => q.rrect(-4.5, 15, 9, 18, 3));
  k.solid([0xffe27a, 0xd98a0a], (q) => q.circle(0, 36, 6.5));
  p.at();
}

/**
 * Two half rings chasing each other. The glyph is ink on ink (fill and outline are one colour), so the
 * outline's own weight is part of the stroke: a thin stroke and a wide ring keep the hole open at 40 px.
 */
function reroll(k: Ink, c: number): void {
  const r = 30;
  const arcs = [-2.55, -2.55 + PI];
  const span = 1.75;
  k.merged(
    c,
    1,
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
        p.rpoly([px + tx * 17, py + ty * 17, px + nx * 11, py + ny * 11, px - nx * 11, py - ny * 11], 2.5);
      }
    },
  );
}

const ICONS: Record<IconName, IconDef> = {
  close: {
    color: Color.ink,
    draw: (k, c) =>
      k.solid(c, (p) => {
        p.bar(-22, -22, 22, 22, 18);
        p.bar(22, -22, -22, 22, 18);
      }),
  },
  back: {
    color: Color.ink,
    draw: (k, c) => k.solid(c, (p) => p.rpoly([-36, 0, -6, -32, -6, -15, 36, -15, 36, 15, -6, 15, -6, 32], 5)),
  },
  settings: {
    color: Color.ink,
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
      k.solid(c, (p) => p.rpoly(pts, 3.2));
      k.solid(Color.paperLight, (p) => p.circle(0, 0, 13));
    },
  },
  sound_on: {
    color: Color.ink,
    draw: (k, c) => {
      speaker(k, c);
      k.line(c, 8, (p) => p.arc(-6, 0, 21, -0.75, 0.75));
      k.line(c, 8, (p) => p.arc(-6, 0, 36, -0.7, 0.7));
    },
  },
  sound_off: {
    color: Color.ink,
    draw: (k, c) => {
      speaker(k, c);
      k.solid([0xff8a96, 0xe0304a], (p) => {
        p.bar(14, -13, 38, 13, 11);
        p.bar(38, -13, 14, 13, 11);
      });
    },
  },
  music: {
    color: Color.ink,
    draw: (k, c) =>
      k.solid(c, (p) => {
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
      k.line(0xd5dded, 11, (p) => p.m(-15, 6).l(-15, -12).arc(0, -12, 15, PI, 2 * PI).l(15, 6));
      k.solid(c, (p) => p.rrect(-28, -3, 56, 45, 10));
      k.detail(Color.outline, (p) => {
        p.circle(0, 16, 6.5);
        p.rrect(-3.6, 18, 7.2, 13, 3);
      });
    },
  },
  check: {
    color: Color.ink,
    draw: (k, c) => k.line(c, 17, (p) => p.m(-27, 2).l(-9, 21).l(28, -21)),
  },
  plus: {
    color: Color.ink,
    draw: (k, c) =>
      k.solid(c, (p) => {
        p.bar(-25, 0, 25, 0, 17);
        p.bar(0, -25, 0, 25, 17);
      }),
  },
  minus: {
    color: Color.ink,
    draw: (k, c) => k.solid(c, (p) => p.bar(-25, 0, 25, 0, 17)),
  },
  play: {
    color: Color.ink,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([-20, -34, -20, 34, 36, 0], 7));
    },
  },
  pause: {
    color: Color.ink,
    draw: (k, c) =>
      k.solid(c, (p) => {
        p.rrect(-29, -32, 21, 64, 7);
        p.rrect(8, -32, 21, 64, 7);
      }),
  },
  fast_forward: {
    color: Color.ink,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([-40, -28, -40, 28, -2, 0], 5));
      k.solid(c, (p) => p.rpoly([-4, -28, -4, 28, 36, 0], 5));
    },
  },
  info: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid(c, (p) => p.circle(0, 0, 41));
      k.detail(Color.ink, (p) => {
        p.circle(0, -19, 7);
        p.rrect(-6, -7, 12, 30, 4);
      });
    },
  },
  question: {
    color: 0xa767ff,
    draw: (k, c) => {
      k.solid(c, (p) => p.circle(0, 0, 41));
      k.line(Color.ink, 11, (p) => p.m(-13, -14).c(-13, -32, 15, -32, 15, -15).c(15, -4, 0, -4, 0, 9), { outline: false });
      k.detail(Color.ink, (p) => p.circle(0, 26, 6.5));
    },
  },
  home: {
    color: 0xff6b4a,
    draw: (k, c) => {
      k.solid([0xfff6dc, 0xf0cf94], (p) => p.rrect(-29, -8, 58, 48, 7));
      k.solid(c, (p) => p.rpoly([-44, -3, 0, -42, 44, -3], 7));
      k.solid([0xb86b30, 0x7a3e16], (p) => p.rrect(-9, 14, 18, 26, 4));
    },
  },
  cards: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.pen.at(-9, 3, -0.26);
      k.solid(c, (p) => p.rrect(-25, -35, 50, 70, 8));
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
      k.solid(c, (p) => p.rrect(-33, -12, 66, 54, 11));
      k.detail(WHITE, (p) => p.star(0, 18, 13, 6, 5, 1.5));
    },
  },
  trophy: {
    color: 0xffcd3a,
    draw: (k, c) => {
      k.line(0xf0a81f, 8, (p) => p.m(-27, -26).c(-50, -26, -48, 4, -22, 6));
      k.line(0xf0a81f, 8, (p) => p.m(27, -26).c(50, -26, 48, 4, 22, 6));
      k.solid([0xffd25a, 0xd98a0a], (p) => p.rrect(-7, 2, 14, 18, 3));
      k.solid([0xffd25a, 0xc97a08], (p) => p.rrect(-23, 18, 46, 15, 5));
      k.solid(c, (p) =>
        p.m(-30, -38).l(30, -38).c(30, -12, 18, 8, 0, 8).c(-18, 8, -30, -12, -30, -38).close(),
      );
      k.detail(WHITE, (p) => p.star(4, -19, 10, 4.6, 5, 1), 0.92);
    },
  },
  mission: {
    color: 0xfff1d0,
    draw: (k, c) => {
      k.solid(c, (p) => p.rrect(-29, -37, 58, 79, 9));
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
      k.solid(c, (p) => p.rrect(-30, 0, 60, 41, 7));
      k.solid(shade(c, 0.1), (p) => p.rrect(-37, -20, 74, 24, 7));
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
      k.solid(c, (p) => p.star(0, 3, 44, 20, 5, 6));
    },
  },
  crown: {
    color: 0xffc93a,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([-38, 24, -43, -22, -20, -5, 0, -36, 20, -5, 43, -22, 38, 24], 5));
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
      k.solid(c, pawShape);
    },
  },
  heart: {
    color: 0xff4d6a,
    draw: (k, c) => {
      k.solid(c, heartPath);
    },
  },
  clock: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid(c, (p) => p.circle(0, 0, 41));
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
    color: Color.teal,
    draw: (k, c) => {
      k.solid(c, (p) => p.rrect(-43, -34, 86, 60, 13));
      k.solid(Color.ink, (p) => p.rrect(-35, -27, 70, 45, 8));
      k.solid(c, (p) => p.rrect(-20, 28, 40, 9, 4));
      k.detail(Color.paperLight, (p) => p.rpoly([-9, -17, -9, 8, 15, -4.5], 3));
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
    color: 0xe8467f,
    draw: (k, c) => {
      // The shop's gem: a faceted pink cat head, ears up.
      k.solid(c, (p) => p.rpoly([-32, -50, -8, -30, 8, -30, 32, -50, 42, -12, 40, 6, 22, 30, 0, 42, -22, 30, -40, 6, -42, -12], 3));
      k.detail(WHITE, (p) => p.poly([-8, -30, 8, -30, 7, -8, -7, -8]), 0.34);
      k.detail(WHITE, (p) => p.poly([-32, -50, -8, -30, -16, -9, -42, -12]), 0.2);
      k.detail(0x000000, (p) => p.poly([32, -50, 8, -30, 16, -9, 42, -12]), 0.1);
      k.detail(WHITE, (p) => p.poly([-42, -12, -16, -9, -7, -8, 0, 42, -22, 30, -40, 6]), 0.12);
      k.detail(0x000000, (p) => p.poly([42, -12, 16, -9, 7, -8, 0, 42, 22, 30, 40, 6]), 0.18);
      k.detail(WHITE, (p) => p.poly([-27, -36, -22, -42, -18, -36, -23, -30]), 0.85);
    },
  },
  xp: {
    color: 0x3f7fe0,
    draw: (k, c) => {
      k.solid(c, (p) => p.star(0, 3, 46, 22, 5, 7));
      k.detail([0xd4ecff, 0x8ccbff], (p) => p.rpoly([0, -18, 17, 2, 7, 2, 7, 24, -7, 24, -7, 2, -17, 2], 3));
    },
  },
  energy: {
    color: 0x7dff6b,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([9, -44, -28, 6, -5, 6, -13, 44, 28, -12, 4, -12], 4));
    },
  },
  arrow_up: {
    color: 0x4cd964,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([0, -42, 34, -6, 16, -6, 16, 38, -16, 38, -16, -6, -34, -6], 6));
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
      k.solid(c, (p) => shieldPath(p, 1));
      k.detail([shade(c, 0.3), shade(c, -0.1)], (p) => shieldPath(p, 0.78));
      k.detail([0xffe27a, 0xf0a21e], (p) => p.star(0, -2, 17, 8, 5, 2));
    },
  },
  reroll: { color: Color.ink, draw: reroll },
  sell: {
    color: 0x4cd964,
    draw: (k, c) => {
      k.pen.at(-4, -2, -0.5);
      k.solid(c, (p) => p.rpoly([-30, -17, 12, -17, 36, 0, 12, 17, -30, 17], 7));
      k.detail(Color.outline, (p) => p.circle(-16, 0, 6.5));
      k.pen.at();
      k.solid([0xffe48a, 0xf2a41c], (p) => p.circle(24, 26, 15));
      k.detail(0xd98a0a, (p) => p.circle(24, 26, 8));
    },
  },
  skull: {
    color: 0xf3eefc,
    draw: (k, c) => {
      k.solid(c, (p) => {
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
      k.solid(c, (p) => p.rrect(-42, -2, 84, 42, 7));
      k.detail(0x000000, (p) => p.rect(-42, 17, 84, 3), 0.18);
      k.solid(shade(c, 0.12), (p) => p.m(-42, -2).l(-42, -14).c(-42, -40, 42, -40, 42, -14).l(42, -2).close());
      k.solid(GOLD, (p) => p.rrect(-10, -34, 20, 74, 4));
      k.solid(GOLD, (p) => p.rrect(-14, -7, 28, 25, 6));
      k.detail(Color.outline, (p) => {
        p.circle(0, 5, 3.6);
        p.rrect(-2, 6, 4, 8, 1.5);
      });
    },
  },
  fish: {
    color: 0x6fa9d6,
    draw: (k, c) => {
      k.solid(shade(c, -0.05), (p) => p.rpoly([20, 0, 45, -20, 40, 0, 45, 20], 5));
      k.solid(shade(c, -0.05), (p) => p.rpoly([-8, -15, 6, -32, 15, -14], 4));
      k.solid(c, (p) => p.ellipse(-4, 0, 32, 21));
      k.detail(WHITE, (p) => p.ellipse(-6, 9, 22, 8), 0.4);
      k.stroke(Color.outline, 3.2, (p) => p.arc(-4, 0, 17, -0.8, 0.8), 0.45);
      k.solid(WHITE, (p) => p.circle(-20, -5, 6.8));
      k.detail(Color.outline, (p) => p.circle(-19, -5, 3.4));
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
      k.pen.at();
    },
  },
  warning: {
    color: 0xffc83a,
    draw: (k, c) => {
      k.solid(c, (p) => p.rpoly([0, -40, 42, 34, -42, 34], 9));
      k.detail(Color.outline, (p) => {
        p.rrect(-4.5, -9, 9, 26, 4.5);
        p.circle(0, 25, 5);
      });
    },
  },
  purr: {
    color: 0xff6fae,
    draw: (k, c) => {
      k.solid(c, heartPath);
      k.pen.at(0, 3, 0, 0.4);
      k.detail([0xffffff, 0xffd9ea], pawShape, 0.96);
      k.pen.at();
    },
  },
  laser: {
    color: 0xff3b4a,
    draw: (k, c) => {
      k.line(
        c,
        8,
        (p) => {
          p.arc(0, 0, 27, 0, PI * 2);
          p.m(0, -48).l(0, -32);
          p.m(0, 32).l(0, 48);
          p.m(-48, 0).l(-32, 0);
          p.m(32, 0).l(48, 0);
        },
      );
      k.solid([shade(c, 0.4), shade(c, -0.12)], (p) => p.circle(0, 0, 13));
    },
  },
  sun: {
    color: 0xffc83a,
    draw: (k, c) => {
      for (let i = 0; i < 8; i++) {
        k.pen.at(0, 0, (i * PI) / 4);
        k.solid([0xffe27a, 0xf5a81c], (p) => p.rpoly([-9, -26, 0, -47, 9, -26], 3));
      }
      k.pen.at();
      k.solid([shade(c, 0.4), shade(c, -0.12)], (p) => p.circle(0, 0, 26));
    },
  },
  molt: {
    color: 0xffb36b,
    draw: (k, c) => {
      k.line(
        c,
        12,
        (p) => {
          const n = 36;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const a = -PI / 2 + t * PI * 2.6;
            const r = 6 + t * 30;
            if (i === 0) p.m(Math.cos(a) * r, Math.sin(a) * r);
            else p.l(Math.cos(a) * r, Math.sin(a) * r);
          }
        },
      );
      for (const [x, y, rot] of [[33, -27, 0.75], [-35, -6, -0.95], [8, 38, 2.5]] as const) {
        k.solid([shade(c, 0.4), shade(c, -0.08)], (p) => p.ellipse(x, y, 5.5, 11, rot));
      }
    },
  },
  wave_call: {
    color: 0xffc93a,
    draw: (k, c) => {
      k.line(WHITE, 6, (p) => {
        p.arc(10, 0, 28, -0.55, 0.55);
        p.arc(10, 0, 42, -0.5, 0.5);
      });
      k.solid([shade(c, 0.4), shade(c, -0.18)], (p) => p.rpoly([-46, -9, -24, -9, 6, -31, 6, 31, -24, 9, -46, 9], 5));
      k.solid([shade(c, -0.05), shade(c, -0.35)], (p) => p.ellipse(6, 0, 9, 31));
      k.detail(Color.outline, (p) => p.ellipse(6, 0, 4.5, 24), 0.55);
    },
  },
  class_warrior: {
    color: 0xe9eefb,
    draw: (k, c) => {
      sword(k, PI / 4, c);
      k.detail([0xffe27a, 0xf0a21e], (p) => p.star(-28, -28, 10, 4, 4, 1));
    },
  },
  class_ranger: {
    color: 0xc98a4a,
    draw: (k, c) => {
      k.line(c, 10, (p) => p.m(10, -45).c(-38, -30, -38, 30, 10, 45));
      k.line(0xfff3d6, 3.4, (p) => p.m(10, -45).l(10, 45), { outline: false });
      k.line(0xe8d3a2, 6, (p) => p.m(-26, 0).l(34, 0));
      k.solid([0xf2f6ff, 0x9aa6c0], (p) => p.rpoly([32, -11, 53, 0, 32, 11], 2.5));
      k.solid([0x7aea8a, 0x1f9d3e], (p) => {
        p.poly([-35, -12, -22, -12, -15, 0, -28, 0]);
        p.poly([-35, 12, -22, 12, -15, 0, -28, 0]);
      });
    },
  },
  class_mage: {
    color: 0xa767ff,
    draw: (k, c) => {
      k.solid(c, (p) => p.bar(-32, 38, 6, 0, 12));
      k.solid([0xffe27a, 0xd98a0a], (p) => p.bar(-36, 42, -28, 34, 14));
      k.solid([0xffe27a, 0xf0a21e], (p) => p.star(20, -22, 28, 13, 5, 3));
      k.detail(WHITE, (p) => p.star(-14, -30, 10, 3.5, 4, 1), 0.95);
      k.detail(WHITE, (p) => p.star(40, 20, 8, 3, 4, 1), 0.95);
    },
  },
  class_trickster: {
    color: 0xffc83a,
    draw: (k, c) => {
      k.solid([0xff7a8a, 0xe0243f], (p) => {
        p.ellipse(-15, -37, 14, 8, -0.45);
        p.ellipse(15, -37, 14, 8, 0.45);
      });
      k.solid([0xff7a8a, 0xe0243f], (p) => p.circle(0, -33, 6));
      k.solid([shade(c, 0.45), shade(c, -0.14)], (p) => p.circle(0, 9, 32));
      k.detail(Color.outline, (p) => p.rrect(-27, 14, 54, 5, 2.5), 0.5);
      k.detail(Color.outline, (p) => {
        p.circle(0, 28, 4.6);
        p.rrect(-2.3, 27, 4.6, 12, 2.3);
      });
    },
  },
  target: {
    color: 0xff4d5e,
    draw: (k, c) => {
      k.solid([0xffffff, 0xddd5f0], (p) => p.circle(0, 0, 42));
      k.detail([shade(c, 0.2), shade(c, -0.15)], (p) => p.circle(0, 0, 33));
      k.detail(WHITE, (p) => p.circle(0, 0, 23));
      k.detail([shade(c, 0.2), shade(c, -0.15)], (p) => p.circle(0, 0, 13));
    },
  },
  sweep: {
    color: 0xe0b25a,
    draw: (k, c) => {
      k.pen.at(2, 0, 0.55);
      k.solid([0xc98a4a, 0x8a5424], (p) => p.rrect(-4, -50, 8, 56, 3));
      k.solid([shade(c, 0.35), shade(c, -0.22)], (p) => p.rpoly([-11, 8, 11, 8, 27, 46, -27, 46], 5));
      for (const x of [-9, -3, 3, 9]) k.stroke(shade(c, -0.45), 2.4, (p) => p.m(x * 0.55, 18).l(x * 2.2, 44), 0.75);
      k.solid([0xff6b8a, 0xd02a50], (p) => p.rrect(-14, 2, 28, 12, 4));
      k.pen.at();
    },
  },
  ticket: {
    color: 0xffc83a,
    draw: (k, c) => {
      k.pen.at(0, 0, -0.16);
      k.solid(c, (p) => p.rpoly(ticketPoints(), 2.5));
      for (let y = -20; y < 22; y += 10) k.stroke(Color.outline, 3, (p) => p.m(-17, y).l(-17, y + 5), 0.55);
      k.detail(WHITE, (p) => p.star(13, 0, 17, 8, 5, 2));
      k.pen.at();
    },
  },
  calendar: {
    color: 0xfff6dc,
    draw: (k, c) => {
      k.solid(c, (p) => p.rrect(-39, -32, 78, 76, 11));
      k.solid([0xff7a8a, 0xe0243f], (p) => p.rpoly([-39, -32, 39, -32, 39, -9, -39, -9], 9));
      k.solid([0xe4eafa, 0x8f9bbb], (p) => {
        p.rrect(-24, -42, 9, 20, 4);
        p.rrect(15, -42, 9, 20, 4);
      });
      for (let r = 0; r < 2; r++) {
        for (let col = 0; col < 3; col++) {
          const x = -27 + col * 20;
          const y = 2 + r * 19;
          if (r === 1 && col === 2) k.detail([0xffd25a, 0xf0a21e], (p) => p.rrect(x, y, 15, 14, 4));
          else k.detail(0x9a86b6, (p) => p.rrect(x, y, 15, 14, 4), 0.85);
        }
      }
    },
  },
  wardrobe: {
    color: 0xc98a4a,
    draw: (k, c) => {
      k.line(0xd5dded, 7, (p) => p.m(0, -7).l(0, -17).c(0, -41, 24, -41, 24, -26).c(24, -19, 17, -16, 10, -16));
      k.line(c, 10, (p) => p.m(-43, 22).l(0, -6).l(43, 22).close());
      k.detail([0xffe27a, 0xf0a21e], (p) => p.star(0, 12, 11, 5, 5, 1.5));
    },
  },
  share: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.line(WHITE, 7, (p) => {
        p.m(-26, 0).l(26, -28);
        p.m(-26, 0).l(26, 28);
      });
      k.solid(c, (p) => {
        p.circle(-26, 0, 16);
        p.circle(26, -28, 16);
        p.circle(26, 28, 16);
      });
    },
  },
  code: {
    color: 0xffc93a,
    draw: (k, c) => {
      k.pen.at(0, 0, -PI / 4, 1.1);
      k.solid(c, (p) => {
        p.circle(0, -28, 18);
        p.rrect(-5, -16, 10, 62, 3);
        p.rrect(5, 21, 13, 8, 2);
        p.rrect(5, 34, 10, 8, 2);
      });
      k.detail(Color.outline, (p) => p.circle(0, -28, 8));
      k.pen.at();
    },
  },
  speed_1: { color: Color.ink, draw: chevrons(1) },
  speed_2: { color: Color.ink, draw: chevrons(2) },
  speed_3: { color: Color.ink, draw: chevrons(3) },
  eye: {
    color: 0x4da6ff,
    draw: (k, c) => {
      k.solid([0xffffff, 0xe4defa], (p) => p.m(-45, 0).c(-22, -36, 22, -36, 45, 0).c(22, 36, -22, 36, -45, 0).close());
      k.detail([shade(c, 0.35), shade(c, -0.2)], (p) => p.circle(0, 0, 20));
      k.detail(Color.outline, (p) => p.circle(0, 0, 9.5));
      k.detail(WHITE, (p) => p.circle(-6.5, -7, 5.2), 0.95);
    },
  },
  book: {
    color: Color.teal,
    draw: (k, c) => {
      k.solid(Color.paperLight, (p) => p.rrect(-27, -35, 62, 78, 7));
      k.solid(c, (p) => p.rrect(-37, -42, 62, 80, 9));
      k.detail(Color.paperLight, (p) => p.rrect(-27, -29, 42, 14, 5));
      k.detail(Color.mustard, (p) => p.star(-6, 12, 14, 6.5, 5, 1.5));
    },
  },
  dice: {
    color: WHITE,
    draw: (k, c) => {
      k.pen.at(0, 0, -0.22);
      k.solid(c, (p) => p.rrect(-31, -31, 62, 62, 13));
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
  /** Outline colour (default: the ink brown). */
  outline?: number;
  /** Bake the vector drawing into a texture (default true): icons are static and numerous. */
  cache?: boolean;
}

/**
 * The pure vector drawing of an icon name, centred on the origin and `size` px square. `color` replaces the icon's main
 * body colour (e.g. tint a star grey for "unearned"); accents keep their own colours. It is also the stand-in of a picture (see
 * currencyIcon); to show a currency or reward, ask for it with drawIcon or currencyIcon so the painted art is used.
 */
export function drawGlyph(name: IconName, size: number, color?: number, opts: IconOpts = {}): Graphics {
  const g = new Graphics();
  const def = ICONS[name];
  const ink = new Ink(g, size, opts.outline ?? Color.outline);
  def.draw(ink, color ?? matte(def.color));
  if (opts.cache ?? true) cacheStatic(g);
  return g;
}

/**
 * The picture of a currency or countable reward, centred on the origin and fitted into a `size` px square: its painted art when it is
 * loaded, otherwise the drawn stand-in (`color` tints the stand-in only). The sprite sits in a container so a caller that scales the
 * result (a flying icon) keeps the fit.
 */
export function currencyIcon(id: PictureId, size: number, color?: number): Container {
  const def: PictureDef = PICTURES[id];
  const c = new Container();
  if (def.art !== null && hasTex(def.art)) {
    const s = new Sprite(tex(def.art));
    s.anchor.set(0.5);
    s.scale.set(size / Math.max(1, s.texture.width, s.texture.height));
    c.addChild(s);
  } else {
    c.addChild(drawGlyph(def.glyph, size, color ?? def.color));
  }
  return c;
}

/**
 * A crisp icon, centred on the origin and `size` px square. An icon that stands for a currency or reward ('coin', 'gem', 'fish',
 * 'purr', 'ticket', 'xp', 'chest') is drawn as that thing's picture, so it looks the same here as in the shop; every other name is
 * the vector drawing (see drawGlyph for `color` and `opts`, which a picture ignores).
 */
export function drawIcon(name: Exclude<IconName, PictureGlyph>, size: number, color?: number, opts?: IconOpts): Graphics;
export function drawIcon(name: IconName, size: number, color?: number, opts?: IconOpts): Container;
export function drawIcon(name: IconName, size: number, color?: number, opts: IconOpts = {}): Container {
  const id: PictureId | undefined = (GLYPH_PICTURE as Partial<Record<IconName, PictureId>>)[name];
  return id === undefined ? drawGlyph(name, size, color, opts) : currencyIcon(id, size, color);
}
