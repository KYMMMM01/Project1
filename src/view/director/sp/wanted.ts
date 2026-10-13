/**
 * Wanted: One Shot!, the gunner's scene (docs/design_skills_v2.md 3.5): a big wanted poster slaps onto the elite or boss, a cork flies from
 * the gunner's tile into the middle of the poster, and the boss bar loses a bite. With no elite or boss, a hand-sized poster goes on the
 * sturdiest ordinary enemy and the usual damage number follows.
 *
 * Moment by moment (bite, 1x; every time is the battle's clock with a floor in real seconds, `span.ts`):
 *   0.00  the poster slaps on (big, quick, tilted), a paper "whoop"; the boss bar is HELD at the health it had (`biteHold.ts`);
 *   0.11  the cork leaves the gunner's tile (the gun's own sound) and flies at the poster, which has moved with its target;
 *   0.40  the cork goes through the poster: a hole, sparks and paper scraps, a ring, a nudge; the hold ends and the bar lets the bite fall
 *         out of it (the bar draws "-6%", the egg and the stamp itself: `hud/BiteMarks.ts`); an egg on the poster fills, and a seal goes on
 *         it when the pool is empty;
 *   0.40+ the poster peels off and falls (0.5 s).
 * The simulation took the health at the cast tick, so the picture is late by the 0.4 s: the bar is held to make the bite arrive WITH the cork.
 * A bite that kills (the `enemyDie` came first, then the `bite`) has no wait: the cork is through the poster at once, and nothing is held.
 *
 * The poster is a paper picture painted in code (`wantedArt.ts`) with the target's own sprite in sepia in its window. Nothing is drawn with
 * words. The pieces are pooled (at most four posters at once, each with its cork and trail), the sparks and scraps are the particle pool's
 * (priority 1), and the quality tier thins them; under reduced motion the poster just appears and fades and nothing shakes.
 */
import { Container, Sprite, type Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, fxTex, type EmitDef } from '@/fx';
import { Light } from '@/fx/light';
import { Hue } from '@/fx/palette';
import { paint } from '@/fx/paint';
import { Color } from '@/ui/theme';
import type { BattleEvents, EnemyState } from '@/game';
import { bodyX } from '../../field/policy';
import { enemyTextureKey } from '../../field/enemyView';
import {
  BITE_LAND, BITE_LAND_FLOOR, SMALL_LAND, SMALL_LAND_FLOOR, biteHoldsOf, eggsFilled, type BiteHolds,
} from '../../biteHold';
import { EGG_SLOTS, PAPER_OLD, PORTRAIT_AT, SEPIA, wantedArt, type WantedArt } from '../../wantedArt';
import { Gate, enemyInfo } from '../stage';
import { Age } from './span';
import { NIGHT_LABEL, type SpCastOf, type SpEnv, type SpScene, type SpSceneFactory } from './types';

/** The share of the first span at which the cork leaves the gun: the poster has the beginning to itself. */
const LAUNCH_AT = 0.28;
/** How long a poster takes to peel off and fall after the cork went through it: [battle seconds, real floor]. */
const FALL: readonly [number, number] = [0.5, 0.3];
/** The seal and a filled egg pop over this long after the landing. */
const POP: readonly [number, number] = [0.18, 0.12];
/** The most posters (each with its cork) alive at once: the stage rule lets one cast through every 0.25 s and a poster lives about 0.9 s. */
const CASES = 4;
/** The cork's picture is this wide on the field (design px), and its trail this long. */
const CORK_W = 40;
const TRAIL_LEN = 110;
/** How far the muzzle is above the tile's centre. */
const MUZZLE_RISE = 8;
/** The poster covers this share of a big target's body height at the most. */
const BIG_FIT = [0.78, 1.25] as const;
const SMALL_FIT = [0.4, 0.52] as const;
/** The poster starts this much bigger than it settles (a share), and on a boss this much (the boss's face stays in sight while the cork flies). */
const SLAP = 0.85;
const SLAP_BOSS = 0.5;

