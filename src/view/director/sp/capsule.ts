/**
 * Lucky Capsule!, the lucky cat's scene (docs/design_skills_v2.md 3.12): a capsule drops out of the sky onto the cat's head already wearing its
 * KIND (its colour AND a mark, so it never relies on hue alone), bounces twice and splits open at the opening into its prize.
 *
 * Moment by moment (1x; every time is the battle's clock, `BattleApi.time`, so a popup holds the picture and 3x runs it a third as long, with
 * no real floor on the fall: the lid must open on the very tick the simulation hands out the prize; the pictures AFTER the opening have floors):
 *   0.00  the cast: a whistle, the capsule falls from above the screen (330 px) onto the cat's head, accelerating, a little stretched. A fish
 *         capsule's ring is HELD at empty (the simulation already wrote the half refund) so that it can spring back at the lid;
 *   0.5   the first landing and a thud, a squash; 0.7 the second, smaller; then it rests and rocks, harder and harder, until the lid goes. The
 *         six kinds are told apart by their colour and mark AND by the beat of the fall (the purr capsule is light and quick, the One More!
 *         heavy and rattling, the toy falls from a high whistle with glints, the guardian glides down slowly and the board is washed with
 *         bands of colour while it comes);
 *   1.20  the opening (`capsuleOpen`): the lid springs off to one side and spins away, the base settles and fades, a ring and bits of shell
 *         go out, a paper line pops over the cat (the wording table, two lines), and by what the prize is (`result`):
 *           fish     the fish fly to the counter (the currency director, from the lid) and the ring SPRINGS from empty to half with a small
 *                    overshoot, on the lid's frame;
 *           purr     hearts fountain out of the lid, fly to the purr counter, and every cat on the board purrs for a second (a heart and a soft
 *                    rose ring each, thinned by the quality tier);
 *           seat     a mint beam falls from the lid onto the empty tile and the twin's sticker follows it straight down (the field's `drop`),
 *                    two paw prints are stamped between the original and the twin when it lands;
 *           promote  the beam lands on the cat, the old sticker SWELLS, bursts and the next rank pops out of it (an overlay on the cat's tile);
 *           more     the lid goes and a small capsule rolls out of the shell, turns its own colour to the board and wobbles, opening 1.0 s later
 *                    with the prize of the kind it wears;
 *           toy      fireworks and a gold ring on the real clock (the simulation stops at once for the pick, so the picture cannot wait for
 *                    the battle's clock), then the toy screen after `CAPSULE_TOY_WAIT`;
 *           awaken   a rainbow beam of four bands falls on the cat that is awakened; the free cut-in follows;
 *           fallback the promise fails: the shell opens EMPTY and something small and funny floats out of it (a question mark for the
 *                    buddy, a hollow star for the toy, a sleepy "z z" for the guardian) and hearts, as many as the purr, come out instead.
 *
 * The shells are the owner's painted pictures (`capsuleArt.ts`: a lid and a base per kind, cut from one picture along its band; only the three
 * glyphs of an empty capsule are still painted in code) and the board, ring and counters are the ones that exist; the scene listens
 * to `capsuleOpen` and `promote` itself (the dispatcher routes only the cast). A cast the stage rule dropped shows no capsule and its opening
 * finds nobody to open (`pairOpening`), so it shows nothing of ours: the prize itself is the simulation's and the field's. A defeat does not
 * tear a capsule down (`survivesDefeat`): the simulation keeps the capsules in the air for a revive and the picture, timed by the battle's
 * clock, stands still with them; a victory drops them (no opening ever comes).
 */
import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { tex } from '@/core/assets';
import { t } from '@/core/i18n';
import { TAU, darken, lighten } from '@/core/math';
import { Ease } from '@/core/tween';
import { fxTex, type EmitDef } from '@/fx';
import { Hue } from '@/fx/palette';
import { unitClass, unitRarity, type BattleEvents, type SpCapsuleKind, type UnitId } from '@/game';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, CELL_COUNT, cellCenterX, cellCenterY } from '@/game/geometry';
import { PaperLabel } from '@/ui/paper';
import { Color } from '@/ui/theme';
import { RAINBOW, SHELL_ANCHOR, SHELL_K, capsuleArt, capsuleLook, type CapsuleArt } from '../../capsuleArt';
import { holdRing, releaseRing } from '../../field/ringHold';
import { FEET_DY, unitSpriteScale } from '../../field/unitView';
import { CAPSULE_TOY_WAIT, stageHeldFor } from '../../staging';
import { SPARKLE_UP } from '../defs';
import { CLASS_COLOR } from '../palette';
import {
  BEATS, REST_UP, ROLL_DIST, SMALL_SCALE, LINE_HAS_B, baseAlpha, basePose, chorusSize, fallPose, heartsFor, landings, lidAlpha, lidPose, lineFor,
  lineShown, newPose, pairOpening, rollPose, springValue, waitRock, type LineId, type Pending, type Pose,
} from './capsuleMath';
import { bubbleSpot } from './intro';
import { Age } from './span';
import type { SpCastOf, SpEnv, SpScene, SpSceneFactory } from './types';
import { NIGHT_LABEL } from './types';

/** [battle seconds, real floor] of each moment after the opening. */
const OPEN: readonly [number, number] = [0.42, 0.3];
const ROLL: readonly [number, number] = [0.42, 0.26];
const BEAM: readonly [number, number] = [0.5, 0.32];
const STAMP: readonly [number, number] = [1.3, 0.9];
const GLYPH: readonly [number, number] = [1.1, 0.7];
const SWELL: readonly [number, number] = [0.66, 0.42];
const SPRING: readonly [number, number] = [0.36, 0.22];
const POP: readonly [number, number] = [1.05, 0.75];
/** A toy capsule's lid waits for the banners only when they have more than this many real seconds to go (a banner that is just leaving is not worth a pause). */
const LID_WAIT_MIN = 0.05;
/** A capsule whose opening never comes goes by itself this long after its time (a long pause between acts holds the simulation's list). */
const GRACE = 8;
/** The pools: capsules at once (two big ones and a small one are the most the simulation can have in the air), and the small pieces. */
const FLIGHTS = 4;
const BEAMS = 4;
const STAMPS = 4;
const GLYPHS = 3;
const SWELLS = 2;
const POPS = 2;
/** How far a stamp's paws are from the line between the two cats, and the delay of the second (battle seconds). */
const PAW_GAP = 12;
const PAW_LATE = 0.09;
/** The rainbow wash over the board while a guardian capsule falls. */
const WASH_ALPHA = 0.14;

const W = Hue.cream;
/** How far (design px) the paper line is lifted above the cat's head, over the capsule's own pictures. */
const POP_LIFT = 58;
/** The tail of the pop-up's paper, as long as the name bubble's (so the cry reads like it). */
const TAIL = 15;

