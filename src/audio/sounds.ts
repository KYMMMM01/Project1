/**
 * The sound catalogue: every SFX id and stinger as a numbered SoundDef with its recipe and voice
 * rule. Numeric indices (not strings) key the bank and the limiter so playing a sound allocates nothing.
 */
import { SFX_IDS, type SfxId, type StingerId } from './api';
import type { Cat, Recipe } from './recipe';
import { BATTLE_RECIPES } from './sfx-battle';
import { COMBAT_RECIPES } from './sfx-combat';
import { UI_RECIPES } from './sfx-ui';
import { STINGER_RECIPES } from './stingers';
import type { VoiceRule } from './voices';

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
  combat: { maxVoices: 3, minGap: 0.06, falloff: 0 },
  big: { maxVoices: 2, minGap: 0.15, falloff: 0 },
  stinger: { maxVoices: 1, minGap: 0.5, falloff: 0 },
};

/**
 * The three recipe files each cover a slice of the ids. Typing the merge as a full Record makes the
 * compiler prove the slices add up: a new id in SFX_IDS without a recipe stops the build here.
 */
const ALL: Record<SfxId, Recipe> = { ...UI_RECIPES, ...COMBAT_RECIPES, ...BATTLE_RECIPES };

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
    rule: { ...CAT_RULE[recipe.cat], ...recipe.rule },
    stinger,
  });
  (stinger ? stingerIndex : sfxIndex).set(id, index);
}

for (const id of SFX_IDS) add(id, ALL[id], false);
for (const id of Object.keys(STINGER_RECIPES) as StingerId[]) add(id, STINGER_RECIPES[id], true);

/** Catalogue index of an SFX id, or -1 when it has no recipe. */
export function sfxIndexOf(id: SfxId): number {
  return sfxIndex.get(id) ?? -1;
}

export function stingerIndexOf(id: StingerId): number {
  return stingerIndex.get(id) ?? -1;
}

const CAT_ORDER: readonly Cat[] = ['ui', 'tick', 'reward', 'fire', 'hit', 'combat', 'big', 'stinger'];

/** Bake order for the idle pre-render: the sounds heard first and most often come first. */
export const PRERENDER_ORDER: readonly number[] = SOUNDS.map((d) => d.index).sort(
  (a, b) => CAT_ORDER.indexOf((SOUNDS[a] as SoundDef).recipe.cat) - CAT_ORDER.indexOf((SOUNDS[b] as SoundDef).recipe.cat) || a - b,
);
