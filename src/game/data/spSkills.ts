/**
 * The cats' skills (docs/design_skills_v2.md, the data appendix): one row per skill with every number the design names, under the
 * appendix's names. `D` in a comment is the cat's current hit (`stats.damage`).
 *
 * A skill is "built" when its row says so: only then does the cat's definition carry `spSkill` (directive decision 8), the gauge runs
 * and the handler in `sim/sp/registry.ts` is called. A row can be added before its skill exists; flip `built` last.
 *
 * All twelve skills are built (step 2 finished the last eight; `docs/handoff/skills2_sim.md`): every row is `built: true`, every skill has its
 * handler in `sim/sp/<name>.ts` listed in `sim/sp/registry.ts`, and the payload of its cast event is its member of `SpPayload` in
 * `game/api.ts`. The `built` flag stays as the switch of a single skill: a row set back to `false` takes the skill away from its cat. To add
 * a thirteenth, follow section 8 of `docs/handoff/skills1_sim.md` and flip `built` LAST.
 */
import type { SpCapsuleKind, SpRank, SpSkillId, UnitId } from '../api';

/**
 * The STARTING cooldown of a skill, by the rank of its cat: Alley Boss 18, King 24, Guardian 34 (higher ranks are bigger, not more
 * frequent). The table is a record of where the rows started: the rows below carry their own numbers and nothing in the game reads this.
 */
export const SP_COOLDOWN: Readonly<Record<SpRank, number>> = { 3: 18, 4: 24, 5: 34 };

/** Where a gauge starts (0..1). A merge result and a restored cat start where the attack gauge does (`MERGE_START_CHARGE`); a molt or an awakening keeps the ratio. */
export const SP_START_NEW = 0.5;
export const SP_START_MERGE = 0.5;
export const SP_START_RESTORE = 0.5;

/** A full gauge whose skill has nothing to do re-checks every this many seconds, not every tick. */
export const SP_RECHECK = 0.2;
/** Two rank 5 skills cast at least this many seconds apart; the later cat waits with its gauge full. */
export const SP_RANK5_GAP = 1.2;

/** The cat of each skill (all twelve names are reserved) and its rank. */
export const SP_UNIT_OF: Readonly<Record<SpSkillId, UnitId>> = {
  shove: 'w_viking', cut: 'w_samurai', charge: 'w_tiger', clones: 'r_ninja', wanted: 'r_gunner', lap: 'r_star',
  cloud: 'm_storm', knock: 'm_frost', meteor: 'm_cosmo', jam: 't_bard', fish: 't_alch', capsule: 't_lucky',
};
export const SP_RANK_OF: Readonly<Record<SpSkillId, SpRank>> = {
  shove: 3, cut: 4, charge: 5, clones: 3, wanted: 4, lap: 5, cloud: 3, knock: 4, meteor: 5, jam: 3, fish: 4, capsule: 5,
};

export interface SpRowBase<K extends SpSkillId> {
  id: K;
  unit: UnitId;
  rank: SpRank;
  /**
   * Seconds the gauge takes to fill: this skill's own cell (directive decision 1), nothing is derived from the rank. It STARTS as
   * `SP_COOLDOWN[rank]`; the lead proposes a number per skill after the bots have measured it and the owner settles it. A test holds
   * every row to `0 < cooldown <= 34` (the owner's ceiling: a skill that is too strong at 34 s is turned down by its own numbers).
   */
  cooldown: number;
  nameKey: string;
  /** True once the skill works end to end (handler registered). Only then does the cat carry `spSkill`. */
  built: boolean;
}

/** Shield Shove: pushes everything in the cat's reach back along the road, then a light thump. */
export interface SpShoveRow extends SpRowBase<'shove'> {
  /** px an ordinary enemy slides back along the road. */
  push: number;
  /** Seconds the slide takes. */
  slide: number;
  /** Damage of the thump, in D (no crit). */
  thump: number;
  /** Share of `push` an elite / a boss slides (the black hole's factors). */
  eliteFactor: number;
  bossFactor: number;
  /** Seconds a pushed enemy cannot be pushed again (its own window; the black hole's is separate). */
  window: number;
  /** An enemy that has travelled less than this is not a target (it would pile up on the start of the road). */
  minTravelled: number;
}

