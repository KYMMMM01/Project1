/**
 * The action row: summon-grade upgrade, the big SUMMON button, the round laser button, and above them
 * the six-step tracker toward the next pick-of-three and the "call next wave" button.
 */
import { Container, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Button, Color, CooldownRing, drawIcon, IconButton, motion, popIn, punch, tooltip, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import { SummonButton } from './SummonButton';

const GRADE_X = 121;
const LASER_X = 615;
const LASER_SIZE = 116;
const PAWS = 6;
/** The call button's right edge lines up with the odds button above it (x 688); it is 236 wide. */
const CALL_X = 570;
const CALL_W = 236;
const CALL_H = 84;
/** The laser sits a little lower than the summon button's centre, so the call button above it clears its ring. */
const LASER_DY = -4;

type LaserState = 'ready' | 'active' | 'cool' | '';

/** What the laser button wears in each state: teal while it waits, coral while it aims, kraft while it recharges. */
const LASER_STYLE = { ready: 'info', active: 'primary', cool: 'kraft' } as const;

export class ActionRow {
  readonly root = new Container();
  readonly summon: SummonButton;
  readonly laser = new Container();
  readonly callBtn: Button;
  /** Tracker and call-wave button: they share the row the selection sheet covers. */
  readonly util = new Container();
  private readonly bag = new TweenBag();
  readonly grade: Button;
  private readonly laserBtn: IconButton;
  private readonly coolRing: CooldownRing;
  private readonly aimRing: CooldownRing;
  private readonly laserText: Text;
  private readonly tracker = new Container();
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

  constructor(private readonly env: HudEnv) {
    const b = env.battle;
    const r = env.reveal;
    this.summon = new SummonButton(env);

    this.grade = new Button({ label: '', style: 'kraft', width: 150, height: 120, fontSize: 38, fireOnDown: true, haptic: 'light', disabledMark: 'none' });
    // A small up arrow on the corner says "upgrade" without taking room from the level text.
    const up = drawIcon('arrow_up', 40);
    up.position.set(-50, -42);
    this.grade.addChild(up);
    this.grade.onTap(() => {
      env.ctx.command('upgradeSummon', () => b.upgradeSummon());
    });
    this.grade.visible = r.gradeUpgrade;

    // The ring around the button is the clock: it fills while the laser recharges (teal) and drains while it is on (coral).
    this.coolRing = new CooldownRing({ radius: LASER_SIZE / 2 + 9, thickness: 9, color: Color.teal });
    this.aimRing = new CooldownRing({ radius: LASER_SIZE / 2 + 9, thickness: 9, color: Color.coral });
    this.coolRing.visible = false;
    this.aimRing.visible = false;
    this.laserBtn = new IconButton({ icon: 'target', style: 'info', size: LASER_SIZE, fireOnDown: true, sfx: 'ui_click', haptic: false });
    this.laserBtn.onTap(() => {
      env.hints.used('laser');
      tooltip.show(this.laser, { text: t(b.laser.active ? 'hud.laser.active' : b.laser.cooldown > 0 ? 'hud.laser.cool' : 'hud.laser.hint') }, 3);
    });
    this.laserText = uiLabel('', { size: 26 });
    this.laserText.position.set(0, LASER_SIZE / 2 + 24);
    this.laser.addChild(this.coolRing, this.aimRing, this.laserBtn, this.laserText);
    this.laser.visible = r.laser;

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
        env.hints.used('callWave');
      }
    });
    this.callBtn.visible = false;

    this.util.addChild(this.tracker, this.callBtn);
    this.root.addChild(this.summon, this.grade, this.laser, this.util);

    for (const type of ['summon', 'summonOffer'] as const) env.on(b.events, type, () => (this.trackerDirty = true));
    for (const type of ['fish', 'upgrade'] as const) env.on(b.events, type, () => (this.gradeDirty = true));
    env.on(b.events, 'summon', () => {
      if (++this.summonCount >= 2) env.hints.request('tracker', this.tracker);
    });
    env.on(b.events, 'waveStart', ({ wave }) => {
      if (wave >= 2) env.hints.request('laser', this.laser);
    });
    env.on(b.events, 'laser', () => {
      this.pop();
      // The dot is down: the "tap the path" tip has done its job.
      if (tooltip.target === this.laser) tooltip.hide();
    });
  }

  private pop(): void {
    if (!motion.reduced) punch(this.bag, this.laserBtn, 0.14, 0.2);
  }

  invalidate(): void {
    this.gradeDirty = true;
    this.trackerDirty = true;
    this.summon.invalidate();
  }

  layout(summonY: number, utilY: number): void {
    this.summon.position.set(360, summonY);
    this.grade.position.set(GRADE_X, summonY + 4);
    this.laser.position.set(LASER_X, summonY + LASER_DY);
    this.util.position.set(0, utilY);
    this.tracker.position.set(24, 0);
    this.callBtn.position.set(CALL_X, 6);
  }

  // ───────────────────────── per frame ─────────────────────────

  private refreshGrade(): void {
    const b = this.env.battle;
    const cost = b.summonGradeCost();
    if (cost < 0) {
      this.grade.setLabel(t('hud.max'));
      this.grade.setSublabel(undefined);
      this.grade.setStyle('kraft');
      return;
    }
    const ready = b.fish >= cost;
    this.grade.setLabel(`Lv.${b.summonGrade() + 1}`);
    this.grade.setSublabel(fmt(cost), 'fish');
    // Cream paper when the fish are there, plain kraft when not; the price says the rest.
    this.grade.setStyle(ready ? 'neutral' : 'kraft');
    if (ready) {
      this.env.hints.request('grade', this.grade);
      if (this.gradeReady === false) this.grade.shine();
    }
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
    this.coolRing.visible = state === 'cool';
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
        this.env.hints.request('callWave', this.callBtn);
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
    this.bag.killAll();
    this.root.destroy({ children: true });
  }
}
