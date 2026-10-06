import { Container, Graphics, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { onStorageVolatile } from '@/core/save';
import { Ease } from '@/core/tween';
import { drawIcon, type IconName } from './icons';
import { backOut, motion, TweenBag } from './motion';
import { drawPaper, paperSeed, tapeStrip } from './paper';
import { cacheStatic } from './shapes';
import './strings';
import { uiLabel } from './text';
import { ButtonPalettes, Color, type ButtonStyleId, type TapeName } from './theme';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

const KIND: Record<ToastKind, { style: ButtonStyleId; icon: IconName; tape: TapeName }> = {
  info: { style: 'info', icon: 'info', tape: 'sky' },
  success: { style: 'success', icon: 'check', tape: 'green' },
  warning: { style: 'mustard', icon: 'warning', tape: 'yellow' },
  error: { style: 'danger', icon: 'close', tape: 'pink' },
};

interface Pending {
  text: string;
  kind: ToastKind;
}

const LINE_H = 38;
const MAX_LINES = 2;
/** Centre line below the safe area: under the home currency row and the battle wave bar, so a toast never hides a number that just changed. */
const REST_Y = 262;

/** Messages are capped at two lines: longer text is cut with an ellipsis rather than growing the pill. */
function capLines(label: Text): void {
  const full = label.text;
  let keep = full.length;
  while (label.height > LINE_H * MAX_LINES + 6 && keep > 4) {
    keep = Math.max(4, keep - Math.max(2, Math.ceil(keep * 0.08)));
    label.text = full.slice(0, keep).trimEnd() + '…';
  }
}

function buildToast(text: string, kind: ToastKind): { view: Container; label: Text } {
  const k = KIND[kind];
  const pal = ButtonPalettes[k.style];
  const label = uiLabel(text, { size: 30, wrap: 520, lineHeight: LINE_H });
  capLines(label);
  const h = Math.max(88, label.height + 40);
  const w = Math.min(680, Math.max(380, label.width + 150));
  const seed = paperSeed();
  const art = new Container();
  const g = new Graphics();
  // A cream strip with the kind's colour on a round paper medallion and one piece of tape.
  drawPaper(g, -w / 2, -h / 2, { w, h, radius: 28, fill: Color.paperLight, seed, grain: false });
  drawPaper(g, -w / 2 + 20, -34, { w: 68, h: 68, kind: 'circle', fill: pal.base, edge: pal.lip, seed: seed + 1, shadow: 3, grain: false });
  const icon = drawIcon(k.icon, 40);
  icon.position.set(-w / 2 + 54, 0);
  const tape = tapeStrip({ name: k.tape, w: 70, h: 24, angle: 4, pattern: 'dots', seed });
  tape.position.set(w / 2 - 74, -h / 2 + 1);
  art.addChild(g, icon, tape);
  cacheStatic(art);
  label.position.set(34, 0);
  const view = new Container();
  view.addChild(art, label);
  return { view, label };
}

/**
 * Queue of transient messages on game.overlayLayer. One toast shows at a time; each rises into place
 * under the top bars, holds for a time scaled to its length, and drifts away. Toasts never take input.
 */
class ToastManager {
  private readonly queue: Pending[] = [];
  private readonly bag = new TweenBag();
  private view: Container | null = null;
  private current: Pending | null = null;
  /** True from the moment the exit animation starts: the toast can no longer be extended. */
  private leaving = false;
  private hold: ReturnType<TweenBag['run']> | null = null;

  show(text: string, kind: ToastKind): void {
    const c = this.current;
    if (c && c.text === text && c.kind === kind && this.view && !this.leaving) {
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
    this.leaving = false;
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.current = null;
      return;
    }
    this.current = item;
    this.leaving = false;
    const { view } = buildToast(item.text, item.kind);
    this.view = view;
    view.eventMode = 'none';
    game.overlayLayer.addChild(view);
    const y = game.safeTop + REST_Y;
    view.x = game.w / 2;
    audio.play(item.kind === 'error' || item.kind === 'warning' ? 'ui_error' : 'ui_tab', { volume: 0.6 });

    if (motion.reduced) {
      view.y = y;
    } else {
      view.alpha = 0;
      const rise = backOut(2);
      this.bag.run({
        duration: 0.26,
        ease: Ease.linear,
        onUpdate: (k) => {
          view.y = y + 56 * (1 - rise(k));
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
    this.leaving = true;
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

// Progress that cannot be written to disk is the one failure the player must hear about, and once.
onStorageVolatile(() => toast(t('ui.storage.volatile'), 'warning'));
