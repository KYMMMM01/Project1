/** A card of three goal-and-reward steps (weekly cup, endless tiers) with one progress bar across them. */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { FeatureId } from '@/meta/data/schedule';
import { featureHint } from '@/meta/features';
import type { TierRow } from '@/meta/routines';
import { Button } from '@/ui/Button';
import { ProgressBar } from '@/ui/ProgressBar';
import { drawIcon, type IconName } from '@/ui/icons';
import { refreshCache } from '@/ui/shapes';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { bakedPanel, lockedCard } from '../system/kit/widgets';
import { tierFill, tierMarks } from './model';
import { TIER_CELL_H, TierCell } from './TierCell';
import './strings';

export interface TierReading {
  tiers: TierRow[];
  /** The player's progress toward the tier goals (score or wave). */
  cur: number;
  headline: string;
  detail: string;
}

export interface TierCardSpec {
  titleKey: string;
  subKey: string;
  icon: IconName;
  feature: FeatureId;
  /** Text above a tier cell, from the goal. */
  head(need: number): string;
  read(): TierReading;
  claim(tier: number, from: Container): void;
  goLabelKey: string;
  go(): void;
}

const PAD = 28;
const CELL_GAP = 12;

export class TierCard extends Container {
  readonly cardH: number;
  private readonly cells: TierCell[] = [];
  private readonly bar: ProgressBar | null = null;
  private readonly headline: Text | null = null;
  private readonly detail: Text | null = null;
  private readonly marks: Container | null = null;
  private markSig = '';
  private readonly needs: number[] = [];

  constructor(private readonly w: number, private readonly spec: TierCardSpec) {
    super();
    const unlocked = profile.featureUnlocked(spec.feature);
    const title = uiLabel(t(spec.titleKey), { size: 36, anchorX: 0, strokeWidth: 6 });
    title.position.set(PAD + 56 + 14, 54);
    const icon = drawIcon(spec.icon, 60);
    icon.position.set(PAD + 30, 52);

    if (!unlocked) {
      this.cardH = 90 + 180 + PAD;
      this.addChild(bakedPanel(w, this.cardH, 'default', 34), icon, title);
      const lock = lockedCard(w - PAD * 2, featureHint(spec.feature));
      lock.position.set(PAD, 94);
      this.addChild(lock);
      return;
    }

    const reading = spec.read();
    const sub = uiLabel(t(spec.subKey), { size: 24, color: Color.textDim, wrap: w - PAD * 2, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 32, strokeWidth: 4, shadow: false });
    sub.position.set(PAD, 94);
    this.headline = uiLabel(reading.headline, { size: 30, color: Color.gold, anchorX: 1, strokeWidth: 5 });
    this.headline.position.set(w - PAD, 54);
    fitLabel(this.headline, w - PAD * 2 - title.width - 100, 30);
    this.detail = uiLabel(reading.detail, { size: 24, anchorX: 0, strokeWidth: 4, shadow: false });
    this.detail.position.set(PAD, 94 + sub.height + 14 + 12);

    const barY = 94 + sub.height + 14 + 24 + 44;
    this.needs = reading.tiers.map((r) => r.need);
    const barW = w - PAD * 2 - 24;
    this.bar = new ProgressBar({ width: barW, height: 40, color: 'blue', value: tierFill(reading.cur, Math.max(...this.needs)), label: '' });
    this.bar.position.set(w / 2, barY);
    this.marks = new Container();
    this.marks.position.set(w / 2 - barW / 2, barY);

    const cellsY = barY + 20 + 56;
    const cellW = (w - PAD * 2 - CELL_GAP * (reading.tiers.length - 1)) / reading.tiers.length;
    reading.tiers.forEach((row, i) => {
      const cell = new TierCell(cellW, spec.head(row.need), row, reading.cur, (b) => spec.claim(i, b));
      cell.position.set(PAD + i * (cellW + CELL_GAP), cellsY);
      this.cells.push(cell);
      this.addChild(cell);
    });

    const go = new Button({ label: t(spec.goLabelKey), style: 'info', width: 400, height: 88, fontSize: 32 });
    const goY = cellsY + TIER_CELL_H + 30 + 44;
    go.position.set(w / 2, goY);
    go.onTap(() => spec.go());
    this.cardH = goY + 44 + 12 + PAD;
    this.addChildAt(bakedPanel(w, this.cardH, 'default', 34), 0);
    this.addChild(icon, title, this.headline, sub, this.detail, this.bar, this.marks, go);
    this.drawMarks(reading);
    this.sync(false);
  }

  private drawMarks(reading: TierReading): void {
    const host = this.marks;
    if (!host) return;
    const sig = reading.tiers.map((r) => (r.reached ? '1' : '0')).join('');
    if (sig === this.markSig) return;
    this.markSig = sig;
    const barW = this.w - PAD * 2 - 24;
    host.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    host.addChild(g);
    const fr = tierMarks(this.needs);
    reading.tiers.forEach((row, i) => {
      const x = barW * (fr[i] ?? 1);
      g.roundRect(x - 3, 16, 6, 16, 3).fill(row.reached ? Color.gold : Color.neutral);
      const n = uiLabel(String(row.need), { size: 24, color: row.reached ? Color.gold : Color.textDim, strokeWidth: 4, shadow: false });
      n.position.set(Math.min(barW - n.width / 2 + 10, x), 46);
      host.addChild(n);
    });
    refreshCache(host);
  }

  sync(animate: boolean): void {
    if (!this.bar || !this.headline || !this.detail) return;
    const reading = this.spec.read();
    this.headline.text = reading.headline;
    this.detail.text = reading.detail;
    this.bar.setLabel('');
    this.bar.setValue(tierFill(reading.cur, Math.max(...this.needs)), animate);
    reading.tiers.forEach((row, i) => this.cells[i]?.sync(row, reading.cur, animate));
    this.drawMarks(reading);
  }
}
