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
