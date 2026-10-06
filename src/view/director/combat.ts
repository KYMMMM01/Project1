/**
 * Combat staging: shot cues, hits, floating numbers, status cues, pulls, heals, strikes drawn per
 * source, projectile impacts and zone sounds. Everything here fires many times a second, so it only
 * reads pooled fx, preallocated colour tables and the rate gates.
 */
import { lighten } from '@/core/math';
import type { BattleEvents, EnemyState, StatusKind, UnitId, UnitState } from '@/game';
import { UNIT_IDS, unitSpec } from '@/game';
import { cellAt, cellCenterX, cellCenterY } from '@/game/geometry';
import { Trauma } from '@/fx';
import {
  AGGREGATION_WINDOW,
  FrameBudget,
  GapGate,
  KeyedGate,
  NumberAggregator,
  numberDensity,
  shouldShowNumber,
  type NumberKind,
} from './policy';
import {
  CAST_RING,
  CRACKS,
  CRACK_FLASH,
  DRIPS,
  EMBERS,
  FIZZLE,
  HIT_FLASH,
  HIT_SPARK,
  ICE_CRYSTALS,
  IMPACT_MOTES,
  IMPACT_PUFF,
  BUBBLES,
  MUZZLE_FLASH,
  MUZZLE_STREAK,
  PULL_STREAKS,
  SHIELD_GLANCE,
  SHIELD_SPARK,
  STAR_POP,
  STUN_STARS,
  VULN_PULSE,
} from './defs';
import { DOT_NUMBER_COLOR, SHIELD_COLOR, SHOOT_CUE, STATUS_COLOR, STATUS_SFX, UNIT_COLOR } from './palette';
import { Gate, enemyInfo, type Bus, type Stage } from './stage';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

const W = Hue.cream;
const PI = Math.PI;

/** [white, pale, colour] ramps per cat so a spark never builds an array. */
const RAMP = {} as Record<UnitId, readonly number[]>;
for (const id of UNIT_IDS) RAMP[id] = [W, lighten(UNIT_COLOR[id], 0.7), UNIT_COLOR[id]];
const NEUTRAL_RAMP: readonly number[] = [W, Hue.sun, Hue.spark];

/** Flash size and streak count of the muzzle cue per cat: a gunner kicks, a ninja flicks, a mage casts. */
const MUZZLE_SHAPE: Partial<Record<UnitId, readonly [flash: number, streaks: number]>> = {
  r_sling: [0.8, 1],
  r_archer: [0.9, 1.5],
  r_ninja: [0.9, 2.2],
  r_gunner: [1.7, 2],
  r_star: [1.2, 1.2],
  m_snow: [1.1, 0],
  m_fire: [1.3, 0],
  t_bell: [0.7, 0],
  t_chef: [0.8, 0],
  t_bard: [0.8, 0],
  t_lucky: [0.9, 0.5],
};

const UNIT_INDEX = {} as Record<UnitId, number>;
UNIT_IDS.forEach((id, i) => {
  UNIT_INDEX[id] = i;
});

const KIND_INDEX: Record<StatusKind, number> = {
  slow: 0, stun: 1, freeze: 2, burn: 3, poison: 4, bleed: 5, armor_break: 6, vulnerable: 7,
};
/** KeyedGate sub-ids beyond the status kinds. */
const SUB_SHIELD = 8;
const SUB_PULL = 9;
const SUB_HEAL = 10;
const SUB_DOT = 11;

const ZONE_SFX: Partial<Record<UnitId, { sfx: 'freeze' | 'zap' | 'splash'; pitch: number; volume: number }>> = {
  m_frost: { sfx: 'freeze', pitch: 0.8, volume: 0.5 },
  m_cosmo: { sfx: 'zap', pitch: 0.5, volume: 0.55 },
  t_alch: { sfx: 'splash', pitch: 1, volume: 0.4 },
};

