/** Per-enemy, per-unit and per-status staging data: colours, shoot cues and cosmetic summon themes. Data only. */
import type { SfxId } from '@/audio/api';
import type { BossAbilityId, ClassId, EnemyId, StatusKind, UnitId } from '@/game/api';
import { mixColor } from '@/core/math';
import { CLASS_HUE, Hue } from '@/fx/palette';
import type { FxTexId } from '@/fx/textures';
import { Color, TapeColors } from '@/ui/theme';

/** Colour of the puff and shards an enemy leaves behind: each enemy's dominant paper, taken from its sticker. */
export const ENEMY_TINT: Readonly<Record<EnemyId, number>> = {
  cucumber: Color.leaf,
  dust: Hue.dust,
  drop: TapeColors.sky.base,
  roomba: mixColor(Color.paperDim, Color.inkSoft, 0.3),
  tangerine: mixColor(Color.mustard, Color.coral, 0.4),
  balloon: Color.berry,
  balloon_small: mixColor(Color.berry, Color.paperLight, 0.3),
  clock: Color.mustard,
  pill: mixColor(Color.coral, Color.paperLight, 0.3),
  cone: Hue.fire,
  dryer: Color.teal,
  spray: TapeColors.sky.base,
  firecracker: Color.coralDark,
  boss_cucumber: Color.leafDark,
  boss_vacuum: mixColor(Color.paperDim, Color.inkSoft, 0.3),
  boss_blender: Color.berry,
  boss_bath: Color.teal,
  boss_cloud: mixColor(TapeColors.sky.base, Color.paperDim, 0.5),
  boss_needle: mixColor(Color.leaf, Color.teal, 0.5),
};

/** Effect colour of each cat's shots, sparks and impacts: its class paper, shifted a little per cat. */
export const UNIT_COLOR: Readonly<Record<UnitId, number>> = {
  w_paw: Hue.sun,
  w_sword: Color.paperLight,
  w_viking: Hue.fire,
  w_samurai: mixColor(TapeColors.sky.mark, Color.paperLight, 0.5),
  w_tiger: Color.coral,
  r_sling: Color.kraft,
  r_archer: Color.leaf,
  r_ninja: mixColor(Color.paperDim, Color.inkSoft, 0.3),
  r_gunner: Color.mustard,
  r_star: Hue.sun,
  m_snow: TapeColors.sky.base,
  m_fire: Color.coral,
  m_storm: Color.mustard,
  m_frost: Hue.ice,
  m_cosmo: mixColor(Color.inkSoft, Color.teal, 0.5),
  t_bell: Hue.sun,
  t_chef: mixColor(Color.coral, Color.mustard, 0.6),
  t_bard: Color.berry,
  t_alch: Color.leaf,
  t_lucky: Color.mustard,
};

export const CLASS_COLOR: Readonly<Record<ClassId, number>> = CLASS_HUE;

export const STATUS_COLOR: Readonly<Record<StatusKind, number>> = {
  slow: TapeColors.sky.base,
  stun: Hue.sun,
  freeze: Hue.ice,
  burn: Hue.ember,
  poison: Color.leaf,
  bleed: Color.berry,
  armor_break: Color.paperDim,
  vulnerable: mixColor(Color.berry, Color.paperLight, 0.3),
};

/** Face colour of damage-over-time numbers. */
export const DOT_NUMBER_COLOR: Readonly<Partial<Record<StatusKind, number>>> = {
  burn: Hue.ember,
  poison: Color.leafDark,
  bleed: Color.berry,
};

export const SHIELD_COLOR: number = TapeColors.sky.base;

/** shot: a muzzle flash at the cat; swing: a slash at the target; cast: a ring at the cat (zones, chains). */
export type ShootStyle = 'shot' | 'swing' | 'cast';

export interface ShootCue {
  sfx: SfxId;
  /** Playback-rate multiplier: lower = heavier. */
  pitch: number;
  /** Linear gain: the most frequent sounds sit low in the mix. */
  volume: number;
  style: ShootStyle;
}

