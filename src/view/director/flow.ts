/**
 * Run flow: wave and act banners, the call-next cue, danger vignette and heartbeat, the overflow
 * countdown, the nine-lives rescue, and the end of the run (defeat, revive, victory) which finishes by
 * telling the HUD the staging is over.
 */
import { ColorMatrixFilter, Container } from 'pixi.js';
import { audio } from '@/audio';
import { t } from '@/core/i18n';
import { Ease, type Tween } from '@/core/tween';
import { Trauma, screenFx } from '@/fx';
import { CELL_COUNT, FIELD_H } from '@/game/geometry';
import { label } from '@/ui/text';
import { Color } from '@/ui/theme';
import type { BannerService } from './banners';
import type { MusicService } from './music';
import { dangerStrength, heartbeatInterval, overflowSeconds } from './policy';
import { Gate, type Bus, type Stage } from './stage';
import { Hue } from '@/fx/palette';

const GOLD = Color.mustard;
/** Paper colour of the wave banner per act, cycling after the fourth. */
const ACT_COLOR: readonly number[] = [Color.teal, Color.leaf, Color.mustard, Color.coral];
const FINISH_DELAY_DEFEAT = 1.1;
const FINISH_DELAY_VICTORY = 2.2;
/** The victory staging never waits longer than this for the boss finale to end. */
const FINALE_PATIENCE = 4;

