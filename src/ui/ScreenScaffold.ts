import { Container, Graphics, Rectangle, type DestroyOptions } from 'pixi.js';
import { game } from '@/core/game';
import { Ease } from '@/core/tween';
import { backGesture } from './backGesture';
import { IconButton } from './IconButton';
import { boxOf } from './layout';
import { scaffoldLayout, type SafeRect } from './layoutMath';
import { motion, TweenBag } from './motion';
import { popups } from './Popup';
import { ScrollView } from './ScrollView';
import { drawFloor, drawPaper, PaperLabel, paperSeed } from './paper';
import { refreshCache } from './shapes';
import { Color } from './theme';

export interface ScreenScaffoldOpts {
  /** Already-translated header text. */
  title: string;
  /** Back button handler. Omit for a screen that cannot be left (the button is not drawn). */
  onBack?: () => void;
  /** Scrolling body (default true). With false, `content` is a plain container at the body's top-left. */
  scroll?: boolean;
  /** Height of the bottom action bar above the home-indicator inset. 0 / omitted = no bar. */
  actionBarHeight?: number;
  /** Space around the body content (default 24). */
  padding?: number;
  /** Header height below the top inset (default 104). */
  titleHeight?: number;
  /** Fill the screen with the standard backdrop and swallow taps (default true). */
  backdrop?: boolean;
}

const BACK_SIZE = 72;
const SIDE = 24;
const live: ScreenScaffold[] = [];
let keyBound = false;

/** True when the container and every ancestor are visible and it is attached to the stage. */
function isShown(c: Container): boolean {
  let p: Container | null = c;
  while (p) {
    if (!p.visible) return false;
    if (p === game.root) return true;
    p = p.parent;
  }
  return false;
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && e.key !== 'BrowserBack') return;
  if (e.defaultPrevented) return;
  if (ScreenScaffold.handleBack()) e.preventDefault();
}

/**
 * A full screen: header with back button and title, a body (scrolling by default) and an optional
 * bottom action bar, all inside the safe area. Rewarded-ad offers, shops and settings belong on one
 * of these (or on an inline card inside one), never in popups stacked on popups.
 *
 * Put body widgets in `content` (origin = top-left of the padded body) and buttons in `actionBar`
 * (origin = centre of the bar's usable part). The scaffold re-lays itself out whenever the game
 * resizes. Origin = top-left of the screen.
 */
export class ScreenScaffold extends Container {
  /** Add body children here. */
  readonly content: Container;
  /** Add action-bar children here; (0, 0) is the middle of the bar above the home-indicator inset. */
  readonly actionBar = new Container();
  /** The scroll view carrying `content`, or null when `scroll` is false. */
  readonly scroller: ScrollView | null;

  private readonly bag = new TweenBag();
  private readonly bgG = new Graphics();
  private readonly titleG = new Graphics();
  private readonly actionG = new Graphics();
  private readonly titleLayer = new Container();
  private readonly main = new Container();
  private readonly titleLabel: PaperLabel;
  private readonly seed = paperSeed();
  private readonly backBtn: IconButton | null;
  private readonly actionsRight: Container[] = [];
  private readonly padding: number;
  private readonly titleH: number;
  private readonly actionH: number;
  private readonly backdrop: boolean;
  private backFn: (() => void) | null;
  private offResize: (() => void) | null = null;
  private releaseBack: (() => void) | null = null;
  private rects: ReturnType<typeof scaffoldLayout>;

