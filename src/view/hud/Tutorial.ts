/**
 * The tutorial run's lessons on screen. The plan is tutorialScript.ts; this turns what it says into paper: a spotlight on the
 * control or the board feature being taught (with a flat starburst when a control arrives), a hand showing the gesture, a note with
 * the topic's picture and one or two short lines, a cheerful sticker and confetti when the player has done it, and a "skip" button
 * in the top right. A lesson holds the clock only while it waits for a tap on a control of the screen (never for a gesture on the
 * field, which the field ignores while paused), and every hold is released when the lesson ends, is skipped or is destroyed.
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { CLASS_IDS, type UnitId, unitRarityIndex } from '@/game';
import { CELL_COUNT, CELL_H, CELL_W, cellCenterX, cellCenterY } from '@/game/geometry';
import { topicTeach, type TopicId } from '@/guide';
import { Button, Color, confirmDialog, Dim, drawDashedRect, motion, paperSeed, toast, TweenBag, tooltip } from '@/ui';
import type { BattleLayout } from '../context';
import type { EnvImpl } from './env';
import { Hand } from './Hand';
import { LessonBubble } from './LessonBubble';
import { LessonFx } from './LessonFx';
import { type Rect, SKIP_FACE, SKIP_H, SKIP_W, skipRect, topRects } from './layoutMath';
import { findTwins } from './planMath';
import { REVEAL_KEYS, type RevealKey } from './policy';
import { FIRST_SUMMON_AFTER, NUDGE_FOR, nudgeDue } from './tutorialFlow';
import {
  emptyCounts, HOLD_LIMIT, STEP_IDS, TUTORIAL_SUMMONS, TutorialScript, type CountKey, type ScriptEvent, type StepDef, type Target, type World,
} from './tutorialScript';

/** How long the clock runs after a summon tap so the new kitten can pop in before the next prompt. */
const BREATH = 0.75;
const MARGIN = 18;
const HOLE_GRID = 12;
const HAND_SCALE = 0.72;
const NOTE_W = 620;
const NOTE_TILE = 92;
/** Seconds between two measurements of where things are (a lesson does not need them every frame). */
const MEASURE_EVERY = 0.1;
/** Seconds a lesson may wait for the thing it points at to appear before it is dropped. */
const UNSEEN_LIMIT = 6;

