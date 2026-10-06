import { Container } from 'pixi.js';
import { Ease, type Tween, type Tweener } from '@/core/tween';
import { motion } from '@/ui';
import { TAB_ORDER, type ContentArea, type Shell, type TabFactory, type TabId, type TabScreen } from '../contract';
import { createBattleTab } from '../battle';
import { createCatsTab } from '../cats';
import { createMissionsTab } from '../missions';
import { createPassTab } from '../pass';
import { createShopTab } from '../shop';

const FADE_IN = 0.16;
const FADE_OUT = 0.1;

const FACTORIES: Record<TabId, TabFactory> = {
  shop: createShopTab,
  cats: createCatsTab,
  battle: createBattleTab,
  missions: createMissionsTab,
  pass: createPassTab,
};

/** A tab that failed to build: an empty page, so one broken tab never takes the home screen down with it. */
function emptyTab(): TabScreen {
  const view = new Container();
  return {
    view,
    show() {},
    hide() {},
    resize() {},
    update() {},
    badge: () => false,
    destroy: () => view.destroy({ children: true }),
  };
}

function build(id: TabId, shell: Shell): TabScreen {
  try {
    return FACTORIES[id](shell);
  } catch (err) {
    console.error(`[home] tab "${id}" failed to build`, err);
    return emptyTab();
  }
}

/**
 * Owns the five tab screens. Each is built once and keeps its state while hidden; switching
 * cross-fades the two views, calls hide() / show(), and only the visible tab is updated.
 */
export class TabHost {
  readonly layer = new Container();
  private readonly tabs = {} as Record<TabId, TabScreen>;
  private readonly fades = new Map<TabId, Tween>();
  private current: TabId;

  constructor(
    shell: Shell,
    initial: TabId,
    private readonly ui: Tweener,
  ) {
    this.current = initial;
    for (const id of TAB_ORDER) {
      const tab = build(id, shell);
      tab.view.visible = id === initial;
      this.tabs[id] = tab;
      this.layer.addChild(tab.view);
    }
  }

  get selected(): TabId {
    return this.current;
  }

  /** Tab-bar badge of every tab. */
  badge(id: TabId): number | boolean {
    return this.tabs[id].badge();
  }

  resize(area: ContentArea): void {
    for (const id of TAB_ORDER) this.tabs[id].resize(area);
  }

  /** Call once after the first resize: the starting tab becomes visible. */
  start(): void {
    const tab = this.tabs[this.current];
    tab.view.visible = true;
    tab.view.alpha = 1;
    tab.show();
  }

  select(id: TabId): void {
    if (id === this.current) return;
    const from = this.tabs[this.current];
    const to = this.tabs[id];
    const fromId = this.current;
    this.current = id;
    from.hide();
    this.fade(fromId, from.view, false);
    to.view.visible = true;
    to.show();
    this.fade(id, to.view, true);
  }

  update(dt: number): void {
    this.tabs[this.current].update(dt);
  }

  destroy(): void {
    for (const tw of this.fades.values()) tw.kill();
    this.fades.clear();
    this.tabs[this.current].hide();
    for (const id of TAB_ORDER) this.tabs[id].destroy();
  }

  private fade(id: TabId, view: Container, inward: boolean): void {
    this.fades.get(id)?.kill();
    view.interactiveChildren = inward;
    if (motion.reduced) {
      view.alpha = 1;
      view.visible = inward;
      view.interactiveChildren = true;
      return;
    }
    const from = view.alpha;
    const to = inward ? 1 : 0;
    this.fades.set(
      id,
      this.ui.run({
        duration: (inward ? FADE_IN : FADE_OUT) * Math.abs(to - from) || 0.01,
        ease: inward ? Ease.cubicOut : Ease.linear,
        onUpdate: (k) => {
          view.alpha = from + (to - from) * k;
        },
        onComplete: () => {
          view.alpha = to;
          if (inward) view.interactiveChildren = true;
          else view.visible = false;
          this.fades.delete(id);
        },
      }),
    );
  }
}
