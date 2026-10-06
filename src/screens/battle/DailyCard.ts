import { t } from '@/core/i18n';
import { fmt } from '@/core/format';
import { modifierName, modifierText } from '@/game';
import { bundleParts, profile } from '@/meta';
import { Button, Color, ProgressBar, Tag, fitLabel, uiLabel } from '@/ui';
import { services, type Shell } from '../contract';
import { CARD_PAD, HomeCard } from './HomeCard';
import { playClaim } from './claim';
import { cupProgress } from './model';
import './strings';

const H = 344;
const BTN_W = 232;

/** The daily challenge: today's code and rule, the best wave so far, and the weekly cup with its prizes. */
export class DailyCard extends HomeCard {
  private readonly rule = uiLabel('', { size: 30, anchorX: 0, color: Color.primary });
  private readonly ruleText = uiLabel('', { size: 24, anchorX: 0, anchorY: 0, stroke: false, shadow: false, align: 'left', wrap: 360 });
  private readonly best = uiLabel('', { size: 26, anchorX: 0, color: Color.textDim, stroke: false, shadow: false });
  private readonly code: Tag;
  private readonly cup: ProgressBar;
  private readonly cupNote = uiLabel('', { size: 24, anchorX: 0, color: Color.textDim, stroke: false, shadow: false });
  private readonly play: Button;
  private readonly claimCup: Button;
  private codeText = '';

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.daily.title'), 'trophy');
    const left = CARD_PAD;
    this.rule.position.set(left, this.contentTop + 22);
    this.ruleText.position.set(left, this.contentTop + 46);
    this.best.position.set(left, this.contentTop + 128);
    this.code = new Tag({ text: '-', style: 'info', shape: 'pill', fontSize: 24 });
    this.body.addChild(this.code, this.rule, this.ruleText, this.best);
    this.cup = new ProgressBar({ width: 372, height: 36, color: 'purple', label: '' });
    this.cup.position.set(left + 186, this.contentTop + 190);
    this.cupNote.position.set(left, this.contentTop + 236);
    this.body.addChild(this.cup, this.cupNote);

    const x = w - CARD_PAD - BTN_W / 2;
    this.play = new Button({ label: t('battle.daily.play'), icon: 'play', style: 'primary', width: BTN_W, height: 96, fontSize: 40 });
    this.play.position.set(x, this.contentTop + 56);
    this.play.onTap(() => void this.shell.startRun({ mode: 'daily' }));
    this.claimCup = new Button({ label: t('battle.cup.claim'), icon: 'gift', style: 'success', width: BTN_W, height: 96, fontSize: 28 });
    this.claimCup.position.set(x, this.contentTop + 56 + 96 + 14);
    this.claimCup.onTap(() => void this.takeCup());
    this.body.addChild(this.play, this.claimCup);
    this.sync();
  }

  get claimable(): number {
    return profile.cupView().tiers.filter((tier) => tier.reached && !tier.claimed).length;
  }

  override sync(): void {
    const v = profile.dailyView();
    const cup = profile.cupView();
    const mod = v.setup.modifiers[0];
    this.rule.text = mod ? modifierName(mod) : t('battle.daily.title');
    fitLabel(this.rule, 360, 30);
    this.ruleText.text = mod ? modifierText(mod) : '';
    this.best.text = v.clearedToday ? t('battle.daily.cleared') : v.bestToday > 0 ? t('battle.daily.best', { n: v.bestToday }) : t('battle.daily.none');
    if (v.setup.code !== this.codeText) {
      this.codeText = v.setup.code;
      this.code.setText(v.setup.code);
    }
    this.code.position.set(this.cardW - CARD_PAD - this.code.uiBox.w / 2 - 4, 38);
    const { next, fraction } = cupProgress(cup.score, cup.tiers);
    this.cup.setValue(fraction, false);
    this.cup.setLabel(t('battle.daily.cup', { score: fmt(cup.score) }));
    this.cupNote.text = next === null ? t('battle.daily.cup.done') : t('battle.daily.cup.next', { need: fmt(next) });
    fitLabel(this.cupNote, 380, 24);
    const waiting = cup.tiers.some((tier) => tier.reached && !tier.claimed);
    this.claimCup.setEnabled(waiting);
    if (waiting) this.claimCup.startPulse({ times: 3 });
  }

  private async takeCup(): Promise<void> {
    const index = profile.cupView().tiers.findIndex((tier) => tier.reached && !tier.claimed);
    if (index < 0) return;
    const r = await this.claim(this.claimCup, async () => profile.claimCup(index));
    if (!r) return;
    const rest = playClaim(this.claimCup, bundleParts(r.value), this.shell);
    this.sync();
    this.shell.refresh();
    if (rest.length > 0) await services.showRewards(rest, t('battle.daily.title'));
  }
}
