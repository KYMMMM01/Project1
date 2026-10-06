/**
 * The one `Shell` object tabs and system screens hold on to. The home scene is rebuilt every time the
 * player returns from a battle, so the shell stays put and forwards to whichever home scene is on
 * screen (nothing happens when none is). The run flow registers the launcher.
 */
import { game } from '@/core/game';
import type { Tweener } from '@/core/tween';
import { uiTweens } from '@/core/tween';
import type { ContentArea, CurrencyKind, Shell, StartRunRequest, TabId } from '../contract';
import { shellLayout } from './layoutMath';

/** What a home scene offers the shell while it is on screen. */
export interface HomeSurface {
  readonly ui: Tweener;
  readonly area: ContentArea;
  goTab(id: TabId): void;
  currencyAnchor(kind: CurrencyKind): { x: number; y: number };
  refresh(): void;
}

export type RunLauncher = (request: StartRunRequest) => Promise<void>;

class ShellController implements Shell {
  private surface: HomeSurface | null = null;
  private launcher: RunLauncher | null = null;
  private queuedTab: TabId | null = null;

  get ui(): Tweener {
    return this.surface?.ui ?? uiTweens;
  }

  get area(): ContentArea {
    return this.surface?.area ?? shellLayout(game.w, game.h, game.safeTop, game.safeBottom).area;
  }

  /** A home scene came on screen. */
  attach(surface: HomeSurface): void {
    this.surface = surface;
  }

  detach(surface: HomeSurface): void {
    if (this.surface === surface) this.surface = null;
  }

  setLauncher(fn: RunLauncher | null): void {
    this.launcher = fn;
  }

  /** The tab asked for while no home scene was open; the next home scene opens on it. */
  takeQueuedTab(): TabId | null {
    const tab = this.queuedTab;
    this.queuedTab = null;
    return tab;
  }

  goTab(id: TabId): void {
    if (this.surface) this.surface.goTab(id);
    else this.queuedTab = id;
  }

  currencyAnchor(kind: CurrencyKind): { x: number; y: number } {
    return this.surface?.currencyAnchor(kind) ?? { x: game.w / 2, y: game.safeTop + 60 };
  }

  refresh(): void {
    this.surface?.refresh();
  }

  startRun(request: StartRunRequest): Promise<void> {
    return this.launcher ? this.launcher(request) : Promise.resolve();
  }
}

export const shell = new ShellController();
