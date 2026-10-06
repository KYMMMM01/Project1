import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { lighten } from '@/core/math';
import { Ease } from '@/core/tween';
import type { Box } from './layoutMath';
import { motion, TweenBag } from './motion';
import { formatOdds, oddsBarWidth } from './oddsMath';
import { rarityName } from './rarity';
import { cacheStatic, drawPanel, refreshCache, vGradient } from './shapes';
import { fitLabel, uiLabel } from './text';
import { Color, Rarity, type RarityId } from './theme';

export interface OddsRow {
  /** Already-translated label. Optional when `rarity` is given: the themed rarity name is used. */
  label?: string;
  /** Chance of this outcome, 0..1. */
  value: number;
  /** Rarity of the outcome: colours the bar and supplies the default label. */
  rarity?: RarityId;
  /** Bar colour for rows that are not a rarity. */
  color?: number;
}

export interface OddsTableOpts {
  width?: number;
  rows?: readonly OddsRow[];
  /** Line under the rows, e.g. the pity rule. Already translated; wraps. */
  footnote?: string;
  /** Draw the recessed well behind the rows (default true). */
  framed?: boolean;
}

const ROW_H = 58;
const PAD = 22;
const LABEL_W = 176;
const PCT_W = 118;
const BAR_H = 22;
const DEFAULT_BAR = 0x7b6ea6;

/**
 * "What can I get, and how likely is it": rows of label + percentage bar + percentage text, with an
 * optional footnote for rules such as pity. Every random draw in the game shows its real odds
 * through this component. Origin = top-left corner.
 */
export class OddsTable extends Container {
  readonly uiBox: Box;
  private readonly tableW: number;
  private readonly framed: boolean;
  private readonly bag = new TweenBag();
  private readonly well = new Container();
  private readonly wellG = new Graphics();
  private readonly rowLayer = new Container();
  private footnoteText: string | undefined;
  private rows: readonly OddsRow[] = [];
  private totalH = 0;

  constructor(opts: OddsTableOpts = {}) {
    super();
    this.tableW = opts.width ?? 600;
    this.framed = opts.framed ?? true;
    this.uiBox = { x: 0, y: 0, w: this.tableW, h: 0 };
    this.well.addChild(this.wellG);
    this.addChild(this.well, this.rowLayer);
    this.footnoteText = opts.footnote;
    this.setRows(opts.rows ?? [], false);
  }

  /** Total height of the table at its current content. */
  get tableHeight(): number {
    return this.totalH;
  }

  /** Replace the rows. With `animate` the bars grow in one after another. */
  setRows(rows: readonly OddsRow[], animate = false): void {
    this.rows = rows;
    this.bag.killAll();
    for (const c of this.rowLayer.removeChildren()) c.destroy({ children: true });

    const trackX = PAD + LABEL_W;
    const trackW = this.tableW - PAD * 2 - LABEL_W - PCT_W;
    let y = PAD;
    rows.forEach((row, i) => {
      const cy = y + ROW_H / 2;
      const rar = row.rarity ? Rarity[row.rarity] : null;
      const label = uiLabel(row.label ?? (row.rarity ? rarityName(row.rarity) : ''), {
        size: 28,
        anchorX: 0,
        strokeWidth: 4,
        shadow: false,
      });
      fitLabel(label, LABEL_W - 12, 28);
      label.position.set(PAD, cy);

      const track = new Graphics();
      track.roundRect(trackX, cy - BAR_H / 2, trackW, BAR_H, BAR_H / 2).fill(vGradient(0x120a26, 0x241846)).stroke({ width: 3, color: Color.outline, alignment: 1 });
      cacheStatic(track);

      const fill = new Container();
      const w = oddsBarWidth(row.value, trackW - 6, BAR_H);
      const body = row.color ?? rar?.color ?? DEFAULT_BAR;
      const fg = new Graphics();
      if (w > 0) {
        fg.roundRect(0, 0, w, BAR_H - 6, (BAR_H - 6) / 2).fill(vGradient(rar?.light ?? lighten(body, 0.4), body));
        fg.roundRect(4, 2, Math.max(2, w - 8), (BAR_H - 6) * 0.38, 3).fill({ color: 0xffffff, alpha: 0.35 });
      }
      fill.addChild(fg);
      fill.position.set(trackX + 3, cy - (BAR_H - 6) / 2);

      const pct = uiLabel(formatOdds(row.value), { size: 30, anchorX: 1, strokeWidth: 4, shadow: false });
      fitLabel(pct, PCT_W - 8, 30);
      pct.position.set(this.tableW - PAD, cy);

      this.rowLayer.addChild(label, track, fill, pct);
      if (animate && !motion.reduced && w > 0) {
        fill.scale.x = 0;
        this.bag.run({
          duration: 0.45,
          delay: 0.05 * i,
          ease: Ease.cubicOut,
          onUpdate: (k) => {
            fill.scale.x = k;
          },
          onComplete: () => {
            fill.scale.x = 1;
          },
        });
      }
      y += ROW_H;
    });

    if (this.footnoteText) {
      const t = uiLabel(this.footnoteText, {
        size: 24,
        color: 0xcabfee,
        stroke: false,
        wrap: this.tableW - PAD * 2,
        lineHeight: 32,
        align: 'left',
        anchorX: 0,
        anchorY: 0,
      });
      t.position.set(PAD, y + 6);
      this.rowLayer.addChild(t);
      y += 6 + t.height;
    }
    this.totalH = y + PAD;
    this.uiBox.h = this.totalH;
    this.drawWell();
  }

  setFootnote(text: string | undefined): void {
    if (text === this.footnoteText) return;
    this.footnoteText = text;
    this.setRows(this.rows, false);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }

  private drawWell(): void {
    this.wellG.clear();
    this.well.visible = this.framed;
    if (!this.framed) return;
    drawPanel(this.wellG, 0, 0, this.tableW, this.totalH, 'inset', { radius: 28 });
    refreshCache(this.well);
  }
}
