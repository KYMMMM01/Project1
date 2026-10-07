import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLang, t } from '@/core/i18n';
import '@/game/data/strings';
import '@/view/director/strings';
import { Color } from '@/ui/theme';
import { WarmQueue } from '@/fx/warm';

const fx = vi.hoisted(() => ({ queue: null as unknown as WarmQueue, drawn: [] as unknown[] }));
vi.mock('pixi.js', async () => ({
  ...(await vi.importActual<typeof import('pixi.js')>('pixi.js')),
  // The red edge is a sprite of the vignette picture; a sprite needs a canvas, which the tests do not have.
  Sprite: class {
    tint = 0;
    destroy(): void {}
  },
}));
vi.mock('@/fx', async () => {
  const warm = await vi.importActual<typeof import('@/fx/warm')>('@/fx/warm');
  return {
    WARM_PRIO: warm.WARM_PRIO,
    get warm() {
      return fx.queue;
    },
    renderOnce: (c: unknown) => void fx.drawn.push(c),
    fxVignette: () => ({}),
    screenFx: { vignettePulse: () => undefined },
    Trauma: {},
  };
});

import type { BannerService, BannerSpec } from '@/view/director/banners';
import { mountBoss } from '@/view/director/boss';
import type { Stage } from '@/view/director/stage';

type Handler = (e: Record<string, unknown>) => void;

interface Rig {
  emit(type: string, e: Record<string, unknown>): void;
  pushed: Array<{ lane: string; spec: BannerSpec }>;
  dressed: BannerSpec[];
  ribbon: { current: object | null };
}

/** The director's boss part on stand-ins for the stage, the bus and the banner service: what it asks of the warm-up queue and of the banners. */
function mount(): Rig {
  const handlers = new Map<string, Handler[]>();
  const on = ((type: string, fn: Handler) => {
    handlers.set(type, [...(handlers.get(type) ?? []), fn]);
  }) as unknown as Parameters<typeof mountBoss>[1];
  const ribbon = { current: {} as object | null };
  const rig: Rig = {
    emit: (type, e) => handlers.get(type)?.forEach((fn) => fn(e)),
    pushed: [],
    dressed: [],
    ribbon,
  };
  const banners = {
    push: (lane: string, _key: string, _prio: number, spec: BannerSpec) => rig.pushed.push({ lane, spec }),
    dressBand: (spec: BannerSpec) => {
      rig.dressed.push(spec);
      return ribbon.current;
    },
  } as unknown as BannerService;
  const stage = {
    ctx: { battle: { previewWave: (wave: number) => [{ enemy: wave % 8 === 0 ? 'boss_vacuum' : 'spray', count: 1 }] } },
    fx: { ps: {}, bossWarning: () => undefined },
    direct: () => undefined,
    buzz: () => undefined,
    onDestroy: () => undefined,
  } as unknown as Stage;
  mountBoss(stage, on, banners, { setBoss: () => undefined } as unknown as Parameters<typeof mountBoss>[3]);
  return rig;
}

function drain(): void {
  for (let i = 0; i < 20 && fx.queue.pending > 0; i++) fx.queue.update(1 / 60);
}

beforeAll(() => {
  vi.stubGlobal('document', { documentElement: { lang: '' } });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  setLang('en');
  fx.queue = new WarmQueue();
  fx.queue.now = () => 0;
  fx.drawn.length = 0;
});

describe('the warning of an elite or a boss wave, drawn ahead of time', () => {
  it('asks for nothing while the next wave is a plain one', () => {
    const rig = mount();
    rig.emit('waveStart', { wave: 1, kind: 'normal' });
    rig.emit('waveStart', { wave: 5, kind: 'normal' });
    expect(fx.queue.pending).toBe(0);
  });

  it('draws the boss ribbon, dressed with the boss and its colour, once the wave before it starts', () => {
    const rig = mount();
    rig.emit('waveStart', { wave: 7, kind: 'normal' });
    expect(fx.queue.pending).toBe(2);
    expect(fx.drawn).toHaveLength(0);
    drain();
    expect(rig.dressed).toHaveLength(1);
    const spec = rig.dressed[0] as BannerSpec;
    expect(spec.color).toBe(Color.berry);
    expect(spec.title).toBe(t('director.warning'));
    expect(spec.sub).toContain('Vacuum');
    // The ribbon and the edge sprite, in the order they were asked.
    expect(fx.drawn).toHaveLength(2);
    expect(fx.drawn[0]).toBe(rig.ribbon.current);
  });

  it('dresses an elite ribbon in the elite colour', () => {
    const rig = mount();
    rig.emit('waveStart', { wave: 3, kind: 'normal' });
    drain();
    expect((rig.dressed[0] as BannerSpec).color).toBe(Color.coral);
  });

  it('draws the ribbon with the very words the warning will show', () => {
    const rig = mount();
    rig.emit('waveStart', { wave: 7, kind: 'normal' });
    drain();
    rig.emit('waveStart', { wave: 8, kind: 'boss' });
    expect(rig.pushed).toHaveLength(1);
    expect(rig.pushed[0]?.lane).toBe('alert');
    expect(rig.pushed[0]?.spec).toEqual(rig.dressed[0]);
  });

  it('draws nothing of the ribbon while one is up (the banner service hands none back), and the edge still', () => {
    const rig = mount();
    rig.ribbon.current = null;
    rig.emit('waveStart', { wave: 7, kind: 'normal' });
    drain();
    expect(rig.dressed).toHaveLength(1);
    expect(fx.drawn).toHaveLength(1);
  });

  it('asks again in the next battle: its banner service is a new one', () => {
    const first = mount();
    first.emit('waveStart', { wave: 7, kind: 'normal' });
    drain();
    const second = mount();
    second.emit('waveStart', { wave: 7, kind: 'normal' });
    drain();
    expect(first.dressed).toHaveLength(1);
    expect(second.dressed).toHaveLength(1);
  });
});
