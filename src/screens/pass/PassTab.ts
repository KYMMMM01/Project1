/** The season pass tab: a sticker-collection track. A header with the season, the tier and the XP bar, then 30 tiers on two paper lanes. */
import { Container, Graphics, type Text } from 'pixi.js';
import { i18nEvents, t } from '@/core/i18n';
import { uiTweens } from '@/core/tween';
import { errorKey, profile } from '@/meta';
import { mergeBundles } from '@/meta/bundle';
import { featureHint } from '@/meta/features';
import type { PassRow, PassView } from '@/meta/routines';
import type { Bundle, Result } from '@/meta/types';
import { iap } from '@/platform';
import {
  Button,
  Color,
  drawIcon,
  drawPaintFill,
  drawPaper,
  PaperLabel,
  paperSeed,
  popups,
  ProgressBar,
  ScrollView,
  toast,
  uiLabel,
} from '@/ui';
import { refusalCue } from '@/ui/press';
import type { ContentArea, Shell, TabScreen } from '../contract';
import type { PointResolver } from '../shell/HomePointer';
import { payout } from '../system/kit/claimFx';
import { paperConfetti } from '../system/kit/confetti';
import { NoticePopup } from '../system/kit/noticePopup';
import { partsOf } from '../system/kit/parts';
import { lockedNote, paperSheet, stickerDisc } from '../system/kit/sheets';
import { IconLabel, NoteTag } from '../system/kit/tags';
import { loadRoutinePrefs, patchRoutinePrefs, routinePrefs } from '../system/prefs';
import { Coupon } from './Coupon';
import { focusTier, passBadgeCount, PASS_ROW_GAP, PASS_ROW_H, passClaimable, scrollTargetFor, seasonEndWarning, seasonNameKey, xpFill } from './model';
import { MEDAL_W, PassRowView, type CellTap, type PassCell, type PassTrackId } from './PassRowView';
import './strings';

const SIDE = 24;
const HEAD_H = 296;
/** The lane heads (the "free" label and the premium coupon) sit on this centre line of the header. */
const LANE_HEAD_Y = 232;
const COUPON_H = 100;
const LANES_TOP = 16;
const REFRESH_EVERY = 20;
const PRODUCT = 'season_pass';
const TRACK_W = 22;

/** Everything both lanes have open right now, as one bundle. */
function openRewards(v: PassView): Bundle {
  let sum: Bundle = {};
  for (const row of [...v.free, ...v.premiumRow]) if (row.claimable) sum = mergeBundles(sum, row.reward);
  return sum;
}

export class PassTab implements TabScreen {
  readonly view = new Container();
  private area: ContentArea;
  private head: Container | null = null;
  private scroller: ScrollView | null = null;
  private lock: Container | null = null;
  private track: Graphics | null = null;
  private trackFill: Graphics | null = null;
  private trackReach = -1;
  /** Left edge of the XP bar and the tier label above it, in header space. */
  private barLeft = 0;
  private rows: PassRowView[] = [];
  private bar: ProgressBar | null = null;
  private tierLabel: PaperLabel | null = null;
  private tierNumber: Text | null = null;
  private daysTag: NoteTag | null = null;
  private claimAllBtn: Button | null = null;
  private coupon: Coupon | null = null;
  private signature = '';
  private shown = false;
  private busy = false;
  private claiming = false;
  private warning = false;
  /** Between the premium purchase and the end of its celebration the lane still shows its locks, so that they are seen coming off. */
  private heldLock = false;
  private sinceRefresh = 0;
  private offChange: (() => void) | null = null;
  private offLang: (() => void) | null = null;

  constructor(private readonly shell: Shell) {
    this.area = { ...shell.area };
  }

  private currentSignature(): string {
    const v = profile.featureUnlocked('pass') ? profile.passView() : null;
    return `${v ? v.season : 'x'}|${this.canSell() ? 1 : 0}|${profile.data.pass.premium ? 1 : 0}|${t('rt.pass.claimAll')}`;
  }

  private canSell(): boolean {
    return profile.isPurchasable(PRODUCT) && iap.isAvailable(PRODUCT);
  }

  private listW(): number {
    return this.area.w - SIDE * 2;
  }

