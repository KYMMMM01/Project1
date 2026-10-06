import { Emitter } from '@/core/events';
import type { BattleEvents } from '../api';

/**
 * The battle's event bus. It additionally knows whether anyone listens to an event, so the
 * simulation can skip building payload objects for events nobody subscribed to (headless runs
 * allocate nothing for events).
 */
export class BattleEmitter extends Emitter<BattleEvents> {
  private readonly mirror = new Map<keyof BattleEvents, unknown[]>();

  override on<K extends keyof BattleEvents>(type: K, fn: (payload: BattleEvents[K]) => void): () => void {
    let list = this.mirror.get(type);
    if (!list) {
      list = [];
      this.mirror.set(type, list);
    }
    list.push(fn);
    return super.on(type, fn);
  }

  override off<K extends keyof BattleEvents>(type: K, fn: (payload: BattleEvents[K]) => void): void {
    const list = this.mirror.get(type);
    const i = list ? list.indexOf(fn) : -1;
    if (list && i >= 0) list.splice(i, 1);
    super.off(type, fn);
  }

  override clear(): void {
    this.mirror.clear();
    super.clear();
  }

  /** True when at least one handler is subscribed to `type`. */
  has(type: keyof BattleEvents): boolean {
    const list = this.mirror.get(type);
    return list !== undefined && list.length > 0;
  }
}
