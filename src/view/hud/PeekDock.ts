/**
 * The view side of the peek toggle (peekMath.ts), shared by the pick of three and the toy choice: the paper "see the board" button the choice
 * hangs on its header, and what takes over while the choice is folded away: a shield that keeps every tap off the board, and the "go back"
 * button, bobbing, that unfolds the choice exactly as it was. The choice stays pending in the simulation the whole time; this only moves it.
 */
import { Container, Graphics, Rectangle } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Button, motion, TweenBag, uiLabel } from '@/ui';
import type { BattleLayout } from '../context';
import type { Point } from './layoutMath';
import { PEEK_BACK, PEEK_BOB, PEEK_FOLD_TIME, PeekState, peekBackCentre, type PeekLock } from './peekMath';

/** The paper toggle on a choice's header: height of its face, label size, and the room its icon, gap and rounded ends take besides the label. */
const TOGGLE_H = 56;
const TOGGLE_FONT = 24;
const TOGGLE_EXTRA = 31 + 10 + 59;

/** What a choice gives the dock: where the screen is, and how to put the choice into the way-back button and take it out again. */
export interface PeekHost {
  /** The battle screen as the HUD lays it out, for the way back's place. */
  layout(): BattleLayout;
  /** Put the choice `k` of the way (0 = in place, 1 = gone) into a button centred on `to`. Called on every step of the fold and on every re-layout. */
  fold(k: number, to: Point): void;
  /** The choice's own controls take taps (false from the moment it starts to fold until it has unfolded). */
  live(on: boolean): void;
}

export class PeekDock {
  readonly state = new PeekState();
  /** The shield and the way back: the host adds it above the choice, in the same layer. */
  readonly layer = new Container();
  private readonly shield = new Graphics();
  private readonly way: Button;
  private readonly toggles: Button[] = [];
  private readonly bag = new TweenBag();
  /** How far the choice is folded: 0 in place, 1 gone. */
  private k = 0;

  constructor(private readonly host: PeekHost) {
    this.shield.eventMode = 'static';
    this.shield.on('pointertap', () => {
      if (this.state.peeking) this.way.shine();
    });
    this.way = new Button({ label: t('hud.peek.back'), icon: 'cards', style: 'info', width: PEEK_BACK.w, height: PEEK_BACK.h, fontSize: 30, sfx: 'ui_click' });
    this.way.onTap(() => this.unfold());
    this.layer.addChild(this.shield, this.way);
    this.layer.visible = false;
    this.way.visible = false;
  }

  get peeking(): boolean {
    return this.state.peeking;
  }

  /** The paper button for the choice's header: an eye and "see the board". The host places it. */
  toggle(): Button {
    const probe = uiLabel(t('hud.peek.look'), { size: TOGGLE_FONT });
    const width = Math.ceil(probe.width) + TOGGLE_EXTRA;
    probe.destroy();
    const btn = new Button({ label: t('hud.peek.look'), icon: 'eye', style: 'info', width, height: TOGGLE_H, fontSize: TOGGLE_FONT, radius: 'pill' });
    btn.onTap(() => this.fold());
    btn.visible = this.state.shown;
    this.toggles.push(btn);
    return btn;
  }

  /** Fold the choice into the way back (a tap on the toggle). */
  fold(): void {
    if (!this.state.peek()) return;
    audio.play('whoosh', { volume: 0.5 });
    this.layer.visible = true;
    this.way.visible = true;
    this.host.live(false);
    this.run(1);
    this.bob();
  }

  /** Unfold it again (a tap on the way back). */
  unfold(): void {
    if (!this.state.back()) return;
    audio.play('whoosh', { volume: 0.5 });
    this.afterBack();
    this.run(0);
  }

  /** Switch the toggle off or on for `reason`; a choice that is folded when a lock arrives is unfolded first, so nothing is left hidden. */
  setLock(reason: PeekLock, on: boolean): void {
    const wasPeeking = this.state.setLock(reason, on);
    if (wasPeeking) {
      this.afterBack();
      this.run(0);
    }
    for (const btn of this.toggles) btn.visible = this.state.shown;
  }

  /** The screen changed size: the way back and the folded choice follow it. */
  layout(): void {
    const l = this.host.layout();
    this.shield.hitArea = new Rectangle(0, 0, l.w, l.h);
    const c = peekBackCentre(l);
    this.way.position.set(c.x, c.y);
    // At rest the choice sits where its own layout put it: only a folded one needs to follow the screen.
    if (this.k > 0) this.step(this.k);
  }

  /** The choice is gone (answered, or closed from outside): back to rest at once, nothing folded, nothing left on screen, no lock of its answer left over. */
  reset(): void {
    this.state.back();
    this.state.unlock('deciding');
    this.state.unlock('opening');
    this.bag.killAll();
    this.afterBack();
    this.step(0);
    this.host.live(true);
  }

  destroy(): void {
    this.bag.killAll();
    this.layer.destroy({ children: true });
  }

  private afterBack(): void {
    this.bag.killKeyed(this.way);
    this.way.setLift(0);
    this.way.visible = false;
  }

  private run(to: number): void {
    const from = this.k;
    if (motion.reduced || from === to) {
      this.step(to);
      return;
    }
    this.bag.runKeyed(this, {
      duration: PEEK_FOLD_TIME * Math.abs(to - from),
      ease: Ease.cubicInOut,
      onUpdate: (e) => this.step(from + (to - from) * e),
      onComplete: () => this.step(to),
    });
  }

  private step(k: number): void {
    this.k = k;
    this.host.fold(k, peekBackCentre(this.host.layout()));
    this.layer.visible = k > 0 || this.state.peeking;
    // The way back grows out of the choice as it shrinks into it.
    const into = Math.min(1, Math.max(0, (k - 0.3) / 0.6));
    this.way.alpha = into;
    this.way.scale.set(0.7 + 0.3 * into);
    if (k === 0) this.host.live(this.state.answerable);
  }

  private bob(): void {
    if (motion.reduced) return;
    this.bag.runKeyed(this.way, {
      duration: 0.75,
      delay: PEEK_FOLD_TIME,
      ease: Ease.sineInOut,
      yoyo: true,
      repeat: -1,
      onUpdate: (e) => this.way.setLift(PEEK_BOB * e),
    });
  }
}
