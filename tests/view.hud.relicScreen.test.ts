import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the screen asks of the kit, faked just far enough to see how it keeps its parts: nothing here draws. */
const kit = vi.hoisted(() => ({
  layer: null as unknown as Container,
  bags: [] as Array<{ pending: Array<{ at: number; fn: () => void }>; now: number }>,
  drawn: [] as unknown[],
  hides: [] as Array<() => void>,
  reduced: false,
}));

vi.mock('@/core/game', async () => {
  const { Container } = await import('pixi.js');
  kit.layer = new Container();
  return { game: { popupLayer: kit.layer, events: { on: () => () => undefined }, w: 720, h: 1280, safeTop: 0, safeBottom: 0 } };
});
vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/core/i18n', () => ({ t: (k: string, v?: Record<string, number>) => (v ? `${k}${JSON.stringify(v)}` : k) }));
vi.mock('@/core/math', () => ({ mixColor: () => 0 }));
vi.mock('@/core/tween', () => ({ Ease: new Proxy({}, { get: () => () => 0 }) }));
vi.mock('@/fx', () => ({ flyTo: () => undefined, renderOnce: (c: unknown) => void kit.drawn.push(c) }));
vi.mock('@/guide', () => ({ topicTeach: () => 'teach' }));
vi.mock('@/meta', () => ({ errorKey: () => 'e', profile: { pay: () => Promise.resolve({ ok: true }) } }));
vi.mock('@/platform', () => ({ ads: { status: () => ({ reason: 'ok' }) } }));
vi.mock('@/view/timing', () => ({ TOY_BURST: 0, TOY_FLY: 0, TOY_HANG: 0 }));
vi.mock('@/game', () => ({
  relicDef: (id: string) => ({ rarity: id.split(':')[0], nameKey: `${id}.name`, descText: () => `${id} text` }),
}));
vi.mock('../src/view/hud/policy', () => ({ offerRoute: () => 'none' }));
vi.mock('../src/view/hud/kit', async () => {
  const { Container } = await import('pixi.js');
  class PressCard extends Container {
    setEnabled(): void {}
  }
  return { PressCard, relicIcon: () => new Container() };
});
vi.mock('@/ui', async () => {
  const { Container } = await import('pixi.js');
  class ScreenScaffold extends Container {
    readonly content = new Container();
    readonly actionBar = new Container();
    readonly contentWidth = 672;
    readonly viewportHeight = 900;
    constructor() {
      super();
      this.addChild(this.content, this.actionBar);
    }
    addTitleAction(item: Container): void {
      this.addChild(item);
    }
    show(): Promise<void> {
      this.visible = true;
      return Promise.resolve();
    }
    hide(animate = true): Promise<void> {
      if (!animate) {
        this.visible = false;
        return Promise.resolve();
      }
      return new Promise((resolve) =>
        kit.hides.push(() => {
          this.visible = false;
          resolve();
        }),
      );
    }
  }
  class PaperLabel extends Container {
    text: string;
    constructor(o: { text: string }) {
      super();
      this.text = o.text;
    }
    setText(text: string): void {
      this.text = text;
    }
    setMaxWidth(): void {}
  }
  class Button extends Container {
    readonly boxW = 180;
    constructor(readonly opts: { label: string }) {
      super();
    }
    onTap(): void {}
    setBusy(): void {}
    setLift(): void {}
    shine(): void {}
  }
  class Tag extends Container {}
  class TweenBag {
    readonly state = { pending: [] as Array<{ at: number; fn: () => void }>, now: 0 };
    constructor() {
      kit.bags.push(this.state);
    }
    call(delay: number, fn: () => void): void {
      this.state.pending.push({ at: this.state.now + delay, fn });
    }
    runKeyed(): { finished: Promise<void> } {
      return { finished: Promise.resolve() };
    }
    run(): void {}
    killKeyed(): void {}
    killAll(): void {
      this.state.pending.length = 0;
    }
  }
  const label = (text: string): Container => Object.assign(new Container(), { text, width: 100, anchor: { set: () => undefined } });
  return {
    ScreenScaffold,
    PaperLabel,
    Button,
    Tag,
    TweenBag,
    uiLabel: label,
    fitLabel: () => undefined,
    drawPaper: () => undefined,
    drawPaperFace: () => undefined,
    paperOutline: () => [0, 0, 176, 0, 176, 176, 0, 176],
    drawDashedInset: () => undefined,
    tapeStrip: () => new Container(),
    paperSeed: () => 1,
    rarityName: (r: string) => r,
    toast: () => undefined,
    Color: new Proxy({}, { get: () => 0 }),
    RARITY_GOLD: 0,
    Rarity: new Proxy({}, { get: () => ({ color: 0, dark: 0, light: 0 }) }),
    motion: {
      get reduced(): boolean {
        return kit.reduced;
      },
    },
  };
});