const SCRAPS: EmitDef = {
  tex: 'confetti', prio: 1, count: 8, life: [0.5, 0.85], shape: { type: 'circle', r: 6 }, speed: [100, 250], drag: 2.2, gravity: 280,
  size: [9, 14], sizeEnd: [7, 11], rot: [0, TAU], spin: [-9, 9], flip: [3, 9], colors: [Color.paperLight], palette: [Color.paperLight, PAPER_OLD, Color.kraft],
  alpha: 1, fadeIn: 0, fadeOut: 0.45,
};
const SPARKS: EmitDef = {
  tex: 'spark', prio: 1, count: 6, life: [0.14, 0.26], speed: [240, 420], drag: 3, alignVel: true, stretch: 0.002, size: [22, 34],
  sizeEnd: [6, 10], colors: [Hue.spark, Hue.cream], fadeIn: 0, fadeOut: 0.6,
};
/** The gun's smoke at the muzzle and the little puff where the cork goes in. */
const PUFF: EmitDef = {
  tex: 'smoke', prio: 1, count: 3, life: [0.3, 0.5], shape: { type: 'circle', r: 5 }, speed: [30, 90], drag: 3, gravity: -16, size: [18, 26],
  sizeEnd: [40, 58], rot: [0, TAU], spin: [-1, 1], colors: [Hue.dust, Hue.smoke], alpha: 0.6, fadeIn: 0.05, fadeOut: 0.6,
};

/** One shot: its poster, its cork, and where it is in its short life. Pooled. */
class Shot {
  readonly root = new Container();
  readonly paper = new Sprite();
  readonly portrait = new Sprite();
  readonly eggs = [new Sprite(), new Sprite()];
  readonly hole = new Sprite();
  readonly stamp = new Sprite();
  readonly cork = new Sprite();
  readonly trail = new Sprite();
  /** Before the cork lands, then after: two clocks. */
  readonly flight = new Age();
  readonly fall = new Age();
  on = false;
  landed = false;
  launched = false;
  /** A big poster (a bite) or a hand-sized one (the small shot). */
  big = true;
  /** The bite emptied the pool and the seal goes on. */
  closed = false;
  /** The eggs filled before this bite and after it. */
  eggsBefore = 0;
  eggsAfter = 0;
  /** The target (null when the event named one the battle does not have), its uid and the last place it was seen. */
  enemy: EnemyState | null = null;
  uid = 0;
  x = 0;
  y = 0;
  /** The poster's centre this frame, where the cork aims. */
  aimX = 0;
  aimY = 0;
  /** The gun's muzzle. */
  fromX = 0;
  fromY = 0;
  /** How many holds this shot has on the bar (its own bite, and the bites of other gunners that were told to ride on its cork). */
  holdCount = 0;
  /** The shot's own `bite` event has come (a second one on the same target while it is in the air is another gunner's). */
  biteSeen = false;
  /** Battle and real life of the first span and the poster's size and tilt. */
  life = BITE_LAND;
  floor = BITE_LAND_FLOOR;
  size = 1;
  /** How much bigger than its size the poster starts when it slaps on (a share): a boss's body is not hidden under a poster that big. */
  slap = SLAP;
  tilt = 0;
  bodyHalf = 0;
  /** Higher = older: which shot to take over when the pool is full. */
  seq = 0;

  constructor() {
    this.paper.anchor.set(0.5);
    this.portrait.anchor.set(0.5);
    for (const s of [this.hole, this.stamp, ...this.eggs]) s.anchor.set(0.5);
    this.cork.anchor.set(0.5);
    this.root.addChild(this.paper, this.portrait, ...this.eggs, this.hole, this.stamp);
    this.root.eventMode = 'none';
    this.root.visible = false;
    this.cork.visible = false;
    this.trail.visible = false;
    this.cork.eventMode = 'none';
    this.trail.eventMode = 'none';
  }
}

class WantedScene implements SpScene<'wanted'> {
  private readonly front: Container;
  private readonly shots: Shot[] = [];
  private readonly art: WantedArt;
  private readonly holds: BiteHolds;
  private corkTex: Texture | null = null;
  private seq = 0;
  private last: Shot | null = null;
  private readonly offBite: () => void;

  constructor(private readonly env: SpEnv) {
    this.front = env.ctx.layers.fxFront;
    this.art = wantedArt();
    this.holds = biteHoldsOf(env.battle);
    this.offBite = env.battle.events.on('bite', (e) => this.onBite(e));
  }

