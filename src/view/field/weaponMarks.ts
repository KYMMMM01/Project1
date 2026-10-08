/**
 * The marks of a weapon on the playfield, painted and pooled: what a swing leaves in the air (an arc, a thin line, a wide sweep),
 * what a blow leaves where it lands (a star burst for a blunt hit, a stuck arrow, a splat, a scorch with the flare of the fire, a spark,
 * a ring of light, notes, a coin) and the puff of a cork gun. The bright ones are drawn with additive light, so a blow lights up the
 * enemy it lands on for a moment. Which cat makes which mark is the table in `view/weapons.ts`; this class only draws them.
 *
 * Every mark is a small pooled group of sprites that animates analytically for a fraction of a second: nothing is allocated
 * while a fight runs, and a crowded moment cannot pile marks up (a fixed number at once, and the light ones give way first).
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { clamp01, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Light } from '@/fx/light';
import { paint, type PaintId } from '@/fx/paint';
import { fxSettings } from '@/fx/settings';
import { fxTex, type FxTexId } from '@/fx/textures';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui';
import { enemyDef } from '@/game';
import { CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { UNIT_IDS, type BattleEvents } from '@/game/api';
import { weaponStyle, type ImpactMark } from '../weapons';
import type { FieldEnv } from './env';

export type MarkKind =
  | 'star' | 'slash' | 'line' | 'arrow' | 'splat' | 'scorch' | 'flare' | 'spark' | 'ring' | 'notes' | 'coin' | 'puff';

/** Marks alive at once, and how many a single frame may start. */
const MAX_MARKS = 22;
const PER_FRAME = 8;
/** Above this many live marks only the weighty ones are started (a crowded moment keeps its biggest blows readable). */
const BUSY = 14;

const CREAM = Hue.cream;
const PARTS = 5;

interface Spawn {
  kind: MarkKind;
  x: number;
  y: number;
  angle: number;
  size: number;
  tint: number;
  /** An enemy the mark rides on (a stuck arrow), or 0. */
  uid?: number;
}

/** A pooled mark: a root and a handful of sprites that each kind dresses as it needs. */
class Mark {
  readonly root = new Container();
  readonly parts: Sprite[] = [];
  /** Natural size of each part's texture in design px (the size of the picture, for a painted one, which is scaled, not sized). */
  readonly nw = new Float32Array(PARTS).fill(1);
  readonly nh = new Float32Array(PARTS).fill(1);
  kind: MarkKind = 'star';
  active = false;
  age = 0;
  life = 0;
  x = 0;
  y = 0;
  angle = 0;
  size = 1;
  tint = 0;
  uid = 0;
  /** A stable variation per mark (which way the droplets fly). */
  seed = 0;

  constructor() {
    this.root.eventMode = 'none';
    this.root.visible = false;
    for (let i = 0; i < PARTS; i++) {
      const s = new Sprite();
      s.anchor.set(0.5);
      s.eventMode = 'none';
      s.visible = false;
      this.root.addChild(s);
      this.parts.push(s);
    }
  }

  /** Dress part `i` as an atlas shape that is `w` x `h` design px. */
  atlas(i: number, id: FxTexId, w: number, h: number, tint: number): void {
    const info = fxTex(id);
    const s = this.parts[i] as Sprite;
    s.texture = info.texture;
    s.anchor.set(info.ax, info.ay);
    this.nw[i] = info.w;
    this.nh[i] = info.h;
    s.tint = tint;
    s.alpha = 1;
    s.rotation = 0;
    s.position.set(0, 0);
    s.scale.set(w / info.w, h / info.h);
    s.visible = true;
  }

  /** Dress part `i` as a painted picture `w` design px wide (its height follows the picture's shape). */
  paint(i: number, id: PaintId, w: number, tint: number = Color.white): void {
    const texture: Texture = paint(id);
    const s = this.parts[i] as Sprite;
    s.texture = texture;
    s.anchor.set(0.5);
    this.nw[i] = Math.max(1, texture.width);
    this.nh[i] = Math.max(1, texture.height);
    s.tint = tint;
    s.alpha = 1;
    s.rotation = 0;
    s.position.set(0, 0);
    s.scale.set(w / (this.nw[i] as number));
    s.visible = true;
  }

  size2(i: number, w: number, h: number): void {
    (this.parts[i] as Sprite).scale.set(w / (this.nw[i] as number), h / (this.nh[i] as number));
  }

  /** Resize part `i` to `w` wide, keeping its picture's shape. */
  size1(i: number, w: number): void {
    (this.parts[i] as Sprite).scale.set(w / (this.nw[i] as number));
  }

