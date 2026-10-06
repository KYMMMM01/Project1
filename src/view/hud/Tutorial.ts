/**
 * The first run's three forced steps: summon three times, merge the two identical kittens, pick one
 * of three. A spotlight dims everything except the target and a hand shows the gesture. The clock is
 * held (reason 'tutorial') while the summon step waits for taps, and runs for a moment after each tap
 * so the summon pops play out. The merge step cannot hold it (the field ignores touches while paused),
 * and the pick step is carried by the pick popup itself.
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { t } from '@/core/i18n';
import type { UnitId } from '@/game';
import { cellCenterX, cellCenterY, CELL_H, CELL_W } from '@/game/geometry';
import { Ease } from '@/core/tween';
import { Color, Dim, drawDashedRect, motion, paperSeed, tooltip, TweenBag } from '@/ui';
import type { BattleLayout } from '../context';
import type { HudEnv } from './env';
import { Hand } from './Hand';
import type { Rect } from './layoutMath';
import { NUDGE_FOR, TUTORIAL_SUMMONS, TutorialFlow, findMergePair, nudgeDue } from './tutorialFlow';

/** How long the clock runs after a tap so the new kitten can pop in before the next prompt. */
const BREATH = 0.75;
const MARGIN = 18;
/** The hand points at the button's top-right corner: its body then covers neither the cost label nor the screen's bottom edge. */
const HAND_X = 0.84;
const HAND_DY = 10;

export class Tutorial {
  readonly flow = new TutorialFlow();
  private readonly layer = new Container();
  private readonly dim = new Graphics();
  private readonly ring = new Graphics();
  private readonly blockers: Container[] = [];
  private readonly anchor = new Graphics();
  private readonly hand = new Hand();
  private readonly nudgeHand = new Hand();
  private readonly bag = new TweenBag();
  private target: (() => Rect | null) | null = null;
  private text = '';
  private drag: { a: number; b: number } | null = null;
  private held = false;
  private carrying = false;
  private shown = false;
  private paintedKey = '';
  private readonly seed = paperSeed();
  private idle = 0;
  private nudgeLeft = 0;
  private nudges = 0;
  private layout: BattleLayout;

  constructor(
    private readonly env: HudEnv,
    private readonly summonTarget: () => Rect,
    /** Keeps the summon button breathing while the pointer is on it. */
    private readonly pulse: (on: boolean) => void,
  ) {
    this.layout = env.layout();
    const parent = env.ctx.layers.overlay;
    this.dim.eventMode = 'none';
    this.ring.eventMode = 'none';
    for (let i = 0; i < 4; i++) {
      const b = new Container();
      b.eventMode = 'static';
      this.blockers.push(b);
    }
    this.anchor.rect(-2, -2, 4, 4).fill({ color: Color.paper, alpha: 0.01 });
    this.anchor.eventMode = 'none';
    this.layer.addChild(this.dim, ...this.blockers, this.ring, this.anchor, this.hand);
    this.layer.visible = false;
    this.nudgeHand.visible = false;
    parent.addChild(this.layer, this.nudgeHand);

    const b = env.battle;
    if (b.wave > 0 || b.getStats().summons > 0) {
      this.flow.step = 'free';
      return;
    }
    // The scripted free summons arrive as 'script', the button's own as 'button'; both are the player's taps.
    env.on(b.events, 'summon', ({ source }) => {
      if ((source === 'button' || source === 'script') && this.flow.step === 'summon') this.onSummon();
      else if (source === 'choice') this.flow.onPicked();
      this.idle = 0;
      this.endNudge();
    });
    env.on(b.events, 'merge', () => {
      if (this.flow.onMerge()) this.end();
    });
    // While the player holds a cat the hand would sit on the merge bubble: it steps out of the way.
    env.on(env.ctx.events, 'drag', ({ from }) => {
      this.carrying = from !== null;
      this.hand.visible = !this.carrying;
      if (this.carrying) this.endNudge();
    });
    env.on(b.events, 'summonOffer', () => {
      if (this.flow.onOffer()) this.end();
    });
    this.begin();
  }

