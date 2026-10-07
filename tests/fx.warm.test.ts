import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WARM_BUDGET_MS, WARM_PRIO, WARM_SLOW_DT, WarmQueue, warmBudget } from '@/fx/warm';

/** A queue whose clock moves by `costOf(piece)` between the start and the end of each piece, so a piece "takes" that long. */
function queueWithClock(costOf: (key: string) => number, ran: string[]): { q: WarmQueue; job: (key: string, prio: number, cost?: number) => void } {
  const q = new WarmQueue();
  let t = 0;
  let current = '';
  let phase = 0;
  q.now = () => {
    phase ^= 1;
    if (phase === 0) t += costOf(current);
    return t;
  };
  const job = (key: string, prio: number, cost = 1): void => {
    q.request(key, prio, cost, () => {
      current = key;
      ran.push(key);
    });
  };
  return { q, job };
}

describe('warm queue', () => {
  let ran: string[];
  beforeEach(() => {
    ran = [];
  });

  it('gives a slow frame no warm-up and a normal one its allowance', () => {
    expect(warmBudget(1 / 60)).toBe(WARM_BUDGET_MS);
    expect(warmBudget(WARM_SLOW_DT)).toBe(WARM_BUDGET_MS);
    expect(warmBudget(WARM_SLOW_DT + 0.001)).toBe(0);
  });

  it('runs the most urgent first and keeps the order of the asks within a priority', () => {
    const { q, job } = queueWithClock(() => 0.1, ran);
    job('later1', WARM_PRIO.later);
    job('next1', WARM_PRIO.next);
    job('coming1', WARM_PRIO.coming);
    job('later2', WARM_PRIO.later);
    job('coming2', WARM_PRIO.coming);
    job('pipe', WARM_PRIO.pipe);
    q.update(1 / 60);
    expect(ran).toEqual(['pipe', 'coming1', 'coming2', 'next1', 'later1', 'later2']);
  });

  it('asks once: a piece that waits or has run is not queued again', () => {
    const { q, job } = queueWithClock(() => 0.1, ran);
    job('a', 1);
    expect(q.request('a', 1, 1, () => ran.push('again'))).toBe(false);
    q.update(1 / 60);
    expect(q.request('a', 1, 1, () => ran.push('again'))).toBe(false);
    q.update(1 / 60);
    expect(ran).toEqual(['a']);
    expect(q.finished).toBe(1);
    expect(q.has('a')).toBe(true);
  });

  it('moves a waiting piece up when it is asked for again more urgently, never down', () => {
    const { q, job } = queueWithClock(() => 0.1, ran);
    job('x', WARM_PRIO.later);
    job('y', WARM_PRIO.next);
    job('x', WARM_PRIO.coming);
    job('y', WARM_PRIO.later);
    q.update(1 / 60);
    expect(ran).toEqual(['x', 'y']);
  });

  it('stops when the allowance is spent and carries on next frame', () => {
    // Each piece takes 1.2 ms and is expected to: two fit in 2.5 ms, a third is expected to overshoot.
    const { q, job } = queueWithClock(() => 1.2, ran);
    for (const k of ['a', 'b', 'c', 'd', 'e']) job(k, 1, 1.2);
    expect(q.update(1 / 60)).toBe(2);
    expect(ran).toEqual(['a', 'b']);
    expect(q.pending).toBe(3);
    expect(q.update(1 / 60)).toBe(2);
    expect(q.update(1 / 60)).toBe(1);
    expect(ran).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(q.pending).toBe(0);
  });

  it('runs a piece bigger than the allowance alone, and then nothing else that frame', () => {
    const { q, job } = queueWithClock((k) => (k === 'big' ? 20 : 0.1), ran);
    job('big', 1, 30);
    job('small', 1, 0.1);
    expect(q.update(1 / 60)).toBe(1);
    expect(ran).toEqual(['big']);
    expect(q.update(1 / 60)).toBe(1);
  });

  it('measures what a piece really took: a cheap guess that was wrong ends the frame', () => {
    const { q, job } = queueWithClock((k) => (k === 'a' ? 3 : 0.1), ran);
    job('a', 1, 0.1);
    job('b', 1, 0.1);
    expect(q.update(1 / 60)).toBe(1);
    expect(ran).toEqual(['a']);
  });

  it('does nothing on a slow frame', () => {
    const { q, job } = queueWithClock(() => 0.1, ran);
    job('a', 1);
    expect(q.update(WARM_SLOW_DT + 0.01)).toBe(0);
    expect(q.pending).toBe(1);
    expect(q.update(1 / 60)).toBe(1);
  });

  it('survives a piece that throws: the rest still run and the failed one is not retried', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const q = new WarmQueue();
    q.request('bad', 1, 1, () => {
      throw new Error('no gpu');
    });
    q.request('good', 2, 1, () => ran.push('good'));
    q.update(1 / 60);
    expect(ran).toEqual(['good']);
    expect(q.request('bad', 1, 1, () => ran.push('retried'))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('forgets what is waiting on clear but remembers what has run', () => {
    const { q, job } = queueWithClock(() => 0.1, ran);
    job('a', 1);
    q.update(1 / 60);
    job('b', 1);
    q.clear();
    expect(q.pending).toBe(0);
    expect(q.has('a')).toBe(true);
    expect(q.has('b')).toBe(false);
    q.reset();
    expect(q.has('a')).toBe(false);
  });
});
