import { Container, Graphics, Rectangle, type DestroyOptions, type Text } from 'pixi.js';
import { audio } from '@/audio';
import { game } from '@/core/game';
import { haptic } from '@/core/haptics';
import { lerp, mixColor } from '@/core/math';
import { Ease } from '@/core/tween';
import { Badge, type BadgeValue } from './Badge';
import { tintToward } from './colors';
import { drawIcon, type IconName } from './icons';
import { TAB_BAR, tabPaperBox, type Box } from './layoutMath';
import { backOut, motion, shakeX, TweenBag } from './motion';
import { drawPaper, paperSeed, tapeStrip } from './paper';
import { cacheStatic, refreshCache } from './shapes';
import { fitLabel, uiLabel } from './text';
import { Color, Hit, type TapeName } from './theme';

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

const BAR_H = TAB_BAR.h;
const ICON = 58;
const LABEL_Y = TAB_BAR.labelY;
/** Where the kraft strip's torn top edge sits (the selected tab pokes up through it). */
const STRIP_TOP = TAB_BAR.strip;
/** Unselected labels are filled in `Color.inkMid` (readable on kraft); this tint takes them to full ink when selected. */
const SELECTED_TINT = tintToward(Color.inkMid, Color.ink);
const TAPES: readonly TapeName[] = ['sky', 'yellow', 'pink', 'green'];

class Tab extends Container {
  readonly iconWrap = new Container();
  /** Hero tab: the cream round button that is always there. */
  readonly plateOff = new Graphics();
  /** Hero tab: the coral round button that fades in when selected. */
  readonly plateOn = new Container();
  /** The cream paper tab that slides up behind the selected tab (redrawn for the cell width and the bar's height). */
  readonly paper = new Container();
  readonly icon: Graphics;
  readonly text: Text;
  readonly lockIcon: Graphics;
  readonly badge = new Badge({ size: 24 });
  readonly featured: boolean;
  /** 0..1 selection amount; may overshoot while bouncing. */
  sel = 0;
  restY = 0;

  constructor(
    readonly def: TabDef,
    featured: boolean,
    readonly index: number,
  ) {
    super();
    this.featured = featured;
    this.icon = drawIcon(def.icon, ICON);
    this.lockIcon = drawIcon('lock', 28);
    // The label colour follows the selection amount by tint alone: no text is redrawn.
    this.text = uiLabel(def.label, { size: 24, color: Color.inkMid });

    const r = featured ? 54 : 46;
    if (featured) {
      const seed = paperSeed();
      drawPaper(this.plateOff, -r, -r, { w: r * 2, h: r * 2, kind: 'circle', fill: Color.paperLight, edge: Color.kraftDark, shadow: 5, grain: false, seed });
      const on = new Graphics();
      drawPaper(on, -r, -r, { w: r * 2, h: r * 2, kind: 'circle', fill: Color.coral, edge: Color.coralDark, shadow: 5, grain: false, seed });
      const t = tapeStrip({ name: TAPES[index % TAPES.length] as TapeName, w: 58, h: 20, angle: -24, pattern: 'dots', seed });
      t.position.set(-r * 0.5, -r * 0.88);
      this.plateOn.addChild(on, t);
      cacheStatic(this.plateOn);
      cacheStatic(this.plateOff);
    }
    this.plateOn.alpha = 0;
    this.plateOff.visible = featured;
    this.paper.alpha = 0;

    this.iconWrap.addChild(this.plateOff, this.plateOn, this.icon);
    this.lockIcon.position.set(ICON * 0.3, ICON * 0.3);
    this.lockIcon.visible = !!def.locked;
    this.iconWrap.addChild(this.lockIcon);
    this.addChild(this.paper, this.iconWrap, this.text, this.badge);
  }

  /**
   * (Re)draw the cream tab that sticks up behind the selected tab. It starts above the bar's torn edge and runs
   * past the bottom of the screen, so it holds the icon and the label whole and never shows a bottom edge of its own.
   */
  redrawPaper(cell: number, barH: number): void {
    for (const c of this.paper.removeChildren()) c.destroy({ children: true });
    const g = new Graphics();
    const box = tabPaperBox(cell, barH, this.featured);
    drawPaper(g, box.x, box.y, { w: box.w, h: box.h, radius: 22, fill: Color.paperLight, edge: Color.kraftDark, shadow: 4, grain: false, seed: paperSeed() });
    this.paper.addChild(g);
    // The raised disc of the hero tab carries its own tape.
    if (!this.featured) {
      const tape = tapeStrip({ name: TAPES[this.index % TAPES.length] as TapeName, w: 62, h: 22, angle: this.index % 2 === 0 ? -3 : 3, pattern: 'gingham', seed: this.index + 11 });
      tape.position.set(0, -STRIP_TOP - 6);
      this.paper.addChild(tape);
    }
    refreshCache(this.paper);
  }
}

