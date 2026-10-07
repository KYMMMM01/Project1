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
import { FIELD_W, LANE_WIDTH, PATH_BOTTOM, PATH_LEFT, PATH_RIGHT, PATH_TOP } from '@/game/geometry';
import type { BattleContext, BattleLayout, HudAnchor, HudPart } from '../context';
import { BossBar } from './BossBar';
import { BottomPanel } from './BottomPanel';
import type { Weighted } from './bubbleMath';
import { EnvImpl } from './env';
import { HintBubble } from './HintBubble';
import { Hints, onScreen } from './hints';
import { LaserGuide } from './LaserGuide';
import { LaserTeach } from './laserTeach';
import { PauseMenu, type PauseAction } from './popups/PauseMenu';
import { SummonPickPopup } from './popups/SummonPickPopup';
import { stageHeldFor } from '@/view/staging';
import { findTwins } from './planMath';
import { canOpenPause, REVIVE_MIN_WAVES, revealFlags } from './policy';
import { canOfferContinue, openContinue, type DefeatReason } from './screens/ContinueScreen';
import { RelicScreen } from './screens/RelicScreen';
import { openResult, type ResultHandle } from './screens/ResultScreen';
import { openSettings } from './screens/SettingsScreen';
import { ensureSettings } from './settings';
import { TopBar } from './TopBar';
import { Tutorial } from './Tutorial';

/** Frames to wait for the field to draw a new cat before the pair hint gives up on it. */
const TWINS_WAIT = 90;

