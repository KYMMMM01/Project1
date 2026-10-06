import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = () => void;

interface Pending {
  init: { mode: string; chapter: number; stake: number; seed: number };
  snapshot: { wave: number } | null;
}

/** Everything flow.ts reaches for, replaced by plain objects: the flow is logic, the scenes and the meta layer are not under test. */
const h = vi.hoisted(() => {
  class FakeScene {}
  class FakeHome extends FakeScene {}
  class FakeBattle extends FakeScene {
    constructor(public readonly run: unknown) {
      super();
    }
  }
  const state = {
    pending: null as Pending | null,
    runs: 0,
    reveals: [] as Array<{ id: number }>,
  };
  const profile = {
    get pendingRun() {
      return state.pending;
    },
    data: {
      get stats() {
        return { runs: state.runs };
      },
      get reveals() {
        return state.reveals;
      },
    },
    equipped: { rug: 'default', fx: 'default' },
    discardPendingRun: vi.fn(async () => {
      state.pending = null;
    }),
    prepareRun: vi.fn(async (o: { mode: string; chapter?: number; stake?: number }) => {
      if (state.pending) return { ok: false as const, error: 'run_active' };
      const init = { mode: o.mode, chapter: o.chapter ?? 1, stake: o.stake ?? 0, seed: 7 };
      state.pending = { init, snapshot: null };
      return { ok: true as const, value: init };
    }),
    settlePendingRun: vi.fn(async () => {
      state.pending = null;
      return { ok: true as const, value: { gold: 40, bundle: {} } };
    }),
    saveSnapshot: vi.fn(async () => undefined),
  };
  const scenes = {
    current: new FakeHome() as FakeScene,
    goto: vi.fn(async () => true),
  };
  return {
    FakeScene,
    FakeHome,
    FakeBattle,
    state,
    profile,
    scenes,
    setHook: vi.fn(),
    continuePrompt: vi.fn(async () => false),
    confirmDialog: vi.fn(async () => true),
    toast: vi.fn(),
    playClaim: vi.fn(() => [] as unknown[]),
    revealChest: vi.fn(async () => undefined),
    showRewards: vi.fn(async () => undefined),
    refresh: vi.fn(),
    gameplayStart: vi.fn(),
    gameplayStop: vi.fn(),
  };
});

vi.mock('@/core/debug', () => ({ debugEnabled: () => false }));
vi.mock('@/core/game', () => ({ game: { w: 720, h: 1280 } }));
vi.mock('@/core/i18n', () => ({ t: (key: string) => key }));
vi.mock('@/core/scene', () => ({ Scene: h.FakeScene, scenes: h.scenes }));
vi.mock('@/meta', () => ({ profile: h.profile, bundleParts: () => [], errorKey: (e: string) => e }));
vi.mock('@/scenes/BattleScene', () => ({ BattleScene: h.FakeBattle, setBattleCreatedHook: h.setHook, setBattleExit: vi.fn() }));
vi.mock('@/scenes/HomeScene', () => ({ HomeScene: h.FakeHome }));
vi.mock('@/screens/battle/claim', () => ({ playClaim: h.playClaim }));
vi.mock('@/screens/contract', () => ({ services: { revealChest: h.revealChest, showRewards: h.showRewards } }));
vi.mock('@/screens/shell/controller', () => ({ shell: { setLauncher: vi.fn(), refresh: h.refresh } }));
vi.mock('@/screens/shell/ContinuePrompt', () => ({ continuePrompt: h.continuePrompt }));
vi.mock('@/screens/shell/PreRunScreen', () => ({ openPreRun: vi.fn() }));
vi.mock('@/screens/shell/strings', () => ({}));
vi.mock('@/ui', () => ({ confirmDialog: h.confirmDialog, toast: h.toast }));
vi.mock('@/app/lifecycle', () => ({ gameplayStart: h.gameplayStart, gameplayStop: h.gameplayStop }));
vi.mock('@/app/lifecycle.ts', () => ({ gameplayStart: h.gameplayStart, gameplayStop: h.gameplayStop }));

const flow = await import('@/app/flow');

interface Bus {
  on(name: string, fn: Listener): void;
  emit(name: string): void;
}

function bus(): Bus {
  const map = new Map<string, Listener[]>();
  return {
    on: (name, fn) => void map.set(name, [...(map.get(name) ?? []), fn]),
    emit: (name) => map.get(name)?.forEach((fn) => fn()),
  };
}

const RUN = { init: { mode: 'chapter', chapter: 2, stake: 1, seed: 7 }, sandbox: false } as const;

