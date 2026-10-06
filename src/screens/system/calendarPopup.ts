/** The 28-day attendance calendar as a wall calendar: date squares with a sticker each, claimed days stamped, today taped and circled, and bigger stickers on days 7 / 14 / 21 / 28. */
import { Container, Graphics, type DestroyOptions, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { errorKey, profile } from '@/meta';
import { Button, Color, motion, Panel, Popup, tapeStrip, toast, TweenBag, uiLabel } from '@/ui';
import type { Shell } from '../contract';
import { payout } from './kit/claimFx';
import { StampMark } from './kit/marks';
import { partsOf } from './kit/parts';
import { RewardChip, partSticker } from './kit/rewardChip';
import { paperSheet, SHEET_SEEDS, sharedSheet } from './kit/sheets';
import { calendarCellState, isBigDay, type CellState } from './calendarModel';
import './strings';

const COLS = 7;
const CELL_W = 78;
/** The last column holds days 7 / 14 / 21 / 28: wider, with a larger sticker. */
const BIG_W = 108;
const CELL_H = 120;
const GAP = 8;
const W = 680;
const GRID_W = (COLS - 1) * CELL_W + BIG_W + (COLS - 1) * GAP;

class CalendarCell extends Container {
  private readonly bag = new TweenBag();
  private readonly chip: RewardChip | null;
  private readonly stamp = new StampMark({ size: 24, tilt: -0.2 });
  private readonly tape: Graphics;
  private readonly circle = new Graphics();
  private readonly dayText: Text;
  private readonly cw: number;
  private state: CellState = 'upcoming';

  constructor(readonly day: number, bundle: Parameters<typeof partsOf>[0]) {
    super();
    const big = isBigDay(day);
    const cw = big ? BIG_W : CELL_W;
    this.cw = cw;
    const parts = partsOf(bundle);
    this.addChild(sharedSheet(cw, CELL_H, { fill: Color.paperLight, radius: 16, seed: SHEET_SEEDS[day % SHEET_SEEDS.length], featured: big }));

    this.dayText = uiLabel(String(day), { size: 26 });
    this.dayText.position.set(big ? 28 : 22, 24);
    // A marker circle round today's date.
    this.circle.ellipse(this.dayText.x, this.dayText.y, 17, 15).stroke({ width: 3.5, color: Color.coral, alpha: 0.95 });
    this.circle.ellipse(this.dayText.x + 1.5, this.dayText.y - 1, 16, 16).stroke({ width: 2, color: Color.coral, alpha: 0.6 });
    this.circle.visible = false;

    const first = parts[0];
    this.chip = first ? new RewardChip(first, { layout: 'column', size: big ? 64 : 44, fontSize: 24, maxWidth: cw - 8 }) : null;
    if (this.chip) {
      this.chip.position.set(cw / 2, 71);
      this.addChild(this.chip);
    }
    const extra = parts[1];
    if (extra) {
      const small = partSticker(extra, 30);
      small.position.set(cw - 20, 22);
      this.addChild(small);
    }

    this.tape = tapeStrip({ name: 'sky', pattern: 'dots', w: 58, h: 20, angle: -5 });
    this.tape.position.set(cw / 2, 2);
    this.tape.visible = false;
    this.stamp.position.set(cw / 2, big ? 66 : 58);
    this.stamp.visible = false;
    this.addChild(this.circle, this.dayText, this.stamp, this.tape);
    this.pivot.set(cw / 2, CELL_H / 2);
  }

  sync(state: CellState, animate: boolean): void {
    this.chip?.setDim(state === 'claimed');
    this.stamp.visible = state === 'claimed';
    if (animate && state === 'claimed' && this.state !== 'claimed') this.stamp.slam();
    this.circle.visible = state === 'today';
    this.tape.visible = state === 'today';
    this.state = state;
    this.bag.killAll();
    this.scale.set(1);
    if (state === 'today' && !motion.reduced) {
      this.bag.run({
        duration: 1.1,
        ease: Ease.sineInOut,
        repeat: -1,
        yoyo: true,
        onUpdate: (k) => this.scale.set(1 + 0.05 * k),
      });
    }
  }

  /** Scene-space-agnostic centre of the cell inside its parent. */
  placeAt(x: number, y: number): void {
    this.position.set(x + this.cw / 2, y + CELL_H / 2);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

export class CalendarPopup extends Popup<void> {
  private readonly cells: CalendarCell[] = [];
  private readonly claimBtn: Button;
  private readonly progress: Text;

  constructor(private readonly host: Shell) {
    super({ dismissResult: undefined, priority: 3 });
    const view = profile.calendarView();
    const left = (W - GRID_W) / 2;
    const gridTop = 176;
    const gridH = 4 * CELL_H + 3 * GAP;
    const note = uiLabel(t('rt.sys.cal.note'), { size: 24, color: Color.inkSoft, wrap: GRID_W, lineHeight: 32 });
    const btnY = gridTop + gridH + 34 + 52;
    const h = btnY + 52 + 18 + note.height + 36;
    const panel = new Panel({ width: W, height: h, title: t('rt.sys.cal.title'), torn: 'bottom', tape: 'sky', onClose: () => this.close() });

    // The page header: a kraft strip with the calendar's number and how far along it is.
    const head = paperSheet(GRID_W, 56, { fill: Color.kraft, radius: 14, seed: 21 });
    head.position.set(left, 104);
    const cycle = uiLabel(t('rt.sys.cal.cycle', { n: view.cycles + 1 }), { size: 28, anchorX: 0 });
    cycle.position.set(left + 20, 133);
    this.progress = uiLabel('', { size: 28, anchorX: 1 });
    this.progress.position.set(left + GRID_W - 20, 133);
    panel.content.addChild(head, cycle, this.progress);

    view.days.forEach((bundle, i) => {
      const day = i + 1;
      const cell = new CalendarCell(day, bundle);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      cell.placeAt(left + col * (CELL_W + GAP), gridTop + row * (CELL_H + GAP));
      panel.content.addChild(cell);
      this.cells.push(cell);
    });

    this.claimBtn = new Button({ label: t('rt.sys.cal.claim'), style: 'success', width: 420, height: 104, fontSize: 40, disabledMark: 'none' });
    this.claimBtn.position.set(W / 2, btnY);
    this.claimBtn.onTap(() => this.claim());
    note.position.set(W / 2, btnY + 52 + 18 + note.height / 2);
    panel.content.addChild(this.claimBtn, note);
    this.body.addChild(panel);
    this.setContentSize(W + 80, h + 90);
    this.sync(false);
  }

  private sync(animate: boolean): void {
    const view = profile.calendarView();
    this.cells.forEach((cell) => cell.sync(calendarCellState(cell.day, view), animate));
    this.progress.text = t('rt.sys.cal.progress', { n: view.stamp, max: this.cells.length });
    this.claimBtn.setEnabled(view.canClaim);
    this.claimBtn.setLabel(t(view.canClaim ? 'rt.sys.cal.claim' : 'rt.sys.cal.done'));
    if (view.canClaim) this.claimBtn.startPulse({ times: 4 });
    else this.claimBtn.stopPulse();
  }

  private claim(): void {
    const before = profile.calendarView().next;
    const r = profile.claimCalendar();
    if (!r.ok) {
      audio.play('ui_error');
      toast(t(errorKey(r.error)), 'warning');
      this.sync(false);
      return;
    }
    this.host.refresh();
    this.sync(true);
    const cell = this.cells[before - 1];
    void payout(this.host, partsOf(r.value.reward), cell ?? this.claimBtn, t('rt.sys.cal.title'));
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
