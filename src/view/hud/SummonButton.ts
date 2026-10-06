/**
 * The big SUMMON button, a coral piece of paper with a strip of tape: acts on pointerdown, repeats while
 * held (after 350 ms, then every 140 ms), shows the cost, turns into "no space" on a full board and
 * answers a short purse with a shake and the missing amount.
 */
import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { Button, motion, punch, shakeX, TweenBag } from '@/ui';
import type { HudEnv } from './env';
import { HoldRepeater, summonView, type SummonKind } from './policy';

export const SUMMON_W = 300;
export const SUMMON_H = 140;

export class SummonButton extends Container {
  readonly btn: Button;
  private readonly bag = new TweenBag();
  private readonly hold = new HoldRepeater();
  private kind: SummonKind | null = null;
  private costText = '';
  private lastOk = false;
  private flashing = false;
  private dirty = true;

  constructor(private readonly env: HudEnv) {
    super();
    this.btn = new Button({
      label: t('hud.summon'),
      sublabel: '',
      sublabelIcon: 'fish',
      width: SUMMON_W,
      height: SUMMON_H,
      fontSize: 58,
      radius: 46,
      tape: 'pink',
      fireOnDown: true,
      haptic: 'medium',
      sfx: 'ui_click',
    });
    this.addChild(this.btn);
    this.btn.onTap(() => {
      this.lastOk = this.press();
    });
    // The Button's own pointerdown (registered first) has already fired the summon by now.
    this.btn.on('pointerdown', () => {
      if (this.lastOk) this.hold.start();
    });
    const stop = (): void => this.hold.stop();
    for (const ev of ['pointerup', 'pointerupoutside', 'pointerleave', 'pointercancel'] as const) this.btn.on(ev, stop);

    const b = env.battle;
    const mark = (): void => {
      this.dirty = true;
    };
    for (const type of ['fish', 'summon', 'sell', 'merge', 'move', 'swap', 'molt', 'awaken', 'upgrade', 'relicGain', 'revive'] as const) {
      env.on(b.events, type, mark);
    }
    env.on(env.ctx.events, 'refused', ({ command, fail }) => {
      if (command === 'summon' && fail === 'not_enough_fish') this.flashMissing();
    });
  }

  /** One summon attempt. Returns true when it worked. */
  private press(): boolean {
    const fail = this.env.ctx.command('summon', () => this.env.battle.summon());
    if (fail === null) {
      if (!motion.reduced) punch(this.bag, this.btn, 0.06, 0.14);
      return true;
    }
    this.hold.stop();
    shakeX(this.bag, this.btn, 0, 8, 3, 0.22);
    audio.play('ui_error', { volume: 0.5 });
    return false;
  }

  private flashMissing(): void {
    const b = this.env.battle;
    const missing = Math.max(1, b.summonCost() - b.fish);
    this.flashing = true;
    this.btn.setSublabel(t('hud.short', { n: fmt(missing) }), 'fish');
    this.bag.call(1.2, () => {
      this.flashing = false;
      this.costText = '';
      this.dirty = true;
    });
  }

  private refresh(): void {
    const b = this.env.battle;
    let empty = 0;
    for (const u of b.units) if (!u) empty++;
    const cost = b.summonCost();
    const view = summonView(empty, cost, b.fish);
    if (view.kind !== this.kind) {
      const was = this.kind;
      this.kind = view.kind;
      this.btn.setStyle(view.kind === 'ready' ? 'primary' : 'neutral');
      this.btn.setLabel(view.kind === 'full' ? t('hud.full') : t('hud.summon'));
      this.costText = '';
      if (was === 'short' && view.kind === 'ready' && !motion.reduced) {
        punch(this.bag, this.btn, 0.1, 0.2);
        this.btn.shine();
      }
    }
    if (this.flashing) return;
    const text = view.kind === 'full' ? t('hud.fullHint') : cost === 0 ? t('hud.free') : fmt(cost);
    if (text !== this.costText) {
      this.costText = text;
      const icon = view.kind === 'full' || cost === 0 ? undefined : 'fish';
      // setSublabel keeps the old icon unless the text is empty first.
      if (!icon) this.btn.setSublabel(undefined);
      this.btn.setSublabel(text, icon);
    }
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** Keep the button breathing while the tutorial pointer is on it. */
  attention(on: boolean): void {
    if (on) this.btn.startPulse({ times: -1 });
    else this.btn.stopPulse();
  }

  update(dt: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.refresh();
    }
    const n = this.hold.tick(dt);
    for (let i = 0; i < n && this.hold.active; i++) {
      if (!this.press()) break;
    }
  }

  override destroy(): void {
    this.hold.stop();
    this.bag.killAll();
    super.destroy({ children: true });
  }
}
