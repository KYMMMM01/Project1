/** The day's / week's chest as a featured card: a painted points bar that ends in the chest sticker, its reward, Claim and the odds. */
import { Container, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import type { Bundle } from '@/meta/types';
import { Button, motion, PaperLabel, ProgressBar, TweenBag, toast } from '@/ui';
import { StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { partIcon, RewardList } from '../system/kit/rewardChip';
import { paperSheet, stickerDisc } from '../system/kit/sheets';
import { TimerTag } from '../system/kit/tags';
import './strings';

export const CHEST_STRIP_H = 280;
const SIDE = 32;
const CHEST_BOX = 128;

export interface ChestStripSpec {
  title: string;
  chest: 'silver' | 'gold';
  reward: Bundle;
  /** Carry the reset countdown at the top right. */
  timer: boolean;
  /** What a tap on the waiting Claim button explains. */
  hint: string;
  claim(from: Container): void;
  odds(): void;
}

export interface ChestStripState {
  value: number;
  label: string;
  ready: boolean;
  claimed: boolean;
}

/** Origin = top-left of the card. */
export class ChestStrip extends Container {
  private readonly bag = new TweenBag();
  private readonly bar: ProgressBar;
  private readonly chest = new Container();
  private readonly claimBtn: Button;
  private readonly stamp = new StampMark({ text: t('rt.common.claimed'), size: 28, maxWidth: 200, tilt: -0.08 });
  private readonly timerTag: TimerTag | null;
  private wasReady = false;
  private wasClaimed = false;

  constructor(
    w: number,
    spec: ChestStripSpec,
  ) {
    super();
    const H = CHEST_STRIP_H;
    this.addChild(paperSheet(w, H, { featured: true, radius: 32, tape: { name: 'pink', at: 0.86, pattern: 'gingham' } }));

    this.timerTag = spec.timer ? new TimerTag(310) : null;
    const label = new PaperLabel({ text: spec.title, size: 32, paper: 'info', padX: 32, padY: 10, maxWidth: w - SIDE * 2 - (this.timerTag ? 330 : 0) });
    label.position.set(SIDE + label.uiBox.w / 2, 42);
    this.addChild(label);
    if (this.timerTag) {
      this.timerTag.position.set(w - SIDE, 42);
      this.addChild(this.timerTag);
    }

    const barW = w - SIDE * 2 - CHEST_BOX + 22;
    this.bar = new ProgressBar({ width: barW, height: 52, color: 'gold', value: 0, label: '' });
    this.bar.position.set(SIDE + barW / 2, 126);
    this.addChild(this.bar);

    this.chest.addChild(stickerDisc(CHEST_BOX, 3), partIcon({ kind: 'chest', chest: spec.chest, n: 1 }, 92));
    this.chest.position.set(w - SIDE - CHEST_BOX / 2 + 2, 126);
    this.chest.rotation = -0.05;
    this.addChild(this.chest);

    const reward = new RewardList(partsOf(spec.reward), { direction: 'row', size: 52, fontSize: 26, gap: 16, maxWidth: 120 });
    reward.position.set(SIDE + reward.uiBox.w / 2, 230);
    this.addChild(reward);

    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: 180, height: 88, fontSize: 34 });
    this.claimBtn.position.set(SIDE + reward.uiBox.w + 24 + 90, 230);
    this.claimBtn.onTap(() => spec.claim(this.claimBtn));
    this.claimBtn.onDisabledTap(() => toast(spec.hint, 'info'));
    this.stamp.position.copyFrom(this.claimBtn.position);
    const odds = new Button({ label: t('rt.common.odds'), style: 'neutral', width: 190, height: 88, fontSize: 28 });
    odds.position.set(w - SIDE - 95, 230);
    odds.onTap(() => spec.odds());
    this.addChild(this.claimBtn, this.stamp, odds);
  }

  sync(s: ChestStripState, animate: boolean): void {
    this.bar.setLabel(s.label);
    this.bar.setValue(s.value, animate);
    this.claimBtn.visible = !s.claimed;
    this.claimBtn.setEnabled(s.ready);
    this.stamp.visible = s.claimed;
    this.chest.alpha = s.claimed ? 0.6 : 1;
    if (animate && s.claimed && !this.wasClaimed) this.stamp.slam();
    if (s.ready) this.claimBtn.startPulse({ times: 3 });
    else this.claimBtn.stopPulse();
    if (s.ready && !this.wasReady) this.wiggle();
    this.wasReady = s.ready;
    this.wasClaimed = s.claimed;
  }

  /** The reset countdown, if this card carries one. */
  tick(now: number, remainingMs: number): void {
    this.timerTag?.tick(now, remainingMs);
  }

  /** Three quick nods of the chest: "I am open". */
  private wiggle(): void {
    if (motion.reduced) return;
    this.bag.runKeyed(this.chest, {
      duration: 0.9,
      ease: Ease.linear,
      onUpdate: (k) => {
        this.chest.rotation = -0.05 + Math.sin(k * Math.PI * 6) * 0.1 * (1 - k);
        this.chest.scale.set(1 + 0.06 * Math.sin(k * Math.PI));
      },
      onComplete: () => {
        this.chest.rotation = -0.05;
        this.chest.scale.set(1);
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
