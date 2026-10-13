/**
 * Shared by the skill tests: a fingerprint of a whole seeded bot run (every event, in order, with its numbers, then the end state),
 * so "the simulation behaves exactly as before" can be a comparison of two short strings.
 *
 * Objects that carry a `uid` (cats, enemies, shots, zones) are written as `uid:id` only: the fingerprint must not change when a new
 * field is added to a public state object (the skills added `UnitState.sp`). Every other number is rounded to six decimals.
 */
import type { BattleEvents, BattleInit, BattleSnapshot } from '@/game/api';
import { TICK } from '@/game/data/balance';
import { createBot, type BotPolicy } from '@/game/sim/bots';
import { createBattle } from '@/game/sim/create';
import { Sim } from '@/game/sim/sim';

/** The events that existed before the skills: the fingerprint listens to these and nothing else. */
export const FINGERPRINT_EVENTS: readonly (keyof BattleEvents)[] = [
  'summon', 'summonOffer', 'move', 'swap', 'merge', 'molt', 'awaken', 'sell', 'attack', 'strike', 'projectileEnd', 'zoneStart', 'zoneEnd',
  'hit', 'status', 'pull', 'dodge', 'special', 'ricochet', 'shieldBreak', 'heal', 'enrage', 'enemySpawn', 'enemyDie', 'bossAbility',
  'hazardWarn', 'hazard', 'hazardEnd', 'weaken', 'sunbeams', 'laser', 'laserEnd', 'laserLock', 'waveStart', 'waveEnd', 'actClear',
  'relicOffer', 'relicGain', 'fish', 'purr', 'synergy', 'upgrade', 'pity', 'danger', 'overflow', 'rescued', 'defeat', 'revive', 'victory',
];

function write(v: unknown): string {
  if (v === null || v === undefined) return '~';
  switch (typeof v) {
    case 'number': return String(Math.round(v * 1e6) / 1e6);
    case 'boolean': return v ? 'T' : 'F';
    case 'string': return `"${v}"`;
    case 'object': {
      if (Array.isArray(v)) return `[${v.map(write).join(',')}]`;
      const o = v as Record<string, unknown>;
      if (typeof o.uid === 'number') return `${o.uid}:${String(o.id)}`;
      return `{${Object.keys(o).map((k) => `${k}=${write(o[k])}`).join(',')}}`;
    }
    default: return '?';
  }
}

/** 32-bit FNV-1a, folded over strings one at a time. */
function fold(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export interface RunPrint {
  /** Hex of the hash over every event, in order. */
  hash: string;
  events: number;
  victory: boolean;
  wave: number;
  /** Seconds, rounded to a millisecond. */
  time: number;
  /** Hex of the hash over the end statistics and the seven random streams. */
  end: string;
}

export interface PrintOptions {
  maxSeconds?: number;
  /** Resume from this wave-start save instead of starting fresh. */
  snapshot?: BattleSnapshot;
  /** Runs on the battle before anything is subscribed or stepped. */
  setup?: (s: Sim) => void;
  /** Called with every decision step (every 0.25 s) before the bot acts. */
  watch?: (s: Sim) => void;
}

/** Plays a bot run to its end (or `maxSeconds`) the way `playRun` does and fingerprints it. */
export function fingerprintRun(init: BattleInit, policy: BotPolicy, options: PrintOptions = {}): RunPrint {
  const b = options.snapshot ? createBattle(init, options.snapshot) : createBattle(init);
  if (!(b instanceof Sim)) throw new Error('not a Sim');
  options.setup?.(b);
  let h = 0x811c9dc5;
  let events = 0;
  for (const type of FINGERPRINT_EVENTS) {
    b.events.on(type, (p) => {
      events++;
      h = fold(fold(h, type), write(p));
    });
  }
  const bot = createBot(policy, init.seed + 7);
  const every = Math.max(1, Math.round(0.25 / TICK));
  const maxTicks = Math.round((options.maxSeconds ?? 1500) / TICK);
  let guard = 0;
  for (let tick = 0; tick < maxTicks && b.phase !== 'won' && b.phase !== 'lost'; tick++) {
    if (b.phase === 'choice') {
      bot.choose(b);
      if (b.phase === 'choice' && ++guard > 8) {
        if (b.pending?.kind === 'summon') b.pickSummon(0);
        else b.pickRelic(0);
        guard = 0;
      }
      continue;
    }
    guard = 0;
    if (tick % every === 0) {
      options.watch?.(b);
      bot.act(b);
    }
    b.step(TICK);
  }
  const end = fold(fold(0x811c9dc5, write(b.getStats())), b.rng.states().join(','));
  return {
    hash: (h >>> 0).toString(16), events, victory: b.phase === 'won', wave: b.wave, time: Math.round(b.time * 1000) / 1000,
    end: (end >>> 0).toString(16),
  };
}
