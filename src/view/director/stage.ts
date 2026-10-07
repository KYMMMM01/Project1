/**
 * Shared services every staging handler uses: the director clock, sound with admission rules and pitch
 * ladders, rationed shake / hit-stop / slow motion / haptics, and tracked timers that die with the part.
 */
import { audio, type SfxId } from '@/audio';
import { haptic, type HapticId } from '@/core/haptics';
import type { Tween } from '@/core/tween';
import { fxShake, fxSettings, type Fx } from '@/fx';
import { enemyDef } from '@/game';
import type { BattleEvents, EnemyId } from '@/game';
import type { BattleContext } from '../context';
import { GapGate, HitStopGate, PitchLadder, SoundRule, WindowLimiter } from './policy';
import { ENEMY_TINT } from './palette';

/** One admission rule per family of sounds (guide 5.3): spacing plus a cap on voices started together. */
export function createRules() {
  // Everything a crowded fight repeats shares one budget (about 9 starts in any 0.3 s): the audio engine
  // has 24 voices in all, and a boss or a merge must always find one free.
  const chatter = new WindowLimiter(9, 0.3);
  return {
    shoot: new SoundRule(0.1, 2, 0.12, chatter),
    hit: new SoundRule(0.06, 3, 0.1, chatter),
    heavyHit: new SoundRule(0.14, 2, 0.2, chatter),
    crit: new SoundRule(0.15),
    die: new SoundRule(0.05, 4, 0.15, chatter),
    eliteDie: new SoundRule(0.2),
    coinTick: new SoundRule(0.04, 6, 0.2),
    status: new SoundRule(0.12, 2, 0.2, chatter),
    heal: new SoundRule(0.6, 0, 0, chatter),
    strike: new SoundRule(0.12, 2, 0.2, chatter),
    zone: new SoundRule(0.15),
    weaken: new SoundRule(0.5),
    summon: new SoundRule(0.05),
    merge: new SoundRule(0.06),
    ui: new SoundRule(0.08),
    big: new SoundRule(0.25),
  };
}

export type Rules = ReturnType<typeof createRules>;

/** Slots of the shake / haptic gates. */
export const Gate = {
  critShake: 0,
  eliteShake: 1,
  strikeShake: 2,
  critBuzz: 3,
  spark: 4,
  muzzle: 5,
  coinRain: 6,
  strikeFx: 7,
  enrage: 8,
  hazardCaption: 9,
  hazardBuzz: 10,
  hitShake: 11,
  bossShake: 12,
  count: 14,
} as const;

export interface EnemyInfo {
  radius: number;
  boss: boolean;
  elite: boolean;
  /** Boss or elite: bigger staging, shake allowed. */
  big: boolean;
  tint: number;
}

const infoCache = new Map<EnemyId, EnemyInfo>();

export function enemyInfo(id: EnemyId): EnemyInfo {
  let info = infoCache.get(id);
  if (!info) {
    const def = enemyDef(id);
    const boss = def.traits.includes('boss');
    const elite = def.traits.includes('elite');
    info = { radius: def.radius, boss, elite, big: boss || elite, tint: ENEMY_TINT[id] };
    infoCache.set(id, info);
  }
  return info;
}

export class Stage {
  /** Real seconds since the director started: the time base of every gate. */
  now = 0;
  readonly fx: Fx;
  readonly rules = createRules();
  readonly gates = new GapGate(Gate.count);
  readonly hitStopGate = new HitStopGate();
  /** Kill streak and merge chain ladders (shared by the sound and the HUD-free cues that follow them). */
  readonly killLadder = new PitchLadder(2, 5, 1);
  readonly mergeLadder = new PitchLadder(1.5, 5, 1);
  /** Sounds started, by id (debug counters shown through the director's stats). */
  readonly played: Record<string, number> = {};
  /** True while the boss death set piece is still playing: the victory staging waits for it. */
  bossSeqActive = false;
  /** The boss finale already played the victory stinger. */
  victorySounded = false;
  private readonly timers: Tween[] = [];
  private readonly frameHooks: ((dt: number) => void)[] = [];
  private readonly disposers: (() => void)[] = [];

  constructor(readonly ctx: BattleContext) {
    this.fx = ctx.fx;
  }

  /** 0 low, 1 mid, 2 high: how many optional layers a cue may add. */
  get detail(): 0 | 1 | 2 {
    return fxSettings.tier === 'low' ? 0 : fxSettings.tier === 'mid' ? 1 : 2;
  }

