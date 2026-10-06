import { Application, Container, Rectangle } from 'pixi.js';
import { Emitter } from './events';
import { uiTweens } from './tween';
import { clamp } from './math';

/** Design space: fixed 720 wide, height flexes with the device aspect between these bounds. */
export const DESIGN_W = 720;
export const DESIGN_MIN_H = 1280;
export const DESIGN_MAX_H = 1600;

/** Cap the backing-store size: phones report DPR 3+, which quadruples fill cost for no visible gain. */
const MAX_RESOLUTION = 2;
const MAX_BACKING_HEIGHT = 2400;

export interface GameEvents {
  resize: { w: number; h: number };
  /** Tab hidden/shown, or an ad overlay took focus. Audio and the sim must stop while hidden. */
  visibility: { visible: boolean };
  /** First trusted pointer/keyboard gesture — the moment WebAudio may be unlocked. */
  firstInput: null;
}

export type UpdateFn = (dt: number) => void;

export class Game {
  readonly events = new Emitter<GameEvents>();
  app!: Application;

  /** Everything lives under `root`, which is scaled from design units to CSS pixels. */
  readonly root = new Container();
  /** Receives screen-shake offsets; holds only the scene so popups and HUD overlays stay rock steady. */
  readonly shakeLayer = new Container();
  readonly sceneLayer = new Container();
  readonly popupLayer = new Container();
  /** Toasts, flying currency, full-screen flashes. */
  readonly overlayLayer = new Container();
  readonly transitionLayer = new Container();

  w = DESIGN_W;
  h = DESIGN_MIN_H;
  scale = 1;
  /** Safe-area insets (notch / home indicator) in design units. */
  safeTop = 0;
  safeBottom = 0;

  /** Seconds since boot, unscaled, stops while the tab is hidden. */
  time = 0;
  frame = 0;
  visible = true;

  shakeEnabled = true;
  /** User setting: 1 full, 0.35 reduced motion, 0 off. Multiplies every shake offset. */
  shakeScale = 1;
  private trauma = 0;
  private shakeTarget: Container | null = null;
  private shakeSeed = Math.random() * 1000;

  /**
   * Whether tab visibility pauses the game. Hosts that deliver their own pause/resume signals and
   * forbid the Page Visibility API (YouTube Playables) set this to false and drive
   * setExternalPause() instead.
   */
  pauseOnHidden = true;

  private updaters: UpdateFn[] = [];
  private gotFirstInput = false;
  private externalPause = 0;

