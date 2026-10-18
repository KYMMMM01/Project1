/**
 * Tagalong Cloud, the storm cat's scene (docs/design_skills_v2.md 3.7): a small, grumpy, dark cloud pops out of the cat's hat, flies to the
 * lead enemy, sticks to it and trots along above its head, drops a little bolt on it every 0.4 s, hops to the next enemy when its host falls
 * and fizzles when its time is up. It has a face and a mood (grumpy while it trots, squeezed eyes and a wide mouth when a bolt falls,
 * startled in the air between two hosts, a sigh at the end, a sad face when it lost its host with nobody near).
 *
 * Moment by moment (1x; every time is the battle's clock with a floor in real seconds, `span.ts`; everything is drawn from the cast's numbers
 * and the events `cloudBolt`, `cloudHop` and `cloudEnd`, which this scene listens to itself, the way the gunner's scene listens to `bite`):
 *   0.00  the cast: the cloud pops out of the hat (a puff, 0.1 s, it grows with a little overshoot and rises);
 *   0.10  it flies to the host along a small arc, homing on where the host is each frame (0.24 s), then it SITS on the host's health bar
 *         and follows it for as long as the cloud lives: it trots (a bounce about every third of a second), leans into the walk, and lags
 *         a little behind the enemy so that it seems to chase it; it is drawn from the host's own place, never from where the cat stood;
 *   0.40, 0.80 ... (every `cloudBolt`)  a bolt falls from the cloud's belly onto the host (the painted yellow bolts, flickering for 0.22 s),
 *         a star flashes where it lands, a ring of the splash's size runs out, a spark on each OTHER enemy the splash reaches (`points`);
 *         the cloud squeezes its eyes shut and squashes for a moment; the sound climbs a little with each bolt;
 *   (a `cloudHop`)  the cloud jumps from the fallen host to the new one over an arc, startled (0.22 s), and lands grumpy;
 *   (a `cloudEnd`)  it fizzles: it sighs (or, `lost`, looks sad with a tear), shrinks and floats up and away over half a second, a puff and a
 *         few drops of rain fall from it.
 *
 * The cloud is a picture painted in code (`cloudArt.ts`: a body and five faces). The pieces are pooled (at most six clouds, which is the
 * simulation's own cap, and a dozen bolts); the puffs, sparks and drops are the particle pool's (priority 1 and 0), a lower quality tier gets
 * fewer; under reduced motion the cloud fades in, glides, does not bob, lean, squash or arc, its bolt does not flicker and nothing shakes.
 * A cast the stage rule dropped shows no cloud, and its follow-up events find nobody to draw them. A cloud whose events never came ends by
 * itself a moment after its time. A defeat does not tear a cloud down (`survivesDefeat`): the simulation carries it on after a revive and the
 * picture, timed by the battle's clock, stands still with it.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { TAU, lighten } from '@/core/math';
import { Ease } from '@/core/tween';
import type { EmitDef } from '@/fx';
import { Light } from '@/fx/light';
import { Hue } from '@/fx/palette';
import { BOLT_IDS, paint } from '@/fx/paint';
import type { BattleEvents, EnemyState } from '@/game';
import { FIELD_W } from '@/game/geometry';
import { CLOUD_BODY, CLOUD_H, cloudArt, type CloudArt, type CloudMood } from '../../cloudArt';
import { bodyX } from '../../field/policy';
import { enemyInfo } from '../stage';
import { SpritePiece, Pieces } from './runPieces';
import { Age } from './span';
import { NIGHT_LABEL, type SpCastOf, type SpEnv, type SpScene, type SpSceneFactory } from './types';

/** [battle seconds, real floor] of each moment. */
const POP: readonly [number, number] = [0.1, 0.08];
const FLY: readonly [number, number] = [0.24, 0.1];
const HOP: readonly [number, number] = [0.22, 0.12];
const ZAP: readonly [number, number] = [0.26, 0.14];
const FIZZLE: readonly [number, number] = [0.5, 0.3];
const BOLT: readonly [number, number] = [0.26, 0.16];
/** Seconds between one painted bolt and the next while a bolt flickers (real time: at 3x it must not strobe). */
const FLICKER = 0.055;
/** The most clouds at once (the simulation's own cap) and bolts (about two alive per cloud). */
const CLOUDS = 6;
const BOLTS = 14;
/** How big a cloud is drawn, as a share of its picture (72 x 52 design px). */
const SIZE = 0.95;
/** How far above the cat's tile the hat is, and how far the cloud rises out of it. */
const HAT_RISE = 50;
const POP_RISE = 16;
/** How far (px) a cloud arcs above the straight line on its flight and on a hop. */
const FLY_ARC = 22;
const HOP_ARC = 36;
/** How fast the cloud catches up with its host (per battle second): the lag that makes it trot after it. */
const CATCH_UP = 18;
/** Two clouds on one host: the second stands this far aside and up, the third on the other side, and so on (at most `LANES_MAX` steps). */
const LANE_X = 20;
const LANE_Y = 14;
const LANES_MAX = 3;
/** The trot: seconds of a bounce, its height in px. */
const TROT = 0.36;
const TROT_HEIGHT = 4;
/** A cloud whose end never comes fizzles on its own this long after its time. */
const GRACE = 1.5;
/**
 * The cloud stays this far inside the field's sides, and no higher than this above its top edge (the floor above the field is free down to the
 * HUD, 78 px on the smallest layout, so a cloud over the top lane sits above its host's head like everywhere else).
 */
