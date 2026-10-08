import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the pick of three asks of the kit, faked just far enough to drive it: nothing here draws, tweens wait for the test. */
const kit = vi.hoisted(() => ({
  reduced: false,
  calls: [] as Array<{ at: number; fn: () => void }>,
  now: 0,
  tweens: new Map<object, { onUpdate?: (e: number) => void; onComplete?: () => void }>(),
  taps: [] as Array<() => void>,
  toggles: [] as Array<{ tap: () => void }>,
  closed: 0,
}));

vi.mock('@/core/game', () => ({ game: { safeTop: 0, safeBottom: 0 } }));
vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/core/haptics', () => ({ haptic: () => undefined }));
vi.mock('@/core/i18n', () => ({ t: (k: string) => k }));
vi.mock('@/core/tween', () => ({ Ease: new Proxy({}, { get: () => (v: number) => v }) }));
vi.mock('@/game', () => ({
  classDef: () => ({ nameKey: 'class' }),
  unitClass: () => 'warrior',
  unitDef: (id: string) => ({ id, rarity: 'common', nameKey: `${id}.name`, classId: 'warrior', skillText: () => 'skill' }),
  unitRarity: () => 'common',
}));
vi.mock('@/guide', () => ({ topicTeach: () => 'teach' }));
vi.mock('../src/view/hud/planMath', () => ({ planOf: () => ({ result: null }) }));
vi.mock('../src/view/hud/policy', () => ({ recommendPick: () => 0 }));
vi.mock('../src/view/hud/Hand', async () => {
  const { Container } = await import('pixi.js');
  return {
    Hand: class extends Container {
      place(): void {}
      tap(): void {}
    },
  };
});
vi.mock('../src/view/hud/kit', async () => {
  const { Container } = await import('pixi.js');
  class PressCard extends Container {
    constructor(_w: number, _h: number, onTap: () => void) {
      super();
      kit.taps.push(onTap);
    }
    setEnabled(): void {}
  }
  return { CLASS_ICON: { warrior: 'sword' }, PressCard, unitPortrait: () => new Container() };
});
vi.mock('@/ui', async () => {
  const { Container } = await import('pixi.js');
  class Popup extends Container {
    readonly backdrop = new Container();
    readonly shell = new Container();
    readonly body = new Container();
    screenW = 0;
    screenH = 0;
    constructor() {
      super();
      this.shell.addChild(this.body);
      this.addChild(this.backdrop, this.shell);
    }
    protected setContentSize(): void {}
    layout(w: number, h: number): void {
      this.screenW = w;
      this.screenH = h;
      this.shell.position.set(w / 2, h / 2);
    }
    close(): void {
      kit.closed++;
    }
    onOpened(): void {}
  }
  class Panel extends Container {
    readonly content = new Container();
    constructor() {
      super();
      this.addChild(this.content);
    }
  }
  class Button extends Container {
    readonly boxW = 180;
    constructor() {
      super();
      kit.toggles.push(this as unknown as { tap: () => void });
    }
    tap: () => void = () => undefined;
    onTap(fn: () => void): this {
      this.tap = fn;
      return this;
    }
    setLift(): this {
      return this;
    }
    shine(): this {
      return this;
    }
  }
  class TweenBag {
    call(seconds: number, fn: () => void): void {
      kit.calls.push({ at: kit.now + seconds, fn });
    }
    run(): void {}
    runKeyed(key: object, opts: { onUpdate?: (e: number) => void; onComplete?: () => void }): void {
      kit.tweens.set(key, opts);
    }
    killKeyed(key: object): void {
      kit.tweens.delete(key);
    }
    killAll(): void {
      kit.calls.length = 0;
      kit.tweens.clear();
    }
  }
  const label = (text: string): Container => Object.assign(new Container(), { text, width: 90, destroy: Container.prototype.destroy });
  return {
    Popup,
    Panel,
    Button,
    TweenBag,
    CardFrame: class extends Container {},
    Color: new Proxy({}, { get: () => 0 }),
    HOLD_DELAY: 0.4,
    attachTooltip: () => () => undefined,
    drawIcon: () => new Container(),
    fitLabel: () => undefined,
    uiLabel: label,
    motion: {
      get reduced(): boolean {
        return kit.reduced;
      },
    },
  };
});

