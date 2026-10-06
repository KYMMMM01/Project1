/**
 * The path between the home screen and a battle: pre-run page, run preparation with the meta layer,
 * opening the battle scene, wave-start saves, retry, returning home, and picking a run up again after
 * the app was killed.
 */
import { t } from '@/core/i18n';
import { Scene, scenes, type TransitionKind } from '@/core/scene';
import type { BattleInit, BattleSnapshot } from '@/game';
import { bundleParts, errorKey, profile } from '@/meta';
import { BattleScene, setBattleCreatedHook, setBattleExit } from '@/scenes/BattleScene';
import { HomeScene } from '@/scenes/HomeScene';
import { services, type StartRunRequest, type TabId } from '@/screens/contract';
import { shell } from '@/screens/shell/controller';
import { openPreRun, type PreRunHandle, type SnackChoice } from '@/screens/shell/PreRunScreen';
import '@/screens/shell/strings';
import { confirmDialog, toast } from '@/ui';
import type { RunConfig } from '@/view/context';
import { gameplayStart, gameplayStop } from './lifecycle';

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

function runConfig(init: BattleInit, snapshot?: BattleSnapshot | null): RunConfig {
  return {
    init,
    ...(snapshot ? { snapshot } : {}),
    rugSkin: profile.equipped.rug,
    fxTheme: profile.equipped.fx,
    runsPlayed: profile.data.stats.runs,
    sandbox: false,
  };
}

/** Per-battle wiring that has no setter on the battle scene: platform signals, wave-start saves, retry through the meta layer. */
function onBattleCreated(scene: BattleScene): void {
  const { run, battle, ctx } = scene;
  if (run.sandbox) return;
  gameplayStart();
  battle.events.on('waveStart', () => {
    const snapshot = battle.snapshot();
    if (snapshot) void profile.saveSnapshot(snapshot);
  });
  ctx.events.on('finished', () => gameplayStop());
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
async function begin(request: StartRunRequest, snack: SnackChoice | undefined, beforeSwap?: () => void): Promise<boolean> {
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
  return opened;
}

/** Retry from the result screen: the same request, straight into a new run (no pre-run page). */
async function retry(previous: RunConfig): Promise<void> {
  if (retrying) return;
  retrying = true;
  try {
    const { mode, chapter, stake } = previous.init;
    await begin({ mode, chapter, stake }, undefined);
  } finally {
    retrying = false;
  }
}

/**
 * Shell.startRun: a run in progress is offered first; the tutorial starts at once; every other mode
 * goes through the pre-run page. Resolves when the battle is opening or the player backed out.
 */
export function startRun(request: StartRunRequest): Promise<void> {
  if (profile.pendingRun) return offerContinue();
  if (request.mode === 'tutorial') return begin(request, undefined).then(() => undefined);
  if (preRun) return Promise.resolve();
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
        }).then((opened) => {
          if (opened) resolve();
          return opened;
        }),
      cancel: close,
    });
  });
}

/** The run the app was killed in: continue it, or end it with the rewards earned so far. */
export async function offerContinue(): Promise<void> {
  for (;;) {
    const pending = profile.pendingRun;
    if (!pending) return;
    const chapter = t('chapter.' + pending.init.chapter + '.name');
    const wave = pending.snapshot?.wave;
    const resume = await confirmDialog({
      title: t('shell.cont.title'),
      message: wave ? t('shell.cont.body', { chapter, wave }) : t('shell.cont.body.noWave'),
      confirmLabel: t('shell.cont.yes'),
      cancelLabel: t('shell.cont.no'),
    });
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
    shell.refresh();
    const { gold, bundle } = settled.value;
    await services.showRewards(bundleParts({ ...bundle, gold: (bundle.gold ?? 0) + gold }), t('shell.cont.settled'));
    shell.refresh();
    return;
  }
}

/** The very first scene: the tutorial battle for a brand-new player, the home screen for everyone else. */
export async function chooseFirstScene(): Promise<() => Scene> {
  if (!profile.pendingRun && profile.data.stats.runs === 0) {
    const prepared = await profile.prepareRun({ mode: 'tutorial' });
    if (prepared.ok) return battleScene(runConfig(prepared.value));
  }
  return homeScene();
}

/** Called once the first scene is on screen: a left-over run is offered right away. */
export function afterFirstScene(): void {
  if (profile.pendingRun && scenes.current instanceof HomeScene) void offerContinue();
}
