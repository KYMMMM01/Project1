import { fmt } from '@/core/format';
import { t } from '@/core/i18n';
import { profile, type DungeonView } from '@/meta';
import { DUNGEON_AD_PLACEMENT } from '@/meta/data/dungeon';
import { ads } from '@/platform';
import { Button, Color, Tag, drawIcon, fitLabel, uiLabel } from '@/ui';
import type { Shell } from '../contract';
import { dungeonOffer, entriesText, shownTier, stepTier } from './dungeonModel';
import { CARD_PAD, HEAD_GROW, HomeCard } from './HomeCard';
import './strings';

const H = 328 + HEAD_GROW;
const BTN_W = 248;
/** Width of the column left of the buttons. */
const LEFT_W = 356;
const STEP = 88;

/** The tier the player picked, kept while the home scene is rebuilt (0 = the highest open one). */
let picked = 0;

/**
 * The gold dungeon: a short run that pays gold by waves cleared and kills. The card says which tier
 * it will play, the best result there, what a full clear pays, how many entries are left today, and
 * offers the extra entry (a rewarded ad or gems) once the free ones are used.
 */
export class DungeonCard extends HomeCard {
  private readonly entries: Tag;
  private readonly tierName = uiLabel('', { size: 34 });
  private readonly tierSub = uiLabel('', { size: 24, color: Color.inkSoft });
  private readonly less: Button;
  private readonly more: Button;
  private readonly best = uiLabel('', { size: 24, anchorX: 0, color: Color.inkSoft });
  private readonly reward = uiLabel('', { size: 28, anchorX: 0 });
  private readonly bonus: Tag;
  private readonly note = uiLabel('', { size: 24, anchorX: 0, anchorY: 0, align: 'left', wrap: LEFT_W });
  private readonly play: Button;
  private readonly ad: Button;
  private readonly gems: Button;
  private readonly coin = drawIcon('coin', 40);

  constructor(
    w: number,
    private readonly shell: Shell,
  ) {
    super(w, H, t('battle.dungeon.title'), 'coin', { tape: 'yellow', reserve: 150 });
    const left = CARD_PAD;
    this.entries = new Tag({ text: '-', style: 'info', shape: 'pill', fontSize: 24 });
    this.body.addChild(this.entries);

    // The tier stepper: two big paper buttons around the tier's name.
    const rowY = this.contentTop + 16 + STEP / 2;
    this.less = new Button({ icon: 'minus', style: 'neutral', width: STEP, height: STEP, radius: 'pill', disabledMark: 'none' });
    this.less.position.set(left + STEP / 2, rowY);
    this.less.onTap(() => this.step(-1));
    this.more = new Button({ icon: 'plus', style: 'neutral', width: STEP, height: STEP, radius: 'pill', disabledMark: 'none' });
    this.more.position.set(left + LEFT_W - STEP / 2, rowY);
    this.more.onTap(() => this.step(1));
    const mid = left + LEFT_W / 2;
    this.tierName.position.set(mid, rowY - 14);
    this.tierSub.position.set(mid, rowY + 22);
    this.body.addChild(this.less, this.more, this.tierName, this.tierSub);

    this.coin.position.set(left + 20, this.contentTop + 16 + STEP + 32);
    this.reward.position.set(left + 48, this.contentTop + 16 + STEP + 32);
    this.best.position.set(left, this.contentTop + 16 + STEP + 66);
    this.bonus = new Tag({ text: '-', style: 'success', shape: 'pill', fontSize: 24 });
    this.bonus.position.set(left + LEFT_W / 2, this.contentTop + 16 + STEP + 118);
    this.note.position.set(left, this.contentTop + 16 + STEP + 88);
    this.body.addChild(this.coin, this.reward, this.best, this.bonus, this.note);

    const x = w - CARD_PAD - BTN_W / 2;
    this.play = new Button({ label: t('battle.dungeon.play'), icon: 'play', style: 'primary', width: BTN_W, height: 136, fontSize: 40, disabledMark: 'none' });
    this.play.position.set(x, this.contentTop + 16 + 110);
    this.play.onTap(() => this.enter());
    this.ad = new Button({ label: t('battle.dungeon.ad'), icon: 'ad', style: 'success', width: BTN_W, height: 96, fontSize: 32, disabledMark: 'none' });
    this.ad.position.set(x, this.contentTop + 16 + 48);
    this.ad.onTap(() => void this.buy('ad'));
    this.gems = new Button({ label: '', icon: 'gem', style: 'info', width: BTN_W, height: 96, fontSize: 34 });
    this.gems.position.set(x, this.contentTop + 16 + 48 + 96 + 12);
    this.gems.onTap(() => void this.buy('gems'));
    this.body.addChild(this.play, this.ad, this.gems);
    this.sync();
  }

