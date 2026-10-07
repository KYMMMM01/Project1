import { gameplayStop } from '@/app/lifecycle';
import { audio } from '@/audio';
import { debugExpose } from '@/core/debug';
import { game } from '@/core/game';
import { i18nEvents, t } from '@/core/i18n';
import { Scene, scenes } from '@/core/scene';
import type { Tweener } from '@/core/tween';
import { profile, featureHint, type FeatureId } from '@/meta';
import { TabBar, toast, type TabDef } from '@/ui';
import { shell, type HomeSurface } from '@/screens/shell/controller';
import { HomeFloor } from '@/screens/shell/HomeFloor';
import { HomeTopBar } from '@/screens/shell/HomeTopBar';
import { shellLayout } from '@/screens/shell/layoutMath';
import { TabHost } from '@/screens/shell/TabHost';
import '@/screens/shell/strings';
import { TAB_ORDER, services, type ContentArea, type CurrencyKind, type TabId } from '@/screens/contract';

export interface HomeOptions {
  /** Tab to open on. Default: the battle tab, or the one a screen asked for while no home was open. */
  tab?: TabId;
}

const TAB_ICON = { shop: 'shop', cats: 'paw', battle: 'swords', missions: 'mission', pass: 'crown' } as const;
/** The feature that opens each tab (the battle tab is always open). */
const TAB_FEATURE: Record<TabId, FeatureId | null> = { shop: 'shop', cats: 'cats', battle: null, missions: 'missions', pass: 'pass' };
const BADGE_POLL = 1;
const REFRESH_POLL = 60;
/** Where the shop's "+" buttons lead: the section that sells each currency. */
const SHOP_SECTION: Record<CurrencyKind, string> = { gold: 'daily', gems: 'gems', tickets: 'daily' };

/**
 * The home screen: the wooden floor, the top bar (level, currencies, settings), the five tabs and
 * the bottom tab bar. It is rebuilt every time the player comes back from a battle; the `shell`
 * singleton forwards tab and system-screen requests to whichever home scene is on screen.
 */
export class HomeScene extends Scene implements HomeSurface {
  private readonly floor = new HomeFloor();
  private readonly topBar: HomeTopBar;
  private readonly tabBar: TabBar;
  private readonly host: TabHost;
  private rect: ContentArea;
  private badgeClock = 0;
  private refreshClock = 0;
  private readonly offs: Array<() => void> = [];

  constructor(opts: HomeOptions = {}) {
    super();
    this.rect = shellLayout(game.w, game.h, game.safeTop, game.safeBottom).area;
    this.topBar = new HomeTopBar({
      onPlus: (kind) => services.openShop(SHOP_SECTION[kind]),
      onSettings: () => services.openSettings(),
    });
    const first = opts.tab ?? shell.takeQueuedTab() ?? 'battle';
    this.host = new TabHost(shell, first, this.tweens);
    this.tabBar = new TabBar({ tabs: this.tabDefs(), selected: first, featured: TAB_ORDER.indexOf('battle') });
    this.tabBar.onSelect((id) => this.host.select(id as TabId));
    this.tabBar.onLockedTap((id) => this.explainLock(id as TabId));
    this.addChild(this.floor, this.host.layer, this.topBar, this.tabBar);
  }

  get ui(): Tweener {
    return this.tweens;
  }

  get area(): ContentArea {
    return this.rect;
  }

  override enter(): void {
    shell.attach(this);
    audio.music('home');
    profile.refresh();
    this.offs.push(
      profile.subscribe(() => this.refresh()),
      i18nEvents.on('change', () => this.rebuild()),
    );
    this.relayout();
    this.host.start();
    this.refresh(false);
    // Play never outlives the battle screen, whichever way the battle was left.
    gameplayStop();
    debugExpose('home', { shell, scene: this, goTab: (id: TabId) => shell.goTab(id) });
  }

  override exit(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    shell.detach(this);
    this.host.destroy();
  }

  override resize(): void {
    this.relayout();
  }

  override update(dt: number): void {
    this.host.update(dt);
    this.badgeClock += dt;
    if (this.badgeClock >= BADGE_POLL) {
      this.badgeClock = 0;
      this.syncBadges();
    }
    this.refreshClock += dt;
    if (this.refreshClock >= REFRESH_POLL) {
      this.refreshClock = 0;
      profile.refresh();
    }
  }

  goTab(id: TabId): void {
    if (this.locked(id)) {
      this.explainLock(id);
      return;
    }
    this.tabBar.select(id);
  }

  currencyAnchor(kind: CurrencyKind): { x: number; y: number } {
    return this.topBar.iconPosition(kind);
  }

  pending(kind: CurrencyKind, amount: number, seconds?: number): void {
    this.topBar.pending(kind, amount, seconds);
  }

  landed(kind: CurrencyKind): void {
    this.topBar.landed(kind);
  }

  refresh(animate = true): void {
    this.topBar.sync(animate);
    this.syncBadges();
  }

  private tabDefs(): TabDef[] {
    return TAB_ORDER.map((id) => ({
      id,
      label: t('shell.tab.' + id),
      icon: TAB_ICON[id],
      badge: false,
      locked: this.locked(id),
    }));
  }

  private locked(id: TabId): boolean {
    const f = TAB_FEATURE[id];
    return f !== null && !profile.featureUnlocked(f);
  }

  private explainLock(id: TabId): void {
    const f = TAB_FEATURE[id];
    if (f) toast(featureHint(f), 'info');
  }

  private syncBadges(): void {
    for (const id of TAB_ORDER) {
      const locked = this.locked(id);
      this.tabBar.setLocked(id, locked);
      this.tabBar.setBadge(id, locked ? false : this.host.badge(id));
    }
  }

  /** The language changed: every label is built once, so build the whole screen again on the same tab. */
  private rebuild(): void {
    const tab = this.host.selected;
    void scenes.goto(() => new HomeScene({ tab }), 'none');
  }

  private relayout(): void {
    const w = game.w;
    const h = game.h;
    const rects = shellLayout(w, h, game.safeTop, game.safeBottom);
    this.rect = rects.area;
    this.floor.resize(w, h);
    this.topBar.layout(w);
    this.tabBar.layout(w, h);
    this.host.resize(this.rect);
  }
}
