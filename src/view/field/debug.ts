/**
 * Debug-only route into the battle (`?scene=battle&chapter=N&stake=N&seed=N&mode=...&sandbox=1&runs=N`)
 * and the QA hooks on `window.__dbg.battle`. Loaded lazily from main.ts, never part of the normal flow.
 */
import { debugExpose } from '@/core/debug';
import { setLang } from '@/core/i18n';
import { scenes } from '@/core/scene';
import { skillsOn } from '@/core/skillSwitch';
import { BootScene } from '@/scenes/BootScene';
import { BattleScene, setBattleCreatedHook } from '@/scenes/BattleScene';
import { BASE_UNIT_IDS, CHAPTERS, MAX_STAKE, RELIC_IDS, TICK, unitSpec, type BattleApi, type BattleMode, type EnemyId, type HazardKind, type RelicId, type UnitId } from '@/game';
import { createBot } from '@/game/sim/bots';
import { spawnEnemy, killEnemy, removeEnemy } from '@/game/sim/enemies';
import { scheduleHazard } from '@/game/sim/hazards';
import { makeUnit, refresh } from '@/game/sim/board';
import { addFish, addPurr } from '@/game/sim/economy';
import { gainRelic } from '@/game/sim/flow';
import { Sim } from '@/game/sim/sim';
import { audio } from '@/audio';
import { warm } from '@/fx';
import type { RunConfig } from '../context';
import { DEFAULT_RUG } from './rugSkins';

const MODES: readonly BattleMode[] = ['tutorial', 'chapter', 'daily', 'endless', 'gold'];

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
      // The same switch as every real run: `?sp=1` / `?sp=0` or the constant (core/skillSwitch.ts).
      sp: skillsOn(params),
    },
    rugSkin: params.get('rug') ?? DEFAULT_RUG,
    fxTheme: params.get('fx') ?? 'fx_default',
    runsPlayed: int(params, 'runs', 0, 0, 999),
    sandbox: params.get('sandbox') === '1',
  };
}

