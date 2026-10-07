/**
 * Battle HUD: everything around the field plus the popups and screens that belong to a run. Built
 * from the shared contract (../context.ts) only; read-outs follow simulation events, bars and
 * timers follow the frame clock. See docs/handoff/hud.md.
 */
import './strings';
import { Container, Point } from 'pixi.js';
import { debugExpose } from '@/core/debug';
import { i18nEvents, t } from '@/core/i18n';
import { closeGuide, GuideProgress, guideProgress, openGuide, topicTeach, type TopicId, type TryControl } from '@/guide';
import { clearToasts, confirmDialog, popups, toast, tooltip } from '@/ui';
import type { UnitId } from '@/game';
import { FIELD_W, LANE_WIDTH, PATH_BOTTOM, PATH_LEFT, PATH_RIGHT, PATH_TOP } from '@/game/geometry';
import type { BattleContext, BattleLayout, HudAnchor, HudPart } from '../context';
import { BossBar } from './BossBar';
import { BottomPanel } from './BottomPanel';
import type { Weighted } from './bubbleMath';
import { watchEncounters } from './encounterWatch';
import { EnvImpl } from './env';
import { HintBubble } from './HintBubble';
import { Hints, onScreen } from './hints';
import { LessonBubble } from './LessonBubble';
import { LaserGuide } from './LaserGuide';
import { LaserTeach } from './laserTeach';
import { PauseMenu, type PauseAction } from './popups/PauseMenu';
import { SummonPickPopup } from './popups/SummonPickPopup';
import { stageHeldFor } from '@/view/staging';
import { findTwins } from './planMath';
import { canOpenPause, REVIVE_MIN_WAVES, revealFlags, type RevealKey } from './policy';
import { canOfferContinue, openContinue, type DefeatReason } from './screens/ContinueScreen';
import { RelicScreen } from './screens/RelicScreen';
import { openResult, type ResultHandle } from './screens/ResultScreen';
import { openSettings } from './screens/SettingsScreen';
import { ensureSettings } from './settings';
import { TopBar } from './TopBar';
import { Tutorial, type TutorialHost } from './Tutorial';
import { revealedBy, STEP_IDS, type Target } from './tutorialScript';
import { topRects, type Rect } from './layoutMath';
import { unionRect } from './bubbleMath';

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
  private readonly progress: GuideProgress;
  private card!: LessonBubble;
  /** "Try it" in the guidebook asked to point at a control: the pause menu stays closed and the control gets a bubble. */
  private tryControl: { control: TryControl; topic: TopicId } | null = null;
  private readonly teach: LaserTeach;
  private relic: RelicScreen | null = null;
  private pick: SummonPickPopup | null = null;
  private result: ResultHandle | null = null;
  private offLang: () => void;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && !e.repeat && this.env.modalCount === 0) void this.openPause();
  };
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
    // A sandbox run keeps what it teaches in memory only.
    this.progress = ctx.run.sandbox ? new GuideProgress(false) : guideProgress;
    this.hints = new Hints(this.progress);
    // A sandbox run skips the laser's guided first use unless the debug route asks for it (?laserguide=1) or it is the tutorial.
    const lessonRun = ctx.battle.init.mode === 'tutorial';
    this.teach = new LaserTeach(!ctx.run.sandbox, !ctx.run.sandbox || lessonRun || new URLSearchParams(window.location.search).get('laserguide') === '1');
    this.root.eventMode = 'passive';
    ctx.layers.hud.addChild(this.root);
    // QA: what the lessons are doing (debug builds only).
    debugExpose('lessons', {
      topic: () => this.tutorial?.topic ?? null,
      left: () => this.tutorial?.script.remaining.map((s) => s.id) ?? [],
      card: () => this.hints.liveId,
      laser: () => this.guide?.flow.step ?? null,
      rectOf: (target: Target) => this.tutorialHost().rectOf(target),
      progress: this.progress,
    });
    this.build();
    window.addEventListener('keydown', this.onKey);
    // What the player has been taught is read from storage a moment after the scene opens; the lessons and the controls that are out
    // depend on it, so a HUD built before it arrived is built once more (nothing has happened yet).
    if (!this.progress.ready) {
      void this.progress.load().then(() => {
        if (this.destroyed) return;
        this.teardown();
        this.build();
      });
    }
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
    // The tutorial run starts with only what its lessons have already brought in; every other run (and a skipped tutorial) shows it all.
    const lessons = ctx.battle.init.mode === 'tutorial' && !this.progress.skipped;
    const taught = new Set<TopicId>(STEP_IDS.filter((id) => this.progress.isTaught(id)));
    const reveal = revealFlags(lessons, revealedBy(taught));
    this.env = new EnvImpl(ctx, reveal, this.progress, this.hints, this.root, this.teach);
    const env = this.env;
    this.top = new TopBar(env);
    this.bottom = new BottomPanel(env);
    this.boss = new BossBar(env, this.top);
    this.root.addChild(this.top.root, this.bottom.root, this.boss.root);
    this.top.pauseBtn.onTap(() => void this.openPause());
    this.layoutAll(ctx.layout);
    this.bubble = new HintBubble(env, ctx.layers.overlay);
    this.card = new LessonBubble(env, ctx.layers.overlay);
    this.hints.bind({
      bubble: this.bubble,
      card: this.card,
      avoid: () => this.avoidList(),
      hold: () => env.holdPause(),
      openGuide: (id) => this.openGuideAt(id, false),
    });
    env.explainAt = (command) => this.explainTarget(command);
    // The tutorial run teaches its own topics (in order, as each control arrives); a card only comes for what it leaves out.
    this.hints.only = lessons ? new Set<TopicId>(['awaken']) : null;

    if (env.tutorial) {
      this.tutorial = new Tutorial(env, this.tutorialHost(), this.progress.skipped);
    }
    // The laser's guided first use: a normal run starts it by itself, the tutorial run when its laser lesson begins.
    const laser = this.bottom.actions.laser;
    this.guide = new LaserGuide(env, () => this.boundsRect(laser), !lessons);
    this.bottom.actions.onExplained = () => this.guide?.explained();
    watchEncounters(env, {
      gauge: this.top.gauge, waveLabel: this.top.waveLabel, previewLayer: this.top.previewLayer, boss: this.boss.root, chips: this.bottom.classes.root,
      floor: ctx.layers.floor,
    });

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
      if (kind === 'summon') env.hints.used('summon_grade');
    });
    env.on(battle.events, 'sell', () => env.hints.used('sell'));
    env.on(battle.events, 'molt', () => env.hints.used('molt'));
    env.on(battle.events, 'awaken', () => env.hints.used('awaken'));
    env.on(ctx.events, 'speed', () => env.hints.used('speed'));
    env.on(battle.events, 'waveStart', ({ wave }) => {
      if (wave >= 1 && env.reveal.speed) env.hints.request('speed', this.top.speedBtn);
      if (wave >= 2 && env.reveal.preview) env.hints.request('preview', this.top.previewLayer);
    });
    // Outside the tutorial (which teaches the merge itself) the first pair of identical cats earns one card.
    if (!lessons && !env.hints.has('merge')) {
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
    this.card.destroy();
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

  // ───────────────────────── tutorial host and the guidebook ─────────────────────────

  /** Scene-space rectangle of a container: getBounds() is in screen pixels, so both corners go through the HUD's own transform. */
  private boundsRect(c: Container): Rect {
    const b = c.getBounds();
    const tl = this.env.toHud(new Point(b.x, b.y));
    const br = this.env.toHud(new Point(b.x + b.width, b.y + b.height));
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
  }

  private rectOfContainer(c: Container): Rect | null {
    return onScreen(c) ? this.boundsRect(c) : null;
  }

  /** What the tutorial needs from the screen: where each thing it points at is, and the few things that are not its own. */
  private tutorialHost(): TutorialHost {
    const previewRect = (): Rect => topRects(this.ctx.layout).preview;
    const control = (target: Target): Container | null => {
      switch (target) {
        case 'summon': return this.bottom.actions.summon.btn;
        case 'gauge': return this.top.gauge;
        case 'chips': return this.bottom.classes.root;
        case 'laser': return this.bottom.actions.laser;
        case 'bossbar': return this.boss.root;
        case 'purr': return this.bottom.currency.purr;
        case 'molt': return this.bottom.sheet.buttonFor('molt');
        case 'sell': return this.bottom.sheet.buttonFor('sell');
        case 'grade': return this.bottom.actions.grade;
        case 'call': return this.bottom.actions.callBtn;
        case 'speed': return this.top.speedBtn;
        default: return null;
      }
    };
    return {
      rectOf: (target) => {
        if (target === 'wave') {
          const label = this.rectOfContainer(this.top.waveLabel);
          return label ? unionRect(label, previewRect()) : null;
        }
        const c = control(target);
        return c ? this.rectOfContainer(c) : null;
      },
      rectOfReveal: (key: RevealKey) => {
        switch (key) {
          case 'chips': {
            // The whole row arrives; the burst opens round the first chip.
            const row = this.rectOfContainer(this.bottom.classes.root);
            return row ? { x: row.x + 20, y: row.y, w: 150, h: row.h } : null;
          }
          case 'preview': return previewRect();
          case 'laser': return this.rectOfContainer(this.bottom.actions.laser);
          case 'purr': return this.rectOfContainer(this.bottom.currency.purr);
          case 'gradeUpgrade': return this.rectOfContainer(this.bottom.actions.grade);
          case 'speed': return this.rectOfContainer(this.top.speedBtn);
          default: return null;
        }
      },
      pulse: (on) => this.bottom.actions.summon.attention(on),
      laserGuided: () => this.teach.guided,
      startLaserGuide: () => this.guide?.arm(),
    };
  }

  /** The guidebook, from the pause menu (`fromPause`: the menu comes back after it) or from a lesson card's "more". The battle stands still meanwhile. */
  private openGuideAt(topic: TopicId | undefined, fromPause: boolean): void {
    if (this.destroyed || (!fromPause && this.pauseOpen)) return;
    if (!fromPause) {
      this.pauseOpen = true;
      this.ctx.setPaused('user', true);
    }
    tooltip.hide();
    openGuide({
      ...(topic ? { topic } : {}),
      progress: this.progress,
      host: { tryControl: (control, id) => (this.tryControl = { control, topic: id }) },
      onClose: () => this.afterGuide(fromPause),
    });
  }

  private afterGuide(fromPause: boolean): void {
    if (this.destroyed) return;
    const tryIt = this.tryControl;
    this.tryControl = null;
    if (fromPause && !tryIt) {
      void this.pauseMenu().then((a) => this.afterPause(a));
      return;
    }
    this.pauseOpen = false;
    this.ctx.setPaused('user', false);
    if (tryIt) this.pointAt(tryIt.control, tryIt.topic);
  }

  /** "Try it": the game goes on and a bubble on the control says what it is for (a toast when the control is not on screen). */
  private pointAt(control: TryControl, topic: TopicId): void {
    const target = this.controlOf(control);
    const text = topicTeach(topic);
    if (!target || !this.env.hints.explain(target, text)) toast(text, 'info');
  }

  private controlOf(control: TryControl): Container | null {
    switch (control) {
      case 'summon': return this.bottom.actions.summon.btn;
      case 'grade': return this.bottom.actions.grade;
      case 'laser': return this.bottom.actions.laser;
      case 'call': return this.bottom.actions.callBtn;
      case 'speed': return this.top.speedBtn;
      case 'chips': return this.bottom.classes.root;
      case 'odds': return this.bottom.currency.root;
      case 'gauge': return this.top.gauge;
      case 'purr': return this.bottom.currency.purr;
      case 'toys': return this.top.toyLayer;
      case 'preview': return this.top.previewLayer;
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
    const popup = new SummonPickPopup(this.env, options, this.env.lessonOn('pick3'));
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
    this.env.hints.request('merge', view, false, true, other);
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
    if (action === 'guide') {
      this.openGuideAt(undefined, true);
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
    if (victory && env.tutorial) {
      void this.tutorialEnd();
      return;
    }
    this.showResult(victory);
  }

  /** The tutorial is won: one note that the guidebook is in the settings, then the result. */
  private async tutorialEnd(): Promise<void> {
    const open = await confirmDialog({
      title: t('guide.end.title'),
      message: t('guide.end.body'),
      confirmLabel: t('guide.end.open'),
      cancelLabel: t('guide.end.go'),
    });
    if (this.destroyed) return;
    if (!open) {
      this.showResult(true);
      return;
    }
    openGuide({ progress: this.progress, onClose: () => !this.destroyed && this.showResult(true) });
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
    // A card that is up holds the battle and counts as a modal itself; it must not make its own stage look busy.
    const cardUp = this.hints.holding;
    const calm = (!this.ctx.paused || cardUp) && this.env.modalCount - (cardUp ? 1 : 0) === 0 && !this.dragging && !this.pauseOpen && !this.ending;
    const lesson = this.tutorial?.active ?? false;
    this.hints.update(dt, calm && !lesson, this.ctx.selected !== null);
    // The tutorial's laser lesson is the guide's own: any other lesson makes the guide wait.
    this.guide?.update(dt, !calm || (lesson && this.tutorial?.topic !== 'laser'));
  }

  destroy(): void {
    this.destroyed = true;
    debugExpose('lessons', null);
    closeGuide();
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