  constructor(opts: ScreenScaffoldOpts) {
    super();
    this.padding = opts.padding ?? 24;
    this.titleH = opts.titleHeight ?? 104;
    this.actionH = Math.max(0, opts.actionBarHeight ?? 0);
    this.backdrop = opts.backdrop ?? true;
    this.backFn = opts.onBack ?? null;
    this.rects = scaffoldLayout(game.w, game.h, game.safeTop, game.safeBottom, this.titleH, this.actionH);

    if (opts.scroll ?? true) {
      this.scroller = new ScrollView({
        width: game.w,
        height: this.rects.body.h,
        padding: this.padding,
        paddingBottom: this.padding + this.rects.bottomInset,
      });
      this.content = this.scroller.content;
      this.main.addChild(this.scroller);
    } else {
      this.scroller = null;
      this.content = new Container();
      this.main.addChild(this.content);
    }
    this.main.addChild(this.actionG, this.actionBar);

    this.titleLabel = new PaperLabel({ text: opts.title, size: 40, paper: Color.paperLight, padX: 40, padY: 10, seed: this.seed + 5 });
    this.titleLayer.addChild(this.titleG, this.titleLabel);
    if (this.backFn) {
      this.backBtn = new IconButton({ icon: 'back', style: 'neutral', size: BACK_SIZE });
      this.backBtn.onTap(() => this.back());
      this.titleLayer.addChild(this.backBtn);
    } else {
      this.backBtn = null;
    }

    this.addChild(this.bgG, this.main, this.titleLayer);
    if (this.backdrop) {
      this.bgG.eventMode = 'static';
    }
    this.layout();
    this.offResize = game.events.on('resize', () => this.layout());
    live.push(this);
    this.syncBack();
    if (!keyBound) {
      keyBound = true;
      window.addEventListener('keydown', onKey);
    }
  }

  /** Usable body rectangle (below the header, above the action bar) in screen design space. */
  get bodyRect(): SafeRect {
    return this.rects.body;
  }

  /** Width available to `content` inside the side padding. */
  get contentWidth(): number {
    return game.w - this.padding * 2;
  }

  /** Visible height of the body viewport. */
  get viewportHeight(): number {
    return this.rects.body.h;
  }

  setTitle(text: string): void {
    this.titleLabel.setText(text);
    this.layoutTitle();
  }

  onBack(fn: (() => void) | null): this {
    this.backFn = fn;
    this.syncBack();
    return this;
  }

  /**
   * Run the back handler. Returns false (and does nothing) when the screen has none. The system Back
   * gesture arrives here by itself (backGesture(), after the popups) while the screen is shown.
   */
  back(): boolean {
    if (!this.backFn) return false;
    this.backFn();
    return true;
  }

  /** Hang a widget on the right end of the header (a currency pill, a help icon). Laid out right to left. */
  addTitleAction(item: Container): void {
    this.titleLayer.addChild(item);
    this.actionsRight.push(item);
    this.layoutTitle();
  }

  /** Re-measure the scroll body after content changed. */
  refresh(): void {
    this.scroller?.refresh();
  }

