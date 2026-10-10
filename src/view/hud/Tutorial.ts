/**
 * The tutorial run's lessons on screen. The plan is tutorialScript.ts; this turns what it says into paper: a spotlight on the
 * control or the board feature being taught (with a flat starburst when a control arrives), a hand showing the gesture, a note with
 * the topic's picture and one or two short lines, a cheerful sticker and confetti when the player has done it, and a "skip" button
 * in the top right. A lesson holds the clock for as long as it waits for the player (a tap on a control, or a gesture on the field,
 * which the field takes while only a lesson holds the clock: `BattleContext.lessonHold`), and every hold is released when the
 * lesson ends, is skipped or is destroyed.
 *
 * The note and the paw are laid ONCE for a place the target has come to rest at (spotMath.ts `SpotSettle`): the lit window follows
 * a target that is still arriving, but the note is not rebuilt and the paw does not start over each time it moves.
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { CLASS_IDS, type UnitId } from '@/game';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { topicTeach, type TopicId } from '@/guide';
import { Button, Color, confirmDialog, Dim, drawDashedRect, motion, paperSeed, toast, TweenBag } from '@/ui';
import type { BattleLayout } from '../context';
import { info } from '../info';
import type { EnvImpl } from './env';
import { Hand } from './Hand';
import { cheerSpot, STICKER_WALL, topKeep } from './cheerMath';
import { bestRimPose, dragPrefer, FROM_BELOW, iconSpots, type Keep, pawBounds, type PawPose, placePaw, rimSpots, soften, tipSpot } from './handMath';
import { unitPortrait } from './kit';
import { LessonBubble } from './LessonBubble';
import { LessonFx } from './LessonFx';
import { bottomRects, laserFace, LASER_SPOT, type Point, type Rect, SKIP_FACE, SKIP_H, SKIP_W, skipRect, spotRadius, spotWindow, topRects } from './layoutMath';
import { findTwins } from './planMath';
import { firstCat, kingCell, shadeCat, sunLanding, twinPair, weakestCat } from './pawTarget';
import { REVEAL_KEYS, type RevealKey } from './policy';
import { MEASURE_EVERY, SpotSettle, windowMoved } from './spotMath';
import { FIRST_SUMMON_AFTER, NUDGE_FOR, nudgeDue } from './tutorialFlow';
import {
  emptyCounts, HOLD_LIMIT, STEP_IDS, TUTORIAL_SUMMONS, TutorialScript, type CountKey, type ScriptEvent, type StepDef, type Target, type World,
} from './tutorialScript';

/** How long the clock runs after a summon tap so the new kitten can pop in before the next prompt. */
const BREATH = 0.75;
const MARGIN = 18;
const HOLE_GRID = 12;
/** Corner of a window that is not round. */
const HOLE_CORNER = 32;
/** The nudge's bubble lies over the summon button: the paw keeps off this much of the space above it. */
const NUDGE_ROOM = 130;
/** Key of the nudge's own bubble (src/view/info.ts). */
const NUDGE = 'nudge';
const NOTE_W = 620;
const NOTE_TILE = 92;
/** Seconds a lesson may wait for the thing it points at to appear before it is dropped. */
const UNSEEN_LIMIT = 6;
/** Seconds the clock runs after the awakening so the guardian can arrive on screen before the next lesson holds it again. */
const AWAKEN_BREATH = 1.6;

/** What the HUD lends the tutorial: where its controls are and the summon button's breathing. */
export interface TutorialHost {
  /** Scene-space rectangle of a control or of the top-row feature a target names; null when it is not on screen. */
  rectOf(target: Target): Rect | null;
  /** The control a revealed key brings in, as a rectangle (for the starburst); null for keys without a place of their own. */
  rectOfReveal(key: RevealKey): Rect | null;
  pulse(on: boolean): void;
  /** What a paw should keep off where it can: the cats, the buttons and the lane (weighed, the HUD's list for its bubbles). */
  keepClear(): readonly Keep[];
  /** The laser's guided first use has been done (it runs on its own, see LaserGuide.ts). */
  laserGuided(): boolean;
  /** The guided first use waits for a touch (the button, then the lane): the lesson holds the clock meanwhile. */
  laserHolds(): boolean;
  /** The guided first use of the laser should run now. */
  startLaserGuide(): void;
  /** What the "nice!" sticker must keep off, weighed for it: controls and writing first, then cats, the lane last. */
  stickerKeep(): readonly Keep[];
  /** The column the summon result chips use above the summon button (scene space): a sticker keeps off it. */
  chipColumn(): Rect;
  /** The rectangles of the writing on the control a target names (scene space): the paw keeps its body off them. */
  labelsOf(target: Target): Rect[];
  /** Where the controls that `keys` bring in will rest (scene space), whether they are out yet or not: the sticker keeps off them. */
  restingRects(keys: readonly RevealKey[]): Rect[];
}

const NO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };

