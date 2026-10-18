/**
 * Turn Into Fish!, the alchemist's scene (docs/design_skills_v2.md 3.11): the alchemist throws up to five flasks at once. The BIG one flies to an
 * elite or a boss and breaks on it in a burst of pink smoke; out of the smoke flops a big fish wearing the boss's round face, which swims on at a
 * quarter of its speed for as long as the simulation says it is a fish, with a pink ring that shrinks as the time runs out (a chip on the enemy, and
 * another on the boss strip). When it wears off the fish pops back into the boss, which shakes itself, and for the time it cannot be turned again
 * the chip shows a fish bone crossed out. The SMALL flasks turn the weakest ordinary enemies into little fish: each flask breaks on its enemy in a
 * puff and the fish fly off to the counter with the doubled reward (the game's own currency flight).
 *
 * Moment by moment (1x; every time is the battle's clock with a floor in real seconds, `span.ts`):
 *   0.00  the cast: the flasks leave the alchemist's tile on high curves (the big one twice the size, 0.34 s; the small ones 0.26 s, one every 0.035 s);
 *         a small flask's enemy is STOOD IN FOR by a copy of its picture, because the simulation takes it off the field in this very tick;
 *   a small flask lands  a pink puff on the enemy, a few shards of glass; the copy is gone and the fish fly (`fishHold.ts`: the reward and the
 *         ordinary death puff wait for the flask, so they do not leave a quarter of a second before it lands);
 *   0.34  the big flask lands: a bigger puff, a ring, a cream cloud over the boss, the glass, a camera nudge; the boss's own picture is put away and the
 *         fish pops in out of the smoke (0.22 s, with a little overshoot): the game's own painted fish, its length about the boss's width, with the boss's face
 *         on its head (the boss's picture, cut round); the chip pops on beside the health bar;
 *   swimming  the fish flops (about 18 degrees, a third of a second a flop), squashes, wags its tail, blows a bubble now and then, sweats a drop and trails
 *         a few drops of water. It keeps everything else the enemy has (the bar, its abilities, its damage); it only walks a quarter as fast. In its last
 *         half second it flops faster. The picture is a child of the enemy's own body (the field's), so it squashes when it is hit, leans with the walk and
 *         sorts in depth with the enemies;
 *   the end  (`fishEnd`) a pink puff, the boss's picture comes back and the boss shakes itself (a quick rock, 0.45 s); for `lock` seconds the chip shows a
 *         fish bone crossed out and its ring counts the lock down;
 *   it dies as a fish  the picture is put away at once, the boss's own death plays as for any boss.
 *
 * The big flask's fish is STATE, not staging: a cast the stage rule dropped still turns the enemy into a fish (the simulation did), so the fish appears
 * quietly (a short pop, no flask, no smoke, no sound) when the `status` event says so, and a fish the scene never heard of is found by looking at
 * `EnemyState.fish`. The picture needs no image file: the fish is `icon_fish`, the flasks `shot_flask`, the smoke `burst_puff` and the particle atlas, the face
 * the enemy's own art, the chips painted in code (`fishArt.ts`). Pieces are pooled (ten flasks, four fish), the smoke is the particle pool's (priority 1 and
 * 0); a lower quality tier gets fewer; under reduced motion nothing flies, flops or smokes (each flask fades in on its enemy, the fish pops in by fading) and
 * nothing shakes.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { hasTex, tex } from '@/core/assets';
import { TAU, lighten, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { paint } from '@/fx/paint';
import type { BattleEvents, EnemyState } from '@/game';
import { barWidth, bodyX, depthKey } from '../../field/policy';
import { enemyTextureKey } from '../../field/enemyView';
import { PulseClock } from '../../field/spRingMath';
import { CHIP_SIZE, FISH_PINK, FISH_PINK_LIGHT, FishChip, faceDisc } from '../../fishArt';
import { Gate, enemyInfo } from '../stage';
import { FISH_HOLD_MAX, fishHoldsOf, type FishHolds } from './fishHold';
import { Piece, Pieces } from './runPieces';
import { Age } from './span';
import { curvePoint, type Spot } from './jamMath';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

/** [battle seconds, real floor] of each moment. */
const FLY_BIG: readonly [number, number] = [0.34, 0.2];
const FLY_SMALL: readonly [number, number] = [0.26, 0.16];
const POP: readonly [number, number] = [0.22, 0.12];
const BACK: readonly [number, number] = [0.45, 0.3];
/** Battle seconds between one flask leaving the paw and the next. */
const STAGGER = 0.035;
/** One flop of the fish takes this long on the (capped) clock, and the last stretch before it wears off flops this much faster. */
const FLOP = 0.35;
const WARN_SECONDS = 0.55;
const WARN_RATE = 1.45;
/** The most flasks alive (two casts' worth), fish at once, and how long a fish no event ended is kept past its time. */
const THROWS = 10;
const FISH_MAX = 4;
const GRACE = 1.6;
/** The scene looks for fish it was not told about every this many frames. */
const RECONCILE_EVERY = 10;
/** A fish is about this many times its enemy's drawn width long, and never shorter or longer than these (design px). */
const FISH_LEN = 1.12;
const FISH_MIN = 66;
const FISH_MAX_LEN = 128;
/** The boss's round face: its centre on the fish's head and its width, as shares of the fish's length (the `icon_fish` picture's head). */
const FACE_AT = { x: 0.29, y: -0.14 } as const;
const FACE_W = 0.4;
/** How big a flask is drawn: its height, design px. */
const FLASK_SMALL = 34;
const FLASK_BIG = 66;
/** The most particles a fish adds a second while it swims, by tier. */
const BUBBLE_EVERY = [0, 0.9, 0.5] as const;