/** Make a battle through the flow's factory and hand back what the flow wired onto it. */
function wiredBattle(): { battle: Bus; ctx: { events: Bus; retry: () => void }; fire: () => void } {
  flow.battleScene(RUN as never)();
  const hook = h.setHook.mock.calls.at(-1)?.[0] as ((scene: unknown) => void) | undefined;
  const battle = bus();
  const ctx = { events: bus(), retry: () => undefined };
  return { battle, ctx, fire: () => hook?.({ run: RUN, battle: { events: battle, snapshot: () => ({ wave: 3 }) }, ctx }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.state.pending = null;
  h.state.runs = 0;
  h.state.reveals = [];
  h.scenes.current = new h.FakeHome();
  h.continuePrompt.mockResolvedValue(false);
  h.confirmDialog.mockResolvedValue(true);
});

describe('a tutorial the app was killed in', () => {
  const tutorial: Pending = { init: { mode: 'tutorial', chapter: 1, stake: 0, seed: 1 }, snapshot: { wave: 2 } };

  it('starts over at boot instead of offering to continue or paying it out as a run', async () => {
    h.state.pending = tutorial;
    const first = await flow.chooseFirstScene();
    expect(h.profile.discardPendingRun).toHaveBeenCalledTimes(1);
    expect(h.profile.settlePendingRun).not.toHaveBeenCalled();
    expect(h.profile.prepareRun).toHaveBeenCalledWith({ mode: 'tutorial' });
    expect(first()).toBeInstanceOf(h.FakeBattle);
    expect(h.state.runs).toBe(0);
  });

  it('is never put to the player as a run to give up', async () => {
    h.state.pending = tutorial;
    await flow.offerContinue();
    expect(h.continuePrompt).not.toHaveBeenCalled();
    expect(h.profile.settlePendingRun).not.toHaveBeenCalled();
    expect(h.state.pending).toBeNull();
  });

  it('does not stop a chapter run that was left behind from being offered', async () => {
    h.state.runs = 3;
    h.state.pending = { init: { mode: 'chapter', chapter: 1, stake: 0, seed: 1 }, snapshot: { wave: 4 } };
    h.continuePrompt.mockResolvedValue(false);
    await flow.offerContinue();
    expect(h.continuePrompt).toHaveBeenCalledWith(1, 4);
    expect(h.profile.settlePendingRun).toHaveBeenCalledTimes(1);
  });
});

describe('giving up a run', () => {
  it('flies the paid currency to the bar and opens no sheet that asks to claim it again', async () => {
    h.state.runs = 3;
    h.state.pending = { init: { mode: 'chapter', chapter: 1, stake: 0, seed: 1 }, snapshot: { wave: 4 } };
    await flow.offerContinue();
    expect(h.playClaim).toHaveBeenCalledTimes(1);
    expect(h.showRewards).not.toHaveBeenCalled();
  });

  it('still shows a sheet for what is not currency', async () => {
    h.state.runs = 3;
    h.state.pending = { init: { mode: 'chapter', chapter: 1, stake: 0, seed: 1 }, snapshot: { wave: 4 } };
    h.playClaim.mockReturnValueOnce([{ kind: 'chest' }]);
    await flow.offerContinue();
    expect(h.showRewards).toHaveBeenCalledTimes(1);
  });
});

describe('restart from the pause menu', () => {
  it('throws the run in progress away before it prepares the next one', async () => {
    h.state.runs = 3;
    h.state.pending = { init: { mode: 'chapter', chapter: 2, stake: 1, seed: 7 }, snapshot: null };
    const { ctx, fire } = wiredBattle();
    fire();
    ctx.retry();
    await vi.waitFor(() => expect(h.profile.prepareRun).toHaveBeenCalled());
    const discard = h.profile.discardPendingRun.mock.invocationCallOrder[0] as number;
    const prepare = h.profile.prepareRun.mock.invocationCallOrder[0] as number;
    expect(discard).toBeLessThan(prepare);
    expect(h.profile.prepareRun).toHaveBeenCalledWith({ mode: 'chapter', chapter: 2, stake: 1 });
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.scenes.goto).toHaveBeenCalledTimes(1);
  });

  it('leaves the wave saves of the new run alone while the old battle is still on screen', async () => {
    h.state.pending = { init: { mode: 'chapter', chapter: 2, stake: 1, seed: 7 }, snapshot: null };
    const { battle, fire } = wiredBattle();
    fire();
    battle.emit('waveStart');
    expect(h.profile.saveSnapshot).toHaveBeenCalledTimes(1);
    h.state.pending = { init: { mode: 'chapter', chapter: 2, stake: 1, seed: 8 }, snapshot: null };
    battle.emit('waveStart');
    expect(h.profile.saveSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('platform play signals', () => {
  it('starts with the battle, stops when it finishes and starts again after a revive', () => {
    h.state.pending = { init: { mode: 'chapter', chapter: 2, stake: 1, seed: 7 }, snapshot: null };
    const { battle, ctx, fire } = wiredBattle();
    fire();
    expect(h.gameplayStart).toHaveBeenCalledTimes(1);
    ctx.events.emit('finished');
    expect(h.gameplayStop).toHaveBeenCalledTimes(1);
    battle.emit('revive');
    expect(h.gameplayStart).toHaveBeenCalledTimes(2);
  });
});

describe('a chest reveal cut short by closing the app', () => {
  it('is shown again once the first scene is up, oldest first, before a left-over run is offered', async () => {
    h.state.reveals = [{ id: 4 }, { id: 5 }];
    h.state.runs = 3;
    h.state.pending = { init: { mode: 'chapter', chapter: 1, stake: 0, seed: 1 }, snapshot: { wave: 4 } };
    flow.afterFirstScene();
    await vi.waitFor(() => expect(h.continuePrompt).toHaveBeenCalled());
    expect(h.revealChest.mock.calls.map((c) => (c as unknown as [{ id: number }])[0].id)).toEqual([4, 5]);
    expect(h.revealChest.mock.invocationCallOrder[1]).toBeLessThan(h.continuePrompt.mock.invocationCallOrder[0] as number);
  });

  it('is not shown over a battle', () => {
    h.state.reveals = [{ id: 4 }];
    h.scenes.current = new h.FakeBattle(null);
    flow.afterFirstScene();
    expect(h.revealChest).not.toHaveBeenCalled();
  });
});