  private laneW(): number {
    return (this.listW() - MEDAL_W) / 2;
  }

  private ensureBuilt(): void {
    const sig = this.currentSignature();
    if (sig === this.signature) return;
    this.signature = sig;
    this.teardown();
    if (!profile.featureUnlocked('pass')) {
      this.lock = lockedNote(this.listW(), featureHint('pass'));
      this.view.addChild(this.lock);
      this.layout();
      return;
    }
    const v = profile.passView();
    this.buildHead(v);
    const sc = new ScrollView({ width: this.area.w, height: 100, padding: SIDE, paddingBottom: SIDE + 16 });
    this.scroller = sc;
    this.buildLanes(sc.content, v);
    this.view.addChild(sc, this.head as Container);
    this.layout();
    this.syncAll(false);
    sc.refresh();
  }

  /** Two tall paper lanes with the track between them, then the 30 rows. */
  private buildLanes(host: Container, v: PassView): void {
    const lane = this.laneW();
    const step = PASS_ROW_H + PASS_ROW_GAP;
    const total = LANES_TOP + v.free.length * step + 4;
    const seed = paperSeed();
    const freeLane = paperSheet(lane, total, { fill: Color.paper, radius: 22, torn: ['top', 'bottom'], seed, bake: false });
    // The premium lane is mustard paper: the cards lie on it like on a gold backing.
    const premiumLane = paperSheet(lane, total, { fill: Color.mustard, radius: 22, torn: ['top', 'bottom'], seed: seed + 1, bake: false });
    premiumLane.x = lane + MEDAL_W;
    host.addChild(freeLane, premiumLane);
    this.track = new Graphics();
    this.trackFill = new Graphics();
    this.trackFill.rotation = Math.PI / 2;
    host.addChild(this.track, this.trackFill);
    const first = LANES_TOP + 8 + PASS_ROW_H / 2;
    const last = first + (v.free.length - 1) * step;
    const x = lane + MEDAL_W / 2;
    drawPaper(this.track, x - TRACK_W / 2, first - 40, { w: TRACK_W, h: last - first + 80, kind: 'pill', fill: Color.track, edge: Color.kraftDark, shadow: 3, grain: false, seed: seed + 2 });
    this.trackReach = -1;
    v.free.forEach((free, i) => {
      const row = new PassRowView(lane, free.tier, free, this.laneRow(v.premiumRow[i] ?? free), v.premium && !this.heldLock, (track, kind, cell) => this.onCell(track, kind, cell, free.tier));
      row.position.set(0, LANES_TOP + 8 + i * step);
      host.addChild(row);
      this.rows.push(row);
    });
  }

