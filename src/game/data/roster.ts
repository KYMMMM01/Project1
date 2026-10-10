/**
 * Identity tables: which unit is which class and rarity, relic rarities, and the chapter list.
 * No balance numbers live here — this file is the stable index that the simulation, the meta game
 * and the UI all share. Stats belong in units.ts / enemies.ts / relics.ts.
 */
import type { ClassId, EnemyId, RarityId, RelicId, SpecialCellId, UnitId } from '../api';

export const RARITIES: readonly RarityId[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** unitByClassRarity[class][rarityIndex] */
export const UNIT_GRID: Record<ClassId, readonly [UnitId, UnitId, UnitId, UnitId, UnitId]> = {
  warrior: ['w_paw', 'w_sword', 'w_viking', 'w_samurai', 'w_tiger'],
  ranger: ['r_sling', 'r_archer', 'r_ninja', 'r_gunner', 'r_star'],
  mage: ['m_snow', 'm_fire', 'm_storm', 'm_frost', 'm_cosmo'],
  trickster: ['t_chef', 't_bell', 't_bard', 't_alch', 't_lucky'],
};

const CLASS_PREFIX: Record<string, ClassId> = { w: 'warrior', r: 'ranger', m: 'mage', t: 'trickster' };

export function unitClass(id: UnitId): ClassId {
  return CLASS_PREFIX[id.charAt(0)] as ClassId;
}

export function unitRarityIndex(id: UnitId): number {
  return UNIT_GRID[unitClass(id)].indexOf(id);
}

export function unitRarity(id: UnitId): RarityId {
  return RARITIES[unitRarityIndex(id)] as RarityId;
}

export function unitOf(classId: ClassId, rarity: RarityId): UnitId {
  return UNIT_GRID[classId][RARITIES.indexOf(rarity)] as UnitId;
}

/**
 * What two copies of `id` merge into: the next rarity of the same class (a class is one fixed five-step
 * line). Null for legendaries and mythics, which never merge; a legendary awakens instead (`mythicOf`).
 */
export function mergeResultOf(id: UnitId): UnitId | null {
  const rarity = unitRarityIndex(id);
  return rarity <= 2 ? (UNIT_GRID[unitClass(id)][rarity + 1] as UnitId) : null;
}

/** The mythic a legendary awakens into (same class), or null for non-legendaries. */
export function mythicOf(id: UnitId): UnitId | null {
  return unitRarityIndex(id) === 3 ? UNIT_GRID[unitClass(id)][4] : null;
}

/** Collection level is tracked for the 16 base units; a mythic uses its class legendary's level. */
export function levelSourceOf(id: UnitId): UnitId {
  return unitRarityIndex(id) === 4 ? UNIT_GRID[unitClass(id)][3] : id;
}

export const BASE_UNIT_IDS: readonly UnitId[] = (Object.keys(UNIT_GRID) as ClassId[]).flatMap((c) =>
  UNIT_GRID[c].slice(0, 4),
);

export const MYTHIC_UNIT_IDS: readonly UnitId[] = (Object.keys(UNIT_GRID) as ClassId[]).map(
  (c) => UNIT_GRID[c][4],
);

export const RELIC_RARITY: Record<RelicId, Exclude<RarityId, 'mythic'>> = {
  yarn_ball: 'common',
  glitter_ball: 'common',
  cardboard_box: 'common',
  bell_collar: 'common',
  fishing_rod: 'common',
  scratcher: 'common',
  mouse_toy: 'common',
  feather_wand: 'common',
  batteries: 'common',
  cat_tower: 'rare',
  kneading_cushion: 'rare',
  snack_stick: 'rare',
  tuna_cans: 'rare',
  window_perch: 'rare',
  glass_marble: 'rare',
  nap_blanket: 'rare',
  cat_tunnel: 'epic',
  heating_pad: 'epic',
  twin_bells: 'epic',
  silvervine: 'epic',
  auto_feeder: 'epic',
  sardine_crate: 'epic',
  purr_pillow: 'epic',
  lucky_coin: 'epic',
  sunny_spot: 'legendary',
  nine_lives: 'legendary',
  shooting_star: 'legendary',
  golden_catnip: 'legendary',
  royal_crown: 'legendary',
  hourglass: 'legendary',
};

export interface ChapterInfo {
  /** 1-based. */
  id: number;
  key: 'livingroom' | 'kitchen' | 'bathroom' | 'garden' | 'vet';
  /** i18n key of the chapter name. */
  nameKey: string;
  /** Image keys (see core/assets): full-screen background and the board mat. */
  background: string;
  rug: string;
  /** Boss of waves 10/20/30. */
  boss: EnemyId;
  /** The kind of special board cell the chapter plays with (every mode that plays this chapter: daily, endless and the gold dungeon too). */
  cell: SpecialCellId;
}

export const CHAPTERS: readonly ChapterInfo[] = [
  { id: 1, key: 'livingroom', nameKey: 'chapter.1.name', background: 'bg_livingroom', rug: 'ui_rug_livingroom', boss: 'boss_vacuum', cell: 'sun' },
  { id: 2, key: 'kitchen', nameKey: 'chapter.2.name', background: 'bg_kitchen', rug: 'ui_rug_kitchen', boss: 'boss_blender', cell: 'bowl' },
  { id: 3, key: 'bathroom', nameKey: 'chapter.3.name', background: 'bg_bathroom', rug: 'ui_rug_bathroom', boss: 'boss_bath', cell: 'bubble' },
  { id: 4, key: 'garden', nameKey: 'chapter.4.name', background: 'bg_garden', rug: 'ui_rug_garden', boss: 'boss_cloud', cell: 'stump' },
  { id: 5, key: 'vet', nameKey: 'chapter.5.name', background: 'bg_vet', rug: 'ui_rug_vet', boss: 'boss_needle', cell: 'treat' },
];

/** Highest difficulty stake per chapter (0 = base rules, each step adds one rule; see the battle spec). */
export const MAX_STAKE = 5;