  private view(): DungeonView {
    return profile.dungeonView();
  }

  private tier(v: DungeonView): number {
    return shownTier(v.top, picked);
  }

  private step(dir: -1 | 1): void {
    const v = this.view();
    picked = stepTier(v.top, this.tier(v), dir);
    this.sync();
  }

  private enter(): void {
    const tier = this.tier(this.view());
    if (tier > 0) void this.shell.startRun({ mode: 'gold', chapter: tier });
  }

  /** Pay for the day's extra entry, then walk in with it (the pre-run page can still be backed out of: the entry stays bought). */
  private async buy(via: 'ad' | 'gems'): Promise<void> {
    const button = via === 'ad' ? this.ad : this.gems;
    const r = await this.claim(button, async () => profile.buyDungeonEntry(via));
    if (!r) return;
    this.sync();
    this.shell.refresh();
    this.enter();
  }

  override sync(): void {
    const v = this.view();
    const tier = this.tier(v);
    const row = v.tiers[tier - 1];
    const offer = dungeonOffer(v);
    this.entries.setText(t('battle.dungeon.entries', { n: entriesText(v.entriesLeft, v.freeEntries, v.bought) }));
    this.entries.position.set(this.cardW - CARD_PAD - this.entries.uiBox.w / 2, this.head.cy);

    this.tierName.text = t('battle.dungeon.tier', { n: tier });
    fitLabel(this.tierName, LEFT_W - STEP * 2 - 16, 34);
    this.tierSub.text = t('chapter.' + tier + '.name');
    fitLabel(this.tierSub, LEFT_W - STEP * 2 - 16, 24);
    this.less.setEnabled(tier > 1);
    this.more.setEnabled(tier < v.top);

    if (row) {
      this.reward.text = t('battle.dungeon.reward', { n: fmt(row.maxGold) });
      fitLabel(this.reward, LEFT_W - 48, 28);
      this.best.text = row.best.gold > 0 ? t('battle.dungeon.best', { gold: fmt(row.best.gold), waves: row.best.waves, kills: row.best.kills }) : t('battle.dungeon.none');
      fitLabel(this.best, LEFT_W, 24);
      this.bonus.setText(t('battle.dungeon.bonus', { n: fmt(row.bonus) }));
    }
    this.bonus.visible = offer === 'enter' && v.firstClearOpen;
    this.note.visible = offer !== 'enter';
    this.note.text = offer === 'buy' ? t('battle.dungeon.buy') : t('battle.dungeon.spent');

    this.play.visible = offer !== 'buy';
    this.ad.visible = offer === 'buy';
    this.gems.visible = offer === 'buy';
    if (offer === 'buy') {
      this.ad.setEnabled(ads.canOffer(DUNGEON_AD_PLACEMENT));
      this.gems.setLabel(fmt(v.entryGems));
    }
    this.play.setEnabled(offer === 'enter');
    this.play.setLabel(offer === 'spent' ? t('battle.dungeon.tomorrow') : t('battle.dungeon.play'));
    this.play.setIcon(offer === 'spent' ? 'clock' : 'play');
  }
}