/** What the HUD lends the tutorial: where its controls are and the summon button's breathing. */
export interface TutorialHost {
  /** Scene-space rectangle of a control or of the top-row feature a target names; null when it is not on screen. */
  rectOf(target: Target): Rect | null;
  /** The control a revealed key brings in, as a rectangle (for the starburst); null for keys without a place of their own. */
  rectOfReveal(key: RevealKey): Rect | null;
  pulse(on: boolean): void;
  /** The laser's guided first use has been done (it runs on its own, see LaserGuide.ts). */
  laserGuided(): boolean;
  /** The guided first use of the laser should run now. */
  startLaserGuide(): void;
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
  private paintedKey = '';
  private carrying = false;
  private idle = 0;
  private nudgeLeft = 0;
  private nudges = 0;
  private rect: Rect = NO_RECT;
  private pair: [number, number] | null = null;
  private cat = -1;
  private sunTo = -1;
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
      fish: 0, purr: 0, moltCost: 1, gradeCost: -1, classCost: -1, maxTier: 0, sun: 0, laserReady: false, laserGuided: false, callBonus: -1, selected: false,
      counts: this.counts,
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
    this.note = new LessonBubble(env, this.noteLayer);
    // From the back: the dim and the hand, the celebrations (they show through the window and over the dim), the note, the nudge.
    parent.addChild(this.layer);
    this.fx = new LessonFx(parent);
    parent.addChild(this.noteLayer, this.nudgeHand);

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
    env.on(b.events, 'purr', ({ delta, reason }) => {
      if (delta > 0 && reason !== 'start') this.bump('purrGain');
    });
    // A cat that lands on a sunny cell is what the sun lesson asks for.
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
      this.hand.visible = !this.carrying;
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
    w.callBonus = b.callBonus();
    w.selected = ctx.selected !== null;
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
    for (let i = 0; i < events.length; i++) this.handle(events[i] as ScriptEvent, w);
    this.tick(dt, w);
    // A lesson whose target never shows up (a control that stayed hidden) must not hold the run: it is dropped after a few seconds.
    if (this.script.active && this.rect.w <= 0 && !this.script.active.popup && this.script.active.id !== 'laser') {
      this.unseen += dt;
      if (this.unseen > UNSEEN_LIMIT) {
        const drop = this.script.abandon();
        if (drop) this.handle(drop, w);
      }
    } else {
      this.unseen = 0;
    }
  }

  private handle(e: ScriptEvent, w: World): void {
    const id = e.step.id;
    this.countLeft();
    this.heldFor = 0;
    if (e.kind === 'begin') {
      for (const key of e.step.reveal) this.arrive(key);
      if (id === 'laser') this.host.startLaserGuide();
      this.paintedKey = '';
      this.lastTarget = '';
      this.measure = 0;
      return;
    }
    this.endVisuals();
    if (e.kind === 'done') {
      this.env.progress.markTaught(id);
      this.cheer(e.step, w);
    }
  }

  /** A control arrives: it pops in by itself (its own part), and a flat paper starburst opens behind it. */
  private arrive(key: RevealKey): void {
    this.env.showControl(key, true);
    const r = this.host.rectOfReveal(key);
    if (r) this.fx.arrive(r.x + r.w / 2, r.y + r.h / 2, Math.min(300, Math.max(r.w, r.h) * 2.2));
  }

  private cheer(step: StepDef, w: World): void {
    const r = this.rect.w > 0 ? this.rect : null;
    const cx = r ? r.x + r.w / 2 : this.layout.w / 2;
    const cy = r ? Math.max(this.layout.safeTop + 120, r.y - 8) : this.layout.h * 0.4;
    if (step.popup) return;
    this.fx.celebrate(Math.min(this.layout.w - 130, Math.max(130, cx)), cy, t(`guide.cheer.${w.wave % 4}`));
  }

  /** The spotlight, the hand and the note go away; the clock is released unless something else holds it. */
  private endVisuals(): void {
    this.paintedKey = '';
    this.layer.visible = false;
    for (const b of this.blockers) b.visible = false;
    this.note.hide();
    this.hand.position.set(0, 0);
    this.host.pulse(false);
    this.setHold(false);
    this.breath = 0;
    if (tooltip.target === this.nudgeHand) tooltip.hide();
  }

  private setHold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    this.env.ctx.setPaused('tutorial', on);
  }

  /** The active lesson, drawn: re-measured a few times a second, repainted when something it points at has moved. */
  private tick(dt: number, w: World): void {
    const step = this.script.active;
    this.placeSkipFor(step);
    if (!step) {
      this.setHold(false);
      this.nudge(dt, w);
      return;
    }
    this.endNudge();
    const modal = w.busy;
    // The clock is held while the lesson waits for a tap on a control (and for a beat after each summon so the sticker can pop in).
    // A hold only makes sense while there is something on screen to tap, and never for ever: a player who ignores the lesson is let go.
    this.setHold(step.holds(w) && !step.popup && this.breath <= 0 && !this.skipAsked && this.rect.w > 0 && !this.script.relaxed);
    if (this.held) {
      this.heldFor += dt;
      if (this.heldFor > HOLD_LIMIT) this.script.relax();
    }
    if (step.popup || step.id === 'laser') {
      // A popup carries its own lesson, and the laser's guided first use is the laser's own.
      this.layer.visible = false;
      this.note.hide();
      return;
    }
    if (modal || this.breath > 0) {
      this.layer.visible = false;
      this.note.hide();
      this.paintedKey = '';
      return;
    }
    this.measure -= dt;
    const target = step.target(w);
    if (this.measure <= 0 || target !== this.lastTarget || this.paintedKey === '') {
      this.measure = MEASURE_EVERY;
      this.lastTarget = target;
      this.aim(target);
      // Re-measured a few times a second: only a change in what is lit, said or blocked repaints the paper.
      const hole = this.holeOf(this.rect);
      const text = this.textOf(step);
      const blocking = step.holds(w) && !step.popup && !this.script.relaxed;
      const key = `${step.id}|${target}|${hole.x}|${hole.y}|${hole.w}|${hole.h}|${blocking}|${text}|${this.layout.w}|${this.layout.h}`;
      if (key !== this.paintedKey) {
        this.paintedKey = key;
        this.paint(step, target, hole, text, blocking);
      }
    } else if (!this.note.visible && this.rect.w > 0) {
      this.paintedKey = '';
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
      this.pair = findTwins(b.units);
      if (!this.pair) {
        this.rect = NO_RECT;
        return;
      }
      const a = cellRect(this.pair[0]);
      const c = cellRect(this.pair[1]);
      this.rect = unionOf(a, c);
    } else if (target === 'cat' || target === 'sellcat') {
      this.cat = this.pickCat(target === 'sellcat');
      this.rect = this.cat >= 0 ? cellRect(this.cat) : NO_RECT;
    } else if (target === 'sun') {
      let box: Rect | null = null;
      for (const c of b.sunbeams) box = box ? unionOf(box, cellRect(c)) : cellRect(c);
      this.cat = this.pickSunCat();
      this.sunTo = this.pickSunCell(this.cat);
      this.rect = box ?? NO_RECT;
      if (this.cat >= 0 && box) this.rect = unionOf(box, cellRect(this.cat));
    } else {
      this.rect = this.host.rectOf(target) ?? NO_RECT;
    }
  }

  /** A cat to tap: the weakest one for selling, otherwise the first (the lesson is about the button that follows). */
  private pickCat(weakest: boolean): number {
    const units = this.env.battle.units;
    let best = -1;
    let score = Infinity;
    for (let c = 0; c < units.length; c++) {
      const u = units[c];
      if (!u) continue;
      const s = weakest ? unitRarityIndex(u.id) : c;
      if (s < score) {
        score = s;
        best = c;
      }
    }
    return best;
  }

  /** A cat that stands in the shade: the one the hand carries into the sun. */
  private pickSunCat(): number {
    const units = this.env.battle.units;
    for (let c = 0; c < units.length; c++) {
      const u = units[c];
      if (u && !u.sunlit) return c;
    }
    return -1;
  }

  /** A sunny cell for it to land on: an empty one first, otherwise any sunny cell with another cat on it (they swap). */
  private pickSunCell(from: number): number {
    const b = this.env.battle;
    let taken = -1;
    for (const c of b.sunbeams) {
      if (c === from) continue;
      if (!b.units[c]) return c;
      if (taken < 0) taken = c;
    }
    return taken;
  }

  /** The spotlight's window round a rectangle, snapped to a coarse grid: a button that breathes must not make the note pop in again every frame. */
  private holeOf(r: Rect): Rect {
    if (r.w <= 0) return NO_RECT;
    const snap = (v: number): number => Math.round(v / HOLE_GRID) * HOLE_GRID;
    const x = Math.max(0, snap(r.x - MARGIN));
    const y = Math.max(0, snap(r.y - MARGIN));
    return { x, y, w: Math.min(this.layout.w - x, snap(r.x + r.w + MARGIN) - x), h: snap(r.y + r.h + MARGIN) - y };
  }

  private textOf(step: StepDef): string {
    const base = topicTeach(step.id);
    if (step.id === 'summon') return `${base} ${t('guide.tut.count', { n: Math.min(this.counts.summon, TUTORIAL_SUMMONS), total: TUTORIAL_SUMMONS })}`;
    return base;
  }

  private paint(step: StepDef, target: Target, hole: Rect, text: string, blocking: boolean): void {
    const W = this.layout.w;
    const H = this.layout.h;
    this.layer.visible = hole.w > 0;
    // The warm-brown dim with a hole cut out of it; the hole is edged with a dashed cream line, like a cut-out window.
    const alpha = blocking ? Dim.backdropAlpha : Dim.backdropAlpha * 0.7;
    this.dim.clear().rect(0, 0, W, H).fill({ color: Dim.backdrop, alpha });
    this.ring.clear();
    if (hole.w > 0) {
      this.dim.roundRect(hole.x, hole.y, hole.w, hole.h, 32).cut();
      drawDashedRect(this.ring, hole.x, hole.y, hole.w, hole.h, { radius: 32, color: Color.paper, width: 5, seed: this.seed });
      if (!motion.reduced) {
        this.bag.killKeyed(this.ring);
        this.bag.runKeyed(this.ring, { duration: 0.6, yoyo: true, repeat: -1, onUpdate: (k) => (this.ring.alpha = 0.55 + 0.45 * k) });
      } else {
        this.ring.alpha = 1;
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
    this.host.pulse(step.id === 'summon');
    this.placeHand(step, target);
    if (hole.w <= 0) {
      this.note.hide();
      return;
    }
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
    );
  }

  /**
   * The hand: a drag between two cells (merge, sun), a tap on a cat, or lying beside a control with its fingertip toward it (on the
   * button's right edge for the left half of the screen, its left edge for the right half, so its body is never off screen).
   */
  private placeHand(step: StepDef, target: Target): void {
    const h = this.hand;
    h.visible = !this.carrying;
    // A read-only lesson and a timed note have nothing to do with a hand.
    if (step.ok || step.timed > 0) {
      h.visible = false;
      return;
    }
    h.rotation = 0;
    h.scale.set(1);
    const ctx = this.env.ctx;
    const cell = (c: number): { x: number; y: number } => ({ x: ctx.toSceneX(cellCenterX(c)), y: ctx.toSceneY(cellCenterY(c)) });
    if (target === 'pair' && this.pair) {
      const a = cell(this.pair[0]);
      const b = cell(this.pair[1]);
      h.position.set(a.x, a.y);
      h.drag(a.x, a.y, b.x, b.y);
    } else if (target === 'sun' && this.cat >= 0 && this.sunTo >= 0) {
      const a = cell(this.cat);
      const b = cell(this.sunTo);
      h.position.set(a.x, a.y);
      h.drag(a.x, a.y, b.x, b.y);
    } else if ((target === 'cat' || target === 'sellcat') && this.cat >= 0) {
      const a = cell(this.cat);
      h.position.set(a.x, a.y + 14);
      h.tap();
    } else if ((target === 'molt' || target === 'sell' || target === 'speed') && this.rect.w > 0) {
      // The selection sheet's buttons stand shoulder to shoulder, and the speed button has the skip button on its left: the hand comes up from below the one that is lit.
      h.scale.set(HAND_SCALE);
      h.position.set(this.rect.x + this.rect.w / 2, this.rect.y + this.rect.h - 14);
      h.tap();
    } else if (target === 'chips' && this.rect.w > 0) {
      // The whole row is lit; the hand taps the first chip, coming down from above it.
      h.rotation = Math.PI;
      h.scale.set(HAND_SCALE);
      h.position.set(this.rect.x + 100, this.rect.y + this.rect.h * 0.55);
      h.tap();
    } else if (this.rect.w > 0 && target !== 'sun' && target !== 'cat' && target !== 'sellcat' && target !== 'pair') {
      this.lieBeside(h, this.rect);
      h.tap();
    } else {
      h.visible = false;
    }
  }

  private lieBeside(hand: Hand, r: Rect): void {
    const toRight = r.x + r.w / 2 <= this.layout.w / 2 + 1;
    hand.rotation = toRight ? -Math.PI / 2 : Math.PI / 2;
    hand.scale.set(HAND_SCALE);
    hand.position.set(toRight ? r.x + r.w - 4 : r.x + 4, r.y + r.h / 2);
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
    // Every control is out by now: the hand comes down onto the button from above instead of lying beside it.
    this.nudgeHand.rotation = Math.PI;
    this.nudgeHand.scale.set(HAND_SCALE);
    this.nudgeHand.position.set(r.x + r.w / 2, r.y + 10);
    this.nudgeHand.visible = true;
    this.nudgeHand.tap();
    this.host.pulse(true);
    tooltip.show(this.nudgeHand, { text: t(waiting ? 'guide.skip.start' : 'hud.tut.more') }, waiting ? 600 : NUDGE_FOR);
  }

  private endNudge(): void {
    this.idle = 0;
    if (!this.nudgeHand.visible) return;
    this.nudgeHand.visible = false;
    this.nudgeLeft = 0;
    this.host.pulse(false);
    if (tooltip.target === this.nudgeHand) tooltip.hide();
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

  /** True while a lesson holds the clock or is up on the field (hints and cards wait). */
  get active(): boolean {
    return this.script.active !== null && !this.skipped;
  }

  resize(l: BattleLayout): void {
    this.layout = l;
    this.paintedKey = '';
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
    if (tooltip.target === this.nudgeHand) tooltip.hide();
    this.layer.destroy({ children: true });
    this.noteLayer.destroy({ children: true });
    this.skipLayer.destroy({ children: true });
    this.nudgeHand.destroy({ children: true });
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
