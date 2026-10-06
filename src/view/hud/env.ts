/**
 * What every HUD component is handed: the battle, the contract, the staged-reveal flags and a few
 * shared services (tracked event subscriptions, popup pause bookkeeping, refusal toasts).
 */
import { type Container, Point } from 'pixi.js';
import type { Emitter } from '@/core/events';
import { hasString, t } from '@/core/i18n';
import type { BattleApi, Fail } from '@/game';
import { popups, toast, type Popup } from '@/ui';
import type { BattleContext, BattleLayout } from '../context';
import type { Hints } from './hints';
import { failKeys, type Reveal } from './policy';

export interface HudEnv {
  readonly ctx: BattleContext;
  readonly battle: BattleApi;
  readonly sandbox: boolean;
  readonly reveal: Reveal;
  readonly hints: Hints;
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
  /** Explain a refused command in plain words. */
  explain(command: string, fail: Fail): void;
}

export class EnvImpl implements HudEnv {
  readonly battle: BattleApi;
  readonly sandbox: boolean;
  readonly tutorial: boolean;
  private readonly offs: Array<() => void> = [];
  private holds = 0;
  private readonly tmp = new Point();

  constructor(
    readonly ctx: BattleContext,
    readonly reveal: Reveal,
    readonly hints: Hints,
    private readonly root: Container,
  ) {
    this.battle = ctx.battle;
    this.sandbox = ctx.run.sandbox;
    this.tutorial = ctx.battle.init.mode === 'tutorial';
  }

  layout(): BattleLayout {
    return this.ctx.layout;
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

  explain(command: string, fail: Fail): void {
    const key = failKeys(command, fail).find((k) => hasString(k));
    toast(key ? t(key) : t('hud.fail.not_available'), 'warning');
  }

  dispose(): void {
    for (const off of this.offs.splice(0)) off();
    if (this.holds > 0) {
      this.holds = 0;
      this.ctx.setPaused('popup', false);
    }
  }
}
