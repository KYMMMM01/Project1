/** The season pass tab: season header, XP bar, and a 30-tier list with a free and a premium reward per tier. */
import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { i18nEvents, t } from '@/core/i18n';
import { errorKey, profile } from '@/meta';
import { mergeBundles } from '@/meta/bundle';
import { featureHint } from '@/meta/features';
import type { PassView } from '@/meta/routines';
import type { Bundle, Result } from '@/meta/types';
import { iap } from '@/platform';
import { Button } from '@/ui/Button';
import { drawIcon } from '@/ui/icons';
import { ProgressBar } from '@/ui/ProgressBar';
import { popups } from '@/ui/Popup';
import { cacheStatic, vGradient } from '@/ui/shapes';
import { ScrollView } from '@/ui/ScrollView';
import { fitLabel, uiLabel } from '@/ui/text';
import { Color } from '@/ui/theme';
import { toast } from '@/ui/Toast';
import type { ContentArea, Shell, TabScreen } from '../contract';
import { payout } from '../system/kit/claimFx';
import { NoticePopup } from '../system/kit/noticePopup';
import { partsOf } from '../system/kit/parts';
import { bakedPanel, lockedCard } from '../system/kit/widgets';
import { focusTier, passBadgeCount, PASS_ROW_GAP, PASS_ROW_H, passClaimable, scrollTargetFor, seasonNameKey, xpFill } from './model';
import { MEDAL_W, PassRowView, type CellTap, type PassCell, type PassTrackId } from './PassRowView';
import './strings';

const SIDE = 24;
const HEAD_H = 296;
const STRIP_H = 52;
const LIST_TOP = 74;
const REFRESH_EVERY = 20;
const PRODUCT = 'season_pass';

export class PassTab implements TabScreen {
  readonly view = new Container();
  private area: ContentArea;
  private head: Container | null = null;
  private scroller: ScrollView | null = null;
  private lock: Container | null = null;
  private line: Graphics | null = null;
  private rows: PassRowView[] = [];
  private bar: ProgressBar | null = null;
  private tierText: Text | null = null;
  private medalText: Text | null = null;
  private claimAllBtn: Button | null = null;
  private buyBtn: Button | null = null;
  private signature = '';
  private shown = false;
  private busy = false;
  private claiming = false;
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

  private cellW(): number {
    return (this.listW() - MEDAL_W) / 2;
  }

  private ensureBuilt(): void {
    const sig = this.currentSignature();
    if (sig === this.signature) return;
    this.signature = sig;
    this.teardown();
    if (!profile.featureUnlocked('pass')) {
      this.lock = lockedCard(this.listW(), featureHint('pass'));
      this.view.addChild(this.lock);
      this.layout();
      return;
    }
    const v = profile.passView();
    this.buildHead(v);
    const sc = new ScrollView({ width: this.area.w, height: 100, padding: SIDE, paddingBottom: SIDE + 16 });
    this.scroller = sc;
    this.line = new Graphics();
    sc.content.addChild(this.line);
    v.free.forEach((free, i) => {
      const row = new PassRowView(this.cellW(), free.tier, free, v.premiumRow[i] ?? free, v.premium, (track, kind, cell) =>
        this.onCell(track, kind, cell, free.tier),
      );
      row.position.set(0, LIST_TOP + i * (PASS_ROW_H + PASS_ROW_GAP));
      sc.content.addChild(row);
      this.rows.push(row);
    });
    this.view.addChild(sc, this.head as Container);
    this.layout();
    this.syncAll(false);
    sc.refresh();
  }

