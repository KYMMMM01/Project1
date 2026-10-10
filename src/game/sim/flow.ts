/** Wave and act flow, relic offers, danger and overflow, victory, defeat and revive (rules §2, §3, §13). */
import { type EnemyId, type Fail, type RelicId, type RunStats, type UnitId } from '../api';
import { CELL_COUNT } from '../geometry';
import {
  ACT_FISH_BASE, ACT_FISH_PER_ACT, ACT_LENGTH, BOSS_APPEAR, BOSS_CAP_BURST, BOSS_MIN_KILL, CALL_FISH_MAX, CALL_FISH_PER_SECOND, CLEAR_DELAY, DANGER_ALARM,
  DANGER_CAUTION, ESCORT_WINDOW, NEXT_WAVE_DELAY, REVIVE_BOSS_HP_CUT, REVIVE_BOSS_TIME, REVIVE_CAP_FRACTION, REVIVE_GRACE,
  RELIC_RARITY_WEIGHTS, SPAWN_START, SPAWN_WINDOW, SUN_CELLS, TICK, WAVE_FISH_BASE, WAVE_FISH_PER_WAVE, FIRST_SUN_CELLS,
  specialHp, specialLimit,
} from '../data/balance';
import { COUNTER_RELICS, RELIC_FX_KEYS, relicSpec } from '../data/relics';
import { RARITIES, RELIC_RARITY } from '../data/roster';
import { actFeatures, actOf, scriptFor, waveEntries } from '../data/waves';
import { openSummonOffer, placeRandomCommon, refresh } from './board';
import { startBoss } from './boss';
import { refreshLaser } from './combat';
import { addFish, addPurr, earnFish } from './economy';
import { removeEnemy, spawnEnemy } from './enemies';
import { luckShare } from './odds';
import { captureSnapshot } from './snapshot';
import { TUTORIAL_PICK_WAVE, tutorialWaveStart } from './tutorial';
import type { Sim } from './sim';
import type { SimEnemy } from './types';

// ───────────────────────────── sunbeams ─────────────────────────────

export function markSun(s: Sim, cells: readonly number[]): void {
  s.sunbeams.length = 0;
  s.sunCell.fill(0);
  for (const c of cells) {
    s.sunbeams.push(c);
    s.sunCell[c] = 1;
  }
}

/** Lights `cells` and announces them (the tutorial's sunbeams arrive this way). */
export function revealSun(s: Sim, cells: readonly number[]): void {
  markSun(s, cells);
  announceSun(s);
}

function announceSun(s: Sim): void {
  refresh(s);
  if (s.ev.has('sunbeams')) s.ev.emit('sunbeams', { cells: s.sunbeams.slice() });
}

/** Draws `count` different cells from the sun stream, skipping `taken`. */
function drawCells(s: Sim, count: number, taken: readonly number[]): number[] {
  const pool: number[] = [];
  for (let c = 0; c < CELL_COUNT; c++) if (!taken.includes(c)) pool.push(c);
  const out: number[] = [];
  for (let k = 0; k < count && k < pool.length; k++) {
    const j = k + Math.floor(s.rng.sun.next() * (pool.length - k));
    const tmp = pool[k] as number;
    pool[k] = pool[j] as number;
    pool[j] = tmp;
    out.push(pool[k] as number);
  }
  return out;
}

function sunCountOf(s: Sim): number {
  return SUN_CELLS + (s.fx.sunCells ?? 0) + s.modSunExtra;
}

export function initSun(s: Sim): void {
  const extra = sunCountOf(s) - FIRST_SUN_CELLS.length;
  markSun(s, [...FIRST_SUN_CELLS, ...(extra > 0 ? drawCells(s, extra, FIRST_SUN_CELLS) : [])]);
}

function rerollSun(s: Sim): void {
  markSun(s, drawCells(s, sunCountOf(s), []));
  announceSun(s);
}

// ───────────────────────────── relics ─────────────────────────────

export function rebuildFx(s: Sim): void {
  for (const k of RELIC_FX_KEYS) s.fx[k] = 0;
  for (const id of s.relics) {
    const fx = relicSpec(id).fx;
    for (const k of RELIC_FX_KEYS) {
      const v = fx[k];
      if (v !== undefined) s.fx[k] = (s.fx[k] ?? 0) + v;
    }
  }
}