/**
 * Bottom navigation: a kraft strip with a torn top edge. Origin = top-left of the bar; layout(w, h)
 * pins it to the screen bottom and grows it by game.safeBottom so the home indicator never covers a
 * tab. The selected tab is a cream paper tab that sticks up through the tear and runs down past the
 * screen's bottom edge, held by a piece of tape, and its icon rises and bounces; the hero tab is always
 * a raised round paper button (coral on its own taller paper tab when selected).
 */
export class TabBar extends Container {
  private readonly tabs: Tab[] = [];
  private readonly bg = new Graphics();
  private readonly bag = new TweenBag();
  private readonly seed = paperSeed();
  private selected = '';
  private w = 720;
  private selectFn: ((id: string, prev: string) => void) | null = null;
  private lockedFn: ((id: string) => void) | null = null;
  private reselectFn: ((id: string) => void) | null = null;
  private pressedTab: Tab | null = null;

  constructor(opts: TabBarOpts) {
    super();
    const n = opts.tabs.length;
    const featured = opts.featured ?? (n % 2 === 1 && n >= 3 ? (n - 1) / 2 : -1);
    this.addChild(this.bg);
    opts.tabs.forEach((def, i) => {
      const tab = new Tab({ ...def }, i === featured, i);
      tab.badge.set(def.badge, false);
      tab.eventMode = 'static';
      tab.cursor = 'pointer';
      tab.on('pointerdown', () => this.onDown(tab));
      tab.on('pointerup', () => this.onUp(tab));
      tab.on('pointerupoutside', () => this.cancel(tab));
      tab.on('pointerleave', () => this.cancel(tab));
      tab.on('pointercancel', () => this.cancel(tab));
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

  /** Called when the already-selected tab is tapped again (the convention: scroll that screen back to the top). */
  onReselect(fn: ((id: string) => void) | null): this {
    this.reselectFn = fn;
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
    // A kraft strip with a torn top edge, cut wider than the screen so its wobbling sides stay off it.
    drawPaper(this.bg, -14, STRIP_TOP, { w: w + 28, h: barH - STRIP_TOP + 14, radius: 0, fill: Color.kraft, torn: 'top', shadow: -5, seed: this.seed });
    refreshCache(this.bg);
    const cell = w / this.tabs.length;
    this.tabs.forEach((t, i) => {
      t.position.set(cell * (i + 0.5), 0);
      t.iconWrap.x = 0;
      t.text.position.set(0, LABEL_Y);
      fitLabel(t.text, cell - 12, 24);
      t.redrawPaper(cell, barH);
      t.badge.position.set(ICON * 0.5 + 6, 34);
      t.hitArea = new Rectangle(-cell / 2, t.featured ? TAB_BAR.heroPaperTop : -4, cell, barH - (t.featured ? TAB_BAR.heroPaperTop : -4));
      this.apply(t);
    });
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.selectFn = null;
    this.lockedFn = null;
    this.reselectFn = null;
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
    const k = Math.max(0, Math.min(1, e));
    t.plateOn.alpha = k;
    t.paper.alpha = k;
    t.paper.y = (1 - k) * 18;
    t.text.tint = mixColor(Color.white, SELECTED_TINT, k);
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
    if (tab.def.id === this.selected) {
      this.reselectFn?.(tab.def.id);
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

/** Sub-tabs on a kraft strip with a cream paper piece (and a bit of tape) that slides to the selection. Origin = centre. */
export class SegmentTabs extends Container {
  readonly uiBox: Box;
  private readonly defs: readonly SegmentDef[];
  private readonly labels: Text[] = [];
  private readonly hi = new Container();
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
    drawPaper(track, -w / 2, -h / 2, { w, h, kind: 'pill', fill: Color.kraft, edge: Color.kraftDark, shadow: 4, grain: false, seed: paperSeed() });
    const ph = h - 14;
    const piece = new Graphics();
    drawPaper(piece, -this.cellW / 2, -ph / 2, { w: this.cellW, h: ph, kind: 'pill', fill: Color.paperLight, edge: Color.kraftDark, shadow: 3, grain: false, seed: paperSeed() });
    this.hi.addChild(piece);
    const tape = tapeStrip({ name: 'sky', w: 40, h: 16, angle: -18, pattern: 'dots', seed: 5 });
    tape.position.set(-this.cellW / 2 + 22, -ph / 2 + 1);
    this.hi.addChild(tape);
    cacheStatic(track);
    cacheStatic(this.hi);
    this.addChild(track, this.hi);

    opts.tabs.forEach((d, i) => {
      const cx = this.cellX(i);
      const t = uiLabel(d.label, { size: 30, color: Color.inkMid });
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

  /** `silent` follows a change that has its own cue (a list scrolling past sections). */
  select(id: string, animate = true, silent = false): void {
    if (id === this.selected) {
      this.paint();
      return;
    }
    const to = this.cellX(this.indexOf(id));
    this.selected = id;
    if (!silent) audio.play('ui_tab');
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
      t.tint = d.id === this.selected ? SELECTED_TINT : Color.white;
    });
  }
}
