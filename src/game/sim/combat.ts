/** Unit attacks, projectiles, zones, the laser pointer and the relics that act on a timer. */
import type { Fail, StrikePoint } from '../api';
import { CELL_COUNT, FIELD_H, FIELD_W, cellCenterX, cellCenterY, pathGap } from '../geometry';
import { LASER_COOLDOWN, LASER_DURATION, MAX_ENEMY_SPEED, PROJECTILE_RETARGET, TICK, hpIndex } from '../data/balance';
import type { AttackSpec, HitEffect } from '../data/types';
import { addFish } from './economy';
import { applyStatus, damageEnemy, pullEnemy } from './enemies';
import type { Sim } from './sim';
import type { SimEnemy, SimProjectile, SimUnit, SimZone } from './types';

const CELL_X = new Float64Array(CELL_COUNT);
const CELL_Y = new Float64Array(CELL_COUNT);
for (let c = 0; c < CELL_COUNT; c++) {
  CELL_X[c] = cellCenterX(c);
  CELL_Y[c] = cellCenterY(c);
}

/** Scratch lists reused by every attack. `chosen` is what an attack resolves; `near` is a search result. */
const near: SimEnemy[] = [];
const nearD2: number[] = [];
const chosen: SimEnemy[] = [];
const points: StrikePoint[] = [];

function areaOf(s: Sim, u: SimUnit): number {
  return 1 + (s.fx.areaScale ?? 0) + u.perk.radius;
}

function rollCrit(s: Sim, u: SimUnit): boolean {
  const c = u.stats.crit;
  return c > 0 && s.rng.combat.next() < c;
}

function strike(s: Sim, u: SimUnit, x: number, y: number, radius: number, list: readonly SimEnemy[]): void {
  if (!s.ev.has('strike')) return;
  const out: StrikePoint[] = [];
  for (const e of list) out.push({ x: e.x, y: e.y, uid: e.uid });
  s.ev.emit('strike', { unitId: u.id, relic: null, x, y, radius, points: out });
}

function emitAttack(s: Sim, u: SimUnit, target: SimEnemy, projectile: SimProjectile | null): void {
  if (s.ev.has('attack')) s.ev.emit('attack', { unit: u, targetUid: target.uid, tx: target.x, ty: target.y, projectile });
}

function hit(s: Sim, u: SimUnit, e: SimEnemy, base: number, crit: boolean, mult: number): boolean {
  return damageEnemy(s, e, base * mult * (crit ? u.stats.critMult : 1), u.spec.damageType, u, crit, null);
}

function applyEffect(s: Sim, u: SimUnit, e: SimEnemy, eff: HitEffect): void {
  if (e.dead) return;
  const amount = eff.amount + u.perk.effect;
  const dot = eff.kind === 'burn' || eff.kind === 'poison' || eff.kind === 'bleed';
  applyStatus(s, e, eff.kind, dot ? amount * (u.stats.damage / u.stats.interval) : amount, eff.duration + u.perk.duration, u);
}

/** Fills `near` with enemies whose body touches the circle, nearest first is NOT guaranteed (see `nearest`). */
function collectNear(s: Sim, x: number, y: number, r: number, exclude: SimEnemy | null): number {
  near.length = 0;
  nearD2.length = 0;
  for (const e of s.enemies) {
    if (e === exclude) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const reach = r + e.spec.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 <= reach * reach) {
      near.push(e);
      nearD2.push(d2);
    }
  }
  return near.length;
}

/** Moves the `k` closest entries of `near` to the front (selection, no allocation). */
function nearest(k: number): number {
  const n = Math.min(k, near.length);
  for (let i = 0; i < n; i++) {
    let m = i;
    for (let j = i + 1; j < near.length; j++) if ((nearD2[j] as number) < (nearD2[m] as number)) m = j;
    if (m !== i) {
      const e = near[i] as SimEnemy;
      near[i] = near[m] as SimEnemy;
      near[m] = e;
      const d = nearD2[i] as number;
      nearD2[i] = nearD2[m] as number;
      nearD2[m] = d;
    }
  }
  return n;
}

// ───────────────────────────── target choice ─────────────────────────────

/**
 * The enemy a cat attacks (rules §8): the oldest one in range, the sturdiest for the gunslinger, and
 * the one closest to the laser dot when the dot is near any candidate. Records when to look again.
 */