/** The Tiger Has Arrived: a run against the flow along the busiest stretch of road. */
export interface SpChargeRow extends SpRowBase<'charge'> {
  /** px of road the run covers, its speed in px/s, and the seconds of the leap before it. */
  dist: number;
  speed: number;
  leap: number;
  /** Damage per enemy passed, in D, once each. */
  power: number;
  /** The stomp goes through armour and ward (the damage cap still applies). */
  ignoreDefence: boolean;
  /** Weight of an ordinary enemy, an elite and a boss when the busiest stretch is chosen. */
  weights: readonly [normal: number, elite: number, boss: number];
  /** The cast waits until the best stretch weighs at least this much. */
  minWeight: number;
  /**
   * While the wave is still sending enemies out, the tiger waits for a stretch that weighs at least this much (the owner, 2026-10-14: the
   * charge belongs where the enemies are thickest; with `minWeight` alone a full gauge ran at the first three stragglers and the bots'
   * charges touched about two enemies each). Once the wave has sent everything, the best stretch of at least `minWeight` will do.
   */
  crowd: number;
}

/** Starlight Lap: one silver arrow once round the road with the flow. */
export interface SpLapRow extends SpRowBase<'lap'> {
  /** px/s, and the px added to one lap so enemies walking ahead are caught too. */
  speed: number;
  extra: number;
  /** Damage per enemy passed, in D, and the most all hits of one cast may add up to (each share shrinks when more are passed). */
  power: number;
  pool: number;
  /** The burst of an enemy that falls: its share of the hit and its radius in px (the passive's, with no second burst). */
  burst: { pct: number; radius: number };
  /** The cast waits for this many enemies on the field (or an elite / boss). */
  minEnemies: number;
}

/** Wanted: One Shot: a share of an elite's or boss's maximum health outside its damage cap, or part of a plain enemy's health. */
export interface SpWantedRow extends SpRowBase<'wanted'> {
  /** Share of maximum health one shot takes from an elite / boss, and the most one target gives in all (shared by every gunner). */
  bite: number;
  pool: number;
  /** The bite is outside the elite / boss damage cap and ignores armour and ward. */
  ignoreCap: boolean;
  ignoreDefence: boolean;
  /** Share of current health taken from the sturdiest plain enemy when no elite or boss is there. */
  small: number;
  /** `nextWaveSpecial`: hold fire (gauge full) in the wave before an elite / boss wave. */
  hold: 'nextWaveSpecial' | 'none';
}

// ───────────── step 2: the other eight rows (design v2.3, the data appendix; every row is built now) ─────────────
//
// Each row carries the appendix's cells under the appendix's names. A cell the appendix does not name but the design's text gives a number
// for is marked "(text)" and was added so that no agent hard-codes it; the agent who builds the skill owns its row and may correct it.

/** Already Cut: marks the enemies of a stretch of road and cuts them all together a moment later. */
export interface SpCutRow extends SpRowBase<'cut'> {
  /** Half the marked stretch of road, px either side of the anchor enemy (450 in all). */
  half: number;
  /** The most enemies marked. */
  max: number;
  /** Seconds from the cast until every line opens. */
  fuse: number;
  /** Damage of one cut, in D (no crit). */
  power: number;
  /** A line whose enemy died before it opened moves to the nearest living, unmarked enemy within this many px (none: it is lost). */
  reaim: number;
  /** (text, 3.2) The cast waits for this many enemies in the stretch, or an elite / boss in reach. */
  minEnemies: number;
}

/** Surprise Clones: pale clones stand on empty tiles and throw one shuriken along with each of the ninja's volleys. */
export interface SpClonesRow extends SpRowBase<'clones'> {
  /** Clones per cast. */
  clones: number;
  /** Throws per clone (one shuriken per ninja volley), then it goes. */
  throws: number;
  /** Seconds the leap to the seat takes. */
  arrive: number;
  /** The longest a clone stays, seconds from the cast (the rest of its throws are dropped). */
  maxLife: number;
  /** The level 7 perk (an extra shuriken per volley) is NOT copied to a clone. */
  copyTargetsPerk: boolean;
  /** A clone never aims at an enemy another shuriken of the same volley is on. */
  spread: boolean;
  /** The cast waits for this many enemies inside the ninja's own reach. */
  readyMinEnemies: number;
  /** Where a clone stands: the nearest empty tiles by distance between tile centres, ties to the lower tile number; none left: stacked on the ninja's tile. */
  seats: 'nearestEmpty';
  /** How a stacked clone is drawn (design px, from the ninja's tile): offset, scale, and the opacity of a stacked and of a standing clone. */
  stackOffset: { x: number; y: number; scale: number; alpha: number; standingAlpha: number };
  /** The most clones drawn as full bodies at once; the rest only as an outline. */
  figureCap: number;
  /** A clone's numbers (damage, crit, pierce) are the ninja's current stats ... */
  numbers: 'ninjaStats';
  /** ... but its reach is measured from the clone's own tile. */
  reachFrom: 'cloneTile';
}

