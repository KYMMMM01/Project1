/**
 * Elite and boss moments: the warning band, the landing, the enrage cry, each boss ability, cell hazard
 * warnings and starts, weakened cats and the laser pointer. Visuals that persist (hazard tiles, the
 * laser dot) belong to the field; this part adds the cues around them.
 */
import { t } from '@/core/i18n';
import { rand } from '@/core/math';
import { Ease } from '@/core/tween';
import { Trauma, screenFx, type FxHandle } from '@/fx';
import { PATH_LENGTH, cellCenterX, cellCenterY, pathPoint, type PathPoint } from '@/game/geometry';
import type { EnemyState } from '@/game';
import { BOSS_APPEAR, enemyDef, isWaveTarget } from '@/game';
import type { BannerService } from './banners';
import { SOFT_RING, SPLASH_DROPS, SWEAT, WHIRL_LINE, WIND_IN } from './defs';
import type { MusicService } from './music';
import { ABILITY_CAPTION } from './palette';
import { WindowLimiter } from './policy';
import { Gate, enemyInfo, type Bus, type Stage } from './stage';
import { Hue } from '@/fx/palette';
import { BOSS_DROP } from '@/view/timing';
import { Color } from '@/ui/theme';

const W = Hue.cream;
const RED = Color.berry;
const ZAP = Hue.zap;
const WET = Hue.water;
/** Seconds the warning ribbon takes to arrive and to leave. */
const WARN_IN = 0.15;
const WARN_OUT = 0.2;