const TOP_MIN = -34;
const SIDE_MIN = 34;
/** Bolts and splash sparks by quality tier (low, mid, high). */
const SPARKS = [2, 3, 4] as const;
const RING_GAP = 0.15;

const HAT_PUFF: EmitDef = {
  tex: 'smoke', prio: 1, count: 5, life: [0.3, 0.5], shape: { type: 'circle', r: 8 }, speed: [40, 100], drag: 3, gravity: -12,
  size: [20, 30], sizeEnd: [44, 60], rot: [0, TAU], spin: [-1, 1], colors: [lighten(CLOUD_BODY, 0.45), CLOUD_BODY], alpha: 0.7, fadeIn: 0.06, fadeOut: 0.6,
};
const BOLT_SPARKS: EmitDef = {
  tex: 'spark', prio: 1, count: 5, life: [0.14, 0.26], speed: [180, 380], dir: -Math.PI / 2, spread: Math.PI, drag: 5, alignVel: true, stretch: 0.002,
  size: [18, 28], sizeEnd: [5, 8], colors: [Hue.cream, Light.zapFlash], fadeIn: 0, fadeOut: 0.5,
};
const SPLASH_SPARK: EmitDef = {
  tex: 'spark', prio: 0, count: 3, life: [0.12, 0.2], speed: [120, 260], dir: -Math.PI / 2, spread: Math.PI, drag: 5, alignVel: true, stretch: 0.002,
  size: [12, 18], sizeEnd: [4, 6], colors: [Hue.cream, Light.zapFlash], fadeIn: 0, fadeOut: 0.5,
};
/** The ring the splash's size draws on the ground (60 px of reach: 120 across), one ring and no more. */
const SPLASH_RING: EmitDef = {
  tex: 'ring', prio: 1, count: 1, life: 0.34, size: 22, sizeEnd: 120, sizeEase: Ease.cubicOut, colors: [Hue.cream, Light.zapFlash], alpha: 0.7, fadeIn: 0, fadeOut: 0.7,
};
const FIZZ_PUFF: EmitDef = {
  tex: 'smoke', prio: 1, count: 4, life: [0.4, 0.7], shape: { type: 'circle', r: 10 }, speed: [20, 60], drag: 2.5, gravity: -26,
  size: [22, 32], sizeEnd: [50, 70], rot: [0, TAU], spin: [-0.8, 0.8], colors: [lighten(CLOUD_BODY, 0.55), CLOUD_BODY], alpha: 0.55, fadeIn: 0.08, fadeOut: 0.6,
};
const DRIZZLE: EmitDef = {
  tex: 'droplet', prio: 0, count: 5, life: [0.45, 0.7], shape: { type: 'rect', w: 36, h: 4 }, speed: [10, 60], dir: Math.PI / 2, spread: 0.5, gravity: 560, drag: 0.6,
  size: [10, 14], sizeEnd: [7, 10], colors: [Hue.iceLight, Hue.ice], alpha: 0.95, fadeIn: 0, fadeOut: 0.35,
};

type Mode = 'pop' | 'fly' | 'ride' | 'hop' | 'fizzle';

interface Spot {
  x: number;
  y: number;
}

