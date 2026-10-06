import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';

const spies = vi.hoisted(() => ({ burst: vi.fn(() => 1), haptic: vi.fn() }));

vi.mock('@/fx/textures', () => ({
  ensureFxTextures: () => undefined,
  fxTex: () => ({ texture: Texture.WHITE, w: 256, h: 64, ax: 0, ay: 0.5 }),
  fxTexture: () => Texture.WHITE,
  fxVignette: () => Texture.WHITE,
}));
vi.mock('@/fx/particles', () => ({
  ParticleSystem: class {
    budget = { cap: 700 };
    burst = spies.burst;
    emit = vi.fn(() => ({ alive: true, stop: () => undefined, moveTo: () => undefined }));
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
vi.mock('@/core/haptics', () => ({ haptic: spies.haptic }));

import { game } from '@/core/game';
import { Tweener } from '@/core/tween';
import { Fx } from '@/fx/fx';
import { TimeFreeze } from '@/fx/freeze';
import { ScreenFx, Trauma } from '@/fx/screen';
import { setFxSettings } from '@/fx/settings';

const DT = 1 / 60;

describe('Fx presets', () => {
  let tw: Tweener;
  let screen: ScreenFx;
  let target: { timeScale: number };
  let freeze: TimeFreeze;
  let fx: Fx;
  let shake: MockInstance<typeof game.shake>;
  let root: Container;

  const run = (seconds: number): void => {
    for (let t = 0; t < seconds - 1e-9; t += DT) {
      tw.update(DT);
      freeze.update(DT);
      screen.update(DT);
      fx.update(DT);
    }
  };

  beforeEach(() => {
    setFxSettings({ reducedMotion: false, flashes: true, quality: 1 });
    game.time = 100;
    tw = new Tweener();
    screen = new ScreenFx();
    target = { timeScale: 1 };
    freeze = new TimeFreeze().addTarget(target);
    root = new Container();
    fx = new Fx(root, tw, { screen, freeze });
    shake = vi.spyOn(game, 'shake').mockImplementation(() => undefined);
    spies.burst.mockClear();
    spies.haptic.mockClear();
  });

  afterEach(() => {
    shake.mockRestore();
    fx.destroy();
    screen.destroy();
  });

  describe('summonReveal', () => {
    it('never calls onImpact before it returns, for any tier, and calls it once at the impact time', () => {
      for (let tier = 0; tier <= 4; tier++) {
        const order: string[] = [];
        // The documented usage: the callback reads the returned timeline.
        const tl = fx.summonReveal(300, 400, tier, { onImpact: () => order.push(`impact:${tl.impact}`) });
        order.push('returned');
        expect(order).toEqual(['returned']);
        if (tl.impact > 0.02) {
          run(tl.impact - 0.02);
          expect(order).toEqual(['returned']);
        }
        run(0.06);
        expect(order).toEqual(['returned', `impact:${tl.impact}`]);
        run(3);
        expect(order.length).toBe(2);
        fx.clear();
        freeze.cancel();
        screen.clear();
      }
    });

    it('anticipation and total length grow with the tier (colour first, longer wait for rarer)', () => {
      const t = [0, 1, 2, 3, 4].map((tier) => fx.summonReveal(0, 0, tier));
      for (let i = 1; i < t.length; i++) {
        expect((t[i] as { impact: number }).impact).toBeGreaterThan((t[i - 1] as { impact: number }).impact);
        expect((t[i] as { duration: number }).duration).toBeGreaterThan((t[i - 1] as { duration: number }).duration);
      }
      expect((t[0] as { impact: number }).impact).toBe(0);
      expect((t[4] as { impact: number }).impact).toBeCloseTo(0.38);
    });

    it('clamps odd tiers', () => {
      expect(fx.summonReveal(0, 0, -3).impact).toBe(0);
      expect(fx.summonReveal(0, 0, 99).impact).toBeCloseTo(0.38);
      expect(fx.summonReveal(0, 0, 2.9).impact).toBeCloseTo(0.12);
    });

    it('shakes with the guide ladder, at the impact moment and not before', () => {
      fx.summonReveal(0, 0, 0);
      fx.summonReveal(0, 0, 1);
      run(0.5);
      expect(shake).not.toHaveBeenCalled();
      fx.summonReveal(0, 0, 2);
      expect(shake).not.toHaveBeenCalled();
      run(0.2);
      expect(shake).toHaveBeenCalledTimes(1);
      expect(shake.mock.calls[0]?.[0]).toBeCloseTo(Trauma.t2 * 0.9);

      shake.mockClear();
      freeze.cancel();
      fx.summonReveal(0, 0, 4);
      run(0.3);
      expect(shake).not.toHaveBeenCalled();
      run(0.2);
      expect(shake).toHaveBeenCalledWith(Trauma.t5);
    });

    it('flashes and hit-stops only from legendary up, at the impact', () => {
      fx.summonReveal(0, 0, 2);
      run(0.5);
      expect(screen.flashesShown).toBe(0);
      expect(target.timeScale).toBe(1);

      fx.summonReveal(0, 0, 3);
      run(0.1);
      expect(screen.flashesShown).toBe(0);
      expect(target.timeScale).toBe(1);
      run(0.15);
      expect(screen.flashesShown).toBe(1);
      expect(target.timeScale).toBe(0);
      run(0.1);
      expect(target.timeScale).toBe(1);
    });

    it('a mythic reveal ends its hit-stop in slow motion (H5), then returns to normal speed', () => {
      fx.summonReveal(0, 0, 4);
      run(0.4);
      expect(target.timeScale).toBe(0);
      run(0.15);
      expect(target.timeScale).toBeCloseTo(0.3);
      run(0.4);
      expect(target.timeScale).toBe(1);
    });

    it('quick reveals are short, quiet and in the tier colour: no flash, no hit-stop, small shake', () => {
      const full = fx.summonReveal(0, 0, 4);
      const fullBursts = spies.burst.mock.calls.length;
      fx.clear();
      freeze.cancel();
      spies.burst.mockClear();
      shake.mockClear();
      const quick = fx.summonReveal(0, 0, 4, { quick: true });
      expect(quick.impact).toBeLessThan(0.2);
      expect(quick.duration).toBeLessThan(full.duration);
      expect(spies.burst.mock.calls.length).toBeLessThan(fullBursts);
      run(1);
      expect(screen.flashesShown).toBe(0);
      expect(target.timeScale).toBe(1);
      expect(shake.mock.calls.every((c) => c[0] < Trauma.t3)).toBe(true);
    });

    it('clear() cancels pending impacts (scene restart)', () => {
      const onImpact = vi.fn();
      fx.summonReveal(0, 0, 3, { onImpact });
      run(0.05);
      fx.clear();
      run(1);
      expect(onImpact).not.toHaveBeenCalled();
    });
  });

  describe('haptics', () => {
    it('buzzes on the big moments with the matching core pattern', () => {
      fx.summonReveal(0, 0, 0);
      expect(spies.haptic).toHaveBeenLastCalledWith('tap');
      fx.summonReveal(0, 0, 3);
      run(0.3);
      expect(spies.haptic).toHaveBeenLastCalledWith('medium');
      freeze.cancel();
      fx.summonReveal(0, 0, 4);
      run(0.5);
      expect(spies.haptic).toHaveBeenLastCalledWith('jackpot');
    });

    it('stays silent when disabled', () => {
      const quiet = new Fx(new Container(), tw, { screen, freeze, haptics: false });
      quiet.summonReveal(0, 0, 3);
      quiet.bossLanding(0, 0);
      quiet.bossWarning();
      quiet.waveClear();
      quiet.levelUp(0, 0);
      quiet.mergeBurst(0, 0);
      for (let t = 0; t < 1; t += DT) tw.update(DT);
      expect(spies.haptic).not.toHaveBeenCalled();
      quiet.destroy();
    });
  });

  describe('boss and wave moments', () => {
    it('bossWarning pulses the screen edge, rumbles for about a second and reports its length', () => {
      const tl = fx.bossWarning();
      expect(tl.duration).toBeGreaterThan(2);
      run(1.2);
      expect(shake.mock.calls.length).toBeGreaterThanOrEqual(8);
      expect(shake.mock.calls.every((c) => c[0] <= 0.25)).toBe(true);
      expect(spies.haptic).toHaveBeenCalledWith('warning');
    });

    it('bossLanding is a T3 shake with a 66 ms hit-stop', () => {
      fx.bossLanding(360, 600);
      expect(shake).toHaveBeenCalledWith(Trauma.t3);
      expect(target.timeScale).toBe(0);
      run(0.1);
      expect(target.timeScale).toBe(1);
    });

    it('bossDeath: freezes at once, six blasts with a rising shake, then the final blast once', () => {
      const onFinal = vi.fn();
      const tl = fx.bossDeath(360, 500, { onFinal });
      expect(tl.impact).toBeCloseTo(1);
      expect(tl.duration).toBeGreaterThan(tl.impact + 1);
      expect(target.timeScale).toBe(0);
      run(0.7);
      const ramp = shake.mock.calls.map((c) => c[0]);
      expect(ramp.length).toBe(6);
      expect(ramp[5] as number).toBeGreaterThan(ramp[0] as number);
      expect(onFinal).not.toHaveBeenCalled();
      expect(screen.flashesShown).toBe(0);
      const burstsBefore = spies.burst.mock.calls.length;
      run(0.35);
      expect(onFinal).toHaveBeenCalledTimes(1);
      expect(screen.flashesShown).toBe(1);
      expect(shake).toHaveBeenLastCalledWith(Trauma.t5);
      expect(spies.burst.mock.calls.length).toBeGreaterThan(burstsBefore + 5);
      // The default cooldown has passed by then, so the finale gets its own hit-stop.
      expect(target.timeScale).toBe(0);
      run(3);
      expect(onFinal).toHaveBeenCalledTimes(1);
      expect(target.timeScale).toBe(1);
    });

    it('bossDeath flickers the boss sprite white and red and survives it being destroyed', () => {
      const parent = new Container();
      const boss = new Sprite(Texture.WHITE);
      parent.addChild(boss);
      fx.bossDeath(0, 0, { target: boss });
      run(0.05);
      expect(parent.children.length).toBe(2);
      boss.destroy();
      expect(() => run(0.6)).not.toThrow();
    });

    it('waveClear is T3 with a 50 ms hit-stop, and may linger at half speed', () => {
      fx.waveClear();
      expect(shake).toHaveBeenCalledWith(Trauma.t3);
      expect(target.timeScale).toBe(0);
      run(0.07);
      expect(target.timeScale).toBe(1);

      freeze.cancel();
      run(0.5);
      fx.waveClear({ slowMo: true });
      run(0.07);
      expect(target.timeScale).toBeCloseTo(0.5);
      run(0.3);
      expect(target.timeScale).toBe(1);
    });
  });

  describe('small presets', () => {
    it('critBurst shakes the screen only for strong targets', () => {
      fx.critBurst(0, 0);
      expect(shake).not.toHaveBeenCalled();
      fx.critBurst(0, 0, { strong: true });
      expect(shake).toHaveBeenCalledWith(Trauma.t1);
    });

    it('mergeBurst gives the board its small shake at the moment of impact', () => {
      fx.mergeBurst(0, 0);
      run(0.1);
      expect(shake).not.toHaveBeenCalled();
      run(0.1);
      expect(shake).toHaveBeenCalledTimes(1);
      expect(shake.mock.calls[0]?.[0]).toBeCloseTo(0.41);
    });

    it('reduced motion softens every shake the presets ask for', () => {
      setFxSettings({ reducedMotion: true });
      fx.bossLanding(0, 0);
      expect(shake.mock.calls[0]?.[0]).toBeCloseTo(Trauma.t3 * 0.35);
    });

    it('rays handles are safe to move after the Fx was cleared', () => {
      const r = fx.rays(100, 100, { duration: 0.5 });
      fx.clear();
      expect(r.alive).toBe(false);
      expect(() => r.moveTo(1, 2)).not.toThrow();
    });
  });
});