  get reduced(): boolean {
    return fxSettings.reducedMotion;
  }

  // ── time ──

  /** Register work that runs once per rendered frame (budget refills, loops, countdowns). */
  addFrame(fn: (dt: number) => void): void {
    this.frameHooks.push(fn);
  }

  tick(dt: number): void {
    this.now += dt;
    for (const fn of this.frameHooks) fn(dt);
  }

  /** Run `fn` after `seconds` of battle time (stretched by slow motion, frozen by pause). */
  later(seconds: number, fn: () => void): Tween {
    return this.keep(this.ctx.tweens.call(seconds, fn));
  }

  /** Run `fn` after `seconds` of real time (overlay choreography that must outlive a hit-stop). */
  laterReal(seconds: number, fn: () => void): Tween {
    return this.keep(this.ctx.ui.call(seconds, fn));
  }

  /** Register a tween so destroy() can cancel it. Settled ones are dropped lazily. */
  keep(t: Tween): Tween {
    if (this.timers.length >= 48) {
      let w = 0;
      for (const x of this.timers) if (x.alive) this.timers[w++] = x;
      this.timers.length = w;
    }
    this.timers.push(t);
    return t;
  }

  /** Register cleanup that runs when the director is destroyed (last registered runs first). */
  onDestroy(fn: () => void): void {
    this.disposers.push(fn);
  }

  destroy(): void {
    for (const t of this.timers) t.kill();
    this.timers.length = 0;
    for (let i = this.disposers.length - 1; i >= 0; i--) (this.disposers[i] as () => void)();
    this.disposers.length = 0;
    this.frameHooks.length = 0;
  }

  // ── sound ──

  /** One-shot with an admission rule and a little random detune (the same sound twice never sounds identical). */
  play(rule: SoundRule, id: SfxId, volume = 1, pitch = 1, detune = 0.05): boolean {
    if (!rule.allow(this.now)) return false;
    this.played[id] = (this.played[id] ?? 0) + 1;
    audio.play(id, { volume, pitch: detune > 0 ? pitch * (1 + (Math.random() * 2 - 1) * detune) : pitch });
    return true;
  }

  /** The same, pitched `step` degrees up the pentatonic scale (kill streaks, merge chains, coin ticks). */
  playStep(rule: SoundRule, id: SfxId, step: number, volume = 1, pitch = 1): boolean {
    if (!rule.allow(this.now)) return false;
    this.played[id] = (this.played[id] ?? 0) + 1;
    audio.playStep(id, step, { volume, pitch });
    return true;
  }

  /** Sounds a player's own action caused are never rationed. */
  direct(id: SfxId, volume = 1, pitch = 1): void {
    this.played[id] = (this.played[id] ?? 0) + 1;
    audio.play(id, { volume, pitch });
  }

  // ── rationed physical feedback ──

  /** Camera shake trauma (see fx Trauma), at most once per `gap` seconds per source. */
  shake(trauma: number, gate: number, gap = 0.15): void {
    if (this.gates.ready(gate, this.now, gap)) fxShake(trauma);
  }

  /** Global hit-stop. `force` skips the 400 ms spacing (boss death only). */
  stop(ms: number, force = false): void {
    const granted = this.hitStopGate.request(ms, this.now, this.reduced, force);
    if (granted > 0) this.ctx.freeze(granted);
  }

  /** Slow motion, never longer than 400 ms (guide hard cap) and never under reduced motion. */
  slow(scale: number, ms: number): void {
    if (this.reduced) return;
    this.ctx.slowmo(scale, Math.min(ms, 400));
  }

  buzz(id: HapticId, gate = -1, gap = 0.2): void {
    if (gate >= 0 && !this.gates.ready(gate, this.now, gap)) return;
    haptic(id);
  }

  // ── space ──

  /** Scene-space point to field space (the relic flourish and anything else aimed at the HUD). */
  fieldX(sceneX: number): number {
    return sceneX - this.ctx.layout.fieldX;
  }

  fieldY(sceneY: number): number {
    return sceneY - this.ctx.layout.fieldY;
  }
}

/** Subscribe to a simulation event for the lifetime of the director. */
export type Bus = <K extends keyof BattleEvents>(type: K, fn: (e: BattleEvents[K]) => void) => void;
