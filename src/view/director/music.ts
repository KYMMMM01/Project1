/** Battle music: the right track for the moment and an intensity that follows the crowd and the wave. */
import { audio, type MusicId } from '@/audio';
import { IntensityMeter, intensityTarget } from './policy';
import type { Stage } from './stage';

/** Intensity is pushed to the audio engine at most this often, and only when it moved. */
const PUSH_EVERY = 0.1;
const PUSH_DELTA = 0.02;

export class MusicService {
  private current: MusicId = 'none';
  private boss = false;
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
    const wanted: MusicId = this.silent ? 'none' : this.boss ? 'boss' : 'battle';
    if (wanted === this.current) return;
    this.current = wanted;
    audio.music(wanted, fade);
  }

  private update(dt: number): void {
    if (this.silent) return;
    const b = this.stage.ctx.battle;
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