  async init(parent: HTMLElement): Promise<void> {
    const app = new Application();
    await app.init({
      width: DESIGN_W,
      height: DESIGN_MIN_H,
      backgroundColor: 0xa06a33,
      antialias: true,
      autoDensity: true,
      resolution: 1,
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    this.app = app;
    parent.appendChild(app.canvas);
    app.canvas.style.touchAction = 'none';
    app.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.shakeLayer.addChild(this.sceneLayer);
    this.root.addChild(this.shakeLayer, this.popupLayer, this.overlayLayer, this.transitionLayer);
    app.stage.addChild(this.root);
    app.stage.eventMode = 'static';

    this.layout();
    window.addEventListener('resize', () => this.layout());
    window.addEventListener('orientationchange', () => this.layout());
    window.visualViewport?.addEventListener('resize', () => this.layout());

    document.addEventListener('visibilitychange', () => this.refreshVisibility());
    window.addEventListener('pagehide', () => this.refreshVisibility());
    window.addEventListener('pageshow', () => this.refreshVisibility());

    const first = () => {
      if (this.gotFirstInput) return;
      this.gotFirstInput = true;
      window.removeEventListener('pointerdown', first, true);
      window.removeEventListener('keydown', first, true);
      this.events.emit('firstInput', null);
    };
    window.addEventListener('pointerdown', first, true);
    window.addEventListener('keydown', first, true);

    app.ticker.add((ticker) => {
      // Clamp so a long hitch (tab switch, GC) can never teleport the simulation.
      const dt = Math.min(ticker.deltaMS / 1000, 0.05);
      this.tick(dt);
    });
  }

  /** Register a per-frame callback (seconds). Returns an unsubscribe function. */
  onUpdate(fn: UpdateFn): () => void {
    this.updaters.push(fn);
    return () => {
      const i = this.updaters.indexOf(fn);
      if (i >= 0) this.updaters.splice(i, 1);
    };
  }

  /**
   * Add screen-shake "trauma" in [0,1]. Offset scales with trauma squared, so small hits barely
   * register while stacked big hits get violent, and it always decays smoothly. Rough guide:
   * 0.25 crit / elite death, 0.4 merge / epic, 0.6 legendary / wave clear, 0.8 boss, 1.0 mythic.
   */
  shake(amount: number): void {
    if (!this.shakeEnabled || this.shakeScale <= 0) return;
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  /**
   * Redirect shake offsets to `target` (a container whose resting position is 0,0), or back to
   * the whole scene with null. The battle scene points this at its playfield so the HUD, which
   * must stay readable, never moves.
   */
  setShakeTarget(target: Container | null): void {
    (this.shakeTarget ?? this.shakeLayer).position.set(0, 0);
    this.shakeTarget = target;
  }

  /**
   * Ads and platform overlays call this to freeze the game without touching the tab's real
   * visibility. Calls nest; each pause(true) must be matched by a pause(false).
   */
  setExternalPause(paused: boolean): void {
    this.externalPause = Math.max(0, this.externalPause + (paused ? 1 : -1));
    this.refreshVisibility();
  }

  get hasFirstInput(): boolean {
    return this.gotFirstInput;
  }

  private refreshVisibility(): void {
    const tabVisible = !this.pauseOnHidden || document.visibilityState === 'visible';
    const visible = tabVisible && this.externalPause === 0;
    if (visible === this.visible) return;
    this.visible = visible;
    if (visible) this.app.ticker.start();
    else this.app.ticker.stop();
    this.events.emit('visibility', { visible });
  }

  private tick(dt: number): void {
    this.time += dt;
    this.frame++;
    uiTweens.update(dt);
    for (const fn of this.updaters.slice()) fn(dt);

    const target = this.shakeTarget ?? this.shakeLayer;
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * this.shakeScale;
      const t = this.time * 38 + this.shakeSeed;
      // Two detuned sines per axis: cheap, smooth, and non-repeating enough to read as noise.
      const nx = Math.sin(t * 1.13) * 0.6 + Math.sin(t * 2.71 + 1.3) * 0.4;
      const ny = Math.sin(t * 1.37 + 4.1) * 0.6 + Math.sin(t * 2.29 + 0.7) * 0.4;
      // 18 px is the ceiling for a phone-sized portrait screen; full trauma fades in about 0.65 s.
      const max = 18;
      target.position.set(nx * max * s, ny * max * s);
      this.trauma = Math.max(0, this.trauma - dt * 1.55);
    } else if (target.x !== 0 || target.y !== 0) {
      target.position.set(0, 0);
    }
  }

  private layout(): void {
    const vv = window.visualViewport;
    const vw = Math.max(1, Math.floor(vv?.width ?? window.innerWidth));
    const vh = Math.max(1, Math.floor(vv?.height ?? window.innerHeight));

    // Fit width first; let height flex inside the supported range; letterbox whatever is left over.
    let scale = vw / DESIGN_W;
    let h = vh / scale;
    if (h < DESIGN_MIN_H) {
      // Viewport wider than 9:16 (desktop, tablets, landscape): fit height and pillarbox.
      h = DESIGN_MIN_H;
      scale = vh / DESIGN_MIN_H;
    } else if (h > DESIGN_MAX_H) {
      h = DESIGN_MAX_H;
    }
    h = Math.round(h);

    const cssW = Math.round(DESIGN_W * scale);
    const cssH = Math.round(h * scale);
    const dpr = window.devicePixelRatio || 1;
    const resolution = Math.max(1, Math.min(dpr, MAX_RESOLUTION, MAX_BACKING_HEIGHT / cssH));

    this.app.renderer.resolution = resolution;
    this.app.renderer.resize(cssW, cssH);
    this.app.canvas.style.width = cssW + 'px';
    this.app.canvas.style.height = cssH + 'px';
    this.root.scale.set(scale);
    this.app.stage.hitArea = new Rectangle(0, 0, cssW, cssH);

    this.scale = scale;
    this.w = DESIGN_W;
    this.h = h;
    this.readSafeArea(scale);
    this.events.emit('resize', { w: this.w, h: this.h });
  }

  private readSafeArea(scale: number): void {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;' +
      'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const top = parseFloat(cs.paddingTop) || 0;
    const bottom = parseFloat(cs.paddingBottom) || 0;
    probe.remove();
    // Insets only matter when the canvas actually reaches that screen edge.
    const canvasRect = this.app.canvas.getBoundingClientRect();
    const reachesTop = canvasRect.top <= top;
    const reachesBottom = canvasRect.bottom >= window.innerHeight - bottom;
    this.safeTop = reachesTop ? Math.ceil((top - Math.max(0, canvasRect.top)) / scale) : 0;
    this.safeBottom = reachesBottom ? Math.ceil(bottom / scale) : 0;
  }
}

export const game = new Game();
