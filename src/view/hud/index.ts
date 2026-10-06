/**
 * Battle HUD: everything around the field plus the popups and screens that belong to a run. Built
 * from the shared contract (../context.ts) only; read-outs follow simulation events, bars and
 * timers follow the frame clock. See docs/handoff/hud.md.
 */
import './strings';
import { Container, Point } from 'pixi.js';
import { i18nEvents } from '@/core/i18n';
import { clearToasts, popups, tooltip } from '@/ui';
import type { UnitId } from '@/game';
import type { BattleContext, BattleLayout, HudAnchor, HudPart } from '../context';
import { BossBar } from './BossBar';
import { BottomPanel } from './BottomPanel';
import { EnvImpl } from './env';
import { Hints } from './hints';
import { PauseMenu, type PauseAction } from './popups/PauseMenu';
import { SummonPickPopup } from './popups/SummonPickPopup';
import { REVIVE_MIN_WAVES, revealFlags } from './policy';
import { canOfferContinue, openContinue, type DefeatReason } from './screens/ContinueScreen';
import { RelicScreen } from './screens/RelicScreen';
import { openResult, type ResultHandle } from './screens/ResultScreen';
import { openSettings } from './screens/SettingsScreen';
import { ensureSettings } from './settings';
import { TopBar } from './TopBar';
import { Tutorial } from './Tutorial';

/** Simulated seconds a single frame can never exceed (3x speed, 0.05 s frame cap, hit-stop aside): a bigger step means skipped events. */
const RESYNC_JUMP = 0.5;

/** Entry point of the HUD part. */
export function createHud(ctx: BattleContext): HudPart {
  return new Hud(ctx);
}

class Hud implements HudPart {
  private readonly root = new Container();
  private readonly hints: Hints;
  private env!: EnvImpl;
  private top!: TopBar;
  private boss!: BossBar;
  private bottom!: BottomPanel;
  private tutorial: Tutorial | null = null;
  private relic: RelicScreen | null = null;
  private pick: SummonPickPopup | null = null;
  private result: ResultHandle | null = null;
  private offLang: () => void;
  private summons = 0;
  private lastTime = 0;
  private dragging = false;
  private pauseOpen = false;
  private ending = false;
  private abandoned = false;
  private defeatReason: DefeatReason = null;
  private destroyed = false;

  constructor(private readonly ctx: BattleContext) {
    void ensureSettings();
    this.hints = new Hints(!ctx.run.sandbox);
    this.root.eventMode = 'passive';
    ctx.layers.hud.addChild(this.root);
    this.build();
    // A language switch rebuilds every label; the handler that changed it must finish first.
    this.offLang = i18nEvents.on('change', () =>
      queueMicrotask(() => {
        if (this.destroyed) return;
        this.teardown();
        this.build();
      }),
    );
  }

  // ───────────────────────── build / teardown ─────────────────────────

  private build(): void {
    const ctx = this.ctx;
    const reveal = revealFlags(ctx.run.runsPlayed);
    this.env = new EnvImpl(ctx, reveal, this.hints, this.root);
    const env = this.env;
    this.top = new TopBar(env);
    this.bottom = new BottomPanel(env);
    this.boss = new BossBar(env);
    this.root.addChild(this.top.root, this.bottom.root, this.boss.root);
    this.top.pauseBtn.onTap(() => void this.openPause());
    this.layoutAll(ctx.layout);

    if (env.tutorial) {
      this.tutorial = new Tutorial(env, () => {
        // getBounds() is in screen pixels: both corners go through the HUD's own transform.
        const b = this.bottom.actions.summon.btn.getBounds();
        const tl = env.toHud(new Point(b.x, b.y));
        const br = env.toHud(new Point(b.x + b.width, b.y + b.height));
        return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      });
    }

    const battle = ctx.battle;
    env.on(ctx.events, 'refused', ({ command, fail }) => {
      if (command === 'summon' && fail === 'not_enough_fish') return;
      env.explain(command, fail);
    });
    env.on(ctx.events, 'drag', ({ from }) => (this.dragging = from !== null));
    env.on(ctx.events, 'finished', ({ victory }) => this.onFinished(victory));
    env.on(battle.events, 'summonOffer', ({ options }) => this.openPick(options));
    env.on(battle.events, 'relicOffer', () => this.showRelics());
    env.on(battle.events, 'defeat', ({ reason }) => (this.defeatReason = reason));
    env.on(battle.events, 'waveStart', ({ wave }) => {
      if (wave >= 1 && env.reveal.speed) env.hints.request('speed', this.top.speedBtn);
      if (wave >= 2 && env.reveal.preview) env.hints.request('preview', this.top.previewLayer);
    });
    env.on(battle.events, 'sunbeams', () => {
      if (battle.wave > 1) env.hints.request('sun', this.top.waveLabel);
    });
    env.on(battle.events, 'summon', () => {
      if (++this.summons >= 3 && env.reveal.odds) env.hints.request('odds', this.bottom.currency.root);
    });

    // A restored run may be waiting on a choice.
    const pending = battle.pending;
    if (pending?.kind === 'summon') this.openPick(pending.options);
    else if (pending?.kind === 'relic') this.showRelics();
  }

