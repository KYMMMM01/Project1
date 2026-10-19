/**
 * Public audio contract. Everything in the game talks to `audio` (src/audio/index.ts) through this
 * interface only, so the synthesis engine behind it can change freely.
 */
/**
 * The sounds as they were before the hit-sound pass of 2026-10-19, kept only for the sound board's "지금" (sfx-before.ts): the game never plays them, they have no
 * row of their own on the board and belong to no family.
 */
export const LEGACY_SFX_IDS = [
  'old_atk_w_paw',
  'old_atk_w_sword',
  'old_atk_w_viking',
  'old_atk_w_samurai',
  'old_atk_w_tiger',
  'old_atk_r_sling',
  'old_atk_r_archer',
  'old_atk_r_ninja',
  'old_atk_r_gunner',
  'old_atk_r_star',
  'old_atk_m_fire',
  'old_atk_m_storm',
  'old_atk_m_frost',
  'old_atk_m_cosmo',
  'old_atk_t_bell',
  'old_atk_t_chef',
  'old_atk_t_bard',
  'old_atk_t_alch',
  'old_atk_t_lucky',
  'old_imp_w_paw',
  'old_imp_w_sword',
  'old_imp_w_viking',
  'old_imp_w_samurai',
  'old_imp_w_tiger',
  'old_imp_r_sling',
  'old_imp_r_archer',
  'old_imp_r_ninja',
  'old_imp_r_gunner',
  'old_imp_r_star',
  'old_imp_m_snow',
  'old_imp_m_fire',
  'old_imp_m_storm',
  'old_imp_m_frost',
  'old_imp_m_cosmo',
  'old_imp_t_bell',
  'old_imp_t_chef',
  'old_imp_t_bard',
  'old_imp_t_alch',
  'old_imp_t_lucky',
  'old_hit_heavy',
  'old_crit',
  'old_explosion',
  'old_boss_warning',
  'old_boss_roar',
  'old_foe_juicy_hit',
  'old_foe_fluff_hit',
  'old_foe_water_hit',
  'old_foe_rubber_hit',
  'old_foe_plastic_hit',
  'old_foe_tin_hit',
  'old_foe_motor_hit',
  'old_foe_paper_hit',
  'old_foe_glass_hit',
  'old_foe_cloud_hit',
] as const;

export const SFX_IDS = [
  // UI
  'ui_click',
  'ui_back',
  'ui_tab',
  'ui_toggle',
  'ui_popup_open',
  'ui_popup_close',
  'ui_error',
  'ui_confirm',
  // economy / rewards
  'coin',
  'coin_many',
  'gem',
  'reward_claim',
  'level_up',
  'star',
  'purchase',
  // summon & merge (escalating by rarity)
  'summon_common',
  'summon_rare',
  'summon_epic',
  'summon_legendary',
  'summon_mythic',
  'merge',
  'merge_big',
  'sell',
  'upgrade',
  'place',
  'pickup',
  // combat
  'shoot_arrow',
  'shoot_magic',
  'shoot_cannon',
  'shoot_ice',
  'shoot_lightning',
  'shoot_poison',
  'shoot_claw',
  'hit_light',
  'hit_heavy',
  'crit',
  'explosion',
  'freeze',
  'stun',
  'buff',
  'heal',
  'enemy_die',
  'boss_warning',
  'boss_roar',
  'boss_die',
  // flow
  'wave_start',
  'wave_clear',
  'danger_alarm',
  'countdown_tick',
  'whoosh',
  'relic_pick',
  // gacha / gamble
  'chest_shake',
  'chest_open',
  'card_flip',
  'reel_tick',
  'reel_stop',
  'jackpot',
  'gamble_fail',
  // v1.0 battle verbs
  'laser_on',
  'laser_off',
  'molt',
  'purr',
  'awaken',
  'call_wave',
  'sunbeam',
  'hazard_warn',
  'splash',
  'zap',
  'weaken',
  'shield_break',
  // weapon sounds: every cat has a release (the attack leaves the cat) and an impact (it lands on an enemy)
  'atk_w_paw',
  'atk_w_sword',
  'atk_w_viking',
  'atk_w_samurai',
  'atk_w_tiger',
  'atk_r_sling',
  'atk_r_archer',
  'atk_r_ninja',
  'atk_r_gunner',
  'atk_r_star',
  'atk_m_snow',
  'atk_m_fire',
  'atk_m_storm',
  'atk_m_frost',
  'atk_m_cosmo',
  'atk_t_bell',
  'atk_t_chef',
  'atk_t_bard',
  'atk_t_alch',
  'atk_t_lucky',
  'imp_w_paw',
  'imp_w_sword',
  'imp_w_viking',
  'imp_w_samurai',
  'imp_w_tiger',
  'imp_r_sling',
  'imp_r_archer',
  'imp_r_ninja',
  'imp_r_gunner',
  'imp_r_star',
  'imp_m_snow',
  'imp_m_fire',
  'imp_m_storm',
  'imp_m_frost',
  'imp_m_cosmo',
  'imp_t_bell',
  'imp_t_chef',
  'imp_t_bard',
  'imp_t_alch',
  'imp_t_lucky',
  // what an enemy is made of: one hit reaction per material, a death for the materials that die, and a long death per boss
  'foe_juicy_hit',
  'foe_fluff_hit',
  'foe_water_hit',
  'foe_rubber_hit',
  'foe_plastic_hit',
  'foe_tin_hit',
  'foe_motor_hit',
  'foe_paper_hit',
  'foe_glass_hit',
  'foe_cloud_hit',
  'foe_juicy_die',
  'foe_fluff_die',
  'foe_water_die',
  'foe_rubber_die',
  'foe_plastic_die',
  'foe_tin_die',
  'foe_motor_die',
  'foe_paper_die',
  'foe_boss_cucumber',
  'foe_boss_vacuum',
  'foe_boss_blender',
  'foe_boss_bath',
  'foe_boss_cloud',
  'foe_boss_needle',
  // the cats' skills (sfx-skills.ts): every skill has sounds of its own, a signature for the moment of the cast and small ones for what goes on while it runs
  'sp_cutin',
  'sp_shield_slam',
  'sp_dust_wedge',
  'sp_dash',
  'sp_sheath',
  'sp_cut_clash',
  'sp_tiger_roar',
  'sp_tiger_land',
  'sp_stomp',
  'sp_tiger_roar_end',
  'sp_smoke_pop',
  'sp_clone_hop',
  'sp_clone_throw',
  'sp_clone_vanish',
  'sp_poster_slap',
  'sp_cork_pop',
  'sp_poster_hole',
  'sp_seal_stamp',
  'sp_night_hush',
  'sp_arrow_whoosh',
  'sp_star_ping',
  'sp_cloud_pop',
  'sp_thunder_tick',
  'sp_cloud_hop',
  'sp_cloud_sigh',
  'sp_glass_tap',
  'sp_glass_shatter',
  'sp_shard_hit',
  'sp_meteor_warn',
  'sp_meteor_whistle',
  'sp_meteor_boom',
  'sp_meteor_ring',
  'sp_strum',
  'sp_note',
  'sp_flask_toss',
  'sp_flask_pop',
  'sp_fish_boing',
  'sp_flask_mini',
  'sp_fish_back',
  'sp_capsule_fall',
  'sp_capsule_bounce',
  'sp_capsule_rattle',
  'sp_capsule_pop',
  'sp_prize_fish',
  'sp_prize_partner',
  'sp_prize_more',
  'sp_prize_toy',
  'sp_prize_guardian',
  ...LEGACY_SFX_IDS,
] as const;

