/**
 * The words of the monster pages: what foes.ts computes, built into the lines a page prints, in the current language. Every figure
 * comes from foes.ts (which reads the data tables); nothing is typed here, so a test can recompute any shown number and compare.
 */
import { t } from '@/core/i18n';
import { ENEMY_SPECS } from '@/game/data/enemies';
import { stakeRules } from '@/game/data/stakes';
import { traitOrder } from '@/view/hud/policy';
import type { ClassId, EnemyId, EnemyTrait, UnitId } from '@/game/api';
import './strings';
import {
  abilitiesOf, appearances, armourBreakers, chapterMult, classesDealing, enrageRule, foeRank, foeStats, healthSpan, limitToy, rageApplies, resistanceOf,
  splitParent, targetRows, tipsOf, type Ability, type FoeRank, type Level, type TargetRow, type Tip,
} from './foes';

export interface Row {
  label: string;
  value: string;
  note?: string;
  /** A defence: the page draws a bar of this share beside the value. */
  bar?: { pct: number; kind: 'armor' | 'ward' };
}

/** A whole number with thousands separators: health is shown to the point, not abbreviated. */
export function exact(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

/** A number with at most one decimal: 3 stays "3", 1.8 stays "1.8". */
export function plain(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** Wave numbers as runs: 1, 2, 3, 4, 7 becomes "1~4, 7". */
export function waveText(waves: readonly number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < waves.length; ) {
    let j = i;
    while (j + 1 < waves.length && (waves[j + 1] as number) === (waves[j] as number) + 1) j++;
    parts.push(j - i >= 2 ? `${waves[i]}~${waves[j]}` : waves.slice(i, j + 1).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

const foeName = (id: EnemyId): string => t(ENEMY_SPECS[id].nameKey);
const unitName = (id: UnitId): string => t(`unit.${id}.name`);
const className = (id: ClassId): string => t(`class.${id}.name`);

// ───────────────────────────── the selector's caption ─────────────────────────────

/** What the chosen chapter and butler level mean for the numbers below: the chapter's health multiple and the stake's cuts. */
export function basisText(level: Level): { head: string; rules: string } {
  const rules = stakeRules(level.stake);
  const parts = [t('codex.basis.mult', { mult: plain(chapterMult(level.chapter)) })];
  if (rules.bossTimeCut > 0) parts.push(t('codex.basis.cut', { cut: rules.bossTimeCut }));
  if (rules.specialHpMult !== 1) parts.push(t('codex.basis.special', { special: plain(rules.specialHpMult) }));
  return { head: t('codex.basis', { n: level.chapter, name: t(`chapter.${level.chapter}.name`), stake: level.stake }), rules: parts.join(' · ') };
}

// ───────────────────────────── the list ─────────────────────────────

export interface FoeItem {
  id: EnemyId;
  rank: FoeRank;
  name: string;
  /** Names of its traits, boss and elite first. */
  traits: string[];
  /** The one line of numbers under the name. */
  line: string;
}

const span = (a: number, b: number, show: (v: number) => string): string => (a === b ? show(a) : `${show(a)}~${show(b)}`);

export function foeItem(id: EnemyId, level: Level): FoeItem {
  const spec = ENEMY_SPECS[id];
  const rank = foeRank(id);
  const stats = foeStats(id);
  const rows = targetRows(id, level);
  let line: string;
  if (rows.length === 0) {
    line = t('codex.row.normal', { hp: plain(stats.hpMult), speed: stats.speed, armor: stats.armorPct, ward: stats.wardPct });
  } else {
    const hps = rows.map((r) => r.hp);
    const limits = rows.map((r) => r.limit);
    const vars = {
      lo: exact(Math.min(...hps)), hi: exact(Math.max(...hps)), limit: span(Math.min(...limits), Math.max(...limits), String), armor: stats.armorPct, ward: stats.wardPct,
    };
    line = t(hps.length > 1 ? 'codex.row.special' : 'codex.row.special.one', vars);
  }
  return { id, rank, name: foeName(id), traits: traitOrder(spec.traits).map((tr) => t(`trait.${tr}.name`)), line };
}

// ───────────────────────────── a page ─────────────────────────────

export interface TraitLine {
  id: EnemyTrait;
  name: string;
  text: string;
}

export interface TargetBlock {
  head: string;
  imagined: boolean;
  /** Health, time limit and damage allowance of this appearance. */
  lines: string[];
}

export interface AbilityLine {
  name: string;
  text: string;
}

export interface SpecialBlock {
  waves: TargetBlock[];
  /** Said once under the waves when the chapter does not bring this enemy. */
  imaginedNote: string | null;
  /** A toy's addition to the time limit. */
  toyNote: string;
  control: Row[];
  rule: string;
  tips: string[];
}

export interface FoePage {
  id: EnemyId;
  rank: FoeRank;
  name: string;
  flavour: string;
  traits: TraitLine[];
  stats: Row[];
  /** Armour and ward in percent, for the page's bars. */
  armorPct: number;
  wardPct: number;
  appears: Row[];
  abilities: AbilityLine[];
  special: SpecialBlock | null;
}

/** A number as it is printed: no float noise (16.650000000000002 reads 16.7). */
function shown(vars: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(vars).map(([key, v]) => [key, plain(v)]));
}

function abilityLine(a: Ability): AbilityLine {
  const vars: Record<string, string | number> = shown(a.vars);
  for (const [key, id] of Object.entries(a.names)) vars[key] = foeName(id);
  return { name: t(`codex.ability.${a.kind}.name`), text: t(`codex.ability.${a.kind}.text`, vars) };
}

function tipText(tip: Tip): string {
  const vars: Record<string, string | number> = shown(tip.vars);
  if (tip.kind === 'armor') {
    vars.breakers = armourBreakers().map(unitName).join('·');
    vars.magic = classesDealing('magic').map(className).join('·');
  } else if (tip.kind === 'ward') {
    vars.physical = classesDealing('physical').map(className).join('·');
  }
  return t(`codex.tip.${tip.kind}`, vars);
}

function targetBlock(row: TargetRow): TargetBlock {
  const limit = row.cut > 0
    ? t('codex.target.limit.cut', { limit: row.limit, base: row.limitBase, cut: row.cut })
    : t('codex.target.limit', { limit: row.limit });
  return {
    head: t(row.imagined ? 'codex.target.imagined' : 'codex.target.head', { wave: row.wave }),
    imagined: row.imagined,
    lines: [
      t('codex.target.hp', { hp: exact(row.hp), times: plain(row.times) }),
      limit,
      t('codex.target.cap', { dps: exact(row.cap.perSecond), min: plain(row.cap.minSeconds) }),
    ],
  };
}

function specialBlock(id: EnemyId, level: Level): SpecialBlock | null {
  const rows = targetRows(id, level);
  const first = rows[0];
  if (!first) return null;
  const res = resistanceOf(id);
  const toy = limitToy();
  const control: Row[] = [
    { label: t('codex.control.slow'), value: t('codex.control.slow.v', { n: res.slowCapPct }) },
    { label: t('codex.control.stun'), value: res.stun === 'none' ? t('codex.control.stun.none') : t('codex.control.stun.half', { n: res.stunPct }) },
    { label: t('codex.control.pull'), value: t('codex.control.pull.v', { n: res.pullPct }) },
  ];
  return {
    waves: rows.map(targetBlock),
    imaginedNote: first.imagined ? t('codex.target.note.imagined') : null,
    toyNote: t('codex.target.toy', { toy: t(`relic.${toy.toy}.name`), seconds: toy.seconds }),
    control,
    rule: t('codex.rule.text', {
      wave: first.wave, limit: first.limit, min: plain(first.cap.minSeconds), frac: Math.round((first.cap.minSeconds / first.limit) * 100),
      per: plain(first.cap.percent), burst: plain(first.cap.burstSeconds),
    }),
    tips: tipsOf(id, level).map(tipText),
  };
}

export function foePage(id: EnemyId, level: Level): FoePage {
  const spec = ENEMY_SPECS[id];
  const rank = foeRank(id);
  const stats = foeStats(id);
  const rows: Row[] = [];
  if (rank === 'normal') {
    rows.push({ label: t('codex.stat.hpMult'), value: t('codex.stat.hpMult.v', { n: plain(stats.hpMult) }) });
    const health = healthSpan(id, level);
    if (!health) rows.push({ label: t('codex.stat.hp'), value: t('codex.stat.hp.none') });
    else {
      const same = health.first.wave === health.last.wave;
      rows.push({
        label: t('codex.stat.hp'),
        value: same ? exact(health.first.hp) : t('codex.stat.hp.range', { lo: exact(health.first.hp), hi: exact(health.last.hp) }),
        ...(same ? {} : { note: t('codex.stat.hp.note', { a: health.first.wave, b: health.last.wave }) }),
      });
    }
  }
  rows.push(
    { label: t('codex.stat.speed'), value: stats.speed === stats.baseSpeed ? String(stats.speed) : t('codex.stat.speed.v', { n: stats.speed, base: stats.baseSpeed }) },
    { label: t('codex.stat.armor'), value: t('codex.stat.pct', { n: stats.armorPct }), bar: { pct: stats.armorPct, kind: 'armor' } },
    { label: t('codex.stat.ward'), value: t('codex.stat.pct', { n: stats.wardPct }), bar: { pct: stats.wardPct, kind: 'ward' } },
    { label: t('codex.stat.reward'), value: stats.purr > 0 ? t('codex.stat.reward.purr', { fish: stats.fish, purr: stats.purr }) : t('codex.stat.reward.fish', { fish: stats.fish }) },
  );
  const parent = splitParent(id);
  const where = appearances(id).map(({ chapter, waves }) => ({
    label: t('codex.appear.row', { n: chapter, name: t(`chapter.${chapter}.name`) }),
    value: t(waves.length === 1 ? 'codex.appear.wave' : 'codex.appear.waves', { waves: waveText(waves) }),
  }));
  const appears: Row[] = where.length > 0 ? where : [{ label: t('codex.page.appears'), value: t('codex.appear.none') }];
  if (parent) appears.unshift({ label: t('codex.page.appears'), value: t('codex.appear.split', { parent: foeName(parent) }) });
  const abilities = abilitiesOf(id).map(abilityLine);
  if (rageApplies(id)) {
    const rage = enrageRule();
    abilities.push({ name: t('codex.ability.rage.name'), text: t('codex.ability.rage.text', { hp: rage.hpPct, pct: rage.shorterPct }) });
  }
  return {
    id, rank, name: foeName(id), flavour: t(spec.descKey),
    traits: traitOrder(spec.traits).map((tr) => ({ id: tr, name: t(`trait.${tr}.name`), text: t(`trait.${tr}.desc`) })),
    stats: rows, armorPct: stats.armorPct, wardPct: stats.wardPct, appears, abilities, special: specialBlock(id, level),
  };
}