import { RelicScreen } from '../src/view/hud/screens/RelicScreen';

type Offer = string[];
interface FakeEnv {
  battle: { pending: unknown; act: number; init: { mode: string } };
  ctx: { command: (name: string, fn: () => unknown) => unknown; anchor: () => { x: number; y: number } };
  sandbox: boolean;
  tutorial: boolean;
  holds: number;
  released: number;
  holdPause: () => () => void;
  lessonOn: () => boolean;
}

function env(): FakeEnv {
  const e: FakeEnv = {
    battle: { pending: null, act: 1, init: { mode: 'chapter' } },
    ctx: { command: (_n, fn) => fn(), anchor: () => ({ x: 0, y: 0 }) },
    sandbox: false,
    tutorial: false,
    holds: 0,
    released: 0,
    holdPause: () => {
      e.holds++;
      return () => void e.released++;
    },
    lessonOn: () => false,
  };
  return e;
}

const offer = (options: Offer, freeRerolls = 1): unknown => ({ kind: 'relic', options, freeRerolls, picksLeft: 1, paidRerollUsed: false });

/** Let the bag's put-off calls run, `seconds` of them. */
function advance(seconds: number): void {
  for (const b of kit.bags) {
    b.now += seconds;
    for (const c of b.pending.filter((x) => x.at <= b.now)) {
      b.pending.splice(b.pending.indexOf(c), 1);
      c.fn();
    }
  }
}

const scaffoldOf = (s: RelicScreen): { content: Container; actionBar: Container } => (s as unknown as { scaffold: { content: Container; actionBar: Container } }).scaffold;
const cardsOf = (s: RelicScreen): Container[] => scaffoldOf(s).content.children.filter((c) => c.constructor.name === 'PressCard') as Container[];
const framesOf = (s: RelicScreen): Map<string, Container> => (s as unknown as { frames: Map<string, Container> }).frames;

