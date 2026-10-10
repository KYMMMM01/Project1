/** Enemies: spawning, walking, statuses, damage, death and the auras of clocks and pills. */
import type { DamageType, EnemyId, StatusKind } from '../api';
import { pathPoint, type PathPoint } from '../geometry';
import {
  AURA_TICK, BOSS_CAP_BURST, BOSS_FISH, BOSS_PURR, CC_IMMUNE_AFTER, DOT_TICK, ELITE_FISH, ELITE_PURR, ENRAGE_HP_FRACTION,
  HASTE_CAP, LASER_VULNERABLE, PULL_BOSS_FACTOR, PULL_ELITE_FACTOR, PULL_IMMUNE_AFTER, SLOW_CAP, TICK, VULNERABLE_CAP,
} from '../data/balance';
import { BOSS_SPECS, enemySpec } from '../data/enemies';
import { addPurr, chefHarvest, earnFish } from './economy';
import { pulseEnemy } from './hazards';
import type { Sim } from './sim';
import { queueShatter } from './specials';
import {
  ST_BLEED, ST_BREAK, ST_BURN, ST_DOT, ST_FREEZE, ST_HASTE, ST_MAGIC, ST_POISON, ST_SLOW, ST_STUN, ST_VULN,
  type SimEnemy, type SimUnit, type SimZone,
} from './types';

const point: PathPoint = { x: 0, y: 0, angle: 0 };
/** Index of the mage class (the mages' third synergy step bursts the fallen). */
const MAGE = 2;
const AURA_EVERY = Math.round(AURA_TICK / TICK);

export function spawnEnemy(s: Sim, id: EnemyId, travelled: number, baseHp: number, target: boolean, hpOverride = 0): SimEnemy {
  const spec = enemySpec(id);
  const hp = hpOverride > 0 ? hpOverride : baseHp * spec.hpMult;
  const shield = spec.shield ? hp * spec.shield : 0;
  const e: SimEnemy = {
    uid: ++s.uidEnemy, id, travelled, x: 0, y: 0, angle: 0, hp, maxHp: hp, shield, maxShield: shield, slow: 0,
    stunned: false, frozen: false, burning: false, poisoned: false, bleeding: false, armorBroken: false,
    vulnerable: false, hasted: false, focused: false, enraged: false, age: 0,
    spec, index: s.enemies.length, baseHp, speed: spec.speed, target, dead: false, mark: 0,
    isBoss: spec.traits.includes('boss'), isElite: spec.traits.includes('elite'),
    mask: 0, slowUntil: 0, stunUntil: 0, freezeUntil: 0, ccImmuneUntil: 0, slowImmuneUntil: 0, pullUid: 0, pullImmuneUntil: 0,
    burnDps: 0, burnUntil: 0, burnSrc: null, poisonDps: 0, poisonUntil: 0, poisonSrc: null,
    bleedDps: 0, bleedUntil: 0, bleedSrc: null, breakAmount: 0, breakUntil: 0, vulnAmount: 0, vulnUntil: 0,
    hasteAmount: 0, hasteUntil: 0, dotAt: 0,
    pulseAt: spec.hazardPulse ? s.time + spec.hazardPulse.every : spec.weakenPulse ? s.time + spec.weakenPulse.every : 0,
    healAcc: 0, capTokens: 0, capRate: 0,
  };
  pathPoint(travelled, point);
  e.x = point.x;
  e.y = point.y;
  e.angle = point.angle;
  s.enemies.push(e);
  if (spec.aura) s.auraCount++;
  s.wakeUnits();
  if (s.ev.has('enemySpawn')) s.ev.emit('enemySpawn', { enemy: e });
  return e;
}

/** Takes an enemy off the field (no rewards, no events). */
export function removeEnemy(s: Sim, e: SimEnemy): void {
  const list = s.enemies;
  const last = list.pop() as SimEnemy;
  if (last !== e) {
    list[e.index] = last;
    last.index = e.index;
  }
  if (e.spec.aura) s.auraCount--;
  e.dead = true;
}