export class Tutorial {
  readonly script: TutorialScript;
  private readonly counts = emptyCounts();
  private readonly world: World;
  private readonly board: Array<UnitId | null> = new Array<UnitId | null>(CELL_COUNT).fill(null);
  private readonly layer = new Container();
  private readonly dim = new Graphics();
  private readonly ring = new Graphics();
  private readonly blockers: Container[] = [];
  private readonly hand = new Hand();
  private readonly nudgeHand = new Hand();
  /** An invisible patch laid on the summon button, which the nudge's bubble points at (a bubble needs something with a size to point at). */
  private readonly nudgeMark = new Graphics();
  private readonly noteLayer = new Container();
  private readonly note: LessonBubble;
  private readonly fx: LessonFx;
  private readonly skipLayer = new Container();
  private readonly skipBtn: Button;
  private readonly bag = new TweenBag();
  private readonly seed = paperSeed();
  private layout: BattleLayout;
  private held = false;
  private skipAsked = false;
  private skipped: boolean;
  private breath = 0;
  private measure = 0;
  /** Decides when the note and the paw are laid for the place the target has come to rest at. */
  private readonly settle = new SpotSettle();
  /** What the note says, and what the paw points at, as last laid: a change of either lays it again. */
  private noteLook = '';
  private pawLook = '';
  /** Whether the dim blocks the touches outside the window, as last drawn. */
  private blockingNow = false;
  private carrying = false;
  /** Whether the lesson on screen has a paw to show (it comes back after the player's own drag only then). */
  private handOn = false;
  private idle = 0;
  private nudgeLeft = 0;
  private nudges = 0;
  private rect: Rect = NO_RECT;
  /** The spotlight's window as last drawn. */
  private hole: Rect = NO_RECT;
  private pair: [number, number] | null = null;
  private cat = -1;
  private sunTo = -1;
  /** What the paw pointed at the last time, kept while it still fits (pawTarget.ts): a cat that arrives elsewhere does not pull it across the board. */
  private lastPair: [number, number] | null = null;
  private lastCat = -1;
  private lastSunCat = -1;
  private lastSunTo = -1;
  private lastTarget: Target | '' = '';
  private releaseDialog: (() => void) | null = null;
  /** Whether the speed button was out when the skip button was last placed: it takes its place beside the speed button then. */
  private speedSeen = false;
  /** Lessons still to come that are worth a skip button (the last one, the boss, is a note with its own "got it"). */
  private left = 0;
  private twinsClock = 0;
  private twinsKnown = false;
  private unseen = 0;
  private heldFor = 0;
  private destroyed = false;
  /** The lesson that has just been done and has a sticker coming (placed at the end of the frame's events). */
  private cheerFor: StepDef | null = null;

  constructor(
    private readonly env: EnvImpl,
    private readonly host: TutorialHost,
    skipped: boolean,
  ) {
    this.layout = env.layout();
    this.skipped = skipped;
    this.script = new TutorialScript(new Set(STEP_IDS.filter((id) => env.progress.isTaught(id))));
    if (skipped) this.script.stop();
    this.countLeft();
    this.world = {
      phase: 'prep', wave: 0, waveKind: 'normal', pending: null, busy: false, cats: 0, empties: CELL_COUNT, twins: false, enemies: 0, targetAlive: false,
      fish: 0, purr: 0, moltCost: 1, gradeCost: -1, classCost: -1, maxTier: 0, sun: 0, laserReady: false, laserGuided: false, laserHold: false, callBonus: -1, selected: false,
      king: false, kingSelected: false, counts: this.counts,
    };

    const parent = env.ctx.layers.overlay;
    this.dim.eventMode = 'none';
    this.ring.eventMode = 'none';
    for (let i = 0; i < 4; i++) {
      const b = new Container();
      b.eventMode = 'static';
      b.visible = false;
      this.blockers.push(b);
    }
    this.layer.addChild(this.dim, ...this.blockers, this.ring, this.hand);
    this.layer.visible = false;
    this.nudgeHand.visible = false;
    this.nudgeMark.eventMode = 'none';
    this.note = new LessonBubble(env, this.noteLayer);
    // From the back: the dim and the hand, the celebrations (they show through the window and over the dim), the note, the nudge.
    parent.addChild(this.layer);
    this.fx = new LessonFx(parent);
    parent.addChild(this.noteLayer, this.nudgeMark, this.nudgeHand);

    this.skipBtn = new Button({ label: t('guide.skip'), style: 'kraft', width: SKIP_W, height: SKIP_FACE, fontSize: 24, radius: 10, sfx: 'ui_click' });
    // The paper is as tall as the speed button next to it; the touch target is the full 88 px.
    this.skipBtn.hitArea = new Rectangle(-SKIP_W / 2, -SKIP_H / 2, SKIP_W, SKIP_H);
    this.skipBtn.onTap(() => void this.askSkip());
    this.skipLayer.addChild(this.skipBtn);
    parent.addChild(this.skipLayer);
    this.showSkip(!skipped);

    this.listen();
    env.lessonOf = () => this.script.active?.id ?? null;
    env.noteTo = (key) => this.bump(key);
  }

  // ───────────────────────── what the player does ─────────────────────────

  private bump(key: CountKey): void {
    this.counts[key]++;
  }