  cast(e: SpCastOf<'wanted'>): void {
    const { stage, battle } = this.env;
    const d = e.data;
    const big = d.mode === 'bite';
    const s = this.take();
    this.last = s;
    s.on = true;
    s.landed = false;
    s.launched = false;
    s.biteSeen = false;
    s.big = big;
    s.closed = big && d.closed;
    s.eggsAfter = big ? eggsFilled(d.taken, d.pool) : 0;
    s.eggsBefore = big ? eggsFilled(d.taken - d.share, d.pool) : 0;
    s.uid = d.targetUid;
    s.seq = ++this.seq;
    s.flight.reset();
    s.fall.reset();
    s.enemy = null;
    for (const en of battle.enemies) {
      if (en.uid === d.targetUid) {
        s.enemy = en;
        break;
      }
    }
    s.x = d.x;
    s.y = d.y;
    const info = s.enemy ? enemyInfo(s.enemy.id) : null;
    const body = info ? info.size : 56;
    s.bodyHalf = body / 2;
    s.slap = info?.boss ? SLAP_BOSS : SLAP;
    const fit = big ? BIG_FIT : SMALL_FIT;
    s.size = Math.min(fit[1], Math.max(fit[0], big ? body / 96 : body / 130));
    s.tilt = (d.targetUid % 2 === 0 ? 1 : -1) * (0.07 + 0.03 * (d.targetUid % 3));
    s.life = big ? BITE_LAND : SMALL_LAND;
    s.floor = big ? BITE_LAND_FLOOR : SMALL_LAND_FLOOR;
    s.fromX = e.x;
    s.fromY = e.y - MUZZLE_RISE;

    this.dress(s);
    this.follow(s);
    this.pose(s, 0);
    s.root.visible = true;

    // The bar keeps the health it had until the cork is through, unless the bite is about to kill (nothing left to show).
    s.holdCount = 0;
    if (big && s.enemy && s.enemy.hp + s.enemy.shield > d.amount + 1e-6) {
      s.holdCount = 1;
      this.holds.hold(d.targetUid, d.amount, battle.time);
    }
    stage.play(stage.rules.zone, 'whoosh', 0.4, 1.4, 0.05);
  }

  /**
   * Every `bite` of the battle (the dispatcher only forwards the bite of a cast that was shown, and a second gunner's cast in the same breath
   * is not: the stage rule lets one effect through per quarter second). The first bite on the target after a shot is that shot's own; when it
   * killed, the target is gone and there is nothing to wait for. A second bite on the same target while the shot is still in the air is another
   * gunner's, and it rides on this cork: the bar holds its health too, and the poster's eggs and seal show the whole pool they now have.
   */
  private onBite(e: BattleEvents['bite']): void {
    const s = this.last;
    if (!s || !s.on || !s.big || s.landed || s.uid !== e.enemy.uid) return;
    if (!s.biteSeen) s.biteSeen = true;
    else {
      if (!e.killed && s.holdCount > 0) {
        this.holds.hold(s.uid, e.amount, this.env.battle.time);
        s.holdCount++;
      }
      s.eggsAfter = Math.max(s.eggsAfter, eggsFilled(e.taken, e.pool));
      s.closed = s.closed || e.taken >= e.pool - 1e-9;
    }
    if (e.killed) {
      this.release(s);
      s.launched = true;
      this.land(s);
    }
  }

  /** Put the right pictures on a shot: the paper, the target's portrait in sepia, the eggs. */
  private dress(s: Shot): void {
    const { art } = this;
    s.paper.texture = art.poster;
    s.hole.texture = art.hole;
    s.hole.visible = false;
    s.hole.position.set(PORTRAIT_AT.x - 50, PORTRAIT_AT.y - 66);
    s.stamp.texture = art.stamp;
    s.stamp.visible = false;
    s.stamp.position.set(0, 6);
    s.stamp.rotation = -0.26;
    s.stamp.scale.set(1);
    s.stamp.alpha = 1;
    s.portrait.position.set(PORTRAIT_AT.x - 50, PORTRAIT_AT.y - 66);
    s.portrait.tint = SEPIA;
    s.portrait.alpha = 0.92;
    s.portrait.visible = false;
    if (s.enemy) {
      const texture = tex(enemyTextureKey(s.enemy.id));
      s.portrait.texture = texture;
      const k = PORTRAIT_AT.side / Math.max(texture.width, texture.height, 1);
      s.portrait.scale.set(k);
      s.portrait.visible = true;
    }
    for (let i = 0; i < 2; i++) {
      const egg = s.eggs[i] as Sprite;
      const slot = EGG_SLOTS[i] as { x: number; y: number };
      egg.position.set(slot.x - 50, slot.y - 66);
      egg.texture = i < s.eggsBefore ? art.eggFull : art.eggEmpty;
      egg.scale.set(1);
      egg.visible = s.big;
    }
    s.root.alpha = 1;
    s.root.rotation = s.tilt;
    s.hole.scale.set(1);
    s.cork.visible = false;
    s.trail.visible = false;
  }

