/** The day's / week's chest as a featured card: a painted points bar beside the chest sticker, its reward under the bar, Claim and the odds on a row of their own. */
import { Container, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import type { Bundle } from '@/meta/types';
import { Button, motion, PaperLabel, ProgressBar, TweenBag, toast, uiLabel } from '@/ui';
import type { Box } from '@/ui/layoutMath';
import { StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { partIcon, RewardList } from '../system/kit/rewardChip';
import { paperSheet, stickerDisc } from '../system/kit/sheets';
import { TimerTag } from '../system/kit/tags';
import { buttonWidthFor, planStrip, type Rect } from './stripLayout';
import './strings';

/** Face height of the card's buttons (88 px is the touch target) and the sizes of their labels. */
const BTN_H = 88;
const CLAIM_MIN_W = 180;
const ODDS_MIN_W = 190;
const CLAIM_FONT = 34;
const ODDS_FONT = 28;
const TIMER_W = 310;
/** How far Claim swells when it pulses (the kit's default is 0.045): the button is wide, and its swell must not reach the neighbour's gap. */
const PULSE = 0.03;
/** The chest picture on its plate. */
const CHEST_ART = 92;
/** Widest one reward chip may be before its amount shrinks: room for a five-digit amount. */
const CHIP_MAX_W = 220;

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

/** Width of `text` set at `size`, as the game's font really draws it. */
function textWidth(text: string, size: number): number {
  const probe = uiLabel(text, { size });
  const w = probe.width;
  probe.destroy();
  return w;
}

/** Put `item` so that its footprint (`uiBox`, scaled) starts at the top-left corner of `r`. */
function place(item: Container & { uiBox: Box }, r: Rect): void {
  item.position.set(r.x - item.uiBox.x * item.scale.x, r.y - item.uiBox.y * item.scale.y);
}

/** Origin = top-left of the card. Its height (`cardH`) follows from what the card carries: see stripLayout. */
export class ChestStrip extends Container {
  readonly cardH: number;
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
    // Every part is built at its natural size and measured; the layout then says where each goes and how tall the card is.
    this.timerTag = spec.timer ? new TimerTag(TIMER_W) : null;
    const label = new PaperLabel({ text: spec.title, size: 32, paper: 'info', padX: 32, padY: 10 });
    const reward = new RewardList(partsOf(spec.reward), { direction: 'row', size: 52, fontSize: 26, gap: 16, maxWidth: CHIP_MAX_W });
    const claimW = buttonWidthFor(textWidth(t('rt.common.claim'), CLAIM_FONT), BTN_H, CLAIM_MIN_W, true);
    const oddsW = buttonWidthFor(textWidth(t('rt.common.odds'), ODDS_FONT), BTN_H, ODDS_MIN_W, false);
    const probe = new Button({ width: 100, height: BTN_H });
    const buttonH = probe.uiBox.h;
    probe.destroy({ children: true });
    const plan = planStrip({
      w,
      titleW: label.uiBox.w,
      titleH: label.uiBox.h,
      timerW: this.timerTag?.uiBox.w ?? 0,
      timerH: this.timerTag?.uiBox.h ?? 0,
      rewardW: reward.uiBox.w,
      rewardH: reward.uiBox.h,
      claimW,
      oddsW,
      buttonH,
    });
    this.cardH = plan.h;
    this.addChild(paperSheet(w, plan.h, { featured: true, radius: 32, tape: { name: 'pink', at: 0.86, pattern: 'gingham' } }));

    if (plan.title.w < label.uiBox.w) label.setMaxWidth(plan.title.w);
    place(label, plan.title);
    this.addChild(label);
    if (this.timerTag) {
      place(this.timerTag, plan.timer);
      this.addChild(this.timerTag);
    }

    this.bar = new ProgressBar({ width: plan.bar.w, height: plan.bar.h, color: 'gold', value: 0, label: '' });
    place(this.bar, plan.bar);
    this.addChild(this.bar);

    this.chest.addChild(stickerDisc(plan.plate.w, 3), partIcon({ kind: 'chest', chest: spec.chest, n: 1 }, CHEST_ART));
    this.chest.position.set(plan.plate.x + plan.plate.w / 2, plan.plate.y + plan.plate.h / 2);
    this.chest.rotation = -0.05;
    this.addChild(this.chest);

    reward.scale.set(plan.rewardScale);
    place(reward, plan.reward);
    this.addChild(reward);

    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: plan.claim.w, height: BTN_H, fontSize: CLAIM_FONT });
    place(this.claimBtn, plan.claim);
    this.claimBtn.onTap(() => spec.claim(this.claimBtn));
    this.claimBtn.onDisabledTap(() => toast(spec.hint, 'info'));
    this.stamp.position.copyFrom(this.claimBtn.position);
    const odds = new Button({ label: t('rt.common.odds'), style: 'neutral', width: plan.odds.w, height: BTN_H, fontSize: ODDS_FONT });
    place(odds, plan.odds);
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
    if (s.ready) this.claimBtn.startPulse({ times: 3, amount: PULSE });
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
