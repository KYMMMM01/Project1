/** Visual tokens shared by every screen. Colours are 0xRRGGBB. */
export const FONT_FAMILY = ['GameLatin', 'GameKR', 'system-ui', 'sans-serif'];

export const Color = {
  // surfaces
  bgDeep: 0x120b24,
  bg: 0x1b1233,
  panel: 0x2b1d52,
  panelLight: 0x3b2a6b,
  panelDark: 0x1e143d,
  outline: 0x140a2e,
  // text
  text: 0xffffff,
  textDim: 0xb9add6,
  textDark: 0x2a1746,
  // brand / actions
  primary: 0xffb629,
  primaryDark: 0xd97a00,
  success: 0x4cd964,
  successDark: 0x1f9d3e,
  info: 0x4da6ff,
  infoDark: 0x1f6fd0,
  danger: 0xff4d5e,
  dangerDark: 0xb81f3a,
  purple: 0xa767ff,
  purpleDark: 0x6a2fd0,
  neutral: 0x7b6ea6,
  neutralDark: 0x4a3f73,
  // currencies
  gold: 0xffd23f,
  gem: 0x4ee3ff,
  energy: 0x7dff6b,
  white: 0xffffff,
  black: 0x000000,
} as const;

export type RarityId = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_ORDER: readonly RarityId[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

export interface RarityStyle {
  color: number;
  dark: number;
  light: number;
  glow: number;
}

/** The palette players already know from the genre: grey < blue < purple < gold < red/pink. */
export const Rarity: Record<RarityId, RarityStyle> = {
  common: { color: 0xb7c2d0, dark: 0x6b7686, light: 0xe6ecf2, glow: 0xdfe8f0 },
  rare: { color: 0x4da6ff, dark: 0x1f5fc0, light: 0xa9d6ff, glow: 0x7cc0ff },
  epic: { color: 0xb26bff, dark: 0x6a2fc8, light: 0xdcb8ff, glow: 0xc98cff },
  legendary: { color: 0xffb629, dark: 0xc46c00, light: 0xffe08a, glow: 0xffd45e },
  mythic: { color: 0xff4d7a, dark: 0xb0164a, light: 0xffa6c0, glow: 0xff7fa0 },
};

export function rarityIndex(r: RarityId): number {
  return RARITY_ORDER.indexOf(r);
}

/** Smallest font size any component may use (design px); below this text is unreadable on a phone. */
export const MIN_FONT = 20;

/** Touch-target sizes (design px): absolute minimum, comfortable default, primary call-to-action height. */
export const Hit = { min: 88, comfy: 96, cta: 120 } as const;

export type ButtonStyleId = 'primary' | 'success' | 'info' | 'danger' | 'neutral' | 'purple';

/** Every colour a chunky button needs, hand-tuned so the six styles share one lightness structure. */
export interface ButtonPalette {
  /** Face gradient: highlight edge, body, deep edge. */
  top: number;
  base: number;
  bottom: number;
  /** Bevel rim between the outline and the face (light on top, dark at the bottom). */
  rimTop: number;
  rimBottom: number;
  /** The darker slab the face sits on — what makes the button look physical. */
  lip: number;
  /** Outline for text drawn on the button. */
  textStroke: number;
  glow: number;
}

export const ButtonPalettes: Record<ButtonStyleId, ButtonPalette> = {
  primary: {
    top: 0xffe27a,
    base: 0xffb629,
    bottom: 0xff9410,
    rimTop: 0xfff6c4,
    rimBottom: 0xe8780a,
    lip: 0xbf5a05,
    textStroke: 0x8a3a00,
    glow: 0xffd45e,
  },
  success: {
    top: 0xa6f58a,
    base: 0x4cd964,
    bottom: 0x28b048,
    rimTop: 0xdcffcb,
    rimBottom: 0x1c8d3a,
    lip: 0x157030,
    textStroke: 0x0d4a1e,
    glow: 0x8cff8a,
  },
  info: {
    top: 0x9fd5ff,
    base: 0x4da6ff,
    bottom: 0x2a80ea,
    rimTop: 0xd9eeff,
    rimBottom: 0x1c5cbd,
    lip: 0x153f94,
    textStroke: 0x0c2a66,
    glow: 0x7cc0ff,
  },
  danger: {
    top: 0xff9ea6,
    base: 0xff4d5e,
    bottom: 0xe02a46,
    rimTop: 0xffd6da,
    rimBottom: 0xb41d38,
    lip: 0x8a1230,
    textStroke: 0x560a1e,
    glow: 0xff7a88,
  },
  neutral: {
    top: 0xb7acdf,
    base: 0x8678b8,
    bottom: 0x6a5d9c,
    rimTop: 0xdcd4f5,
    rimBottom: 0x52467f,
    lip: 0x3b3166,
    textStroke: 0x231a45,
    glow: 0xb9add6,
  },
  purple: {
    top: 0xd5acff,
    base: 0xa767ff,
    bottom: 0x8345ea,
    rimTop: 0xeedcff,
    rimBottom: 0x6a2fd0,
    lip: 0x4d1fa5,
    textStroke: 0x2d0f66,
    glow: 0xc98cff,
  },
};

/** Z-order inside game.popupLayer / game.overlayLayer is by add order; these are the shared fades. */
export const Dim = { backdrop: 0x0b0618, backdropAlpha: 0.66 } as const;

// ───────────────────────── palette previews (QA) ─────────────────────────
// `?theme=<name>` swaps the colour tokens before any UI is built, so alternative looks can be
// reviewed on the real screens. Only token values change; nothing else reads this.

type Tokens = Record<keyof typeof Color, number>;

function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 0xff) + (((b >> s) & 0xff) - ((a >> s) & 0xff)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Derive a full chunky-button palette from one base colour (same lightness structure as the hand-tuned ones). */
function buttonFrom(base: number): ButtonPalette {
  return {
    top: mixHex(base, 0xffffff, 0.38),
    base,
    bottom: mixHex(base, 0x000000, 0.1),
    rimTop: mixHex(base, 0xffffff, 0.72),
    rimBottom: mixHex(base, 0x000000, 0.22),
    lip: mixHex(base, 0x000000, 0.38),
    textStroke: mixHex(base, 0x000000, 0.62),
    glow: mixHex(base, 0xffffff, 0.3),
  };
}

interface PalettePreview {
  tokens: Partial<Tokens>;
  /** Base colour per button style; unspecified styles keep their tuned palette. */
  buttons: Partial<Record<ButtonStyleId, number>>;
  backdrop: number;
}

export const PALETTE_PREVIEWS: Record<string, PalettePreview> = {
  // Sunny home: cream panels, wood-brown outlines, coral call-to-action, teal secondary.
  day: {
    tokens: {
      bgDeep: 0xcdb48a, bg: 0xe9d6b0, panel: 0xfff1d6, panelLight: 0xfffaf0, panelDark: 0xe6d2ab, outline: 0x4a2c1a,
      textDim: 0x9a7b5f, textDark: 0x4a2c1a,
      primary: 0xff8347, primaryDark: 0xd9541e, info: 0x2bb8b0, infoDark: 0x16857f, success: 0x6cc24a, successDark: 0x3f8f25,
      danger: 0xe9524a, dangerDark: 0xa82b25, purple: 0xc0739a, purpleDark: 0x8a4368, neutral: 0xbba383, neutralDark: 0x86704f,
      gold: 0xffc93c, gem: 0x3fc7e8,
    },
    buttons: { primary: 0xff8347, info: 0x2bb8b0, success: 0x6cc24a, danger: 0xe9524a, purple: 0xc0739a, neutral: 0xbba383 },
    backdrop: 0x2a1a10,
  },
  // Deep teal: dark like today but sea-green instead of purple, coral call-to-action.
  teal: {
    tokens: {
      bgDeep: 0x0b1f2a, bg: 0x10303f, panel: 0x16465a, panelLight: 0x1f5d75, panelDark: 0x0f3344, outline: 0x06161f,
      textDim: 0x9cc9d6, textDark: 0x0f3344,
      primary: 0xff7a59, primaryDark: 0xd94f2e, info: 0x4cc9f0, infoDark: 0x1f8fb8, purple: 0x54c6a9, purpleDark: 0x26917a,
      neutral: 0x6f95a3, neutralDark: 0x41616d,
    },
    buttons: { primary: 0xff7a59, info: 0x4cc9f0, purple: 0x54c6a9, neutral: 0x6f95a3 },
    backdrop: 0x04121a,
  },
  // Houseplant green: deep leaf-green panels, butter-yellow call-to-action, terracotta accents.
  leaf: {
    tokens: {
      bgDeep: 0x14261b, bg: 0x1d3626, panel: 0x2a4d36, panelLight: 0x3a6648, panelDark: 0x1e3a29, outline: 0x0c1a11,
      textDim: 0xb7d6bf, textDark: 0x1e3a29,
      primary: 0xffd166, primaryDark: 0xd9a020, info: 0x6bc5d2, infoDark: 0x3a8f9c, purple: 0xe07a5f, purpleDark: 0xb0503a,
      neutral: 0x7fa089, neutralDark: 0x4f6b58,
    },
    buttons: { primary: 0xffc94d, info: 0x6bc5d2, purple: 0xe07a5f, neutral: 0x7fa089 },
    backdrop: 0x08130c,
  },
};

export function applyPalettePreview(name: string): boolean {
  const p = PALETTE_PREVIEWS[name];
  if (!p) return false;
  Object.assign(Color as unknown as Tokens, p.tokens);
  for (const id of Object.keys(p.buttons) as ButtonStyleId[]) {
    ButtonPalettes[id] = buttonFrom(p.buttons[id] as number);
  }
  (Dim as { backdrop: number }).backdrop = p.backdrop;
  return true;
}

if (typeof location !== 'undefined') {
  const requested = new URLSearchParams(location.search).get('theme');
  if (requested) applyPalettePreview(requested);
}