  /** The poster rides its target: the body's own place, the way the enemy's picture is drawn. */
  private follow(s: Shot): void {
    const en = s.enemy;
    if (en && en.hp > 0) {
      s.x = en.x;
      s.y = en.y;
    }
    s.aimX = bodyX(s.x, s.bodyHalf * 2);
    s.aimY = s.y;
  }

  /** The slap: the poster comes down big and fast and settles, in the first part of the first span. */
  private pose(s: Shot, k: number): void {
    const calm = this.env.stage.reduced;
    const slap = Math.min(1, k / LAUNCH_AT);
    s.root.scale.set(s.size * (calm ? 1 : 1 + s.slap * (1 - Ease.backOut(slap))));
    s.root.position.set(s.aimX, s.aimY);
    s.root.alpha = calm ? Math.min(1, k / 0.1) : Math.min(1, k / 0.06);
  }

  private take(): Shot {
    let oldest: Shot | null = null;
    for (const s of this.shots) {
      if (!s.on) return s;
      if (!oldest || s.seq < oldest.seq) oldest = s;
    }
    if (this.shots.length < CASES || !oldest) {
      const s = new Shot();
      // Under the particle layer (the first child of the front layer), so the sparks and the paper scraps of the landing show OVER the poster, but
      // over the star archer's night (a sheet that is the first child when it is there): a poster is not part of the board the night dims.
      const night = this.front.getChildByLabel(NIGHT_LABEL);
      const at = night ? this.front.getChildIndex(night) + 1 : 0;
      this.front.addChildAt(s.cork, at);
      this.front.addChildAt(s.trail, at);
      this.front.addChildAt(s.root, at);
      this.shots.push(s);
      return s;
    }
    // Every shot is busy: the oldest is cut off, and the bar stops holding for it.
    this.release(oldest);
    this.off(oldest);
    return oldest;
  }

  private corkTexture(): Texture {
    this.corkTex ??= paint('shot_cork');
    return this.corkTex;
  }

  /** The cork leaves the gun. */
  private launch(s: Shot): void {
    const { stage } = this.env;
    s.launched = true;
    s.cork.texture = this.corkTexture();
    s.cork.scale.set(CORK_W / Math.max(1, s.cork.texture.width));
    s.cork.tint = 0xffffff;
    s.cork.position.set(s.fromX, s.fromY);
    s.cork.visible = true;
    if (stage.detail > 0 && !stage.reduced) {
      const streak = fxTex('streak');
      s.trail.texture = streak.texture;
      s.trail.anchor.set(streak.ax, streak.ay);
      s.trail.tint = Light.trailCork;
      s.trail.visible = true;
    }
    stage.fx.ps.burst(PUFF, s.fromX, s.fromY, { scale: 0.9, count: stage.detail === 0 ? 0.5 : 1 });
    stage.play(stage.rules.shoot, 'atk_r_gunner', 0.8, 1.05, 0.04);
  }

  /** The cork flies from the muzzle to the poster's middle over the rest of the first span. */
  private fly(s: Shot, k: number): void {
    const t = Math.max(0, Math.min(1, (k - LAUNCH_AT) / (1 - LAUNCH_AT)));
    const x = s.fromX + (s.aimX - s.fromX) * t;
    const y = s.fromY + (s.aimY - s.fromY) * t;
    const ang = Math.atan2(s.aimY - s.fromY, s.aimX - s.fromX);
    s.cork.position.set(x, y);
    s.cork.rotation = ang;
    if (s.trail.visible) {
      const len = Math.min(TRAIL_LEN, Math.hypot(x - s.fromX, y - s.fromY));
      s.trail.position.set(x, y);
      s.trail.rotation = ang + Math.PI;
      s.trail.scale.set(len / 256, 1.7);
      s.trail.alpha = 0.55;
    }
  }