function pickTarget(s: Sim, u: SimUnit): SimEnemy | null {
  const cx = CELL_X[u.cell] as number;
  const cy = CELL_Y[u.cell] as number;
  const range = u.stats.range;
  const attack = u.spec.attack;
  const byHealth = attack.shape === 'single' && attack.priority === 'max_hp';
  const laser = s.laser;
  const laserR2 = laser.radius * laser.radius;
  let best: SimEnemy | null = null;
  let bestKey = -1;
  let focus: SimEnemy | null = null;
  let focusD2 = Infinity;
  let gap = Infinity;
  for (const e of s.enemies) {
    const dx = e.x - cx;
    const dy = e.y - cy;
    const reach = range + e.spec.radius;
    const d2 = dx * dx + dy * dy;
    if (d2 > reach * reach) {
      const g = Math.sqrt(d2) - reach;
      if (g < gap) gap = g;
      continue;
    }
    const key = byHealth ? e.hp : e.travelled;
    if (key > bestKey || (key === bestKey && best !== null && e.uid < best.uid)) {
      best = e;
      bestKey = key;
    }
    if (laser.active) {
      const lx = e.x - laser.x;
      const ly = e.y - laser.y;
      const ld2 = lx * lx + ly * ly;
      if (ld2 <= laserR2 && ld2 < focusD2) {
        focus = e;
        focusD2 = ld2;
      }
    }
  }
  if (focus) return focus;
  if (!best) u.searchAfter = gap === Infinity ? Infinity : s.time + Math.max(TICK, gap / MAX_ENEMY_SPEED);
  return best;
}

// ───────────────────────────── attacks ─────────────────────────────

function newProjectile(): SimProjectile {
  return { uid: 0, unitId: 'w_paw', x: 0, y: 0, angle: 0, targetUid: 0, src: null as unknown as SimUnit, target: null, damage: 0, speed: 0, tx: 0, ty: 0 };
}

function launch(s: Sim, u: SimUnit, target: SimEnemy): void {
  const p = s.projPool.pop() ?? newProjectile();
  p.uid = ++s.uidProj;
  p.unitId = u.id;
  p.x = CELL_X[u.cell] as number;
  p.y = CELL_Y[u.cell] as number;
  p.tx = target.x;
  p.ty = target.y;
  p.angle = Math.atan2(p.ty - p.y, p.tx - p.x);
  p.targetUid = target.uid;
  p.target = target;
  p.src = u;
  p.damage = u.stats.damage;
  p.speed = u.spec.projectileSpeed;
  s.projectiles.push(p);
  emitAttack(s, u, target, p);
}

/** Damage and effects of a landed single shot, a ninja star or a splash shell. */
function impact(s: Sim, u: SimUnit, victim: SimEnemy, ix: number, iy: number, dmg: number): void {
  const attack = u.spec.attack;
  const crit = rollCrit(s, u);
  if (attack.shape === 'splash') {
    const radius = attack.radius * areaOf(s, u);
    collectNear(s, ix, iy, radius, null);
    chosen.length = 0;
    for (const e of near) chosen.push(e);
    strike(s, u, ix, iy, radius, chosen);
    for (const e of chosen) {
      if (e.dead) continue;
      hit(s, u, e, dmg, crit, 1);
      applyEffect(s, u, e, attack.effect);
    }
    return;
  }
  hit(s, u, victim, dmg, crit, 1);
  if (attack.shape === 'single' && attack.effect) applyEffect(s, u, victim, attack.effect);
}

function fireProjectileShape(s: Sim, u: SimUnit, target: SimEnemy): void {
  if (u.spec.projectileSpeed > 0) {
    launch(s, u, target);
    return;
  }
  emitAttack(s, u, target, null);
  impact(s, u, target, target.x, target.y, u.stats.damage);
}

function fireCleave(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'cleave' }>): void {
  const radius = attack.radius * areaOf(s, u);
  collectNear(s, target.x, target.y, radius, target);
  nearest(attack.targets + u.perk.targets - 1);
  chosen.length = 0;
  chosen.push(target);
  const extra = Math.min(attack.targets + u.perk.targets - 1, near.length);
  for (let i = 0; i < extra; i++) chosen.push(near[i] as SimEnemy);
  emitAttack(s, u, target, null);
  strike(s, u, target.x, target.y, radius, chosen);
  const crit = rollCrit(s, u);
  for (const e of chosen) {
    if (e.dead) continue;
    if (!hit(s, u, e, u.stats.damage, crit, 1) && attack.effect) applyEffect(s, u, e, attack.effect);
  }
}

