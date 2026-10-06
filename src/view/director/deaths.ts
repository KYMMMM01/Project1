/**
 * Deaths and income: the puff, shards and kill-streak ping of an ordinary kill, the bigger elite
 * kill, the full boss death set piece, and the fish / purr that fly to the HUD afterwards.
 */
import { Sprite } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { clamp } from '@/core/math';
import { Trauma } from '@/fx';
import type { EnemyState } from '@/game';
import type { BannerService } from './banners';
import type { CurrencyService } from './currency';
import { DUCK_BY_TIER, FrameBudget } from './policy';
import type { MusicService } from './music';
import { SHIELD_COLOR } from './palette';
import { Gate, enemyInfo, type Bus, type EnemyInfo, type Stage } from './stage';
import { Hue } from '@/fx/palette';
import { Color } from '@/ui/theme';

/** Explosion colour of a boss's mini blasts and final blast. */
const BOSS_BLAST = Hue.fire;
/** Mini explosions of the finale (fx.bossDeath fires six, 90 ms apart): sounds ride three of them. */
const MINI_SOUNDS: readonly number[] = [0.12, 0.26, 0.43];

export function mountDeaths(stage: Stage, on: Bus, currency: CurrencyService, banners: BannerService, music: MusicService): void {
  const ctx = stage.ctx;
  const fx = stage.fx;
  const puffs = new FrameBudget(8);

  on('fish', (e) => currency.onFish(e));
  on('purr', (e) => currency.onPurr(e));

  on('enemyDie', (e) => {
    const en = e.enemy;
    const info = enemyInfo(en.id);
    const removed = e.killer === null && e.fish === 0 && e.purr === 0;
    if (removed) {
      // Chased off by nine lives or a revive: a quiet puff, never more than a few a frame.
      if (puffs.take()) fx.dustPuff(e.x, e.y, { scale: 0.7 });
      return;
    }
    if (info.boss) {
      bossDeath(en, info, e.x, e.y);
      return;
    }
    if (info.elite) {
      eliteDeath(info, e.x, e.y);
      return;
    }
    if (puffs.take()) {
      const scale = clamp(info.radius / 18, 0.7, 1.4);
      if (en.frozen) fx.iceShatter(e.x, e.y, { scale });
      else fx.deathPuff(e.x, e.y, { color: info.tint, scale });
    }
    const step = stage.killLadder.next(stage.now);
    stage.playStep(stage.rules.die, 'enemy_die', step, 0.55);
  });

  function eliteDeath(info: EnemyInfo, x: number, y: number): void {
    fx.deathPuff(x, y, { color: info.tint, scale: 1.7 });
    fx.explosion(x, y, { color: info.tint, scale: 0.7 });
    fx.coinBurst(x, y, { count: 12 });
    stage.shake(Trauma.t1, Gate.eliteShake, 0.3);
    stage.stop(50);
    stage.buzz('light');
    // Guide C-05: the elite's cry sits 3 semitones lower and 3 dB louder than a plain kill.
    stage.play(stage.rules.eliteDie, 'enemy_die', 0.85, 0.84, 0.02);
    currency.claimBig(0.3);
    banners.push('big', 'eliteDown', 3, { title: t('director.eliteDefeated'), color: SHIELD_COLOR }, 0.7, 0.3, 0.3);
    music.duck(DUCK_BY_TIER[2].depth, 0.4);
  }

  /** Guide B-04: hit-stop into slow motion, flicker, six blasts, one final blast with one flash, loot, banner. */
  function bossDeath(en: EnemyState, info: EnemyInfo, x: number, y: number): void {
    const b = ctx.battle;
    const last = b.init.mode !== 'endless' && b.wave >= b.totalWaves;
    // The field keeps the boss's view on screen for the whole finale: it flickers until the final blast hides it.
    const view = ctx.enemyView(en.uid);
    const target = view?.getChildByLabel('sprite', true);

    stage.bossSeqActive = true;
    stage.stop(150, true);
    stage.slow(0.3, 400);
    stage.direct('boss_roar', 0.8, 0.62);
    stage.buzz('heavy');

    const seq = fx.bossDeath(x, y - info.radius * 0.2, {
      color: BOSS_BLAST,
      radius: info.radius * 1.9,
      scale: 1.25,
      target: target instanceof Sprite ? target : undefined,
      onFinal: () => {
        if (view && !view.destroyed) view.visible = false;
      },
    });
    for (const at of MINI_SOUNDS) stage.later(at, () => stage.direct('explosion', 0.35, 0.9 + Math.random() * 0.4));

    stage.later(seq.impact, () => {
      stage.direct('boss_die', 1);
      stage.direct('explosion', 0.8, 0.7);
      stage.shake(Trauma.t5, Gate.eliteShake, 0.5);
      if (last) {
        // The run is won: the music cuts and the victory fanfare takes the moment.
        music.silence(0.1);
        audio.stinger('victory');
        stage.victorySounded = true;
      } else {
        music.duck(0.8, 1.2);
        music.setBoss(false);
      }
    });
    // Loot: a shower of coins at the blast, then the fish fly to the HUD (guide: +1.4 s in the original, here 0.4 s after the blast).
    stage.later(seq.impact + 0.35, () => fx.coinBurst(x, y, { count: 32, scale: 1.4 }));
    currency.claimBig(seq.impact + 0.55);
    stage.later(seq.impact + 0.5, () => {
      banners.push('big', 'bossDown', 4, { title: t('director.bossDefeated'), color: Color.mustard }, 1, 0.4, 0.3);
      stage.direct('wave_clear', 0.6);
    });
    void seq.then(() => {
      stage.bossSeqActive = false;
    });
  }

  stage.addFrame(() => puffs.refill());
}