  /** The cork is through the poster. */
  private land(s: Shot): void {
    const { stage } = this.env;
    const detail = stage.detail;
    const calm = stage.reduced;
    s.landed = true;
    s.fall.reset();
    s.cork.visible = false;
    s.trail.visible = false;
    this.release(s);
    this.follow(s);
    s.root.position.set(s.aimX, s.aimY);
    s.hole.visible = true;
    s.hole.scale.set(s.big ? 1 : 0.8);
    for (let i = 0; i < 2; i++) (s.eggs[i] as Sprite).texture = i < s.eggsAfter ? this.art.eggFull : this.art.eggEmpty;
    s.stamp.visible = s.closed;

    const px = s.aimX;
    const py = s.aimY + (PORTRAIT_AT.y - 66) * s.root.scale.y;
    const scale = Math.max(0.6, s.size);
    stage.fx.ps.burst(SPARKS, px, py, { scale, count: detail === 0 ? 0.5 : 1 });
    if (detail > 0 && !calm) stage.fx.ps.burst(SCRAPS, px, py, { scale: Math.max(0.7, scale), count: detail === 1 ? 0.7 : 1 });
    stage.fx.shockwave(px, py, { color: Hue.cream, radius: s.big ? 62 : 36 });
    stage.play(stage.rules.heavyHit, 'imp_r_gunner', 0.9, 0.95, 0.04);
    if (s.closed) stage.play(stage.rules.big, 'hit_heavy', 0.55, 0.7, 0.03);
    if (s.big && !calm) stage.shake(Trauma.t1, Gate.spShake, 0.3);
  }

  /** The bar may drop its held health now. */
  private release(s: Shot): void {
    for (; s.holdCount > 0; s.holdCount--) this.holds.land(s.uid);
  }

  /** The look of a poster peeling off: it tips, slides down and fades; a seal and a filled egg pop first. */
  private falling(s: Shot, k: number): void {
    const calm = this.env.stage.reduced;
    const fade = k < 0.5 ? 1 : 1 - (k - 0.5) / 0.5;
    s.root.alpha = fade;
    if (!calm) {
      const drift = k * k;
      s.root.position.set(s.aimX + 14 * k * (s.tilt > 0 ? 1 : -1), s.aimY + 46 * drift);
      s.root.rotation = s.tilt + (s.tilt > 0 ? 1 : -1) * 0.5 * drift;
    } else {
      s.root.position.set(s.aimX, s.aimY);
    }
    const pop = s.fall.k(POP[0], POP[1]);
    const swell = calm ? 1 : 1 + 0.7 * (1 - Ease.cubicOut(pop));
    // The cork's hit jolts the poster: it jumps a tenth bigger and settles.
    if (!calm) s.root.scale.set(s.size * (1 + 0.1 * (1 - Ease.cubicOut(pop))));
    if (s.closed) {
      s.stamp.scale.set(swell * 1.05);
      s.stamp.alpha = Math.min(1, pop * 4);
    }
    if (s.eggsAfter > s.eggsBefore) {
      const egg = s.eggs[s.eggsAfter - 1] as Sprite;
      egg.scale.set(swell);
    }
  }

  private off(s: Shot): void {
    s.on = false;
    s.root.visible = false;
    s.cork.visible = false;
    s.trail.visible = false;
    s.enemy = null;
  }

  update(dt: number, battleDt: number): void {
    for (const s of this.shots) {
      if (!s.on) continue;
      if (!s.landed) {
        s.flight.tick(battleDt, dt);
        const k = s.flight.k(s.life, s.floor);
        this.follow(s);
        this.pose(s, k);
        if (!s.launched && k >= LAUNCH_AT) this.launch(s);
        if (s.launched) this.fly(s, k);
        if (k >= 1) this.land(s);
      } else {
        s.fall.tick(battleDt, dt);
        const k = s.fall.k(FALL[0], FALL[1]);
        if (k >= 1) {
          this.off(s);
          continue;
        }
        this.follow(s);
        this.falling(s, k);
      }
    }
  }

  clear(): void {
    for (const s of this.shots) {
      this.release(s);
      this.off(s);
    }
    this.holds.clear();
    this.last = null;
  }

  destroy(): void {
    this.offBite();
    this.clear();
    for (const s of this.shots) {
      s.root.destroy({ children: true });
      s.cork.destroy();
      s.trail.destroy();
    }
    this.shots.length = 0;
  }

  /** The shots alive right now (QA and tests). */
  live(): { posters: number; corks: number; held: number } {
    return {
      posters: this.shots.filter((s) => s.on).length,
      corks: this.shots.filter((s) => s.on && s.cork.visible).length,
      held: this.holds.size,
    };
  }
}

export const makeWanted: SpSceneFactory<'wanted'> = (env) => new WantedScene(env);