export function mountBoss(stage: Stage, on: Bus, banners: BannerService, music: MusicService): void {
  const ctx = stage.ctx;
  const fx = stage.fx;
  const ps = fx.ps;
  const sweatLimit = new WindowLimiter(6, 0.5);
  const handles: FxHandle[] = [];
  const scratch: PathPoint = { x: 0, y: 0, angle: 0 };

  const remember = (h: FxHandle): void => {
    if (handles.length >= 24) {
      let w = 0;
      for (const x of handles) if (x.alive) handles[w++] = x;
      handles.length = w;
    }
    handles.push(h);
  };

  on('waveStart', (e) => {
    if (e.kind === 'normal') return;
    const entry = ctx.battle.previewWave(e.wave).find((p) => isWaveTarget(p.enemy));
    const name = entry ? t(enemyDef(entry.enemy).nameKey) : '';
    const boss = e.kind === 'boss';
    banners.push(
      'alert',
      'warning',
      3,
      { title: t('director.warning'), sub: t(boss ? 'director.bossIncoming' : 'director.eliteIncoming', { name }), color: boss ? Color.berry : Color.coral },
      // The ribbon covers the lane's first run, where the big one lands: it has to be gone when BOSS_APPEAR comes.
      BOSS_APPEAR - WARN_IN - WARN_OUT,
      WARN_IN,
      WARN_OUT,
    );
    stage.direct('boss_warning', boss ? 0.9 : 0.55);
    if (boss) {
      fx.bossWarning();
      music.setBoss(true);
    } else {
      screenFx.vignettePulse(RED, 0.2, 500, 1);
      stage.buzz('light');
    }
  });

  on('enemySpawn', (e) => {
    const en = e.enemy;
    const info = enemyInfo(en.id);
    if (!info.big) return;
    if (info.boss) {
      // The boss drops for BOSS_DROP seconds (the field's view): the dust, the ring, the hit-stop and the roar are its landing.
      stage.laterReal(BOSS_DROP, () => {
        fx.bossLanding(en.x, en.y, { scale: 1.1 });
        stage.direct('boss_roar', 0.75);
      });
    } else {
      fx.dustPuff(en.x, en.y, { scale: 1.3 });
      fx.shockwave(en.x, en.y, { color: info.tint, radius: 110 });
      stage.shake(Trauma.t1, Gate.eliteShake, 0.5);
      stage.direct('boss_roar', 0.4, 1.4);
    }
  });

  on('enrage', (e) => {
    const en = e.enemy;
    const info = enemyInfo(en.id);
    fx.shockwave(en.x, en.y, { color: RED, radius: 150 });
    fx.shockwave(en.x, en.y, { color: Hue.cream, radius: 100, delay: 0.1 });
    ps.burst(SOFT_RING, en.x, en.y, { colors: [W, RED], scale: 1.4 });
    stage.direct('boss_roar', info.boss ? 0.85 : 0.5, info.boss ? 1 : 1.3);
    if (stage.gates.ready(Gate.enrage, stage.now, 1)) {
      screenFx.vignettePulse(RED, 0.2, 500, 1);
      stage.shake(Trauma.t2, Gate.eliteShake, 0.5);
      stage.buzz('medium');
    }
    banners.push('caption', 'enrage', 2, { title: t('director.enrage', { name: t(enemyDef(en.id).nameKey) }), color: RED, icon: 'warning' }, 1.3, 0.15, 0.2);
  });

  on('bossAbility', (e) => {
    const en = e.enemy;
    const info = enemyInfo(en.id);
    banners.push('caption', 'ability' + e.ability, 2, { title: t(ABILITY_CAPTION[e.ability]), color: info.tint }, 1.4, 0.15, 0.2);
    switch (e.ability) {
      case 'inhale':
        windLines(en, e.duration);
        stage.direct('whoosh', 0.8, 0.5);
        break;
      case 'whirl':
        whirlLines(e.duration, info.tint);
        stage.direct('whoosh', 0.7, 1.7);
        break;
      case 'splash':
        ps.burst(SPLASH_DROPS, en.x, en.y, { colors: [W, WET], scale: e.duration > 0 ? 1.4 : 1 });
        stage.direct('splash', 0.7);
        break;
      case 'lightning':
        stage.direct('zap', 0.6, 0.6);
        screenFx.flash(ZAP, 0.18, 90);
        break;
      case 'vaccinate': {
        const view = ctx.enemyView(en.uid);
        if (view) {
          const aura = fx.buffAura(view, { color: Color.leaf, radius: info.radius * 1.6 });
          remember(aura);
          stage.later(e.duration, () => aura.stop());
        } else {
          fx.shockwave(en.x, en.y, { color: Color.leaf, radius: 120 });
        }
        stage.direct('buff', 0.6, 0.9);
        break;
      }
      case 'enrage':
        break;
    }
  });

  /** Inhale: streaks race in towards the boss for as long as the suction lasts. */
  function windLines(en: EnemyState, duration: number): void {
    let n = -1;
    const info = enemyInfo(en.id);
    stage.keep(
      ctx.tweens.run({
        duration,
        ease: Ease.linear,
        onUpdate: (k) => {
          const i = Math.floor((k * duration) / 0.22);
          if (i === n) return;
          n = i;
          ps.burst(WIND_IN, en.x, en.y, { colors: [W, info.tint], scale: 0.75, count: stage.detail === 0 ? 0.6 : 1 });
        },
      }),
    );
  }

  /** Whirl: bright speed lines race around the loop while every enemy runs faster. */
  function whirlLines(duration: number, tint: number): void {
    let n = -1;
    const colors = [W, tint];
    stage.keep(
      ctx.tweens.run({
        duration,
        ease: Ease.linear,
        onUpdate: (k) => {
          const i = Math.floor((k * duration) / 0.12);
          if (i === n) return;
          n = i;
          const count = stage.detail === 0 ? 2 : 4;
          for (let j = 0; j < count; j++) {
            pathPoint(rand(0, PATH_LENGTH), scratch);
            ps.burst(WHIRL_LINE, scratch.x, scratch.y, { colors, dir: scratch.angle });
          }
        },
      }),
    );
  }

  on('hazardWarn', (e) => {
    stage.play(stage.rules.big, 'hazard_warn', 0.7, e.kind === 'zap' ? 1.2 : 1, 0.02);
    stage.buzz('warning', Gate.hazardBuzz, 0.6);
  });

  on('hazard', (e) => {
    const zap = e.kind === 'zap';
    let n = 0;
    for (const c of e.cells) {
      const x = cellCenterX(c);
      const y = cellCenterY(c);
      stage.later(n * 0.06, () => {
        if (zap) {
          // Down from above the top edge of the screen onto the tile.
          fx.lightning(x + rand(-30, 30), -ctx.layout.fieldY, x, y, { color: ZAP, branches: 2, thickness: 6 });
        } else {
          ps.burst(SPLASH_DROPS, x, y, { colors: [W, WET], scale: 0.9, count: 0.7 });
        }
      });
      n++;
    }
    if (zap) {
      stage.direct('zap', 0.8, 0.8);
      stage.shake(Trauma.t2, Gate.strikeShake, 0.5);
      screenFx.flash(ZAP, 0.2, 100);
      stage.buzz('medium');
    } else {
      stage.direct('splash', 0.7);
    }
    if (stage.gates.ready(Gate.hazardCaption, stage.now, 25)) {
      banners.push('caption', 'hazard' + e.kind, 1, { title: t(zap ? 'director.hazard.zap' : 'director.hazard.wet'), color: zap ? ZAP : WET }, 1.5, 0.15, 0.2);
    }
  });

  // The field draws the droopy swirl for as long as a cat is weakened; the cue here is the moment it happens.
  on('weaken', (e) => {
    stage.play(stage.rules.weaken, 'weaken', 0.6, 1, 0.03);
    if (!sweatLimit.take(stage.now)) return;
    ps.burst(SWEAT, cellCenterX(e.unit.cell), cellCenterY(e.unit.cell) - 36, { colors: [W, Hue.ice] });
  });

  on('laser', (e) => {
    ps.burst(SOFT_RING, e.state.x, e.state.y, { colors: [W, RED], scale: 0.7 });
    stage.direct('laser_on', 0.7);
  });

  on('laserEnd', (e) => {
    ps.burst(SOFT_RING, e.state.x, e.state.y, { colors: [W, Hue.heart], scale: 0.5 });
    stage.direct('laser_off', 0.6);
  });

  stage.onDestroy(() => {
    for (const h of handles) h.stop();
    handles.length = 0;
  });

}
