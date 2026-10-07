import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BANK_BUDGET_MB, SoundBank, bankBudget, variantsOf } from '@/audio/bank';
import { sfxIndexOf } from '@/audio/sounds';

/** Every bake is a promise the test settles by hand, so the order the renders finish in is the test's to choose. */
interface Job {
  key: string;
  variant: number;
  land: (length?: number) => void;
  fail: (err: Error) => void;
}
const baking = vi.hoisted(() => ({ jobs: [] as Job[] }));

vi.mock('@/audio/bake', () => ({
  offlineSupported: () => true,
  bakeVariant: (_recipe: unknown, key: string, variant: number) =>
    new Promise((resolve, reject) => {
      baking.jobs.push({
        key,
        variant,
        land: (length = 1000) => resolve({ buffer: { length, numberOfChannels: 1, duration: length / 48000 } }),
        fail: reject,
      });
    }),
}));

/** Let the promise continuations of landed bakes run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) await Promise.resolve();
};

/** Land every bake that is in flight (and those they start in turn) at `length` samples. */
async function landAll(length = 1000): Promise<void> {
  for (let guard = 0; guard < 50 && baking.jobs.length > 0; guard++) {
    for (const job of baking.jobs.splice(0)) job.land(length);
    await settle();
  }
}

const THREE = sfxIndexOf('hit_light');
const TWO = sfxIndexOf('ui_click');
const ONE = sfxIndexOf('ui_popup_open');
const BYTES = 4000;