  private buildHead(v: PassView): void {
    const w = this.listW();
    const head = new Container();
    head.addChild(bakedPanel(w, HEAD_H, v.premium ? 'gold' : 'default', 34));
    const name = uiLabel(t(seasonNameKey(v.season)), { size: 36, anchorX: 0, strokeWidth: 6 });
    name.position.set(32, 40);
    const clock = drawIcon('clock', 34);
    const days = uiLabel(v.daysLeft <= 1 ? t('rt.pass.lastDay') : t('rt.pass.daysLeft', { n: v.daysLeft }), { size: 24, color: Color.textDim, anchorX: 1, strokeWidth: 4, shadow: false });
    days.position.set(w - 32 - 44, 42);
    fitLabel(days, w - 64 - 44 - name.width - 24, 24);
    clock.position.set(w - 32 - 17, 42);
    head.addChild(name, clock, days);

    const medal = new Graphics();
    medal.circle(0, 4, 48).fill({ color: Color.black, alpha: 0.3 });
    medal.circle(0, 0, 48).fill(vGradient(0xffe27a, Color.primary)).stroke({ width: 6, color: Color.outline, alignment: 1 });
    cacheStatic(medal);
    medal.position.set(32 + 48, 114);
    this.medalText = uiLabel('', { size: 44, strokeWidth: 6 });
    this.medalText.position.copyFrom(medal.position);
    this.tierText = uiLabel('', { size: 30, anchorX: 0, strokeWidth: 5 });
    this.tierText.position.set(32 + 96 + 22, 94);
    const barW = w - (32 + 96 + 22) - 32;
    this.bar = new ProgressBar({ width: barW, height: 42, color: 'gold', value: 0, label: '' });
    this.bar.position.set(32 + 96 + 22 + barW / 2, 134);
    head.addChild(medal, this.medalText, this.tierText, this.bar);

    this.claimAllBtn = new Button({ label: t('rt.pass.claimAll'), style: 'success', width: 250, height: 88, fontSize: 34 });
    this.claimAllBtn.position.set(32 + 125, 214);
    this.claimAllBtn.onTap(() => this.claimAll());
    this.claimAllBtn.onDisabledTap(() => toast(t('rt.pass.notYet'), 'info'));
    head.addChild(this.claimAllBtn);

    if (v.premium) {
      const tag = new Container();
      const crown = drawIcon('crown', 52, Color.gold);
      crown.position.set(-110, 0);
      const txt = uiLabel(t('rt.pass.owned'), { size: 28, color: Color.gold, strokeWidth: 5 });
      fitLabel(txt, 250, 28);
      txt.position.set(20, 2);
      tag.addChild(crown, txt);
      tag.position.set(w - 32 - 190, 214);
      head.addChild(tag);
    } else if (this.canSell()) {
      const price = iap.priceText(PRODUCT);
      const buy = new Button({ label: t('rt.pass.buy'), sublabel: price, icon: 'crown', style: 'purple', width: 340, height: 96, fontSize: 32 });
      buy.position.set(w - 32 - 170, 214);
      buy.onTap(() => void this.buy());
      buy.startPulse({ times: 3 });
      head.addChild(buy);
      this.buyBtn = buy;
      const hint = uiLabel(t('rt.pass.buyHint'), { size: 24, color: Color.textDim, strokeWidth: 4, shadow: false });
      fitLabel(hint, w - 64, 24);
      hint.position.set(w / 2, HEAD_H - 20);
      head.addChild(hint);
    }
    this.head = head;
    this.head.addChild(this.columnStrip());
  }

  /** "Free | Tier | Premium" labels above the list. */
  private columnStrip(): Container {
    const strip = new Container();
    const cw = this.cellW();
    const mk = (text: string, x: number, color: number): void => {
      const l = uiLabel(text, { size: 28, color, strokeWidth: 5 });
      fitLabel(l, cw - 20, 28);
      l.position.set(x, HEAD_H + 8 + STRIP_H / 2);
      strip.addChild(l);
    };
    mk(t('meta.pass.free'), cw / 2, Color.text);
    mk(t('rt.pass.col.tier'), cw + MEDAL_W / 2, Color.textDim);
    mk(t('meta.pass.premium'), cw + MEDAL_W + cw / 2, Color.gold);
    return strip;
  }

  private teardown(): void {
    this.rows = [];
    this.bar = null;
    this.tierText = null;
    this.medalText = null;
    this.claimAllBtn?.stopPulse();
    this.claimAllBtn = null;
    this.buyBtn?.stopPulse();
    this.buyBtn = null;
    this.head = null;
    this.scroller = null;
    this.line = null;
    this.lock = null;
    for (const c of this.view.removeChildren()) c.destroy({ children: true });
  }

  private layout(): void {
    const { x, y, w, h } = this.area;
    this.view.position.set(x, y);
    this.head?.position.set(SIDE, 12);
    this.lock?.position.set(SIDE, 40);
    if (this.scroller) {
      const top = 12 + HEAD_H + 8 + STRIP_H + 4;
      this.scroller.position.set(0, top);
      this.scroller.setViewSize(w, Math.max(0, h - top));
    }
  }

  private syncAll(animate: boolean): void {
    const v = profile.passView();
    if (this.medalText) this.medalText.text = String(v.tier);
    if (this.tierText) {
      this.tierText.text = v.tier >= v.free.length ? t('rt.pass.maxed') : t('rt.pass.tierNow', { n: v.tier });
      fitLabel(this.tierText, this.listW() - 150 - 64, 30);
    }
    this.bar?.setLabel(v.tier >= v.free.length ? 'MAX' : t('rt.pass.xp', { cur: v.xpIntoTier, max: v.xpPerTier }));
    this.bar?.setValue(v.tier >= v.free.length ? 1 : xpFill(v), animate);
    const open = passClaimable(v);
    this.claimAllBtn?.setEnabled(open > 0);
    this.claimAllBtn?.setBadge(open > 0 ? open : undefined);
    if (open > 0) this.claimAllBtn?.startPulse({ times: 3 });
    else this.claimAllBtn?.stopPulse();
    this.rows.forEach((row, i) => {
      const free = v.free[i];
      const prem = v.premiumRow[i];
      if (free && prem) row.sync(free, prem, v.premium, free.tier === Math.max(1, v.tier) && v.tier > 0, animate);
    });
    this.drawLine(v);
  }