// ───────────────────────────── statuses ─────────────────────────────

function announce(s: Sim, e: SimEnemy, kind: StatusKind, duration: number): void {
  if (s.ev.has('status')) s.ev.emit('status', { enemy: e, kind, duration });
}

function isMagicStatus(kind: StatusKind): boolean {
  return kind === 'slow' || kind === 'burn' || kind === 'poison' || kind === 'freeze' || kind === 'vulnerable';
}

/**
 * Applies a status following the stacking rules of §9. `amount` is the slow / break / vulnerable
 * fraction, or damage per second for burn, poison and bleed.
 */
export function applyStatus(s: Sim, e: SimEnemy, kind: StatusKind, amount: number, duration: number, src: SimUnit | null): void {
  if (e.dead || duration <= 0) return;
  const now = s.time;
  const length = src && isMagicStatus(kind) ? duration * src.statusMult : duration;
  switch (kind) {
    case 'slow': {
      if (e.slowImmuneUntil > now || s.vaccinateUntil > now) return;
      // Elites and bosses use the run's cap (SLOW_CAP_BOSS at butler level 0, lower above it: `rules.specialSlowCap`).
      const cap = e.isBoss || e.isElite ? s.rules.specialSlowCap : SLOW_CAP;
      // The toy's boost and the cap come first; the enemy's own resistance then takes its share off what is left (the duration is not cut).
      const a = Math.min(amount * (1 + (s.fx.slowBoost ?? 0)), cap) * (1 - e.spec.slowResist);
      if (a <= 0) return;
      const fresh = (e.mask & ST_SLOW) === 0;
      if (fresh || a > e.slow) e.slow = a;
      e.slowUntil = Math.max(e.slowUntil, now + length);
      e.mask |= ST_SLOW;
      if (fresh) announce(s, e, kind, length);
      return;
    }
    case 'stun':
    case 'freeze': {
      if (e.isBoss || now < e.ccImmuneUntil) return;
      // Bosses never get here (immune above); an elite feels the run's share (ELITE_CC_FACTOR at butler level 0, lower above it).
      const d = e.isElite ? length * s.rules.eliteCcFactor : length;
      if (kind === 'stun') {
        if ((e.mask & ST_STUN) === 0) {
          e.stunned = true;
          announce(s, e, kind, d);
        }
        e.stunUntil = Math.max(e.stunUntil, now + d);
        e.mask |= ST_STUN;
      } else {
        if ((e.mask & ST_FREEZE) === 0) {
          e.frozen = true;
          announce(s, e, kind, d);
        }
        e.freezeUntil = Math.max(e.freezeUntil, now + d);
        e.mask |= ST_FREEZE;
      }
      return;
    }
    case 'burn':
    case 'poison':
    case 'bleed': {
      const bit = kind === 'burn' ? ST_BURN : kind === 'poison' ? ST_POISON : ST_BLEED;
      if ((e.mask & ST_DOT) === 0) e.dotAt = now + DOT_TICK;
      const fresh = (e.mask & bit) === 0;
      if (kind === 'burn') {
        if (fresh || amount > e.burnDps) e.burnDps = amount;
        e.burnUntil = now + length;
        e.burnSrc = src;
        e.burning = true;
      } else if (kind === 'poison') {
        if (fresh || amount > e.poisonDps) e.poisonDps = amount;
        e.poisonUntil = now + length;
        e.poisonSrc = src;
        e.poisoned = true;
      } else {
        if (fresh || amount > e.bleedDps) e.bleedDps = amount;
        e.bleedUntil = now + length;
        e.bleedSrc = src;
        e.bleeding = true;
      }
      e.mask |= bit;
      if (fresh) announce(s, e, kind, length);
      return;
    }
    case 'armor_break': {
      const fresh = (e.mask & ST_BREAK) === 0;
      if (fresh || amount > e.breakAmount) e.breakAmount = amount;
      e.breakUntil = Math.max(e.breakUntil, now + length);
      e.armorBroken = true;
      e.mask |= ST_BREAK;
      if (fresh) announce(s, e, kind, length);
      return;
    }
    case 'vulnerable': {
      const fresh = (e.mask & ST_VULN) === 0;
      if (fresh || amount > e.vulnAmount) e.vulnAmount = amount;
      e.vulnUntil = Math.max(e.vulnUntil, now + length);
      e.vulnerable = true;
      e.mask |= ST_VULN;
      if (fresh) announce(s, e, kind, length);
      return;
    }
  }
}

