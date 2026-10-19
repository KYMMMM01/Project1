/**
 * The sound catalogue: every SFX id and stinger as a numbered SoundDef with its recipe and voice
 * rule. Numeric indices (not strings) key the bank and the limiter so playing a sound allocates nothing.
 */
import { SFX_IDS, type LegacySfxId, type SfxId, type StingerId } from './api';
import type { Cat, Recipe } from './recipe';
import { BEFORE_RECIPES } from './sfx-before';
import { BATTLE_RECIPES } from './sfx-battle';
import { CAT_RECIPES } from './sfx-cats';
import { COMBAT_RECIPES } from './sfx-combat';
import { IMPACT_RECIPES } from './sfx-impacts';
import { FOE_RECIPES } from './sfx-foes';
import { SKILL_RECIPES } from './sfx-skills';
import { UI_RECIPES } from './sfx-ui';
import { STINGER_RECIPES } from './stingers';
import { BUCKET_FOE, BUCKET_IMPACT, BUCKET_SWING, type VoiceRule } from './voices';

export interface SoundDef {
  index: number;
  /** Stable name, also the seed of the variant RNG ("sfx:coin", "stinger:victory"). */
  key: string;
  id: string;
  recipe: Recipe;
  rule: VoiceRule;
  stinger: boolean;
}

/** Default voice rule per loudness tier; recipes override single fields. */
const CAT_RULE: Record<Cat, VoiceRule> = {
  ui: { maxVoices: 3, minGap: 0.03, falloff: 0 },
  tick: { maxVoices: 4, minGap: 0.04, falloff: 0.12 },
  reward: { maxVoices: 3, minGap: 0.04, falloff: 0 },
  fire: { maxVoices: 3, minGap: 0.08, falloff: 0.15 },
  hit: { maxVoices: 5, minGap: 0.04, falloff: 0.18 },
  swing: { maxVoices: 2, minGap: 0.08, falloff: 0.12 },
  impact: { maxVoices: 3, minGap: 0.05, falloff: 0.15 },
  foe: { maxVoices: 2, minGap: 0.05, falloff: 0.15 },
  finale: { maxVoices: 1, minGap: 0.5, falloff: 0 },
  combat: { maxVoices: 3, minGap: 0.06, falloff: 0 },
  big: { maxVoices: 2, minGap: 0.15, falloff: 0 },
  stinger: { maxVoices: 1, minGap: 0.5, falloff: 0 },
  // The cats' skills: a signature is one at a time (a recipe may let a second overlap), a small sound of a skill's run is a texture.
  skill: { maxVoices: 1, minGap: 0.2, falloff: 0 },
  skillTick: { maxVoices: 3, minGap: 0.05, falloff: 0.12 },
};

/**
 * Which kind of fight sound a loudness family is: the three kinds are thinned and capped together (voices.ts). The old shots and hits
 * join them, so everything the fight plays shares one budget.
 */
const BUCKET: Partial<Record<Cat, number>> = {
  fire: BUCKET_SWING,
  swing: BUCKET_SWING,
  hit: BUCKET_IMPACT,
  impact: BUCKET_IMPACT,
  foe: BUCKET_FOE,
  finale: BUCKET_FOE,
};

/**
 * The recipe files each cover a slice of the ids. Typing the merge as a full Record makes the
 * compiler prove the slices add up: a new id in SFX_IDS without a recipe stops the build here.
 */
// (The old versions kept for the sound board's "지금" go with the board: a store build without it, `VITE_SOUNDBOARD=off`, leaves them out, and an id without a recipe is
// simply not in the catalogue there: nothing in the game plays one.)
const WITH_BOARD = import.meta.env.VITE_SOUNDBOARD !== 'off';
const OLD_VERSIONS: Partial<Record<LegacySfxId, Recipe>> = WITH_BOARD ? BEFORE_RECIPES : {};
// (the type still proves that every sound of the game has a recipe)
const ALL: Record<Exclude<SfxId, LegacySfxId>, Recipe> & Partial<Record<LegacySfxId, Recipe>> = { ...UI_RECIPES, ...COMBAT_RECIPES, ...BATTLE_RECIPES, ...CAT_RECIPES, ...IMPACT_RECIPES, ...FOE_RECIPES, ...SKILL_RECIPES, ...OLD_VERSIONS };

export const SOUNDS: SoundDef[] = [];
const sfxIndex = new Map<string, number>();
const stingerIndex = new Map<string, number>();

function add(id: string, recipe: Recipe, stinger: boolean): void {
  const index = SOUNDS.length;
  SOUNDS.push({
    index,
    key: `${stinger ? 'stinger' : 'sfx'}:${id}`,
    id,
    recipe,
    rule: { ...CAT_RULE[recipe.cat], ...recipe.rule, prio: recipe.prio ?? 0, bucket: BUCKET[recipe.cat] ?? -1 },
    stinger,
  });
  (stinger ? stingerIndex : sfxIndex).set(id, index);
}

for (const id of SFX_IDS) {
  const recipe = ALL[id];
  if (recipe) add(id, recipe, false);
}
for (const id of Object.keys(STINGER_RECIPES) as StingerId[]) add(id, STINGER_RECIPES[id], true);

/** Catalogue index of an SFX id, or -1 when it has no recipe. */
export function sfxIndexOf(id: SfxId): number {
  return sfxIndex.get(id) ?? -1;
}

export function stingerIndexOf(id: StingerId): number {
  return stingerIndex.get(id) ?? -1;
}

const CAT_ORDER: readonly Cat[] = ['ui', 'tick', 'reward', 'fire', 'hit', 'swing', 'impact', 'foe', 'combat', 'skillTick', 'skill', 'big', 'finale', 'stinger'];

/** Bake order for the idle pre-render: the sounds heard first and most often come first. */
export const PRERENDER_ORDER: readonly number[] = SOUNDS.filter((d) => !d.recipe.legacy).map((d) => d.index).sort(
  (a, b) => CAT_ORDER.indexOf((SOUNDS[a] as SoundDef).recipe.cat) - CAT_ORDER.indexOf((SOUNDS[b] as SoundDef).recipe.cat) || a - b,
);
