/**
 * Shield Shove, the viking's scene (docs/design_skills_v2.md 3.1): the shield slams down, a wedge of dust spreads over the road inside the
 * cat's reach, and the enemies it pushed slide back with an afterimage where they stood and a swipe on the ground toward where they stop.
 * Elites and bosses budge less in the simulation, and here they brace: dust at their feet and a ring, a short swipe and a short ghost.
 *
 * The enemies REALLY move (the simulation slides them back over `data.slide` seconds): nothing here moves an enemy. The picture only adds what
 * the slide leaves behind: ghosts at `pushed[i].x / y`, swipes from there to `toX / toY`, the wedge and the dust. Every piece is timed by the
 * battle's clock with a floor in real time (`span.ts`), so it holds still under a popup and keeps step with the slide at any speed. Pieces are
 * pooled (a few Graphics and Sprites made on first use), the dust and the speed lines are the particle pool's (priority 1 and 0, so a crowded
 * pool refuses them first), and a lower quality tier gets fewer ghosts and fewer puffs.
 */
import { CanvasSource, Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU, lighten } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';
import type { EnemyState, SpShoved } from '@/game';
import { bodyX } from '../../field/policy';
import { enemyTextureKey } from '../../field/enemyView';
import { CLASS_COLOR } from '../palette';
import { Gate, enemyInfo } from '../stage';
import { Age } from './span';
import { pointsAlong, roadInReach, runsAround, type RoadRun } from './road';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

/** [battle seconds, real floor] of each picture. */
const WEDGE: readonly [number, number] = [0.42, 0.24];
const SLIDE: readonly [number, number] = [0.5, 0.28];
const SLAM: readonly [number, number] = [0.34, 0.2];
/** How many enemies get a ghost and a swipe, and how many puffs of road dust, by quality tier (low, mid, high). */
const SLIDES_MAX = [4, 8, 12] as const;
const DUST_MAX = [3, 5, 7] as const;
const WEDGE_POOL = 3;
/** The most slide pieces ever made: two casts' worth at the highest tier. */
const SLIDES_POOL = 24;
/** The road dust travels out from the cat at about this speed (px/s): the farther puffs start later, so the dust seems to spread. */
const DUST_SPREAD = 900;
/** The wave runs this many px of road past the first and the last pushed enemy. */
const WAVE_MARGIN = 44;

const ROAD_DUST: EmitDef = {
  tex: 'smoke', prio: 1, count: 3, life: [0.4, 0.62], shape: { type: 'circle', r: 10 }, speed: [30, 90], drag: 3, gravity: -20,
  size: [28, 40], sizeEnd: [60, 88], rot: [0, TAU], spin: [-1.2, 1.2], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.55,
  fadeIn: 0.08, fadeOut: 0.6,
};
/** Dust at the feet of a body that braces against the shove (an elite or a boss), and at the cat's feet when the shield lands. */
const BRACE_DUST: EmitDef = {
  tex: 'smoke', prio: 1, count: 4, life: [0.3, 0.5], shape: { type: 'rect', w: 36, h: 6 }, speed: [40, 110], dir: -Math.PI / 2, spread: 1.3,
  drag: 3.2, gravity: -10, size: [22, 32], sizeEnd: [50, 70], rot: [0, TAU], spin: [-1, 1], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.6,
  fadeIn: 0.06, fadeOut: 0.65,
};
/** Speed lines kicked toward where the enemy stood, which it slides away from. */
const SLIDE_LINES: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.16, 0.26], speed: [220, 380], spread: 0.18, drag: 2, alignVel: true, stretch: 0.0022,
  size: [26, 40], sizeEnd: [8, 12], colors: [Hue.cream], fadeIn: 0, fadeOut: 0.6,
};

const SHIELD_RES = 3;
const SHIELD_SIZE = 64;
let shield: Texture | null = null;

/**
 * The viking's shield, painted in code the first time it is slammed (no image file): a round wooden shield with a steel rim, planks and a boss
 * in the cartoon's thick brown ink. (The painted `badge_shield` is the cobalt blue of an ENEMY's shield, which no friendly effect may wear.)
 */