function applyHaste(e: SimEnemy, amount: number, until: number): void {
  if ((e.mask & ST_HASTE) === 0 || amount > e.hasteAmount) e.hasteAmount = amount;
  if (until > e.hasteUntil) e.hasteUntil = until;
  e.hasted = true;
  e.mask |= ST_HASTE;
}

export function hasteEnemy(s: Sim, e: SimEnemy, amount: number, duration: number): void {
  applyHaste(e, amount, s.time + duration);
}

/** Expires finished statuses and ticks damage over time. Returns false when the enemy died. */
function statusStep(s: Sim, e: SimEnemy, now: number): boolean {
  let m = e.mask;
  if ((m & ST_SLOW) && now >= e.slowUntil) {
    e.slow = 0;
    m &= ~ST_SLOW;
  }
  if ((m & ST_STUN) && now >= e.stunUntil) {
    e.stunned = false;
    e.ccImmuneUntil = now + CC_IMMUNE_AFTER;
    m &= ~ST_STUN;
  }
  if ((m & ST_FREEZE) && now >= e.freezeUntil) {
    e.frozen = false;
    e.ccImmuneUntil = now + CC_IMMUNE_AFTER;
    m &= ~ST_FREEZE;
  }
  if ((m & ST_BREAK) && now >= e.breakUntil) {
    e.armorBroken = false;
    m &= ~ST_BREAK;
  }
  if ((m & ST_VULN) && now >= e.vulnUntil) {
    e.vulnerable = false;
    m &= ~ST_VULN;
  }
  if ((m & ST_HASTE) && now >= e.hasteUntil) {
    e.hasted = false;
    m &= ~ST_HASTE;
  }
  if (m & ST_DOT) {
    if (now >= e.dotAt) {
      e.dotAt += DOT_TICK;
      e.mask = m;
      if ((m & ST_BURN) && damageEnemy(s, e, e.burnDps * DOT_TICK, 'magic', e.burnSrc, false, 'burn')) return false;
      if ((m & ST_POISON) && damageEnemy(s, e, e.poisonDps * DOT_TICK, 'magic', e.poisonSrc, false, 'poison')) return false;
      if ((m & ST_BLEED) && damageEnemy(s, e, e.bleedDps * DOT_TICK, 'physical', e.bleedSrc, false, 'bleed')) return false;
    }
    if ((m & ST_BURN) && now >= e.burnUntil) {
      e.burning = false;
      m &= ~ST_BURN;
    }
    if ((m & ST_POISON) && now >= e.poisonUntil) {
      e.poisoned = false;
      m &= ~ST_POISON;
    }
    if ((m & ST_BLEED) && now >= e.bleedUntil) {
      e.bleeding = false;
      m &= ~ST_BLEED;
    }
  }
  e.mask = m;
  return true;
}

// ───────────────────────────── damage and death ─────────────────────────────

/**
 * One instance of damage. `raw` already includes the crit multiplier. Returns true when the enemy
 * died. Rules §9: defence, vulnerability cap, shield first, then health.
 */