function fireLine(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'line' }>): void {
  const reach = attack.reach + u.perk.reach;
  chosen.length = 0;
  for (const e of s.enemies) if (pathGap(e.travelled, target.travelled) <= reach) chosen.push(e);
  emitAttack(s, u, target, null);
  strike(s, u, target.x, target.y, reach, chosen);
  const crit = rollCrit(s, u);
  for (const e of chosen) {
    if (e.dead) continue;
    if (!hit(s, u, e, u.stats.damage, crit, 1)) applyEffect(s, u, e, attack.effect);
  }
}

function fireBlast(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'blast' }>): void {
  const radius = attack.radius * areaOf(s, u);
  collectNear(s, target.x, target.y, radius, null);
  chosen.length = 0;
  for (const e of near) chosen.push(e);
  emitAttack(s, u, target, null);
  strike(s, u, target.x, target.y, radius, chosen);
  const crit = rollCrit(s, u);
  for (const e of chosen) if (!e.dead) hit(s, u, e, u.stats.damage, crit, 1);
  u.attackCount++;
  const stomp = attack.stomp;
  if (u.attackCount % stomp.every !== 0) return;
  const cx = CELL_X[u.cell] as number;
  const cy = CELL_Y[u.cell] as number;
  const range = u.stats.range;
  chosen.length = 0;
  for (const e of s.enemies) {
    const dx = e.x - cx;
    const dy = e.y - cy;
    const reach = range + e.spec.radius;
    if (dx * dx + dy * dy <= reach * reach) chosen.push(e);
  }
  strike(s, u, cx, cy, range, chosen);
  for (const e of chosen) {
    if (e.dead) continue;
    applyStatus(s, e, 'stun', 1, stomp.stun + u.perk.duration, u);
    applyStatus(s, e, 'armor_break', stomp.breakAmount, stomp.breakDuration, u);
  }
}

function fireMulti(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'multi' }>): void {
  const want = attack.targets + u.perk.targets;
  const cx = CELL_X[u.cell] as number;
  const cy = CELL_Y[u.cell] as number;
  const range = u.stats.range;
  chosen.length = 0;
  chosen.push(target);
  for (let k = 1; k < want; k++) {
    let best: SimEnemy | null = null;
    for (const e of s.enemies) {
      if (chosen.includes(e)) continue;
      const dx = e.x - cx;
      const dy = e.y - cy;
      const reach = range + e.spec.radius;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (!best || e.travelled > best.travelled || (e.travelled === best.travelled && e.uid < best.uid)) best = e;
    }
    if (!best) break;
    chosen.push(best);
  }
  for (const e of chosen) {
    if (u.spec.projectileSpeed > 0) launch(s, u, e);
    else {
      emitAttack(s, u, e, null);
      impact(s, u, e, e.x, e.y, u.stats.damage);
    }
  }
}

function fireChain(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'chain' }>): void {
  const hits = attack.targets + u.perk.targets;
  const reach = (attack.reach + u.perk.reach) * (1 + (s.fx.areaScale ?? 0));
  const crit = rollCrit(s, u);
  const stamp = ++s.stamp;
  chosen.length = 0;
  let cur: SimEnemy | null = target;
  emitAttack(s, u, target, null);
  for (let i = 0; i < hits && cur; i++) {
    cur.mark = stamp;
    chosen.push(cur);
    let next: SimEnemy | null = null;
    let nextD2 = Infinity;
    for (const e of s.enemies) {
      if (e.mark === stamp) continue;
      const dx = e.x - cur.x;
      const dy = e.y - cur.y;
      const r = reach + e.spec.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r * r && d2 < nextD2) {
        next = e;
        nextD2 = d2;
      }
    }
    cur = next;
  }
  strike(s, u, target.x, target.y, reach, chosen);
  let mult = 1;
  for (const e of chosen) {
    if (!e.dead) hit(s, u, e, u.stats.damage, crit, mult);
    mult *= attack.falloff;
  }
}

function blastAt(s: Sim, u: SimUnit, x: number, y: number, radius: number, dmg: number, skip: SimEnemy): void {
  const n = collectNear(s, x, y, radius, skip);
  if (n === 0) return;
  const start = chosen.length;
  for (const e of near) chosen.push(e);
  for (let i = start; i < chosen.length; i++) {
    const e = chosen[i] as SimEnemy;
    if (!e.dead) damageEnemy(s, e, dmg, u.spec.damageType, u, false, null);
  }
  chosen.length = start;
}

