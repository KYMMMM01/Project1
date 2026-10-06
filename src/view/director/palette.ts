/** Per-enemy, per-unit and per-status staging data: colours, shoot cues and cosmetic summon themes. Data only. */
import type { SfxId } from '@/audio/api';
import type { BossAbilityId, ClassId, EnemyId, StatusKind, UnitId } from '@/game/api';
import type { FxTexId } from '@/fx/textures';

/** Colour of the puff and shards an enemy leaves behind. */
export const ENEMY_TINT: Readonly<Record<EnemyId, number>> = {
  cucumber: 0x74d45c,
  dust: 0xb9b0a2,
  drop: 0x6cc8ff,
  roomba: 0xaeb9cc,
  tangerine: 0xffa333,
  balloon: 0xff6f8e,
  balloon_small: 0xff93ab,
  clock: 0xffd84a,
  pill: 0xff8d8d,
  cone: 0xff8a3a,
  dryer: 0xc79bff,
  spray: 0x6fd6ff,
  firecracker: 0xff5a3c,
  boss_cucumber: 0x5ec04c,
  boss_vacuum: 0xb4bfd2,
  boss_blender: 0xff7fb0,
  boss_bath: 0x62cfff,
  boss_cloud: 0xa7b3d6,
  boss_needle: 0x80e6b8,
};

/** Effect colour of each cat's shots, sparks and impacts. */
export const UNIT_COLOR: Readonly<Record<UnitId, number>> = {
  w_paw: 0xffc46b,
  w_sword: 0xe8f1ff,
  w_viking: 0xffa24a,
  w_samurai: 0xdfe8ff,
  w_tiger: 0xff9a3c,
  r_sling: 0xd6c08a,
  r_archer: 0x9be36b,
  r_ninja: 0xb9a6ff,
  r_gunner: 0xffd36b,
  r_star: 0xfff0a8,
  m_snow: 0x9fe3ff,
  m_fire: 0xff7a2a,
  m_storm: 0xffe45c,
  m_frost: 0x7fd6ff,
  m_cosmo: 0xb26bff,
  t_bell: 0xffe08a,
  t_chef: 0xffb27a,
  t_bard: 0xff8fd0,
  t_alch: 0x86e05a,
  t_lucky: 0xffd23f,
};

export const CLASS_COLOR: Readonly<Record<ClassId, number>> = {
  warrior: 0xff9a3c,
  ranger: 0x7ddc6a,
  mage: 0x7fb8ff,
  trickster: 0xff7fc2,
};

export const STATUS_COLOR: Readonly<Record<StatusKind, number>> = {
  slow: 0x9fe3ff,
  stun: 0xffe45c,
  freeze: 0x7fd6ff,
  burn: 0xff7a2a,
  poison: 0x86e05a,
  bleed: 0xff4d5e,
  armor_break: 0xc9d2e0,
  vulnerable: 0xd48bff,
};

/** Tint of damage-over-time numbers. */
export const DOT_NUMBER_COLOR: Readonly<Partial<Record<StatusKind, number>>> = {
  burn: 0xff9a4a,
  poison: 0x9be36b,
  bleed: 0xff6b78,
};

export const SHIELD_COLOR = 0x7fe3ff;

/** shot: a muzzle flash at the cat; swing: a slash at the target; cast: a glow ring at the cat (zones, chains). */
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
  { index: 0, tex: 'sparkle', colors: [0xffffff], count: 0, gravity: 0 },
  { index: 1, tex: 'heart', colors: [0xffd1e3, 0xff9ec4, 0xffffff], count: 5, gravity: 120 },
  { index: 2, tex: 'star', colors: [0x9fe8ff, 0xb8a6ff, 0xffffff], count: 6, gravity: -40 },
  { index: 3, tex: 'paw', colors: [0xffe08a, 0xffb347, 0xffffff], count: 5, gravity: 220 },
];

/** Cosmetic ids look like `fx_default`, `fx_gem1`..`fx_gem3`; anything unknown plays the default. */
export function themeOf(id: string): FxThemeSpec {
  const m = /gem(\d)$/.exec(id);
  const n = m ? Number(m[1]) : 0;
  return THEMES[n >= 1 && n <= 3 ? n : 0] as FxThemeSpec;
}