describe('the toy screen', () => {
  beforeEach(() => {
    kit.bags.length = 0;
    kit.drawn.length = 0;
    kit.hides.length = 0;
    kit.reduced = false;
    kit.layer.removeChildren();
  });

  it('can be built asleep: nothing shows and the game is not held until an offer wakes it', () => {
    const e = env();
    const s = new RelicScreen(e as never, undefined, true);
    expect(s.isOpen).toBe(false);
    expect(kit.layer.children[0]?.visible).toBe(false);
    expect(e.holds).toBe(0);
    s.render();
    expect(cardsOf(s)).toHaveLength(0);
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    s.open();
    expect(s.isOpen).toBe(true);
    expect(kit.layer.children[0]?.visible).toBe(true);
    expect(e.holds).toBe(1);
  });

  it('opens at once when it is not built asleep', () => {
    const e = env();
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    const s = new RelicScreen(e as never);
    expect(s.isOpen).toBe(true);
    expect(cardsOf(s)).toHaveLength(1);
    advance(0.2);
    expect(cardsOf(s)).toHaveLength(3);
  });

  it('builds the first card of an offer at once and the others a gap apart', () => {
    const e = env();
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    const s = new RelicScreen(e as never, undefined, true);
    s.open();
    expect(cardsOf(s)).toHaveLength(1);
    advance(0.045);
    expect(cardsOf(s)).toHaveLength(2);
    advance(0.045);
    expect(cardsOf(s)).toHaveLength(3);
  });

  it('builds every card at once without motion', () => {
    kit.reduced = true;
    const e = env();
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    const s = new RelicScreen(e as never, undefined, true);
    s.open();
    expect(cardsOf(s)).toHaveLength(3);
  });

  it('goes back to sleep when the offer is answered, keeping its frames, and wakes for the next act with the same ones', async () => {
    const e = env();
    let closed = 0;
    const s = new RelicScreen(e as never, () => void closed++, true);
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    s.open();
    advance(0.2);
    const first = new Set(framesOf(s).values());
    expect(first.size).toBe(3);
    e.battle.pending = null;
    s.render();
    expect(closed).toBe(1);
    expect(s.isOpen).toBe(false);
    expect(e.released).toBe(1);
    kit.hides.forEach((h) => h());
    await Promise.resolve();
    await Promise.resolve();
    expect(cardsOf(s)).toHaveLength(0);
    // The frames are on the shelf, whole, and not in any card.
    for (const f of first) {
      expect(f.destroyed).toBe(false);
      expect(f.parent).toBeNull();
    }
    e.battle.pending = offer(['common:x', 'rare:y', 'epic:z']);
    s.open();
    advance(0.2);
    expect(e.holds).toBe(2);
    expect(new Set(framesOf(s).values())).toEqual(first);
    expect([...first].every((f) => f.parent !== null)).toBe(true);
  });

  it('makes a frame for a rarity and slot it has none for, and keeps it', () => {
    const e = env();
    const s = new RelicScreen(e as never, undefined, true);
    e.battle.pending = offer(['legendary:a', 'legendary:b', 'common:c']);
    s.open();
    advance(0.2);
    expect([...framesOf(s).keys()].sort()).toEqual(['common:2', 'legendary:0', 'legendary:1']);
  });

  it('does not wake once destroyed, and destroying it frees what is on its shelf', () => {
    const e = env();
    const s = new RelicScreen(e as never, undefined, true);
    for (const step of s.prewarm()) step();
    const frames = [...framesOf(s).values()];
    expect(frames).toHaveLength(12);
    s.destroy();
    expect(frames.every((f) => f.destroyed)).toBe(true);
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    s.open();
    expect(s.isOpen).toBe(false);
    expect(e.holds).toBe(0);
    expect(() => s.destroy()).not.toThrow();
  });

  describe('ahead of time', () => {
    it('is a handful of small pieces: the paper, the reroll button, and a frame for each rarity and slot', () => {
      const s = new RelicScreen(env() as never, undefined, true);
      expect(s.prewarm()).toHaveLength(1 + 1 + 4 * 3);
    });

    it('draws each part once into the hidden target, and builds a frame for each', () => {
      const s = new RelicScreen(env() as never, undefined, true);
      for (const step of s.prewarm()) step();
      expect(kit.drawn).toHaveLength(14);
      expect(new Set(kit.drawn).size).toBe(14);
      expect(framesOf(s).size).toBe(12);
    });

    it('does nothing once the screen is up: the header and the button are in use', () => {
      const e = env();
      const s = new RelicScreen(e as never, undefined, true);
      const steps = s.prewarm();
      e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
      s.open();
      advance(0.2);
      kit.drawn.length = 0;
      steps[0]?.();
      steps[1]?.();
      expect(kit.drawn).toHaveLength(0);
    });

    it('does not draw a frame that a card is wearing', () => {
      const e = env();
      const s = new RelicScreen(e as never, undefined, true);
      const steps = s.prewarm();
      e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
      s.open();
      advance(0.2);
      kit.drawn.length = 0;
      for (const step of steps.slice(2)) step();
      // The three frames on show are worn; the other nine are free.
      expect(kit.drawn).toHaveLength(9);
    });

    it('reuses the reroll button it built ahead of time when the offer wants the same one', () => {
      const e = env();
      const s = new RelicScreen(e as never, undefined, true);
      s.prewarm()[1]?.();
      const bar = scaffoldOf(s).actionBar;
      const button = bar.children[0];
      expect(button).toBeTruthy();
      e.battle.pending = offer(['common:a', 'rare:b', 'epic:c'], 1);
      s.open();
      advance(0.2);
      expect(bar.children[0]).toBe(button);
      // A second offer with no free reroll left wants another one.
      e.battle.pending = offer(['common:d', 'rare:e', 'epic:f'], 0);
      s.render();
      advance(0.2);
      expect(bar.children[0]).not.toBe(button);
    });
  });
});

