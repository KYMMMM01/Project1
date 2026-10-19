/**
 * The REAL registry behind the real dispatcher: twelve scenes are registered, none is built at mount, and a cast builds the scene of its own
 * skill only. (The dispatcher's mechanics with stand-ins are in `view.director.sp.test.ts`; the pictures of each scene are in their own files.)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Container } from 'pixi.js';

vi.mock('@/view/director/sp/intro', () => ({
  SpIntro: class {
    first = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));

import { Emitter } from '@/core/events';
import { SP_SKILL_IDS } from '@/game/api';
import type { BattleEvents } from '@/game/api';
import { mountSp } from '@/view/director/sp';
import { holdRing, ringHolds } from '@/view/field/ringHold';
import { SCENES } from '@/view/director/sp/scenes';
import type { Bus, Stage } from '@/view/director/stage';

function rig() {
  const disposers: Array<() => void> = [];
  const events = new Emitter<BattleEvents>();
  const on = vi.spyOn(events, 'on');
  const layers = { fxBack: new Container(), fxFront: new Container(), numbers: new Container(), units: new Container(), enemies: new Container(), overlay: new Container() };
  const battle = { spOn: true, time: 0, enemies: [], units: [], events };
  const frames: Array<(dt: number) => void> = [];
  const fx = { ps: { burst: vi.fn() }, shockwave: vi.fn(), dustPuff: vi.fn() };
  const stage = { now: 0, detail: 1, reduced: false, play: vi.fn(), later: vi.fn(), shake: vi.fn(), fx, panOf: () => 0, stagger: () => 0, rules: { skill: {}, skillTick: {}, big: {}, strike: {}, zone: {} }, ctx: { battle, layers, unitView: () => null, speed: 1 }, addFrame: (fn: (dt: number) => void) => frames.push(fn), onDestroy: (fn: () => void) => disposers.push(fn) } as unknown as Stage;
  const bus = ((type: keyof BattleEvents, fn: never) => events.on(type, fn)) as unknown as Bus;
  return { events, on, layers, battle, stage, bus, frames, destroy: () => disposers.forEach((d) => d()) };
}

describe('the registry of scenes and the lazy dispatcher', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { __dbg: {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('has a scene for every one of the twelve skills, and for no other', () => {
    expect(SP_SKILL_IDS).toHaveLength(12);
    expect(Object.keys(SCENES).sort()).toEqual([...SP_SKILL_IDS].sort());
    for (const id of SP_SKILL_IDS) expect(typeof SCENES[id]).toBe('function');
  });

  it('builds none of them at mount: no scene, no listener beyond the dispatcher\'s own, no node on any layer', () => {
    const r = rig();
    const staging = mountSp(r.stage, r.bus);
    expect(staging).not.toBeNull();
    expect(Object.keys(staging?.scenes ?? {})).toEqual([]);
    // The dispatcher's own seven subscriptions (spCast, the three run events, bite, victory, defeat) and nothing from twelve scenes.
    expect(r.on).toHaveBeenCalledTimes(7);
    for (const layer of Object.values(r.layers)) expect(layer.children).toHaveLength(0);
    expect(r.frames).toHaveLength(1);
    // The QA hook says so too.
    const hook = (window as unknown as { __dbg: { spStage: { stats(): { made: number } } } }).__dbg.spStage;
    expect(hook.stats().made).toBe(0);
  });

  it('builds only the scene of the skill that casts, once, and its layer and listener appear with it', () => {
    const r = rig();
    const staging = mountSp(r.stage, r.bus);
    const before = r.on.mock.calls.length;
    const cut = { unit: { uid: 1, id: 'w_samurai', cell: 2 }, first: true, x: 0, y: 0, skill: 'cut', data: { cutId: 1, at: 0, fuse: 1.2, fromPath: 0, toPath: 450, marks: [] } };
    r.events.emit('spCast', cut as never);
    // Exactly the samurai's scene, with its one listener (cutOpen) and its layer on the front; the other eleven are not there.
    expect(Object.keys(staging?.scenes ?? {})).toEqual(['cut']);
    expect(r.on.mock.calls.length - before).toBe(1);
    expect(r.layers.fxFront.children.length).toBeGreaterThan(0);
    const hook = (window as unknown as { __dbg: { spStage: { stats(): { made: number } } } }).__dbg.spStage;
    expect(hook.stats().made).toBe(1);
    // The same skill casting again builds nothing new.
    const scene = staging?.scenes.cut;
    const nodes = r.layers.fxFront.children.length;
    r.stage.now = 5;
    r.events.emit('spCast', { ...cut, first: false, data: { ...cut.data, cutId: 2 } } as never);
    expect(staging?.scenes.cut).toBe(scene);
    expect(r.on.mock.calls.length - before).toBe(1);
    expect(r.layers.fxFront.children.length).toBe(nodes);
    // A victory has something to clear now, and clears it without a word.
    r.events.emit('victory', {} as never);
  });

  it('lets go of every ring hold when the director goes (the next battle numbers its units from 1 again)', () => {
    const r = rig();
    mountSp(r.stage, r.bus);
    holdRing(5, 0.25);
    expect(ringHolds()).toBe(1);
    r.destroy();
    expect(ringHolds()).toBe(0);
  });
});
