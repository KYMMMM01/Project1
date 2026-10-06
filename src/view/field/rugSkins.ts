/** Board mat skins as data: a palette plus a calm pattern. Ids match the meta cosmetics (`profile.equipped.rug`). */

export type RugPattern = 'plain' | 'stripes' | 'checks' | 'dots' | 'paws' | 'waves' | 'stars' | 'diamond';

export interface RugSkin {
  id: string;
  pattern: RugPattern;
  /** Field colour. */
  base: number;
  /** Second colour of the pattern (stripes, checks, wave bands): close to `base` so cats stay readable. */
  alt: number;
  /** Outer band of the mat. */
  border: number;
  /** Stitching along the band. */
  stitch: number;
  /** Small motifs drawn on top (dots, paws, stars) and the band's inner pin-stripe. */
  accent: number;
}

export const DEFAULT_RUG = 'rug_default';

export const RUG_SKINS: readonly RugSkin[] = [
  { id: 'rug_default', pattern: 'plain', base: 0x6a55a6, alt: 0x5d4a98, border: 0x3b2c6e, stitch: 0xf6e8b8, accent: 0x8c78c8 },
  { id: 'rug_ch1', pattern: 'stripes', base: 0x2f7378, alt: 0x3a8a8a, border: 0x1d4a50, stitch: 0xffe9b8, accent: 0x5fb0a8 },
  { id: 'rug_ch2', pattern: 'checks', base: 0xb5453f, alt: 0x9a3636, border: 0x6a2020, stitch: 0xfff0d0, accent: 0xf2b8a0 },
  { id: 'rug_ch3', pattern: 'waves', base: 0x2f78c0, alt: 0x4a98de, border: 0x1d4a82, stitch: 0xe0f4ff, accent: 0x9ad0ff },
  { id: 'rug_ch4', pattern: 'dots', base: 0xc4546e, alt: 0xb04660, border: 0x7d2a44, stitch: 0xffeccf, accent: 0xffd9c4 },
  { id: 'rug_ch5', pattern: 'diamond', base: 0x4a5fa8, alt: 0x5d74c0, border: 0x2e3a78, stitch: 0xe8eeff, accent: 0x9bb0f0 },
  { id: 'rug_gem1', pattern: 'dots', base: 0xe8506a, alt: 0xd8445e, border: 0xa02a45, stitch: 0xfff0f0, accent: 0xffe066 },
  { id: 'rug_gem2', pattern: 'waves', base: 0x6fa8ea, alt: 0x8cc0f8, border: 0x4a7fc4, stitch: 0xffffff, accent: 0xe4f2ff },
  { id: 'rug_gem3', pattern: 'stars', base: 0x1f2a5c, alt: 0x2a3878, border: 0x121a3d, stitch: 0xffd86b, accent: 0xffe9a0 },
  { id: 'rug_baby', pattern: 'paws', base: 0xe898b8, alt: 0xf4b4cc, border: 0xc0668e, stitch: 0xfff4f8, accent: 0xffd6e4 },
  { id: 'rug_butler', pattern: 'diamond', base: 0x2a2a3e, alt: 0x3a3a54, border: 0x15151f, stitch: 0xd8b45a, accent: 0xd8b45a },
  { id: 'rug_calendar', pattern: 'stripes', base: 0x3d8f5f, alt: 0xb83a3a, border: 0x1f4f35, stitch: 0xfff2cc, accent: 0xffd86b },
  { id: 'rug_season', pattern: 'stars', base: 0x8a4fc8, alt: 0x9a62d8, border: 0x55279a, stitch: 0xffe3ff, accent: 0xffd23f },
];

const byId = new Map(RUG_SKINS.map((s) => [s.id, s] as const));

/** The skin for an equipped cosmetic id; unknown ids (a skin from a newer build) fall back to the default mat. */
export function rugSkin(id: string): RugSkin {
  return byId.get(id) ?? (byId.get(DEFAULT_RUG) as RugSkin);
}

export interface Dash {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Dashes of equal length along the outline of a rounded rectangle (x, y = top-left), for stitching.
 * The first dash starts at the top edge's left end; arcs are approximated by chords of the dash length.
 */
export function perimeterDashes(w: number, h: number, r: number, dash: number, gap: number): Dash[] {
  const straightW = w - 2 * r;
  const straightH = h - 2 * r;
  const arc = (Math.PI / 2) * r;
  const total = 2 * straightW + 2 * straightH + 4 * arc;
  const pointAt = (s: number, out: { x: number; y: number }): void => {
    let d = ((s % total) + total) % total;
    if (d < straightW) {
      out.x = r + d;
      out.y = 0;
      return;
    }
    d -= straightW;
    if (d < arc) {
      const a = -Math.PI / 2 + d / r;
      out.x = w - r + Math.cos(a) * r;
      out.y = r + Math.sin(a) * r;
      return;
    }
    d -= arc;
    if (d < straightH) {
      out.x = w;
      out.y = r + d;
      return;
    }
    d -= straightH;
    if (d < arc) {
      const a = d / r;
      out.x = w - r + Math.cos(a) * r;
      out.y = h - r + Math.sin(a) * r;
      return;
    }
    d -= arc;
    if (d < straightW) {
      out.x = w - r - d;
      out.y = h;
      return;
    }
    d -= straightW;
    if (d < arc) {
      const a = Math.PI / 2 + d / r;
      out.x = r + Math.cos(a) * r;
      out.y = h - r + Math.sin(a) * r;
      return;
    }
    d -= arc;
    if (d < straightH) {
      out.x = 0;
      out.y = h - r - d;
      return;
    }
    d -= straightH;
    const a = Math.PI + d / r;
    out.x = r + Math.cos(a) * r;
    out.y = r + Math.sin(a) * r;
  };
  const out: Dash[] = [];
  const period = dash + gap;
  const count = Math.max(1, Math.floor(total / period));
  const step = total / count;
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 0, y: 0 };
  for (let i = 0; i < count; i++) {
    pointAt(i * step, p0);
    pointAt(i * step + dash, p1);
    out.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
  }
  return out;
}
