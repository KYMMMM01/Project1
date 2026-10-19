/**
 * Before / after for the sound board. A row of the board (`catalog.ts`) plays what the game played ("지금"). To let the owner hear a
 * change next to it, add the row's key here and the page shows a second button, "새것", and one that plays both in turn.
 *
 *   'imp_w_viking': [{ sfx: 'imp_w_viking_v2' }],                       // a new recipe under a new id
 *   'imp_w_sword': [{ file: 'impact-sounds/impactWood_heavy_001', volume: 0.9 }],   // a sample of the CC0 packs (key = `pack/name`, see the candidates tab)
 *   'skill:cut': [{ sfx: 'atk_w_samurai' }, { sfx: 'sp_cut_clang', at: 0.02 }, { sfx: 'imp_w_samurai', at: 1.2 }],   // a skill's whole sequence
 *
 * Keys are the row keys: an SFX id for a single sound, `pair:<cat>` for a cat's shot, `skill:<name>` for a skill. A cue is
 * `{ sfx | stinger | file, at?: seconds after the tap, volume?, pitch?, step? }` (see `Cue`). Leave the table empty and no row shows "새것".
 *
 * When a new recipe replaces an old one in place (the same id), the board's "지금" would change too. Keep the old sound under a pinned entry in
 * `OLD_VERSIONS` (an id the engine still has, or a sample) for as long as the owner is comparing.
 *
 * The rows of the hit pass of 2026-10-19 (the testers asked for better hit sounds) are made from the board's own rows: "새것" is what the row plays now (the game's
 * sounds, as the director plays them), "지금" is the same cues with the old recipes, kept word for word under `old_<id>` (`src/audio/sfx-before.ts`, baked with
 * the seed of the sound they were, so they are the very sounds the game played): every cat's release and landing and the two together, the layers of a blow
 * (`hit_heavy`, `crit`, `combo:crit`), the explosion, what an enemy answers a hit with, the boss's warning and cry.
 *
 * The twelve `skill:` rows below are the skills' new sounds (2026-10-19): "지금" is what the scenes played before they had sounds of their own (the
 * sequences in `catalog.ts`), "새것" is what the game plays now. The cues are the scenes' own calls in `src/view/director/sp/`: the same ids, volumes,
 * pitches and (rounded) times, so the board is the game. Remove an entry when the owner has chosen and `catalog.ts` is brought up to date.
 */
import { LEGACY_SFX_IDS, type SfxId } from '@/audio/api';
import { UNIT_IDS } from '@/game/api';
import { ROW_BY_KEY, type Cue } from './catalog';

/** The tiger's hoofbeats, one every quarter second along the run (`sp_stomp`, a stomp on every enemy the tiger passes). */
const stomps: Cue[] = [0.55, 0.8, 1.05, 1.3].map((at) => ({ sfx: 'sp_stomp', volume: 0.85, at }));
/** The ninja's four throws, 0.8 s apart. */
const throws: Cue[] = [0.7, 1.5, 2.3, 3.1].map((at) => ({ sfx: 'sp_clone_throw', volume: 0.8, at }));
/** The arrow's whoosh in pieces along the lap, and a star on every enemy it passes, climbing the ladder. */
const lapWhooshes: Cue[] = [0, 0.3, 0.6, 0.9].map((at) => ({ sfx: 'sp_arrow_whoosh', volume: 0.85, at }));
const lapStars: Cue[] = [0, 1, 2, 3, 4].map((step) => ({ sfx: 'sp_star_ping', volume: 0.8, step, at: 0.2 + step * 0.18 }));
/** Eight bolts of the cloud, 0.4 s apart, each a little higher. */
const bolts: Cue[] = [0, 1, 2, 3, 4, 5].map((k) => ({ sfx: 'sp_thunder_tick', volume: 0.9, pitch: 1 + k * 0.055, at: 0.45 + k * 0.4 }));

