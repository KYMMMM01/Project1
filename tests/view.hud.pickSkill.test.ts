import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Step 3, the 3-pick summon popup (docs/qa/directive_2026-10-13_skills_build.md decisions 29 and 30): holding a card shows the cat's ability line and, when
 * the battle has skills and the cat has one, the skill's name, cooldown and line after it; the hint under the cards says so. With skills off the hold
 * shows the ability line alone and the hint is today's. The popup is built for real out of stand-ins for the UI kit's pieces, like `view.hud.pick.test.ts`.
 */
const kit = vi.hoisted(() => ({
  tips: [] as Array<() => { title: string; text: string }>,
  labels: [] as string[],
}));

vi.mock('@/core/game', () => ({ game: { safeTop: 0, safeBottom: 0 } }));
vi.mock('@/audio', () => ({ audio: { play: () => undefined } }));
vi.mock('@/core/haptics', () => ({ haptic: () => undefined }));
vi.mock('@/core/tween', () => ({ Ease: new Proxy({}, { get: () => (v: number) => v }) }));
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
    setEnabled(): void {}
  }
  return { CLASS_ICON: { warrior: 'sword', ranger: 'bow', mage: 'wand', trickster: 'bell' }, PressCard, unitPortrait: () => new Container() };
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
    }
    close(): void {}
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
    onTap(): this {
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
    call(): void {}
    run(): void {}
    runKeyed(): void {}
    killKeyed(): void {}
    killAll(): void {}
  }
  const label = (text: string): InstanceType<typeof Container> => {
    kit.labels.push(text);
    return Object.assign(new Container(), { text, width: 90 });
  };
  return {
    Popup,
    Panel,
    Button,
    TweenBag,
    CardFrame: class extends Container {},
    Color: new Proxy({}, { get: () => 0 }),
    HOLD_DELAY: 0.4,
    attachTooltip: (_card: unknown, content: () => { title: string; text: string }) => {
      kit.tips.push(content);
      return () => undefined;
    },
    drawIcon: () => new Container(),
    fitLabel: () => undefined,
    uiLabel: label,
    motion: { reduced: true },
  };
});

import { getLang, setLang, t } from '@/core/i18n';
import { unitDef, type UnitId } from '@/game';
import { SP_ROWS } from '@/game/data/spSkills';
import { spTexts } from '@/game/data/spTexts';
import '@/game/data/strings';
import '@/view/hud/strings';
import { SummonPickPopup } from '../src/view/hud/popups/SummonPickPopup';

const original = getLang();

beforeAll(() => {
  (globalThis as { document?: unknown }).document = { documentElement: { lang: '' } };
});
afterAll(() => setLang(original));
beforeEach(() => {
  kit.tips.length = 0;
  kit.labels.length = 0;
  setLang('ko');
});

function open(options: UnitId[], spOn: boolean): SummonPickPopup {
  const env = { battle: { spOn, units: [], pickSummon: () => null }, ctx: { command: (_n: string, fn: () => string | null) => fn() }, lessonOn: () => false };
  const p = new SummonPickPopup(env as never, options, false);
  p.layout(720, 1280);
  return p;
}

const OPTIONS: UnitId[] = ['t_bard', 'w_viking', 'm_storm'];

describe('what holding a card of the 3-pick shows', () => {
  it('is the ability line and nothing more with skills off, for cats with and without a skill: exactly today\'s', () => {
    open(OPTIONS, false);
    expect(kit.tips).toHaveLength(3);
    OPTIONS.forEach((id, i) => {
      const shown = (kit.tips[i] as () => { title: string; text: string })();
      expect(shown.text, id).toBe(unitDef(id).skillText());
    });
    expect(kit.tips.map((f) => f().text).join('')).not.toMatch(/스킬/);
  });

  it('is the ability line, a blank line and the skill\'s name, cooldown and line with skills on, for a cat that has a skill', () => {
    for (const lang of ['ko', 'en'] as const) {
      kit.tips.length = 0;
      setLang(lang);
      open(OPTIONS, true);
      OPTIONS.forEach((id, i) => {
        const shown = (kit.tips[i] as () => { title: string; text: string })();
        const skill = unitDef(id).spSkill;
        expect(shown.title, `${lang} ${id}`).toBe(t(unitDef(id).nameKey));
        expect(shown.text, `${lang} ${id}`).toBe(`${unitDef(id).skillText()}\n\n${spTexts(skill?.id as never).bubble}`);
      });
    }
  });

  it('is the ability line alone for a cat that has no skill, even with skills on', () => {
    open(['w_paw', 'r_sling', 'm_snow'], true);
    ['w_paw', 'r_sling', 'm_snow'].forEach((id, i) => {
      expect((kit.tips[i] as () => { text: string })().text, id).toBe(unitDef(id as UnitId).skillText());
    });
  });

  it('quotes the row: a retuned cooldown is the number in the tooltip', () => {
    const old = SP_ROWS.jam.cooldown;
    SP_ROWS.jam.cooldown = 22;
    try {
      open(OPTIONS, true);
      expect((kit.tips[0] as () => { text: string })().text).toContain('\n22초마다 · ');
    } finally {
      SP_ROWS.jam.cooldown = old;
    }
  });

  it('is read when the card is held, not when the popup opens (it is a function of the battle\'s setting at that moment)', () => {
    open(OPTIONS, true);
    expect(typeof kit.tips[0]).toBe('function');
  });
});

describe('the hint under the cards', () => {
  it('says "ability and skill" with skills on and today\'s words with them off, in both languages', () => {
    setLang('ko');
    open(OPTIONS, true);
    expect(kit.labels).toContain('꾹 누르면 특기와 스킬이 보여요');
    kit.labels.length = 0;
    open(OPTIONS, false);
    expect(kit.labels).toContain('꾹 누르면 능력이 보여요');
    expect(kit.labels).not.toContain('꾹 누르면 특기와 스킬이 보여요');
    setLang('en');
    kit.labels.length = 0;
    open(OPTIONS, true);
    expect(kit.labels).toContain('Hold a card to see its ability and skill');
    kit.labels.length = 0;
    open(OPTIONS, false);
    expect(kit.labels).toContain('Hold a card to see its skill');
  });
});