export function damageEnemy(
  s: Sim, e: SimEnemy, raw: number, type: DamageType, src: SimUnit | null, crit: boolean, dot: StatusKind | null,
): boolean {
  if (e.dead) return false;
  // Armour (against physical damage) and ward (against magic) are cut the same way: by the toy, by an armour break on the enemy and by
  // the armour ignore of the cat that hits (v1.5: they used to work on armour only).
  let defence = (type === 'physical' ? e.spec.armor : e.spec.ward) * (1 - (s.fx.defenceCut ?? 0));
  if (e.armorBroken) defence *= 1 - e.breakAmount;
  if (src) defence *= 1 - src.armorIgnore;
  let amount = raw * (1 - defence);
  let mult = 1 + (e.vulnerable ? e.vulnAmount : 0);
  if (e.focused) mult *= 1 + LASER_VULNERABLE;
  if (e.slow > 0 && s.fx.slowedDamage) mult *= 1 + s.fx.slowedDamage;
  // The nap blanket: every enemy takes more damage, whatever the type or the source (a tick of burn included); one more factor under the same cap.
  if (s.fx.enemyDamageTaken) mult *= 1 + s.fx.enemyDamageTaken;
  if (mult > VULNERABLE_CAP) mult = VULNERABLE_CAP;
  amount *= mult;
  if (e.spec.ability === 'inhale' && s.inhaleUntil > s.time) amount *= s.inhaleTaken;
  if (e.target) {
    // The elite's damage allowance: whatever exceeds it is ignored.
    if (amount > e.capTokens) amount = e.capTokens;
    e.capTokens -= amount;
  }

  let absorbed = 0;
  if (e.shield > 0) {
    absorbed = Math.min(e.shield, amount);
    e.shield -= absorbed;
  }
  const toHealth = amount - absorbed;
  const before = e.hp;
  e.hp -= toHealth;
  const dealt = absorbed + Math.min(toHealth, before);
  const killed = e.hp <= 0;
  if (src) {
    src.damageDealt += dealt;
    s.damageByUnit[src.unitIndex] += dealt;
  }
  if (s.ev.has('hit')) {
    s.ev.emit('hit', { enemy: e, amount, crit, type, unitId: dot ? null : src ? src.id : null, dot, absorbed, killed });
  }
  if (absorbed > 0 && e.shield <= 1e-9) {
    e.shield = 0;
    if (s.ev.has('shieldBreak')) s.ev.emit('shieldBreak', { enemy: e });
  }
  if (killed) {
    killEnemy(s, e, src && !src.removed ? src : null);
    return true;
  }
  if (e.target && !e.enraged && e.hp <= e.maxHp * ENRAGE_HP_FRACTION) {
    e.enraged = true;
    if (s.ev.has('enrage')) s.ev.emit('enrage', { enemy: e });
  }
  return false;
}

export function killEnemy(s: Sim, e: SimEnemy, killer: SimUnit | null): void {
  if (e.dead) return;
  e.hp = 0;
  removeEnemy(s, e);
  s.kills++;
  if (killer) killer.kills++;
  let fish = 0;
  let purr = 0;
  let bounty = e.spec.bounty;
  if (e.target) {
    const boss = s.waveKind === 'boss';
    bounty = boss ? BOSS_FISH : ELITE_FISH;
    purr = (boss ? BOSS_PURR : ELITE_PURR) + (s.fx.bossPurr ?? 0);
  }
  fish = earnFish(s, bounty * (1 + s.killFishBonus), 'kill', e.x, e.y);
  if (purr > 0) addPurr(s, purr, 'boss', e.x, e.y);
  if (s.ev.has('enemyDie')) s.ev.emit('enemyDie', { enemy: e, x: e.x, y: e.y, fish, purr, killer });

  const split = e.spec.split;
  if (split) {
    for (let i = 0; i < split.count; i++) {
      const offset = (i - (split.count - 1) / 2) * 14;
      spawnEnemy(s, split.into, Math.max(0, e.travelled + offset), e.baseHp, false);
    }
  }
  const burst = e.spec.deathBurst;
  if (burst) {
    const r2 = burst.radius * burst.radius;
    for (const o of s.enemies) {
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      if (dx * dx + dy * dy <= r2) hasteEnemy(s, o, burst.haste, burst.duration);
    }
  }
  chefHarvest(s, e.x, e.y);
  if (s.special[MAGE] === 1 && !s.shattering && !e.isElite && !e.isBoss && (e.mask & ST_MAGIC) !== 0) queueShatter(s, e);
  if (e.target) s.onTargetKilled(e);
}

