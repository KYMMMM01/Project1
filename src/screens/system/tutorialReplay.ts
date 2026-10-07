/**
 * "Play the tutorial again", from the guidebook and from the settings sheet: one confirmation, then what the lessons taught is
 * forgotten (what was read in the guidebook stays read) and a tutorial run opens through the home screen's own run path, so the
 * run pays what any tutorial run pays and nothing else (it is the same mode; no first clear, no piggy bank).
 */
import { t } from '@/core/i18n';
import { SaveStore } from '@/core/save';
import { guideProgress } from '@/guide';
import { profile } from '@/meta';
import { confirmDialog, toast } from '@/ui';
import { shell } from '../shell/controller';

/**
 * A run that was never finished stands in the way of a new one. An interrupted tutorial does not: the run flow drops it, so
 * replaying is exactly what such a player wants.
 */
export function replayBlocked(pending: { init: { mode: string } } | null): boolean {
  return pending !== null && pending.init.mode !== 'tutorial';
}

/** The one confirmation. False (with a word why) when the replay cannot start or the player says no. */
export async function askReplayTutorial(): Promise<boolean> {
  if (replayBlocked(profile.pendingRun)) {
    toast(t('guide.replay.busy'), 'warning');
    return false;
  }
  return confirmDialog({
    title: t('guide.replay.title'),
    message: t('guide.replay.body'),
    confirmLabel: t('guide.replay.yes'),
    cancelLabel: t('guide.replay.no'),
  });
}

/** The laser's own record (how often its card opened, the guided first use): the tutorial's laser lesson starts from nothing again. */
async function forgetLaserLesson(): Promise<void> {
  const store = new SaveStore<{ opened: number; guided: boolean }>({ key: 'meowguard.laser', version: 1, defaults: () => ({ opened: 0, guided: false }) });
  store.save();
  await store.flush();
}

/** Forget what was taught and open the tutorial run (the home scene should already be free of sheets). */
export async function startTutorialReplay(): Promise<void> {
  guideProgress.resetTaught();
  await Promise.all([guideProgress.flush(), forgetLaserLesson()]);
  await shell.startRun({ mode: 'tutorial' });
}