export type SfxId = (typeof SFX_IDS)[number];

/** The ids of the old versions (`LEGACY_SFX_IDS`). */
export type LegacySfxId = (typeof LEGACY_SFX_IDS)[number];

const LEGACY = new Set<string>(LEGACY_SFX_IDS);

/** Whether an id is an old version kept for the sound board (the game never plays it). */
export function isLegacySfx(id: string): boolean {
  return LEGACY.has(id);
}

/** The ids the game can play: every id but the old versions. */
export const GAME_SFX_IDS: readonly SfxId[] = SFX_IDS.filter((id) => !LEGACY.has(id));

/**
 * Background tracks. `battle` is the living room (chapter 1); `kitchen`, `bath`, `garden` and `clinic` are chapters 2 to 5 (`battleMusic` picks one).
 * `home` and `home2` are the menu pair (asking for `home` rotates through both), `elite` the tension variation of an elite wave, `boss` the boss fight
 * (it opens with a one-bar sting), `gold` the gold dungeon, `win` and `lose` loop under the result screen.
 */
export type MusicId = 'none' | 'home' | 'home2' | 'battle' | 'kitchen' | 'bath' | 'garden' | 'clinic' | 'elite' | 'boss' | 'gold' | 'win' | 'lose';

export type StingerId = 'victory' | 'defeat' | 'boss_intro' | 'mythic' | 'level_up' | 'jackpot';

/** What `primeStep` can get ready ahead of its first use: a sound effect or a stinger (the two have ids in common, so they are told apart by key). */
export type PrimeTarget = { readonly sfx: SfxId } | { readonly stinger: StingerId };

export interface PlayOpts {
  /** Linear gain multiplier, default 1. */
  volume?: number;
  /** Playback-rate / frequency multiplier, default 1. */
  pitch?: number;
  /** Stereo position -1 (left) .. 1 (right), default 0. */
  pan?: number;
  /** Seconds to wait before the sound starts. */
  delay?: number;
}

export interface AudioApi {
  /** Call once at boot. Safe before any user gesture; the context is unlocked on the first input. */
  init(): void;
  /** True once the AudioContext is running. */
  readonly unlocked: boolean;
  /** 0..1 user volume for each bus. */
  setSfxVolume(v: number): void;
  setMusicVolume(v: number): void;
  /** Hard mute everything (ad playing, tab hidden). Independent of the user volumes; calls nest. */
  setMuted(muted: boolean): void;
  /** Fire a one-shot effect. Silently ignored while locked, muted, or rate-limited. */
  play(id: SfxId, opts?: PlayOpts): void;
  /**
   * Same as play() but pitched up by `step` scale degrees (0 = base). Used for combos / streaks so
   * consecutive pickups climb a scale; implementations cap the rise at about two octaves.
   */
  playStep(id: SfxId, step: number, opts?: PlayOpts): void;
  /** Cross-fade the looping background music. 'none' fades to silence. */
  music(id: MusicId, fadeSeconds?: number): void;
  /** 0..1 — how intense the battle track should be (adds layers / drive as it rises). */
  setIntensity(v: number): void;
  /** Short musical phrase over a ducked music bed. */
  stinger(id: StingerId): void;
  /** Temporarily lower the music by `depth` (0..1) for `seconds`, then recover. */
  duck(depth: number, seconds: number): void;
  /**
   * Get a sound ready before it is first heard: bakes its next missing variant (2 to 14 ms of work in the caller's frame, nothing audible, one
   * render in flight per call) and returns how many variants are still to do. A frame-budgeted queue calls it once per piece.
   */
  primeStep(target: PrimeTarget): number;
  /** Variants of `target` that are neither baked nor on their way (0: ready, or nothing to bake on this device). */
  primeLeft(target: PrimeTarget): number;
}
