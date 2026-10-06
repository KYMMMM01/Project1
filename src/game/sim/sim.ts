/**
 * The battle object. State lives here; the rules live in the sibling modules, which take the Sim as
 * their first argument. Nothing in the simulation touches Math.random, Date or the DOM.
 */
import type { Emitter } from '@/core/events';
import {
  CLASS_IDS, UNIT_IDS,
  type BattleApi, type BattleEvents, type BattleInit, type BattlePhase, type BattleSnapshot, type ClassId, type DropAction,
  type EnemyId, type Fail, type HazardState, type LaserState, type OddsRow, type PendingChoice, type PityInfo, type RarityId, type RelicId,
  type RunStats, type UnitId, type WaveKind, type WavePreviewEntry,
} from '../api';
import {
  CELL_COUNT,
} from '../geometry';
import {
  CHAPTER_COUNT, CHAPTER_HP_MULT, CHAPTER_WAVES, DAILY_UNIT_LEVEL, DAILY_WAVES, ENEMY_CAP, LASER_RADIUS, MAX_TICKS_PER_STEP,
  MOLT_COST, MOLT_LIMIT, NORMAL_WAVE_TIME, OFFER_EVERY, OVERFLOW_GRACE, PREP_TIME, START_FISH, TICK, TUTORIAL_HP_MULT,
  TUTORIAL_WAVES, TUTORIAL_WAVE_TIME, AWAKEN_COST, hpIndex, specialHp,
} from '../data/balance';
import { synergyTier } from '../data/classes';
import { budgetMult } from '../data/enemies';
import { modifierSpec } from '../data/modifiers';
import { BASE_UNIT_IDS } from '../data/roster';
import { stakeRules } from '../data/stakes';
import { trainingBonus } from '../data/training';
import type { ModifierSpec, RelicFx, StakeRules, SynergyTier } from '../data/types';
import { actOf, scriptFor, waveEntries, waveKindOf } from '../data/waves';
import {
  awakenCheck, classOwned, classUpgradeCostOf, cmdAwaken, cmdDrop, cmdMolt, cmdPickSummon, cmdSell, cmdSummon,
  cmdUpgradeClass, cmdUpgradeSummon, dropActionOf, makeUnit, oddsRows, pityOf, recomputeStats, refresh, sellValueOf,
  summonCostOf, summonGradeCostOf,
} from './board';
import { updateBoss } from './boss';
import { cmdSetLaser, refreshLaser, updateLaser, updateProjectiles, updateRelics, updateUnits, updateZones } from './combat';
import { BattleEmitter } from './emitter';
import { updateEnemies } from './enemies';
import {
  buildStats, callBonusOf, canReviveNow, cmdCallNext, cmdPickRelic, cmdRerollRelics, cmdRevive, initSun, markSun, rebuildFx, startWave,
  targetKilled, updateAlarms, updateWave,
} from './flow';
import { updateHazards } from './hazards';
import type { LuckTotals } from './odds';
import type { SnapData } from './snapshot';
import { Streams } from './streams';
import type { HazardBatch, SimEnemy, SimProjectile, SimUnit, SimZone } from './types';

const TUTORIAL_SCRIPT: readonly UnitId[] = ['w_paw', 'w_paw', 'r_sling'];

function clampInt(v: number, lo: number, hi: number): number {
  const n = Math.floor(Number.isFinite(v) ? v : lo);
  return n < lo ? lo : n > hi ? hi : n;
}

export class Sim implements BattleApi {
  // ── contract state ──
  readonly init: BattleInit;
  readonly events: Emitter<BattleEvents>;
  readonly ev: BattleEmitter = new BattleEmitter();
  phase: BattlePhase = 'prep';
  pending: PendingChoice | null = null;
  readonly units: (SimUnit | null)[] = new Array<SimUnit | null>(CELL_COUNT).fill(null);
  readonly enemies: SimEnemy[] = [];
  readonly projectiles: SimProjectile[] = [];
  readonly zones: SimZone[] = [];
  readonly hazards: HazardState[] = [];
  readonly sunbeams: number[] = [];
  readonly laser: LaserState = {
    active: false, x: 0, y: 0, timeLeft: 0, duration: 0, cooldown: 0, cooldownTotal: 0, radius: LASER_RADIUS,
  };
  readonly relics: RelicId[] = [];
  fish = 0;
  purr = 0;
  wave = 0;
  readonly totalWaves: number;
  act = 1;
  waveKind: WaveKind = 'normal';
  waveTime = 0;
  waveDuration = 0;
  prepTime = PREP_TIME;
  enemyCap = ENEMY_CAP;
  overflowTime = 0;
  overflowLimit = OVERFLOW_GRACE;
  boss: SimEnemy | null = null;
  time = 0;
  get enemyCount(): number {
    return this.enemies.length;
  }

