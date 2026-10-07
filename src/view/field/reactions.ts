/**
 * How an enemy takes a blow, by what it is made of. The material is the audio module's own (`foeHitSfx`: the sound of a hit is
 * chosen by it), so a cucumber that squelches also squashes and a clock that rings also rattles. Soft things squash and wobble;
 * hard ones are knocked back rigidly and rattle; thin ones flutter. Pure data.
 */
import { foeHitSfx } from '@/audio/combat';
import { ENEMY_IDS, type EnemyId } from '@/game/api';

export type Material = 'juicy' | 'fluff' | 'water' | 'rubber' | 'plastic' | 'tin' | 'motor' | 'paper' | 'glass' | 'cloud';

export interface Reaction {
  /** How far a blow pushes the body back along its path, px. */
  knock: number;
  /** The squash a blow gives (width and height factors) and the time it takes to spring back, ms. */
  sx: number;
  sy: number;
  ms: number;
  /** A damped wobble of the turn, degrees (soft and papery things). */
  wobble: number;
  /** A fast rattle, px (hard things): the body shivers instead of squashing. */
  rattle: number;
}

const REACTIONS: Readonly<Record<Material, Reaction>> = {
  juicy: { knock: 2, sx: 1.18, sy: 0.78, ms: 230, wobble: 7, rattle: 0 },
  fluff: { knock: 4, sx: 1.2, sy: 1.12, ms: 170, wobble: 3, rattle: 0 },
  water: { knock: 1, sx: 1.24, sy: 0.72, ms: 260, wobble: 5, rattle: 0 },
  rubber: { knock: 3, sx: 1.2, sy: 0.76, ms: 280, wobble: 9, rattle: 0 },
  cloud: { knock: 1, sx: 1.12, sy: 1.12, ms: 240, wobble: 2, rattle: 0 },
  plastic: { knock: 5, sx: 1.04, sy: 0.97, ms: 150, wobble: 0, rattle: 2.2 },
  tin: { knock: 4, sx: 1.03, sy: 0.98, ms: 170, wobble: 3, rattle: 2.6 },
  motor: { knock: 6, sx: 1.02, sy: 0.98, ms: 130, wobble: 0, rattle: 1.4 },
  glass: { knock: 3, sx: 1.02, sy: 0.99, ms: 140, wobble: 2, rattle: 1.8 },
  paper: { knock: 3, sx: 1.08, sy: 0.92, ms: 210, wobble: 13, rattle: 0 },
};

const SOFT: ReadonlySet<Material> = new Set<Material>(['juicy', 'fluff', 'water', 'rubber', 'cloud']);

const MATERIAL_OF = {} as Record<EnemyId, Material>;
for (const id of ENEMY_IDS) MATERIAL_OF[id] = /^foe_([a-z]+)_hit$/.exec(foeHitSfx(id).id)?.[1] as Material;

export function materialOf(id: EnemyId): Material {
  return MATERIAL_OF[id];
}

export function isSoft(m: Material): boolean {
  return SOFT.has(m);
}

export function reactionOf(m: Material): Reaction {
  return REACTIONS[m];
}
