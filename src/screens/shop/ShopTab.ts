import { Container } from 'pixi.js';
import { audio } from '@/audio';
import { debugExpose } from '@/core/debug';
import { game } from '@/core/game';
import { fmt } from '@/core/format';
import { haptic } from '@/core/haptics';
import { t } from '@/core/i18n';
import { uiTweens } from '@/core/tween';
import { Fx } from '@/fx';
import { errorKey, profile, tn } from '@/meta';
import { bundleParts, type BundlePart } from '@/meta/bundle';
import { iapSpec } from '@/meta/data/catalog';
import { CHEST_BULK_MAX, chestPrice, TICKET_AD_AMOUNT } from '@/meta/data/economy';
import type { ChestKind } from '@/meta/types';
import { iap } from '@/platform';
import { THEME_SPRAY } from '@/view/director/defs';
import { themeOf } from '@/view/director/palette';
import { confirmDialog, ScrollView, SegmentTabs, toast, uiLabel, type SegmentDef } from '@/ui';
import { refusalCue } from '@/ui/press';
import { services, type ContentArea, type Shell, type TabScreen } from '../contract';
import type { PointResolver } from '../shell/HomePointer';
import { POINT_MARGIN } from '../shell/pointerMath';
import { chestsBlock, freeWaitText } from './blocksChests';
import { confirmChestBuy } from './ChestConfirm';
import { afterStamp, stampPending } from '../system/kit/marks';
import { dailyBlock } from './blocksDaily';
import { gemsBlock, passBlock } from './blocksStore';
import { cosmeticsBlock, detachRugPreviews, disposeRugPreviews, ticketsBlock } from './blocksStyle';
import { type Block, type BlockBuild, type ShopActions } from './blockKit';
import { getShell } from './context';
import { isShopSection, shortBy, type ShopSectionId } from './shopLogic';

const NAV_H = 100;
const BLOCKS: readonly Block[] = [chestsBlock, dailyBlock, gemsBlock, passBlock, cosmeticsBlock, ticketsBlock];

interface BlockState {
  block: Block;
  root: Container;
  sig: string;
  shown: boolean;
  height: number;
  top: number;
  anchors: BlockBuild['anchors'];
  points: BlockBuild['points'];
}

/** The section a jump asked for before the tab existed or was visible. */
let pending: ShopSectionId | null = null;
let live: ShopTab | null = null;

class ShopTab implements TabScreen {
  readonly view = new Container();
  private readonly scroll: ScrollView;
  private readonly fxLayer = new Container();
  private nav: SegmentTabs | null = null;
  private readonly states: BlockState[] = [];
  private area: ContentArea = { x: 0, y: 0, w: 720, h: 1000 };
  private fx: Fx | null = null;
  private freeTimer: ReturnType<typeof uiLabel> | null = null;
  private checkNow = true;
  private tick = 0;
  private busy = false;
  private syncing = false;
  /** Game time before which scrolling does not move the section highlight (a jump is under way). */
  private spyResume = 0;
  private navKey = '';
  private offProfile: (() => void) | null = null;
  private offScroll: (() => void) | null = null;
  private freeReady = false;
  private rebuilds = 0;

  constructor(private readonly shell: Shell) {
    this.scroll = new ScrollView({ width: 720, height: 900, padding: 0, paddingBottom: 24 });
    this.view.addChild(this.scroll, this.fxLayer);
    for (const block of BLOCKS) {
      const root = new Container();
      this.scroll.content.addChild(root);
      this.states.push({ block, root, sig: '\u0000', shown: false, height: 0, top: 0, anchors: undefined, points: undefined });
    }
    this.offProfile = profile.subscribe(() => {
      this.checkNow = true;
    });
    this.offScroll = this.scroll.onScroll((_x, y) => this.spy(y));
    this.freeReady = profile.freeChestView().ready;
    live = this;
    debugExpose('shop', { rebuilds: () => this.rebuilds, jumpTo: (id: ShopSectionId) => this.jumpTo(id), actions: this.actions });
  }

  // ───────────────────────────── layout ─────────────────────────────