export function gainRelic(s: Sim, id: RelicId): void {
  const before = sunCountOf(s);
  s.relics.push(id);
  rebuildFx(s);
  const fx = relicSpec(id).fx;
  if (fx.instantFish) addFish(s, fx.instantFish, 'relic');
  if (fx.feederEvery) s.feederAt = s.time + fx.feederEvery;
  if (fx.starEvery) s.starAt = s.time + fx.starEvery;
  if (fx.laserDuration || fx.laserCooldownCut) refreshLaser(s);
  if (fx.sunCells) {
    const added = sunCountOf(s) - before;
    const next = [...s.sunbeams, ...drawCells(s, added, s.sunbeams)];
    markSun(s, next);
    announceSun(s);
  } else {
    refresh(s);
  }
  if (s.ev.has('relicGain')) s.ev.emit('relicGain', { relic: id });
}

function rarityRow(act: number): readonly number[] {
  return RELIC_RARITY_WEIGHTS[act <= 2 ? 0 : act <= 4 ? 1 : 2] as readonly number[];
}

/** Draws a relic offer for the shop after `act` was cleared. `avoid` are the ones on the table now (reroll). */
function rollRelicOffer(s: Sim, act: number, avoid: readonly RelicId[]): RelicId[] {
  const rng = s.rng.toy;
  const owned = new Set<RelicId>(s.relics);
  let pool = s.relicPool.filter((r) => !owned.has(r));
  const count = s.relicChoices;
  if (avoid.length > 0 && pool.filter((r) => !avoid.includes(r)).length >= count) pool = pool.filter((r) => !avoid.includes(r));
  const picks: RelicId[] = [];

  const counters: RelicId[] = [];
  for (const feature of actFeatures(s.scriptChapter, act + 1)) {
    for (const r of COUNTER_RELICS[feature] ?? []) if (pool.includes(r) && !counters.includes(r)) counters.push(r);
  }
  if (counters.length > 0 && count > 1) picks.push(rng.pick(counters));

  const byRarity: RelicId[][] = [[], [], [], []];
  for (const r of pool) if (!picks.includes(r)) byRarity[RARITIES.indexOf(RELIC_RARITY[r])]?.push(r);
  const row = rarityRow(act);
  while (picks.length < count) {
    let weights = row.map((w, i) => ((byRarity[i] as RelicId[]).length > 0 ? w : 0));
    if (weights.every((w) => w <= 0)) weights = byRarity.map((l) => l.length);
    const r = rng.weighted(weights);
    if (r < 0) break;
    const list = byRarity[r] as RelicId[];
    const at = Math.floor(rng.next() * list.length);
    picks.push(list[at] as RelicId);
    list.splice(at, 1);
  }
  return rng.shuffle(picks);
}

function openRelicOffer(s: Sim, act: number): boolean {
  const options = rollRelicOffer(s, act, []);
  if (options.length === 0) return false;
  s.offerAct = act;
  s.pending = { kind: 'relic', options, freeRerolls: s.freeRerolls, paidRerollUsed: s.paidRerollUsed, picksLeft: s.relicPicks };
  s.phase = 'choice';
  s.resumePhase = 'wave';
  if (s.ev.has('relicOffer')) s.ev.emit('relicOffer', { options, freeRerolls: s.freeRerolls, picksLeft: s.relicPicks });
  return true;
}

export function cmdPickRelic(s: Sim, index: number): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  const pending = s.pending;
  if (s.phase !== 'choice' || !pending || pending.kind !== 'relic') return 'not_available';
  const id = pending.options[index];
  if (id === undefined) return 'not_available';
  pending.options.splice(index, 1);
  pending.picksLeft--;
  gainRelic(s, id);
  if (pending.picksLeft > 0 && pending.options.length > 0) return null;
  s.pending = null;
  s.phase = 'wave';
  s.stage = 'between';
  s.stageTimer = NEXT_WAVE_DELAY;
  return null;
}

