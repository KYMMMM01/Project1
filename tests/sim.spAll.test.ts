/**
 * The twelve skills side by side (docs/design_skills_v2.md 4.5; the review of step 2). Every skill has its own test file; this one holds what
 * they cannot see from where they stand:
 *
 *  - a board with all twelve skill cats in every mode, played twice: the same events, the same end, no number that is not a number, every
 *    gauge in [0, 1], at most six clouds, a delayed list that is in order and does not pile up;
 *  - the pairs that touch each other: the alchemist's small flask taking a cloud's host or a samurai's mark off the field.
 */
import { describe, expect, it } from 'vitest';
import { SP_SKILL_IDS, type BattleEvents, type SpSkillId } from '@/game/api';
import { SP_ROWS, SP_UNIT_OF } from '@/game/data/spSkills';
import { spawnEnemy } from '@/game/sim/enemies';
import { cloud } from '@/game/sim/sp/cloud';
import { cut } from '@/game/sim/sp/cut';
import { fish } from '@/game/sim/sp/fish';
import type { Sim } from '@/game/sim/sim';
import type { SimEnemy, SimUnit } from '@/game/sim/types';
import { advance, foe, initOf, newSim, put, quietWave, record } from './simHelpers';
import { fingerprintRun } from './spHelpers';

/** Every event the twelve skills add, for the fingerprint (the helper's own list is the one the game had before the skills). */
const SKILL_EVENTS: readonly (keyof BattleEvents)[] = [
  'spCast', 'spRunHit', 'spRunBurst', 'spRunEnd', 'bite', 'cutOpen', 'cloneThrow', 'cloneStep', 'cloneEnd', 'cloudBolt', 'cloudHop', 'cloudEnd',
  'meteorLand', 'craterEnd', 'fishEnd', 'capsuleOpen', 'promote',
];

// ───────────────────────────── all twelve on one board ─────────────────────────────

/** The twelve cats of the twelve skills, one on each of the first twelve tiles. */
function twelve(s: Sim): void {
  SP_SKILL_IDS.forEach((id, i) => {
    put(s, i, SP_UNIT_OF[id]);
  });
}

/** What must hold at every look, whatever the cats do: no broken number, no gauge outside its range, the clouds under their cap. */
function checkSim(s: Sim, where: string): void {
  for (const u of s.units) {
    if (!u) continue;
    expect(Number.isFinite(u.sp) && u.sp >= 0 && u.sp <= 1 + 1e-9, `${where}: gauge of ${u.id} is ${u.sp}`).toBe(true);
    expect(Number.isFinite(u.charge), `${where}: charge of ${u.id}`).toBe(true);
    expect(u.clone.length <= SP_ROWS.clones.clones, `${where}: clones of ${u.id}`).toBe(true);
  }
  for (const e of s.enemies) {
    expect(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp) && Number.isFinite(e.travelled), `${where}: enemy ${e.uid} ${e.id}`).toBe(true);
    expect(e.travelled >= 0, `${where}: enemy ${e.uid} travelled ${e.travelled}`).toBe(true);
  }
  expect(Number.isFinite(s.fish) && Number.isFinite(s.purr) && s.purr >= 0 && s.fish >= 0, `${where}: money ${s.fish} / ${s.purr}`).toBe(true);
  expect(s.clouds.length <= SP_ROWS.cloud.cap, `${where}: ${s.clouds.length} clouds`).toBe(true);
  // The delayed list is in order of due time and is a short list, never a pile.
  for (let i = 1; i < s.later.length; i++) expect((s.later[i - 1] as { at: number }).at <= (s.later[i] as { at: number }).at, `${where}: order of the delayed list`).toBe(true);
  expect(s.later.length <= 64, `${where}: ${s.later.length} delayed items`).toBe(true);
}

describe('all twelve skill cats on one board', () => {
  const MODES: Array<{ name: string; over: Parameters<typeof initOf>[0] }> = [
    { name: 'chapter', over: { mode: 'chapter', chapter: 3 } },
    { name: 'daily with its rules', over: { mode: 'daily', chapter: 2, modifiers: ['swarm', 'rush'] } },
    { name: 'endless', over: { mode: 'endless', chapter: 3 } },
    { name: 'gold dungeon', over: { mode: 'gold', chapter: 1 } },
    { name: 'tutorial', over: { mode: 'tutorial', chapter: 1 } },
  ];
  /** Which skills cast over all the runs of this file (checked once at the end: the board really exercises most of them). */
  const cast = new Set<SpSkillId>();

  for (const m of MODES) {
    it(`plays the ${m.name} mode with all twelve, twice, to the same events and the same end, with every number sane`, { timeout: 60_000 }, () => {
      for (const seed of [96001, 96002]) {
        const play = (): { print: string; casts: number } => {
          let casts = 0;
          const print = fingerprintRun(initOf({ ...m.over, seed }, 3), 'synergy', {
            maxSeconds: 400,
            extraEvents: SKILL_EVENTS,
            setup(s) {
              twelve(s);
              s.events.on('spCast', (e) => {
                casts++;
                cast.add(e.skill);
              });
            },
            watch(s) {
              checkSim(s, `${m.name} ${seed} t=${s.time.toFixed(2)}`);
            },
          });
          return { print: `${print.hash}/${print.end}/${print.events}/${print.time}`, casts };
        };
        const a = play();
        const b = play();
        expect(b, `${m.name} ${seed}`).toEqual(a);
        expect(a.casts, `${m.name} ${seed}: casts`).toBeGreaterThan(0);
      }
    });
  }

  it('casts most of the twelve skills somewhere in those runs (the board is not a decoration)', () => {
    // Runs on the same files above filled `cast`; ten runs of up to 400 s cast all twelve of them when this was written, and a skill that never casts there would be one nothing tests here.
    expect(cast.size).toBeGreaterThanOrEqual(10);
  });
});

