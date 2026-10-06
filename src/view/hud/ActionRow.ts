/**
 * The action row: summon-grade upgrade, the big SUMMON button, the laser indicator, and above them
 * the six-step tracker toward the next pick-of-three and the "call next wave" button.
 */
import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { Button, CooldownRing, drawGlow, drawIcon, motion, popIn, punch, tooltip, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from './env';
import { tapArea } from './kit';
import { SummonButton } from './SummonButton';

const GRADE_X = 121;
const LASER_X = 615;
const PAWS = 6;
const CALL_X = 579;

export class ActionRow {
  readonly root = new Container();
  readonly summon: SummonButton;
  readonly laser = new Container();
  readonly callBtn: Button;
  /** Tracker and call-wave button: they share the row the selection sheet covers. */
  readonly util = new Container();
  private readonly bag = new TweenBag();
  private readonly grade: Button;
  private readonly ring: CooldownRing;
  private readonly glow = new Graphics();
  private readonly ringLabel: Text;
  private readonly tracker = new Container();
  private readonly paws: Array<{ lit: Graphics; dim: Graphics }> = [];
  private readonly trackerCaption: Text;
  private summonCount = 0;
  private gradeDirty = true;
  private trackerDirty = true;
  private trackerLit = -1;
  private callShown = false;
  private callBonus = -2;
  private callClock = 0;
  private laserState: 'ready' | 'active' | 'cool' | '' = '';
  private laserP = -1;
  private laserText = '';

  constructor(private readonly env: HudEnv) {
    const b = env.battle;
    const r = env.reveal;
    this.summon = new SummonButton(env);

    this.grade = new Button({
      label: '', style: 'purple', width: 150, height: 120, fontSize: 38, fireOnDown: true, haptic: 'light',
    });
    // A small up arrow on the corner says "upgrade" without taking room from the level text.
    const up = drawIcon('arrow_up', 40);
    up.position.set(-50, -42);
    this.grade.addChild(up);
    this.grade.onTap(() => {
      env.ctx.command('upgradeSummon', () => b.upgradeSummon());
    });
    this.grade.visible = r.gradeUpgrade;

    this.ring = new CooldownRing({ radius: 50, thickness: 12, color: 0xff4d5e, icon: 'laser' });
    drawGlow(this.glow, 0, 0, 84, 0xff4d5e, 0.9);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0;
    this.ringLabel = uiLabel('', { size: 26, strokeWidth: 5 });
    this.ringLabel.position.set(0, 74);
    this.laser.addChild(this.glow, this.ring, this.ringLabel);
    tapArea(this.laser, -58, -70, 116, 156);
    this.laser.on('pointerdown', () => {
      this.laser.scale.set(0.94);
      tooltip.show(this.laser, { text: t(b.laser.active ? 'hud.laser.active' : b.laser.cooldown > 0 ? 'hud.laser.cool' : 'hud.laser.hint') }, 3);
    });
    const release = (): void => {
      this.laser.scale.set(1);
    };
    for (const ev of ['pointerup', 'pointerupoutside', 'pointerleave', 'pointercancel'] as const) this.laser.on(ev, release);
    this.laser.visible = r.laser;

    for (let i = 0; i < PAWS; i++) {
      // The glyph's own colour is baked in, so a lit and a dim copy are swapped instead of tinted.
      const dim = drawIcon('paw', 32, 0x5a49a0);
      const lit = drawIcon('paw', 32, 0xffd23f);
      dim.position.set(i * 36 + 16, 0);
      lit.position.copyFrom(dim.position);
      this.tracker.addChild(dim, lit);
      this.paws.push({ lit, dim });
    }
    this.trackerCaption = uiLabel(t('hud.tracker'), { size: 24, anchorX: 0, align: 'left', strokeWidth: 4, shadow: false });
    this.trackerCaption.position.set(PAWS * 36 + 6, 0);
    this.tracker.addChild(this.trackerCaption);
    this.tracker.visible = r.tracker && b.summonOfferProgress().every > 0;

    this.callBtn = new Button({
      label: t('hud.call'), sublabel: '', sublabelIcon: 'fish', icon: 'wave_call', style: 'success', width: 262, height: 96, fontSize: 32, fireOnDown: true,
    });
    this.callBtn.onTap(() => {
      const fail = env.ctx.command('callNextWave', () => b.callNextWave());
      if (fail === null) audio.play('call_wave');
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
    env.on(b.events, 'laser', () => this.pop());
  }

  private pop(): void {
    if (!motion.reduced) punch(this.bag, this.ring, 0.14, 0.2);
  }

  invalidate(): void {
    this.gradeDirty = true;
    this.trackerDirty = true;
    this.summon.invalidate();
  }

  layout(summonY: number, utilY: number): void {
    this.summon.position.set(360, summonY);
    this.grade.position.set(GRADE_X, summonY + 4);
    this.laser.position.set(LASER_X, summonY - 12);
    this.util.position.set(0, utilY);
    this.tracker.position.set(24, 0);
    this.callBtn.position.set(CALL_X, 0);
  }

  // ───────────────────────── per frame ─────────────────────────

  private refreshGrade(): void {
    const b = this.env.battle;
    const cost = b.summonGradeCost();
    if (cost < 0) {
      this.grade.setLabel(t('hud.max'));
      this.grade.setSublabel(undefined);
      this.grade.setStyle('neutral');
      return;
    }
    this.grade.setLabel(`Lv.${b.summonGrade() + 1}`);
    this.grade.setSublabel(fmt(cost), 'fish');
    this.grade.setStyle(b.fish >= cost ? 'purple' : 'neutral');
    if (b.fish >= cost) this.env.hints.request('grade', this.grade);
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
    let state: 'ready' | 'active' | 'cool';
    let p: number;
    let text = '';
    if (L.active) {
      state = 'active';
      p = L.duration > 0 ? L.timeLeft / L.duration : 0;
      text = String(Math.ceil(L.timeLeft));
    } else if (L.cooldown > 0) {
      state = 'cool';
      p = L.cooldownTotal > 0 ? 1 - L.cooldown / L.cooldownTotal : 1;
      text = String(Math.ceil(L.cooldown));
    } else {
      state = 'ready';
      p = 1;
    }
    if (Math.abs(p - this.laserP) > 0.004 || state !== this.laserState) {
      this.laserP = p;
      this.ring.setProgress(p);
    }
    if (text !== this.laserText) {
      this.laserText = text;
      this.ringLabel.text = text ? t('hud.secs', { s: text }) : '';
    }
    if (state !== this.laserState) {
      const was = this.laserState;
      this.laserState = state;
      this.ring.alpha = state === 'cool' ? 0.75 : 1;
      this.bag.killKeyed(this.glow);
      this.glow.alpha = 0;
      if (state === 'ready' && was === 'cool') {
        this.pop();
        audio.play('ui_tab', { volume: 0.5 });
      }
      if ((state === 'ready' || state === 'active') && !motion.reduced) {
        const strong = state === 'active' ? 0.9 : 0.55;
        this.bag.runKeyed(this.glow, {
          duration: 0.7,
          ease: Ease.sineInOut,
          yoyo: true,
          repeat: -1,
          onUpdate: (k) => (this.glow.alpha = strong * (0.35 + 0.65 * k)),
        });
      }
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