const POOF: EmitDef = {
  tex: 'smoke', prio: 1, count: 8, life: [0.45, 0.75], shape: { type: 'circle', r: 14 }, speed: [20, 80], drag: 2.6, gravity: -18,
  size: [30, 44], sizeEnd: [70, 104], rot: [0, TAU], spin: [-1, 1], colors: [FISH_PINK_LIGHT, FISH_PINK], alpha: 0.85, fadeIn: 0.06, fadeOut: 0.6,
};
const POOF_SMALL: EmitDef = {
  tex: 'smoke', prio: 1, count: 4, life: [0.35, 0.55], shape: { type: 'circle', r: 8 }, speed: [20, 70], drag: 2.6, gravity: -16,
  size: [20, 30], sizeEnd: [46, 66], rot: [0, TAU], spin: [-1, 1], colors: [FISH_PINK_LIGHT, FISH_PINK], alpha: 0.85, fadeIn: 0.06, fadeOut: 0.6,
};
const GLASS: EmitDef = {
  tex: 'shard', prio: 1, count: 6, life: [0.3, 0.5], speed: [90, 230], dir: -Math.PI / 2, spread: Math.PI, gravity: 440, drag: 1, size: [10, 16], sizeEnd: [6, 10],
  rot: [0, TAU], spin: [-6, 6], colors: [Hue.cream, lighten(Hue.heal, 0.6)], alpha: 1, fadeIn: 0, fadeOut: 0.5,
};
const BUBBLE: EmitDef = {
  tex: 'bubble', prio: 0, count: 1, life: [0.7, 1.0], speed: [18, 40], dir: -Math.PI / 2, spread: 0.6, gravity: -34, drag: 0.8, size: [10, 15], sizeEnd: [12, 19],
  colors: [Hue.cream, FISH_PINK_LIGHT], alpha: 0.9, fadeIn: 0.1, fadeOut: 0.5, sway: { amp: [3, 6], freq: [2, 3] },
};
const SWEAT: EmitDef = {
  tex: 'droplet', prio: 0, count: 1, life: [0.35, 0.5], speed: [30, 60], dir: -Math.PI / 2 - 0.8, spread: 0.5, gravity: 520, drag: 0.6, size: [9, 13], sizeEnd: [7, 10],
  colors: [Hue.iceLight, Hue.ice], alpha: 0.95, fadeIn: 0, fadeOut: 0.4,
};
const DRIP: EmitDef = {
  tex: 'droplet', prio: 0, count: 1, life: [0.3, 0.45], speed: [10, 36], dir: Math.PI / 2, spread: 1.2, gravity: 260, drag: 1, size: [7, 10], sizeEnd: [4, 7],
  colors: [Hue.iceLight, Hue.ice], alpha: 0.85, fadeIn: 0, fadeOut: 0.5,
};

/**
 * One flask: it flies from the alchemist to its target on a high curve. A SMALL flask also has a stand-in for the enemy it is flying to, a copy of the
 * enemy's picture that stays where the enemy stood until the flask breaks on it (the simulation took the enemy off the field in the cast's tick).
 */