  // ── configuration derived from the init ──
  readonly mode: BattleInit['mode'];
  readonly chapter: number;
  readonly stake: number;
  readonly endless: boolean;
  readonly scriptChapter: number;
  readonly rules: StakeRules;
  readonly mods: ModifierSpec[];
  readonly levels: Partial<Record<UnitId, number>>;
  readonly relicPool: RelicId[];
  readonly allowedClasses: ClassId[];
  readonly unitIds: readonly UnitId[] = UNIT_IDS;
  readonly fishMult: number;
  readonly hpMult: number;
  readonly hpChapterMult: number;
  readonly countMult: number;
  readonly epicBoost: number;
  readonly costMultPermille: number;
  readonly normalWaveTime: number;
  readonly modDamage: number;
  readonly modSunExtra: number;
  readonly modLaserCooldown: number;
  readonly relicChoices: number;
  readonly relicPicks: number;
  readonly trainDamage: number;
  readonly trainBossTime: number;
  readonly trainLaserCut: number;
  readonly trainKillFish: number;
  readonly firstSummonRarePlus: boolean;
  readonly offerEvery: number;
  readonly snapshotEnabled: boolean;
  readonly rng: Streams;

  // ── run state ──
  fx: RelicFx = {};
  fishFrac = 0;
  tickCount = 0;
  private acc = 0;
  resumePhase: 'prep' | 'wave' = 'prep';
  statsDirty = false;
  lastSnapshot: BattleSnapshot | null = null;
  readonly sunCell = new Uint8Array(CELL_COUNT);
  readonly hazardCount = new Uint8Array(CELL_COUNT);
  readonly hazardBatches: HazardBatch[] = [];
  readonly tierData: SynergyTier[] = Array.from({ length: 4 }, () => ({ ...synergyTier('warrior', 0) }));
  readonly tier = new Uint8Array(CLASS_IDS.length);
  readonly distinct = new Uint8Array(CLASS_IDS.length);
  readonly classLevels: number[] = [0, 0, 0, 0];
  grade = 0;
  paidSummons = 0;
  epicDry = 0;
  molts = 0;
  merges = 0;
  awakenings = 0;
  summonedUnits = 0;
  bestRarity = 0;
  kills = 0;
  bossesKilled = 0;
  wavesCleared = 0;
  peakEnemies = 0;
  revived = false;
  rescueUsed = false;
  lossReason: 'overrun' | 'boss_timeout' | null = null;
  reviveGrace = 0;
  dangerLevel = 0;
  freeRerolls = 0;
  paidRerollUsed = false;
  offerAct = 1;
  tutorialFree = 0;
  readonly tutorialScript: readonly UnitId[] = TUTORIAL_SCRIPT;
  tutorialOffer = false;
  /** The open pick-one-of-three was paid for (the tutorial's scripted one was not). */
  offerCountsForPity = false;
  readonly luck: LuckTotals = { score: 0, mean: 0, variance: 0 };
  readonly oddsBuf: number[] = [0, 0, 0, 0];
  readonly damageByUnit: number[] = new Array<number>(UNIT_IDS.length).fill(0);
  uidUnit = 0;
  uidEnemy = 0;
  uidProj = 0;
  uidZone = 0;
  readonly projPool: SimProjectile[] = [];
  readonly zonePool: SimZone[] = [];
  stamp = 0;
  auraCount = 0;
  chefFish = 0;
  feederAt = 0;
  starAt = 0;

  // ── wave machine ──
  stage: 'run' | 'clearing' | 'between' = 'run';
  stageTimer = 0;
  waveClock = 0;
  bossSpawned = false;
  readonly spawnIds: EnemyId[] = [];
  readonly spawnTimes: number[] = [];
  spawnIdx = 0;