  private listen(): void {
    const { env } = this;
    const b = env.battle;
    env.on(b.events, 'summon', ({ source }) => {
      // The scripted free summons arrive as 'script', the button's own as 'button'; both are the player's taps.
      if (source === 'button' || source === 'script') {
        this.bump('summon');
        if (this.script.active?.id === 'summon') this.breath = BREATH;
      } else if (source === 'choice') {
        this.bump('pick');
      }
      this.idle = 0;
      this.endNudge();
    });
    env.on(b.events, 'merge', () => this.bump('merge'));
    env.on(b.events, 'molt', () => this.bump('molt'));
    env.on(b.events, 'sell', () => this.bump('sell'));
    env.on(b.events, 'upgrade', ({ kind }) => this.bump(kind === 'summon' ? 'gradeUp' : 'classUp'));
    env.on(b.events, 'waveEnd', ({ called }) => {
      if (called) this.bump('call');
    });
    env.on(b.events, 'relicGain', () => this.bump('relic'));
    env.on(b.events, 'awaken', () => this.bump('awaken'));
    env.on(b.events, 'purr', ({ delta, reason }) => {
      if (delta > 0 && reason !== 'start') this.bump('purrGain');
    });
    // A cat that lands on a special cell is what the sun lesson asks for.
    const landed = (cell: number): void => {
      if (b.sunbeams.includes(cell)) this.bump('sunMove');
    };
    env.on(b.events, 'move', ({ to }) => landed(to));
    env.on(b.events, 'swap', ({ a, b: other }) => {
      landed(a.cell);
      landed(other.cell);
    });
    env.on(env.ctx.events, 'speed', () => this.bump('speed'));
    // While the player holds a cat the hand would sit on what they are carrying: it steps out of the way.
    env.on(env.ctx.events, 'drag', ({ from }) => {
      this.carrying = from !== null;
      this.hand.visible = !this.carrying && this.handOn;
      if (this.carrying) this.endNudge();
    });
  }

  // ───────────────────────── the world, as the script sees it ─────────────────────────

  private fill(): World {
    const { battle: b, ctx } = this.env;
    const w = this.world;
    w.phase = b.phase;
    w.wave = b.wave;
    w.waveKind = b.waveKind;
    w.pending = b.pending ? b.pending.kind : null;
    w.busy = this.env.modalCount > 0;
    let cats = 0;
    for (let i = 0; i < CELL_COUNT; i++) {
      const u = b.units[i];
      this.board[i] = u ? u.id : null;
      if (u) cats++;
    }
    w.cats = cats;
    w.empties = CELL_COUNT - cats;
    w.enemies = b.enemyCount;
    w.targetAlive = b.boss !== null;
    w.fish = b.fish;
    w.purr = b.purr;
    w.moltCost = b.moltCost();
    w.gradeCost = b.summonGradeCost();
    let classCost = -1;
    let tier = 0;
    for (const c of CLASS_IDS) {
      const cost = b.classUpgradeCost(c);
      if (cost >= 0 && (classCost < 0 || cost < classCost)) classCost = cost;
      tier = Math.max(tier, b.synergyTier(c));
    }
    w.classCost = classCost;
    w.maxTier = tier;
    w.sun = b.sunbeams.length;
    w.laserReady = !b.laser.active && b.laser.cooldown <= 0;
    w.laserGuided = this.host.laserGuided();
    w.laserHold = this.host.laserHolds();
    w.callBonus = b.callBonus();
    w.selected = ctx.selected !== null;
    const king = kingCell(b.units, (c) => b.canAwaken(c) === null, ctx.selected ?? -1);
    w.king = king >= 0;
    w.kingSelected = king >= 0 && ctx.selected === king;
    return w;
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number): void {
    if (this.destroyed) return;
    this.fx.update(dt);
    // Once the run is decided only the staging is left: the lessons put everything away and let go of the clock.
    if (this.env.battle.phase === 'won' || this.env.battle.phase === 'lost') {
      this.endVisuals();
      this.showSkip(false);
      return;
    }
    if (this.skipped || this.script.finished) {
      this.afterLessons(dt);
      return;
    }
    const w = this.fill();
    this.twinsClock -= dt;
    if (this.twinsClock <= 0) {
      this.twinsClock = MEASURE_EVERY;
      this.twinsKnown = findTwins(this.env.battle.units) !== null;
    }
    w.twins = this.twinsKnown;
    this.breath = Math.max(0, this.breath - dt);
    const heldByOthers = this.env.ctx.paused && !this.held;
    const events = this.script.update(w, dt, heldByOthers);
    for (let i = 0; i < events.length; i++) this.handle(events[i] as ScriptEvent);
    // The sticker is placed once the next lesson's controls have arrived (they are in the same batch): it lands on none of them.
    if (this.cheerFor) {
      this.cheer(this.cheerFor, w);
      this.cheerFor = null;
    }
    this.tick(dt, w);
    // A lesson whose target never shows up (a control that stayed hidden) must not hold the run: it is dropped after a few seconds.
    if (this.script.active && this.rect.w <= 0 && !this.script.active.popup && this.script.active.id !== 'laser') {
      this.unseen += dt;
      if (this.unseen > UNSEEN_LIMIT) {
        const drop = this.script.abandon();
        if (drop) this.handle(drop);
      }
    } else {
      this.unseen = 0;
    }
  }

