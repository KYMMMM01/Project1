import { Container } from 'pixi.js';
import { game } from '@/core/game';
import { Emitter } from '@/core/events';
import { Scene, scenes } from '@/core/scene';
import { Tweener } from '@/core/tween';
import { Fx, createHitStop } from '@/fx';
import { createBattle, type BattleApi, type Fail } from '@/game';
import { clearToasts, popups } from '@/ui';
import type {
  BattleContext,
  BattleLayers,
  BattleLayout,
  BattleUiEvents,
  DirectorPart,
  FieldPart,
  HudAnchor,
  HudPart,
  PauseReason,
  RunConfig,
} from '@/view/context';
import { createDirector } from '@/view/director';
import { BattleClock } from '@/view/field/clock';
import { createField } from '@/view/field';
import { createHud } from '@/view/hud';
import { computeBattleLayout } from '@/view/layout';
import { BootScene } from './BootScene';

let exitScene: (() => Scene) | null = null;
let createdHook: ((scene: BattleScene) => void) | null = null;

/**
 * Where "leave the battle" goes. The home scene registers itself here; until then the battle
 * returns to the boot screen. Pass null to clear.
 */
export function setBattleExit(make: (() => Scene) | null): void {
  exitScene = make;
}

/** Debug builds hook every new battle scene here (the QA route installs `window.__dbg.battle`). */
export function setBattleCreatedHook(fn: ((scene: BattleScene) => void) | null): void {
  createdHook = fn;
}

/** Real seconds the scene waits for the director to announce `finished` before it announces it itself. */
const FINISH_FALLBACK = 8;

/** The shared contract implemented over one running battle: clocks, selection, commands and flow. */
class Context implements BattleContext {
  readonly events = new Emitter<BattleUiEvents>();
  readonly tweens = new Tweener();
  readonly ui = new Tweener();
  readonly fx: Fx;
  layout: BattleLayout;
  selected: number | null = null;
  field: FieldPart | null = null;
  hud: HudPart | null = null;
  readonly clock = new BattleClock();
  private readonly fxClock = { timeScale: 1 };
  private readonly hitStop: ReturnType<typeof createHitStop>;

  constructor(
    readonly battle: BattleApi,
    readonly run: RunConfig,
    readonly layers: BattleLayers,
    layout: BattleLayout,
    private readonly leave: () => void,
    private readonly restart: () => void,
  ) {
    this.layout = layout;
    // Effect presets that ask for a hit-stop go through this clock, so they respect the same caps as everything else.
    // Their own beats (an impact after a charge) run in real time with the particles they time, which the hit-stop does not slow.
    this.hitStop = createHitStop([this.fxClock]);
    this.fx = new Fx(layers.fxFront, this.ui, { freeze: this.hitStop.freeze });
  }

  get speed(): number {
    return this.clock.speed;
  }

  get paused(): boolean {
    return this.clock.paused;
  }

  /** Battle seconds for a real frame of `dt`. */
  advance(dt: number): number {
    return this.clock.tick(dt, this.fxClock.timeScale);
  }

  toSceneX(fieldX: number): number {
    return this.layout.fieldX + fieldX;
  }

  toSceneY(fieldY: number): number {
    return this.layout.fieldY + fieldY;
  }

  unitView(uid: number): Container | null {
    return this.field?.unitView(uid) ?? null;
  }

  enemyView(uid: number): Container | null {
    return this.field?.enemyView(uid) ?? null;
  }

  anchor(name: HudAnchor): { x: number; y: number } {
    return this.hud?.anchor(name) ?? { x: this.layout.w / 2, y: this.layout.safeTop + this.layout.topH / 2 };
  }

  setSpeed(speed: number): void {
    const next = Math.min(3, Math.max(1, Math.round(speed)));
    if (next === this.clock.speed) return;
    this.clock.speed = next;
    this.events.emit('speed', { speed: next });
  }

  setPaused(reason: PauseReason, paused: boolean): void {
    if (this.clock.setPaused(reason, paused)) this.events.emit('pause', { paused: this.clock.paused });
  }

  freeze(ms: number): void {
    this.clock.freeze(ms);
  }

  slowmo(scale: number, ms: number): void {
    this.clock.slowmo(scale, ms);
  }

  select(cell: number | null): void {
    if (cell === this.selected) return;
    this.selected = cell;
    this.events.emit('select', { cell });
  }

  command(name: string, run: () => Fail | null, cell: number | null = null): Fail | null {
    const fail = run();
    if (fail) this.events.emit('refused', { command: name, fail, cell });
    return fail;
  }

  exit(): void {
    this.leave();
  }

  retry(): void {
    this.restart();
  }

  destroy(): void {
    this.hitStop.dispose();
    this.fx.destroy();
    this.tweens.killAll();
    this.ui.killAll();
    this.events.clear();
  }
}

/**
 * One battle. It owns the clock (speed, pause, hit-stop and slow-motion all end up as the battle
 * time passed to the simulation), builds the layer tree, and wires the playfield, the director
 * and the HUD together through the shared context.
 */