export function mountFlow(stage: Stage, on: Bus, banners: BannerService, music: MusicService): void {
  const ctx = stage.ctx;
  const fx = stage.fx;
  const b = ctx.battle;

  let level = 0;
  let overflowing = false;
  let beatIn = 0;
  let shownSecs = 0;
  let popAge = 1;
  let ended = false;
  let finished = false;
  let finishTimer: Tween | null = null;
  let victoryAt = -1;

  // ── waves and acts ──

  on('waveStart', (e) => {
    banners.push(
      'top',
      'wave',
      1,
      { title: t('director.wave', { act: e.act, wave: e.wave }), color: ACT_COLOR[(e.act - 1) % ACT_COLOR.length] as number, icon: e.kind === 'normal' ? 'swords' : 'skull' },
      0.7,
    );
    stage.direct('wave_start', 0.65);
    stage.shake(Trauma.t1 * 0.6, Gate.critShake, 0.3);
    stage.buzz('tap');
  });

  on('waveEnd', (e) => {
    if (!e.called) return;
    banners.push('top', 'call', 2, { title: t('director.callNext'), color: Color.info, icon: 'wave_call' }, 0.6);
    stage.direct('whoosh', 0.3, 1.3);
  });

  on('actClear', (e) => {
    // An act ends with its boss: the boss-defeated moment is already on stage with its own fanfare, and the toy screen
    // that follows is titled with the act, so a second banner and fanfare would only repeat it.
    if (!stage.bossSeqActive) {
      banners.push('big', 'act', 2, { title: t('director.actClear', { act: e.act }), color: GOLD }, 1, 0.4, 0.3);
      fx.waveClear();
      stage.direct('wave_clear', 0.8);
    }
    music.duck(0.35, 0.5);
  });

  on('rescued', (e) => {
    const x = 360;
    const y = 312;
    banners.push('big', 'rescued', 4, { title: t('director.rescued', { n: e.removed }), color: GOLD }, 1.4, 0.4, 0.3);
    fx.shockwave(x, y, { color: GOLD, radius: 420 });
    fx.levelUp(x, y, { scale: 1.4 });
    screenFx.flash(GOLD, 0.3, 140);
    stage.shake(Trauma.t3, Gate.eliteShake, 0.5);
    stage.stop(66);
    stage.direct('level_up', 0.9);
    audio.stinger('level_up');
    stage.buzz('success');
  });

  // ── danger, heartbeat, overflow countdown ──

  const host = new Container();
  host.eventMode = 'none';
  host.visible = false;
  host.label = 'director-overflow';
  const digits = label('', { size: 200, color: Hue.alarm, stroke: Color.paperLight, strokeWidth: 22 });
  const warn = label(t('director.overflow'), { size: 38, onArt: true });
  warn.y = -150;
  host.addChild(digits, warn);
  ctx.layers.overlay.addChild(host);

  on('danger', (e) => {
    const rose = e.level > level;
    level = e.level;
    applyDanger();
    if (rose) stage.direct(e.level >= 2 ? 'danger_alarm' : 'countdown_tick', 0.6, e.level >= 2 ? 1 : 0.8);
    if (e.level >= 2) beatIn = 0.4;
  });

  on('overflow', (e) => {
    if (e.grace === 0) hideOverflow();
  });

  function applyDanger(): void {
    screenFx.setDanger(ended ? 0 : dangerStrength(level, overflowing));
  }

  function hideOverflow(): void {
    host.visible = false;
    shownSecs = 0;
    if (overflowing) {
      overflowing = false;
      applyDanger();
    }
  }

  stage.addFrame((dt) => {
    if (ended) return;
    const secs = b.phase === 'wave' ? overflowSeconds(b.overflowTime, b.overflowLimit) : 0;
    if (secs > 0) {
      const l = ctx.layout;
      if (!host.visible) {
        host.visible = true;
        overflowing = true;
        applyDanger();
      }
      host.position.set(l.w / 2, l.fieldY + FIELD_H / 2);
      if (secs !== shownSecs) {
        shownSecs = secs;
        digits.text = String(secs);
        popAge = 0;
        // Urgent ticks: each second a little higher, so the last one is the shrillest.
        stage.direct('countdown_tick', 0.85, 1 + (Math.max(0, b.overflowLimit - secs)) * 0.18);
        stage.buzz('warning');
      }
      popAge += dt;
      const p = Math.min(1, popAge / 0.28);
      host.scale.set(stage.reduced ? 1 : 1.5 - 0.5 * Ease.backOut(p));
      host.alpha = 0.55 + 0.45 * Math.min(1, popAge / 0.1);
    } else if (host.visible) {
      hideOverflow();
    }

    const interval = heartbeatInterval(level, overflowing);
    if (interval > 0) {
      beatIn -= dt;
      if (beatIn <= 0) {
        beatIn = interval;
        stage.direct('danger_alarm', overflowing ? 0.7 : 0.5);
      }
    }
  });

  // ── end of the run ──

  let filter: ColorMatrixFilter | null = null;
  let filtered: Container[] = [];
  let greyTween: Tween | null = null;
  let greyAmount = 0;
  const slumpBase = new Float64Array(CELL_COUNT * 3);
  const slumped: Container[] = [];

  /** Containers that hold the playfield and background, but never the HUD or overlay. */
  function fieldRoots(): Container[] {
    const l = ctx.layers;
    const out: Container[] = [];
    for (const c of [l.background, l.floor, l.zones, l.enemies, l.units, l.projectiles, l.fxBack, l.fxFront, l.numbers]) {
      const p = c.parent;
      const root = p && p !== l.hud.parent ? p : c;
      if (!out.includes(root)) out.push(root);
    }
    return out;
  }

  /** 0 = colour, 1 = grey. One shared filter, only for as long as the run is over. */
  function grey(to: number, seconds: number): void {
    if (!filter) {
      filter = new ColorMatrixFilter();
      filtered = fieldRoots();
    }
    const f = filter;
    greyTween?.kill();
    for (const c of filtered) c.filters = [f];
    const from = greyAmount;
    greyTween = ctx.ui.run({
      duration: seconds,
      ease: Ease.cubicOut,
      onUpdate: (k) => {
        greyAmount = from + (to - from) * k;
        f.reset();
        f.saturate(-greyAmount, false);
      },
      onComplete: () => {
        if (to === 0) clearFilter();
      },
    });
    stage.keep(greyTween);
  }

  function clearFilter(): void {
    for (const c of filtered) if (!c.destroyed) c.filters = null;
    filtered = [];
    filter?.destroy();
    filter = null;
    greyAmount = 0;
  }

  /** Units sag a little: tilted, squashed. Restored exactly on revive. */
  function slump(down: boolean): void {
    if (down) {
      slumped.length = 0;
      for (let c = 0; c < CELL_COUNT; c++) {
        const u = b.units[c];
        const v = u ? ctx.unitView(u.uid) : null;
        if (!v) continue;
        const i = slumped.length * 3;
        slumpBase[i] = v.rotation;
        slumpBase[i + 1] = v.scale.x;
        slumpBase[i + 2] = v.scale.y;
        slumped.push(v);
      }
    }
    const tilt = (i: number): number => (i % 2 === 0 ? 0.14 : -0.14);
    stage.keep(
      ctx.ui.run({
        duration: down ? 0.5 : 0.2,
        ease: Ease.cubicOut,
        onUpdate: (k) => {
          const m = down ? k : 1 - k;
          for (let i = 0; i < slumped.length; i++) {
            const v = slumped[i] as Container;
            if (v.destroyed) continue;
            v.rotation = (slumpBase[i * 3] as number) + tilt(i) * m;
            v.scale.set((slumpBase[i * 3 + 1] as number) * (1 + 0.05 * m), (slumpBase[i * 3 + 2] as number) * (1 - 0.1 * m));
          }
        },
        onComplete: () => {
          if (!down) slumped.length = 0;
        },
      }),
    );
  }

  /** Tell the HUD the staging is over. Only once per ending. */
  function finish(victory: boolean): void {
    if (finished) return;
    finished = true;
    ctx.events.emit('finished', { victory });
  }

  function schedule(seconds: number, victory: boolean): void {
    finishTimer?.kill();
    finishTimer = stage.laterReal(seconds, () => finish(victory));
  }

  function endCommon(): void {
    ended = true;
    hideOverflow();
    screenFx.setDanger(0);
  }

  on('defeat', () => {
    endCommon();
    banners.clear();
    music.silence(0.5);
    audio.stinger('defeat');
    stage.buzz('heavy');
    grey(1, 0.3);
    slump(true);
    schedule(FINISH_DELAY_DEFEAT, false);
  });

  on('revive', () => {
    ended = false;
    finished = false;
    finishTimer?.kill();
    finishTimer = null;
    grey(0, 0.3);
    slump(false);
    music.resume();
    fx.levelUp(360, 312, { scale: 1.2 });
    stage.direct('level_up', 0.8);
    applyDanger();
  });

  on('victory', () => {
    endCommon();
    victoryAt = stage.now;
  });

  /** The victory staging starts when the boss finale is done, or after a short patience. */
  stage.addFrame(() => {
    if (victoryAt < 0) return;
    if (stage.bossSeqActive && stage.now - victoryAt < FINALE_PATIENCE) return;
    victoryAt = -1;
    if (!stage.victorySounded) {
      music.silence(0.2);
      audio.stinger('victory');
      stage.slow(0.35, 400);
    }
    fx.confettiRain({ count: 90, y: -ctx.layout.fieldY - 30 });
    stage.laterReal(0.5, () => fx.confettiRain({ count: 50, y: -ctx.layout.fieldY - 30 }));
    screenFx.flash(Hue.sun, 0.4, 160);
    banners.push('big', 'victory', 5, { title: t('director.victory'), color: GOLD }, 1.5, 0.4, 0.3);
    stage.buzz('jackpot');
    schedule(FINISH_DELAY_VICTORY, true);
  });

  stage.onDestroy(() => {
    screenFx.setDanger(0);
    clearFilter();
    for (let i = 0; i < slumped.length; i++) {
      const v = slumped[i] as Container;
      if (v.destroyed) continue;
      v.rotation = slumpBase[i * 3] as number;
      v.scale.set(slumpBase[i * 3 + 1] as number, slumpBase[i * 3 + 2] as number);
    }
    host.destroy({ children: true });
  });
}
