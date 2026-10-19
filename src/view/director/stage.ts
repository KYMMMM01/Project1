/**
 * Shared services every staging handler uses: the director clock, sound with admission rules and pitch
 * ladders, rationed shake / hit-stop / slow motion / haptics, and tracked timers that die with the part.
 */
import { audio, audioRandom, type PlayOpts, type SfxId } from '@/audio';
import { haptic, type HapticId } from '@/core/haptics';
import type { Tween } from '@/core/tween';
import { fxShake, fxSettings, type Fx } from '@/fx';
import { enemyDef } from '@/game';
import type { BattleEvents, EnemyId } from '@/game';
import type { BattleContext } from '../context';
import { bodyBox, bodySize } from '../field/policy';
import { GapGate, HitStopGate, PitchLadder, SoundRule, Volley, WindowLimiter } from './policy';
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
    // The cats' skills (`sp/`): a skill's scene is only running because the stage rule (`sp/stageRule.ts`) showed its cast, so its sounds are NOT thinned by
    // the fight's rules above (that is what swallowed the tiger's hoofbeats, the ninja's throws and the stars). `skill` is never refused: the signature of a
    // cast and every sound that happens once or twice in a skill (the whoosh of the arrow, a clone's hop, the capsule's bounce): the audio engine keeps one
    // of each id at a time anyway. `skillTick` is for what comes by the dozen (hoofbeats, stars, bolts, shards): at least 0.025 s apart and six starts in
    // any 0.12 s, in a budget of its own outside the fight's shared pool. A bunch that lands in the same instant (the bard's four notes, the alchemist's
    // small flasks) is not thinned but spread (`stagger`) into a quick arpeggio.
    skill: new SoundRule(0),
    skillTick: new SoundRule(0.025, 6, 0.12),
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
  /** The skills' scenes (`sp/`): one camera nudge per cast at most. */
  spShake: 13,
  count: 14,
} as const;

export interface EnemyInfo {
  radius: number;
  /** Drawn size of the body (px) and the box its numbers keep clear of: half the width, the reach above the centre (to the top of the health bar) and below it. */
  size: number;
  hw: number;
  top: number;
  bottom: number;
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
    const size = bodySize(def.radius, boss);
    info = { radius: def.radius, size, ...bodyBox(size), boss, elite, big: boss || elite, tint: ENEMY_TINT[id] };
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
  /** Blows that come from one shot (a pierce, a chain, a blast), told apart by weapon: the first is heard, the next ones fade (policy.ts `Volley`). */
  readonly volley = new Volley(32);
  readonly killLadder = new PitchLadder(2, 5, 1);
  readonly mergeLadder = new PitchLadder(1.5, 5, 1);
  /** Sounds started, by id (debug counters shown through the director's stats). */
  readonly played: Record<string, number> = {};
  /** When the last sound of each kind that was held back (see `stagger`) starts, in the stage's seconds. */
  private readonly bunches = new Map<string, number>();
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

  /**
   * One-shot with an admission rule and a little random detune (the same sound twice never sounds identical). `pan` is -1 (left) to 1 (right), 0 the
   * middle: see `panOf`. `delay` starts it that many seconds from now, on the audio clock (a beat after another sound of the same moment, to the sample:
   * no timer, so it keeps its place under a hit-stop and a slow motion, and it is not lost with the scene).
   */
  play(rule: SoundRule, id: SfxId, volume = 1, pitch = 1, detune = 0.05, pan = 0, delay = 0): boolean {
    if (!rule.allow(this.now)) return false;
    this.emit(id, volume, pitch, detune, pan, delay);
    return true;
  }

  /**
   * `play` for the sounds of blows, which come in bunches: the sounds of blows that land in the same instant are spread over a few milliseconds each (`stagger` under `key`, at most
   * `max` gaps) so that they are heard as a quick run and not as one louder blow, and only a sound that the rule lets through takes a place in the run.
   */
  playSpread(rule: SoundRule, id: SfxId, volume: number, pitch: number, detune: number, pan: number, key: string, gap: number, max = 3): boolean {
    if (!rule.allow(this.now)) return false;
    this.emit(id, volume, pitch, detune, pan, this.stagger(key, gap, max));
    return true;
  }

  private emit(id: SfxId, volume: number, pitch: number, detune: number, pan: number, delay: number): void {
    this.played[id] = (this.played[id] ?? 0) + 1;
    // (the detune is drawn from the seeded stream of the audio module, not Math.random: the same fight gives the same sounds)
    const p = detune > 0 ? pitch * (1 + (audioRandom() * 2 - 1) * detune) : pitch;
    const opts: PlayOpts = { volume, pitch: p };
    if (pan !== 0) opts.pan = pan;
    if (delay > 0) opts.delay = delay;
    audio.play(id, opts);
  }

  /** The same, pitched `step` degrees up the pentatonic scale (kill streaks, merge chains, coin ticks). */
  playStep(rule: SoundRule, id: SfxId, step: number, volume = 1, pitch = 1, pan = 0, delay = 0): boolean {
    if (!rule.allow(this.now)) return false;
    this.played[id] = (this.played[id] ?? 0) + 1;
    const opts: PlayOpts = { volume, pitch };
    if (pan !== 0) opts.pan = pan;
    if (delay > 0) opts.delay = delay;
    audio.playStep(id, step, opts);
    return true;
  }

  /**
   * How long to hold back the next sound of a kind so that it starts at least `gap` seconds after the one before (a bunch that lands in the same instant is
   * heard as a quick run, not as one sound on top of another: an engine drops a second start of the same id that close behind the first). The first of a
   * bunch plays at once; a sound is held back at most `max` gaps (a bigger bunch than that piles up at the end of the run). `key` names the kind.
   */
  stagger(key: string, gap: number, max = 3): number {
    const start = Math.min(Math.max(this.now, (this.bunches.get(key) ?? -1e9) + gap), this.now + max * gap);
    this.bunches.set(key, start);
    return start - this.now;
  }

  /**
   * Where a sound at scene x is heard from: a fifth of the way to the side per fifth of the screen, never past 0.6, so that a phone held in the hand
   * hears the ninja's clone on its own side and a phone with one speaker hears nothing change.
   */
  panOf(sceneX: number): number {
    const w = this.ctx.layout?.w || 720;
    const p = ((sceneX - w / 2) / (w / 2)) * 0.6;
    return p < -0.6 ? -0.6 : p > 0.6 ? 0.6 : Math.round(p * 100) / 100;
  }

  /** `panOf` for a point of the field space (an enemy's x, the centre of a cell): the 720 px wide field sits at `layout.fieldX` in the scene. */
  panOfField(fieldX: number): number {
    return this.panOf(fieldX + (this.ctx.layout?.fieldX ?? 0));
  }

  /** Sounds a player's own action caused are never rationed (nor are the ones of the fight that have a rule of their own elsewhere); `pan` and `delay` as in `play`. */
  direct(id: SfxId, volume = 1, pitch = 1, pan = 0, delay = 0): void {
    this.played[id] = (this.played[id] ?? 0) + 1;
    const opts: PlayOpts = { volume, pitch };
    if (pan !== 0) opts.pan = pan;
    if (delay > 0) opts.delay = delay;
    audio.play(id, opts);
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
