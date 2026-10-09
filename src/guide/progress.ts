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
import { ENEMY_IDS, RELIC_IDS, type EnemyId, type RelicId } from '@/game/api';
import { TOPIC_IDS, isTopicId, type TopicId } from './topics';

interface Saved {
  taught: string[];
  read: string[];
  skipped: boolean;
  /** Codex entries first met in a run (an enemy that walked, a toy that was offered), and those whose page or card the player has since looked at. */
  met: string[];
  looked: string[];
}

/** What the codex remembers one entry by: `foe:<enemy id>` or `toy:<toy id>`. */
export type CodexKey = `foe:${EnemyId}` | `toy:${RelicId}`;

export const CODEX_KEYS: readonly CodexKey[] = [...ENEMY_IDS.map((id): CodexKey => `foe:${id}`), ...RELIC_IDS.map((id): CodexKey => `toy:${id}`)];
const CODEX_KEY_SET: ReadonlySet<string> = new Set(CODEX_KEYS);

export function isCodexKey(key: string): key is CodexKey {
  return CODEX_KEY_SET.has(key);
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
  return { taught: [...taught], read: [], skipped: false, met: [], looked: [] };
}

export interface ProgressEvents {
  change: { id: TopicId | null };
}

export class GuideProgress {
  readonly events = new Emitter<ProgressEvents>();
  private readonly taughtSet = new Set<string>();
  private readonly readSet = new Set<string>();
  private readonly metSet = new Set<string>();
  private readonly lookedSet = new Set<string>();
  private skippedFlag = false;
  private readonly store: SaveStore<Saved> | null;
  private loaded: boolean;

  /** `persist` false keeps everything in memory (sandbox and test runs). */
  constructor(persist: boolean) {
    this.store = persist
      ? new SaveStore<Saved>({
          key: 'meowguard.hints',
          version: 3,
          defaults: () => ({ taught: [], read: [], skipped: false, met: [], looked: [] }),
          // Version 3 only adds the codex's two lists, which the loader fills from the defaults.
          migrate: (raw, from) => (from < 2 ? migrateHints(raw) : raw),
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
    for (const key of this.store.data.met) this.metSet.add(key);
    for (const key of this.store.data.looked) this.lookedSet.add(key);
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

  /** The player has met this codex entry in a run. */
  isMet(key: CodexKey): boolean {
    return this.metSet.has(key);
  }

  /** The player has looked at this codex entry since they met it. */
  isLooked(key: CodexKey): boolean {
    return this.lookedSet.has(key);
  }

  /** Met and not yet looked at: the codex's "new" stickers. */
  isFresh(key: CodexKey): boolean {
    return this.metSet.has(key) && !this.lookedSet.has(key);
  }

  freshCount(): number {
    let n = 0;
    for (const key of this.metSet) if (!this.lookedSet.has(key)) n++;
    return n;
  }

  markMet(key: CodexKey): void {
    if (this.metSet.has(key)) return;
    this.metSet.add(key);
    this.persist();
    this.events.emit('change', { id: null });
  }

  /** Looking at an entry that was never met changes nothing: it is still new when it is met. */
  markLooked(key: CodexKey): void {
    if (!this.metSet.has(key) || this.lookedSet.has(key)) return;
    this.lookedSet.add(key);
    this.persist();
    this.events.emit('change', { id: null });
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

  /**
   * "Play the tutorial again": what the lessons taught is forgotten and the skip is undone, so the next tutorial run teaches
   * every lesson from the start. What the player has read in the guidebook stays read.
   */
  resetTaught(): void {
    if (this.taughtSet.size === 0 && !this.skippedFlag) return;
    this.taughtSet.clear();
    this.skippedFlag = false;
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
    this.store.data.met = [...this.metSet].filter(isCodexKey);
    this.store.data.looked = [...this.lookedSet].filter(isCodexKey);
    this.store.data.skipped = this.skippedFlag;
    this.store.save();
  }

  flush(): Promise<void> {
    return this.store?.flush() ?? Promise.resolve();
  }
}

/** The player's own progress, shared by the home screen and every battle. */
export const guideProgress = new GuideProgress(true);