  private handle(e: ScriptEvent): void {
    const id = e.step.id;
    this.countLeft();
    this.heldFor = 0;
    if (e.kind === 'begin') {
      for (const key of e.step.reveal) this.arrive(key);
      if (id === 'laser') this.host.startLaserGuide();
      this.resetLook();
      this.lastTarget = '';
      this.measure = 0;
      return;
    }
    this.endVisuals();
    if (e.kind === 'done') {
      this.env.progress.markTaught(id);
      this.cheerFor = e.step;
      // The guardian arrives on the field's own time: the clock runs on for a moment before the next lesson may hold it again.
      if (id === 'awaken') this.breath = AWAKEN_BREATH;
    }
  }

  /** A control arrives: it pops in by itself (its own part), and a flat paper starburst opens behind it. */
  private arrive(key: RevealKey): void {
    this.env.showControl(key, true);
    const r = this.host.rectOfReveal(key);
    if (r) this.fx.arrive(r.x + r.w / 2, r.y + r.h / 2, Math.min(300, Math.max(r.w, r.h) * 2.2));
  }

  /**
   * The "nice!" sticker lands beside what the player has just used, on free paper: it keeps off the cats, the controls, the lane, the skip
   * button and the column the result chips use (cheerMath.ts). The next lesson's note waits until it has gone (`tick`), so it never lands
   * under a note either.
   */
  private cheer(step: StepDef, w: World): void {
    if (step.popup) return;
    const l = this.layout;
    const target = this.rect.w > 0 ? this.rect : null;
        // What the next lesson will bring in may arrive while the sticker is up: its place is kept free as well.
    const next = this.script.remaining.find((s) => s.id !== step.id);
    const coming = this.host.restingRects(next ? next.reveal : []).map((r) => ({ ...r, weight: STICKER_WALL }));
    const keep: Keep[] = [
      ...this.host.stickerKeep(),
      ...topKeep(l, { speed: this.env.reveal.speed, skip: this.skipLayer.visible, toys: this.env.battle.relics.length > 0 }),
      ...coming,
      { ...this.host.chipColumn(), weight: STICKER_WALL },
    ];
    const bounds: Rect = { x: 0, y: l.safeTop + 8, w: l.w, h: l.h - l.safeTop - l.safeBottom - 16 };
    this.fx.celebrate(t(`guide.cheer.${w.wave % 4}`), (cw, ch) => cheerSpot({ target, home: { x: l.w / 2, y: l.h * 0.4 }, w: cw, h: ch, bounds, keep }));
  }

  /** The spotlight, the hand and the note go away; the clock is released unless something else holds it. */
  private endVisuals(): void {
    this.resetLook();
    this.layer.visible = false;
    for (const b of this.blockers) b.visible = false;
    this.note.hide();
    this.hand.position.set(0, 0);
    this.handOn = false;
    this.host.pulse(false);
    this.setHold(false);
    this.breath = 0;
    info.close(true, NUDGE);
  }

  /** Nothing is laid: the next measurement of a target starts a new settling (the lit window is redrawn with it). */
  private resetLook(): void {
    this.settle.reset();
    this.noteLook = '';
    this.pawLook = '';
    this.hole = NO_RECT;
    this.blockingNow = false;
    this.lastPair = null;
    this.lastCat = -1;
    this.lastSunCat = -1;
    this.lastSunTo = -1;
  }