function firePierce(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'pierce' }>): void {
  const cx = CELL_X[u.cell] as number;
  const cy = CELL_Y[u.cell] as number;
  const dx = target.x - cx;
  const dy = target.y - cy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const want = attack.targets + u.perk.targets;
  chosen.length = 0;
  chosen.push(target);
  const range = u.stats.range;
  let along = len;
  for (let k = 0; k < want; k++) {
    let best: SimEnemy | null = null;
    let bestT = Infinity;
    for (const e of s.enemies) {
      if (chosen.includes(e)) continue;
      const ex = e.x - cx;
      const ey = e.y - cy;
      const t = ex * ux + ey * uy;
      if (t <= along || t > range + e.spec.radius) continue;
      const side = Math.abs(ex * uy - ey * ux);
      if (side <= attack.width + e.spec.radius && t < bestT) {
        best = e;
        bestT = t;
      }
    }
    if (!best) break;
    chosen.push(best);
    along = bestT;
  }
  emitAttack(s, u, target, null);
  strike(s, u, cx, cy, len, chosen);
  const crit = rollCrit(s, u);
  const blastRadius = attack.blastRadius * areaOf(s, u);
  const base = u.stats.damage;
  const count = chosen.length;
  // The volley list lives in `chosen`; blasts append behind it and are trimmed again.
  for (let i = 0; i < count; i++) {
    const e = chosen[i] as SimEnemy;
    if (e.dead) continue;
    if (hit(s, u, e, base, crit, 1)) blastAt(s, u, e.x, e.y, blastRadius, base * attack.blastPct, e);
  }
}

function castZone(s: Sim, u: SimUnit, target: SimEnemy, attack: Extract<AttackSpec, { shape: 'frost' | 'void' | 'brew' }>): void {
  const z = s.zonePool.pop() ?? ({ uid: 0, unitId: 'w_paw', x: 0, y: 0, radius: 0, timeLeft: 0, duration: 0, src: null as unknown as SimUnit, spec: attack, damage: 0, tickAt: 0 } as SimZone);
  z.uid = ++s.uidZone;
  z.unitId = u.id;
  z.x = target.x;
  z.y = target.y;
  z.radius = attack.radius * areaOf(s, u);
  z.duration = attack.duration + u.perk.duration;
  z.timeLeft = z.duration;
  z.src = u;
  z.spec = attack;
  z.damage = u.stats.damage;
  z.tickAt = s.time + (attack.shape === 'frost' ? attack.tick : attack.shape === 'brew' ? 0.25 : 0.1);
  s.zones.push(z);
  emitAttack(s, u, target, null);
  if (s.ev.has('zoneStart')) s.ev.emit('zoneStart', { zone: z });
}

function fire(s: Sim, u: SimUnit, target: SimEnemy): void {
  const attack = u.spec.attack;
  switch (attack.shape) {
    case 'single':
    case 'splash': fireProjectileShape(s, u, target); break;
    case 'cleave': fireCleave(s, u, target, attack); break;
    case 'line': fireLine(s, u, target, attack); break;
    case 'blast': fireBlast(s, u, target, attack); break;
    case 'multi': fireMulti(s, u, target, attack); break;
    case 'pierce': firePierce(s, u, target, attack); break;
    case 'chain': fireChain(s, u, target, attack); break;
    case 'frost':
    case 'void':
    case 'brew': castZone(s, u, target, attack); break;
  }
}

function coinRain(s: Sim, u: SimUnit): void {
  const rain = u.spec.aura.coinRain;
  if (!rain) return;
  chosen.length = 0;
  for (const e of s.enemies) chosen.push(e);
  if (s.ev.has('strike')) {
    points.length = 0;
    for (const e of chosen) points.push({ x: e.x, y: e.y, uid: e.uid });
    s.ev.emit('strike', { unitId: u.id, relic: null, x: CELL_X[u.cell] as number, y: CELL_Y[u.cell] as number, radius: 0, points: points.slice() });
  }
  for (const e of chosen) {
    if (e.dead) continue;
    if (!damageEnemy(s, e, u.stats.damage * rain.pct, u.spec.damageType, u, false, null)) {
      applyStatus(s, e, 'slow', rain.slow, rain.slowDuration, u);
    }
  }
}

