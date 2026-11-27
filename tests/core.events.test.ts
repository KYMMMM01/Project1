import { describe, expect, it } from 'vitest';
import { Emitter, onSettled } from '@/core/events';

describe('onSettled', () => {
  const source = (): { on: (fn: () => void) => () => void; fire: () => void; count: () => number } => {
    const e = new Emitter<{ change: number }>();
    let n = 0;
    return {
      on: (fn) => {
        n++;
        const off = e.on('change', fn);
        return () => {
          n--;
          off();
        };
      },
      fire: () => e.emit('change', 1),
      count: () => n,
    };
  };

  it('runs after the code that made the change has returned', async () => {
    const a = source();
    const seen: string[] = [];
    onSettled(() => seen.push('rebuilt'), a.on);
    a.fire();
    seen.push('handler done');
    await Promise.resolve();
    expect(seen).toEqual(['handler done', 'rebuilt']);
  });

  it('runs once for several changes from several sources in one turn, and again on a later turn', async () => {
    const [a, b] = [source(), source()];
    let runs = 0;
    onSettled(() => runs++, a.on, b.on);
    a.fire();
    b.fire();
    a.fire();
    await Promise.resolve();
    expect(runs).toBe(1);
    b.fire();
    await Promise.resolve();
    expect(runs).toBe(2);
  });

  it('the unsubscribe leaves every source and drops a run still waiting', async () => {
    const [a, b] = [source(), source()];
    let runs = 0;
    const off = onSettled(() => runs++, a.on, b.on);
    expect(a.count() + b.count()).toBe(2);
    a.fire();
    off();
    await Promise.resolve();
    expect(runs).toBe(0);
    expect(a.count() + b.count()).toBe(0);
  });
});