/** Seconds no hint bubble comes up after a banner or caption has taken the top of the screen. */
const BANNER_HOLD = 2.6;
/** How much a bubble covering the enemy lane costs next to covering a cat (3) or a pill (1.2): enough to pick the other side when it is free. */
const LANE_WEIGHT = 1.5;

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
  private bubble!: HintBubble;
  private top!: TopBar;
  private boss!: BossBar;
  private bottom!: BottomPanel;
  private tutorial: Tutorial | null = null;
  private guide: LaserGuide | null = null;
  private readonly teach: LaserTeach;
  private relic: RelicScreen | null = null;
  private pick: SummonPickPopup | null = null;
  private result: ResultHandle | null = null;
  private offLang: () => void;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.repeat && this.env.modalCount === 0) void this.openPause();
  };
  private summons = 0;
  /** Waiting to point the first-time "merge identical cats" bubble at a pair, once the field has drawn it. */
  private twinsFrames = 0;
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
    // A sandbox run skips the laser's guided first use unless the debug route asks for it (?laserguide=1).
    this.teach = new LaserTeach(!ctx.run.sandbox, !ctx.run.sandbox || new URLSearchParams(window.location.search).get('laserguide') === '1');
    this.root.eventMode = 'passive';
    ctx.layers.hud.addChild(this.root);
    this.build();
    window.addEventListener('keydown', this.onKey);
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
    this.env = new EnvImpl(ctx, reveal, this.hints, this.root, this.teach);
    const env = this.env;
    this.top = new TopBar(env);
    this.bottom = new BottomPanel(env);
    this.boss = new BossBar(env, this.top);
    this.root.addChild(this.top.root, this.bottom.root, this.boss.root);
    this.top.pauseBtn.onTap(() => void this.openPause());
    this.layoutAll(ctx.layout);
    this.bubble = new HintBubble(env, ctx.layers.overlay);
    this.hints.bind({ bubble: this.bubble, avoid: () => this.avoidList() });
    env.explainAt = (command) => this.explainTarget(command);

    if (env.tutorial) {
      this.tutorial = new Tutorial(env, () => {
        // getBounds() is in screen pixels: both corners go through the HUD's own transform.
        const b = this.bottom.actions.summon.btn.getBounds();
        const tl = env.toHud(new Point(b.x, b.y));
        const br = env.toHud(new Point(b.x + b.width, b.y + b.height));
        return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      }, (on) => this.bottom.actions.summon.attention(on));
    }

    if (!env.tutorial && reveal.laser) {
      const laser = this.bottom.actions.laser;
      this.guide = new LaserGuide(env, () => {
        // getBounds() is in screen pixels: both corners go through the HUD's own transform.
        const b = laser.getBounds();
        const tl = env.toHud(new Point(b.x, b.y));
        const br = env.toHud(new Point(b.x + b.width, b.y + b.height));
        return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
      });
      this.bottom.actions.onExplained = () => this.guide?.explained();
    }

    const battle = ctx.battle;
    env.on(ctx.events, 'refused', ({ command, fail }) => {
      if (command === 'summon' && fail === 'not_enough_fish') return;
      env.explain(command, fail);
    });
    env.on(ctx.events, 'drag', ({ from }) => (this.dragging = from !== null));
    env.on(ctx.events, 'finished', ({ victory }) => this.onFinished(victory));
    env.on(battle.events, 'summonOffer', ({ options }) => this.openPick(options));
    env.on(battle.events, 'relicOffer', () => {
      // The boss-defeated banner that this offer follows gets to finish first; the field is frozen under it meanwhile.
      const wait = stageHeldFor();
      if (wait > 0 && !this.relic) ctx.ui.call(wait, () => this.showRelics());
      else this.showRelics();
    });
    env.on(battle.events, 'defeat', ({ reason }) => (this.defeatReason = reason));
    // A banner or caption is about to take the top of the screen: a hint waits until it has gone.
    for (const type of ['waveStart', 'synergy', 'relicGain', 'actClear', 'bossAbility', 'hazardWarn', 'enrage', 'rescued'] as const) {
      env.on(battle.events, type, () => env.hints.hold(BANNER_HOLD));
    }
    env.on(battle.events, 'laser', () => env.hints.used('laser'));
    env.on(battle.events, 'upgrade', ({ kind }) => {
      if (kind === 'summon') env.hints.used('grade');
    });
    env.on(battle.events, 'sell', () => env.hints.used('sell'));
    env.on(battle.events, 'molt', () => env.hints.used('molt'));
    env.on(battle.events, 'awaken', () => env.hints.used('awaken'));
    env.on(ctx.events, 'speed', () => env.hints.used('speed'));
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
    // Outside the tutorial (which teaches the merge itself) the first pair of identical cats earns one bubble.
    if (!env.tutorial && !env.hints.has('twins')) {
      for (const type of ['summon', 'move', 'swap', 'merge', 'molt', 'awaken'] as const) env.on(battle.events, type, () => (this.twinsFrames = TWINS_WAIT));
    }

    // A restored run may be waiting on a choice.
    const pending = battle.pending;
    if (pending?.kind === 'summon') this.openPick(pending.options);
    else if (pending?.kind === 'relic') this.showRelics();
  }

  private teardown(): void {
    this.tutorial?.destroy();
    this.tutorial = null;
    this.guide?.destroy();
    this.guide = null;
    this.hints.bind(null);
    this.bubble.destroy();
    this.env.dispose();
    this.top.destroy();
    this.bottom.destroy();
    this.boss.destroy();
  }

  /** Rectangles a hint bubble should not cover: the cats, the summon button, the enemy preview and the chips. */
  private avoidList(): Weighted[] {
    const out: Weighted[] = [];
    const add = (c: Container, weight: number): void => {
      if (onScreen(c)) out.push({ ...this.bubble.boundsOf(c), weight });
    };
    add(this.top.previewLayer, 2);
    add(this.top.waveLabel, 2);
    add(this.bottom.classes.root, 1.5);
    add(this.bottom.currency.fish, 1.2);
    add(this.bottom.currency.purr, 1.2);
    add(this.bottom.actions.summon, 3);
    add(this.bottom.actions.laser, 1);
    add(this.bottom.actions.util, 1);
    // The call button is an offer that comes and goes: a bubble over it hides the one thing the player may want to press.
    add(this.bottom.actions.callBtn, 2.5);
    for (const u of this.ctx.battle.units) {
      const view = u ? this.ctx.unitView(u.uid) : null;
      if (view) add(view, 3);
    }
    // The enemy lane runs round the board: a bubble over it hides the enemies the player has to watch.
    const { fieldX, fieldY } = this.ctx.layout;
    const half = LANE_WIDTH / 2;
    const side = PATH_BOTTOM - PATH_TOP;
    out.push(
      { x: fieldX, y: fieldY + PATH_TOP - half, w: FIELD_W, h: LANE_WIDTH, weight: LANE_WEIGHT },
      { x: fieldX, y: fieldY + PATH_BOTTOM - half, w: FIELD_W, h: LANE_WIDTH, weight: LANE_WEIGHT },
      { x: fieldX + PATH_LEFT - half, y: fieldY + PATH_TOP, w: LANE_WIDTH, h: side, weight: LANE_WEIGHT },
      { x: fieldX + PATH_RIGHT - half, y: fieldY + PATH_TOP, w: LANE_WIDTH, h: side, weight: LANE_WEIGHT },
    );
    return out;
  }

  /** The control a refusal is about; null when the command lives in a popup (its toast shows above it). */
  private explainTarget(command: string): Container | null {
    switch (command) {
      case 'summon':
        return this.bottom.actions.summon.btn;
      case 'upgradeSummon':
        return this.bottom.actions.grade;
      case 'callNextWave':
        return this.bottom.actions.callBtn;
      case 'laser':
        return this.bottom.actions.laser;
      case 'awaken':
      case 'sell':
        return this.bottom.sheet.buttonFor(command);
      default:
        return null;
    }
  }

  private layoutAll(l: BattleLayout): void {
    this.top.layout(l);
    this.bottom.layout(l);
    this.boss.layout();
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

  /** Ask for the "identical cats merge" bubble on one cat of the first pair, as soon as that cat has a view. */
  private pointAtTwins(): void {
    const units = this.ctx.battle.units;
    const pair = findTwins(units);
    if (!pair) {
      this.twinsFrames = 0;
      return;
    }
    const view = this.ctx.unitView((units[pair[0]] as NonNullable<(typeof units)[number]>).uid);
    const other = this.ctx.unitView((units[pair[1]] as NonNullable<(typeof units)[number]>).uid);
    if (!view || !other) {
      this.twinsFrames--;
      return;
    }
    this.twinsFrames = 0;
    // The one hint that explains the merge rule goes before whatever else is waiting; it points at both cats of the pair.
    this.env.hints.request('twins', view, false, true, other);
  }

  // ───────────────────────── pause ─────────────────────────

  private async openPause(): Promise<void> {
    if (this.pauseOpen || this.destroyed || !canOpenPause(this.ctx.battle.phase, this.ending)) return;
    this.pauseOpen = true;
    this.ctx.setPaused('user', true);
    this.afterPause(await this.pauseMenu());
  }

  private pauseMenu(): Promise<PauseAction> {
    // An enemy card the player left open must not stay on top of the menu (the kit's tooltip layer is above popups).
    tooltip.hide();
    return popups.open(new PauseMenu(this.env));
  }

  private afterPause(action: PauseAction): void {
    if (this.destroyed) return;
    if (action === 'settings') {
      openSettings(() => {
        if (this.destroyed) return;
        void this.pauseMenu().then((a) => this.afterPause(a));
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
    this.guide?.resize(layout);
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
    this.tutorial?.update(dt);
    if (this.twinsFrames > 0) this.pointAtTwins();
    // A choice resolved from outside (a bot, a restored run) must not leave its popup behind.
    if (this.pick && !this.pick.picking && this.env.battle.pending?.kind !== 'summon') this.pick.close();
    // A bubble never shows over a popup, a staged moment or a drag; while a cat is selected only the selection bar's own hints may.
    const quiet =
      !this.ctx.paused && this.env.modalCount === 0 && !this.dragging && !this.pauseOpen && !this.ending && !(this.tutorial?.flow.holding ?? false);
    this.hints.update(dt, quiet, this.ctx.selected !== null);
    this.guide?.update(dt, !quiet);
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('keydown', this.onKey);
    this.offLang();
    this.teardown();
    this.relic?.destroy();
    this.relic = null;
    this.result?.destroy();
    this.result = null;
    this.hints.destroy();
    this.teach.destroy();
    popups.closeAll();
    clearToasts();
    tooltip.hide();
    for (const reason of ['user', 'tutorial', 'popup'] as const) this.ctx.setPaused(reason, false);
    this.root.destroy({ children: true });
  }
}
