/**
 * Which sounds a battle needs ready, as plain data: what every fight plays, what a cat plays the moment it fires, what a wave's enemies and
 * bosses play. Pure over the game's tables (the audio module's own cat and enemy lookups, the enemy specs), so the rules are tested without
 * a sound engine. `BattleWarmup` turns these lists into pieces of the warm-up queue.
 */
import { attackSfx, foeDieSfx, foeHitSfx, impactSfx, type SfxId, type StingerId } from '@/audio';
import { enemySpec, isWaveTarget, type EnemyId, type UnitId, type WavePreviewEntry } from '@/game';

/** Heard in the first minute of any battle, in the order they are first needed: menus, the summon ladder, a merge, plain hits, a new wave. */
export const START_SOUNDS: readonly SfxId[] = [
  'ui_click', 'summon_common', 'pickup', 'place', 'merge', 'hit_light', 'wave_start', 'ui_popup_open', 'ui_popup_close', 'ui_back', 'ui_tab',
  'ui_error', 'summon_rare', 'summon_epic', 'hit_heavy', 'crit', 'coin', 'merge_big', 'summon_legendary', 'relic_pick', 'wave_clear', 'whoosh',
];

/**
 * Heard now and then, so ready some time before they matter: sells and upgrades, the results' chest and cards, the awakening, the status and
 * hazard cues. They are baked in the calm after everything the next waves need.
 */
export const LATER_SOUNDS: readonly SfxId[] = [
  'sell', 'upgrade', 'level_up', 'star', 'gem', 'coin_many', 'card_flip', 'reward_claim', 'chest_open', 'chest_shake', 'molt', 'awaken', 'purr',
  'call_wave', 'sunbeam', 'danger_alarm', 'countdown_tick', 'laser_on', 'laser_off', 'freeze', 'stun', 'zap', 'heal', 'shield_break', 'weaken',
  'hazard_warn', 'splash', 'buff', 'explosion', 'summon_mythic',
];

/** The stingers a run can play: the two ends of it, and the awakening's halo. The director never plays `boss_intro` (the warning and the boss track do that job). */
export const LATER_STINGERS: readonly StingerId[] = ['victory', 'defeat', 'mythic'];

/** What a cat's attack sounds like leaving it and landing (the crit layer is one shared sound, in the start list). */
export function unitSounds(id: UnitId): SfxId[] {
  return [attackSfx(id).id, impactSfx(id).id];
}

/**
 * What a cat's skill plays, by the cat (the sounds of `sfx-skills.ts`, the ones of its scene in the order the scene needs them), so that the first cast does not
 * wait for a bake on a slow phone. A rank 5 cat's first cast also plays the cut-in. Only a battle with skills on asks for them (`BattleWarmup`).
 */
export const SKILL_SOUNDS: Partial<Record<UnitId, readonly SfxId[]>> = {
  w_viking: ['sp_shield_slam', 'sp_dust_wedge'],
  w_samurai: ['sp_dash', 'sp_sheath', 'sp_cut_clash'],
  w_tiger: ['sp_cutin', 'sp_tiger_roar', 'sp_tiger_land', 'sp_stomp', 'sp_tiger_roar_end'],
  r_ninja: ['sp_smoke_pop', 'sp_clone_hop', 'sp_clone_throw', 'sp_clone_vanish'],
  r_gunner: ['sp_poster_slap', 'sp_cork_pop', 'sp_poster_hole', 'sp_seal_stamp'],
  r_star: ['sp_cutin', 'sp_night_hush', 'sp_arrow_whoosh', 'sp_star_ping'],
  m_storm: ['sp_cloud_pop', 'sp_thunder_tick', 'sp_cloud_hop', 'sp_cloud_sigh'],
  m_frost: ['sp_glass_tap', 'sp_glass_shatter', 'sp_shard_hit'],
  m_cosmo: ['sp_cutin', 'sp_meteor_warn', 'sp_meteor_whistle', 'sp_meteor_boom', 'sp_meteor_ring'],
  t_bard: ['sp_strum', 'sp_note'],
  t_alch: ['sp_flask_toss', 'sp_flask_pop', 'sp_fish_boing', 'sp_flask_mini', 'sp_fish_back'],
  t_lucky: ['sp_cutin', 'sp_capsule_fall', 'sp_capsule_bounce', 'sp_capsule_rattle', 'sp_capsule_pop', 'sp_prize_fish', 'sp_prize_partner', 'sp_prize_more', 'sp_prize_toy', 'sp_prize_guardian'],
};

/** The sounds of a cat's skill (none for a cat without one). */
export function skillSounds(id: UnitId): readonly SfxId[] {
  return SKILL_SOUNDS[id] ?? [];
}

/** What an enemy answers a hit with and how it dies, plus the cues its own rule plays (a healer's heal, a shield's break, a dryer's weakening). */
export function enemySounds(id: EnemyId): SfxId[] {
  const spec = enemySpec(id);
  const out: SfxId[] = [foeHitSfx(id).id, foeDieSfx(id).id];
  if (spec.aura?.kind === 'heal') out.push('heal');
  if (spec.shield) out.push('shield_break');
  if (spec.weakenPulse) out.push('weaken');
  if (spec.hazardPulse) out.push('hazard_warn', 'splash');
  switch (spec.ability) {
    case 'inhale':
    case 'whirl':
      out.push('whoosh');
      break;
    case 'splash':
      out.push('splash', 'hazard_warn');
      break;
    case 'lightning':
      out.push('zap', 'hazard_warn');
      break;
    case 'vaccinate':
      out.push('buff');
      break;
    case 'spill':
      out.push('coin_many');
      break;
    default:
      break;
  }
  return out;
}

/**
 * Everything one wave plays that a plain fight does not: its enemies' answers and cues, and for an elite or a boss the warning, the cry and the
 * heavy blows, and for a boss the collapse (the blasts, the banner).
 */
export function waveSounds(entries: readonly WavePreviewEntry[]): SfxId[] {
  const sfx: SfxId[] = [];
  const add = (id: SfxId): void => {
    if (!sfx.includes(id)) sfx.push(id);
  };
  for (const e of entries) {
    if (isWaveTarget(e.enemy)) {
      add('boss_warning');
      add('boss_roar');
      add('hit_heavy');
      if (enemySpec(e.enemy).traits.includes('boss')) {
        add('boss_die');
        add('explosion');
        add('wave_clear');
      }
    }
    for (const id of enemySounds(e.enemy)) add(id);
  }
  return sfx;
}
