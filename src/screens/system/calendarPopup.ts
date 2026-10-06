/** The 28-day attendance calendar: claimed boxes, today's box, what is coming, and the big days 7 / 14 / 21 / 28. */
import { Container, Graphics, type DestroyOptions } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { errorKey, profile } from '@/meta';
import type { CalendarView } from '@/meta/routines';
import { Button } from '@/ui/Button';
import { drawIcon } from '@/ui/icons';
import { motion, TweenBag } from '@/ui/motion';
import { Panel } from '@/ui/Panel';
import { Popup } from '@/ui/Popup';
import { uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { toast } from '@/ui/Toast';
import type { Shell } from '../contract';
import { payout } from './kit/claimFx';
import { partsOf } from './kit/parts';
import { partIcon, RewardChip } from './kit/rewardChip';
import { ClaimedMark, sharedPanel } from './kit/widgets';
import './strings';

const COLS = 7;
const CELL_W = 84;
const CELL_H = 112;
const GAP = 8;
const W = 680;
const GRID_W = COLS * CELL_W + (COLS - 1) * GAP;

type CellState = 'claimed' | 'today' | 'upcoming';

/** Days that carry the calendar's big rewards. */
const BIG_DAYS: ReadonlySet<number> = new Set([7, 14, 21, 28]);

export function calendarCellState(day: number, view: Pick<CalendarView, 'stamp' | 'next' | 'canClaim'>): CellState {
  if (day <= view.stamp) return 'claimed';
  return day === view.next && view.canClaim ? 'today' : 'upcoming';
}

class CalendarCell extends Container {
  private readonly bgs = new Map<string, Container>();
  private readonly mark = new ClaimedMark(46);
  private readonly ring = new Graphics();
  private readonly dayText;
  private readonly bag = new TweenBag();
  private state: CellState = 'upcoming';

  constructor(readonly day: number, bundle: Parameters<typeof partsOf>[0]) {
    super();
    const big = BIG_DAYS.has(day);
    const parts = partsOf(bundle);
    this.dayText = uiLabel(String(day), { size: 24, strokeWidth: 4, shadow: false });
    this.dayText.position.set(CELL_W / 2 + (big ? 10 : 0), 20);
    const first = parts[0];
    if (first) {
      const chip = new RewardChip(first, { layout: 'column', size: big ? 54 : 44, fontSize: 24, maxWidth: CELL_W - 8 });
      chip.position.set(CELL_W / 2, 66);
      this.addChild(chip);
    }
    const extra = parts[1];
    if (extra) {
      const small = partIcon(extra, 30);
      small.position.set(CELL_W - 17, 21);
      this.addChild(small);
    }
    if (big) {
      const star = drawIcon('star', 24, Color.gold);
      star.position.set(15, 20);
      this.addChild(star);
    }
    this.ring.roundRect(-3, -3, CELL_W + 6, CELL_H + 6, 26).stroke({ width: 5, color: Color.primary, alignment: 0.5 });
    this.ring.visible = false;
    this.mark.position.set(CELL_W / 2, CELL_H - 22);
    this.addChild(this.dayText, this.ring, this.mark);
    this.pivot.set(CELL_W / 2, CELL_H / 2);
  }

  sync(state: CellState, animate: boolean): void {
    const big = BIG_DAYS.has(this.day);
    const variant = state === 'claimed' ? 'default' : state === 'today' || big ? 'gold' : 'inset';
    let bg = this.bgs.get(variant);
    if (!bg) {
      bg = sharedPanel(CELL_W, CELL_H, variant, 20);
      this.addChildAt(bg, 0);
      this.bgs.set(variant, bg);
    }
    for (const other of this.bgs.values()) other.visible = other === bg;
    this.alpha = state === 'claimed' ? 0.7 : 1;
    this.mark.visible = state === 'claimed';
    if (animate && state === 'claimed' && this.state !== 'claimed') this.mark.stamp();
    this.dayText.style.fill = state === 'today' ? Color.primary : Color.text;
    this.ring.visible = state === 'today';
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

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    super.destroy(options);
  }
}

export class CalendarPopup extends Popup<void> {
  private readonly cells: CalendarCell[] = [];
  private readonly claimBtn: Button;
  private readonly progress;
  private claiming = false;

  constructor(private readonly host: Shell) {
    super({ dismissResult: undefined, priority: 3 });
    const view = profile.calendarView();
    const gridTop = 160;
    const gridH = 4 * CELL_H + 3 * GAP;
    const note = uiLabel(t('rt.sys.cal.note'), { size: 24, color: Color.textDim, wrap: GRID_W, lineHeight: 32, strokeWidth: 4, shadow: false });
    const btnY = gridTop + gridH + 34 + 52;
    const h = btnY + 52 + 18 + note.height + 36;
    const panel = new Panel({ width: W, height: h, title: t('rt.sys.cal.title'), onClose: () => this.close() });
    const cycle = uiLabel(t('rt.sys.cal.cycle', { n: view.cycles + 1 }), { size: 28, anchorX: 0, strokeWidth: 5 });
    cycle.position.set((W - GRID_W) / 2 + 4, 122);
    this.progress = uiLabel('', { size: 28, color: Color.gold, anchorX: 1, strokeWidth: 5 });
    this.progress.position.set(W - (W - GRID_W) / 2 - 4, 122);
    panel.content.addChild(cycle, this.progress);

    view.days.forEach((bundle, i) => {
      const day = i + 1;
      const cell = new CalendarCell(day, bundle);
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      cell.position.set((W - GRID_W) / 2 + col * (CELL_W + GAP) + CELL_W / 2, gridTop + row * (CELL_H + GAP) + CELL_H / 2);
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
    if (this.claiming) return;
    const before = profile.calendarView().next;
    const r = profile.claimCalendar();
    if (!r.ok) {
      audio.play('ui_error');
      toast(t(errorKey(r.error)), 'warning');
      this.sync(false);
      return;
    }
    this.claiming = true;
    this.host.refresh();
    this.sync(true);
    this.claiming = false;
    const cell = this.cells[before - 1];
    void payout(this.host, partsOf(r.value.reward), cell ?? this.claimBtn, t('rt.sys.cal.title'));
  }

  override destroy(options?: DestroyOptions): void {
    this.claimBtn.stopPulse();
    super.destroy(options);
  }
}