/** Tagalong Cloud: a small cloud follows an enemy and drops lightning on it. */
export interface SpCloudRow extends SpRowBase<'cloud'> {
  /** Seconds the cloud lasts, and seconds between bolts. */
  life: number;
  every: number;
  /** Damage of a bolt on the host, in D (no crit). */
  host: number;
  /** Damage of a bolt on the other enemies within `radius` px of the host, in D. */
  splash: { power: number; radius: number };
  /** When the host dies the cloud hops to the nearest living enemy within this many px (none: it goes). */
  hop: number;
  /** The most clouds on the field at once, in all (a further cast waits: `ready` is false and the gauge stays full). */
  cap: number;
}

/** Knock It Off!: a glass breaks over the chilled enemies; their chill is spent as damage. */
export interface SpKnockRow extends SpRowBase<'knock'> {
  /** Shards reach the slowed or frozen enemies within this many px of the impact. */
  radius: number;
  /** The impact is the chilled enemy with the most chilled enemies of the same kind within this many px. */
  knot: number;
  /** Damage in D of a shard on a slowed enemy and on a frozen one (no crit); the chill is removed after the damage. */
  slowed: number;
  frozen: number;
  /** The cast waits for this many chilled enemies in reach. */
  minChilled: number;
}

/** Meteor Drop: a warning circle, a meteor, two rings of damage and a burning crater. */
export interface SpMeteorRow extends SpRowBase<'meteor'> {
  /** Seconds of warning before the meteor lands. */
  warn: number;
  /** The inner ring (radius px, damage in D) and the outer ring (radius, damage, seconds after the inner one). */
  inner: { radius: number; power: number };
  outer: { radius: number; power: number; delay: number };
  /** The crater: radius px, seconds it burns, burn strength (0.3 x D / attack interval a second, like the fire cat's), and (text, 3.9) seconds between its burn refreshes. */
  crater: { radius: number; life: number; burn: number; every: number };
  /** The aim: the point where enemies (at their place a second later) weigh most within this many px. */
  cluster: number;
  /** (text, 3.9) Weight of an ordinary enemy, an elite and a boss in that sum. */
  weights: readonly [normal: number, elite: number, boss: number];
  /** The cast waits until the best point weighs at least this much. */
  minWeight: number;
}

/** Jam Session!: golden notes fill the skill gauges of the cats lowest on theirs; a note with no gauge to fill makes a cat attack once. */
export interface SpJamRow extends SpRowBase<'jam'> {
  /** Notes per cast. */
  targets: number;
  /** Share of a gauge one note adds. */
  fill: number;
  /** A skill cat whose gauge is at or above this share is passed over. */
  skip: number;
  /** A note nobody's gauge can take goes to the nearest cat without a skill that has a target in reach, and adds this much to its attack charge (one free attack). */
  leftoverCharge: number;
}

/** Turn Into Fish!: a big flask turns an elite or boss into a slow fish for a moment; small ones turn the weakest ordinary enemies into fish for fish. */
export interface SpFishRow extends SpRowBase<'fish'> {
  /** Flasks in all, and how many of them are big (the rest are small). */
  flasks: number;
  big: number;
  /** Small flasks when there is a big one, and when there is not. */
  smallTargets: { withBig: number; withoutBig: number };
  /** A small flask only takes an enemy whose health is at most this share of the base health of a cucumber of the wave it was born in. */
  maxHp: number;
  /** The reward in fish of an enemy turned into a fish is multiplied by this (through `earnFish`). */
  bounty: number;
  /** The walking speed of a fish (a share of the normal), seconds it lasts, and seconds the same enemy cannot be turned again after it. */
  fishSpeed: number;
  fishTime: { boss: number; elite: number };
  fishLock: { boss: number; elite: number };
  /** The big flask needs this many cats that can hit the elite or boss (the alchemist among them). */
  reachMin: number;
  /** Without a big flask the cast waits for this many small targets. */
  minTargets: number;
  /** Everything is taken from inside the alchemist's own reach. */
  inReachOnly: boolean;
}

