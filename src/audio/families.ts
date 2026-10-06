/**
 * Sound families: what every member of a group has to measure like once it is baked. The quality report
 * (report.ts) checks the table against the real offline renders, and tests/audio-recipes.test.ts proves
 * that every id belongs to exactly one family and that the declared duration windows fit the family.
 * The numbers say what the material is: a paper tap is short and has no pitch, a knock is dull and low,
 * a tine is pitched, a fanfare is long. `maxLow` is the energy share under 200 Hz (what a phone speaker
 * cannot play) and `maxHigh` the share above 4 kHz (what tires the ear); nothing in the game may be shrill.
 */
import type { SfxId, StingerId } from './api';

export type SoundKey = SfxId | `stinger:${StingerId}`;

export interface Family {
  name: string;
  members: readonly SoundKey[];
  /** Longest audible duration in ms. */
  maxMs: number;
  /** Longest rise of the first note or grain from 10 % to 90 % of its peak, in ms. */
  maxAttackMs: number;
  /** Spectral centroid window in Hz. */
  centroid: readonly [number, number];
  maxLow: number;
  maxHigh: number;
}

export const FAMILIES: readonly Family[] = [
  { name: 'paper tap', members: ['ui_click', 'ui_back', 'pickup'], maxMs: 90, maxAttackMs: 4, centroid: [300, 1800], maxLow: 0.3, maxHigh: 0.08 },
  { name: 'paper slide', members: ['ui_tab', 'ui_popup_open', 'ui_popup_close', 'place', 'card_flip'], maxMs: 125, maxAttackMs: 40, centroid: [300, 1800], maxLow: 0.3, maxHigh: 0.1 },
  {
    name: 'wood knock',
    members: ['ui_toggle', 'ui_error', 'reel_tick', 'reel_stop', 'countdown_tick', 'danger_alarm', 'hazard_warn'],
    maxMs: 330,
    maxAttackMs: 4,
    centroid: [150, 1600],
    maxLow: 0.6,
    maxHigh: 0.05,
  },
  { name: 'sticker and tine', members: ['ui_confirm', 'coin', 'gem', 'star', 'sell'], maxMs: 420, maxAttackMs: 8, centroid: [400, 1800], maxLow: 0.05, maxHigh: 0.05 },
  {
    name: 'stamp and claim',
    members: ['reward_claim', 'level_up', 'purchase', 'upgrade', 'merge', 'merge_big', 'coin_many', 'relic_pick', 'wave_clear'],
    maxMs: 900,
    maxAttackMs: 6,
    centroid: [500, 1800],
    maxLow: 0.35,
    maxHigh: 0.05,
  },
  {
    name: 'summon ladder',
    members: ['summon_common', 'summon_rare', 'summon_epic', 'summon_legendary', 'summon_mythic'],
    maxMs: 1300,
    maxAttackMs: 4,
    centroid: [500, 1500],
    maxLow: 0.3,
    maxHigh: 0.05,
  },
  {
    name: 'shot',
    members: ['shoot_arrow', 'shoot_magic', 'shoot_cannon', 'shoot_ice', 'shoot_lightning', 'shoot_poison', 'shoot_claw'],
    maxMs: 200,
    maxAttackMs: 20,
    centroid: [200, 2000],
    maxLow: 0.3,
    maxHigh: 0.08,
  },
  { name: 'hit', members: ['hit_light', 'hit_heavy', 'crit', 'enemy_die', 'zap', 'laser_off'], maxMs: 340, maxAttackMs: 4, centroid: [180, 1500], maxLow: 0.3, maxHigh: 0.05 },
  {
    name: 'status and verb',
    members: ['freeze', 'stun', 'buff', 'heal', 'weaken', 'molt', 'shield_break', 'laser_on', 'splash', 'sunbeam', 'wave_start', 'call_wave', 'whoosh', 'chest_shake', 'gamble_fail'],
    maxMs: 700,
    maxAttackMs: 50,
    centroid: [250, 1800],
    maxLow: 0.3,
    maxHigh: 0.08,
  },
  { name: 'low drum', members: ['boss_warning', 'boss_roar', 'boss_die', 'explosion', 'purr'], maxMs: 1450, maxAttackMs: 50, centroid: [100, 900], maxLow: 0.9, maxHigh: 0.05 },
  {
    name: 'fanfare',
    members: [
      'awaken',
      'chest_open',
      'jackpot',
      'stinger:victory',
      'stinger:defeat',
      'stinger:boss_intro',
      'stinger:mythic',
      'stinger:level_up',
      'stinger:jackpot',
    ],
    maxMs: 1800,
    maxAttackMs: 100,
    centroid: [150, 1700],
    maxLow: 0.7,
    maxHigh: 0.05,
  },
];

/** The family a sound belongs to. */
export function familyOf(key: SoundKey): Family | undefined {
  return FAMILIES.find((f) => f.members.includes(key));
}
