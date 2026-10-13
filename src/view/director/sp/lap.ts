/**
 * Starlight Lap, the star archer's scene (docs/design_skills_v2.md 3.6). After the cut-in of its first cast:
 *
 *   1. NIGHT SETTLES. A sheet of deep paper-blue lowers over the field (the HUD and the numbers stay bright), gently: 0.3 s in, 0.5 s out, never
 *      shorter than a fifth and a third of a real second whatever the game speed, and never a flash. It stays for as long as an arrow is running.
 *      Reduced motion switches it off altogether (the arrow has an ink edge, so it reads on the floor by day too).
 *   2. THE SHOT. A glint at the bow and a silver streak rising from the archer's tile into the sky.
 *   3. THE LAP. One silver arrow comes down onto the road at `startX / startY` (a short drop while it is already running: the simulation's body
 *      starts to move the moment it is cast) and runs once round the loop with the flow, round the corners and over the seam, trailing a ribbon
 *      of silver that follows the road behind it and sheds glints. Its place is `pathPoint(startPath + covered(t))` by the battle's clock
 *      (`runTrack.ts`), so it is where the simulation's body is at 1x, 2x and 3x and holds still under a popup.
 *   4. A STAR ON EACH ONE IT MARKS. A star flashes ON the enemy for every `spRunHit` (at the enemy's own position: the arrow passes enemies that
 *      get no star when the pool is spent, and a star is never drawn from the arrow's place), with a ping that climbs the scale. An enemy it
 *      FELLS bursts like a star (`spRunBurst`: a paper star as wide as the burst's radius, a ring, and a small star on each victim).
 *   5. THE END. The arrow's head and ribbon fade, the night lifts.
 *
 * Two arrows at once each have their own body and share the night (it stays while either runs). A run cut off by victory or defeat sends no end
 * event: `clear()` takes everything off (the night lifts over a third of a second, real time). A sold archer changes nothing: the arrow is the
 * simulation's and runs on. The low tier has a shorter ribbon, no glints and fewer stars' sparks; nothing here moves an enemy or a cat.
 */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TAU, clamp } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import type { BattleEvents } from '@/game';
import { FIELD_H, FIELD_W, pathPoint, type PathPoint } from '@/game/geometry';
import { bodyX } from '../../field/policy';
import { Color } from '@/ui/theme';
import { enemyInfo } from '../stage';
import { Piece, Pieces } from './runPieces';
import { covered, runEndsAt, runPlace, trackOf, type RunTrack } from './runTrack';
import { Age } from './span';
import { NIGHT_LABEL, type SpCastOf, type SpEnv, type SpScene, type SpSceneFactory } from './types';

type Span = readonly [number, number];

/** The night: deep indigo paper (a teal one went grey over the warm floor), the least that reads as night (`NIGHT_ALPHA` of it over the field: lower than the flash guide's cap of 0.45 so that the rings and the cats keep their colour under it). */
export const NIGHT_COLOR = 0x1b2a66;
export const NIGHT_ALPHA = 0.35;
const NIGHT_IN: Span = [0.3, 0.2];
const NIGHT_OUT: Span = [0.5, 0.35];
/** When the scene is cut off the night lifts over this many REAL seconds. */
const NIGHT_CUT = 0.3;

/** px of ribbon behind the head by quality tier, and the spacing of its points. */
const TRAIL_LEN = [300, 520, 760] as const;
const TRAIL_STEP = 18;
/** px of road between two glints shed by the arrow, by tier (0 = none). */
const GLINT_EVERY = [0, 150, 95] as const;
/** The arrow's drop onto the road: how high it starts (px) and how long it takes (battle seconds, real floor). */
const DROP_FROM = 72;
const DROP: Span = [0.12, 0.08];
/** [battle seconds, real floor] of each picture. */
const FADE: Span = [0.4, 0.3];
const STAR: Span = [0.34, 0.22];
const BURST: Span = [0.42, 0.28];
const BOW: Span = [0.26, 0.16];
const RUNNERS = 3;
const STARS_POOL = 44;
const BURSTS_POOL = 8;
const BOWS_POOL = 3;
/** The most stars (and burst stars) alive at once, by tier. */
const STARS_LIVE = [18, 32, 44] as const;
/** The most bursts alive at once, by tier. */
const BURSTS_LIVE = [3, 5, 8] as const;
/** Pings of the stars climb this many steps of the scale before they start over. */
const PING_STEPS = 8;
/**
 * On a packed road (more than `DENSE_HITS` stars in the last `DENSE_WINDOW` battle seconds) the stars are drawn at `DENSE_SIZE` of their size
 * and without the cream sparkle behind them: one star a hit would otherwise run together into a gold band that hides the enemies it marks.
 */