/** The three prizes of the capsule that can come up empty and pay purr instead (a partner with no candidate, a toy with nothing left, a guardian with nobody to awaken). */
export type SpCapsuleFallbackKind = 'partner' | 'toy' | 'guardian';

/** Lucky Capsule!: a capsule of one of six kinds, rolled at the cast, opens a moment later (design 3.12). */
export interface SpCapsuleRow extends SpRowBase<'capsule'> {
  /** The odds row in per cent, in the order the roll goes through them (`SP_CAPSULE_KINDS`); adds up to 100. */
  weights: Readonly<Record<SpCapsuleKind, number>>;
  /** What a `more` capsule rolls inside (never a third, never fish or purr); rolled at the cast. */
  moreWeights: Readonly<Record<SpCapsuleFallbackKind, number>>;
  /** Seconds from the cast until the capsule opens, and from that until the small capsule of a `more` opens. */
  openDelay: number;
  moreDelay: number;
  /** A fish capsule pays this many summon prices (`summonCostOf`, through `earnFish`, reason 'skill'). */
  fish: number;
  /** A purr capsule pays this much purr. */
  purr: number;
  /** A fish capsule sets the cat's gauge to this share instead of 0 (0 <= fishRefund < 1; 0 = no refund). Only the fish kind refunds. */
  fishRefund: number;
  /** What the partner, toy and guardian capsules pay in purr when they have nothing to give. */
  fallbackPurr: Readonly<Record<SpCapsuleFallbackKind, number>>;
  /** The partner is a cat of these ranks (`rarityIndex`: 0 common to 2 epic); in the design's text they are the grades 1 to 3. */
  partnerRanks: { min: number; max: number };
  /** The order the candidates are sorted by, first key first. */
  partnerOrder: readonly ('noPartner' | 'fillsEmptyRung' | 'higherRank' | 'lowerCell')[];
  /** A cat is not a candidate if merging it (or promoting it) would lower a class's synergy step. */
  partnerSafe: boolean;
  /** Where the partner stands: the nearest empty tile to the original (centre distance, ties to the lower tile); none: the original is promoted in place. */
  seat: 'nearestEmpty';
  /**
   * The toy capsule: how the pick is made. `floorRow` is the row of `RELIC_RARITY_WEIGHTS` the rarity row may not fall below (1 = stages 3 and 4's);
   * `rowKnob` 'act' reads the row of the stage being played, 'actMinusOne' the row of the shop already passed; `common` false leaves the common
   * toys out; `picks` and `reroll` as they say. `stream` is the record of where the draw comes from by default: `capsuleRng` (`sim/sp/capsule.ts`)
   * makes it, the `combat` stream or, with `rollsFrom: 'hash'`, a hash of the seed, the wave and the order of the draw.
   */
  toyPick: {
    options: 'relicChoices'; picks: number; reroll: boolean; common: boolean; floorRow: number; rowKnob: 'act' | 'actMinusOne';
    stream: 'combat'; opened: 'tickEnd'; resumePhase: 'wave'; dragReleased: boolean;
  };
  /** The guardian capsule: a free awakening of a legendary cat; `safe` skips one whose awakening would lower a class's step; `order` is the sort. */
  guardianPick: { safe: boolean; order: readonly ('stepDesc' | 'classOrder' | 'lowerCell')[]; free: boolean; eventFree: boolean };
  /** In the tutorial the toy and the guardian lines pay purr instead (the lessons react to the real events). */
  tutorial: { toyPurr: number; guardianPurr: number };
  /** The colour and the mark of each capsule, for the view (the mark is what tells the three pink ones apart at 40 px). */
  marks: Readonly<Record<SpCapsuleKind, { color: 'pink' | 'sky' | 'gold' | 'rainbow'; mark: 'none' | 'heart' | 'paws' | 'smallCapsule' | 'star' | 'bands' }>>;
  /** Knobs the design describes and did NOT switch on: a full board turns a fish capsule into purr 1; a common as the best partner on a full board pays purr 3; the bard may also fill the lucky cat's gauge (true = it may); the rolls come from the `combat` stream (the other option is a hash of seed, wave and the cast's order in the wave). */
  fullBoardFish: boolean;
  /** The purr a fish capsule pays instead of its fish when `fullBoardFish` is on and the board has no empty tile (design 3.12.9: +1). */
  fullBoardFishPurr: number;
  fullBoardPartnerFloor: boolean;
  bardTargetsCapsule: boolean;
  rollsFrom: 'combat' | 'hash';
  /**
   * The cap for several lucky cats (design 3.12.7, 7 no. 4: "a line, if one is needed"; off): true = a lucky cat whose gauge is full waits while any
   * capsule is still in the air (on the delayed list), so there are never two at once. A cast that waits has no roll and no refund yet.
   */
  oneAtATime: boolean;
  /**
   * One capsule gauge for the whole board (the owner's choice of 2026-10-14, after the bots showed lucky cats multiplying in the endless mode:
   * a capsule pays purr, purr awakens another lucky cat, and ten cats dropped ten capsules a cooldown). true = when a lucky cat casts, every
   * other lucky cat on the board starts its gauge over with it (at 0, or at `fishRefund` when the capsule was the fish capsule), so the board
   * gets one stream of capsules however many lucky cats stand on it. false = every cat has its own stream (the design's first reading).
   */
  sharedGauge: boolean;
}

