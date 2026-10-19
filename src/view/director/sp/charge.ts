/**
 * The Tiger Has Arrived!, the tiger general's scene (docs/design_skills_v2.md 3.3). After the cut-in of its first cast:
 *
 *   1. THE LEAP (`data.leap`, 0.3 s). The tiger leaves its tile in an arc to the landing point and grows to 1.5 times its size on the way; the
 *      tile's cat steps back into a ghost (see "the tile" below) and a puff of dust marks the take-off.
 *   2. THE LANDING. Where the front of the stretch is: a squash, a ring in the warrior's colour, dust, a big paw print, a nudge of the camera
 *      and the deepest thud the game has (`imp_w_tiger`).
 *   3. THE RUN (`data.dist` px against the flow). The 1.5x body runs along the road; its gait follows the road it covers (one bob a stride), a
 *      puff of dust is kicked back every so often and a paw print lands every stride, left and right of the road's middle. Every enemy it
 *      touches (`spRunHit`) takes a stomp: a paper burst and a big paw print AT THE ENEMY (from the event's own position, never from the body's:
 *      the first tick of a run also touches enemies up to 63 px on the far side of the head). A packed road gives one hit per tick, so hits that
 *      land within 36 px of a stomp that is only a moment old join it (it grows a little) instead of making another: one burst, one print, one
 *      thud for a knot of enemies.
 *   4. THE ROAR and THE WALK BACK. At the end of the run the tiger stands and a ring goes out, then it walks back to its tile over 0.8 s,
 *      shrinking to its own size, and the tile's cat comes back with a puff. A tiger that was sold (or merged away) while it ran has no tile to
 *      walk back to: it ends in a puff of smoke.
 *
 * THE TILE. The simulation has no "away" state: the tile keeps attacking all the while (decision 3), and the cat is still ON the board. So while
 * the body is out the tile's cat is drawn as a GHOST (its art at a third of its opacity, found by the label `sprite` inside the cat's view; its
 * ring, its stickers and its attacks are untouched, and a shot still comes from it) inside a bold dashed outline round the cell, in the
 * warrior's colour, painted in code. That says "this tile is the tiger's, it is out" twice (a pale cat, a dashed outline), and it is not an
 * empty cell: the cat is there, only pale, and the outline is the mark a reserved place wears. (A paw stamp under the ghost was tried and
 * vanished: the tiger's own orange hid it.) The ghost goes back to full opacity when the tiger is home (or when the scene is cleared).
 *
 * TIME. The body's place is `pathPoint(startPath + dir * covered(t))` (`runTrack.ts`) with `t` = `BattleApi.time`, so it is where the
 * simulation's body is at 1x, 2x and 3x and does not move under a popup. Every other piece lives by the battle's clock with a floor in real time
 * (`span.ts`). Reduced motion: no camera nudge, no squash, a flat leap, an outline that does not breathe; the low tier: no dust trail, fewer
 * prints. Everything is pooled and capped; nothing moves an enemy or a cat.
 */
