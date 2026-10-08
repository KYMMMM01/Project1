import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Container, Texture } from 'pixi.js';

const spies = vi.hoisted(() => ({ burst: vi.fn(() => 1), haptic: vi.fn(), play: vi.fn(), emit: vi.fn() }));

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 64, h: 64, ax: 0.5, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));
vi.mock('@/fx/particles', () => ({
  ParticleSystem: class {
    budget = { cap: 700 };
    burst = spies.burst;
    emit = spies.emit.mockImplementation(() => ({ alive: true, stop: () => undefined, moveTo: () => undefined }));
    alloc = vi.fn(() => null);
    commit = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
    stats = () => ({ live: 0, peak: 0, cap: 700, dropped: 0, emitted: 0, created: 0, idle: 0, emitters: 0 });
  },
}));
vi.mock('@/fx/numbers', () => ({
  FloatingNumbers: class {
    cap = 40;
    count = 0;
    show = vi.fn();
    update = vi.fn();
    clear = vi.fn();
    destroy = vi.fn();
  },
}));
vi.mock('@/fx/cutin', () => ({ awakeningCutIn: { play: spies.play } }));
vi.mock('@/core/haptics', () => ({ haptic: spies.haptic }));

import { game } from '@/core/game';
import { Tweener } from '@/core/tween';
import { Fx } from '@/fx/fx';
import { QualityGovernor, startFxGovernor, stopFxGovernor } from '@/fx/governor';
import { ScreenFx, Trauma } from '@/fx/screen';
import { FX_TIERS, fxSettings, setFxSettings } from '@/fx/settings';

const DT = 1 / 60;
const rect = { x: 100, y: 200, w: 140, h: 150 };

