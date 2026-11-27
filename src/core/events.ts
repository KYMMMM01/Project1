type Handler<T> = (payload: T) => void;

/** Minimal typed event emitter. `E` maps event name -> payload type. */
export class Emitter<E extends object> {
  private map = new Map<keyof E, Handler<never>[]>();

  on<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    let list = this.map.get(type);
    if (!list) {
      list = [];
      this.map.set(type, list);
    }
    list.push(fn as Handler<never>);
    return () => this.off(type, fn);
  }

  once<K extends keyof E>(type: K, fn: Handler<E[K]>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends keyof E>(type: K, fn: Handler<E[K]>): void {
    const list = this.map.get(type);
    if (!list) return;
    const i = list.indexOf(fn as Handler<never>);
    if (i >= 0) list.splice(i, 1);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.map.get(type);
    if (!list || list.length === 0) return;
    // Copy so handlers may unsubscribe (or subscribe) while we iterate.
    for (const fn of list.slice()) (fn as Handler<E[K]>)(payload);
  }

  clear(): void {
    this.map.clear();
  }
}

/** A change notice to listen to: an emitter's on with its event bound, or an onChange. Returns the unsubscribe. */
type Subscribe = (fn: () => void) => () => void;

/**
 * Listen to `sources` and run `fn` after the code that made the change has returned. A screen rebuilt at once from inside its own
 * button's handler would destroy that button in the middle of the call. Changes from several sources in one turn run `fn` once, and
 * the returned unsubscribe also drops a run that is still waiting, so `fn` never runs on a closed screen.
 */
export function onSettled(fn: () => void, ...sources: Subscribe[]): () => void {
  let live = true;
  let pending = false;
  const later = (): void => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (live) fn();
    });
  };
  const offs = sources.map((on) => on(later));
  return () => {
    live = false;
    for (const off of offs) off();
  };
}
