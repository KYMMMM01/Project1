/**
 * The 30 toys (rules §13). Effects are data (`fx`, summed over the held relics); the few relics with
 * their own behaviour (tunnel, nine lives, shooting star, feeder, sardine crate...) are switched on by
 * their fx field and handled in sim/flow.ts and sim/combat.ts.
 */
import { RELIC_IDS, type RelicDef, type RelicId } from '../api';
import { t } from '@/core/i18n';
import { RELIC_RARITY } from './roster';
import type { RelicFx, RelicSpec } from './types';
import './strings';

const SPECS: Record<RelicId, RelicSpec> = {
  yarn_ball: { id: 'yarn_ball', fx: { speedWarriorRanger: 0.12 }, args: { a: 12 } },
  glitter_ball: { id: 'glitter_ball', fx: { damageMagic: 0.15 }, args: { a: 15 } },
  mouse_toy: { id: 'mouse_toy', fx: { damagePhysical: 0.15 }, args: { a: 15 } },
  cardboard_box: { id: 'cardboard_box', fx: { costCut: 0.1 }, args: { a: 10 } },
  bell_collar: { id: 'bell_collar', fx: { killFish: 0.2 }, args: { a: 20 } },
  fishing_rod: { id: 'fishing_rod', fx: { rangeAll: 0.12 }, args: { a: 12 } },
  scratcher: { id: 'scratcher', fx: { defenceCut: 0.4 }, args: { a: 40 } },
  feather_wand: { id: 'feather_wand', fx: { crit: 0.1 }, args: { a: 10 } },
  cat_tower: { id: 'cat_tower', fx: { topRowRange: 0.45, topRowDamage: 0.22 }, args: { a: 45, b: 22 } },
  kneading_cushion: { id: 'kneading_cushion', fx: { sameClassNeighbourDamage: 0.22 }, args: { a: 22 } },
  cat_tunnel: { id: 'cat_tunnel', fx: { tunnel: 3 }, args: { a: 3 } },
  heating_pad: { id: 'heating_pad', fx: { slowBoost: 0.3, slowedDamage: 0.15 }, args: { a: 30, b: 15 } },
  batteries: { id: 'batteries', fx: { laserDuration: 2, laserCooldownCut: 3 }, args: { a: 2, b: 3 } },
  snack_stick: { id: 'snack_stick', fx: { jumpChance: 0.18 }, args: { a: 18 } },
  tuna_cans: { id: 'tuna_cans', fx: { waveFish: 16 }, args: { a: 16 } },
  window_perch: { id: 'window_perch', fx: { edgeSpeed: 0.18 }, args: { a: 18 } },
  purr_pillow: { id: 'purr_pillow', fx: { actPurr: 2 }, args: { a: 2 } },
  silvervine: { id: 'silvervine', fx: { critMult: 1.0 }, args: { a: 100 } },
  auto_feeder: { id: 'auto_feeder', fx: { feederEvery: 10, feederFish: 10 }, args: { a: 10, b: 10 } },
  glass_marble: { id: 'glass_marble', fx: { areaScale: 0.3 }, args: { a: 30 } },
  nap_blanket: { id: 'nap_blanket', fx: { enemySlow: 0.1, enemyDamageTaken: 0.08 }, args: { a: 10, b: 8 } },
  twin_bells: { id: 'twin_bells', fx: { twinChance: 0.3 }, args: { a: 30 } },
  lucky_coin: { id: 'lucky_coin', fx: { bossPurr: 2 }, args: { a: 2 } },
  sardine_crate: { id: 'sardine_crate', fx: { instantFish: 100, costCapCut: 15 }, args: { a: 100, b: 15 } },
  sunny_spot: { id: 'sunny_spot', fx: { sunCells: 3, sunSpeed: 0.1 }, args: { a: 3, b: 10 } },
  nine_lives: { id: 'nine_lives', fx: { rescue: 1 }, args: {} },
  shooting_star: { id: 'shooting_star', fx: { starEvery: 12, starTargets: 5, starHp: 0.7 }, args: { a: 12, b: 5 } },
  golden_catnip: { id: 'golden_catnip', fx: { synergyScale: 0.5 }, args: { a: 50 } },
  royal_crown: { id: 'royal_crown', fx: { royalDamage: 0.5 }, args: { a: 50 } },
  hourglass: { id: 'hourglass', fx: { bossTime: 15, spawnSlow: 0.1 }, args: { a: 15 } },
};

/** Relics that answer the trait an act introduces; the offer after the previous act favours them. */
export const COUNTER_RELICS: Readonly<Record<string, readonly RelicId[]>> = {
  armored: ['scratcher', 'glitter_ball'],
  warded: ['mouse_toy', 'yarn_ball'],
  swarm: ['glass_marble'],
  split: ['glass_marble'],
  fast: ['heating_pad', 'fishing_rod'],
  haste_aura: ['fishing_rod', 'heating_pad'],
  heal_aura: ['feather_wand', 'silvervine'],
  shield: ['yarn_ball', 'silvervine'],
  weaken: ['kneading_cushion', 'cat_tunnel'],
  hazard: ['window_perch', 'cat_tunnel'],
};

export function relicSpec(id: RelicId): RelicSpec {
  return SPECS[id];
}

function build(id: RelicId): RelicDef {
  const spec = SPECS[id];
  return {
    id,
    rarity: RELIC_RARITY[id],
    nameKey: `relic.${id}.name`,
    descText: () => t(`relic.${id}.desc`, { a: spec.args.a ?? 0, b: spec.args.b ?? 0 }),
  };
}

const DEFS = {} as Record<RelicId, RelicDef>;
for (const id of RELIC_IDS) DEFS[id] = build(id);

export function relicDef(id: RelicId): RelicDef {
  return DEFS[id];
}

export function allRelicDefs(): RelicDef[] {
  return RELIC_IDS.map((id) => DEFS[id]);
}

export const RELIC_FX_KEYS: readonly (keyof RelicFx)[] = Array.from(
  new Set(RELIC_IDS.flatMap((id) => Object.keys(SPECS[id].fx) as (keyof RelicFx)[])),
);