  hideAll(): void {
    for (const s of this.parts) s.visible = false;
  }
}

/** Seconds each kind lasts. */
const LIFE: Readonly<Record<MarkKind, number>> = {
  star: 0.26, slash: 0.22, line: 0.22, arrow: 0.8, splat: 0.7, scorch: 1.1, flare: 0.24, spark: 0.2, ring: 0.4, notes: 0.85, coin: 0.6, puff: 0.5,
};

/** The marks that are light (drawn additively): the rest are painted things lying on the floor or flying. */
const ADDS: Readonly<Record<MarkKind, boolean>> = {
  star: true, slash: true, line: true, arrow: false, splat: false, scorch: false, flare: true, spark: true, ring: true, notes: false, coin: false, puff: false,
};

export class WeaponMarks {
  private readonly pool: Mark[] = [];
  private readonly live: Mark[] = [];
  private readonly offs: Array<() => void> = [];
  /** Where each cat type last attacked from: a stuck arrow and a line need the direction of the shot. */
  private readonly from = new Float32Array(UNIT_IDS.length * 2);
  private readonly index: Record<string, number> = {};
  private started = 0;
  private seq = 0;

  constructor(
    private readonly env: FieldEnv,
    private readonly layer: Container,
  ) {
    UNIT_IDS.forEach((id, i) => {
      this.index[id] = i;
    });
    const ev = env.battle.events;
    this.offs.push(
      ev.on('attack', (e) => this.onAttack(e)),
      ev.on('strike', (e) => this.onStrike(e)),
      ev.on('hit', (e) => this.onHit(e)),
      ev.on('projectileEnd', (e) => this.onProjectileEnd(e)),
    );
  }

  /** Marks showing right now. */
  get count(): number {
    return this.live.length;
  }

  // ── events ──

  private onAttack(e: BattleEvents['attack']): void {
    const u = e.unit;
    const i = (this.index[u.id] as number) * 2;
    this.from[i] = cellX(u.cell);
    this.from[i + 1] = cellY(u.cell);
    const style = weaponStyle(u.id);
    const ax = this.from[i] as number;
    const ay = this.from[i + 1] as number;
    const ang = Math.atan2(e.ty - ay, e.tx - ax);
    if (style.swing === 'chop') this.spawn({ kind: 'slash', x: e.tx, y: e.ty - 6, angle: ang + Math.PI / 2.4, size: 0.85 * style.weight, tint: style.tint });
    if (style.muzzle === 'puff') this.spawn({ kind: 'puff', x: ax + Math.cos(ang) * 38, y: ay + Math.sin(ang) * 38 - 8, angle: ang, size: style.weight, tint: Color.kraft });
  }

  private onStrike(e: BattleEvents['strike']): void {
    if (!e.unitId) return;
    const style = weaponStyle(e.unitId);
    const i = (this.index[e.unitId] as number) * 2;
    const ang = Math.atan2(e.y - (this.from[i + 1] as number), e.x - (this.from[i] as number));
    if (style.swing === 'arc') this.spawn({ kind: 'slash', x: e.x, y: e.y, angle: ang, size: Math.max(0.8, e.radius / 75), tint: style.tint });
    else if (style.swing === 'line') this.spawn({ kind: 'line', x: e.x, y: e.y, angle: ang, size: Math.max(0.8, e.radius / 100), tint: style.tint });
    else if (style.swing === 'sweep') this.spawn({ kind: 'slash', x: e.x, y: e.y, angle: ang, size: Math.max(1.2, e.radius / 60), tint: style.tint });
  }

  private onHit(e: BattleEvents['hit']): void {
    if (e.dot || !e.unitId) return;
    const style = weaponStyle(e.unitId);
    const kind = KIND_OF[style.impact];
    // Splashes land with their shot and a flask with its area: those are drawn once, not once per enemy.
    if (!kind) return;
    const def = enemyDef(e.enemy.id);
    const big = def.traits.includes('boss') || def.traits.includes('elite');
    const weight = style.weight * (e.crit ? 1.35 : 1) * (big ? 1.2 : 1);
    if (this.live.length >= BUSY && weight < 1 && !e.killed) return;
    const i = (this.index[e.unitId] as number) * 2;
    const ang = Math.atan2(e.enemy.y - (this.from[i + 1] as number), e.enemy.x - (this.from[i] as number));
    const small = style.impact === 'slash' || style.impact === 'line';
    this.spawn({
      kind,
      x: e.enemy.x - Math.cos(ang) * def.radius * 0.35,
      y: e.enemy.y - def.radius * 0.3,
      angle: ang,
      size: weight * (small ? 0.5 : 1) * (def.radius / 20 > 1.4 ? 1.2 : 1),
      tint: style.tint,
      uid: kind === 'arrow' ? e.enemy.uid : 0,
    });
  }