describe('Fx specials', () => {
  let tw: Tweener;
  let screen: ScreenFx;
  let fx: Fx;
  let shake: MockInstance<typeof game.shake>;

  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      tw.update(DT);
      screen.update(DT);
      fx.update(DT);
    }
  };

  beforeEach(() => {
    setFxSettings({ reducedMotion: false, flashes: true, quality: 1, tier: 'mid', autoTier: false });
    game.time = 100;
    tw = new Tweener();
    screen = new ScreenFx();
    fx = new Fx(new Container(), tw, { screen });
    shake = vi.spyOn(game, 'shake').mockImplementation(() => undefined);
    spies.burst.mockClear();
    spies.haptic.mockClear();
    spies.play.mockClear();
  });

  afterEach(() => {
    shake.mockRestore();
    fx.destroy();
    screen.destroy();
  });

  describe('quality tiers', () => {
    it('particle and number caps follow fxSettings.tier on the next update', () => {
      setFxSettings({ tier: 'low' });
      run(DT);
      expect(fx.ps.budget.cap).toBe(FX_TIERS.low.particles);
      expect(fx.numbers.cap).toBe(FX_TIERS.low.numbers);
      setFxSettings({ tier: 'high' });
      run(DT);
      expect(fx.ps.budget.cap).toBe(400);
      expect(fx.numbers.cap).toBe(40);
      setFxSettings({ tier: 'mid' });
      run(DT);
      expect(fx.ps.budget.cap).toBe(250);
      expect(fx.numbers.cap).toBe(24);
    });

    it('the shake of low-tier devices is softened', () => {
      setFxSettings({ tier: 'low' });
      fx.critBurst(0, 0, { strong: true });
      expect(shake).toHaveBeenLastCalledWith(Trauma.t1 * 0.7);
      setFxSettings({ tier: 'high' });
      fx.critBurst(0, 0, { strong: true });
      expect(shake).toHaveBeenLastCalledWith(Trauma.t1);
    });

    it('big set-pieces scale their counts by the tier', () => {
      for (const tier of ['high', 'mid', 'low'] as const) {
        setFxSettings({ tier });
        spies.burst.mockClear();
        fx.coinRain();
        const mods = spies.burst.mock.calls.map((c) => (c as unknown[])[3] as { count?: number } | undefined);
        expect(mods.some((m) => m?.count === FX_TIERS[tier].scale)).toBe(true);
      }
    });
  });

  describe('automatic governor', () => {
    const tick = (dt: number, n: number): void => {
      const g = game as unknown as { tick(dt: number): void };
      for (let i = 0; i < n; i++) g.tick(dt);
    };

    afterEach(() => {
      stopFxGovernor();
      setFxSettings({ tier: 'mid', autoTier: false });
    });

    it('is one shared instance, and steps the tier down on sustained slow frames', () => {
      setFxSettings({ autoTier: true, tier: 'mid' });
      const a = startFxGovernor();
      expect(startFxGovernor()).toBe(a);
      expect(a).toBeInstanceOf(QualityGovernor);
      tick(0.034, 60 * 5 * 2);
      expect(fxSettings.tier).toBe('low');
    });

    it('does nothing while autoTier is off', () => {
      setFxSettings({ autoTier: false, tier: 'mid' });
      startFxGovernor();
      tick(0.034, 60 * 10);
      expect(fxSettings.tier).toBe('mid');
    });

    it('ignores stalled frames (a throttled background tab) instead of counting them as slow', () => {
      const g = game as unknown as { app: unknown };
      const real = g.app;
      const ticker = { deltaMS: 600 };
      g.app = { ticker };
      setFxSettings({ autoTier: true, tier: 'mid' });
      startFxGovernor();
      tick(0.05, 60 * 20);
      expect(fxSettings.tier).toBe('mid');
      ticker.deltaMS = 34;
      tick(0.034, 60 * 5);
      expect(fxSettings.tier).toBe('low');
      g.app = real;
    });

    it('adopts a tier chosen by hand instead of fighting it', () => {
      setFxSettings({ autoTier: true, tier: 'mid' });
      const g = startFxGovernor();
      tick(0.017, 30);
      setFxSettings({ tier: 'high' });
      tick(0.017, 5);
      expect(g.tier).toBe('high');
      expect(fxSettings.tier).toBe('high');
    });
  });

  describe('sequences', () => {
    it('bossDeath returns a promise that also carries its timeline and settles at the end', async () => {
      const seq = fx.bossDeath(360, 500);
      expect(typeof seq.then).toBe('function');
      expect(seq.impact).toBeCloseTo(1);
      expect(seq.duration).toBeGreaterThan(seq.impact);
      let settled = false;
      void seq.then(() => {
        settled = true;
      });
      run(seq.duration - 0.2);
      await Promise.resolve();
      expect(settled).toBe(false);
      run(0.4);
      await expect(seq).resolves.toBeUndefined();
    });

    it('clearing the Fx settles a pending sequence, so an awaiting caller never hangs', async () => {
      const seq = fx.bossDeath(0, 0);
      run(0.3);
      fx.clear();
      await expect(seq).resolves.toBeUndefined();
    });

    it('awakening hands the portrait and name to the cut-in with this Fx screen effects', () => {
      const tex = Texture.WHITE;
      fx.awakening(tex, 'Guardian', { short: true, tag: 'MYTHIC' });
      expect(spies.play).toHaveBeenCalledTimes(1);
      const [t, name, opts] = spies.play.mock.calls[0] as [Texture, string, Record<string, unknown>];
      expect(t).toBe(tex);
      expect(name).toBe('Guardian');
      expect(opts).toMatchObject({ short: true, tag: 'MYTHIC', screen, haptics: true });
    });
  });

  describe('zone handles', () => {
    it('are tracked by the Fx, dropped when they end, and removed by clear()', () => {
      const h = fx.sunbeamCell(rect);
      const z = fx.zapCell(rect);
      expect(fx.stats().loops).toBe(2);
      h.stop();
      run(1);
      expect(h.alive).toBe(false);
      expect(fx.stats().loops).toBe(1);
      fx.clear();
      expect(z.alive).toBe(false);
      expect(fx.stats().loops).toBe(0);
    });

    it('hazardWarn lasts its telegraph time and then resolves done', async () => {
      const h = fx.hazardWarn(rect, 'wet');
      run(0.7);
      expect(h.alive).toBe(true);
      run(0.5);
      await expect(h.done).resolves.toBeUndefined();
      expect(fx.stats().loops).toBe(0);
    });

    it('every looping preset returns a handle with stop and moveTo, and survives rapid repeats', () => {
      const handles = [
        fx.sunbeamCell(rect),
        fx.laserDot(10, 10),
        fx.wetPuddle(rect),
        fx.zapCell(rect),
        fx.weakenSwirl(10, 10),
        fx.blizzardZone(10, 10, 100),
        fx.potionCloud(10, 10, 100),
        fx.blackHole(10, 10, 100),
      ];
      for (const h of handles) {
        h.moveTo(50, 60);
        h.stop();
        h.stop();
      }
      run(1);
      for (const h of handles) {
        h.moveTo(1, 1);
        expect(h.alive).toBe(false);
      }
      expect(fx.stats().loops).toBe(0);
    });

    it('destroying the Fx with live zones leaves nothing behind', () => {
      fx.blackHole(10, 10, 100);
      fx.laserDot(0, 0);
      expect(() => fx.destroy()).not.toThrow();
      expect(fx.stats().loops).toBe(0);
    });
  });

  describe('one-shot specials', () => {
    it('slashLine ignores a zero-length segment and otherwise draws a wake, a blade and sparks', () => {
      fx.slashLine(10, 10, 10, 10);
      expect(spies.burst).not.toHaveBeenCalled();
      fx.slashLine(0, 0, 300, 0);
      const defs = spies.burst.mock.calls.map((c) => (c as unknown[])[0] as { tex: string });
      expect(defs.filter((d) => d.tex === 'streak').length).toBe(2);
      expect(defs.filter((d) => d.tex === 'spark').length).toBeGreaterThanOrEqual(4);
    });

    it('meteor lands once, at timeline.impact, with a T3 shake, and cleans itself up', () => {
      const onImpact = vi.fn();
      const tl = fx.meteor(360, 600, { onImpact });
      expect(tl.impact).toBeGreaterThan(0.25);
      expect(tl.duration).toBeGreaterThan(tl.impact);
      run(tl.impact - 0.1);
      expect(onImpact).not.toHaveBeenCalled();
      expect(shake).not.toHaveBeenCalled();
      run(0.25);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(shake).toHaveBeenCalledWith(Trauma.t3);
      run(2);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(fx.stats().loops).toBe(0);
    });

    it('shootingStar ends in a smaller T1 impact', () => {
      const onImpact = vi.fn();
      const tl = fx.shootingStar(300, 500, { onImpact });
      run(tl.impact + 0.1);
      expect(onImpact).toHaveBeenCalledTimes(1);
      expect(shake).toHaveBeenCalledWith(Trauma.t1);
    });

    it('moltPuff reports when the unit should change, and purrHearts, shieldBreak and coinRain just draw', () => {
      const tl = fx.moltPuff(100, 100);
      expect(tl.impact).toBeGreaterThan(0.2);
      expect(tl.duration).toBeGreaterThan(tl.impact);
      spies.burst.mockClear();
      fx.purrHearts(0, 0);
      const cr = fx.coinRain();
      expect(spies.burst.mock.calls.length).toBeGreaterThan(3);
      expect(cr.duration).toBeGreaterThan(1);
      expect(cr.duration).toBeLessThan(2.5);
    });
  });
});