/** The rows of the skills that have one (all twelve; a row whose `built` is false belongs to a skill that does not work yet). */
export interface SpRows {
  shove: SpShoveRow;
  cut: SpCutRow;
  charge: SpChargeRow;
  clones: SpClonesRow;
  wanted: SpWantedRow;
  lap: SpLapRow;
  cloud: SpCloudRow;
  knock: SpKnockRow;
  meteor: SpMeteorRow;
  jam: SpJamRow;
  fish: SpFishRow;
  capsule: SpCapsuleRow;
}

export type SpRow = SpRows[keyof SpRows];

export const SP_ROWS: SpRows = {
  shove: {
    id: 'shove', unit: 'w_viking', rank: 3, cooldown: 12, nameKey: 'sp.shove.name',
    push: 160, slide: 0.35, thump: 0.25, eliteFactor: 0.35, bossFactor: 0.2, window: 3, minTravelled: 30,
    built: true, // shove
  },
  cut: {
    id: 'cut', unit: 'w_samurai', rank: 4, cooldown: 20, nameKey: 'sp.cut.name',
    half: 225, max: 10, fuse: 1.2, power: 1.4, reaim: 150, minEnemies: 2,
    built: true, // cut
  },
  charge: {
    id: 'charge', unit: 'w_tiger', rank: 5, cooldown: 30, nameKey: 'sp.charge.name',
    dist: 1100, speed: 1000, leap: 0.3, power: 1.2, ignoreDefence: true, weights: [1, 2, 3], minWeight: 3, crowd: 8,
    built: true, // charge
  },
  clones: {
    id: 'clones', unit: 'r_ninja', rank: 3, cooldown: 18, nameKey: 'sp.clones.name',
    clones: 2, throws: 4, arrive: 0.3, maxLife: 8, copyTargetsPerk: false, spread: true, readyMinEnemies: 5, seats: 'nearestEmpty',
    stackOffset: { x: 16, y: -6, scale: 0.92, alpha: 0.45, standingAlpha: 0.55 }, figureCap: 10, numbers: 'ninjaStats', reachFrom: 'cloneTile',
    built: true, // clones
  },
  wanted: {
    id: 'wanted', unit: 'r_gunner', rank: 4, cooldown: 24, nameKey: 'sp.wanted.name',
    bite: 0.06, pool: 0.12, ignoreCap: true, ignoreDefence: true, small: 0.2, hold: 'nextWaveSpecial',
    built: true, // wanted
  },
  lap: {
    id: 'lap', unit: 'r_star', rank: 5, cooldown: 26, nameKey: 'sp.lap.name',
    speed: 2000, extra: 100, power: 0.8, pool: 12.8, burst: { pct: 0.25, radius: 90 }, minEnemies: 4,
    built: true, // lap
  },
  cloud: {
    id: 'cloud', unit: 'm_storm', rank: 3, cooldown: 18, nameKey: 'sp.cloud.name',
    life: 3.2, every: 0.4, host: 0.3, splash: { power: 0.15, radius: 60 }, hop: 150, cap: 6,
    built: true, // cloud
  },
  knock: {
    id: 'knock', unit: 'm_frost', rank: 4, cooldown: 20, nameKey: 'sp.knock.name',
    radius: 260, knot: 130, slowed: 3.0, frozen: 5.0, minChilled: 2,
    built: true, // knock
  },
  meteor: {
    id: 'meteor', unit: 'm_cosmo', rank: 5, cooldown: 34, nameKey: 'sp.meteor.name',
    warn: 1.0, inner: { radius: 90, power: 1.2 }, outer: { radius: 200, power: 0.5, delay: 0.25 },
    crater: { radius: 100, life: 4, burn: 0.3, every: 0.5 }, cluster: 150, weights: [1, 2, 3], minWeight: 3,
    built: true, // meteor
  },
  jam: {
    id: 'jam', unit: 't_bard', rank: 3, cooldown: 18, nameKey: 'sp.jam.name',
    targets: 4, fill: 0.2, skip: 0.8, leftoverCharge: 1,
    built: true, // jam: `sim/sp/jam.ts`
  },
  fish: {
    id: 'fish', unit: 't_alch', rank: 4, cooldown: 24, nameKey: 'sp.fish.name',
    flasks: 5, big: 1, smallTargets: { withBig: 4, withoutBig: 5 }, maxHp: 0.6, bounty: 2, fishSpeed: 0.25,
    fishTime: { boss: 4, elite: 2.5 }, fishLock: { boss: 8, elite: 5 }, reachMin: 3, minTargets: 2, inReachOnly: true,
    built: true, // fish: `sim/sp/fish.ts`
  },
  capsule: {
    id: 'capsule', unit: 't_lucky', rank: 5, cooldown: 34, nameKey: 'sp.capsule.name',
    // The odds row (design 3.12): fish 30, purr 25, partner 25, more 10, toy 7, guardian 3 = 100. `more` rolls partner 25 : toy 7 : guardian 3 inside.
    weights: { fish: 30, purr: 25, partner: 25, more: 10, toy: 7, guardian: 3 },
    moreWeights: { partner: 25, toy: 7, guardian: 3 },
    openDelay: 1.2, moreDelay: 1.0, fish: 1, purr: 2,
    // The owner (2026-10-13, "권장안으로 ㄱㄱ"): a fish capsule sends the cat's gauge back to half, not to zero. Only the fish kind; 0 <= fishRefund < 1.
    fishRefund: 0.5,
    fallbackPurr: { partner: 3, toy: 5, guardian: 10 },
    partnerRanks: { min: 0, max: 2 },
    partnerOrder: ['noPartner', 'fillsEmptyRung', 'higherRank', 'lowerCell'],
    partnerSafe: true,
    seat: 'nearestEmpty',
    toyPick: {
      options: 'relicChoices', picks: 1, reroll: false, common: false, floorRow: 1, rowKnob: 'act', stream: 'combat', opened: 'tickEnd',
      resumePhase: 'wave', dragReleased: true,
    },
    guardianPick: { safe: true, order: ['stepDesc', 'classOrder', 'lowerCell'], free: true, eventFree: true },
    tutorial: { toyPurr: 5, guardianPurr: 10 },
    marks: {
      fish: { color: 'pink', mark: 'none' }, purr: { color: 'pink', mark: 'heart' }, partner: { color: 'sky', mark: 'paws' },
      more: { color: 'pink', mark: 'smallCapsule' }, toy: { color: 'gold', mark: 'star' }, guardian: { color: 'rainbow', mark: 'bands' },
    },
    fullBoardFish: false, fullBoardFishPurr: 1, fullBoardPartnerFloor: false, bardTargetsCapsule: true, rollsFrom: 'combat', oneAtATime: false, sharedGauge: true,
    built: true, // capsule: `sim/sp/capsule.ts`
  },
};

const ROWS_BY_ID = SP_ROWS as unknown as Readonly<Partial<Record<SpSkillId, SpRow>>>;

/** The row of a skill, built or not (all twelve have one; null only for an id that is not a skill). */
export function spRowOf(id: SpSkillId): SpRow | null {
  return ROWS_BY_ID[id] ?? null;
}

const BUILT_BY_UNIT = new Map<UnitId, SpRow>();
for (const row of Object.values(ROWS_BY_ID) as SpRow[]) if (row.built) BUILT_BY_UNIT.set(row.unit, row);

/** The row of the skill of a cat, or null when the cat has none or its skill is not built yet. */
export function spSkillOfUnit(unit: UnitId): SpRow | null {
  return BUILT_BY_UNIT.get(unit) ?? null;
}
