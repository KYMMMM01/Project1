import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import { backOut, motion, TweenBag } from './motion';
import { cacheStatic, drawPill } from './shapes';
import { uiLabel } from './text';
import { ButtonPalettes, Color, type ButtonStyleId } from './theme';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

const KIND: Record<ToastKind, { style: ButtonStyleId; icon: IconName }> = {
  info: { style: 'info', icon: 'info' },
  success: { style: 'success', icon: 'check' },
  warning: { style: 'primary', icon: 'warning' },
  error: { style: 'danger', icon: 'close' },
};

interface Pending {
  text: string;
  kind: ToastKind;
}

function buildToast(text: string, kind: ToastKind): { view: Container; label: Text } {
  const k = KIND[kind];
  const pal = ButtonPalettes[k.style];
  const label = uiLabel(text, { size: 30, stroke: pal.textStroke, strokeWidth: 6, wrap: 520, lineHeight: 38, shadow: false });
  const h = Math.max(88, label.height + 40);
  const w = Math.min(680, Math.max(380, label.width + 150));
  const art = new Container();
  const g = new Graphics();
  drawPill(g, -w / 2, -h / 2, w, h, {
    top: pal.top,
    bottom: pal.bottom,
    outline: Color.outline,
    outlineWidth: 5,
    gloss: 0.3,
    shadow: { alpha: 0.4, spread: 12, offsetY: 8 },
  });
  // Icon medallion on the left end
  const med = new Graphics();
  med.circle(-w / 2 + 52, 0, 31).fill({ color: pal.lip, alpha: 0.55 });
  med.circle(-w / 2 + 52, 0, 31).stroke({ width: 3, color: Color.outline, alpha: 0.6 });
  const icon = drawIcon(k.icon, 40);
  icon.position.set(-w / 2 + 52, 0);
  art.addChild(g, med, icon);
  cacheStatic(art);
  label.position.set(24, 0);
  const view = new Container();
  view.addChild(art, label);
  return { view, label };
}

/**
 * Queue of transient messages on game.overlayLayer. One toast shows at a time; each slides down from
 * the top, holds for a time scaled to its length, and slides away. Toasts never take input.
 */
class ToastManager {
  private readonly queue: Pending[] = [];
  private readonly bag = new TweenBag();
  private view: Container | null = null;
  private current: Pending | null = null;
  private hold: ReturnType<TweenBag['run']> | null = null;

  show(text: string, kind: ToastKind): void {
    const c = this.current;
    if (c && c.text === text && c.kind === kind && this.view) {
      // Same message again: keep the existing toast on screen a little longer instead of stacking.
      this.holdFor(text.length, true);
      return;
    }
    if (this.queue.some((q) => q.text === text && q.kind === kind)) return;
    this.queue.push({ text, kind });
    if (this.queue.length > 5) this.queue.shift();
    if (!this.current) this.next();
  }

  /** Remove everything immediately (scene change). */
  clear(): void {
    this.queue.length = 0;
    this.bag.killAll();
    this.view?.destroy({ children: true });
    this.view = null;
    this.current = null;
    this.hold = null;
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.current = null;
      return;
    }
    this.current = item;
    const { view } = buildToast(item.text, item.kind);
    this.view = view;
    view.eventMode = 'none';
    game.overlayLayer.addChild(view);
    const y = game.safeTop + 170;
    view.x = game.w / 2;
    audio.play(item.kind === 'error' || item.kind === 'warning' ? 'ui_error' : 'ui_tab', { volume: 0.6 });

    if (motion.reduced) {
      view.y = y;
    } else {
      view.alpha = 0;
      this.bag.run({
        duration: 0.26,
        ease: Ease.linear,
        onUpdate: (k) => {
          view.y = y - 70 * (1 - backOut(2)(k));
          view.alpha = Math.min(1, k * 4);
        },
        onComplete: () => {
          view.y = y;
          view.alpha = 1;
        },
      });
    }
    this.holdFor(item.text.length, false);
  }

  private holdFor(len: number, extend: boolean): void {
    this.hold?.kill();
    const crowded = this.queue.length >= 2;
    const base = Math.min(3.4, Math.max(1.8, 1.2 + len * 0.05));
    const seconds = crowded ? 1.2 : base;
    this.hold = this.bag.run({
      duration: seconds + (extend ? 0.3 : 0),
      delay: extend ? 0 : 0.26,
      ease: Ease.linear,
      onComplete: () => this.dismiss(),
    });
  }

  private dismiss(): void {
    const view = this.view;
    if (!view) return;
    const y0 = view.y;
    const done = (): void => {
      view.destroy({ children: true });
      if (this.view === view) this.view = null;
      this.current = null;
      this.next();
    };
    if (motion.reduced) {
      done();
      return;
    }
    this.bag.run({
      duration: 0.2,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        view.y = y0 - 40 * k;
        view.alpha = 1 - k;
      },
      onComplete: done,
    });
  }
}

const manager = new ToastManager();

/** Show a transient message. `text` must already be translated. */
export function toast(text: string, kind: ToastKind = 'info'): void {
  manager.show(text, kind);
}

/** Drop every pending and visible toast (call when leaving a scene). */
export function clearToasts(): void {
  manager.clear();
}
