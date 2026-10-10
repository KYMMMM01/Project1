import { describe, expect, it } from 'vitest';
import type { EnemyId, EnemyState } from '@/game';
import { TICK } from '@/game/data/balance';
import { watchEncounters } from '@/view/hud/encounterWatch';
import { spawnTopics } from '@/view/hud/encounters';
import type { EnvImpl } from '@/view/hud/env';
import { advance, newSim } from './simHelpers';

/** What `watchEncounters` takes of the HUD's environment, as a spy: every card asked for, and with what priority. */
function spyEnv(sim: ReturnType<typeof newSim>, lessonOn = false): { env: EnvImpl; asked: Array<{ id: string; first: boolean }> } {
  const asked: Array<{ id: string; first: boolean }> = [];
  const env = {
    battle: sim,
    hints: { request: (id: string, _target: unknown, _onSelection = false, first = false): void => void asked.push({ id, first }) },
    on: <E extends object, K extends keyof E>(emitter: { on(type: K, fn: (p: E[K]) => void): () => void }, type: K, fn: (p: E[K]) => void): void => void emitter.on(type, fn),
    lessonOn: () => lessonOn,
    ctx: { ui: { call: () => undefined }, unitView: () => null },
  } as unknown as EnvImpl;
  return { env, asked };
}

const TARGETS = { gauge: {}, waveLabel: {}, previewLayer: {}, boss: {}, chips: {}, floor: {} } as never;

/** Runs a chapter-one run to the wave of `kind` and a little way into it, so the elite or boss has spawned. */
function toWave(wave: number): ReturnType<typeof newSim> {
  const sim = newSim({ mode: 'chapter' });
  advance(sim, 3.05);
  sim.wave = wave - 1;
  sim.stage = 'between';
  sim.stageTimer = TICK;
  return sim;
}

describe('which cards an enemy that has just spawned asks for', () => {
  it('asks for the elite or boss rule and then the boss\'s own trick, and for nothing else', () => {
    expect(spawnTopics('boss_cucumber', 'elite')).toEqual(['elite']);
    expect(spawnTopics('spray', 'elite')).toEqual(['elite']);
    expect(spawnTopics('boss_vacuum', 'boss')).toEqual(['boss', 'boss_vacuum']);
    // an escort of the wave, or any enemy of an ordinary wave, is not the wave's target
    expect(spawnTopics('cucumber', 'elite')).toEqual([]);
    expect(spawnTopics('cucumber', 'boss')).toEqual([]);
    expect(spawnTopics('boss_vacuum', 'normal')).toEqual([]);
  });
});

describe('the first elite and the first boss of a real run ask for their cards', () => {
  it('names the elite after the spawn event, so the card is asked for from what the enemy is, not from battle.boss', () => {
    const sim = toWave(4);
    const { env, asked } = spyEnv(sim);
    watchEncounters(env, TARGETS);
    let bossWhenAnnounced: EnemyState | null | undefined;
    let announced: EnemyId | null = null;
    sim.events.on('enemySpawn', ({ enemy }) => {
      if (enemy.id.startsWith('boss_') && announced === null) {
        announced = enemy.id;
        bossWhenAnnounced = sim.boss;
      }
    });
    advance(sim, 4);
    expect(sim.waveKind).toBe('elite');
    expect(announced).not.toBeNull();
    // the simulation names `boss` only after announcing the spawn: asking `battle.boss === enemy` there never matched
    expect(bossWhenAnnounced).toBeNull();
    expect(sim.boss).not.toBeNull();
    expect(asked).toContainEqual({ id: 'elite', first: true });
  });

  it('asks for the boss rule first, in front of the line, and then for its own trick behind it', () => {
    const sim = toWave(8);
    const { env, asked } = spyEnv(sim);
    watchEncounters(env, TARGETS);
    advance(sim, 4);
    expect(sim.waveKind).toBe('boss');
    const cards = asked.filter((a) => a.id === 'boss' || a.id.startsWith('boss_'));
    expect(cards.map((a) => a.id)).toEqual(['boss', 'boss_vacuum']);
    expect(cards.map((a) => a.first)).toEqual([true, false]);
  });

  it('asks for nothing at the start of an ordinary wave', () => {
    const sim = toWave(2);
    const { env, asked } = spyEnv(sim);
    watchEncounters(env, TARGETS);
    advance(sim, 4);
    expect(asked.filter((a) => a.id === 'elite' || a.id === 'boss' || a.id.startsWith('boss_'))).toEqual([]);
  });
});

describe('the king\'s card', () => {
  it('is left to the tutorial\'s own lesson while that lesson is still to come', () => {
    const sim = newSim({ mode: 'tutorial' });
    const ask = (lessonOn: boolean): string[] => {
      const { env, asked } = spyEnv(sim, lessonOn);
      // a king on the board with a view: the card's moment
      (env.ctx as unknown as { unitView: () => object }).unitView = () => ({});
      (env.ctx as unknown as { ui: { call: (s: number, fn: () => void) => void } }).ui.call = (_s, fn) => fn();
      watchEncounters(env, TARGETS);
      sim.units[0] = { uid: 99, id: 'w_samurai' } as never;
      sim.events.emit('summon', { unit: sim.units[0] as never, source: 'relic' });
      sim.units[0] = null;
      return asked.map((a) => a.id);
    };
    expect(ask(false)).toContain('awaken');
    expect(ask(true)).not.toContain('awaken');
  });
});
