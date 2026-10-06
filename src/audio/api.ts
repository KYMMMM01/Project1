/**
 * Public audio contract. Everything in the game talks to `audio` (src/audio/index.ts) through this
 * interface only, so the synthesis engine behind it can change freely.
 */
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
] as const;

export type SfxId = (typeof SFX_IDS)[number];

export type MusicId = 'none' | 'home' | 'battle' | 'boss';

export type StingerId = 'victory' | 'defeat' | 'boss_intro' | 'mythic' | 'level_up' | 'jackpot';

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
}