  private onProjectileEnd(e: BattleEvents['projectileEnd']): void {
    if (!e.hit) return;
    const style = weaponStyle(e.projectile.unitId);
    if (style.impact === 'splat') this.spawn({ kind: 'splat', x: e.x, y: e.y + 8, angle: e.projectile.angle, size: style.weight, tint: style.tint });
    else if (style.impact === 'scorch') {
      this.spawn({ kind: 'scorch', x: e.x, y: e.y + 8, angle: 0, size: style.weight, tint: style.tint });
      this.spawn({ kind: 'flare', x: e.x, y: e.y, angle: 0, size: style.weight, tint: Light.warm });
    }
  }

  // ── pool ──

  private spawn(s: Spawn): void {
    if (this.live.length >= MAX_MARKS || this.started >= PER_FRAME) return;
    this.started++;
    let m = this.pool.pop();
    if (!m) {
      m = new Mark();
      this.layer.addChild(m.root);
    }
    m.kind = s.kind;
    m.active = true;
    m.age = 0;
    m.life = LIFE[s.kind];
    m.x = s.x;
    m.y = s.y;
    m.angle = s.angle;
    m.size = s.size;
    m.tint = s.tint;
    m.uid = s.uid ?? 0;
    m.seed = (this.seq++ * 0.6180339) % 1;
    m.hideAll();
    m.root.visible = true;
    m.root.blendMode = ADDS[s.kind] ? 'add' : 'normal';
    m.root.position.set(s.x, s.y);
    m.root.rotation = 0;
    m.root.alpha = 1;
    dress(m);
    this.live.push(m);
    animate(m, this.env);
  }

  update(dt: number): void {
    this.started = 0;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const m = this.live[i] as Mark;
      m.age += dt;
      if (m.age >= m.life) {
        m.active = false;
        m.root.visible = false;
        this.live[i] = this.live[this.live.length - 1] as Mark;
        this.live.pop();
        this.pool.push(m);
        continue;
      }
      animate(m, this.env);
    }
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    for (const m of this.live) m.root.destroy({ children: true });
    for (const m of this.pool) m.root.destroy({ children: true });
    this.live.length = 0;
    this.pool.length = 0;
  }
}

/** Which mark an impact draws on the enemy (null = drawn elsewhere: with the shot's landing, or where the thrown flask lands). */
const KIND_OF: Readonly<Record<ImpactMark, MarkKind | null>> = {
  star: 'star', slash: 'slash', line: 'line', arrow: 'arrow', splat: null, scorch: null, spark: 'spark', ring: 'ring', notes: 'notes', coin: 'coin', shatter: null,
};

function cellX(cell: number): number {
  return CELL_X[cell] as number;
}
function cellY(cell: number): number {
  return CELL_Y[cell] as number;
}

const CELL_X = Array.from({ length: CELL_COUNT }, (_, c) => cellCenterX(c));
const CELL_Y = Array.from({ length: CELL_COUNT }, (_, c) => cellCenterY(c));

// ───────────────────────────── dressing and animation of each kind ─────────────────────────────

function dress(m: Mark): void {
  const tint = m.tint;
  switch (m.kind) {
    case 'star':
      m.paint(0, 'burst_star', 84, tint);
      m.paint(1, 'burst_glint', 70, CREAM);
      break;
    case 'slash':
      m.paint(0, 'burst_slash', 160, mixColor(tint, Light.shieldHit, 0.25));
      m.paint(1, 'burst_slash', 140, CREAM);
      break;
    case 'line':
      m.atlas(0, 'streak', 200, 10, CREAM);
      m.atlas(1, 'streak', 200, 4, tint);
      m.paint(2, 'burst_glint', 54, CREAM);
      break;
    case 'arrow':
      m.paint(0, 'shot_arrow', 68);
      break;
    case 'splat':
      m.paint(0, 'mark_snow', 100, Light.shieldHit);
      m.paint(1, 'burst_puff', 52, Light.iceWhite);
      for (let i = 2; i < 5; i++) m.atlas(i, 'droplet', 10, 14, i === 3 ? CREAM : Light.iceWhite);
      break;
    case 'scorch':
      m.paint(0, 'mark_scorch', 104, Light.shieldHit);
      m.atlas(1, 'dot', 8, 8, Hue.ember);
      m.atlas(2, 'dot', 6, 6, Hue.spark);
      break;
    case 'flare':
      m.paint(0, 'burst_star', 100, tint);
      m.paint(1, 'burst_glint', 80, CREAM);
      break;
    case 'spark':
      m.paint(0, 'burst_glint', 64, CREAM);
      m.atlas(1, 'spark', 42, 9, tint);
      m.atlas(2, 'spark', 36, 8, tint);
      break;
    case 'ring':
      m.paint(0, 'burst_ring', 36, tint);
      m.paint(1, 'burst_ring', 26, CREAM);
      break;
    case 'notes':
      for (let i = 0; i < 3; i++) m.paint(i, 'shot_note', 30 + 5 * i);
      break;
    case 'coin':
      m.paint(0, 'shot_coin', 42);
      m.atlas(1, 'sparkle', 34, 34, Hue.sun);
      break;
    case 'puff':
      for (let i = 0; i < 3; i++) m.paint(i, 'burst_puff', 20, i === 1 ? Light.dust : Light.smoke);
      break;
  }
}