export function mountCombat(stage: Stage, on: Bus): void {
  const ctx = stage.ctx;
  const fx = stage.fx;
  const ps = fx.ps;
  const shootByUnit = new GapGate(UNIT_IDS.length);
  const perEnemy = new KeyedGate(256);
  const agg = new NumberAggregator();
  const sparks = new FrameBudget(14);
  const muzzles = new FrameBudget(10);
  /** The unit behind the latest attack event: strikes carry only a unit type, not which cat fired. */
  let lastAttacker: UnitState | null = null;

  const enemyByUid = (uid: number): EnemyState | null => {
    for (const e of ctx.battle.enemies) if (e.uid === uid) return e;
    return null;
  };

  on('attack', (e) => {
    const u = e.unit;
    lastAttacker = u;
    const cue = SHOOT_CUE[u.id];
    if (shootByUnit.ready(UNIT_INDEX[u.id], stage.now, 0.06)) stage.play(stage.rules.shoot, cue.sfx, cue.volume, cue.pitch, 0.05);
    if (!sparks.take()) return;
    const cx = cellCenterX(u.cell);
    const cy = cellCenterY(u.cell);
    const ang = Math.atan2(e.ty - cy, e.tx - cx);
    const ramp = RAMP[u.id];
    if (cue.style === 'shot') {
      if (!muzzles.take()) return;
      const shape = MUZZLE_SHAPE[u.id] ?? [1, 1];
      const mx = cx + Math.cos(ang) * 34;
      const my = cy + Math.sin(ang) * 34 - 10;
      ps.burst(MUZZLE_FLASH, mx, my, { colors: ramp, scale: shape[0] });
      if (shape[1] > 0 && stage.detail > 0) ps.burst(MUZZLE_STREAK, mx, my, { colors: ramp, dir: ang, count: shape[1] / 2 });
    } else if (cue.style === 'cast') {
      ps.burst(CAST_RING, cx, cy - 10, { colors: ramp, scale: 0.9 });
    } else if (u.id === 'w_paw' || u.id === 'w_viking') {
      // The cats with no strike event swing a small claw mark of their own.
      fx.slashArc(e.tx, e.ty, { angle: ang, scale: u.id === 'w_paw' ? 0.45 : 0.75, color: UNIT_COLOR[u.id] });
    }
  });

  on('hit', (e) => {
    const en = e.enemy;
    const info = enemyInfo(en.id);
    const dealt = e.amount - e.absorbed;
    const x = en.x;
    const y = en.y - info.radius * 0.4;
    const ramp = e.unitId ? RAMP[e.unitId] : NEUTRAL_RAMP;
    const density = numberDensity(fx.numbers.count, fx.numbers.cap);
    // Enemies bunched on the loop would stack their numbers exactly: lift each by a small amount of its own.
    const lift = (en.uid & 3) * 9;

    if (e.dot) {
      if (perEnemy.ready(en.uid, SUB_DOT, stage.now, 0.5)) dotCue(en, e.dot, info.radius);
      const kind: NumberKind = 'dot';
      if (dealt > 0 && shouldShowNumber(density, kind, dealt, en.maxHp, info.big)) {
        fx.number(x, y - info.radius - 4 - lift, dealt, 'dot', { key: en.uid, color: DOT_NUMBER_COLOR[e.dot], scale: 0.9 });
      }
      return;
    }

    if (e.crit) {
      const strong = info.big && stage.gates.ready(Gate.critShake, stage.now, 0.4);
      fx.critBurst(x, y, { strong, scale: info.big ? 1.2 : 1 });
      fx.number(x, y - info.radius - 8 - lift, dealt, 'crit');
      stage.play(stage.rules.hit, 'hit_light', 0.6, 1.1, 0.04);
      stage.play(stage.rules.crit, 'crit', 0.55, 1, 0.03);
      stage.buzz('tap', Gate.critBuzz, 0.2);
      if (info.big) stage.stop(33);
    } else {
      if (density < 2 || info.big) lightSpark(x, y, ramp, info.big ? 1.3 : 1);
      const merged = agg.add(en.uid, dealt, stage.now, AGGREGATION_WINDOW);
      const wasVisible = agg.visible;
      let show = wasVisible;
      if (!merged) show = shouldShowNumber(density, 'normal', dealt, en.maxHp, info.big);
      else if (!wasVisible) show = shouldShowNumber(density, 'normal', agg.total, en.maxHp, info.big);
      if (show) {
        // A window that was held back shows its running total once it is worth a slot.
        const value = merged && !wasVisible ? agg.total : dealt;
        if (merged && !wasVisible) agg.reveal();
        const big = info.big && dealt >= en.maxHp * 0.2;
        fx.number(x, y - info.radius - 6 - lift, value, big ? 'big' : 'damage', { key: en.uid });
      } else if (!merged) agg.suppress();

      const heavy = info.big || dealt >= en.maxHp * 0.08;
      if (heavy) stage.play(stage.rules.heavyHit, 'hit_heavy', 0.5, 1, 0.05);
      else stage.play(stage.rules.hit, 'hit_light', 0.5, 1, 0.06);
    }

    if (e.absorbed > 0 && perEnemy.ready(en.uid, SUB_SHIELD, stage.now, 0.1)) {
      ps.burst(SHIELD_GLANCE, x, y, { colors: [W, SHIELD_COLOR], scale: info.radius / 20 });
      if (stage.detail > 0) ps.burst(SHIELD_SPARK, x, y, { colors: [W, SHIELD_COLOR] });
      if (density === 0) fx.number(x + 22, y - info.radius - 18, e.absorbed, 'damage', { color: SHIELD_COLOR, scale: 0.7 });
    }
  });

  /** A small spark per ordinary hit, rationed per frame and per second. */
  function lightSpark(x: number, y: number, ramp: readonly number[], scale: number): void {
    if (!sparks.take() || !stage.gates.ready(Gate.spark, stage.now, 0.02)) return;
    ps.burst(HIT_FLASH, x, y, { colors: ramp, scale });
    ps.burst(HIT_SPARK, x, y, { colors: ramp, scale, count: stage.detail === 0 ? 0.6 : 1 });
  }

  /** Embers, bubbles or drips for a damage-over-time tick. */
  function dotCue(en: EnemyState, kind: StatusKind, radius: number): void {
    const x = en.x;
    const y = en.y - radius * 0.2;
    const s = radius / 18;
    if (kind === 'burn') ps.burst(EMBERS, x, y, { scale: s, count: 0.6 });
    else if (kind === 'poison') ps.burst(BUBBLES, x, y, { scale: s, count: 0.6 });
    else if (kind === 'bleed') ps.burst(DRIPS, x, y, { scale: s, count: 0.6 });
  }

  on('status', (e) => {
    const en = e.enemy;
    const kind = e.kind;
    if (!perEnemy.ready(en.uid, KIND_INDEX[kind], stage.now, 0.6)) return;
    const info = enemyInfo(en.id);
    const x = en.x;
    const y = en.y - info.radius * 0.3;
    const s = Math.max(0.7, info.radius / 18);
    switch (kind) {
      case 'slow':
        ps.burst(ICE_CRYSTALS, x, y, { scale: s, count: 0.7 });
        break;
      case 'freeze':
        ps.burst(ICE_CRYSTALS, x, y, { scale: s * 1.2, count: 1.6 });
        fx.shockwave(x, y, { color: STATUS_COLOR.freeze, radius: 56 * s });
        break;
      case 'burn':
        ps.burst(EMBERS, x, y, { scale: s });
        break;
      case 'poison':
        ps.burst(BUBBLES, x, y, { scale: s });
        break;
      case 'bleed':
        ps.burst(DRIPS, x, y, { scale: s });
        break;
      case 'armor_break':
        ps.burst(CRACKS, x, y, { scale: s });
        ps.burst(CRACK_FLASH, x, y, { scale: s });
        break;
      case 'stun':
        ps.burst(STUN_STARS, x, y - info.radius * 0.7, { scale: s });
        break;
      case 'vulnerable':
        ps.burst(VULN_PULSE, x, y, { scale: s });
        break;
    }
    const cue = STATUS_SFX[kind];
    if (cue) stage.play(stage.rules.status, cue.sfx, cue.volume, cue.pitch, 0.05);
  });

  on('pull', (e) => {
    const en = e.enemy;
    if (!perEnemy.ready(en.uid, SUB_PULL, stage.now, 0.18)) return;
    const back = en.angle + PI;
    const info = enemyInfo(en.id);
    ps.burst(PULL_STREAKS, en.x + Math.cos(en.angle) * info.radius, en.y + Math.sin(en.angle) * info.radius, {
      colors: [W, Hue.heart, Color.berry],
      dir: back,
      scale: Math.max(0.8, info.radius / 20),
    });
  });

  on('shieldBreak', (e) => {
    const info = enemyInfo(e.enemy.id);
    fx.shieldBreak(e.enemy.x, e.enemy.y - info.radius * 0.3, { scale: Math.max(0.8, info.radius / 20) });
    stage.play(stage.rules.heavyHit, 'shield_break', 0.7, 1, 0.04);
  });

  on('heal', (e) => {
    const en = e.enemy;
    if (!perEnemy.ready(en.uid, SUB_HEAL, stage.now, 0.9)) return;
    const info = enemyInfo(en.id);
    fx.healPlus(en.x, en.y - info.radius, { scale: 0.7 });
    stage.play(stage.rules.heal, 'heal', 0.3, 1, 0.04);
  });

  on('strike', (e) => stageStrike(e));

  function stageStrike(e: BattleEvents['strike']): void {
    if (e.relic === 'shooting_star') {
      const n = Math.min(3, e.points.length);
      for (let i = 0; i < n; i++) {
        const p = e.points[i];
        if (p) stage.later(i * 0.12, () => fx.shootingStar(p.x, p.y));
      }
      stage.direct('star', 0.6);
      return;
    }
    const id = e.unitId;
    if (!id || !stage.rules.strike.allow(stage.now)) return;
    const src = lastAttacker && lastAttacker.id === id ? lastAttacker : null;
    const cx = src ? cellCenterX(src.cell) : e.x;
    const cy = src ? cellCenterY(src.cell) : e.y;
    const color = UNIT_COLOR[id];
    switch (id) {
      case 'w_sword':
        fx.slashArc(e.x, e.y, { angle: Math.atan2(e.y - cy, e.x - cx), scale: Math.max(0.85, e.radius / 70), color });
        stage.direct('hit_heavy', 0.5, 1.1);
        break;
      case 'w_samurai': {
        const first = e.points[0];
        const en = first ? enemyByUid(first.uid) : null;
        const a = en ? en.angle : 0;
        const r = e.radius;
        fx.slashLine(e.x - Math.cos(a) * r, e.y - Math.sin(a) * r, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, { color });
        stage.direct('hit_heavy', 0.55, 1.4);
        break;
      }
      case 'w_tiger':
        // The stomp every fourth swing is centred on the cat's own cell; the ordinary blast lands on the enemy.
        if (cellAt(e.x, e.y) >= 0) {
          fx.shockwave(e.x, e.y, { color, radius: e.radius });
          fx.dustPuff(e.x, e.y, { scale: 1.4 });
          stage.shake(Trauma.t2, Gate.strikeShake, 0.4);
          stage.play(stage.rules.big, 'boss_roar', 0.55, 1.5, 0.03);
          stage.buzz('medium');
        } else {
          fx.shockwave(e.x, e.y, { color, radius: e.radius * 0.9 });
          fx.dustPuff(e.x, e.y, { scale: 0.8 });
          stage.direct('hit_heavy', 0.6, 0.8);
        }
        break;
      case 'r_star': {
        const last = e.points[e.points.length - 1];
        if (last) fx.slashLine(cx, cy, last.x, last.y, { color, thickness: 0.7 });
        for (const p of e.points) ps.burst(STAR_POP, p.x, p.y, { colors: RAMP.r_star });
        stage.direct('shoot_magic', 0.5, 1.5);
        break;
      }
      case 'm_storm': {
        const pts = e.points;
        let ax = cx;
        let ay = cy;
        const n = Math.min(pts.length, 5);
        for (let i = 0; i < n; i++) {
          const p = pts[i];
          if (!p) break;
          const x0 = ax;
          const y0 = ay;
          if (i === 0) fx.lightning(x0, y0, p.x, p.y, { color, branches: 1 });
          else stage.later(i * 0.035, () => fx.lightning(x0, y0, p.x, p.y, { color, branches: 1, scale: 0.9 }));
          ax = p.x;
          ay = p.y;
        }
        stage.direct('zap', 0.45, 1.1);
        break;
      }
      case 't_lucky':
        if (stage.gates.ready(Gate.coinRain, stage.now, 3)) {
          fx.coinRain({ count: 26, x: 360, width: 640, height: 640 });
          stage.direct('coin_many', 0.6);
        }
        break;
      default:
        fx.shockwave(e.x, e.y, { color, radius: Math.max(50, e.radius) });
    }
  }

  on('projectileEnd', (e) => {
    const p = e.projectile;
    if (!e.hit) {
      ps.burst(FIZZLE, e.x, e.y, { count: 0.6 });
      return;
    }
    const ramp = RAMP[p.unitId];
    const spec = unitSpec(p.unitId).attack;
    if (spec.shape === 'splash') {
      // Area shots show their reach: a ring the size of the splash and a bigger flash.
      fx.shockwave(e.x, e.y, { color: UNIT_COLOR[p.unitId], radius: spec.radius * 0.9 });
      ps.burst(IMPACT_PUFF, e.x, e.y, { colors: ramp, scale: 1.6 });
      if (p.unitId === 'm_fire' && stage.gates.ready(Gate.strikeFx, stage.now, 0.25)) fx.explosion(e.x, e.y, { scale: 0.45, color: UNIT_COLOR.m_fire });
      stage.play(stage.rules.heavyHit, 'explosion', 0.35, p.unitId === 'm_snow' ? 1.4 : 1, 0.06);
      return;
    }
    ps.burst(IMPACT_PUFF, e.x, e.y, { colors: ramp });
    if (stage.detail > 0) ps.burst(IMPACT_MOTES, e.x, e.y, { colors: ramp, count: 0.7 });
  });

  on('zoneStart', (e) => {
    const cue = ZONE_SFX[e.zone.unitId];
    if (cue) stage.play(stage.rules.zone, cue.sfx, cue.volume, cue.pitch, 0.03);
  });

  on('zoneEnd', () => {
    stage.play(stage.rules.zone, 'whoosh', 0.2, 1.4, 0.05);
  });

  stage.addFrame(() => {
    sparks.refill();
    muzzles.refill();
  });
}