interface Dock {
  state: { peeking: boolean; allowed: boolean; shown: boolean };
  fold(): void;
  unfold(): void;
  layer: Container;
}

const dockOf = (s: RelicScreen): Dock => (s as unknown as { dock: Dock }).dock;
const pickOf = (s: RelicScreen): ((i: number) => void) => (s as unknown as { pick: (i: number) => void }).pick.bind(s);
const rerollOf = (s: RelicScreen): ((paid: boolean) => void) => (s as unknown as { reroll: (p: boolean) => void }).reroll.bind(s);
const toggleOf = (s: RelicScreen): Container => scaffoldOf(s).content.parent?.children.find((c) => c.constructor.name === 'Button') as Container;

/** An offer on screen, with the battle's answers to a pick and a reroll recorded. */
function openOffer(): { e: FakeEnv; s: RelicScreen; picks: number[]; rerolls: boolean[] } {
  const e = env();
  const picks: number[] = [];
  const rerolls: boolean[] = [];
  Object.assign(e.battle, {
    pickRelic: (i: number) => {
      picks.push(i);
      return null;
    },
    rerollRelics: (paid: boolean) => {
      rerolls.push(paid);
      return null;
    },
  });
  e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
  const s = new RelicScreen(e as never, undefined, true);
  s.open();
  advance(0.2);
  return { e, s, picks, rerolls };
}