/** Charges every cat and fires the ready ones. */
export function updateUnits(s: Sim): void {
  const now = s.time;
  for (let c = 0; c < CELL_COUNT; c++) {
    const u = s.units[c];
    if (!u) continue;
    if (u.weakened > 0) {
      u.weakened -= TICK;
      if (u.weakened <= 0) {
        u.weakened = 0;
        s.statsDirty = true;
      }
    }
    const blocked = ((s.hazardCount[c] as number) > 0 && !u.shielded && u.id !== 't_bell') || now < u.recoverAt;
    u.blocked = blocked;
    if (blocked) continue;
    u.charge += TICK / u.stats.interval;
    if (u.charge >= 1) {
      let target: SimEnemy | null = null;
      if (now >= u.searchAfter) target = pickTarget(s, u);
      if (target) {
        fire(s, u, target);
        u.charge -= 1;
        if (u.charge > 1) u.charge = 1;
      } else {
        u.charge = 1;
      }
    }
    if (u.coinAt > 0 && now >= u.coinAt && s.enemies.length > 0) {
      coinRain(s, u);
      u.coinAt += (u.spec.aura.coinRain as { every: number }).every;
    }
  }
}

// ───────────────────────────── projectiles and zones ─────────────────────────────

function land(s: Sim, p: SimProjectile): void {
  let victim: SimEnemy | null = p.target && !p.target.dead ? p.target : null;
  if (!victim) {
    let best = PROJECTILE_RETARGET * PROJECTILE_RETARGET;
    for (const e of s.enemies) {
      const dx = e.x - p.tx;
      const dy = e.y - p.ty;
      const d2 = dx * dx + dy * dy;
      if (d2 <= best) {
        best = d2;
        victim = e;
      }
    }
  }
  if (victim) impact(s, p.src, victim, p.tx, p.ty, p.damage);
  if (s.ev.has('projectileEnd')) s.ev.emit('projectileEnd', { projectile: p, x: p.tx, y: p.ty, hit: victim !== null });
}

export function updateProjectiles(s: Sim): void {
  const list = s.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i] as SimProjectile;
    const t = p.target;
    if (t && !t.dead) {
      p.tx = t.x;
      p.ty = t.y;
    } else {
      p.target = null;
    }
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = p.speed * TICK;
    if (d > step) {
      p.x += (dx / d) * step;
      p.y += (dy / d) * step;
      p.angle = Math.atan2(dy, dx);
      continue;
    }
    p.x = p.tx;
    p.y = p.ty;
    const last = list.pop() as SimProjectile;
    if (last !== p) list[i] = last;
    land(s, p);
    p.src = null as unknown as SimUnit;
    p.target = null;
    s.projPool.push(p);
  }
}

function tickZone(s: Sim, z: SimZone): void {
  const u = z.src;
  const attack = z.spec;
  const r = z.radius;
  chosen.length = 0;
  for (const e of s.enemies) {
    const dx = e.x - z.x;
    const dy = e.y - z.y;
    const reach = r + e.spec.radius;
    if (dx * dx + dy * dy <= reach * reach) chosen.push(e);
  }
  if (attack.shape === 'frost') {
    z.tickAt += attack.tick;
    for (const e of chosen) {
      if (e.dead) continue;
      if (damageEnemy(s, e, z.damage * attack.tickPct, 'magic', u, false, null)) continue;
      applyStatus(s, e, 'slow', attack.slow + u.perk.effect, attack.tick + 0.2, u);
      if (s.rng.combat.next() < attack.freezeChance) applyStatus(s, e, 'freeze', 1, attack.freezeTime, u);
    }
  } else if (attack.shape === 'brew') {
    z.tickAt += 0.25;
    const dps = z.damage / u.stats.interval;
    for (const e of chosen) {
      applyStatus(s, e, 'vulnerable', attack.vulnerable + u.perk.effect, 0.5, u);
      applyStatus(s, e, 'poison', attack.poisonPct * dps, 0.75, u);
    }
  } else {
    z.tickAt += 0.1;
    const pull = attack.pull * 0.1;
    for (const e of chosen) {
      pullEnemy(e, pull);
      if (s.ev.has('pull')) s.ev.emit('pull', { enemy: e, distance: pull });
    }
  }
}

export function updateZones(s: Sim): void {
  const list = s.zones;
  for (let i = list.length - 1; i >= 0; i--) {
    const z = list[i] as SimZone;
    z.timeLeft -= TICK;
    if (s.time >= z.tickAt && z.timeLeft > 0) tickZone(s, z);
    if (z.timeLeft > 0) continue;
    if (z.spec.shape === 'void') {
      chosen.length = 0;
      for (const e of s.enemies) {
        const dx = e.x - z.x;
        const dy = e.y - z.y;
        const reach = z.radius + e.spec.radius;
        if (dx * dx + dy * dy <= reach * reach) chosen.push(e);
      }
      strike(s, z.src, z.x, z.y, z.radius, chosen);
      for (const e of chosen) if (!e.dead) damageEnemy(s, e, z.damage, 'magic', z.src, false, null);
    }
    const last = list.pop() as SimZone;
    if (last !== z) list[i] = last;
    if (s.ev.has('zoneEnd')) s.ev.emit('zoneEnd', { zone: z });
    z.src = null as unknown as SimUnit;
    s.zonePool.push(z);
  }
}