function shieldTexture(): Texture {
  if (shield) return shield;
  const canvas = document.createElement('canvas');
  canvas.width = SHIELD_SIZE * SHIELD_RES;
  canvas.height = SHIELD_SIZE * SHIELD_RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('shove: 2D canvas unavailable');
  ctx.scale(SHIELD_RES, SHIELD_RES);
  const css = (c: number, a = 1): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
  const disc = (r: number, c: string, dx = 0, dy = 0): void => {
    ctx.beginPath();
    ctx.arc(SHIELD_SIZE / 2 + dx, SHIELD_SIZE / 2 + dy, r, 0, TAU);
    ctx.fillStyle = c;
    ctx.fill();
  };
  disc(30, css(Color.shadow, 0.3), 1.2, 2.6);
  disc(30, css(Color.ink));
  disc(28.4, css(Color.stone));
  disc(24.5, css(Color.ink));
  disc(23.2, css(Color.woodDark));
  // Planks: three seams, clipped to the face.
  ctx.save();
  ctx.beginPath();
  ctx.arc(SHIELD_SIZE / 2, SHIELD_SIZE / 2, 23.2, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = css(Color.ink, 0.55);
  ctx.lineWidth = 1.6;
  for (const dx of [-11, 0, 11]) {
    ctx.beginPath();
    ctx.moveTo(SHIELD_SIZE / 2 + dx, 0);
    ctx.lineTo(SHIELD_SIZE / 2 + dx, SHIELD_SIZE);
    ctx.stroke();
  }
  ctx.fillStyle = css(Color.woodLight, 0.5);
  ctx.fillRect(SHIELD_SIZE / 2 - 22, SHIELD_SIZE / 2 - 22, 9, 44);
  ctx.restore();
  disc(8.6, css(Color.ink));
  disc(7.2, css(Color.stone));
  disc(3, css(Color.paperLight, 0.9), -1.6, -1.8);
  shield = new Texture({ source: new CanvasSource({ resource: canvas, resolution: SHIELD_RES, autoGarbageCollect: false }), label: 'sp_shield' });
  return shield;
}

class Wedge {
  readonly g = new Graphics();
  readonly age = new Age();
  on = false;
}

/** The slide of one enemy: its ghost where it stood and the swipe the slide leaves on the ground. */
class Slide {
  readonly ghost = new Sprite();
  readonly swipe = new Sprite(fxTex('streak').texture);
  readonly age = new Age();
  on = false;
  /** How faint it starts (a boss's ghost is fainter and shorter: it barely moved). */
  weight = 1;
  constructor() {
    this.ghost.anchor.set(0.5);
    this.ghost.eventMode = 'none';
    const s = fxTex('streak');
    this.swipe.anchor.set(s.ax, s.ay);
    this.swipe.tint = Hue.cream;
    this.swipe.eventMode = 'none';
    this.ghost.visible = false;
    this.swipe.visible = false;
  }
}

class Slam {
  readonly sprite = new Sprite();
  readonly age = new Age();
  on = false;
  constructor() {
    this.sprite.anchor.set(0.5);
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
  }
}

class ShoveScene implements SpScene<'shove'> {
  private readonly back: Container;
  private readonly front: Container;
  private readonly wedges: Wedge[] = [];
  private readonly slides: Slide[] = [];
  private readonly slams: Slam[] = [];
  private nextWedge = 0;
  private nextSlam = 0;
  private lookup = new Map<number, EnemyState>();

  constructor(private readonly env: SpEnv) {
    this.back = env.ctx.layers.fxBack;
    this.front = env.ctx.layers.fxFront;
  }

  cast(e: SpCastOf<'shove'>): void {
    const { stage } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    const d = e.data;
    // The simulation never casts a shove with nothing to push; the picture would have no direction to take (the middle of nothing is NaN).
    if (d.pushed.length === 0) return;
    const cx = e.x;
    const cy = e.y;
    this.lookup.clear();
    for (const en of this.env.battle.enemies) this.lookup.set(en.uid, en);

    // Which way the road is from the cat: the middle of what it pushed.
    let mx = 0;
    let my = 0;
    for (const p of d.pushed) {
      mx += p.x;
      my += p.y;
    }
    mx = mx / d.pushed.length - cx;
    my = my / d.pushed.length - cy;
    const toRoad = Math.atan2(my, mx);

    this.slam(cx, cy, toRoad, calm);
    // The cat's reach cuts a long stretch (or two) out of the road, round a corner or across the seam, but the wave is only seen where something is
    // pushed: the part of the stretch the pushed enemies stand on, a little more at each end (a white line down an empty road read as a glitch).
    const reach = roadInReach(cx, cy + 6, d.range, 10);
    const held = runsAround(reach, d.pushed.map((p) => this.lookup.get(p.uid)?.travelled), WAVE_MARGIN);
    const runs = (held.length > 0 ? held : reach).slice(0, 2);
    this.wedge(cx, cy + 6, runs, calm);
    this.roadDust(cx, cy + 6, runs, detail);
    this.slideAll(d.pushed, detail, calm);

    stage.play(stage.rules.big, 'hit_heavy', 0.8, 0.8, 0.04);
    stage.later(0.06, () => stage.play(stage.rules.zone, 'whoosh', 0.35, 0.8, 0.05));
    if (!calm) stage.shake(Trauma.t1, Gate.spShake, 0.3);
  }

  /** The shield comes down in front of the cat toward the road: it starts big and quick, lands, holds a moment and fades; a ring and dust at the cat's feet. */
  private slam(cx: number, cy: number, toRoad: number, calm: boolean): void {
    const { stage } = this.env;
    let s = this.slams[this.nextSlam % 2];
    if (!s) {
      s = new Slam();
      s.sprite.texture = shieldTexture();
      this.front.addChild(s.sprite);
      this.slams.push(s);
    }
    this.nextSlam++;
    s.on = true;
    s.age.reset();
    s.sprite.visible = true;
    const reach = 30;
    s.sprite.position.set(cx + Math.cos(toRoad) * reach, cy - 4 + Math.sin(toRoad) * reach * 0.6);
    s.sprite.rotation = Math.cos(toRoad) >= 0 ? 0.18 : -0.18;
    this.pose(s, 0, calm);
    stage.fx.shockwave(cx, cy + 16, { color: CLASS_COLOR.warrior, radius: 78 });
    stage.fx.ps.burst(BRACE_DUST, cx, cy + 22, { scale: 1.2, count: stage.detail === 0 ? 0.5 : 1 });
  }

  private pose(s: Slam, k: number, calm: boolean): void {
    const base = 46 / Math.max(1, s.sprite.texture.width);
    const drop = calm ? 1 : 1 + 0.9 * (1 - Ease.cubicOut(Math.min(1, k / 0.22)));
    s.sprite.scale.set(base * drop);
    s.sprite.alpha = k > 0.62 ? (1 - k) / 0.38 : 1;
  }

  /** A flat wedge of dust from the cat out over the road inside its reach, drawn once and then only grown and faded. */
  private wedge(cx: number, cy: number, runs: readonly RoadRun[], calm: boolean): void {
    if (runs.length === 0) return;
    const w = this.wedges[this.nextWedge % WEDGE_POOL] ?? this.makeWedge();
    this.nextWedge++;
    w.on = true;
    w.age.reset();
    const g = w.g;
    g.clear();
    for (const run of runs) {
      const pts = pointsAlong(run, Math.max(3, Math.round(run.length / 50)));
      const flat: number[] = [0, 0];
      for (const p of pts) flat.push(p.x - cx, p.y - cy);
      g.poly(flat).fill({ color: Color.kraft, alpha: 0.46 });
      const inner: number[] = [0, 0];
      for (const p of pts) inner.push((p.x - cx) * 0.7, (p.y - cy) * 0.7);
      g.poly(inner).fill({ color: Hue.dust, alpha: 0.38 });
      // The wave's leading edge runs along the road: a cream band the wedge carries out to it.
      const front: number[] = [];
      for (const p of pts) front.push(p.x - cx, p.y - cy);
      g.poly(front, false).stroke({ width: 7, color: Hue.cream, alpha: 0.85, cap: 'round', join: 'round' });
    }
    g.position.set(cx, cy);
    g.visible = true;
    this.wedgeLook(w, 0, calm);
  }

  private wedgeLook(w: Wedge, k: number, calm: boolean): void {
    const grow = calm ? 1 : 0.2 + 0.8 * Ease.cubicOut(Math.min(1, k / 0.4));
    w.g.scale.set(grow);
    w.g.alpha = k > 0.35 ? Math.max(0, (1 - k) / 0.65) : 1;
  }

  private makeWedge(): Wedge {
    const w = new Wedge();
    w.g.visible = false;
    this.back.addChild(w.g);
    this.wedges.push(w);
    return w;
  }

  /** Puffs of dust along the road, the farther ones later: the dust seems to run out from the cat. */
  private roadDust(cx: number, cy: number, runs: readonly RoadRun[], detail: 0 | 1 | 2): void {
    const n = DUST_MAX[detail];
    const ps = this.env.stage.fx.ps;
    for (const run of runs) {
      for (const p of pointsAlong(run, n)) {
        const dist = Math.hypot(p.x - cx, p.y - cy);
        ps.burst(ROAD_DUST, p.x, p.y, { delay: dist / DUST_SPREAD, count: detail === 0 ? 0.7 : 1 });
      }
    }
  }

  /** A ghost where each pushed enemy stood, a swipe along its slide, speed lines; an elite or a boss braces instead of streaking. */
  private slideAll(pushed: readonly SpShoved[], detail: 0 | 1 | 2, calm: boolean): void {
    const { stage } = this.env;
    const max = SLIDES_MAX[detail];
    const ps = stage.fx.ps;
    for (let i = 0; i < pushed.length; i++) {
      const p = pushed[i] as SpShoved;
      const en = this.lookup.get(p.uid);
      if (!en) continue;
      const info = enemyInfo(en.id);
      if (info.big) {
        // It barely moves: a ring and dust at its feet say that it held.
        stage.fx.shockwave(p.x, p.y + info.size * 0.3, { color: Hue.cream, radius: info.size * 0.9 });
        ps.burst(BRACE_DUST, p.x, p.y + info.size * 0.34, { scale: info.boss ? 1.4 : 1.1, count: detail === 0 ? 0.5 : 1 });
      }
      if (i >= max) continue;
      const s = this.takeSlide();
      s.on = true;
      s.age.reset();
      s.weight = info.boss ? 0.55 : info.elite ? 0.75 : 1;
      const texture = tex(enemyTextureKey(en.id));
      s.ghost.texture = texture;
      const k = info.size / Math.max(texture.width, texture.height, 1);
      s.ghost.position.set(bodyX(p.x, info.size), p.y);
      s.ghost.scale.set(k * (Math.cos(p.angle) < 0 ? -1 : 1), k);
      s.ghost.visible = true;
      const dx = p.toX - p.x;
      const dy = p.toY - p.y;
      const dist = Math.hypot(dx, dy);
      const line = dist > 6;
      s.swipe.visible = line;
      if (line) {
        s.swipe.position.set(p.x, p.y + info.size * 0.3);
        s.swipe.rotation = Math.atan2(dy, dx);
        s.swipe.scale.set(dist / 256, Math.min(3, Math.max(1.1, info.size / 18)));
      }
      this.slideLook(s, 0, calm);
      if (!info.big && detail > 0) {
        ps.burst(SLIDE_LINES, p.x + Math.cos(p.angle) * info.radius, p.y + Math.sin(p.angle) * info.radius, { dir: p.angle, scale: Math.max(0.8, info.radius / 20) });
      }
    }
  }

  private slideLook(s: Slide, k: number, calm: boolean): void {
    const fade = (1 - k) * (1 - k);
    s.ghost.alpha = 0.62 * s.weight * fade;
    s.swipe.alpha = 0.95 * s.weight * (calm ? fade : 1 - k);
  }

  /** A free slide piece; two casts close together (the stage rule allows one every 0.25 s) never share one. When all are busy the oldest is taken over. */
  private takeSlide(): Slide {
    let oldest: Slide | null = null;
    for (const s of this.slides) {
      if (!s.on) return s;
      if (!oldest || s.age.real > oldest.age.real) oldest = s;
    }
    if (this.slides.length < SLIDES_POOL || !oldest) {
      const s = new Slide();
      this.back.addChild(s.swipe, s.ghost);
      this.slides.push(s);
      return s;
    }
    return oldest;
  }

  update(dt: number, battleDt: number): void {
    const calm = this.env.stage.reduced;
    for (const w of this.wedges) {
      if (!w.on) continue;
      w.age.tick(battleDt, dt);
      const k = w.age.k(...WEDGE);
      if (k >= 1) {
        w.on = false;
        w.g.visible = false;
        continue;
      }
      this.wedgeLook(w, k, calm);
    }
    for (const s of this.slides) {
      if (!s.on) continue;
      s.age.tick(battleDt, dt);
      const k = s.age.k(...SLIDE);
      if (k >= 1) {
        s.on = false;
        s.ghost.visible = false;
        s.swipe.visible = false;
        continue;
      }
      this.slideLook(s, k, calm);
    }
    for (const s of this.slams) {
      if (!s.on) continue;
      s.age.tick(battleDt, dt);
      const k = s.age.k(...SLAM);
      if (k >= 1) {
        s.on = false;
        s.sprite.visible = false;
        continue;
      }
      this.pose(s, k, calm);
    }
  }

  clear(): void {
    for (const w of this.wedges) {
      w.on = false;
      w.g.visible = false;
    }
    for (const s of this.slides) {
      s.on = false;
      s.ghost.visible = false;
      s.swipe.visible = false;
    }
    for (const s of this.slams) {
      s.on = false;
      s.sprite.visible = false;
    }
    this.lookup.clear();
  }

  destroy(): void {
    this.clear();
    for (const w of this.wedges) w.g.destroy();
    for (const s of this.slides) {
      s.ghost.destroy();
      s.swipe.destroy();
    }
    for (const s of this.slams) s.sprite.destroy();
    this.wedges.length = 0;
    this.slides.length = 0;
    this.slams.length = 0;
  }

  /** The pieces alive right now (QA and tests). */
  live(): { wedges: number; slides: number; slams: number } {
    return {
      wedges: this.wedges.filter((w) => w.on).length,
      slides: this.slides.filter((s) => s.on).length,
      slams: this.slams.filter((s) => s.on).length,
    };
  }
}

export const makeShove: SpSceneFactory<'shove'> = (env) => new ShoveScene(env);
