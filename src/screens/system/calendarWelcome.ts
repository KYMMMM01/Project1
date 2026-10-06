/** The welcome-back chest as a row of the calendar: the note that offers it can be dismissed, so the calendar's red dot has to lead somewhere. */
import { Container } from 'pixi.js';
import { t } from '@/core/i18n';
import type { BundlePart } from '@/meta/bundle';
import { Button, Color, fitLabel, uiLabel } from '@/ui';
import { partAmount, partIcon, partName } from './kit/rewardChip';
import { sharedSheet } from './kit/sheets';
import './strings';

export const WELCOME_H = 112;
export const WELCOME_PARTS: readonly BundlePart[] = [{ kind: 'chest', chest: 'silver', n: 1 }];

const BTN_W = 190;
const HERO_X = 62;
const TEXT_X = 118;

export class WelcomeRow extends Container {
  readonly claimBtn: Button;
  private readonly hero: Container;

  constructor(w: number, onClaim: () => void) {
    super();
    this.addChild(sharedSheet(w, WELCOME_H, { fill: Color.paperLight, radius: 18, featured: true }));
    const part = WELCOME_PARTS[0] as BundlePart;
    this.hero = partIcon(part, 76);
    this.hero.position.set(HERO_X, WELCOME_H / 2);
    const room = w - TEXT_X - BTN_W - 40;
    const title = uiLabel(t('rt.sys.comeback.title'), { size: 32, anchorX: 0 });
    fitLabel(title, room, 32);
    title.position.set(TEXT_X, WELCOME_H / 2 - 19);
    const sub = uiLabel(`${partName(part)} ${partAmount(part)}`, { size: 26, color: Color.inkSoft, anchorX: 0 });
    fitLabel(sub, room, 26);
    sub.position.set(TEXT_X, WELCOME_H / 2 + 19);
    this.claimBtn = new Button({ label: t('rt.common.claim'), style: 'success', width: BTN_W, height: 88, fontSize: 34, disabledMark: 'none' });
    this.claimBtn.position.set(w - 24 - BTN_W / 2, WELCOME_H / 2);
    this.claimBtn.onTap(onClaim);
    this.addChild(this.hero, title, sub, this.claimBtn);
  }

  setClaimed(claimed: boolean): void {
    this.hero.alpha = claimed ? 0.45 : 1;
    this.claimBtn.setEnabled(!claimed);
    this.claimBtn.setLabel(t(claimed ? 'rt.common.claimed' : 'rt.common.claim'));
    if (claimed) this.claimBtn.stopPulse();
    else this.claimBtn.startPulse({ times: 4 });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
