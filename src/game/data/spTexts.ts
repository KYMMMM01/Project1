/**
 * The words that tell the player about the cats' skills (step 3, docs/qa/directive_2026-10-13_skills_build.md decisions 29 to 32).
 *
 * THE KEYS (Korean and English; the game's strings are in `stringsGame.ts`, the guide's in `guide/stringsKo.ts` / `stringsEn.ts`):
 *
 *   sp.<id>.name            the skill's name (already there: the name bubble over the cat, the rank 5 cut-in)
 *   sp.<id>.desc            the skill's ONE line, "what you see happen": every figure is a {placeholder} that `spArgs(id)` fills from the
 *                           skill's own row in `spSkills.ts`, so a number changed in a row changes the text (the passives do the same with `skillArgs`)
 *   sp.label.skill          "스킬" / "Skill": the new thing's label
 *   sp.label.ability        "특기" / "Ability": what the cat's ordinary line is called WHILE SKILLS ARE ON (in English "Skill" would then mean two things).
 *                           With skills off the screens keep `cats.unit.skill` ("특기" / "Skill"): they must stay exactly today's. Already wired by
 *                           that rule: the title of the skill paper on the cat screen (`UnitScreen.skillPage`, `skillsOn()`) and the 3-pick popup's tip.
 *   sp.cooldown             "{s}초마다" / "every {s} s"
 *   sp.auto                 "저절로 써요" / "casts itself"
 *   sp.rank                 "{rank} 스킬" / "{rank} skill": the rank a skill comes with, as a chip on the cat screen's card
 *   sp.later                "{rank}부터 스킬이 생겨요" / "Gets a skill at {rank}": for a cat below the first rank with a skill
 *   sp.pick.tip             the 3-pick popup's hint while skills are on (replaces `hud.pick.tip`, which says "skill" for the ordinary line in English)
 *   guide.sp_skill.title | teach | full
 *                           the guide topic `sp_skill` and the tutorial lesson's bubble (`teach`); `spGuideFacts()` fills the full page
 *
 * Rank words are only the game's own (`rarity.*`: 꼬마 · 동네 · 골목대장 · 대왕 · 수호신 / Kitten · Street · Alley Boss · King · Guardian), always through
 * an argument built here, never typed into a text (directive decision 28).
 *
 * NOTHING HERE LOOKS AT THE SWITCH. Whether to show any of it is the caller's business (decision 30): inside a battle ask `BattleApi.spOn` (a saved
 * run keeps the setting it started with), outside one `skillsOn()` in `core/skillSwitch.ts`. A function here returns the words whatever the switch says.
 */
import { t } from '@/core/i18n';
import { SP_SKILL_IDS, type RarityId, type SpSkillId, type UnitId } from '../api';
import { PATH_LENGTH } from '../geometry';
import { tilesText } from './lengthText';
import { RARITIES } from './roster';
import { SP_ROWS, SP_START_MERGE, SP_UNIT_OF, spSkillOfUnit, type SpRow, type SpRows } from './spSkills';
import './strings';
import './stringsGame';

/** The numbers (and ready-made distances) a text takes, by placeholder name. */
export type SpArgs = Record<string, string | number>;

const EPS = 1e-9;
const pct = (v: number): number => Math.round(v * 100);
/** Seconds and multipliers to one decimal: 1.219 -> 1.2, 5 -> 5 (so a text never says "5.0"). */
const dec = (v: number): number => Math.round(v * 10) / 10;

/** The name of a rank by its number (1 = Kitten ... 5 = Guardian), in the current language. */
function rankWord(rank: number): string {
  return t(`rarity.${RARITIES[rank - 1] as RarityId}`);
}

/**
 * What each line quotes, read from the row's own cells. A distance is given in tiles (`tilesText`, as the passives do), a share in per cent, a time
 * in seconds. `lap`'s time and `cloud`'s count are worked out the way the simulation works them out (`lap.ts`: `(PATH_LENGTH + extra) / speed`;
 * `cloud.ts`: `floor(life / every)`).
 */