export class BattleScene extends Scene {
  readonly battle: BattleApi;
  readonly ctx: BattleContext;
  private readonly context: Context;
  private readonly shakeRoot = new Container();
  private readonly fieldRoot = new Container();
  private readonly field: FieldPart;
  private readonly director: DirectorPart;
  private readonly hud: HudPart;
  private readonly offs: Array<() => void> = [];
  private leaving = false;
  private finish: { victory: boolean; wait: number } | null = null;

  constructor(readonly run: RunConfig) {
    super();
    this.battle = (run.snapshot ? createBattle(run.init, run.snapshot) : null) ?? createBattle(run.init);
    const layers = this.buildLayers();
    const layout = computeBattleLayout(game.w, game.h, game.safeTop, game.safeBottom);
    this.fieldRoot.position.set(layout.fieldX, layout.fieldY);
    this.context = new Context(
      this.battle,
      run,
      layers,
      layout,
      () => this.leave(),
      () => this.restart(),
    );
    this.ctx = this.context;
    game.setShakeTarget(this.shakeRoot);

    this.field = createField(this.ctx);
    this.context.field = this.field;
    this.director = createDirector(this.ctx);
    this.hud = createHud(this.ctx);
    this.context.hud = this.hud;

    this.offs.push(
      game.events.on('visibility', ({ visible }) => this.context.setPaused('system', !visible)),
      this.context.events.on('finished', () => {
        this.finish = null;
      }),
      this.battle.events.on('victory', () => {
        this.finish = { victory: true, wait: FINISH_FALLBACK };
      }),
      this.battle.events.on('defeat', () => {
        this.finish = { victory: false, wait: FINISH_FALLBACK };
      }),
    );
    createdHook?.(this);
  }

  private buildLayers(): BattleLayers {
    const make = (label: string): Container => {
      const c = new Container();
      c.label = label;
      return c;
    };
    const layers: BattleLayers = {
      background: make('background'),
      floor: make('floor'),
      zones: make('zones'),
      enemies: make('enemies'),
      units: make('units'),
      projectiles: make('projectiles'),
      fxBack: make('fxBack'),
      fxFront: make('fxFront'),
      numbers: make('numbers'),
      hud: make('hud'),
      overlay: make('overlay'),
    };
    // Back to front on the shaken field: ground, ground effects, effects behind characters, enemies, cats, shots, effects in front, numbers.
    this.fieldRoot.addChild(layers.floor, layers.zones, layers.fxBack, layers.enemies, layers.units, layers.projectiles, layers.fxFront, layers.numbers);
    this.shakeRoot.addChild(this.fieldRoot);
    this.addChild(layers.background, this.shakeRoot, layers.hud, layers.overlay);
    return layers;
  }

  /** Pause reasons currently held (debug hooks only). */
  pauseReasons(): string[] {
    return this.context.clock.held;
  }

  override resize(w: number, h: number): void {
    const layout = computeBattleLayout(w, h, game.safeTop, game.safeBottom);
    this.context.layout = layout;
    this.fieldRoot.position.set(layout.fieldX, layout.fieldY);
    this.context.events.emit('layout', layout);
    this.field.resize(layout);
    this.director.resize(layout);
    this.hud.resize(layout);
  }

  override update(dt: number): void {
    const ctx = this.context;
    const battleDt = ctx.advance(dt);
    if (battleDt > 0) this.battle.step(battleDt);
    ctx.tweens.update(battleDt);
    ctx.ui.update(dt);
    this.field.update(dt);
    this.director.update(dt);
    this.hud.update(dt);
    // Particles and floating numbers keep real time: hit-stop must not smear them.
    ctx.fx.update(dt);
    this.tickFinish(dt);
  }

  /** The run is over: when nobody announced the end of the staging in time, announce it. */
  private tickFinish(dt: number): void {
    const f = this.finish;
    if (!f) return;
    f.wait -= dt;
    if (f.wait > 0) return;
    this.finish = null;
    this.context.events.emit('finished', { victory: f.victory });
  }

  override exit(): void {
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.hud.destroy();
    this.director.destroy();
    this.field.destroy();
    // The UI kit keeps popups and toasts across scenes; they belong to this battle.
    popups.closeAll();
    clearToasts();
    game.setShakeTarget(null);
    this.context.destroy();
  }

  private leave(): void {
    this.go(exitScene ?? (() => new BootScene()));
  }

  private restart(): void {
    const { run } = this;
    // Sandbox and daily runs keep their seed so a retry reproduces them; everything else gets a new one.
    const keep = run.sandbox || run.init.mode === 'daily';
    const next: RunConfig = {
      init: { ...run.init, seed: keep ? run.init.seed : Math.floor(Math.random() * 0x7fffffff) },
      rugSkin: run.rugSkin,
      fxTheme: run.fxTheme,
      runsPlayed: run.runsPlayed + 1,
      sandbox: run.sandbox,
    };
    this.go(() => new BattleScene(next));
  }

  private go(make: () => Scene): void {
    if (this.leaving) return;
    this.leaving = true;
    void scenes.goto(make, 'iris').then((ok) => {
      if (!ok) this.leaving = false;
    });
  }
}