import { CanvasSource, Container, Sprite, Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { TAU, clamp01, damp, lerp, lighten } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import type { BattleEvents, UnitState } from '@/game';
import { CELL_H, CELL_W, FIELD_W, cellCenterX, cellCenterY, pathPoint, type PathPoint } from '@/game/geometry';
import { Color } from '@/ui/theme';
import { FEET_DY, unitSpriteScale } from '../../field/unitView';
import { CLASS_COLOR } from '../palette';
import { Gate, enemyInfo } from '../stage';
import { bodyX } from '../../field/policy';
import { Piece, Pieces, SpritePiece } from './runPieces';
import { covered, headingOf, runEndsAt, runPlace, trackOf, type RunTrack } from './runTrack';
import { Age, spanK } from './span';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

type Span = readonly [number, number];

/** The tiger's body is this many times the size of the cat on its tile. */
export const BODY_SCALE = 1.5;
/** How high the leap goes (px). */
const LEAP_RISE = 100;
/** px of road between two bobs of the gait (one paw down), and between paw prints / dust puffs by quality tier (low, mid, high; 0 = none). */
const STRIDE = 62;
const PRINT_EVERY = [0, 124, 93] as const;
const DUST_EVERY = [0, 140, 90] as const;
/** The prints land this far left and right of the road's middle. */
const PRINT_SIDE = 13;
/** [battle seconds, real floor] of each picture. */
const BURST: Span = [0.28, 0.17];
const STAMP: Span = [1.4, 0.8];
const PRINT: Span = [1.3, 0.75];
const SQUASH: Span = [0.22, 0.14];
const ROAR: Span = [0.26, 0.16];
const BACK: Span = [0.8, 0.45];
const POOF: Span = [0.3, 0.2];
/** The ghost fades in and out over this (battle seconds, real floor). */
const GHOST: Span = [0.14, 0.09];
/** How much of its opacity the tile's cat keeps while the tiger is out. */
export const GHOST_KEEP = 0.32;
/** Hits within this many px of a stomp that is younger than `MERGE_AGE` battle seconds join it. */
export const MERGE_DIST = 36;
export const MERGE_AGE = 0.12;
/** How much of the body's drawn width `bodyX` keeps inside the screen (all of it: the cape and the halberd are part of the picture). */
const BODY_SHOWN = 1;
/** The most stomps on the field by quality tier. */
const STOMPS_LIVE = [8, 14, 22] as const;
const STOMPS_POOL = 24;
const PRINTS_POOL = 60;
const RUNNERS = 3;

const STOMP_DUST: EmitDef = {
  tex: 'smoke', prio: 0, count: 2, life: [0.3, 0.5], shape: { type: 'circle', r: 8 }, speed: [30, 90], drag: 3, gravity: -14,
  size: [20, 30], sizeEnd: [46, 66], rot: [0, TAU], spin: [-1.2, 1.2], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.5, fadeIn: 0.06, fadeOut: 0.6,
};
/** Dust kicked up behind the running body. */
const RUN_DUST: EmitDef = {
  tex: 'smoke', prio: 0, count: 2, life: [0.3, 0.5], shape: { type: 'rect', w: 30, h: 6 }, speed: [40, 110], spread: 0.7, drag: 3, gravity: -10,
  size: [22, 30], sizeEnd: [50, 70], rot: [0, TAU], spin: [-1, 1], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.5, fadeIn: 0.06, fadeOut: 0.6,
};
/** The landing's cloud. */
const LAND_DUST: EmitDef = {
  tex: 'smoke', prio: 1, count: 6, life: [0.4, 0.65], shape: { type: 'rect', w: 70, h: 8 }, speed: [50, 150], dir: -Math.PI / 2, spread: 1.4, drag: 3, gravity: -12,
  size: [30, 44], sizeEnd: [70, 100], rot: [0, TAU], spin: [-1, 1], colors: [lighten(Hue.dust, 0.2), Hue.dust], alpha: 0.6, fadeIn: 0.06, fadeOut: 0.6,
};

/** A stomp: the burst on the enemy and the paw print under it. Hits that come close behind each other are one stomp. */
class Stomp extends Piece {
  readonly burst: Sprite;
  readonly stamp: Sprite;
  x = 0;
  y = 0;
  /** Hits that joined: it grows a little with each. */
  count = 1;
  size = 1;
  heading = 0;
  constructor(front: Container, back: Container) {
    super();
    this.burst = new Sprite(fxTex('starburst').texture);
    this.stamp = new Sprite(fxTex('paw').texture);
    for (const s of [this.burst, this.stamp]) {
      s.anchor.set(0.5);
      s.eventMode = 'none';
      s.visible = false;
    }
    this.burst.tint = Hue.sun;
    this.stamp.tint = Color.coralDark;
    front.addChild(this.burst);
    back.addChild(this.stamp);
  }
  hide(): void {
    this.on = false;
    this.burst.visible = false;
    this.stamp.visible = false;
  }
  destroy(): void {
    this.burst.destroy();
    this.stamp.destroy();
  }
}

/** A paw print of the gait (or the landing's big one). */
class Print extends SpritePiece {
  size = 1;
  alpha = 0.6;
}

type Phase = 'leap' | 'run' | 'roar' | 'back' | 'poof' | 'done';

const MARK_RES = 3;
let tileMark: Texture | null = null;

/** The outline of a tile that is the tiger's: a bold dashed rounded rectangle just inside the cell, painted in code the first time it is needed. */
function tileMarkTexture(): Texture {
  if (tileMark) return tileMark;
  const w = CELL_W + 8;
  const h = CELL_H + 8;
  const canvas = document.createElement('canvas');
  canvas.width = w * MARK_RES;
  canvas.height = h * MARK_RES;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('charge: 2D canvas unavailable');
  ctx.scale(MARK_RES, MARK_RES);
  const css = (c: number): string => `rgb(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255})`;
  const path = (): void => {
    ctx.beginPath();
    ctx.roundRect(8, 8, w - 16, h - 16, 18);
  };
  ctx.lineCap = 'round';
  ctx.setLineDash([11, 9]);
  // A paper-cream underlay so the dashes read on a sunbeam tile as well as on the plain one, then the coloured dashes over it.
  ctx.strokeStyle = css(Color.paperLight);
  ctx.lineWidth = 7.5;
  path();
  ctx.stroke();
  ctx.strokeStyle = css(Color.coralDark);
  ctx.lineWidth = 4;
  path();
  ctx.stroke();
  tileMark = new Texture({ source: new CanvasSource({ resource: canvas, resolution: MARK_RES, autoGarbageCollect: false }), label: 'sp_tile_mark' });
  return tileMark;
}

const scratch: PathPoint = { x: 0, y: 0, angle: 0 };
const point: PathPoint = { x: 0, y: 0, angle: 0 };

/** The sprite of a cat's view (the field's `UnitView` labels its art `sprite`). */
function artOf(view: Container | null): Sprite | null {
  const s = view?.getChildByLabel('sprite', true) ?? null;
  return s instanceof Sprite ? s : null;
}

/** One tiger run: the body, the tile's mark and the cat's ghost. */
class Runner {
  on = false;
  id = 0;
  track: RunTrack = { at: 0, dir: -1, delay: 0, speed: 1, dist: 1, startPath: 0 };
  unit: UnitState | null = null;
  phase: Phase = 'done';
  ended = false;
  endAt = 0;
  leap = 0.3;
  landX = 0;
  landY = 0;
  fromX = 0;
  fromY = 0;
  /** Where the run ended (the road) and where the walk back goes (the tile, read when the walk starts). */
  endX = 0;
  endY = 0;
  toX = 0;
  toY = 0;
  /** 0..1: how far the tile's cat is a ghost. */
  ghost = 0;
  private ghostTo = 0;
  facing = 1;
  base = 0.3;
  /** px of the run the paw prints and the dust puffs have been laid down to, and how many prints there have been (they alternate left and right). */
  private printedTo = 0;
  private dustedTo = 0;
  private prints = 0;
  private readonly post = new Age();
  private readonly land = new Age();
  private cell = 0;
  private art: Sprite | null = null;
  private artView: Container | null = null;
  private lastAlpha = 1;
  /** What the body is drawn at (QA and tests). */
  x = 0;
  y = 0;
  readonly body = new Container();
  private readonly shadow: Sprite;
  private readonly sprite = new Sprite();
  /** The tile's outline. */
  private readonly outline: Sprite;

  constructor(
    private readonly scene: ChargeScene,
    front: Container,
    back: Container,
  ) {
    this.shadow = new Sprite(fxTex('disc').texture);
    this.shadow.anchor.set(0.5);
    this.shadow.tint = Color.shadow;
    this.shadow.alpha = 0.3;
    this.sprite.anchor.set(0.5, 1);
    this.body.addChild(this.shadow, this.sprite);
    this.body.eventMode = 'none';
    this.body.visible = false;
    front.addChild(this.body);
    this.outline = new Sprite(tileMarkTexture());
    this.outline.anchor.set(0.5);
    this.outline.eventMode = 'none';
    this.outline.visible = false;
    back.addChild(this.outline);
  }

  begin(e: SpCastOf<'charge'>): void {
    const d = e.data;
    const unit = e.unit;
    this.on = true;
    this.ended = false;
    this.id = d.runId;
    this.track = trackOf(d);
    this.endAt = runEndsAt(this.track);
    this.unit = unit;
    this.cell = unit.cell;
    this.leap = Math.max(0, d.leap);
    this.landX = d.landX;
    this.landY = d.landY;
    this.fromX = cellCenterX(unit.cell);
    this.fromY = cellCenterY(unit.cell) + FEET_DY;
    this.phase = 'leap';
    this.printedTo = 0;
    this.dustedTo = 0;
    this.prints = 0;
    this.post.reset();
    this.land.reset();
    this.ghost = 0;
    this.ghostTo = 1;
    this.facing = Math.sign(d.landX - this.fromX) || 1;
    const texture: Texture = tex('unit_' + unit.id);
    this.sprite.texture = texture;
    this.base = unitSpriteScale(unit.id, texture.height);
    this.body.visible = true;
    this.body.alpha = 1;
    this.sprite.alpha = 1;
    this.shadow.visible = true;
    this.art = null;
    this.artView = null;
    this.lastAlpha = 1;
    this.x = this.fromX;
    this.y = this.fromY;
    this.pose(this.fromX, this.fromY, 0, 1, 1, 1);
    this.mark(0);
  }

  /** The tile the cat is on now, or null when it has left the board (sold, merged away). */
  private tile(): { x: number; y: number } | null {
    const u = this.unit;
    if (!u) return null;
    const on = this.scene.env.battle.units[u.cell];
    if (!on || on.uid !== u.uid) return null;
    this.cell = u.cell;
    return { x: cellCenterX(u.cell), y: cellCenterY(u.cell) + FEET_DY };
  }

  /** Draw the body at the ground point (x, y), `rise` px above it, at `scaleK` times the cat's size, squashed by (sx, sy). */
  private pose(x: number, y: number, rise: number, scaleK: number, sx: number, sy: number): void {
    this.x = x;
    this.y = y;
    const k = this.base * scaleK;
    this.sprite.position.set(0, -rise);
    this.sprite.scale.set(k * this.facing * sx, k * sy);
    // `x` is the road's (and what the tests hold the body to); on the left and right roads the 1.5x body would hang out of the screen, so it is
    // DRAWN pulled in from the edge the way every big body of the field is (`bodyX`: the enemies the tiger runs through are drawn so too).
    this.body.position.set(bodyX(x, Math.abs(this.sprite.width) * BODY_SHOWN), y + 6);
    const lift = clamp01(rise / LEAP_RISE);
    const w = (86 * scaleK) / 128;
    this.shadow.scale.set(w * (1 - 0.35 * lift), w * 0.32 * (1 - 0.35 * lift));
    this.shadow.position.set(0, 2);
  }

  private face(heading: number, x: number, dt: number): void {
    const c = Math.cos(heading);
    // On the sides of the road the cat faces the board, as the cats on the board do.
    const to = c > 0.35 ? 1 : c < -0.35 ? -1 : x < FIELD_W / 2 ? 1 : -1;
    this.facing = damp(this.facing, to, 0.035, dt);
  }

  update(t: number, dt: number, battleDt: number): void {
    const { env } = this.scene;
    const calm = env.stage.reduced;
    const tr = this.track;
    const tl = tr.at + tr.delay;
    if (this.phase === 'leap' && t >= tl) this.touchdown();
    if (this.phase === 'leap') {
      const k = this.leap > 0 ? clamp01((t - tr.at) / this.leap) : 1;
      const x = lerp(this.fromX, this.landX, k);
      const y = lerp(this.fromY, this.landY, k);
      const arc = 4 * k * (1 - k);
      this.face(Math.atan2(this.landY - this.fromY, this.landX - this.fromX), x, dt);
      this.pose(x, y, calm ? 0 : LEAP_RISE * arc, lerp(1, BODY_SCALE, Ease.cubicOut(k)), calm ? 1 : 1 - 0.1 * arc, calm ? 1 : 1 + 0.12 * arc);
    }
    if (this.phase === 'run') {
      if (this.ended || t >= this.endAt) {
        this.startRoar();
      } else {
        runPlace(tr, t, point);
        const heading = headingOf(tr, point.angle);
        const cov = covered(tr, t);
        const gait = (cov / STRIDE) * Math.PI;
        this.face(heading, point.x, dt);
        const sq = this.land.k(SQUASH[0], SQUASH[1]);
        const squash = calm ? 0 : 1 - Ease.cubicOut(sq);
        this.pose(
          point.x,
          point.y,
          calm ? 0 : Math.abs(Math.sin(gait)) * 9,
          BODY_SCALE,
          (calm ? 1 : 1 - 0.03 * Math.cos(2 * gait)) * (1 + 0.16 * squash),
          (calm ? 1 : 1 + 0.04 * Math.cos(2 * gait)) * (1 - 0.2 * squash),
        );
        this.land.tick(battleDt, dt);
        this.layDown(cov, heading);
      }
    }
    if (this.phase === 'roar') {
      this.post.tick(battleDt, dt);
      const k = this.post.k(ROAR[0], ROAR[1]);
      const pulse = calm ? 0 : Math.sin(k * Math.PI);
      this.pose(this.endX, this.endY, 0, BODY_SCALE * (1 + 0.08 * pulse), 1 + 0.06 * pulse, 1 - 0.04 * pulse);
      if (k >= 1) this.startBack();
    }
    if (this.phase === 'back') {
      this.post.tick(battleDt, dt);
      const tile = this.tile();
      const k = this.post.k(BACK[0], BACK[1]);
      if (!tile) {
        this.startPoof();
      } else {
        this.toX = tile.x;
        this.toY = tile.y;
        const e = Ease.quadInOut(k);
        const x = lerp(this.endX, tile.x, e);
        const y = lerp(this.endY, tile.y, e);
        this.face(Math.atan2(tile.y - this.endY, tile.x - this.endX), x, dt);
        this.pose(x, y, calm ? 0 : Math.abs(Math.sin(k * Math.PI * 5)) * 6, lerp(BODY_SCALE, 1, Ease.cubicOut(k)), 1, 1);
        // The cat on the tile solidifies as the tiger comes in, so the two overlap for a moment instead of one popping out for the other.
        if (k > 0.72) this.ghostTo = 0;
        if (k >= 1) this.arrive(tile);
      }
    }
    if (this.phase === 'poof') {
      this.post.tick(battleDt, dt);
      const k = this.post.k(POOF[0], POOF[1]);
      this.body.alpha = 1 - k;
      this.sprite.scale.set(this.base * BODY_SCALE * this.facing * (1 - 0.35 * k), this.base * BODY_SCALE * (1 + 0.1 * k));
      if (k >= 1) this.finish();
    }
    // The tile is the tiger's only while the tiger is still on it: sold or merged away mid-run, its mark and its ghost go at once (and a cat
    // summoned onto the empty tile is not dressed as a tiger's). A tiger that was moved takes its mark to the new tile (`tile()` follows it).
    if ((this.phase === 'leap' || this.phase === 'run' || this.phase === 'roar') && !this.tile()) this.ghostTo = 0;
    this.tickGhost(dt, battleDt, calm);
    if (this.phase === 'done' && this.ghost <= 0.001 && this.on) this.release();
  }

  /** The tiger comes down: the run starts and the landing is staged. */
  private touchdown(): void {
    const { stage } = this.scene.env;
    this.phase = 'run';
    this.land.reset();
    stage.fx.shockwave(this.landX, this.landY + 10, { color: CLASS_COLOR.warrior, radius: 96 });
    stage.fx.ps.burst(LAND_DUST, this.landX, this.landY + 14, { scale: 1.3, count: stage.detail === 0 ? 0.5 : 1 });
    // The skill's own rule, not the fight's `heavyHit` (which at 3x swallowed this landing and ten of every fifteen hoofbeats).
    stage.play(stage.rules.skill, 'sp_tiger_land', 0.9, 1, 0.03, stage.panOf(this.landX));
    if (!stage.reduced) stage.shake(Trauma.t1, Gate.spShake, 0.3);
    runPlace(this.track, this.track.at + this.track.delay, scratch);
    this.scene.print(this.landX, this.landY + 12, headingOf(this.track, scratch.angle), 1.7, 0.85);
  }

  /** Paw prints and dust puffs, from the road the body has covered (so they are where it ran, at any speed). */
  private layDown(cov: number, heading: number): void {
    const { stage } = this.scene.env;
    const detail = stage.detail;
    const every = PRINT_EVERY[detail];
    const tr = this.track;
    if (every > 0) {
      while (this.printedTo + every <= cov) {
        this.printedTo += every;
        pathPoint(tr.startPath + tr.dir * this.printedTo, scratch);
        const h = headingOf(tr, scratch.angle);
        const side = this.prints++ % 2 === 0 ? 1 : -1;
        this.scene.print(scratch.x + Math.cos(h + Math.PI / 2) * PRINT_SIDE * side, scratch.y + Math.sin(h + Math.PI / 2) * PRINT_SIDE * side + 10, h, 0.85, 0.55);
      }
    } else this.printedTo = cov;
    const puff = DUST_EVERY[detail];
    if (puff > 0) {
      while (this.dustedTo + puff <= cov) {
        this.dustedTo += puff;
        stage.fx.ps.burst(RUN_DUST, this.x, this.y + 10, { dir: heading + Math.PI, count: detail === 1 ? 0.7 : 1 });
      }
    } else this.dustedTo = cov;
  }

  private startRoar(): void {
    const { stage } = this.scene.env;
    this.phase = 'roar';
    this.post.reset();
    // The end of the run is a place of the road whatever frame the body is drawn at.
    runPlace(this.track, this.endAt, scratch);
    this.endX = scratch.x;
    this.endY = scratch.y;
    if (!stage.reduced) stage.fx.shockwave(this.endX, this.endY - 30, { color: CLASS_COLOR.warrior, radius: 110 });
    // It stands at the end of the run and answers itself: one short growl.
    stage.play(stage.rules.skill, 'sp_tiger_roar_end', 0.9, 1, 0.03, stage.panOf(this.endX));
  }

  private startBack(): void {
    this.post.reset();
    this.phase = this.tile() ? 'back' : 'poof';
    if (this.phase === 'poof') this.puff();
  }

  private startPoof(): void {
    this.post.reset();
    this.phase = 'poof';
    this.puff();
  }

  private puff(): void {
    const { stage } = this.scene.env;
    stage.fx.dustPuff(this.x, this.y - 20, { scale: 1.1 });
    this.ghostTo = 0;
  }

  /** Home: the cat comes back on its tile with a puff. */
  private arrive(tile: { x: number; y: number }): void {
    const { stage } = this.scene.env;
    stage.fx.dustPuff(tile.x, tile.y - 4, { scale: 0.8 });
    if (!stage.reduced) stage.fx.shockwave(tile.x, tile.y, { color: CLASS_COLOR.warrior, radius: 52 });
    this.finish();
  }

  private finish(): void {
    this.phase = 'done';
    this.ghostTo = 0;
    this.body.visible = false;
  }

  /** Nothing of the run is left: a view that was kept ghostly is back to full opacity first. */
  private release(): void {
    this.setArt(1);
    this.on = false;
    this.outline.visible = false;
    this.unit = null;
    this.art = null;
    this.artView = null;
  }

  /** The tile's cat fades to a ghost and back; the mark on the floor follows it. */
  private tickGhost(dt: number, battleDt: number, calm: boolean): void {
    const rate = Math.min(battleDt / GHOST[0], dt / GHOST[1]);
    this.ghost = this.ghostTo > this.ghost ? Math.min(this.ghostTo, this.ghost + rate) : Math.max(this.ghostTo, this.ghost - rate);
    this.setArt(1 - (1 - GHOST_KEEP) * this.ghost);
    this.mark(this.ghost, calm);
  }

  /** Set the opacity of the cat's art on its tile (found through the view the field keeps for it; nothing to do when there is none). */
  private setArt(alpha: number): void {
    const u = this.unit;
    if (!u) return;
    const view = this.scene.env.ctx.unitView(u.uid);
    if (view !== this.artView) {
      this.artView = view;
      this.art = artOf(view);
      this.lastAlpha = 1;
    }
    const art = this.art;
    if (!art || art.destroyed) return;
    if (alpha !== this.lastAlpha) {
      this.lastAlpha = alpha;
      art.alpha = alpha;
    }
  }

  /** The tile's mark on the floor: a bold dashed outline round the cell that breathes a little (not under reduced motion). */
  private mark(amount: number, calm = false): void {
    const on = amount > 0.01;
    this.outline.visible = on;
    if (!on) return;
    this.outline.position.set(cellCenterX(this.cell), cellCenterY(this.cell));
    this.outline.scale.set(0.96 + 0.04 * amount);
    this.outline.alpha = amount * (calm ? 0.95 : 0.8 + 0.15 * Math.sin(this.scene.env.battle.time * 5));
  }

  cut(): void {
    this.setArt(1);
    this.on = false;
    this.phase = 'done';
    this.body.visible = false;
    this.outline.visible = false;
    this.ghost = 0;
    this.ghostTo = 0;
    this.unit = null;
    this.art = null;
    this.artView = null;
  }

  destroy(): void {
    this.body.destroy({ children: true });
    this.outline.destroy();
  }
}

class ChargeScene implements SpScene<'charge'> {
  readonly survivesDefeat = true;
  private readonly back = new Container();
  private readonly front = new Container();
  private readonly runs: Runner[] = [];
  private readonly stomps: Pieces<Stomp>;
  private readonly prints: Pieces<Print>;

  constructor(readonly env: SpEnv) {
    env.ctx.layers.fxBack.addChild(this.back);
    env.ctx.layers.fxFront.addChild(this.front);
    this.stomps = new Pieces(() => new Stomp(this.front, this.back), STOMPS_POOL);
    this.prints = new Pieces(() => {
      const p = new Print(this.back, fxTex('paw').texture);
      p.sprite.tint = Color.coralDark;
      return p;
    }, PRINTS_POOL);
  }

  cast(e: SpCastOf<'charge'>): void {
    const { stage } = this.env;
    // A run with the same id (never) or the oldest one is given up when all are busy.
    let r = this.runs.find((x) => !x.on);
    if (!r) {
      if (this.runs.length < RUNNERS) {
        r = new Runner(this, this.front, this.back);
        this.runs.push(r);
      } else {
        r = this.runs.reduce((a, b) => (a.track.at <= b.track.at ? a : b));
        r.cut();
      }
    }
    r.begin(e);
    stage.fx.dustPuff(e.x, e.y + 24, { scale: 0.9 });
    // The tiger roars as it leaps (`sp_tiger_roar`, a cartoon roar made of a throat and a breath): the sound the owner asked for.
    stage.play(stage.rules.skill, 'sp_tiger_roar', 1, 1, 0.02, stage.panOf(e.x));
  }

  /** The tiger touched an enemy: a stomp at the enemy where it stood, joined to a young one nearby when the road is packed. */
  runHit(e: BattleEvents['spRunHit']): void {
    const r = this.runs.find((x) => x.on && x.id === e.runId);
    if (!r) return;
    const { stage } = this.env;
    const info = enemyInfo(e.enemy.id);
    // Where the enemy is DRAWN (a big body is pulled in from the field's edge), as the shove's ghosts and the poster are.
    const ex = bodyX(e.x, info.size);
    const y = e.y + info.size * 0.28;
    for (const s of this.stomps.list) {
      if (!s.on || s.age.battle > MERGE_AGE) continue;
      if (Math.hypot(s.x - ex, s.y - y) > MERGE_DIST) continue;
      s.count++;
      s.x += (ex - s.x) / s.count;
      s.y += (y - s.y) / s.count;
      s.size = Math.min(1.45, s.size + 0.07);
      return;
    }
    const detail = stage.detail;
    const s = this.stomps.take(STOMPS_LIVE[detail]);
    s.start(STAMP[0], STAMP[1]);
    s.x = ex;
    s.y = y;
    s.count = 1;
    s.size = Math.min(1.3, Math.max(0.8, info.size / 70));
    s.heading = e.enemy.angle + Math.PI;
    s.burst.visible = true;
    s.stamp.visible = true;
    this.drawStomp(s, 0);
    stage.fx.ps.burst(STOMP_DUST, ex, y, { scale: Math.max(0.8, info.size / 70), count: detail === 0 ? 0.5 : 1 });
    stage.play(stage.rules.skillTick, 'sp_stomp', 0.85, 1, 0.06, stage.panOf(ex));
  }

  runEnd(e: BattleEvents['spRunEnd']): void {
    const r = this.runs.find((x) => x.on && x.id === e.runId);
    if (r) r.ended = true;
  }

  /** A paw print on the road, pointing the way the tiger runs. */
  print(x: number, y: number, heading: number, size: number, alpha: number): void {
    const p = this.prints.take();
    p.start(PRINT[0], PRINT[1]);
    p.size = size;
    p.alpha = alpha;
    p.sprite.position.set(x, y);
    p.sprite.rotation = heading + Math.PI / 2;
    p.sprite.visible = true;
    this.drawPrint(p, 0);
  }

  private drawStomp(s: Stomp, k: number): void {
    const calm = this.env.stage.reduced;
    const kb = spanK(s.age.battle, s.age.real, BURST[0], BURST[1]);
    s.burst.visible = kb < 1;
    if (kb < 1) {
      s.burst.position.set(s.x, s.y - 10);
      s.burst.scale.set((s.size * 1.15 * (calm ? 0.9 : 0.55 + 0.6 * Ease.cubicOut(Math.min(1, kb * 2.2)))) * (1 + 0.04 * (s.count - 1)));
      s.burst.alpha = calm ? 1 - kb : 1 - kb * kb;
      s.burst.rotation = calm ? 0 : s.heading * 0.3 + kb * 0.5;
    }
    s.stamp.position.set(s.x, s.y + 2);
    s.stamp.rotation = s.heading + Math.PI / 2;
    s.stamp.scale.set(s.size * 1.05 * (1 + 0.05 * (s.count - 1)));
    s.stamp.alpha = 0.85 * (k < 0.55 ? 1 : (1 - k) / 0.45);
  }

  private drawPrint(p: Print, k: number): void {
    p.sprite.scale.set(p.size);
    p.sprite.alpha = p.alpha * (k < 0.5 ? 1 : (1 - k) / 0.5);
  }

  update(dt: number, battleDt: number): void {
    const t = this.env.battle.time;
    for (const r of this.runs) if (r.on) r.update(t, dt, battleDt);
    this.stomps.update(battleDt, dt, (s, k) => this.drawStomp(s, k));
    this.prints.update(battleDt, dt, (p, k) => this.drawPrint(p, k));
  }

  clear(): void {
    for (const r of this.runs) r.cut();
    this.stomps.clear();
    this.prints.clear();
  }

  destroy(): void {
    this.clear();
    for (const r of this.runs) r.destroy();
    this.runs.length = 0;
    this.stomps.destroy();
    this.prints.destroy();
    this.back.destroy();
    this.front.destroy();
  }

  /** What is on screen right now (QA and tests): runs, stomps, prints, and where each body is drawn. */
  live(): { runs: number; stomps: number; prints: number; bodies: Array<{ id: number; phase: string; x: number; y: number; ghost: number }> } {
    return {
      runs: this.runs.filter((r) => r.on).length,
      stomps: this.stomps.live,
      prints: this.prints.live,
      bodies: this.runs.filter((r) => r.on).map((r) => ({ id: r.id, phase: r.phase, x: r.x, y: r.y, ghost: r.ghost })),
    };
  }
}

export const makeCharge: SpSceneFactory<'charge'> = (env) => new ChargeScene(env);