const ARGS: { [K in SpSkillId]: (row: SpRows[K]) => SpArgs } = {
  shove: (r) => ({ push: tilesText(r.push) }),
  cut: (r) => ({ span: tilesText(2 * r.half), max: r.max, fuse: dec(r.fuse) }),
  charge: (r) => ({ dist: tilesText(r.dist) }),
  clones: (r) => ({ clones: r.clones, throws: r.throws }),
  wanted: (r) => ({ bite: pct(r.bite), pool: pct(r.pool) }),
  lap: (r) => ({ sec: dec((PATH_LENGTH + r.extra) / r.speed) }),
  cloud: (r) => ({ life: dec(r.life), bolts: Math.floor(r.life / r.every + EPS) }),
  knock: (r) => ({ radius: tilesText(r.radius), slowed: dec(r.slowed), frozen: dec(r.frozen) }),
  meteor: (r) => ({ warn: dec(r.warn), outer: tilesText(r.outer.radius), crater: dec(r.crater.life) }),
  jam: (r) => ({ notes: r.targets, fill: pct(r.fill) }),
  // the flasks in all: the big one and the small ones that fly with it (with no big one `withoutBig` small ones fly: the same number)
  fish: (r) => ({ flasks: r.big + r.smallTargets.withBig, boss: dec(r.fishTime.boss), elite: dec(r.fishTime.elite), bounty: r.bounty }),
  capsule: (r) => ({ fish: r.fish, purr: r.purr, guardian: rankWord(RARITIES.length) }),
};

/** The arguments of a line, built from the cells of `row` (any row of the shape: a test can hand in a retuned copy). */
export function spArgsOfRow(row: SpRow): SpArgs {
  return (ARGS[row.id] as (row: SpRow) => SpArgs)(row);
}

/** The arguments of a skill's line, from its row as it is NOW (not cached: a retuned row changes the text). */
export function spArgs(id: SpSkillId): SpArgs {
  return spArgsOfRow(SP_ROWS[id]);
}

/** The key of a skill's line. */
export function spDescKey(id: SpSkillId): string {
  return `sp.${id}.desc`;
}

/** Everything the places that tell the player need for one skill, in the current language. */
export interface SpTexts {
  id: SpSkillId;
  /** "스킬" / "Skill". */
  label: string;
  /** The skill's name ("방패 밀치기"). */
  name: string;
  /** The skill's one line, with its numbers. */
  desc: string;
  /** "12초마다" / "every 12 s". */
  cooldown: string;
  /** "저절로 써요" / "casts itself". */
  auto: string;
  /** "골목대장 스킬" / "Alley Boss skill": the rank it comes with. */
  rank: string;
  /** "스킬 · 방패 밀치기": the head of a bubble or a tooltip. */
  head: string;
  /** "12초마다 · 저절로 써요": the small line under the name on the cat screen's card. */
  meta: string;
  /** What the selection sheet's bubble and the 3-pick tooltip add after the passive line, one under the other: the head, the small line (how often, that it casts itself) and the one line. */
  bubble: string;
}

/** The words of one skill. */
export function spTexts(id: SpSkillId): SpTexts {
  const row = SP_ROWS[id];
  const label = t('sp.label.skill');
  const name = t(row.nameKey);
  const cooldown = t('sp.cooldown', { s: dec(row.cooldown) });
  const auto = t('sp.auto');
  const meta = `${cooldown} · ${auto}`;
  const head = `${label} · ${name}`;
  const desc = t(spDescKey(id), spArgsOfRow(row));
  return {
    id,
    label,
    name,
    desc,
    cooldown,
    auto,
    rank: t('sp.rank', { rank: rankWord(row.rank) }),
    head,
    meta,
    bubble: `${head}\n${meta}\n${desc}`,
  };
}

/** The words of the skill a cat has, or null for a cat with none (or whose skill is not built). */
export function spTextsOfUnit(unit: UnitId): SpTexts | null {
  const row = spSkillOfUnit(unit);
  return row ? spTexts(row.id) : null;
}

/** The first rank (3 = Alley Boss) at which a cat has a skill, from the rows that are built. */
function firstRank(): number {
  const ranks = SP_SKILL_IDS.map((id) => SP_ROWS[id]).filter((row) => row.built).map((row) => row.rank);
  return ranks.length > 0 ? Math.min(...ranks) : 3;
}

/** "골목대장부터 스킬이 생겨요" / "Gets a skill at Alley Boss": for a cat whose rank is below the first with a skill. */
export function spLaterText(): string {
  return t('sp.later', { rank: rankWord(firstRank()) });
}

/**
 * The numbers of the guide topic `sp_skill` (`guide.sp_skill.full`): `rank` the first rank with a skill, `below` the ranks under it ("꼬마 · 동네"),
 * `merge` the share of a ring a merged cat starts with, `cosmo` the name of the cat whose meteor falls on the laser's dot.
 */
export function spGuideFacts(): SpArgs {
  const first = firstRank();
  return {
    rank: rankWord(first),
    below: RARITIES.slice(0, first - 1).map((_, i) => rankWord(i + 1)).join(' · '),
    merge: pct(SP_START_MERGE),
    cosmo: t(`unit.${SP_UNIT_OF.meteor}.name`),
  };
}
