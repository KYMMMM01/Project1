/**
 * The cloud save (Google Play Games Saved Games): the whole profile in one slot, written behind the player once a sign-in has been synced.
 * Pure with respect to the platform: the slot, the device id, the choice dialog and the reload are injected (meta/instance.ts wires them).
 *
 * After a sign-in nothing is written before the cloud copy has been read and settled:
 *   no cloud copy (or a broken one)                          => this device's profile goes up;
 *   a copy from a newer app version, or one we cannot read   => nothing is written (an update will read it);
 *   this device's own copy, the local profile up to date     => this device's profile goes up;
 *   this device's own copy, newer than the local profile, or
 *     the local profile empty while the copy has progress   => the player chooses (a reset, a damaged save, an old backup restored);
 *   another device's copy, this profile fresh                => the cloud copy replaces it (a new phone);
 *   another device's copy without progress                   => this device's profile goes up;
 *   another device's copy, both with progress                => the player chooses, seeing both.
 * Closing the choice (Back, Escape) decides nothing: the sync stays open and is tried again at the next resume. A replaced profile is
 * merged like a code import (purchases never granted twice, refunds kept, purchases made here granted again on it) and the game restarts
 * on it. While a run is being played the sync waits for it to end.
 */
import type { BackupPreview, Profile } from './profile';

/** The Saved Games slot. */
export const CLOUD_SLOT = 'profile';
const FORMAT = 1;
/** Writes behind the player wait this long after the last change (a run end, a purchase), so a burst of changes is one write. */
export const CLOUD_DEBOUNCE_MS = 20_000;
/** A cloud copy this much newer than the local profile's last moment was written after it (an old backup restored): the local one is behind. Saves and uploads are a minute or two apart in normal play. */
const NEWER_MS = 30 * 60_000;

interface CloudPayload {
  v: number;
  device: string;
  savedAt: number;
  data: unknown;
}

/** cloud / local: the player's pick; later: the dialog was closed without a pick. */
export type CloudChoice = 'cloud' | 'local' | 'later';

export interface CloudDeps {
  /** The slot's text, null when empty; throws when the read failed. */
  load(): Promise<string | null>;
  /** False when not written (not signed in, failed). */
  save(text: string, description: string): Promise<boolean>;
  /** This install's id (made once, kept with the save). */
  deviceId(): Promise<string>;
  now(): number;
  /** Two copies with progress: which one stays. */
  ask(cloud: BackupPreview, local: BackupPreview): Promise<CloudChoice>;
  /** The profile was replaced: start the game again on it. */
  reload(): void;
  /** The text shown in Play Games' saved-games list. */
  describe(p: BackupPreview): string;
}

/** uploaded / adopted: settled, writes may follow. failed / later: not settled; tried again later. */
export type SyncResult = 'uploaded' | 'adopted' | 'failed' | 'later';

export class CloudSave {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private syncing: Promise<SyncResult> | null = null;
  /** True once a sync has settled the cloud copy for this signed-in session: only then do writes behind the player go up. */
  private synced = false;
  /** Writes run one after another (two opens of one slot at once can fail). */
  private queue: Promise<unknown> = Promise.resolve();
  /** What the last write held, the moment of the last look aside: a change that only moved the clock is not written again. */
  private lastWritten = '';

  constructor(
    private readonly profile: Profile,
    private readonly deps: CloudDeps,
  ) {}

  /** Whether the cloud copy has been settled since the last sign-in. */
  get settled(): boolean {
    return this.synced;
  }

  /** A sign-in (at start, from a connect button) or a retry. One at a time; a settled session is not synced again. */
  syncAfterSignIn(): Promise<SyncResult> {
    if (this.synced) return Promise.resolve('uploaded');
    this.syncing ??= this.sync()
      .then((r) => {
        this.synced = r === 'uploaded' || r === 'adopted';
        return r;
      })
      .finally(() => {
        this.syncing = null;
      });
    return this.syncing;
  }

  /** Signed out: the next sign-in syncs again before anything is written. */
  signedOut(): void {
    this.synced = false;
    clearTimeout(this.timer);
  }

  /** A change worth keeping happened: write it a little later (only once the session is settled). */
  schedule(): void {
    if (!this.synced) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.upload(), CLOUD_DEBOUNCE_MS);
  }

  /** Write now (the app goes to the background). Nothing before the session is settled. */
  async upload(): Promise<boolean> {
    clearTimeout(this.timer);
    if (!this.synced || this.syncing) return false;
    return this.write(false);
  }

  dispose(): void {
    clearTimeout(this.timer);
  }

  private async sync(): Promise<SyncResult> {
    // A run in progress is never cut by a restart: settle the cloud copy when it has ended.
    if (this.profile.pendingRun) return 'later';
    let text: string | null;
    try {
      text = await this.deps.load();
    } catch {
      return 'failed';
    }
    const cloud = parse(text);
    if (cloud === 'newer') return 'failed';
    const up = async (): Promise<SyncResult> => ((await this.write(true)) ? 'uploaded' : 'failed');
    if (!cloud) return up();
    const read = this.profile.readCloud(cloud.data, cloud.savedAt);
    if (!read.ok) return 'failed';
    const cloudFresh = read.value.data.stats.runs === 0 && Object.keys(read.value.data.orders).length === 0;
    const localFresh = this.profile.isFresh();
    const own = cloud.device === (await this.deps.deviceId());

    let choose: boolean;
    if (own) {
      const behind = cloud.savedAt > this.profile.data.time.lastSeenAt + NEWER_MS;
      if (cloudFresh || (!behind && !localFresh)) return up();
      choose = true;
    } else {
      if (cloudFresh && !localFresh) return up();
      choose = !localFresh;
    }
    if (choose) {
      const pick = await this.deps.ask(read.value.preview, this.profile.localPreview());
      if (pick === 'later') return 'later';
      if (pick === 'local') return up();
    }
    if (this.profile.pendingRun) return 'later';
    await this.profile.adoptCloud(read.value.data);
    // The copy now on this device came from the cloud: write it back under this device's id, so the next start does not ask again.
    await this.write(true);
    this.deps.reload();
    return 'adopted';
  }

  /** One write at a time. `force`: the sync's own write, even when nothing changed. */
  private write(force: boolean): Promise<boolean> {
    const run = async (): Promise<boolean> => {
      const data = this.profile.cloudData();
      const key = JSON.stringify(data, (k, v: unknown) => (k === 'lastSeenAt' ? undefined : v));
      if (!force && key === this.lastWritten) return true;
      const payload: CloudPayload = { v: FORMAT, device: await this.deps.deviceId(), savedAt: this.deps.now(), data };
      const ok = await this.deps.save(JSON.stringify(payload), this.deps.describe(this.profile.localPreview()));
      if (ok) this.lastWritten = key;
      return ok;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

/** Our payload; 'newer' for one written by a later app version (never overwritten); null for none or one that is not ours. */
function parse(text: string | null): CloudPayload | 'newer' | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text) as Partial<CloudPayload>;
    if (v && typeof v === 'object' && typeof v.v === 'number' && v.v > FORMAT) return 'newer';
    if (v && typeof v === 'object' && v.v === FORMAT && typeof v.device === 'string' && typeof v.savedAt === 'number' && v.data) {
      return v as CloudPayload;
    }
  } catch {
    /* not ours */
  }
  return null;
}