  private buildHead(v: PassView): void {
    const w = this.listW();
    const lane = this.laneW();
    const head = new Container();

    const season = new PaperLabel({ text: t(seasonNameKey(v.season)), size: 34, paper: 'primary', padX: 32, padY: 9, maxWidth: w - 300 });
    season.position.set(season.uiBox.w / 2, 30);
    season.rotation = -0.012;
    const days = new NoteTag(270, 'clock');
    days.position.set(w, 30);
    this.daysTag = days;
    head.addChild(season, days);

    // The current tier as a mustard sticker, the label and the painted XP bar beside it.
    const cx = 56;
    const cy = 120;
    const disc = stickerDisc(104, 0, Color.mustard);
    disc.position.set(cx, cy);
    disc.rotation = -0.05;
    this.tierNumber = uiLabel('', { size: 52, color: Color.inkDeep });
    this.tierNumber.position.set(cx, cy + 1);
    const barX = cx + 52 + 22;
    const barW = w - barX - 200 - 28;
    this.barLeft = barX;
    this.tierLabel = new PaperLabel({ text: ' ', size: 28, paper: Color.paperLight, padX: 22, padY: 6, maxWidth: barW });
    this.bar = new ProgressBar({ width: barW, height: 44, color: 'gold', value: 0, label: '' });
    this.bar.position.set(barX + barW / 2, cy + 22);
    this.claimAllBtn = new Button({ label: t('rt.pass.claimAll'), style: 'success', width: 200, height: 88, fontSize: 32 });
    this.claimAllBtn.position.set(w - 100, cy);
    this.claimAllBtn.onTap(() => this.claimAll());
    this.claimAllBtn.onDisabledTap(() => toast(t('rt.pass.notYet'), 'info'));
    head.addChild(disc, this.tierNumber, this.tierLabel, this.bar, this.claimAllBtn);

    // Lane heads: "free" over the left lane, the coupon (or the crown label) over the premium lane.
    const freeHead = new PaperLabel({ text: t('meta.pass.free'), size: 34, paper: Color.paperLight, padX: 40, padY: 12, maxWidth: lane - 24 });
    freeHead.position.set(lane / 2, LANE_HEAD_Y);
    head.addChild(freeHead);
    const premiumX = lane + MEDAL_W + lane / 2;
    if (v.premium) {
      const owned = new IconLabel({ text: t('rt.pass.owned'), icon: 'crown', fill: Color.mustard, size: 30, padX: 24, padY: 12, maxWidth: lane - 16 });
      owned.position.set(premiumX, LANE_HEAD_Y);
      head.addChild(owned);
    } else if (this.canSell()) {
      this.coupon = new Coupon(lane, COUPON_H, t('rt.pass.buy'), iap.priceText(PRODUCT), () => void this.buy());
      this.coupon.position.set(premiumX, LANE_HEAD_Y);
      head.addChild(this.coupon);
    } else {
      const label = new PaperLabel({ text: t('meta.pass.premium'), size: 34, paper: 'mustard', padX: 36, padY: 12, maxWidth: lane - 24 });
      label.position.set(premiumX, LANE_HEAD_Y);
      head.addChild(label);
    }
    this.head = head;
  }

  private teardown(): void {
    this.rows = [];
    this.bar = null;
    this.tierLabel = null;
    this.tierNumber = null;
    this.daysTag = null;
    this.claimAllBtn?.stopPulse();
    this.claimAllBtn = null;
    this.coupon = null;
    this.head = null;
    this.scroller = null;
    this.track = null;
    this.trackFill = null;
    this.lock = null;
    for (const c of this.view.removeChildren()) c.destroy({ children: true });
  }

  private layout(): void {
    const { x, y, w, h } = this.area;
    this.view.position.set(x, y);
    this.head?.position.set(SIDE, 10);
    this.lock?.position.set(SIDE, 40);
    if (this.scroller) {
      this.scroller.position.set(0, HEAD_H);
      this.scroller.setViewSize(w, Math.max(0, h - HEAD_H));
    }
  }

  private syncAll(animate: boolean): void {
    const v = profile.passView();
    const maxed = v.tier >= v.free.length;
    if (this.tierNumber) this.tierNumber.text = String(v.tier);
    this.daysTag?.setText(v.daysLeft <= 1 ? t('rt.pass.lastDay') : t('rt.pass.daysLeft', { n: v.daysLeft }));
    if (this.tierLabel) {
      this.tierLabel.setText(maxed ? t('rt.pass.maxed') : t('rt.pass.tierNow', { n: v.tier }));
      this.tierLabel.position.set(this.barLeft + this.tierLabel.uiBox.w / 2, 120 - 28);
    }
    this.bar?.setLabel(maxed ? 'MAX' : t('rt.pass.xp', { cur: v.xpIntoTier, max: v.xpPerTier }));
    this.bar?.setValue(maxed ? 1 : xpFill(v), animate);
    const open = passClaimable(v);
    this.claimAllBtn?.setEnabled(open > 0);
    this.claimAllBtn?.setBadge(open > 0 ? open : undefined);
    if (open > 0) this.claimAllBtn?.startPulse({ times: 3 });
    else this.claimAllBtn?.stopPulse();
    this.rows.forEach((row, i) => {
      const free = v.free[i];
      const prem = v.premiumRow[i];
      if (free && prem) row.sync(free, this.laneRow(prem), v.premium && !this.heldLock, free.tier === Math.max(1, v.tier) && v.tier > 0, animate);
    });
    this.drawTrack(v);
  }

  /** The painted line behind the medals: kraft for the whole season, mustard up to the player's XP. */
  private laneRow(row: PassRow): PassRow {
    return this.heldLock && row.claimable ? { ...row, claimable: false } : row;
  }