  private readonly actions: ShopActions = {
    openChest: (kind) => void this.openAndReveal(kind),
    openAllChests: (kind) => void this.openAndReveal(kind, true),
    buyChest: (kind, count) => void this.buyChest(kind, count),
    claimFreeChest: () => void this.claimFree(),
    skipFreeChest: (via) => void this.skipFree(via),
    buySlot: (slot) => void this.buySlot(slot),
    refreshDaily: () => void this.refreshDaily(),
    buyProduct: (id) => void this.buyProduct(id),
    claimGemPass: () => this.claimGemPass(),
    breakPiggyFree: () => this.breakPiggy(),
    buyCosmetic: (id) => void this.buyCosmetic(id),
    equip: (id) => this.equip(id),
    previewFx: (id, at) => this.previewFx(id, at),
    buyTicket: () => this.buyTicket(),
    ticketAd: () => void this.ticketAd(),
    openOdds: (kind) => services.openOdds(kind),
    trackFreeTimer: (text) => {
      this.freeTimer = text;
    },
  };

  private rebuild(s: BlockState): void {
    this.rebuilds++;
    if (s.block.id === 'cosmetics') detachRugPreviews();
    for (const c of s.root.removeChildren()) c.destroy({ children: true });
    if (s.block.id === 'chests') this.freeTimer = null;
    s.shown = s.block.visible();
    s.sig = s.block.signature();
    s.root.visible = s.shown;
    if (!s.shown) {
      s.height = 0;
      s.anchors = undefined;
      s.points = undefined;
      return;
    }
    const built = s.block.build(s.root, { w: this.area.w, actions: this.actions });
    s.height = built.height;
    s.anchors = built.anchors;
    s.points = built.points;
  }

  private restack(): void {
    let y = 8;
    for (const s of this.states) {
      s.top = y;
      s.root.position.set(0, y);
      if (s.shown) y += s.height;
    }
    this.scroll.refresh();
    this.rebuildNav();
  }

  private navDefs(): SegmentDef[] {
    const tabs: SegmentDef[] = [];
    for (const s of this.states) {
      if (s.shown) tabs.push({ id: s.block.id, label: t('shop.tab.' + s.block.id) });
    }
    return tabs;
  }

  private rebuildNav(): void {
    const defs = this.navDefs();
    const key = defs.map((d) => d.id).join(',') + ':' + this.area.w;
    if (key === this.navKey && this.nav) return;
    this.navKey = key;
    const selected = this.nav?.selectedId;
    this.nav?.destroy();
    this.nav = new SegmentTabs({
      tabs: defs,
      width: this.area.w - 24,
      height: 88,
      selected: defs.some((d) => d.id === selected) ? selected : defs[0]?.id,
    });
    this.nav.position.set(this.area.x + this.area.w / 2, this.area.y + 8 + 44);
    this.nav.onSelect((id) => {
      if (!this.syncing) this.jumpTo(id as ShopSectionId);
    });
    this.view.addChild(this.nav);
  }

  /** Keep the tab highlight on the section in view. */
  private spy(y: number): void {
    if (!this.nav || this.syncing || game.time < this.spyResume) return;
    let current: BlockState | undefined;
    for (const s of this.states) if (s.shown && s.top - 80 <= y + 4) current = s;
    if (current && this.nav.selectedId !== current.block.id) {
      this.syncing = true;
      this.nav.select(current.block.id, true, true);
      this.syncing = false;
    }
  }

  jumpTo(id: ShopSectionId): void {
    // The list scrolls past the sections in between: the highlight stays on the one asked for until it arrives.
    this.spyResume = game.time + 0.75;
    let top: number | null = null;
    for (const s of this.states) {
      if (!s.shown) continue;
      if (s.block.id === id) top = s.top;
      const a = s.anchors?.[id];
      if (a !== undefined) top = s.top + a;
    }
    const y = top ?? 0;
    this.scroll.scrollTo(Math.max(0, y - 4), true);
    const target = this.states.find((s) => s.shown && (s.block.id === id || s.anchors?.[id] !== undefined));
    if (target && this.nav && this.nav.selectedId !== target.block.id) {
      this.syncing = true;
      this.nav.select(target.block.id, true);
      this.syncing = false;
    }
  }