const DENSE_HITS = 14;
const DENSE_WINDOW = 0.3;
const DENSE_SIZE = 0.6;

/** A glint shed by the arrow. */
const ARROW_GLINT: EmitDef = {
  tex: 'sparkle', prio: 0, count: 1, life: [0.35, 0.6], shape: { type: 'circle', r: 6 }, speed: [10, 40], drag: 2, gravity: 12,
  size: [14, 22], sizeEnd: [2, 6], rot: [0, TAU], spin: [-2, 2], colors: [Hue.cream, Hue.iceLight], alpha: 0.9, fadeIn: 0.05, fadeOut: 0.6,
};
/** The sparks of a star's flash. */
const STAR_SPARK: EmitDef = {
  tex: 'sparkle', prio: 0, count: 3, life: [0.25, 0.45], shape: { type: 'circle', r: 8 }, speed: [60, 150], drag: 3,
  size: [10, 18], sizeEnd: [2, 4], rot: [0, TAU], spin: [-3, 3], colors: [Hue.cream, Hue.spark], alpha: 0.95, fadeIn: 0.04, fadeOut: 0.6,
};
/** The sparks of a burst of a felled enemy. */
const BURST_SPARK: EmitDef = {
  tex: 'sparkle', prio: 1, count: 6, life: [0.3, 0.55], shape: { type: 'circle', r: 14 }, speed: [90, 220], drag: 3,
  size: [14, 24], sizeEnd: [3, 6], rot: [0, TAU], spin: [-3, 3], colors: [Hue.cream, Hue.spark, Hue.iceLight], alpha: 0.95, fadeIn: 0.04, fadeOut: 0.6,
};

/** A star flashing on an enemy the arrow marked. */
class Star extends Piece {
  readonly glow: Sprite;
  readonly core: Sprite;
  x = 0;
  y = 0;
  /** Diameter in px. */
  size = 56;
  /** Drawn small and without its sparkle (a packed road). */
  dense = false;
  constructor(parent: Container) {
    super();
    this.glow = new Sprite(fxTex('sparkle').texture);
    this.core = new Sprite(fxTex('star').texture);
    for (const s of [this.glow, this.core]) {
      s.anchor.set(0.5);
      s.eventMode = 'none';
      s.visible = false;
      parent.addChild(s);
    }
    this.glow.tint = Hue.cream;
    this.core.tint = Hue.gold;
  }
  hide(): void {
    this.on = false;
    this.glow.visible = false;
    this.core.visible = false;
  }
  destroy(): void {
    this.glow.destroy();
    this.core.destroy();
  }
}

/** The paper star an enemy the arrow felled bursts into. */
class Burst extends Piece {
  readonly ray: Sprite;
  x = 0;
  y = 0;
  /** The burst's radius in px. */
  radius = 90;
  constructor(parent: Container) {
    super();
    this.ray = new Sprite(fxTex('starburst').texture);
    this.ray.anchor.set(0.5);
    this.ray.tint = Hue.sun;
    this.ray.eventMode = 'none';
    this.ray.visible = false;
    parent.addChild(this.ray);
  }
  hide(): void {
    this.on = false;
    this.ray.visible = false;
  }
  destroy(): void {
    this.ray.destroy();
  }
}

/** The glint at the bow and the streak that rises from it. */
class Bow extends Piece {
  readonly glint: Sprite;
  readonly streak: Sprite;
  x = 0;
  y = 0;
  constructor(parent: Container) {
    super();
    const s = fxTex('streak');
    this.streak = new Sprite(s.texture);
    this.streak.anchor.set(s.ax, s.ay);
    this.streak.tint = Hue.iceLight;
    this.glint = new Sprite(fxTex('sparkle').texture);
    this.glint.anchor.set(0.5);
    this.glint.tint = Hue.cream;
    for (const sp of [this.streak, this.glint]) {
      sp.eventMode = 'none';
      sp.visible = false;
      parent.addChild(sp);
    }
  }
  hide(): void {
    this.on = false;
    this.glint.visible = false;
    this.streak.visible = false;
  }
  destroy(): void {
    this.glint.destroy();
    this.streak.destroy();
  }
}

