/**
 * Shared contract of the battle presentation. Three parts are built independently against it:
 *
 *   field/     what is ON the playfield and how it is touched: background, mat, cells, sunbeams,
 *              hazards, units, enemies, projectiles, zones, laser dot; dragging / tapping; and each
 *              sprite's own motion (idle, attack lunge, hit recoil, spawn, death, merge travel).
 *   director/  everything layered on top in response to simulation events: particles, floating
 *              numbers, sounds, haptics, shake, hit-stop, currency fly-to-HUD, banners, boss intro
 *              and death, the awakening cut-in, danger vignette, music intensity.
 *   hud/       all controls and read-outs around the field plus the battle's popups and screens.
 *
 * The scene (src/scenes/BattleScene.ts) owns the clock: it steps the simulation, applies speed,
 * pause and hit-stop, computes the layout and wires the three parts together through BattleContext.
 * Parts never import each other; they meet only here.
 */
import type { Container } from 'pixi.js';
import type { Emitter } from '@/core/events';
import type { Tweener } from '@/core/tween';
import type { Fx } from '@/fx';
import type { BattleApi, BattleInit, BattleSnapshot, Fail } from '@/game';

/** Everything needed to start (or continue) one run. Built by the meta layer or by a debug URL. */
export interface RunConfig {
  init: BattleInit;
  /** Present when continuing a run after the app was closed. */
  snapshot?: BattleSnapshot;
  /** Cosmetic ids (see meta `profile.equipped`): board mat skin and summon-effect theme. */
  rugSkin: string;
  fxTheme: string;
  /** How many runs the player has finished before this one (drives the staged HUD reveal). */
  runsPlayed: number;
  /** Debug runs skip meta bookkeeping (no rewards, no saves, no ads). */
  sandbox: boolean;
  /**
   * What the won result screen offers as "next" (usually the next chapter). Asked after the run's
   * rewards and unlocks are applied; null or absent means there is nothing to move on to.
   */
  next?: () => NextRun | null;
  /** Whether the same kind of run may start again right now (the gold dungeon takes an entry); absent means always. Asked when the result screen is built. */
  canRetry?: () => boolean;
}

/** The run a victory leads on to, decided by the app flow. */
export interface NextRun {
  chapter: number;
  stake: number;
  /** Leaves this battle and opens that run (through the pre-run page or directly: the flow's call). */
  start(): void;
}

/** Scene-space rectangles (design pixels). Recomputed on resize. */
export interface BattleLayout {
  w: number;
  h: number;
  safeTop: number;
  safeBottom: number;
  /** Top-left of the 720 x 660 field space (see game/geometry.ts) in scene space. */
  fieldX: number;
  fieldY: number;
  /** Area reserved for the top HUD (y from safeTop). */
  topH: number;
  /** Area reserved for the bottom panel (height above safeBottom). */
  bottomH: number;
}

/** Named HUD points other parts aim at (currency flights, pointers). Scene space. */
export type HudAnchor = 'fish' | 'purr' | 'enemyGauge' | 'wave' | 'summon' | 'relics' | 'laser';

export type PauseReason = 'user' | 'popup' | 'tutorial' | 'cutin' | 'system';

export interface BattleUiEvents {
  /** Selected board cell changed (null = nothing selected). */
  select: { cell: number | null };
  layout: BattleLayout;
  speed: { speed: number };
  pause: { paused: boolean };
  /** A command was refused by the simulation; the HUD explains why, the field may shake the unit. */
  refused: { command: string; fail: Fail; cell: number | null };
  /** The player is dragging a unit (from = cell, over = cell under the pointer or -1, sell = over the sell zone). */
  drag: { from: number | null; over: number; sell: boolean };
  /** The run is over and staging has finished: the HUD may show the result flow. */
  finished: { victory: boolean };
}

export interface BattleLayers {
  /** Full-screen background art. */
  background: Container;
  /** Field space containers, back to front. Their origin is the field's top-left corner. */
  floor: Container; // mat, cell tiles, sunbeams, hazards, path decoration
  zones: Container; // ground effects under characters
  enemies: Container;
  units: Container;
  projectiles: Container;
  fxBack: Container; // effects behind characters (rings on the ground, light pillars' base)
  fxFront: Container; // effects over characters
  numbers: Container; // floating numbers
  /** Scene space, never shaken. */
  hud: Container;
  /** Scene space, above the HUD: banners, cut-ins, vignette. */
  overlay: Container;
}

export interface BattleContext {
  readonly battle: BattleApi;
  readonly run: RunConfig;
  readonly layers: BattleLayers;
  readonly events: Emitter<BattleUiEvents>;
  /** Battle-time clock: scaled by game speed, frozen by pause and hit-stop. Use for anything that must stay in step with the simulation. */
  readonly tweens: Tweener;
  /** Real-time clock for HUD and overlay animation. */
  readonly ui: Tweener;
  /** Particle / effect facade bound to fxBack + fxFront (field space). */
  readonly fx: Fx;

  layout: BattleLayout;

  /** Field space <-> scene space. */
  toSceneX(fieldX: number): number;
  toSceneY(fieldY: number): number;

  /** Display objects of live entities (field part provides them; null when not on screen). */
  unitView(uid: number): Container | null;
  enemyView(uid: number): Container | null;
  /** Scene-space position of a HUD anchor (hud part provides them). */
  anchor(name: HudAnchor): { x: number; y: number };

  // ── time ──
  readonly speed: number;
  /** 1, 2 or 3 (3 needs the Butler Pass; the HUD decides what it offers). */
  setSpeed(speed: number): void;
  readonly paused: boolean;
  /** Pauses nest per reason: the battle runs only when no reason is active. */
  setPaused(reason: PauseReason, paused: boolean): void;
  /** Hit-stop: freeze the simulation and battle-time tweens for `ms` of real time (longest request wins). */
  freeze(ms: number): void;
  /** Slow motion: run battle time at `scale` for `ms` of real time, then ease back. */
  slowmo(scale: number, ms: number): void;

  // ── selection ──
  readonly selected: number | null;
  select(cell: number | null): void;

  /**
   * Run a simulation command and report a refusal on `events.refused`. All parts issue commands
   * through this so feedback for failures is uniform. Returns the simulation's answer.
   */
  command(name: string, run: () => Fail | null, cell?: number | null): Fail | null;

  // ── flow ──
  /** Leave the battle (after results, or quitting from pause). */
  exit(): void;
  /** Start a fresh run with the same settings. */
  retry(): void;
}

/** Lifecycle every part implements. */
export interface BattlePart {
  /** Called every rendered frame with real seconds; battle-time work should read ctx.tweens / the sim instead. */
  update(dt: number): void;
  resize(layout: BattleLayout): void;
  destroy(): void;
}

export interface FieldPart extends BattlePart {
  unitView(uid: number): Container | null;
  enemyView(uid: number): Container | null;
}

export interface HudPart extends BattlePart {
  anchor(name: HudAnchor): { x: number; y: number };
}

export type DirectorPart = BattlePart;