class Throw extends Piece {
  readonly flask = new Sprite();
  readonly stand = new Sprite();
  big = false;
  uid = 0;
  /** The enemy's drawn size (how big its puff is) and its place. */
  size = 56;
  sx = 0;
  sy = 0;
  ex = 0;
  ey = 0;
  /** The high point of the curve above the straight line, and how many turns the flask spins on the way. */
  rise = 80;
  turns = 2;
  readonly ctrl: Spot = { x: 0, y: 0 };
  hasStand = false;
  /** The simulation's place of the enemy (the reward flies from there). */
  constructor(front: Container, behind: Container) {
    super();
    this.flask.texture = paint('shot_flask');
    this.flask.anchor.set(0.5, 0.55);
    this.flask.eventMode = 'none';
    this.flask.visible = false;
    this.stand.anchor.set(0.5);
    this.stand.eventMode = 'none';
    this.stand.visible = false;
    front.addChild(this.flask);
    behind.addChild(this.stand);
  }
  hide(): void {
    this.on = false;
    this.flask.visible = false;
    this.stand.visible = false;
  }
  destroy(): void {
    this.flask.destroy();
    this.stand.destroy();
  }
}

/** The picture of the big fish: the game's painted fish with the boss's round face on its head. A child of the enemy's own body while it swims. */
class FishBody {
  readonly root = new Container();
  readonly fish = new Sprite();
  readonly face = new Sprite();
  /** The face is a baked round badge, or (where it could not be baked) the plain picture at the same size. */
  private baked = false;

  constructor() {
    this.root.label = 'sp-fish';
    this.root.eventMode = 'none';
    this.fish.anchor.set(0.5);
    this.face.anchor.set(0.5);
    this.fish.eventMode = 'none';
    this.face.eventMode = 'none';
    this.root.addChild(this.fish, this.face);
  }

  /** Dress it as the fish of the enemy `id` whose drawn width is `size`. Returns its length. */
  dress(id: string, art: Texture, size: number, tint: number): number {
    const fishTex = hasTex('icon_fish') ? tex('icon_fish') : art;
    const len = Math.max(FISH_MIN, Math.min(FISH_MAX_LEN, size * FISH_LEN));
    this.fish.texture = fishTex;
    this.fish.scale.set(len / Math.max(1, fishTex.width));
    // The boss's own colour, a quarter of it, over the fish's.
    this.fish.tint = mixColor(0xffffff, tint, 0.25);
    const round = faceDisc(art, id);
    this.baked = round !== null;
    this.face.texture = round ?? art;
    const w = len * FACE_W;
    this.face.scale.set(w / Math.max(1, this.face.texture.width));
    this.face.position.set(len * FACE_AT.x, len * FACE_AT.y);
    this.root.rotation = 0;
    this.root.skew.set(0, 0);
    this.root.scale.set(1);
    this.root.position.set(0, 0);
    this.root.alpha = 1;
    return len;
  }