export function cmdRerollRelics(s: Sim, paid: boolean): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  const pending = s.pending;
  if (s.phase !== 'choice' || !pending || pending.kind !== 'relic') return 'not_available';
  if (paid) {
    if (s.mode === 'daily') return 'not_available';
    if (s.paidRerollUsed) return 'already_used';
  } else if (s.freeRerolls <= 0) {
    return 'already_used';
  }
  if (paid) s.paidRerollUsed = true;
  else s.freeRerolls--;
  const options = rollRelicOffer(s, s.offerAct, pending.options);
  pending.options = options;
  pending.freeRerolls = s.freeRerolls;
  pending.paidRerollUsed = s.paidRerollUsed;
  if (s.ev.has('relicOffer')) s.ev.emit('relicOffer', { options, freeRerolls: s.freeRerolls, picksLeft: pending.picksLeft });
  return null;
}

// ───────────────────────────── waves ─────────────────────────────

function buildSpawns(s: Sim, wave: number): void {
  const script = s.scriptOf(wave);
  const ids = s.spawnIds;
  ids.length = 0;
  const entries = waveEntries(script, s.countMult);
  for (const e of script.boss ? entries.slice(1) : entries) {
    for (let i = 0; i < e.count; i++) ids.push(e.enemy);
  }
  s.rng.wave.shuffle(ids);
  const times = s.spawnTimes;
  times.length = 0;
  const special = script.kind !== 'normal';
  const start = special ? BOSS_APPEAR : SPAWN_START;
  const window = special ? ESCORT_WINDOW : SPAWN_WINDOW * (1 + (s.fx.spawnSlow ?? 0));
  // The stretched window of the blanket and the hourglass together (+18%) reaches past the end of the daily rule's 11-second wave; an
  // enemy due after the end would never come, so the last ones come on the last tick instead (a 15-second wave never gets here).
  const lastAt = special ? Infinity : s.waveDuration - TICK;
  let prev = 0;
  for (let i = 0; i < ids.length; i++) {
    const jitter = (s.rng.wave.next() - 0.5) * 0.6;
    const t = Math.min(lastAt, Math.max(prev, start + (window * (i + 0.5 + jitter)) / ids.length));
    times.push(t);
    prev = t;
  }
  s.spawnIdx = 0;
}

function waveLimit(s: Sim, kind: 'elite' | 'boss', ordinal: number): number {
  return specialLimit(kind, ordinal) + (s.fx.bossTime ?? 0) + s.trainBossTime - s.rules.bossTimeCut;
}

export function startWave(s: Sim, wave: number): void {
  if (s.snapshotEnabled) s.lastSnapshot = captureSnapshot(s, wave);
  s.wave = wave;
  s.act = actOf(wave);
  s.waveKind = s.scriptOf(wave).kind;
  s.stage = 'run';
  s.waveClock = 0;
  s.waveTime = 0;
  s.chefFish = 0;
  s.bossSpawned = false;
  s.boss = null;
  s.waveDuration = s.waveKind === 'normal' ? s.normalWaveTime : waveLimit(s, s.waveKind, Math.floor((wave - 1) / 8));
  buildSpawns(s, wave);
  // The tunnel's value is the number of waves between two visits (1 = every wave); the wave number decides, so a resumed run agrees.
  if (s.fx.tunnel && wave % s.fx.tunnel === 0) placeRandomCommon(s, s.rng.toy.next(), s.rng.toy.next());
  if (s.ev.has('waveStart')) s.ev.emit('waveStart', { wave, act: s.act, kind: s.waveKind, duration: s.waveDuration });
  s.phase = 'wave';
  if (s.mode === 'tutorial') {
    if (wave === TUTORIAL_PICK_WAVE && s.tutorialOffer) {
      s.tutorialOffer = false;
      openSummonOffer(s, true);
    }
    tutorialWaveStart(s, wave);
  }
}

function spawnTarget(s: Sim): void {
  const script = scriptFor(s.scriptChapter, s.wave);
  const kind = s.waveKind === 'boss' ? 'boss' : 'elite';
  const ordinal = Math.floor((s.wave - 1) / 8);
  const e = spawnEnemy(s, script.boss as EnemyId, 0, s.baseHp(), true, specialHp(kind, ordinal) * s.hpChapterMult * s.rules.specialHpMult);
  e.capRate = e.maxHp / (BOSS_MIN_KILL * s.waveDuration);
  e.capTokens = e.capRate * BOSS_CAP_BURST;
  s.boss = e;
  s.bossSpawned = true;
  startBoss(s, e);
}

