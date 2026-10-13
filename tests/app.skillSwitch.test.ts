/**
 * The on / off switch of the cats' skills in the app (docs/qa/directive_2026-10-13_skills_build.md, decision 9): one constant, the URL
 * parameter `sp` over it, read in one place (`core/skillSwitch.ts`) and passed into `BattleInit.sp` by every way the app starts a battle.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILLS_ON, resumeInit, skillsOn, spParam } from '@/core/skillSwitch';
import type { BattleInit, BattleMode } from '@/game/api';
import { createBattle } from '@/game/sim/create';
import type { Sim } from '@/game/sim/sim';
import { createTestProfile } from '@/meta/testing';
import { runFromQuery } from '@/view/field/debug';
import { advance, initOf, newSim } from './simHelpers';
import { loadoutInit, printTable, spFromEnv } from './simReportKit';

const params = (q: string): URLSearchParams => new URLSearchParams(q);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the switch', () => {
  it('is off in the shipped build: the constant is false and a page without the parameter plays without skills', () => {
    expect(SKILLS_ON).toBe(false);
    expect(skillsOn(params(''))).toBe(false);
    expect(skillsOn()).toBe(false);
  });

  it('is overridden by sp=1 and sp=0, with or without the debug flag, and by nothing else', () => {
    expect(spParam(params('sp=1'))).toBe(true);
    expect(spParam(params('sp=0'))).toBe(false);
    expect(skillsOn(params('sp=1'))).toBe(true);
    expect(skillsOn(params('sp=0'))).toBe(false);
    expect(skillsOn(params('debug=1&sp=1'))).toBe(true);
    expect(skillsOn(params('sp=1&debug=1'))).toBe(true);
    for (const junk of ['sp=', 'sp=2', 'sp=on', 'sp=true', 'SP=1', 'spx=1']) {
      expect(spParam(params(junk)), junk).toBeNull();
      expect(skillsOn(params(junk)), junk).toBe(SKILLS_ON);
    }
  });

  it('reads the page\'s own address when it is not given one', () => {
    vi.stubGlobal('location', { search: '?lang=ko&sp=1' });
    expect(skillsOn()).toBe(true);
    vi.stubGlobal('location', { search: '?sp=0' });
    expect(skillsOn()).toBe(false);
  });
});

describe('every way the app starts a battle', () => {
  const MODES: BattleMode[] = ['tutorial', 'chapter', 'daily', 'endless', 'gold'];

  async function openRig() {
    const rig = await createTestProfile();
    rig.profile.data.cleared = [1, 1, 1, 0, 0];
    rig.profile.data.stats.runs = 5;
    rig.profile.refresh();
    return rig;
  }

  async function initsOf(): Promise<Record<string, BattleInit>> {
    const rig = await openRig();
    const out: Record<string, BattleInit> = {};
    for (const mode of MODES) {
      const prep = await rig.profile.prepareRun({ mode, chapter: mode === 'gold' ? 1 : 2 });
      expect(prep.ok, mode).toBe(true);
      if (prep.ok) out[mode] = prep.value;
      await rig.profile.discardPendingRun();
    }
    return out;
  }

  it('hands every mode of a real run the switch\'s value: off by default', async () => {
    const inits = await initsOf();
    for (const mode of MODES) expect(inits[mode]?.sp, mode).toBe(false);
  });

  it('hands every mode sp: true under ?sp=1 and sp: false under ?sp=0, and the run keeps it in its pending record', async () => {
    vi.stubGlobal('location', { search: '?sp=1' });
    const on = await initsOf();
    for (const mode of MODES) expect(on[mode]?.sp, mode).toBe(true);
    vi.stubGlobal('location', { search: '?sp=0' });
    const off = await initsOf();
    for (const mode of MODES) expect(off[mode]?.sp, mode).toBe(false);

    vi.stubGlobal('location', { search: '?sp=1' });
    const rig = await openRig();
    const prep = await rig.profile.prepareRun({ mode: 'chapter', chapter: 1 });
    expect(prep.ok).toBe(true);
    // The page is opened later without the parameter: the saved run still has its own value.
    vi.stubGlobal('location', { search: '' });
    expect(rig.profile.pendingRun?.init.sp).toBe(true);
    expect(resumeInit(rig.profile.pendingRun!.init).sp).toBe(true);
    // ... and after the app was closed and opened again: the saved profile carries it.
    const reopened = await createTestProfile({ keepStorage: true });
    expect(reopened.profile.pendingRun?.init.sp).toBe(true);
    expect(resumeInit(reopened.profile.pendingRun!.init).sp).toBe(true);
  });

  it('builds the debug battle route\'s init with the same switch', () => {
    expect(runFromQuery(params('scene=battle')).init.sp).toBe(false);
    expect(runFromQuery(params('scene=battle&sp=1')).init.sp).toBe(true);
    expect(runFromQuery(params('scene=battle&mode=gold&sp=0')).init.sp).toBe(false);
  });

  it('lets a run saved before the skills existed play on without them, and a run that has the field keep its own', () => {
    const legacy = initOf();
    expect(legacy.sp).toBeUndefined();
    expect(resumeInit(legacy).sp).toBe(false);
    expect(resumeInit({ ...legacy, sp: true }).sp).toBe(true);
    expect(resumeInit({ ...legacy, sp: false }).sp).toBe(false);

    const old = newSim();
    advance(old, 3.1);
    const saved = old.snapshot();
    expect(saved).not.toBeNull();
    const snap = saved as NonNullable<typeof saved>;
    // The save carries no `sp`: it takes the caller's value (the app passes the resumed init), or plays with skills when there is none.
    expect((createBattle({ ...old.init, sp: false }, snap) as Sim).spOn).toBe(false);
    expect((createBattle(old.init, snap) as Sim).spOn).toBe(true);
    // A save that has the field keeps its own.
    const on = newSim({ sp: true });
    advance(on, 3.1);
    const onSnap = on.snapshot() as NonNullable<ReturnType<Sim['snapshot']>>;
    expect((createBattle({ ...on.init, sp: false }, onSnap) as Sim).spOn).toBe(true);
    const off = newSim({ sp: false });
    advance(off, 3.1);
    const offSnap = off.snapshot() as NonNullable<ReturnType<Sim['snapshot']>>;
    expect((createBattle({ ...off.init, sp: true }, offSnap) as Sim).spOn).toBe(false);
  });
});

describe('the balance report\'s switch', () => {
  it('plays without skills under SIM_SP=0, with them under SIM_SP=1, and as the app plays (SKILLS_ON) without the variable', () => {
    expect(spFromEnv({ SIM_SP: '0' })).toEqual({ sp: false });
    expect(spFromEnv({ SIM_SP: '1' })).toEqual({ sp: true });
    expect(spFromEnv({})).toEqual({ sp: SKILLS_ON });
    expect(spFromEnv({ SIM_SP: '' })).toEqual({ sp: SKILLS_ON });
    // The shipped build has them off, and so does the report by default: its numbers stay comparable with the documented ones.
    expect(spFromEnv({})).toEqual({ sp: false });
  });

  it('refuses a value that is neither 0 nor 1 instead of quietly playing with skills', () => {
    for (const v of ['false', 'off', 'true', 'on', '2', ' 1']) expect(() => spFromEnv({ SIM_SP: v }), v).toThrow(/SIM_SP/);
  });

  it('gives every run of loadoutInit the report\'s setting, and every table\'s title says which one', () => {
    vi.stubEnv('SIM_SP', '1');
    expect(loadoutInit(1, 1, 0, 1).sp).toBe(true);
    vi.stubEnv('SIM_SP', '0');
    expect(loadoutInit(1, 1, 0, 1).sp).toBe(false);
    vi.unstubAllEnvs();
    expect(loadoutInit(1, 1, 0, 1).sp).toBe(SKILLS_ON);
    const written: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });
    try {
      printTable('A title', ['a'], [['1']]);
      vi.stubEnv('SIM_SP', '1');
      printTable('Another', ['a'], [['1']]);
    } finally {
      spy.mockRestore();
      vi.unstubAllEnvs();
    }
    expect(written[0]).toContain('== A title [skills off] ==');
    expect(written[1]).toContain('== Another [skills on] ==');
  });
});
