/**
 * Surprise Clones, the ninja's scene (docs/design_skills_v2.md 3.4, 3.4.1 to 3.4.4): the ninja puts a leaf on its head, a round puff of smoke
 * goes "pop", and two pale sky-blue, see-through ninjas hop onto the nearest empty tiles (or, when the board is full, slide out from behind the
 * ninja and stand there, a little to each side). Each time the ninja throws, each clone throws one sky-blue shuriken of its own and grows a
 * step fainter (55, 47, 39, 31 %); after the fourth it goes with a puff and one leaf drifting down. A cat that takes a clone's tile does not
 * wait: the clone steps aside ("oops") and stands behind its ninja.
 *
 * What the simulation says and what is drawn. A clone is not a cat: it is a few numbers on its ninja (`UnitState.clone`) and four events
 * (`cloneThrow`, `cloneStep`, `cloneEnd`, and the `spCast` that seats them). The picture reads exactly those: the bodies are made from the
 * cast's seats, follow `CloneState.left` and `cell` every frame, and are cut short by `cloneEnd`. The shuriken itself is the projectile layer's
 * (`field/projectiles.ts` paints `ProjectileState.ghost` pale blue); this scene only tells it where a stacked clone's shuriken starts.
 *
 * The stage rule. The cast's EFFECTS (the puff, the leaf, the sounds, the dust, the sparks) are the cast's and are shown only for a cast the
 * rule admitted (`cast`). The bodies are the simulation's state, not an effect: a clone that stands on the board throws shuriken whether or not
 * its cast won the quarter second, and a pale shuriken that comes from nowhere would be a glitch, so a lost cast's clones are drawn too, just
 * quietly: no puff, no sound, no particles (`Clone.loud` false).
 *
 * A clone's tile never looks taken. The bodies are `eventMode: 'none'` sprites with no rank band, no badge and no ring; they are not in
 * `BattleApi.units`, so every path that asks "is this tile empty" (a summon, a drop, a tap, the drop preview) is told it is, and they sit in the
 * units layer one depth step BEHIND whatever cat shares their feet, so a new cat's pop-in lands on top of the clone that is leaving.
 *
 * Time. Every motion is timed by the battle's clock with a floor in real seconds (`span.ts`), so a clone freezes mid-hop under a popup and at
 * 3x (0.3 s of leap is 0.1 s) keeps its real floor. Reduced motion: no hop, no stumble, no leaf, no puff; a clone fades in and out in place.
 * Low tier: fewer puffs and no shockwave (the outline stays: it is what makes a pale body readable). A figure cap (the row's `figureCap`, 10) bounds the full bodies; the rest are a thin outline only.
 */