  /** Screen change in: content cross-fades while rising 24 px (160 ms). Resolves when settled. */
  show(animate = true): Promise<void> {
    this.visible = true;
    this.syncBack();
    this.main.y = 0;
    this.main.alpha = 1;
    this.titleLayer.alpha = 1;
    if (!animate || motion.reduced) return Promise.resolve();
    this.main.alpha = 0;
    this.main.y = 24;
    this.titleLayer.alpha = 0;
    return this.bag.runKeyed(this.main, {
      duration: 0.16,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        this.main.alpha = k;
        this.main.y = 24 * (1 - k);
        this.titleLayer.alpha = k;
      },
      onComplete: () => {
        this.main.alpha = 1;
        this.main.y = 0;
        this.titleLayer.alpha = 1;
      },
    }).finished;
  }

  /** Screen change out (120 ms fade); the caller destroys or removes the scaffold afterwards. */
  hide(animate = true): Promise<void> {
    if (!animate || motion.reduced) {
      this.visible = false;
      this.syncBack();
      return Promise.resolve();
    }
    return this.bag.runKeyed(this.main, {
      duration: 0.12,
      ease: Ease.cubicIn,
      onUpdate: (k) => {
        this.main.alpha = 1 - k;
        this.titleLayer.alpha = 1 - k;
      },
      onComplete: () => {
        this.visible = false;
        this.syncBack();
      },
    }).finished;
  }

  /** Handle a back request (Escape / browser back): the topmost visible scaffold goes back. */
  static handleBack(): boolean {
    if (popups.count > 0) return false;
    for (let i = live.length - 1; i >= 0; i--) {
      const s = live[i] as ScreenScaffold;
      if (isShown(s)) return s.back();
    }
    return false;
  }

  override destroy(options?: DestroyOptions): void {
    this.bag.killAll();
    this.offResize?.();
    this.offResize = null;
    this.backFn = null;
    this.syncBack();
    const i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
    if (live.length === 0 && keyBound) {
      keyBound = false;
      window.removeEventListener('keydown', onKey);
    }
    super.destroy(options);
  }

  /** Re-fit everything to the current screen size and safe area. Runs on every game resize. */
  layout(): void {
    const w = game.w;
    const h = game.h;
    const r = scaffoldLayout(w, h, game.safeTop, game.safeBottom, this.titleH, this.actionH);
    this.rects = r;

    this.bgG.clear();
    if (this.backdrop) {
      drawFloor(this.bgG, w, h);
      this.bgG.hitArea = new Rectangle(0, 0, w, h);
    }

    const tb = r.titleBar;
    this.titleG.clear();
    // A kraft strip across the top, torn along its lower edge; cut wider than the screen so its wobble stays off it.
    drawPaper(this.titleG, -14, -14, { w: tb.w + 28, h: tb.h + 14, radius: 0, fill: Color.kraft, torn: 'bottom', shadow: 6, seed: this.seed });
    this.layoutTitle();

    const ab = r.actionBar;
    this.actionG.clear();
    this.actionG.visible = ab !== null;
    this.actionBar.visible = ab !== null;
    if (ab) {
      drawPaper(this.actionG, ab.x - 14, ab.y, { w: ab.w + 28, h: ab.h + 14, radius: 0, fill: Color.kraft, torn: 'top', shadow: -5, seed: this.seed + 1 });
      this.actionBar.position.set(w / 2, ab.y + this.actionH / 2 + 4);
    }

    if (this.scroller) {
      this.scroller.position.set(0, r.body.y);
      this.scroller.setBottomPadding(this.padding + r.bottomInset);
      this.scroller.setViewSize(w, r.body.h);
    } else {
      this.content.position.set(this.padding, r.body.y + this.padding);
    }
    // The header strip is cheap to bake: it never changes between resizes.
    refreshCache(this.titleG);
  }

  /** The system Back gesture is held while a page that can be left is shown. */
  private syncBack(): void {
    const want = this.backFn !== null && this.visible;
    if (want && !this.releaseBack) this.releaseBack = backGesture().hold();
    else if (!want && this.releaseBack) {
      this.releaseBack();
      this.releaseBack = null;
    }
  }

  private layoutTitle(): void {
    const tb = this.rects.titleBar;
    const cy = game.safeTop + this.titleH / 2 - 2;
    let left = SIDE;
    if (this.backBtn) {
      this.backBtn.position.set(SIDE + BACK_SIZE / 2, cy);
      left = SIDE + BACK_SIZE + 12;
    }
    let right = tb.w - SIDE;
    for (let i = this.actionsRight.length - 1; i >= 0; i--) {
      const item = this.actionsRight[i] as Container;
      const b = boxOf(item);
      item.position.set(right - (b.x + b.w), cy);
      right -= b.w + 14;
    }
    // The title stays centred when it fits, otherwise it slides to the free span between the controls.
    const free = Math.min(tb.w / 2 - left, right - tb.w / 2) * 2;
    this.titleLabel.setMaxWidth(Math.max(160, free - 24));
    this.titleLabel.position.set(tb.w / 2, cy);
  }
}

backGesture().onBack(() => ScreenScaffold.handleBack());