  private setHold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    this.env.ctx.setPaused('tutorial', on);
  }

  /**
   * The active lesson, drawn. What it points at is measured a few times a second (first, so the hold below goes by this frame's measurement);
   * `SpotSettle` says whether the note and the paw are laid now, or whether only the lit window follows a target that is still arriving.
   */
  private tick(dt: number, w: World): void {
    const step = this.script.active;
    this.placeSkipFor(step);
    if (!step) {
      this.setHold(false);
      this.nudge(dt, w);
      return;
    }
    this.endNudge();
    // A popup carries its own lesson, and the laser's guided first use is the laser's own.
    const away = step.popup || step.id === 'laser';
    // The next note waits for the sticker to go: the two never share the screen (nor with a popup, or a beat after a tap that must be seen).
    const hushed = w.busy || this.breath > 0 || this.fx.cheering;
    if (!away) {
      if (hushed) this.hush();
      else this.look(step, w, dt);
    } else if (step.id === 'laser') {
      // The guide draws its own spotlight and words; the lesson only needs to know the button is there for its hold.
      this.rect = this.host.rectOf('laser') ?? NO_RECT;
    }
    // The clock is held while the lesson waits for the player (and let go for a beat after a summon, so the new kitten can pop in).
    // A hold only makes sense while there is something on screen to point at, and never for ever, except for a note that waits for its
    // "got it" and has nothing else to wait for: a player who ignores an action lesson is let go.
    this.setHold(step.holds(w) && !step.popup && this.breath <= 0 && !this.skipAsked && this.rect.w > 0 && !this.script.relaxed);
    if (this.held) {
      this.heldFor += dt;
      if (this.heldFor > HOLD_LIMIT && !step.ok) this.script.relax();
    }
    if (away) {
      this.layer.visible = false;
      this.note.hide();
    }
  }

  /** The note, the window and the paw give way for a moment (a sticker, a popup, a tap that must be seen): laid again at the next measure of a target that has not moved. */
  private hush(): void {
    this.layer.visible = false;
    for (const b of this.blockers) b.visible = false;
    this.note.hide();
    this.hand.visible = false;
    this.handOn = false;
    this.hole = NO_RECT;
    this.noteLook = '';
    this.pawLook = '';
    this.blockingNow = false;
    this.settle.suspend();
    this.measure = 0;
  }

  /** Measure what the lesson points at (a few times a second) and draw what the measurement calls for. */
  private look(step: StepDef, w: World, dt: number): void {
    this.measure -= dt;
    const target = step.target(w);
    if (this.measure > 0 && target === this.lastTarget) {
      // The note was taken away by something else (the info bubble the player opened gave way to it, not the other way round): bring it back.
      if (!this.note.visible && this.settle.at !== null) this.settle.suspend();
      return;
    }
    this.measure = MEASURE_EVERY;
    this.lastTarget = target;
    this.aim(target);
    const hole = this.rect.w <= 0 ? NO_RECT : target === 'laser' ? spotWindow(this.rect, LASER_SPOT, 2, this.layout) : spotWindow(this.rect, MARGIN, HOLE_GRID, this.layout);
    const blocking = step.holds(w) && !step.popup && !this.script.relaxed;
    const text = this.textOf(step, w);
    const noteLook = `${step.id}|${text}|${this.layout.w}|${this.layout.h}`;
    const where = this.pair ? this.pair.join('-') : '';
    const pawLook = `${target}|${where}|${this.cat}|${this.sunTo}|${this.layout.w}|${this.layout.h}`;
    // The paw points at something else now (another target, another cat): it is taken away and laid again for the new spot.
    if (pawLook !== this.pawLook) {
      this.pawLook = pawLook;
      this.unpoint();
    }
    switch (this.settle.step(hole)) {
      case 'clear':
        this.clearSpot();
        break;
      case 'keep':
        break;
      case 'wait':
        this.drawWindow(hole, blocking);
        break;
      case 'follow':
        this.drawWindow(hole, blocking);
        if (noteLook !== this.noteLook) this.say(step, hole, text, noteLook);
        break;
      case 'lay':
        this.drawWindow(hole, blocking);
        this.host.pulse(step.id === 'summon');
        this.say(step, hole, text, noteLook);
        // The paw comes in after the note has found its place, so it can keep off it.
        this.placeHand(step, target);
        break;
    }
  }

  /** Find where `target` is now: its rectangle, and for a gesture the cells the hand works on. */
  private aim(target: Target): void {
    const b = this.env.battle;
    const ctx = this.env.ctx;
    this.pair = null;
    this.cat = -1;
    this.sunTo = -1;
    // The chips and the summon row give way to a selection sheet: a lesson that points at them closes it first.
    if ((target === 'chips' || target === 'summon' || target === 'grade' || target === 'call' || target === 'speed') && ctx.selected !== null) ctx.select(null);
    const cellRect = (cell: number): Rect => ({
      x: ctx.toSceneX(cellCenterX(cell)) - CELL_W / 2, y: ctx.toSceneY(cellCenterY(cell)) - CELL_H / 2, w: CELL_W, h: CELL_H,
    });
    if (target === 'pair') {
      this.pair = twinPair(b.units, this.lastPair);
      this.lastPair = this.pair;
      if (!this.pair) {
        this.rect = NO_RECT;
        return;
      }
      const a = cellRect(this.pair[0]);
      const c = cellRect(this.pair[1]);
      this.rect = unionOf(a, c);
    } else if (target === 'cat' || target === 'weakcat' || target === 'king') {
      this.cat = target === 'king' ? kingCell(b.units, (c) => b.canAwaken(c) === null, this.lastCat) : target === 'weakcat' ? weakestCat(b.units, this.lastCat) : firstCat(b.units);
      this.lastCat = this.cat;
      this.rect = this.cat >= 0 ? cellRect(this.cat) : NO_RECT;
    } else if (target === 'sun') {
      let box: Rect | null = null;
      for (const c of b.sunbeams) box = box ? unionOf(box, cellRect(c)) : cellRect(c);
      this.cat = shadeCat(b.units, (c) => b.units[c]?.sunlit === true, this.lastSunCat);
      this.sunTo = sunLanding(b.units, b.sunbeams, this.cat, this.lastSunTo);
      this.lastSunCat = this.cat;
      this.lastSunTo = this.sunTo;
      this.rect = box ?? NO_RECT;
      if (this.cat >= 0 && box) this.rect = unionOf(box, cellRect(this.cat));
    } else {
      this.rect = this.host.rectOf(target) ?? NO_RECT;
    }
  }

  /** What the note says: the topic's own line, with the lesson's count or the step it is on. */
  private textOf(step: StepDef, w: World): string {
    const base = topicTeach(step.id);
    if (step.id === 'summon') return `${base} ${t('guide.tut.count', { n: Math.min(this.counts.summon, TUTORIAL_SUMMONS), total: TUTORIAL_SUMMONS })}`;
    // The awakening: first the king is tapped, then the button; the cost is the game's own.
    if (step.id === 'awaken') return t(w.kingSelected ? 'hud.tut.awaken.go' : 'hud.tut.awaken.pick', { cost: this.env.battle.awakenCost() });
    return base;
  }

  /**
   * The warm-brown dim with a window cut out of it, the window edged with a dashed cream line like a cut-out. Drawn again only when the window
   * has moved or the dim's strength has changed (it follows a target that is still arriving); the line's own pulse is not restarted by it.
   */
  private drawWindow(hole: Rect, blocking: boolean): void {
    if (this.layer.visible && blocking === this.blockingNow && !windowMoved(this.hole, hole)) return;
    const W = this.layout.w;
    const H = this.layout.h;
    const first = !this.layer.visible || this.hole.w <= 0;
    this.hole = hole;
    this.blockingNow = blocking;
    this.layer.visible = hole.w > 0;
    const alpha = blocking ? Dim.backdropAlpha : Dim.backdropAlpha * 0.7;
    this.dim.clear().rect(0, 0, W, H).fill({ color: Dim.backdrop, alpha });
    this.ring.clear();
    if (hole.w > 0) {
      const corner = spotRadius(hole, HOLE_CORNER);
      this.dim.roundRect(hole.x, hole.y, hole.w, hole.h, corner).cut();
      drawDashedRect(this.ring, hole.x, hole.y, hole.w, hole.h, { radius: corner, color: Color.paper, width: 5, seed: this.seed });
      if (first) {
        if (!motion.reduced) {
          this.bag.killKeyed(this.ring);
          this.bag.runKeyed(this.ring, { duration: 0.6, yoyo: true, repeat: -1, onUpdate: (k) => (this.ring.alpha = 0.55 + 0.45 * k) });
        } else {
          this.ring.alpha = 1;
        }
      }
    }
    const rects: Array<[number, number, number, number]> = [
      [0, 0, W, hole.y],
      [0, hole.y + hole.h, W, Math.max(0, H - (hole.y + hole.h))],
      [0, hole.y, hole.x, hole.h],
      [hole.x + hole.w, hole.y, Math.max(0, W - (hole.x + hole.w)), hole.h],
    ];
    this.blockers.forEach((blocker, i) => {
      blocker.visible = blocking && hole.w > 0;
      const [bx, by, bw, bh] = rects[i] as [number, number, number, number];
      blocker.hitArea = new Rectangle(bx, by, bw, bh);
    });
  }

  /**
   * The lesson's note over the half of the screen its window is not on. It pops in when it was not up; a note that is up (its text changed,
   * or its target came to rest somewhere else) is put down again in the same frame without the pop, so nothing blinks.
   */
  private say(step: StepDef, hole: Rect, text: string, look: string): void {
    this.noteLook = look;
    // A lesson's note has the space first: an information bubble the player opened gives way.
    info.close();
    this.note.show(
      {
        topic: step.id,
        title: null,
        text,
        target: hole,
        width: NOTE_W,
        tile: NOTE_TILE,
        buttons: step.ok ? [{ label: t('guide.ok'), style: 'primary', width: 220 }] : [],
      },
      () => this.script.tapOk(),
      !this.note.visible,
    );
  }

  /** The paw points at something else (or at nothing yet): it leaves, and `SpotSettle` lays it again for the new spot. */
  private unpoint(): void {
    this.hand.visible = false;
    this.handOn = false;
    this.settle.suspend();
  }

  /** What the lesson pointed at is gone for good (a control that went away): the window, the note and the paw leave with it. */
  private clearSpot(): void {
    this.layer.visible = false;
    for (const b of this.blockers) b.visible = false;
    this.note.hide();
    this.hand.visible = false;
    this.handOn = false;
    this.hole = NO_RECT;
    this.noteLook = '';
    this.blockingNow = false;
  }

  /** What the paw must not lie on besides the label of what it points at: the lesson's note and the skip button, then the cats and buttons. */
  private pawKeep(): Keep[] {
    const keep: Keep[] = soften(this.host.keepClear());
    const card = this.note.rect;
    if (card) keep.push({ ...card, weight: 3 });
    if (this.skipLayer.visible) keep.push({ ...skipRect(topRects(this.layout), this.env.reveal.speed), weight: 2 });
    return keep;
  }

  /**
   * The paw: a drag between two cells (merge, sun) that picks the cat up and carries it, a pat on a cat, or a pat on a control. Its tip is
   * on the spot (off the control's label when the control is wide), and it reaches in from the side that keeps it on the screen and off
   * the note, the label and the cats where it can (handMath.placePaw).
   */
  private placeHand(step: StepDef, target: Target): void {
    this.handOn = this.layHand(step, target);
    this.hand.visible = this.handOn && !this.carrying;
  }

  /** Lay the paw for the lesson; false when the lesson has nothing for a paw to do (it stays hidden, also after a drag by the player ends). */
  private layHand(step: StepDef, target: Target): boolean {
    const h = this.hand;
    // A read-only lesson and a timed note have nothing to do with a hand.
    if (step.ok || step.timed > 0) return false;
    const ctx = this.env.ctx;
    const cell = (c: number): { x: number; y: number } => ({ x: ctx.toSceneX(cellCenterX(c)), y: ctx.toSceneY(cellCenterY(c)) });
    const units = this.env.battle.units;
    const keep = this.pawKeep();
    const drag = (from: number, to: number): void => {
      const a = cell(from);
      const b = cell(to);
      const pose = placePaw({ tips: [a, b], bounds: pawBounds(this.layout), keep, prefer: dragPrefer(a, b) });
      const id = units[from]?.id;
      h.turnTo(pose.rotation);
      h.drag(a.x, a.y, b.x, b.y, id ? unitPortrait(id, 104) : null);
    };
    if (target === 'pair' && this.pair) {
      drag(this.pair[0], this.pair[1]);
      return true;
    }
    if (target === 'sun' && this.cat >= 0 && this.sunTo >= 0) {
      drag(this.cat, this.sunTo);
      return true;
    }
    if ((target === 'cat' || target === 'weakcat' || target === 'king') && this.cat >= 0) {
      const c = cell(this.cat);
      this.pat(h, { x: c.x + 10, y: c.y - 6 }, keep);
      return true;
    }
    if (this.rect.w > 0 && target !== 'sun' && target !== 'cat' && target !== 'weakcat' && target !== 'king' && target !== 'pair') {
      // The whole chip row is lit; the paw pats the first chip.
      const r = target === 'chips' ? { x: this.rect.x + 20, y: this.rect.y, w: 150, h: this.rect.h } : this.rect;
      const { label } = tipSpot(r);
      if (r.w >= 150) keep.push({ ...label, weight: 3 });
      if (target === 'chips') {
        // The fish and purr counters lie right under the chips.
        const rows = bottomRects(this.layout);
        keep.push({ x: 0, y: rows.top + rows.currencyY - 44, w: this.layout.w, h: 88, weight: 2 });
      }
      this.patControl(h, r, this.host.labelsOf(target), keep, target);
      return true;
    }
    return false;
  }

  /**
   * A pat on a control: the tip goes where the pad leaves the control's own writing alone. A few spots on the control are tried (the usual one,
   * the upper right corner, the middle of the top and right edges); each gets its best arm, and the one whose paw lies on least writing wins.
   */
  private patControl(hand: Hand, r: Rect, labels: readonly Rect[], keep: readonly Keep[], target: Target): void {
    // A control that is only a glyph on a round face is touched beside the glyph, on the band between it and the face's edge, never on it.
    if (target === 'laser' || (labels.length === 0 && r.w < 150)) {
      const spots = target === 'laser' ? ((f) => rimSpots(f.centre, f.faceR, f.glyphR))(laserFace(r)) : iconSpots(r);
      const best = bestRimPose(spots, { bounds: pawBounds(this.layout), keep, prefer: FROM_BELOW });
      hand.place(best.tip.x, best.tip.y, best.pose.rotation);
      hand.tap();
      return;
    }
    const usual = tipSpot(r).tip;
    const tips: Point[] = [usual];
    if (labels.length > 0) tips.push({ x: r.x + r.w * 0.96, y: r.y + r.h * 0.04 }, { x: r.x + r.w * 0.97, y: r.y + r.h * 0.4 }, { x: r.x + r.w * 0.5, y: r.y + r.h * 0.03 });
    let best: { tip: Point; pose: PawPose } | null = null;
    for (const tip of tips) {
      const pose = placePaw({ tips: [tip], bounds: pawBounds(this.layout), keep, labels, prefer: FROM_BELOW });
      if (!best || pose.cost < best.pose.cost) best = { tip, pose };
    }
    if (!best) return;
    hand.place(best.tip.x, best.tip.y, best.pose.rotation);
    hand.tap();
  }

  private pat(hand: Hand, tip: { x: number; y: number }, keep: readonly Keep[]): void {
    const pose = placePaw({ tips: [tip], bounds: pawBounds(this.layout), keep, prefer: FROM_BELOW });
    hand.place(tip.x, tip.y, pose.rotation);
    hand.tap();
  }

  // ───────────────────────── nudges outside the lessons ─────────────────────────

  /** Between lessons the player plays freely: point at the button when fish pile up unspent, or when the first summon has not been made. */
  private nudge(dt: number, w: World): void {
    const { battle, ctx } = this.env;
    let cats = 0;
    let room = false;
    for (const u of battle.units) {
      if (u) cats++;
      else room = true;
    }
    const waiting = w.phase === 'prep' && this.counts.summon === 0 && battle.getStats().summons === 0;
    const idle = (waiting || (w.phase === 'wave' && room && battle.fish >= battle.summonCost())) && !ctx.paused && !this.env.modalCount;
    if (!idle) {
      this.idle = 0;
      this.endNudge();
      return;
    }
    if (this.nudgeLeft > 0) {
      this.nudgeLeft -= dt;
      if (this.nudgeLeft <= 0) this.endNudge();
      return;
    }
    this.idle += dt;
    const due = waiting ? this.idle >= FIRST_SUMMON_AFTER : nudgeDue(this.idle, this.nudges, cats);
    if (!due || this.carrying) return;
    this.nudges++;
    this.nudgeLeft = waiting ? 1e9 : NUDGE_FOR;
    const r = this.host.rectOf('summon');
    if (!r) return;
    // The button lies at the bottom of the screen: the paw reaches in from where there is room, off the line of words over the button.
    const { tip, label } = tipSpot(r);
    this.nudgeHand.visible = true;
    const pose = placePaw({
      tips: [tip],
      bounds: pawBounds(this.layout),
      keep: [...soften(this.host.keepClear()), { ...label, weight: 3 }, { x: r.x, y: r.y - NUDGE_ROOM, w: r.w, h: NUDGE_ROOM, weight: 3 }],
      prefer: FROM_BELOW,
    });
    this.nudgeHand.place(tip.x, tip.y, pose.rotation);
    this.nudgeHand.tap();
    this.host.pulse(true);
    this.nudgeMark.clear().rect(0, 0, r.w, r.h).fill({ color: Color.paper, alpha: 0.01 });
    this.nudgeMark.position.set(r.x, r.y);
    info.show(NUDGE, this.nudgeMark, { text: t(waiting ? 'guide.skip.start' : 'hud.tut.more') }, { sticky: true, prefer: 'above' });
  }

  private endNudge(): void {
    this.idle = 0;
    if (!this.nudgeHand.visible) return;
    this.nudgeHand.visible = false;
    this.nudgeLeft = 0;
    this.host.pulse(false);
    info.close(true, NUDGE);
  }

  /** After the last lesson (or a skip) the tutorial only keeps the nudges. */
  private afterLessons(dt: number): void {
    this.showSkip(false);
    this.setHold(false);
    this.nudge(dt, this.fill());
  }

  // ───────────────────────── skip ─────────────────────────

  /** The skip button lies in the top row, in the speed button's slot and beside it once it has arrived; the enemy strip gives way to it. */
  private placeSkip(): void {
    this.speedSeen = this.env.reveal.speed;
    const r = skipRect(topRects(this.layout), this.speedSeen);
    this.skipLayer.position.set(r.x + r.w / 2, r.y + r.h / 2);
    this.env.setSkip(this.skipLayer.visible ? r : null);
  }

  private showSkip(on: boolean): void {
    this.skipLayer.visible = on;
    this.placeSkip();
  }

  private placeSkipFor(step: StepDef | null): void {
    const on = !this.skipped && this.left > 0 && step?.id !== 'boss';
    if (on !== this.skipLayer.visible || this.env.reveal.speed !== this.speedSeen) this.showSkip(on);
  }

  private countLeft(): void {
    this.left = this.script.remaining.filter((s) => s.id !== 'boss').length;
  }

  private async askSkip(): Promise<void> {
    if (this.skipAsked || this.destroyed) return;
    this.skipAsked = true;
    this.releaseDialog = this.env.holdPause();
    const yes = await confirmDialog({
      title: t('guide.skip.title'),
      message: t('guide.skip.body'),
      confirmLabel: t('guide.skip.yes'),
      cancelLabel: t('guide.skip.no'),
    });
    this.releaseDialog?.();
    this.releaseDialog = null;
    this.skipAsked = false;
    if (this.destroyed || !yes) return;
    this.skip();
  }

  /** The lessons stop for good: the hidden controls all arrive, the run goes on as an easy one and the guidebook is pointed out. */
  private skip(): void {
    this.script.stop();
    this.countLeft();
    this.skipped = true;
    this.env.progress.markSkipped();
    this.endVisuals();
    this.showSkip(false);
    audio.play('ui_confirm');
    let i = 0;
    for (const key of REVEAL_KEYS) {
      if (this.env.reveal[key]) continue;
      this.bag.call(i++ * 0.09, () => {
        if (!this.destroyed) this.arrive(key);
      });
    }
    toast(t('guide.skip.note'), 'info');
  }

  // ───────────────────────── frame events from the HUD ─────────────────────────

  /** The topic the player is being taught right now (a popup shows its words in place of its own sub line). */
  get topic(): TopicId | null {
    return this.script.active?.id ?? null;
  }

  /** A lesson's note is on screen: no information bubble opens over it. */
  get noteUp(): boolean {
    return this.note.visible;
  }

  /** Where the note's body lies in scene space (the QA hooks tap its button), or null. */
  get noteRect(): Rect | null {
    return this.note.rect;
  }

  /** Where the "nice!" sticker lies right now (scene space), or null. */
  get cheerRect(): Rect | null {
    return this.fx.cheerRect;
  }

  /** True while a lesson holds the clock or is up on the field (hints and cards wait). */
  get active(): boolean {
    return this.script.active !== null && !this.skipped;
  }

  resize(l: BattleLayout): void {
    this.layout = l;
    this.resetLook();
    this.placeSkip();
  }

  destroy(): void {
    this.destroyed = true;
    this.bag.killAll();
    this.setHold(false);
    this.releaseDialog?.();
    this.releaseDialog = null;
    this.endNudge();
    this.note.destroy();
    this.fx.destroy();
    this.host.pulse(false);
    info.close(false, NUDGE);
    this.layer.destroy({ children: true });
    this.noteLayer.destroy({ children: true });
    this.skipLayer.destroy({ children: true });
    this.nudgeHand.destroy({ children: true });
    this.nudgeMark.destroy();
    this.env.setSkip(null);
    this.env.lessonOf = null;
    this.env.noteTo = null;
  }
}

function unionOf(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
