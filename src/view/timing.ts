/**
 * Beats shared by the field (stickers) and the director (effects and sounds), so a sticker lands on the
 * frame its effect fires. Pure data: nothing here knows about Pixi.
 */

/** A cat that moves or swaps hops to its cell in this long; the landing squash, dust and sound belong at its end. */
export const SLIDE_SECONDS = 0.16;

/** The two merging stickers meet exactly when the merge burst lands (`Fx.mergeBurst` sucks in for the same time). */
export const MERGE_SECONDS = 0.17;

/**
 * Per rarity index (common .. mythic): seconds from a summon to the sticker's reveal. They are the impact
 * times of `Fx.summonReveal`, so "colour first, identity later" holds: the charge plays on an empty cell and
 * the cat pops in on the impact frame instead of sitting under the charge-up.
 */
export const REVEAL_DELAY: readonly number[] = [0, 0.06, 0.12, 0.22, 0.38];

/** A legendary-or-better reveal within this many seconds of the previous one plays its short version (impact of an epic one). */
export const QUICK_REVEAL_WINDOW = 3;

/** Pop-in overshoot and length by rarity index: each rank springs a little further and settles a little slower. */
export const REVEAL_OVERSHOOT: readonly number[] = [1.7, 1.9, 2.1, 2.4, 2.7];
export const REVEAL_MS: readonly number[] = [240, 260, 290, 330, 400];

/** Seconds the coil of an attack lasts before its release (the cat squashes back while the attack charges up). */
export const ANTICIPATION_SECONDS = 0.1;