import { SummonPickPopup } from '../src/view/hud/popups/SummonPickPopup';
import { PEEK_FOLD_SCALE, peekBackCentre } from '../src/view/hud/peekMath';
import { computeBattleLayout } from '../src/view/layout';

interface FakeEnv {
  battle: { units: unknown[]; pickSummon: (i: number) => string | null };
  ctx: { command: (name: string, fn: () => string | null) => string | null };
  lessonOn: () => boolean;
  picked: number[];
  refuse: boolean;
}

function env(): FakeEnv {
  const e: FakeEnv = {
    battle: {
      units: [],
      pickSummon: (i) => {
        e.picked.push(i);
        return e.refuse ? 'no_pending' : null;
      },
    },
    ctx: { command: (_n, fn) => fn() },
    lessonOn: () => false,
    picked: [],
    refuse: false,
  };
  return e;
}

/** Let the put-off calls of every bag run, `seconds` of them. */
function advance(seconds: number): void {
  kit.now += seconds;
  for (const c of kit.calls.filter((x) => x.at <= kit.now)) {
    kit.calls.splice(kit.calls.indexOf(c), 1);
    c.fn();
  }
}

/** An opened pick: laid out on a 720 x 1280 screen, its entrance over. */
function opened(e: FakeEnv, guide = false): SummonPickPopup {
  const p = new SummonPickPopup(e as never, ['w_paw', 'r_sling', 'm_snow'], guide);
  p.layout(720, 1280);
  p.onOpened();
  advance(0.25);
  return p;
}

/** The dock builds the way back first, then the host asks for its toggle. */
const toggle = (): { tap: () => void } => kit.toggles[1] as { tap: () => void };
const dockLayer = (p: SummonPickPopup): Container => p.children[2] as Container;
const wayBack = (p: SummonPickPopup): { tap: () => void } => dockLayer(p).children[1] as unknown as { tap: () => void };

/** The fold's tween runs to its end. */
function settle(p: SummonPickPopup): void {
  const dock = (p as unknown as { dock: object }).dock;
  const tw = kit.tweens.get(dock);
  tw?.onUpdate?.(1);
  tw?.onComplete?.();
  kit.tweens.delete(dock);
}