/** One cloud: its body and face, where it is, what it is doing, and whose head it sits on. */
class Cloud {
  readonly root = new Container();
  readonly body: Sprite;
  readonly face: Sprite;
  on = false;
  id = 0;
  mode: Mode = 'ride';
  readonly age = new Age();
  /** The moment of the last bolt: the zap face and squash. */
  readonly zap = new Age();
  zapOn = false;
  hostUid = 0;
  host: EnemyState | null = null;
  /** Where it is, drawn (before the bounce). */
  x = 0;
  y = 0;
  /** Where the current flight or hop began. */
  fromX = 0;
  fromY = 0;
  /** The hat it came out of, and where the host last was (when the host cannot be found any more). */
  hatX = 0;
  hatY = 0;
  last: Spot = { x: 0, y: 0 };
  /** Battle time after which it ends by itself if no end came. */
  deadline = 0;
  /** Why it fizzled: a sad face for a lost host. */
  lost = false;
  mood: CloudMood = 'grumpy';
  /** Higher = older: which cloud to take over when all are busy. */
  seq = 0;
  /** What the scene drew last frame (QA and tests). */
  scaleX = 1;
  scaleY = 1;
  alpha = 1;

  constructor(art: CloudArt) {
    this.body = new Sprite(art.body);
    this.face = new Sprite(art.faces.grumpy);
    this.body.anchor.set(0.5);
    this.face.anchor.set(0.5);
    this.root.addChild(this.body, this.face);
    this.root.eventMode = 'none';
    this.root.visible = false;
  }
}

/** One bolt: the painted zig-zag stretched from the cloud's belly to the host. */
class Bolt extends SpritePiece {
  /** Which of the six painted bolts it starts with. */
  seed = 0;
  /** From the cloud's belly to the host, as they were when it fell. */
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  constructor(parent: Container) {
    super(parent, paint('bolt_0'), 0, 0.5);
  }
}

class CloudScene implements SpScene<'cloud'> {
  readonly survivesDefeat = true;
  private readonly front: Container;
  private readonly clouds: Cloud[] = [];
  private readonly bolts: Pieces<Bolt>;
  private art: CloudArt | null = null;
  private seq = 0;
  private boltSeq = 0;
  private lastRing = -Infinity;
  private readonly off: Array<() => void> = [];
  private broken = false;

  constructor(private readonly env: SpEnv) {
    this.front = env.ctx.layers.fxFront;
    this.bolts = new Pieces<Bolt>(() => {
      const b = new Bolt(this.front);
      this.under(b.sprite);
      return b;
    }, BOLTS);
    const ev = env.battle.events;
    this.off.push(
      ev.on('cloudBolt', (e) => this.safe('bolt', () => this.onBolt(e))),
      ev.on('cloudHop', (e) => this.safe('hop', () => this.onHop(e))),
      ev.on('cloudEnd', (e) => this.safe('end', () => this.onEnd(e))),
    );
  }

