/**
 * Shared contract of the home shell and its screens. The shell (HomeScene) owns the top currency
 * bar, the bottom tab bar and the flow into a battle; each tab and each system popup is built
 * independently against this file and never imports another screen's module. Cross-screen calls
 * (open the chest reveal from the home tab, jump to a shop section from a "not enough gems" toast)
 * go through `services`.
 */
import type { Container } from 'pixi.js';
import type { Tweener } from '@/core/tween';
import type { BattleMode } from '@/game';
import type { PointResolver } from './shell/HomePointer';

export type TabId = 'shop' | 'cats' | 'battle' | 'missions' | 'pass';

export const TAB_ORDER: readonly TabId[] = ['shop', 'cats', 'battle', 'missions', 'pass'];

/** The rectangle a tab may draw in (scene space): below the currency bar, above the tab bar. */
export interface ContentArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TabScreen {
  /** Root display object; the shell adds/removes it and positions nothing inside it. */
  readonly view: Container;
  /** Tab became visible: refresh from the profile, restart idle animation. */
  show(): void;
  /** Tab was hidden: stop timers and idle animation. */
  hide(): void;
  resize(area: ContentArea): void;
  /** Real-time tick while visible. */
  update(dt: number): void;
  /** Tab-bar badge: a count, true for a plain dot, false/0 for none. */
  badge(): number | boolean;
  /**
   * Where the guidebook's "try it" points on this tab (a home point id, see `guide/topics.ts`): brings the thing into view and
   * answers with a function that tells where it is now, or null when this tab has nothing by that name or it is not on screen.
   */
  pointAt?(point: string): PointResolver | null;
  destroy(): void;
}

export type CurrencyKind = 'gold' | 'gems' | 'tickets';

export interface StartRunRequest {
  mode: BattleMode;
  chapter?: number;
  stake?: number;
}

/** What the shell offers to tabs and popups. */
export interface Shell {
  /** Real-time clock for screen animation (killed when the home scene exits). */
  readonly ui: Tweener;
  readonly area: ContentArea;
  goTab(id: TabId): void;
  /** Scene-space centre of a currency icon in the top bar (target for reward flights). */
  currencyAnchor(kind: CurrencyKind): { x: number; y: number };
  /**
   * A flight of `amount` is about to carry currency the profile already holds to `kind`'s pill: the pill keeps
   * showing what it had until the first icon lands (or `seconds` pass, if no flight ever comes).
   */
  pending(kind: CurrencyKind, amount: number, seconds?: number): void;
  /** One flying icon reached its pill: the icon bumps, and the first landing starts the number rolling to the new amount. */
  landed(kind: CurrencyKind): void;
  /** Re-read the profile into the top bar and the tab badges (call after any claim or purchase). */
  refresh(): void;
  /** Go through the pre-run screen (snack offer) and into the battle. Resolves when the battle scene is opening. */
  startRun(request: StartRunRequest): Promise<void>;
}

/** Things one screen module provides for everyone. Missing providers resolve as no-ops. */
export interface ScreenServices {
  /** Play the chest-opening sequence for an already decided result (meta `ChestResult`), then resolve. */
  revealChest(result: unknown): Promise<void>;
  /**
   * Show a "you received" popup for a reward bundle (meta `BundlePart[]`), flying currencies to the top bar.
   * `held`: the caller already told the shell to keep the top bar's numbers back for these parts (`Shell.pending`), so the sheet does not.
   */
  showRewards(parts: unknown, title?: string, held?: boolean): Promise<void>;
  /** Open the odds screen of a chest kind ('wooden' | 'silver' | 'gold'). */
  openOdds(kind: string): void;
  openSettings(): void;
  openCalendar(): void;
  /** Jump to the shop tab and scroll to a section ('chests' | 'daily' | 'gems' | 'pass' | 'piggy' | 'cosmetics'). */
  openShop(section?: string): void;
  /** Open one unit's detail screen from anywhere. */
  openUnit(unitId: string): void;
}

const registry: Partial<ScreenServices> = {};

export function provide<K extends keyof ScreenServices>(name: K, fn: ScreenServices[K]): void {
  registry[name] = fn;
}

/** Call a service if someone provides it. Promise-returning services resolve immediately when absent. */
export const services: ScreenServices = {
  revealChest: (result) => registry.revealChest?.(result) ?? Promise.resolve(),
  showRewards: (parts, title, held) => registry.showRewards?.(parts, title, held) ?? Promise.resolve(),
  openOdds: (kind) => registry.openOdds?.(kind),
  openSettings: () => registry.openSettings?.(),
  openCalendar: () => registry.openCalendar?.(),
  openShop: (section) => registry.openShop?.(section),
  openUnit: (unitId) => registry.openUnit?.(unitId),
};

export type TabFactory = (shell: Shell) => TabScreen;