describe('the pick of three, folded away to read the board', () => {
  beforeEach(() => {
    kit.reduced = false;
    kit.calls.length = 0;
    kit.now = 0;
    kit.tweens.clear();
    kit.taps.length = 0;
    kit.toggles.length = 0;
    kit.closed = 0;
  });

  it('has the toggle on its sheet and the shield and way back above everything', () => {
    const p = opened(env());
    expect(kit.toggles).toHaveLength(2);
    expect(p.children[2]).toBeDefined();
    expect(dockLayer(p).visible).toBe(false);
  });

  it('the lesson\'s pick has no toggle at all', () => {
    const p = opened(env(), true);
    // The way back is built, the toggle is not: one button, and it never shows.
    expect(kit.toggles).toHaveLength(1);
    expect(dockLayer(p).visible).toBe(false);
    expect((p as unknown as { dock: { state: { allowed: boolean } } }).dock.state.allowed).toBe(false);
  });

  it('folded: the sheet is a tenth of its size, hidden, out of the hit tests, the dim is lifted, and the pick is still waiting', () => {
    const e = env();
    const p = opened(e);
    toggle().tap();
    settle(p);
    expect(p.shell.scale.x).toBeCloseTo(PEEK_FOLD_SCALE, 5);
    expect(p.shell.visible).toBe(false);
    expect(p.shell.interactiveChildren).toBe(false);
    expect(p.backdrop.alpha).toBeLessThan(0.2);
    expect(dockLayer(p).visible).toBe(true);
    expect(p.picking).toBe(false);
    expect(e.picked).toEqual([]);
    expect(kit.closed).toBe(0);
  });

  it('a card tap that reaches it while folded answers nothing: no command goes to the battle', () => {
    const e = env();
    const p = opened(e);
    toggle().tap();
    settle(p);
    for (const tap of kit.taps) tap();
    expect(e.picked).toEqual([]);
    expect(p.picking).toBe(false);
  });

  it('the way back unfolds it exactly as it was, and the next tap on a card answers the pick once', () => {
    const e = env();
    const p = opened(e);
    toggle().tap();
    settle(p);
    wayBack(p).tap();
    settle(p);
    expect(p.shell.scale.x).toBe(1);
    expect(p.shell.alpha).toBe(1);
    expect(p.shell.visible).toBe(true);
    expect(p.shell.position.x).toBe(360);
    expect(p.shell.position.y).toBe(640);
    expect(p.shell.interactiveChildren).toBe(true);
    expect(p.backdrop.alpha).toBe(1);
    expect(dockLayer(p).visible).toBe(false);
    kit.taps[1]?.();
    expect(p.picking).toBe(true);
    // The pick is told to the battle after the farewell.
    advance(0.25);
    expect(e.picked).toEqual([1]);
    expect(kit.closed).toBe(1);
  });

  it('a resize while folded keeps it folded, into the way back at its new place', () => {
    const p = opened(env());
    toggle().tap();
    settle(p);
    p.layout(720, 1600);
    const to = peekBackCentre(computeBattleLayout(720, 1600, 0, 0));
    expect(p.shell.visible).toBe(false);
    expect(p.shell.position.x).toBeCloseTo(to.x, 5);
    expect(p.shell.position.y).toBeCloseTo(to.y, 5);
    expect(dockLayer(p).visible).toBe(true);
    wayBack(p).tap();
    settle(p);
    expect(p.shell.position.y).toBe(800);
    expect(p.shell.scale.x).toBe(1);
  });

  it('a resize at rest leaves the sheet where the popup\'s own layout put it', () => {
    const p = opened(env());
    p.layout(720, 1600);
    expect(p.shell.position.y).toBe(800);
    expect(p.shell.scale.x).toBe(1);
    expect(p.shell.visible).toBe(true);
  });

  it('the sheet cannot be folded while it is still coming in', () => {
    const p = new SummonPickPopup(env() as never, ['w_paw', 'r_sling', 'm_snow'], false);
    p.layout(720, 1280);
    p.onOpened();
    toggle().tap();
    expect(p.shell.scale.x).toBe(1);
    expect(dockLayer(p).visible).toBe(false);
    advance(0.25);
    toggle().tap();
    settle(p);
    expect(p.shell.visible).toBe(false);
  });

  it('with reduced motion the fold is at once and the entrance does not hold the toggle', () => {
    kit.reduced = true;
    const e = env();
    const p = new SummonPickPopup(e as never, ['w_paw', 'r_sling', 'm_snow'], false);
    p.layout(720, 1280);
    p.onOpened();
    advance(0);
    toggle().tap();
    expect(p.shell.visible).toBe(false);
    wayBack(p).tap();
    expect(p.shell.visible).toBe(true);
    expect(p.shell.scale.x).toBe(1);
  });

  it('a pick the battle refuses brings the cards back and leaves the toggle usable', () => {
    const e = env();
    e.refuse = true;
    const p = opened(e);
    kit.taps[0]?.();
    // While the answer is on its way the sheet is not to be folded away.
    toggle().tap();
    expect(p.shell.scale.x).toBe(1);
    advance(0.25);
    expect(e.picked).toEqual([0]);
    expect(p.picking).toBe(false);
    toggle().tap();
    settle(p);
    expect(p.shell.visible).toBe(false);
  });

  it('closing it from outside while it is folded destroys the shield and the way back with it', () => {
    const p = opened(env());
    toggle().tap();
    settle(p);
    const layer = dockLayer(p);
    p.destroy({ children: true });
    expect(layer.destroyed).toBe(true);
    expect(kit.tweens.size).toBe(0);
  });
});
