/**
 * "Continue?": offered once after a defeat that can still be revived. A full screen with the effect
 * spelled out, one ad button, one gem button and a plain way out. Sandbox runs continue for free.
 */
import { Graphics } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { errorKey, profile } from '@/meta';
import { ads } from '@/platform';
import { Button, Color, drawGlow, drawIcon, motion, ScreenScaffold, toast, TweenBag, uiLabel } from '@/ui';
import { Ease } from '@/core/tween';
import type { HudEnv } from '../env';
import { offerRoute } from '../policy';

export type DefeatReason = 'overrun' | 'boss_timeout' | null;

/** Gems the continue costs when no ad is used (the meta layer owns the real price). */
const GEMS = 30;

/** True when the screen should be shown at all: a revive exists and an offer route is open. */
export function canOfferContinue(env: HudEnv): boolean {
  if (!env.battle.canRevive()) return false;
  if (env.sandbox) return true;
  return offerRoute(ads.status('revive').reason, false) !== 'none';
}

/** Show the screen. `onDone(true)` once the run was revived, `onDone(false)` when the player gave up. */
export function openContinue(env: HudEnv, reason: DefeatReason, onDone: (continued: boolean) => void): void {
  const scaffold = new ScreenScaffold({ title: t('hud.cont.title'), scroll: false, actionBarHeight: 0 });
  game.popupLayer.addChild(scaffold);
  const release = env.holdPause();
  const bag = new TweenBag();
  let finished = false;
  const w = scaffold.contentWidth;

  const finish = (continued: boolean): void => {
    if (finished) return;
    finished = true;
    release();
    bag.killAll();
    void scaffold.hide(true).then(() => {
      scaffold.destroy({ children: true });
      onDone(continued);
    });
  };

  const c = scaffold.content;
  const glow = new Graphics();
  drawGlow(glow, 0, 0, 190, 0xff7a88, 0.7);
  glow.position.set(w / 2, 150);
  glow.blendMode = 'add';
  const heart = drawIcon('heart', 170);
  heart.position.set(w / 2, 150);
  const stats = env.battle.getStats();
  const where = uiLabel(t('hud.cont.where', { n: stats.wavesCleared, total: stats.totalWaves || '-' }), { size: 34, strokeWidth: 5 });
  where.position.set(w / 2, 310);
  const why = uiLabel(t(reason === 'boss_timeout' ? 'hud.cont.why.boss' : 'hud.cont.why.over'), {
    size: 30, wrap: w - 40, lineHeight: 40, color: Color.textDim, strokeWidth: 4, shadow: false,
  });
  why.position.set(w / 2, 380);
  const fix = uiLabel(t(reason === 'boss_timeout' ? 'hud.cont.fix.boss' : 'hud.cont.fix.over'), {
    size: 32, wrap: w - 40, lineHeight: 42, color: 0xffd54a, strokeWidth: 5, shadow: false,
  });
  fix.position.set(w / 2, 480);
  c.addChild(glow, heart, where, why, fix);

  const revive = (btn: Button, via: 'ad' | 'gems' | null): void => {
    void (async () => {
      btn.setBusy(true);
      if (via) {
        const r = await profile.pay('revive', via);
        if (finished) return;
        if (!r.ok) {
          btn.setBusy(false);
          toast(t(errorKey(r.error)), 'warning');
          return;
        }
      }
      btn.setBusy(false);
      const fail = env.ctx.command('revive', () => env.battle.revive());
      if (fail === null) finish(true);
    })();
  };

  let y = 640;
  if (env.sandbox) {
    const go = new Button({ label: t('hud.cont.go'), icon: 'play', style: 'success', width: 560, height: 120, fontSize: 46 });
    go.position.set(w / 2, y);
    go.onTap(() => revive(go, null));
    c.addChild(go);
    y += 150;
  } else {
    if (offerRoute(ads.status('revive').reason, false) === 'ad') {
      const ad = new Button({ label: t('hud.cont.ad'), icon: 'ad', style: 'success', width: 560, height: 120, fontSize: 42 });
      ad.position.set(w / 2, y);
      ad.onTap(() => revive(ad, 'ad'));
      c.addChild(ad);
      if (!motion.reduced) ad.startPulse({ times: 6 });
      y += 150;
    }
    const gem = new Button({
      label: t('hud.cont.gems'), sublabel: String(GEMS), sublabelIcon: 'gem', style: 'purple', width: 560, height: 104, fontSize: 38,
      enabled: profile.data.gems >= GEMS, disabledMark: 'none',
    });
    gem.position.set(w / 2, y);
    gem.onTap(() => revive(gem, 'gems'));
    gem.onDisabledTap(() => toast(t(errorKey('not_enough_gems')), 'warning'));
    c.addChild(gem);
    y += 130;
  }
  const quit = new Button({ label: t('hud.cont.quit'), style: 'neutral', width: 360, height: 92, fontSize: 34 });
  quit.position.set(w / 2, y + 20);
  quit.onTap(() => finish(false));
  c.addChild(quit);

  if (!motion.reduced) {
    bag.run({
      duration: 1.4,
      repeat: -1,
      ease: Ease.sineInOut,
      yoyo: true,
      onUpdate: (k) => {
        glow.alpha = 0.55 + 0.45 * k;
        heart.scale.set(1 + 0.06 * k);
      },
    });
  }
  void scaffold.show(true);
}
