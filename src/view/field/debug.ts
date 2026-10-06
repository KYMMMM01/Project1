/**
 * Debug-only route into the battle (`?scene=battle&chapter=N&stake=N&seed=N&mode=...&sandbox=1&runs=N`)
 * and the QA hooks on `window.__dbg.battle`. Loaded lazily from main.ts, never part of the normal flow.
 */
import { debugExpose } from '@/core/debug';
import { scenes } from '@/core/scene';
import { BootScene } from '@/scenes/BootScene';
import { BattleScene, setBattleCreatedHook } from '@/scenes/BattleScene';
import { BASE_UNIT_IDS, CHAPTERS, MAX_STAKE, RELIC_IDS, TICK, type BattleApi, type BattleMode, type EnemyId } from '@/game';
import { createBot } from '@/game/sim/bots';
import { spawnEnemy, killEnemy, removeEnemy } from '@/game/sim/enemies';
import { addFish, addPurr } from '@/game/sim/economy';
import { Sim } from '@/game/sim/sim';
import { audio } from '@/audio';
import type { RunConfig } from '../context';
import { DEFAULT_RUG } from './rugSkins';

const MODES: readonly BattleMode[] = ['tutorial', 'chapter', 'daily', 'endless'];

function int(params: URLSearchParams, key: string, fallback: number, lo: number, hi: number): number {
  const v = Number(params.get(key));
  return params.has(key) && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback;
}

/** A run built from the query string, with every base cat at level 1 and the whole toy pool. */
export function runFromQuery(params: URLSearchParams): RunConfig {
  const mode = params.get('mode');
  return {
    init: {
      seed: int(params, 'seed', 7, 0, 0x7fffffff),
      mode: MODES.find((m) => m === mode) ?? 'chapter',
      chapter: int(params, 'chapter', 1, 1, CHAPTERS.length),
      stake: int(params, 'stake', 0, 0, MAX_STAKE),
      loadout: {
        unitLevels: Object.fromEntries(BASE_UNIT_IDS.map((id) => [id, int(params, 'level', 1, 1, 10)])),
        training: {},
        relicPool: [...RELIC_IDS],
      },
    },
    rugSkin: params.get('rug') ?? DEFAULT_RUG,
    fxTheme: params.get('fx') ?? 'fx_default',
    runsPlayed: int(params, 'runs', 0, 0, 999),
    sandbox: params.get('sandbox') === '1',
  };
}

export async function openDebugBattle(params: URLSearchParams): Promise<void> {
  const run = runFromQuery(params);
  setBattleCreatedHook(installBattleDebug);
  await scenes.goto(() => new BootScene(() => new BattleScene(run)), 'none');
}

/**
 * Plays the real simulation forward at full speed with the synergy bot, so a screenshot can start
 * from a believable mid-run board. With `clear` the field is emptied at every decision step (silent
 * removal for ordinary enemies, a real kill for elites and bosses so waves still end).
 */
function drive(b: BattleApi, sim: Sim, until: () => boolean, clear: boolean): void {
  const bot = createBot('synergy', b.init.seed + 7);
  const every = Math.round(0.25 / TICK);
  let stuck = 0;
  for (let tick = 0; tick < 600000 && !until() && b.phase !== 'won' && b.phase !== 'lost'; tick++) {
    if (b.phase === 'choice') {
      bot.choose(b);
      if (b.phase === 'choice' && ++stuck > 8) {
        if (b.pending?.kind === 'summon') b.pickSummon(0);
        else b.pickRelic(0);
        stuck = 0;
      }
      continue;
    }
    if (tick % every === 0) {
      bot.act(b);
      if (clear && !until()) {
        let paid = 0;
        for (const e of sim.enemies.slice()) {
          if (e.isBoss || e.isElite) killEnemy(sim, e, null);
          else {
            removeEnemy(sim, e);
            paid += e.spec.bounty;
          }
        }
        // Silent income for the removed ones, so the bot can keep building without a flood of events.
        sim.fish += paid;
      }
    }
    b.step(TICK);
  }
}

export function installBattleDebug(scene: BattleScene): void {
  const b = scene.battle;
  const sim = b instanceof Sim ? b : null;
  const need = (): Sim => {
    if (!sim) throw new Error('debug hooks need the real simulation');
    return sim;
  };
  const quiet = (fn: () => void): void => {
    audio.setMuted(true);
    try {
      fn();
    } finally {
      audio.setMuted(false);
      scene.ctx.fx.clear();
    }
  };
  debugExpose('battle', {
    scene,
    ctx: scene.ctx,
    battle: b,
    give(fish: number, purr = 0): void {
      const s = need();
      addFish(s, fish, 'start');
      addPurr(s, purr, 'start');
    },
    /** Play on with the bot until wave `n` has just started. */
    skipToWave(n: number): void {
      // Nobody is told about the fast-forward (no offers, banners or sounds): every view reads the state afterwards.
      const ev = b.events;
      const emit = ev.emit;
      ev.emit = () => undefined;
      try {
        quiet(() => drive(b, need(), () => b.wave >= n, true));
      } finally {
        ev.emit = emit;
      }
    },
    spawn(id: EnemyId, count = 1, from = 220): void {
      const s = need();
      for (let i = 0; i < count; i++) spawnEnemy(s, id, from + i * 30, s.baseHp(), false, id.startsWith('boss_') ? s.baseHp() * 400 : 0);
    },
    /** Let the bot play and clear the field until the run is won. */
    win(): void {
      quiet(() => drive(b, need(), () => false, true));
    },
    /** Flood the field with cucumbers and let the real overflow rule end the run. */
    lose(): void {
      const s = need();
      for (let i = 0; i < b.enemyCap + 6; i++) spawnEnemy(s, 'cucumber', (i * 37) % 1500, s.baseHp() * 50, false);
      for (let t = 0; t < 600 && b.phase !== 'lost'; t++) b.step(0.25);
    },
    setSpeed(n: number): void {
      scene.ctx.setSpeed(n);
    },
  });
}
