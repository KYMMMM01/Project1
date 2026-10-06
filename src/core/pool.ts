/** Fixed-purpose object pool: avoids per-frame allocation (and GC hitches) for particles, bullets, numbers. */
export class Pool<T> {
  private free: T[] = [];
  private made = 0;

  constructor(
    private readonly create: () => T,
    private readonly reset?: (obj: T) => void,
    private readonly max = Infinity,
  ) {}

  get(): T {
    const obj = this.free.pop();
    if (obj !== undefined) return obj;
    this.made++;
    return this.create();
  }

  release(obj: T): void {
    this.reset?.(obj);
    if (this.free.length < this.max) this.free.push(obj);
  }

  /** Total objects ever created — a rising number in a steady state means something is not released. */
  get created(): number {
    return this.made;
  }

  get idle(): number {
    return this.free.length;
  }

  drain(dispose?: (obj: T) => void): void {
    if (dispose) for (const o of this.free) dispose(o);
    this.free.length = 0;
  }
}