  private refreshAll(): void {
    for (const s of this.states) this.rebuild(s);
    this.restack();
  }

  private checkSignatures(): void {
    let changed = false;
    for (const s of this.states) {
      const visible = s.block.visible();
      const sig = s.block.signature();
      if (visible !== s.shown || sig !== s.sig) {
        this.rebuild(s);
        changed = true;
      }
    }
    if (changed) this.restack();
  }

  // ───────────────────────────── TabScreen ─────────────────────────────

  show(): void {
    profile.refresh();
    this.checkSignatures();
    // The block is not rebuilt when nothing but the clock moved while the tab was away: bring the countdown up to date.
    const v = profile.freeChestView();
    if (this.freeTimer && !v.ready) this.freeTimer.text = freeWaitText(v.waitMs);
    if (pending) {
      const id = pending;
      pending = null;
      this.jumpTo(id);
    }
  }

  /** Nothing to stop: update() is not called while hidden, and the countdown text lives and dies with its block. */
  hide(): void {}

  resize(area: ContentArea): void {
    const widthChanged = area.w !== this.area.w;
    this.area = area;
    this.scroll.position.set(area.x, area.y + NAV_H);
    this.scroll.setViewSize(area.w, area.h - NAV_H);
    if (widthChanged || this.states.every((s) => s.sig === '\u0000')) this.refreshAll();
    else this.restack();
    this.nav?.position.set(area.x + area.w / 2, area.y + 8 + 44);
  }

  update(dt: number): void {
    this.fx?.update(dt);
    this.tick += dt;
    if (this.checkNow) {
      this.checkNow = false;
      this.checkSignatures();
    }
    if (this.tick < 0.5) return;
    this.tick = 0;
    const v = profile.freeChestView();
    if (v.ready !== this.freeReady) {
      this.freeReady = v.ready;
      this.checkNow = true;
    }
    if (this.freeTimer && !v.ready) this.freeTimer.text = freeWaitText(v.waitMs);
    this.checkSignatures();
  }

  /** The guidebook's "try it": a part of the chests block ('shop.free' the free chest, 'shop.chests' the silver chest and its odds). Blocks rebuild, so it is looked up again each time. */
  pointAt(point: string): PointResolver | null {
    const name = point.slice('shop.'.length);
    const find = (): Container | null => this.states.find((s) => s.shown && s.points?.[name])?.points?.[name] ?? null;
    const card = point.startsWith('shop.') ? find() : null;
    if (!card) return null;
    this.scroll.scrollToShow(card, POINT_MARGIN);
    return find;
  }

  badge(): boolean {
    if (profile.freeChestView().ready) return true;
    if (profile.gemPassView().canClaim) return true;
    if (profile.featureUnlocked('shop')) {
      const v = profile.shopView();
      if (v.offers.some((o) => o.kind === 'free' && !v.bought[o.slot])) return true;
    }
    return false;
  }

  destroy(): void {
    this.offProfile?.();
    this.offScroll?.();
    this.offProfile = null;
    this.offScroll = null;
    this.fx?.destroy();
    this.fx = null;
    disposeRugPreviews();
    if (live === this) live = null;
    this.view.destroy({ children: true });
  }

  // ───────────────────────────── actions ─────────────────────────────

  private feedback(kind: 'purchase' | 'claim'): void {
    // A card stamped "sold" is heard when the stamp lands.
    if (stampPending() === null) audio.play(kind === 'purchase' ? 'purchase' : 'reward_claim');
    haptic('success');
  }

  private fail(code: Parameters<typeof errorKey>[0]): void {
    refusalCue();
    haptic('warning');
    toast(t(errorKey(code)), 'warning');
  }

