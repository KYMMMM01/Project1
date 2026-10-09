/** Battle music: the right track for the moment (the chapter's, the gold dungeon's, an elite's, a boss's) and an intensity that follows the crowd and the wave. */
import { audio, battleMusic, type MusicId } from '@/audio';
import { IntensityMeter, intensityTarget } from './policy';
import type { Stage } from './stage';

/** Intensity is pushed to the audio engine at most this often, and only when it moved. */
const PUSH_EVERY = 0.1;
const PUSH_DELTA = 0.02;

export class MusicService {
  private current: MusicId = 'none';
  private boss = false;
  /** An elite wave is on: the tension track plays until the elite is down or the wave is over. */
  private elite = false;
  private eliteWave = 0;
  private eliteSeen = false;
  private silent = false;
  private readonly meter = new IntensityMeter();
  private sent = -1;
  private sinceSent = 0;

  constructor(private readonly stage: Stage) {
    stage.addFrame((dt) => this.update(dt));
  }

  start(): void {
    this.silent = false;
    this.apply(1.2);
  }

  /** A boss wave begins (true) or its boss is gone (false): swap between the battle and boss tracks. */
  setBoss(on: boolean): void {
    if (this.boss === on) return;
    this.boss = on;
    this.apply(on ? 0.5 : 1.5);
  }

  /** An elite wave begins: the tension variation of the music, until its elite falls or the next wave starts (a boss wins over it). */
  setElite(on: boolean): void {
    if (this.elite === on) return;
    this.elite = on;
    this.eliteSeen = false;
    this.eliteWave = this.stage.ctx.battle.wave;
    this.apply(on ? 0.6 : 1.5);
  }

  /** Cut the music (victory and defeat bring their own stinger). */
  silence(fadeSeconds: number): void {
    this.silent = true;
    this.apply(fadeSeconds);
  }

  /** Back to the battle track after a revive. */
  resume(): void {
    this.silent = false;
    this.apply(0.6);
  }

  /** Lower the music under a big moment (depth is the fraction removed). */
  duck(depth: number, seconds: number): void {
    if (depth > 0 && seconds > 0) audio.duck(depth, seconds);
  }

  private apply(fade: number): void {
    const wanted: MusicId = this.silent ? 'none' : this.boss ? 'boss' : this.elite ? 'elite' : this.chapterTrack();
    if (wanted === this.current) return;
    this.current = wanted;
    audio.music(wanted, fade);
  }

  private chapterTrack(): MusicId {
    const { chapter, mode } = this.stage.ctx.battle.init;
    return battleMusic(chapter, mode);
  }

  private update(dt: number): void {
    if (this.silent) return;
    const b = this.stage.ctx.battle;
    if (this.elite) {
      if (b.boss) this.eliteSeen = true;
      if (b.wave !== this.eliteWave || (this.eliteSeen && !b.boss)) this.setElite(false);
    }
    const v = this.meter.update(intensityTarget(b.enemyCount, b.enemyCap, b.wave, b.totalWaves, this.boss), dt);
    this.sinceSent += dt;
    if (this.sinceSent < PUSH_EVERY || Math.abs(v - this.sent) < PUSH_DELTA) return;
    this.sinceSent = 0;
    this.sent = v;
    audio.setIntensity(v);
  }

  /** Where the meter is now (debug and tests). */
  get intensity(): number {
    return this.meter.value;
  }
}