// ───────────────────────────── per-tick update ─────────────────────────────

function applyAuras(s: Sim, now: number): void {
  const list = s.enemies;
  const until = now + AURA_TICK * 2.5;
  for (let i = 0; i < list.length; i++) {
    const a = list[i] as SimEnemy;
    const aura = a.spec.aura;
    if (!aura) continue;
    const r2 = aura.radius * aura.radius;
    for (let j = 0; j < list.length; j++) {
      if (j === i) continue;
      const b = list[j] as SimEnemy;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > r2) continue;
      if (aura.kind === 'haste') {
        applyHaste(b, aura.value, until);
      } else {
        b.slowImmuneUntil = until;
        if (b.mask & ST_SLOW) {
          b.slow = 0;
          b.mask &= ~ST_SLOW;
        }
        if (b.hp < b.maxHp) {
          const heal = b.maxHp * aura.value * AURA_TICK;
          b.hp = Math.min(b.maxHp, b.hp + heal);
          b.healAcc += heal;
          if (b.healAcc >= b.maxHp * 0.02 && s.ev.has('heal')) {
            s.ev.emit('heal', { enemy: b, amount: b.healAcc });
            b.healAcc = 0;
          }
        }
      }
    }
  }
}

/** Walks every enemy one tick, expires statuses, ticks damage over time and runs periodic enemy abilities. */
export function updateEnemies(s: Sim): void {
  const now = s.time;
  const list = s.enemies;
  if (s.auraCount > 0 && s.tickCount % AURA_EVERY === 0) applyAuras(s, now);
  const nap = 1 - (s.fx.enemySlow ?? 0);
  const whirl = s.whirlUntil > now ? s.whirlSpeed : 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i] as SimEnemy;
    if (e.mask !== 0 && !statusStep(s, e, now)) continue;
    if (e.pulseAt !== 0 && now >= e.pulseAt) pulseEnemy(s, e);
    if (e.capRate > 0) {
      const burst = e.capRate * BOSS_CAP_BURST;
      e.capTokens = e.capTokens + e.capRate * TICK > burst ? burst : e.capTokens + e.capRate * TICK;
    }
    e.age += TICK;
    if (e.stunned || e.frozen) continue;
    let haste = e.hasted ? e.hasteAmount : 0;
    if (whirl > haste) haste = whirl;
    if (e.spec.ability === 'enrage') {
      const bonus = BOSS_SPECS.enrage.maxBonus * (1 - e.hp / e.maxHp);
      if (bonus > haste) haste = bonus;
    }
    if (haste > HASTE_CAP) haste = HASTE_CAP;
    e.travelled += e.speed * (1 - e.slow) * (1 + haste) * nap * TICK;
    pathPoint(e.travelled, point);
    e.x = point.x;
    e.y = point.y;
    e.angle = point.angle;
  }
}

/**
 * Drags an enemy back along the path (black hole), never below the start, and returns how far it moved. The hole that caught an
 * enemy keeps dragging it until it ends; no other hole drags it until `PULL_IMMUNE_AFTER` seconds after that. Elites and bosses
 * move by a fraction of the pull.
 */
export function pullEnemy(s: Sim, e: SimEnemy, distance: number, zone: SimZone): number {
  if (e.pullUid !== zone.uid) {
    if (s.time < e.pullImmuneUntil) return 0;
    e.pullUid = zone.uid;
    e.pullImmuneUntil = s.time + zone.timeLeft + PULL_IMMUNE_AFTER;
  }
  const want = distance * (e.isBoss ? PULL_BOSS_FACTOR : e.isElite ? PULL_ELITE_FACTOR : 1);
  const moved = want < e.travelled ? want : e.travelled;
  if (moved <= 0) return 0;
  e.travelled -= moved;
  pathPoint(e.travelled, point);
  e.x = point.x;
  e.y = point.y;
  e.angle = point.angle;
  return moved;
}