  /** Whether the face is the baked round badge (tests). */
  get round(): boolean {
    return this.baked;
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

type Mode = 'wait' | 'swim' | 'back' | 'lock';

/** One enemy that is, was a moment ago, or cannot yet again be a fish. */
class Fish {
  uid = 0;
  en: EnemyState | null = null;
  mode: Mode = 'swim';
  /** The flask's flight is staged (a cast the stage rule admitted): the fish waits for its flask, pops out of smoke and the end is loud. */
  loud = false;
  boss = false;
  size = 56;
  /** Battle times: the cast, when the fish wears off, and when the lock is over. */
  at = 0;
  until = 0;
  seconds = 1;
  lock = 0;
  lockUntil = 0;
  /** The enemy's own picture, put away while the fish swims. */
  view: Container | null = null;
  home: Container | null = null;
  sprite: Sprite | null = null;
  fishBody: FishBody | null = null;
  chip: FishChip | null = null;
  len = 0;
  facing = 1;
  /** Seconds since the current mode began (battle clock with a real floor) and the pop-in's own age. */
  readonly age = new Age();
  readonly popAge = new Age();
  /** The next bubble / sweat drop / drip, on the real clock. */
  nextBubble = 0;
  nextDrip = 0;
  /** Higher = older. */
  seq = 0;
}

class FishScene implements SpScene<'fish'> {
  private readonly front: Container;
  private readonly behind: Container;
  private readonly throws: Pieces<Throw>;
  private readonly fishes: Fish[] = [];
  private readonly spare: FishBody[] = [];
  private readonly chips: FishChip[] = [];
  private readonly holds: FishHolds;
  private readonly clock = new PulseClock();
  private readonly spot: Spot = { x: 0, y: 0 };
  private readonly off: Array<() => void> = [];
  private seq = 0;
  private frame = 0;
  private broken = false;

  constructor(private readonly env: SpEnv) {
    const layers = env.ctx.layers;
    this.front = layers.fxFront;
    this.behind = layers.enemies ?? layers.fxFront;
    this.holds = fishHoldsOf(env.battle);
    this.throws = new Pieces<Throw>(() => new Throw(this.front, this.behind), THROWS);
    const ev = env.battle.events;
    this.off.push(
      ev.on('status', (e) => this.safe('status', () => this.onStatus(e))),
      ev.on('fishEnd', (e) => this.safe('end', () => this.onEnd(e))),
      ev.on('enemyDie', (e) => this.safe('die', () => this.onDie(e))),
    );
  }

  /** The scene's own listeners are called by the simulation in the middle of a rule: a throw here must not unwind into it. */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] fish ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  // ── the cast ──

  cast(e: SpCastOf<'fish'>): void {
    const { stage, battle } = this.env;
    const d = e.data;
    const calm = stage.reduced;
    const sx = e.x;
    const sy = e.y - 24;
    let i = 0;
    if (d.big) {
      const f = this.fishFor(d.big.uid, true);
      f.loud = true;
      f.mode = 'wait';
      f.boss = d.big.boss;
      f.at = battle.time;
      f.seconds = d.big.seconds;
      f.until = battle.time + d.big.seconds;
      f.lock = d.big.lock;
      f.en = this.find(d.big.uid) ?? f.en;
      this.throwFlask(true, d.big.uid, d.big.x, d.big.y, sx, sy, i++, calm, f.en);
    }
    for (const s of d.small) {
      // The kill is expected: its reward and its death wait for the flask (`fishHold.ts`).
      this.holds.expect(s.uid, s.x, s.y, battle.time + FISH_HOLD_MAX);
      this.throwFlask(false, s.uid, s.x, s.y, sx, sy, i++, calm, this.find(s.uid));
    }
    stage.play(stage.rules.big, 'atk_t_alch', 0.7, 0.8, 0.03);
    stage.play(stage.rules.zone, 'whoosh', 0.3, 1.3, 0.05);
  }

  private throwFlask(big: boolean, uid: number, x: number, y: number, sx: number, sy: number, i: number, calm: boolean, en: EnemyState | null): void {
    const t = this.throws.take();
    const life = big ? FLY_BIG : FLY_SMALL;
    t.start(life[0], life[1]);
    t.age.battle = -STAGGER * i;
    t.age.real = -STAGGER * i;
    t.big = big;
    t.uid = uid;
    const info = en ? enemyInfo(en.id) : null;
    t.size = info ? info.size : 56;
    t.sx = sx;
    t.sy = sy;
    t.ex = bodyX(x, t.size);
    t.ey = y - (big ? 4 : 2);
    t.rise = big ? 96 : 70;
    t.turns = big ? 1 : 2.2;
    const dx = t.ex - sx;
    const dy = t.ey - sy;
    t.ctrl.x = (sx + t.ex) / 2;
    t.ctrl.y = Math.min(sy, t.ey) - t.rise - Math.min(36, Math.hypot(dx, dy) * 0.08);
    t.flask.visible = false;
    t.hasStand = false;
    t.stand.visible = false;
    if (!big) {
      const view = this.env.ctx.enemyView?.(uid);
      const spr = view && !view.destroyed ? view.getChildByLabel('sprite', true) : null;
      const texture = en ? tex(enemyTextureKey(en.id)) : spr instanceof Sprite ? spr.texture : null;
      if (texture && info) {
        const k = info.size / Math.max(texture.width, texture.height, 1);
        const face = en ? (Math.cos(en.angle) < 0 ? -1 : 1) : 1;
        t.stand.texture = texture;
        t.stand.position.set(bodyX(x, info.size), y);
        t.stand.scale.set(k * face, k);
        t.stand.alpha = 1;
        t.stand.zIndex = depthKey(y, info.size) + 0.5;
        t.stand.visible = true;
        t.hasStand = true;
      }
    }
    this.flaskLook(t, 0, calm);
  }

  private flaskLook(t: Throw, k: number, calm: boolean): void {
    const f = t.flask;
    const h = t.big ? FLASK_BIG : FLASK_SMALL;
    const base = h / Math.max(1, f.texture.height);
    if (calm) {
      f.position.set(t.ex, t.ey - 8);
      f.rotation = 0;
      f.scale.set(base);
      f.alpha = Math.min(1, k * 3);
      return;
    }
    curvePoint(t.sx, t.sy, t.ctrl.x, t.ctrl.y, t.ex, t.ey, Ease.sineInOut(k), this.spot);
    f.position.set(this.spot.x, this.spot.y);
    f.rotation = k * TAU * t.turns;
    const pop = k < 0.18 ? Ease.backOut(k / 0.18) : 1;
    f.scale.set(base * Math.max(0.05, pop));
    f.alpha = 1;
  }

  // ── a flask lands ──

  private landed(t: Throw): void {
    const { stage } = this.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    const info = t.size;
    const kids = detail === 0 ? 0.5 : 1;
    if (t.big) {
      const f = this.fishes.find((x) => x.uid === t.uid && x.mode === 'wait');
      if (!calm) {
        stage.fx.ps.burst(POOF, t.ex, t.ey, { scale: Math.max(0.9, info / 70), count: kids });
        stage.fx.ps.burst(GLASS, t.ex, t.ey - 6, { count: kids });
        stage.fx.shockwave(t.ex, t.ey + info * 0.3, { color: FISH_PINK, radius: info * 0.95 });
        stage.fx.fleck(paint('burst_puff'), t.ex, t.ey, { life: 0.3, size: info * 0.85, sizeEnd: info * 1.25, color: FISH_PINK_LIGHT, alpha: 0.95, fadeAt: 0.35 });
        stage.shake(Trauma.t1, Gate.spShake, 0.3);
      }
      stage.play(stage.rules.big, 'foe_glass_hit', 0.7, 0.8, 0.03);
      stage.play(stage.rules.zone, 'molt', 0.7, 0.72, 0.03);
      if (f) this.pop(f);
      return;
    }
    if (!calm) stage.fx.ps.burst(POOF_SMALL, t.ex, t.ey, { scale: Math.max(0.8, info / 56), count: kids });
    if (!calm && detail > 0) {
      stage.fx.ps.burst(GLASS, t.ex, t.ey - 4, { scale: 0.7, count: 0.6 });
      stage.fx.fleck(paint('burst_puff'), t.ex, t.ey, { life: 0.24, size: info * 0.7, sizeEnd: info * 1.05, color: FISH_PINK_LIGHT, alpha: 0.9, fadeAt: 0.35 });
    }
    stage.play(stage.rules.hit, 'foe_glass_hit', 0.34, 1.25, 0.05);
    stage.play(stage.rules.zone, 'molt', 0.32, 1.4, 0.05);
    this.holds.release(t.uid);
  }

  // ── the fish ──

  /** The fish record of `uid`, made if there is none (a fifth takes over the oldest). `fresh`: a new cast starts over, whatever the enemy still wore. */
  private fishFor(uid: number, fresh = false): Fish {
    let f = this.fishes.find((x) => x.uid === uid);
    if (f && fresh) {
      this.drop(f);
      f = undefined;
    }
    if (f) return f;
    if (this.fishes.length >= FISH_MAX) {
      let oldest = this.fishes[0] as Fish;
      for (const x of this.fishes) if (x.seq < oldest.seq) oldest = x;
      this.drop(oldest);
    }
    f = new Fish();
    f.uid = uid;
    f.seq = ++this.seq;
    this.fishes.push(f);
    return f;
  }

  private find(uid: number): EnemyState | null {
    for (const e of this.env.battle.enemies) if (e.uid === uid) return e;
    return null;
  }

  /** The `status` event: the enemy is a fish. A cast that was staged is already waiting for its flask; any other is shown at once and quietly. */
  private onStatus(e: BattleEvents['status']): void {
    if (e.kind !== 'fish') return;
    const { battle } = this.env;
    const f = this.fishFor(e.enemy.uid);
    f.en = e.enemy;
    if (f.loud && f.mode === 'wait') {
      f.seconds = e.duration;
      f.until = f.at + e.duration;
      return;
    }
    if (f.mode === 'swim' && f.fishBody) return;
    f.loud = false;
    f.at = battle.time;
    f.seconds = e.duration;
    f.until = battle.time + e.duration;
    f.lock = 0;
    f.boss = enemyInfo(e.enemy.id).boss;
    this.pop(f);
  }

  /** The smoke is up: put the boss's own picture away and let the fish out. */
  private pop(f: Fish): void {
    const { stage, ctx } = this.env;
    const calm = stage.reduced;
    const en = f.en ?? this.find(f.uid);
    if (!en) {
      this.drop(f);
      return;
    }
    f.en = en;
    const info = enemyInfo(en.id);
    f.size = info.size;
    f.boss = info.boss;
    const view = ctx.enemyView?.(f.uid);
    if (view && !view.destroyed) {
      f.view = view;
      f.home = view.getChildByLabel('body', true);
      const spr = view.getChildByLabel('sprite', true);
      f.sprite = spr instanceof Sprite ? spr : null;
    }
    f.mode = 'swim';
    f.age.reset();
    f.popAge.reset();
    f.facing = Math.cos(en.angle) < 0 ? -1 : 1;
    f.nextBubble = 0.35;
    f.nextDrip = 0.2;
    // The fish: the enemy's picture would be the face, the painted fish the body.
    const art = tex(enemyTextureKey(en.id));
    const body = this.spare.pop() ?? new FishBody();
    f.len = body.dress(en.id, art, info.size, info.tint);
    f.fishBody = body;
    if (f.home && !f.home.destroyed) f.home.addChild(body.root);
    else this.front.addChild(body.root);
    if (f.sprite) f.sprite.visible = false;
    this.fishLook(f, 0, calm, 0);
    // The chip beside the health bar.
    const chip = this.chips.pop() ?? new FishChip();
    f.chip = chip;
    chip.root.visible = true;
    this.dressChip(f, true);
    if (f.view && !f.view.destroyed) f.view.addChild(chip.root);
    else this.front.addChild(chip.root);
    chip.set('fish', this.fraction(f));
    // A fish that was not staged (the cast lost the stage rule) pops quietly, with a puff of the smaller kind.
    if (!f.loud && !calm) stage.fx.ps.burst(POOF_SMALL, bodyX(en.x, info.size), en.y, { scale: Math.max(0.8, info.size / 56), count: stage.detail === 0 ? 0.4 : 0.8 });
  }

  /** Where the chip sits: where the enemy's status sticker would be, one place further right when it already wears one. */
  private dressChip(f: Fish, snap: boolean): void {
    const chip = f.chip;
    const en = f.en;
    if (!chip || !en) return;
    const slot = en.frozen || en.slow > 0.05 || en.burning || en.poisoned || en.enraged ? 1 : 0;
    const size = f.size;
    const x = barWidth(size) / 2 + 8 + slot * (CHIP_SIZE - 6);
    const y = -size * 0.56 - 12;
    if (snap || chip.root.x !== x || chip.root.y !== y) chip.root.position.set(x, y);
  }

  /** Share of the fish's time (or of its lock) that is left. */
  private fraction(f: Fish): number {
    const now = this.env.battle.time;
    if (f.mode === 'lock') return f.lock > 0 ? Math.max(0, Math.min(1, (f.lockUntil - now) / f.lock)) : 0;
    return f.seconds > 0 ? Math.max(0, Math.min(1, (f.until - now) / f.seconds)) : 0;
  }

  /** The `fishEnd` event: it wears off. */
  private onEnd(e: BattleEvents['fishEnd']): void {
    const f = this.fishes.find((x) => x.uid === e.enemy.uid);
    if (!f) return;
    f.lock = e.lock;
    this.end(f, true);
  }

  /** It wears off: the boss's picture comes back with a puff, the boss shakes itself, and the lock starts. */
  private end(f: Fish, loud: boolean): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    if (f.mode === 'wait') {
      // It wore off before its flask landed (a bug, a 3x speed and a long floor): there was never a fish to show.
      this.drop(f);
      return;
    }
    const en = f.en;
    const x = en ? bodyX(en.x, f.size) : this.spot.x;
    const y = en ? en.y : this.spot.y;
    this.putAway(f);
    if (f.sprite) f.sprite.visible = true;
    if (loud && en && !calm) {
      stage.fx.ps.burst(POOF, x, y, { scale: Math.max(0.8, f.size / 80), count: stage.detail === 0 ? 0.5 : 0.8 });
      stage.fx.fleck(paint('burst_puff'), x, y, { life: 0.26, size: f.size * 0.8, sizeEnd: f.size * 1.2, color: FISH_PINK_LIGHT, alpha: 0.9, fadeAt: 0.35 });
    }
    if (loud && f.loud) stage.play(stage.rules.zone, 'molt', 0.55, 1.15, 0.04);
    f.mode = 'back';
    f.age.reset();
    f.lockUntil = battle.time + f.lock;
    if (f.lock <= 0 || !f.chip) {
      this.releaseChip(f);
    } else {
      f.chip.set('lock', 1);
    }
  }

