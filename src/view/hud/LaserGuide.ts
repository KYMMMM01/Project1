/**
 * The guided first use of the laser pointer (see laserGuideFlow.ts for the steps). Unlike the first run's forced steps it
 * never holds the clock and never blocks a touch: the dim only paints, so the player can skip ahead by doing the real thing.
 * Step 1 spotlights the button (its press opens the explanation card), step 2 points at the lane beside the leading enemy
 * while the lane glows, step 3 names the marks and the cats' reaction once the dot is down.
 */
import { Container, Graphics } from 'pixi.js';
import { t } from '@/core/i18n';
import { damp } from '@/core/math';
import { Color, Dim, drawDashedRect, paperSeed, tooltip } from '@/ui';
import type { EnemyState } from '@/game';
import type { BattleLayout } from '../context';
import { startAim, stopAim } from '../aim';
import type { HudEnv } from './env';
import { Hand } from './Hand';
import type { Rect } from './layoutMath';
import { guideDue, LaserGuideFlow, SEE_FOR, type GuideStep } from './laserGuideFlow';

const MARGIN = 16;
/** Seconds into the last step after which the closing line replaces the one that names the marks. */
const SEE_SPLIT = SEE_FOR * 0.55;
const HAND_SCALE = 0.8;
/** Beside the button the hand is smaller: its body (about 76 px) then ends before the summon button's label does in English. */
const BESIDE_SCALE = 0.7;

/** The enemy furthest along the loop, or null: the dot is best put where the enemies are about to be. */
export function leadEnemy(enemies: ReadonlyArray<EnemyState>): EnemyState | null {
  let lead: EnemyState | null = null;
  for (const e of enemies) if (!lead || e.travelled > lead.travelled) lead = e;
  return lead;
}

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
  private layout: BattleLayout;

  constructor(
    private readonly env: HudEnv,
    /** The laser button's rectangle in scene space. */
    private readonly target: () => Rect,
    /** A normal run starts the guide by itself; the tutorial run holds it back until its laser lesson begins (`arm`). */
    private armed = true,
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
      const world = { phase: battle.phase, enemies: battle.enemyCount, ready: !L.active && L.cooldown <= 0, busy: busy || (tooltip.visible && tooltip.target !== this.anchor) };
      if (!teach.ready || !reveal.laser || !this.armed || !guideDue(world)) return;
      hints.used('laser');
      flow.start();
    }
    const modal = this.env.modalCount > 0;
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
      // The card is up: the guide waits behind it (the kit's bubble would sit on top of it).
      this.layer.visible = false;
      if (tooltip.target === this.anchor) tooltip.hide();
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
      const x = Math.max(0, r.x - MARGIN);
      const y = Math.max(0, r.y - MARGIN);
      const w = Math.min(this.layout.w - x, r.w + MARGIN * 2);
      const h = r.h + MARGIN * 2;
      // The warm-brown dim with a hole round the button, edged with the cream dashed line of the first run's spotlight.
      this.dim.rect(0, 0, this.layout.w, this.layout.h).fill({ color: Dim.backdrop, alpha: Dim.backdropAlpha * 0.8 });
      this.dim.roundRect(x, y, w, h, 40).cut();
      drawDashedRect(this.ring, x, y, w, h, { radius: 40, color: Color.paper, width: 5, seed: this.seed });
      // The hand lies on the button's left edge, finger toward it: the call-wave offer above the button and the seconds under it stay clear.
      this.hand.rotation = Math.PI / 2;
      this.hand.scale.set(BESIDE_SCALE);
      this.hand.position.set(x + 6, r.y + r.h / 2);
      this.hand.tap();
      this.anchorAt(r.x + r.w / 2, y);
    } else if (step === 'place') {
      this.line = t('hud.laserGuide.place');
      this.hand.scale.set(HAND_SCALE);
      this.hand.tap();
      this.handX = this.handY = 0;
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
    const lead = leadEnemy(this.env.battle.enemies);
    if (!lead) return;
    const { ctx } = this.env;
    const tx = ctx.toSceneX(lead.x);
    const ty = ctx.toSceneY(lead.y);
    const first = this.handX === 0 && this.handY === 0;
    this.handX = first ? tx : damp(this.handX, tx, 0.1, dt);
    this.handY = first ? ty : damp(this.handY, ty, 0.1, dt);
    // Above the middle of the field the hand hangs down from its fingertip, below it the hand comes down onto the spot.
    const below = this.handY > this.layout.h * 0.45;
    this.hand.rotation = below ? Math.PI : 0;
    this.hand.position.set(this.handX, this.handY);
  }

  private anchorAt(x: number, y: number): void {
    this.anchor.position.set(x, y);
  }

  /** The kit's bubble on the invisible marker, brought back whenever something else hid it. */
  private keepSaying(text: string): void {
    if (tooltip.visible && tooltip.target === this.anchor && this.said === text) return;
    this.said = text;
    tooltip.show(this.anchor, { text });
  }

  private hide(): void {
    if (!this.layer.visible && this.shown === '') return;
    this.layer.visible = false;
    this.shown = '';
    this.said = '';
    if (tooltip.target === this.anchor) tooltip.hide();
  }

  destroy(): void {
    if (tooltip.target === this.anchor) tooltip.hide();
    stopAim();
    this.layer.destroy({ children: true });
  }
}