describe('the sound bank', () => {
  let bank: SoundBank;
  beforeEach(() => {
    baking.jobs.length = 0;
    bank = new SoundBank(48000);
  });
  afterEach(() => bank.dispose());

  it('knows how many variants each sound has', () => {
    expect([variantsOf(THREE), variantsOf(TWO), variantsOf(ONE)]).toEqual([3, 2, 1]);
    expect(bank.left(THREE)).toBe(3);
    expect(bank.left(-1)).toBe(0);
  });

  it('bakes one variant per step, the lowest one not yet taken, and stops when none is left', async () => {
    expect(bank.bakeStep(THREE)).toBe(true);
    expect(bank.bakeStep(THREE)).toBe(true);
    expect(baking.jobs.map((j) => j.variant)).toEqual([0, 1]);
    expect(bank.left(THREE)).toBe(1);
    expect(bank.bakeStep(THREE)).toBe(true);
    expect(bank.bakeStep(THREE)).toBe(false);
    expect(bank.left(THREE)).toBe(0);
    expect(bank.get(THREE)).toBeUndefined();
    await landAll();
    expect(bank.get(THREE)).toHaveLength(3);
    expect(bank.bakeStep(THREE)).toBe(false);
  });

  it('hands out the variants that are baked while the others still bake, and counts only whole sounds as baked', async () => {
    bank.bakeStep(THREE);
    bank.bakeStep(THREE);
    (baking.jobs[0] as Job).land();
    await settle();
    expect(bank.get(THREE)).toHaveLength(1);
    expect(bank.complete(THREE)).toBe(false);
    expect(bank.bakedCount).toBe(0);
    expect(bank.bytes).toBe(BYTES);
    (baking.jobs[1] as Job).land();
    bank.bakeStep(THREE);
    (baking.jobs[2] as Job).land();
    await settle();
    expect(bank.complete(THREE)).toBe(true);
    expect(bank.bakedCount).toBe(1);
    expect(bank.bytes).toBe(3 * BYTES);
  });

  it('answers a first use with the first variant, and bakes the others one after another behind it', async () => {
    let first: AudioBuffer[] | undefined;
    void bank.ensure(THREE).then((b) => (first = b));
    expect(baking.jobs).toHaveLength(1);
    (baking.jobs[0] as Job).land();
    await settle();
    expect(first).toHaveLength(1);
    // The next variant starts only now that the first has landed: never two renders of one sound at once.
    expect(baking.jobs.filter((j) => j.variant === 1)).toHaveLength(1);
    expect(baking.jobs.filter((j) => j.variant === 2)).toHaveLength(0);
    await landAll();
    expect(bank.complete(THREE)).toBe(true);
  });

  it('waits for every variant when asked to', async () => {
    let all: AudioBuffer[] | undefined;
    void bank.ensure(TWO, true).then((b) => (all = b));
    (baking.jobs.splice(0)[0] as Job).land();
    await settle();
    expect(all).toBeUndefined();
    await landAll();
    expect(all).toHaveLength(2);
  });

  it('joins a bake that is already on its way instead of starting another', async () => {
    bank.bakeStep(THREE);
    let got: AudioBuffer[] | undefined;
    void bank.ensure(THREE).then((b) => (got = b));
    expect(baking.jobs).toHaveLength(1);
    (baking.jobs[0] as Job).land();
    await settle();
    expect(got).toHaveLength(1);
  });

  it('shares one answer between everybody waiting for the same sound', async () => {
    const answers: Array<AudioBuffer[] | undefined> = [];
    void bank.ensure(ONE).then((b) => answers.push(b));
    void bank.ensure(ONE).then((b) => answers.push(b));
    expect(baking.jobs).toHaveLength(1);
    await landAll();
    expect(answers).toHaveLength(2);
    expect(answers[0]).toBe(answers[1]);
  });

  it('answers at once for a sound that is baked, and remembers a sound that failed to bake', async () => {
    void bank.ensure(ONE);
    await landAll();
    await expect(bank.ensure(ONE)).resolves.toHaveLength(1);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let failed: AudioBuffer[] | undefined | 'pending' = 'pending';
    void bank.ensure(TWO).then((b) => (failed = b));
    (baking.jobs.splice(0)[0] as Job).fail(new Error('no render'));
    await settle();
    expect(failed).toBeUndefined();
    expect(bank.hasFailed(TWO)).toBe(true);
    expect(bank.left(TWO)).toBe(0);
    expect(bank.bakeStep(TWO)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('lets nobody wait for ever once it is disposed, and ignores bakes that land afterwards', async () => {
    let got: AudioBuffer[] | undefined | 'pending' = 'pending';
    void bank.ensure(THREE).then((b) => (got = b));
    bank.dispose();
    await settle();
    expect(got).toBeUndefined();
    (baking.jobs[0] as Job).land();
    await settle();
    expect(bank.get(THREE)).toBeUndefined();
    expect(bank.left(THREE)).toBe(0);
  });

  describe('memory budget', () => {
    it('is 14 MB of decimal megabytes at 48 kHz and holds the same sound at any rate', () => {
      expect(BANK_BUDGET_MB).toBe(14);
      expect(bankBudget(48000)).toBe(14_000_000);
      expect(bankBudget(96000)).toBe(28_000_000);
      expect(bankBudget(44100)).toBe(12_862_500);
      expect(new SoundBank(48000).limit).toBe(14_000_000);
    });

    /** Three single-variant sounds fit, a fourth does not. */
    const FOUR = [ONE, sfxIndexOf('ui_toggle'), sfxIndexOf('ui_error'), sfxIndexOf('wave_start')];

    async function bakeAll(small: SoundBank, order: number[]): Promise<void> {
      for (const i of order) {
        void small.ensure(i);
        await landAll(1000);
      }
    }

    it('drops the least recently played sound when a bake would pass it, and nothing else', async () => {
      const small = new SoundBank(48000, 3 * BYTES);
      await bakeAll(small, [FOUR[0] as number, FOUR[1] as number, FOUR[2] as number]);
      expect(small.bytes).toBe(3 * BYTES);
      // The first one is played again, so the second is the oldest.
      small.get(FOUR[0] as number);
      await bakeAll(small, [FOUR[3] as number]);
      expect(small.evicted).toBe(1);
      expect(small.get(FOUR[1] as number)).toBeUndefined();
      for (const i of [FOUR[0], FOUR[2], FOUR[3]]) expect(small.get(i as number)).toHaveLength(1);
      expect(small.bytes).toBe(3 * BYTES);
      small.dispose();
    });

    it('bakes a dropped sound again on its next use', async () => {
      const small = new SoundBank(48000, 2 * BYTES);
      await bakeAll(small, [FOUR[0] as number, FOUR[1] as number, FOUR[2] as number]);
      expect(small.get(FOUR[0] as number)).toBeUndefined();
      expect(small.left(FOUR[0] as number)).toBe(1);
      await bakeAll(small, [FOUR[0] as number]);
      expect(small.get(FOUR[0] as number)).toHaveLength(1);
      expect(small.evicted).toBe(2);
      small.dispose();
    });

    it('never drops a sound that is still baking, nor the one that has just landed', async () => {
      const small = new SoundBank(48000, 2 * BYTES);
      await bakeAll(small, [FOUR[0] as number]);
      // The first sound has a second render in flight (its next variant) while others land.
      small.bakeStep(THREE);
      small.bakeStep(THREE);
      void small.ensure(FOUR[1] as number);
      void small.ensure(FOUR[2] as number);
      const jobs = baking.jobs.splice(0);
      for (const job of jobs.filter((j) => j.key.includes('ui_toggle') || j.key.includes('ui_error'))) job.land();
      await settle();
      // hit_light's two renders are in flight and own no bytes yet, so they cannot be dropped; the oldest finished sound goes instead.
      expect(small.get(FOUR[0] as number)).toBeUndefined();
      expect(small.get(FOUR[2] as number)).toHaveLength(1);
      for (const job of jobs.filter((j) => j.key.includes('hit_light'))) job.land();
      await settle();
      expect(small.get(THREE)).toHaveLength(2);
      expect(small.bytes).toBeLessThanOrEqual(2 * BYTES + 1);
      small.dispose();
    });
  });

  it('bakes a queued list one sound at a time, in the order given, and skips what is baked', async () => {
    vi.useFakeTimers();
    try {
      const queued = new SoundBank(48000);
      void queued.ensure(ONE);
      await landAll();
      queued.enqueue([ONE, TWO, THREE]);
      await vi.advanceTimersByTimeAsync(30);
      expect(baking.jobs.map((j) => j.key)).toEqual(['sfx:ui_click']);
      await landAll();
      expect(queued.complete(TWO)).toBe(true);
      await vi.advanceTimersByTimeAsync(30);
      expect(baking.jobs.some((j) => j.key === 'sfx:hit_light')).toBe(true);
      queued.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
