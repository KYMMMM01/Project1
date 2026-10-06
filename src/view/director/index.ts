import { audioStats } from '@/audio';
import { debugExpose } from '@/core/debug';
import type { BattleEvents } from '@/game';
import type { BattleContext, BattleLayout, DirectorPart } from '../context';
import './strings';
import { BannerService } from './banners';
import { mountBoss } from './boss';
import { mountCombat } from './combat';
import { CurrencyService } from './currency';
import { mountDeaths } from './deaths';
import { mountFlow } from './flow';
import { mountGrowth } from './growth';
import { MusicService } from './music';
import { Stage, type Bus } from './stage';

/**
 * Everything the battle shows and plays in response to simulation events, layered on top of the
 * playfield: shared services (clock, sound rules, rationed shake / hit-stop, banners, flights, music)
 * and one small handler module per event family. Nothing here blocks input or waits on an animation.
 */
export function createDirector(ctx: BattleContext): DirectorPart {
  const stage = new Stage(ctx);
  const offs: (() => void)[] = [];
  const bus: Bus = <K extends keyof BattleEvents>(type: K, fn: (e: BattleEvents[K]) => void): void => {
    offs.push(ctx.battle.events.on(type, fn));
  };

  const banners = new BannerService(stage);
  const currency = new CurrencyService(stage);
  const music = new MusicService(stage);

  mountCombat(stage, bus);
  mountDeaths(stage, bus, currency, banners, music);
  mountGrowth(stage, bus, banners, music);
  mountBoss(stage, bus, banners, music);
  mountFlow(stage, bus, banners, music);
  stage.addFrame((dt) => {
    currency.update();
    banners.update(dt);
  });
  music.start();

  debugExpose('director', {
    stats: () => ({
      fx: ctx.fx.stats(),
      audio: audioStats(),
      played: stage.played,
      intensity: music.intensity,
      banners: banners.depth(),
      flights: currency.inFlight,
    }),
  });

  return {
    update(dt: number): void {
      stage.tick(dt);
    },
    resize(layout: BattleLayout): void {
      banners.resize(layout);
    },
    destroy(): void {
      for (const off of offs) off();
      offs.length = 0;
      stage.destroy();
      currency.destroy();
      banners.destroy();
      debugExpose('director', null);
    },
  };
}
