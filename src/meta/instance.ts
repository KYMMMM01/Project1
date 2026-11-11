/**
 * The app's one profile, on the default store, the system clock and the platform singletons. This is
 * the only meta module that imports the platform barrel; tests build their own with createProfile().
 */
import { account, ads, analytics, iap, platform, playGames, ranking, PLATFORM_ID, type RunProof } from '@/platform';
import { getStorageBackend } from '@/core/save';
import './strings';
import { CloudSave, type CloudChoice } from './cloudSave';
import { ENDLESS_BOARD_ID, type BackupPreview } from './profile';
import { attachPlatform } from './platformLink';
import { createProfile } from './profile';

/**
 * The best endless run of this session that did not reach the rankings (signed out, offline, refused as too soon): sent on the next
 * sign-in or the next run. Kept in memory only; the cloud save keeps the record itself for a later backfill.
 */
let unsent: RunProof | null = null;

function sendRun(run: RunProof): void {
  void ranking.submitRun(run).then((ok) => {
    if (ok) {
      if (unsent && unsent.waves <= run.waves) unsent = null;
    } else if (!unsent || run.waves > unsent.waves) unsent = run;
  });
}

export const profile = createProfile({
  analytics,
  ads,
  submitScore: (board, score, run) => {
    platform.leaderboard?.submit(board, score).catch(() => undefined);
    if (board !== ENDLESS_BOARD_ID || !run) return;
    // A better run waiting from before goes up with this one's turn (the server takes one run per player every 20 seconds).
    sendRun(unsent && unsent.waves > run.waves ? unsent : run);
  },
  // The same condition that shows the test ad and the test purchase sheet: the development adapter.
  testGrants: PLATFORM_ID === 'dev',
});

/** This install's id for the cloud save (made once; a reinstall is a new device). */
const DEVICE_KEY = 'device.id';
async function deviceId(): Promise<string> {
  const store = getStorageBackend();
  const have = await store.get(DEVICE_KEY).catch(() => null);
  if (have) return have;
  const id = `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  await store.set(DEVICE_KEY, id).catch(() => undefined);
  return id;
}

let chooser: (cloud: BackupPreview, local: BackupPreview) => Promise<CloudChoice> = async () => 'later';
/** The UI's dialog for "both copies have progress" (screens/system); until it is set nothing is decided (and nothing written). */
export function setCloudChooser(fn: typeof chooser): void {
  chooser = fn;
}

export const cloud = new CloudSave(profile, {
  load: () => account.loadSave(),
  save: (text) => account.writeSave(text, profile.data.endless.best),
  deviceId,
  now: () => Date.now(),
  ask: (c, l) => chooser(c, l),
  reload: () => window.location.reload(),
});

/** A sync that could not settle (offline, a run in progress, the dialog closed) is tried again, at most this often. */
const RETRY_MS = 60_000;
let lastTry = 0;

/** Settle the cloud copy of a signed-in session (once). The rankings need no resend: the server keeps each record it accepted. */
function syncCloud(): void {
  if (account.state().status !== 'on' || cloud.settled || profile.pendingRun) return;
  lastTry = Date.now();
  void cloud.syncAfterSignIn();
}

/**
 * The online services, once the UI can show the choice dialog: the game account (restore the last Google sign-in; on every sign-in sync the
 * cloud save) and Google Play Games for achievements (it signs in by itself on Android). Never throws; builds without them play as guests.
 */
export function startOnline(): void {
  account.onChange((s) => {
    if (s.status === 'on') {
      syncCloud();
      if (unsent) sendRun(unsent);
    } else cloud.signedOut();
  });
  void account.start();
  void playGames.start();
}

/**
 * Boot: load the save, connect ads and purchases, follow the app lifecycle. Call once, after
 * `initPlatform()`. Returns the function that undoes it.
 */
export async function initMeta(): Promise<() => void> {
  await profile.load();
  const detach = attachPlatform(profile, { ads, iap });
  const offResume = platform.lifecycle.onResume(() => {
    profile.resume();
    syncCloud();
  });
  const offPause = platform.lifecycle.onPause(() => {
    void profile.flush();
    void cloud.upload();
  });
  // Changes go up a little later (a run end, a purchase), once the session is settled; an unsettled one is tried again now and then
  // (a run that held it back has ended, the network is back).
  const offChange = profile.subscribe(() => {
    if (account.state().status !== 'on') return;
    if (cloud.settled) cloud.schedule();
    else if (Date.now() - lastTry > RETRY_MS) syncCloud();
  });
  return () => {
    offChange();
    cloud.dispose();
    offPause();
    offResume();
    detach();
  };
}
