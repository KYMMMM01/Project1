import { describe, expect, it } from 'vitest';
import { GAP_SECONDS } from '@/soundboard/catalog';
import { Player, READY_TIMEOUT_MS, STACK_COUNT } from '@/soundboard/player';
import { FakeAudio, FakeSamples, FakeTimers, settle } from './soundboard-fakes';

function setup(random = (): number => 0.5) {
  const audio = new FakeAudio();
  const samples = new FakeSamples();
  const timers = new FakeTimers();
  const player = new Player(audio, samples, timers, random);
  return { audio, samples, timers, player };
}

describe('sound board player', () => {
  it('makes no sound until it is asked to', async () => {
    const { audio, samples } = setup();
    await settle();
    expect(audio.log).toEqual([]);
    expect(samples.log).toEqual([]);
  });

  it('plays one sound through the engine with the cue’s level, pitch and delay, after getting it ready', async () => {
    const { audio, player } = setup();
    const seconds = await player.play([{ sfx: 'hit_heavy', volume: 0.8, pitch: 0.9 }, { sfx: 'whoosh', volume: 0.3, at: 0.06 }]);
    expect(audio.calls('ready')[0]?.args[0]).toEqual(['hit_heavy', 'whoosh']);
    const plays = audio.calls('play');
    expect(plays).toHaveLength(2);
    expect(plays[0]?.args).toEqual(['hit_heavy', { volume: 0.8, pitch: 0.9, delay: 0 }]);
    expect(plays[1]?.args).toEqual(['whoosh', { volume: 0.3, pitch: 1, delay: 0.06 }]);
    // ready came before the first play
    expect(audio.log.findIndex((l) => l.fn === 'ready')).toBeLessThan(audio.log.findIndex((l) => l.fn === 'play'));
    expect(seconds).toBeGreaterThan(0.5);
  });

  it('climbs the ladder with playStep when a cue has a step', async () => {
    const { audio, player } = setup();
    await player.play([{ sfx: 'imp_r_star', step: 3 }]);
    expect(audio.calls('play')).toHaveLength(0);
    expect(audio.calls('playStep')[0]?.args.slice(0, 2)).toEqual(['imp_r_star', 3]);
  });

  it('plays a sample of the candidate packs through the sample player (loading it first)', async () => {
    const { audio, samples, player } = setup();
    await player.play([{ file: 'impact-sounds/impactMetal_heavy_001', volume: 0.7, at: 0.1 }]);
    expect(samples.calls('load')[0]?.args[0]).toBe('impact-sounds/impactMetal_heavy_001');
    expect(samples.calls('play')[0]?.args).toEqual(['impact-sounds/impactMetal_heavy_001', { volume: 0.7, pitch: 1, delay: 0.1 }]);
    expect(audio.sounding()).toEqual([]);
  });

  it('"x5 at 3x" plays the cues five times, one director gap apart, each a little detuned', async () => {
    let n = 0;
    const { audio, player } = setup(() => (n++ % 2 === 0 ? 1 : 0));
    await player.stack([{ sfx: 'hit_light' }], 'hit');
    const plays = audio.calls('play');
    expect(plays).toHaveLength(STACK_COUNT);
    const delays = plays.map((p) => (p.args[1] as { delay: number }).delay);
    delays.forEach((d, i) => expect(d).toBeCloseTo(i * GAP_SECONDS.hit, 6));
    const pitches = plays.map((p) => (p.args[1] as { pitch: number }).pitch);
    expect(new Set(pitches).size).toBeGreaterThan(1);
    for (const p of pitches) expect(Math.abs(p - 1)).toBeLessThanOrEqual(0.05 + 1e-9);
  });

  it('a stack of a ladder sound climbs one step per play', async () => {
    const { audio, player } = setup();
    await player.stack([{ sfx: 'coin' }], 'coinTick', true);
    expect(audio.calls('playStep').map((p) => p.args[1])).toEqual([0, 1, 2, 3, 4]);
  });

  it('a stack keeps the time order inside a cue sequence (a skill played five times)', async () => {
    const { audio, player } = setup();
    await player.stack([{ sfx: 'atk_w_samurai' }, { sfx: 'imp_w_samurai', at: 1.2 }], 'big');
    const delays = audio.calls('play').map((p) => (p.args[1] as { delay: number }).delay);
    expect(delays).toHaveLength(2 * STACK_COUNT);
    expect(Math.max(...delays)).toBeCloseTo(4 * GAP_SECONDS.big + 1.2, 6);
  });

  it('"both" plays the old one, then the new one after it has ended and a short pause', async () => {
    const { audio, player } = setup();
    audio.length = 0.4;
    await player.both([{ sfx: 'ui_click' }], [{ sfx: 'ui_confirm' }]);
    const plays = audio.calls('play');
    expect(plays.map((p) => p.args[0])).toEqual(['ui_click', 'ui_confirm']);
    const second = (plays[1]?.args[1] as { delay: number }).delay;
    expect(second).toBeGreaterThan(0.4);
    expect(second).toBeLessThan(1.2);
    expect((plays[0]?.args[1] as { delay: number }).delay).toBe(0);
  });

  it('a stinger at time zero starts at once, a later one by a timer that "stop" can drop', async () => {
    const { audio, timers, player } = setup();
    await player.play([{ stinger: 'victory' }, { stinger: 'level_up', at: 1 }]);
    expect(audio.calls('stinger').map((s) => s.args[0])).toEqual(['victory']);
    timers.advance(1000);
    expect(audio.calls('stinger').map((s) => s.args[0])).toEqual(['victory', 'level_up']);
    await player.play([{ stinger: 'defeat', at: 2 }]);
    player.stopAll();
    timers.advance(5000);
    expect(audio.calls('stinger').map((s) => s.args[0])).toEqual(['victory', 'level_up']);
  });

  it('stop-all silences the engine and the samples, and a play that was still getting ready does not start afterwards', async () => {
    const { audio, samples, player } = setup();
    let release: () => void = () => undefined;
    audio.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = player.play([{ sfx: 'boss_roar' }]);
    await settle();
    expect(audio.sounding()).toEqual([]);
    player.stopAll();
    expect(audio.calls('stopAll')).toHaveLength(1);
    expect(samples.calls('stopAll')).toHaveLength(1);
    release();
    expect(await pending).toBe(0);
    expect(audio.sounding()).toEqual([]);
    // and the player works again afterwards
    audio.hold = null;
    await player.play([{ sfx: 'boss_roar' }]);
    expect(audio.calls('play')).toHaveLength(1);
  });

  it('plays anyway when a sound takes too long to get ready', async () => {
    const { audio, timers, player } = setup();
    audio.hold = new Promise<void>(() => undefined);
    const pending = player.play([{ sfx: 'boss_roar' }]);
    await settle();
    expect(audio.sounding()).toEqual([]);
    timers.advance(READY_TIMEOUT_MS + 100);
    await pending;
    expect(audio.calls('play')).toHaveLength(1);
  });

  it('plays a sample that could not be loaded as silence, without an error', async () => {
    const { samples, player } = setup();
    samples.seconds = null;
    await expect(player.play([{ file: 'rpg-audio/missing' }])).resolves.toBeGreaterThanOrEqual(0);
  });
});
