/**
 * What the player has been taught and has read. It lives under the key the old one-time hints used, so
 * "erase progress" wipes it with the rest and a player who had seen a hint is not taught that topic again.
 *
 *   taught  a lesson (tutorial step, first-encounter card) covered the topic
 *   read    the topic's page was opened in the guidebook
 *   skipped the tutorial was skipped (it is not offered again, even if the app closes during that run)
 */
import { Emitter } from '@/core/events';
import { SaveStore } from '@/core/save';
import { TOPIC_IDS, isTopicId, type TopicId } from './topics';

interface Saved {
  taught: string[];
  read: string[];
  skipped: boolean;
}

/** The one-time hints of the first version, by the topic that now covers each. */
const LEGACY_HINTS: Readonly<Record<string, TopicId>> = {
  twins: 'merge',
  chips: 'classes',
  synergy: 'synergy',
  toys: 'toys',
  sun: 'sun',
  speed: 'speed',
  preview: 'preview',
  tracker: 'pick3',
  laser: 'laser',
  callWave: 'call_wave',
  purr: 'purr',
  molt: 'molt',
  odds: 'summon_grade',
  grade: 'summon_grade',
  awaken: 'awaken',
  sell: 'sell',
};

/** Version 1 stored `{ seen: hintId[] }`. */
export function migrateHints(raw: unknown): Saved {
  const seen = (raw as { seen?: unknown } | null)?.seen;
  const taught = new Set<string>();
  if (Array.isArray(seen)) for (const id of seen) if (typeof id === 'string' && LEGACY_HINTS[id]) taught.add(LEGACY_HINTS[id] as string);
  return { taught: [...taught], read: [], skipped: false };
}

export interface ProgressEvents {
  change: { id: TopicId | null };
}

export class GuideProgress {
  readonly events = new Emitter<ProgressEvents>();
  private readonly taughtSet = new Set<string>();
  private readonly readSet = new Set<string>();
  private skippedFlag = false;
  private readonly store: SaveStore<Saved> | null;
  private loaded: boolean;

  /** `persist` false keeps everything in memory (sandbox and test runs). */
  constructor(persist: boolean) {
    this.store = persist
      ? new SaveStore<Saved>({
          key: 'meowguard.hints',
          version: 2,
          defaults: () => ({ taught: [], read: [], skipped: false }),
          migrate: (raw) => migrateHints(raw),
        })
      : null;
    this.loaded = this.store === null;
  }

  get ready(): boolean {
    return this.loaded;
  }

  async load(): Promise<void> {
    if (!this.store || this.loaded) return;
    await this.store.load();
    for (const id of this.store.data.taught) this.taughtSet.add(id);
    for (const id of this.store.data.read) this.readSet.add(id);
    this.skippedFlag = this.store.data.skipped;
    this.loaded = true;
    this.events.emit('change', { id: null });
  }

  isTaught(id: TopicId): boolean {
    return this.taughtSet.has(id);
  }

  isRead(id: TopicId): boolean {
    return this.readSet.has(id);
  }

  /** Taught by a lesson or read in the guidebook: the topic is no longer new. */
  isSeen(id: TopicId): boolean {
    return this.taughtSet.has(id) || this.readSet.has(id);
  }

  get skipped(): boolean {
    return this.skippedFlag;
  }

  markTaught(id: TopicId): void {
    if (this.taughtSet.has(id)) return;
    this.taughtSet.add(id);
    this.persist();
    this.events.emit('change', { id });
  }

  markRead(id: TopicId): void {
    if (this.readSet.has(id)) return;
    this.readSet.add(id);
    this.persist();
    this.events.emit('change', { id });
  }

  markSkipped(): void {
    if (this.skippedFlag) return;
    this.skippedFlag = true;
    this.persist();
    this.events.emit('change', { id: null });
  }

  /** Topics never taught and never read: the guidebook's "new" stickers. */
  unread(): TopicId[] {
    return TOPIC_IDS.filter((id) => !this.isSeen(id));
  }

  private persist(): void {
    if (!this.store) return;
    this.store.data.taught = [...this.taughtSet].filter(isTopicId);
    this.store.data.read = [...this.readSet].filter(isTopicId);
    this.store.data.skipped = this.skippedFlag;
    this.store.save();
  }

  flush(): Promise<void> {
    return this.store?.flush() ?? Promise.resolve();
  }
}

/** The player's own progress, shared by the home screen and every battle. */
export const guideProgress = new GuideProgress(true);
