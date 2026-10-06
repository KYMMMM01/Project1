import { Container, Graphics, Rectangle, type DestroyOptions, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { lerp, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Badge, type BadgeValue } from './Badge';
import { drawIcon, type IconName } from './icons';
import type { Box } from './layoutMath';
import { backOut, motion, shakeX, TweenBag } from './motion';
import { drawGlow, drawShadow, glossGradient, vGradient } from './shapes';
import { fitLabel, uiLabel } from './text';
import { ButtonPalettes, Color, Hit } from './theme';

export interface TabDef {
  id: string;
  /** Already-translated label. */
  label: string;
  icon: IconName;
  badge?: BadgeValue;
  /** Locked tabs show a padlock and report taps through onLockedTap instead of selecting. */
  locked?: boolean;
}

export interface TabBarOpts {
  tabs: readonly TabDef[];
  selected?: string;
  /** Index of the raised hero tab (the battle/home button). Default: the middle tab when the count is odd. */
  featured?: number;
}

const BAR_H = 128;
const ICON = 58;
const LABEL_Y = 102;
const DIM = 0xb9add6;
const GOLD = 0xffd54a;

class Tab extends Container {
  readonly iconWrap = new Container();
  readonly plateOn = new Graphics();
  readonly plateOff = new Graphics();
  readonly icon: Graphics;
  readonly text: Text;
  readonly lockIcon: Graphics;
  readonly badge = new Badge({ size: 24 });
  readonly indicator = new Graphics();
  readonly featured: boolean;
  /** 0..1 selection amount; may overshoot while bouncing. */
  sel = 0;
  restY = 0;

  constructor(
    readonly def: TabDef,
    featured: boolean,
  ) {
    super();
    this.featured = featured;
    this.icon = drawIcon(def.icon, ICON);
    this.lockIcon = drawIcon('lock', 28);
    this.text = uiLabel(def.label, { size: 22, color: 0xffffff, strokeWidth: 4, shadow: false });
    this.text.tint = DIM;
    this.indicator.roundRect(-20, -4, 40, 8, 4).fill(vGradient(0xffe27a, 0xff9f1c));
    this.indicator.alpha = 0;

    const r = featured ? 54 : 46;
    this.plateOff.circle(0, 4, r).fill({ color: 0x07030f, alpha: 0.3 });
    this.plateOff.circle(0, 0, r).fill(vGradient(0x6a5aa8, 0x40318a)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    this.plateOff.ellipse(-r * 0.15, -r * 0.5, r * 0.62, r * 0.28).fill(glossGradient(0.35, 0.04));
    const pal = ButtonPalettes.primary;
    drawGlow(this.plateOn, 0, 0, r * 1.7, pal.glow, 0.7);
    this.plateOn.circle(0, 4, r).fill({ color: 0x07030f, alpha: 0.3 });
    this.plateOn.circle(0, 0, r).fill(vGradient(pal.rimTop, pal.rimBottom)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    this.plateOn.circle(0, 0, r - 8).fill(vGradient(pal.top, pal.bottom));
    this.plateOn.ellipse(-r * 0.12, -r * 0.5, r * 0.58, r * 0.26).fill(glossGradient(0.5, 0.05));
    this.plateOn.alpha = 0;
    this.plateOff.visible = featured;

    this.iconWrap.addChild(this.plateOff, this.plateOn, this.icon);
    this.lockIcon.position.set(ICON * 0.3, ICON * 0.3);
    this.lockIcon.visible = !!def.locked;
    this.iconWrap.addChild(this.lockIcon);
    this.addChild(this.iconWrap, this.text, this.indicator, this.badge);
  }
}

/**
 * Bottom navigation. Origin = top-left of the bar; layout(w, h) pins it to the screen bottom and
 * grows it by game.safeBottom so the home indicator never covers a tab. The selected tab rises and
 * bounces, gains a glowing plate and a gold label; the hero tab is always a raised round button.
 */
export class TabBar extends Container {
  private readonly tabs: Tab[] = [];
  private readonly bg = new Graphics();
  private readonly bag = new TweenBag();
  private selected = '';
  private w = 720;
  private selectFn: ((id: string, prev: string) => void) | null = null;
  private lockedFn: ((id: string) => void) | null = null;
  private pressedTab: Tab | null = null;

  constructor(opts: TabBarOpts) {
    super();
    const n = opts.tabs.length;
    const featured = opts.featured ?? (n % 2 === 1 && n >= 3 ? (n - 1) / 2 : -1);
    this.addChild(this.bg);
    opts.tabs.forEach((def, i) => {
      const tab = new Tab({ ...def }, i === featured);
      tab.badge.set(def.badge, false);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointerdown', () => this.onDown(tab));
      tab.on('pointerup', () => this.onUp(tab));
      tab.on('pointerupoutside', () => this.cancel(tab));
      tab.on('pointerleave', () => this.cancel(tab));
      this.tabs.push(tab);
      this.addChild(tab);
    });
    this.selected = opts.selected ?? opts.tabs[0]?.id ?? '';
    for (const t of this.tabs) {
      t.sel = t.def.id === this.selected ? 1 : 0;
      this.apply(t);
    }
    this.layout(game.w, game.h);
  }

  get selectedId(): string {
    return this.selected;
  }

  /** Visible height including the safe-area inset. */
  get barHeight(): number {
    return BAR_H + game.safeBottom;
  }

  get uiBox(): Box {
    return { x: 0, y: 0, w: this.w, h: this.barHeight };
  }

  onSelect(fn: ((id: string, prev: string) => void) | null): this {
    this.selectFn = fn;
    return this;
  }

  /** Called when a locked tab is tapped, to explain how to unlock it. */
  onLockedTap(fn: ((id: string) => void) | null): this {
    this.lockedFn = fn;
    return this;
  }

  setBadge(id: string, value: BadgeValue): void {
    this.find(id)?.badge.set(value);
  }

  setLocked(id: string, locked: boolean): void {
    const t = this.find(id);
    if (!t) return;
    t.lockIcon.visible = locked;
    t.icon.alpha = locked ? 0.55 : 1;
    t.def.locked = locked;
  }

  /** Select programmatically (also what a tap does). Fires onSelect when the selection changes. */
  select(id: string, animate = true): void {
    const next = this.find(id);
    if (!next || id === this.selected) return;
    const prevId = this.selected;
    const prev = this.find(prevId);
    this.selected = id;
    audio.play('ui_tab');
    if (animate && !motion.reduced) {
      if (prev) this.animateSel(prev, 0, 0.16, Ease.cubicOut);
      this.animateSel(next, 1, 0.34, backOut(2.8));
    } else {
      if (prev) {
        prev.sel = 0;
        this.apply(prev);
      }
      next.sel = 1;
      this.apply(next);
    }
    this.selectFn?.(id, prevId);
  }

  /** Pin to the bottom edge and spread the tabs across `w`. Call from the scene's resize(). */
  layout(w: number, h: number): void {
    this.w = w;
    const barH = this.barHeight;
    this.position.set(0, h - barH);
    this.bg.clear();
    drawShadow(this.bg, 0, 0, w, barH, 0, { alpha: 0.4, spread: 18, offsetY: -8 });
    this.bg.rect(0, 0, w, barH).fill(vGradient(0x3a2a78, 0x1b1238));
    this.bg.rect(0, 0, w, 6).fill(Color.outline);
    this.bg.rect(0, 6, w, 3).fill({ color: 0x8f7bd8, alpha: 0.7 });
    this.bg.rect(0, 9, w, 18).fill(glossGradient(0.1, 0));
    const cell = w / this.tabs.length;
    this.tabs.forEach((t, i) => {
      t.position.set(cell * (i + 0.5), 0);
      t.iconWrap.x = 0;
      t.text.position.set(0, LABEL_Y);
      fitLabel(t.text, cell - 12, 22);
      t.indicator.position.set(0, LABEL_Y + 22);
      t.badge.position.set(ICON * 0.5 + 6, 34);
      t.hitArea = new Rectangle(-cell / 2, t.featured ? -34 : -4, cell, barH + (t.featured ? 34 : 4));
      this.apply(t);
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.selectFn = null;
    this.lockedFn = null;
    super.destroy(options);
  }

  /* ------------------------------------------------------------ internals */

  private find(id: string): Tab | undefined {
    return this.tabs.find((t) => t.def.id === id);
  }

  private animateSel(tab: Tab, to: number, duration: number, ease: (t: number) => number): void {
    const from = tab.sel;
    this.bag.runKeyed(tab, {
      duration,
      ease,
      onUpdate: (k) => {
        tab.sel = lerp(from, to, k);
        this.apply(tab);
      },
      onComplete: () => {
        tab.sel = to;
        this.apply(tab);
      },
    });
  }

  /** Lay out one tab for its current selection amount. */
  private apply(t: Tab): void {
    const e = t.sel;
    const lift = t.featured ? 24 : 0;
    const baseY = 52 - lift;
    t.iconWrap.y = baseY - e * (t.featured ? 8 : 22);
    const pressed = t === this.pressedTab ? 0.9 : 1;
    t.iconWrap.scale.set((1 + e * (t.featured ? 0.1 : 0.22)) * pressed);
    t.plateOn.alpha = Math.max(0, Math.min(1, e));
    t.plateOff.visible = t.featured || e > 0.02;
    if (!t.featured) t.plateOff.alpha = Math.max(0, Math.min(1, e));
    t.text.tint = mixColor(DIM, GOLD, Math.max(0, Math.min(1, e)));
    t.indicator.alpha = Math.max(0, Math.min(1, e));
    t.indicator.scale.x = 0.4 + 0.6 * Math.max(0, Math.min(1, e));
    t.icon.alpha = t.def.locked ? 0.55 : 1;
    t.badge.y = baseY - 22 - e * 22;
  }

  private onDown(tab: Tab): void {
    this.pressedTab = tab;
    this.apply(tab); // visual change on the pointerdown frame
    haptic('tap');
  }

  private onUp(tab: Tab): void {
    if (this.pressedTab !== tab) return;
    this.pressedTab = null;
    this.apply(tab);
    if (tab.def.locked) {
      audio.play('ui_error', { volume: 0.5 });
      shakeX(this.bag, tab.iconWrap, 0, 7, 3, 0.2);
      this.lockedFn?.(tab.def.id);
      return;
    }
    this.select(tab.def.id);
  }

  private cancel(tab: Tab): void {
    if (this.pressedTab !== tab) return;
    this.pressedTab = null;
    this.apply(tab);
  }
}

/* ------------------------------------------------------------- segment tabs */

export interface SegmentDef {
  id: string;
  label: string;
  badge?: BadgeValue;
}

export interface SegmentTabsOpts {
  tabs: readonly SegmentDef[];
  width?: number;
  height?: number;
  selected?: string;
}

/** Sub-tabs in a recessed track with a highlight pill that slides to the selection. Origin = centre. */
export class SegmentTabs extends Container {
  readonly uiBox: Box;
  private readonly defs: readonly SegmentDef[];
  private readonly labels: Text[] = [];
  private readonly hi = new Graphics();
  private readonly bag = new TweenBag();
  private readonly cellW: number;
  private selected: string;
  private hiX = 0;
  private selectFn: ((id: string) => void) | null = null;

  constructor(opts: SegmentTabsOpts) {
    super();
    const w = opts.width ?? 600;
    const h = opts.height ?? 76;
    this.defs = opts.tabs;
    this.cellW = (w - 12) / opts.tabs.length;
    this.selected = opts.selected ?? opts.tabs[0]?.id ?? '';
    this.uiBox = { x: -w / 2, y: -h / 2, w, h: h + 6 };

    const track = new Graphics();
    track.roundRect(-w / 2, -h / 2 + 4, w, h, h / 2).fill({ color: 0x07030f, alpha: 0.3 });
    track.roundRect(-w / 2, -h / 2, w, h, h / 2).fill(vGradient(0x1a1034, 0x2a1d52)).stroke({ width: 5, color: Color.outline, alignment: 1 });
    track.roundRect(-w / 2 + 8, -h / 2 + 7, w - 16, h * 0.26, h * 0.13).fill({ color: 0x000000, alpha: 0.3 });
    const pal = ButtonPalettes.primary;
    const ph = h - 14;
    this.hi.roundRect(-this.cellW / 2, -ph / 2, this.cellW, ph, ph / 2).fill(vGradient(pal.top, pal.bottom)).stroke({ width: 4, color: Color.outline, alignment: 1 });
    this.hi.roundRect(-this.cellW / 2 + 8, -ph / 2 + 5, this.cellW - 16, ph * 0.38, ph * 0.19).fill(glossGradient(0.5, 0.06));
    this.addChild(track, this.hi);

    opts.tabs.forEach((d, i) => {
      const cx = this.cellX(i);
      const t = uiLabel(d.label, { size: 30, strokeWidth: 5, shadow: false });
      fitLabel(t, this.cellW - 24, 30);
      t.position.set(cx, -1);
      this.labels.push(t);
      this.addChild(t);
      const hit = new Container();
      hit.hitArea = new Rectangle(cx - this.cellW / 2, -Math.max(h, Hit.min) / 2, this.cellW, Math.max(h, Hit.min));
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.on('pointerdown', () => {
        t.scale.set(t.scale.x * 0.94);
        haptic('tap');
      });
      hit.on('pointerup', () => this.select(d.id));
      hit.on('pointerupoutside', () => this.paint());
      hit.on('pointerleave', () => this.paint());
      this.addChild(hit);
      if (d.badge) {
        const b = new Badge({ size: 24, value: d.badge });
        b.position.set(cx + this.cellW / 2 - 24, -h / 2 + 4);
        this.addChild(b);
      }
    });
    this.hiX = this.cellX(this.indexOf(this.selected));
    this.paint();
  }

  get selectedId(): string {
    return this.selected;
  }

  onSelect(fn: ((id: string) => void) | null): this {
    this.selectFn = fn;
    return this;
  }

  select(id: string, animate = true): void {
    if (id === this.selected) {
      this.paint();
      return;
    }
    const to = this.cellX(this.indexOf(id));
    this.selected = id;
    audio.play('ui_tab');
    const from = this.hiX;
    this.bag.killAll();
    if (animate && !motion.reduced) {
      this.bag.run({
        duration: 0.22,
        ease: backOut(1.6),
        onUpdate: (k) => {
          this.hiX = lerp(from, to, k);
          this.paint();
        },
        onComplete: () => {
          this.hiX = to;
          this.paint();
        },
      });
    } else {
      this.hiX = to;
    }
    this.paint();
    this.selectFn?.(id);
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.selectFn = null;
    super.destroy(options);
  }

  private indexOf(id: string): number {
    return Math.max(0, this.defs.findIndex((d) => d.id === id));
  }

  private cellX(i: number): number {
    return (i - (this.defs.length - 1) / 2) * this.cellW;
  }

  private paint(): void {
    this.hi.x = this.hiX;
    this.defs.forEach((d, i) => {
      const t = this.labels[i];
      if (!t) return;
      t.scale.set(Math.min(1, (this.cellW - 24) / Math.max(1, t.width / t.scale.x)));
      t.tint = d.id === this.selected ? 0xffffff : 0xb9add6;
    });
  }
}