  // ── boss abilities ──
  abilityAt = 0;
  abilityAt2 = 0;
  inhaleUntil = 0;
  inhaleTaken = 0.5;
  whirlUntil = 0;
  whirlSpeed = 0;
  vaccinateUntil = 0;

  readonly onTargetKilled = (e: SimEnemy): void => targetKilled(this, e);

  constructor(init: BattleInit, snap: SnapData | null) {
    this.init = init;
    this.events = this.ev;
    this.mode = init.mode;
    this.chapter = clampInt(init.chapter, 1, CHAPTER_COUNT);
    this.stake = clampInt(init.stake, 0, 5);
    this.endless = init.mode === 'endless';
    this.scriptChapter = init.mode === 'tutorial' ? 1 : this.chapter;
    this.totalWaves = init.mode === 'tutorial' ? TUTORIAL_WAVES : init.mode === 'daily' ? DAILY_WAVES : this.endless ? 0 : CHAPTER_WAVES;
    this.rules = stakeRules(this.stake);
    this.rng = new Streams(init.seed);

    const daily = init.mode === 'daily';
    const train = trainingBonus(daily ? {} : init.loadout.training);
    this.levels = daily ? Object.fromEntries(BASE_UNIT_IDS.map((id) => [id, DAILY_UNIT_LEVEL])) : init.loadout.unitLevels;
    this.relicPool = init.loadout.relicPool.slice();
    this.mods = [...new Set(init.modifiers ?? [])].map(modifierSpec);

    let fishMult = 1;
    let countMult = 1;
    let hpMod = 1;
    let costMult = this.rules.summonCostMult;
    let cap = ENEMY_CAP - this.rules.enemyCapCut;
    let waveTime = init.mode === 'tutorial' ? TUTORIAL_WAVE_TIME : NORMAL_WAVE_TIME;
    let epic = 0;
    let damage = 0;
    let picks = 1;
    let sun = 0;
    let laserCd = 0;
    const banned = new Set<ClassId>();
    for (const m of this.mods) {
      fishMult *= m.fishMult ?? 1;
      countMult *= m.countMult ?? 1;
      hpMod *= m.hpMult ?? 1;
      costMult *= m.summonCostMult ?? 1;
      if (m.enemyCap !== undefined) cap = Math.min(cap, m.enemyCap);
      if (m.normalWaveTime !== undefined) waveTime = Math.min(waveTime, m.normalWaveTime);
      epic += m.epicBonus ?? 0;
      damage += m.damageBonus ?? 0;
      picks = Math.max(picks, m.relicPicks ?? 1);
      sun = Math.max(sun, (m.sunCells ?? 0) - 4);
      if (m.laserCooldown !== undefined) laserCd = laserCd > 0 ? Math.min(laserCd, m.laserCooldown) : m.laserCooldown;
      if (m.banClass) banned.add(m.banClass);
    }
    this.fishMult = fishMult;
    this.countMult = countMult;
    this.epicBoost = epic;
    this.modDamage = damage;
    this.relicPicks = picks;
    this.modSunExtra = sun;
    this.modLaserCooldown = laserCd;
    this.normalWaveTime = waveTime;
    this.costMultPermille = Math.round(costMult * 1000);
    this.enemyCap = cap + train.enemyCap;
    this.relicChoices = this.rules.relicChoices;
    this.hpChapterMult = (CHAPTER_HP_MULT[this.chapter - 1] as number) * (init.mode === 'tutorial' ? TUTORIAL_HP_MULT : 1);
    this.hpMult = this.hpChapterMult * hpMod;
    this.allowedClasses = CLASS_IDS.filter((c) => !banned.has(c));
    this.trainDamage = train.damage;
    this.trainBossTime = train.bossTime;
    this.trainLaserCut = train.laserCooldownCut;
    this.trainKillFish = train.killFish;
    this.firstSummonRarePlus = init.firstSummonRarePlus === true;
    this.offerEvery = init.mode === 'tutorial' ? 0 : OFFER_EVERY;
    this.snapshotEnabled = !daily;

    this.fish = START_FISH + train.startFish + (init.bonusFish ?? 0);
    this.purr = train.startPurr + (init.bonusPurr ?? 0);
    this.tutorialFree = init.mode === 'tutorial' ? TUTORIAL_SCRIPT.length : 0;
    this.tutorialOffer = init.mode === 'tutorial';
    this.freeRerolls = this.rules.freeRerolls;
    this.paidRerollUsed = daily;

    if (snap) this.restore(snap);
    else initSun(this);
    rebuildFx(this);
    this.feederAt = this.time + (this.fx.feederEvery ?? 0);
    this.starAt = this.time + (this.fx.starEvery ?? 0);
    refreshLaser(this);
    this.laser.cooldown = 0;
    refresh(this);
  }