  /** Take the fish's picture off the enemy: the fish goes back to the spares. (The boss's own picture is shown again by the caller.) */
  private putAway(f: Fish): void {
    const b = f.fishBody;
    if (!b) return;
    f.fishBody = null;
    b.root.parent?.removeChild(b.root);
    this.spare.push(b);
  }

  private releaseChip(f: Fish): void {
    const c = f.chip;
    if (!c) return;
    f.chip = null;
    c.root.parent?.removeChild(c.root);
    c.root.visible = false;
    this.chips.push(c);
  }

  /** Put everything of a fish away and forget it: the enemy's own picture is shown again. */
  private drop(f: Fish): void {
    this.putAway(f);
    this.releaseChip(f);
    if (f.sprite && !f.sprite.destroyed) {
      f.sprite.visible = true;
      f.sprite.rotation = 0;
    }
    const i = this.fishes.indexOf(f);
    if (i >= 0) this.fishes.splice(i, 1);
  }

  /** The enemy died (as a fish, or while it could not be turned again): its own death plays as for any enemy. */
  private onDie(e: BattleEvents['enemyDie']): void {
    const f = this.fishes.find((x) => x.uid === e.enemy.uid);
    if (!f) return;
    const { stage } = this.env;
    const swimming = f.mode === 'swim' && f.fishBody !== null;
    const x = bodyX(e.x, f.size);
    this.drop(f);
    if (swimming && !stage.reduced) stage.fx.ps.burst(POOF_SMALL, x, e.y, { scale: Math.max(0.8, f.size / 70), count: stage.detail === 0 ? 0.4 : 0.8 });
  }

