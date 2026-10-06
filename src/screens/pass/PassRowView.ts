/** One tier of the season pass: the free cell, the tier medallion and the premium cell. */
import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { t } from '@/core/i18n';
import type { PassRow } from '@/meta/routines';
import { drawIcon } from '@/ui/icons';
import { bindPress, type PressBinding } from '@/ui/press';
import { cacheStatic, drawPill, vGradient } from '@/ui/shapes';
import { uiLabel } from '@/ui/text';
import { ButtonPalettes, Color } from '@/ui/theme';
import { partsOf } from '../system/kit/parts';
import { RewardList } from '../system/kit/rewardChip';
import { ClaimedMark, sharedPanel } from '../system/kit/widgets';
import { PASS_ROW_H } from './model';
import './strings';

export type PassTrackId = 'free' | 'premium';
/** What a tap on a cell means right now. */
export type CellTap = 'claim' | 'premium' | 'notYet' | 'done';

/** Width of the medallion column between the two reward columns. */
export const MEDAL_W = 88;
const STRIP_H = 42;

type PanelKind = 'inset' | 'gold' | 'default';

function panelOf(row: PassRow): PanelKind {
  if (row.claimed) return 'default';
  return row.claimable ? 'gold' : 'inset';
}

/** Origin = top-left of the cell (it scales about its centre). The whole cell is the touch target. */
export class PassCell extends Container {
  private readonly bgs = new Map<PanelKind, Container>();
  private readonly reward: RewardList;
  private readonly strip = new Container();
  private readonly mark = new ClaimedMark(50);
  private readonly lock: Container;
  private readonly press: PressBinding;
  private tapKind: CellTap = 'notYet';

  constructor(
    private readonly w: number,
    private readonly track: PassTrackId,
    row: PassRow,
    owned: boolean,
    onTap: (kind: CellTap) => void,
  ) {
    super();
    const h = PASS_ROW_H;
    this.reward = new RewardList(partsOf(row.reward), { direction: 'row', size: 58, fontSize: 28, gap: 18, maxWidth: (w - 40) / 2, layout: 'column' });
    this.reward.position.set(w / 2, 14 + 52);

    const pal = ButtonPalettes.success;
    const stripBg = new Graphics();
    drawPill(stripBg, -(w - 36) / 2, -STRIP_H / 2, w - 36, STRIP_H, { top: pal.top, bottom: pal.bottom, outline: pal.textStroke, shadow: false });
    cacheStatic(stripBg);
    const stripLabel = uiLabel(t('rt.common.claim'), { size: 28, stroke: pal.textStroke, strokeWidth: 5 });
    this.strip.addChild(stripBg, stripLabel);
    this.strip.position.set(w / 2, h - 14 - STRIP_H / 2);

    this.mark.position.set(w - 34, 34);
    this.lock = drawIcon('lock', 40);
    this.lock.position.set(w - 34, 34);
    this.addChild(this.reward, this.strip, this.mark, this.lock);
    if (track === 'premium') {
      const crown = drawIcon('crown', 40, owned ? Color.gold : Color.neutral);
      crown.position.set(34, 34);
      this.addChild(crown);
    }

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

  /** Put the cell's top-left corner at (x, 0) of its row. */
  place(x: number): void {
    this.position.set(x + this.w / 2, PASS_ROW_H / 2);
  }

  private background(kind: PanelKind): Container {
    let bg = this.bgs.get(kind);
    if (!bg) {
      bg = sharedPanel(this.w, PASS_ROW_H, kind, 28);
      this.addChildAt(bg, 0);
      this.bgs.set(kind, bg);
    }
    return bg;
  }

  sync(row: PassRow, owned: boolean, animate: boolean): void {
    const kind = panelOf(row);
    const bg = this.background(kind);
    for (const other of this.bgs.values()) other.visible = other === bg;
    this.reward.setDim(row.claimed || !row.claimable);
    this.strip.visible = row.claimable;
    const wasDone = this.mark.visible;
    this.mark.visible = row.claimed;
    if (animate && row.claimed && !wasDone) this.mark.stamp();
    this.lock.visible = !row.claimed && (this.track === 'premium' ? !owned : !row.reached);
    if (row.claimable) this.tapKind = 'claim';
    else if (row.claimed) this.tapKind = 'done';
    else if (this.track === 'premium' && !owned) this.tapKind = 'premium';
    else this.tapKind = 'notYet';
  }

  override destroy(options?: DestroyOptions): void {
    this.press.dispose();
    super.destroy(options);
  }
}

/** The tier medallion in the middle column. Origin = its centre. */
class Medal extends Container {
  private readonly g = new Graphics();
  private readonly text = uiLabel('', { size: 32, strokeWidth: 5 });
  private state = '';

  constructor(tier: number) {
    super();
    this.text.text = String(tier);
    this.addChild(this.g, this.text);
  }

  paint(reached: boolean, current: boolean): void {
    const key = `${reached}${current}`;
    if (key === this.state) return;
    this.state = key;
    const g = this.g;
    g.clear();
    const r = current ? 40 : 34;
    g.circle(0, 4, r).fill({ color: Color.black, alpha: 0.3 });
    const top = reached ? 0xffe27a : Color.panelLight;
    const bottom = reached ? Color.primary : Color.panelDark;
    g.circle(0, 0, r).fill(vGradient(top, bottom)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    this.text.alpha = reached ? 1 : 0.7;
  }
}

/** Origin = top-left of the row: free cell, medallion column, premium cell. */
export class PassRowView extends Container {
  private readonly freeCell: PassCell;
  private readonly premiumCell: PassCell;
  private readonly medal: Medal;

  constructor(
    cellW: number,
    tier: number,
    free: PassRow,
    premium: PassRow,
    owned: boolean,
    onTap: (track: PassTrackId, kind: CellTap, cell: PassCell) => void,
  ) {
    super();
    this.freeCell = new PassCell(cellW, 'free', free, owned, (k) => onTap('free', k, this.freeCell));
    this.premiumCell = new PassCell(cellW, 'premium', premium, owned, (k) => onTap('premium', k, this.premiumCell));
    this.freeCell.place(0);
    this.premiumCell.place(cellW + MEDAL_W);
    this.medal = new Medal(tier);
    this.medal.position.set(cellW + MEDAL_W / 2, PASS_ROW_H / 2);
    this.addChild(this.freeCell, this.medal, this.premiumCell);
  }

  sync(free: PassRow, premium: PassRow, owned: boolean, current: boolean, animate: boolean): void {
    this.freeCell.sync(free, owned, animate);
    this.premiumCell.sync(premium, owned, animate);
    this.medal.paint(free.reached, current);
  }
}