const LID_RING: EmitDef = {
  tex: 'ring', prio: 1, count: 1, life: 0.4, size: 30, sizeEnd: 170, sizeEase: Ease.cubicOut, colors: [W], alpha: 0.85, fadeIn: 0, fadeOut: 0.7,
};
const SHELL_BITS: EmitDef = {
  tex: 'confetti', prio: 1, count: 9, life: [0.5, 0.9], shape: { type: 'circle', r: 12 }, speed: [100, 250], dir: -Math.PI / 2, spread: 1.7, gravity: 540,
  drag: 0.8, size: [10, 16], sizeEnd: [8, 12], spin: [-10, 10], rot: [0, TAU], colors: [W], fadeIn: 0, fadeOut: 0.4,
};
const GLINT: EmitDef = {
  tex: 'sparkle', prio: 0, count: 1, life: [0.3, 0.5], shape: { type: 'circle', r: 24 }, speed: [10, 40], drag: 2, size: [12, 20], sizeEnd: [3, 6],
  spin: [-4, 4], rot: [0, TAU], colors: [W], fadeIn: 0.1, fadeOut: 0.6,
};
const HEART_FOUNTAIN: EmitDef = {
  tex: 'heart', prio: 1, count: 1, life: [0.9, 1.3], delay: [0, 0.45], shape: { type: 'circle', r: 14 }, speed: [130, 250], dir: -Math.PI / 2, spread: 0.95,
  drag: 1.4, gravity: 150, size: [12, 17], sizeEnd: [22, 30], sizeEase: Ease.backOut, rot: [-0.3, 0.3], colors: [Hue.heart, lighten(Hue.heart, 0.3)],
  fadeIn: 0, fadeOut: 0.45,
};
const CHORUS_HEART: EmitDef = {
  tex: 'heart', prio: 0, count: 1, life: [0.9, 1.3], delay: [0, 0.5], shape: { type: 'circle', r: 20 }, speed: [30, 66], dir: -Math.PI / 2, spread: 0.5,
  drag: 0.6, gravity: -8, size: [9, 13], sizeEnd: [18, 26], sizeEase: Ease.backOut, rot: [-0.25, 0.25], colors: [Hue.heart, lighten(Hue.heart, 0.35)],
  fadeIn: 0, fadeOut: 0.5, sway: { amp: [5, 10], freq: [0.8, 1.4] },
};
const CHORUS_GLOW: EmitDef = {
  tex: 'ring', prio: 0, count: 1, life: 0.85, delay: [0, 0.3], size: 44, sizeEnd: 96, sizeEase: Ease.cubicOut, colors: [lighten(Hue.heart, 0.25)], alpha: 0.55,
  fadeIn: 0.1, fadeOut: 0.7,
};
const HEART_RAIN: EmitDef = {
  tex: 'heart', prio: 0, count: 1, life: [0.8, 1.2], delay: [0, 0.6], shape: { type: 'rect', w: BOARD_W, h: 8 }, speed: [160, 260], dir: Math.PI / 2, spread: 0.2,
  drag: 0.4, gravity: 120, size: [16, 22], sizeEnd: [22, 30], rot: [-0.3, 0.3], colors: [Hue.heart, lighten(Hue.heart, 0.3)], fadeIn: 0.1, fadeOut: 0.4,
};
const FIREWORK: EmitDef = {
  tex: 'sparkle', prio: 1, count: 10, life: [0.5, 0.8], speed: [160, 340], dir: -Math.PI / 2, spread: Math.PI, drag: 2.2, gravity: 160, size: [18, 30],
  sizeEnd: [4, 8], spin: [-5, 5], rot: [0, TAU], colors: [Hue.sun, Color.mustard, W], fadeIn: 0, fadeOut: 0.5,
};
const FIREWORK_STAR: EmitDef = {
  tex: 'star', prio: 1, count: 5, life: [0.45, 0.7], delay: [0, 0.16], speed: [120, 260], dir: -Math.PI / 2, spread: Math.PI, drag: 2.4, size: [14, 22],
  sizeEnd: [5, 8], spin: [-6, 6], rot: [0, TAU], colors: [Color.mustard, Hue.sun], fadeIn: 0, fadeOut: 0.5,
};
const DUST_PUFF: EmitDef = {
  tex: 'smoke', prio: 1, count: 4, life: [0.3, 0.5], shape: { type: 'circle', r: 10 }, speed: [30, 80], drag: 3, gravity: -10, size: [16, 24], sizeEnd: [34, 48],
  rot: [0, TAU], spin: [-1, 1], colors: [W, Hue.dust], alpha: 0.7, fadeIn: 0.05, fadeOut: 0.6,
};

/** What a prize's glints and bits wear: the capsule's own colour (the rainbow wears all four). */
function tints(kind: SpCapsuleKind): readonly number[] {
  const look = capsuleLook(kind);
  return look.color === 'rainbow' ? RAINBOW : [lighten(look.hue, 0.25), look.hue];
}

type State = 'air' | 'open' | 'roll' | 'wait' | 'gone';

/** One capsule on the screen (a big one, or the small one that rolls out of a One More!); it is also the record the opening is matched against. */
class Flight implements Pending {
  readonly root = new Container();
  readonly base = new Sprite();
  readonly lid = new Sprite();
  on = false;
  seq = 0;
  // the record
  kind: SpCapsuleKind = 'fish';
  inner: SpCapsuleKind | null = null;
  at = 0;
  opens = 0;
  stage: 'air' | 'inside' | 'done' = 'air';
  // the picture
  state: State = 'air';
  small = false;
  openDelay = 1.2;
  moreDelay = 1;
  /** The cat's tile at the cast (the opening spot), the cat's number and cell, and the one the small capsule belongs to. */
  x = 0;
  y = 0;
  cell = 0;
  unitId: UnitId = 't_lucky';
  child: Flight | null = null;
  /** The rest place of the capsule's middle (a small one: where it stopped rolling). */
  restX = 0;
  restY = 0;
  /** Where the ball's middle is drawn right now. */
  px = 0;
  py = 0;
  readonly age = new Age();
  /** The picture after the opening runs on the real clock (the toy: the simulation stops the same tick). */
  real = false;
  /** How long the picture after the opening lives: battle seconds and the real floor (the toy's runs on the real clock only, until its screen is up). */
  life = 0.42;
  floor = 0.3;
  side = 1;
  rollDir = 1;
  /** Which of the fall's sounds have been made. */
  heard = 0;
  /** A toy capsule's opening that waits for the skills' banners to clear the stage (real seconds left; the closed shell sits on the cat meanwhile). */
  openEv: BattleEvents['capsuleOpen'] | null = null;
  openIn = 0;
  /** The lucky cats whose rings this capsule holds (a fish capsule). */
  held: number[] = [];
  readonly pose: Pose = newPose();