  // ── the picture of a swimming fish ──

  /** Pose the fish for this frame. `clock` is the capped flop clock, `panic` 0..1 how close its end is. */
  private fishLook(f: Fish, clock: number, calm: boolean, panic: number): void {
    const b = f.fishBody;
    if (!b) return;
    const r = b.root;
    const pop = f.popAge.k(POP[0], POP[1]);
    const w = (TAU / FLOP) * (1 + (WARN_RATE - 1) * panic);
    if (calm) {
      r.rotation = 0;
      r.skew.set(0, 0);
      r.scale.set(f.facing, 1);
      r.alpha = Math.min(1, pop * 2);
      return;
    }
    const open = Ease.backOut(pop);
    const flop = Math.sin(clock * w);
    const squash = Math.sin(clock * w * 2) * 0.05;
    r.rotation = flop * 0.31 * f.facing;
    r.skew.set(0, Math.sin(clock * w + 0.8) * 0.12 * f.facing);
    const s = Math.max(0.05, open);
    r.scale.set(f.facing * s * (1 + squash), s * (1 - squash));
    r.position.set(0, -Math.abs(Math.sin(clock * w * 0.5)) * 3.5);
    r.alpha = 1;
  }

  // ── the frame ──

  update(dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    const now = battle.time;
    this.frame++;
    this.clock.advance(battleDt, dt);
    this.holds.sweep(now);

    for (const t of this.throws.list) {
      if (!t.on) continue;
      t.age.tick(battleDt, dt);
      if (t.age.battle < 0 || t.age.real < 0) continue;
      const k = t.k();
      if (k >= 1) {
        this.landed(t);
        t.hide();
        continue;
      }
      t.flask.visible = true;
      this.flaskLook(t, k, calm);
    }

    // The enemies the simulation says are fish and the scene has not heard of (a lost event, a revive): shown quietly. Looked for every tenth frame.
    if (this.frame % RECONCILE_EVERY === 0) this.reconcile();
    if (this.fishes.length === 0) return;

    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i] as Fish;
      f.age.tick(battleDt, dt);
      f.popAge.tick(battleDt, dt);
      if (f.mode === 'wait') {
        // The flask is on its way; if it was lost (a cleared piece) the fish gives up a moment after its time.
        if (now > f.until + GRACE) this.drop(f);
        continue;
      }
      const en = f.en;
      if (en && this.alive(en)) this.follow(f, en, calm, dt);
      if (f.mode === 'swim') {
        const left = f.until - now;
        const panic = left < WARN_SECONDS && left > -0.2 ? Math.min(1, (WARN_SECONDS - left) / WARN_SECONDS) : 0;
        this.fishLook(f, this.clock.seconds, calm, panic);
        if (f.chip) f.chip.set('fish', this.fraction(f));
        if (now > f.until + GRACE) this.end(f, false);
        else this.sparkle(f, en, calm, dt);
      } else if (f.mode === 'back') {
        const k = f.age.k(BACK[0], BACK[1]);
        if (f.sprite && !f.sprite.destroyed) f.sprite.rotation = calm || k >= 1 ? 0 : Math.sin(k * TAU * 3) * 0.16 * (1 - k);
        if (k >= 1) {
          if (f.lock > 0 && f.chip && now < f.lockUntil) f.mode = 'lock';
          else this.drop(f);
        }
      } else if (f.mode === 'lock') {
        if (now >= f.lockUntil || !en || !this.alive(en)) {
          this.drop(f);
          continue;
        }
        if (f.chip) f.chip.set('lock', this.fraction(f));
      }
    }
  }

  private alive(en: EnemyState): boolean {
    for (const e of this.env.battle.enemies) if (e === en) return true;
    return false;
  }

  /** Face the way the enemy walks (and keep the chip clear of its other sticker). */
  private follow(f: Fish, en: EnemyState, _calm: boolean, _dt: number): void {
    const cos = Math.cos(en.angle);
    if (cos > 0.2) f.facing = 1;
    else if (cos < -0.2) f.facing = -1;
    if (this.frame % 6 === 0 && f.chip) this.dressChip(f, false);
  }

  /** The bubbles and drops of a swimming fish. */
  private sparkle(f: Fish, en: EnemyState | null, calm: boolean, dt: number): void {
    if (calm || !en) return;
    const { stage } = this.env;
    const detail = stage.detail;
    if (detail === 0) return;
    f.nextBubble -= dt;
    f.nextDrip -= dt;
    const x = bodyX(en.x, f.size);
    const len = f.len;
    if (f.nextBubble <= 0) {
      f.nextBubble = BUBBLE_EVERY[detail];
      stage.fx.ps.burst(BUBBLE, x + f.facing * len * 0.46, en.y - len * 0.06, { count: 1 });
    }
    if (f.nextDrip <= 0) {
      f.nextDrip = 0.28;
      stage.fx.ps.burst(DRIP, x - f.facing * len * 0.3, en.y + len * 0.12, { count: 1 });
      if (this.frame % 2 === 0) stage.fx.ps.burst(SWEAT, x + f.facing * len * 0.26, en.y - len * 0.3, { count: 1 });
    }
  }

  /** Enemies that are fish by the simulation's state and unknown to the scene get a fish at once. */
  private reconcile(): void {
    for (const en of this.env.battle.enemies) {
      if (!en.fish) continue;
      let known = false;
      for (const f of this.fishes) if (f.uid === en.uid) known = true;
      if (known) continue;
      const f = this.fishFor(en.uid);
      f.en = en;
      f.loud = false;
      f.at = this.env.battle.time;
      f.seconds = 1.5;
      f.until = f.at + f.seconds;
      f.lock = 0;
      this.pop(f);
    }
  }

  clear(): void {
    this.throws.clear();
    this.holds.flush();
    for (const f of [...this.fishes]) this.drop(f);
  }

  destroy(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    this.clear();
    this.throws.destroy();
    for (const b of this.spare) b.destroy();
    this.spare.length = 0;
    for (const c of this.chips) c.destroy();
    this.chips.length = 0;
  }

  /** What is alive right now (QA and tests). */
  live(): { throws: number; stands: number; fish: Array<{ uid: number; mode: Mode; loud: boolean; left: number; hidden: boolean }>; held: number } {
    const now = this.env.battle.time;
    return {
      throws: this.throws.live,
      stands: this.throws.list.filter((t) => t.on && t.stand.visible).length,
      fish: this.fishes.map((f) => ({ uid: f.uid, mode: f.mode, loud: f.loud, left: Math.round((f.mode === 'lock' ? f.lockUntil - now : f.until - now) * 100) / 100, hidden: f.sprite ? !f.sprite.visible : false })),
      held: this.holds.size,
    };
  }
}

export const makeFish: SpSceneFactory<'fish'> = (env) => new FishScene(env);
