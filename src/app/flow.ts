/**
 * The path between the home screen and a battle: pre-run page, run preparation with the meta layer,
 * opening the battle scene, wave-start saves, retry, returning home, and picking a run up again after
 * the app was killed.
 */
import { debugEnabled } from '@/core/debug';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { Scene, scenes, type TransitionKind } from '@/core/scene';
import type { BattleInit, BattleSnapshot } from '@/game';
// The leaf module: the guide's index would pull its whole screen in before the first scene.
import { guideProgress } from '@/guide/progress';
import { bundleParts, errorKey, profile } from '@/meta';
import { BattleScene, setBattleCreatedHook, setBattleExit } from '@/scenes/BattleScene';
import { HomeScene } from '@/scenes/HomeScene';
import { rememberSelection } from '@/screens/battle';
import { playClaim } from '@/screens/battle/claim';
import { services, type StartRunRequest, type TabId } from '@/screens/contract';
import { shell } from '@/screens/shell/controller';
import { continuePrompt } from '@/screens/shell/ContinuePrompt';
import { openPreRun, type PreRunHandle, type SnackChoice } from '@/screens/shell/PreRunScreen';
import '@/screens/shell/strings';
import { confirmDialog, toast } from '@/ui';
import type { NextRun, RunConfig } from '@/view/context';
import { gameplayStart, gameplayStop } from './lifecycle';
import { nextRunPlan } from './nextRun';

const IDLE_POLL_MS = 50;
const IDLE_TRIES = 100;

let preRun: PreRunHandle | null = null;
let retrying = false;

/** Scene factory for the home screen (`tab` defaults to the battle tab). */
export function homeScene(tab?: TabId): () => Scene {
  return () => new HomeScene(tab ? { tab } : {});
}

/** Wire the shell's run launcher and the battle's exit to this flow. Call once at boot. */
export function installFlow(): void {
  shell.setLauncher(startRun);
  setBattleExit(homeScene('battle'));
}

/**
 * What the won result screen offers after this run, asked once the profile has paid it out. `start()` is the home
 * screen's own path (pre-run page with rules and snack offers, the pending-run check, the platform play signals);
 * once that run is opening, the home screen's chapter card follows it.
 */
function nextRunOf(init: BattleInit): () => NextRun | null {
  return () => {
    const last = profile.data.lastRun;
    // The record has to be this battle's own run: a result that was never paid out leads nowhere.
    if (!last || last.mode !== init.mode || last.chapter !== init.chapter || last.stake !== init.stake) return null;
    const plan = nextRunPlan(profile.data.cleared, last);
    if (!plan) return null;
    return { ...plan, start: () => void startRun({ mode: 'chapter', ...plan }, () => rememberSelection(plan)) };
  };
}

/** The gold dungeon takes an entry for every run: another one may start only while the day has one left. */
export function dungeonEntryLeft(): boolean {
  profile.refresh();
  return profile.dungeonView().entriesLeft > 0;
}

function runConfig(init: BattleInit, snapshot?: BattleSnapshot | null): RunConfig {
  return {
    init,
    ...(snapshot ? { snapshot } : {}),
    rugSkin: profile.equipped.rug,
    fxTheme: profile.equipped.fx,
    runsPlayed: profile.data.stats.runs,
    sandbox: false,
    next: nextRunOf(init),
    ...(init.mode === 'gold' ? { canRetry: dungeonEntryLeft } : {}),
  };
}

/** Per-battle wiring that has no setter on the battle scene: platform signals, wave-start saves, retry through the meta layer. */
function onBattleCreated(scene: BattleScene): void {
  const { run, battle, ctx } = scene;
  // QA: the battle's own hooks (`window.__dbg.battle`: win, lose, skipToWave ...) also exist in runs started from the home screen.
  if (debugEnabled()) void import('@/view/field/debug').then((m) => m.installBattleDebug(scene));
  if (run.sandbox) return;
  gameplayStart();
  // A restart prepares the next run while this battle is still on screen for the length of the transition: wave saves are for the run this battle was created for.
  const mine = profile.pendingRun;
  battle.events.on('waveStart', () => {
    if (profile.pendingRun !== mine) return;
    const snapshot = battle.snapshot();
    if (snapshot) void profile.saveSnapshot(snapshot);
  });
  ctx.events.on('finished', () => gameplayStop());
  // The run was reported as stopped when it was lost; a revive plays on.
  battle.events.on('revive', () => gameplayStart());
  ctx.retry = () => void retry(run);
}

/** A battle scene factory that also installs the per-battle wiring (the debug route may have replaced the hook). */
export function battleScene(run: RunConfig): () => Scene {
  return () => {
    setBattleCreatedHook(onBattleCreated);
    return new BattleScene(run);
  };
}

async function gotoWhenIdle(make: () => Scene, kind: TransitionKind): Promise<boolean> {
  for (let i = 0; i < IDLE_TRIES; i++) {
    if (await scenes.goto(make, kind)) return true;
    await new Promise<void>((resolve) => setTimeout(resolve, IDLE_POLL_MS));
  }
  return false;
}