  /** Puts the wave-start save back: the run waits in prep with an empty field, then starts that wave. */
  private restore(d: SnapData): void {
    this.time = d.time;
    this.fish = d.fish;
    this.fishFrac = d.fishFrac;
    this.purr = d.purr;
    this.relics.push(...d.relics);
    for (let c = 0; c < CELL_COUNT; c++) {
      const id = d.units[c];
      if (id) {
        const u = makeUnit(this, id, c, 0.5);
        this.units[c] = u;
      }
    }
    this.classLevels.splice(0, 4, ...d.classLevels);
    this.grade = d.summonGrade;
    this.paidSummons = d.paidSummons;
    this.epicDry = d.epicDry;
    this.molts = d.molts;
    this.revived = d.revived;
    this.rescueUsed = d.rescueUsed;
    this.freeRerolls = d.freeRerolls;
    this.paidRerollUsed = d.paidRerollUsed;
    this.tutorialFree = d.tutorialFree;
    this.tutorialOffer = d.tutorialOffer;
    this.rng.restore(d.rng);
    markSun(this, d.sun);
    const st = d.stats;
    this.kills = st.kills;
    this.bossesKilled = st.bossesKilled;
    this.summonedUnits = st.summoned;
    this.merges = st.merges;
    this.awakenings = st.awakenings;
    this.wavesCleared = st.wavesCleared;
    this.peakEnemies = st.peak;
    this.bestRarity = st.bestRarity;
    this.damageByUnit.splice(0, this.damageByUnit.length, ...st.damage);
    this.luck.score = st.luck.score;
    this.luck.mean = st.luck.mean;
    this.luck.variance = st.luck.variance;
    this.wave = d.wave - 1;
    this.act = actOf(Math.max(1, this.wave));
    this.waveKind = waveKindOf(Math.max(1, this.wave));
  }

  get killFishBonus(): number {
    return this.trainKillFish + (this.fx.killFish ?? 0);
  }

  /** Health of one cucumber of the wave being spawned, with the chapter and daily multipliers. */
  baseHp(): number {
    return hpIndex(this.wave) * this.hpMult;
  }

