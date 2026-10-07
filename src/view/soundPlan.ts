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
