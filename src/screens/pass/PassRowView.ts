/** One tier of the season pass: a sticker card on the free lane, the tier medal on the track, a sticker card on the premium lane. */
import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import type { PassRow } from '@/meta/routines';
import { Ease } from '@/core/tween';
import { Color, cacheStatic, drawDashedRect, drawIcon, motion, PaperLabel, TweenBag, tapeStrip, uiLabel } from '@/ui';
import { bindPress, type PressBinding } from '@/ui/press';
import { t } from '@/core/i18n';
import { StampMark } from '../system/kit/marks';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { SHEET_SEEDS, sharedSheet, stickerDisc } from '../system/kit/sheets';
import { PASS_ROW_H } from './model';
import './strings';

export type PassTrackId = 'free' | 'premium';
/** What a tap on a cell means right now. */
export type CellTap = 'claim' | 'premium' | 'notYet' | 'done';

/** Width of the medal column between the two lanes. */
export const MEDAL_W = 88;
/** Space between a lane's edge and the cards on it. */
export const LANE_INSET = 12;

/** Origin = top-left of the card (it scales about its centre). The whole card is the touch target. */
export class PassCell extends Container {
  private readonly reward: RewardList;
  private readonly press: PressBinding;
  private ring: Graphics | null = null;
  private lock: Container | null = null;
  private stamp: StampMark | null = null;
  private tag: PaperLabel | null = null;
  private tapKind: CellTap = 'notYet';
  private claimed = false;
  private readonly bag = new TweenBag();
  /** Where the card sits in the season: the lower tiers lose their lock first. */
  private readonly order: number;

  constructor(
    private readonly w: number,
    private readonly track: PassTrackId,
    tier: number,
    row: PassRow,
    owned: boolean,
    onTap: (kind: CellTap) => void,
  ) {
    super();
    this.order = tier;
    const h = PASS_ROW_H;
    const parts = partsOf(row.reward);
    const many = parts.length > 1;
    this.addChild(sharedSheet(w, h, { fill: Color.paperLight, radius: 22, seed: SHEET_SEEDS[tier % SHEET_SEEDS.length] }));
    this.reward = new RewardList(parts, { direction: 'row', layout: 'column', size: many ? 62 : 80, fontSize: 28, gap: 12, maxWidth: (w - 24) / Math.max(1, parts.length) });
    this.reward.position.set(w / 2, h / 2 + 2);
    this.addChild(this.reward);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new Rectangle(0, 0, w, h);
    this.pivot.set(w / 2, h / 2);
    this.press = bindPress(this, {
      down: () => this.scale.set(0.97),
      up: (fire) => {
        this.scale.set(1);
        if (fire) onTap(this.tapKind);
      },
    });
    this.sync(row, owned, false);
  }

  /** Put the card's top-left corner at (x, 0) of its row. */
  place(x: number): void {
    this.position.set(x + this.w / 2, PASS_ROW_H / 2);
  }

  sync(row: PassRow, owned: boolean, animate: boolean): void {
    const h = PASS_ROW_H;
    const w = this.w;
    const locked = !row.claimed && (this.track === 'premium' ? !owned : !row.reached);
    this.reward.setDim(row.claimed || (!row.claimable && locked));
    this.reward.y = h / 2 + (row.claimable ? 8 : 2);

    if (row.claimable && !this.ring) {
      this.ring = new Graphics();
      drawDashedRect(this.ring, 6, 6, w - 12, h - 12, { radius: 17, width: 3.5, dash: 12, gap: 8 });
      cacheStatic(this.ring);
      this.addChildAt(this.ring, 1);
    }
    if (this.ring) this.ring.visible = row.claimable;
    if (row.claimable && !this.tag) {
      this.tag = new PaperLabel({ text: t('rt.common.claim'), size: 26, paper: 'success', padX: 22, padY: 5, torn: 'ends', maxWidth: w - 24 });
      this.tag.position.set(w / 2, 4);
      this.addChild(this.tag);
    }
    if (this.tag) this.tag.visible = row.claimable;

    if (locked && !this.lock) {
      this.lock = new Container();
      this.lock.addChild(stickerDisc(50, 2), drawIcon('lock', 30));
      this.lock.position.set(w - 34, 34);
      this.lock.rotation = 0.1;
      this.addChild(this.lock);
    }
    if (this.lock) {
      const wasLocked = this.lock.visible;
      this.lock.visible = locked;
      if (animate && wasLocked && !locked) this.peelLock(this.lock);
    }

    if (row.claimed && !this.stamp) {
      this.stamp = new StampMark({ size: 40, tilt: -0.22 });
      this.stamp.position.set(w / 2, h / 2 - 6);
      this.addChild(this.stamp);
    }
    if (this.stamp) {
      this.stamp.visible = row.claimed;
      if (animate && row.claimed && !this.claimed) this.stamp.slam();
    }
    this.claimed = row.claimed;

    if (row.claimable) this.tapKind = 'claim';
    else if (row.claimed) this.tapKind = 'done';
    else if (this.track === 'premium' && !owned) this.tapKind = 'premium';
    else this.tapKind = 'notYet';
  }

