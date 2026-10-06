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