  /** Not enough of a currency: say how much is missing and offer the way to get it. */
  private explainShort(currency: 'gold' | 'gems', short: number): void {
    audio.play('ui_error');
    haptic('warning');
    const shell = this.shell;
    if (currency === 'gems') {
      if (!iap.isAvailable()) {
        toast(t('shop.need.unavailable'), 'warning');
        return;
      }
      void confirmDialog({
        title: t('shop.need.gemsTitle'),
        message: tn('shop.need.gems', short, { n: fmt(short) }),
        confirmLabel: t('shop.need.goGems'),
        cancelLabel: t('shop.need.later'),
      }).then((go) => {
        if (go) this.jumpTo('gems');
      });
      return;
    }
    void confirmDialog({
      title: t('shop.need.goldTitle'),
      message: t('shop.need.gold', { n: fmt(short) }),
      confirmLabel: t('shop.need.goBattle'),
      cancelLabel: t('shop.need.later'),
    }).then((go) => {
      if (go) shell.goTab('battle');
    });
  }

  private async openAndReveal(kind: ChestKind, all = false): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.openNow(kind, all ? CHEST_BULK_MAX : 1);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Open `count` chests (the whole pile up to the cap when it is more than one) and play the reveal. The caller holds `busy`
   * for the whole time. The draw is stored and written to disk before anything is shown, so a reveal that is cut short is
   * replayed from the stored results the next time the home screen opens.
   */
  private async openNow(kind: ChestKind, count: number): Promise<void> {
    const r = count > 1 ? await profile.openChests(kind, count) : await profile.openChest(kind);
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.shell.refresh();
    await services.revealChest(r.value);
    this.shell.refresh();
  }

  /**
   * Buy `count` chests, show what was bought and open all of them at once. The tab is busy from the tap until the reveal is
   * over (the confirmation included), so a second tap cannot start a second purchase. The gems and the chests change in one
   * meta call, so a failure leaves both as they were; once the chests are in the inventory the open call stores their
   * results (the same replay a single purchase has) and an interruption never loses them.
   */
  private async buyChest(kind: ChestKind, count = 1): Promise<void> {
    if (this.busy) return;
    const short = shortBy(chestPrice(kind, count), profile.data.gems);
    if (short > 0) {
      this.explainShort('gems', short);
      return;
    }
    this.busy = true;
    try {
      // The odds are shown at the moment of purchase (GDD 8.4).
      if (!(await confirmChestBuy(kind, count))) return;
      const r = profile.buyChest(kind, count);
      if (!r.ok) {
        this.fail(r.error);
        return;
      }
      this.feedback('purchase');
      this.shell.refresh();
      await this.openNow(kind, count);
    } finally {
      this.busy = false;
    }
  }

  private async claimFree(): Promise<void> {
    const r = profile.claimFreeChest();
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback('claim');
    await this.openAndReveal('wooden');
  }

  private async skipFree(via: 'ad' | 'gems'): Promise<void> {
    if (this.busy) return;
    if (via === 'gems') {
      const short = shortBy(profile.freeChestView().skipGems, profile.data.gems);
      if (short > 0) {
        this.explainShort('gems', short);
        return;
      }
    }
    this.busy = true;
    let ok = false;
    try {
      const r = await profile.skipFreeChest(via);
      if (!r.ok) {
        this.fail(r.error);
        return;
      }
      ok = true;
    } finally {
      this.busy = false;
    }
    if (ok) {
      this.feedback('claim');
      await this.openAndReveal('wooden');
    }
  }

  private async buySlot(slot: number): Promise<void> {
    if (this.busy) return;
    const offer = profile.shopView().offers[slot];
    if (!offer) return;
    const gold = shortBy(offer.price.gold ?? 0, profile.data.gold);
    const gems = shortBy(offer.price.gems ?? 0, profile.data.gems);
    if (gold > 0) return this.explainShort('gold', gold);
    if (gems > 0) return this.explainShort('gems', gems);
    const r = profile.buyShop(slot);
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback(offer.kind === 'free' ? 'claim' : 'purchase');
    await afterStamp();
    await services.showRewards(bundleParts(r.value), t('shop.sec.daily'));
  }

