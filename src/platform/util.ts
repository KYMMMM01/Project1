/** Small helpers shared by the platform layer. Pure: safe in node and the browser. */

/** Resolve with `fallback` if `p` has not settled within `ms`, or if it rejects. Never rejects. */
export function settleWithin<T>(p: Promise<T> | T, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const o = e as { code?: unknown; message?: unknown };
    if (typeof o.code === 'string') return o.code;
    if (typeof o.message === 'string') return o.message;
  }
  try {
    return String(e);
  } catch {
    return 'unknown error';
  }
}

/** Run `fn`, swallow anything it throws. */
export function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    /* platform callbacks must never take the game down */
  }
}

/** UTF-8 byte length without TextEncoder (keeps the helper usable everywhere). */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** Tiny emitter for lifecycle signals that must survive an adapter swap. */
export class Signal {
  private fns: Array<() => void> = [];
  on(fn: () => void): () => void {
    this.fns.push(fn);
    return () => {
      const i = this.fns.indexOf(fn);
      if (i >= 0) this.fns.splice(i, 1);
    };
  }
  emit(): void {
    for (const fn of this.fns.slice()) safe(fn);
  }
}