  private teardown(): void {
    this.tutorial?.destroy();
    this.tutorial = null;
    this.env.dispose();
    this.top.destroy();
    this.bottom.destroy();
    this.boss.destroy();
  }

  private layoutAll(l: BattleLayout): void {
    this.top.layout(l);
    this.bottom.layout(l);
    this.boss.layout(l);
  }

  // ───────────────────────── choices ─────────────────────────

  private openPick(options: readonly UnitId[]): void {
    if (this.pick) return;
    const guide = this.tutorial?.guidingPick ?? false;
    const popup = new SummonPickPopup(this.env, options, guide);
    this.pick = popup;
    void this.env.modal(popup).then(() => {
      if (this.pick === popup) this.pick = null;
    });
  }

  private showRelics(): void {
    if (this.relic) {
      this.relic.render();
      return;
    }
    this.relic = new RelicScreen(this.env, () => (this.relic = null));
  }

  // ───────────────────────── pause ─────────────────────────

  private async openPause(): Promise<void> {
    if (this.pauseOpen || this.ending || this.destroyed) return;
    this.pauseOpen = true;
    this.ctx.setPaused('user', true);
    const action = await popups.open(new PauseMenu(this.env));
    this.afterPause(action);
  }

  private afterPause(action: PauseAction): void {
    if (this.destroyed) return;
    if (action === 'settings') {
      openSettings(() => {
        if (this.destroyed) return;
        void popups.open(new PauseMenu(this.env)).then((a) => this.afterPause(a));
      });
      return;
    }
    this.pauseOpen = false;
    this.ctx.setPaused('user', false);
    if (action === 'restart') {
      this.ctx.retry();
    } else if (action === 'quit') {
      this.abandoned = true;
      this.ending = true;
      this.ctx.battle.abandon();
      this.showResult(false);
    }
  }

  // ───────────────────────── end of run ─────────────────────────

  private onFinished(victory: boolean): void {
    if (this.ending || this.destroyed) return;
    this.ending = true;
    const env = this.env;
    const waves = this.ctx.battle.getStats().wavesCleared;
    const mayContinue = env.sandbox || (this.ctx.run.runsPlayed >= 1 && waves >= REVIVE_MIN_WAVES);
    if (!victory && !this.abandoned && mayContinue && canOfferContinue(env)) {
      openContinue(env, this.defeatReason, (continued) => {
        if (this.destroyed) return;
        if (continued) this.ending = false;
        else this.showResult(false);
      });
      return;
    }
    this.showResult(victory);
  }

  private showResult(victory: boolean): void {
    this.result?.destroy();
    this.result = openResult(this.env, victory, this.abandoned, {
      retry: () => this.ctx.retry(),
      exit: () => this.ctx.exit(),
    });
  }

  // ───────────────────────── part interface ─────────────────────────

  anchor(name: HudAnchor): { x: number; y: number } {
    switch (name) {
      case 'fish':
      case 'purr':
        return this.bottom.currency.iconCentre(name);
      case 'enemyGauge':
        return this.top.anchorOf('enemyGauge');
      case 'wave':
        return this.top.anchorOf('wave');
      case 'relics':
        return this.top.anchorOf('relics');
      case 'summon':
        return this.env.centreOf(this.bottom.actions.summon.btn);
      case 'laser':
        return this.env.centreOf(this.bottom.actions.laser);
    }
  }

  resize(layout: BattleLayout): void {
    this.layoutAll(layout);
    this.tutorial?.resize(layout);
  }

  update(dt: number): void {
    // The simulation clock jumped further than any frame can move it: events were skipped, so re-read everything.
    const time = this.env.battle.time;
    if (time - this.lastTime > RESYNC_JUMP) {
      this.top.invalidate();
      this.bottom.invalidate();
    }
    this.lastTime = time;
    this.top.update();
    this.boss.update();
    this.bottom.update(dt);
    this.tutorial?.update();
    // A choice resolved from outside (a bot, a restored run) must not leave its popup behind.
    if (this.pick && this.env.battle.pending?.kind !== 'summon') this.pick.close();
    const quiet = this.env.modalCount === 0 && !this.dragging && !this.pauseOpen && !this.ending && !(this.tutorial?.flow.holding ?? false);
    this.hints.update(dt, quiet);
  }

  destroy(): void {
    this.destroyed = true;
    this.offLang();
    this.teardown();
    this.relic?.destroy();
    this.relic = null;
    this.result?.destroy();
    this.result = null;
    this.hints.destroy();
    popups.closeAll();
    clearToasts();
    tooltip.hide();
    for (const reason of ['user', 'tutorial', 'popup'] as const) this.ctx.setPaused(reason, false);
    this.root.destroy({ children: true });
  }
}
