/**
 * The guided first use of the laser pointer (see laserGuideFlow.ts for the steps). Unlike the first run's forced steps it
 * never holds the clock and never blocks a touch: the dim only paints, so the player can skip ahead by doing the real thing.
 * Step 1 spotlights the button (its press opens the explanation card), step 2 points at the lane beside the leading enemy
 * while the lane glows, step 3 names the marks and the cats' reaction once the dot is down.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { damp } from '@/core/math';
import { Color, Dim, drawDashedRect, paperSeed } from '@/ui';
import type { BattleLayout } from '../context';
import { startAim, stopAim } from '../aim';
import { info } from '../info';
import type { HudEnv } from './env';
import { Hand } from './Hand';
import { bestRimPose, FROM_BELOW, type Keep, pawBounds, pawRotation, rimSpots, soften } from './handMath';
import { INFO_R, laserFace, LASER_INFO, LASER_RING, LASER_SPOT, type Rect, spotRadius, spotWindow } from './layoutMath';
import { followedEnemy, guideDue, LaserGuideFlow, ridingArm, SEE_FOR, type GuideStep, type RideArm } from './laserGuideFlow';

/** How far from the button's centre the bubble's tail points, away from the paw. */
const TAIL_SIDE = 40;
/** Seconds into the last step after which the closing line replaces the one that names the marks. */
const SEE_SPLIT = SEE_FOR * 0.55;
/** Tilt of the paw riding the lane, off the vertical. */
const RIDE_TILT = 0.44;
/** Key of the guide's own bubble (src/view/info.ts). */
const SAY = 'laser-guide';

export class LaserGuide {
  readonly flow = new LaserGuideFlow();
  private readonly layer = new Container();
  private readonly dim = new Graphics();
  private readonly ring = new Graphics();
  private readonly anchor = new Graphics();
  private readonly hand = new Hand();
  private readonly seed = paperSeed();
  private shown: GuideStep | '' = '';
  private line = '';
  /** The words the bubble is showing now. */
  private said = '';
  private seeAge = 0;
  private handX = 0;
  private handY = 0;
  /** The enemy the paw rides, and the side its arm trails from (they are kept until they have to change: laserGuideFlow.ts). */
  private riding: number | null = null;
  private lean: RideArm | null = null;
  private layout: BattleLayout;

  constructor(
    private readonly env: HudEnv,
    /** The laser button's rectangle in scene space. */
    private readonly target: () => Rect,
    /** A normal run starts the guide by itself; the tutorial run holds it back until its laser lesson begins (`arm`). */
    private armed = true,
    /** What the paw should keep off: the cats, the buttons, the lane (the HUD's own list of what a bubble should not cover). */
    private readonly keep: () => readonly Keep[] = () => [],
  ) {
    this.layout = env.layout();
    this.dim.eventMode = 'none';
    this.ring.eventMode = 'none';
    this.anchor.rect(-2, -2, 4, 4).fill({ color: Color.paper, alpha: 0.01 });
    this.anchor.eventMode = 'none';
    this.layer.eventMode = 'none';
    this.layer.addChild(this.dim, this.ring, this.anchor, this.hand);
    this.layer.visible = false;
    env.ctx.layers.overlay.addChild(this.layer);
    env.on(env.battle.events, 'laser', () => this.flow.onDot());
  }

  /** The guide is at a step that waits for the player's touch (the button, the lane): the tutorial's laser lesson holds the clock for it. */
  get holdsClock(): boolean {
    return this.layer.visible && (this.flow.step === 'press' || this.flow.step === 'place');
  }

  /** The tutorial's laser lesson has begun: the guide may start as soon as a wave gives it enemies to mark. */
  arm(): void {
    this.armed = true;
  }

  /** The player has been explained the laser (the card closed any way) or pressed the button to aim: on to placing the dot. */
  explained(): void {
    this.flow.onCardClosed();
  }

  resize(l: BattleLayout): void {
    this.layout = l;
    this.shown = '';
  }

  update(dt: number, busy: boolean): void {
    const { battle, reveal, hints } = this.env;
    const teach = this.env.teach;
    const flow = this.flow;
    if (flow.done || teach.guided) {
      this.hide();
      return;
    }
    if (flow.step === 'wait') {
      const L = battle.laser;
      // Another bubble on screen (a hint, an enemy card) counts as busy too: the guide waits for its turn.
      const world = { phase: battle.phase, enemies: battle.enemyCount, ready: !L.active && L.cooldown <= 0, busy: busy || (info.visible && info.key !== SAY) };
      if (!teach.ready || !reveal.laser || !this.armed || !guideDue(world)) return;
      hints.used('laser');
      flow.start();
    }
    // A card, a popup, another lesson (the elite and the boss cut in on a guide that is waiting for its dot), a drag or a selected cat
    // (its sheet covers the row the bubble would sit over) puts the guide on hold: its bubble never lies over what is being said or used.
    const modal = busy || this.env.modalCount > 0 || this.env.ctx.selected !== null;
    if (flow.tick(dt, modal)) {
      teach.noteGuided();
      this.env.progress.markTaught('laser');
      stopAim();
      this.hide();
      return;
    }
    if (flow.step === 'see') this.seeAge += dt;
    this.draw(dt, modal);
  }