/** The night: one sheet of blue paper over the field. Its level moves toward 0 or 1 by the battle's clock with a floor in real time. */
export class Night {
  readonly sprite = new Sprite(Texture.WHITE);
  /** 0..1. */
  level = 0;

  constructor(parent: Container) {
    this.sprite.label = NIGHT_LABEL;
    this.sprite.tint = NIGHT_COLOR;
    // Wider than the field and far taller: the shaken field never shows an edge, and a tall screen's floor above and below darkens with it.
    this.sprite.position.set(-120, -760);
    this.sprite.width = FIELD_W + 240;
    this.sprite.height = FIELD_H + 1520;
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
    parent.addChildAt(this.sprite, 0);
  }

  /** `want`: an arrow is running. `cut`: the scene was cleared, so the night lifts by real time alone. */
  update(want: boolean, dt: number, battleDt: number, calm: boolean, cut: boolean): void {
    const up = want && !calm && !cut;
    const [life, floor] = up ? NIGHT_IN : NIGHT_OUT;
    const rate = cut || calm ? dt / NIGHT_CUT : Math.min(battleDt / life, dt / floor);
    this.level = up ? Math.min(1, this.level + rate) : Math.max(0, this.level - rate);
    this.sprite.visible = this.level > 0.001;
    this.sprite.alpha = NIGHT_ALPHA * Ease.sineInOut(this.level);
  }