  private drawTrack(v: PassView): void {
    const g = this.trackFill;
    if (!g) return;
    const lane = this.laneW();
    const step = PASS_ROW_H + PASS_ROW_GAP;
    const first = LANES_TOP + 8 + PASS_ROW_H / 2;
    const p = v.tier >= v.free.length ? v.free.length : v.tier + v.xpIntoTier / v.xpPerTier;
    const reach = Math.round(p >= 1 ? first + (p - 1) * step : first - 40 + (40 * p));
    if (reach === this.trackReach) return;
    this.trackReach = reach;
    g.clear();
    const len = reach - (first - 40);
    if (len > 8) drawPaintFill(g, first - 38, -(lane + MEDAL_W / 2) - 7, len, 14, Color.mustard);
  }

  private onCell(track: PassTrackId, kind: CellTap, cell: PassCell, tier: number): void {
    switch (kind) {
      case 'claim':
        this.settle(() => profile.claimPass(track, tier), cell);
        break;
      case 'premium':
        refusalCue();
        if (this.canSell()) {
          toast(t('rt.pass.premiumLocked'), 'info');
          this.coupon?.nudge();
        }
        break;
      case 'notYet':
        refusalCue();
        toast(t('rt.pass.notYet'), 'info');
        break;
      case 'done':
        break;
    }
  }

  /** Run a claim command with the change guard already up (see MissionsTab.settle), then give the feedback. */
  private settle(run: () => Result<Bundle>, from: Container): void {
    this.claiming = true;
    try {
      const r = run();
      if (!r.ok) {
        refusalCue();
        toast(t(errorKey(r.error)), 'warning');
        this.syncAll(false);
        return;
      }
      this.finishClaim(r.value, from);
    } finally {
      this.claiming = false;
    }
  }

  private finishClaim(reward: Bundle, from: Container): void {
    this.shell.refresh();
    this.syncAll(true);
    void payout(this.shell, partsOf(reward), from, t('rt.common.reward'));
  }

  /** Take every open tier of both lanes in one go and show one combined reward. */
  private claimAll(): void {
    const sum = openRewards(profile.passView());
    this.claiming = true;
    try {
      const free = profile.claimAllPass('free');
      const premium = profile.claimAllPass('premium');
      if (!free.ok && !premium.ok) {
        refusalCue();
        toast(t(errorKey(free.error)), 'warning');
        this.syncAll(false);
        return;
      }
      this.finishClaim(sum, this.claimAllBtn ?? this.view);
    } finally {
      this.claiming = false;
    }
  }

  private async buy(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.coupon?.setBusy(true);
    const outcome = await iap.purchase(PRODUCT);
    this.busy = false;
    if (this.view.destroyed) return;
    this.coupon?.setBusy(false);
    if (outcome === 'cancelled') return;
    if (outcome !== 'purchased') {
      refusalCue();
      toast(t(outcome === 'unavailable' ? 'rt.pass.buyUnavailable' : 'rt.pass.buyFailed'), 'error');
      return;
    }
    this.shell.refresh();
    this.signature = '';
    this.heldLock = true;
    this.ensureBuilt();
    try {
      await this.celebrate();
    } finally {
      this.heldLock = false;
    }
  }

  /** A new season wipes every tier nobody took: on each of its last days, the first visit to the tab says so once and offers to take them. */
  private async warnSeasonEnd(): Promise<void> {
    if (this.warning) return;
    this.warning = true;
    try {
      await loadRoutinePrefs();
      if (!this.shown || this.view.destroyed) return;
      const v = profile.passView();
      const key = seasonEndWarning(v, routinePrefs().passWarned);
      if (!key) return;
      patchRoutinePrefs({ passWarned: key });
      const choice = await popups.open(
        new NoticePopup<'claim' | 'later'>({
          title: t('rt.pass.ending.title'),
          hero: drawIcon('clock', 118),
          lines: [t('rt.pass.ending.body')],
          parts: partsOf(openRewards(v)),
          buttons: [
            { label: t('rt.pass.claimAll'), style: 'success', result: 'claim', pulse: true },
            { label: t('rt.common.later'), style: 'neutral', result: 'later' },
          ],
          dismissResult: 'later',
          priority: 2,
        }),
      );
      if (choice === 'claim' && !this.view.destroyed) this.claimAll();
    } finally {
      this.warning = false;
    }
  }