  private async refreshDaily(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const r = await profile.refreshShop();
      if (!r.ok) {
        this.fail(r.error);
        return;
      }
      audio.play('reel_stop');
      haptic('medium');
    } finally {
      this.busy = false;
    }
  }

  private async buyProduct(id: string): Promise<void> {
    if (this.busy) return;
    const spec = iapSpec(id);
    if (!spec) return;
    this.busy = true;
    // The piggy bank pays what is inside right now; read it before the order is granted.
    const pool = profile.data.piggy.gems;
    let outcome: Awaited<ReturnType<typeof iap.purchase>>;
    try {
      outcome = await iap.purchase(id);
    } finally {
      this.busy = false;
    }
    if (outcome === 'cancelled') {
      toast(t('shop.buy.cancel'), 'info');
      return;
    }
    if (outcome === 'failed') {
      refusalCue();
      toast(t('shop.buy.fail'), 'error');
      return;
    }
    if (outcome === 'unavailable') {
      toast(t('shop.buy.unavailable'), 'warning');
      return;
    }
    this.feedback('purchase');
    const parts: BundlePart[] = spec.grant === 'piggy' ? bundleParts({ gems: pool }) : bundleParts(spec.bundle);
    if (parts.length > 0) {
      await services.showRewards(parts, t(`meta.iap.${id}.name`));
    } else {
      this.shell.refresh();
      toast(t('shop.buy.thanks'), 'success');
    }
  }

  private claimGemPass(): void {
    const r = profile.claimGemPass();
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback('claim');
    void services.showRewards(bundleParts({ gems: r.value }), t('shop.gempass.title'));
  }

  private breakPiggy(): void {
    const r = profile.breakPiggyFree();
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback('claim');
    void services.showRewards(bundleParts({ gems: r.value }), t('shop.sec.piggy'));
  }

  private async buyCosmetic(id: string): Promise<void> {
    const row = profile.cosmetics().find((c) => c.id === id);
    if (!row || row.source.type !== 'gems') return;
    const short = shortBy(row.source.price, profile.data.gems);
    if (short > 0) {
      this.explainShort('gems', short);
      return;
    }
    const r = profile.buyCosmetic(id);
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback('purchase');
    await services.showRewards(bundleParts({ cosmetics: [id] }), t('shop.sec.cosmetics'));
  }

  private equip(id: string): void {
    const r = profile.equip(id);
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    audio.play('ui_confirm');
    haptic('light');
    toast(t('meta.cos.' + id) + ' · ' + t('shop.cos.equipped'), 'success');
  }

  private previewFx(id: string, at: Container): void {
    if (!this.fx) this.fx = new Fx(this.fxLayer, uiTweens);
    const b = at.getBounds();
    const p = this.view.toLocal({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const theme = themeOf(id);
    this.fx.summonReveal(p.x, p.y, 2, { quick: true, scale: 0.8 });
    if (theme.count > 0) {
      this.fx.ps.burst({ ...THEME_SPRAY, tex: theme.tex, gravity: theme.gravity }, p.x, p.y, { colors: theme.colors, count: (theme.count / 6) * 2, scale: 1.2 });
    }
    audio.play('summon_epic', { volume: 0.6 });
    haptic('light');
  }

  private buyTicket(): void {
    const v = profile.ticketView();
    const short = shortBy(v.gemPrice, profile.data.gems);
    if (short > 0) {
      this.explainShort('gems', short);
      return;
    }
    const r = profile.buyTicket();
    if (!r.ok) {
      this.fail(r.error);
      return;
    }
    this.feedback('purchase');
    void services.showRewards(bundleParts({ tickets: 1 }), t('shop.sec.tickets'));
  }

  private async ticketAd(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const before = profile.data.tickets;
    try {
      const r = await profile.watchTicketAd();
      if (!r.ok) {
        this.fail(r.error);
        return;
      }
    } finally {
      this.busy = false;
    }
    this.feedback('claim');
    const n = profile.data.tickets - before;
    await services.showRewards(bundleParts({ tickets: Math.max(1, n || TICKET_AD_AMOUNT) }), t('shop.sec.tickets'));
  }
}

/** Jump to a shop section from anywhere: switches to the shop tab and scrolls there. */
export function openShopSection(section: string | undefined): void {
  pending = isShopSection(section) ? section : null;
  const shell = getShell();
  shell?.goTab('shop');
  if (live && pending) {
    const id = pending;
    pending = null;
    live.jumpTo(id);
  }
}

export function createShopTabView(shell: Shell): TabScreen {
  return new ShopTab(shell);
}
