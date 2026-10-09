/**
 * The numbers the codex's board-cell pages quote, read from the data tables when a text is built: the sunbeam's bonus, how long a wet or
 * zapped cell lasts, what the three position toys give, how far the bard's and the bell's help reaches, and the lane's own figures.
 */
import { t } from '@/core/i18n';
import {
  DODGE_CAP, ENEMY_CAP, HAZARD_BLOCK_SIDE, HAZARD_RECOVER, HAZARD_WARNING, OVERFLOW_GRACE, SUN_CELLS, SUN_SPEED,
} from '@/game/data/balance';
import { BOSS_SPECS, ENEMY_SPECS } from '@/game/data/enemies';
import { relicDef, relicSpec } from '@/game/data/relics';
import { stakeRules } from '@/game/data/stakes';
import { auraScale, unitSpec } from '@/game/data/units';
import { CELL_COUNT, COLS, ROWS, PATH_LENGTH, auraCells, isEdgeCell, neighbors4 } from '@/game/geometry';
import { MIDDLE_CELL, type CellKind } from './boards';

export type Facts = Record<string, string | number>;

const pct = (v: number): number => Math.round(v * 100);
/** A percentage with at most one decimal (a bard's 22.5). */
const pct1 = (v: number): number => Math.round(v * 1000) / 10;

/** The kinds of the page's sections, in order. */
export const CELL_GROUPS: ReadonlyArray<{ id: 'basic' | 'danger' | 'toy' | 'aura' | 'lane'; kinds: readonly CellKind[] }> = [
  { id: 'basic', kinds: ['plain', 'sun'] },
  { id: 'danger', kinds: ['wet', 'zap'] },
  { id: 'toy', kinds: ['tower', 'perch', 'cushion'] },
  { id: 'aura', kinds: ['bard', 'bell'] },
  { id: 'lane', kinds: ['lane'] },
];

function ringCells(): number {
  let n = 0;
  for (let c = 0; c < CELL_COUNT; c++) if (isEdgeCell(c)) n++;
  return n;
}

/** The chance a bell kitten's dodge comes to at `level` (its level-7 team perk raises it), percent. */
export function bellDodgePct(level: number): number {
  const spec = unitSpec('t_bell');
  return pct(Math.min(DODGE_CAP, (spec.aura.dodge ?? 0) * auraScale(spec, level)));
}

/** The level a team effect first grows at (a bell's and a bard's level-7 perk). */
function auraLevel(unit: 't_bell' | 't_bard'): number {
  return unitSpec(unit).perks.find((p) => p.key === 'aura')?.level ?? 0;
}

const MAX_LEVEL = 10;

/** The numbers of one kind's text, with the names of the things it mentions in the current language. */
export function cellFacts(kind: CellKind): Facts {
  switch (kind) {
    case 'plain':
      return { cells: CELL_COUNT, cols: COLS, rows: ROWS };
    case 'sun':
      return {
        cells: SUN_CELLS, speed: pct(SUN_SPEED), toy: t(relicDef('sunny_spot').nameKey), toyCells: relicSpec('sunny_spot').fx.sunCells ?? 0,
        toySpeed: pct(relicSpec('sunny_spot').fx.sunSpeed ?? 0),
      };
    case 'wet': {
      const spray = ENEMY_SPECS.spray.hazardPulse;
      return {
        warn: HAZARD_WARNING, spray: t(ENEMY_SPECS.spray.nameKey), sprayEvery: spray?.every ?? 0, sprayDur: spray?.duration ?? 0, sprayCells: spray?.cells ?? 0,
        bath: t(ENEMY_SPECS.boss_bath.nameKey), soakEvery: BOSS_SPECS.splash.soakEvery, soakCells: BOSS_SPECS.splash.soakCells, soakDur: BOSS_SPECS.splash.soakDuration,
        recover: HAZARD_RECOVER, bell: t('unit.t_bell.name'), dodge: bellDodgePct(1),
      };
    }
    case 'zap':
      return {
        warn: HAZARD_WARNING, cloud: t(ENEMY_SPECS.boss_cloud.nameKey), every: BOSS_SPECS.lightning.cooldown, dur: BOSS_SPECS.lightning.duration, side: HAZARD_BLOCK_SIDE,
        recover: HAZARD_RECOVER, bell: t('unit.t_bell.name'), dodge: bellDodgePct(1),
      };
    case 'tower':
      return {
        toy: t(relicDef('cat_tower').nameKey), range: pct(relicSpec('cat_tower').fx.topRowRange ?? 0), damage: pct(relicSpec('cat_tower').fx.topRowDamage ?? 0), cells: COLS,
      };
    case 'perch':
      return { toy: t(relicDef('window_perch').nameKey), speed: pct(relicSpec('window_perch').fx.edgeSpeed ?? 0), cells: ringCells() };
    case 'cushion':
      return {
        toy: t(relicDef('kneading_cushion').nameKey), damage: pct(relicSpec('kneading_cushion').fx.sameClassNeighbourDamage ?? 0), sides: neighbors4(MIDDLE_CELL).length,
      };
    case 'bard': {
      const spec = unitSpec('t_bard');
      return {
        cat: t('unit.t_bard.name'), damage: pct(spec.aura.neighbourDamage ?? 0), max: pct1((spec.aura.neighbourDamage ?? 0) * auraScale(spec, MAX_LEVEL)),
        cells: auraCells(MIDDLE_CELL, [], spec.aura.reach ?? 1).length, level: auraLevel('t_bard'),
      };
    }
    case 'bell': {
      const spec = unitSpec('t_bell');
      return {
        cat: t('unit.t_bell.name'), speed: pct(spec.aura.neighbourSpeed ?? 0), dodge: bellDodgePct(1), dodgeMax: bellDodgePct(MAX_LEVEL),
        cells: auraCells(MIDDLE_CELL, [], spec.aura.reach ?? 1).length, level: auraLevel('t_bell'),
      };
    }
    case 'lane':
      return {
        cap: ENEMY_CAP, grace: OVERFLOW_GRACE, low: ENEMY_CAP - stakeRules(1).enemyCapCut, lap: Math.round(PATH_LENGTH / ENEMY_SPECS.cucumber.speed), ring: ringCells(),
        cucumber: t(ENEMY_SPECS.cucumber.nameKey),
      };
  }
}