function animate(m: Mark, env: FieldEnv): void {
  const calm = fxSettings.reducedMotion;
  const age = m.age;
  const p = clamp01(age / m.life);
  const k = m.size;
  const fade = 1 - clamp01((p - 0.55) / 0.45);
  const [a, b, c] = m.parts as [Sprite, Sprite, Sprite, Sprite, Sprite];
  switch (m.kind) {
    case 'star': {
      const pop = calm ? 1 : 0.35 + 0.85 * Ease.backOut(clamp01(age / 0.07));
      m.size1(0, 84 * k * pop);
      m.size1(1, 60 * k * pop);
      a.rotation = 0.2 + m.seed * 1.5;
      b.rotation = -0.3 + m.seed;
      m.root.alpha = 1 - clamp01((age - 0.1) / (m.life - 0.1));
      break;
    }
    case 'slash': {
      const sweep = calm ? 1 : Ease.cubicOut(clamp01(age / 0.1));
      m.root.rotation = m.angle + (calm ? 0 : -0.45 + 0.9 * sweep);
      m.size1(0, 170 * k * (0.5 + 0.55 * sweep));
      m.size1(1, 150 * k * (0.5 + 0.55 * sweep));
      m.root.alpha = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55;
      break;
    }
    case 'line': {
      // One thin fast line: it is drawn across in a few frames, holds, then thins away; a glint rides its tip.
      const draw = calm ? 1 : Ease.cubicOut(clamp01(age / 0.05));
      const thin = p < 0.3 ? 1 : 1 - (p - 0.3) / 0.7;
      const len = 200 * k * draw;
      m.root.rotation = m.angle - 0.45;
      for (let i = 0; i < 2; i++) {
        const s = m.parts[i] as Sprite;
        s.x = -len / 2;
        m.size2(i, len, (i === 0 ? 10 : 4) * thin);
      }
      c.x = len / 2;
      m.size1(2, 54 * k * thin);
      break;
    }
    case 'arrow': {
      const view = m.uid ? env.ctx.enemyView(m.uid) : null;
      const x = view ? view.x : m.x;
      const y = view ? view.y : m.y;
      const wob = calm ? 0 : 0.28 * Math.sin(age * 40) * clamp01(1 - age / 0.35);
      m.root.position.set(x, y);
      a.rotation = m.angle + wob;
      a.position.set(-Math.cos(m.angle) * 12, -Math.sin(m.angle) * 12);
      m.root.alpha = age < 0.55 ? 1 : 1 - (age - 0.55) / 0.25;
      break;
    }
    case 'splat': {
      // A snow splat lies flat on the floor; a puff of snow leaps off it and the drops fly.
      const grow = calm ? 1 : Ease.backOut(clamp01(age / 0.1));
      const w = 100 * k * (0.4 + 0.6 * grow);
      a.scale.set(w / (m.nw[0] as number), (w * 0.52) / (m.nh[0] as number));
      a.alpha = p < 0.55 ? 0.95 : 0.95 * (1 - (p - 0.55) / 0.45);
      const puff = calm ? 0.3 : Ease.cubicOut(clamp01(age / 0.3));
      m.size1(1, (30 + 38 * puff) * k);
      b.y = -10 - 16 * puff;
      b.alpha = 0.8 * (1 - puff);
      const fly = calm ? 0 : 1;
      for (let i = 2; i < 5; i++) {
        const s = m.parts[i] as Sprite;
        const dir = -Math.PI / 2 + (i - 3) * 0.7 + (m.seed - 0.5) * 0.4;
        const sp = 95 * k;
        s.x = Math.cos(dir) * sp * age * fly;
        s.y = Math.sin(dir) * sp * age * fly + 0.5 * 420 * age * age * fly - 6;
        s.alpha = fly * (1 - clamp01((age - 0.2) / 0.2));
        s.rotation = dir + Math.PI / 2;
      }
      break;
    }
    case 'scorch': {
      // The char stays on the floor and cools; embers rise from it.
      const w = 104 * k * (calm ? 1 : 0.6 + 0.4 * Ease.backOut(clamp01(age / 0.12)));
      a.scale.set(w / (m.nw[0] as number), (w * 0.55) / (m.nh[0] as number));
      a.alpha = p < 0.5 ? 0.95 : 0.95 * (1 - (p - 0.5) / 0.5);
      const rise = calm ? 0 : 1;
      b.position.set(-8 * k, -age * 40 * rise);
      c.position.set(10 * k, -age * 32 * rise - 4);
      b.alpha = c.alpha = 1 - clamp01((age - 0.3) / 0.5);
      break;
    }
    case 'flare': {
      // The flash of a fireball landing: a burst of light that opens and is gone in a few frames.
      const open = calm ? 1 : Ease.cubicOut(clamp01(age / 0.1));
      m.size1(0, 100 * k * (0.5 + 0.7 * open));
      m.size1(1, 80 * k * (0.4 + 0.6 * open));
      a.rotation = m.seed * 3;
      m.root.alpha = 1 - clamp01((age - 0.06) / (m.life - 0.06));
      break;
    }
    case 'spark': {
      const pop = calm ? 1 : 0.4 + 0.7 * Ease.backOut(clamp01(age / 0.06));
      m.size1(0, 64 * k * pop);
      a.rotation = m.seed * 2;
      const out = calm ? 0.5 : clamp01(age / 0.12);
      b.rotation = m.angle + 2.4;
      c.rotation = m.angle - 2.4;
      b.position.set(Math.cos(m.angle + 2.4) * 24 * out, Math.sin(m.angle + 2.4) * 24 * out);
      c.position.set(Math.cos(m.angle - 2.4) * 20 * out, Math.sin(m.angle - 2.4) * 20 * out);
      m.root.alpha = 1 - clamp01((age - 0.06) / (m.life - 0.06));
      break;
    }
    case 'ring': {
      const e1 = calm ? 1 : Ease.cubicOut(p);
      m.size1(0, (36 + 130 * e1) * k);
      a.alpha = 0.95 * (1 - p);
      const e2 = calm ? 0 : Ease.cubicOut(clamp01((age - 0.05) / (m.life - 0.05)));
      m.size1(1, (26 + 90 * e2) * k);
      b.alpha = calm ? 0 : 0.8 * (1 - clamp01((age - 0.05) / (m.life - 0.05)));
      break;
    }
    case 'notes': {
      const move = calm ? 0.3 : 1;
      for (let i = 0; i < 3; i++) {
        const s = m.parts[i] as Sprite;
        const t = age - i * 0.06;
        s.visible = t > 0;
        s.x = (i - 1) * 20 * k * move + Math.sin(t * 9 + i * 2) * 6 * move;
        s.y = -52 * t * move * (0.8 + 0.2 * i) - 6;
        s.rotation = Math.sin(t * 7 + i) * 0.3 * move;
        s.alpha = 1 - clamp01((t - 0.35) / 0.4);
      }
      break;
    }
    case 'coin': {
      const hop = calm ? 0.4 : Math.sin(Math.PI * clamp01(age / 0.48));
      a.y = -36 * k * hop;
      const w = 42 / (m.nw[0] as number);
      a.scale.set((calm ? 1 : Math.cos(age * 22)) * w, w);
      m.size2(1, 34 * k * (1 - p), 34 * k * (1 - p));
      b.alpha = 1 - p * 2;
      m.root.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
      break;
    }
    case 'puff': {
      const drift = calm ? 0.4 : 1;
      for (let i = 0; i < 3; i++) {
        const s = m.parts[i] as Sprite;
        const t = clamp01(age / m.life);
        const dir = m.angle + (i - 1) * 0.7;
        s.x = Math.cos(dir) * 26 * t * drift;
        s.y = Math.sin(dir) * 26 * t * drift - 30 * t * drift;
        m.size1(i, (22 + 34 * t + 5 * i) * k);
        s.alpha = 0.55 * (1 - t) * fade;
      }
      break;
    }
  }
}