  /** The timeline behind the medallions: grey for the whole season, gold up to the player's XP. */
  private drawLine(v: PassView): void {
    const g = this.line;
    if (!g) return;
    const step = PASS_ROW_H + PASS_ROW_GAP;
    const x = this.cellW() + MEDAL_W / 2;
    const first = LIST_TOP + PASS_ROW_H / 2;
    const start = first - step / 2;
    const last = first + (v.free.length - 1) * step;
    const p = v.tier >= v.free.length ? v.free.length : v.tier + v.xpIntoTier / v.xpPerTier;
    const reach = p >= 1 ? first + (p - 1) * step : start + (first - start) * p;
    g.clear();
    g.roundRect(x - 7, start, 14, last - start + 18, 7).fill(Color.neutralDark).stroke({ width: 4, color: Color.outline, alignment: 1 });
    if (reach > start) g.roundRect(x - 5, start + 2, 10, reach - start, 5).fill(Color.primary);
  }

  private onCell(track: PassTrackId, kind: CellTap, cell: PassCell, tier: number): void {
    switch (kind) {
      case 'claim':
        this.settle(profile.claimPass(track, tier), cell);
        break;
      case 'premium':
        audio.play('ui_error');
        if (this.canSell()) {
          toast(t('rt.pass.premiumLocked'), 'info');
          this.buyBtn?.startPulse({ times: 4 });
        }
        break;
      case 'notYet':
        audio.play('ui_error');
        toast(t('rt.pass.notYet'), 'info');
        break;
      case 'done':
        break;
    }
  }

  private settle(r: Result<Bundle>, from: Container): void {
    if (!r.ok) {
      audio.play('ui_error');
      toast(t(errorKey(r.error)), 'warning');
      this.syncAll(false);
      return;
    }
    this.finishClaim(r.value, from);
  }

  private finishClaim(reward: Bundle, from: Container): void {
    this.claiming = true;
    try {
      this.shell.refresh();
      this.syncAll(true);
    } finally {
      this.claiming = false;
    }
    void payout(this.shell, partsOf(reward), from, t('rt.common.reward'));
  }

  /** Take every open tier of both rows in one go and show one combined reward. */
  private claimAll(): void {
    const v = profile.passView();
    let sum: Bundle = {};
    for (const row of [...v.free, ...v.premiumRow]) if (row.claimable) sum = mergeBundles(sum, row.reward);
    const free = profile.claimAllPass('free');
    const premium = profile.claimAllPass('premium');
    if (!free.ok && !premium.ok) {
      audio.play('ui_error');
      toast(t(errorKey(free.error)), 'warning');
      this.syncAll(false);
      return;
    }
    this.finishClaim(sum, this.claimAllBtn ?? this.view);
  }

  private async buy(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.buyBtn?.setBusy(true);
    const outcome = await iap.purchase(PRODUCT);
    this.busy = false;
    if (this.view.destroyed) return;
    this.buyBtn?.setBusy(false);
    if (outcome === 'cancelled') return;
    if (outcome !== 'purchased') {
      audio.play('ui_error');
      toast(t(outcome === 'unavailable' ? 'rt.pass.buyUnavailable' : 'rt.pass.buyFailed'), 'error');
      return;
    }
    this.shell.refresh();
    this.signature = '';
    this.ensureBuilt();
    await this.celebrate();
  }

  /** Premium just opened: show what is waiting and offer to take it. */
  private async celebrate(): Promise<void> {
    const v = profile.passView();
    const ready = v.premiumRow.filter((r) => r.claimable);
    let sum: Bundle = {};
    for (const r of ready) sum = mergeBundles(sum, r.reward);
    const choice = await popups.open(
      new NoticePopup<'claim' | 'later'>({
        title: t('rt.pass.celebrate.title'),
        hero: drawIcon('crown', 150, Color.gold),
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
      }),
    );
    if (choice === 'claim' && !this.view.destroyed) this.claimAll();
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
  }

  /** Scroll so the tier the player has reached sits in the upper third of the list. */
  private focusCurrent(): void {
    const sc = this.scroller;
    if (!sc) return;
    sc.refresh();
    const contentH = LIST_TOP + 30 * (PASS_ROW_H + PASS_ROW_GAP) + SIDE * 2 + 16;
    sc.scrollTo(scrollTargetFor(focusTier(profile.passView()), sc.viewHeight, contentH, LIST_TOP), false);
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

  destroy(): void {
    this.hide();
    this.teardown();
    this.view.destroy({ children: true });
  }
}