export const SHOOT_CUE: Readonly<Record<UnitId, ShootCue>> = {
  w_paw: { sfx: 'shoot_claw', pitch: 1.1, volume: 0.5, style: 'swing' },
  w_sword: { sfx: 'shoot_claw', pitch: 0.9, volume: 0.6, style: 'swing' },
  w_viking: { sfx: 'shoot_claw', pitch: 0.7, volume: 0.75, style: 'swing' },
  w_samurai: { sfx: 'shoot_claw', pitch: 1.3, volume: 0.7, style: 'swing' },
  w_tiger: { sfx: 'shoot_claw', pitch: 0.6, volume: 0.8, style: 'swing' },
  r_sling: { sfx: 'shoot_arrow', pitch: 0.85, volume: 0.5, style: 'shot' },
  r_archer: { sfx: 'shoot_arrow', pitch: 1, volume: 0.5, style: 'shot' },
  r_ninja: { sfx: 'shoot_arrow', pitch: 1.35, volume: 0.45, style: 'shot' },
  r_gunner: { sfx: 'shoot_cannon', pitch: 1, volume: 0.7, style: 'shot' },
  r_star: { sfx: 'shoot_magic', pitch: 1.25, volume: 0.6, style: 'shot' },
  m_snow: { sfx: 'shoot_ice', pitch: 1.1, volume: 0.5, style: 'shot' },
  m_fire: { sfx: 'shoot_magic', pitch: 0.8, volume: 0.55, style: 'shot' },
  m_storm: { sfx: 'shoot_lightning', pitch: 1, volume: 0.6, style: 'cast' },
  m_frost: { sfx: 'shoot_ice', pitch: 0.75, volume: 0.6, style: 'cast' },
  m_cosmo: { sfx: 'shoot_magic', pitch: 0.55, volume: 0.7, style: 'cast' },
  t_bell: { sfx: 'shoot_magic', pitch: 1.6, volume: 0.35, style: 'shot' },
  t_chef: { sfx: 'shoot_magic', pitch: 1.2, volume: 0.4, style: 'shot' },
  t_bard: { sfx: 'shoot_magic', pitch: 1.0, volume: 0.45, style: 'shot' },
  t_alch: { sfx: 'shoot_poison', pitch: 1, volume: 0.55, style: 'cast' },
  t_lucky: { sfx: 'shoot_magic', pitch: 1.15, volume: 0.5, style: 'shot' },
};

/** Sound that goes with each status cue. Statuses without an entry are silent. */
export const STATUS_SFX: Readonly<Partial<Record<StatusKind, { sfx: SfxId; volume: number; pitch: number }>>> = {
  freeze: { sfx: 'freeze', volume: 0.7, pitch: 1 },
  stun: { sfx: 'stun', volume: 0.6, pitch: 1 },
  armor_break: { sfx: 'shield_break', volume: 0.45, pitch: 1.5 },
  slow: { sfx: 'freeze', volume: 0.25, pitch: 1.4 },
};

/** Short caption (i18n key) shown under the banner when a boss uses an ability. */
export const ABILITY_CAPTION: Readonly<Record<BossAbilityId, string>> = {
  enrage: 'director.ability.enrage',
  inhale: 'director.ability.inhale',
  whirl: 'director.ability.whirl',
  splash: 'director.ability.splash',
  lightning: 'director.ability.lightning',
  vaccinate: 'director.ability.vaccinate',
};

/** A cosmetic summon-effect theme: extra particles added on top of the rarity colours, never instead. */
export interface FxThemeSpec {
  index: 0 | 1 | 2 | 3;
  tex: FxTexId;
  colors: readonly number[];
  /** Extra particles per reveal at tier 1; grows with the tier. */
  count: number;
  gravity: number;
}

const THEMES: readonly FxThemeSpec[] = [
  { index: 0, tex: 'sparkle', colors: [Hue.cream], count: 0, gravity: 0 },
  { index: 1, tex: 'heart', colors: [Hue.heart, Color.berry, Hue.cream], count: 5, gravity: 120 },
  { index: 2, tex: 'star', colors: [Hue.ice, Hue.iceLight, Hue.cream], count: 6, gravity: -40 },
  { index: 3, tex: 'paw', colors: [Hue.sun, Hue.ember, Hue.cream], count: 5, gravity: 220 },
];

/** Cosmetic ids look like `fx_default`, `fx_gem1`..`fx_gem3`; anything unknown plays the default. */
export function themeOf(id: string): FxThemeSpec {
  const m = /gem(\d)$/.exec(id);
  const n = m ? Number(m[1]) : 0;
  return THEMES[n >= 1 && n <= 3 ? n : 0] as FxThemeSpec;
}
