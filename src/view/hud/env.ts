/**
 * What every HUD component is handed: the battle, the contract, the staged-reveal flags and a few
 * shared services (tracked event subscriptions, popup pause bookkeeping, refusal toasts).
 */
import { type Container, Point } from 'pixi.js';
import { Emitter } from '@/core/events';
import { hasString, t } from '@/core/i18n';
import { AWAKEN_MIN_TIER, type BattleApi, type EnemyId, type Fail } from '@/game';
import type { GuideProgress, TopicId } from '@/guide';
import { popups, toast, type Popup } from '@/ui';
import { info } from '../info';
import type { BattleContext, BattleLayout } from '../context';
import type { Hints } from './hints';
import type { LaserTeach } from './laserTeach';
import type { Rect } from './layoutMath';
import { costArgs } from './moltMath';
import { failKeys, type Reveal, type RevealKey } from './policy';
import type { CountKey } from './tutorialScript';

export interface HudEnv {
  readonly ctx: BattleContext;
  readonly battle: BattleApi;
  readonly sandbox: boolean;
  readonly reveal: Reveal;
  /** A control of the screen was revealed (the tutorial brings them in one by one); `fresh` plays its arrival. */
  readonly revealed: Emitter<{ reveal: { key: RevealKey; fresh: boolean } }>;
  /** Where the tutorial's skip button lies in the top row while it is shown (null when it is not): the enemy strip gives way to it. */
  readonly skip: Rect | null;
  /** The skip button came, went or moved. */
  readonly skipChanged: Emitter<{ change: null }>;
  setSkip(rect: Rect | null): void;
  /** What the player has been taught and has read. */
  readonly progress: GuideProgress;
  readonly hints: Hints;
  /** What the player has been taught about the laser (the card's presses, the guided first use). */
  readonly teach: LaserTeach;
  /** True in the tutorial run: forced steps, no offers. */
  readonly tutorial: boolean;
  layout(): BattleLayout;
  /** Subscribe for the lifetime of the HUD. */
  on<E extends object, K extends keyof E>(emitter: Emitter<E>, type: K, fn: (payload: E[K]) => void): void;
  /** Show a modal; the battle stays paused (reason 'popup') while any modal of the HUD is open. */
  modal<R>(popup: Popup<R>): Promise<R>;
  /** Number of modals and full screens currently open. */
  readonly modalCount: number;
  /** Full screens count as modals for the pause bookkeeping. */
  holdPause(): () => void;
  /** Scene-space centre of a display object. */
  centreOf(obj: Container): { x: number; y: number };
  /** A Pixi-global point in HUD (scene) space. */
  toHud(global: Point): { x: number; y: number };
  /** Reveal a control now (no-op when it is already out). */
  showControl(key: RevealKey, fresh?: boolean): void;
  /** The topic the tutorial is teaching right now, or null: a popup shows its words in place of its own sub line. */
  lesson(): TopicId | null;
  /** The tutorial run will teach `topic` (it has not been taught yet and the lessons were not skipped): its popup carries the lesson. */
  lessonOn(topic: TopicId): boolean;
  /** Something the tutorial counts has happened (the class sheet was closed ...). */
  note(key: CountKey): void;
  /** Explain a refused command in plain words, in a bubble on the control that was pressed (a toast when the command lives in a popup). */
  explain(command: string, fail: Fail): void;
  /** Open the codex on this enemy's page; the battle stands still while it is open. */
  openCodex(foe: EnemyId): void;
}

export class EnvImpl implements HudEnv {
  readonly battle: BattleApi;
  readonly sandbox: boolean;
  readonly tutorial: boolean;
  private readonly offs: Array<() => void> = [];
  private holds = 0;
  private readonly tmp = new Point();
  /** The control a command's refusal is about, set by the HUD once its parts exist. */
  explainAt: ((command: string) => Container | null) | null = null;
  /** What the codex link of an enemy bubble does, set by the HUD (which owns the pause bookkeeping). */
  codexAt: ((foe: EnemyId) => void) | null = null;
  /** The tutorial's answers, set while one is running. */
  lessonOf: (() => TopicId | null) | null = null;
  noteTo: ((key: CountKey) => void) | null = null;
  readonly revealed = new Emitter<{ reveal: { key: RevealKey; fresh: boolean } }>();
  readonly skipChanged = new Emitter<{ change: null }>();
  skip: Rect | null = null;

  constructor(
    readonly ctx: BattleContext,
    readonly reveal: Reveal,
    readonly progress: GuideProgress,
    readonly hints: Hints,
    private readonly root: Container,
    readonly teach: LaserTeach,
  ) {
    this.battle = ctx.battle;
    this.sandbox = ctx.run.sandbox;
    this.tutorial = ctx.battle.init.mode === 'tutorial';
  }

  layout(): BattleLayout {
    return this.ctx.layout;
  }

  setSkip(rect: Rect | null): void {
    const same = rect === null ? this.skip === null : this.skip !== null && this.skip.x === rect.x && this.skip.y === rect.y && this.skip.w === rect.w;
    if (same) return;
    this.skip = rect;
    this.skipChanged.emit('change', null);
  }

  on<E extends object, K extends keyof E>(emitter: Emitter<E>, type: K, fn: (payload: E[K]) => void): void {
    this.offs.push(emitter.on(type, fn));
  }

  get modalCount(): number {
    return this.holds;
  }

  holdPause(): () => void {
    this.holds++;
    if (this.holds === 1) this.ctx.setPaused('popup', true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds = Math.max(0, this.holds - 1);
      if (this.holds === 0) this.ctx.setPaused('popup', false);
    };
  }

  modal<R>(popup: Popup<R>): Promise<R> {
    // An enemy card the player left open must not stay on screen under the popup.
    info.close();
    const release = this.holdPause();
    return popups.open(popup).finally(release);
  }

  centreOf(obj: Container): { x: number; y: number } {
    return this.toHud(obj.getGlobalPosition(this.tmp));
  }

  toHud(global: Point): { x: number; y: number } {
    const p = this.root.toLocal(global);
    return { x: p.x, y: p.y };
  }

  showControl(key: RevealKey, fresh = true): void {
    if (this.reveal[key]) return;
    this.reveal[key] = true;
    this.revealed.emit('reveal', { key, fresh });
  }

  lesson(): TopicId | null {
    return this.lessonOf?.() ?? null;
  }

  lessonOn(topic: TopicId): boolean {
    return this.tutorial && !this.progress.skipped && !this.progress.isTaught(topic);
  }

  note(key: CountKey): void {
    this.noteTo?.(key);
  }

  explain(command: string, fail: Fail): void {
    const key = failKeys(command, fail).find((k) => hasString(k));
    const text = key ? t(key, { tier: AWAKEN_MIN_TIER, ...costArgs(this.battle, this.ctx.selected) }) : t('hud.fail.not_available');
    const target = this.explainAt?.(command) ?? null;
    if (!target || !this.hints.explain(target, text)) toast(text, 'warning');
  }

  openCodex(foe: EnemyId): void {
    this.codexAt?.(foe);
  }

  dispose(): void {
    this.explainAt = null;
    this.codexAt = null;
    this.lessonOf = null;
    this.noteTo = null;
    for (const off of this.offs.splice(0)) off();
    if (this.holds > 0) {
      this.holds = 0;
      this.ctx.setPaused('popup', false);
    }
  }
}