  constructor(art: CapsuleArt) {
    // The two halves lie on the same canvas with the seam's middle at its middle: one anchor, drawn at the same place, they are the whole shell.
    this.base.texture = art.bases.fish;
    this.base.anchor.set(SHELL_ANCHOR);
    this.lid.texture = art.lids.fish;
    this.lid.anchor.set(SHELL_ANCHOR);
    this.root.addChild(this.base, this.lid);
    this.root.eventMode = 'none';
    this.root.visible = false;
  }
}

/** A short-lived picture: its own clock choice and a delay. */
abstract class Bit {
  on = false;
  wait = 0;
  real = false;
  life = 1;
  floor = 0.5;
  readonly age = new Age();
  start(life: readonly [number, number], wait = 0, real = false): void {
    this.on = true;
    this.age.reset();
    this.life = life[0];
    this.floor = life[1];
    this.wait = wait;
    this.real = real;
  }
  /** 0..1 through the life (0 while it waits). */
  k(): number {
    return this.wait > 0 ? 0 : this.age.k(this.life, this.floor);
  }
  abstract hide(): void;
  abstract destroy(): void;
}

/** A beam of light from the lid to a tile: up to four parallel lanes (the rainbow). */
class Beam extends Bit {
  readonly root = new Container();
  readonly lanes: Sprite[] = [];
  x0 = 0;
  y0 = 0;
  x1 = 0;
  y1 = 0;
  colors: readonly number[] = [W];
  constructor(parent: Container, beam: Texture) {
    super();
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(beam);
      s.anchor.set(0.5);
      this.lanes.push(s);
      this.root.addChild(s);
    }
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
  }
  hide(): void {
    this.on = false;
    this.root.visible = false;
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** A paw print stamped between two cats. */
class Stamp extends Bit {
  readonly sprite: Sprite;
  constructor(parent: Container, paw: Texture) {
    super();
    this.sprite = new Sprite(paw);
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    this.sprite.eventMode = 'none';
    parent.addChild(this.sprite);
  }
  hide(): void {
    this.on = false;
    this.sprite.visible = false;
  }
  destroy(): void {
    this.sprite.destroy();
  }
}

/** A glyph that floats out of an empty capsule. */
class Glyph extends Bit {
  readonly sprite = new Sprite();
  x = 0;
  y = 0;
  sway = 0;
  constructor(parent: Container) {
    super();
    this.sprite.anchor.set(0.5);
    this.sprite.visible = false;
    this.sprite.eventMode = 'none';
    parent.addChild(this.sprite);
  }
  hide(): void {
    this.on = false;
    this.sprite.visible = false;
  }
  destroy(): void {
    this.sprite.destroy();
  }
}

/** The sticker that swells and becomes the next rank. */
class Swell extends Bit {
  readonly root = new Container();
  readonly oldCat = new Sprite();
  readonly newCat = new Sprite();
  readonly flash = new Sprite();
  oldId: UnitId = 'w_paw';
  newId: UnitId = 'w_paw';
  x = 0;
  y = 0;
  burstDone = false;
  constructor(parent: Container, burst: Texture) {
    super();
    this.oldCat.anchor.set(0.5, 1);
    this.newCat.anchor.set(0.5, 1);
    this.flash.texture = burst;
    this.flash.anchor.set(0.5);
    this.flash.tint = Hue.sun;
    this.root.addChild(this.oldCat, this.newCat, this.flash);
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
  }
  hide(): void {
    this.on = false;
    this.root.visible = false;
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** The paper line over the cat when the lid goes: a cry, and under it where there is one a smaller line. */
class Pop extends Bit {
  readonly root = new Container();
  readonly tail = new Graphics();
  readonly cry: PaperLabel;
  readonly sub: PaperLabel;
  y = 0;
  constructor(parent: Container, paper: number) {
    super();
    this.cry = new PaperLabel({ text: ' ', size: 24, paper, ink: Color.inkDeep, minWidth: 120, maxWidth: 380, torn: 'ends' });
    this.sub = new PaperLabel({ text: ' ', size: 19, paper: lighten(paper, 0.45), ink: Color.inkDeep, minWidth: 100, maxWidth: 380, torn: 'ends' });
    this.root.addChild(this.tail, this.sub, this.cry);
    this.root.eventMode = 'none';
    this.root.visible = false;
    parent.addChild(this.root);
  }
  hide(): void {
    this.on = false;
    this.root.visible = false;
  }
  destroy(): void {
    this.root.destroy({ children: true });
  }
}

/** The ring of a lucky cat springing from empty to its real value. */
interface Spring {
  uid: number;
  to: number;
  age: Age;
  real: boolean;
}

class CapsuleScene implements SpScene<'capsule'> {
  readonly survivesDefeat = true;
  private readonly front: Container;
  private readonly back: Container;
  private readonly flights: Flight[] = [];
  private readonly beams: Beam[] = [];
  private readonly stamps: Stamp[] = [];
  private readonly glyphs: Glyph[] = [];
  private readonly swells: Swell[] = [];
  private readonly pops: Pop[] = [];
  private readonly springs: Spring[] = [];
  private wash: Graphics | null = null;
  private art: CapsuleArt | null = null;
  private seq = 0;
  /** The opening that just announced a promotion: the `promote` event that follows in the same tick belongs to it. */
  private promoting: { cell: number; kind: SpCapsuleKind } | null = null;
  private readonly off: Array<() => void> = [];
  private broken = false;

  constructor(private readonly env: SpEnv) {
    this.front = env.ctx.layers.fxFront;
    this.back = env.ctx.layers.fxBack;
    const ev = env.battle.events;
    this.off.push(
      ev.on('capsuleOpen', (e) => this.safe('open', () => this.onOpen(e))),
      ev.on('promote', (e) => this.safe('promote', () => this.onPromote(e))),
    );
  }

  /** The scene's own listeners are called by the simulation in the middle of a rule: a throw here must not unwind into it. */
  private safe(what: string, fn: () => void): void {
    if (this.broken) return;
    try {
      fn();
    } catch (err) {
      console.error(`[skills] capsule ${what} failed`, err);
      this.broken = true;
      this.clear();
    }
  }

  // ── the cast ──

  cast(e: SpCastOf<'capsule'>): void {
    const { stage, battle } = this.env;
    const d = e.data;
    const f = this.takeFlight();
    f.on = true;
    f.seq = ++this.seq;
    f.kind = d.kind;
    f.inner = d.inner;
    f.at = d.at;
    f.openDelay = d.openDelay;
    f.moreDelay = d.moreDelay;
    f.opens = d.at + d.openDelay;
    f.stage = 'air';
    f.state = 'air';
    f.small = false;
    f.real = false;
    f.child = null;
    f.heard = 0;
    f.openEv = null;
    f.x = e.x;
    f.y = e.y;
    f.cell = e.unit.cell;
    f.unitId = e.unit.id;
    f.restX = e.x;
    f.restY = e.y - REST_UP;
    f.side = f.restX < BOARD_X + BOARD_W / 2 ? 1 : -1;
    f.age.reset();
    this.dress(f, d.kind);
    f.root.scale.set(1);
    f.root.alpha = 1;
    f.root.visible = true;
    this.place(f);
    // A fish capsule's refund: the simulation wrote the half already, the ring shows empty until the lid springs it back.
    if (d.refund) {
      for (const u of battle.units) {
        if (!u || u.id !== e.unit.id) continue;
        holdRing(u.uid, 0);
        f.held.push(u.uid);
      }
    }
    const beat = BEATS[d.kind];
    if (!stage.reduced) stage.play(stage.rules.zone, 'whoosh', 0.3, beat.whistle, 0.04);
  }

  /** Put the right halves on a flight. */
  private dress(f: Flight, kind: SpCapsuleKind): void {
    const art = (this.art ??= capsuleArt());
    f.lid.texture = art.lids[kind];
    f.base.texture = art.bases[kind];
    f.lid.position.set(0, 0);
    f.lid.alpha = 1;
    f.lid.rotation = 0;
    f.lid.scale.set(SHELL_K);
    f.base.alpha = 1;
    f.base.position.set(0, 0);
    f.base.scale.set(SHELL_K);
    f.root.rotation = 0;
  }

  // ── the opening ──

  private onOpen(e: BattleEvents['capsuleOpen']): void {
    const { battle } = this.env;
    const live = this.flights.filter((f) => f.on);
    const f = pairOpening(live, e.kind, e.small, battle.time);
    if (!f) return;
    let target = f;
    if (e.small) {
      f.stage = 'done';
      const child = f.child;
      if (!child) return;
      target = child;
    } else {
      f.stage = e.result === 'more' ? 'inside' : 'done';
    }
    // The small capsule has had its opening: the shell's record can go (the shell's picture went long ago).
    if (e.small && f.state === 'gone') f.on = false;
    // A toy stops the wave for its screen, and the screen waits for the banners that are in the way (`capsuleToyWait`): the lid waits with it, so that
    // it is SEEN opening (the fireworks, the ring) in the lead-in before the screen, not unseen under a banner. The closed shell sits on the cat.
    const held = e.result === 'toy' ? stageHeldFor() : 0;
    if (held > LID_WAIT_MIN) {
      target.openEv = e;
      target.openIn = held;
      return;
    }
    this.openUp(target, e);
  }

  /** Split a capsule open and bring out its prize. */
  private openUp(f: Flight, e: BattleEvents['capsuleOpen']): void {
    const { stage } = this.env;
    const calm = stage.reduced;
    const detail = stage.detail;
    const px = f.px;
    const py = f.py;
    f.state = 'open';
    f.age.reset();
    f.real = e.result === 'toy';
    f.life = f.real ? CAPSULE_TOY_WAIT : OPEN[0];
    f.floor = f.real ? CAPSULE_TOY_WAIT : OPEN[1];
    const scale = f.small ? SMALL_SCALE : 1;
    const hue = capsuleLook(f.kind).hue;
    const colors = tints(f.kind);

    // The ring springs back: on the lid's frame, for every lucky cat this capsule held.
    if (f.held.length > 0) this.startSprings(f);

    stage.fx.ps.burst(LID_RING, px, py, { colors: [lighten(hue, 0.5)], scale });
    if (!calm) stage.fx.ps.burst(SHELL_BITS, px, py - 10, { colors: [...colors, W], count: (detail === 0 ? 0.5 : 1) * scale, scale });
    this.openSound(f, e);

    const line = lineFor(e.result, e.kind);
    if (lineShown(line)) this.pop(f, line, e.purr);

    switch (e.result) {
      case 'fish':
        if (!calm) stage.fx.ps.burst(SPARKLE_UP, px, py, { colors: [W, Color.mustard], count: 1.2 });
        break;
      case 'purr':
        this.hearts(px, py, heartsFor(e.result, e.purr, detail));
        this.chorus({ x: px, y: py });
        break;
      case 'seat':
        this.beam(f, e.cell, [capsuleLook('partner').hue], 0);
        this.stampPaws(e.origin, e.cell);
        break;
      case 'promote':
        this.beam(f, e.cell, [capsuleLook('partner').hue], 0);
        this.promoting = { cell: e.cell, kind: f.kind };
        break;
      case 'awaken':
        this.beam(f, e.cell, RAINBOW, 0);
        if (!calm) stage.fx.ps.burst(SPARKLE_UP, cellCenterX(e.cell), cellCenterY(e.cell) - 10, { colors: RAINBOW, count: 1.6, scale: 1.2 });
        break;
      case 'more':
        this.spawnSmall(f);
        break;
      case 'toy':
        this.fireworks(px, py);
        break;
      default:
        this.fallback(f, e);
    }
  }

  /** The small capsule that rolls out of a One More!: it takes its own colour and mark from the kind it is. */
  private spawnSmall(big: Flight): void {
    const kind = big.inner;
    if (kind === null) return;
    const s = this.takeFlight();
    s.on = true;
    s.seq = ++this.seq;
    s.kind = kind;
    s.inner = null;
    s.small = true;
    s.at = this.env.battle.time;
    s.openDelay = big.moreDelay;
    s.moreDelay = big.moreDelay;
    s.opens = s.at + big.moreDelay;
    s.stage = 'done';
    s.state = 'roll';
    s.real = false;
    s.child = null;
    s.x = big.x;
    s.y = big.y;
    s.cell = big.cell;
    s.unitId = big.unitId;
    s.restX = big.px;
    s.restY = big.py;
    s.px = big.px;
    s.py = big.py;
    s.held = [];
    s.openEv = null;
    s.rollDir = big.side;
    s.side = big.side;
    s.age.reset();
    this.dress(s, kind);
    s.root.visible = true;
    big.child = s;
    this.place(s);
    this.env.stage.fx.ps.burst(DUST_PUFF, big.px + big.side * 20, big.py + 22, { count: this.env.stage.detail === 0 ? 0.5 : 0.8, scale: 0.8 });
  }

  /** Each kind's opening sound, from the sounds the game has. */
  private openSound(f: Flight, e: BattleEvents['capsuleOpen']): void {
    const { stage } = this.env;
    const r = stage.rules.big;
    const small = f.small ? 1.25 : 1;
    switch (e.result) {
      case 'fish': stage.play(r, 'chest_open', 0.5, 1.15 * small, 0.04); break;
      case 'purr': stage.play(r, 'purr', 0.55, 1 * small, 0.04); break;
      case 'seat':
      case 'promote': stage.play(r, 'star', 0.55, 1.05 * small, 0.03); break;
      case 'more': stage.play(r, 'chest_open', 0.45, 0.8, 0.04); break;
      case 'toy': stage.play(r, 'level_up', 0.6, 1 * small, 0.02); break;
      case 'awaken': stage.play(r, 'summon_legendary', 0.55, 1, 0.02); break;
      default: stage.play(r, 'gamble_fail', 0.4, 1.1 * small, 0.03);
    }
  }

  // ── what comes out ──

  private hearts(x: number, y: number, n: number): void {
    if (n <= 0 || this.env.stage.reduced) return;
    this.env.stage.fx.ps.burst(HEART_FOUNTAIN, x, y - 6, { count: n });
  }

  /** Every cat on the board purrs for a second: a heart over each and a soft rose ring under it (the nearest few on a lower quality tier). */
  private chorus(at: { x: number; y: number }): void {
    const { stage, battle } = this.env;
    if (stage.reduced) return;
    const detail = stage.detail;
    const cats: Array<{ x: number; y: number; d: number }> = [];
    for (let c = 0; c < CELL_COUNT; c++) {
      if (!battle.units[c]) continue;
      const x = cellCenterX(c);
      const y = cellCenterY(c);
      cats.push({ x, y, d: (x - at.x) ** 2 + (y - at.y) ** 2 });
    }
    const n = chorusSize(cats.length, detail);
    // A lower quality tier gives the chorus to the cats nearest the capsule.
    if (n < cats.length) cats.sort((a, b) => a.d - b.d);
    for (let i = 0; i < n; i++) {
      const c = cats[i] as { x: number; y: number; d: number };
      stage.fx.ps.burst(CHORUS_HEART, c.x, c.y - 30);
      if (detail > 0) stage.fx.ps.burst(CHORUS_GLOW, c.x, c.y + FEET_DY - 6);
    }
  }

  private fireworks(x: number, y: number): void {
    const { stage } = this.env;
    if (stage.reduced) return;
    const d = stage.detail;
    stage.fx.ps.burst(FIREWORK, x, y - 6, { count: d === 0 ? 0.6 : 1 });
    stage.fx.ps.burst(FIREWORK_STAR, x, y - 6, { count: d === 0 ? 0.6 : 1 });
    stage.fx.shockwave(x, y, { color: Color.mustard, radius: 120 });
  }

  /** The promise fails: the shell opens empty, something small and funny floats out, and hearts come out instead. */
  private fallback(f: Flight, e: BattleEvents['capsuleOpen']): void {
    const { stage } = this.env;
    const art = (this.art ??= capsuleArt());
    const texture = f.kind === 'partner' ? art.question : f.kind === 'toy' ? art.hollowStar : f.kind === 'guardian' ? art.zzz : null;
    if (texture) this.glyph(texture, f.px, f.py - 14);
    this.hearts(f.px, f.py, heartsFor('fallback', e.purr, stage.detail));
    // The guardian's pile is bigger than a cat's whole share: a rain of hearts over the board.
    if (f.kind === 'guardian' && !stage.reduced) {
      stage.fx.ps.burst(HEART_RAIN, BOARD_X + BOARD_W / 2, BOARD_Y - 10, { count: [4, 8, 12][stage.detail] as number });
    }
  }

  private glyph(texture: Texture, x: number, y: number): void {
    const g = this.takeBit(this.glyphs, GLYPHS, () => new Glyph(this.front));
    this.under(g.sprite);
    g.start(GLYPH);
    g.sprite.texture = texture;
    g.x = x;
    g.y = y;
    g.sway = x % 2 < 1 ? 1 : -1;
    g.sprite.visible = true;
  }

  /** A beam from the lid of `f` to a tile (`colors` has one colour, or the four of the rainbow). */
  private beam(f: Flight, cell: number, colors: readonly number[], wait: number): void {
    const b = this.takeBit(this.beams, BEAMS, () => new Beam(this.front, fxTex('beam').texture));
    this.under(b.root);
    b.start(BEAM, wait);
    b.x0 = f.px;
    b.y0 = f.py;
    b.x1 = cellCenterX(cell);
    b.y1 = cellCenterY(cell) - 8;
    b.colors = colors;
    b.root.visible = true;
    this.dressBeam(b, 0);
  }

  /** The two paw prints stamped between the original and its new twin, as the twin lands. */
  private stampPaws(origin: number, cell: number): void {
    const x0 = cellCenterX(origin);
    const y0 = cellCenterY(origin) - 6;
    const x1 = cellCenterX(cell);
    const y1 = cellCenterY(cell) - 6;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const turn = Math.atan2(dy, dx) + Math.PI / 2;
    const land = this.env.stage.reduced ? 0 : 0.32;
    for (let i = 0; i < 2; i++) {
      const s = this.takeBit(this.stamps, STAMPS, () => new Stamp(this.front, fxTex('paw').texture));
      this.under(s.sprite);
      s.start(STAMP, land + i * PAW_LATE);
      s.sprite.position.set(mx + nx * PAW_GAP * (i === 0 ? -1 : 1), my + ny * PAW_GAP * (i === 0 ? -1 : 1) - i * 2);
      s.sprite.rotation = turn + (i === 0 ? -0.18 : 0.18);
      s.sprite.tint = darken(capsuleLook('partner').hue, 0.18);
      s.sprite.visible = false;
    }
  }

  // ── the promotion ──

  private onPromote(e: BattleEvents['promote']): void {
    const p = this.promoting;
    if (!p || p.cell !== e.cell) return;
    this.promoting = null;
    const s = this.takeBit(this.swells, SWELLS, () => new Swell(this.front, fxTex('starburst').texture));
    this.under(s.root);
    s.start(SWELL, this.env.stage.reduced ? 0 : 0.1);
    s.burstDone = false;
    s.oldId = e.from.id;
    s.newId = e.result.id;
    s.x = cellCenterX(e.cell);
    s.y = cellCenterY(e.cell) + FEET_DY;
    for (const [sprite, id] of [[s.oldCat, s.oldId], [s.newCat, s.newId]] as const) {
      sprite.texture = tex(`unit_${id}`);
      sprite.scale.set(unitSpriteScale(id, Math.max(1, sprite.texture.height)));
    }
    s.root.visible = true;
    this.poseSwell(s, 0);
  }

  // ── the pop-up line ──

  private pop(f: Flight, line: LineId, purr: number): void {
    const p = this.takeBit(this.pops, POPS, () => new Pop(this.env.ctx.layers.numbers, CLASS_COLOR[unitClass(f.unitId)]));
    p.start(POP);
    p.cry.setText(t(`sp.capsule.${line}.a`, { n: purr }));
    const two = LINE_HAS_B[line];
    p.sub.visible = two;
    if (two) p.sub.setText(t(`sp.capsule.${line}.b`, { n: purr }));
    const wCry = p.cry.uiBox.w;
    const hCry = p.cry.uiBox.h - 5;
    const wSub = two ? p.sub.uiBox.w : 0;
    const hSub = two ? p.sub.uiBox.h - 5 : 0;
    const w = Math.max(wCry, wSub);
    const h = hCry + (two ? hSub + 3 : 0);
    // The line stands above the capsule's own show (the lid, the bits, the hearts, the little glyph): lifted by the capsule's height where the board has the room (a cat in the first row keeps it on its own body).
    const natural = bubbleSpot(f.cell, w, h, 0);
    const highest = BOARD_Y + 4 + (TAIL + h + 2) * 1.1 + 12;
    const lift = Math.max(0, Math.min(POP_LIFT, natural.tipY - highest));
    const at = lift > 0 ? bubbleSpot(f.cell, w, h, lift) : natural;
    // The cry on top, the smaller line under it, then the tail that points at the cat (the name bubble's own proportions).
    const base = -(TAIL + 1);
    p.sub.position.set(at.dx, base - hSub / 2 - 1);
    p.cry.position.set(at.dx, base - (two ? hSub + 3 : 0) - hCry / 2 - 1);
    p.tail.clear();
    p.tail.poly([-10, 0, 10, 0, 0, TAIL]).fill(CLASS_COLOR[unitClass(f.unitId)]);
    p.tail.position.set(0, base);
    p.root.position.set(at.tipX, at.tipY);
    p.y = at.tipY;
    p.root.alpha = 0;
    p.root.scale.set(0);
    p.root.visible = true;
  }

  // ── rings ──

  private startSprings(f: Flight): void {
    const { battle } = this.env;
    for (const uid of f.held) {
      const u = battle.units.find((x) => x && x.uid === uid);
      if (!u) {
        releaseRing(uid);
        continue;
      }
      this.springs.push({ uid, to: u.sp, age: new Age(), real: false });
    }
    f.held = [];
  }

  // ── the frame ──

  update(dt: number, battleDt: number): void {
    const { stage, battle } = this.env;
    const calm = stage.reduced;
    let guardianK = -1;
    for (const f of this.flights) {
      if (!f.on) continue;
      if (f.openEv) {
        f.openIn -= dt;
        if (f.openIn <= 0) {
          const ev = f.openEv;
          f.openEv = null;
          this.openUp(f, ev);
        }
      }
      f.age.tick(f.real ? dt : battleDt, dt);
      if (f.state === 'air') {
        const k = (battle.time - f.at) / f.openDelay;
        if (battle.time > f.opens + GRACE) {
          this.retire(f);
          continue;
        }
        if (f.kind === 'guardian') guardianK = Math.max(guardianK, Math.min(1, Math.max(0, k)));
        this.sounds(f, k);
        this.place(f, k);
      } else if (f.state === 'roll') {
        if (f.age.k(ROLL[0], ROLL[1]) >= 1) {
          f.state = 'wait';
          f.age.reset();
        }
        this.place(f);
      } else if (f.state === 'wait') {
        if (battle.time > f.opens + GRACE) {
          this.retire(f);
          continue;
        }
        this.place(f);
      } else if (f.state === 'open') {
        if (f.age.k(f.life, f.floor) >= 1) {
          this.finish(f);
          continue;
        }
        this.place(f);
      } else if (f.state === 'gone') {
        // The shell of a One More! that has opened: only its record is left, waiting for the small capsule's opening (which may never come).
        if (f.stage !== 'inside' || battle.time > f.opens + f.moreDelay + GRACE) f.on = false;
      }
    }

    this.tickBits(this.beams, battleDt, dt, this.paintBeam);
    this.tickBits(this.stamps, battleDt, dt, this.paintStamp);
    this.tickBits(this.glyphs, battleDt, dt, this.paintGlyph);
    this.tickBits(this.swells, battleDt, dt, this.paintSwell);
    this.tickBits(this.pops, battleDt, dt, this.paintPop);
    this.tickSprings(battleDt, dt);
    this.drawWash(guardianK, calm);
  }

  /** The sounds of a falling capsule: the thud of each landing. */
  private sounds(f: Flight, k: number): void {
    const { stage } = this.env;
    if (stage.reduced) return;
    const beat = BEATS[f.kind];
    const [a, b] = landings(beat);
    if (f.heard < 1 && k >= a) {
      f.heard = 1;
      stage.play(stage.rules.zone, 'place', 0.42, beat.thud, 0.03);
      stage.fx.ps.burst(DUST_PUFF, f.px, f.py + 30, { count: stage.detail === 0 ? 0.4 : 0.7, scale: 0.7 });
    }
    if (f.heard < 2 && k >= b) {
      f.heard = 2;
      stage.play(stage.rules.zone, 'place', 0.3, beat.thud * 1.18, 0.03);
    }
    // The toy trails glints on its way down.
    if (f.kind === 'toy' && k < a && stage.detail > 0 && Math.floor(k * 60) % 3 === 0) {
      stage.fx.ps.burst(GLINT, f.px, f.py, { colors: [Hue.sun, Color.mustard] });
    }
  }

  /** Pose a capsule's pieces for this frame (a falling one at `k`; the others from their own ages). */
  private place(f: Flight, k = 0): void {
    const { stage } = this.env;
    const calm = stage.reduced;
    const pose = f.pose;
    let scale = 1;
    let alpha = 1;
    const lid = f.lid;
    const base = f.base;
    switch (f.state) {
      case 'air': {
        if (calm) {
          pose.dx = pose.dy = pose.rot = 0;
          pose.sx = pose.sy = 1;
          alpha = Math.min(1, Math.max(0, k * 4));
        } else fallPose(BEATS[f.kind], k, pose);
        f.px = f.restX + pose.dx;
        f.py = f.restY + pose.dy;
        break;
      }
      case 'roll': {
        const r = rollPose(f.age.k(ROLL[0], ROLL[1]), f.rollDir, pose);
        if (calm) {
          pose.dx = f.rollDir * ROLL_DIST;
          pose.dy = 14;
          pose.rot = 0;
          pose.sx = pose.sy = 1;
        }
        scale = SMALL_SCALE * r.sx;
        pose.sx = pose.sy = 1;
        f.px = f.restX + pose.dx;
        f.py = f.restY + pose.dy;
        break;
      }
      case 'wait': {
        pose.dx = f.rollDir * ROLL_DIST;
        pose.dy = 14;
        pose.sx = pose.sy = 1;
        pose.rot = calm ? 0 : waitRock(f.age.battle, f.moreDelay - ROLL[0]);
        scale = SMALL_SCALE;
        f.px = f.restX + pose.dx;
        f.py = f.restY + pose.dy;
        break;
      }
      default: {
        // Open: the lid springs off, the base settles; where the capsule WAS stays the middle.
        const k2 = f.age.k(f.life, f.floor);
        const small = f.small;
        const rest = f.small ? { dx: f.rollDir * ROLL_DIST, dy: 14 } : { dx: 0, dy: 0 };
        scale = small ? SMALL_SCALE : 1;
        pose.dx = rest.dx;
        pose.dy = rest.dy;
        pose.sx = pose.sy = 1;
        pose.rot = 0;
        f.px = f.restX + pose.dx;
        f.py = f.restY + pose.dy;
        if (calm) {
          lid.alpha = 1 - k2;
          lid.position.set(0, 0);
          lid.rotation = 0;
          base.alpha = 1 - k2;
        } else {
          const lp = lidPose(k2, f.side, newPose());
          lid.position.set(lp.dx, lp.dy);
          lid.rotation = lp.rot;
          lid.scale.set(SHELL_K * lp.sx, SHELL_K * lp.sy);
          lid.alpha = lidAlpha(k2);
          const bp = basePose(k2, newPose());
          base.position.set(bp.dx, bp.dy);
          base.scale.set(SHELL_K * bp.sx, SHELL_K * bp.sy);
          base.alpha = baseAlpha(k2);
        }
        break;
      }
    }
    f.root.position.set(f.px, f.py);
    f.root.rotation = pose.rot;
    f.root.scale.set(scale * pose.sx, scale * pose.sy);
    f.root.alpha = alpha;
  }

  /** The picture of a capsule is done and goes. A One More! stays on the books (invisible) until its small capsule has opened. */
  private finish(f: Flight): void {
    f.openEv = null;
    f.on = f.stage === 'inside';
    f.state = 'gone';
    f.root.visible = false;
  }

  /** A capsule whose opening never came goes quietly. */
  private retire(f: Flight): void {
    for (const uid of f.held) releaseRing(uid);
    f.held = [];
    f.openEv = null;
    f.on = false;
    f.state = 'gone';
    f.root.visible = false;
    if (f.child) f.child.on = false;
  }

  // ── the small pieces ──

  /** Age the pieces of a pool by the battle's clock with a floor in real time (their own real clock when they say so) and draw them. */
  private tickBits<T extends Bit>(pool: readonly T[], battleDt: number, dt: number, draw: (b: T, k: number) => void): void {
    for (const b of pool) {
      if (!b.on) continue;
      if (b.wait > 0) {
        b.wait -= b.real ? dt : battleDt;
        if (b.wait > 0) continue;
        b.wait = 0;
        b.age.reset();
      }
      b.age.tick(b.real ? dt : battleDt, dt);
      const k = b.age.k(b.life, b.floor);
      if (k >= 1) {
        b.hide();
        continue;
      }
      draw(b, k);
    }
  }

  private dressBeam(b: Beam, k: number): void {
    const dx = b.x1 - b.x0;
    const dy = b.y1 - b.y0;
    const len = Math.max(20, Math.hypot(dx, dy));
    // It grows from the lid to the tile in the first third, holds, and fades.
    const grow = Ease.cubicOut(Math.min(1, k / 0.35));
    const alpha = (k < 0.55 ? 1 : Math.max(0, 1 - (k - 0.55) / 0.45)) * 0.78;
    const turn = Math.atan2(dy, dx) + Math.PI / 2;
    const nx = -dy / Math.max(1, Math.hypot(dx, dy));
    const ny = dx / Math.max(1, Math.hypot(dx, dy));
    const n = b.colors.length;
    const thick = (n > 1 ? 15 : 34) * (1 - 0.25 * k);
    for (let i = 0; i < b.lanes.length; i++) {
      const s = b.lanes[i] as Sprite;
      if (i >= n) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      const off = (i - (n - 1) / 2) * (thick + 1);
      const l = len * grow;
      s.position.set(b.x0 + (dx * grow) / 2 + nx * off, b.y0 + (dy * grow) / 2 + ny * off);
      s.rotation = turn;
      s.scale.set(thick / 64, l / 256);
      s.tint = b.colors[i] as number;
      s.alpha = alpha;
    }
    b.root.visible = true;
  }

  private readonly paintBeam = (b: Beam, k: number): void => this.dressBeam(b, k);
  private readonly paintStamp = (s: Stamp, k: number): void => this.poseStamp(s, k, this.env.stage.reduced);
  private readonly paintGlyph = (g: Glyph, k: number): void => this.poseGlyph(g, k, this.env.stage.reduced);
  private readonly paintSwell = (s: Swell, k: number): void => this.poseSwell(s, k);
  private readonly paintPop = (p: Pop, k: number): void => this.posePop(p, k, this.env.stage.reduced);

  private poseStamp(s: Stamp, k: number, calm: boolean): void {
    const pop = calm ? 1 : Ease.backOut(Math.min(1, k / 0.12));
    s.sprite.visible = true;
    s.sprite.scale.set(0.44 * (calm ? 1 : 1.9 - 0.9 * pop));
    s.sprite.alpha = k < 0.7 ? 0.95 : Math.max(0, 1 - (k - 0.7) / 0.3);
  }

  private poseGlyph(g: Glyph, k: number, calm: boolean): void {
    g.sprite.visible = true;
    const rise = calm ? 0 : 46 * Ease.cubicOut(k);
    g.sprite.position.set(g.x + (calm ? 0 : g.sway * 8 * Math.sin(k * 7)), g.y - rise);
    g.sprite.scale.set((calm ? 1 : Ease.backOut(Math.min(1, k / 0.2))) * 0.95);
    g.sprite.rotation = calm ? 0 : g.sway * 0.18 * Math.sin(k * 9);
    g.sprite.alpha = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
  }

  /** The swell: the old sticker grows and wobbles, bursts, and the next rank pops out of it. */
  private poseSwell(s: Swell, k: number): void {
    const calm = this.env.stage.reduced;
    const burstAt = 0.5;
    s.root.position.set(s.x, s.y);
    const burst = k >= burstAt;
    s.oldCat.visible = !burst;
    s.newCat.visible = burst;
    s.flash.visible = burst && k < burstAt + 0.28;
    if (!burst) {
      const u = k / burstAt;
      const grow = calm ? 1 : 1 + 0.26 * Ease.sineIn(u);
      const wob = calm ? 0 : 0.05 * Math.sin(u * 18) * u;
      s.oldCat.scale.set(unitSpriteScale(s.oldId, Math.max(1, s.oldCat.texture.height)) * grow * (1 + wob), unitSpriteScale(s.oldId, Math.max(1, s.oldCat.texture.height)) * grow * (1 - wob));
      s.oldCat.alpha = 1;
    } else {
      const u = (k - burstAt) / (1 - burstAt);
      const pop = calm ? 1 : Ease.backOut(Math.min(1, u / 0.5));
      const base = unitSpriteScale(s.newId, Math.max(1, s.newCat.texture.height));
      s.newCat.scale.set(base * (calm ? 1 : 0.7 + 0.3 * pop) * (1 + (calm ? 0 : 0.28 * (1 - Math.min(1, u * 2.4)))));
      s.newCat.alpha = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
      const fu = (k - burstAt) / 0.28;
      s.flash.position.set(0, -44);
      s.flash.scale.set((calm ? 0.5 : 0.55 + 1.3 * Ease.cubicOut(fu)) * 0.9);
      s.flash.alpha = 1 - fu;
      if (!s.burstDone) {
        s.burstDone = true;
        const { stage } = this.env;
        const rank = unitRarity(s.newId);
        const hue = rank === 'mythic' ? Color.coral : Color.mustard;
        stage.fx.shockwave(s.x, s.y - 40, { color: hue, radius: 110 });
        if (!calm) stage.fx.ps.burst(SPARKLE_UP, s.x, s.y - 40, { colors: [W, hue], count: 1.4, scale: 1.1 });
        stage.play(stage.rules.ui, 'level_up', 0.4, 1.2, 0.02);
      }
    }
    s.root.alpha = 1;
  }

  private posePop(p: Pop, k: number, calm: boolean): void {
    const pop = calm ? 1 : Ease.backOut(Math.min(1, k / 0.14));
    p.root.scale.set(Math.max(0.001, pop));
    p.root.alpha = k > 0.78 ? (1 - k) / 0.22 : Math.min(1, k / 0.07);
    p.root.position.y = p.y - (calm ? 0 : 12 * Ease.cubicOut(k));
  }

  private tickSprings(battleDt: number, dt: number): void {
    for (let i = this.springs.length - 1; i >= 0; i--) {
      const s = this.springs[i] as Spring;
      s.age.tick(battleDt, dt);
      const k = s.age.k(SPRING[0], SPRING[1]);
      if (k >= 1) {
        releaseRing(s.uid);
        this.springs.splice(i, 1);
        continue;
      }
      holdRing(s.uid, this.env.stage.reduced ? s.to : springValue(k, s.to));
    }
  }

  /** The bands of colour that wash the board while a guardian capsule falls (under the cats). */
  private drawWash(k: number, calm: boolean): void {
    if (calm || k < 0) {
      if (this.wash && this.wash.visible) this.wash.visible = false;
      return;
    }
    if (!this.wash) {
      const g = new Graphics();
      const h = BOARD_H / RAINBOW.length;
      RAINBOW.forEach((c, i) => g.rect(BOARD_X, BOARD_Y + i * h, BOARD_W, h + 1).fill(c));
      g.eventMode = 'none';
      this.back.addChild(g);
      this.wash = g;
    }
    this.wash.visible = true;
    this.wash.alpha = WASH_ALPHA * Math.sin(Math.PI * Math.min(1, k));
  }

  // ── pools ──

  private takeFlight(): Flight {
    for (const f of this.flights) if (!f.on) return f;
    if (this.flights.length >= FLIGHTS) {
      let oldest = this.flights[0] as Flight;
      for (const f of this.flights) if (f.seq < oldest.seq) oldest = f;
      this.retire(oldest);
      return oldest;
    }
    const f = new Flight((this.art ??= capsuleArt()));
    this.under(f.root);
    this.flights.push(f);
    return f;
  }

  private takeBit<T extends Bit>(pool: T[], cap: number, make: () => T): T {
    let oldest: T | null = null;
    for (const b of pool) {
      if (!b.on) return b;
      if (!oldest || b.age.real > oldest.age.real) oldest = b;
    }
    if (pool.length < cap || !oldest) {
      const b = make();
      pool.push(b);
      return b;
    }
    oldest.hide();
    return oldest;
  }

  /** Put a picture of this scene just above the star archer's night (when it is there) and under the particles and numbers of the front layer. */
  private under(node: Container | Sprite): void {
    const night = this.front.getChildByLabel(NIGHT_LABEL);
    if (node.parent !== this.front) this.front.addChild(node);
    this.front.setChildIndex(node, night ? this.front.getChildIndex(night) + 1 : 0);
  }

  clear(): void {
    for (const f of this.flights) {
      for (const uid of f.held) releaseRing(uid);
      f.held = [];
      f.openEv = null;
      f.on = false;
      f.state = 'gone';
      f.stage = 'done';
      f.root.visible = false;
      f.child = null;
    }
    for (const s of this.springs) releaseRing(s.uid);
    this.springs.length = 0;
    for (const pool of [this.beams, this.stamps, this.glyphs, this.swells, this.pops] as Array<Bit[]>) for (const b of pool) b.hide();
    this.promoting = null;
    if (this.wash) this.wash.visible = false;
  }

  destroy(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    this.clear();
    for (const f of this.flights) f.root.destroy({ children: true });
    this.flights.length = 0;
    for (const pool of [this.beams, this.stamps, this.glyphs, this.swells, this.pops] as Array<Bit[]>) {
      for (const b of pool) b.destroy();
      pool.length = 0;
    }
    this.wash?.destroy();
    this.wash = null;
  }

  /** What is on the screen right now (QA and tests): plain data. */
  live(): {
    flights: Array<{ kind: SpCapsuleKind; small: boolean; state: State; stage: string; x: number; y: number; scale: number; rot: number }>;
    beams: number;
    stamps: number;
    glyphs: number;
    swells: number;
    pops: number;
    springs: number;
    wash: number;
  } {
    const alive = (pool: readonly Bit[]): number => pool.filter((b) => b.on).length;
    return {
      flights: this.flights
        .filter((f) => f.on && f.state !== 'gone')
        .map((f) => ({ kind: f.kind, small: f.small, state: f.state, stage: f.stage, x: f.px, y: f.py, scale: f.root.scale.x, rot: f.root.rotation })),
      beams: alive(this.beams),
      stamps: alive(this.stamps),
      glyphs: alive(this.glyphs),
      swells: alive(this.swells),
      pops: alive(this.pops),
      springs: this.springs.length,
      wash: this.wash && this.wash.visible ? this.wash.alpha : 0,
    };
  }
}

export const makeCapsule: SpSceneFactory<'capsule'> = (env) => new CapsuleScene(env);