  private draw(dt: number, modal: boolean): void {
    const step = this.flow.step;
    if (step === 'wait' || step === 'done') return;
    if (modal) {
      // A card or the selection sheet is up: the guide waits behind it.
      this.layer.visible = false;
      info.close(true, SAY);
      return;
    }
    this.layer.visible = true;
    if (step !== this.shown) this.enter(step);
    if (step === 'place') {
      // Keep the lane lit for as long as the player is being asked to use it.
      startAim(1);
      this.follow(dt);
    } else if (step === 'see') {
      stopAim();
      this.line = t(this.seeAge < SEE_SPLIT ? 'hud.laserGuide.see' : 'hud.laserGuide.done');
    }
    this.keepSaying(this.line);
  }

  private enter(step: GuideStep): void {
    this.shown = step;
    this.seeAge = 0;
    const r = this.target();
    this.dim.clear();
    this.ring.clear();
    this.hand.visible = step !== 'see';
    if (step === 'press') {
      this.line = t('hud.laserGuide.press');
      // The warm-brown dim with a round hole about the button's centre, edged with the cream dashed line of the first run's spotlight. It stays
      // clear of the ring by LASER_SPOT on every side, which leaves the "i" mark outside the line.
      const win = spotWindow(r, LASER_SPOT, 2, this.layout);
      const corner = spotRadius(win, 40);
      this.dim.rect(0, 0, this.layout.w, this.layout.h).fill({ color: Dim.backdrop, alpha: Dim.backdropAlpha * 0.8 });
      this.dim.roundRect(win.x, win.y, win.w, win.h, corner).cut();
      drawDashedRect(this.ring, win.x, win.y, win.w, win.h, { radius: corner, color: Color.paper, width: 5, seed: this.seed });
      // The paw pats the button beside its glyph (on the band between the glyph and the face's edge) from the side that has room: the screen
      // ends right under the button, so it comes down from above; off the glyph, the call-wave offer over the button, the seconds under it and the "i" mark.
      const face = laserFace(r);
      const k = r.w / (2 * LASER_RING);
      const mark: Keep = { x: face.centre.x + LASER_INFO.x * k - INFO_R * k, y: face.centre.y + LASER_INFO.y * k - INFO_R * k, w: INFO_R * 2 * k, h: INFO_R * 2 * k, weight: 6 };
      const { tip, pose } = bestRimPose(rimSpots(face.centre, face.faceR, face.glyphR), { bounds: pawBounds(this.layout), keep: [...soften(this.keep()), mark], prefer: FROM_BELOW });
      this.hand.place(tip.x, tip.y, pose.rotation);
      this.hand.tap();
      // The bubble's tail points at the window's top on the side the paw is not on, so the tail never lies across the pad.
      this.anchorAt(face.centre.x - Math.sign(tip.x - face.centre.x) * TAIL_SIDE, win.y);
    } else if (step === 'place') {
      this.line = t('hud.laserGuide.place');
      this.hand.tap();
      this.handX = this.handY = 0;
      this.riding = null;
      this.lean = null;
      this.follow(1);
      // The words stay on the button (a bubble does not follow a moving marker); the hand does the pointing.
      this.anchorAt(r.x + r.w / 2, r.y);
    } else {
      // The marks are on: the words stay on the button too, so they never cover the enemies that carry the marks.
      this.anchorAt(r.x + r.w / 2, r.y);
    }
    this.said = '';
  }

  /** The hand rides the leading enemy along the lane: tap here, in front of the cats' shots. */
  private follow(dt: number): void {
    const lead = followedEnemy(this.env.battle.enemies, this.riding);
    if (!lead) return;
    this.riding = lead.uid;
    const { ctx } = this.env;
    const tx = ctx.toSceneX(lead.x);
    const ty = ctx.toSceneY(lead.y);
    const first = this.handX === 0 && this.handY === 0;
    this.handX = first ? tx : damp(this.handX, tx, 0.1, dt);
    this.handY = first ? ty : damp(this.handY, ty, 0.1, dt);
    // Above the middle of the field the arm trails below the spot, below it the arm comes down from above; near the right edge it leans left.
    const arm = ridingArm(this.handX, this.handY, this.layout.w, this.layout.h, this.lean);
    this.lean = arm;
    this.hand.turnTo(pawRotation(arm, RIDE_TILT));
    this.hand.position.set(this.handX, this.handY);
  }


  private anchorAt(x: number, y: number): void {
    this.anchor.position.set(x, y);
  }

  /** The words on the invisible marker, brought back whenever something else hid them. */
  private keepSaying(text: string): void {
    if (info.visible && info.key === SAY && this.said === text) return;
    this.said = text;
    info.show(SAY, this.anchor, { text }, { sticky: true, prefer: 'above' });
  }

  private hide(): void {
    if (!this.layer.visible && this.shown === '') return;
    this.layer.visible = false;
    this.shown = '';
    this.said = '';
    info.close(true, SAY);
  }

  destroy(): void {
    info.close(false, SAY);
    stopAim();
    this.layer.destroy({ children: true });
  }
}