  /** True while the pick popup should carry the pointer. */
  get guidingPick(): boolean {
    return this.flow.step === 'pick';
  }

  private begin(): void {
    this.hold(true);
    this.focusSummon();
  }

  private hold(on: boolean): void {
    if (on === this.held) return;
    this.held = on;
    this.env.ctx.setPaused('tutorial', on);
  }

  // ───────────────────────── steps ─────────────────────────

  private onSummon(): void {
    const changed = this.flow.onSummon();
    this.clear();
    this.hold(false);
    this.bag.call(BREATH, () => {
      if (this.flow.step === 'summon') {
        this.hold(true);
        this.focusSummon();
      } else if (changed && this.flow.step === 'merge') this.focusMerge();
    });
  }

  private focusSummon(): void {
    this.drag = null;
    this.text = t('hud.tut.summon', { n: this.flow.summons, total: TUTORIAL_SUMMONS });
    this.target = () => this.summonTarget();
    this.show();
    this.pulse(true);
    const r = this.target();
    if (r) {
      this.hand.position.set(r.x + r.w * HAND_X, r.y + HAND_DY);
      this.hand.tap();
    }
  }

  private focusMerge(): void {
    const board = this.env.battle.units.map((u) => (u ? u.id : null));
    const pair = findMergePair(board as ReadonlyArray<UnitId | null>);
    if (!pair) {
      this.flow.step = 'free';
      this.end();
      return;
    }
    // The clock keeps running here: the field ignores touches while any pause reason is active, and this step needs the drag.
    this.hold(false);
    this.drag = { a: pair[0], b: pair[1] };
    this.text = t('hud.tut.merge');
    this.target = () => this.mergeRect();
    this.show();
    const a = this.cellPoint(pair[0]);
    const b = this.cellPoint(pair[1]);
    this.hand.position.set(a.x, a.y);
    this.hand.drag(a.x, a.y, b.x, b.y);
  }

  private cellPoint(cell: number): { x: number; y: number } {
    return { x: this.env.ctx.toSceneX(cellCenterX(cell)), y: this.env.ctx.toSceneY(cellCenterY(cell)) };
  }