describe('the toy screen, folded away to read the board', () => {
  beforeEach(() => {
    kit.bags.length = 0;
    kit.drawn.length = 0;
    kit.hides.length = 0;
    kit.reduced = true;
    kit.layer.removeChildren();
  });

  it('has the toggle in its header and the shield and way back above it in the popup layer', () => {
    const { s } = openOffer();
    expect(toggleOf(s)?.visible).toBe(true);
    expect(kit.layer.children).toHaveLength(2);
    expect(kit.layer.children[1]).toBe(dockOf(s).layer);
    expect(dockOf(s).layer.visible).toBe(false);
  });

  it('folded, the screen is a tenth of its size, invisible and out of the hit tests, and the offer is still pending and still holding the game', () => {
    const { e, s } = openOffer();
    const sc = scaffoldOf(s) as unknown as Container;
    dockOf(s).fold();
    expect(sc.visible).toBe(false);
    expect(sc.scale.x).toBeCloseTo(0.1, 5);
    expect(sc.interactiveChildren).toBe(false);
    expect(dockOf(s).layer.visible).toBe(true);
    expect(s.isOpen).toBe(true);
    expect(s.peeking).toBe(true);
    expect((e.battle.pending as { kind: string }).kind).toBe('relic');
    expect(e.holds - e.released).toBe(1);
  });

  it('a pick or a reroll that reaches it while folded is refused: the offer is not touched', () => {
    const { s, picks, rerolls } = openOffer();
    dockOf(s).fold();
    pickOf(s)(0);
    rerollOf(s)(false);
    expect(picks).toEqual([]);
    expect(rerolls).toEqual([]);
  });

  it('back from the fold it is the screen it was: same size, same place, the offer can be answered', () => {
    const { s, picks, e } = openOffer();
    const sc = scaffoldOf(s) as unknown as Container;
    const cards = cardsOf(s);
    dockOf(s).fold();
    dockOf(s).unfold();
    expect(sc.visible).toBe(true);
    expect(sc.scale.x).toBe(1);
    expect(sc.alpha).toBe(1);
    expect(sc.position.x).toBe(0);
    expect(sc.position.y).toBe(0);
    expect(sc.pivot.x).toBe(0);
    expect(sc.interactiveChildren).toBe(true);
    expect(cardsOf(s)).toEqual(cards);
    expect(dockOf(s).layer.visible).toBe(false);
    pickOf(s)(1);
    expect(picks).toEqual([1]);
    expect((e.battle.pending as { kind: string }).kind).toBe('relic');
  });

  it('a pick that has just been made cannot be folded away from under the toy flying out of its card', () => {
    const { s, picks } = openOffer();
    pickOf(s)(0);
    expect(picks).toEqual([0]);
    dockOf(s).fold();
    expect(s.peeking).toBe(false);
    advance(0.25);
    dockOf(s).fold();
    expect(s.peeking).toBe(true);
  });

  it('a resize while folded keeps it folded and does not rebuild the offer on top of the board', () => {
    const { s } = openOffer();
    dockOf(s).fold();
    const sc = scaffoldOf(s) as unknown as Container;
    s.render();
    expect(sc.visible).toBe(false);
    expect(s.peeking).toBe(true);
    expect(cardsOf(s)).toHaveLength(3);
  });

  it('an offer answered from outside while it is folded puts the screen at rest and lets it sleep: no shield, no way back', () => {
    const { e, s } = openOffer();
    const sc = scaffoldOf(s) as unknown as Container;
    dockOf(s).fold();
    e.battle.pending = null;
    s.render();
    expect(s.isOpen).toBe(false);
    expect(s.peeking).toBe(false);
    expect(dockOf(s).layer.visible).toBe(false);
    expect(sc.scale.x).toBe(1);
    expect(sc.alpha).toBe(1);
    expect(sc.visible).toBe(false);
    expect(e.released).toBe(1);
  });

  it('the tutorial\'s toy lesson hides the toggle and cannot fold the screen', () => {
    const e = env();
    e.lessonOn = () => true;
    e.battle.pending = offer(['common:a', 'rare:b', 'epic:c']);
    const s = new RelicScreen(e as never, undefined, true);
    s.open();
    expect(toggleOf(s).visible).toBe(false);
    dockOf(s).fold();
    expect(s.peeking).toBe(false);
    expect((scaffoldOf(s) as unknown as Container).scale.x).toBe(1);
  });

  it('a lesson that begins while it is folded brings it back', () => {
    const { e, s } = openOffer();
    dockOf(s).fold();
    e.lessonOn = () => true;
    s.render();
    expect(s.peeking).toBe(false);
    expect((scaffoldOf(s) as unknown as Container).visible).toBe(true);
    expect(toggleOf(s).visible).toBe(false);
  });

  it('wakes for the next act unfolded, with the toggle in place', () => {
    const { e, s } = openOffer();
    dockOf(s).fold();
    e.battle.pending = null;
    s.render();
    e.battle.pending = offer(['rare:x', 'epic:y', 'legendary:z']);
    s.open();
    expect(s.peeking).toBe(false);
    expect(toggleOf(s).visible).toBe(true);
    expect(dockOf(s).layer.visible).toBe(false);
    expect((scaffoldOf(s) as unknown as Container).scale.x).toBe(1);
  });
});
