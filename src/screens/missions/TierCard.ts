/** A card of three goal-and-reward steps (weekly cup, endless tiers) with one painted bar across them. */
import { Container, Graphics, type Text } from 'pixi.js';
import { t } from '@/core/i18n';
import { profile } from '@/meta';
import type { FeatureId } from '@/meta/data/schedule';
import { featureHint } from '@/meta/features';
import type { TierRow } from '@/meta/routines';
import { Button, Color, drawDashedRect, drawIcon, fitLabel, PaperLabel, paperSeed, ProgressBar, refreshCache, uiLabel, type IconName } from '@/ui';
import { lockedNote, paperSheet, stickerDisc } from '../system/kit/sheets';
import { CLAIM_BAR_H, ClaimAllBar } from './ClaimAllBar';
import { tierFill, tierMarks, waitingTiers, type WeekDay } from './model';
import { TIER_CELL_H, TierCell } from './TierCell';
import './strings';

export interface TierReading {
  tiers: TierRow[];
  /** The player's progress toward the tier goals (score or wave). */
  cur: number;
  /** The standing in one phrase, on a label at the top right. */
  headline: string;
  /** A soft line under the intro (the cup shows its days instead). */
  detail?: string;
  /** This week's seven days with their best waves (the weekly cup). */
  days?: readonly WeekDay[];
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
  /** Every reached tier in one go. */
  claimAll(from: Container): void;
  goLabelKey: string;
  go(): void;
}

const PAD = 28;
const CELL_GAP = 12;
const DAY_H = 84;
const DAY_GAP = 8;

export class TierCard extends Container {
  readonly cardH: number;
  private readonly cells: TierCell[] = [];
  private readonly bar: ProgressBar | null = null;
  private readonly headline: PaperLabel | null = null;
  private readonly detail: Text | null = null;
  private readonly marks: Container | null = null;
  private readonly claimBar: ClaimAllBar | null = null;
  private readonly dayHost: Container | null = null;
  private readonly seed = paperSeed();
  private markSig = '';
  private daySig = '';
  private shownHeadline = '';
  private readonly needs: number[] = [];
  private readonly barW: number;

  constructor(private readonly w: number, private readonly spec: TierCardSpec) {
    super();
    this.barW = w - PAD * 2 - 24;
    const unlocked = profile.featureUnlocked(spec.feature);
    const disc = stickerDisc(64, this.seed % 4);
    disc.position.set(PAD + 32, 50);
    const icon = drawIcon(spec.icon, 40);
    icon.position.copyFrom(disc.position);
    const title = uiLabel(t(spec.titleKey), { size: 34, anchorX: 0 });
    title.position.set(PAD + 82, 52);

    if (!unlocked) {
      this.cardH = 96 + 168 + PAD;
      const lock = lockedNote(w - PAD * 2, featureHint(spec.feature));
      lock.position.set(PAD, 96);
      this.addChild(paperSheet(w, this.cardH, { radius: 30, seed: this.seed }), disc, icon, title, lock);
      return;
    }

    const reading = spec.read();
    const sub = uiLabel(t(spec.subKey), { size: 24, color: Color.inkSoft, wrap: w - PAD * 2, align: 'left', anchorX: 0, anchorY: 0, lineHeight: 32 });
    sub.position.set(PAD, 96);
    let y = 96 + sub.height + 18;

    this.headline = new PaperLabel({ text: reading.headline, size: 26, paper: 'mustard', padX: 20, padY: 7, maxWidth: w - PAD * 2 - 82 - title.width - 20 });
    this.headline.position.set(w - PAD - this.headline.uiBox.w / 2, 52);
    this.shownHeadline = reading.headline;

    if (reading.days) {
      this.dayHost = new Container();
      this.dayHost.position.set(PAD, y);
      y += DAY_H + 22;
    }
    if (reading.detail !== undefined) {
      this.detail = uiLabel(reading.detail, { size: 24, anchorX: 0, anchorY: 0 });
      this.detail.position.set(PAD, y);
      y += this.detail.height + 14;
    }

    const barY = y + 22;
    this.needs = reading.tiers.map((r) => r.need);
    this.bar = new ProgressBar({ width: this.barW, height: 44, color: 'blue', value: tierFill(reading.cur, Math.max(...this.needs)), label: '' });
    this.bar.position.set(w / 2, barY);
    this.marks = new Container();
    this.marks.position.set(w / 2 - this.barW / 2, barY);

    const cellsY = barY + 22 + 52;
    const cellW = (w - PAD * 2 - CELL_GAP * (reading.tiers.length - 1)) / reading.tiers.length;
    reading.tiers.forEach((row, i) => {
      const cell = new TierCell(cellW, i, spec.head(row.need), row, reading.cur, (b) => spec.claim(i, b));
      cell.position.set(PAD + i * (cellW + CELL_GAP), cellsY);
      this.cells.push(cell);
      this.addChild(cell);
    });

    // One line under the cells: how many rewards wait and the button that takes them all, right-aligned with the cells.
    const claimY = cellsY + TIER_CELL_H + 8;
    this.claimBar = new ClaimAllBar({ width: w - PAD * 2, textX: 6, edge: 0, onClaim: (b) => spec.claimAll(b) });
    this.claimBar.position.set(PAD, claimY);

    const go = new Button({ label: t(spec.goLabelKey), style: 'info', width: 420, height: 88, fontSize: 32 });
    const goY = claimY + CLAIM_BAR_H + 8 + 44;
    go.position.set(w / 2, goY);
    go.onTap(() => spec.go());
    this.cardH = goY + 44 + 10 + PAD;
    this.addChildAt(paperSheet(w, this.cardH, { radius: 30, seed: this.seed, dash: 12 }), 0);
    this.addChild(disc, icon, title, this.headline, sub, this.bar, this.marks, this.claimBar, go);
    if (this.dayHost) this.addChild(this.dayHost);
    if (this.detail) this.addChild(this.detail);
    this.drawMarks(reading);
    this.drawDays(reading);
    this.sync(false);
  }

