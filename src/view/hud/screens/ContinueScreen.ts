/**
 * "Continue?": offered once after a defeat that can still be revived. A full screen with the effect
 * spelled out on one paper page, one ad button, one gem button and a plain way out. Sandbox runs
 * continue for free.
 */
import { Container, Graphics } from 'pixi.js';
import { game } from '@/core/game';
import { t } from '@/core/i18n';
import { Ease } from '@/core/tween';
import { errorKey, profile } from '@/meta';
import { ads } from '@/platform';
import { Button, Color, drawDashedRect, drawIcon, drawPaintFill, motion, paperShape, paperSeed, ScreenScaffold, tapeStrip, toast, TweenBag, uiLabel } from '@/ui';
import type { HudEnv } from '../env';
import { offerRoute, wavesReached } from '../policy';

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
  const stats = env.battle.getStats();
  const heart = drawIcon('heart', 150);
  heart.position.set(w / 2, 150);
  const where = uiLabel(t('hud.cont.where', { n: wavesReached(env.battle.wave, stats.wavesCleared, stats.totalWaves), total: stats.totalWaves || '-' }), { size: 34 });
  where.position.set(w / 2, 280);
  const why = uiLabel(t(reason === 'boss_timeout' ? 'hud.cont.why.boss' : 'hud.cont.why.over'), {
    size: 30, wrap: w - 100, lineHeight: 40, color: Color.inkSoft,
  });
  why.position.set(w / 2, 344);
  const fix = uiLabel(t(reason === 'boss_timeout' ? 'hud.cont.fix.boss' : 'hud.cont.fix.over'), { size: 32, wrap: w - 130, lineHeight: 42 });
  fix.position.set(w / 2, 444);

  // One cream page holds the story; the effect of continuing is marked with a stroke of yellow marker.
  const pageH = Math.round(fix.y + fix.height / 2 + 50);
  const page = new Container();
  page.addChild(paperShape({ w: w - 16, h: pageH - 16, radius: 28, fill: Color.paper, seed: paperSeed() }));
  page.position.set(w / 2, pageH / 2 + 8);
  const marker = new Graphics();
  drawPaintFill(marker, 56, fix.y - fix.height / 2 - 10, w - 112, fix.height + 20, Color.mustard);
  marker.alpha = 0.8;
  const cut = new Graphics();
  drawDashedRect(cut, 22, 22, w - 44, pageH - 44, { radius: 22 });
  const tape = tapeStrip({ name: 'sky', w: 120, h: 30, angle: -3, pattern: 'dots' });
  tape.position.set(w / 2, 16);
  c.addChild(page, cut, tape, marker, heart, where, why, fix);

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

  let y = pageH + 120;
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
      label: t('hud.cont.gems'), sublabel: String(GEMS), sublabelIcon: 'gem', style: 'info', width: 560, height: 104, fontSize: 38,
      enabled: profile.data.gems >= GEMS, disabledMark: 'none',
    });
    gem.position.set(w / 2, y);
    gem.onTap(() => revive(gem, 'gems'));
    gem.onDisabledTap(() => toast(t(errorKey('not_enough_gems')), 'warning'));
    c.addChild(gem);
    y += 130;
  }
  const quit = new Button({ label: t('hud.cont.quit'), style: 'kraft', width: 360, height: 92, fontSize: 34 });
  quit.position.set(w / 2, y + 20);
  quit.onTap(() => finish(false));
  c.addChild(quit);

  if (!motion.reduced) {
    // The heart beats: a scale change only, no glow.
    bag.run({
      duration: 1.4,
      repeat: -1,
      ease: Ease.sineInOut,
      yoyo: true,
      onUpdate: (k) => heart.scale.set(1 + 0.06 * k),
    });
  }
  void scaffold.show(true);
}