  /** Premium just opened: confetti, what is waiting, and an offer to take it. */
  private async celebrate(): Promise<void> {
    const v = profile.passView();
    const ready = v.premiumRow.filter((r) => r.claimable);
    let sum: Bundle = {};
    for (const r of ready) sum = mergeBundles(sum, r.reward);
    paperConfetti(80);
    const choice = await popups.open(
      new NoticePopup<'claim' | 'later'>({
        title: t('rt.pass.celebrate.title'),
        hero: drawIcon('crown', 120),
        lines: [ready.length > 0 ? t('rt.pass.celebrate.body', { n: ready[ready.length - 1]?.tier ?? 0 }) : t('rt.pass.celebrate.empty')],
        parts: partsOf(sum),
        buttons:
          ready.length > 0
            ? [
                { label: t('rt.pass.celebrate.claim'), style: 'success', result: 'claim', pulse: true },
                { label: t('rt.pass.celebrate.later'), style: 'neutral', result: 'later' },
              ]
            : [{ label: t('rt.common.ok'), style: 'primary', result: 'later' }],
        dismissResult: 'later',
        priority: 2,
        tape: 'yellow',
      }),
    );
    this.heldLock = false;
    if (this.view.destroyed) return;
    this.syncAll(true);
    if (choice === 'claim') {
      // The locks come off first; the claim follows once the lane is open.
      await uiTweens.call(0.45, () => undefined).finished;
      if (!this.view.destroyed) this.claimAll();
    }
  }

  private readonly onChange = (): void => {
    if (this.claiming || !this.shown) return;
    if (this.currentSignature() !== this.signature) {
      this.ensureBuilt();
      return;
    }
    this.syncAll(false);
  };

  private readonly onLang = (): void => {
    if (this.shown) this.ensureBuilt();
  };

  show(): void {
    this.shown = true;
    profile.refresh();
    this.ensureBuilt();
    this.syncAll(false);
    this.offChange ??= profile.subscribe(this.onChange);
    this.offLang ??= i18nEvents.on('change', this.onLang);
    this.focusCurrent();
    if (profile.featureUnlocked('pass')) void this.warnSeasonEnd();
  }

  /** Scroll so the tier the player has reached sits in the upper third of the list. */
  private focusCurrent(): void {
    const sc = this.scroller;
    if (!sc) return;
    sc.refresh();
    const contentH = LANES_TOP + 8 + 30 * (PASS_ROW_H + PASS_ROW_GAP) + SIDE * 2 + 16;
    // From wherever the list was left the track glides to the tier reached (instantly when it is already close).
    const target = scrollTargetFor(focusTier(profile.passView()), sc.viewHeight, contentH, LANES_TOP + 8);
    sc.scrollTo(target, Math.abs(target - sc.scrollY) > 120);
  }

  hide(): void {
    this.shown = false;
    this.offChange?.();
    this.offChange = null;
    this.offLang?.();
    this.offLang = null;
  }

  resize(area: ContentArea): void {
    const widthChanged = area.w !== this.area.w;
    this.area = { ...area };
    if (widthChanged) this.signature = '';
    if (this.shown && widthChanged) this.ensureBuilt();
    this.layout();
  }

  update(dt: number): void {
    if (!this.shown) return;
    this.sinceRefresh += dt;
    if (this.sinceRefresh >= REFRESH_EVERY) {
      this.sinceRefresh = 0;
      profile.refresh();
    }
  }

  badge(): number | boolean {
    return passBadgeCount(profile);
  }

  /** The guidebook's "try it": the header with the season's experience bar and the tier it has reached. */
  pointAt(point: string): PointResolver | null {
    if (point !== 'pass.head' || !this.head) return null;
    this.scroller?.scrollToTop(false);
    return () => this.head;
  }

  destroy(): void {
    this.hide();
    this.teardown();
    this.view.destroy({ children: true });
  }
}
