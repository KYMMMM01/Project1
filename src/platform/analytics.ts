/**
 * Analytics: a typed event name (docs/명세_메타.md section 11), a dev sink and an adapter hook.
 * No network calls anywhere in this file. Pure: safe in node and the browser.
 */

export const ANALYTICS_EVENTS = [
  'run_start',
  'run_end',
  'tutorial_step',
  'ad_offer',
  'ad_result',
  'iap_view',
  'iap_result',
  'currency',
  'chest_open',
  'unit_level',
  'mission_claim',
  'feature_unlock',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];
export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsParams = Readonly<Record<string, AnalyticsValue>>;

export interface AnalyticsRecord {
  readonly seq: number;
  /** Epoch ms. */
  readonly t: number;
  readonly event: AnalyticsEvent;
  readonly params: AnalyticsParams;
}

export type AnalyticsSink = (record: AnalyticsRecord) => void;
export type AnalyticsAdapterHook = (event: AnalyticsEvent, params: AnalyticsParams) => void;

export interface AnalyticsOptions {
  /** Ring buffer size. Default 200. */
  capacity?: number;
  /** Mirror every event to console.debug (dev builds). */
  console?: boolean;
  now?: () => number;
}

export class Analytics {
  readonly capacity: number;
  private readonly ring: Array<AnalyticsRecord | undefined>;
  private next = 0;
  private total = 0;
  private readonly sinks = new Set<AnalyticsSink>();
  private hook: AnalyticsAdapterHook | null = null;
  private readonly now: () => number;
  consoleSink: boolean;

  constructor(opts: AnalyticsOptions = {}) {
    this.capacity = Math.max(1, opts.capacity ?? 200);
    this.ring = new Array<AnalyticsRecord | undefined>(this.capacity).fill(undefined);
    this.consoleSink = opts.console ?? false;
    this.now = opts.now ?? Date.now;
  }

  /** Record one event. Never throws, never blocks, never touches the network. */
  track(event: AnalyticsEvent, params: AnalyticsParams = {}): void {
    const record: AnalyticsRecord = { seq: this.total, t: this.now(), event, params };
    this.ring[this.next] = record;
    this.next = (this.next + 1) % this.capacity;
    this.total++;
    if (this.consoleSink) {
      try {
        console.debug('[analytics]', event, params);
      } catch {
        /* no console in some embedded webviews */
      }
    }
    for (const sink of this.sinks) {
      try {
        sink(record);
      } catch {
        /* a broken sink must not break gameplay */
      }
    }
    if (this.hook) {
      try {
        this.hook(event, params);
      } catch {
        /* same for the platform hook */
      }
    }
  }

  /** The platform adapter's own analytics (Toss analytics, ...). Pass null to detach. */
  setAdapterHook(hook: AnalyticsAdapterHook | null): void {
    this.hook = hook;
  }

  addSink(sink: AnalyticsSink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  /** Buffered events, oldest first (at most `capacity`). */
  buffer(): AnalyticsRecord[] {
    const out: AnalyticsRecord[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const r = this.ring[(this.next + i) % this.capacity];
      if (r) out.push(r);
    }
    return out;
  }

  /** The newest `n` events, oldest first. */
  last(n: number): AnalyticsRecord[] {
    const all = this.buffer();
    return all.slice(Math.max(0, all.length - n));
  }

  /** Total events tracked since boot, including those already pushed out of the ring. */
  get count(): number {
    return this.total;
  }

  clear(): void {
    this.ring.fill(undefined);
    this.next = 0;
  }

  /** Object handed to debugExpose('analytics', ...). */
  debugApi(): Record<string, unknown> {
    return {
      buffer: () => this.buffer(),
      last: (n = 10) => this.last(n),
      count: () => this.count,
      clear: () => this.clear(),
      events: ANALYTICS_EVENTS,
    };
  }
}
