import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { clamp, lerp, mixColor, TAU } from '@/core/math';
import { Ease, uiTweens } from '@/core/tween';
import { Fx, fxTex, screenFx, type EmitDef } from '@/fx';
import { profile } from '@/meta';
import type { ChestRarity, ChestResult } from '@/meta/types';
import {
  backOut, Button, Color, countUpDuration, countUpValue, drawFloor, formatCount, motion, PaperLabel, Rarity, rarityName,
  tapeStrip, TweenBag, type TapeName,
} from '@/ui';
import { flipPose, flyPose, newCardPose, risePose, showPose, STAGE_GAP, stageScale, stageX, wobblePose } from './cardMotion';
import { Sunburst } from './chestLight';
import { newPose, popPose, shakeOffset, windupPose } from './chestPose';
import { CHEST_SIZE, ChestStage, tellColors } from './ChestStage';
import { stampMark } from './paperBits';
import { stampThud } from '../system/kit/marks';
import { RevealCard } from './RevealCard';
import { FLIP_TURN, RevealFlow, TIMES, type BeatState, type FlowEvent } from './revealFlow';
import {
  bestRarity, flourishOf, gridLayout, mergePile, nameBlockOf, PLATE, rarityRank, stacksOf, stampFrom, stampSpot, totalCards, type GridLayout, type Pile, type RevealStack,
} from './revealPlan';
import './revealStrings';

interface StackView {
  stack: RevealStack;
  card: RevealCard;
  /** Which way the card leans on its way (alternating sides). */
  side: number;
  /** The face is up. */
  shown: boolean;
  /** The card has landed in its slot and follows it when the screen is resized. */
  placed: boolean;
  /** Seconds since the last wobble tick, and the landing bump (1 just landed, 0 settled). */
  tickAge: number;
  bump: number;
  /** Where the flight to the slot began, and the plate scale on screen now. */
  fromX: number;
  fromY: number;
  fromS: number;
  s: number;
  tape?: Container;
  stamp?: Container;
}

/** Width of the skip button and the gap to the title on the header row. */
const SKIP_W = 220;
/** The floor is drawn this much bigger than the screen on every side, so a shaken screen never shows its edge. */
const FLOOR_MARGIN = 24;
/** Space between the lines of the summary. */
const SUMMARY_LINE = 62;
/** The stamp on a card: how long it takes to slam down, to settle, and to fade at the end. */
const STAMP_SLAM = 0.2;
const STAMP_BUMP = 0.22;
const STAMP_FADE = 0.3;
/** The stamp's word in plate units (a card on stage is about twice that), and the scale it arrives at. */
const STAMP_SIZE = 18;
const STAMP_FROM = 1.5;
/** The chest sinks and fades over this long once the first cards are out. */
const EXIT = 0.4;

/** Strength of each rarity's flourish (shake, haptic, sound). */
const FLOURISH: Record<ChestRarity, { shake: number; haptic: 'light' | 'medium' | 'heavy' | 'jackpot'; sfx: 'summon_common' | 'summon_rare' | 'summon_epic' | 'summon_legendary' }> = {
  common: { shake: 0, haptic: 'light', sfx: 'summon_common' },
  rare: { shake: 0.1, haptic: 'light', sfx: 'summon_rare' },
  epic: { shake: 0.25, haptic: 'medium', sfx: 'summon_epic' },
  legendary: { shake: 0.55, haptic: 'jackpot', sfx: 'summon_legendary' },
};

/** Opacity of the sunburst behind the card on stage, by the rank that is on stage. */
const SUN_PEAK: Record<ChestRarity, number> = { common: 0.1, rare: 0.14, epic: 0.2, legendary: 0.3 };

/** A breath of slow motion on the flourish of the best card: how long (real seconds) and how slow. */
const SLOW: Partial<Record<ChestRarity, { for: number; factor: number }>> = { epic: { for: 0.25, factor: 0.5 }, legendary: { for: 0.4, factor: 0.3 } };

/** A pop of paper bits: confetti thrown up and out, falling back down. Colours come from the rarity's own papers. */
const PAPER_POP: EmitDef = {
  tex: 'confetti', prio: 2, count: 14, life: [0.7, 1.2], speed: [170, 420], dir: -Math.PI / 2, spread: 1.5, drag: 1.5, gravity: 520,
  size: [14, 24], spin: [-8, 8], flip: [7, 15], rot: [0, TAU], colors: [Color.white], fadeIn: 0, fadeOut: 0.25,
};

/** Flat four-point stars thrown out of the opening and falling back. */
const STARS: EmitDef = {
  tex: 'sparkle', prio: 2, count: 14, life: [0.8, 1.3], speed: [240, 560], dir: -Math.PI / 2, spread: 1.15, drag: 1.7, gravity: 300,
  size: [28, 52], sizeEnd: [10, 22], spin: [-3, 3], rot: [0, TAU], colors: [Color.white], fadeIn: 0, fadeOut: 0.4,
};

/** One barrel of the confetti cannon: a fast, narrow stream that arcs over and falls. Fired from each side of the chest, leaning in. */
const CANNON: EmitDef = {
  tex: 'confetti', prio: 2, count: 22, life: [1.0, 1.6], speed: [520, 940], dir: -Math.PI / 2, spread: 0.3, drag: 1.3, gravity: 900,
  size: [14, 24], spin: [-9, 9], flip: [7, 15], rot: [0, TAU], colors: [Color.white], fadeIn: 0, fadeOut: 0.25,
};

/** Flat puffs of tinted paper thrown off the chest by every burst. */
const PUFF: EmitDef = {
  tex: 'smoke', prio: 1, count: 6, life: [0.4, 0.6], speed: [90, 220], dir: -Math.PI / 2, spread: 0.9, drag: 3, gravity: -20,
  size: [34, 48], sizeEnd: [70, 100], rot: [0, TAU], spin: [-1.5, 1.5], colors: [Color.white], alpha: 0.8, fadeIn: 0.05, fadeOut: 0.6,
};