  reset(): void {
    this.level = 0;
    this.sprite.visible = false;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

const point: PathPoint = { x: 0, y: 0, angle: 0 };
const scratch: PathPoint = { x: 0, y: 0, angle: 0 };
/** The ribbon's points, tail to head (the longest ribbon over the shortest spacing). */
const xs = new Float32Array(64);
const ys = new Float32Array(64);

/** The arrow, drawn once: a silver shaft and head with an ink edge, fletching in sky blue, pointing along +x with its tip at the origin. */
function paintArrow(g: Graphics): void {
  const ink = Color.inkDeep;
  g.moveTo(-56, 0).lineTo(-8, 0).stroke({ width: 7, color: ink, cap: 'round' });
  g.moveTo(-56, 0).lineTo(-8, 0).stroke({ width: 4, color: Hue.iceLight, cap: 'round' });
  for (const dx of [-54, -43]) g.poly([dx, 0, dx - 10, -8, dx - 6, 0, dx - 10, 8]).fill(Hue.ice).stroke({ width: 1.6, color: ink, join: 'round' });
  g.poly([-10, -8, 14, 0, -10, 8, -4, 0]).fill(Hue.cream).stroke({ width: 2.2, color: ink, join: 'round' });
}

type Phase = 'run' | 'fade' | 'done';

/** One arrow: its head, its ribbon and its place. */
class Arrow {
  on = false;
  id = 0;
  track: RunTrack = { at: 0, dir: 1, delay: 0, speed: 1, dist: 1, startPath: 0 };
  phase: Phase = 'done';
  ended = false;
  endAt = 0;
  /** Stars it has marked (the ping climbs with it). */
  stars = 0;
  /** Where the head is drawn (QA and tests). */
  x = 0;
  y = 0;
  private glintedTo = 0;
  private readonly drop = new Age();
  private readonly post = new Age();
  private readonly head = new Container();
  private readonly tip: Sprite;
  private readonly trail = new Graphics();

  constructor(
    private readonly scene: LapScene,
    parent: Container,
  ) {
    this.tip = new Sprite(fxTex('sparkle').texture);
    this.tip.anchor.set(0.5);
    this.tip.tint = Hue.cream;
    this.tip.position.set(12, 0);
    const shaft = new Graphics();
    paintArrow(shaft);
    this.head.addChild(shaft, this.tip);
    this.head.eventMode = 'none';
    this.head.visible = false;
    this.trail.eventMode = 'none';
    this.trail.visible = false;
    parent.addChild(this.trail, this.head);
  }

  begin(e: SpCastOf<'lap'>): void {
    const d = e.data;
    this.on = true;
    this.ended = false;
    this.id = d.runId;
    this.track = trackOf(d);
    this.endAt = runEndsAt(this.track);
    this.phase = 'run';
    this.stars = 0;
    this.glintedTo = 0;
    this.drop.reset();
    this.post.reset();
    this.head.visible = true;
    this.head.alpha = 1;
    this.trail.visible = true;
    this.trail.alpha = 1;
    this.x = d.startX;
    this.y = d.startY;
    this.head.position.set(d.startX, d.startY - DROP_FROM);
    this.head.rotation = 0;
  }

  update(t: number, dt: number, battleDt: number): void {
    const { stage } = this.scene.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    const tr = this.track;
    if (this.phase === 'run' && (this.ended || t >= this.endAt)) {
      this.phase = 'fade';
      this.post.reset();
      runPlace(tr, this.endAt, point);
      stage.fx.ps.burst(BURST_SPARK, point.x, point.y, { scale: 0.8, count: detail === 0 ? 0.5 : 1 });
    }
    runPlace(tr, t, point);
    const cov = covered(tr, t);
    let fade = 0;
    if (this.phase === 'fade') {
      this.post.tick(battleDt, dt);
      fade = this.post.k(FADE[0], FADE[1]);
      if (fade >= 1) {
        this.finish();
        return;
      }
    } else {
      this.drop.tick(battleDt, dt);
    }
    const lift = calm || this.phase === 'fade' ? 0 : DROP_FROM * (1 - this.drop.k(DROP[0], DROP[1])) ** 2;
    this.x = point.x;
    this.y = point.y;
    this.head.position.set(point.x, point.y - lift);
    this.head.rotation = point.angle;
    const grow = 1 - 0.3 * fade;
    this.head.scale.set(1.15 * grow);
    this.head.alpha = 1 - fade * fade;
    this.tip.rotation = calm ? 0 : cov * 0.02;
    this.drawTrail(cov, 1 - fade, detail);
    const every = GLINT_EVERY[detail];
    if (every > 0 && this.phase === 'run') {
      while (this.glintedTo + every <= cov) {
        this.glintedTo += every;
        stage.fx.ps.burst(ARROW_GLINT, point.x, point.y - lift * 0.5, { count: detail === 1 ? 0.7 : 1 });
      }
    } else this.glintedTo = cov;
  }

  /** The ribbon behind the head: the road it has covered (up to the tier's length), round the corners, a faint wide glow under a bright core in three bands, the oldest the thinnest. */
  private drawTrail(cov: number, alpha: number, detail: 0 | 1 | 2): void {
    const g = this.trail;
    g.clear();
    const len = Math.min(cov, TRAIL_LEN[detail]);
    if (len < 4 || alpha <= 0.01) return;
    const n = Math.min(xs.length, Math.max(2, Math.ceil(len / TRAIL_STEP) + 1));
    const tr = this.track;
    for (let i = 0; i < n; i++) {
      pathPoint(tr.startPath + tr.dir * (cov - len + (len * i) / (n - 1)), scratch);
      xs[i] = scratch.x;
      ys[i] = scratch.y;
    }
    const line = (from: number, to: number): void => {
      g.moveTo(xs[from] as number, ys[from] as number);
      for (let i = from + 1; i <= to; i++) g.lineTo(xs[i] as number, ys[i] as number);
    };
    line(0, n - 1);
    g.stroke({ width: 16, color: Hue.ice, alpha: 0.22 * alpha, cap: 'round', join: 'round' });
    const bands = detail === 0 ? 1 : 3;
    for (let b = 0; b < bands; b++) {
      const from = Math.floor((b * (n - 1)) / bands);
      const to = Math.floor(((b + 1) * (n - 1)) / bands);
      if (to <= from) continue;
      line(from, to);
      g.stroke({ width: 3.2 + (bands === 1 ? 3 : b * 1.6), color: Hue.iceLight, alpha: alpha * (bands === 1 ? 0.9 : 0.35 + 0.3 * b), cap: 'round', join: 'round' });
    }
  }

  private finish(): void {
    this.on = false;
    this.phase = 'done';
    this.head.visible = false;
    this.trail.visible = false;
    this.trail.clear();
  }

  cut(): void {
    this.finish();
  }

  destroy(): void {
    this.head.destroy({ children: true });
    this.trail.destroy();
  }
}

class LapScene implements SpScene<'lap'> {
  readonly survivesDefeat = true;
  private readonly front = new Container();
  private readonly runs: Arrow[] = [];
  private readonly stars: Pieces<Star>;
  private readonly bursts: Pieces<Burst>;
  private readonly bows: Pieces<Bow>;
  private readonly night: Night;
  /** The battle times of the stars of the last moments (what `packed` counts). */
  private readonly hitTimes: number[] = [];
  /** Set by `clear`: the night lifts by real time until it is gone. */
  private cut = false;

  constructor(readonly env: SpEnv) {
    // The night is the first child of the front layer: under the particles, over the board, the enemies and the cats; the numbers (a layer above) stay bright.
    this.night = new Night(env.ctx.layers.fxFront);
    env.ctx.layers.fxFront.addChild(this.front);
    this.stars = new Pieces(() => new Star(this.front), STARS_POOL);
    this.bursts = new Pieces(() => new Burst(this.front), BURSTS_POOL);
    this.bows = new Pieces(() => new Bow(this.front), BOWS_POOL);
  }

  cast(e: SpCastOf<'lap'>): void {
    const { stage } = this.env;
    this.cut = false;
    this.hitTimes.length = 0;
    let r = this.runs.find((x) => !x.on);
    if (!r) {
      if (this.runs.length < RUNNERS) {
        r = new Arrow(this, this.front);
        this.runs.push(r);
      } else {
        r = this.runs.reduce((a, b) => (a.track.at <= b.track.at ? a : b));
        r.cut();
      }
    }
    r.begin(e);
    const bow = this.bows.take();
    bow.start(BOW[0], BOW[1]);
    bow.x = e.x;
    bow.y = e.y - 12;
    bow.glint.visible = true;
    bow.streak.visible = true;
    this.drawBow(bow, 0);
    stage.play(stage.rules.big, 'atk_r_star', 0.8, 1, 0.03);
  }

  /** A star on an enemy the arrow marked, where the enemy stands. */
  runHit(e: BattleEvents['spRunHit']): void {
    const r = this.runs.find((x) => x.on && x.id === e.runId);
    if (!r) return;
    const { stage } = this.env;
    const info = enemyInfo(e.enemy.id);
    const dense = this.packed();
    this.star(bodyX(e.x, info.size), e.y - info.size * 0.1, clamp(info.size * 1.2, 46, 100) * (dense ? DENSE_SIZE : 1), dense);
    if (!dense) stage.fx.ps.burst(STAR_SPARK, bodyX(e.x, info.size), e.y - info.size * 0.1, { count: stage.detail === 0 ? 0 : stage.detail === 1 ? 0.7 : 1 });
    stage.playStep(stage.rules.strike, 'imp_r_star', r.stars % PING_STEPS, 0.45);
    r.stars++;
  }

  /** An enemy the arrow felled bursts like a star: a paper star as wide as the burst, a ring, and a small star on each victim. */
  runBurst(e: BattleEvents['spRunBurst']): void {
    const { stage } = this.env;
    const detail = stage.detail;
    stage.fx.shockwave(e.x, e.y, { color: Hue.ice, radius: e.radius });
    stage.fx.ps.burst(BURST_SPARK, e.x, e.y, { count: detail === 0 ? 0.5 : 1 });
    const b = this.bursts.take(BURSTS_LIVE[detail]);
    b.start(BURST[0], BURST[1]);
    b.x = e.x;
    b.y = e.y;
    b.radius = e.radius;
    b.ray.visible = true;
    this.drawBurst(b, 0);
    const victims = Math.min(e.points.length, detail === 0 ? 2 : 6);
    const dense = this.packed(false);
    for (let i = 0; i < victims; i++) {
      const p = e.points[i];
      if (p) this.star(p.x, p.y, 42 * (dense ? DENSE_SIZE : 1), dense);
    }
  }

  runEnd(e: BattleEvents['spRunEnd']): void {
    const r = this.runs.find((x) => x.on && x.id === e.runId);
    if (r) r.ended = true;
  }

  /** Another star on the road: whether it is a packed one (more than `DENSE_HITS` in the last `DENSE_WINDOW` battle seconds, this one included). */
  private packed(count = true): boolean {
    const now = this.env.battle.time;
    const hits = this.hitTimes;
    if (count) hits.push(now);
    let from = 0;
    while (from < hits.length && (hits[from] as number) < now - DENSE_WINDOW) from++;
    if (from > 0) hits.splice(0, from);
    return hits.length > DENSE_HITS;
  }

  private star(x: number, y: number, size: number, dense = false): void {
    // At the tier's limit the oldest star is taken over: the last enemies of a crowded lap still get theirs.
    const s = this.stars.take(STARS_LIVE[this.env.stage.detail]);
    s.start(STAR[0], STAR[1]);
    s.x = x;
    s.y = y;
    s.size = size;
    s.dense = dense;
    s.glow.visible = !dense;
    s.core.visible = true;
    this.drawStar(s, 0);
  }

  private drawStar(s: Star, k: number): void {
    const calm = this.env.stage.reduced;
    const pop = calm ? 1 : Ease.backOut(Math.min(1, k / 0.4));
    const fade = k < 0.45 ? 1 : (1 - k) / 0.55;
    s.glow.position.set(s.x, s.y);
    s.glow.scale.set((s.size / 64) * (0.4 + 0.75 * pop));
    s.glow.rotation = calm ? 0 : k * 1.4;
    s.glow.alpha = fade;
    s.core.position.set(s.x, s.y);
    s.core.scale.set((s.size / 56) * 0.5 * (0.4 + 0.75 * pop));
    s.core.rotation = calm ? 0 : -k * 0.9;
    s.core.alpha = fade;
  }

  private drawBurst(b: Burst, k: number): void {
    const calm = this.env.stage.reduced;
    b.ray.position.set(b.x, b.y);
    b.ray.scale.set(((b.radius * 1.9) / 64) * (calm ? 0.9 : 0.35 + 0.65 * Ease.cubicOut(Math.min(1, k * 2.4))));
    b.ray.rotation = calm ? 0 : k * 0.6;
    b.ray.alpha = 0.9 * (1 - k * k);
  }

  private drawBow(b: Bow, k: number): void {
    const calm = this.env.stage.reduced;
    b.glint.position.set(b.x, b.y);
    b.glint.scale.set(0.8 * (calm ? 1 : 0.5 + 0.7 * Math.sin(Math.min(1, k * 1.5) * Math.PI * 0.5)));
    b.glint.alpha = 1 - k;
    // The streak climbs from the bow into the sky: a blade 110 px long that slides up as it fades.
    b.streak.position.set(b.x, b.y - (calm ? 0 : 50 * Ease.cubicOut(k)));
    b.streak.rotation = -Math.PI / 2;
    b.streak.scale.set(110 / 128, 1.4);
    b.streak.alpha = 0.9 * (1 - k * k);
  }

  update(dt: number, battleDt: number): void {
    const t = this.env.battle.time;
    let running = false;
    for (const r of this.runs) {
      if (!r.on) continue;
      r.update(t, dt, battleDt);
      if (r.phase === 'run') running = true;
    }
    this.night.update(running, dt, battleDt, this.env.stage.reduced, this.cut);
    this.stars.update(battleDt, dt, (s, k) => this.drawStar(s, k));
    this.bursts.update(battleDt, dt, (b, k) => this.drawBurst(b, k));
    this.bows.update(battleDt, dt, (b, k) => this.drawBow(b, k));
  }

  clear(): void {
    for (const r of this.runs) r.cut();
    this.stars.clear();
    this.bursts.clear();
    this.bows.clear();
    this.hitTimes.length = 0;
    this.cut = true;
  }

  destroy(): void {
    this.clear();
    for (const r of this.runs) r.destroy();
    this.runs.length = 0;
    this.stars.destroy();
    this.bursts.destroy();
    this.bows.destroy();
    this.night.destroy();
    this.front.destroy();
  }

  /** What is on screen right now (QA and tests). */
  live(): { runs: number; stars: number; bursts: number; night: number; heads: Array<{ id: number; phase: string; x: number; y: number }> } {
    return {
      runs: this.runs.filter((r) => r.on).length,
      stars: this.stars.live,
      bursts: this.bursts.live,
      night: this.night.level,
      heads: this.runs.filter((r) => r.on).map((r) => ({ id: r.id, phase: r.phase, x: r.x, y: r.y })),
    };
  }
}

export const makeLap: SpSceneFactory<'lap'> = (env) => new LapScene(env);