  /** Goal marks under the bar: a tick and the goal number at each tier's place. */
  private drawMarks(reading: TierReading): void {
    const host = this.marks;
    if (!host) return;
    const sig = reading.tiers.map((r) => (r.reached ? '1' : '0')).join('');
    if (sig === this.markSig) return;
    this.markSig = sig;
    host.removeChildren().forEach((c) => c.destroy({ children: true }));
    const g = new Graphics();
    host.addChild(g);
    const fr = tierMarks(this.needs);
    reading.tiers.forEach((row, i) => {
      const x = this.barW * (fr[i] ?? 1);
      g.roundRect(x - 2.5, 21, 5, 14, 2.5).fill(row.reached ? Color.leafDark : Color.kraftDark);
      const n = uiLabel(String(row.need), { size: 24, color: row.reached ? Color.leafDark : Color.inkSoft });
      n.position.set(Math.min(this.barW - n.width / 2 + 10, x), 48);
      host.addChild(n);
    });
    refreshCache(host);
  }

  /** The seven days of the week with the best wave of each: today is circled with the cut line, days to come are pale. */
  private drawDays(reading: TierReading): void {
    const host = this.dayHost;
    const days = reading.days;
    if (!host || !days) return;
    const sig = days.map((d) => `${d.best}${d.today ? 't' : ''}`).join('|');
    if (sig === this.daySig) return;
    this.daySig = sig;
    host.removeChildren().forEach((c) => c.destroy({ children: true }));
    const cw = (this.w - PAD * 2 - DAY_GAP * 6) / 7;
    const g = new Graphics();
    host.addChild(g);
    days.forEach((d, i) => {
      const x = i * (cw + DAY_GAP);
      const chip = paperSheet(cw, DAY_H, { fill: d.today ? Color.paperLight : Color.paperDim, radius: 16, seed: i + 11, shadow: d.best > 0 });
      chip.position.set(x, 0);
      const name = uiLabel(t(`rt.mis.day.${i}`), { size: 24, color: Color.inkSoft });
      fitLabel(name, cw - 6, 24);
      name.position.set(x + cw / 2, 22);
      const best = uiLabel(d.best > 0 ? String(d.best) : d.future ? '' : '-', { size: 32 });
      fitLabel(best, cw - 8, 32);
      best.position.set(x + cw / 2, 58);
      host.addChild(chip, name, best);
      if (d.today) drawDashedRect(g, x - 3, -3, cw + 6, DAY_H + 6, { radius: 18, width: 3.5, dash: 11, gap: 7 });
    });
  }

  sync(animate: boolean): void {
    if (!this.bar || !this.headline) return;
    const reading = this.spec.read();
    if (reading.headline !== this.shownHeadline) {
      this.shownHeadline = reading.headline;
      this.headline.setText(reading.headline);
      this.headline.position.x = this.w - PAD - this.headline.uiBox.w / 2;
    }
    if (this.detail && reading.detail !== undefined) this.detail.text = reading.detail;
    this.bar.setLabel('');
    this.bar.setValue(tierFill(reading.cur, Math.max(...this.needs)), animate);
    reading.tiers.forEach((row, i) => this.cells[i]?.sync(row, reading.cur, animate));
    this.claimBar?.sync(waitingTiers(reading.tiers));
    this.drawMarks(reading);
    this.drawDays(reading);
  }
}