// ───────────────────────────── pairs that touch ─────────────────────────────

/** A battle in a wave with the scripted spawns cancelled and the wave made endless. */
function arena(): Sim {
  const sim = newSim();
  quietWave(sim);
  sim.waveDuration = 1e6;
  return sim;
}

/** An ordinary enemy of a wave whose cucumber has 100 health, with `hp` left, held on the top edge of the road. */
function held(sim: Sim, hp: number, travelled: number): SimEnemy {
  const e = spawnEnemy(sim, 'cucumber', travelled, 100, false, hp);
  e.frozen = true;
  return e;
}

/** An alchemist at tile 7 with a full gauge and the attack of every cat switched off (so that only the skills touch the field). */
function alchemist(sim: Sim): SimUnit {
  const u = put(sim, 7, 't_alch', 0);
  u.sp = 1;
  u.charge = -1e9;
  return u;
}

describe("the alchemist's small flask and the other skills' marks", () => {
  it("takes the host of a storm cat's cloud off the field: the cloud hops to the nearest enemy that is left and goes on, and nothing hits the fish", () => {
    const sim = arena();
    const storm = put(sim, 2, 'm_storm', 0);
    storm.sp = 1;
    storm.charge = -1e9;
    const alch = alchemist(sim);
    // The lead enemy (the cloud's host) and a second weak one are the flasks' targets; a sturdy one stands 40 px behind them.
    const host = held(sim, 40, 330);
    const other = held(sim, 40, 320);
    const heir = held(sim, 1e9, 290);
    const hops = record(sim, 'cloudHop');
    const bolts = record(sim, 'cloudBolt');
    const ends = record(sim, 'cloudEnd');
    const hits = record(sim, 'hit');
    const deaths = record(sim, 'enemyDie');
    expect(cloud.ready(sim, storm)).toBe(true);
    expect(cloud.cast(sim, storm)).toBe(true);
    storm.sp = 0;
    expect(sim.clouds[0]!.host).toBe(host);
    expect(fish.ready(sim, alch)).toBe(true);
    expect(fish.cast(sim, alch)).toBe(true);
    alch.sp = 0;
    expect(host.dead && other.dead).toBe(true);
    expect(deaths.filter((d) => d.transmuted === true).map((d) => d.enemy.uid).sort()).toEqual([host.uid, other.uid].sort());
    // The next skill pass notices the empty seat: the cloud hops to the sturdy one, 40 px away, and the bolts fall there.
    advance(sim, 1.2);
    expect(hops.map((h) => [h.fromUid, h.toUid])).toEqual([[host.uid, heir.uid]]);
    expect(bolts.length).toBeGreaterThanOrEqual(2);
    expect(bolts.every((b) => b.hostUid === heir.uid)).toBe(true);
    expect(ends).toHaveLength(0);
    // Not a single hit on a fish (a transmuted enemy is taken off the field, not hurt), and every hit since the flask is on the heir.
    expect(hits.some((h) => h.enemy.uid === host.uid || h.enemy.uid === other.uid)).toBe(false);
    expect(hits.length).toBeGreaterThan(0);
  });

  it('lets the cloud go when the flask takes its host and nothing else stands within its hop', () => {
    const sim = arena();
    const storm = put(sim, 2, 'm_storm', 0);
    storm.sp = 1;
    storm.charge = -1e9;
    const alch = alchemist(sim);
    const host = held(sim, 40, 330);
    const other = held(sim, 40, 320);
    const ends = record(sim, 'cloudEnd');
    expect(cloud.cast(sim, storm)).toBe(true);
    storm.sp = 0;
    expect(fish.cast(sim, alch)).toBe(true);
    expect(host.dead && other.dead).toBe(true);
    advance(sim, 0.1);
    expect(ends.map((e) => [e.reason, e.hostUid])).toEqual([['lost', host.uid]]);
    expect(sim.clouds).toHaveLength(0);
  });

  it("counts a fish that was a samurai's mark as a dead enemy: the line moves to a newcomer, or goes out when nobody can take it", () => {
    const sim = arena();
    const samurai = put(sim, 0, 'w_samurai', 0);
    samurai.sp = 1;
    samurai.charge = -1e9;
    const alch = alchemist(sim);
    const marked = held(sim, 40, 250);
    const second = held(sim, 40, 240);
    const sturdy = held(sim, 1e9, 230);
    const opens = record(sim, 'cutOpen');
    expect(cut.ready(sim, samurai)).toBe(true);
    expect(cut.cast(sim, samurai)).toBe(true);
    samurai.sp = 0;
    expect(fish.cast(sim, alch)).toBe(true);
    alch.sp = 0;
    expect(marked.dead && second.dead).toBe(true);
    // A newcomer within 150 px of where the fish stood takes one line; the other has nobody and goes out.
    const newcomer = foe(sim, 'cucumber', 255, 1e9);
    newcomer.frozen = true;
    advance(sim, 1.3);
    expect(opens).toHaveLength(1);
    const kinds = opens[0]!.lines.map((l) => l.kind).sort();
    expect(kinds).toEqual(['cut', 'lost', 'moved']);
    const moved = opens[0]!.lines.find((l) => l.kind === 'moved')!;
    expect(moved.to).toBe(newcomer.uid);
    expect([marked.uid, second.uid]).toContain(moved.uid);
    expect(opens[0]!.lines.find((l) => l.kind === 'cut')!.uid).toBe(sturdy.uid);
  });
});
