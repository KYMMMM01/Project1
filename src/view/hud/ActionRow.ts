/**
 * The action row: summon-grade upgrade, the big SUMMON button, the round laser button, and above them
 * the six-step tracker toward the next pick-of-three and the "call next wave" button.
 */
import { Container, Graphics, Rectangle, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { unitRarityIndex } from '@/game';
import { Button, Color, CooldownRing, drawIcon, drawPaper, IconButton, motion, paperSeed, popIn, punch, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import type { RevealKey } from './policy';
import { startAim, stopAim } from '../aim';
import { info } from '../info';
import { LaserCard } from './popups/LaserCard';
import { SummonButton } from './SummonButton';
import { chipCeiling, chipColumn } from './chipMath';
import { LASER_FACE, LASER_INFO, LASER_RING, LASER_RING_TH, LASER_SECONDS_Y, LASER_X, type Rect } from './layoutMath';
import { SummonChips } from './SummonChip';
import { REVEAL_DELAY } from '../timing';
import { tossFor } from '../toss';

const GRADE_X = 121;
const PAWS = 6;
/** The call button's right edge lines up with the odds button above it (x 688); it is 236 wide. */
const CALL_X = 570;
const CALL_W = 236;
const CALL_H = 84;
/** Seconds the lane stays lit after a press of the button (until the dot is down). */
const AIM_FOR = 6;
/** Key of the laser button's own bubble (src/view/info.ts): its state while it works or recharges, and the "tap the walkway" line. */
const LASER_TIP = 'laser';
/** The result chips rest this far above the summon button's centre: just over its top edge, clear of the pills above. */
const CHIP_LIFT = 112;
const CHIP_X = 360;
/** The grade button's arrow sits here and hops from it when the grade goes up. */
const ARROW_Y = -42;

type LaserState = 'ready' | 'active' | 'cool' | '';

/** What the laser button wears in each state: teal while it waits, coral while it aims, kraft while it recharges. */
const LASER_STYLE = { ready: 'info', active: 'primary', cool: 'kraft' } as const;

export class ActionRow {
  readonly root = new Container();
  readonly summon: SummonButton;
  readonly laser = new Container();
  readonly callBtn: Button;
  /** The round "i" next to the laser button: opens the explanation whenever the player wants it. */
  readonly info = new Container();
  /** Told when the player has been explained the laser (the card closed, however it closed) or has pressed the button to aim: the guided first use goes on from there. */
  onExplained: (() => void) | null = null;
  /** Tracker and call-wave button: they share the row the selection sheet covers. */
  readonly util = new Container();
  /** The result chip of each summon, above the button. */
  private readonly chips = new SummonChips();
  private readonly bag = new TweenBag();
  readonly grade: Button;
  private readonly gradeArrow: Container;
  private readonly laserBtn: IconButton;
  private readonly coolRing: CooldownRing;
  private readonly aimRing: CooldownRing;
  private readonly laserText: Text;
  /** Marks the laser button's ring for the HUD's measurements (see the constructor). */
  readonly laserRing: Graphics;
  readonly tracker = new Container();
  private readonly paws: Array<{ lit: Container; dim: Container }> = [];
  private readonly trackerCaption: Text;
  private summonCount = 0;
  private gradeDirty = true;
  private trackerDirty = true;
  private trackerLit = -1;
  private callShown = false;
  private callBonus = -2;
  private callClock = 0;
  private laserState: LaserState = '';
  private laserP = -1;
  private laserSeconds = '';
  private gradeReady: boolean | null = null;
  /** What the grade button shows now: the price (-1 at the top grade) and the level, so an unchanged button is not rebuilt. */
  private gradeCost = -2;
  private gradeLevel = -1;
  private cardOpen = false;
  private dead = false;

  constructor(private readonly env: HudEnv) {
    const b = env.battle;
    const r = env.reveal;
    this.summon = new SummonButton(env);

    this.grade = new Button({ label: '', style: 'kraft', width: 150, height: 120, fontSize: 38, fireOnDown: true, haptic: 'light', disabledMark: 'none' });
    // A small up arrow on the corner says "upgrade" without taking room from the level text.
    const up = drawIcon('arrow_up', 40);
    up.position.set(-50, ARROW_Y);
    this.grade.addChild(up);
    this.gradeArrow = up;
    this.grade.onTap(() => {
      env.ctx.command('upgradeSummon', () => b.upgradeSummon());
    });
    this.grade.visible = r.gradeUpgrade;

    // The ring around the button is the clock: it fills while the laser recharges (teal, and stays full while it is ready) and drains while it is on (coral).
    this.coolRing = new CooldownRing({ radius: LASER_RING, thickness: LASER_RING_TH, color: Color.teal });
    this.aimRing = new CooldownRing({ radius: LASER_RING, thickness: LASER_RING_TH, color: Color.coral });
    this.aimRing.visible = false;
    this.laserBtn = new IconButton({ icon: 'target', style: 'info', size: LASER_FACE, fireOnDown: true, sfx: 'ui_click', haptic: false });
    this.laserBtn.onTap(() => this.pressLaser());
    this.buildInfo();
    this.laserText = uiLabel('', { size: 26 });
    this.laserText.position.set(0, LASER_SECONDS_Y);
    // An invisible disc the size of the ring: the tutorial's window and paw are measured from it, not from the button's face plus its lip and the seconds.
    this.laserRing = new Graphics().circle(0, 0, LASER_RING).fill({ color: Color.paper, alpha: 0.001 });
    this.laserRing.eventMode = 'none';
    this.laser.addChild(this.coolRing, this.aimRing, this.laserBtn, this.laserText, this.laserRing);
    this.laser.visible = r.laser;
    this.info.visible = r.laser;

    for (let i = 0; i < PAWS; i++) {
      // The glyph's own colour is baked in, so a lit and a dim copy are swapped instead of tinted.
      const dim = drawIcon('paw', 32, Color.kraft);
      const lit = drawIcon('paw', 32, Color.mustard);
      dim.position.set(i * 36 + 16, 0);
      lit.position.copyFrom(dim.position);
      this.tracker.addChild(dim, lit);
      this.paws.push({ lit, dim });
    }
    this.trackerCaption = uiLabel(t('hud.tracker'), { size: 24, anchorX: 0, align: 'left' });
    this.trackerCaption.position.set(PAWS * 36 + 6, 0);
    this.tracker.addChild(this.trackerCaption);
    this.tracker.visible = r.tracker && b.summonOfferProgress().every > 0;

    this.callBtn = new Button({
      label: t('hud.call'), sublabel: '', sublabelIcon: 'fish', icon: 'wave_call', style: 'success', width: CALL_W, height: CALL_H, fontSize: 32, fireOnDown: true,
    });
    this.callBtn.onTap(() => {
      const fail = env.ctx.command('callNextWave', () => b.callNextWave());
      if (fail === null) {
        audio.play('call_wave');
        env.hints.used('call_wave');
      }
    });
    this.callBtn.visible = false;

    this.util.addChild(this.tracker, this.callBtn);
    this.root.addChild(this.summon, this.grade, this.laser, this.info, this.util, this.chips.root);

    for (const type of ['summon', 'summonOffer'] as const) env.on(b.events, type, () => (this.trackerDirty = true));
    for (const type of ['fish', 'upgrade'] as const) env.on(b.events, type, () => (this.gradeDirty = true));
    env.on(b.events, 'upgrade', ({ kind }) => {
      if (kind === 'summon') this.hopArrow();
    });
    env.on(b.events, 'summon', () => {
      if (++this.summonCount >= 2) env.hints.request('pick3', this.tracker);
    });
    // The chip names the cat on the frame its sticker pops on the board (after the toss and the rarity's own charge-up).
    env.on(b.events, 'summon', ({ unit, source }) => {
      const wait = tossFor(source, motion.reduced) + (REVEAL_DELAY[unitRarityIndex(unit.id)] ?? 0);
      if (wait > 0) this.bag.call(wait, () => this.chips.show(unit.id));
      else this.chips.show(unit.id);
    });
    env.on(env.revealed, 'reveal', ({ key, fresh }) => this.onReveal(key, fresh));
    env.on(b.events, 'laser', () => {
      stopAim();
      this.pop();
      // The dot is down: the "tap the path" tip has done its job.
      info.close(true, LASER_TIP);
    });
  }

  /** A control the tutorial brings in: it appears here, with a small pop when it is fresh. */
  private onReveal(key: RevealKey, fresh: boolean): void {
    const pop = (obj: Container): void => {
      if (fresh && !motion.reduced) popIn(this.bag, obj, { from: 0.3, duration: 0.32, overshoot: 2.8 });
    };
    if (key === 'laser') {
      this.laser.visible = true;
      this.info.visible = true;
      pop(this.laser);
      pop(this.info);
    } else if (key === 'gradeUpgrade') {
      this.grade.visible = true;
      this.gradeDirty = true;
      pop(this.grade);
    } else if (key === 'tracker') {
      this.trackerDirty = true;
    }
  }

  /** The "i": a small cream sticker with a full-size touch slot. */
  private buildInfo(): void {
    const plate = new Graphics();
    drawPaper(plate, -22, -22, { w: 44, h: 44, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, edgeWidth: 3, edgeAlpha: 1, seed: paperSeed(), shadow: 3, grain: false });
    const mark = drawIcon('info', 28, Color.tealDark);
    const slot = new Graphics();
    slot.rect(-44, -44, 88, 88).fill({ color: Color.paper, alpha: 0.001 });
    this.info.addChild(slot, plate, mark);
    this.info.hitArea = new Rectangle(-44, -44, 88, 88);
    this.info.eventMode = 'static';
    this.info.cursor = 'pointer';
    this.info.on('pointertap', () => void this.openCard(false));
  }

  /** The laser button: the first presses explain what the laser does; after that it lights the lane for the dot (the lane itself is the other way to place it). */
  private pressLaser(): void {
    const { env } = this;
    const L = env.battle.laser;
    env.hints.used('laser');
    if (env.teach.cardDue) {
      void this.openCard(true);
    } else if (L.active) {
      info.tap(LASER_TIP, this.laser, { text: t('hud.laser.active') }, { seconds: 3 });
    } else if (L.cooldown > 0) {
      info.tap(LASER_TIP, this.laser, { text: t('hud.laser.coolLeft', { s: String(Math.ceil(L.cooldown)) }) }, { seconds: 3 });
    } else {
      this.aim();
    }
  }

  private aim(): void {
    this.onExplained?.();
    startAim(AIM_FOR);
    info.show(LASER_TIP, this.laser, { text: t('hud.laser.hint') }, { seconds: AIM_FOR });
  }

  /** Open the explanation. `counted`: it came from a press of the button (the first ones always do), not from the info mark. */
  private async openCard(counted: boolean): Promise<void> {
    if (this.cardOpen || this.dead) return;
    this.cardOpen = true;
    const { env } = this;
    info.close();
    const L = env.battle.laser;
    const ready = !L.active && L.cooldown <= 0;
    if (counted) env.teach.noteOpened();
    const result = await env.modal(new LaserCard(env, ready));
    this.cardOpen = false;
    if (this.dead) return;
    this.onExplained?.();
    if (result === 'use' && !L.active && L.cooldown <= 0) this.aim();
  }

  /** The grade went up: the arrow hops off the button and lands again with a small squash (the number itself just changes). */
  private hopArrow(): void {
    if (motion.reduced) return;
    const up = this.gradeArrow;
    this.bag.runKeyed(up, {
      duration: 0.34,
      ease: Ease.linear,
      onUpdate: (k) => {
        const air = Math.sin(Math.PI * Math.min(1, k / 0.8));
        up.y = ARROW_Y - 16 * Math.max(0, air);
        const land = k > 0.8 ? Math.sin(Math.PI * ((k - 0.8) / 0.2)) : 0;
        up.scale.set(1 + 0.12 * air * 0.5 + 0.1 * land, 1 + 0.12 * air * 0.5 - 0.14 * land);
      },
      onComplete: () => {
        up.y = ARROW_Y;
        up.scale.set(1);
      },
    });
  }

  private pop(): void {
    if (!motion.reduced) punch(this.bag, this.laserBtn, 0.14, 0.2);
  }

  invalidate(): void {
    this.gradeDirty = true;
    this.gradeCost = -2;
    this.trackerDirty = true;
    this.summon.invalidate();
  }

  /** Tell the chips what can lie over them: a lesson's note, a first-encounter card, the "nice!" sticker, the class chips' row (each null when it is not there). */
  overChips(note: () => Rect | null, card: () => Rect | null, cheer: () => Rect | null, classes: () => Rect | null): void {
    this.chips.ceiling = () => chipCeiling(this.chips.originY, CHIP_X, note(), card(), cheer(), classes());
  }

  /** The column the result chips use, in scene space. */
  chipColumn(): Rect {
    return chipColumn(this.chips.originY, CHIP_X);
  }

  layout(summonY: number, utilY: number, panelTop: number): void {
    this.summon.position.set(360, summonY);
    this.grade.position.set(GRADE_X, summonY);
    this.laser.position.set(LASER_X, summonY);
    this.info.position.set(LASER_X + LASER_INFO.x, summonY + LASER_INFO.y);
    this.chips.root.position.set(CHIP_X, summonY - CHIP_LIFT);
    this.chips.originY = panelTop + summonY - CHIP_LIFT;
    this.util.position.set(0, utilY);
    this.tracker.position.set(24, 0);
    this.callBtn.position.set(CALL_X, 6);
  }

  // ───────────────────────── per frame ─────────────────────────

  private refreshGrade(): void {
    const b = this.env.battle;
    const cost = b.summonGradeCost();
    const level = b.summonGrade();
    const ready = cost >= 0 && b.fish >= cost;
    if (ready) this.env.hints.request('summon_grade', this.grade);
    // The fish change every few frames in a busy wave; the button only needs its paper redone when what it says or how it looks changes.
    if (cost === this.gradeCost && level === this.gradeLevel && ready === this.gradeReady) return;
    this.gradeCost = cost;
    this.gradeLevel = level;
    if (cost < 0) {
      this.grade.setLabel(t('hud.max'));
      this.grade.setSublabel(undefined);
      this.grade.setStyle('kraft');
      this.gradeReady = ready;
      return;
    }
    this.grade.setLabel(`Lv.${level + 1}`);
    this.grade.setSublabel(fmt(cost), 'fish');
    // Cream paper when the fish are there, plain kraft when not; the price says the rest.
    this.grade.setStyle(ready ? 'neutral' : 'kraft');
    if (ready && this.gradeReady === false) this.grade.shine();
    this.gradeReady = ready;
  }

  private refreshTracker(): void {
    const p = this.env.battle.summonOfferProgress();
    this.tracker.visible = this.env.reveal.tracker && p.every > 0;
    if (p.every <= 0) return;
    const lit = p.count;
    this.paws.forEach((paw, i) => {
      const on = i < lit;
      paw.lit.visible = on;
      paw.dim.visible = !on;
      if (on && i === lit - 1 && lit > this.trackerLit && !motion.reduced) popIn(this.bag, paw.lit, { from: 0.4, duration: 0.25, overshoot: 3 });
    });
    this.trackerLit = lit;
  }

  private updateLaser(): void {
    const L = this.env.battle.laser;
    let state: Exclude<LaserState, ''>;
    let p: number;
    let seconds = '';
    if (L.active) {
      state = 'active';
      p = L.duration > 0 ? L.timeLeft / L.duration : 0;
      seconds = String(Math.ceil(L.timeLeft));
    } else if (L.cooldown > 0) {
      state = 'cool';
      p = L.cooldownTotal > 0 ? 1 - L.cooldown / L.cooldownTotal : 1;
      seconds = String(Math.ceil(L.cooldown));
    } else {
      state = 'ready';
      p = 1;
    }
    if (Math.abs(p - this.laserP) > 0.004 || state !== this.laserState) {
      this.laserP = p;
      (state === 'active' ? this.aimRing : this.coolRing).setProgress(p);
    }
    if (seconds !== this.laserSeconds) {
      this.laserSeconds = seconds;
      this.laserText.text = seconds ? t('hud.secs', { s: seconds }) : '';
    }
    if (state === this.laserState) return;
    const was = this.laserState;
    this.laserState = state;
    this.laserBtn.setStyle(LASER_STYLE[state]);
    this.coolRing.visible = state !== 'active';
    this.aimRing.visible = state === 'active';
    this.laserBtn.stopPulse();
    if (state === 'active') this.laserBtn.startPulse({ times: -1, amount: 0.04 });
    if (state === 'ready' && was === 'cool') {
      this.pop();
      this.laserBtn.shine();
      audio.play('ui_tab', { volume: 0.5 });
    }
  }

  private updateCall(dt: number): void {
    this.callClock += dt;
    if (this.callClock < 0.25) return;
    this.callClock = 0;
    const bonus = this.env.reveal.callWave ? this.env.battle.callBonus() : -1;
    const show = bonus >= 0;
    if (show !== this.callShown) {
      this.callShown = show;
      if (show) {
        this.callBtn.visible = true;
        this.callBonus = -2;
        if (!motion.reduced) popIn(this.bag, this.callBtn, { from: 0.5, duration: 0.3, overshoot: 3 });
        this.env.hints.request('call_wave', this.callBtn);
      } else if (motion.reduced) {
        this.callBtn.visible = false;
      } else {
        this.bag.run({
          duration: 0.16,
          ease: Ease.cubicIn,
          onUpdate: (k) => {
            this.callBtn.alpha = 1 - k;
            this.callBtn.scale.set(1 - 0.3 * k);
          },
          onComplete: () => {
            this.callBtn.visible = this.callShown;
            this.callBtn.alpha = 1;
            this.callBtn.scale.set(1);
          },
        });
      }
    }
    if (show && bonus !== this.callBonus) {
      this.callBonus = bonus;
      this.callBtn.setSublabel(`+${bonus}`, 'fish');
    }
  }

  update(dt: number): void {
    this.summon.update(dt);
    this.chips.update(dt);
    if (this.gradeDirty && this.env.reveal.gradeUpgrade) {
      this.gradeDirty = false;
      this.refreshGrade();
    }
    if (this.trackerDirty) {
      this.trackerDirty = false;
      this.refreshTracker();
    }
    if (this.env.reveal.laser) this.updateLaser();
    this.updateCall(dt);
  }

  destroy(): void {
    this.dead = true;
    stopAim();
    this.bag.killAll();
    this.chips.destroy();
    this.root.destroy({ children: true });
  }
}