/** "새것": the skills' sequences, by row key. */
const SKILL_NEW: Readonly<Record<string, readonly Cue[]>> = {
  'skill:shove': [
    { sfx: 'sp_shield_slam', volume: 1, at: 0 },
    { sfx: 'sp_dust_wedge', volume: 0.8, at: 0.06 },
  ],
  'skill:cut': [
    { sfx: 'sp_dash', volume: 0.9, at: 0 },
    { sfx: 'sp_sheath', volume: 0.9, at: 1.16 },
    { sfx: 'sp_cut_clash', volume: 1.2, at: 1.2 },
  ],
  'skill:charge': [
    { sfx: 'sp_cutin', volume: 0.9, at: 0 },
    { sfx: 'sp_tiger_roar', volume: 1, at: 0 },
    { sfx: 'sp_tiger_land', volume: 0.9, at: 0.3 },
    ...stomps,
    { sfx: 'sp_tiger_roar_end', volume: 0.9, at: 1.5 },
  ],
  'skill:clones': [
    { sfx: 'sp_smoke_pop', volume: 1, at: 0 },
    { sfx: 'sp_clone_hop', volume: 0.7, at: 0.28 },
    { sfx: 'sp_clone_hop', volume: 0.7, at: 0.3 },
    ...throws,
    { sfx: 'sp_clone_vanish', volume: 0.9, at: 3.3 },
  ],
  'skill:wanted': [
    { sfx: 'sp_poster_slap', volume: 1, at: 0 },
    { sfx: 'sp_cork_pop', volume: 0.9, at: 0.3 },
    { sfx: 'sp_poster_hole', volume: 1, at: 0.55 },
    { sfx: 'sp_seal_stamp', volume: 0.9, at: 0.64 },
  ],
  'skill:lap': [
    { sfx: 'sp_cutin', volume: 0.9, at: 0 },
    { sfx: 'sp_night_hush', volume: 0.9, at: 0 },
    ...lapWhooshes,
    ...lapStars,
  ],
  'skill:cloud': [
    { sfx: 'sp_cloud_pop', volume: 0.95, at: 0 },
    ...bolts,
    { sfx: 'sp_cloud_hop', volume: 0.8, at: 1.5 },
    { sfx: 'sp_cloud_sigh', volume: 0.9, at: 3.2 },
  ],
  'skill:knock': [
    { sfx: 'sp_glass_tap', volume: 0.9, at: 0 },
    { sfx: 'sp_glass_shatter', volume: 1, at: 0.7 },
    { sfx: 'sp_shard_hit', volume: 1, pitch: 0.9, at: 0.95 },
    { sfx: 'sp_shard_hit', volume: 0.7, pitch: 1.15, at: 1.07 },
    { sfx: 'sp_shard_hit', volume: 1, pitch: 0.9, at: 1.19 },
  ],
  'skill:meteor': [
    { sfx: 'sp_cutin', volume: 0.9, at: 0 },
    { sfx: 'sp_meteor_warn', volume: 0.85, at: 0 },
    { sfx: 'sp_meteor_whistle', volume: 0.8, at: 0.65 },
    { sfx: 'sp_meteor_boom', volume: 1, at: 1 },
    { sfx: 'sp_meteor_ring', volume: 0.8, at: 1.25 },
  ],
  'skill:jam': [
    { sfx: 'sp_strum', volume: 0.95, at: 0 },
    { sfx: 'sp_note', volume: 0.8, step: 0, at: 0.5 },
    { sfx: 'sp_note', volume: 0.8, step: 1, at: 0.62 },
    { sfx: 'sp_note', volume: 0.8, step: 2, at: 0.74 },
    { sfx: 'sp_note', volume: 0.8, step: 3, at: 0.86 },
  ],
  'skill:fish': [
    { sfx: 'sp_flask_toss', volume: 0.9, at: 0 },
    { sfx: 'sp_flask_pop', volume: 1, at: 0.7 },
    { sfx: 'sp_fish_boing', volume: 0.9, at: 0.79 },
    { sfx: 'sp_flask_mini', volume: 0.9, at: 0.95 },
    { sfx: 'sp_flask_mini', volume: 0.9, at: 1.1 },
    { sfx: 'sp_fish_back', volume: 0.9, at: 4 },
  ],
  'skill:capsule': [
    { sfx: 'sp_cutin', volume: 0.9, at: 0 },
    { sfx: 'sp_capsule_fall', volume: 0.85, at: 0 },
    { sfx: 'sp_capsule_bounce', volume: 0.9, at: 0.47 },
    { sfx: 'sp_capsule_bounce', volume: 0.65, pitch: 1.18, at: 0.7 },
    { sfx: 'sp_capsule_rattle', volume: 0.8, at: 0.95 },
    { sfx: 'sp_capsule_pop', volume: 0.9, at: 1.5 },
    { sfx: 'sp_prize_fish', volume: 0.9, at: 1.57 },
  ],
};

// ───────────────────────────── the hit pass ─────────────────────────────

const OLD_IDS: ReadonlySet<string> = new Set(LEGACY_SFX_IDS);

/** The old version of a sound of the hit pass, or the sound itself when its recipe was not touched. */
export function before(id: SfxId): SfxId {
  return OLD_IDS.has(`old_${id}`) ? (`old_${id}` as SfxId) : id;
}

/** The rows of the hit pass: one per release and landing, the pairs, the layers of a blow, the explosion, the enemies' answers, the boss's warning and cry. */
const HIT_PASS_ROWS: readonly string[] = [
  ...UNIT_IDS.flatMap((u) => [`pair:${u}`, `atk_${u}`, `imp_${u}`]),
  'combo:crit',
  'hit_heavy',
  'crit',
  'explosion',
  ...['juicy', 'fluff', 'water', 'rubber', 'plastic', 'tin', 'motor', 'paper', 'glass', 'cloud'].map((m) => `foe_${m}_hit`),
  'boss_warning',
  'boss_roar',
];

const HIT_NEW: Record<string, readonly Cue[]> = {};
const HIT_OLD: Record<string, readonly Cue[]> = {};
for (const key of HIT_PASS_ROWS) {
  const row = ROW_BY_KEY.get(key);
  if (!row) continue;
  const old = row.now.map((c) => (c.sfx ? { ...c, sfx: before(c.sfx) } : c));
  // a row whose sounds were not touched (the snow cat's release only moved by a fifth of a decibel) has nothing to compare
  if (old.every((c, i) => c.sfx === row.now[i]?.sfx)) continue;
  HIT_NEW[key] = row.now;
  HIT_OLD[key] = old;
}

/** The rows that have an old and a new version. */
export const HIT_PASS_KEYS: readonly string[] = Object.keys(HIT_NEW);

/** "새것": the version being proposed, by row key. */
export const NEW_VERSIONS: Readonly<Record<string, readonly Cue[]>> = { ...SKILL_NEW, ...HIT_NEW };

/** "지금" pinned to something other than the row's own cues: the old recipes of the hit pass (the rows themselves play the new ones now). */
export const OLD_VERSIONS: Readonly<Record<string, readonly Cue[]>> = HIT_OLD;

/** SFX ids that exist only as somebody's "새것" and so have no row of their own (the coverage test exempts them). */
export const NEW_ONLY_IDS: readonly SfxId[] = [];