/** The tape a rare card gets slapped on: a different print per tier so it never relies on colour alone. */
const SLAP_TAPE: Record<ChestRarity, { name: TapeName; pattern: 'dots' | 'gingham' | 'stripes' }> = {
  common: { name: 'green', pattern: 'dots' },
  rare: { name: 'sky', pattern: 'dots' },
  epic: { name: 'pink', pattern: 'stripes' },
  legendary: { name: 'yellow', pattern: 'gingham' },
};

/** Where a plate sits and how big it is drawn. */
interface Slot {
  x: number;
  y: number;
  s: number;
}

/**
 * Full-screen chest opening. The result is already decided and stored by the meta layer; this only replays it, and the order and
 * timing come from `RevealFlow`, which this class feeds frame times and taps and whose events it answers on the very frame they fall due
 * (a sound, a haptic, a shake and the picture all happen together). The chest drops and lands with a squash, shakes in bursts that
 * throw paper in the best rarity's colour (a tap starts the next burst at once), holds its breath and pops open: a jump, a flat
 * sunburst, a confetti cannon, four-point stars and one warm flash. Then one stack of cards at a time (commons together) shoots up to
 * centre stage face down, wobbles, flips, shows itself with a flourish that grows with its rank and flies down into its place in the
 * summary grid, which builds up at the bottom. Skippable from the first frame; the summary is the final layout of the same cards.
 */
class ChestReveal {
  private readonly bag = new TweenBag();
  private readonly root = new Container();
  private readonly shaker = new Container();
  private readonly raysLayer = new Container();
  private readonly gridLayer = new Container();
  private readonly chestLayer = new Container();
  private readonly flashLayer = new Container();
  private readonly fxHost = new Container();
  private readonly ui = new Container();
  private readonly floor = new Graphics();
  private readonly title: PaperLabel;
  private readonly hint: PaperLabel;
  private readonly fx: Fx;
  private readonly offUpdate: () => void;
  private readonly offResize: () => void;
  private readonly stacks: RevealStack[];
  private readonly best: ChestRarity;
  private readonly flow: RevealFlow;
  private readonly views: StackView[] = [];
  private readonly skip: Button;
  private readonly done: Button;
  private readonly summary = new Container();
  private readonly summaryLines: number;
  private readonly onKey: (e: KeyboardEvent) => void;
  private readonly stage: ChestStage;
  private readonly burst: Sunburst;
  private readonly pose = newPose();
  private readonly cardPose = newCardPose();
  private readonly slot: Slot = { x: 0, y: 0, s: 1 };
  private readonly point = { x: 0, y: 0 };
  private readonly off = { x: 0, y: 0 };
  private buildGrid: GridLayout;
  private summaryGrid: GridLayout;
  private area = { x: 24, y: 150, w: 672, h: 800 };
  /** 0 while the cards sit in the strip at the bottom that builds up, 1 once the summary has spread them over the whole area. */
  private expand = 0;
  private trauma = 0;
  private clock = 0;
  private slowLeft = 0;
  private slowFactor = 1;
  /** Seconds since the first cards left the chest (it sinks and fades from then on), or -1. */
  private exitAge = -1;
  private hopMark = 0;
  /** Where the chest's foot stands on the floor (it sinks from there when it leaves). */
  private footY = 0;
  private spreading = false;
  private flipped = 0;
  private landed = 0;
  private hintGone = false;
  private finished = false;
  private leaving = false;
  private tornDown = false;
  private resolve!: () => void;
  readonly closed: Promise<void>;