/** Pays the end-of-wave reward and announces it. Returns the fish paid. */
function payWave(s: Sim, called: boolean, bonus: number): void {
  const reward = Math.floor((WAVE_FISH_BASE + WAVE_FISH_PER_WAVE * s.wave) * (1 + (s.tierData[3]?.rewardMult ?? 0)) + 1e-9);
  let paid = earnFish(s, reward + (s.fx.waveFish ?? 0), 'wave');
  if (bonus > 0) paid += earnFish(s, bonus, 'call');
  if (s.wave > s.wavesCleared) s.wavesCleared = s.wave;
  if (s.ev.has('waveEnd')) s.ev.emit('waveEnd', { wave: s.wave, fish: paid, called });
}

export function callBonusOf(s: Sim): number {
  if (s.phase !== 'wave' || s.stage !== 'run' || s.waveKind !== 'normal') return -1;
  if (s.spawnIdx < s.spawnIds.length || s.waveClock >= s.waveDuration) return -1;
  return Math.min(CALL_FISH_MAX, Math.ceil(CALL_FISH_PER_SECOND * (s.waveDuration - s.waveClock) - 1e-9));
}

export function cmdCallNext(s: Sim): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  if (s.phase === 'choice') return 'choice_pending';
  const bonus = callBonusOf(s);
  if (bonus < 0) return 'not_available';
  payWave(s, true, bonus);
  startWave(s, s.wave + 1);
  return null;
}

/** The wave's elite or boss died: stop spawning, pay the wave, and wait out the clear delay. */
export function targetKilled(s: Sim, e: SimEnemy): void {
  if (s.boss === e) s.boss = null;
  if (s.waveKind === 'boss') s.bossesKilled++;
  s.spawnIdx = s.spawnIds.length;
  payWave(s, false, 0);
  s.stage = 'clearing';
  s.stageTimer = CLEAR_DELAY;
}

export function buildStats(s: Sim): RunStats {
  const damageByUnit: RunStats['damageByUnit'] = {};
  for (let i = 0; i < s.damageByUnit.length; i++) {
    const v = s.damageByUnit[i] as number;
    if (v > 0) damageByUnit[s.unitIds[i] as UnitId] = v;
  }
  return {
    mode: s.mode, chapter: s.chapter, stake: s.stake, seed: s.init.seed, victory: s.phase === 'won',
    wavesCleared: s.wavesCleared, totalWaves: s.totalWaves, kills: s.kills, bossesKilled: s.bossesKilled,
    summons: s.summonedUnits, merges: s.merges, molts: s.molts, awakenings: s.awakenings, relics: s.relics.slice(),
    bestRarity: RARITIES[s.bestRarity] ?? 'common', peakEnemies: s.peakEnemies, duration: s.time, revived: s.revived,
    summonLuck: luckShare(s.luck), damageByUnit,
  };
}

function win(s: Sim): void {
  s.phase = 'won';
  s.pending = null;
  if (s.ev.has('victory')) s.ev.emit('victory', { stats: buildStats(s) });
}

export function lose(s: Sim, reason: 'overrun' | 'boss_timeout'): void {
  s.phase = 'lost';
  s.lossReason = reason;
  s.pending = null;
  if (s.ev.has('defeat')) s.ev.emit('defeat', { reason });
}

function completeAct(s: Sim): void {
  if (!s.endless && s.wave >= s.totalWaves) {
    win(s);
    return;
  }
  const purr = s.rules.actPurr + (s.fx.actPurr ?? 0);
  const fish = earnFish(s, ACT_FISH_BASE + ACT_FISH_PER_ACT * s.act, 'act');
  addPurr(s, purr, 'act');
  if (s.ev.has('actClear')) s.ev.emit('actClear', { act: s.act, purr, fish });
  rerollSun(s);
  if (!openRelicOffer(s, s.act)) {
    s.stage = 'between';
    s.stageTimer = NEXT_WAVE_DELAY;
  }
}

function endNormalWave(s: Sim): void {
  payWave(s, false, 0);
  // The gold dungeon has no elite or boss to close an act: the wave clock does, through the same clear delay and act reward.
  if (s.mode === 'gold' && s.wave % ACT_LENGTH === 0) {
    s.stage = 'clearing';
    s.stageTimer = CLEAR_DELAY;
    return;
  }
  startWave(s, s.wave + 1);
}