/** Prepare a run with the meta layer (pays the snack, records the pending run) and open the battle. True when it is opening. */
async function begin(request: StartRunRequest, snack: SnackChoice | undefined, beforeSwap?: () => void, onOpened?: () => void): Promise<boolean> {
  const prepared = await profile.prepareRun({
    mode: request.mode,
    ...(request.chapter !== undefined ? { chapter: request.chapter } : {}),
    ...(request.stake !== undefined ? { stake: request.stake } : {}),
    ...(snack ? { snack } : {}),
  });
  if (!prepared.ok) {
    toast(t(errorKey(prepared.error)), 'warning');
    return false;
  }
  const make = battleScene(runConfig(prepared.value));
  const opened = await gotoWhenIdle(() => {
    beforeSwap?.();
    return make();
  }, 'iris');
  if (!opened) await profile.discardPendingRun();
  else onOpened?.();
  return opened;
}

/** Retry from the result screen or restart from the pause menu: the same request, straight into a new run (no pre-run page). */
async function retry(previous: RunConfig): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    const { mode, chapter, stake } = previous.init;
    // A dungeon run takes an entry: with none left nothing is thrown away and nothing starts.
    if (mode === 'gold' && !dungeonEntryLeft()) {
      toast(t('meta.err.limit_reached'), 'warning');
      return;
    }
    // A restart leaves the run in progress as the pending one and a new run cannot be prepared over it: it is thrown away without a reward. After a result nothing is pending and this does nothing.
    await profile.discardPendingRun();
    await begin({ mode, chapter, stake }, undefined);
  } finally {
    retrying = false;
  }
}

/**
 * A tutorial the app was killed in has nothing to continue or pay out (its forced steps are not in a
 * wave save): it is dropped without counting as a run, so a new player gets the tutorial again.
 */
async function dropInterruptedTutorial(): Promise<void> {
  if (profile.pendingRun?.init.mode === 'tutorial') await profile.discardPendingRun();
}

/**
 * Shell.startRun: a run in progress is offered first; the tutorial starts at once; every other mode
 * goes through the pre-run page. Resolves when the battle is opening or the player backed out;
 * `onOpened` runs when the battle is opening.
 */
export async function startRun(request: StartRunRequest, onOpened?: () => void): Promise<void> {
  await dropInterruptedTutorial();
  if (profile.pendingRun) return offerContinue();
  if (request.mode === 'tutorial') {
    await begin(request, undefined, undefined, onOpened);
    return;
  }
  if (preRun) return;
  return new Promise<void>((resolve) => {
    const close = (): void => {
      preRun?.destroy();
      preRun = null;
      resolve();
    };
    preRun = openPreRun(request, {
      start: (snack) =>
        begin(request, snack, () => {
          preRun?.destroy();
          preRun = null;
        }, onOpened).then((opened) => {
          if (opened) resolve();
          return opened;
        }),
      cancel: close,
    });
  });
}

/** The run the app was killed in: continue it, or end it with the rewards earned so far. */
export async function offerContinue(): Promise<void> {
  await dropInterruptedTutorial();
  for (;;) {
    const pending = profile.pendingRun;
    if (!pending) return;
    const resume = await continuePrompt(pending.init.chapter, pending.snapshot?.wave);
    if (resume) {
      const make = battleScene(runConfig(pending.init, pending.snapshot));
      if (!(await gotoWhenIdle(make, 'iris'))) toast(t('meta.err.unavailable'), 'warning');
      return;
    }
    const giveUp = await confirmDialog({
      title: t('shell.cont.giveup.title'),
      message: t('shell.cont.giveup.body'),
      confirmLabel: t('shell.cont.giveup.yes'),
      cancelLabel: t('shell.cont.giveup.no'),
      danger: true,
    });
    if (!giveUp) continue;
    const settled = await profile.settlePendingRun();
    if (!settled.ok) {
      toast(t(errorKey(settled.error)), 'warning');
      return;
    }
    // The profile already holds the rewards: currencies fly to the top bar like any claim, and only cards and chests need a sheet.
    const { gold, bundle } = settled.value;
    const rest = playClaim({ x: game.w / 2, y: game.h / 2 }, bundleParts({ ...bundle, gold: (bundle.gold ?? 0) + gold }), shell);
    toast(t('shell.cont.settled'), 'success');
    shell.refresh();
    if (rest.length > 0) await services.showRewards(rest, t('shell.cont.settled'));
    return;
  }
}

/** The very first scene: the tutorial battle for a brand-new player, the home screen for everyone else. */
export async function chooseFirstScene(): Promise<() => Scene> {
  await dropInterruptedTutorial();
  await guideProgress.load();
  // A player who skipped the tutorial and closed the app during that run is not sent back into it.
  if (!profile.pendingRun && profile.data.stats.runs === 0 && !guideProgress.skipped) {
    const prepared = await profile.prepareRun({ mode: 'tutorial' });
    if (prepared.ok) return battleScene(runConfig(prepared.value));
  }
  return homeScene();
}

/** Chests opened (and paid out) in an earlier session whose reveal never finished: the player has not seen those cards yet. */
async function replayReveals(): Promise<void> {
  if (profile.data.reveals.length === 0 || !(scenes.current instanceof HomeScene)) return;
  // A pile opened in one go is replayed as one opening.
  await services.revealChest([...profile.data.reveals]);
  shell.refresh();
}

/** Called once the first scene is on screen: a reveal cut short last time is shown again, then a left-over run is offered. */
export function afterFirstScene(): void {
  if (!(scenes.current instanceof HomeScene)) return;
  void replayReveals().then(() => (profile.pendingRun ? offerContinue() : undefined));
}
