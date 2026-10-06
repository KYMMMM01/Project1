import { mixColor } from '@/core/math';
import { desaturate } from './colors';

/**
 * Visual tokens shared by every screen. Colours are 0xRRGGBB.
 *
 * The kit draws a sunny home by day made of cut paper lying on a wooden floor: cream sheets, kraft
 * strips, coloured craft paper, washi tape. Matte and flat; depth comes from layering and a flat
 * warm-brown shadow, never from gloss, glow or a dark outline. Every token from the earlier
 * "candy" kit is still here with its new meaning, so existing call sites keep compiling.
 */
export const FONT_FAMILY = ['GameLatin', 'GameKR', 'system-ui', 'sans-serif'];

export const Color = {
  // ── paper world (use these in new code) ──
  /** Body text and glyphs on paper. */
  ink: 0x4a3222,
  /** Secondary text on cream paper (AA on `paper`). */
  inkSoft: 0x7d5e45,
  /** Between `inkSoft` and `ink`: unselected labels on kraft strips (AA on `kraft`). */
  inkMid: 0x6b4d38,
  /** Darker ink for labels that sit on coloured craft paper (coral, berry, teal). */
  inkDeep: 0x3b2418,
  /** Light text. Only for text that sits directly on artwork or a dark dim; always with a brown stroke. */
  onArt: 0xfffaf0,
  /** Cream sheets and cards. */
  paper: 0xfbf3e2,
  /** Brighter ivory, for a card lying on a `paper` sheet. */
  paperLight: 0xfffaee,
  /** Darker cream for nested areas (wells, inactive rows). */
  paperDim: 0xedddbb,
  /** Kraft paper: secondary strips, tracks, bases. */
  kraft: 0xd9b88a,
  kraftDark: 0xb48f62,
  /** Track colour: the darker kraft strip that bars and sliders are painted into. */
  track: 0xd3bb94,
  /** The wooden floor behind every sheet. */
  wood: 0xc48f50,
  woodDark: 0xa06a33,
  /** Sunlit plank streaks on the floor. */
  woodLight: 0xe0b070,
  /** Tint a pressed paper takes on the frame of the pointerdown. */
  pressTint: 0xece0d0,
  /** Warm grey and copper: the silver and bronze edges of the synergy tiers. */
  stone: 0xa59d90,
  bronze: 0xb8845a,
  /** Colour of the flat shadow under a piece of paper (drawn at about 22 % alpha). */
  shadow: 0x6a4527,
  coral: 0xf0796b,
  coralDark: 0xc4544a,
  teal: 0x5fb9c4,
  tealDark: 0x3e9aa6,
  mustard: 0xf0bc43,
  mustardDark: 0xc48f1f,
  leaf: 0x7dba5c,
  leafDark: 0x4f8f3a,
  berry: 0xd96579,
  berryDark: 0xa83f56,
  violet: 0x9c84c0,
  violetDark: 0x6f5a96,
  // ── legacy names, re-valued ──
  /** Scene backgrounds: the floor. */
  bgDeep: 0xa87440,
  bg: 0xc99a5c,
  panel: 0xfbf3e2,
  panelLight: 0xfffaee,
  panelDark: 0xedddbb,
  /** Stroke for light text on artwork and for hand-inked lines: the ink brown. */
  outline: 0x4a3222,
  text: 0x4a3222,
  textDim: 0x7d5e45,
  textDark: 0x3b2418,
  primary: 0xf0796b,
  primaryDark: 0xc4544a,
  success: 0x7dba5c,
  successDark: 0x4f8f3a,
  info: 0x5fb9c4,
  infoDark: 0x3e9aa6,
  danger: 0xd96579,
  dangerDark: 0xa83f56,
  purple: 0x9c84c0,
  purpleDark: 0x6f5a96,
  neutral: 0xd9b88a,
  neutralDark: 0xa88457,
  // currencies
  gold: 0xf0bc43,
  gem: 0x6ccbe0,
  energy: 0x9ccb5e,
  white: 0xffffff,
  black: 0x000000,
} as const;

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_ORDER: readonly RarityId[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export interface RarityStyle {
  /** The matte hue: the card's inner mat, bars, pips. */
  color: number;
  /** Deeper tone for edges and small marks that must read on cream. */
  dark: number;
  light: number;
  /** Tint for light effects over artwork (burst rays, particles). Never used on a kit component. */
  glow: number;
}

/** Five matte hues that stay apart on cream paper: beige < teal-blue < violet < mustard-orange < berry-coral. */
export const Rarity: Record<RarityId, RarityStyle> = {
  common: { color: 0xc9bba3, dark: 0x8f7f66, light: 0xe6dcc9, glow: 0xe6dcc9 },
  rare: { color: 0x4fa3c7, dark: 0x2f7a9c, light: 0xa8d6e8, glow: 0x8ccbe3 },
  epic: { color: 0x9c7fc2, dark: 0x6c5392, light: 0xcdbce3, glow: 0xb79bdb },
  legendary: { color: 0xe8a23a, dark: 0xb36f14, light: 0xf6d18a, glow: 0xf3c262 },
  mythic: { color: 0xdf5c6f, dark: 0xa23248, light: 0xf3a3ae, glow: 0xf08a99 },
};

/** The small gold accent on mythic cards. */
export const RARITY_GOLD = 0xeab84a;

export function rarityIndex(r: RarityId): number {
  return RARITY_ORDER.indexOf(r);
}

/** Smallest font size any component may use (design px); below this text is unreadable on a phone. */
export const MIN_FONT = 24;

/** Touch-target sizes (design px): absolute minimum, comfortable default, primary call-to-action height. */
export const Hit = { min: 88, comfy: 96, cta: 120 } as const;

export type ButtonStyleId = 'primary' | 'success' | 'info' | 'danger' | 'neutral' | 'purple' | 'mustard' | 'kraft';

/** Every colour a paper button needs. */
export interface ButtonPalette {
  /** The paper. */
  base: number;
  /** Fibre tones a hair lighter and darker than `base`: only used where a call site still fills a vertical gradient. */
  top: number;
  bottom: number;
  /** Darker paper tone: the thin edge line just inside the cut, and the disabled/pressed shade. */
  lip: number;
  /** Label colour on this paper. */
  ink: number;
  /** Stroke for light text that sits on this colour over artwork. */
  textStroke: number;
}

function paperTones(base: number, lip: number, ink: number): ButtonPalette {
  const ch = (c: number, s: number, k: number) => {
    const v = ((c >> s) & 0xff) + k;
    return Math.max(0, Math.min(255, v));
  };
  const lift = (c: number, k: number) => (ch(c, 16, k) << 16) | (ch(c, 8, k) << 8) | ch(c, 0, k);
  return { base, top: lift(base, 8), bottom: lift(base, -10), lip, ink, textStroke: Color.outline };
}

/** Coral is the main action; teal informs; cream is the quiet secondary; berry warns. */
export const ButtonPalettes: Record<ButtonStyleId, ButtonPalette> = {
  primary: paperTones(Color.coral, 0xd25f52, Color.inkDeep),
  success: paperTones(Color.leaf, 0x5f9944, Color.inkDeep),
  info: paperTones(Color.teal, 0x3e9aa6, Color.inkDeep),
  danger: paperTones(Color.berry, 0xb24a60, Color.inkDeep),
  neutral: paperTones(0xf6ead0, 0xd6c096, Color.ink),
  purple: paperTones(Color.violet, 0x7c649f, Color.inkDeep),
  mustard: paperTones(Color.mustard, 0xcf9a28, Color.inkDeep),
  kraft: paperTones(Color.kraft, 0xb48f62, Color.ink),
};

/** The kraft the disabled paper is pulled toward. */
const MUTED_KRAFT = 0xd6c6a8;

/**
 * Disabled look: the same paper with its colour drained toward kraft. The ink stays full strength
 * (AA on every muted paper): a greyed button still has to say what it does and what it costs.
 */
export function mutedPalette(p: ButtonPalette): ButtonPalette {
  const f = (c: number): number => mixColor(desaturate(c, 0.9), MUTED_KRAFT, 0.5);
  return { base: f(p.base), top: f(p.top), bottom: f(p.bottom), lip: f(p.lip), ink: Color.ink, textStroke: Color.outline };
}

export type TapeName = 'pink' | 'sky' | 'yellow' | 'green';

/** Washi tape: the translucent body and the colour its pattern is printed in. */
export const TapeColors: Record<TapeName, { base: number; mark: number }> = {
  pink: { base: 0xf3a9ba, mark: 0xfff0f3 },
  sky: { base: 0x9acbea, mark: 0xeaf6ff },
  yellow: { base: 0xf5d36a, mark: 0xfff6cf },
  green: { base: 0xa6d48b, mark: 0xf0fbe8 },
};

/** Z-order inside game.popupLayer / game.overlayLayer is by add order; this is the shared dim: warm brown, never black. */
export const Dim = { backdrop: 0x3a2514, backdropAlpha: 0.58 } as const;