  /** The padlock sticker is peeled off the card: it lifts, turns and fades, a little later for each higher tier. */
  private peelLock(lock: Container): void {
    if (motion.reduced) return;
    const { x, y } = lock.position;
    const rot = lock.rotation;
    lock.visible = true;
    this.bag.run({
      duration: 0.3,
      delay: Math.min(0.3, this.order * 0.015),
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        lock.alpha = 1 - k;
        lock.scale.set(1 + 0.35 * k);
        lock.rotation = rot + 0.5 * k;
        lock.position.set(x, y - 16 * k);
      },
      onComplete: () => {
        lock.visible = false;
        lock.alpha = 1;
        lock.scale.set(1);
        lock.rotation = rot;
        lock.position.set(x, y);
      },
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.press.dispose();
    super.destroy(options);
  }
}

/** The tier medal on the track: an ivory sticker, mustard once reached, a larger one with tape for the current tier. Origin = its centre. */
class Medal extends Container {
  private readonly plain = stickerDisc(66, 1);
  private readonly gold = stickerDisc(66, 1, Color.mustard);
  private tape: Graphics | null = null;
  private state = '';

  constructor(tier: number) {
    super();
    this.addChild(this.plain, this.gold, uiLabel(String(tier), { size: 32 }));
  }

  paint(reached: boolean, current: boolean): void {
    const key = `${reached}${current}`;
    if (key === this.state) return;
    this.state = key;
    this.gold.visible = reached;
    this.plain.visible = !reached;
    if (current && !this.tape) {
      this.tape = tapeStrip({ name: 'sky', pattern: 'dots', w: 70, h: 24, angle: -24 });
      this.tape.position.set(-6, -30);
      this.addChild(this.tape);
    }
    if (this.tape) this.tape.visible = current;
    this.scale.set(current ? 1.18 : 1);
  }
}

/** Origin = top-left of the row: free card, medal column, premium card. */
export class PassRowView extends Container {
  private readonly freeCell: PassCell;
  private readonly premiumCell: PassCell;
  private readonly medal: Medal;

  constructor(
    laneW: number,
    tier: number,
    free: PassRow,
    premium: PassRow,
    owned: boolean,
    onTap: (track: PassTrackId, kind: CellTap, cell: PassCell) => void,
  ) {
    super();
    const cardW = laneW - LANE_INSET * 2;
    this.freeCell = new PassCell(cardW, 'free', tier, free, owned, (k) => onTap('free', k, this.freeCell));
    this.premiumCell = new PassCell(cardW, 'premium', tier + 1, premium, owned, (k) => onTap('premium', k, this.premiumCell));
    this.freeCell.place(LANE_INSET);
    this.premiumCell.place(laneW + MEDAL_W + LANE_INSET);
    this.medal = new Medal(tier);
    this.medal.position.set(laneW + MEDAL_W / 2, PASS_ROW_H / 2);
    this.addChild(this.freeCell, this.medal, this.premiumCell);
  }

  sync(free: PassRow, premium: PassRow, owned: boolean, current: boolean, animate: boolean): void {
    this.freeCell.sync(free, owned, animate);
    this.premiumCell.sync(premium, owned, animate);
    this.medal.paint(free.reached, current);
  }
}