/** Per-tick wave state machine: spawns, the wave timer and the delays between waves. */
export function updateWave(s: Sim): void {
  if (s.stage === 'clearing') {
    s.stageTimer -= TICK;
    if (s.stageTimer <= 0) completeAct(s);
    return;
  }
  if (s.stage === 'between') {
    s.stageTimer -= TICK;
    if (s.stageTimer <= 0) startWave(s, s.wave + 1);
    return;
  }
  s.waveClock += TICK;
  const ids = s.spawnIds;
  while (s.spawnIdx < ids.length && s.waveClock >= (s.spawnTimes[s.spawnIdx] as number)) {
    spawnEnemy(s, ids[s.spawnIdx] as EnemyId, 0, s.baseHp(), false);
    s.spawnIdx++;
  }
  if (s.waveKind === 'normal') {
    s.waveTime = s.waveClock;
    if (s.waveClock >= s.waveDuration) endNormalWave(s);
    return;
  }
  if (!s.bossSpawned && s.waveClock >= BOSS_APPEAR) spawnTarget(s);
  if (s.bossSpawned) {
    s.waveTime = s.waveClock - BOSS_APPEAR;
    if (s.boss && s.waveTime >= s.waveDuration) lose(s, 'boss_timeout');
  }
}

// ───────────────────────────── danger, overflow, revive ─────────────────────────────

/** Removes enemies (not the elite / boss) that travelled furthest until at most `limit` remain. */
function chaseOff(s: Sim, limit: number): number {
  let removed = 0;
  while (s.enemies.length > limit) {
    let far: SimEnemy | null = null;
    for (const e of s.enemies) if (!e.target && (!far || e.travelled > far.travelled)) far = e;
    if (!far) break;
    removeEnemy(s, far);
    removed++;
    if (s.ev.has('enemyDie')) s.ev.emit('enemyDie', { enemy: far, x: far.x, y: far.y, fish: 0, purr: 0, killer: null });
  }
  return removed;
}

export function updateAlarms(s: Sim): void {
  const count = s.enemies.length;
  const cap = s.enemyCap;
  if (count > s.peakEnemies) s.peakEnemies = count;
  const level = count >= cap * DANGER_ALARM ? 2 : count >= cap * DANGER_CAUTION ? 1 : 0;
  if (level !== s.dangerLevel) {
    s.dangerLevel = level;
    if (s.ev.has('danger')) s.ev.emit('danger', { level, count, cap });
  }
  if (s.reviveGrace > 0) s.reviveGrace -= TICK;
  if (count <= cap || s.reviveGrace > 0) {
    if (s.overflowTime > 0) {
      s.overflowTime = 0;
      if (s.ev.has('overflow')) s.ev.emit('overflow', { grace: 0 });
    }
    return;
  }
  if (s.overflowTime === 0 && s.ev.has('overflow')) s.ev.emit('overflow', { grace: s.overflowLimit });
  s.overflowTime += TICK;
  if (s.overflowTime < s.overflowLimit) return;
  if ((s.fx.rescue ?? 0) > 0 && !s.rescueUsed) {
    s.rescueUsed = true;
    const removed = chaseOff(s, Math.floor(cap * 0.5));
    s.overflowTime = 0;
    if (s.ev.has('rescued')) s.ev.emit('rescued', { removed });
    if (s.ev.has('overflow')) s.ev.emit('overflow', { grace: 0 });
    return;
  }
  lose(s, 'overrun');
}

export function canReviveNow(s: Sim): boolean {
  return s.phase === 'lost' && s.lossReason !== null && !s.revived && s.mode !== 'daily';
}

export function cmdRevive(s: Sim): Fail | null {
  if (s.phase !== 'lost' || s.lossReason === null || s.mode === 'daily') return 'not_available';
  if (s.revived) return 'already_used';
  s.revived = true;
  let removed = 0;
  if (s.lossReason === 'overrun') {
    removed = chaseOff(s, Math.floor(s.enemyCap * REVIVE_CAP_FRACTION));
    s.reviveGrace = REVIVE_GRACE;
    s.overflowTime = 0;
  } else if (s.boss) {
    s.boss.hp *= 1 - REVIVE_BOSS_HP_CUT;
    s.waveDuration += REVIVE_BOSS_TIME;
  }
  s.lossReason = null;
  s.phase = 'wave';
  if (s.ev.has('revive')) s.ev.emit('revive', { removed });
  return null;
}