  /** The scene's own listeners are called by the simulation in the middle of a rule: a throw here must not unwind into it. */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] cloud ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  // ── the cast ──

  cast(e: SpCastOf<'cloud'>): void {
    const { stage } = this.env;
    const d = e.data;
    const c = this.take();
    c.on = true;
    c.id = d.cloudId;
    c.mode = 'pop';
    c.age.reset();
    c.zapOn = false;
    c.lost = false;
    c.seq = ++this.seq;
    c.hostUid = d.hostUid;
    c.host = this.find(d.hostUid);
    c.last.x = d.hostX;
    c.last.y = d.hostY;
    c.hatX = e.x;
    c.hatY = e.y - HAT_RISE;
    c.x = c.hatX;
    c.y = c.hatY;
    c.deadline = d.at + d.life + GRACE;
    this.mood(c, 'grumpy');
    c.root.visible = true;
    this.place(c, 0, 0);
    stage.fx.ps.burst(HAT_PUFF, c.hatX, c.hatY + 6, { count: stage.detail === 0 ? 0.6 : 1 });
    stage.play(stage.rules.zone, 'shoot_magic', 0.42, 1.7, 0.05);
  }

  // ── the follow-up events (only for a cloud this scene is drawing) ──

  private onBolt(e: BattleEvents['cloudBolt']): void {
    const c = this.byId(e.cloudId);
    if (!c || c.mode === 'fizzle') return;
    const { stage } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    // The bolt falls from the cloud's belly onto the host where it is NOW (the event's own place).
    const x0 = c.x;
    const y0 = c.y + (CLOUD_H * SIZE) * 0.3;
    const x1 = e.x;
    const y1 = e.y - 4;
    const b = this.bolts.take();
    b.start(BOLT[0], BOLT[1]);
    b.seed = this.boltSeq++;
    b.x0 = x0;
    b.y0 = y0;
    b.x1 = x1;
    b.y1 = y1;
    b.sprite.visible = true;
    this.dress(b, 0, calm);
    c.zap.reset();
    c.zapOn = true;
    this.mood(c, 'zap');

    stage.fx.fleck(paint('burst_star'), x1, y1, { life: 0.2, size: 40, sizeEnd: 72, rot: b.seed, color: Light.zapFlash, fadeAt: 0.4 });
    stage.fx.ps.burst(BOLT_SPARKS, x1, y1, { count: detail === 0 ? 0.5 : 1 });
    if (!calm && detail > 0 && stage.now - this.lastRing >= RING_GAP) {
      this.lastRing = stage.now;
      stage.fx.ps.burst(SPLASH_RING, x1, y1 + 8, { scale: 1 });
    }
    // A spark on every other enemy the splash reaches (the first few: a crowd needs no more).
    const max = SPARKS[detail];
    let n = 0;
    for (const p of e.points) {
      if (p.uid === e.hostUid) continue;
      if (n++ >= max) break;
      stage.fx.ps.burst(SPLASH_SPARK, p.x, p.y, { count: detail === 0 ? 0.6 : 1 });
    }
    // One crackle per bolt, a little higher each time: eight bolts climb like a charging coil.
    stage.play(stage.rules.status, 'zap', 0.36, 0.95 + Math.min(0.5, e.index * 0.05), 0.04);
  }

  private onHop(e: BattleEvents['cloudHop']): void {
    const c = this.byId(e.cloudId);
    if (!c || c.mode === 'fizzle') return;
    const { stage } = this.env;
    c.fromX = c.x;
    c.fromY = c.y;
    c.hostUid = e.toUid;
    c.host = this.find(e.toUid);
    c.last.x = e.toX;
    c.last.y = e.toY;
    c.mode = 'hop';
    c.age.reset();
    // A bolt and a hop come in one tick when the bolt fells its host: the jump is the startled one, not the zap.
    c.zapOn = false;
    this.mood(c, 'startled');
    stage.play(stage.rules.zone, 'whoosh', 0.3, 1.8, 0.05);
  }

  private onEnd(e: BattleEvents['cloudEnd']): void {
    const c = this.byId(e.cloudId);
    if (!c || c.mode === 'fizzle') return;
    this.fizzle(c, e.reason === 'lost');
  }

  private fizzle(c: Cloud, lost: boolean): void {
    const { stage } = this.env;
    c.mode = 'fizzle';
    c.age.reset();
    c.lost = lost;
    c.zapOn = false;
    this.mood(c, lost ? 'sad' : 'sigh');
    stage.fx.ps.burst(FIZZ_PUFF, c.x, c.y, { count: stage.detail === 0 ? 0.5 : 1 });
    if (stage.detail > 0) stage.fx.ps.burst(DRIZZLE, c.x, c.y + 14, { count: lost ? 0.6 : 1 });
    stage.play(stage.rules.zone, 'whoosh', 0.3, 0.75, 0.05);
  }

  // ── the frame ──

  update(dt: number, battleDt: number): void {
    const { battle } = this.env;
    for (const c of this.clouds) {
      if (!c.on) continue;
      c.age.tick(battleDt, dt);
      if (c.zapOn) {
        c.zap.tick(battleDt, dt);
        if (c.zap.k(...ZAP) >= 1) c.zapOn = false;
      }
      switch (c.mode) {
        case 'pop':
          if (c.age.k(...POP) >= 1) this.next(c, 'fly');
          break;
        case 'fly':
          if (c.age.k(...FLY) >= 1) this.next(c, 'ride');
          break;
        case 'hop':
          if (c.age.k(...HOP) >= 1) {
            this.next(c, 'ride');
            this.mood(c, 'grumpy');
          }
          break;
        case 'fizzle':
          if (c.age.k(...FIZZLE) >= 1) {
            this.hide(c);
            continue;
          }
          break;
        default:
          // Its events never came (a bug, a dropped list): it goes by itself, a moment after its time.
          if (battle.time > c.deadline) this.fizzle(c, false);
      }
      this.place(c, dt, battleDt);
    }
    this.bolts.update(battleDt, dt, this.paintBolt);
  }

  private readonly paintBolt = (b: Bolt, k: number): void => this.drawBolt(b, k);

  private next(c: Cloud, mode: Mode): void {
    c.fromX = c.x;
    c.fromY = c.y;
    c.mode = mode;
    c.age.reset();
  }

  /** Where a cloud sits on its host: just above the health bar, over the body of the enemy when the bar is at the top of the field. */
  private rideSpot(c: Cloud, out: Spot): Spot {
    const h = CLOUD_H * SIZE;
    const en = c.host;
    if (en) {
      const info = enemyInfo(en.id);
      out.x = bodyX(en.x, info.size);
      out.y = en.y - info.top + 6 - h / 2;
      c.last.x = en.x;
      c.last.y = en.y;
    } else {
      out.x = c.last.x;
      out.y = c.last.y - 60;
    }
    // Several storm cats may send a cloud to one enemy (the simulation has no rule against it): each older cloud on the same host pushes this one a
    // step up and aside, so the screen shows as many clouds as there are bolts' worth of them and not one.
    const lane = this.lane(c);
    if (lane > 0) {
      out.x += (lane % 2 === 1 ? 1 : -1) * Math.ceil(lane / 2) * LANE_X;
      out.y -= lane * LANE_Y;
    }
    out.x = Math.max(SIDE_MIN, Math.min(FIELD_W - SIDE_MIN, out.x));
    out.y = Math.max(TOP_MIN, out.y);
    return out;
  }

  /** How many older clouds are on the same host as `c` (at most `LANES_MAX`): 0 for the first, 1 for the second... */
  private lane(c: Cloud): number {
    let n = 0;
    for (const o of this.clouds) if (o !== c && o.on && o.mode !== 'fizzle' && o.hostUid === c.hostUid && o.seq < c.seq) n++;
    return Math.min(LANES_MAX, n);
  }

  private readonly spot: Spot = { x: 0, y: 0 };

  /** Pose one cloud for this frame from its mode and the host's place. */
  private place(c: Cloud, _dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    const t = battle.time;
    let x = c.x;
    let y = c.y;
    let sx = 1;
    let sy = 1;
    let alpha = 1;
    let rot = 0;
    switch (c.mode) {
      case 'pop': {
        const k = c.age.k(...POP);
        const s = calm ? 1 : Ease.backOut(k);
        x = c.hatX;
        y = c.hatY - (calm ? 0 : POP_RISE) * Ease.sineOut(k);
        sx = sy = Math.max(0.01, s);
        alpha = Math.min(1, k * 5);
        c.x = x;
        c.y = y;
        break;
      }
      case 'fly':
      case 'hop': {
        const [life, floor] = c.mode === 'fly' ? FLY : HOP;
        const k = c.age.k(life, floor);
        const to = this.rideSpot(c, this.spot);
        const e = calm ? k : Ease.sineInOut(k);
        const arc = calm ? 0 : (c.mode === 'fly' ? FLY_ARC : HOP_ARC) * Math.sin(Math.PI * k);
        x = c.fromX + (to.x - c.fromX) * e;
        y = c.fromY + (to.y - c.fromY) * e - arc;
        if (!calm) {
          // Stretched along the jump, squashed as it lands.
          const stretch = Math.sin(Math.PI * k);
          sx = 1 - 0.1 * stretch;
          sy = 1 + 0.14 * stretch;
          rot = (to.x - c.fromX) * 0.0006 * Math.cos(Math.PI * k);
        }
        c.x = x;
        c.y = y + arc;
        break;
      }
      case 'ride': {
        const to = this.rideSpot(c, this.spot);
        const f = 1 - Math.exp(-battleDt * CATCH_UP);
        c.x += (to.x - c.x) * f;
        c.y += (to.y - c.y) * f;
        x = c.x;
        y = c.y;
        if (!calm) {
          const phase = Math.abs(Math.sin((t * Math.PI) / TROT));
          y -= phase * TROT_HEIGHT;
          sy = 1 - 0.05 * (1 - phase);
          sx = 1 + 0.04 * (1 - phase);
          const en = c.host;
          rot = (en ? 0.1 * Math.cos(en.angle) : 0) + 0.03 * Math.sin(t * 7);
        }
        break;
      }
      default: {
        const k = c.age.k(...FIZZLE);
        // It lets the air out: it sinks flat, drifts up and goes.
        const s = calm ? 1 : 1 - 0.4 * Ease.cubicOut(k);
        sx = s * (calm ? 1 : 1 + 0.12 * k);
        sy = s * (calm ? 1 : 1 - 0.18 * k);
        y = c.y - (calm ? 0 : 14 * Ease.sineOut(k));
        alpha = k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55);
        if (c.lost && !calm) rot = 0.12 * Math.sin(k * 14) * (1 - k);
      }
    }
    // A bolt just fell: the cloud snaps its eyes shut and squashes, then springs back.
    if (c.zapOn && c.mode !== 'fizzle') {
      const zk = c.zap.k(...ZAP);
      const punch = 1 - zk;
      this.mood(c, 'zap');
      if (!calm) {
        sx *= 1 + 0.16 * punch;
        sy *= 1 - 0.16 * punch;
        x += Math.sin(t * 80) * 1.6 * punch;
      }
    } else if (c.mood === 'zap') {
      this.mood(c, c.mode === 'hop' ? 'startled' : 'grumpy');
    }
    c.root.position.set(x, y);
    c.root.rotation = rot;
    c.scaleX = SIZE * sx;
    c.scaleY = SIZE * sy;
    c.alpha = alpha;
    c.root.scale.set(c.scaleX, c.scaleY);
    c.root.alpha = alpha;
  }

  private mood(c: Cloud, m: CloudMood): void {
    if (c.mood === m && c.face.texture === this.art?.faces[m]) return;
    c.mood = m;
    if (this.art) c.face.texture = this.art.faces[m] as Texture;
  }

  // ── bolts ──

  /** Stretch a bolt picture from the cloud to the host: as long as the fall, as thick as about two fifths of it (between 24 and 46 px), flickering. */
  private dress(b: Bolt, k: number, calm: boolean): void {
    const dx = b.x1 - b.x0;
    const dy = b.y1 - b.y0;
    const len = Math.max(14, Math.hypot(dx, dy));
    const s = b.sprite;
    const step = calm ? 0 : Math.floor(b.age.real / FLICKER);
    const texture = paint(BOLT_IDS[(b.seed + step) % BOLT_IDS.length] as (typeof BOLT_IDS)[number]);
    s.texture = texture;
    s.position.set(b.x0, b.y0);
    s.rotation = Math.atan2(dy, dx);
    const thick = Math.min(46, Math.max(24, len * 0.44));
    s.scale.set((len * 1.05) / Math.max(1, texture.width), thick / Math.max(1, texture.height));
    s.alpha = 1 - Math.max(0, Math.min(1, (k - 0.45) / 0.55));
  }

  private drawBolt(b: Bolt, k: number): void {
    this.dress(b, k, this.env.stage.reduced);
  }

  /** Put a picture of this scene just above the star archer's night (when it is there) and under the particles, numbers and everything else of the front layer. */
  private under(node: Container | Sprite): void {
    const night = this.front.getChildByLabel(NIGHT_LABEL);
    this.front.addChildAt(node, night ? this.front.getChildIndex(night) + 1 : 0);
  }

  // ── pool and lookups ──

  private take(): Cloud {
    let oldest: Cloud | null = null;
    for (const c of this.clouds) {
      if (!c.on) return c;
      if (!oldest || c.seq < oldest.seq) oldest = c;
    }
    if (this.clouds.length < CLOUDS || !oldest) {
      this.art ??= cloudArt();
      const c = new Cloud(this.art);
      this.under(c.root);
      this.clouds.push(c);
      return c;
    }
    this.hide(oldest);
    return oldest;
  }

  private find(uid: number): EnemyState | null {
    for (const en of this.env.battle.enemies) if (en.uid === uid) return en;
    return null;
  }

  private byId(id: number): Cloud | undefined {
    for (const c of this.clouds) if (c.on && c.id === id) return c;
    return undefined;
  }

  private hide(c: Cloud): void {
    c.on = false;
    c.zapOn = false;
    c.host = null;
    c.root.visible = false;
  }

  clear(): void {
    for (const c of this.clouds) this.hide(c);
    this.bolts.clear();
  }

  destroy(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    this.clear();
    for (const c of this.clouds) c.root.destroy({ children: true });
    this.clouds.length = 0;
    this.bolts.destroy();
  }

  /** The pieces alive right now (QA and tests). */
  live(): { clouds: number; bolts: number; list: Array<{ id: number; mode: Mode; mood: CloudMood; hostUid: number; x: number; y: number }> } {
    const list = this.clouds
      .filter((c) => c.on)
      .map((c) => ({ id: c.id, mode: c.mode, mood: c.mood, hostUid: c.hostUid, x: c.root.x, y: c.root.y }));
    return { clouds: list.length, bolts: this.bolts.live, list };
  }
}

export const makeCloud: SpSceneFactory<'cloud'> = (env) => new CloudScene(env);