import { Container, Sprite } from 'pixi.js';
import { TAU, clamp01, damp, lighten } from '@/core/math';
import type { EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { SP_ROWS, type BattleEvents, type UnitState } from '@/game';
import { cellCenterX, cellCenterY, cellCol } from '@/game/geometry';
import { deathScale, makePose, releasePose, breathe } from '../../field/motion';
import { fieldArt } from '../../field/art';
import { GHOST_SKY, GHOST_SKY_LIGHT, clearGhostStarts, noteGhostStart } from '../../field/ghosts';
import { FEET_DY } from '../../field/unitView';
import { releaseSeconds, weaponStyle } from '../../weapons';
import { Age } from './span';
import { cloneArt, type CloneArt } from './cloneArt';
import {
  FADE, HEAD_LEAF, HOP, LAND, LEAF_FALL, OUT, STEP, WOBBLE,
  STACK_ALPHA_BOOST, STACK_LEAN, cloneAlpha, headLeaf, hopAt, hopHeight, isLite, landSquash, leafFall, stackFeet, stackOffset, stackSide, wobbleRot,
  type CloneLook,
} from './cloneMath';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';

/** The most bodies ever made: two ninjas' clones per ninja on a board of 25 would be 50, and nobody reads more than a dozen pale figures. */
const POOL_MAX = 24;
const LEAF_POOL = 8;
/** A body whose ninja's state no longer lists it (and no `cloneEnd` explained why) fades out after this many real seconds. */
const ORPHAN_AFTER = 0.3;
/** The throw: the ninja's own pose, played for a clone (coiled 60% when it releases, as a ninja that was not already coiling does). */
const THROW_COIL = 0.6;
const THROW_FLOOR = 0.1;
const LUNGE_PX = 8;
/** Where the clone's head is, as a share of its drawn height, and where its leaf sits on it. */
const HEAD_AT = 0.92;
/** The size of the leaf on a clone's head, and on the ninja's, in design px of the leaf's width. */
const LEAF_W = 19;
/** The ninja puts its leaf on. Its own slot of the pool. */
const THROW_SOUND_GAP = 0.12;

/** The line round a clone: a clear sky blue, because a white line vanishes on the cream paper and the sunbeam tile alike. */
const RIM_COLOR = 0x7ec8ff;
/** The shadow under a clone: the kit's shadow tone washed toward the sky, so the clone has a blue ground mark where a cat has a brown one. */
const SHADOW_COLOR = 0x6f9fd0;

const POOF: EmitDef = {
  tex: 'smoke', prio: 1, count: 6, life: [0.28, 0.42], shape: { type: 'ring', r: 8 }, dir: 'out', speed: [16, 38], drag: 3.2,
  size: [14, 20], sizeEnd: [32, 44], rot: [0, TAU], spin: [-1.4, 1.4], colors: [Hue.cream, lighten(GHOST_SKY, 0.45)], alpha: 0.82,
  fadeIn: 0.05, fadeOut: 0.6,
};
const POP: EmitDef = {
  tex: 'smoke', prio: 1, count: 4, life: [0.24, 0.38], shape: { type: 'ring', r: 6 }, dir: 'out', speed: [12, 32], drag: 3,
  size: [12, 18], sizeEnd: [26, 38], rot: [0, TAU], spin: [-1.2, 1.2], colors: [Hue.cream, lighten(GHOST_SKY, 0.4)], alpha: 0.8,
  fadeIn: 0.05, fadeOut: 0.6,
};
const DUST: EmitDef = {
  tex: 'smoke', prio: 0, count: 2, life: [0.2, 0.32], shape: { type: 'rect', w: 26, h: 4 }, dir: -Math.PI / 2, spread: 1.3, speed: [18, 50], drag: 3,
  gravity: -10, size: [10, 16], sizeEnd: [24, 34], rot: [0, TAU], colors: [Hue.cream, Hue.dust], alpha: 0.6, fadeIn: 0.05, fadeOut: 0.6,
};
const SPARK: EmitDef = {
  tex: 'spark', prio: 0, count: 2, life: [0.12, 0.2], speed: [120, 230], spread: 0.3, drag: 3, alignVel: true, stretch: 0.002,
  size: [14, 22], sizeEnd: [4, 6], colors: [Hue.cream, GHOST_SKY_LIGHT], fadeIn: 0, fadeOut: 0.6,
};

type Phase = 'in' | 'stand' | 'step' | 'out';
type Act = 'none' | 'land' | 'wobble' | 'throw';

interface Spot {
  x: number;
  y: number;
}

/** One pale clone on the board. */
class Clone {
  readonly root = new Container();
  readonly shadow: Sprite;
  readonly rim = new Sprite();
  readonly sprite = new Sprite();
  readonly leaf = new Sprite();
  private readonly rig = new Container();
  on = false;
  /** Which cast made it (the ninja, the clone's number in the cast, the cast's time): a cast told twice makes one body. */
  uid = 0;
  index = 0;
  castAt = 0;
  loud = false;
  /** Beyond the figure cap: only the outline is drawn. */
  lite = false;
  /** The tile it stands on, or -1 when it stands behind its ninja (on the ninja's own tile), and which side it peeks out on then. */
  cell = -1;
  side: -1 | 1 = 1;
  phase: Phase = 'in';
  act: Act = 'none';
  readonly move = new Age();
  readonly acting = new Age();
  moveLife = HOP[0];
  moveFloor = HOP[1];
  /** Where the hop began, where the feet are now, and the depth they sort by (the feet without the arc). */
  fromX = 0;
  fromY = 0;
  x = 0;
  y = 0;
  base = 0;
  /** The feet of a clone standing on its own tile. */
  seatX = 0;
  seatY = 0;
  throws = 4;
  left = 4;
  alpha = 0;
  alphaTo = 0.55;
  size = 1;
  /** How far it leans outward (a stacked clone peeks round its ninja), radians. */
  lean = 0;
  facing = 1;
  facingTo = 1;
  seed = 0;
  /** The clumsy one (the second) stumbles on landing, and wears its leaf upside down. */
  clumsy = false;
  /** How far the outline is flashed bright (a throw), and real seconds the ninja's state has not listed this clone. */
  flash = 0;
  orphan = 0;
  /** A quiet exit: a plain fade, no puff (the stage or the battle ended, or the clone was lost). */
  quiet = false;
  seq = 0;
  /** Where a stacked clone's feet were when its ninja's view last told it (used when the view is gone). */
  lastX = 0;
  lastY = 0;

  constructor(shadowTex: Sprite['texture']) {
    this.shadow = new Sprite(shadowTex);
    this.shadow.anchor.set(0.5);
    this.shadow.position.y = 1;
    this.rim.anchor.set(0.5);
    this.sprite.anchor.set(0.5, 1);
    this.leaf.anchor.set(0.18, 0.82);
    this.rig.addChild(this.rim, this.sprite, this.leaf);
    this.root.addChild(this.shadow, this.rig);
    this.root.eventMode = 'none';
    this.root.interactiveChildren = false;
    this.root.label = 'sp-clone';
    this.root.visible = false;
  }

  get stacked(): boolean {
    return this.cell < 0;
  }

  setRig(sx: number, sy: number, rot: number, lx: number, ly: number): void {
    this.rig.scale.set(sx, sy);
    this.rig.rotation = rot;
    this.rig.position.set(lx, ly);
  }
}

/** A leaf: the one on the ninja's head at the cast ('head', follows the ninja), or one drifting down where a clone went ('fall'). */
class Leaf {
  readonly sprite = new Sprite();
  readonly age = new Age();
  on = false;
  kind: 'head' | 'fall' = 'fall';
  uid = 0;
  x = 0;
  y = 0;
  side: -1 | 1 = 1;
  constructor() {
    this.sprite.anchor.set(0.18, 0.82);
    this.sprite.eventMode = 'none';
    this.sprite.visible = false;
  }
}

class ClonesScene implements SpScene<'clones'> {
  private readonly look: CloneLook = SP_ROWS.clones;
  private readonly bodies: Clone[] = [];
  private readonly leaves: Leaf[] = [];
  private readonly offs: Array<() => void> = [];
  private layer: Container | null = null;
  private front: Container | null = null;
  private art: CloneArt | null = null;
  private seq = 0;
  private idle = 0;
  private lastThrowSound = -1;
  private broken = false;
  private readonly byUid = new Map<number, UnitState>();
  private readonly pose = makePose();
  private readonly spec = weaponStyle('r_ninja').pose;
  private readonly tmp = { x: 0, y: 0, base: 0 };
  private readonly seatSpot: Spot = { x: 0, y: 0 };
  private readonly sq = { sx: 1, sy: 1 };
  private readonly lf = { x: 0, y: 0, rot: 0, alpha: 1, scale: 1 };
  private readonly scratch: Clone[] = [];
  private readonly sides: number[] = [];

  constructor(private readonly env: SpEnv) {
    const ev = env.battle.events;
    // The dispatcher only hands a scene the casts the stage rule admitted, and none of the follow-up events of this skill: the scene listens
    // for them itself (as the gunner's does for `bite`). The cast is heard here too so that a cast that lost still seats its clones.
    this.offs.push(
      ev.on('spCast', (e) => {
        if (e.skill === 'clones') this.safe('cast heard', () => this.ensure(e));
      }),
      ev.on('cloneThrow', (e) => this.safe('throw', () => this.onThrow(e))),
      ev.on('cloneStep', (e) => this.safe('step', () => this.onStep(e))),
      ev.on('cloneEnd', (e) => this.safe('end', () => this.onEnd(e))),
    );
  }

  /** A listener the simulation calls in the middle of a tick must not throw (an emitter does not catch): the scene logs it and switches itself off. */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] clones ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  // ───────────────────────────── the cast ─────────────────────────────

  cast(e: SpCastOf<'clones'>): void {
    if (this.broken) return;
    const { stage } = this.env;
    const bodies = this.ensure(e);
    for (const c of bodies) c.loud = true;
    const calm = stage.reduced;
    const detail = stage.detail;
    const nx = cellCenterX(e.unit.cell);
    const ny = cellCenterY(e.unit.cell) + FEET_DY;
    if (!calm) {
      // The "pop": a round ring of smoke at the ninja's feet (a real cat never smokes) and the leaf it has put on its head.
      stage.fx.ps.burst(POOF, nx, ny - 4, { count: detail === 0 ? 0.5 : 1 });
      if (detail > 0) stage.fx.shockwave(nx, ny - 6, { color: GHOST_SKY, radius: 30 });
      this.headLeaf(e.unit.uid);
    }
    stage.play(stage.rules.zone, 'molt', 0.4, 1.3, 0.04);
  }

  /** The clones of a cast (made once, however often it is told: here by the cast event and again by the dispatcher). */
  private ensure(e: SpCastOf<'clones'>): Clone[] {
    const d = e.data;
    const out = this.scratch;
    out.length = 0;
    for (let i = 0; i < d.seats.length; i++) {
      let c = this.find(e.unit.uid, i, d.at);
      if (!c) c = this.spawn(e.unit, i, d.seats[i] as (typeof d.seats)[number], d);
      if (c) out.push(c);
    }
    return out;
  }

  private spawn(unit: UnitState, index: number, seat: { cell: number; stacked: boolean; x: number; y: number }, d: SpCastOf<'clones'>['data']): Clone | null {
    const c = this.take();
    if (!c) return null;
    const art = this.artOf();
    c.on = true;
    c.seq = ++this.seq;
    c.uid = unit.uid;
    c.index = index;
    c.castAt = d.at;
    c.loud = false;
    c.quiet = false;
    c.throws = d.throws;
    c.left = d.throws;
    c.clumsy = index % 2 === 1;
    c.seed = (unit.uid * 1.713 + index * 2.1 + Math.PI) % TAU;
    c.cell = seat.stacked ? -1 : seat.cell;
    c.side = seat.stacked ? stackSide(index, this.sidesOf(unit.uid, c)) : 1;
    c.seatX = seat.x;
    c.seatY = seat.y + FEET_DY;
    c.fromX = cellCenterX(unit.cell);
    c.fromY = cellCenterY(unit.cell) + FEET_DY;
    c.x = c.lastX = c.fromX;
    c.y = c.lastY = c.fromY;
    c.base = c.fromY;
    c.facing = c.facingTo = cellCol(seat.stacked ? unit.cell : seat.cell) >= 3 ? -1 : 1;
    c.size = seat.stacked ? this.look.stackOffset.scale : 1;
    c.lean = 0;
    c.alpha = 0;
    c.alphaTo = cloneAlpha(c.left, c.throws, c.stacked, this.look);
    c.flash = 0;
    c.orphan = 0;
    c.phase = 'in';
    c.act = 'none';
    c.move.reset();
    c.acting.reset();
    c.moveLife = d.arrive > 0 ? d.arrive : HOP[0];
    c.moveFloor = HOP[1];
    let live = 0;
    for (const o of this.bodies) if (o !== c && o.on && o.phase !== 'out' && !o.lite) live++;
    c.lite = isLite(live, this.look);
    this.dress(c, art);
    c.root.visible = true;
    this.shape(c, 0);
    this.place(c);
    return c;
  }

  /** The sides (-1, 1) the ninja's other stacked clones already peek out on. */
  private sidesOf(uid: number, except: Clone): number[] {
    this.sides.length = 0;
    for (const o of this.bodies) if (o !== except && o.on && o.phase !== 'out' && o.uid === uid && o.stacked) this.sides.push(o.side);
    return this.sides;
  }

  private artOf(): CloneArt {
    return (this.art ??= cloneArt());
  }

  private take(): Clone | null {
    for (const c of this.bodies) if (!c.on) return c;
    if (this.bodies.length >= POOL_MAX) return null;
    this.layer ??= this.env.ctx.layers.units ?? this.env.ctx.layers.fxBack;
    this.layer.sortableChildren = true;
    const c = new Clone(fieldArt().shadow);
    this.layer.addChild(c.root);
    this.bodies.push(c);
    return c;
  }

  /** Put the pictures on a body that is starting: the pale art (tinted where it could not be baked), the outline, the shadow, its leaf. */
  private dress(c: Clone, art: CloneArt): void {
    c.sprite.texture = art.body;
    c.sprite.tint = art.bodyTinted ? GHOST_SKY_LIGHT : 0xffffff;
    c.rim.texture = art.rim ?? art.body;
    c.rim.tint = RIM_COLOR;
    c.rim.visible = art.rim !== null;
    c.shadow.tint = SHADOW_COLOR;
    c.leaf.texture = art.leaf;
    c.leaf.tint = art.leafTinted ? 0x7dba5c : 0xffffff;
    c.leaf.scale.set(LEAF_W / Math.max(1, art.leaf.width));
    c.sprite.visible = !c.lite || art.rim === null;
    c.leaf.visible = !c.lite && !this.env.stage.reduced;
    c.leaf.rotation = c.clumsy ? 0 : Math.PI * 0.86;
    c.sprite.alpha = 0;
  }

  // ───────────────────────────── the follow-up events ─────────────────────────────

  private find(uid: number, index: number, castAt?: number): Clone | null {
    for (const c of this.bodies) {
      if (c.on && c.phase !== 'out' && c.uid === uid && c.index === index && (castAt === undefined || c.castAt === castAt)) return c;
    }
    return null;
  }

  /** A clone threw along with its ninja's volley: it leans into the throw, flashes its outline, turns toward its target and is a step fainter. */
  private onThrow(e: BattleEvents['cloneThrow']): void {
    const c = this.find(e.unit.uid, e.index);
    const p = e.projectile;
    // The shuriken of a stacked clone is drawn starting from where the clone's body is, and settles onto the simulation's line.
    if (e.stacked) {
      const o = stackOffset(c ? c.side : e.index % 2 === 0 ? -1 : 1, this.look);
      noteGhostStart(p.uid, o.dx, o.dy);
    }
    if (!c) return;
    if (c.phase === 'in') this.land(c);
    c.left = e.left;
    c.alphaTo = cloneAlpha(c.left, c.throws, c.stacked, this.look);
    c.facingTo = Math.cos(p.angle) >= 0 ? 1 : -1;
    if (c.phase === 'stand') {
      c.act = 'throw';
      c.acting.reset();
    }
    c.flash = 1;
    if (!c.loud) return;
    const { stage } = this.env;
    const art = this.artOf();
    if (!stage.reduced && stage.detail > 0) {
      stage.fx.ps.burst(SPARK, c.x + c.facingTo * 12, c.y - art.height * 0.5 * c.size, { dir: p.angle, count: stage.detail === 1 ? 0.6 : 1 });
    }
    if (stage.now - this.lastThrowSound >= THROW_SOUND_GAP) {
      this.lastThrowSound = stage.now;
      stage.play(stage.rules.shoot, 'atk_r_ninja', 0.3, 1.3, 0.05);
    }
  }

  /** A cat took the clone's tile: it hops over to its ninja's tile and stands behind it. */
  private onStep(e: BattleEvents['cloneStep']): void {
    const c = this.find(e.unit.uid, e.index);
    if (!c) return;
    c.side = stackSide(c.index, this.sidesOf(c.uid, c));
    c.cell = -1;
    c.alphaTo = cloneAlpha(c.left, c.throws, true, this.look);
    const { stage } = this.env;
    if (stage.reduced) {
      c.phase = 'stand';
      return;
    }
    c.fromX = c.x;
    c.fromY = c.base;
    c.phase = 'step';
    c.act = 'none';
    c.move.reset();
    c.moveLife = STEP[0];
    c.moveFloor = STEP[1];
    // The hop is "oops": a little dust where it stood.
    if (c.loud) stage.fx.ps.burst(DUST, c.x, c.base, { count: stage.detail === 0 ? 0.5 : 1 });
  }

  /** A clone went: a puff (and one leaf drifting down when it threw its last shuriken), or just a fade when the stage or the battle ended. */
  private onEnd(e: BattleEvents['cloneEnd']): void {
    const c = this.find(e.unit.uid, e.index);
    if (!c) return;
    const quiet = e.reason === 'stage' || e.reason === 'end';
    this.out(c, quiet);
    if (!c.loud || quiet) return;
    const { stage } = this.env;
    const art = this.artOf();
    const calm = stage.reduced;
    if (!calm) {
      stage.fx.ps.burst(POP, c.x, c.y - art.height * 0.3 * c.size, { count: stage.detail === 0 ? 0.5 : 1 });
      if (e.reason === 'done') this.fallLeaf(c.x + c.facing * 3, c.y - art.height * HEAD_AT * c.size, c.index % 2 === 0 ? -1 : 1);
    }
    if (e.reason === 'done' || e.reason === 'timeout') stage.play(stage.rules.zone, 'whoosh', 0.22, 2.1, 0.05);
  }

  private out(c: Clone, quiet: boolean): void {
    if (c.phase === 'out') return;
    c.phase = 'out';
    c.quiet = quiet || this.env.stage.reduced;
    c.act = 'none';
    c.move.reset();
    c.moveLife = c.quiet ? FADE[0] : OUT[0];
    c.moveFloor = c.quiet ? FADE[1] : OUT[1];
  }

  /** The hop is over (it landed, or its first throw came before the picture got there): at the seat, with the landing it earns. */
  private land(c: Clone): void {
    c.phase = 'stand';
    c.act = c.clumsy ? 'wobble' : 'land';
    c.acting.reset();
    if (c.loud && !this.env.stage.reduced) this.env.stage.fx.ps.burst(DUST, c.x, c.base, { count: this.env.stage.detail === 0 ? 0.5 : 1 });
  }

  // ───────────────────────────── leaves ─────────────────────────────

  private leaf(): Leaf | null {
    for (const l of this.leaves) if (!l.on) return l;
    if (this.leaves.length >= LEAF_POOL) return null;
    this.front ??= this.env.ctx.layers.fxFront;
    const l = new Leaf();
    const art = this.artOf();
    l.sprite.texture = art.leaf;
    l.sprite.tint = art.leafTinted ? 0x7dba5c : 0xffffff;
    l.sprite.scale.set(LEAF_W / Math.max(1, art.leaf.width));
    this.front.addChild(l.sprite);
    this.leaves.push(l);
    return l;
  }

  /** The leaf the ninja puts on its head as it casts. */
  private headLeaf(uid: number): void {
    const l = this.leaf();
    if (!l) return;
    l.on = true;
    l.kind = 'head';
    l.uid = uid;
    l.age.reset();
    l.sprite.visible = true;
    this.poseLeaf(l, 0);
  }

  /** The leaf a clone leaves behind. */
  private fallLeaf(x: number, y: number, side: -1 | 1): void {
    const l = this.leaf();
    if (!l) return;
    l.on = true;
    l.kind = 'fall';
    l.x = x;
    l.y = y;
    l.side = side;
    l.age.reset();
    l.sprite.visible = true;
    this.poseLeaf(l, 0);
  }

  private poseLeaf(l: Leaf, k: number): void {
    const o = this.lf;
    if (l.kind === 'fall') {
      leafFall(k, l.side, o);
      o.scale = 1;
      l.sprite.position.set(l.x + o.x, l.y + o.y);
    } else {
      headLeaf(k, o);
      const view = this.env.ctx.unitView(l.uid);
      if (view) {
        l.x = view.x;
        l.y = view.y - this.artOf().height * HEAD_AT;
      }
      l.sprite.position.set(l.x + o.x, l.y + o.y);
    }
    l.sprite.rotation = o.rot;
    l.sprite.alpha = o.alpha;
    const base = LEAF_W / Math.max(1, this.artOf().leaf.width);
    l.sprite.scale.set(base * o.scale);
  }

  // ───────────────────────────── the frame ─────────────────────────────

  update(dt: number, battleDt: number): void {
    if (this.broken) return;
    this.updateLeaves(dt, battleDt);
    let live = 0;
    for (const c of this.bodies) if (c.on) live++;
    if (live === 0) return;
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    // The breathing runs on real time but stands still when the battle does (a popup stills the clones too).
    if (battleDt > 0) this.idle += dt;
    this.byUid.clear();
    for (const u of battle.units) if (u && u.clone.length > 0) this.byUid.set(u.uid, u);
    for (const c of this.bodies) {
      if (!c.on) continue;
      c.move.tick(battleDt, dt);
      c.acting.tick(battleDt, dt);
      this.follow(c, dt, battleDt);
      this.step(c, dt, calm);
      this.place(c);
    }
  }

  /** Read the state of the clone's ninja: how many throws it has left (its fade), where it stands, and whether it is still listed at all. */
  private follow(c: Clone, dt: number, battleDt: number): void {
    if (c.phase === 'out') return;
    const u = this.byUid.get(c.uid);
    let listed = false;
    if (u) {
      for (const s of u.clone) {
        if (s.index !== c.index) continue;
        listed = true;
        c.left = s.left;
        // The state moved the clone behind its ninja without the event (a view that joined late): follow it without the hop.
        if (s.cell < 0 && c.cell >= 0 && c.phase !== 'step') {
          c.cell = -1;
          c.side = stackSide(c.index, this.sidesOf(c.uid, c));
        }
        break;
      }
    }
    if (listed) {
      c.orphan = 0;
      c.alphaTo = cloneAlpha(c.left, c.throws, c.stacked, this.look);
    } else if (battleDt > 0) {
      c.orphan += dt;
      if (c.orphan > ORPHAN_AFTER) this.out(c, true);
    }
  }

  /** Move the clone along its phase and set how it looks (feet, depth, opacity, pose). */
  private step(c: Clone, dt: number, calm: boolean): void {
    const art = this.artOf();
    const stacked = c.stacked;
    const feet = this.feetOf(c, this.seatSpot);
    const hidden = stacked && this.ninjaLifted(c.uid);
    let sx = 1;
    let sy = 1;
    let rot = 0;
    let lx = 0;
    let ly = 0;
    let fade = 1;
    const bodyK = stacked ? this.look.stackOffset.scale : 1;
    c.size = damp(c.size, bodyK, 0.06, dt);
    c.lean = calm ? 0 : damp(c.lean, stacked ? c.side * STACK_LEAN : 0, 0.07, dt);
    c.facing = calm ? c.facingTo : damp(c.facing, c.facingTo, 0.04, dt);
    switch (c.phase) {
      case 'in': {
        const k = c.move.k(c.moveLife, c.moveFloor);
        if (calm) {
          c.x = feet.x;
          c.y = c.base = feet.y;
          fade = clamp01(c.move.k(FADE[0], FADE[1]));
          if (fade >= 1) this.land(c);
        } else {
          const height = stacked ? 0 : hopHeight(Math.hypot(feet.x - c.fromX, feet.y - c.fromY));
          hopAt(k, c.fromX, c.fromY, feet.x, feet.y, height, this.tmp);
          c.x = this.tmp.x;
          c.y = this.tmp.y;
          c.base = this.tmp.base;
          fade = clamp01(k / 0.3);
          // It leaps out stretched along the way up and lands squashed (the landing's own squash follows).
          const lift = Math.sin(Math.PI * k);
          sx = 1 - 0.08 * lift;
          sy = 1 + 0.12 * lift;
          if (k >= 1) this.land(c);
        }
        break;
      }
      case 'step': {
        const k = c.move.k(c.moveLife, c.moveFloor);
        hopAt(k, c.fromX, c.fromY, feet.x, feet.y, 16, this.tmp);
        c.x = this.tmp.x;
        c.y = this.tmp.y;
        c.base = this.tmp.base;
        const lift = Math.sin(Math.PI * k);
        sx = 1 - 0.06 * lift;
        sy = 1 + 0.1 * lift;
        if (k >= 1) {
          c.phase = 'stand';
          c.act = 'land';
          c.acting.reset();
        }
        break;
      }
      case 'out': {
        const k = c.move.k(c.moveLife, c.moveFloor);
        if (c.quiet) fade = 1 - k;
        else {
          const s = deathScale(k);
          sx = sy = s;
          fade = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
        }
        // A clone that stands behind its ninja goes where the ninja is now; a clone on its own tile stays put.
        if (stacked) {
          c.x = feet.x;
          c.y = c.base = feet.y;
        }
        if (k >= 1) {
          c.on = false;
          c.root.visible = false;
          return;
        }
        break;
      }
      default:
        c.x = feet.x;
        c.y = c.base = feet.y;
        break;
    }
    if (c.phase === 'stand' || c.phase === 'step') {
      const pose = this.pose;
      if (c.phase === 'stand' && c.act === 'throw') {
        const life = releaseSeconds(this.spec);
        const k = c.acting.k(life, THROW_FLOOR);
        releasePose(this.spec, k * life, THROW_COIL, pose);
        if (!calm) {
          lx = c.facingTo * LUNGE_PX * pose.lunge;
          sx = pose.sx;
          sy = pose.sy;
          rot = pose.rot * c.facingTo;
          ly = -pose.rise;
        }
        if (k >= 1) c.act = 'none';
      } else if (c.phase === 'stand' && c.act === 'land' && !calm) {
        const k = c.acting.k(LAND[0], LAND[1]);
        landSquash(k * LAND[0], this.sq);
        sx = this.sq.sx;
        sy = this.sq.sy;
        if (k >= 1) c.act = 'none';
      } else if (c.phase === 'stand' && c.act === 'wobble' && !calm) {
        // The clumsy one lands off balance and rings out like a toy.
        const k = c.acting.k(WOBBLE[0], WOBBLE[1]);
        rot = wobbleRot(k * WOBBLE[0]) * c.facing;
        landSquash(Math.min(k * WOBBLE[0], LAND[0]), this.sq);
        sx = this.sq.sx;
        sy = this.sq.sy;
        if (k >= 1) c.act = 'none';
      } else if (c.phase === 'stand' && !calm && c.act === 'none') {
        breathe(this.idle, c.seed, 1, pose);
        sx = pose.sx;
        sy = pose.sy;
      }
    }
    // Opacity: it eases to the step its throws left it at; a clone behind a ninja that is being dragged or sold hides for the moment.
    const target = hidden ? 0 : c.alphaTo;
    c.alpha = c.phase === 'in' || c.phase === 'out' ? target : calm ? target : damp(c.alpha, target, 0.05, dt);
    c.flash = damp(c.flash, 0, 0.05, dt);
    this.shape(c, fade);
    c.setRig(sx, sy, rot + c.lean, lx, ly);
    // The sprite's own look: the facing flips it, the size shrinks a stacked one, the outline and the shadow follow the opacity.
    const scale = art.scale * c.size;
    c.sprite.scale.set(scale * c.facing, scale);
    c.rim.scale.set(scale * c.facing, scale);
    c.rim.position.y = -(art.height * c.size) / 2;
    c.leaf.position.set(c.facing * art.height * 0.025 * c.size, -art.height * HEAD_AT * c.size);
    c.shadow.scale.set(0.92 * c.size);
    c.shadow.alpha = Math.min(0.42, 0.62 * c.alpha) * fade;
  }

  /** The opacity of every piece of a body for this frame (`fade` is the phase's own: a hop fading in, a pop fading out). */
  private shape(c: Clone, fade: number): void {
    const a = c.alpha * fade;
    c.sprite.alpha = c.stacked ? Math.min(1, a * STACK_ALPHA_BOOST) : a;
    // The outline is the thing that stays sharp as the body fades: it falls off half as fast, and a throw flashes it.
    c.rim.alpha = Math.min(1, (0.55 + 0.45 * a + 0.4 * c.flash) * Math.min(1, fade * 1.4));
    c.leaf.alpha = Math.min(1, a * 1.6);
    if (c.lite) c.rim.alpha *= 0.9;
  }

  /** Where the clone's feet are meant to be: its own tile, or behind its ninja. */
  private feetOf(c: Clone, out: Spot): Spot {
    if (!c.stacked) {
      out.x = c.seatX;
      out.y = c.seatY;
      return out;
    }
    const view = this.env.ctx.unitView(c.uid);
    if (view) {
      stackFeet(view.x, view.y, c.side, this.look, out);
      c.lastX = out.x;
      c.lastY = out.y;
      return out;
    }
    // The ninja's view is not there (it was just sold): stay where the clone last was.
    out.x = c.lastX;
    out.y = c.lastY;
    return out;
  }

  /** The ninja is held in a finger or being sold: its clones behind it are not shown. */
  private ninjaLifted(uid: number): boolean {
    const view = this.env.ctx.unitView(uid);
    if (!view) return false;
    return view.zIndex >= 99999 || (this.layer !== null && view.parent !== this.layer && view.parent !== null);
  }

  /** The depth: a standing clone sorts a hair behind a cat that stands where it does; a stacked one a hair behind its ninja. */
  private place(c: Clone): void {
    c.root.position.set(c.x, c.y);
    if (c.stacked) {
      const view = this.env.ctx.unitView(c.uid);
      c.root.zIndex = (view ? view.zIndex : c.base) - 0.5;
    } else c.root.zIndex = c.base - 0.3;
  }

  private updateLeaves(dt: number, battleDt: number): void {
    for (const l of this.leaves) {
      if (!l.on) continue;
      l.age.tick(battleDt, dt);
      const k = l.age.k(...(l.kind === 'head' ? HEAD_LEAF : LEAF_FALL));
      if (k >= 1) {
        l.on = false;
        l.sprite.visible = false;
        continue;
      }
      this.poseLeaf(l, k);
    }
  }

  // ───────────────────────────── the end ─────────────────────────────

  clear(): void {
    for (const c of this.bodies) {
      c.on = false;
      c.root.visible = false;
    }
    for (const l of this.leaves) {
      l.on = false;
      l.sprite.visible = false;
    }
    this.byUid.clear();
    this.scratch.length = 0;
    clearGhostStarts();
  }

  destroy(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.clear();
    for (const c of this.bodies) c.root.destroy({ children: true });
    for (const l of this.leaves) l.sprite.destroy();
    this.bodies.length = 0;
    this.leaves.length = 0;
  }

  /** What is on the board right now (QA and tests). */
  live(): {
    bodies: number;
    standing: number;
    stacked: number;
    full: number;
    lite: number;
    leaves: number;
    list: Array<{ uid: number; index: number; phase: Phase; cell: number; side: number; x: number; y: number; alpha: number; left: number; loud: boolean; lite: boolean }>;
  } {
    const on = this.bodies.filter((c) => c.on);
    return {
      bodies: on.length,
      standing: on.filter((c) => !c.stacked).length,
      stacked: on.filter((c) => c.stacked).length,
      full: on.filter((c) => !c.lite).length,
      lite: on.filter((c) => c.lite).length,
      leaves: this.leaves.filter((l) => l.on).length,
      list: on.map((c) => ({ uid: c.uid, index: c.index, phase: c.phase, cell: c.cell, side: c.side, x: c.x, y: c.y, alpha: c.sprite.alpha, left: c.left, loud: c.loud, lite: c.lite })),
    };
  }
}

export const makeClones: SpSceneFactory<'clones'> = (env) => new ClonesScene(env);
