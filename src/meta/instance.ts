/**
 * The app's one profile, on the default store, the system clock and the platform singletons. This is
 * the only meta module that imports the platform barrel; tests build their own with createProfile().
 */
import { ads, analytics, iap, platform, playGames, PLATFORM_ID } from '@/platform';
import { t } from '@/core/i18n';
import { getStorageBackend } from '@/core/save';
import './strings';
import { CloudSave, CLOUD_SLOT, type CloudChoice } from './cloudSave';
import { ENDLESS_BOARD_ID, type BackupPreview } from './profile';
import { attachPlatform } from './platformLink';
import { createProfile } from './profile';

export const profile = createProfile({
  analytics,
  ads,
  submitScore: (board, score) => {
    platform.leaderboard?.submit(board, score).catch(() => undefined);
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
  load: () => playGames.load(CLOUD_SLOT),
  save: (text, description) => playGames.save(CLOUD_SLOT, text, description),
  deviceId,
  now: () => Date.now(),
  ask: (c, l) => chooser(c, l),
  reload: () => window.location.reload(),
  describe: (p) => t('meta.cloud.desc', { level: p.accountLevel, chapters: p.chaptersCleared }),
});

/** A sync that could not settle (offline, a run in progress, the dialog closed) is tried again, at most this often. */
const RETRY_MS = 60_000;
let lastTry = 0;

/** Settle the cloud copy of a signed-in session (once), then send the endless record. */
function syncCloud(): void {
  if (playGames.state().status !== 'on' || cloud.settled || profile.pendingRun) return;
  lastTry = Date.now();
  void cloud.syncAfterSignIn().then((r) => {
    if (r === 'uploaded' || r === 'adopted') void playGames.submit(ENDLESS_BOARD_ID, profile.data.endless.best);
  });
}

/**
 * Google Play Games (the Android app): read the automatic sign-in, and on every sign-in sync the cloud save and send the endless record.
 * Call once the UI can show the choice dialog. Never throws; nothing happens on builds without Play Games.
 */
export function startPlayGames(): void {
  playGames.onChange((s) => {
    if (s.status === 'on') syncCloud();
    else cloud.signedOut();
  });
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
    if (playGames.state().status !== 'on') return;
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