export async function openDebugBattle(params: URLSearchParams): Promise<void> {
  const lang = params.get('lang');
  if (lang === 'ko' || lang === 'en') setLang(lang);
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
    /** Replace the board with `{ cell: unitId }` (stats refreshed; the field shows it on the next frame). */
    board(units: Record<number, UnitId>): void {
      const s = need();
      s.units.fill(null);
      for (const [cell, id] of Object.entries(units)) s.units[Number(cell)] = makeUnit(s, id, Number(cell), 0);
      refresh(s);
    },
    /** Pick toy `id` as if the player had chosen it (its effect, its marks on the board and the shelf's icon follow). */
    relic(id: RelicId): void {
      gainRelic(need(), id);
    },
    // ── the cats' skills (use with `?sp=1`; docs/handoff/skills1_view.md, "Debug helpers") ──
    /** Stand cat `id` on `cell` (whatever stood there is replaced) with its skill gauge at `gauge` 0..1 (default: the start value, a half). */
    put(cell: number, id: UnitId, gauge?: number): void {
      const s = need();
      s.units[cell] = makeUnit(s, id, cell, 0, gauge === undefined ? undefined : Math.min(1, Math.max(0, gauge)));
      refresh(s);
    },
    /** Set the gauge of the skill cat on `cell` to `value` 0..1. A full gauge casts in the next tick when the skill's own condition holds, and waits full until it does. */
    gauge(cell: number, value: number): void {
      const u = need().units[cell];
      if (!u) throw new Error(`no cat on cell ${cell}`);
      if (!u.spec.spSkill) throw new Error(`${u.id} has no skill`);
      u.sp = Math.min(1, Math.max(0, value));
      u.spCheckAt = 0;
    },
    /** Set the gauge of every skill cat on the board at once. */
    gaugeAll(value: number): void {
      for (const u of need().units) {
        if (!u || !u.spec.spSkill) continue;
        u.sp = Math.min(1, Math.max(0, value));
        u.spCheckAt = 0;
      }
    },
    /** The cats with a skill, in cell order: plain data (cell, id, uid, gauge, cooldown in seconds, blocked). */
    skillCats(): Array<{ cell: number; id: UnitId; uid: number; sp: number; cooldown: number; blocked: boolean }> {
      const out: Array<{ cell: number; id: UnitId; uid: number; sp: number; cooldown: number; blocked: boolean }> = [];
      for (const u of b.units) {
        const def = u ? unitSpec(u.id).spSkill : undefined;
        if (u && def) out.push({ cell: u.cell, id: u.id, uid: u.uid, sp: u.sp, cooldown: def.cooldown, blocked: u.blocked });
      }
      return out;
    },
    /** A crowd of `n` sturdy `id` enemies in a row on the road, `gap` px apart from `from` px of road (they do not die in a screenshot: `hp` times the base health). */
    crowd(n = 16, id: EnemyId = 'cucumber', from = 120, gap = 30, hp = 60): void {
      const s = need();
      for (let i = 0; i < n; i++) spawnEnemy(s, id, from + i * gap, s.baseHp() * hp, false);
    },
    /** An elite (`spray`, `firecracker`) with a wall of health at `from` px of road. */
    elite(id: EnemyId = 'spray', from = 200, hp = 400): void {
      const s = need();
      spawnEnemy(s, id, from, s.baseHp() * hp, false);
    },
    /** A boss (`boss_blender` ...) at `from` px of road with the sim's usual boss health. */
    boss(id: EnemyId = 'boss_blender', from = 200): void {
      const s = need();
      spawnEnemy(s, id, from, s.baseHp(), false, s.baseHp() * 400);
    },
    /** Hold the battle (pause reason 'user') or let it run again. */
    hold(on = true): void {
      scene.ctx.setPaused('user', on);
    },
    /**
     * Run `seconds` of the whole battle frame by frame (1/60 s each: the simulation, the field, the director, the effects) while it is held,
     * and hold it again: for a screenshot of the exact moment of a cast. Without `hold(true)` first it just plays on.
     */
    step(seconds: number, frame = 1 / 60): void {
      const held = scene.pauseReasons().includes('user');
      if (held) scene.ctx.setPaused('user', false);
      for (let t = 0; t < seconds - 1e-9; t += frame) scene.update(frame);
      if (held) scene.ctx.setPaused('user', true);
    },
    /** What the stage rule did and which rings pulse (QA): casts shown and lost, runs in flight, the cats whose rings pulse now in the order they became full. */
    spState(): { shown: number; lost: number; runs: number; pulsing: number[] } {
      const dir = (window as unknown as { __dbg?: { spStage?: { stats(): { shown: number; lost: number; runs: number } } } }).__dbg?.spStage;
      const stats = dir ? dir.stats() : { shown: 0, lost: 0, runs: 0 };
      const rings = (window as unknown as { __dbg?: { spRings?: { pulsing(): number[] } } }).__dbg?.spRings;
      return { ...stats, pulsing: rings ? rings.pulsing() : [] };
    },
    /** `hp` scales the health (a strip of one weapon needs an enemy that is still there at the end). */
    spawn(id: EnemyId, count = 1, from = 220, hp = 1): void {
      const s = need();
      for (let i = 0; i < count; i++) spawnEnemy(s, id, from + i * 30, s.baseHp() * hp, false, id.startsWith('boss_') ? s.baseHp() * 400 : 0);
    },
    /** Announce a cell hazard now (the warning, then `duration` seconds on the cells), as a boss or the spray elite would. */
    hazard(kind: HazardKind, cells: number[], duration = 4): void {
      scheduleHazard(need(), kind, cells, duration);
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
    lang(l: 'ko' | 'en'): void {
      setLang(l);
    },
    /** What the first-use warm-up has left to do and what runs next (see src/fx/warm.ts). */
    warmLeft(): { pending: number; next: string | null; done: number } {
      return { pending: warm.pending, next: warm.next, done: warm.finished };
    },
    /** Pause reasons held right now (a reason that stays after every popup closed is a bug). */
    pauseReasons(): string[] {
      return scene.pauseReasons();
    },
  });
}
