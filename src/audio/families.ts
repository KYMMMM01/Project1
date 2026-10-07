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
  /** Least A-weighted share of the first ~21 ms between 2 and 6 kHz (the crisp bite of a contact); impacts only. */
  minSnap?: number;
  /** Least share of the whole energy between 80 and 200 Hz (the low body under a heavy blow). */
  minBody?: number;
}

/** The 20 cats in roster order: the release and the impact of each is a member of its own family below. */
const CATS = [
  'w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger',
  'r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star',
  'm_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo',
  't_bell', 't_chef', 't_bard', 't_alch', 't_lucky',
] as const;
export const RELEASES = CATS.map((c): SfxId => `atk_${c}`);
export const IMPACTS = CATS.map((c): SfxId => `imp_${c}`);
/** What an enemy is made of: a hit reaction for each, a death for the eight that die on the field, one long death for each boss. */
const MATERIALS = ['juicy', 'fluff', 'water', 'rubber', 'plastic', 'tin', 'motor', 'paper', 'glass', 'cloud'] as const;
const DYING = ['juicy', 'fluff', 'water', 'rubber', 'plastic', 'tin', 'motor', 'paper'] as const;
const BOSSES = ['cucumber', 'vacuum', 'blender', 'bath', 'cloud', 'needle'] as const;
export const FOE_HITS = MATERIALS.map((m): SfxId => `foe_${m}_hit`);
export const FOE_DEATHS = DYING.map((m): SfxId => `foe_${m}_die`);
export const BOSS_DEATHS = BOSSES.map((m): SfxId => `foe_boss_${m}`);

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
  { name: 'hit', members: ['hit_light', 'enemy_die', 'zap', 'laser_off'], maxMs: 340, maxAttackMs: 4, centroid: [180, 1500], maxLow: 0.3, maxHigh: 0.05 },
  // Combat is allowed some bite: up to 6 kHz in the first moments of a contact, and weight under the heavy ones.
  { name: 'weight and crack', members: ['hit_heavy', 'crit'], maxMs: 260, maxAttackMs: 4, centroid: [150, 3200], maxLow: 0.9, maxHigh: 0.2, minSnap: 0.05, minBody: 0.15 },
  { name: 'weapon release', members: RELEASES, maxMs: 340, maxAttackMs: 60, centroid: [150, 3600], maxLow: 0.65, maxHigh: 0.3 },
  { name: 'weapon impact', members: IMPACTS, maxMs: 560, maxAttackMs: 8, centroid: [150, 3600], maxLow: 0.9, maxHigh: 0.3, minSnap: 0.05 },
  { name: 'enemy hit', members: FOE_HITS, maxMs: 200, maxAttackMs: 12, centroid: [120, 3200], maxLow: 0.75, maxHigh: 0.25 },
  { name: 'enemy death', members: FOE_DEATHS, maxMs: 640, maxAttackMs: 20, centroid: [200, 3200], maxLow: 0.6, maxHigh: 0.25 },
  { name: 'boss death', members: BOSS_DEATHS, maxMs: 1300, maxAttackMs: 60, centroid: [100, 2600], maxLow: 0.9, maxHigh: 0.2 },
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
