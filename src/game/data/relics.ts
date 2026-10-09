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
  scratcher: { id: 'scratcher', fx: { defenceCut: 0.2 }, args: { a: 20 } },
  feather_wand: { id: 'feather_wand', fx: { crit: 0.06 }, args: { a: 6 } },
  cat_tower: { id: 'cat_tower', fx: { topRowRange: 0.25, topRowDamage: 0.1 }, args: { a: 25, b: 10 } },
  kneading_cushion: { id: 'kneading_cushion', fx: { sameClassNeighbourDamage: 0.12 }, args: { a: 12 } },
  cat_tunnel: { id: 'cat_tunnel', fx: { tunnel: 1 }, args: {} },
  heating_pad: { id: 'heating_pad', fx: { slowBoost: 0.3, slowedDamage: 0.15 }, args: { a: 30, b: 15 } },
  batteries: { id: 'batteries', fx: { laserDuration: 2, laserCooldownCut: 3 }, args: { a: 2, b: 3 } },
  snack_stick: { id: 'snack_stick', fx: { jumpChance: 0.12 }, args: { a: 12 } },
  tuna_cans: { id: 'tuna_cans', fx: { waveFish: 12 }, args: { a: 12 } },
  window_perch: { id: 'window_perch', fx: { edgeSpeed: 0.15 }, args: { a: 15 } },
  purr_pillow: { id: 'purr_pillow', fx: { actPurr: 1 }, args: { a: 1 } },
  silvervine: { id: 'silvervine', fx: { critMult: 0.5 }, args: { a: 50 } },
  auto_feeder: { id: 'auto_feeder', fx: { feederEvery: 10, feederFish: 6 }, args: { a: 10, b: 6 } },
  glass_marble: { id: 'glass_marble', fx: { areaScale: 0.25 }, args: { a: 25 } },
  nap_blanket: { id: 'nap_blanket', fx: { enemySlow: 0.1 }, args: { a: 10 } },
  twin_bells: { id: 'twin_bells', fx: { twinChance: 0.1 }, args: { a: 10 } },
  lucky_coin: { id: 'lucky_coin', fx: { bossPurr: 1 }, args: { a: 1 } },
  sardine_crate: { id: 'sardine_crate', fx: { instantFish: 150, costCapCut: 15 }, args: { a: 150, b: 15 } },
  sunny_spot: { id: 'sunny_spot', fx: { sunCells: 2, sunSpeed: 0.1 }, args: { a: 2, b: 10 } },
  nine_lives: { id: 'nine_lives', fx: { rescue: 1 }, args: {} },
  shooting_star: { id: 'shooting_star', fx: { starEvery: 15, starTargets: 5, starHp: 0.6 }, args: { a: 15, b: 5 } },
  golden_catnip: { id: 'golden_catnip', fx: { synergyScale: 0.25 }, args: { a: 25 } },
  royal_crown: { id: 'royal_crown', fx: { royalDamage: 0.3 }, args: { a: 30 } },
  hourglass: { id: 'hourglass', fx: { bossTime: 15, spawnSlow: 0.1 }, args: { a: 15 } },
};

/** Relics that answer the trait an act introduces; the offer after the previous act favours them. */
export const COUNTER_RELICS: Readonly<Record<string, readonly RelicId[]>> = {
  armored: ['scratcher', 'glitter_ball'],
  warded: ['mouse_toy', 'yarn_ball'],
  swarm: ['glass_marble'],
  split: ['glass_marble'],
  fast: ['nap_blanket', 'heating_pad'],
  haste_aura: ['nap_blanket'],
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