// ───────────────────────────── laser pointer ─────────────────────────────

function laserCooldownTotal(s: Sim): number {
  const base = s.modLaserCooldown > 0 ? s.modLaserCooldown : LASER_COOLDOWN;
  return Math.max(1, base - (s.fx.laserCooldownCut ?? 0) - s.trainLaserCut);
}

export function laserDuration(s: Sim): number {
  return LASER_DURATION + (s.fx.laserDuration ?? 0);
}

/** Re-reads the laser's duration and cooldown after a relic or training change. */
export function refreshLaser(s: Sim): void {
  s.laser.duration = laserDuration(s);
  s.laser.cooldownTotal = laserCooldownTotal(s);
  if (!s.laser.active && s.laser.cooldown > s.laser.cooldownTotal) s.laser.cooldown = s.laser.cooldownTotal;
}

export function cmdSetLaser(s: Sim, x: number, y: number): Fail | null {
  if (s.phase === 'won' || s.phase === 'lost') return 'not_in_battle';
  if (s.phase === 'choice') return 'choice_pending';
  const L = s.laser;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return 'not_available';
  if (!L.active && L.cooldown > 0) return 'on_cooldown';
  L.x = Math.min(Math.max(x, 0), FIELD_W);
  L.y = Math.min(Math.max(y, 0), FIELD_H);
  if (!L.active) {
    L.active = true;
    L.duration = laserDuration(s);
    L.timeLeft = L.duration;
    L.cooldownTotal = laserCooldownTotal(s);
    if (s.ev.has('laser')) s.ev.emit('laser', { state: L });
  }
  s.wakeUnits();
  return null;
}

function endLaser(s: Sim): void {
  const L = s.laser;
  L.active = false;
  L.timeLeft = 0;
  L.cooldown = L.cooldownTotal;
  for (const e of s.enemies) e.focused = false;
  if (s.ev.has('laserEnd')) s.ev.emit('laserEnd', { state: L });
}

export function updateLaser(s: Sim): void {
  const L = s.laser;
  if (!L.active) {
    if (L.cooldown > 0) L.cooldown = Math.max(0, L.cooldown - TICK);
    return;
  }
  L.timeLeft -= TICK;
  const r2 = L.radius * L.radius;
  for (const e of s.enemies) {
    const dx = e.x - L.x;
    const dy = e.y - L.y;
    e.focused = dx * dx + dy * dy <= r2;
  }
  if (L.timeLeft <= 0) endLaser(s);
}

// ───────────────────────────── timed relics ─────────────────────────────

/** Auto feeder and shooting star. */
export function updateRelics(s: Sim): void {
  const now = s.time;
  const fx = s.fx;
  if (fx.feederEvery && now >= s.feederAt) {
    s.feederAt += fx.feederEvery;
    addFish(s, fx.feederFish ?? 0, 'relic');
  }
  if (fx.starEvery && now >= s.starAt) {
    s.starAt += fx.starEvery;
    shootingStar(s, fx.starTargets ?? 0, (fx.starHp ?? 0) * hpIndex(s.wave));
  }
}

function shootingStar(s: Sim, count: number, damage: number): void {
  const list = s.enemies;
  chosen.length = 0;
  const pool = near;
  pool.length = 0;
  for (const e of list) pool.push(e);
  for (let k = 0; k < count && k < pool.length; k++) {
    const j = k + Math.floor(s.rng.combat.next() * (pool.length - k));
    const tmp = pool[k] as SimEnemy;
    pool[k] = pool[j] as SimEnemy;
    pool[j] = tmp;
    chosen.push(tmp);
  }
  if (s.ev.has('strike')) {
    const out: StrikePoint[] = [];
    for (const e of chosen) out.push({ x: e.x, y: e.y, uid: e.uid });
    s.ev.emit('strike', { unitId: null, relic: 'shooting_star', x: FIELD_W / 2, y: FIELD_H / 2, radius: 0, points: out });
  }
  for (const e of chosen) if (!e.dead) damageEnemy(s, e, damage, 'magic', null, false, null);
}