  constructor(private readonly pile: Pile) {
    this.stacks = stacksOf(pile);
    this.best = bestRarity(this.stacks);
    this.flow = new RevealFlow(this.stacks, (e) => this.onEvent(e), motion.reduced);
    this.closed = new Promise<void>((r) => {
      this.resolve = r;
    });
    this.summaryLines = 1 + (pile.count > 1 ? 1 : 0) + (pile.overflowGold > 0 ? 1 : 0);

    // A tap anywhere on the floor is the next burst of the wind-up, and after the pop hurries the card on stage.
    this.floor.eventMode = 'static';
    this.floor.on('pointertap', () => this.onTap());

    this.title = new PaperLabel({ text: t('meta.chest.' + pile.kind), size: 48, paper: Color.paperLight, padX: 44 });
    this.hint = new PaperLabel({ text: t('reveal.tap'), size: 30, paper: Color.paperLight, padX: 30 });

    this.stage = new ChestStage(pile.kind, this.best, pile.count);
    const tell = tellColors(this.best);
    this.burst = new Sunburst(tell.core, tell.edge, game.w * 1.1, 0.36, motion.reduced);

    this.skip = new Button({ label: t('reveal.skip'), icon: 'fast_forward', style: 'kraft', width: SKIP_W, height: 96, fontSize: 28, sfx: false });
    this.skip.onTap(() => this.skipToEnd());
    this.done = new Button({ label: t('reveal.done'), style: 'primary', width: 380, height: 112, fontSize: 46, tape: 'pink' });
    this.done.visible = false;
    this.done.onTap(() => this.leave());

    // The stage is a static event target, so any picture over the floor that can be hit would swallow the tap that is meant for the floor.
    for (const c of [this.raysLayer, this.chestLayer, this.gridLayer, this.flashLayer, this.fxHost, this.title, this.hint, this.summary]) c.eventMode = 'none';
    this.raysLayer.addChild(this.burst);
    this.chestLayer.addChild(this.stage);
    this.gridLayer.sortableChildren = true;
    this.shaker.addChild(this.floor, this.raysLayer, this.chestLayer, this.gridLayer, this.flashLayer, this.fxHost);
    this.ui.addChild(this.title, this.hint, this.summary, this.skip, this.done);
    this.root.addChild(this.shaker, this.ui);
    game.popupLayer.addChild(this.root);
    // The app may take the screen down at any time (a scene change, a reset): the promise still resolves, once.
    this.root.once('destroyed', () => this.teardown());

    this.fx = new Fx(this.fxHost, uiTweens);
    this.offUpdate = game.onUpdate((dt) => this.frame(dt));
    this.computeArea();
    this.buildCards();
    this.buildGrid = this.makeGrid(this.buildArea());
    this.summaryGrid = this.makeGrid(this.area);
    this.layoutFloor();
    this.layoutFixed();
    this.applyGrid();
    this.offResize = game.events.on('resize', () => this.relayout());

    this.onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (this.finished) this.leave();
      else this.skipToEnd();
    };
    window.addEventListener('keydown', this.onKey);
    this.start();
  }

  /* ------------------------------------------------------------------ layout */

  private computeArea(): void {
    const top = game.safeTop + 150;
    // The summary's lines stack upward from the button: every line after the first takes a little of the cards' room.
    const bottom = game.h - game.safeBottom - Math.max(260, 238 + (this.summaryLines - 1) * SUMMARY_LINE);
    this.area = { x: 24, y: top, w: game.w - 48, h: Math.max(400, bottom - top) };
  }

  /** The stage the card on show stands on is the top of the area; the summary builds up in the strip under it. */
  private stageH(): number {
    return clamp(this.area.h * 0.44, 340, 400);
  }

  private stageY(): number {
    return this.area.y + this.stageH() * 0.46;
  }

  private buildArea(): { x: number; y: number; w: number; h: number } {
    const h = this.stageH() + 10;
    return { x: this.area.x, y: this.area.y + h, w: this.area.w, h: Math.max(160, this.area.h - h) };
  }

  private layoutFloor(): void {
    const W = game.w + FLOOR_MARGIN * 2;
    const H = game.h + FLOOR_MARGIN * 2;
    this.floor.clear();
    drawFloor(this.floor, W, H);
    this.floor.position.set(-FLOOR_MARGIN, -FLOOR_MARGIN);
    this.floor.hitArea = new Rectangle(0, 0, W, H);
  }

  /** The title shares the header row with the skip button (it is centred in the space left of it) until the button is gone. */
  private layoutFixed(): void {
    const W = game.w;
    const H = game.h;
    const span = W - 24 - SKIP_W - 16 - 24;
    this.title.setMaxWidth(this.finished ? W - 48 : span);
    this.title.position.set(this.finished ? W / 2 : 24 + span / 2, game.safeTop + 74);
    this.skip.position.set(W - 24 - SKIP_W / 2, game.safeTop + 74);
    this.done.position.set(W / 2, H - game.safeBottom - 100);
    this.summary.position.set(W / 2, H - game.safeBottom - 205);
  }

  private chestHome(): { x: number; y: number } {
    return { x: this.area.x + this.area.w / 2, y: this.area.y + this.area.h * 0.5 };
  }

  /** The chest's middle on the home spot, its foot half a chest below. */
  private placeStage(): void {
    const home = this.chestHome();
    this.footY = home.y + this.stage.halfH;
    this.stage.position.set(home.x, this.footY);
    this.hint.position.set(home.x, this.footY + 72);
  }

  /** Where the cards leave the chest: its opening, in screen space (the open chest does not move any more). */
  private openingPoint(): { x: number; y: number } {
    this.point.x = this.stage.x + this.stage.opening.x;
    this.point.y = this.footY + this.stage.opening.y;
    return this.point;
  }

  private buildCards(): void {
    this.flow.beats.forEach((beat) => {
      for (const si of beat.plan.stacks) {
        const stack = this.stacks[si] as RevealStack;
        const card = new RevealCard(stack);
        card.visible = false;
        this.gridLayer.addChild(card);
        this.views[si] = {
          stack, card, side: si % 2 === 0 ? -1 : 1, shown: false, placed: false, tickAge: 9, bump: 0, fromX: 0, fromY: 0, fromS: 1, s: 1,
        };
      }
    });
  }

  /** The best layout for the cards in an area; how many lines the names take depends on the cell width. */
  private makeGrid(area: { w: number; h: number }): GridLayout {
    const views = this.views;
    return gridLayout(views.length, area.w, area.h, (cellW) => {
      let lines = 1;
      for (const v of views) lines = Math.max(lines, v.card.nameLines(cellW));
      return nameBlockOf(lines);
    });
  }

  /** The plate's place and scale between the strip it builds up in and the final summary layout. */
  private slotInto(out: Slot, i: number): Slot {
    const b = this.buildGrid.slots[i] as { x: number; y: number };
    const f = this.summaryGrid.slots[i] as { x: number; y: number };
    const area = this.buildArea();
    const e = this.expand;
    out.x = this.area.x + lerp(b.x, f.x, e);
    out.y = lerp(area.y + b.y, this.area.y + f.y, e);
    out.s = lerp(this.buildGrid.scale, this.summaryGrid.scale, e);
    return out;
  }

  /** Hand the grid's plate scale and cell width to every card; the ones already in their slot move with it. */
  private applyGrid(): void {
    const g = this.expand >= 1 ? this.summaryGrid : this.buildGrid;
    this.views.forEach((v, i) => {
      v.card.layout(g.scale, g.cellW);
      if (!v.placed) return;
      this.placeCard(v, i);
    });
  }

  private placeCard(v: StackView, i: number): void {
    const slot = this.slotInto(this.slot, i);
    const bump = 1 + 0.14 * Math.sin(v.bump * Math.PI);
    v.s = slot.s * bump;
    v.card.fitTo(v.s);
    v.card.position.set(slot.x, slot.y);
    v.card.rotation = 0;
    v.card.zIndex = i;
  }

  /** The screen changed size (rotation, keyboard, address bar): refit the floor, the header and footer, the chest and every card. */
  private relayout(): void {
    this.layoutFloor();
    this.layoutFixed();
    this.computeArea();
    this.buildGrid = this.makeGrid(this.buildArea());
    this.summaryGrid = this.makeGrid(this.area);
    this.applyGrid();
    if (this.stage.visible && this.exitAge < 0) this.placeStage();
  }

  /* ------------------------------------------------------------------ frames */

  private start(): void {
    this.placeStage();
    audio.play('whoosh', { volume: 0.7 });
    this.poseChest();
    this.burst.update(0);
  }

  /** One frame: the director first (the events it fires answer on this very frame), then everything that moves is put where it says. */
  private frame(dtReal: number): void {
    if (this.tornDown) return;
    this.clock += dtReal;
    let dt = dtReal;
    if (this.slowLeft > 0) {
      this.slowLeft -= dtReal;
      dt = dtReal * this.slowFactor;
    }
    this.flow.update(dt);
    this.poseChest();
    this.followSun(dt);
    this.moveCards(dt);
    this.fx.update(dt);
    this.burst.update(dt);
    this.shakeFrame(dtReal);
    if (this.exitAge >= 0 && this.stage.visible) this.exitChest(dt);
    if (!this.hintGone && !motion.reduced) this.hint.y = this.footY + 72 + Math.sin(this.clock * 6) * 5;
  }

  private poseChest(): void {
    const c = this.flow.chest;
    if (!motion.reduced) {
      if (c.phase === 'open') popPose(this.pose, c.age);
      else windupPose(this.pose, c, this.footY + 20);
    }
    this.stage.apply(this.pose);
    if (c.phase === 'burst') {
      // A little dust and a haptic tick at every landing between two hops.
      const hops = 2 + c.burst;
      const hopsDone = Math.floor(Math.min(1, c.age / c.burstDur) * hops);
      if (hopsDone > this.hopMark && hopsDone < hops) {
        this.hopMark = hopsDone;
        haptic('tap');
        this.fx.dustPuff(this.stage.x, this.stage.y, { scale: 0.45 + 0.4 * c.power });
      }
    }
    this.burst.setLevel(c.fan);
  }

  /** The sunburst sits behind the chest until the pop, then follows the card that is on stage. */
  private followSun(dt: number): void {
    const c = this.flow.chest;
    const b = this.burst;
    if (c.phase !== 'open') {
      const home = this.chestHome();
      b.position.set(home.x, home.y);
      return;
    }
    let tx = this.stage.x;
    let ty = this.openingPoint().y;
    const beats = this.flow.beats;
    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i] as BeatState;
      if (beat.phase === 'queued' || beat.phase === 'placed' || beat.phase === 'fly') continue;
      tx = game.w / 2;
      ty = this.stageY();
      b.setPeak(SUN_PEAK[beat.plan.rarity] + (beat.plan.last && rarityRank(beat.plan.rarity) >= 2 ? 0.1 : 0));
      break;
    }
    const k = motion.reduced ? 1 : Math.min(1, dt * 7);
    b.x += (tx - b.x) * k;
    b.y += (ty - b.y) * k;
  }

  private exitChest(dt: number): void {
    this.exitAge += dt;
    const k = motion.reduced ? 1 : Math.min(1, this.exitAge / EXIT);
    this.stage.alpha = 1 - k;
    this.stage.y = this.footY + 40 * k;
    if (k >= 1) this.stage.visible = false;
  }

  /** Put every card on stage where its phase says, and let landed cards follow their slot while they bump. */
  private moveCards(dt: number): void {
    const beats = this.flow.beats;
    const op = this.openingPoint();
    const sy = this.stageY();
    const p = this.cardPose;
    for (let bi = 0; bi < beats.length; bi++) {
      const b = beats[bi] as BeatState;
      if (b.phase === 'queued' || b.phase === 'placed') continue;
      const n = b.plan.stacks.length;
      const ss = stageScale(n);
      const rank = rarityRank(b.plan.rarity);
      const k = b.dur > 0 ? Math.min(1, b.age / b.dur) : 1;
      for (let j = 0; j < n; j++) {
        const si = b.plan.stacks[j] as number;
        const v = this.views[si] as StackView;
        const sx = stageX(n, j, game.w / 2);
        v.tickAge += dt;
        switch (b.phase) {
          case 'rise':
            risePose(p, k, op.x, op.y, sx, sy, ss, v.side);
            break;
          case 'wobble':
            wobblePose(p, b.age, b.dur, rank, sx, sy, ss, v.tickAge);
            break;
          case 'flip':
            flipPose(p, k, sx, sy, ss);
            if (k >= FLIP_TURN) this.turnUp(v);
            break;
          case 'show':
            this.turnUp(v);
            showPose(p, b.age, b.dur, b.plan.last && rank >= 2, sx, sy, ss);
            break;
          case 'fly': {
            // Seconds of the flight in the plan's own units, whatever pace the director squeezed it to.
            const nominal = TIMES.fly + (n - 1) * TIMES.stagger;
            const local = ((b.dur > 0 ? (b.age * nominal) / b.dur : nominal) - j * TIMES.stagger) / TIMES.fly;
            const slot = this.slotInto(this.slot, si);
            flyPose(p, local, v.fromX, v.fromY, v.fromS, slot.x, slot.y, slot.s, v.side);
            break;
          }
        }
        v.s = p.s;
        v.card.fitTo(p.s);
        v.card.scale.x = p.s * p.flipX;
        v.card.position.set(p.x, p.y);
        v.card.rotation = p.rot;
        v.card.zIndex = b.phase === 'fly' ? 40 + j : 60 + j;
      }
    }
    // Landed cards bump once as they arrive; while the summary spreads they follow their slots.
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i] as StackView;
      if (!v.placed || (v.bump <= 0 && !this.spreading)) continue;
      v.bump = Math.max(0, v.bump - dt * 5);
      this.placeCard(v, i);
    }
  }

  private shakeFrame(dt: number): void {
    if (this.trauma > 0) {
      shakeOffset(this.off, this.trauma, this.clock, game.shakeScale);
      this.shaker.position.set(this.off.x, this.off.y);
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    } else if (this.shaker.x !== 0 || this.shaker.y !== 0) {
      this.shaker.position.set(0, 0);
    }
  }

  /** Shake the picture (not the buttons). The scene underneath is not what the player sees, so this shakes the reveal's own contents. */
  private kick(amount: number): void {
    if (motion.reduced || !game.shakeEnabled || game.shakeScale <= 0) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /* ------------------------------------------------------------------ taps */

  private onTap(): void {
    if (this.finished || this.leaving) return;
    this.flow.tap();
  }

  /* ------------------------------------------------------------------ events */

  private onEvent(e: FlowEvent): void {
    switch (e.type) {
      case 'land':
        this.land();
        break;
      case 'burst':
        this.burstStart(e.index, e.power);
        break;
      case 'hold':
        this.hold(e.duration);
        break;
      case 'pop':
        this.pop();
        break;
      case 'rise':
        this.rise(e.beat);
        break;
      case 'tick':
        this.wobbleTick(e.beat, e.n);
        break;
      case 'flip':
        this.flipStart();
        break;
      case 'show':
        this.show(e.beat);
        break;
      case 'fly':
        this.flyStart(e.beat);
        break;
      case 'place':
        this.place(e.beat);
        break;
      case 'summary':
        this.finish();
        break;
      case 'wobble':
        break;
    }
  }

  /** The chest hits the floor: a low thud, a medium haptic, a ring of dust, a puff and a small jolt, all on this frame. */
  private land(): void {
    audio.play('reel_stop', { volume: 0.9, pitch: 0.75 });
    haptic('medium');
    this.kick(0.2);
    this.fx.dustPuff(this.stage.x, this.stage.y);
    this.ring(this.stage.x, this.stage.y - 6, Color.paperLight, CHEST_SIZE * 1.1, 0.7);
  }

  /** A burst of the wind-up: the rattle sound, a haptic, paper bits and puffs in the colour of the best rarity thrown off the chest. */
  private burstStart(index: number, power: number): void {
    audio.play('chest_shake', { volume: 0.55 + 0.45 * power, pitch: 0.94 + 0.08 * index });
    haptic(power > 0.9 ? 'medium' : 'light');
    this.hideHint();
    this.hopMark = 0;
    this.kick(0.04 + 0.08 * power);
    const colors = tellColors(this.best);
    const top = this.stage.y - this.stage.halfH * 1.7;
    this.fx.ps.burst({ ...PUFF, palette: [colors.core, colors.edge] }, this.stage.x, top, { count: 0.6 + 0.8 * power, scale: 0.8 + 0.4 * power });
    this.popPaper(this.stage.x, top + 20, this.best, 0.5 + 0.7 * power);
  }

  /** The held breath: the open sound starts its creak so that its pop lands on the pop frame. */
  private hold(duration: number): void {
    audio.play('chest_open', { delay: Math.max(0, duration - TIMES.creak) });
    // The guide's silent beat before the biggest moment.
    if (this.best === 'legendary') audio.duck(1, duration);
    this.hideHint();
  }

  /** The pop: the open picture, a jump and recoil, the sunburst, one warm flash, a short shake, the cannon, stars and paper, the heaviest haptic. */
  private pop(): void {
    const colors = tellColors(this.best);
    this.stage.open();
    this.hideHint();
    const at = this.openingPoint();
    this.burst.burst(motion.reduced ? 0.3 : 0.42);
    haptic(this.best === 'legendary' ? 'jackpot' : 'heavy');
    screenFx.flash(mixColor(Color.paperLight, Rarity[this.best].light, 0.5), 0.4, 150);
    if (motion.reduced) return;
    this.kick(this.best === 'legendary' ? 0.6 : this.best === 'epic' ? 0.45 : 0.35);
    this.starburst(at.x, at.y, colors.core);
    this.ring(this.stage.x, this.stage.y - 6, Color.paperLight, CHEST_SIZE * 1.5, 0.8);
    const palette = [colors.core, colors.edge, Color.paperLight, Color.mustard];
    const big = this.best === 'common' ? 1 : 1.3;
    this.fx.ps.burst({ ...STARS, palette }, at.x, at.y, { scale: Math.min(1.4, big), count: this.best === 'common' ? 0.8 : 1.2 });
    this.popPaper(at.x, at.y, this.best, this.best === 'common' ? 1.6 : 2.4);
    const rs = Rarity[this.best];
    const cannon = { ...CANNON, palette: [rs.color, rs.dark, rs.light, Color.paperLight, Color.mustard] };
    const half = this.stage.bodyW * 0.45;
    const mods = { count: this.best === 'common' ? 0.7 : 1.2 };
    this.fx.ps.burst({ ...cannon, dir: -Math.PI / 2 + 0.5 }, at.x - half, at.y + 70, mods);
    this.fx.ps.burst({ ...cannon, dir: -Math.PI / 2 - 0.5 }, at.x + half, at.y + 70, mods);
    if (this.best !== 'common') this.fx.confettiRain({ count: this.best === 'rare' ? 30 : 50, x: at.x, y: at.y - 220, width: CHEST_SIZE });
  }

  /** A beat leaves the opening: the backs shoot up to centre stage. */
  private rise(bi: number): void {
    const beat = this.flow.beats[bi] as BeatState;
    const n = beat.plan.stacks.length;
    for (const si of beat.plan.stacks) {
      const v = this.views[si] as StackView;
      v.card.layout(stageScale(n), PLATE.w * stageScale(n) + STAGE_GAP);
      const op = this.openingPoint();
      // The back starts where its flight does: shown before the first frame of it, it would flash at the corner.
      v.card.position.set(op.x, op.y);
      v.card.fitTo(stageScale(n) * 0.3);
      v.card.visible = true;
    }
    audio.playStep('whoosh', Math.min(bi, 8), { volume: 0.45 });
    if (bi === 0) this.exitAge = 0;
  }

  /** Small rising sounds while a back wobbles: each one a step higher than the last, and a tap of paper for the high ranks. */
  private wobbleTick(bi: number, n: number): void {
    const beat = this.flow.beats[bi] as BeatState;
    const rank = rarityRank(beat.plan.rarity);
    audio.playStep('reel_tick', n + rank, { volume: 0.35 + 0.05 * n });
    if (rank >= 2) haptic('tap');
    for (const si of beat.plan.stacks) (this.views[si] as StackView).tickAge = 0;
  }

  /** The flip begins: the card's own sound, climbing with every flip of the opening. */
  private flipStart(): void {
    audio.playStep('card_flip', Math.min(this.flipped, 10));
    this.flipped++;
  }

  /** The back is edge-on: the face takes over and the count starts to tick up. */
  private turnUp(v: StackView): void {
    if (v.shown) return;
    v.shown = true;
    v.card.showFace();
    const total = v.stack.count;
    if (total <= 1 || motion.reduced) {
      v.card.count.text = 'x' + formatCount(total);
      return;
    }
    let last = 1;
    let ticks = 0;
    this.bag.runKeyed(v, {
      duration: Math.max(0.3, countUpDuration(total)),
      delay: 0.1,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        const now = countUpValue(1, total, k);
        v.card.count.text = 'x' + formatCount(now);
        if (now !== last && ++ticks <= 6) audio.playStep('reel_tick', ticks, { volume: 0.25 });
        last = now;
      },
      onComplete: () => {
        v.card.count.text = 'x' + formatCount(total);
      },
    });
  }

  /** The flip has landed: the flourish of the rank (a settle, a tape slap, a stamp, a ribbon, the sunburst, confetti, a breath of slow motion). */
  private show(bi: number): void {
    const beat = this.flow.beats[bi] as BeatState;
    const r = beat.plan.rarity;
    const isBest = beat.plan.last;
    const fl = FLOURISH[r];
    const plan = flourishOf(r, isBest);
    const n = beat.plan.stacks.length;
    audio.play(fl.sfx, { volume: isBest ? 1 : 0.65 });
    haptic(fl.haptic === 'jackpot' && !isBest ? 'heavy' : fl.haptic);
    const ss = stageScale(n);
    beat.plan.stacks.forEach((si, j) => {
      const v = this.views[si] as StackView;
      this.turnUp(v);
      const x = stageX(n, j, game.w / 2);
      const y = this.stageY();
      if (plan.dust) {
        this.fx.dustPuff(x, y + (PLATE.h * ss) / 2 - 10, { scale: 0.7 });
        return;
      }
      this.popPaper(x, y, r, r === 'rare' ? 0.8 : r === 'epic' ? 1.2 : 1.7);
      if (plan.tape) this.slapTape(v);
      // Of two cards side by side the left one's stamp hangs off its left edge: the right one's would land on its neighbour.
      if (plan.stamp) {
        const outer = n > 1 && j === 0 ? -1 : 1;
        this.stampCard(v, isBest ? 0.3 : 0.2, outer, (outer > 0 ? game.w - x : x) / ss);
      }
      if (isBest && rarityRank(r) >= 2) v.card.ribbon();
    });
    if (fl.shake > 0 && (isBest || r !== 'legendary')) this.kick(isBest ? fl.shake : fl.shake * 0.5);
    if (plan.sun) this.burst.punch();
    if (plan.confetti) {
      audio.stinger('jackpot');
      this.fx.confettiRain({ count: 70, x: game.w / 2, y: Math.max(40, this.stageY() - 360) });
    }
    const slow = isBest ? SLOW[r] : undefined;
    if (slow && !motion.reduced) {
      this.slowLeft = slow.for;
      this.slowFactor = slow.factor;
    }
  }

  /** The cards of a beat leave the stage for their places. The counts are final by now, whether they finished ticking or not. */
  private flyStart(bi: number): void {
    const beat = this.flow.beats[bi] as BeatState;
    audio.playStep('whoosh', Math.min(bi, 8), { volume: 0.3 });
    for (const si of beat.plan.stacks) {
      const v = this.views[si] as StackView;
      this.turnUp(v);
      this.bag.killKeyed(v);
      v.card.count.text = 'x' + formatCount(v.stack.count);
      v.fromX = v.card.x;
      v.fromY = v.card.y;
      v.fromS = v.s;
      v.card.scale.x = v.s;
      v.card.rotation = 0;
      // The name is set for the cell it lands in.
      v.card.layout(v.s, this.buildGrid.cellW);
    }
  }

  /** The cards land: each one bumps in its place, with a pat on the board. */
  private place(bi: number): void {
    const beat = this.flow.beats[bi] as BeatState;
    for (const si of beat.plan.stacks) {
      const v = this.views[si] as StackView;
      v.placed = true;
      v.bump = 1;
      this.placeCard(v, si);
      audio.playStep('place', Math.min(this.landed, 8), { volume: 0.35 });
      this.landed++;
    }
  }

  /* ------------------------------------------------------------------ pieces */

  /** One flat disc that swells and fades over the opening: the paper flash of the pop. */
  private starburst(x: number, y: number, color: number): void {
    const info = fxTex('starburst');
    const disc = new Sprite(info.texture);
    disc.anchor.set(info.ax, info.ay);
    disc.tint = color;
    disc.position.set(x, y);
    this.flashLayer.addChild(disc);
    this.bag.run({
      duration: 0.34,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        disc.scale.set((CHEST_SIZE / info.w) * (0.3 + 1.4 * k));
        disc.rotation = 0.5 * k;
        disc.alpha = 0.9 * (1 - k);
      },
      onComplete: () => disc.destroy(),
    });
  }

  /** A flat ring of dust on the floor, squashed to an ellipse, growing and fading. */
  private ring(x: number, y: number, color: number, size: number, alpha: number): void {
    const info = fxTex('ring');
    const ring = new Sprite(info.texture);
    ring.anchor.set(info.ax, info.ay);
    ring.tint = color;
    ring.position.set(x, y);
    this.flashLayer.addChild(ring);
    this.bag.run({
      duration: 0.45,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        const s = (size / info.w) * (0.3 + 1.2 * k);
        ring.scale.set(s, s * 0.3);
        ring.alpha = alpha * (1 - k);
      },
      onComplete: () => ring.destroy(),
    });
  }

  /** Paper bits in the rarity's colours thrown from (x, y). */
  private popPaper(x: number, y: number, rarity: ChestRarity, size: number): void {
    const rs = Rarity[rarity];
    this.fx.ps.burst({ ...PAPER_POP, palette: [rs.color, rs.dark, rs.light, Color.paperLight, Color.mustard] }, x, y, { scale: Math.min(1.4, size), count: size });
  }

  private hideHint(): void {
    if (this.hintGone) return;
    this.hintGone = true;
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.2,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.hint.alpha = 1 - k;
      },
      onComplete: () => {
        this.hint.visible = false;
      },
    });
  }

  /** A strip of tape slapped across the card's top corner. */
  private slapTape(v: StackView, animate = true): void {
    if (v.tape) return;
    const { w, h } = PLATE;
    const spec = SLAP_TAPE[v.stack.rarity];
    const tape = tapeStrip({ name: spec.name, pattern: spec.pattern, w: w * 0.5, h: 34, angle: -28 });
    tape.position.set(-w / 2 + w * 0.16, -h / 2 + 12);
    v.card.face.addChild(tape);
    v.tape = tape;
    if (animate && !motion.reduced) {
      tape.scale.set(1.9);
      tape.alpha = 0;
      this.bag.run({
        duration: 0.26,
        ease: backOut(2.4),
        onUpdate: (k) => {
          tape.scale.set(1.9 - 0.9 * k);
          tape.alpha = Math.min(1, k * 4);
        },
        onComplete: () => tape.scale.set(1),
      });
    }
  }

  /**
   * The rarity's name stamped on the card's outer edge (`outer` 1 the right, -1 the left, `room` plate units to the screen's edge on that side):
   * it arrives big (as big as the room allows) and transparent, lands with a squash (and a thud on that frame), stays for `hold` seconds and
   * fades so the portrait is clear again. One tween drives all of it, so the stamp is gone only after its last move.
   */
  private stampCard(v: StackView, hold: number, outer: 1 | -1, room: number): void {
    const rs = Rarity[v.stack.rarity];
    const stamp = stampMark(rarityName(v.stack.rarity), { size: STAMP_SIZE, pad: 12, color: rs.dark, tilt: -0.2 * outer });
    // Half a hand's width over the photo's outer edge, level with the middle: the face is up and in the centre, the tape in the upper left corner,
    // the count at the foot and the name under the plate, so the side of the photo is where a stamp can land. Its size on stage is the card's.
    const half = stamp.getLocalBounds().width / 2;
    const spot = stampSpot(half, outer);
    stamp.position.set(spot.x, spot.y);
    v.card.face.addChild(stamp);
    v.stamp = stamp;
    const tilt = stamp.rotation;
    const from = stampFrom(room, half, STAMP_FROM);
    const total = STAMP_SLAM + STAMP_BUMP + hold + STAMP_FADE;
    let landed = false;
    const land = (): void => {
      if (landed) return;
      landed = true;
      stampThud();
      this.kick(0.1);
    };
    if (motion.reduced) land();
    this.bag.run({
      duration: motion.reduced ? hold : total,
      ease: Ease.linear,
      onUpdate: (k) => {
        if (motion.reduced) return;
        const t = k * total;
        if (t < STAMP_SLAM) {
          const u = Ease.cubicIn(t / STAMP_SLAM);
          stamp.scale.set(from - (from - 1) * u);
          stamp.alpha = Math.min(0.94, u * 3);
          stamp.rotation = tilt - 0.2 * outer * (1 - u);
          return;
        }
        land();
        const after = t - STAMP_SLAM;
        stamp.rotation = tilt;
        stamp.scale.set(after < STAMP_BUMP ? 1 + 0.09 * Math.sin((after / STAMP_BUMP) * Math.PI) : 1);
        const fade = after - STAMP_BUMP - hold;
        stamp.alpha = 0.94 * (fade > 0 ? 1 - fade / STAMP_FADE : 1);
      },
      onComplete: () => {
        stamp.destroy({ children: true });
        v.stamp = undefined;
      },
    });
  }

  /* ------------------------------------------------------------------ the end */

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    for (const id of this.pile.ids) profile.ackReveal(id);
    this.skip.visible = false;
    this.hideHint();
    this.burst.stop(0.5);
    // With the skip button gone the title has the whole row: it slides to the middle of the screen.
    const fromX = this.title.x;
    this.title.setMaxWidth(game.w - 48);
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.25,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.title.x = lerp(fromX, game.w / 2, k);
      },
    });
    const wild = this.stacks.filter((s) => !s.unit).reduce((a, s) => a + s.count, 0);
    const lines = [t('reveal.total', { n: totalCards(this.stacks) })];
    if (wild > 0) lines[0] += '  ·  ' + t('reveal.wildTotal', { n: wild });
    if (this.pile.count > 1) lines.push(t('reveal.chests', { n: this.pile.count }));
    if (this.pile.overflowGold > 0) lines.push(t('reveal.overflow', { n: this.pile.overflowGold }));
    lines.forEach((text, k) => {
      const l = new PaperLabel({ text, size: k === 0 ? 34 : 26, paper: Color.paperLight, torn: 'ends', maxWidth: game.w - 60 });
      l.position.set(0, (k - (lines.length - 1)) * SUMMARY_LINE);
      this.summary.addChild(l);
    });
    this.summary.alpha = 0;
    this.done.visible = true;
    this.done.scale.set(0.01);
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.25,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.summary.alpha = k;
      },
    });
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.3,
      ease: backOut(2.4),
      onUpdate: (k) => this.done.scale.set(k),
      onComplete: () => {
        this.done.scale.set(1);
        if (!motion.reduced) this.done.startPulse();
      },
    });
    this.spread();
  }

  /** The cards that built up in the strip at the bottom spread over the whole area, and the best one is marked. */
  private spread(): void {
    const mark = (): void => this.markBest();
    if (motion.reduced || this.expand >= 1) {
      this.expand = 1;
      this.applyGrid();
      mark();
      return;
    }
    this.spreading = true;
    this.bag.run({
      duration: 0.45,
      ease: Ease.cubicInOut,
      onUpdate: (k) => {
        this.expand = k;
        for (let i = 0; i < this.views.length; i++) if ((this.views[i] as StackView).placed) this.placeCard(this.views[i] as StackView, i);
      },
      onComplete: () => {
        this.expand = 1;
        this.spreading = false;
        this.applyGrid();
        mark();
      },
    });
  }

  /** A gold star sticker pops onto the best card of an opening that held anything above common. */
  private markBest(): void {
    const v = this.views[this.views.length - 1];
    if (!v || rarityRank(v.stack.rarity) < 1) return;
    const sticker = v.card.markBest();
    if (motion.reduced) return;
    sticker.scale.set(0.01);
    this.bag.run({
      duration: 0.3,
      ease: backOut(3),
      onUpdate: (k) => sticker.scale.set(k),
      onComplete: () => sticker.scale.set(1),
    });
    audio.play('star', { volume: 0.5 });
  }

  /** Jump to the finished state at once: every card shown and counted, then the summary. */
  private skipToEnd(): void {
    if (this.finished) return;
    this.bag.killAll();
    audio.play('ui_click');
    this.chestLayer.visible = false;
    // Its fade was one of the tweens just stopped: it must not stay half faded over the cards.
    this.hint.visible = false;
    this.hintGone = true;
    this.burst.stop(0.2);
    this.fx.clear();
    this.flashLayer.removeChildren().forEach((c) => c.destroy());
    this.trauma = 0;
    this.shaker.position.set(0, 0);
    this.slowLeft = 0;
    this.expand = 1;
    this.applyGrid();
    this.views.forEach((v, i) => {
      const arriving = !v.placed;
      v.shown = true;
      v.placed = true;
      v.bump = 0;
      v.card.visible = true;
      v.card.alpha = 1;
      v.card.showFace();
      this.placeCard(v, i);
      if (arriving) this.settleIn(v, i);
      v.card.count.text = 'x' + formatCount(v.stack.count);
      // A skipped card keeps the tape its rarity earns but not the stamp: the summary stays readable.
      v.stamp?.destroy({ children: true });
      v.stamp = undefined;
      if (v.tape) {
        v.tape.scale.set(1);
        v.tape.alpha = 1;
      } else if (flourishOf(v.stack.rarity, false).tape) this.slapTape(v, false);
    });
    this.flow.skip();
  }

  /** A card the skip brought to its slot does not blink on: it pops up there, one after another. */
  private settleIn(v: StackView, index: number): void {
    if (motion.reduced) return;
    const s = v.s;
    const spring = backOut(2);
    v.card.alpha = 0;
    v.card.fitTo(s * 0.7);
    this.bag.run({
      duration: 0.22,
      delay: Math.min(0.24, index * 0.025),
      ease: Ease.linear,
      onUpdate: (k) => {
        v.card.fitTo(s * (0.7 + 0.3 * spring(k)));
        v.card.alpha = Math.min(1, k * 4);
      },
      onComplete: () => {
        v.card.fitTo(s);
        v.card.alpha = 1;
      },
    });
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.done.setEnabled(false);
    audio.play('ui_confirm');
    const target = { x: game.w * 0.3, y: game.h + 160 };
    this.bag.run({
      duration: motion.reduced ? 0.01 : 0.38,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.ui.alpha = 1 - k;
        this.views.forEach((v, i) => {
          const slot = this.slotInto(this.slot, i);
          const d = Math.min(1, k * 1.3 - i * 0.015);
          const e = Math.max(0, d);
          v.card.x = lerp(slot.x, target.x, e);
          v.card.y = lerp(slot.y, target.y, e * e);
          v.card.fitTo(slot.s * (1 - 0.7 * e));
          v.card.alpha = 1 - e;
        });
        this.root.alpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      },
      onComplete: () => this.root.destroy({ children: true }),
    });
  }

  /** Everything the reveal holds is released here, whichever way it ends (the player leaves, or the app takes the screen down). */
  private teardown(): void {
    if (this.tornDown) return;
    this.tornDown = true;
    window.removeEventListener('keydown', this.onKey);
    this.offUpdate();
    this.offResize();
    this.bag.killAll();
    this.fx.destroy();
    this.resolve();
  }
}

/**
 * Play the opening of an already decided chest, or of a pile of them opened in one go (stored results, all of one kind), and
 * resolve when the player leaves the screen. Anything else resolves at once.
 */
export function playChestReveal(results: readonly ChestResult[]): Promise<void> {
  return results.length > 0 ? new ChestReveal(mergePile(results)).closed : Promise.resolve();
}
