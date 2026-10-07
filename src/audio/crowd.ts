/**
 * Dev tooling (reached only through `window.__dbg.audio.crowd`): drive the live engine with a crowded fight on a wall-clock timer and
 * report what it cost: how many sounds were asked for and played, which rule dropped the rest, how many voices and nodes it carried.
 * The numbers in docs/handoff/audio.md come from here. The stream is the one `report.ts` renders offline (16 impacts a second with
 * their enemy's answer, 8 releases, 4 deaths, a crit, a heavy blow, 5 coins, a blast every 2 s, all times `speed`), with the cats
 * and enemies drawn at random so nothing repeats; the director would thin it before it reaches the engine, so this is worse than a game.
 */
import { Rng } from '@/core/rng';
import { ENEMY_IDS, UNIT_IDS } from '@/game/api';
import type { SfxId } from './api';
import { attackSfx, critSfx, foeDieSfx, foeHitSfx, impactSfx, type CombatCue } from './combat';
import type { AudioEngine, AudioStats } from './engine';

export interface CrowdRow {
  speed: number;
  seconds: number;
  requested: number;
  played: number;
  dropped: AudioStats['sfxDropped'];
  /** Pooled voice chains (gain + panner each), the most sources sounding at once, and the most fight voices at once. */
  pooledVoices: number;
  peakSources: number;
  activePeak: number;
  combatPeak: number;
  musicLive: number;
  musicPeak: number;
  skippedMusicSteps: number;
  bakedKB: number;
}

interface Stream {
  every: number;
  next: number;
  fire: () => void;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function crowd(engine: AudioEngine, speed: number, seconds: number): Promise<CrowdRow> {
  const rng = new Rng(7);
  const unit = () => UNIT_IDS[Math.floor(rng.next() * UNIT_IDS.length)] as (typeof UNIT_IDS)[number];
  const enemy = () => ENEMY_IDS[Math.floor(rng.next() * ENEMY_IDS.length)] as (typeof ENEMY_IDS)[number];
  let requested = 0;
  const play = (cue: CombatCue): void => {
    requested++;
    engine.play(cue.id, { volume: cue.volume, pitch: cue.pitch });
  };
  const direct = (id: SfxId, volume = 1): void => {
    requested++;
    engine.play(id, { volume });
  };
  const streams: Stream[] = [
    { every: 1 / 16, next: 0, fire: () => (play(impactSfx(unit())), play(foeHitSfx(enemy()))) },
    { every: 1 / 8, next: 0, fire: () => play(attackSfx(unit())) },
    { every: 1 / 4, next: 0, fire: () => play(foeDieSfx(enemy())) },
    { every: 1, next: 0, fire: () => { const u = unit(); play(impactSfx(u)); play(critSfx(u)); } },
    { every: 1.1, next: 0, fire: () => direct('hit_heavy', 0.5) },
    { every: 0.2, next: 0, fire: () => direct('coin') },
    { every: 2, next: 0, fire: () => direct('explosion', 0.35) },
  ];

  // Bake everything the stream uses first (a first play of an unbaked sound is dropped when it is late), then bring the battle track up.
  const ids = new Set<SfxId>(['hit_heavy', 'coin', 'explosion']);
  for (const u of UNIT_IDS) [attackSfx(u), impactSfx(u), critSfx(u)].forEach((c) => ids.add(c.id));
  for (const e of ENEMY_IDS) [foeHitSfx(e), foeDieSfx(e)].forEach((c) => ids.add(c.id));
  await engine.prime([...ids]);
  engine.music('battle', 0.05);
  engine.setIntensity(1);
  await wait(2500);
  engine.resetStats();

  let peakSources = 0;
  let last = performance.now();
  const t0 = last;
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000) * speed;
      last = now;
      for (const s of streams) {
        s.next -= dt;
        while (s.next <= 0) {
          s.fire();
          s.next += s.every;
        }
      }
      peakSources = Math.max(peakSources, engine.stats().nodes.sfxSources);
      if (now - t0 > seconds * 1000) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
  });

  const s = engine.stats();
  return {
    speed,
    seconds,
    requested,
    played: s.sfxPlayed,
    dropped: s.sfxDropped,
    pooledVoices: s.nodes.pooledVoices,
    peakSources,
    activePeak: s.sfxActivePeak,
    combatPeak: s.combatActivePeak,
    musicLive: s.nodes.musicLive,
    musicPeak: s.nodes.musicPeak,
    skippedMusicSteps: s.music?.skippedSteps ?? 0,
    bakedKB: s.bakedKB,
  };
}