  private mergeRect(): Rect | null {
    if (!this.drag) return null;
    const a = this.cellPoint(this.drag.a);
    const b = this.cellPoint(this.drag.b);
    const x0 = Math.min(a.x, b.x) - CELL_W / 2;
    const y0 = Math.min(a.y, b.y) - CELL_H / 2;
    const x1 = Math.max(a.x, b.x) + CELL_W / 2;
    const y1 = Math.max(a.y, b.y) + CELL_H / 2;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** The forced steps are over (or skipped): release the clock and remove every trace. */
  private end(): void {
    this.clear();
    this.hold(false);
  }

  // ───────────────────────── drawing ─────────────────────────

  private show(): void {
    this.shown = true;
    this.layer.visible = true;
    this.paint();
    if (!motion.reduced) {
      this.layer.alpha = 0;
      this.bag.runKeyed(this.layer, { duration: 0.2, ease: Ease.cubicOut, onUpdate: (k) => (this.layer.alpha = k), onComplete: () => (this.layer.alpha = 1) });
      this.bag.runKeyed(this.ring, {
        duration: 0.6,
        ease: Ease.sineInOut,
        yoyo: true,
        repeat: -1,
        onUpdate: (k) => (this.ring.alpha = 0.55 + 0.45 * k),
      });
    }
  }

  private paint(): void {
    const r = this.target?.();
    if (!r) return;
    this.paintedKey = `${r.x}|${r.y}|${r.w}|${r.h}`;
    const x = Math.max(0, r.x - MARGIN);
    const y = Math.max(0, r.y - MARGIN);
    const w = Math.min(this.layout.w - x, r.w + MARGIN * 2);
    const h = r.h + MARGIN * 2;
    const W = this.layout.w;
    const H = this.layout.h;
    // The warm-brown dim with a hole cut out of it; the hole is edged with a dashed cream line, like a cut-out window.
    this.dim.clear().rect(0, 0, W, H).fill({ color: Dim.backdrop, alpha: Dim.backdropAlpha });
    this.dim.roundRect(x, y, w, h, 32).cut();
    this.ring.clear();
    drawDashedRect(this.ring, x, y, w, h, { radius: 32, color: Color.paper, width: 5, seed: this.seed });
    const rects: Array<[number, number, number, number]> = [
      [0, 0, W, y],
      [0, y + h, W, Math.max(0, H - (y + h))],
      [0, y, x, h],
      [x + w, y, Math.max(0, W - (x + w)), h],
    ];
    this.blockers.forEach((b, i) => {
      const [bx, by, bw, bh] = rects[i] as [number, number, number, number];
      b.hitArea = new Rectangle(bx, by, bw, bh);
    });
    this.anchor.position.set(x + w / 2, y + h / 2);
    this.say(x + w / 2, y);
  }

  /** The speech bubble hangs off an invisible marker on the hole's top edge (the tooltip flips below it when there is no room above). */
  private say(cx: number, top: number): void {
    this.anchor.position.set(cx, top);
    tooltip.show(this.anchor, { text: this.text });
  }

  private clear(): void {
    this.shown = false;
    this.pulse(false);
    this.bag.killKeyed(this.layer);
    this.bag.killKeyed(this.ring);
    this.layer.visible = false;
    this.layer.alpha = 1;
    this.hand.position.set(0, 0);
    if (tooltip.target === this.anchor) tooltip.hide();
  }

  resize(l: BattleLayout): void {
    this.layout = l;
    if (this.shown) this.paint();
  }

  /** Between the merge and the scripted pick the player plays freely: point at the button when fish pile up unspent. */
  private nudge(dt: number): void {
    const { battle, ctx } = this.env;
    let cats = 0;
    let room = false;
    for (const u of battle.units) {
      if (u) cats++;
      else room = true;
    }
    const idle = this.flow.step === 'free' && !this.flow.offered && !ctx.paused && room && battle.fish >= battle.summonCost();
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
    if (!nudgeDue(this.idle, this.nudges, cats) || this.carrying) return;
    this.nudges++;
    this.nudgeLeft = NUDGE_FOR;
    const r = this.summonTarget();
    this.nudgeHand.position.set(r.x + r.w * HAND_X, r.y + HAND_DY);
    this.nudgeHand.visible = true;
    this.nudgeHand.tap();
    this.pulse(true);
    tooltip.show(this.nudgeHand, { text: t('hud.tut.more') }, NUDGE_FOR);
  }

  private endNudge(): void {
    this.idle = 0;
    if (!this.nudgeHand.visible) return;
    this.nudgeHand.visible = false;
    this.nudgeLeft = 0;
    this.pulse(false);
    if (tooltip.target === this.nudgeHand) tooltip.hide();
  }

  update(dt: number): void {
    this.nudge(dt);
    if (!this.shown) return;
    if (this.drag && this.flow.step === 'merge') {
      // The player may have broken the pair up; point at the next one.
      const units = this.env.battle.units;
      const a = units[this.drag.a];
      const c = units[this.drag.b];
      if (!a || !c || a.id !== c.id) {
        this.focusMerge();
        return;
      }
    }
    const r = this.target?.();
    const key = r ? `${r.x}|${r.y}|${r.w}|${r.h}` : '';
    // Follow the target if the field moved, and bring the bubble back if something else hid it.
    if (key !== this.paintedKey || !tooltip.visible) this.paint();
  }

  destroy(): void {
    this.bag.killAll();
    this.hold(false);
    this.endNudge();
    this.pulse(false);
    if (tooltip.target === this.anchor) tooltip.hide();
    this.layer.destroy({ children: true });
    this.nudgeHand.destroy({ children: true });
  }
}