  /** Total health the wave spawns (children of splitters and the elite or boss included), for balance tools. */
  waveHealth(wave: number): number {
    const script = scriptFor(this.scriptChapter, wave);
    const base = hpIndex(wave) * this.hpMult;
    let total = 0;
    const entries = waveEntries(script, this.countMult);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i] as WavePreviewEntry;
      if (i === 0 && script.boss) {
        total += specialHp(script.kind === 'boss' ? 'boss' : 'elite', Math.floor((wave - 1) / 8)) * this.hpChapterMult * this.rules.specialHpMult;
      } else {
        total += e.count * budgetMult(e.enemy) * base;
      }
    }
    return total;
  }

  /** Forget "nothing in range" results: something new may be in reach (a spawn, a moved laser). */
  wakeUnits(): void {
    for (let c = 0; c < CELL_COUNT; c++) {
      const u = this.units[c];
      if (u) u.searchAfter = 0;
    }
  }

  // ── driving ──

  step(dt: number): void {
    if (this.phase !== 'prep' && this.phase !== 'wave') return;
    if (!(dt > 0)) return;
    this.acc += dt;
    let n = 0;
    while (this.acc >= TICK - 1e-9) {
      if (n === MAX_TICKS_PER_STEP) {
        this.acc = 0;
        break;
      }
      this.acc -= TICK;
      n++;
      this.tick();
      if (this.phase !== 'prep' && this.phase !== 'wave') {
        this.acc = 0;
        break;
      }
    }
    if (this.acc < 0) this.acc = 0;
  }

  private tick(): void {
    this.time += TICK;
    this.tickCount++;
    if (this.statsDirty) {
      recomputeStats(this);
      this.statsDirty = false;
    }
    if (this.phase === 'prep') {
      if (this.mode === 'tutorial' && this.summonedUnits === 0) return;
      this.prepTime -= TICK;
      if (this.prepTime <= 0) {
        this.prepTime = 0;
        startWave(this, this.wave + 1);
      }
      return;
    }
    updateRelics(this);
    updateLaser(this);
    updateHazards(this);
    updateBoss(this);
    updateEnemies(this);
    updateUnits(this);
    updateProjectiles(this);
    updateZones(this);
    updateWave(this);
    if (this.phase === 'wave') updateAlarms(this);
  }

  // ── commands ──

  summon(): Fail | null {
    return cmdSummon(this);
  }

  pickSummon(index: number): Fail | null {
    return cmdPickSummon(this, index);
  }

  drop(from: number, to: number): Fail | null {
    return cmdDrop(this, from, to);
  }

  sell(cell: number): Fail | null {
    return cmdSell(this, cell);
  }

  molt(cell: number, classId: ClassId): Fail | null {
    return cmdMolt(this, cell, classId);
  }

  awaken(cell: number): Fail | null {
    return cmdAwaken(this, cell);
  }

  upgradeClass(classId: ClassId): Fail | null {
    return cmdUpgradeClass(this, classId);
  }

  upgradeSummon(): Fail | null {
    return cmdUpgradeSummon(this);
  }

  setLaser(x: number, y: number): Fail | null {
    return cmdSetLaser(this, x, y);
  }

  callNextWave(): Fail | null {
    return cmdCallNext(this);
  }

  pickRelic(index: number): Fail | null {
    return cmdPickRelic(this, index);
  }

  rerollRelics(paid: boolean): Fail | null {
    return cmdRerollRelics(this, paid);
  }

  revive(): Fail | null {
    return cmdRevive(this);
  }

  abandon(): void {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.phase = 'lost';
    this.lossReason = null;
    this.pending = null;
  }

  // ── queries ──

  dropAction(from: number, to: number): DropAction {
    return dropActionOf(this, from, to);
  }

  summonCost(): number {
    return summonCostOf(this);
  }

  summonOdds(): OddsRow<RarityId>[] {
    return oddsRows(this);
  }

  pity(): PityInfo {
    return pityOf(this);
  }

  summonOfferProgress(): { count: number; every: number } {
    return this.offerEvery === 0 ? { count: 0, every: 0 } : { count: this.paidSummons % this.offerEvery, every: this.offerEvery };
  }

  classDistinct(classId: ClassId): number {
    return this.distinct[CLASS_IDS.indexOf(classId)] as number;
  }

  classOwned(classId: ClassId): boolean[] {
    return classOwned(this, classId);
  }

  synergyTier(classId: ClassId): number {
    return this.tier[CLASS_IDS.indexOf(classId)] as number;
  }

  classUpgradeLevel(classId: ClassId): number {
    return this.classLevels[CLASS_IDS.indexOf(classId)] as number;
  }

  classUpgradeCost(classId: ClassId): number {
    return classUpgradeCostOf(this, classId);
  }

  summonGrade(): number {
    return this.grade;
  }

  summonGradeCost(): number {
    return summonGradeCostOf(this);
  }

  moltCost(): number {
    return MOLT_COST;
  }

  moltsLeft(): number {
    return MOLT_LIMIT - this.molts;
  }

  awakenCost(): number {
    return AWAKEN_COST;
  }

  canAwaken(cell: number): Fail | null {
    return awakenCheck(this, cell);
  }

  sellValue(cell: number): { fish: number; purr: number } {
    return sellValueOf(this, cell);
  }

  callBonus(): number {
    return callBonusOf(this);
  }

  previewWave(wave?: number): WavePreviewEntry[] {
    const w = wave ?? this.wave + 1;
    if (w < 1 || (!this.endless && w > this.totalWaves)) return [];
    return waveEntries(scriptFor(this.scriptChapter, w), this.countMult);
  }

  canRevive(): boolean {
    return canReviveNow(this);
  }

  getStats(): RunStats {
    return buildStats(this);
  }

  snapshot(): BattleSnapshot | null {
    return this.snapshotEnabled ? this.lastSnapshot : null;
  }
}

